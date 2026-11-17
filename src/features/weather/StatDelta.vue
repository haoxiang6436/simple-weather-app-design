<template>
  <span ref="rootEl" class="stat-delta">
    <!-- 三态只换图标：「持平」不出现「持平」两个字，一个 = 形的两道杠更安静 -->
    <span class="delta" :class="[dir, tone]" aria-hidden="true">
      <svg v-if="dir === 'up'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 19.5V5M6 11l6-6 6 6" />
      </svg>
      <svg v-else-if="dir === 'down'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 4.5V19M6 13l6 6 6-6" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"
        stroke-linejoin="round">
        <path d="M7 9.6h10M7 14.4h10" />
      </svg>
      <span v-if="text" class="delta-num">{{ text }}<span v-if="unit" class="delta-unit">{{ unit }}</span></span>
    </span>

    <!-- 提示浮层：整张指标卡是热区，0.16s 意图延迟 / 0.12s 离场宽限见下面的 TIP_MOTION -->
    <span ref="tipEl" class="tip tip-fade" aria-hidden="true">
      <span class="tip-body">
        <span class="tip-main">{{ tip }}</span>
        <span class="tip-sub">{{ sub }}</span>
      </span>
    </span>

    <!-- 读屏读的是这一句：角标和浮层都 aria-hidden，不会被念两遍，也不会漏掉方向 -->
    <span class="visually-hidden">{{ tip }}。{{ sub }}</span>
  </span>
</template>

<script setup>
/**
 * 指标差值角标：平均温度 / 湿度 / 降雨量 / 风力 / 紫外线 / 云量后面那一小截。
 *
 * 它只负责画：往上还是往下、要不要数字、冷暖色还是中性灰、提示里那句话怎么说，
 * 全部由 statDeltas.js 算好传进来。所以这个文件里没有任何天气字段名，
 * 以后改文案、改精度、加指标，都不用动这里。
 *
 * 排版：角标贴在数值行的右端（位置/排版在 WeatherMain 的 .stat-foot 里），
 * 提示浮层的锚点是那一行 —— 所以这里不设 position，让 .tip 落到 .stat-foot 上，
 * right: 0 / bottom: 100% 才能一直对着数值行。
 * （说明放在 script 里而不是 <template> 顶层，避免根节点变成 Fragment —— 见 transitions.scss 的 ⚠️）
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { animate, eases } from 'animejs'

// eslint-disable-next-line no-undef
defineProps({
  // up / down / flat
  dir: { type: String, default: 'flat' },
  // 角标上的数字；持平、以及紫外线这种文字指标都是空串
  text: { type: String, default: '' },
  // 数字后面的单位（mm / % / °C / 级）；和 text 一起出现，没有数字时是空串
  unit: { type: String, default: '' },
  // tint：温度 / 湿度用冷暖色 · mono：其余四项保持中性灰
  tone: { type: String, default: 'mono' },
  // 提示第一行：比今天低 5 个点（基准和差值一句话说清，第二行再补两端原值）
  tip: { type: String, required: true },
  // 提示第二行：今天 97% → 周六 92%
  sub: { type: String, default: '' },
})

/* ================= 悬停提示的渐出渐入：anime.js 的 InOutBack =================
   热区仍然是整张指标卡（.stat），不是这枚二十来像素宽的角标 —— 鼠标在这么小的字上停不住。
   但推动画的是脚本，所以过去由 CSS 白送的两条延迟也要自己实现：
     · 悬停后先等 0.16s 才出（防抖）：鼠标扫过一排卡片时提示不会一路乱亮；没停够就移开，
       动画根本没被创建过，一帧都不会画。
     · 离开后先宽限 0.12s 才收：沿着卡片边缘抖一下、从角标上扫过，都不算真的离开。
   这是从 transitions.scss 搬过来的（原来那套是 .stat:hover 上的纯 CSS）。

   为什么不再用 CSS transition：
   1) 要的是 InOutBack —— 它起步会先往反方向「拉」一点、收尾再冲过目标一点。
      cubic-bezier 虽然允许 y 越出 [0,1]，但要对准 anime 这条曲线得反解四个控制点；
      而且两个方向想用不同时长 / 不同回弹量，CSS 一边就得维护两份几乎一样的规则。
   2) 打断要干净：鼠标在动画中途折返时，CSS 只能从当前值重新起一段过渡（其实也还行），
      而 anime 这边只要 cancel() 掉上一段 —— 新一段的起点读的就是此刻的内联值。

   怎么推（和七日预报的 --fc-active 同一套写法）：JS 只写两个量
     opacity       0 ⇄ 1
     --tip-hide    1（收起）⇄ 0（展开）
   位移和去模糊在样式里写成 calc(var(--tip-rise) * var(--tip-hide)) 这种形式，
   所以「浮起来多少（--tip-rise）、糊多少（--tip-defocus）」只有 .tip-fade 里一份定义，
   JS 不关心是 0.5rem 还是 2px。改手感改那两个变量，改节奏改下面的 TIP_MOTION。

   ⚠️ InOutBack 在 0 和 1 附近各有约三成时间停在界外（过冲），opacity 会被浏览器夹到 [0,1]、
   blur 的负值按 0 处理，所以肉眼看到的是「悬停 → 顿一下 → 快速现形 → 落定」；
   位移没有夹取，那 ±5% 的过冲正好变成开头一记回拉、收尾一次落定（8px 位移上约 0.4px）。
   嫌出场慢就改 TIP_MOTION 的时长，别去改缓动 —— 夹掉的那段不是 bug，是这条曲线的性格。
   ⚠️ 触摸屏上抬手就会 pointerleave，所以点一下不会把提示留在屏幕上（桌面壁纸以悬停为主，
   而且同一句话还在下面那份 visually-hidden 里，读屏仍能读到）。 */
const TIP_MOTION = Object.freeze({
  // 悬停后多久才出提示（防抖）
  intent: 160,
  // 离开后多久才收（宽限）
  grace: 120,
  // 出场比离场慢一点：出场要看清「从哪儿长出来」，离场只是让位。
  // 两段都要记住：InOutBack 有约三成时间停在界外（见上面 ⚠️），所以实际可见的淡入只有 ~100ms，
  // 计时总量才对得上原来那套（160 + 200 出、120 + 120 收）。
  enter: 260,
  leave: 170,
})

// 1.7 是 anime 里 Back 系列的默认回弹量（inOutBack 的过冲约 ±5%）。
// 想更弹就往上调（2.5 ≈ ±9.5%），视觉上仍是「收尾顿一下」，不会甩出卡片。
const TIP_EASE = eases.inOutBack(1.7)

const rootEl = ref(null)
const tipEl = ref(null)
// 热区：最近的 .stat 卡片（WeatherMain 的六张指标卡）。单独用这个组件时退回自己的根节点，
// 至少角标本身还能悬停出提示。
let triggerEl = null
let tipAnim = null
let intentTimer = 0
let graceTimer = 0
// 提示该不该开着（悬停或焦点在卡里）—— 只看这个，不看动画进度：
// 中途折返时两边都不该重复起一段动画
let open = false

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* 收起后的内联样式全部摘掉：.tip-fade 的默认值（opacity 0 / --tip-hide 1）本来就等于收起态，
   所以摘掉不会有任何视觉变化，DOM 也回到「从没动过」的样子（和 AirQualityDialog 的 settle 同理）。 */
const stripInline = () => {
  const el = tipEl.value
  if (!el) return
  el.style.removeProperty('opacity')
  el.style.removeProperty('--tip-hide')
}

/* 一帧到位：系统开了「减少动态效果」时走这里，等价于原来 CSS 过渡被关掉 */
const snapTip = (toOpen) => {
  if (tipAnim) {
    tipAnim.cancel()
    tipAnim = null
  }
  const el = tipEl.value
  if (!el) return
  if (!toOpen) {
    stripInline()
    return
  }
  el.style.opacity = '1'
  el.style.setProperty('--tip-hide', '0')
}

const playTip = (toOpen) => {
  const el = tipEl.value
  if (!el) return
  // 上一段还没走完就反向：cancel 会停在当前帧，新一段从此刻的值接着走，不会跳回起点
  if (tipAnim) tipAnim.cancel()
  tipAnim = animate(el, {
    opacity: toOpen ? 1 : 0,
    '--tip-hide': toOpen ? 0 : 1,
    duration: toOpen ? TIP_MOTION.enter : TIP_MOTION.leave,
    ease: TIP_EASE,
    onComplete: () => {
      tipAnim = null
      // 展开态要靠内联样式撑着（CSS 默认是收起），只有收起之后再清
      if (!toOpen) stripInline()
    },
  })
}

const showTip = () => {
  if (open) return
  open = true
  clearTimeout(graceTimer)
  graceTimer = 0
  intentTimer = setTimeout(() => {
    intentTimer = 0
    if (!open) return
    if (prefersReducedMotion()) snapTip(true)
    else playTip(true)
  }, TIP_MOTION.intent)
}

const hideTip = () => {
  if (!open) return
  open = false
  clearTimeout(intentTimer)
  intentTimer = 0
  graceTimer = setTimeout(() => {
    graceTimer = 0
    if (open) return
    if (prefersReducedMotion()) snapTip(false)
    else playTip(false)
  }, TIP_MOTION.grace)
}

// 焦点还在卡里就别收（:focus-within 的语义）：否则 Tab 到卡内下一个可聚焦元素时提示会闪一下
const onFocusOut = (event) => {
  const next = event.relatedTarget
  if (next && triggerEl && triggerEl.contains(next)) return
  hideTip()
}

onMounted(() => {
  const el = rootEl.value
  if (!el) return
  triggerEl = el.closest('.stat') || el
  triggerEl.addEventListener('pointerenter', showTip)
  triggerEl.addEventListener('pointerleave', hideTip)
  triggerEl.addEventListener('focusin', showTip)
  triggerEl.addEventListener('focusout', onFocusOut)
  // 挂载时鼠标已经在这张卡上（换数据导致角标重新挂载）：补一次出场，别把提示吞掉
  if (triggerEl.matches(':hover')) showTip()
})

onBeforeUnmount(() => {
  clearTimeout(intentTimer)
  clearTimeout(graceTimer)
  intentTimer = 0
  graceTimer = 0
  if (triggerEl) {
    triggerEl.removeEventListener('pointerenter', showTip)
    triggerEl.removeEventListener('pointerleave', hideTip)
    triggerEl.removeEventListener('focusin', showTip)
    triggerEl.removeEventListener('focusout', onFocusOut)
    triggerEl = null
  }
  // revert 会把逐帧写的内联样式还原掉，再摘一次保证不留尾巴
  if (tipAnim) {
    tipAnim.revert()
    tipAnim = null
  }
  stripInline()
})
</script>

<style lang="scss" scoped>
/* 只摆自己：外层 .stat-foot 负责两端对齐，这里不抢 flex 分配 */
.stat-delta {
  display: inline-flex;
  align-items: center;
  flex: none;
  line-height: 1;
}

/* 字号是 0.75rem 的定值，不跟 .stat-value 的 1.9rem 走 ——
   数值行两端对齐之后，角标的长短不该随数值字号一起放大缩小 */
.delta {
  display: inline-flex;
  align-items: center;
  gap: 0.12em;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--text-muted);
}

.delta svg {
  display: block;
  width: 0.95em;
  height: 0.95em;
}

/* 数字比箭头暗一档：箭头说方向，数字只是旁注 */
.delta-num {
  color: var(--text-secondary);
}

/* 单位再小一档、再暗一档 —— 和数值行里的 <small>（0.52em / --text-muted）是同一套层级：
   数字是被读的主体，单位只负责说「差的是几个什么」，所以它不该和数字一样重。
   紧贴数字、不额外留空格：% °C 级 mm 都是后缀，靠字号差和颜色差就能分开，
   中间插空格会让「↑ 3.4 mm」散成三个不相干的词，而角标本来就只有 0.75rem 高。 */
.delta-unit {
  margin-left: 0.04em;
  font-size: 0.86em;
  font-weight: 500;
  color: var(--text-muted);
}

/* 冷暖色只给平均温度和湿度：升是暖、降是冷，表达的是体感，不是「好不好」。
   降雨 / 风力 / 紫外线 / 云量的升降没有冷暖可言，跟着中性灰走 —— 绝不红绿，
   天气的升降不是涨跌，绿箭头会让人以为「下雨变多」是件好事。 */
.delta.tint.up {
  color: var(--delta-up);
}

.delta.tint.down {
  color: var(--delta-down);
}

/* 持平旁边没有数字陪衬，单独一个图标要看得见，所以比中性灰亮一档 */
.delta.flat {
  color: var(--text-secondary);
}

/* ---- 悬停提示 ----
   材质：和卡片、状态胶囊同一套毛玻璃 —— 低透明底色 + 1px 细边 + backdrop blur，
   而且是「卡片玻璃再厚一档」：浮层永远压在卡片上，先看见的就是两层之间的厚度差，
   比卡片厚太多就成了卡面上的一个洞（实测：亮壁纸下 0.72 的浮层比卡面暗近 4 倍，
   改成 0.55 之后降到 2 倍出头；具体数值和各主题的取值见 index.scss 的 --tip-*）。
   分层靠更重的模糊 + 细边 + 软影，不靠颜色深浅硬拉。
   投影是浮层必需（不加它，浮层和卡面贴成一张，看不出是另一层），
   渐变和内高光仍然不加。

   两个已经踩过的坑，改这里之前先看一眼：
   1) 模糊是管用的，但它只作用于浮层框内的那块背景。框外的东西一点不变 ——
      标签正好被浮层下沿切过时，露在框外的那半截是原样清晰的，
      看起来就像「根本没做模糊」。所以 bottom 取 0.2rem：把标签整个盖进框里，
      它在框内会被糊成一片匀开的雾，而不是留一条能认出来的残影。
   2) 三套主题都必须给 --tip-blur 一个真值。晨雾曾经设成 none（怕洗白），
      结果白玻璃叠白卡几乎不遮挡，底下的字直接透上来 —— 那是最难看的一种。 */
.tip {
  position: absolute;
  right: 0;
  /* 只留 0.2rem：再多就切穿标签行，见上面那段说明 */
  bottom: calc(100% + 0.2rem);
  z-index: 5;
  width: max-content;
  max-width: 15rem;
  padding: 0.5rem 0.7rem;
  font-size: 0.72rem;
  /* 角标是 600，提示回到正文粗细，否则两行小字会糊成一团 */
  font-weight: 400;
  letter-spacing: normal;
  line-height: 1.45;
  text-align: left;
  /* 比 --text-primary 更实一档：下面这层玻璃变薄了，文字得自己站住 */
  color: var(--tip-text);
  background: var(--tip-bg);
  border: 1px solid var(--tip-border);
  /* 比卡片自己的圆角紧（0.75 vs 1.75）：它是浮起来的一个小块，不是卡里的一个格子 */
  border-radius: 0.75rem;
  box-shadow: var(--tip-shadow);
  -webkit-backdrop-filter: var(--tip-blur);
  backdrop-filter: var(--tip-blur);
  /* 只用于显示：鼠标从角标移到浮层上，不能把 hover 状态挡掉 */
  pointer-events: none;
}

.tip-body {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

/* ---- 渐出渐入的两个端点（动效见 script 里的 TIP_MOTION） ----
   --tip-hide 是唯一被 JS 逐帧改写的量：1 = 收起（默认），0 = 展开。
   位移和去模糊都写成它的函数，所以距离只有这一处定义，JS 只管 0 ⇄ 1：
     · 收起时浮层比落位位置低 --tip-rise（此时 opacity 0，看不出它在哪儿）
     · 收起时文字带 --tip-defocus 的模糊，「从雾里浮出来」那一下靠它
   0.5rem / 2px 是对着 InOutBack 调的：这条曲线起步慢、中段快，
   可见的那一小段里要跑完整个位移，距离太小就看不出「浮起来」（原来 0.25rem 配的是 ease-out）。
   ⚠️ 别给 translate / filter 挂 transition：JS 逐帧写同一个变量，过渡会两边抢值。 */
.tip-fade {
  --tip-rise: 0.5rem;
  --tip-defocus: 2px;
  --tip-hide: 1;
  opacity: 0;
  translate: 0 calc(var(--tip-rise) * var(--tip-hide));
}

/* 模糊挂在文字层（.tip-body），不能挂在带 backdrop-filter 的那层上：
   同一个元素上的 filter 会改变 backdrop 的采样根，那层玻璃会糊成一片。 */
.tip-fade .tip-body {
  filter: blur(calc(var(--tip-defocus) * var(--tip-hide)));
}

.tip-sub {
  font-size: 0.68rem;
  color: var(--tip-text-weak);
  font-variant-numeric: tabular-nums;
}

/* 只给读屏的完整说法（和 EarlyWarningDetails.vue 里那份相同，作用域各管各的） */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
