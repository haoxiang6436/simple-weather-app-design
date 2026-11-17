<template>
  <WeatherDialog class="MinutelyDialog" labelledby="MinutelyDialogTitle" :show-close="false" @close="close" @backdrop-click="close">
      <template #title>
        <div class="MinutelyHeading">
          <span id="MinutelyDialogTitle" class="MinutelyTitle">{{ presentation.title }}</span>
          <span v-if="metaText" class="MinutelyMeta">{{ metaText }}</span>
        </div>
      </template>

      <div ref="bodyEl" class="MinutelyBody" :class="{ 'is-state': !analysis }" :style="{ '--minutely-axis-gutter': `${axisGutter}rem` }">
        <!-- 有数据：标题 + 未来两小时柱状图 + 汇总 -->
        <template v-if="analysis">
          <p class="MinutelyHeadline">{{ headline }}</p>
          <p v-if="subline" class="MinutelySubline">{{ subline }}</p>

          <!-- 悬停看明细：上方留出一条给浮层的位置，避免柱子长高时把浮层顶出弹层 -->
          <div
            ref="wrapEl"
            class="MinutelyChartWrap"
            :class="{ 'is-empty': !hasRain }"
            @pointerenter="onPointerEnter"
            @pointermove="onPointerMove"
            @mouseleave="clearHover"
          >
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
              <!-- 高亮竖条与浮层读同一个 --follow-x（JS 逐帧写），两者永远同步 -->
              <span v-if="activeIndex !== null" class="MinutelyHoverBand"></span>
              <div class="MinutelyBars" :class="{ 'has-hover': activeIndex !== null }">
                <div
                  v-for="(bar, index) in bars"
                  :key="index"
                  class="MinutelyBarSlot"
                  :class="[`tone-${bar.tone}`, { 'is-active': activeIndex === index }]"
                  @mouseenter="onSlotEnter(index)"
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
              :style="{ '--tip-plot-width': `${tipPlotWidth}px` }"
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
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { animate, cubicBezier, stagger } from 'animejs'
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
   位置按「每一格的实测矩形」来算，而不是「第几根 × 平均宽度」：柱间有 gap，
   用平均宽度算会越往右偏得越多。浮层再由 CSS 夹一次，第一根、最后一根都不溢出。

   ⚠️ 这一段改过一版，记录一下为什么不再是「每根柱子 mouseenter → 瞬移」：
     · 以前浮层位置直接跟着 --tip-center 改值，CSS 上只有一条透明度动画（minutely-tip-in）。
       鼠标从一格划到另一格时，浮层是**跳**过去的 —— 眼睛跟不上，也就读不清上面那行
       「22:35 – 22:40 / 0.00 mm/h」到底还是不是刚才那个格子的。
     · 命中判断挂在每根柱子上，柱子之间有 0.25rem 的 gap：划过 gap 时 hoverIndex 归空，
       浮层整个卸载、再重新挂载并重播一次淡入 —— 快速横划时就是一路闪。
     · 高亮竖条有 0.14s 的 left/width transition，浮层没有，两者还会各走各的。

   现在：
     · 命中判断改挂在整个图表区的 pointermove 上，取「离哪个格子中心最近」，
       划过 gap 也不会有空档；再兜底保留每格的 mouseenter（触屏 tap 会补发它）。
     · 位置由一个指数平滑跟随逐帧写进 --follow-x（px，相对图表内容盒左缘）。
       高亮竖条和浮层读同一个变量，所以永远同步、也不会算出两种速度。
       用指数衰减而不是弹簧：弹簧会冲过头，读数会短暂压在旁边那根柱子上，
       而浮层是「跟着我指的这一格」，不该越过它。时间常数 48ms ≈ 跨一格
       （约 34px）140ms 落定 —— 看得见是从旁边滑过来的，又不至于落后到手感变迟钝。
     · 变量只由 JS 写，模板里不要再绑 :style —— Vue 每次重渲染都会按目标值重写一遍，
       正在推的那一帧就被抹掉（和 ForecastStrip.vue 里 --fc-active 的约定一致）。
     · 系统开了「减少动态效果」照旧直接落位。 */

const wrapEl = ref(null)
const hoverIndex = ref(null)
const tipPlotWidth = ref(0)

const activeIndex = computed(() => (
  hoverIndex.value !== null && hoverIndex.value < bars.value.length ? hoverIndex.value : null
))
const activeBar = computed(() => (activeIndex.value === null ? null : bars.value[activeIndex.value]))

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const setWrapVar = (name, value) => wrapEl.value?.style.setProperty(name, value)

/* 几何缓存：进入图表区 / 尺寸变化时量一遍，pointermove 里只做算术 ——
   每次移动都读 24 次 getBoundingClientRect 会强制同步布局，横划时直接掉帧。 */
let geo = null

function measureGeo() {
  const chart = chartRef.value
  geo = null
  if (!chart) return geo
  const slots = chart.querySelectorAll('.MinutelyBarSlot')
  const chartRect = chart.getBoundingClientRect()
  if (!slots.length || !chartRect.width) return geo
  const centers = []
  let width = 0
  slots.forEach((slot, index) => {
    const rect = slot.getBoundingClientRect()
    if (index === 0) width = rect.width
    centers.push(rect.left - chartRect.left + rect.width / 2)
  })
  geo = { centers, width, plotWidth: chartRect.width, left: chartRect.left }
  // 浮层的 max-width 与边缘夹紧都读它；宽度没变就不写，免得白白触发重渲染
  if (tipPlotWidth.value !== geo.plotWidth) tipPlotWidth.value = geo.plotWidth
  setWrapVar('--minutely-band-width', `${width}px`)
  return geo
}

const ensureGeo = () => geo || measureGeo()

/* —— 平滑跟随 —— */
const FOLLOW_TAU = 48 // ms；越小越跟手，越大越「飘」
const FOLLOW_EPSILON = 0.2 // px；收尾直接吸附，别为一个零点几像素再跑几帧
let followNow = 0
let followTarget = 0
let followFrame = 0
let followStamp = 0

function renderFollow() {
  setWrapVar('--follow-x', `${followNow.toFixed(2)}px`)
}

function followStep(stamp) {
  // 掉帧（切回标签页、主线程被占）时按最多 4 帧算，免得一帧就冲到位、看着像瞬移
  const dt = Math.min(Math.max(stamp - followStamp, 0), 64)
  followStamp = stamp
  followNow += (followTarget - followNow) * (1 - Math.exp(-dt / FOLLOW_TAU))
  const settled = Math.abs(followTarget - followNow) <= FOLLOW_EPSILON
  if (settled) followNow = followTarget
  renderFollow()
  followFrame = settled ? 0 : requestAnimationFrame(followStep)
}

function moveFollowTo(center, { snap = false } = {}) {
  followTarget = center
  // 首次出现 / 尺寸变化 / 减少动态效果：直接落位，不从别处滑过来
  if (snap || prefersReducedMotion()) {
    if (followFrame) cancelAnimationFrame(followFrame)
    followFrame = 0
    followNow = center
    renderFollow()
    return
  }
  if (followFrame) return // 已经在推了，只更新目标，别从当前位置重新起跳
  followStamp = performance.now()
  followFrame = requestAnimationFrame(followStep)
}

function stopFollow() {
  if (followFrame) cancelAnimationFrame(followFrame)
  followFrame = 0
}

function activate(index, { snap = false } = {}) {
  const geometry = ensureGeo()
  if (!geometry || index < 0 || index >= geometry.centers.length) return
  if (hoverIndex.value === index) return
  // 上一帧还没有激活项 = 浮层要新挂载，此时不该看到它从上一格滑过来
  const appeared = hoverIndex.value === null
  hoverIndex.value = index
  moveFollowTo(geometry.centers[index], { snap: snap || appeared })
}

function nearestIndex(clientX) {
  const geometry = ensureGeo()
  if (!geometry) return -1
  const x = clientX - geometry.left
  let best = 0
  let bestGap = Math.abs(geometry.centers[0] - x)
  for (let index = 1; index < geometry.centers.length; index += 1) {
    const gap = Math.abs(geometry.centers[index] - x)
    if (gap < bestGap) {
      best = index
      bestGap = gap
    }
  }
  return best
}

function onPointerEnter() {
  measureGeo()
}

function onPointerMove(event) {
  // 手指按着划是滚动弹层正文，不是选格子；触屏靠下面那个 mouseenter 兜底
  if (event.pointerType === 'touch') return
  activate(nearestIndex(event.clientX))
}

function onSlotEnter(index) {
  activate(index)
}

function clearHover() {
  hoverIndex.value = null
  geo = null
  stopFollow()
}

// 窗口尺寸变了，之前量到的像素位置就不作数了
const onResize = () => clearHover()
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

/* 图表自己变尺寸（换场景、刻度文字变了导致左侧留白变宽 / 窗口缩放）时，
   缓存的像素位置要重测。正在悬停的话保持当前格子、直接落位，别让浮层漂在旧位置上。
   ⚠️ ResizeObserver 只看布局盒，看不了 transform：进场时正文各块带 scale，
   那期间量到的矩形会整体缩 1.5%（浮层贴近首尾时会偏 2~3px），
   所以进场动画收尾时（playEntrance 的 onComplete）也调一次这里重新对准。 */
let chartObserver = null

function refreshHoverGeometry() {
  const active = hoverIndex.value
  if (active === null) {
    geo = null
    return
  }
  const geometry = measureGeo()
  if (geometry && active < geometry.centers.length) moveFollowTo(geometry.centers[active], { snap: true })
}

watch(chartRef, (chart) => {
  chartObserver?.disconnect()
  chartObserver = null
  if (!chart) {
    geo = null
    return
  }
  chartObserver = new ResizeObserver(() => refreshHoverGeometry())
  chartObserver.observe(chart)
}, { flush: 'post' })

onUnmounted(() => {
  chartObserver?.disconnect()
  chartObserver = null
  stopFollow()
})

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

/* ================= 正文各块的错峰进场 =================
   打开弹层时按阅读顺序逐块落位：标题 → 副标题 → 柱状图 → 时间轴 → 三格汇总 → 来源。
   延迟交给 anime.js 的 stagger()，写法和空气质量弹层一致（AirQualityDialog.vue 的 playEntrance()），
   对照样机在 dev/stagger-lab.html。

   为什么不用 CSS transition（StaggerTransition + stagger.js 的预设）：
   走 transition 的 opacity 会让文字在过渡结束那一帧重新栅格化，看着像「错峰结束时抖一下」。
   这一屏正文同样直接贴在共享的玻璃面板上、底下没有自己的不透明底色，抖动比有底有边的卡片明显。
   逐帧写内联样式就不走那条路；写完落到 opacity 1 / scale 1（本来就是自然状态），
   所以 onComplete 里把内联样式摘掉，进场结束后 DOM 和「从没做过动画」完全一致。

   位移不做（travel 0px）：正文是 flex 列 + overflow-y 的滚动容器，
   往上 / 下挪会在进场期间把最后一块顶出可视区、闪出滚动条。
   缩放 0.985 没有这个问题，少了它整段又会变成纯淡入、看着发平。

   离场不错峰：弹层整层（遮罩 + 面板）自己会淡出，正文跟着走就够了。

   ⚠️ start + 2 × spacing 是「图表块」开始落位的时间，柱状图那 24 根柱子的 CSS 预设
      bar（stagger.js）就是按这个数对齐的 —— 改这里的时序要同步改那边。 */
const bodyEl = ref(null)
const MINUTELY_ENTER = { start: 170, spacing: 55, duration: 400, scale: 0.985 }
const MINUTELY_ENTER_EASE = cubicBezier(0.16, 1, 0.3, 1)
let entrance = null

const settle = (nodes) => {
  for (const node of nodes) {
    node.style.removeProperty('opacity')
    node.style.removeProperty('transform')
  }
}

const playEntrance = () => {
  const body = bodyEl.value
  if (!body || !body.children.length) return
  // 系统开了「减少动态效果」就直接到位（transitions.scss 里也是同样的约定）
  if (prefersReducedMotion()) return
  if (entrance) entrance.revert() // 重播前清掉上一轮的内联样式，别叠加
  const nodes = [...body.children]
  entrance = animate(nodes, {
    opacity: [0, 1],
    scale: [MINUTELY_ENTER.scale, 1],
    duration: MINUTELY_ENTER.duration,
    ease: MINUTELY_ENTER_EASE,
    delay: stagger(MINUTELY_ENTER.spacing, { start: MINUTELY_ENTER.start }),
    onComplete: () => {
      settle(nodes)
      // 进场期间正文带着 scale，量到的格子坐标是缩过的；落定后重新对一次准
      refreshHoverGeometry()
    },
  })
}

/* 正文结构变了才重播：第一次打开时数据可能还在路上（先渲染「加载中」，之后换成图表），
   或者取数失败切到报错 / 无数据分支 —— 这两种情况都值得重新落位一次。
   数据每 5 分钟刷新时 analysis 仍然是同一个真值，不会重播，已经在看的图不会重新淡一遍。 */
watch(() => Boolean(analysis.value), async () => {
  await nextTick()
  playEntrance()
}, { immediate: true })

onUnmounted(() => {
  if (entrance) entrance.revert()
})
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

/* 撑满外壳的正文区，靠 flex 而不是 height:100%。
   外壳面板现在是 height:auto + min-height（见 WeatherDialog.vue：1.618 只是「最矮高度」），
   这种盒子的百分比高度按规范解析成 auto —— 之前这里写 height:100%，
   量出来正文只有 289px、面板 469px，底下白空 98px，图表（flex:1 1 0）也没有余量可涨，
   整块内容被压到顶部，看着像布局坏了。
   换成 flex:1 1 auto 之后正文拿到剩余高度，面板停在 1.618 时图表把留白吃进去；
   内容真超过 80vh 时 min-height:0 让它照旧收缩、由 overflow 滚动。 */
.MinutelyBody {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
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

/* 鼠标所在那一格的竖向高亮条：比单根柱子亮一点，视线能顺着它落到柱子上。
   位置读 --follow-x（JS 逐帧推的平滑位置），和浮层共用同一个值 ——
   这里不要再给 left 挂 transition：逐帧写值和过渡动画抢同一个属性，会走出「走走停停」。 */
.MinutelyHoverBand {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--follow-x, 0px) - var(--minutely-band-width, 0px) / 2);
  width: var(--minutely-band-width, 0px);
  border: 1px solid var(--glass-border);
  border-radius: 0.4rem;
  background: linear-gradient(180deg, var(--glass-bg-soft), var(--glass-bg-subtle) 62%, transparent);
  pointer-events: none;
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
  /* 50% / 100% 取浮层自身宽度，不需要先渲染越界再测量并移回。
     --follow-x 是 JS 逐帧写的平滑位置（见 script 里的平滑跟随），
     挂到 transform 上就只走合成层，横划时不会每帧重排浮层里的文字。 */
  transform: translateX(clamp(2px, calc(var(--follow-x, 0px) - 50%), calc(var(--tip-plot-width) - 100% - 2px)));
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
