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
          <!-- 地址选择页：日常换城市走这里（与天气卡同尺寸、同层级） -->
          <LocationPicker v-else-if="panelView === 'location'" dismissable @close="LocationPickerOpen = false"
            @selected="LocationPickerOpen = false" />
          <section v-else-if="!WeatherMainIsShow" class="weather-card panel-view">
      <!-- 左侧：当前天气（紧凑） -->
      <header class="hero" :class="{ 'hero-warning': WeatherEarlyWarning.length }">
        <div class="hero-top">
          <button class="location" type="button" :title="dayDateCity.city" @click="openSelectLocationDialog">
            <svg class="location-icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="16"
              height="16" aria-hidden="true">
              <path
                d="M512 938.666667c-53.333333 0-384-257.258667-384-469.333334S299.925333 85.333333 512 85.333333s384 171.925333 384 384-330.666667 469.333333-384 469.333334z m0-352c64.8 0 117.333333-52.533333 117.333333-117.333334s-52.533333-117.333333-117.333333-117.333333-117.333333 52.533333-117.333333 117.333333 52.533333 117.333333 117.333333 117.333334z"
                fill="currentColor"></path>
            </svg>
            <span class="location-name">{{ dayDateCity.city }}</span>
          </button>
          <div class="hero-top-right">
            <WeatherStateIndicator :state="TheWeatherDataIsLoaded"
              :updated-minutes-ago="Number(WeatherDataUpdatedAtATimeComputed)" :err-count="errCount" />
            <button class="api-entry" type="button" title="域名与密钥设置" @click="openOnboarding()">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M14.5 9.5a3.5 3.5 0 1 0-3.2 3.49l-1.3 1.3v1.9H8.1v1.9H6.2v-1.9l4.9-4.9a3.5 3.5 0 0 1 3.4-1.79z" />
              </svg>
            </button>
          </div>
        </div>

        <div class="hero-date">
          <h2 class="date-dayname">{{ dayDateCity.day }}</h2>
          <span class="date-day">{{ dayDateCity.date }}</span>
        </div>

        <div class="hero-now">
          <i :class="`qi-${nowWeatherData.icon} weather-icon`"></i>
          <div class="now-temp">
            <span class="now-temp-num">{{ nowWeatherData.temp }}</span>
            <span class="now-temp-unit">°C</span>
          </div>
        </div>

        <div class="now-desc">{{ nowWeatherData.text }}</div>
        <div class="now-sub">
          <span>体感 {{ nowWeatherData.feelsLike ?? '—' }}°</span>
          <span class="now-sub-sep"></span>
          <span>{{ todayTempRange }}</span>
        </div>

        <button v-if="WeatherEarlyWarning.length" class="early-chip" type="button"
          :class="'sev-' + severityKey(currentWarning.level)" @click="EarlyWarningDetailsDialog = true">
          <Transition name="chip-fade" mode="out-in">
            <span class="early-chip-main" :key="warningIndex">
              <svg class="early-chip-icon" aria-hidden="true">
                <use :xlink:href="WeatherEarlyWarningLevel(currentWarning.level)"></use>
              </svg>
              <span class="early-chip-text">{{ currentWarning.typeName }}{{ currentWarning.level }}预警</span>
            </span>
          </Transition>
          <span v-if="WeatherEarlyWarning.length > 1" class="early-count">×{{ WeatherEarlyWarning.length }}</span>
        </button>

        <div v-if="displayedIndices.length" class="indices">
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
          <!-- 聚焦卡：选中指数的分类 + 完整说明（正文固定 2 行高，切换不跳） -->
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
      </header>

      <!-- 右侧：选中日详情 + 生活指数 + 4日预报 -->
      <main class="details">
        <div class="details-head">
          <div class="details-info">
            <span class="details-day">{{ activeDayLabel }}</span>
            <div class="details-quote" role="button" tabindex="0" aria-label="点击换一句"
              :title="hitokoto ? (hitokoto + (hitokotoFrom ? ' · ' + hitokotoFrom : '') + '（点击换一句）') : '加载一句话'"
              @click="refreshHitokoto()" @keydown.enter="refreshHitokoto()" @keydown.space.prevent="refreshHitokoto()">
              <span v-if="hitokotoLoading && !hitokoto" class="quote-skeleton"></span>
              <span v-else-if="hitokoto" class="quote-text" :class="{ refreshing: hitokotoLoading }">{{ hitokoto }}</span>
            </div>
          </div>
          <div class="details-temp">
            <span class="temp-num">{{ activeTempMax }}°</span>
            <span class="temp-sep">/</span>
            <span class="temp-num">{{ activeTempMin }}°</span>
          </div>
        </div>

        <ul class="stat-grid">
          <li class="stat">
            <span class="stat-icon" v-html="statIcon('precip')"></span>
            <span class="stat-label">降雨量</span>
            <span class="stat-value">{{ activeWeatherDate[0]?.precip ?? '—' }}<small> mm</small></span>
          </li>
          <li class="stat">
            <span class="stat-icon" v-html="statIcon('humidity')"></span>
            <span class="stat-label">湿度</span>
            <span class="stat-value">{{ activeWeatherDate[0]?.humidity ?? '—' }}<small> %</small></span>
          </li>
          <li class="stat">
            <span class="stat-icon" v-html="statIcon('wind')"></span>
            <span class="stat-label">风速</span>
            <span class="stat-value">{{ activeWeatherDate[0]?.windSpeedDay ?? '—' }}<small> km/h</small></span>
          </li>
          <li class="stat">
            <span class="stat-icon" v-html="statIcon('uv')"></span>
            <span class="stat-label">紫外线</span>
            <span class="stat-value">{{ activeWeatherDate[0]?.uvIndex ?? '—' }}</span>
          </li>
          <li class="stat">
            <span class="stat-icon" v-html="statIcon('pressure')"></span>
            <span class="stat-label">气压</span>
            <span class="stat-value">{{ activeWeatherDate[0]?.pressure ?? '—' }}<small> hPa</small></span>
          </li>
          <li class="stat">
            <span class="stat-icon" v-html="statIcon('vis')"></span>
            <span class="stat-label">能见度</span>
            <span class="stat-value">{{ activeWeatherDate[0]?.vis ?? '—' }}<small> km</small></span>
          </li>
        </ul>

        <div class="sun-row">
          <span class="sun-item">日出 <b>{{ activeWeatherDate[0]?.sunrise ?? '—' }}</b></span>
          <span class="sun-sep"></span>
          <span class="sun-item">日落 <b>{{ activeWeatherDate[0]?.sunset ?? '—' }}</b></span>
        </div>

        <ul class="forecast-list">
          <li v-for="item in FourDayWeatherData" :key="item.fxDate" role="button" tabindex="0"
            :class="{ active: activeItem === item.fxDate }" @click="activeItem = item.fxDate"
            @keydown.enter="activeItem = item.fxDate" @keydown.space.prevent="activeItem = item.fxDate">
            <span class="forecast-day">{{ item.fxDate }}</span>
            <i :class="`qi-${item.iconDay}`"></i>
            <span class="forecast-temp"><b>{{ item.tempMax }}</b>/{{ item.tempMin }}°</span>
          </li>
        </ul>
        </main>
          </section>
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import 'qweather-icons/font/qweather-icons.css'
import { onMounted, ref, computed, onUnmounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useWeatherStore } from '@/store/index';
import WeatherStateIndicator from './WeatherStateIndicator.vue'
import LocationPicker from './LocationPicker.vue'
import OnboardingPanel from '@/features/onboarding/OnboardingPanel.vue'
import { OnboardingOpen, WeatherReady, openOnboarding } from '@/features/onboarding/onboardingState'
import { WallpaperPropertiesReady } from '@/features/wallpaper/properties'
import Bus from '@/shared/Bus';
import { BUS_EVENTS } from '@/features/wallpaper/constants';
import { useWeatherRefresh } from './useWeatherRefresh';

const WeatherMainIsShow = ref(false)
const weatherStore = useWeatherStore()
const { dayDateCity, FourDayWeatherData, nowWeatherData, WeatherDataUpdatedAtATimeComputed, TheWeatherDataIsLoaded, WeatherEarlyWarning, WeatherIndices, EarlyWarningDetailsDialog } = storeToRefs(weatherStore)
const { getLocationInformation, getWeatherIndices, ReviseState } = weatherStore
const activeItem = ref('今天')
const activeWeatherDate = computed(() => FourDayWeatherData.value.filter(item => item.fxDate === activeItem.value))

// 面板视图：引导 → 地址选择 → 天气卡（三者尺寸/层级一致，见 style/weather-panel.scss）
const LocationPickerOpen = ref(false)
const panelView = computed(() => {
  // 壁纸引擎下发的属性还没补发完成 → 先什么都不显示，避免闪一下引导页
  if (!WallpaperPropertiesReady.value) return 'loading'
  if (OnboardingOpen.value) return 'onboarding'
  if (LocationPickerOpen.value) return 'location'
  return 'weather'
})

// 卡片外壳是否出现：属性没就绪、或用户关掉了天气卡时，整张卡都不显示
const shellVisible = computed(
  () => panelView.value !== 'loading' && !(panelView.value === 'weather' && WeatherMainIsShow.value)
)

// 一言（名言）模块：右侧“今天”下方
const hitokoto = ref('')
const hitokotoFrom = ref('')
const hitokotoLoading = ref(true)
let hitokotoReq = 0
const HITOKOTO_MANUAL_MIN = 5 * 1000 // 手动点击至少间隔 5 秒
const HITOKOTO_AUTO_INTERVAL = 12 * 60 * 60 * 1000 // 自动刷新每 12 小时
let lastManualAt = 0
let hitokotoAutoTimer = null
const fetchHitokoto = async () => {
  const req = ++hitokotoReq
  hitokotoLoading.value = true
  try {
    const res = await fetch('https://v1.hitokoto.cn/?c=i&c=d&c=a&encode=json&max_length=30')
    if (!res.ok) return
    const data = await res.json()
    if (req === hitokotoReq && data && data.hitokoto) {
      hitokoto.value = data.hitokoto
      hitokotoFrom.value = data.from || ''
    }
  } catch (e) {
    // 请求失败则保持现状，不影响其余内容
  } finally {
    if (req === hitokotoReq) hitokotoLoading.value = false
  }
}
// 手动换一句：10 秒内忽略重复点击
const refreshHitokoto = () => {
  const now = Date.now()
  if (now - lastManualAt < HITOKOTO_MANUAL_MIN) return
  lastManualAt = now
  fetchHitokoto()
}
const startHitokotoAuto = () => {
  clearInterval(hitokotoAutoTimer)
  hitokotoAutoTimer = setInterval(() => fetchHitokoto(), HITOKOTO_AUTO_INTERVAL)
}

// 预警轮播：多条预警自动切换当前展示的一条
const warningIndex = ref(0)
const currentWarning = computed(() => WeatherEarlyWarning.value[warningIndex.value] ?? WeatherEarlyWarning.value[0])
const ROTATE_INTERVAL = 10000
let rotateWorker = null
const ensureRotateWorker = () => {
  if (rotateWorker) return
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
const activeTempMax = computed(() => activeWeatherDate.value[0]?.tempMax ?? '—')
const activeTempMin = computed(() => activeWeatherDate.value[0]?.tempMin ?? '—')
const todayTempRange = computed(() => {
  const d = FourDayWeatherData.value[0]
  return d ? `${d.tempMax}° / ${d.tempMin}°` : '—'
})

const WeatherEarlyWarningLevel = (event) => {
  if (event === '蓝色') return '#icon-tianqiyujing-lan'
  else if (event === '黄色') return '#icon-tianqiyujing-huang'
  else if (event === '橙色') return '#icon-tianqiyujing-cheng'
  else if (event === '红色') return '#icon-tianqi-yujing'
  else return '#icon-tianqiyujing-lan'
}

// 预警等级 -> 强调色 class（与全局 .sev-* 色板对应）
const severityKey = (level) => {
  const l = level || ''
  if (l.includes('红')) return 'red'
  if (l.includes('橙')) return 'orange'
  if (l.includes('黄')) return 'yellow'
  return 'blue'
}

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
  pressure: '<path d="M4.5 16a7.5 7.5 0 0 1 15 0"/><path d="M12 16l3.6-4.7"/><path d="M8.2 16h.01M12 16h.01M15.8 16h.01"/>',
  vis: '<path d="M2.8 12S6 6 12 6s9.2 6 9.2 6-3.2 6-9.2 6-9.2-6-9.2-6z"/><circle cx="12" cy="12" r="2.6"/>',
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

/* 生活指数：选择器 + 聚焦卡。
   左栏空间实测很紧（1920×1080、panelscale 0.75 时整栏只剩 30px，出现预警 chip 时只剩 15px），
   所以选择器固定 4 列 × 2 行（7 条 → 4+3），聚焦卡正文固定预留 3 行高：
   两行选择器 81px + 聚焦卡 84px ≈ 194px，与原版 6 张卡（192px）基本持平，
   整栏余量约 28px（出现预警 chip 时约 10px，且是恒定下界 —— 更长的正文由 line-clamp 截断）。 */
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
const stopIndexRotate = () => {
  indexRotateWorker?.terminate()
  indexRotateWorker = null
}
const startIndexRotate = () => {
  stopIndexRotate()
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
    activeItem.value = FourDayWeatherData.value[0].fxDate
    ReviseState(200)
  },
})
const openSelectLocationDialog = () => {
  LocationPickerOpen.value = true
}
const handleShowWeatherMain = (val) => {
  WeatherMainIsShow.value = val
}
const handleBackgroundIndexChange = (val) => {
  if (String(val) !== '4') {
    WeatherMainIsShow.value = false
  }
}

onMounted(() => {
  Bus.on(BUS_EVENTS.SHOW_WEATHER_MAIN, handleShowWeatherMain)
  Bus.on(BUS_EVENTS.BACKGROUND_INDEX_CHANGE, handleBackgroundIndexChange)
  ensureRotateWorker()
  startIndexRotate()
  fetchHitokoto()
  startHitokotoAuto()
})
onUnmounted(() => {
  Bus.off(BUS_EVENTS.SHOW_WEATHER_MAIN, handleShowWeatherMain)
  Bus.off(BUS_EVENTS.BACKGROUND_INDEX_CHANGE, handleBackgroundIndexChange)
  rotateWorker?.terminate()
  rotateWorker = null
  stopIndexRotate()
  clearInterval(hitokotoAutoTimer)
})

watch(() => WeatherEarlyWarning.value.length, () => {
  warningIndex.value = 0
  ensureRotateWorker()
})
</script>

<style lang="scss" scoped>
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
  gap: 1.125rem;
  padding: 2.125rem;
  background: linear-gradient(155deg, rgba(14, 165, 233, 0.34), rgba(56, 189, 248, 0.10) 55%, transparent);
  overflow: hidden;
}

.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 90% at 18% -10%, rgba(56, 189, 248, 0.30), transparent 60%);
  pointer-events: none;
}

/* 左栏出现天气预警 chip 时，比没有预警时多占一行（chip 本身 + 一个 gap）。
   面板高度有限（见 style/weather-panel.scss），这里把左栏间距和指数选择器内边距收紧一点，
   把省下来的高度让给 chip，保证生活指数区完整落在面板内而不是被顶到下沿外。
   实测（1920×1080、panelscale 0.75）：6 张指数卡的老版式用完只剩 15px 余量；
   改成「4 列选择器 + 聚焦卡」后还剩 10px（没有预警时约 28px）。 */
.hero.hero-warning {
  gap: 0.875rem;
}

.hero.hero-warning .indices {
  margin-top: 0.375rem;
}

.hero.hero-warning .index-cell {
  padding: 0.3125rem 0.25rem;
}

.hero-top {
  position: relative;
  z-index: 1;
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

/* API 设置入口：重新打开新用户引导（查看/修改域名与密钥的说明与检测结果） */
.api-entry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
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
}

.date-dayname {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.15;
  color: var(--text-primary);
}

.date-day {
  display: block;
  margin-top: 0.3125rem;
  font-size: 0.95rem;
  color: var(--text-muted);
}

.hero-now {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.weather-icon {
  font-size: 4.4rem;
  line-height: 1;
  color: rgba(255, 255, 255, 0.9);
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
  font-size: 5rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text-primary);
}

.now-temp-unit {
  font-size: 1.35rem;
  font-weight: 600;
  margin-left: 0.25rem;
  color: var(--text-secondary);
}

.now-desc {
  position: relative;
  z-index: 1;
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.now-sub {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.88rem;
  color: var(--text-muted);
}

.now-sub-sep {
  width: 0.25rem;
  height: 0.25rem;
  border-radius: 50%;
  background: var(--text-muted);
}

.early-chip {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 0.5625rem;
  width: fit-content;
  min-height: 2.375rem;
  padding: 0.5rem 0.875rem;
  color: #fff;
  font-size: 0.95rem;
  font-weight: 600;
  background: var(--sev-bg);
  border: 1px solid var(--sev-border);
  border-radius: 999px;
  transition: background 0.2s ease, transform 0.2s ease;
}

.early-chip:hover {
  filter: brightness(1.1);
}

.early-chip-icon {
  width: 1em;
  height: 1em;
  flex: none;
  fill: currentColor;
  overflow: hidden;
}

.early-chip-main {
  display: inline-flex;
  align-items: center;
  gap: 0.5625rem;
  white-space: nowrap;
  overflow: hidden;
}

.early-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5em;
  height: 1.5em;
  padding: 0 0.35em;
  font-size: 0.72em;
  font-weight: 700;
  line-height: 1;
  color: #fff;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
}

/* ================= 右侧：详情 + 指数 + 预报 ================= */
.details {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 1.625rem;
  padding: 2.5rem;
  background: rgba(255, 255, 255, 0.045);
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
  display: flex;
  align-items: center;
  min-height: 1.55em; /* 固定一行占位，请求期间也占住高度，避免下面卡片跳动 */
  margin: 0.5rem 0 0;
  padding-left: 0.625rem;
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

.quote-skeleton {
  display: block;
  width: clamp(5rem, 45%, 13.75rem);
  height: 0.95em;
  border-radius: 0.25rem;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.05));
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

.stat-value {
  font-size: 1.9rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.stat-value small {
  font-size: 0.52em;
  font-weight: 500;
  color: var(--text-muted);
  letter-spacing: normal;
}

.sun-row {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.9rem;
  color: var(--text-muted);
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
  background: rgba(255, 255, 255, 0.12);
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
   正文固定 2 行高（min-height），否则各条文字长短不同，切换时整栏会上下跳。 */
.index-focus {
  /* 内边距提成变量，改一处就够 */
  --focus-pad-x: 0.875rem;
  --focus-pad-y: 0.625rem;
  position: relative;
  margin-top: 0.5rem;
  /* out-in 换条时旧内容已移除、新内容还没插入，中间有一帧是空的：
     兜一个高度（= 内边距 + 标题行 + 3 行正文 ≈ 实测的 84.2px），
     卡片就不会在换条的一瞬间塌下去 */
  min-height: 7rem;
  padding: var(--focus-pad-y) var(--focus-pad-x);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-left: 0.1875rem solid var(--tone-color, var(--glass-border-strong));
  border-radius: var(--radius-sm);
  /* 轮播时离场的那份会向上滑出，裁掉它才能干净地"从卡片里滑走"，
     而不是飘到上面的选择器上面去 */
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

.forecast-list {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

.forecast-list li {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.625rem;
  padding: 1.125rem 0.5rem;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.forecast-list li:hover {
  background: var(--glass-bg-soft);
}

.forecast-list li.active {
  background: rgba(56, 189, 248, 0.16);
  border-color: rgba(56, 189, 248, 0.5);
  color: var(--text-primary);
  box-shadow: var(--shadow-panel);
}

.forecast-day {
  font-size: 0.92rem;
  font-weight: 600;
}

.forecast-list li i {
  font-size: 2.4rem;
  line-height: 1;
}

.forecast-list li i::before {
  font-size: 1em;
}

.forecast-temp {
  font-size: 0.94rem;
  color: var(--text-muted);
}

.forecast-temp b {
  font-weight: 700;
  color: var(--text-primary);
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
