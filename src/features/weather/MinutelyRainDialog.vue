<template>
  <div class="MinutelyDialog" role="presentation" @click="close">
    <div class="MinutelyPanel" role="dialog" aria-modal="true" aria-labelledby="MinutelyDialogTitle" @click.stop>
      <header class="MinutelyHeader">
        <div class="MinutelyHeading">
          <span id="MinutelyDialogTitle" class="MinutelyTitle">分钟级降水</span>
          <span v-if="metaText" class="MinutelyMeta">{{ metaText }}</span>
        </div>
        <button class="MinutelyClose" type="button" aria-label="关闭" @click="close">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"></path>
          </svg>
        </button>
      </header>

      <div class="MinutelyBody">
        <!-- 有数据：标题 + 未来两小时柱状图 + 汇总 -->
        <template v-if="analysis">
          <p class="MinutelyHeadline">{{ headline }}</p>
          <p v-if="subline" class="MinutelySubline">{{ subline }}</p>

          <!-- 悬停看明细：上方留出一条给浮层的位置，避免柱子长高时把浮层顶出弹层 -->
          <div class="MinutelyChartWrap" @mouseleave="clearHover">
            <div ref="chartRef" class="MinutelyChart" :class="{ 'is-empty': !hasRain }" aria-hidden="true">
              <span class="MinutelyGridLine" style="top: 0%"></span>
              <!-- 分级参考线：横线是「小雨 / 中雨 / 大雨 / 暴雨」的真实阈值，右侧小字标出每档的范围 -->
              <span
                v-for="line in levelLines"
                :key="`line-${line.key}`"
                class="MinutelyLevelLine"
                :style="{ bottom: `${line.top * 100}%` }"
              ></span>
              <span
                v-for="zone in levelZones"
                v-show="zone.showLabel"
                :key="`zone-${zone.key}`"
                class="MinutelyLevelLabel"
                :style="{ bottom: `${zone.center * 100}%` }"
              >{{ zone.label }}</span>
              <span v-if="band" class="MinutelyHoverBand" :style="{ left: `${band.left}px`, width: `${band.width}px` }"></span>
              <div class="MinutelyBars" :class="{ 'has-hover': activeIndex !== null }">
                <div
                  v-for="(bar, index) in bars"
                  :key="index"
                  class="MinutelyBarSlot"
                  :class="[`tone-${bar.tone}`, { 'is-active': activeIndex === index }]"
                  @mouseenter="focusBar(index, $event)"
                >
                  <span class="MinutelyBar" :style="barStyle(bar, index)"></span>
                </div>
              </div>
            </div>

            <div
              v-if="activeBar"
              ref="tipRef"
              class="MinutelyTooltip"
              :class="`tone-${activeBar.tone}`"
              :style="{ left: `${tipCenter}px` }"
              aria-hidden="true"
            >
              <span class="MinutelyTipHead">
                <span class="MinutelyTipDot"></span>
                <span class="MinutelyTipRange">{{ activeBar.range }}</span>
                <span class="MinutelyTipLevel">{{ activeBar.level }}</span>
              </span>
              <span class="MinutelyTipValue">{{ activeBar.rate }}</span>
            </div>
          </div>
          <div class="MinutelyAxis">
            <span v-for="tick in ticks" :key="tick.key" :class="{ 'is-now': tick.now }">{{ tick.label }}</span>
          </div>

          <div class="MinutelyStats">
            <div class="MinutelyStat">
              <span class="MinutelyStatLabel">未来两小时累计</span>
              <span class="MinutelyStatValue">{{ totalLabel }}</span>
            </div>
            <div class="MinutelyStat">
              <span class="MinutelyStatLabel">最大雨强</span>
              <span class="MinutelyStatValue">{{ peakLabel }}</span>
            </div>
            <div class="MinutelyStat">
              <span class="MinutelyStatLabel">预计降水时长</span>
              <span class="MinutelyStatValue">{{ durationLabel }}</span>
            </div>
          </div>

          <p class="MinutelySource">
            每根柱 = {{ STEP_MINUTES }} 分钟降水量，悬停可看该时段雨强 · 数据来自
            <a href="https://www.qweather.com" target="_blank" rel="noopener noreferrer">和风天气</a>
            · 仅覆盖中国区域
          </p>
        </template>

        <!-- 没有数据（境外坐标或临时缺测）：说清原因是覆盖范围，而不是凭据问题 -->
        <div v-else-if="status === 'unsupported'" class="MinutelyState">
          <svg class="MinutelyStateIcon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3.1c3.35 4.27 4.85 6.87 4.85 9.3a4.85 4.85 0 0 1-9.7 0c0-2.43 1.5-5.03 4.85-9.3z"
              fill="none" stroke="currentColor" stroke-width="1.6"></path>
            <path d="M5 21L19 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
          </svg>
          <p class="MinutelyStateTitle">这里暂时没有分钟级降水数据</p>
          <p class="MinutelyStateText">
            分钟级降水目前只覆盖中国区域（1 km 网格，未来两小时）。如果你就在中国境内，
            这一时段可能是临时缺测，稍后会自动重试；其它天气数据不受影响。
          </p>
        </div>

        <!-- 请求失败：给一个明确的重试入口 -->
        <div v-else-if="status === 'error'" class="MinutelyState">
          <p class="MinutelyStateTitle">分钟级降水暂时取不到</p>
          <p class="MinutelyStateText">可能是网络或服务波动，稍后也会自动重试。</p>
          <button class="MinutelyRetry" type="button" @click="retry">重新获取</button>
        </div>

        <!-- 接口返回成功、但一个点都没给（罕见）：别一直转圈，给个重试 -->
        <div v-else-if="status === 'ready'" class="MinutelyState">
          <p class="MinutelyStateTitle">暂时没有分钟级降水数据</p>
          <p class="MinutelyStateText">接口这次返回的点位是空的，稍后会自动重试。</p>
          <button class="MinutelyRetry" type="button" @click="retry">重新获取</button>
        </div>

        <!-- 首次加载 / 重试中 -->
        <div v-else class="MinutelyState is-loading">
          <p class="MinutelyStateTitle">正在获取未来两小时的降水…</p>
          <div class="MinutelySkeleton" aria-hidden="true">
            <span v-for="(height, index) in skeleton" :key="index" :style="{ height: `${height}%` }"></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useWeatherStore } from '@/store/index'
import { useWeatherNow } from './useWeatherNow'
import { analyzeMinutely, isWetPrecip, LEVEL_STEPS, minutelyTitle, precipToRate, rateLevel, STEP_MINUTES } from './minutelyRain'

const weatherStore = useWeatherStore()
const { MinutelyPrecipitation, MinutelyStatus, MinutelyDetailsDialog, dayDateCity, CityAddressLabel } = storeToRefs(weatherStore)
const { retryMinutelyPrecipitation } = weatherStore
// 模板里直接用 status 判断是「加载中 / 不支持 / 出错」中的哪一种
const status = MinutelyStatus

const close = () => { MinutelyDetailsDialog.value = false }
const retry = () => retryMinutelyPrecipitation()

/* 「现在」自己往前走：弹层开着不动时，分钟数和柱状图里的时间轴也能跟上。
   用全应用共用的 useWeatherNow（和胶囊、壁纸雨滴同一个 now），
   否则三个组件各拿一次 Date.now()，5 分钟边界附近会各自落在不同的「当前段」。 */
const now = useWeatherNow()
function onKeydown(event) {
  if (event.key === 'Escape') close()
}
onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})

const analysis = computed(() => analyzeMinutely(MinutelyPrecipitation.value?.points, now.value))
const hasRain = computed(() => (analysis.value?.total || 0) > 0)
const headline = computed(() => minutelyTitle(analysis.value))

// 时间格式器只建一次：柱子有 24 根，每根都要算「起 – 止」两个时间
let clockFormat = null
try {
  clockFormat = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23',
  })
} catch (error) {
  clockFormat = null
}

const clock = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--'
  if (clockFormat) return clockFormat.format(date)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const updatedLabel = computed(() => {
  const data = MinutelyPrecipitation.value
  if (!data) return ''
  return clock(data.updateTime || data.fetchedAt)
})

const metaText = computed(() => {
  // 跟着天气卡走：点选过就是「区县 路名」/「区县附近」，没点选才是完整的「省, 区县」。
  // 不再在这里自己拼 district / road —— 卡片换成了「附近」写法后，两处必须一致
  const point = dayDateCity.value.point
  const city = point
    ? CityAddressLabel.value
    : (dayDateCity.value.city || '')
  if (!updatedLabel.value) return city
  return city ? `${city} · ${updatedLabel.value} 更新` : `${updatedLabel.value} 更新`
})

// 标题下面那行补充：正在下 → 当前雨强；快下 → 具体开始时间；不下 → 不写
const subline = computed(() => {
  const data = analysis.value
  if (!data || data.expired) return data?.expired ? '数据已超过两小时没有更新' : ''
  if (data.raining) {
    return `当前小时雨强 ${data.rate.toFixed(1)} mm/h`
  }
  if (data.startsIn !== null) {
    return `预计 ${clock(now.value + data.startsIn * 60000)} 开始`
  }
  return ''
})

/* 柱子只画「从现在这一格起」的部分：接口窗口的起点通常比现在早 5~10 分钟（服务端网格延迟），
   把这几根已经过去的柱子画进来会有两个问题 —— 左边的「现在」其实指向 10 分钟前，
   而上面「未来两小时累计」只统计从现在起的雨量，和柱子加起来对不上。 */
const chartPoints = computed(() => {
  const data = analysis.value
  if (!data) return []
  return data.points.slice(data.index)
})

/* 柱状图：未来两小时逐 5 分钟（不假设一定是 24 根，按实际长度渲染）。
   纵轴刻度取固定的几档，而不是「按本次最大值拉满」——
   否则一场毛毛雨也会画成满屏柱子，和暴雨看起来一模一样。 */
const scaleSteps = [0.1, 0.25, 0.5, 1, 2.5, 5, 10]
const scale = computed(() => {
  const max = Math.max(0, ...chartPoints.value.map((point) => point.precip))
  return scaleSteps.find((step) => max <= step) ?? scaleSteps[scaleSteps.length - 1]
})

/** 5 分钟降水量 → 每小时雨强：柱子高度是「这 5 分钟下了多少」，浮层统一显示更直观的 mm/h */
const bars = computed(() => chartPoints.value.map((point) => {
  const wet = isWetPrecip(point.precip)
  const rate = precipToRate(point.precip)
  const level = rateLevel(rate, point.type)
  return {
    wet,
    tone: wet ? level.key : 'dry',
    height: wet ? Math.min(1, point.precip / scale.value) : 0,
    // 悬停浮层用：这一格覆盖的时间段 + 雨强 + 等级
    range: `${clock(point.ts)} – ${clock(point.ts + STEP_MINUTES * 60000)}`,
    level: wet ? level.label : '无降水',
    rate: `${rate.toFixed(1)} mm/h`,
  }
}))

/* 分级参考线 —— 纵轴是「每 5 分钟降水量」，所以阈值也要换成 mm/5min 来比高度：
   2.5 mm/h（≈0.21 mm/5min）起算中雨，8 mm/h 起算大雨，16 mm/h 起算暴雨。
   和柱子配色共用 LEVELS 表，改阈值时线、色、右侧小字会一起变。
   两小时都不下雨时整张图是一排空柱子，画分级线只是噪音，干脆不画。 */
const levelZones = computed(() => {
  if (!hasRain.value) return []
  const top = scale.value
  const type = analysis.value?.type || 'rain'
  const zones = []
  LEVEL_STEPS.forEach((step, index) => {
    if (step.mm >= top) return
    const next = LEVEL_STEPS[index + 1]
    const upper = Math.min(next ? next.mm : top, top) / top
    const lower = step.mm / top
    zones.push({
      key: step.key,
      label: type === 'snow' ? step.snow : step.rain,
      top: upper,
      center: (upper + lower) / 2,
      // 带子太窄就写不下字了：比如暴雨那张图里，小雨只占底下几个像素
      showLabel: upper - lower >= 0.12,
    })
  })
  return zones
})

// 每档只画「上边界」；最上面那档的顶就是图表顶，不用再画一条线
const levelLines = computed(() => levelZones.value
  .filter((zone) => zone.top < 0.999)
  .map((zone) => ({ key: zone.key, top: zone.top })))

/* —— 悬停明细 ——
   位置全部按「被悬停那一格的实测矩形」来算，而不是「第几根 × 平均宽度」：
   柱间有 gap，用平均宽度算会越往右偏得越多。浮层再夹一次，保证第一根、最后一根都不溢出。 */
const chartRef = ref(null)
const tipRef = ref(null)
const hoverIndex = ref(null)
const band = ref(null)
const tipCenter = ref(0)

const activeIndex = computed(() => (
  hoverIndex.value !== null && hoverIndex.value < bars.value.length ? hoverIndex.value : null
))
const activeBar = computed(() => (activeIndex.value === null ? null : bars.value[activeIndex.value]))

async function focusBar(index, event) {
  const chart = chartRef.value
  const slot = event?.currentTarget
  if (!chart || !slot) return
  const chartRect = chart.getBoundingClientRect()
  const slotRect = slot.getBoundingClientRect()
  const left = slotRect.left - chartRect.left
  band.value = { left, width: slotRect.width }
  hoverIndex.value = index
  // 先摆在柱子正中，量到浮层宽度后再夹进边界（避免第一帧从左边滑进来）
  tipCenter.value = left + slotRect.width / 2

  await nextTick()
  const tip = tipRef.value
  const half = tip ? tip.offsetWidth / 2 : 0
  const center = left + slotRect.width / 2
  const min = half + 2
  const max = chartRect.width - half - 2
  tipCenter.value = max > min ? Math.min(Math.max(center, min), max) : center
}

function clearHover() {
  hoverIndex.value = null
  band.value = null
}

// 窗口尺寸变了，之前量到的像素位置就不作数了
const onResize = () => clearHover()
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

// 进场时让柱子从 0 长起来；prefers-reduced-motion 由全局样式兜底
const grown = ref(false)
onMounted(() => {
  nextTick(() => { requestAnimationFrame(() => { grown.value = true }) })
})
const barStyle = (bar, index) => (grown.value
  ? {
    height: `${Math.max(bar.height * 100, 4).toFixed(1)}%`,
    // 用变量传延迟：内联的 transition-delay 会连悬停时的透明度 / 发光一起延迟
    '--bar-delay': `${Math.min(index * 16, 240)}ms`,
  }
  : { height: '0%' })

const ticks = computed(() => {
  const points = chartPoints.value
  if (!points.length) return []
  const last = points.length - 1
  const picks = [0, Math.round(last / 4), Math.round(last / 2), Math.round((last * 3) / 4), last]
  return picks.map((index, order) => ({
    key: `${index}-${order}`,
    now: order === 0,
    label: order === 0 ? '现在' : clock(points[index].ts),
  }))
})

const totalLabel = computed(() => {
  const total = analysis.value?.total || 0
  if (!total) return '0 mm'
  return `${total >= 10 ? total.toFixed(0) : total.toFixed(1)} mm`
})
const peakLabel = computed(() => {
  const peak = analysis.value?.peakRate || 0
  if (peak < 0.1) return '—'
  return `${peak.toFixed(1)} mm/h`
})
const durationLabel = computed(() => {
  const points = chartPoints.value
  const wet = points.filter((point) => isWetPrecip(point.precip)).length
  if (!wet) return '—'
  const minutes = wet * STEP_MINUTES
  return minutes >= 60 ? `${Math.round(minutes / 30) / 2} 小时` : `${minutes} 分钟`
})

const skeleton = [18, 26, 34, 30, 44, 62, 78, 70, 52, 40, 30, 24, 20, 16, 13, 11, 9, 8, 7, 6, 5, 4, 4, 3]
</script>

<style lang="scss" scoped>
/* 右侧留给「小雨 / 中雨 / 大雨 / 暴雨」这列小字的地儿，柱状图和横轴都要让出来 */
$chart-gutter: 2.25rem;

.MinutelyDialog {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 6.875rem; /* 与预警弹层同一条基线，两个弹层切换时不会上下跳 */
  background-color: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(1.125rem);
  -webkit-backdrop-filter: blur(1.125rem);
}

/* 进场 / 离场：整层淡入淡出由全局 .Dialog-* 负责，这里只做面板的位移与缩放 */
.MinutelyDialog.Dialog-enter-active .MinutelyPanel,
.MinutelyDialog.Dialog-leave-active .MinutelyPanel {
  transition: transform 0.34s var(--ease), opacity 0.3s ease;
}

.MinutelyDialog.Dialog-enter-from .MinutelyPanel {
  transform: translateY(1.75rem) scale(0.96);
  opacity: 0;
}

.MinutelyDialog.Dialog-leave-to .MinutelyPanel {
  transform: translateY(1.25rem) scale(0.97);
  opacity: 0;
}

.MinutelyPanel {
  width: min(52vw, 46rem);
  max-height: min(82vh, 48rem);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(18, 30, 52, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 1.375rem;
  box-shadow: 0 1.75rem 4.375rem -1.75rem rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.MinutelyHeader {
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.125rem 1.25rem 0 1.5rem;
}

.MinutelyHeading {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.MinutelyTitle {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-primary);
}

.MinutelyMeta {
  font-size: 0.8rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.MinutelyClose {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  color: var(--text-secondary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 50%;
  transition: background 0.2s ease;

  &:hover {
    background: var(--glass-border);
  }
}

.MinutelyBody {
  padding: 0.625rem 1.5rem 1.375rem;
}

.MinutelyHeadline {
  margin: 0;
  font-size: 1.65rem;
  font-weight: 700;
  line-height: 1.3;
  color: var(--text-primary);
}

.MinutelySubline {
  margin: 0.375rem 0 0;
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* ================= 柱状图 ================= */
.MinutelyChartWrap {
  position: relative;
  margin-top: 1.25rem;
  /* 上方留出悬停浮层的位置：柱子长到 100% 也不会把浮层顶出弹层，浮层出现时也不会挤动图表 */
  padding-top: 3.75rem;
  padding-right: $chart-gutter;
}

.MinutelyChart {
  position: relative;
  height: 8.25rem;

  /* 两小时都不下雨时整块图是一排空柱子，压矮成一条「平线」，别让弹层中间挂着一大片空白 */
  &.is-empty {
    height: 3.5rem;
  }
}

.MinutelyGridLine {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.07);
  pointer-events: none;
}

/* 雨量等级的分界线：虚线，比顶上的网格线亮一点，才看得出「这不是装饰」 */
.MinutelyLevelLine {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background-image: repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.22) 0 4px, transparent 4px 9px);
  pointer-events: none;
}

/* 每档的名字写在右侧留白里，垂直居中在这一档的中间 */
.MinutelyLevelLabel {
  position: absolute;
  right: -$chart-gutter;
  width: $chart-gutter;
  font-size: 0.66rem;
  line-height: 1;
  text-align: right;
  color: rgba(235, 242, 251, 0.42);
  white-space: nowrap;
  pointer-events: none;
  transform: translateY(50%);
}

/* 鼠标所在那一格的竖向高亮条：比单根柱子亮一点，视线能顺着它落到柱子上 */
.MinutelyHoverBand {
  position: absolute;
  top: 0;
  bottom: 0;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 0.4rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.045) 62%, rgba(255, 255, 255, 0.015));
  pointer-events: none;
  transition: left 0.14s var(--ease), width 0.14s var(--ease);
}

/* ================= 悬停浮层 ================= */
.MinutelyTooltip {
  position: absolute;
  top: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.4rem 0.7rem 0.5rem;
  background: rgba(11, 20, 36, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 0.65rem;
  box-shadow: 0 0.85rem 2rem -0.85rem rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(0.5rem);
  -webkit-backdrop-filter: blur(0.5rem);
  white-space: nowrap;
  pointer-events: none;
  transform: translateX(-50%);
  /* left 用位移而不是瞬间跳过去，扫过一排柱子时浮层是滑着走的 */
  transition: left 0.14s var(--ease);
  animation: minutely-tip-in 0.16s ease-out;

  /* 浮层里的点、等级文字跟着柱子的色调走 */
  --tip-color: rgba(255, 255, 255, 0.3);
  --tip-glow: transparent;
  --tip-accent: var(--text-muted);

  &.tone-light {
    --tip-color: #7dd3fc;
    --tip-glow: rgba(125, 211, 252, 0.5);
    --tip-accent: #bae6fd;
  }

  &.tone-moderate {
    --tip-color: #38bdf8;
    --tip-glow: rgba(56, 189, 248, 0.5);
    --tip-accent: #7dd3fc;
  }

  &.tone-heavy {
    --tip-color: #0ea5e9;
    --tip-glow: rgba(14, 165, 233, 0.5);
    --tip-accent: #38bdf8;
  }

  &.tone-storm {
    --tip-color: #3b82f6;
    --tip-glow: rgba(59, 130, 246, 0.55);
    --tip-accent: #60a5fa;
  }
}

.MinutelyTipHead {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.74rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.MinutelyTipDot {
  flex: none;
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: var(--tip-color);
  box-shadow: 0 0 0.45rem var(--tip-glow);
}

.MinutelyTipRange {
  color: var(--text-secondary);
}

.MinutelyTipLevel {
  font-weight: 600;
  color: var(--tip-accent);
}

.MinutelyTipValue {
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

@keyframes minutely-tip-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(0.25rem);
  }

  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.MinutelyBars {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 0.25rem;
  height: 100%;
}

.MinutelyBarSlot {
  display: flex;
  flex: 1 1 0;
  align-items: flex-end;
  height: 100%;
  min-width: 0;
}

.MinutelyBar {
  display: block;
  width: 100%;
  min-height: 3px; /* 没雨的格子留一条细线，时间轴才连得起来 */
  border-radius: 0.25rem 0.25rem 0.125rem 0.125rem;
  background: rgba(255, 255, 255, 0.16);
  transition:
    height 0.5s var(--ease-enter) var(--bar-delay, 0s),
    opacity 0.18s ease,
    filter 0.18s ease,
    box-shadow 0.2s ease;
}

.MinutelyBarSlot.tone-light .MinutelyBar {
  background: linear-gradient(180deg, #bae6fd, #7dd3fc);
}

.MinutelyBarSlot.tone-moderate .MinutelyBar {
  background: linear-gradient(180deg, #7dd3fc, #38bdf8);
}

.MinutelyBarSlot.tone-heavy .MinutelyBar {
  background: linear-gradient(180deg, #38bdf8, #0ea5e9);
}

.MinutelyBarSlot.tone-storm .MinutelyBar {
  background: linear-gradient(180deg, #60a5fa, #3b82f6);
  box-shadow: 0 0 0.75rem rgba(96, 165, 250, 0.45);
}

/* 有柱子被悬停时，其余柱子退到后面，被悬停的那根提亮 + 发光。
   压暗幅度不做太狠：没下雨的格子本来就只有 3px，太暗了整条时间轴会断掉 */
.MinutelyBars.has-hover .MinutelyBarSlot:not(.is-active) .MinutelyBar {
  opacity: 0.5;
  filter: saturate(0.8);
}

.MinutelyBarSlot.is-active .MinutelyBar {
  filter: brightness(1.12) saturate(1.05);
  box-shadow: 0 0 1rem rgba(125, 211, 252, 0.45);
}

.MinutelyBars.has-hover .MinutelyBarSlot.is-active.tone-dry .MinutelyBar {
  background: rgba(255, 255, 255, 0.4);
  box-shadow: none;
}

.MinutelyChart.is-empty .MinutelyBar {
  background: rgba(255, 255, 255, 0.14);
}

.MinutelyAxis {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  /* 和柱状图一样让出右侧那列小字，刻度才对得上柱子的位置 */
  padding-right: $chart-gutter;
  font-size: 0.76rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.MinutelyAxis .is-now {
  color: var(--text-secondary);
  font-weight: 600;
}

/* ================= 汇总 ================= */
.MinutelyStats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-top: 1.375rem;
}

.MinutelyStat {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.75rem 0.875rem;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
}

.MinutelyStatLabel {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.MinutelyStatValue {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.MinutelySource {
  margin: 1rem 0 0;
  font-size: 0.74rem;
  line-height: 1.5;
  color: var(--text-muted);

  a {
    color: var(--text-secondary);
    text-decoration: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.25);
  }

  a:hover {
    color: var(--text-primary);
  }
}

/* ================= 无数据状态 ================= */
.MinutelyState {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 1.5rem 0 0.5rem;
}

.MinutelyStateIcon {
  width: 2.25rem;
  height: 2.25rem;
  margin-bottom: 0.25rem;
  color: var(--text-muted);
}

.MinutelyStateTitle {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
}

.MinutelyStateText {
  margin: 0;
  max-width: 32rem;
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.MinutelyRetry {
  margin-top: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;

  &:hover {
    background: var(--glass-border);
  }
}

.MinutelySkeleton {
  display: flex;
  align-items: flex-end;
  gap: 0.25rem;
  width: 100%;
  height: 7rem;
  margin-top: 1rem;
}

.MinutelySkeleton span {
  flex: 1 1 0;
  min-height: 3px;
  border-radius: 0.25rem;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.05));
  background-size: 200% 100%;
  animation: minutely-sheen 1.3s ease infinite;
}

@keyframes minutely-sheen {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

@media (max-width: 880px) {
  .MinutelyPanel {
    width: min(92vw, 46rem);
  }

  .MinutelyChart {
    height: 6.5rem;
  }
}
</style>
