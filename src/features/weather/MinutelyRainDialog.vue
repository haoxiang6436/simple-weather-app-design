<template>
  <WeatherDialog class="MinutelyDialog" labelledby="MinutelyDialogTitle" :show-close="false" @close="close" @backdrop-click="close">
      <template #title>
        <div class="MinutelyHeading">
          <span id="MinutelyDialogTitle" class="MinutelyTitle">{{ presentation.title }}</span>
          <span v-if="metaText" class="MinutelyMeta">{{ metaText }}</span>
        </div>
      </template>

      <div class="MinutelyBody" :class="{ 'is-state': !analysis }" :style="{ '--minutely-axis-gutter': `${axisGutter}rem` }">
        <!-- 有数据：标题 + 未来两小时柱状图 + 汇总 -->
        <template v-if="analysis">
          <p class="MinutelyHeadline">{{ headline }}</p>
          <p v-if="subline" class="MinutelySubline">{{ subline }}</p>

          <!-- 悬停看明细：上方留出一条给浮层的位置，避免柱子长高时把浮层顶出弹层 -->
          <div class="MinutelyChartWrap" :class="{ 'is-empty': !hasRain }" @mouseleave="clearHover">
            <div ref="chartRef" class="MinutelyChart" :class="{ 'is-empty': !hasRain }" aria-hidden="true">
              <div class="MinutelyGrid">
                <template v-for="tick in rainTicks" :key="tick.key">
                  <div
                    class="MinutelyGridLine"
                    :class="{ 'is-baseline': tick.position === 0 }"
                    :style="{ bottom: `${tick.position}%` }"
                  ></div>
                  <span class="MinutelyGridLabel" :style="{ bottom: `${tick.position}%` }">{{ tick.label }}</span>
                </template>
              </div>
              <span v-if="band" class="MinutelyHoverBand" :style="{ left: `${band.left}px`, width: `${band.width}px` }"></span>
              <div class="MinutelyBars" :class="{ 'has-hover': activeIndex !== null }">
                <div
                  v-for="(bar, index) in bars"
                  :key="index"
                  class="MinutelyBarSlot"
                  :class="[`tone-${bar.tone}`, { 'is-active': activeIndex === index }]"
                  @mouseenter="focusBar(index, $event)"
                >
                  <StaggerTransition preset="bar" :index="index">
                    <span class="MinutelyBar" :style="{ height: `${(bar.height * 100).toFixed(2)}%` }"></span>
                  </StaggerTransition>
                </div>
              </div>
            </div>

            <div
              v-if="activeBar"
              class="MinutelyTooltip"
              :class="`tone-${activeBar.tone}`"
              :style="{ '--tip-center': `${tipCenter}px`, '--tip-plot-width': `${tipPlotWidth}px` }"
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
              <span class="MinutelyStatLabel">两小时累计{{ presentation.noun }}</span>
              <span class="MinutelyStatValue">{{ totalLabel }}</span>
            </div>
            <div class="MinutelyStat">
              <span class="MinutelyStatLabel">最大{{ presentation.strength }}</span>
              <span class="MinutelyStatValue">{{ peakLabel }}</span>
            </div>
            <div class="MinutelyStat">
              <span class="MinutelyStatLabel">预计{{ presentation.noun }}时长</span>
              <span class="MinutelyStatValue">{{ durationLabel }}</span>
            </div>
          </div>

          <p class="MinutelySource">
            <span>数据来源：</span><a href="https://www.qweather.com" target="_blank" rel="noopener noreferrer">和风天气</a>
            <span> · 仅中国地区可用 · </span>
            <span class="MinutelyReferenceNote" :title="referenceExplanation">{{ referenceSource }}</span>
          </p>
        </template>

        <!-- 没有数据（境外坐标或临时缺测）：说清原因是覆盖范围，而不是凭据问题 -->
        <div v-else-if="status === 'unsupported'" class="MinutelyState">
          <PrecipitationIcon class="MinutelyStateIcon" :type="presentation.type" />
          <p class="MinutelyStateTitle">这里暂时没有{{ presentation.title }}数据</p>
          <p class="MinutelyStateText">
            分钟级降水目前只覆盖中国区域（1 km 网格，未来两小时）。如果你就在中国境内，
            这一时段可能是临时缺测，稍后会自动重试；其它天气数据不受影响。
          </p>
        </div>

        <!-- 请求失败：给一个明确的重试入口 -->
        <div v-else-if="status === 'error'" class="MinutelyState">
          <p class="MinutelyStateTitle">{{ presentation.title }}暂时取不到</p>
          <p class="MinutelyStateText">可能是网络或服务波动，稍后也会自动重试。</p>
          <button class="MinutelyRetry" type="button" @click="retry">重新获取</button>
        </div>

        <!-- 接口返回成功、但一个点都没给（罕见）：别一直转圈，给个重试 -->
        <div v-else-if="status === 'ready'" class="MinutelyState">
          <p class="MinutelyStateTitle">暂时没有{{ presentation.title }}数据</p>
          <p class="MinutelyStateText">接口这次返回的点位是空的，稍后会自动重试。</p>
          <button class="MinutelyRetry" type="button" @click="retry">重新获取</button>
        </div>

        <!-- 首次加载 / 重试中 -->
        <div v-else class="MinutelyState is-loading">
          <p class="MinutelyStateTitle">正在获取未来两小时的{{ presentation.noun }}…</p>
          <div class="MinutelySkeleton" aria-hidden="true">
            <span v-for="(height, index) in skeleton" :key="index" :style="{ height: `${height}%` }"></span>
          </div>
        </div>
      </div>
  </WeatherDialog>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useWeatherStore } from '@/store/index'
import { useWeatherNow } from './useWeatherNow'
import WeatherDialog from './WeatherDialog.vue'
import StaggerTransition from '@/shared/motion/StaggerTransition'
import { analyzeMinutely, isWetPrecip, minutelyTitle, precipToRate, rateLevel, STEP_MINUTES } from './minutelyRain'
import { createGradeHeightScale, selectRainScale } from './minutelyRainScale'
import { formatPrecipRate, getReferenceLevelSteps, precipitationPresentation } from './precipitationLevels'
import PrecipitationIcon from './PrecipitationIcon.vue'

const weatherStore = useWeatherStore()
const { MinutelyPrecipitation, MinutelyStatus, MinutelyDetailsDialog, CityAddressLabel, nowWeatherData } = storeToRefs(weatherStore)
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
const presentation = computed(() => precipitationPresentation(analysis.value, nowWeatherData.value))
const referenceSource = computed(() => {
  const rain = '降雨分级参考来自南昌市地方标准 DB3601/T 13-2025《短时降雨量等级分类规范》'
  const snow = '降雪分级参考来自新疆维吾尔自治区地方标准 DB65/T 3273-2026《降水量级别》 · 雪量为水当量'
  return presentation.value.type === 'snow' ? snow : presentation.value.type === 'mixed' ? `${rain}；${snow}` : rain
})
const referenceExplanation = computed(() => {
  const rain = '降雨参考南昌市地方标准 DB3601/T 13—2025 表1的1小时阈值，标准适用范围为南昌市，其他地区仅作显示参考。图中雨强由5分钟降雨量折算，不代表实际1小时累计量。'
  const snow = '降雪参考新疆维吾尔自治区地方标准 DB65/T 3273-2026 表2的1小时水当量阈值，其他地区仅作显示参考。图中强度由5分钟降雪水当量折算，不代表实际1小时累计量或积雪深度。特大暴雪为大于8.0毫米，8.0毫米仍属大暴雪；小于0.1毫米的零星小雪仅为微量提示，非表内等级。'
  const explanation = presentation.value.type === 'snow' ? snow : presentation.value.type === 'mixed' ? `${rain}${snow}` : rain
  return presentation.value.type === 'mixed' ? explanation : `${explanation}纵轴按等级等距分段显示，段内线性缩放，实际强度见明细。`
})
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
  // 地址与天气卡保持一致，包括默认区县中心补查到的街道。
  const city = CityAddressLabel.value
  if (!updatedLabel.value) return city
  return city ? `${city} · ${updatedLabel.value} 更新` : `${updatedLabel.value} 更新`
})

// 标题下面那行补充：正在下 → 当前雨强；快下 → 具体开始时间；不下 → 不写
const subline = computed(() => {
  const data = analysis.value
  if (!data || data.expired) return data?.expired ? '数据已超过两小时没有更新' : ''
  if (data.raining) {
    return `当前${presentation.value.strength} ${formatPrecipRate(data.rate, data.currentType)}${presentation.value.type === 'snow' ? '（水当量）' : ''}`
  }
  if (data.startsIn !== null) {
    const nextWet = data.points.slice(data.index).find((point) => isWetPrecip(point.precip))
    return nextWet ? `预计 ${clock(nextWet.ts)} 开始` : ''
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

/* 单一雨雪类型按参考等级等距分段；混合降水继续使用线性数值轴。 */
const chartRef = ref(null)
const scaleMax = ref(5)
const chartPeakRate = computed(() => Math.max(0, ...chartPoints.value.map((point) => precipToRate(point.precip))))
const referenceLevels = computed(() => {
  if (!hasRain.value || presentation.value.type === 'mixed') return []
  const rate = analysis.value?.raining ? analysis.value.rate : chartPeakRate.value
  return getReferenceLevelSteps(rate, presentation.value.type)
})
watch([chartPeakRate, () => presentation.value.type], ([peak, type], previous) => {
  scaleMax.value = selectRainScale(peak, previous?.[1] === type ? scaleMax.value : 0, type)
}, { immediate: true })
const gradeScale = computed(() => createGradeHeightScale(referenceLevels.value, chartPeakRate.value))
// 正在下时围绕当前等级，无降水时围绕预报峰值；参考线与柱体使用相同映射。
const rainTicks = computed(() => {
  if (!hasRain.value) return [{ key: 'dry', label: presentation.value.dry, position: 0 }]
  // 雨雪混合时使用数值刻度，每根柱子的等级由悬停明细说明。
  if (presentation.value.type === 'mixed') return [0, 0.5, 1].map((fraction) => ({
    key: `mixed-${fraction}`, label: `${scaleMax.value * fraction}`, position: fraction * 100,
  }))
  return gradeScale.value.ticks.map((tick) => ({
    key: tick.key, label: tick.label, position: tick.position * 100,
  }))
})
// 刻度字号为 0.7rem，按最长标签留出文字宽度及 0.5rem 间隔。
const axisGutter = computed(() => Math.max(1.9, ...rainTicks.value.map((tick) => [...tick.label].length * 0.7 + 0.5)))

/** 5 分钟量折算强度后映射柱高，浮层保留实际 mm/h。 */
const bars = computed(() => chartPoints.value.map((point) => {
  const wet = isWetPrecip(point.precip)
  const rate = precipToRate(point.precip)
  const level = rateLevel(rate, point.type)
  return {
    wet,
    tone: wet ? level.tone : 'dry',
    height: wet ? (presentation.value.type === 'mixed' ? Math.min(1, rate / scaleMax.value) : gradeScale.value.height(rate)) : 0,
    // 悬停浮层用：这一格覆盖的时间段 + 雨强 + 等级
    range: `${clock(point.ts)} – ${clock(point.ts + STEP_MINUTES * 60000)}`,
    level: wet ? level.label : `无${point.type === 'snow' ? '降雪' : '降雨'}`,
    rate: `${formatPrecipRate(rate, point.type)}${point.type === 'snow' ? '（水当量）' : ''}`,
  }
}))

/* —— 悬停明细 ——
   位置全部按「被悬停那一格的实测矩形」来算，而不是「第几根 × 平均宽度」：
   柱间有 gap，用平均宽度算会越往右偏得越多。浮层再夹一次，保证第一根、最后一根都不溢出。 */
const hoverIndex = ref(null)
const band = ref(null)
const tipCenter = ref(0)
const tipPlotWidth = ref(0)

const activeIndex = computed(() => (
  hoverIndex.value !== null && hoverIndex.value < bars.value.length ? hoverIndex.value : null
))
const activeBar = computed(() => (activeIndex.value === null ? null : bars.value[activeIndex.value]))

function focusBar(index, event) {
  const chart = chartRef.value
  const slot = event?.currentTarget
  if (!chart || !slot) return
  const chartRect = chart.getBoundingClientRect()
  const slotRect = slot.getBoundingClientRect()
  const left = slotRect.left - chartRect.left
  band.value = { left, width: slotRect.width }
  hoverIndex.value = index
  // CSS 直接用浮层自身宽度夹紧位置，首帧和内容变化时均不越界。
  tipCenter.value = left + slotRect.width / 2
  tipPlotWidth.value = chartRect.width
}

function clearHover() {
  hoverIndex.value = null
  band.value = null
}

// 窗口尺寸变了，之前量到的像素位置就不作数了
const onResize = () => clearHover()
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

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
  return `${total.toFixed(total >= 10 ? 0 : total < 0.1 ? 3 : total < 1 ? 2 : 1)} mm`
})
const peakLabel = computed(() => {
  const peak = analysis.value?.peakRate || 0
  if (!peak) return '—'
  return formatPrecipRate(peak, presentation.value.type)
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
/* 左侧刻度栏与正文左边界对齐，柱子和时间轴共用其余宽度。 */

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

.MinutelyBody {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0.45rem 1rem 1.05rem;
}

.MinutelyBody.is-state {
  overflow-y: auto;
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
  display: flex;
  flex: 1 1 0;
  min-height: 4.5rem;
  margin-top: 0.55rem;
  /* 上方留出悬停浮层的位置：柱子长到 100% 也不会把浮层顶出弹层，浮层出现时也不会挤动图表 */
  padding-top: 1.05rem;
  padding-left: var(--minutely-axis-gutter);
}

.MinutelyChartWrap.is-empty {
  min-height: 3rem;
}

.MinutelyChart {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  height: auto;
}

.MinutelyGrid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.MinutelyGridLine {
  position: absolute;
  right: 0;
  left: 0;
  border-top: 1px dashed var(--glass-border);
}

.MinutelyGridLine.is-baseline {
  border-top-style: solid;
}

.MinutelyGridLabel {
  position: absolute;
  left: calc(-1 * var(--minutely-axis-gutter));
  color: var(--text-secondary);
  font-size: 0.7rem;
  line-height: 1;
  white-space: nowrap;
  transform: translateY(50%);
}

/* 鼠标所在那一格的竖向高亮条：比单根柱子亮一点，视线能顺着它落到柱子上 */
.MinutelyHoverBand {
  position: absolute;
  top: 0;
  bottom: 0;
  border: 1px solid var(--glass-border);
  border-radius: 0.4rem;
  background: linear-gradient(180deg, var(--glass-bg-soft), var(--glass-bg-subtle) 62%, transparent);
  pointer-events: none;
  transition: left 0.14s var(--ease), width 0.14s var(--ease);
}

/* ================= 悬停浮层 ================= */
.MinutelyTooltip {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  width: max-content;
  max-width: calc(var(--tip-plot-width) - 4px);
  min-width: 0;
  gap: 0.2rem;
  padding: 0.4rem 0.7rem 0.5rem;
  background: var(--surface-modal);
  border: 1px solid var(--glass-border);
  border-radius: 0.65rem;
  box-shadow: 0 0.85rem 2rem -0.85rem rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(0.5rem);
  -webkit-backdrop-filter: blur(0.5rem);
  white-space: nowrap;
  pointer-events: none;
  margin-left: var(--minutely-axis-gutter);
  /* 50% / 100% 取浮层自身宽度，不需要先渲染越界再测量并移回。 */
  transform: translateX(clamp(2px, calc(var(--tip-center) - 50%), calc(var(--tip-plot-width) - 100% - 2px)));
  animation: minutely-tip-in 0.16s ease-out;

  /* 浮层里的点、等级文字跟着柱子的色调走 */
  --tip-color: var(--text-muted);
  --tip-glow: transparent;
  --tip-accent: var(--text-muted);

  &.tone-light {
    --tip-color: var(--color-primary);
    --tip-glow: var(--rain-chip-border);
    --tip-accent: var(--color-primary-soft);
  }

  &.tone-moderate {
    --tip-color: var(--color-primary);
    --tip-glow: var(--color-primary);
    --tip-accent: var(--color-primary);
  }

  &.tone-heavy {
    --tip-color: var(--color-primary-strong);
    --tip-glow: var(--rain-chip-border);
    --tip-accent: var(--color-primary);
  }

  &.tone-storm {
    --tip-color: var(--color-primary-strong);
    --tip-glow: var(--rain-chip-border);
    --tip-accent: var(--color-primary-soft);
  }
}

.MinutelyTipHead {
  display: flex;
  flex-wrap: wrap;
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
  white-space: normal;
  overflow-wrap: anywhere;
}

@keyframes minutely-tip-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
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
  position: relative;
  display: flex;
  flex: 1 1 0;
  align-items: flex-end;
  height: 100%;
  min-width: 0;

  &::before {
    content: '';
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 3px;
    border-radius: 0.4rem;
    corner-shape: squircle;
    background: var(--glass-border);
    opacity: 0.56;
  }
}

.MinutelyBar {
  transform-origin: center bottom;
  position: absolute;
  z-index: 1;
  bottom: 0;
  display: block;
  width: 100%;
  min-height: 2px;
  border-radius: 0.4rem;
  corner-shape: squircle;
  background: var(--glass-border);
  transition:
    opacity 0.18s ease,
    filter 0.18s ease,
    box-shadow 0.2s ease;
}

.MinutelyBarSlot.tone-dry .MinutelyBar {
  visibility: hidden;
}

.MinutelyBarSlot.tone-light .MinutelyBar {
  background: linear-gradient(180deg, var(--color-primary-soft), var(--color-primary));
}

.MinutelyBarSlot.tone-moderate .MinutelyBar {
  background: linear-gradient(180deg, var(--color-primary), var(--color-primary));
}

.MinutelyBarSlot.tone-heavy .MinutelyBar {
  background: linear-gradient(180deg, var(--color-primary), var(--color-primary-strong));
}

.MinutelyBarSlot.tone-storm .MinutelyBar {
  background: linear-gradient(180deg, var(--color-primary-soft), var(--color-primary-strong));
  box-shadow: 0 0 0.75rem var(--rain-chip-border);
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
  background: var(--glass-border-strong);
  box-shadow: none;
}

.MinutelyChart.is-empty .MinutelyBarSlot::before {
  background: var(--glass-bg-soft);
}

.MinutelyAxis {
  display: flex;
  justify-content: space-between;
  flex: none;
  margin-top: 0.3rem;
  padding-left: var(--minutely-axis-gutter);
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
  flex: none;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin-top: 0.65rem;
}

.MinutelyStat {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.45rem 0.55rem;
  background: var(--glass-bg-subtle);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  corner-shape: squircle;
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
  flex: none;
  margin: 0.35rem 0 0;
  font-size: 0.74rem;
  line-height: 1.5;
  color: var(--text-muted);
  white-space: normal;

  a {
    color: var(--text-secondary);
    text-decoration: none;
    border-bottom: 1px solid var(--glass-border-strong);
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
  background: var(--skeleton-gradient);
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

/* 高度紧张时，优先压缩图表留白，保证统计项和来源说明仍在弹窗内。 */
@media (max-height: 760px) {
  .MinutelyBody {
    padding-bottom: 0.85rem;
  }

  .MinutelyHeadline {
    font-size: 1.45rem;
    line-height: 1.2;
  }

  .MinutelyChartWrap {
    min-height: 4.5rem;
    margin-top: 0.4rem;
    padding-top: 0.8rem;
  }

  .MinutelyChartWrap.is-empty {
    min-height: 2.5rem;
  }

  .MinutelyStats {
    margin-top: 0.45rem;
  }

  .MinutelyStat {
    padding: 0.35rem 0.5rem;
  }

  .MinutelySource {
    margin-top: 0.25rem;
    font-size: 0.68rem;
    line-height: 1.3;
  }
}

@media (max-width: 560px) {
  .MinutelyBody {
    padding-right: 0.75rem;
    padding-left: 0.75rem;
  }

  .MinutelyHeadline {
    font-size: 1.32rem;
  }

  .MinutelyStats {
    gap: 0.35rem;
  }

  .MinutelyStatLabel {
    font-size: 0.68rem;
  }

  .MinutelyStatValue {
    font-size: 1rem;
  }
}

@media (max-width: 880px) {
  .MinutelyChart {
    min-height: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .MinutelyBar,
  .MinutelyHoverBand,
  .MinutelyTooltip {
    animation: none;
    transition: none;
  }
}
</style>
