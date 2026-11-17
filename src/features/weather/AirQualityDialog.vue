<template>
  <WeatherDialog class="AqiDialog" :class="[`is-${variant}`, `aqi-tone-${band}`]" :inline="inline"
    :smooth-scroll="!inline" labelledby="AqiDialogTitle" :show-close="false" @close="close" @backdrop-click="close">
    <template #title>
      <div class="AqiHeading">
        <span id="AqiDialogTitle" class="AqiTitle">空气质量</span>
        <span class="AqiMeta">{{ metaText }}</span>
      </div>
    </template>

    <!-- 五块按阅读顺序错峰落位，时序在 script 里的 AQI_ENTER。
         这里是普通 div，不再交给 StaggerGroup：进场改用 anime.js 逐帧写 opacity / transform，
         而不是 CSS transition —— 原因和实测见 dev/stagger-lab.html 的对照样机。 -->
    <div v-if="view" ref="bodyEl" class="AqiBody">
      <!-- 一屏的第一眼：数字 → 等级 → 一句话结论 -->
      <div class="AqiHero">
        <div class="AqiScore">
          <span class="AqiValue">{{ view.display }}</span>
          <span class="AqiLabel" aria-hidden="true">AQI</span>
          <span class="status-chip AqiGrade" :class="`aqi-${band}`">{{ view.grade }}</span>
        </div>
        <p class="AqiEffect">{{ view.effect || `${view.grade}，当前空气质量指数 ${view.display}。` }}</p>
      </div>

      <!-- 国标 0-500 刻度：六段按各自跨度分宽（50/50/50/50/100/200），指针是当前值 -->
      <div class="AqiScale">
        <div class="AqiMeter" role="img" :aria-label="`AQI ${view.display}，处在国标 ${view.grade} 档`">
          <div class="AqiMeterTrack">
            <span v-for="step in scaleBands" :key="step.band" class="AqiMeterSeg"
              :class="`aqi-tone-${step.band}`" :style="{ flexGrow: step.span }"></span>
            <span class="AqiMeterFill" :style="{ width: `${markerPercent}%` }"></span>
          </div>
          <span class="AqiMeterThumb" :style="{ left: `${markerPercent}%` }"></span>
        </div>
        <!-- 光谱版把六个档名当图例，其余两版标数值 -->
        <div class="AqiAxis" :class="{ 'is-names': variant === 'spectrum' }">
          <template v-if="variant === 'spectrum'">
            <span v-for="step in scaleBands" :key="step.band" class="AqiAxisName"
              :class="`aqi-tone-${step.band}`" :style="{ flexGrow: step.span }">{{ step.label }}</span>
          </template>
          <template v-else>
            <span v-for="tick in axisTicks" :key="tick.value" class="AqiAxisTick"
              :style="{ left: `${tick.pos}%` }">{{ tick.value }}</span>
          </template>
        </div>
      </div>

      <!-- 六个污染物：浓度、分指数、以及相对最高分指数的条 -->
      <section v-if="view.pollutants.length" class="AqiSection">
        <div class="AqiRowHead">
          <span class="AqiRowTitle">污染物浓度</span>
          <span class="AqiRowNote">首要污染物 · {{ primaryText }}</span>
        </div>
        <ul class="AqiPollutantGrid">
          <li v-for="item in view.pollutants" :key="item.code" class="AqiPollutant" :class="`aqi-tone-${item.band}`">
            <span class="AqiPCap">
              <span class="AqiPName">{{ item.name }}</span>
              <span class="AqiPSub">AQI {{ item.subAqi }}</span>
            </span>
            <span class="AqiPValue">{{ item.value }}<span class="AqiPUnit">{{ item.unit }}</span></span>
            <span class="AqiPBar"><span class="AqiPBarFill" :style="{ width: `${item.share * 100}%` }"></span></span>
          </li>
        </ul>
      </section>

      <section class="AqiSection">
        <div class="AqiRowHead">
          <span class="AqiRowTitle">健康建议</span>
        </div>
        <div class="AqiAdvice">
          <div class="AqiAdviceRow">
            <span class="AqiAdviceLabel">一般人群</span>
            <span class="AqiAdviceText">{{ view.adviceGeneral || '暂无建议' }}</span>
          </div>
          <div class="AqiAdviceRow">
            <span class="AqiAdviceLabel">敏感人群</span>
            <span class="AqiAdviceText">{{ view.adviceSensitive || view.adviceGeneral || '暂无建议' }}</span>
          </div>
        </div>
      </section>

      <p class="AqiSource">
        <template v-if="view.stations.length">
          <span>监测站 {{ stationText }} · </span>
        </template>
        <span>数据来源：</span><a href="https://www.qweather.com" target="_blank" rel="noopener noreferrer">和风天气</a>
      </p>
    </div>

    <!-- 没有数据（权限 / 覆盖范围 / 网络）：说清原因，别让弹层空着 -->
    <div v-else class="AqiState">
      <p class="AqiStateTitle">这里暂时没有空气质量数据</p>
      <p class="AqiStateText">
        可能是该地区不在覆盖范围、接口凭据没有权限，或刚好取数失败。其它天气数据不受影响，
        稍后会自动重试。
      </p>
    </div>
  </WeatherDialog>
</template>

<script setup>
/* 点温度旁边那颗 AQI 胶囊后展开的空气质量弹层。
   结构和分钟级降水弹层一致：WeatherDialog 外壳 + 标题（地点 / 标准）+ 一屏正文。
   配色由 variant 决定，三档都只用 air-quality.scss 里那组色相，不另造颜色：
     quiet    克制版：只有胶囊和刻度指针染色，其余全是现有中性玻璃
     tinted   沉浸版：整块面板被等级色晕染（顶部光晕 + 细边 + 数字）
     spectrum 数据版：仪表画满国标六色，每根污染条用它自己那一档的颜色

   ⚠️ 这段说明必须留在 script 里，不要挪回 <template> 顶层。
      模板顶层的注释在开发构建里会被保留成真实的注释节点，组件根节点就变成
      「注释 + WeatherDialog」两截 Fragment：外面 App.vue 的 <Transition> 拿不到单根元素，
      进场照样能动（走的是组件 vnode 上的 hooks），离场却被 Vue 直接 removeFragment ——
      弹层瞬间消失，一点渐出都没有。生产构建会剥掉注释，所以这个坑只在 npm run dev 里发作。 */
import { computed, defineEmits, defineProps, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { animate, cubicBezier, stagger } from 'animejs'
import { useWeatherStore } from '@/store/index'
import WeatherDialog from './WeatherDialog.vue'
import { AQI_BANDS, airQualityBand, airQualityGrade, aqiScalePosition, buildAirQualityView } from './airQuality'

const props = defineProps({
  /* 展开用的视图模型（buildAirQualityView 的返回值）；不传就读 store 里缓存的那份响应明细 */
  data: { type: Object, default: null },
  /* quiet | tinted | spectrum —— 三档配色，语义见文件开头的注释。
     默认 tinted（沉浸版）：点开这一屏就是为了知道今天空气好不好，
     让整块面板跟着等级变色比一屏中性玻璃先回答这个问题。 */
  variant: { type: String, default: 'tinted' },
  // 标题下面那行：地点。预览页直接给字符串，正式界面用卡片上同一个地址文案
  place: { type: String, default: '' },
  // dev 对比板：不铺满全屏，面板按容器宽度排版
  inline: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const weatherStore = useWeatherStore()
const { AirQuality, AirQualityDetailsDialog, CityAddressLabel } = storeToRefs(weatherStore)

/* 正式界面：缓存里带着接口响应的明细（api/weather.js 的 detail 字段），
   交给和预览页同一个 buildAirQualityView，所以两边排版、文案口径完全一致。
   standard 用摘要挑好的那个 code，保证弹层和胶囊是同一个数字。
   没有 detail 的是旧缓存（上一版只存了摘要）：下面那段兜底把摘要拼成一份精简视图，
   污染物只剩 PM2.5、没有监测站和敏感人群建议 —— 下一次刷新成功就会自动变成完整版。 */
const view = computed(() => {
  if (props.data) return props.data
  const air = AirQuality.value
  if (!air) return null
  const built = air.detail ? buildAirQualityView(air.detail, { standard: air.standard }) : null
  if (built) return built
  const band = airQualityBand(air)
  return {
    aqi: air.aqi,
    display: String(air.display ?? air.aqi ?? '—'),
    band,
    grade: airQualityGrade(band, air.category),
    standardName: air.standardName,
    primaryPollutant: air.primaryPollutant,
    effect: air.effect,
    adviceGeneral: air.advice,
    adviceSensitive: '',
    pollutants: air.pm25
      ? [{
        code: 'pm2p5',
        name: 'PM 2.5',
        fullName: '细颗粒物（PM2.5）',
        value: air.pm25.value,
        unit: air.pm25.unit,
        subAqi: air.aqi,
        band,
        share: 1,
      }]
      : [],
    stations: [],
  }
})

const band = computed(() => view.value?.band || 1)

const metaText = computed(() => {
  const place = props.place || CityAddressLabel.value || ''
  const standard = view.value?.standardName || ''
  return [place, standard].filter(Boolean).join(' · ')
})

// 国标六段按跨度分宽，和数值刻度是同一套比例
const scaleBands = computed(() => AQI_BANDS.map((step) => ({ ...step, span: step.max - step.min })))
const axisTicks = computed(() => [0, 50, 100, 150, 200, 300, 500]
  .map((value) => ({ value, pos: aqiScalePosition(value) * 100 })))
const markerPercent = computed(() => aqiScalePosition(view.value?.aqi) * 100)

const primaryText = computed(() => {
  const item = view.value
  if (!item) return '—'
  if (item.primaryPollutant) return item.primaryPollutant
  // 国标只在 AQI > 50 时设首要污染物，优 / 良不设，别硬挑一个出来
  return item.aqi > 50 ? '按分指数最高' : '无（AQI ≤ 50 时国标不设）'
})

const stationText = computed(() => view.value?.stations.map((item) => item.name).join(' · ') || '')

const close = () => {
  AirQualityDetailsDialog.value = false
  emit('close')
}

/* ================= 正文五块的进场 =================
   用 anime.js 逐帧写内联 opacity / transform，不用 CSS transition。

   为什么：走 transition 的 opacity 会让这五块在进场期间被提升成合成层，过渡结束那一帧
   层被拆掉、文字重新栅格化（字形要跟着新的取整位置重画），看上去就是「错峰结束时文字
   抖一下」。这一屏正文直接贴在共享的玻璃面板上、底下没有自己的不透明底色，比有底有边
   的卡片明显得多。改成 JS 逐帧写样式就不走那条路 —— 对照样机见 dev/stagger-lab.html，
   同样的参数下 CSS 一侧会抖、anime.js 一侧不抖。

   参数就是原来 aqiBlock 预设那一组：起点 170ms、间距 55ms、时长 380ms、scale 0.985。
   位移仍然不做（原来 travel 就是 0px）：这一屏是 flex 列 + overflow-y，往上/下挪
   会把最后一块顶出滚动区、进场期间闪出滚动条。缩放没有这个问题，它就是原来那条预设里
   和透明度配对的另一半，少了它整段会变成纯淡入、看着发平。
   scale 走内联 transform，和 opacity 是同一条重绘路径；最后一帧恰好等于落定状态，
   所以结束时不会再有「换一张栅格」的那一拍。

   离场不做错峰 —— 弹层整层（遮罩 + 面板）自己会淡出，正文跟着一起走就够了。 */
const bodyEl = ref(null)
const AQI_ENTER = { start: 170, spacing: 55, duration: 380, scale: 0.985 }
const AQI_ENTER_EASE = cubicBezier(0.16, 1, 0.3, 1)
let entrance = null

/* 落定后把逐帧写的内联样式摘掉：opacity 1 / scale 1 本来就是自然状态，所以看不出变化，
   但元素不会永久留着一个 transform —— 进场结束后 DOM 和「从没做过动画」完全一致。 */
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
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (entrance) entrance.revert() // 重播前清掉上一轮的内联样式，别叠加
  const nodes = [...body.children]
  entrance = animate(nodes, {
    opacity: [0, 1],
    scale: [AQI_ENTER.scale, 1],
    duration: AQI_ENTER.duration,
    ease: AQI_ENTER_EASE,
    delay: stagger(AQI_ENTER.spacing, { start: AQI_ENTER.start }),
    onComplete: () => settle(nodes),
  })
}

// 数据可能比组件晚到（view 为空时正文还没渲染），等 DOM 出来再跑。
// played 保证一次打开只跑一遍：之后 store 刷新不会再让正文淡一次。
let played = false
watch(view, async (next) => {
  if (!next || played) return
  await nextTick()
  played = true
  playEntrance()
}, { immediate: true })

const onKeydown = (event) => {
  if (event.key === 'Escape') close()
}
onMounted(() => {
  if (!props.inline) document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  if (entrance) entrance.revert()
})
</script>

<style lang="scss" scoped>
/* 面板高度不在这里管：1.618 是默认比例、内容更高就长高、最高 80vh —— 这套规则在外壳
   WeatherDialog.vue 里统一实现（含本弹层的实测数据）。这里只管「一屏正文」自己的排版。
   这一屏正文原来正好把「宽度 / 1.618」那点高度用满，差不到 2px，所以缩放时最先露出
   滚动条；现在面板会跟着正文长高，正文只在超过 80vh 之后才滚动。 */
.AqiHeading {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.AqiTitle {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-primary);
}

.AqiMeta {
  font-size: 0.8rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 每一块仍然要省着用：行距 0.45rem、底部留白 0.7rem。
   面板高度由外壳负责（WeatherDialog.vue：1.618 只是默认比例、内容更高就长高、80vh 封顶），
   所以多出来的留白不会再被滚动条吃掉；这些数值决定的是「一屏正好落在 1.618 比例上」——
   再松一点，宽屏下弹层就会比设计稿高出一截。 */
.AqiBody {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0.35rem 1rem 0.45rem;
}

/* 正式弹层：滚动交给外壳的 BetterScroll（:smooth-scroll），这里不能再当滚动容器 ——
   height:100% 会让正文和 wrapper 一样高，bs 就量不到可滚的距离、也永远滚不动。 */
.AqiDialog.is-smooth .AqiBody {
  height: auto;
  overflow: visible;
}

/* 这五块的进场由 script 里的 playEntrance() 逐帧写内联 opacity / transform 驱动，
   正文本身不再需要任何 stagger-* 过渡规则（见那里的说明）。 */

/* ================= 第一眼：数字 + 等级 + 结论 ================= */
.AqiHero {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  flex: none;
}

.AqiScore {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
}

.AqiValue {
  font-size: 2.6rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

/* 「AQI」是标签，退半步；数值才是这一屏的主角 */
.AqiLabel {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-muted);
}

/* 等级沿用卡片上那颗胶囊的材质，只是字号放大一档 */
.AqiGrade {
  --chip-height: 1.9rem;
  --chip-pad-y: 0.2rem;
  --chip-pad-x: 0.65rem;
  --chip-font-size: 0.9rem;
  --chip-radius: 999px;
  align-self: center;
  white-space: nowrap;
}

.AqiEffect {
  margin: 0;
  max-width: 34rem;
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--text-secondary);
}

/* ================= 国标刻度 ================= */
.AqiScale {
  display: flex;
  flex-direction: column;
  gap: 0.26rem;
  flex: none;
}

/* 高度只按轨道算；指针比轨道高一截，靠 overflow 可见自然地压在刻度上 */
.AqiMeter {
  position: relative;
  display: flex;
  align-items: center;
  height: 0.45rem;
}

.AqiMeterTrack {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  height: 0.45rem;
  overflow: hidden;
  background: var(--glass-bg-subtle);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  corner-shape: squircle;
}

.AqiMeterSeg {
  height: 100%;
}

/* 段与段之间一条发丝线：六档的边界看得见，但不喧宾夺主 */
.AqiMeterSeg + .AqiMeterSeg {
  box-shadow: inset 1px 0 0 var(--glass-border);
}

.AqiMeterFill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  background: rgb(var(--aqi-hue) / 0.55);
}

/* 指针比轨道高出一截，压在刻度上而不是钻进去 */
.AqiMeterThumb {
  position: absolute;
  top: 50%;
  width: 0.22rem;
  height: 1.1rem;
  border-radius: 999px;
  transform: translate(-50%, -50%);
  background: rgb(var(--aqi-hue));
  box-shadow: 0 0 0.6rem rgb(var(--aqi-hue) / 0.45);
}

.AqiAxis {
  position: relative;
  flex: none;
  height: 0.82rem;
  font-size: 0.7rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.AqiAxisTick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  white-space: nowrap;
}

/* 首尾两个刻度各自贴住两端，不然会被裁掉一半 */
.AqiAxisTick:first-child {
  transform: none;
}

.AqiAxisTick:last-child {
  transform: translateX(-100%);
}

.AqiAxis.is-names {
  display: flex;
  height: auto;
}

.AqiAxisName {
  flex: 1 1 0;
  min-width: 0;
  text-align: center;
  font-size: 0.7rem;
  /* 行高 1.2 而不是数字轴的 1.3：这一行是 auto 高度，压一档刚好和数字轴（0.82rem）齐平，
     不压的话光谱版比另外两版高 1px，一屏就装不下了 */
  line-height: 1.2;
  color: var(--text-muted);
  white-space: nowrap;
}

/* ================= 分区小标题 ================= */
.AqiSection {
  flex: none;
}

.AqiRowHead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.26rem;
}

.AqiRowTitle {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.AqiRowNote {
  font-size: 0.74rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ================= 污染物 ================= */
.AqiPollutantGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.AqiPollutant {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.3rem 0.5rem 0.32rem;
  background: var(--glass-bg-subtle);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  corner-shape: squircle;
}

.AqiPCap {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.3rem;
}

.AqiPName {
  font-size: 0.78rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.AqiPSub {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.AqiPValue {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.AqiPUnit {
  margin-left: 0.2rem;
  font-size: 0.68rem;
  font-weight: 500;
  color: var(--text-muted);
}

.AqiPBar {
  display: block;
  height: 3px;
  overflow: hidden;
  background: var(--glass-bg-soft);
  border-radius: 999px;
}

.AqiPBarFill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--glass-border-strong);
}

/* ================= 健康建议 =================
   整行铺满、两行叠放，而不是左右两张卡片：
   接口给的建议是整句 —— 第 3 档「轻度污染」起就有 38 个字（「儿童、老年人及心脏病、
   呼吸系统疾病患者应减少长时间、高强度的户外锻炼，一般人群适量减少户外运动。」）。
   一分为二的话每条要折成两行，两条就是四行，正好把一屏撑破（可以拿预览页的
   「中度污染」样本复现）；整行宽度下同一句话一行就放下了，标签在左、文字在右。
   万一遇到更长的整句（境外标准的完整表述）会折到两行 —— body 本身可滚动，不会丢内容。 */
.AqiAdvice {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.AqiAdviceRow {
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
  padding: 0.28rem 0.55rem;
  background: var(--glass-bg-subtle);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  corner-shape: squircle;
}

/* 标签定宽：「一般人群」「敏感人群」都是四个字，定宽后两行的正文从同一个 x 起排，
   看起来是一张两行的表，而不是两个各自首行缩进不一样的块 */
.AqiAdviceLabel {
  flex: none;
  width: 3.4rem;
  font-size: 0.74rem;
  color: var(--text-muted);
}

.AqiAdviceText {
  min-width: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--text-secondary);
}

/* ================= 来源 ================= */
.AqiSource {
  flex: none;
  margin: 0;
  font-size: 0.74rem;
  line-height: 1.5;
  color: var(--text-muted);

  a {
    color: var(--text-secondary);
    text-decoration: none;
    border-bottom: 1px solid var(--glass-border-strong);
  }

  a:hover {
    color: var(--text-primary);
  }
}

/* ================= 无数据 ================= */
.AqiState {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.5rem 1rem 0.5rem;
}

.AqiStateTitle {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
}

.AqiStateText {
  margin: 0;
  max-width: 32rem;
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

/* ================= 配色一：克制版 =================
   颜色只出现在胶囊和指针上；刻度、条形都还是卡片本来那套中性玻璃。 */
.is-quiet .AqiPBarFill {
  background: var(--glass-border-strong);
}

/* ================= 配色二：沉浸版 =================
   面板顶部一层等级色光晕 + 同色细边，数字本身也染色 —— 不点开就知道好坏。
   光晕用 background-image 叠在面板原来的底色上，不替换材质。 */
.is-tinted :deep(.WeatherDialogPanel) {
  background-image: radial-gradient(115% 85% at 10% -12%, rgb(var(--aqi-hue) / 0.28), transparent 62%);
  border-color: rgb(var(--aqi-hue) / 0.3);
}

.is-tinted .AqiValue {
  color: rgb(var(--aqi-hue));
}

.is-tinted .AqiLabel {
  color: rgb(var(--aqi-hue) / 0.72);
}

.is-tinted .AqiMeterFill {
  background: rgb(var(--aqi-hue) / 0.85);
}

.is-tinted .AqiPBarFill {
  background: rgb(var(--aqi-hue) / 0.72);
}

.is-tinted .AqiPSub {
  color: rgb(var(--aqi-hue) / 0.85);
}

/* ================= 配色三：光谱版 =================
   面板保持中性，刻度是完整的国标六色 + 六个档名（就是图例），
   每根污染条用它自己那一档的颜色 —— 这一版是给人「读分档」的。 */
.is-spectrum .AqiMeterSeg {
  background: rgb(var(--aqi-hue) / 0.62);
}

.is-spectrum .AqiMeterFill {
  display: none;
}

.is-spectrum .AqiMeterThumb {
  background: var(--tip-text);
  box-shadow: 0 0 0 2px rgb(var(--aqi-hue) / 0.9), 0 0 0.75rem rgb(var(--aqi-hue) / 0.5);
}

.is-spectrum .AqiAxisName {
  color: rgb(var(--aqi-hue) / 0.92);
}

.is-spectrum .AqiPBarFill {
  background: rgb(var(--aqi-hue) / 0.72);
}

/* 高度紧张时优先压缩留白，保证来源那行仍在弹层内 */
@media (max-height: 760px) {
  .AqiBody {
    gap: 0.4rem;
    padding-bottom: 0.6rem;
  }

  .AqiValue {
    font-size: 2.35rem;
  }

  .AqiPollutant {
    padding: 0.28rem 0.45rem 0.3rem;
  }

  .AqiPValue {
    font-size: 0.95rem;
  }
}

@media (max-width: 560px) {
  .AqiBody {
    padding-right: 0.75rem;
    padding-left: 0.75rem;
  }

  .AqiAdvice {
    grid-template-columns: minmax(0, 1fr);
  }

  .AqiPollutantGrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
