<template>
  <div class="hourly" role="group" aria-label="未来 24 小时天气">
    <!--
      24 小时预报：一条「只看不选」的曲线带，一屏 8 列、整条 24 列靠横向拖动。
      和 7 天条的设计差别（故意的）：
        · 没有选中态 —— 24 列每列的信息量已经很小，再点亮一列只会让人以为它更重要
        · 没有自动滚动 —— 滚动位置是用户的，程序不替他挪
        · 每列四行：温度曲线上的点 → 天气图标 → 降水概率或风力 → 时间
      几何沿用 7 天条的思路：--hc-col 一列宽，曲线画布左右各内缩半列，
      第 i 小时的相对横坐标就是 i/(n-1)，所以画布宽 3 屏也不影响曲线形态。
    -->
    <div ref="scrollEl" class="hourly-scroll">
      <div ref="trackEl" class="hourly-track" :style="{ '--hc-n': columnCount }">
        <!--
          中间这层只为一件事：滚轮到两头时给内容一个「冲过头再弹回」的位移。
          不能把 transform 直接写在 .hourly-track 上 —— 那是 BetterScroll 的 content 元素，
          它自己会写 transform，两边会互相覆盖（表现是拖动突然跳位）。
        -->
        <div ref="shiftEl" class="hourly-shift">
          <div class="hourly-band" aria-hidden="true">
            <!-- 曲线靠 plotKey 换身份：换数据、重新进场都走一次同一条「从左画到右」，
                 旧的那份在离场里淡掉（两份同框时靠绝对定位叠着，不占第二份的流）。
                 动效参数只在 shared/motion/stagger.js 的 hourlyTrend 预设里，这里不写 keyframes。 -->
            <StaggerTransition preset="hourlyTrend">
              <svg :key="`${plotKey}:${revealKey}`" class="hourly-trend" viewBox="0 0 700 100"
                preserveAspectRatio="none">
                <defs>
                  <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="currentColor" stop-opacity="0.28" />
                    <stop offset="0.45" stop-color="currentColor" stop-opacity="0.12" />
                    <stop offset="1" stop-color="currentColor" stop-opacity="0" />
                  </linearGradient>
                </defs>
                <path v-if="plot.areaPath" class="hourly-area" :d="plot.areaPath"
                  :fill="`url(#${gradientId})`" />
                <path v-if="plot.linePath" class="hourly-line" :d="plot.linePath" />
              </svg>
            </StaggerTransition>
          </div>

          <!-- 跨零点：时间行那格已经换成日期，这里再补一条淡竖线（画在新一天第一列的左边界） -->
          <StaggerTransition preset="hourlyDivider">
            <span v-if="dividerIndex > 0" :key="revealKey" class="hourly-divider" aria-hidden="true"
              :style="{ left: `calc(var(--hc-col) * ${dividerIndex})` }"></span>
          </StaggerTransition>

          <!-- 24 列各自进场：TransitionGroup 直接把 li 当作错峰项，ul 本身不做整块淡入，
               否则外层再淡一次，前几列会被「双重透明」压得比后几列更淡。
               revealKey 换一次就整组重挂一次（切到这一屏、或数据从无到有）：
               组件整体卸载不走 li 的离场过渡，所以不会出现「新旧两排并排占位」，
               而重新挂载时的 appear 会把 24 列重新错峰一遍。 -->
          <StaggerGroup :key="revealKey" tag="ul" class="hourly-list" preset="hourlySlot">
            <li v-for="column in columns" :key="column.key" class="hourly-item">
              <!-- 温度数字贴在曲线点上：超过 21% 的在点上方，贴近带子顶部的翻到点下方，
                   否则最高的那几个数会顶出温度带 -->
              <span class="hourly-temp" :class="{ 'is-below': column.below }"
                :style="{ '--hc-p': column.y }">
                <i></i>
                <b>{{ column.temp }}<span v-if="column.hasTemp" class="hourly-deg">°</span></b>
              </span>
              <span class="hourly-icon-box">
                <i v-if="column.icon" :class="`qi-${column.icon} hourly-icon`" aria-hidden="true"></i>
              </span>
              <!-- 读数行：有降水概率就写概率（主色强调），没有就写风力等级（保持中性）
                   不带小图标 —— 一列只有一行字，纯文本居中才是视觉平衡的 -->
              <span class="hourly-info"
                :class="{ 'is-rain': column.info === 'rain' }">{{ column.infoValue }}<i
                  class="hourly-info-suffix">{{ column.infoSuffix }}</i></span>
              <span class="hourly-time"
                :class="{ 'is-now': column.isNow, 'is-day': column.isNewDay }">{{ column.time }}</span>
            </li>
          </StaggerGroup>
        </div>
      </div>
    </div>

    <!-- 首屏骨架：只在「一条数据都没有」时盖上来，不遮已有曲线 -->
    <div v-if="showSkeleton" class="hourly-skeleton" aria-hidden="true">
      <span v-for="index in 8" :key="index" class="hourly-skeleton-col"></span>
    </div>
    <div v-else-if="showError" class="hourly-empty">
      <p class="hourly-empty-text">逐小时预报获取失败</p>
      <button type="button" class="hourly-retry" @click="emit('retry')">重试</button>
    </div>

    <!-- 图形对读屏软件没有意义：给它一段文字摘要，可视化本身标 aria-hidden -->
    <p class="hourly-summary">{{ summary }}</p>
  </div>
</template>

<script setup>
/* 为什么用 BetterScroll 而不是原生 overflow-x：原生滚动条在壁纸上会露出滚动条 / 回弹，
   而且没有「整列吸附」。BetterScroll 负责拖动与惯性，吸附放在 scrollEnd 里做一次，
   滚轮自己接（一格一列）：滚轮逐像素跟随再被吸附纠正，看起来像抽搐。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import BScroll from '@better-scroll/core'
import StaggerGroup from '@/shared/motion/StaggerGroup'
import StaggerTransition from '@/shared/motion/StaggerTransition'

// eslint-disable-next-line no-undef
const props = defineProps({
  hours: { type: Array, default: () => [] },
  // idle / loading / ready / error —— 只影响骨架与重试的显隐
  status: { type: String, default: 'idle' },
  // 视图是否在前台：后台时容器宽度为 0，这时候建 BetterScroll 会算错内容宽度
  active: { type: Boolean, default: false },
})
// eslint-disable-next-line no-undef
const emit = defineEmits(['retry'])

// 每实例一个渐变色 id：卡片切换时可能同时存在两份，避免 id 撞车
let instanceSeed = 0
const gradientId = `hourly-fill-${instanceSeed++}`

const columnCount = computed(() => Math.max(1, props.hours.length))

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
const round = (value) => Math.round(value * 100) / 100
const tempText = (value) => (toNumber(value) === null ? '—' : Math.round(toNumber(value)))

/**
 * 曲线。值域严格取「这 24 项温度」的最高 / 最低，不留 pad：
 * 卡片上写着的最高温就是曲线的最高点，写多少就画多高 —— 否则用户对着数字和图形对不上。
 * （7 天视图那边留 12%，因为首末列的高低温数字需要呼吸空间。）
 */
const plot = computed(() => {
  const values = props.hours.map((hour) => toNumber(hour.temp)).filter((value) => value !== null)
  if (!values.length) return { linePath: '', areaPath: '', points: [] }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const flat = max === min
  const span = Math.max(1, max - min)
  const n = props.hours.length
  // 画布左右各内缩半列 → 首末列中心正好落在 0 / 700，于是横坐标等距 i/(n-1)
  const axis = (index) => (n > 1 ? index / (n - 1) : 0.5)
  const handle = (700 / Math.max(1, n - 1)) * 0.34

  const points = props.hours.map((hour, index) => {
    const temp = toNumber(hour.temp)
    return {
      x: axis(index) * 700,
      // flat（24 小时一个温度都没变）时压平居中，别贴着带子顶部
      y: temp === null ? null : flat ? 50 : ((max - temp) / span) * 100,
    }
  })
  const valid = points.filter((point) => point.y !== null)
  if (!valid.length) return { linePath: '', areaPath: '', points }

  // 水平控制柄的三次贝塞尔：起伏柔和、端点切线水平、不会过冲
  const segments = valid.slice(1).map((point, index) => {
    const previous = valid[index]
    return `C ${round(previous.x + handle)} ${round(previous.y)}, ${round(point.x - handle)} ${round(point.y)}, ${round(point.x)} ${round(point.y)}`
  }).join(' ')
  const first = valid[0]
  const last = valid[valid.length - 1]
  const linePath = `M ${round(first.x)} ${round(first.y)} ${segments}`.trim()
  const areaPath = `${linePath} L ${round(last.x)} 100 L ${round(first.x)} 100 Z`

  return { linePath, areaPath, points }
})

// 有降水概率就优先写它（阈值 10%：再低就是「不会下雨」的噪声）
const RAIN_MIN = 10

const dateLabel = (date) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''))
  return match ? `${Number(match[2])}月${Number(match[3])}日` : ''
}

const columns = computed(() => props.hours.map((hour, index) => {
  const y = plot.value.points[index]?.y
  const rain = toNumber(hour.precipProb)
  const scale = toNumber(hour.windScale)
  const showRain = rain !== null && rain >= RAIN_MIN
  const showWind = !showRain && scale !== null
  // 跨零点那一格直接写日期：它本身就是分隔标记，不用再加一行「明天」
  const isMidnight = hour.time === '00:00' && index > 0
  return {
    key: hour.ts || `${hour.date}-${hour.time}-${index}`,
    temp: tempText(hour.temp),
    hasTemp: toNumber(hour.temp) !== null,
    y: (y === null || y === undefined ? 50 : y) / 100,
    below: y !== null && y !== undefined && y < 21,
    icon: hour.icon,
    info: showRain ? 'rain' : showWind ? 'wind' : '',
    infoValue: showRain ? `${Math.round(rain)}` : showWind ? `${Math.round(scale)}` : '—',
    // 「%」「级」缩小一档、压淡一点，和温度后面的「°」同一套处理
    infoSuffix: showRain ? '%' : showWind ? '级' : '',
    time: index === 0 ? '现在' : isMidnight ? dateLabel(hour.date) : hour.time,
    isNow: index === 0,
    isNewDay: isMidnight || (index > 0 && !!hour.date && hour.date !== props.hours[index - 1].date),
    isMidnight,
  }
}))

// 跨零点竖线：第一处「时间跳到 00:00」的列号（一天之内只会有一处）
const dividerIndex = computed(() => columns.value.findIndex((column) => column.isMidnight))

const summary = computed(() => {
  if (!columns.value.length) return '逐小时预报暂无数据'
  const temps = props.hours.map((hour) => toNumber(hour.temp)).filter((value) => value !== null)
  const range = temps.length ? `，温度 ${Math.min(...temps)} 到 ${Math.max(...temps)} 度` : ''
  return `未来 ${props.hours.length} 小时逐小时预报${range}`
})

const showSkeleton = computed(() => !props.hours.length && (props.status === 'loading' || props.status === 'idle'))
const showError = computed(() => !props.hours.length && props.status === 'error')

/* ================= 进场：错峰渐入 =================
   这一屏平时是「挂着的、看不见的」：ForecastPanel 用 visibility 藏着另一片视图，
   所以不能在挂载时就演一遍 —— 那一遍发生在用户切过来之前，切过来时只剩空场。
   revealKey 是重播开关：**第一次切到前台**、或数据从无到有，各 +1；
   模板拿它给曲线和 24 列换 key → 组件重挂 → appear 过渡重新播一次。
   （重挂 StaggerGroup 时整组一起卸载，不走 li 的离场过渡，
     所以不会出现「旧的一排还在淡出、新的一排已经占位」的两排并排。）

   ⚠️ 只在「第一次进来」重播，来回切换不重播：两片视图都常驻 DOM（相当于 v-show），
   切回来时它本来就该是「已经在那儿」的样子。若每次 entered 都 +1，
   用户每切一次就要等 1.6s 的画画动画，来回对比 7 天 / 24 小时会很难受。 */
const revealKey = ref(0)
// 挂载时如果本来就是前台（上次停在 24 小时、刷新页面），那次进场是看得见的，算已经演过
const hasRevealed = ref(props.active)

// 曲线换身份用：换了数据（跨小时 / 换城市）就重画一遍
const plotKey = computed(() => props.hours
  .map((hour) => `${hour.date || ''} ${hour.time}:${hour.temp}`)
  .join('|'))

/* ================= 横向滚动 ================= */
const scrollEl = ref(null)
const trackEl = ref(null)
const shiftEl = ref(null)
let scroller = null

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const columnWidth = () => {
  const width = trackEl.value?.clientWidth || 0
  return props.hours.length ? width / props.hours.length : 0
}
const perPage = () => {
  const width = columnWidth()
  if (!width) return 8
  return Math.max(1, Math.round((scrollEl.value?.clientWidth || 0) / width))
}
// 能被吸附的最后一个列号：让末屏正好贴住右边缘，而不是留一段空白
const lastColumn = () => Math.max(0, props.hours.length - perPage())
const currentLeft = () => (scroller ? -scroller.x : scrollEl.value?.scrollLeft || 0)

const scrollToColumn = (index, time = 320) => {
  const width = columnWidth()
  if (!width) return
  const target = Math.min(Math.max(Math.round(index), 0), lastColumn()) * width
  if (scroller) scroller.scrollTo(-target, 0, prefersReducedMotion() ? 0 : time)
  else if (scrollEl.value) scrollEl.value.scrollLeft = target
}

// 松手 / 惯性结束时吸到最近的整列：一屏永远只露出完整的 8 列
const snapToColumn = () => {
  const width = columnWidth()
  if (!width) return
  const index = Math.min(Math.max(Math.round(currentLeft() / width), 0), lastColumn())
  const target = width * index
  if (Math.abs(target - currentLeft()) < 1) return
  if (scroller) scroller.scrollTo(-target, 0, prefersReducedMotion() ? 0 : 240)
  else if (scrollEl.value) scrollEl.value.scrollLeft = target
}

const ensureScroller = () => {
  const element = scrollEl.value
  if (!element || !props.active) return
  // 后台视图宽度是 0，此时建实例会把内容宽度算成 0，之后拖不动
  if (!props.hours.length || !columnWidth()) return
  if (scroller) {
    scroller.refresh()
    return
  }
  try {
    scroller = new BScroll(element, {
      scrollX: true,
      scrollY: false,
      // 拖到两头继续拖：内容跟着走一小段（阻尼），松手弹回。这是 BetterScroll 自带的
      // 橡皮筋，滚轮那条路径它管不到（滚轮是离散的），所以滚轮另有一套 edgeNudge
      bounce: !prefersReducedMotion(),
      bounceTime: 480,
      // 纵向手势让给页面：卡片本身不需要在 24 小时条上再滚一次
      eventPassthrough: 'vertical',
      momentum: !prefersReducedMotion(),
      disableMouse: false,
      disableTouch: false,
      click: false,
    })
    scroller.on('scrollEnd', snapToColumn)
    // 交给 transform 之后原生 overflow 必须收起来，否则是双份滚动
    element.classList.add('is-bscroll')
  } catch (error) {
    console.warn('[逐小时预报] BetterScroll 初始化失败，退回原生滚动', error)
    scroller = null
    enableNativeDrag()
  }
}

/* 兜底拖动：BetterScroll 起不来时至少还能拖（壁纸内核万一不支持 transform 系滚动） */
let nativeDragReady = false
const enableNativeDrag = () => {
  const element = scrollEl.value
  if (!element || nativeDragReady) return
  nativeDragReady = true
  let startX = 0
  let startLeft = 0
  let dragging = false
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    dragging = true
    startX = event.clientX
    startLeft = currentLeft()
    element.classList.add('is-dragging')
    element.setPointerCapture?.(event.pointerId)
  })
  element.addEventListener('pointermove', (event) => {
    if (!dragging) return
    element.scrollLeft = startLeft - (event.clientX - startX)
  })
  const end = (event) => {
    if (!dragging) return
    dragging = false
    element.classList.remove('is-dragging')
    element.releasePointerCapture?.(event.pointerId)
    snapToColumn()
  }
  element.addEventListener('pointerup', end)
  element.addEventListener('pointercancel', end)
}

/* ================= 两头的弹簧 =================
   拖动到头：交给 BetterScroll 的 bounce（连续、跟手）。
   滚轮到头：滚轮是离散的「一格一列」，被 clamp 住时没有任何反馈 —— 用户会以为卡住了，
   所以这里给内容一个冲量、再用欠阻尼弹簧弹回原位（≈12px 的位移，肉眼是「顶了一下」）。
   ⚠️ 位移写在 .hourly-shift 上，不能写在 .hourly-track 上：那是 BetterScroll 的 content，
      它自己往同一个元素上写 transform，两边会互相覆盖。 */
const NUDGE_KICK = 430 // 冲量（px/s），k=260、c=14 时峰值位移约 14px
const NUDGE_STIFFNESS = 260
const NUDGE_DAMPING = 14
const NUDGE_LIMIT = 18 // 再大的冲量也不让它跑出这么多
const NUDGE_SUBSTEP = 1 / 240 // 固定 4ms 子步：60Hz / 144Hz / 掉帧下手感一致

let nudgeFrame = 0
let nudgeOffset = 0
let nudgeVelocity = 0

const stopNudge = () => {
  if (nudgeFrame) cancelAnimationFrame(nudgeFrame)
  nudgeFrame = 0
  nudgeOffset = 0
  nudgeVelocity = 0
  if (shiftEl.value) shiftEl.value.style.transform = ''
}

// direction: +1 = 往「更晚的时间」那头滚（右端），-1 = 左端
const edgeNudge = (direction) => {
  const element = shiftEl.value
  if (!element || prefersReducedMotion()) return
  nudgeOffset = 0
  nudgeVelocity = -direction * NUDGE_KICK // 滚到右端时内容还要再往左推一点
  if (nudgeFrame) cancelAnimationFrame(nudgeFrame)
  let last = 0
  const tick = (now) => {
    // 第一帧 / 掉帧 / 时间戳回退都按 1/60 走：宁可少弹一帧，也不能让弹簧卡在 0 位移上空转
    if (!last) last = now
    let remaining = (now - last) / 1000
    last = now
    if (!(remaining > 0) || remaining > 0.05) remaining = 1 / 60
    while (remaining > 0) {
      const step = Math.min(NUDGE_SUBSTEP, remaining)
      remaining -= step
      nudgeVelocity += (-NUDGE_STIFFNESS * nudgeOffset - NUDGE_DAMPING * nudgeVelocity) * step
      nudgeOffset += nudgeVelocity * step
      if (Math.abs(nudgeOffset) > NUDGE_LIMIT) {
        nudgeOffset = Math.sign(nudgeOffset) * NUDGE_LIMIT
        nudgeVelocity = 0
      }
    }
    // 收敛判据：位移和速度都很小就收尾，否则会一直抖
    if (Math.abs(nudgeOffset) < 0.15 && Math.abs(nudgeVelocity) < 8) {
      stopNudge()
      return
    }
    element.style.transform = `translateX(${nudgeOffset.toFixed(2)}px)`
    nudgeFrame = requestAnimationFrame(tick)
  }
  nudgeFrame = requestAnimationFrame(tick)
}

/* 滚轮：一格一列。逐像素跟随 deltaY 会被吸附反复纠正，看着像抽搐，
   所以这里只取方向、140ms 内不重复响应。横向手势（触控板滑动）直接放行。 */
let wheelLockedAt = 0
const onWheel = (event) => {
  if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
  event.preventDefault()
  const now = Date.now()
  if (now - wheelLockedAt < 140) return
  wheelLockedAt = now
  ensureScroller()
  const width = columnWidth()
  if (!width) return
  const direction = event.deltaY > 0 ? 1 : -1
  const index = Math.round(currentLeft() / width) + direction
  // 已经到头了：滚不动就给一下弹簧，让人知道「到头了」而不是「卡住了」
  if (index > lastColumn() || index < 0) edgeNudge(direction)
  scrollToColumn(index)
}

onMounted(() => {
  scrollEl.value?.addEventListener('wheel', onWheel, { passive: false })
  if (props.active) nextTick(ensureScroller)
})

watch(() => props.active, (active) => {
  if (active) nextTick(ensureScroller)
})

// 重播错峰进场：**第一次**切到前台、或数据从无到有（骨架 → 真数据）各算一次。
// 之后来回切换不再重播 —— 切回 24 小时时数据已经在那儿了，直接显示即可。
watch([() => props.active, () => props.hours.length], ([active, count], [, wasCount]) => {
  if (!active) return
  const filled = count > 0 && wasCount === 0
  if (hasRevealed.value && !filled) return
  hasRevealed.value = true
  revealKey.value += 1
  // 整组重挂之后内容重新排版过一次，让 BetterScroll 重新量一遍（滚动位置不变）
  nextTick(() => scroller?.refresh())
})

// 数据换了一批（跨小时 / 换城市）：尺寸和内容都变了，让滚动容器重新量一次
watch(() => props.hours.length, () => {
  if (!props.active) return
  nextTick(() => {
    if (scroller) scroller.refresh()
    else ensureScroller()
  })
})

onBeforeUnmount(() => {
  scrollEl.value?.removeEventListener('wheel', onWheel)
  stopNudge()
  scroller?.destroy()
  scroller = null
})
</script>

<style scoped>
.hourly {
  position: relative;
  height: 100%;
  color: var(--text-secondary);
}

/* 视口：一屏 8 列。滚动条一律藏掉（壁纸里出现滚动条很脏） */
.hourly-scroll {
  position: absolute;
  inset: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.hourly-scroll::-webkit-scrollbar {
  display: none;
}

.hourly-scroll.is-bscroll {
  overflow: hidden;
  cursor: grab;
}

.hourly-scroll.is-dragging {
  cursor: grabbing;
}

/*
  轨道：宽度 = 8 列一屏 × 3 屏，于是每列就是视口的 1/8（≈84px）。
  纵向节奏（合计 12.5625rem，和 7 天条像素级等高）：
    上下留白 0.875×2 + 曲线 5.8125 + 三段间距 0.5×3 + 图标 1.5 + 读数 1 + 时间 1
  读数行从 0.875 → 1（字号 0.9375rem），差额 0.125 从曲线带里让出来 —— 卡片固定高度、
  右侧这一列零余量，任何一行长高都必须有另一行让位。
  ⚠️ 行高按「真实行盒」给：0.9375rem 的文字 line-height 1 占 10.3px，
     0.8125rem 的文字按 1.2 占 15.6px —— 按字号拍脑袋会让整列高 10px、把卡片顶高。
*/
.hourly-track {
  --hc-pad-y: 0.875rem;
  --hc-band: 5.8125rem;
  --hc-icon: 1.5rem;
  --hc-info: 1rem;
  --hc-time: 1rem;
  --hc-gap: 0.5rem;
  /* 一列宽度：0 间隙，直接等分（--hc-n 由模板按实际条目覆盖） */
  --hc-col: calc(100% / var(--hc-n, 24));
  position: relative;
  width: calc(100% / 8 * var(--hc-n, 24));
  height: 100%;
}

/* 弹簧层：正常状态 transform 为空（不建立新的层，也不吃点击）；
   只有两头的 edgeNudge 会往里写 translateX。 */
.hourly-shift {
  position: relative;
  height: 100%;
  will-change: transform;
}

/* 曲线画布：左右各内缩半列，起终点正好落在首 / 末列中心 */
.hourly-band {
  position: absolute;
  top: var(--hc-pad-y);
  left: calc(var(--hc-col) / 2);
  right: calc(var(--hc-col) / 2);
  height: var(--hc-band);
  z-index: 2;
  color: var(--color-primary);
  pointer-events: none;
}

/* 值域贴边（最高点就在带子顶沿），描边会有一半落在画布外：
   inset(-2px) 把裁切框往外放，别把 1.75px 的线切掉一半。
   绝对定位：换数据 / 重播进场时新旧两份同框，第二份不能再占一次位。 */
.hourly-trend {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  /* 进场＝从左往右把线「画」出来：整张 svg 线性揭示，面积和描边共用同一个前缘。
     三段参数来自 shared/motion/stagger.js 的 hourlyTrend 预设。 */
  clip-path: inset(-2px);
}

.hourly-trend.stagger-enter-from {
  clip-path: inset(-2px 100% -2px -2px);
}

/* 离场只淡掉，不重播「画线」（hourlyTrend 的 opacity=1，这里单独补上淡出） */
.hourly-trend.stagger-leave-to {
  opacity: 0;
}

/* 同 7 天视图：重播时旧曲线只活一帧，让它淡出会先看到一条完整的旧线再消失，
   直接当帧隐藏。 */
.hourly-trend.stagger-leave-active {
  visibility: hidden;
}

.hourly-line {
  fill: none;
  stroke: var(--color-primary);
  stroke-width: 1.75;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.hourly-list {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(var(--hc-n, 24), minmax(0, 1fr));
  margin: 0;
  padding: 0;
  list-style: none;
  height: 100%;
}

.hourly-item {
  position: relative;
  display: grid;
  grid-template-rows:
    var(--hc-band) var(--hc-gap)
    var(--hc-icon) var(--hc-gap)
    var(--hc-info) var(--hc-gap)
    var(--hc-time);
  row-gap: 0;
  align-items: center;
  justify-items: center;
  padding: var(--hc-pad-y) 0;
  min-width: 0;
  cursor: grab;
}

/* 温度点 + 数值：绝对定位到曲线上（--hc-p 是 0~1 的纵向位置） */
.hourly-temp {
  position: absolute;
  top: calc(var(--hc-pad-y) + var(--hc-band) * var(--hc-p, 0.5));
  left: 0;
  width: 100%;
  height: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.hourly-temp i {
  position: absolute;
  top: 0;
  left: 50%;
  width: 0.25rem;
  height: 0.25rem;
  margin: -0.125rem 0 0 -0.125rem;
  border-radius: 50%;
  background: var(--color-primary);
  opacity: 0.5;
}

.hourly-temp b {
  position: absolute;
  left: 50%;
  bottom: 0.375rem;
  transform: translateX(-50%);
  font-weight: inherit;
  white-space: nowrap;
}

.hourly-deg {
  margin-left: 0.03em;
  font-size: 0.64em;
  vertical-align: 0.42em;
  opacity: 0.8;
}

/* 最高点贴着带子顶沿时，数字没有上方空间 → 翻到点的下方 */
.hourly-temp.is-below b {
  bottom: auto;
  top: 0.375rem;
}

.hourly-icon-box {
  grid-row: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: var(--hc-icon);
}

/* 图标与文字同量级（1.5rem），不再是一个压过文字的「大图标」 */
.hourly-icon {
  width: 1.5rem;
  height: 1.5rem;
  fill: currentColor;
  color: var(--text-secondary);
}

/* 读数行：纯文本，居中。
   width: 100% 让居中的参照是整列宽，而不是一个恰好等于内容宽的盒子 ——
   否则内容宽度一变（「2级」vs「100%」），视觉重心就会漂。
   字号 0.9375rem：这一行是整列里唯一的「读数」，比时间标签(0.8125rem)大一档才立得起来；
   原来的 0.75rem 贴着列宽看太小。 */
.hourly-info {
  grid-row: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 降水概率用主色：它是这一列唯一「要不要带伞」的信号，
   和上面曲线的颜色同源；风力等级留在中性色，不抢戏。 */
.hourly-info.is-rain {
  color: var(--color-primary);
}

/* 「%」「级」退一档，别和数字一样重 —— 与温度后面的「°」同一套处理 */
.hourly-info-suffix {
  margin-left: 0.04em;
  font-size: 0.72em;
  font-weight: 500;
  font-style: normal;
  opacity: 0.8;
}

.hourly-time {
  grid-row: 7;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.2;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.hourly-time.is-now {
  color: var(--text-primary);
}

.hourly-time.is-day {
  color: var(--text-secondary);
  letter-spacing: -0.01em;
}

/* 跨零点分隔线：画在「写日期那一格」的左边界，不穿过任何一列的内容 */
.hourly-divider {
  position: absolute;
  top: var(--hc-pad-y);
  z-index: 2;
  width: 1px;
  height: var(--hc-band);
  background: var(--glass-border-strong);
  pointer-events: none;
}

/* ---- 骨架 / 错误态：只盖住「还没有数据」的情况 ---- */
.hourly-skeleton {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  pointer-events: none;
}

.hourly-skeleton-col {
  position: relative;
}

.hourly-skeleton-col::before,
.hourly-skeleton-col::after {
  content: '';
  position: absolute;
  left: 50%;
  border-radius: 0.375rem;
  background: var(--glass-bg-soft);
  transform: translateX(-50%);
}

/* 曲线区 + 下面三行：两块淡色占位足够读出「这里将出现 8 列」 */
.hourly-skeleton-col::before {
  top: 0.875rem;
  width: 62%;
  height: 5.9375rem;
  opacity: 0.55;
}

.hourly-skeleton-col::after {
  bottom: 0.875rem;
  width: 44%;
  height: 3.375rem;
  opacity: 0.35;
}

.hourly-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  text-align: center;
}

.hourly-empty-text {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.hourly-retry {
  appearance: none;
  padding: 0.25rem 0.875rem;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background: var(--glass-bg-soft);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-primary-soft);
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.hourly-retry:hover {
  background: var(--glass-active);
}

/* 读屏用的文字摘要：视觉上不存在 */
.hourly-summary {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
</style>
