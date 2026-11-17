/**
 * anime.js stagger() 手感样机 —— 只供开发时对照，不进 dist。
 *
 *   npm run serve  →  http://127.0.0.1:5173/dev/stagger-lab.html
 *
 * 两块舞台跑同一组时序参数，只换引擎：
 *   左  现在的做法：Vue <Transition> 落地成「逐项 CSS 变量 + transition」
 *   右  anime.js：一次 animate()，延迟由 stagger() 算
 * 参数条上所有的滑动都实时重播，方便反着看两边的差别。
 *
 * 这个文件不引用仓库里的 StaggerGroup / StaggerTransition / transitions.scss，
 * 删掉它不影响任何正式代码。anime.js 用的是 dev/vendor 里那份 ESM bundle（v4.5.0）。
 */
import '@/style/index.scss'
import { animate, stagger, cubicBezier } from 'animejs'

/* ============ 参数 ============ */

const CAP = 220 // aqiBlock 预设里那个 maxDelay：delay = base + min(i × step, 220)

const PARAMS = {
  spacing: 55,
  start: 170,
  duration: 380,
  count: 5,
  scale: 0.985, // 原来 aqiBlock 里和 opacity 配对的 scale；拖到 1 就是纯淡入
  jitter: 0,
  ease: 'enter',
  from: 'first',
  cap: true,
  auto: true,
}

/* 缓动要给两种写法：CSS 认字符串，anime 认函数。
   ⚠️ v4 里 'cubicBezier(...)' 字符串已经废弃（会 console.warn 并退化成 linear），
      必须 import { cubicBezier } 再传函数 —— 这一条是这次试出来最实在的手感差异。 */
const EASES = {
  enter: {
    label: '--ease-enter（现状）',
    css: 'cubic-bezier(0.16, 1, 0.3, 1)',
    anime: cubicBezier(0.16, 1, 0.3, 1),
    code: 'cubicBezier(0.16, 1, 0.3, 1)',
  },
  linear: { label: 'linear', css: 'linear', anime: 'linear', code: "'linear'" },
  outQuad: { label: 'outQuad', css: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', anime: 'outQuad', code: "'outQuad'" },
  outCubic: { label: 'outCubic', css: 'cubic-bezier(0.33, 1, 0.68, 1)', anime: 'outCubic', code: "'outCubic'" },
  outBack: { label: 'outBack（会过冲）', css: 'cubic-bezier(0.34, 1.56, 0.64, 1)', anime: 'outBack', code: "'outBack'" },
}

const FROMS = {
  first: 'first（默认，从第一块）',
  center: 'center（从中间往两边）',
  last: 'last（从最后一块）',
  random: 'random（随机顺序）',
}

/* ============ 正文五块 ============ */

const BLOCKS = [
  `<div>
    <div class="score"><span class="value">128</span><span class="unit">AQI</span><span class="grade">轻度污染</span></div>
    <p class="effect">空气质量可接受，但某些污染物可能对极少数异常敏感人群健康有较弱影响。</p>
  </div>`,
  `<div>
    <div class="meter"><span></span><span></span><span></span><span></span><span></span><span></span></div>
    <div class="axis"><span>0</span><span>50</span><span>100</span><span>150</span><span>200</span><span>300</span><span>500</span></div>
  </div>`,
  `<section>
    <div class="row-head"><span class="row-title">污染物浓度</span><span class="row-note">首要污染物 · PM2.5</span></div>
    <ul class="pollutants">
      <li><span class="p-name">PM 2.5</span><span class="p-value">93</span></li>
      <li><span class="p-name">PM 10</span><span class="p-value">78</span></li>
      <li><span class="p-name">O₃</span><span class="p-value">64</span></li>
      <li><span class="p-name">NO₂</span><span class="p-value">41</span></li>
      <li><span class="p-name">SO₂</span><span class="p-value">18</span></li>
      <li><span class="p-name">CO</span><span class="p-value">12</span></li>
    </ul>
  </section>`,
  `<section>
    <div class="row-head"><span class="row-title">健康建议</span></div>
    <div class="advice">
      <div class="advice-row"><span class="advice-label">一般人群</span><span class="advice-text">极少数异常敏感人群应减少户外活动。</span></div>
      <div class="advice-row"><span class="advice-label">敏感人群</span><span class="advice-text">儿童、老年人及心脏病、呼吸系统疾病患者应减少长时间、高强度的户外锻炼。</span></div>
    </div>
  </section>`,
  `<p class="source">监测站 人民广场 · 数据来源：和风天气</p>`,
  `<p class="source">附加块 ① —— 增加目标数时用来看 stagger() 的分布</p>`,
  `<p class="source">附加块 ② —— 注意它没有上限，超出的部分要不要压由你决定</p>`,
  `<p class="source">附加块 ③</p>`,
]

/* ============ 搭页面 ============ */

const lab = document.querySelector('#lab')

lab.innerHTML = `
  <header class="lab-head">
    <h1>anime.js <code>stagger()</code> 手感样机</h1>
    <p>
      两块舞台吃同一组参数，只换引擎。左边是仓库现在的做法（<code>&lt;Transition&gt;</code> 落地成逐项
      CSS 变量 + <code>transition</code>），右边是 <code>animate()</code> + <code>stagger()</code>。
      改任何一个参数都会立刻重播，方便反复对比手感；也顺带看一下动画结束那一帧文字有没有变化。
    </p>
  </header>

  <div class="lab-controls" id="controls"></div>

  <div class="lab-stages">
    <div class="stage" data-mode="css">
      <div class="stage-cap"><b>CSS transition</b><span>现在的做法 · 延迟写在 CSS 变量里</span></div>
      <div class="panel"><div class="body"></div></div>
    </div>
    <div class="stage" data-mode="anime">
      <div class="stage-cap"><b>anime.js</b><span>animate() + stagger() · 延迟是函数返回值</span></div>
      <div class="panel"><div class="body"></div></div>
    </div>
  </div>

  <div class="lab-readout">
    <section>
      <h2>stagger() 返回的延迟</h2>
      <ul class="delay-chips" id="chips"></ul>
      <pre id="timing"></pre>
    </section>
    <section>
      <h2>两个引擎的写法</h2>
      <pre id="snippets"></pre>
    </section>
    <section class="api-notes">
      <h2>这次从源码确认到的参数</h2>
      <dl>
        <dt>stagger(value, params)</dt><dd>返回一个 (target, index, total) =&gt; 毫秒数 的函数，本身不是动画。</dd>
        <dt>start</dt><dd>基础延迟，默认 0。</dd>
        <dt>from</dt><dd>'first'（默认）/ 索引 / 'center' / 'last' / 'random' / [x, y] 归一化坐标。</dd>
        <dt>ease</dt><dd>作用在「延迟分布」上，不是动画本身的 ease。传字符串如 'outQuad'，或函数。</dd>
        <dt>grid</dt><dd>[列, 行]（可三轴）；<b>grid: true</b> 直接读每个目标的 getBoundingClientRect() 中心做真实距离排序。</dd>
        <dt>axis</dt><dd>'x' / 'y' / 'z'：把「到起点的直线距离」换成沿轴的线性距离，可为负。</dd>
        <dt>total</dt><dd>覆盖目标总数；配合 use（取 data-* 自定义顺序）时用来校正分布。</dd>
        <dt>jitter / seed</dt><dd>± 随机抖动；seed 固定后每次重播顺序一致。</dd>
        <dt>modifier</dt><dd>对算出来的延迟再做一次加工——下面那个「上限 220ms」就是用它实现的。</dd>
      </dl>
    </section>
  </div>
`

const stages = {}
for (const mode of ['css', 'anime']) {
  const root = document.querySelector(`.stage[data-mode="${mode}"]`)
  stages[mode] = {
    root,
    panel: root.querySelector('.panel'),
    body: root.querySelector('.body'),
    anim: null,
  }
}

/* ============ 控件 ============ */

const CONTROLS = [
  { key: 'spacing', label: '间距 spacing', type: 'range', min: 0, max: 160, step: 5, suffix: 'ms' },
  { key: 'start', label: '起点 start', type: 'range', min: 0, max: 600, step: 10, suffix: 'ms' },
  { key: 'duration', label: '时长 duration', type: 'range', min: 120, max: 900, step: 20, suffix: 'ms' },
  { key: 'count', label: '目标数', type: 'range', min: 2, max: 8, step: 1 },
  { key: 'scale', label: 'scale（1 = 纯淡入）', type: 'range', min: 0.9, max: 1, step: 0.001 },
  { key: 'jitter', label: 'jitter（仅 anime 侧）', type: 'range', min: 0, max: 60, step: 5, suffix: 'ms' },
  { key: 'ease', label: 'ease', type: 'select', options: Object.entries(EASES).map(([k, v]) => [k, v.label]) },
  { key: 'from', label: 'from', type: 'select', options: Object.entries(FROMS) },
]

const controls = document.querySelector('#controls')

function buildField(spec) {
  const wrap = document.createElement('div')
  wrap.className = 'field'

  const label = document.createElement('label')
  label.textContent = spec.label
  const id = `f-${spec.key}`
  label.setAttribute('for', id)
  wrap.append(label)

  let input
  if (spec.type === 'select') {
    input = document.createElement('select')
    for (const [value, text] of spec.options) {
      const option = document.createElement('option')
      option.value = value
      option.textContent = text
      input.append(option)
    }
    input.value = String(PARAMS[spec.key])
  } else {
    input = document.createElement('input')
    input.type = 'range'
    input.min = spec.min
    input.max = spec.max
    input.step = spec.step
    input.value = PARAMS[spec.key]
  }
  input.id = id
  input.dataset.key = spec.key
  wrap.append(input)

  if (spec.type === 'range') {
    const out = document.createElement('output')
    out.dataset.out = spec.key
    out.textContent = `${PARAMS[spec.key]}${spec.suffix || ''}`
    wrap.append(out)
  }
  return wrap
}

for (const spec of CONTROLS) controls.append(buildField(spec))

const checkWrap = document.createElement('div')
checkWrap.className = 'field field--check'
checkWrap.innerHTML = '<input type="checkbox" id="f-cap" checked><label for="f-cap">延迟封顶 220ms（现在的公式）</label>'
controls.append(checkWrap)

const autoWrap = document.createElement('div')
autoWrap.className = 'field field--check'
autoWrap.innerHTML = '<input type="checkbox" id="f-auto" checked><label for="f-auto">改参数后自动重播</label>'
controls.append(autoWrap)

const actions = document.createElement('div')
actions.className = 'actions'
actions.innerHTML = '<button type="button" class="is-primary" id="replay">重播两边</button>'
controls.append(actions)

controls.addEventListener('input', (event) => {
  const input = event.target
  if (input.id === 'f-cap') PARAMS.cap = input.checked
  else if (input.id === 'f-auto') PARAMS.auto = input.checked
  else if (input.dataset.key) {
    PARAMS[input.dataset.key] = input.tagName === 'SELECT' ? input.value : Number(input.value)
    const out = controls.querySelector(`output[data-out="${input.dataset.key}"]`)
    if (out) {
      const spec = CONTROLS.find((item) => item.key === input.dataset.key)
      out.textContent = `${input.value}${spec.suffix || ''}`
    }
  }
  renderBlocks()
  updateReadout()
  if (PARAMS.auto) scheduleReplay()
})

document.querySelector('#replay').addEventListener('click', () => replay())

/* ============ 分布计算 ============ */

/* CSS 一侧要自己算分布：delay = start + min(|fromIndex - i| × spacing, 上限)。
   anime 一侧这整段都是 stagger() 的事，改 from 只要换一个字符串。 */
function fromIndex(total) {
  if (PARAMS.from === 'center') return (total - 1) / 2
  if (PARAMS.from === 'last') return total - 1
  return 0
}

function cssDelays(total) {
  const origin = fromIndex(total)
  return Array.from({ length: total }, (_, i) => {
    const raw = PARAMS.start + Math.abs(origin - i) * PARAMS.spacing
    return Math.round(PARAMS.cap ? Math.min(raw, PARAMS.start + CAP) : raw)
  })
}

/* 每个引擎都要一个新鲜的 stagger 实例：它会缓存分布结果，
   所以「重播」和「读数」各造一个，不要复用。 */
function makeStagger() {
  const options = { start: PARAMS.start }
  if (PARAMS.from !== 'first') options.from = PARAMS.from
  if (PARAMS.jitter > 0 || PARAMS.from === 'random') {
    options.jitter = PARAMS.jitter
    options.seed = 1
  }
  if (PARAMS.cap) options.modifier = (value) => Math.min(value, PARAMS.start + CAP)
  return stagger(PARAMS.spacing, options)
}

/* ============ 渲染与重播 ============ */

function renderBlocks() {
  const markup = BLOCKS.slice(0, PARAMS.count)
  for (const mode of ['css', 'anime']) {
    const body = stages[mode].body
    if (body.children.length !== markup.length) {
      body.innerHTML = ''
      for (const html of markup) {
        const block = document.createElement('div')
        block.className = 'block'
        block.innerHTML = html
        body.append(block)
      }
    }
  }
}

/* 面板自己的进场：和 WeatherDialog.vue 那三条 CSS 一致（0.36s / 0.48s / 0.26s），
   两边都一样，这样舞台上唯一的变量就是正文的引擎。面板只位移不缩放（同生产环境）。 */
function playPanel(stage) {
  const panel = stage.panel
  panel.style.transition = 'none'
  panel.style.opacity = '0'
  panel.style.transform = 'translateY(-28px)'
  panel.style.filter = 'blur(3px)'
  void panel.offsetWidth
  panel.style.transition = ''
  panel.style.opacity = ''
  panel.style.transform = ''
  panel.style.filter = ''
}

function playCss() {
  const stage = stages.css
  const blocks = [...stage.body.children]
  const delays = cssDelays(blocks.length)
  const hasScale = PARAMS.scale !== 1
  // 先无过渡地跳到 from 状态，落定一帧后再挂上 transition —— 否则连「归零」这一步也会被过渡掉
  blocks.forEach((block) => {
    block.style.transition = 'none'
    block.style.opacity = '0'
    block.style.scale = hasScale ? String(PARAMS.scale) : ''
  })
  void stage.body.offsetWidth
  blocks.forEach((block, i) => {
    // 每个属性都要各自带一份时长 —— 写成 `opacity, scale 380ms …` 的话
    // 逗号会被当成两条过渡，opacity 那条没有时长（0s），透明度会直接跳到位。
    const timing = `${PARAMS.duration}ms ${EASES[PARAMS.ease].css} ${delays[i]}ms`
    block.style.transition = hasScale ? `opacity ${timing}, scale ${timing}` : `opacity ${timing}`
    block.style.opacity = '1'
    block.style.scale = hasScale ? '1' : ''
  })
}

function playAnime() {
  const stage = stages.anime
  if (stage.anim) stage.anim.revert()
  const props = {
    opacity: [0, 1],
    duration: PARAMS.duration,
    ease: EASES[PARAMS.ease].anime,
    delay: makeStagger(),
  }
  // scale 是可选项：拖到 1 就退化成纯淡入，方便直接对比「少了缩放是不是就发平了」
  if (PARAMS.scale !== 1) props.scale = [PARAMS.scale, 1]
  stage.anim = animate([...stage.body.children], props)
}

function replay() {
  playPanel(stages.css)
  playPanel(stages.anime)
  playCss()
  playAnime()
}

let scheduled = 0
function scheduleReplay() {
  if (scheduled) return
  scheduled = requestAnimationFrame(() => {
    scheduled = 0
    replay()
  })
}

/* ============ 读数 ============ */

function updateReadout() {
  const nodes = [...stages.anime.body.children]
  const total = nodes.length
  // 一个实例算完所有目标：它会缓存分布结果，每个目标各造一个的话 random 会各摇一次
  const delayOf = makeStagger()
  const delays = nodes.map((node, i) => Math.round(delayOf(node, i, nodes)))

  const chips = document.querySelector('#chips')
  chips.innerHTML = delays.map((value, i) => `<li>#${i} ${value}</li>`).join('')

  const last = Math.max(...delays)
  document.querySelector('#timing').textContent = [
    `目标 ${total} 个 · 每个目标 ${PARAMS.duration}ms`,
    `最早的结束在 ${last + PARAMS.duration}ms，整屏落定 ${last + PARAMS.duration}ms`,
    `CSS 一侧算出来的是：${cssDelays(total).join(' / ')}`,
    PARAMS.cap ? `上限 220ms 由 modifier 实现，超出的部分被压平` : `没有上限：目标多的时候最后几块会明显拖后`,
    PARAMS.from === 'random' ? 'random 顺序只有 anime 侧有；CSS 一侧仍按索引顺序' : '',
    PARAMS.jitter > 0 ? `抖动 ±${PARAMS.jitter}ms，seed=1 固定，每次重播一致` : '',
  ].filter(Boolean).join('\n')

  const comma = (...parts) => {
    const list = parts.filter(Boolean)
    return list.length ? `, ${list.join(', ')}` : ''
  }
  const animeOptions = comma(
    `start: ${PARAMS.start}`,
    PARAMS.from === 'first' ? '' : `from: '${PARAMS.from}'`,
    PARAMS.jitter > 0 ? `jitter: ${PARAMS.jitter}` : '',
    PARAMS.jitter > 0 ? 'seed: 1' : '',
    PARAMS.cap ? `modifier: (v) => Math.min(v, ${PARAMS.start + CAP})` : '',
  )

  document.querySelector('#snippets').textContent = [
    '// anime.js',
    'animate(blocks, {',
    '  opacity: [0, 1],',
    ...(PARAMS.scale === 1 ? [] : [`  scale: [${PARAMS.scale}, 1],`]),
    `  duration: ${PARAMS.duration},`,
    `  ease: ${EASES[PARAMS.ease].code},`,
    `  delay: stagger(${PARAMS.spacing}, { ${animeOptions.slice(2)} }),`,
    '})',
    '',
    '/* 现在的做法：分布得自己算，再逐项写进 CSS 变量 */',
    '--stagger-duration: ' + PARAMS.duration + 'ms;',
    '--stagger-delay: ' + cssDelays(total).join('ms / ') + 'ms;',
  ].join('\n')
}

/* ============ 起跑 ============ */

renderBlocks()
updateReadout()
requestAnimationFrame(() => replay())
