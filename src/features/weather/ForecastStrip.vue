<template>
  <div ref="rootEl" class="forecast" role="group" :aria-label="`未来 ${days.length} 天温度趋势`"
    :style="{ '--fc-n': columnCount, '--fc-nm1': axisSpan }">
    <div class="forecast-band" aria-hidden="true">
      <!-- 曲线靠 plotKey 换身份：首次出现、刷新、换城市都走一次同一条进场动画
           （从左到右把线「画」出来），旧的那份在离场里淡掉。
           动效参数只在 shared/motion/stagger.js 里（trend / trendMarker 预设），这里不写 keyframes。 -->
      <StaggerTransition preset="trend">
        <svg :key="`${plotKey}:${revealKey}`" class="forecast-trend" viewBox="0 0 700 100" preserveAspectRatio="none">
          <defs>
            <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="currentColor" stop-opacity="0.32" />
              <stop offset="1" stop-color="currentColor" stop-opacity="0.05" />
            </linearGradient>
          </defs>
          <!-- 填充带 = 每日高低温区间的宽窄，本身就是「温差」信息 -->
          <path v-if="plot.ribbonPath" class="forecast-ribbon" :d="plot.ribbonPath" :fill="`url(#${gradientId})`" />
          <path v-if="plot.highPath" class="forecast-high-line" :d="plot.highPath" />
          <path v-if="plot.lowPath" class="forecast-low-line" :d="plot.lowPath" />
        </svg>
      </StaggerTransition>
      <!-- 选中日：一条贯穿温度带的细导引线 + 高低温两个端点。
           key 和曲线一样拼 plotKey + revealKey：曲线重画时它也跟着重来一次，
           由 trendMarker 预设把入场压到「曲线收笔之后」——线还没画完就先挂一条竖线和两个点，
           看起来像是这两个东西「没有动画、诈一下先出现」（用户报的就是这个）。
           点选另一天时 key 不变，只横移，不重放。 -->
      <StaggerTransition preset="trendMarker">
        <div v-if="activePoint" :key="`${plotKey}:${revealKey}`" class="forecast-marker">
          <span class="forecast-marker-guide"></span>
          <span class="forecast-marker-dot" :style="{ top: `${activePoint.highPercent}%` }"></span>
          <span class="forecast-marker-dot is-low" :style="{ top: `${activePoint.lowPercent}%` }"></span>
        </div>
      </StaggerTransition>
    </div>

    <!-- 选中列的「滑动块」：一整块底色 + 1px 描边，点另一天时整块横移到新列，
         而不是旧列瞬间失去高亮、新列瞬间亮起（那样只是闪一下，读不出「选中项移动了」）。
         拆成两片是因为它们必须待在不同的层：色带（z-index: 2）要压住底色，
         但描边又必须压在色带上面，否则穿过曲线带时那 1px 会被曲线截断。
         两片共用同一套 --fc-col / --fc-gap / --fc-active 几何，位移永远严丝合缝。
         横移本身不再走 CSS transition，改由 anime.js 的弹簧推 --fc-active（见 playSlide）；
         CSS 只负责「列号 → 像素」这一步换算，所以几何依旧只有这一份。
         它们虽然不属于某一列，但进场要和选中列同步：同样走 forecastDay、
         用 activeIndex 对齐那一列的延迟，否则高亮会先亮在一片还没出现的文字上。 -->
    <StaggerTransition preset="forecastDay" :index="activeIndex">
      <div v-if="activeIndex >= 0" :key="revealKey" class="forecast-thumb" aria-hidden="true"></div>
    </StaggerTransition>
    <StaggerTransition preset="forecastDay" :index="activeIndex">
      <div v-if="activeIndex >= 0" :key="revealKey" class="forecast-frame" aria-hidden="true"></div>
    </StaggerTransition>

    <!-- 七列各自进场：TransitionGroup 直接把 li 当作错峰项，ul 本身不做整块淡入，
         否则外层再淡一次，前几列会被「双重透明」压得比后几列更淡。 -->
    <StaggerGroup :key="revealKey" tag="ul" class="forecast-list" preset="forecastDay"
      :style="{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }">
      <li v-for="item in days" :key="item.fxDate">
        <button class="forecast-item" type="button" :class="{ active: item.fxDate === activeDate }"
          :aria-pressed="item.fxDate === activeDate" :aria-label="itemLabel(item)"
          @click="$emit('select', item.fxDate)">
          <span class="forecast-day">{{ item.fxDate }}</span>
          <!-- 固定尺寸的图标盒：不同天气字形的墨迹大小不一样，靠盒子对齐而不是字号。
               没有天气码（占位 / 缺数据）就空着盒子，不画一个假的晴天图标 -->
          <span class="forecast-icon-box">
            <i v-if="item.iconDay" :class="`qi-${item.iconDay} forecast-icon`" aria-hidden="true"></i>
          </span>
          <span class="forecast-high">{{ tempText(item.tempMax) }}<span v-if="hasTemp(item.tempMax)"
              class="forecast-deg">°</span></span>
          <span class="forecast-low">{{ tempText(item.tempMin) }}<span v-if="hasTemp(item.tempMin)"
              class="forecast-deg">°</span></span>
        </button>
      </li>
    </StaggerGroup>
  </div>
</template>

<script setup>
/* 七日预报：7 等分纵列 + 5 条共享基线。曲线只住在中间那条「温度带」里，
   不压字、不压图标，也不改变任何文字的位置；每一列的内容都共用同一条中轴。
   （说明放在 script 里而不是 <template> 顶层，避免根节点变成 Fragment —— 见 transitions.scss 的 ⚠️） */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { animate, spring } from 'animejs'
import StaggerGroup from '@/shared/motion/StaggerGroup'
import StaggerTransition from '@/shared/motion/StaggerTransition'
import { SPRING_PRESETS } from '@/shared/motion/stagger'

// eslint-disable-next-line no-undef
const props = defineProps({
  days: { type: Array, default: () => [] },
  activeDate: { type: String, default: '' },
  // 这一片当前是不是在前台（ForecastPanel 两片视图常驻 DOM，只切 visibility）
  active: { type: Boolean, default: true },
})
// eslint-disable-next-line no-undef
defineEmits(['select'])

const columnCount = computed(() => Math.max(1, props.days.length))

// 每个实例一个渐变色 id：卡片切换时可能同时存在两份，避免 id 撞车
let instanceSeed = 0
const gradientId = `forecast-ribbon-fill-${instanceSeed++}`

// 注意 Number(null) === 0：缺数据必须先拦掉，否则「—」会被当成 0° 画进曲线
const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
const round = (value) => Math.round(value * 100) / 100

// 首屏占位 / 缺某天数据时显示「—」，并且不带度数符号（「—°」既难看又像 0 度）
const hasTemp = (value) => toNumber(value) !== null
const tempText = (value) => (hasTemp(value) ? Math.round(toNumber(value)) : '—')

const itemLabel = (item) => [
  item.fxDate,
  item.textDay,
  hasTemp(item.tempMax) ? `最高 ${tempText(item.tempMax)} 度` : '最高温度暂无',
  hasTemp(item.tempMin) ? `最低 ${tempText(item.tempMin)} 度` : '最低温度暂无',
].filter(Boolean).join('，')

/**
 * 曲线数据。
 * x 用 700 宽的 viewBox（按天数等分，列中心 = (i + 0.5) / n）。
 * y 直接用百分比：温度带高度由 CSS 固定，百分比在任意 rem 缩放下都成立，
 * 也避免 SVG 非等比拉伸把圆点压扁。
 */
const plot = computed(() => {
  const days = props.days
  const values = days
    .flatMap((day) => [toNumber(day.tempMax), toNumber(day.tempMin)])
    .filter((value) => value !== null)
  if (!days.length || !values.length) return { points: [], highPath: '', lowPath: '', ribbonPath: '' }

  const min = Math.min(...values)
  const max = Math.max(...values)
  // 上下各留 12%（至少 1°）：曲线不贴边，高低温数字与各自的端点也只隔一层留白
  const pad = Math.max(1, (max - min) * 0.12)
  const top = max + pad
  const span = Math.max(1, top - (min - pad))
  /**
   * 列中心在曲线画布上的位置。
   * 画布（.forecast-band）左右各收进「半列」，正好等于第一列/最后一列的中心，
   * 所以列中心是等距的 0 … 1，而不是 (i + 0.5) / n —— 列间有 gap 时后者会累计偏出半个间距。
   */
  const axis = (index) => (days.length > 1 ? index / (days.length - 1) : 0.5)
  const handle = (700 / Math.max(1, days.length - 1)) * 0.34

  const points = days
    .map((day, index) => {
      const high = toNumber(day.tempMax)
      const low = toNumber(day.tempMin)
      return {
        date: day.fxDate,
        valid: high !== null && low !== null,
        x: axis(index) * 700,
        xPercent: axis(index) * 100,
        highPercent: high === null ? 0 : ((top - high) / span) * 100,
        lowPercent: low === null ? 0 : ((top - low) / span) * 100,
      }
    })
    .filter((point) => point.valid)
  if (!points.length) return { points, highPath: '', lowPath: '', ribbonPath: '' }

  // 每段用水平控制柄（±handle）连三次贝塞尔：起伏柔和，端点切线水平，不会过冲
  const segments = (list, key, reverse = false) => {
    const ordered = reverse ? [...list].reverse() : list
    const direction = reverse ? -handle : handle
    return ordered.slice(1).map((point, index) => {
      const previous = ordered[index]
      return `C ${round(previous.x + direction)} ${round(previous[key])}, ${round(point.x - direction)} ${round(point[key])}, ${round(point.x)} ${round(point[key])}`
    }).join(' ')
  }
  const head = (point, key) => `M ${round(point.x)} ${round(point[key])}`
  const first = points[0]
  const last = points[points.length - 1]

  const highPath = `${head(first, 'highPercent')} ${segments(points, 'highPercent')}`.trim()
  const lowPath = `${head(first, 'lowPercent')} ${segments(points, 'lowPercent')}`.trim()
  // 高低温之间围成一条闭合色带：上沿正向、下沿反向，两条端线自然收口
  const ribbonPath = points.length > 1
    ? `${highPath} L ${round(last.x)} ${round(last.lowPercent)} ${segments(points, 'lowPercent', true)} Z`
    : ''

  return { points, highPath, lowPath, ribbonPath }
})

const activePoint = computed(
  () => plot.value.points.find((point) => point.date === props.activeDate) || null
)

// 选中描边按列号定位（-1 = 没有选中，不画）
const activeIndex = computed(() => props.days.findIndex((day) => day.fxDate === props.activeDate))
// 列与列之间的「跨度数」：导引线要在画布上等距分布，第 i 列落在 i / (n - 1)。
// 一列的时候没有跨度（除法会除零），退化成 1，导引线就停在起点。
const axisSpan = computed(() => Math.max(1, props.days.length - 1))

/**
 * 曲线内容的指纹：日期 + 高低温，只有「这条曲线真的换了一组数」才重新进场。
 * 首屏占位（全是「—」）→ 真实数据、刷新、换城市都会变；点选另一天、hover 不会变。
 */
const plotKey = computed(
  () => props.days.map((day) => `${day.fxDate}:${day.tempMax}:${day.tempMin}`).join('|')
)

/* ================= 进场重播开关 =================
   这一片在 24 小时视图下是「挂着但看不见」的（ForecastPanel 用 visibility 藏着另一片），
   而首屏那次进场动画发生在用户切过来之前 —— 于是会出现这个 bug：
   从上一次停在「24 小时」的状态刷新页面，再切回 7 天，看到的是一片早就摆好的静态内容，
   一点进场都没有；反过来（停在 7 天刷新、再切到 24 小时）却是正常的，因为那边有 revealKey。

   所以这里也加一个：只在**第一次**切到前台时 +1，模板把它拼进 key，重挂一次重播进场。
   来回切换不重播（演过一次就够）；挂载时如果本来就是前台，那次进场是看得见的，算已经演过。 */
const revealKey = ref(0)
const hasRevealed = ref(props.active)

watch(() => props.active, (active) => {
  if (!active || hasRevealed.value) return
  hasRevealed.value = true
  revealKey.value += 1
})

/* ================= 选中滑动块的横移：交给 anime.js 的 spring =================
   以前这里是 `transition: transform 0.3s cubic-bezier(...)`，值也由 --fc-active 直接给。
   换成弹簧是因为三次贝塞尔只能「冲过去再回来一次」，写不出真正的回弹；
   anime 的 spring() 是阻尼振子求解器，bounce / duration 两档参数就能调出
   「先稍微越过去、再弹回、然后停住」的手感（参数在 shared/motion/stagger.js 的 SPRING_PRESETS）。

   关键决定：JS 推的不是像素，而是「带小数的列号」（--fc-active: 0 … n-1）。
   于是「列号 → 位置」仍然只由 CSS 的 calc 算：滑动块、描边、导引线三片各读同一个变量，
   永远不会算出三种速度；窗口缩放 / 换主题 / 卡片缩放也照旧自动跟着走，
   不需要测元素宽度、不需要 ResizeObserver，也没有累计误差。

   三种情况不弹：
     · 首次挂载：元素一出现就该在选中列上，不是从第 0 列滑过来
     · 换了一组数据（plotKey 变）：新节点出生在新位置，滑过去会像「选错了列」
     · 系统开了「减少动态效果」：直接落位

   ⚠️ --fc-active 只由这里写，不要再写回模板的 :style —— Vue 每次重渲染都会按目标值
   重写一遍，正在推的那一帧就被抹掉，弹簧等于从终点重新起跳。同理，CSS 里也别给
   transform / left 挂 transition，两边一起改同一个属性会互相拖。 */
const rootEl = ref(null)
let slideAnim = null

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// 直接落位（不触发弹簧）
const snapSlide = (index) => {
  if (slideAnim) {
    slideAnim.cancel()
    slideAnim = null
  }
  rootEl.value?.style.setProperty('--fc-active', String(index))
}

// 从「此刻看到的位置」弹到目标列：上一段还没走完就再点一次时，
// 先 cancel 保留当前值，新弹簧会接着这个位置继续推，而不是回到起点重来
const playSlide = (index) => {
  if (!rootEl.value) return
  if (prefersReducedMotion()) {
    snapSlide(index)
    return
  }
  if (slideAnim) slideAnim.cancel()
  slideAnim = animate(rootEl.value, {
    '--fc-active': index,
    ease: spring(SPRING_PRESETS.slide),
    onComplete: () => { slideAnim = null },
  })
}

onMounted(() => snapSlide(Math.max(0, activeIndex.value)))

// flush: 'post' —— 等 DOM 跟到新的 activeDate 之后再动，弹簧的起点才是屏幕上真正的位置
watch(
  () => [plotKey.value, activeIndex.value],
  ([key, index], previous) => {
    // 没有选中列：滑动块不渲染，位置留给下一次出现时的 snapSlide
    if (index < 0) return
    if (!previous || key !== previous[0]) snapSlide(index)
    else playSlide(index)
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  if (slideAnim) slideAnim.cancel()
  slideAnim = null
})
</script>

<style lang="scss" scoped>
/* 一行 7 列、一列 5 条基线。高度全部用 rem，随卡片缩放一起变。
   总高 12.5625rem = 上下内边距 0.75rem×2 + 行 10rem + 间距 1.0625rem。 */
.forecast {
  --fc-day: 1.5rem;
  --fc-icon: 2rem;
  --fc-high: 1.5rem;
  --fc-band: 3.5rem;
  --fc-low: 1.5rem;
  --fc-gap-day: 0.25rem;
  --fc-gap-icon: 0.4375rem;
  --fc-gap-high: 0.1875rem;
  --fc-gap-band: 0.1875rem;
  /* 列间距：每列是一张窄卡，卡与卡之间留出真间隙（0.75rem ≈ 与指标卡同一档的呼吸感）。
     以前是 0（列中心必须与曲线严格重合），现在曲线画布按「半列内缩」重算（见下），
     间隙和曲线对齐两者互不冲突。 */
  --fc-gap: var(--fc-gap-override, 0.75rem);
  /* 一列宽度：(整宽 - 所有间隙) / 列数；--fc-n 由模板按实际天数覆盖 */
  --fc-col: calc((100% - (var(--fc-n, 7) - 1) * var(--fc-gap)) / var(--fc-n, 7));
  /* 每列卡片的底色：默认透明（连成一条趋势带），需要「卡片感」的主题
     可以在外层覆盖 --fc-tile-bg-override，而不用改组件 */
  --fc-tile-bg: var(--fc-tile-bg-override, transparent);
  /* 上下内边距：0.75rem 是左右（0.25rem）的三倍，但视觉上才「对得上」——
     星期 / 最低温那两行自带半行行距，字面离行边本来就有约 0.25rem。
     这 0.75rem 计在色块里面，所以整条预报比上一版高 1rem（不再靠外层留白），不去压字。 */
  --fc-pad-y: 0.75rem;
  /* 三行文字（星期 / 高温 / 低温）共用同一档字号与字重：主次只靠颜色区分。
     行高也就跟着统一，三行才会落在同一条视觉节奏上，而不是一大一小一粗一细。 */
  --fc-text: 1rem;
  --fc-text-weight: 600;
  /* 选中滑动块的底色与描边色。不能直接给列卡加 background/border：
     盒模型会因此缩一圈、把固定的行高顶开，hover 时也跟着变 —— 所以两者都画在
     脱离文档流的浮层上（见 .forecast-thumb / .forecast-frame）。 */
  --fc-active-bg: var(--fc-active-bg-override, var(--glass-active));
  --fc-active-border: var(
    --fc-active-border-override,
    color-mix(in srgb, var(--color-primary) 45%, transparent)
  );
  /* 换天时「跟随变色」的节奏：星期 / 图标 / 高低温、导引线上的两个端点都读它。
     滑动块自己的横移不在这里 —— 那段是 anime.js 的弹簧（SPRING_PRESETS.slide），
     JS 逐帧写 --fc-active，这里不能再给 transform / left 挂 transition，否则两边抢属性。 */
  --fc-slide: 0.3s;
  --fc-slide-ease: cubic-bezier(0.4, 0, 0.2, 1);
  /* 温度带的上沿 = 上下内边距 + 前四行 + 它们之间的三道间距 */
  --fc-band-top: calc(
    var(--fc-pad-y) + var(--fc-day) + var(--fc-gap-day) + var(--fc-icon) + var(--fc-gap-icon) +
      var(--fc-high) + var(--fc-gap-high)
  );
  position: relative;
  color: var(--text-secondary);
}

/* ===== 温度带 ===== */
/* 左右各内缩半列：画布起点/终点正好落在首/末列的中心，
   于是列中心在画布里是等距的 0 … 100%，曲线、端点、导引线都能对上任何天数。 */
.forecast-band {
  position: absolute;
  top: var(--fc-band-top);
  left: calc(var(--fc-col) / 2);
  right: calc(var(--fc-col) / 2);
  height: var(--fc-band);
  z-index: 2; /* 在按钮之上：选中态的浅色底不会盖住曲线 */
  color: var(--color-primary);
  pointer-events: none;
}

/* 滑动块：一列宽、整条预报高，位置 = (列宽 + 列间距) × 选中列号。
   位移走 transform（合成层，不触发布局、不重排文字），所以整块横移时卡片其余部分
   一个像素都不动；translate 的百分比基准正好是元素自身宽度 = 一列宽，
   和 --fc-col 用的是同一把尺子，七列里没有累计误差。
   --fc-active 是「带小数的列号」：平时是整数（哪一列），横移途中是小数（弹簧的中间值），
   由 script 里的 anime.js 逐帧写到根节点上。这里只做「列号 → 位移」的换算，
   所以块、描边、导引线三片的几何永远出自同一行 calc。 */
.forecast-thumb,
.forecast-frame {
  position: absolute;
  top: 0;
  bottom: 0;
  width: var(--fc-col);
  border-radius: 0.625rem;
  transform: translateX(calc((100% + var(--fc-gap)) * var(--fc-active, 0)));
  will-change: transform;
  pointer-events: none;
}

/* 底色：在列内容下面、曲线带下面。绝对定位 + border-box，不占文档流，
   所以给高亮配这么大一块也不会把任何一行顶开。 */
.forecast-thumb {
  z-index: 0;
  background: var(--fc-active-bg);
}

/* 描边：唯一一片浮在曲线带之上的层，穿过色带时是一条连续的线。 */
.forecast-frame {
  z-index: 3;
  border: 1px solid var(--fc-active-border);
}

.forecast-trend {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  /* 进场＝从左往右把线「画」出来：整张 svg 线性揭示，色带和两条线共用同一个前缘
     （曲线沿 x 单调，所以看到的就是「线条从 0 画到 100%」）。
     过渡的三段参数来自 StaggerTransition 的 trend 预设，见 shared/motion/stagger.js。 */
  clip-path: inset(0);
}

.forecast-trend.stagger-enter-from {
  clip-path: inset(0 100% 0 0);
}

/* 交叉淡化期间新旧两份曲线同时存在：离场那份脱离文档流，
   否则第二个 <svg> 会被排到温度带下面（带宽是固定的，只能叠着换） */
.forecast-trend.stagger-leave-active {
  position: absolute;
  inset: 0;
  /* 重播（revealKey 换 key）时旧曲线和新曲线只共存一帧：如果让它按 opacity 淡出，
     那一帧里「已经画完的整条旧曲线」会先被看见，再消失、再从 0 画起——
     用户看到的就是曲线闪了一下。直接当帧隐藏，视觉上等于原地重画。 */
  visibility: hidden;
}

/* 离场只淡掉，不重播「画线」（trend 预设 opacity=1，这里单独补上淡出） */
.forecast-trend.stagger-leave-to {
  opacity: 0;
}

/* 高低温两条边线跟 24 小时的曲线同一个颜色（--color-primary），
   而不是 --text-secondary：深色（夜雨玻璃）主题下那是接近白的颜色，
   会和蓝色的填充带、蓝色端点圆点打架，看着像「曲线漏了主题色」。
   高温线更实、低温线更淡，靠不透明度而非色相区分上下沿。 */
.forecast-high-line,
.forecast-low-line {
  fill: none;
  stroke: var(--color-primary);
  stroke-width: 1.25;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.forecast-high-line {
  opacity: 0.95;
}

.forecast-low-line {
  opacity: 0.5;
}

.forecast-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  /* 导引线在温度带里的位置：温度带左右各内缩半列，带宽正好是 (n-1) 个「列 + 间距」，
     所以第 i 列落在 i / (n - 1) —— 和滑动块读同一个 --fc-active，
     细线和整块因此是同一段弹簧，不会互相「拽」着看。
     （--fc-nm1 = max(1, n - 1)，一列时不做除法） */
  left: calc(var(--fc-active, 0) * 100% / var(--fc-nm1, 6));
  width: 0;
  transform: translateX(-50%);
}

.forecast-marker-guide {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 1px;
  background: linear-gradient(to bottom, transparent, var(--color-primary), transparent);
  opacity: 0.45;
}

/* 和曲线同一条规则：重播时旧端点只活一帧。
   （trendMarker 的 leave 已经是 0，这里再兜一层，避免以后有人把 leave 调回去，
   旧竖线/旧圆点又在新曲线还没画的时候挂在那儿。） */
.forecast-marker.stagger-leave-active {
  visibility: hidden;
}

.forecast-marker-dot {
  position: absolute;
  left: 0;
  width: 0.375rem;
  height: 0.375rem;
  margin: -0.1875rem 0 0 -0.1875rem;
  border-radius: 50%;
  background: var(--color-primary);
  box-shadow: 0 0 0 0.1875rem var(--glass-active);
  /* 端点的纵向位移仍走 CSS：它跟的是「那一列的高低温」（百分比值），
     不是列号，所以不归弹簧管；0.3s 让它在导引线还在横移时就已经落到新温度上，
     读起来是「点跟着线滑过去、同时贴到新的温度」。 */
  transition: top var(--fc-slide) var(--fc-slide-ease);
}

.forecast-marker-dot.is-low {
  opacity: 0.65;
}

/* ===== 列 ===== */
.forecast-list {
  position: relative;
  z-index: 1;
  display: grid;
  /* 列间距与 --fc-col 用同一个变量：卡片之间有真间隙，
     曲线画布的「半列内缩」也据此换算，两者永远同一套几何。 */
  column-gap: var(--fc-gap);
  row-gap: 0;
}

.forecast-list li {
  min-width: 0;
}

/* 九行 = 五行内容 + 四道间距。间距单独成行，各行的间距才能不一样：
   数字贴近曲线带（0.1875rem），图标和数字之间松一点（0.4375rem）。 */
.forecast-item {
  appearance: none;
  position: relative;
  width: 100%;
  height: 100%;
  min-height: calc(
    var(--fc-pad-y) * 2 + var(--fc-day) + var(--fc-icon) + var(--fc-high) + var(--fc-band) +
      var(--fc-low) + var(--fc-gap-day) + var(--fc-gap-icon) + var(--fc-gap-high) + var(--fc-gap-band)
  );
  display: grid;
  grid-template-rows:
    var(--fc-day) var(--fc-gap-day)
    var(--fc-icon) var(--fc-gap-icon)
    var(--fc-high) var(--fc-gap-high)
    var(--fc-band) var(--fc-gap-band)
    var(--fc-low);
  row-gap: 0;
  align-items: center;
  justify-items: center;
  /* 左右各留 0.25rem、上下各留 0.75rem（--fc-pad-y）：内容不贴列边，
     选中色块四边的呼吸感一致，读作一个「按列」的选项卡 */
  padding: var(--fc-pad-y) 0.25rem;
  color: inherit;
  font: inherit;
  background: var(--fc-tile-bg);
  border: 0;
  border-radius: 0.625rem;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.forecast-item:hover {
  background: var(--glass-bg-soft);
}

.forecast-item:hover .forecast-day {
  color: var(--text-primary);
}

/* 选中列这一格不再自己画底色（底色在那块滑动块上），所以 hover 时也别再叠一层
   浅色，否则鼠标划过选中列时滑动块会忽明忽暗。 */
.forecast-item.active:hover {
  background: transparent;
}

/* 选中列的文字/图标只换颜色：四样东西（星期 / 图标 / 高低温）统一换成同一个淡强调色，
   读起来是一个整体；主次交给字号、字重和文字本身的黑白灰，不再叠第二套强调色。
   全程不动字重：粗细一变这一列文字要换字形重新栅格化，壁纸里切换那天会卡一下。 */
.forecast-item.active .forecast-day,
.forecast-item.active .forecast-icon,
.forecast-item.active .forecast-high,
.forecast-item.active .forecast-low {
  color: var(--color-primary-soft);
}

/* 星期：1 行，和高温 / 低温同一档字号、同一档字重（见 --fc-text） */
.forecast-day {
  grid-row: 1;
  max-width: 100%;
  overflow: hidden;
  font-size: var(--fc-text);
  font-weight: var(--fc-text-weight);
  line-height: 1.2;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--text-secondary);
  transition: color var(--fc-slide) var(--fc-slide-ease);
}

/* 图标盒：统一 2rem 高、水平居中。字形本身墨迹大小不同，
   对齐的是盒子而不是「看起来差不多」的字号。 */
.forecast-icon-box {
  grid-row: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: var(--fc-icon);
}

.forecast-icon {
  font-size: 1.75rem;
  line-height: 1;
  color: var(--text-secondary);
  transition: color var(--fc-slide) var(--fc-slide-ease);
}

/* qweather-icons 自带的 -0.125em 基线偏移在弹性盒里会把字形顶偏，这里回正 */
.forecast-icon::before {
  vertical-align: 0;
}

/* 温度：两行都用表格数字，列与列之间不会因为 1 和 7 的宽度差而抖动；
   字号和字重跟星期同一档（--fc-text / 500），高低只靠颜色分主次，
   三行因此共享同一条行高节奏，换字号也不用再算一遍行高。 */
.forecast-high,
.forecast-low {
  display: block;
  font-size: var(--fc-text);
  font-weight: var(--fc-text-weight);
  line-height: 1.2;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  /* 选中态要换色，给个过渡：只重画、不重排 */
  transition: color var(--fc-slide) var(--fc-slide-ease);
}

.forecast-high {
  grid-row: 5;
  color: var(--text-primary);
}

.forecast-low {
  grid-row: 9;
  color: var(--text-secondary);
}

/* 度数符号缩到 0.64em 并抬到数字右上角（不是整行上标），
   避免「°」和数字一样重、也避免它飘得太远像一个小圆点 */
.forecast-deg {
  margin-left: 0.03em;
  font-size: 0.64em;
  font-weight: var(--fc-text-weight);
  vertical-align: 0.42em;
  opacity: 0.8;
}
</style>
