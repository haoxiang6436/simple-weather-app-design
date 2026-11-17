<template>
  <div class="weather weather-layer">
    <!-- 卡片外壳常驻，切换的是壳里的内容（动效定义见 style/weather-panel.scss） -->
    <Transition name="panel-in" appear>
     <div v-if="shellVisible" class="weather-shell" :class="{ 'weather-shell-card': panelView === 'weather' }">
        <!-- 这里不用 mode="out-in"：外壳面板切换时 Vue 的 out-in 会卡在"正在离场"
             （isLeaving 复位不了、新面板永不挂载，实测外壳会变成一张空卡，清空内层过渡也一样）。
             改用"离场 + 进场延迟"达到同样的「先出后进」观感 —— 见 src/style/transitions.scss。
             两块面板叠在外壳的同一格里（.weather-shell > * { grid-area: 1/1 }）。 -->
        <Transition name="panel-swap">
          <!-- 新用户引导：没填可用的域名/密钥、或还没选位置时，用引导面板占住天气卡的位置 -->
          <OnboardingPanel v-if="panelView === 'onboarding'" />
          <!-- 设置 / 状态页不在这里：它是一层盖住整张卡的弹窗，挂在 App.vue 上（见 SettingsDialog） -->
          <!-- 地址选择页：日常换城市走这里（与天气卡同尺寸、同层级） -->
          <LocationPicker v-else-if="panelView === 'location'" dismissable @close="closeLocationPicker"
            @selected="closeLocationPicker" />
          <section v-else-if="!WeatherMainIsShow" class="weather-card panel-view">
      <!-- 左侧：当前天气（紧凑） -->
      <StaggerGroup tag="header" class="hero" :class="{ 'hero-warning': WeatherEarlyWarning.length }">
        <div key="top" class="hero-top">
          <button class="location" type="button" :title="locationTitle" @click="openSelectLocationDialog">
            <svg class="location-icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="16"
              height="16" aria-hidden="true">
              <path
                d="M512 938.666667c-53.333333 0-384-257.258667-384-469.333334S299.925333 85.333333 512 85.333333s384 171.925333 384 384-330.666667 469.333333-384 469.333334z m0-352c64.8 0 117.333333-52.533333 117.333333-117.333334s-52.533333-117.333333-117.333333-117.333333-117.333333 52.533333-117.333333 117.333333 52.533333 117.333333 117.333333 117.333334z"
                fill="currentColor"></path>
            </svg>
            <span class="location-name">{{ locationLabel }}</span>
          </button>
          <div class="hero-top-right">
            <WeatherStateIndicator :state="TheWeatherDataIsLoaded"
              :updated-minutes-ago="Number(WeatherDataUpdatedAtATimeComputed)" :err-count="errCount" />
            <button class="api-entry" type="button" title="设置" aria-label="设置" @click="openSettings()">
              <!-- 齿轮：设置入口，比原来的钥匙轮廓更好认，尺寸也放大了一档 -->
              <svg class="api-entry-icon" viewBox="0 0 24 24" aria-hidden="true">
                <g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
                  stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3.1" />
                  <path
                    d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </g>
              </svg>
            </button>
          </div>
        </div>

        <div key="date" class="hero-date">
          <h2 class="date-dayname">{{ dayDateCity.day }}</h2>
          <span class="date-day">{{ dayDateCity.date }}</span>
        </div>

        <div key="now" class="hero-now">
          <i :class="`qi-${nowWeatherData.icon} weather-icon`"></i>
          <div class="now-temp">
            <span class="now-temp-num">{{ nowWeatherData.temp }}</span>
            <span class="now-temp-unit">°C</span>
          </div>
          <!-- 实时空气质量：贴在当前温度右侧、落在温度基线上；没数据时组件自己什么都不渲染 -->
          <AirQualityChip class="hero-aqi" />
        </div>

        <div key="description" class="now-desc">
          <span class="now-desc-text">{{ nowWeatherData.text }}</span>
          <!-- 体感和今日温区合成一行：给下面常驻的分钟级降水胶囊腾出一行高度 -->
          <span class="now-sub">
            <span>体感 {{ nowWeatherData.feelsLike ?? '—' }}°</span>
            <span class="now-sub-sep"></span>
            <span>{{ todayTempRange }}</span>
          </span>
        </div>

        <!-- 分钟级降水 + 天气预警：两颗胶囊归成一组（组内只留 0.5rem）。
             以前它们是 .hero 的两个直接子元素，各自吃一份 1.625rem 的行距，
             看起来像两块互不相干的内容 —— 现在贴成一组，和上下内容的间距不变。 -->
        <div key="chips" class="hero-chips">
          <!-- 分钟级降水：常驻入口，点开看未来两小时的柱状图 -->
          <MinutelyRainChip />

          <WeatherWarningChip v-if="WeatherEarlyWarning.length" :warning="currentWarning"
            :count="WeatherEarlyWarning.length" @open="openWarningDetails" />
        </div>

        <div v-if="displayedIndices.length" key="indices" class="indices">
          <div class="indices-title">生活指数</div>
          <!-- 选择器：4 列 2 行（7 条 → 4+3），图标 + 名称各一行；点哪条下面就讲哪条。
               末行恰好 3 个时拉伸填满整行（.stretch-last），右下角不留缺口 -->
          <div class="indices-picker" :class="{ 'stretch-last': stretchLastRow }">
            <button v-for="idx in displayedIndices" :key="idx.type" type="button" class="index-cell"
              :class="['tone-' + indexTone(idx.category), { active: activeIndexType === idx.type }]"
              :aria-pressed="activeIndexType === idx.type" :title="idx.name"
              @click="selectIndex(idx.type)">
              <span class="index-cell-icon" v-html="indexIcon(idx.type)"></span>
              <span class="index-cell-name">{{ idx.name.replace('指数', '') }}</span>
            </button>
          </div>
          <!-- 聚焦卡：选中指数的分类 + 完整说明（正文固定 3 行高，切换不跳） -->
          <div v-if="activeIndex" class="index-focus" :class="'tone-' + indexTone(activeIndex.category)">
            <!-- mode="out-in"：旧的先走完再让新的进来，两段文字不会同时出现在卡片里 -->
            <Transition name="index-swap" mode="out-in">
              <div :key="activeIndex.type">
                <div class="index-focus-head">
                  <span class="index-focus-icon" v-html="indexIcon(activeIndex.type)"></span>
                  <span class="index-focus-name">{{ activeIndex.name }}</span>
                  <span class="index-focus-sep">·</span>
                  <span class="index-focus-cat">{{ activeIndex.category }}</span>
                </div>
                <p class="index-focus-text">{{ activeIndex.text }}</p>
              </div>
            </Transition>
          </div>
        </div>
      </StaggerGroup>

      <!-- 右侧：选中日详情 + 当日指标 + 7日预报。
           这里不再把整块详情当成一个错峰项：标题、六张指标卡、日出日落行、七日预报
           各走各的进场（指标卡在 StaggerGroup 里逐张浮起，预报列在 ForecastStrip 里逐列落位）。 -->
      <main class="details">
        <StaggerTransition preset="content" :index="0">
          <div class="details-head">
            <div class="details-info">
              <!-- 日期只说一次：左边是预报条选中的那一列（今天 / 明天 / 周二…），
                   这里就是它的全名。不再补「较今日」那种基准小字 ——
                   它挨着日期放会被读成「这一天相对今天」，和日期本身就是同一句话；
                   基准由每枚角标的悬停提示和读屏文案各自说全。 -->
              <span class="details-day">{{ activeDayLabel }}</span>
              <button class="details-quote" type="button" aria-label="点击换一句"
                :aria-busy="hitokotoLoading"
                :title="hitokoto ? (hitokoto + (hitokotoFrom ? ' · ' + hitokotoFrom : '') + '（点击换一句）') : (hitokotoFailed ? '加载失败，点击重试' : '加载一句话')"
                @click="refreshHitokoto()">
                <!-- 有文案就始终显示（刷新时淡化），没有文案才在骨架屏 / 失败提示之间切换 -->
                <span v-if="hitokoto" class="quote-text" :class="{ refreshing: hitokotoLoading }">{{ hitokoto }}</span>
                <span v-else-if="hitokotoFailed" class="quote-text quote-error">句子加载失败，点击重试</span>
                <span v-else class="quote-skeleton"></span>
              </button>
            </div>
            <div class="details-temp">
              <span class="temp-num"><AnimatedNumber :value="activeTempMax" :delay="80" />{{ degree(activeTempMax) }}</span>
              <span class="temp-sep">/</span>
              <span class="temp-num"><AnimatedNumber :value="activeTempMin" :delay="120" />{{ degree(activeTempMin) }}</span>
            </div>
          </div>
        </StaggerTransition>

        <!-- 六张指标卡：数值行两端对齐（数字靠左、角标贴右端）。
             角标全部由 statDeltas.js 算好（选中日 − 今天），这里只负责摆：
             选中「今天」或某一项没有可比数据时，那一项就不出角标。 -->
        <StaggerGroup tag="ul" class="stat-grid" preset="stat">
          <li key="precip" class="stat">
            <span class="stat-icon" v-html="statIcon('precip')"></span>
            <span class="stat-label">降雨量</span>
            <!-- 固定两位小数（0 → 0.00），缺数据仍是「—」；见 AnimatedNumber 组件 -->
            <span class="stat-foot">
              <span class="stat-value"><AnimatedNumber :value="activeDaily?.precip" :decimals="2" :delay="100" /><small> mm</small></span>
              <StatDelta v-if="statDeltas.precip" v-bind="statDeltas.precip" />
            </span>
          </li>
          <li key="humidity" class="stat">
            <span class="stat-icon" v-html="statIcon('humidity')"></span>
            <span class="stat-label">湿度</span>
            <span class="stat-foot">
              <span class="stat-value"><AnimatedNumber :value="activeDaily?.humidity" :delay="160" /><small> %</small></span>
              <StatDelta v-if="statDeltas.humidity" v-bind="statDeltas.humidity" />
            </span>
          </li>
          <li key="wind" class="stat">
            <span class="stat-icon" v-html="statIcon('wind')"></span>
            <span class="stat-label">风向风力</span>
            <!-- 风向文字不动，只有风级滚；区间风级（3-4）原样显示 -->
            <span class="stat-foot">
              <span class="stat-value stat-wind">{{ activeWind.dir }} <AnimatedNumber v-if="activeWind.scale !== null" :value="activeWind.scale" :delay="220" />{{ activeWind.scale === null ? activeWind.text : '' }}级</span>
              <StatDelta v-if="statDeltas.wind" v-bind="statDeltas.wind" />
            </span>
          </li>
          <li key="uv" class="stat">
            <span class="stat-icon" v-html="statIcon('uv')"></span>
            <span class="stat-label">紫外线</span>
            <!-- 与其它指标同字号同色：只显示强度等级，例如「弱」（文字等级不参与数值滚动） -->
            <span class="stat-foot">
              <span class="stat-value stat-uv" :title="activeUv.title">{{ activeUv.text }}</span>
              <StatDelta v-if="statDeltas.uv" v-bind="statDeltas.uv" />
            </span>
          </li>
          <li key="temp" class="stat">
            <span class="stat-icon" v-html="statIcon('temp')"></span>
            <span class="stat-label">平均温度</span>
            <span class="stat-foot">
              <span class="stat-value"><AnimatedNumber :value="activeDaily?.tempAvg" :delay="280" /><small> °C</small></span>
              <StatDelta v-if="statDeltas.temp" v-bind="statDeltas.temp" />
            </span>
          </li>
          <li key="cloud" class="stat">
            <span class="stat-icon" v-html="statIcon('cloud')"></span>
            <span class="stat-label">云量</span>
            <span class="stat-foot">
              <span class="stat-value"><AnimatedNumber :value="activeDaily?.cloud" :delay="340" /><small> %</small></span>
              <StatDelta v-if="statDeltas.cloud" v-bind="statDeltas.cloud" />
            </span>
          </li>
        </StaggerGroup>

        <StaggerTransition preset="sunRow">
          <!-- 日出日落那行右边空着，正好挂「7 天 / 24 小时」切换：
               它必须零高度 —— 右侧这一列实测只剩 7px 余量，多一行就把 7 天条顶出去。 -->
          <div class="sun-row">
            <div class="sun-main">
              <span class="sun-item">日出 <b>{{ activeDaily?.sunrise ?? '—' }}</b></span>
              <span class="sun-sep"></span>
              <span class="sun-item">日落 <b>{{ activeDaily?.sunset ?? '—' }}</b></span>
            </div>
            <div class="sun-right">
              <!-- 署名的要求是「与数据同时可见」：只在 24 小时视图里出现，且不占额外高度 -->
              <span v-if="ForecastView === 'hourly' && hourlyCredit" class="sun-credit">{{ hourlyCredit }}</span>
              <ViewSegmentedControl :model-value="ForecastView" :options="FORECAST_VIEW_OPTIONS"
                :controls="FORECAST_PANE_IDS" @update:model-value="onForecastViewChange" />
            </div>
          </div>
        </StaggerTransition>

        <ForecastPanel key="forecast" :days="forecastDays" :active-date="activeItem"
          :hours="hourlyHours" :status="HourlyStatus" :view="ForecastView"
          @select="activeItem = $event" @retry="onHourlyRetry" />
      </main>
          </section>
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<script setup>
/* 天气卡本体，以及与它同尺寸、同层级的两个面板：引导页、地址选择页（三者的切换见 panelView）。
   设置 / 状态页不在这张表里：它是盖在整张卡上的一层弹窗，挂在 App.vue 上
   （features/onboarding/SettingsDialog.vue），打开时天气卡留在背后，关掉就回到原样。
   （说明放在 script 里而不是 <template> 顶层，避免根节点变成 Fragment —— 见 transitions.scss 的 ⚠️） */
import StaggerGroup from '@/shared/motion/StaggerGroup'
import StaggerTransition from '@/shared/motion/StaggerTransition'
import AnimatedNumber from '@/shared/motion/AnimatedNumber.vue'
import 'qweather-icons/font/qweather-icons.css'
import { onMounted, ref, computed, onUnmounted, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { useWeatherStore } from '@/store/index';
import WeatherStateIndicator from './WeatherStateIndicator.vue'
import LocationPicker from './LocationPicker.vue'
// 地址页的开关提到了模块级：设置页的「位置地图」卡也要能打开它（见 locationPanelState.js）
import { LocationPickerOpen, closeLocationPicker, openLocationPicker } from './locationPanelState'
import MinutelyRainChip from './MinutelyRainChip.vue'
import WeatherWarningChip from './WeatherWarningChip.vue'
import AirQualityChip from './AirQualityChip.vue'
import ForecastPanel from './ForecastPanel.vue'
import ViewSegmentedControl from './ViewSegmentedControl.vue'
import StatDelta from './StatDelta.vue'
import { uvLevel } from './uvScale'
import { buildStatDeltas } from './statDeltas'
import OnboardingPanel from '@/features/onboarding/OnboardingPanel.vue'
import { OnboardingOpen, SettingsOpen, WeatherReady, openSettings } from '@/features/onboarding/onboardingState'
import { WallpaperPropertiesReady, ForecastDays } from '@/features/wallpaper/properties'
import Bus from '@/shared/Bus';
import { BUS_EVENTS, STORAGE_KEYS } from '@/features/wallpaper/constants';
import { useWeatherRefresh } from './useWeatherRefresh';

const WeatherMainIsShow = ref(false)
const weatherStore = useWeatherStore()
const { dayDateCity, FourDayWeatherData, nowWeatherData, WeatherDataUpdatedAtATimeComputed, TheWeatherDataIsLoaded, WeatherEarlyWarning, WeatherIndices, CityAddressLabel, HourlyWeatherData, HourlyStatus, ForecastView } = storeToRefs(weatherStore)
const { getLocationInformation, getWeatherIndices, getHourlyWeatherData, ReviseState, openWarningDetails } = weatherStore
const activeItem = ref('今天')
const activeWeatherDate = computed(() => FourDayWeatherData.value.filter(item => item.fxDate === activeItem.value))

/**
 * 当前选中那一天的展示数据。
 * v1 的每日预报不含气压/能见度，所以指标格里换成它有的「最大阵风」「云量」，
 * 这里直接透传，不再做「今天用实况补位」的拼接。
 */
const activeDaily = computed(() => activeWeatherDate.value[0] || null)

/**
 * 七天里的第一列永远是今天：六张卡上的差值都以它为基准（「相对今天」说的是这一天）。
 * 它和 ActiveDaily 是同一个对象引用，所以下面直接用 === 判断选中的是不是今天 ——
 * 从 fxDate 字符串去比也不保险（预报刷新后仍是同一个 fxDate，但对象已经换了一批）。
 */
const todayDaily = computed(() => FourDayWeatherData.value[0] || null)

/**
 * 预报条实际显示几天：壁纸属性里选 5 / 6 / 7，默认 7。
 * 接口始终只请求一次 7 天，这里只是截断显示 —— 改天数不发请求、也不丢数据，
 * 曲线按实际条数重新等分（列中心 = i / (n - 1)），5 天时每列自然变宽。
 */
const forecastDays = computed(() => FourDayWeatherData.value.slice(0, ForecastDays.value))

/* ---- 24 小时视图 ----
   数据在 store 里按需加载（默认停在 7 天，切过去才发请求）；
   这里只做「取出来」和「切视图时触发一次加载」。失败态由 HourlyStrip 自己画重试按钮。 */
const hourlyHours = computed(() => HourlyWeatherData.value.hours || [])

// 和风要求在展示数据的地方同时署名；接口给了 attributions 就用它，没给就退回固定文案
const hourlyCredit = computed(() => {
  const names = (HourlyWeatherData.value.attributions || []).map((item) => item.name).filter(Boolean)
  return names.length ? `数据来源 ${names.join('、')}` : ''
})

/* 「7 天 / 24 小时」两个标签。
   ⚠️ 天数不能写死：壁纸属性里用户可以选 5 / 6 / 7 天，写死「7 天」在设成 5 天时就是骗人。
   标签跟着实际列数走（forecastDays 已经按属性截断过），切换属性时标签也跟着变。 */
const FORECAST_VIEW_OPTIONS = computed(() => [
  { value: 'daily', label: `${forecastDays.value.length || ForecastDays.value} 天` },
  { value: 'hourly', label: '24 小时' },
])
const FORECAST_PANE_IDS = ['forecast-pane-daily', 'forecast-pane-hourly']

const onForecastViewChange = (view) => {
  ForecastView.value = view
  if (view !== 'hourly') return
  /* 切到 24 小时就等于离开「挑中的某一天」：把选中项复位到第一列（今天）。
     不清的话，用户从「周六」切到 24 小时再切回来，看到的还是周六的高亮，
     而 24 小时面板跟他看的是两回事，回来时应该是最中性的默认状态。 */
  const first = forecastDays.value[0]
  if (first) activeItem.value = first.fxDate
  getHourlyWeatherData().catch(() => {})
}

// 重试：跳过缓存直接拉（true = important）
const onHourlyRetry = () => getHourlyWeatherData(true).catch(() => {})

// 选中的那天不在了才回落到第一列（别的情况一律不动选中项）。
// 两种场景会走到这里：天数调小后选中的那天被截掉；跨过零点后旧的那一列被挤出 7 天窗口。
// 两种都必须回退，否则卡片上的温度和预报条对不上，曲线上的端点也会消失。
const keepActiveDayInRange = () => {
  const list = forecastDays.value
  if (!list.length) return
  if (list.some((item) => item.fxDate === activeItem.value)) return
  activeItem.value = list[0].fxDate
}

watch(forecastDays, keepActiveDayInRange)

/**
 * 紫外线强度等级。
 * 五档表本身在 uvScale.js —— 角标要比的是等级的强弱顺序，不是指数值的差，
 * 两边必须查同一张表，所以那一份挪出去了。
 * 卡片里只显示「弱」这样的强度等级纯文本，字号和颜色跟其它指标一致；
 * 具体指数值放在 title 提示里。
 */
const activeUv = computed(() => {
  const uv = uvLevel(activeDaily.value?.uvIndex)
  if (!uv) return { text: '—', title: '暂无紫外线数据' }
  return {
    text: uv.level,
    title: `紫外线指数 ${uv.index}（${uv.level}）· ${uv.advice}`,
  }
})

/**
 * 风向风力：风向是文字、不能滚动，只有风级能滚。
 * 和风偶尔给区间（如「3-4」），这时整段保持文字展示 —— 不能只动区间里的一个数字。
 */
const activeWind = computed(() => {
  const dir = activeDaily.value?.windDirDay
  const raw = activeDaily.value?.windScaleDay
  const text = raw === null || raw === undefined || raw === '' ? '—' : String(raw)
  return {
    dir: dir || '—',
    text,
    // 只认纯数字；「3-4」这种区间走 text 原样显示
    scale: /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : null,
  }
})

// 地址文案统一由 store 的 CityAddressLabel 给出（点选后是「区县 路名」，
// 例如「黄岩区 中学路」）。以前这里自己拼过一次，结果和「最近」里各写各的，
// 一个显示中学路、一个显示中心路，还丢了「区」字 —— 现在只有一处拼。
const locationLabel = CityAddressLabel
// 悬停给回完整层级 + 坐标：同名区县（北京朝阳 / 长春朝阳）还能对上号
const locationTitle = computed(() => {
  const point = weatherStore.CityAddressPoint
  if (!point) return dayDateCity.value.city
  const coords = `${point.lng}, ${point.lat}`
  const full = `${dayDateCity.value.city} ${point.road || ''}`.trim()
  return `${full}（${coords}）`
})

// 面板视图：引导 → 地址选择 → 天气卡（三者尺寸/层级一致，见 style/weather-panel.scss）。
// 设置页不在这张表里：它是盖在整张卡上的一层弹窗（App.vue → SettingsDialog），
// 打开时天气卡仍留在背后，关掉直接回到原样，中间不用换外壳、也不用重播 panel-swap。
const panelView = computed(() => {
  // 壁纸引擎下发的属性还没补发完成 → 先什么都不显示，避免闪一下引导页
  if (!WallpaperPropertiesReady.value) return 'loading'
  // 引导页优先：凭据没配好、密钥失效、还没选位置时，设置页没有意义
  if (OnboardingOpen.value) return 'onboarding'
  if (LocationPickerOpen.value) return 'location'
  return 'weather'
})

// 卡片外壳是否出现：属性没就绪、或用户关掉了天气卡时，整张卡都不显示
const shellVisible = computed(
  () => panelView.value !== 'loading' && !(panelView.value === 'weather' && WeatherMainIsShow.value)
)

/* 引导页 / 设置页的优先级高于地址页（见上面的 panelView）。它们接手时，地址页的开关必须
   一起关掉 —— 地址页自己的 @close / @selected 只在它还挂着的时候才发得出来：
   一旦被顶掉（运行中请求 401/403 触发 USER_API_INVALID → ForceOpen；或者凭据被改坏 →
   OnboardingOpen），组件先被卸载，这两个事件永远不会来，LocationPickerOpen 就一直是 true。
   等凭据修好、引导页一关，panelView 会按优先级「自己」弹回地址页 —— 用户一下都没点。
   设置页在同样场景下早就被显式关掉了（见 onboardingState 的 USER_API_INVALID 与
   markLocationChosen），地址页漏了这一步。 */
watch([OnboardingOpen, SettingsOpen], ([onboarding, settings]) => {
  if (onboarding || settings) LocationPickerOpen.value = false
})

/* 属性里勾了「隐藏天气面板」（沉浸式雨滴）时，地址页也要跟着收掉。
   现在 shellVisible 只对 panelView === 'weather' 生效，地址页开着时隐藏开关等于失效
   （卡片还赖在屏幕上），等下次显示面板又直接从地址页开始，看着就像它自己又开了。 */
watch(WeatherMainIsShow, (hidden) => {
  if (hidden) LocationPickerOpen.value = false
})

/* 一言（名言）模块：右侧“今天”下方
 *
 * 以前这里有三处会导致空白：
 *   1. 首次请求失败（断网 / 接口 5xx / 返回体没有 hitokoto）后直接 `return`，
 *      hitokoto 一直是空串，骨架屏也跟着消失，只剩一条空的竖线；
 *   2. 手动点击与自动刷新并发时，旧请求的 `req === hitokotoReq` 判定会把
 *      已经成功的结果丢掉（后发请求失败、先发请求成功），界面同样空白；
 *   3. 请求一直不返回（没有超时），骨架屏会永远闪下去。
 * 现在：请求带超时 + 并发合并，成功后落盘；失败时保留上一条，一条都没有才
 * 显示「点击重试」提示，并且按 5 秒（连续失败 5 次后 30 秒）自动重试。
 * 数据有效期 2 小时：首次打开优先用缓存，过期后自动换新。 */
const HITOKOTO_API = 'https://v1.hitokoto.cn/?c=i&c=d&c=a&encode=json&max_length=30'
const HITOKOTO_TTL = 2 * 60 * 60 * 1000 // 一言数据有效期：2 小时
const HITOKOTO_MANUAL_MIN = 5 * 1000 // 手动点击至少间隔 5 秒
const HITOKOTO_TIMEOUT = 8 * 1000 // 单次请求超时，避免骨架屏/旧文案一直挂着
const HITOKOTO_RETRY = 5 * 1000
const HITOKOTO_RETRY_SLOW = 30 * 1000

// 默认值给 null 时 useStorage 会推断成 any（写出 "[object Object]"），
// 所以显式按 JSON 读写；read 自带容错，缓存损坏时只当作没有缓存，不影响组件初始化
const HitokotoCache = useStorage(STORAGE_KEYS.HITOKOTO_CACHE, null, localStorage, {
  flush: 'sync',
  serializer: {
    read: (raw) => {
      try {
        return JSON.parse(raw)
      } catch (error) {
        return null
      }
    },
    write: (value) => JSON.stringify(value),
  },
})

// 读出上一次成功缓存的文案；结构不对（旧版本 / 手改过）就当作没有缓存
const hitokotoCacheValue = (() => {
  const cache = HitokotoCache.value
  if (!cache || typeof cache.text !== 'string') return null
  const text = cache.text.trim()
  const at = Number(cache.at)
  if (!text || !Number.isFinite(at) || at <= 0) return null
  return { text, from: typeof cache.from === 'string' ? cache.from.trim() : '', at }
})()

const hitokoto = ref(hitokotoCacheValue?.text || '')
const hitokotoFrom = ref(hitokotoCacheValue?.from || '')
const hitokotoUpdatedAt = ref(hitokotoCacheValue?.at || 0)
const hitokotoLoading = ref(!hitokotoCacheValue)
const hitokotoFailed = ref(false)
let hitokotoInFlight = false
let hitokotoAbort = null
let hitokotoTimer = null
let hitokotoFailCount = 0
let hitokotoDisposed = false
let lastManualAt = 0

const hitokotoAge = () => (hitokotoUpdatedAt.value > 0 ? Date.now() - hitokotoUpdatedAt.value : Infinity)
// age < 0 说明系统时间被往回调过：当作过期处理，避免一条旧文案被“永久有效”
const hitokotoFresh = () => {
  const age = hitokotoAge()
  return !!hitokoto.value && age >= 0 && age < HITOKOTO_TTL
}

const clearHitokotoTimer = () => {
  if (hitokotoTimer !== null) {
    clearTimeout(hitokotoTimer)
    hitokotoTimer = null
  }
}

// 只保留一个定时器：失败重试、2 小时到期、回到前台后重新校准，都走这里
const scheduleHitokoto = (delay) => {
  if (hitokotoDisposed) return
  clearHitokotoTimer()
  hitokotoTimer = setTimeout(() => {
    hitokotoTimer = null
    fetchHitokoto()
  }, Math.max(0, delay))
}

const fetchHitokoto = async () => {
  // 同一时间只允许一个请求：既不会互相覆盖，也避免用户连点消耗接口
  if (hitokotoDisposed || hitokotoInFlight) return
  hitokotoInFlight = true
  hitokotoLoading.value = true
  clearHitokotoTimer()

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  hitokotoAbort = controller
  const timeout = setTimeout(() => controller?.abort(), HITOKOTO_TIMEOUT)
  try {
    const res = await fetch(HITOKOTO_API, { signal: controller?.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const text = typeof data?.hitokoto === 'string' ? data.hitokoto.trim() : ''
    if (!text) throw new Error('接口返回的一言为空')
    hitokoto.value = text
    hitokotoFrom.value = typeof data.from === 'string' ? data.from.trim() : ''
    hitokotoUpdatedAt.value = Date.now()
    hitokotoFailed.value = false
    hitokotoFailCount = 0
    HitokotoCache.value = {
      text: hitokoto.value,
      from: hitokotoFrom.value,
      at: hitokotoUpdatedAt.value,
    }
    // 从拿到新数据开始计算 2 小时有效期
    scheduleHitokoto(HITOKOTO_TTL)
  } catch (error) {
    // 有旧文案就继续展示旧文案（下面会自动重试），一条都没有才让界面显示失败提示
    hitokotoFailed.value = !hitokoto.value
    hitokotoFailCount += 1
    scheduleHitokoto(hitokotoFailCount > 5 ? HITOKOTO_RETRY_SLOW : HITOKOTO_RETRY)
  } finally {
    clearTimeout(timeout)
    hitokotoInFlight = false
    hitokotoAbort = null
    hitokotoLoading.value = false
  }
}

// 手动换一句：5 秒内忽略重复点击；正在请求时也直接忽略，防止并发
const refreshHitokoto = () => {
  if (hitokotoInFlight) return
  const now = Date.now()
  if (now - lastManualAt < HITOKOTO_MANUAL_MIN) return
  lastManualAt = now
  fetchHitokoto()
}

const handleHitokotoVisibility = () => {
  if (document.hidden || hitokotoDisposed || hitokotoInFlight) return
  // 后台标签页的定时器会被节流/冻结，回到前台先校准一次
  if (hitokotoFresh()) scheduleHitokoto(HITOKOTO_TTL - hitokotoAge())
  else fetchHitokoto()
}

const startHitokotoAuto = () => {
  document.addEventListener('visibilitychange', handleHitokotoVisibility)
  window.addEventListener('online', handleHitokotoVisibility)
  // 首次打开：缓存还在 2 小时有效期内就直接用，到点再换；否则先显示旧文案并立即刷新
  if (hitokotoFresh()) scheduleHitokoto(HITOKOTO_TTL - hitokotoAge())
  else fetchHitokoto()
}

// 预警轮播：多条预警自动切换当前展示的一条
const warningIndex = ref(0)
const currentWarning = computed(() => WeatherEarlyWarning.value[warningIndex.value] ?? WeatherEarlyWarning.value[0])
const ROTATE_INTERVAL = 10000
let rotateWorker = null
const ensureRotateWorker = () => {
  if (rotateWorker || prefersReducedMotion()) return
  const blob = new Blob([`setInterval(function(){postMessage(1)},${ROTATE_INTERVAL})`], {
    type: 'application/javascript'
  })
  rotateWorker = new Worker(URL.createObjectURL(blob))
  rotateWorker.onmessage = () => {
    const len = WeatherEarlyWarning.value.length
    if (len > 1) {
      warningIndex.value = (warningIndex.value + 1) % len
    }
  }
}

// 选中日的标签与温度区间（用于右侧详情头部）
const activeDayLabel = computed(() => activeWeatherDate.value[0]?.fxDate ?? activeItem.value)

/**
 * 六项差值（选中日 − 今天）。纯计算，不缓存：
 * 七天数据一刷新、或者换一天选中，下一次读它就会重算一遍。
 *
 * 选中今天时 buildStatDeltas 直接返回空对象 —— 今天相对今天没有差值可言，
 * 六张卡就一个角标都不出（拿不到选中日、数据还没回来时同样按这个处理：
 * 宁可不显示，也不要在一排「—」旁边挂六个空箭头）。
 * 表头不再补「较今日」：左边预报条已经选中了那一天的列，日期旁边再写一遍等于同义反复，
 * 基准由每枚角标的悬停提示（「比今天低 5 个点」+「今天 97% → 周二 92%」两句）和读屏文案各自说全。
 */
const statDeltas = computed(() => buildStatDeltas(todayDaily.value, activeDaily.value, activeDayLabel.value))
// 首屏占位时温度是「—」，不要拼成「—°」
const degree = (value) => (value === null || value === undefined || value === '—' ? '' : '°')
const activeTempMax = computed(() => activeWeatherDate.value[0]?.tempMax ?? '—')
const activeTempMin = computed(() => activeWeatherDate.value[0]?.tempMin ?? '—')
const todayTempRange = computed(() => {
  const d = FourDayWeatherData.value[0]
  if (!d || d.tempMax === null || d.tempMax === undefined) return '—'
  return `${d.tempMax}° / ${d.tempMin}°`
})



// 生活指数分类 -> 语气色（好/提醒/中性）
const INDEX_WARN = [
  '不宜', '较不宜', '不适宜', '不太适宜', '强', '很强', '易发', '较易发', '极易发',
  '较不舒适', '很不舒适', '极不舒适', '不舒适', '非常不舒适', '很差', '较差',
  '炎热', '寒冷', '冷', '较冷'
]
const INDEX_OK = [
  '适宜', '较适宜', '舒适', '较舒适', '极适宜', '基本适宜', '最弱', '弱', '中等', '少发', '良', '优'
]
const indexTone = (category) => {
  const c = category || ''
  if (INDEX_WARN.includes(c)) return 'warn'
  if (INDEX_OK.includes(c)) return 'ok'
  return 'info'
}

// 线性矢量图标（currentColor，随文字色变化；qweather-icons 仅有天气状况图标，故指标/指数用自带 SVG）
const ICONS = {
  precip: '<path d="M17.4 10.4a4.2 4.2 0 0 0-8.2-1.3 3.6 3.6 0 0 0 .3 7.1h7.1a3.2 3.2 0 0 0 .8-5.8z"/><path d="M9 18.5l-1 1.9M13 18.5l-1 1.9M17 18.5l-1 1.9"/>',
  humidity: '<path d="M12 3.5C8.8 7.6 7.3 10.1 7.3 12.6a4.7 4.7 0 0 0 9.4 0c0-2.5-1.5-5-4.7-9.1z"/><path d="M9 13a3 3 0 0 0 2.5 2.7"/>',
  wind: '<path d="M3.5 8.5h11a2.4 2.4 0 1 0-2.4-2.4M3.5 12.5h15.5M3.5 16.5h9"/>',
  uv: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v1.8M12 19.4v1.8M2.8 12h1.8M19.4 12h1.8M5.5 5.5l1.3 1.3M17.2 17.2l1.3 1.3M18.5 5.5l-1.3 1.3M6.8 17.2l-1.3 1.3"/>',
  temp: '<path d="M12 4.4a1.9 1.9 0 0 1 1.9 1.9v7.2a3.6 3.6 0 1 1-3.8 0V6.3A1.9 1.9 0 0 1 12 4.4z"/><path d="M10.1 9h3.8M10.1 11.9h3.8"/>',
  cloud: '<path d="M17.3 9.2a4.2 4.2 0 0 0-8.1-1.3 3.6 3.6 0 0 0 .3 7.1h7a3.2 3.2 0 0 0 .8-5.8z"/>',
  sport: '<circle cx="15" cy="4.8" r="1.7"/><path d="M9 19.5l2.6-4.7-2.6-1.9 1.6-4 3 1.6 1.4 3.4h3.4"/><path d="M13.8 8.6l1.4 3.3M11.6 14.8l-2.4 4.6"/>',
  wash: '<path d="M5.4 12.8l1.1-3.2A2 2 0 0 1 8.4 8h7.2a2 2 0 0 1 1.9 1.4l1.1 3.4"/><rect x="4.5" y="12.5" width="15" height="3.2" rx="1.2"/><circle cx="7.6" cy="16.4" r="1.3"/><circle cx="16.4" cy="16.4" r="1.3"/><path d="M8 10.6h8"/>',
  dress: '<path d="M9 3.5l2.6 1.4 2.6-1.4 3.8 2.9-2.3 2.4-1.2-.5v8.7H9V8.3l-1.2.5L5.5 6.4 9 3.5z"/>',
  travel: '<rect x="5" y="9" width="14" height="9.5" rx="2"/><path d="M9.5 9V6.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V9"/><path d="M9 13.5h.01M12 13.5h.01M15 13.5h.01"/>',
  comfort: '<path d="M9.5 13.6V5.8a2.5 2.5 0 0 1 5 0v7.8a4 4 0 1 1-5 0z"/><circle cx="12" cy="16" r="1.6"/>',
  flu: '<rect x="9.3" y="4.5" width="5.4" height="15" rx="1.2"/><rect x="4.5" y="9.3" width="15" height="5.4" rx="1.2"/>',
}
const iconSvg = (path) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%">${path}</svg>`
const statIcon = (key) => iconSvg(ICONS[key] || '')
const INDEX_TYPE_ICON = { 1: 'sport', 2: 'wash', 3: 'dress', 5: 'uv', 6: 'travel', 8: 'comfort', 9: 'flu' }
const indexIcon = (type) => iconSvg(ICONS[INDEX_TYPE_ICON[type] || 'uv'])

/* 生活指数：选择器 + 一张带边框的聚焦卡（标题行 + 3 行说明）。
   卡片高度 46.5rem 下，整栏底部约 48px 空白（出现预警 chip 时约 33px）；
   正文固定 3 行高，更长的文字由 line-clamp 截断，切换时高度不跳。 */
// 展示顺序：按「出行 / 健康」分两行 —— 第一行运动 / 洗车 / 旅游 / 舒适度，第二行穿衣 / 紫外线 / 感冒。
// 接口返回顺序不保证稳定，所以按 type 显式排一次；未知 type 排在最后，保留其原有相对顺序。
const INDEX_DISPLAY_ORDER = ['1', '2', '6', '8', '3', '5', '9']
const indexRank = (idx) => {
  const i = INDEX_DISPLAY_ORDER.indexOf(String(idx.type))
  return i === -1 ? INDEX_DISPLAY_ORDER.length : i
}
const displayedIndices = computed(() =>
  WeatherIndices.value
    .map((idx, order) => ({ idx, order }))
    .sort((a, b) => indexRank(a.idx) - indexRank(b.idx) || a.order - b.order)
    .map((item) => item.idx)
)
// 4 列布下末行恰好 3 个才拉伸填满（每个约 80px，和上一行 58px 的差距还能接受）；
// 末行只剩 1~2 个时拉伸会把格子撑到 120px 以上，那两种情况继续走居中
const stretchLastRow = computed(() => displayedIndices.value.length % 4 === 3)

const activeIndexType = ref(null)
const activeIndex = computed(
  () => displayedIndices.value.find((idx) => idx.type === activeIndexType.value) || displayedIndices.value[0] || null
)
// 默认选中「最需要注意」的那条（较不宜 / 强 / 易发…），没有就选第一条
const defaultIndexType = (list) => (list.find((idx) => indexTone(idx.category) === 'warn') || list[0])?.type ?? null
watch(
  WeatherIndices,
  () => {
    const list = displayedIndices.value
    if (!list.length) {
      activeIndexType.value = null
      return
    }
    // 数据刷新后尽量保留用户当前选中的那条，只有它不在新数据里时才重算默认值
    if (!list.some((idx) => idx.type === activeIndexType.value)) {
      activeIndexType.value = defaultIndexType(list)
    }
  },
  { immediate: true }
)

/* 生活指数轮播：动效方向与预警 chip 相反 —— 新的一条从上方渐入、旧的一条向下渐出（见 .index-swap-*）。
   和预警一样用 Worker 计时 —— 壁纸引擎进全屏后页面会被隐藏，页面里的 setInterval 会被节流。 */
const INDEX_ROTATE_INTERVAL = 1000 * 12
let indexRotateWorker = null
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const stopIndexRotate = () => {
  indexRotateWorker?.terminate()
  indexRotateWorker = null
}
const startIndexRotate = () => {
  stopIndexRotate()
  if (prefersReducedMotion()) return
  const blob = new Blob([`setInterval(function(){postMessage(1)},${INDEX_ROTATE_INTERVAL})`], {
    type: 'application/javascript'
  })
  indexRotateWorker = new Worker(URL.createObjectURL(blob))
  indexRotateWorker.onmessage = () => {
    const list = displayedIndices.value
    if (list.length < 2) return
    const current = list.findIndex((idx) => idx.type === activeIndexType.value)
    activeIndexType.value = list[(current + 1) % list.length].type
  }
}
// 手动点某条：立刻切过去，并重新计时 —— 让这条完整停留一个周期再继续轮播
const selectIndex = (type) => {
  activeIndexType.value = type
  startIndexRotate()
}

const { errCount } = useWeatherRefresh({
  refresh: getLocationInformation,
  // 生活指数错峰刷新：主周期固定 3 个请求，与多域名池（3 个域名）对齐
  refreshIndices: getWeatherIndices,
  setState: ReviseState,
  // 引导未完成（没有可用的域名/密钥）时不发任何请求
  enabled: WeatherReady,
  onSuccess: () => {
    // 刷新不能动选中项。这里以前是无条件写回第一列，
    // 于是每 60 秒一次的后台刷新（以及切回标签页触发的那次）都会把用户弹回今天 ——
    // 正在看周六的详情，一分钟不到就自己跳回今天，后几天根本读不完。
    // 现在只沿用上面的回退规则：选中的那天还在预报条上，就停在原地。
    keepActiveDayInRange()
    ReviseState(200)
  },
})
const openSelectLocationDialog = () => {
  openLocationPicker()
}
const handleShowWeatherMain = (val) => {
  WeatherMainIsShow.value = val
}

onMounted(() => {
  Bus.on(BUS_EVENTS.SHOW_WEATHER_MAIN, handleShowWeatherMain)
  ensureRotateWorker()
  startIndexRotate()
  startHitokotoAuto()
})
onUnmounted(() => {
  Bus.off(BUS_EVENTS.SHOW_WEATHER_MAIN, handleShowWeatherMain)
  rotateWorker?.terminate()
  rotateWorker = null
  stopIndexRotate()
  hitokotoDisposed = true
  clearHitokotoTimer()
  document.removeEventListener('visibilitychange', handleHitokotoVisibility)
  window.removeEventListener('online', handleHitokotoVisibility)
  hitokotoAbort?.abort()
  hitokotoAbort = null
})

watch(() => WeatherEarlyWarning.value.length, () => {
  warningIndex.value = 0
  ensureRotateWorker()
})
</script>

<style lang="scss" scoped>
/* 独立 translate 与外壳进出场的 transform 并存，不移动满屏点击层和 Dialog。
   百分比以外壳自身为基准，按实际宽高留出 1rem 边距，缩放 / 改分辨率时自动重算。 */
.weather-shell {
  translate:
    clamp(min(0px, calc(50% - 50vw + 1rem)), var(--weather-offset-x, 0vw), max(0px, calc(50vw - 50% - 1rem)))
    clamp(min(0px, calc(50% - 50vh + 1rem)), var(--weather-offset-y, 0vh), max(0px, calc(50vh - 50% - 1rem)));
}

/* 尺寸全部用 rem：1rem = 设计稿(1920×1080)的 16px，
   html 的 font-size 会随视口等比缩放（见 src/style/index.scss），
   因此卡片在任意分辨率 / 系统缩放下都保持同一观感。1px 描边保留 px。 */
/* 外壳尺寸、玻璃底、投影以及 hover 抬升都由 .weather-shell 提供（见 src/style/weather-panel.scss），
   这里只负责天气卡内部的栅格排版 */
.weather-card {
  display: grid;
  grid-template-columns: minmax(15.625rem, 0.88fr) 1.6fr;
}

/* ================= 左侧：当前天气 ================= */
.hero {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  /* 与右栏同一套呼吸感：右栏 gap 1.625rem / padding 2rem，
     左栏原来是 1.125rem / 2.125rem，明显更挤。卡片加高后把省出来的高度换成间距，
     而不是全部堆在底部（否则左栏会变成「上面一坨、下面一大片空白」）。
     2rem 也是为了给 0.875rem 的分钟级胶囊腾宽度：左栏内容宽多约 12px，
     最长的那句才不容易在胶囊里被省略号截掉。 */
  gap: 1.625rem;
  padding: 2rem;
  background: var(--hero-gradient);
  overflow: hidden;
}

.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--hero-glow);
  pointer-events: none;
}

/* 左栏出现天气预警 chip 时，比没有预警时多占一行（chip 本身 + 一个 gap）。
   卡片加高到 46.5rem 后，正常状态下预警 chip 也能完整放下；
   这里再收紧一档间距，纯粹是给极端情况（chip 文案特别长 / 指数正文 3 行）留安全余量。 */
.hero.hero-warning {
  gap: 1.25rem;
}

.hero.hero-warning .indices {
  margin-top: 0.375rem;
}

.hero.hero-warning .index-cell {
  padding: 0.3125rem 0.25rem;
}

.hero-top {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.hero-top-right {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

/* 设置入口：已能看天气之后，齿轮打开的是「设置 / 状态」页（不是首次引导） */
.api-entry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.125rem;
  height: 2.125rem;
  color: var(--text-muted);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 50%;
  transition: color 0.2s ease, background 0.2s ease;

  &:hover {
    color: var(--text-primary);
    background: var(--glass-border);
  }
}

.api-entry-icon {
  width: 1.1875rem;
  height: 1.1875rem;
  flex: none;
  transition: transform 0.35s ease;
}

.api-entry:hover .api-entry-icon {
  transform: rotate(45deg);
}

.location {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  flex: 0 1 auto;
  min-height: 2.375rem;
  max-width: 100%;
  padding: 0.4375rem 0.8125rem;
  color: var(--text-primary);
  font-size: 1.05rem;
  font-weight: 600;
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.location:hover {
  background: var(--glass-border);
}

.location-icon {
  width: 0.875rem;
  height: 0.875rem;
  flex: none;
  color: var(--color-primary);
}

.location-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-date {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
}

.date-dayname {
  flex: none;
  margin: 0;
  font-size: 1.8rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.15;
  color: var(--text-primary);
}

/* 日期缩成星期旁边的小字：原来它单独占一行（约 21px），左栏因此更挤。
   信息没少，只是从「第二行」变成「标题行里的注解」。 */
.date-day {
  display: block;
  flex: 0 1 auto;
  min-width: 0;
  margin-top: 0;
  overflow: hidden;
  font-size: 0.9rem;
  color: var(--text-muted);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hero-now {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.weather-icon {
  font-size: 5rem;
  line-height: 1;
  color: var(--text-primary);
}

.weather-icon::before {
  font-size: 1em;
}

.now-temp {
  display: flex;
  align-items: baseline;
  line-height: 1;
}

.now-temp-num {
  font-size: 6rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text-primary);
}

.now-temp-unit {
  font-size: 1.5rem;
  font-weight: 600;
  margin-left: 0.25rem;
  color: var(--text-secondary);
}

/* 空气质量胶囊：「下 · 左」—— 底边与温度数字的下沿齐平，横向紧跟 °C（位置对比板里选的那一档）。
   横向只给 margin-right:auto：右边那片余量整块留白，胶囊和温度之间只留 .875rem 的 flex gap，
   读起来是「19°C」的注脚而不是另一块内容。反过来，居中（left/right 都 auto）或靠右（只给
   margin-left:auto）会让胶囊飘到温度行右端、和温度断开联系；而「紧跟温度」这一档同时最省空间：
   余量不足时 auto 外边距本来就归零，负数温度下也是它先站得住。
   纵向 align-self:flex-end 从行底往上量，margin-bottom 决定抬多高 —— 抬高了会浮在数字腰上，
   抬少了又会掉到基线下面。0.7rem 是量出来的「行底 → 数字墨迹下沿」的距离：
   6rem 的数字（line-height:1）里基线在行底往上 0.847rem，Montserrat 的数字到基线下再探
   0.02rem，两者相减即 0.7rem；图谱换 6.65rem 衬线字后是 1.03rem（见 style/index.scss）。 */
.hero-aqi {
  margin-right: auto;
  margin-bottom: 0.7rem;
  align-self: flex-end;
  flex: none;
}

/* 天气文案 + 体感/温区合成一行：省下的这一行高度让给常驻的分钟级降水胶囊，
   否则左栏（预警 + 分钟级 + 生活指数）会顶出卡片下沿 */
.now-desc {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.125rem 0.625rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.now-desc-text {
  font-size: 1.4rem;
  line-height: 1.5;
}

.now-sub {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.88rem;
  font-weight: 400;
  color: var(--text-muted);
}

.now-sub-sep {
  width: 0.25rem;
  height: 0.25rem;
  border-radius: 50%;
  background: var(--text-muted);
}

/* 分钟级降水 + 天气预警：两颗同系列胶囊贴成一组，组内只留 0.5rem。
   它们是 .hero 的 flex 子元素时各占一份行距（1.625rem，有预警时 1.25rem），
   同一块状态信息被拆得像两段；包成一组后组内收紧，组和上下内容的间距保持不变。 */
.hero-chips {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  min-width: 0;
}

/* ================= 右侧：详情 + 指数 + 预报 ================= */
.details {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  /* 1.4375rem 而不是左栏的 1.625rem：右栏这一列本来就顶到卡片底（零余量），
     日照行右边挂了 2rem 高的「7 天 / 24 小时」控件后整行高了 8px，
     从 3 个间隙里各让 3px（共 9px）把它抵回来，还剩 1px 呼吸。
     左栏不受影响，视觉上两栏对不齐也看不出来（不是同一组元素）。 */
  gap: 1.4375rem;
  padding: 2rem;
  background: var(--glass-bg-subtle);
}

.details-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.details-info {
  flex: 1;
  min-width: 0;
}

.details-quote {
  appearance: none;
  width: 100%;
  display: flex;
  align-items: center;
  min-height: 1.55em; /* 固定一行占位，请求期间也占住高度，避免下面卡片跳动 */
  margin: 0.5rem 0 0;
  padding-left: 0.625rem;
  padding-top: 0;
  padding-right: 0;
  padding-bottom: 0;
  font: inherit;
  text-align: left;
  color: inherit;
  background: transparent;
  border: 0;
  border-left: 0.1875rem solid rgba(56, 189, 248, 0.48);
  overflow: hidden;
  cursor: pointer;

  &:hover .quote-text {
    color: var(--text-secondary);
  }
}

.quote-text {
  max-width: 100%;
  font-size: 0.95rem;
  font-style: italic;
  line-height: 1.5;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quote-text.refreshing {
  opacity: 0.5;
}

/* 没有拿到任何文案时的兜底提示：内容始终占位，不会出现空白 */
.quote-text.quote-error {
  font-style: normal;
  opacity: 0.72;
}

.quote-skeleton {
  display: block;
  width: clamp(5rem, 45%, 13.75rem);
  height: 0.95em;
  border-radius: 0.25rem;
  background: linear-gradient(90deg, var(--glass-bg-subtle), var(--glass-bg-soft), var(--glass-bg-subtle));
  background-size: 200% 100%;
  animation: quote-sheen 1.2s ease infinite;
}

@keyframes quote-sheen {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

/* 日期：就是预报条里选中的那一列的全名（今天 / 明天 / 周二…） */
.details-day {
  display: block;
  font-size: 1.9rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.details-temp {
  display: inline-flex;
  align-items: baseline;
  gap: 0.375rem;
  white-space: nowrap;
}

.temp-num {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--text-secondary);
}

.temp-sep {
  font-size: 1.3rem;
  color: var(--text-muted);
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 1rem;
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  transition: border-color 0.2s ease;
}

.stat:hover {
  border-color: var(--glass-border-strong);
}

.stat-icon {
  display: block;
  width: 1.55rem;
  height: 1.55rem;
  color: var(--text-muted);
}

.stat-label {
  font-size: 0.84rem;
  color: var(--text-muted);
}

/* 数值行：数字靠左、角标贴右端（C 方案）。两端对齐比「角标紧跟数字」更稳 ——
   六张卡的字宽各不相同，跟着数字走的话箭头的横向位置会一行一个样，看着像没对齐。
   position: relative 是提示浮层的锚点：浮层从这一行往上长（见 StatDelta.vue），
   改这里之前先看一眼 .tip 的 right / bottom。 */
.stat-foot {
  position: relative;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.stat-value {
  flex: none;
  font-size: 1.9rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.stat-value small {
  font-size: 0.52em;
  font-weight: 500;
  color: var(--text-muted);
  letter-spacing: normal;
}

/* 风向 + 风级整行同字号；8 方位最长的「西北风 12级」也只是贴到卡片内边距，不换行。
   加上角标之后这一卡要多让出约 1.75rem，字号比其它数值降一档 ——
   1.9rem 时那六个字正好吃满整行，角标没有落脚的地方。 */
.stat-wind {
  font-size: 1.72rem;
  white-space: nowrap;
}

/* ===== 紫外线卡 =====
   「弱」这类强度等级走 .stat-value 的默认字号与颜色，不再单独设置字体样式；
   指数值只在 title 提示里，卡片内不折行。 */
.stat-uv {
  white-space: nowrap;
}

.sun-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.sun-main {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
}

/* 右侧：署名 + 视图切换。零高度地挂在同一行上（见模板里的说明） */
.sun-right {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  flex: none;
}

.sun-credit {
  font-size: 0.6875rem;
  color: var(--text-muted);
  opacity: 0.85;
  white-space: nowrap;
}

.sun-item b {
  font-weight: 600;
  color: var(--text-secondary);
}

.sun-sep {
  width: 0.25rem;
  height: 0.25rem;
  border-radius: 50%;
  background: var(--text-muted);
}

/* 生活指数 */
.indices {
  position: relative;
  z-index: 1;
  margin-top: 0.625rem;
}

.indices-title {
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-muted);
}

/* 选择器：4 列 × 2 行（7 条 → 4+3）。图标用语气色，让「较不宜 / 强 / 易发…」
   这些需要注意的条目在缩略状态下也能被一眼看到。
   用 flex 而不是 grid：7 条时最后一行只有 3 个，justify-content 会把它们居中，
   缺口从「右下角」变成左右各半个格子的对称留白；6 条时同样自动居中，不用分情况写死。 */
.indices-picker {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}

.index-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  /* 固定 4 列宽度：3 个 gap 占 1.5rem，剩下的四等分。
     末尾减 0.01px 抵消亚像素误差，避免第 4 个格子被挤到下一行、变成 3 列。 */
  flex: 0 0 calc((100% - 1.5rem) / 4 - 0.01px);
  min-width: 0;
  padding: 0.375rem 0.25rem;
  font-size: 0.72rem;
  color: var(--text-muted);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.index-cell:hover {
  border-color: var(--glass-border-strong);
}

.index-cell.active {
  color: var(--text-primary);
  background: var(--glass-bg-soft);
  border-color: var(--glass-border-strong);
}

.index-cell-icon {
  display: block;
  width: 1.15rem;
  height: 1.15rem;
  color: var(--text-secondary);
}

.index-cell.tone-ok .index-cell-icon {
  color: var(--color-ok);
}

.index-cell.tone-warn .index-cell-icon {
  color: var(--color-warn);
}

.index-cell-name {
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 末行恰好 3 个（7 条时是第 5 个起）→ 拉伸填满整行，右下角不留缺口。
   拉伸后每个约 80px，与上一行的 58px 差距在可接受范围内；不满足条件时保持居中。 */
.indices-picker.stretch-last .index-cell:nth-child(n + 5) {
  flex-grow: 1;
}

/* 聚焦卡：选中指数的分类 + 完整说明。
   正文固定 3 行高（min-height），否则各条文字长短不同，切换时整栏会上下跳。 */
.index-focus {
  /* 内边距提成变量，改一处就够 */
  --focus-pad-x: 0.875rem;
  --focus-pad-y: 0.625rem;
  position: relative;
  margin-top: 0.5rem;
  /* out-in 换条时旧内容已移除、新内容还没插入，中间有一帧是空的：
     兜一个高度（= 内边距 + 标题行 + 3 行正文 ≈ 实测的 84px），
     卡片就不会在换条的一瞬间塌下去 */
  min-height: 7rem;
  padding: var(--focus-pad-y) var(--focus-pad-x);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-left: 0.1875rem solid var(--tone-color, var(--glass-border-strong));
  border-radius: var(--radius-sm);
  /* 轮播时离场的那份会向下滑出，裁掉它才能干净地"从卡片里滑走" */
  overflow: hidden;
  transition: border-left-color 0.2s ease;
}

.index-focus.tone-ok {
  --tone-color: var(--color-ok);
}

.index-focus.tone-warn {
  --tone-color: var(--color-warn);
}

.index-focus-head {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.2;
  color: var(--text-primary);
}

.index-focus-icon {
  display: block;
  flex: none;
  width: 1.15rem;
  height: 1.15rem;
  color: var(--tone-color, var(--text-secondary));
}

.index-focus-sep {
  color: var(--text-muted);
}

.index-focus-cat {
  color: var(--tone-color, var(--text-secondary));
}

.index-focus-text {
  /* 预留 3 行（行高 1.6）：实测最长的一条（洗车，48 字）会折成 3 行，
     只预留 2 行的话卡片会跟着文字长短长高变矮 —— 轮播时每 12 秒抖一次。
     再长的正文由下面的 line-clamp 截断，卡片高度恒定。 */
  min-height: 4.8em;
  margin: 0.375rem 0 0;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 3; /* 兜底：极端长的正文最多 3 行，不会把左栏顶出去 */
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ================= 响应式 ================= */
@media (max-width: 880px) {
  .weather-card {
    grid-template-columns: 1fr;
    max-height: 94vh;
    overflow: auto;
  }

  .hero {
    gap: 1rem;
  }
}

</style>
