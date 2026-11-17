<template>
  <div class="board">
    <header class="board-head">
      <h1>空气质量弹层 · 三版配色</h1>
      <p class="lead">
        同一份固定响应（台州黄岩 · AQI 25「优」· 六种污染物 + 两个监测站）在三档配色下的样子。
        面板宽度 47.45rem、比例 1.618 : 1，和真机上点开的一样大；三版共用
        <code>style/air-quality.scss</code> 里那一组低饱和色相，没有另造颜色。
        三列并排是把面板缩到 0.62 倍看色块关系，要看字号和留白请切到 1 : 1。
        <strong>正式界面已采用「二 · 沉浸版」</strong>；工具条可以切到中度污染的长文案样本，
        看高污染档的染色和「一屏装不装得下」。
      </p>

      <div class="bar">
        <div class="bar-group">
          <span class="bar-label">主题</span>
          <button v-for="item in themes" :key="item.id" class="seg" :class="{ 'is-on': theme === item.id }"
            type="button" @click="setTheme(item.id)">{{ item.name }}</button>
        </div>
        <div class="bar-group">
          <span class="bar-label">视图</span>
          <button class="seg" :class="{ 'is-on': mode === 'side' }" type="button" @click="mode = 'side'">三列并排</button>
          <button class="seg" :class="{ 'is-on': mode === 'one' }" type="button" @click="mode = 'one'">1 : 1</button>
        </div>
        <div class="bar-group">
          <span class="bar-label">数据</span>
          <button class="seg" :class="{ 'is-on': level === 'calm' }" type="button" @click="level = 'calm'">优（AQI 25）</button>
          <button class="seg" :class="{ 'is-on': level === 'stress' }" type="button" @click="level = 'stress'">中度污染（AQI 172）</button>
        </div>
        <div class="bar-group">
          <span class="bar-label">卡片上的入口</span>
          <AirQualityChip @click="overlay = active" />
          <span class="bar-hint">点它 → 全屏弹层（{{ activeName }}）</span>
        </div>
      </div>
    </header>

    <p v-if="measure" class="measure">{{ measure }}</p>

    <div class="cols" :class="`is-${mode}`">
      <section v-for="item in palettes" :key="item.id" class="col" :class="{ 'is-active': active === item.id }">
        <div class="col-head">
          <h2>
            <span class="col-name">{{ item.name }}</span>
            <span class="col-tag">{{ item.tag }}</span>
            <span v-if="item.adopted" class="col-adopted">已采用</span>
            <button class="col-open" type="button" @click="openOverlay(item.id)">全屏预览</button>
          </h2>
          <p class="col-note">{{ item.note }}</p>
        </div>

        <div class="frame">
          <AirQualityDialog inline :variant="item.id" :data="data" :place="PLACE" />
        </div>
      </section>
    </div>

    <p v-if="measure" class="measure">{{ measure }}</p>

    <p class="board-foot">
      数据：
      <code>src/dev/airQualitySample.js</code>
      · 弹层：<code>src/features/weather/AirQualityDialog.vue</code>（<code>variant</code> 决定配色）
      · 色板：<code>src/style/air-quality.scss</code>（胶囊与弹层共用）
      · 只用 dev 页：<code>/dev/air-quality.html</code>
    </p>

    <!-- 真·全屏弹层：和正式界面完全同一条路径 —— 不传 data，让组件自己去 store 里
         读明细（AirQuality.detail），也就是线上点开胶囊后发生的事。
         外层 <transition> 也照抄 App.vue，进场 / 离场动效才能在这里一起验。
         三列用的是 inline + 显式 data，那是为了同时摆三版对比才有的写法。 -->
    <transition name="Dialog" mode="out-in">
      <AirQualityDialog v-if="overlay" :variant="overlay" :place="PLACE" @close="overlay = ''" />
    </transition>
  </div>
</template>

<script setup>
/* AQI 弹层的「三版配色」对比板。
   三列并排同屏看颜色差异，1 : 1 单列看真实字号下的排版。
   每一版都是真组件 + 真数据（一份固定的 /airquality/v1/current 响应），
   唯一变量只有 AirQualityDialog 的 variant 属性 —— 选中哪一版，正式界面就用哪一版。
   （说明放在 script 里而不是 <template> 顶层，避免根节点变成 Fragment —— 见 transitions.scss 的 ⚠️） */
import { computed, onMounted, ref, watch } from 'vue'
import AirQualityDialog from '@/features/weather/AirQualityDialog.vue'
import AirQualityChip from '@/features/weather/AirQualityChip.vue'
import { buildAirQualityView } from '@/features/weather/airQuality'
import { useWeatherStore } from '@/store/index'
import { applyColorTheme } from '@/features/wallpaper/properties'
import { AIR_QUALITY_SAMPLE, AIR_QUALITY_STRESS, PLACE, airQualitySummary } from './airQualitySample'

const weatherStore = useWeatherStore()

/* 两档数据：
   calm   真实的「优」响应（AQI 25），日常城市九成时间落在这里；
   stress 构造的第 4 档「中度污染」（AQI 172），文案最长、也是沉浸版染色最明显的档位。
   切换时数字、指针、污染条、建议文案一起换 —— 长文案会不会把一屏撑破，只能在这档看出来。 */
const level = ref('calm')
const sample = computed(() => (level.value === 'stress' ? AIR_QUALITY_STRESS : AIR_QUALITY_SAMPLE))

// 顶部那颗真胶囊读的是 store：档位一换，摘要跟着换，别出现「胶囊说优、弹层写着 172」
watch(sample, (raw) => { weatherStore.AirQuality = airQualitySummary(raw) }, { immediate: true })

/* 响应 → 弹层视图模型。正式界面由 api/weather.js 归一化出的 detail 喂进来，
   这里直接把原始响应交给同一个 buildAirQualityView，所以两边排版必然一致。 */
const data = computed(() => buildAirQualityView(sample.value))

const themes = [
  { id: 'night', name: '夜雨' },
  { id: 'mist', name: '晨雾' },
]

/* 三版的差别，一句话说清各自的取舍（不是装饰文案）：
   quiet 最不打扰、tinted 一眼看出好坏、spectrum 信息量最大。 */
const palettes = [
  {
    id: 'quiet',
    name: '一 · 克制版',
    tag: '只染胶囊与指针',
    note: '颜色只出现在等级胶囊、刻度指针和进度条上，其余全是卡片本来那套中性玻璃。和三个主题都不打架，代价是不点开看不出今天好不好。',
  },
  {
    id: 'tinted',
    name: '二 · 沉浸版',
    tag: '整块面板染色',
    // 2026-11 定稿：正式界面用它（AirQualityDialog.vue 里 variant 的默认值）
    adopted: true,
    note: '面板顶部一层等级色光晕 + 同色细边，AQI 数字、标签、污染条一起染色。点亮即知好坏，代价是面板底色不再纯粹，深色主题下最明显。',
  },
  {
    id: 'spectrum',
    name: '三 · 数据版',
    tag: '国标六色刻度',
    note: '刻度铺满国标六色并标出六个档名（本身就是图例），每根污染条用它自己那一档的颜色。信息量最大；颜色也最热闹，低 AQI 时整条刻度都在发光。',
  },
]

/* 初始状态可以从地址栏给，方便截图：
   ?theme=mist   浅色主题
   ?view=one     1 : 1 单列
   ?data=stress  换成中度污染的长文案样本
   ?full=quiet   直接打开某一版的全屏弹层 */
const query = new URLSearchParams(window.location.search)
const theme = ref(document.documentElement.dataset.theme === 'mist' ? 'mist' : 'night')
const mode = ref(query.get('view') === 'one' ? 'one' : 'side')
if (query.get('data') === 'stress') level.value = 'stress'
// 默认落在正式界面那一版（沉浸版）上，免得截图截到一版没人用的配色
const fallbackPalette = palettes.find((item) => item.adopted)?.id || 'quiet'
const active = ref(palettes.some((item) => item.id === query.get('full')) ? query.get('full') : fallbackPalette)
const overlay = ref(palettes.some((item) => item.id === query.get('full')) ? query.get('full') : '')

const activeName = computed(() => palettes.find((item) => item.id === active.value)?.name || '')

/* ?measure=1 时把弹层内部的「内容高 / 可用高」打出来：一屏装不装得下，
   靠肉眼数像素太容易错位，直接量。只有 dev 页会走到这里。 */
const measure = ref('')
const measureBody = () => {
  const rows = [...document.querySelectorAll('.AqiBody')].map((body, index) => {
    const panel = body.closest('.WeatherDialogPanel')
    const w = (sel) => {
      const el = body.querySelector(sel)
      if (!el) return '—'
      const r = el.getBoundingClientRect()
      return `${Math.round(r.left)}+${Math.round(r.width)}`
    }
    return [`#${index + 1}`, `body ${body.scrollHeight}/${body.clientHeight}`,
      `panel ${panel.offsetWidth}×${panel.offsetHeight}`,
      `scale ${w('.AqiScale')}`, `meter ${w('.AqiMeterTrack')}`,
      `grid ${w('.AqiPollutantGrid')}`].join(' ')
  })
  measure.value = rows.join(' | ')
}
onMounted(() => {
  if (query.get('measure')) setTimeout(measureBody, 300)
})

const setTheme = (id) => {
  theme.value = id
  applyColorTheme(id)
}

const openOverlay = (id) => {
  active.value = id
  overlay.value = id
}
</script>

<style lang="scss" scoped>
.board {
  /* 真机上面板的宽度；三列并排时整块按 --frame-zoom 缩下去 */
  --panel-w: 47.45rem;
  --frame-zoom: 1;
  box-sizing: border-box;
  /* 不设 max-width：并排模式要三块 47.45rem 的面板横着排，页头自己限制行宽 */
  margin: 0 auto;
  padding: 2rem 2rem 3rem;
  font-family: var(--font-sans);
  color: var(--text-primary);
}

/* ---------- 页头 ---------- */
.board-head {
  max-width: 96rem;
}

.board-head h1 {
  margin: 0 0 0.6rem;
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.lead {
  max-width: 68rem;
  margin: 0 0 0.9rem;
  font-size: 0.9rem;
  line-height: 1.7;
  color: var(--text-secondary);
}

.lead code,
.board-foot code {
  margin: 0 0.1rem;
  padding: 0.05rem 0.35rem;
  font-size: 0.82em;
  color: var(--text-secondary);
  background: var(--glass-bg-subtle);
  border: 1px solid var(--glass-border);
  border-radius: 0.3rem;
}

/* 工具条：和胶囊、弹层用同一套玻璃材质，别在对比板里另起一种控件风格 */
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem 1.5rem;
  padding: 0.55rem 0.75rem;
  background: var(--glass-bg-subtle);
  border: 1px solid var(--glass-border);
  border-radius: 0.75rem;
  corner-shape: squircle;
}

.bar-group {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.bar-label {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.bar-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.seg {
  padding: 0.28rem 0.6rem;
  font-family: inherit;
  font-size: 0.78rem;
  color: var(--text-secondary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.seg:hover {
  color: var(--text-primary);
  background: var(--glass-border);
}

.seg.is-on {
  font-weight: 700;
  color: var(--text-primary);
  background: var(--glass-active);
  border-color: var(--glass-border-strong);
}

/* ---------- 三列 ---------- */
.cols {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1.75rem 1.25rem;
  margin-top: 1.5rem;
}

.cols.is-side {
  --frame-zoom: 0.62;
}

/* 1 : 1 是一列一列往下排：这块面板 47.45rem 宽，两列就挤不下了 */
.cols.is-one {
  flex-direction: column;
  align-items: center;
}

/* 宽屏能放大就放大一档，0.62 倍下 0.7rem 的小字只剩 6px 左右 */
@media (min-width: 1700px) {
  .cols.is-side {
    --frame-zoom: 0.76;
  }
}

.col {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  width: calc(var(--panel-w) * var(--frame-zoom));
}

.col-head {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.col-head h2 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
}

.col-tag {
  padding: 0.1rem 0.45rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--glass-bg-subtle);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
}

/* 「已采用」：告诉后来看这块板的人，哪一版是真的在用的 */
.col-adopted {
  padding: 0.1rem 0.45rem;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-primary);
  background: var(--glass-active);
  border: 1px solid var(--glass-border-strong);
  border-radius: 999px;
}

.col-open {
  margin-left: auto;
  padding: 0.15rem 0.45rem;
  font-family: inherit;
  font-size: 0.72rem;
  color: var(--text-muted);
  background: none;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  cursor: pointer;
}

.col-open:hover {
  color: var(--text-primary);
  border-color: var(--glass-border-strong);
}

.col-note {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.6;
  color: var(--text-muted);
}

/* 当前选中那一版：标题条上给一道极细的焦点线，不影响面板本身 */
.col.is-active .col-name {
  color: var(--text-primary);
}

/* 面板本体：尺寸按真机的 47.45rem 排，再整体 zoom 缩放。
   用 zoom 而不是 transform: scale —— 它会把 rem 一起缩，缩放后仍按真实布局换行。 */
.frame {
  width: var(--panel-w);
  zoom: var(--frame-zoom);
}

/* 量出来的数：只在 ?measure=1 时出现，别为它费心排版 */
.measure {
  max-width: 96rem;
  margin: 0.75rem 0 0;
  padding: 0.4rem 0.6rem;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--text-primary);
  background: var(--glass-bg-subtle);
  border: 1px solid var(--glass-border-strong);
  border-radius: 0.4rem;
  white-space: normal;
}

.board-foot {
  max-width: 96rem;
  margin: 2rem auto 0;
  font-size: 0.78rem;
  line-height: 1.7;
  color: var(--text-muted);
}
</style>
