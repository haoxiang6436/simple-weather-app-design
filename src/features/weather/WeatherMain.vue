<template>
  <div class="weather">
    <section v-if="!WeatherMainIsShow" class="weather-card">
      <!-- 左侧：当前天气（紧凑） -->
      <header class="hero">
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
          <WeatherStateIndicator :state="TheWeatherDataIsLoaded"
            :updated-minutes-ago="Number(WeatherDataUpdatedAtATimeComputed)" :err-count="errCount" />
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

        <div v-if="WeatherIndices.length" class="indices">
          <div class="indices-title">生活指数</div>
          <ul class="indices-grid">
            <li v-for="idx in WeatherIndices" :key="idx.type" class="index-tile"
              :class="'idx-' + indexTone(idx.category)">
              <span class="index-icon" v-html="indexIcon(idx.type)"></span>
              <span class="index-name">{{ idx.name.replace('指数', '') }}</span>
              <span class="index-cat">{{ idx.category }}</span>
            </li>
          </ul>
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

    <SelectLocationDialog ref="SearchLocationDialogRef"></SelectLocationDialog>
    <welcome-modal :open-select-location="openSelectLocationDialog" />
  </div>
</template>

<script setup>
import 'qweather-icons/font/qweather-icons.css'
import { onMounted, ref, computed, onUnmounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useWeatherStore } from '@/store/index';
import SelectLocationDialog from './SelectLocationDialog.vue';
import WelcomeModal from './WelcomeModal.vue'
import WeatherStateIndicator from './WeatherStateIndicator.vue'
import Bus from '@/shared/Bus';
import { BUS_EVENTS } from '@/features/wallpaper/constants';
import { useWeatherRefresh } from './useWeatherRefresh';

const WeatherMainIsShow = ref(false)
const weatherStore = useWeatherStore()
const SearchLocationDialogRef = ref(null)
const { dayDateCity, FourDayWeatherData, nowWeatherData, WeatherDataUpdatedAtATimeComputed, TheWeatherDataIsLoaded, WeatherEarlyWarning, WeatherIndices, EarlyWarningDetailsDialog } = storeToRefs(weatherStore)
const { getLocationInformation, ReviseState } = weatherStore
const activeItem = ref('今天')
const activeWeatherDate = computed(() => FourDayWeatherData.value.filter(item => item.fxDate === activeItem.value))

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

const { errCount } = useWeatherRefresh({
  refresh: getLocationInformation,
  setState: ReviseState,
  onSuccess: () => {
    activeItem.value = FourDayWeatherData.value[0].fxDate
    ReviseState(200)
  },
})
const openSelectLocationDialog = () => {
  SearchLocationDialogRef.value?.showDialog()
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
  fetchHitokoto()
  startHitokotoAuto()
})
onUnmounted(() => {
  Bus.off(BUS_EVENTS.SHOW_WEATHER_MAIN, handleShowWeatherMain)
  Bus.off(BUS_EVENTS.BACKGROUND_INDEX_CHANGE, handleBackgroundIndexChange)
  rotateWorker?.terminate()
  rotateWorker = null
  clearInterval(hitokotoAutoTimer)
})

watch(() => WeatherEarlyWarning.value.length, () => {
  warningIndex.value = 0
  ensureRotateWorker()
})
</script>

<style lang="scss" scoped>
.weather {
  position: fixed;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(16px, 4vw, 56px);
}

.weather-card {
  width: min(82vw, 1140px);
  max-height: 92vh;
  display: grid;
  grid-template-columns: minmax(250px, 0.88fr) 1.6fr;
  border-radius: var(--radius-lg);
  background: var(--glass-bg);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}

.weather-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 36px 90px -32px rgba(0, 0, 0, 0.75), 0 2px 8px rgba(0, 0, 0, 0.28);
}

/* ================= 左侧：当前天气 ================= */
.hero {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: clamp(10px, 1.3vw, 18px);
  padding: clamp(22px, 2.4vw, 34px);
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

.hero-top {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.location {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 0 1 auto;
  min-height: 38px;
  max-width: 100%;
  padding: 7px 13px;
  color: var(--text-primary);
  font-size: clamp(0.9rem, 1.1vw, 1.05rem);
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
  width: 14px;
  height: 14px;
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
  font-size: clamp(1.3rem, 1.9vw, 1.8rem);
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.15;
  color: var(--text-primary);
}

.date-day {
  display: block;
  margin-top: 5px;
  font-size: clamp(0.85rem, 1.05vw, 0.95rem);
  color: var(--text-muted);
}

.hero-now {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: clamp(8px, 1.2vw, 14px);
}

.weather-icon {
  font-size: clamp(2.2rem, 6vw, 4.4rem);
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
  font-size: clamp(2.8rem, 7vw, 5rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text-primary);
}

.now-temp-unit {
  font-size: clamp(1rem, 1.5vw, 1.35rem);
  font-weight: 600;
  margin-left: 4px;
  color: var(--text-secondary);
}

.now-desc {
  position: relative;
  z-index: 1;
  font-size: clamp(1rem, 1.4vw, 1.3rem);
  font-weight: 600;
  color: var(--text-secondary);
}

.now-sub {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: clamp(0.78rem, 0.95vw, 0.88rem);
  color: var(--text-muted);
}

.now-sub-sep {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--text-muted);
}

.early-chip {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  width: fit-content;
  min-height: 38px;
  padding: 8px 14px;
  color: #fff;
  font-size: clamp(0.82rem, 1vw, 0.95rem);
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
  gap: 9px;
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

.chip-fade-enter-active,
.chip-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s var(--ease);
}

.chip-fade-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.chip-fade-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

/* ================= 右侧：详情 + 指数 + 预报 ================= */
.details {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: clamp(16px, 1.8vw, 26px);
  padding: clamp(24px, 2.6vw, 40px);
  background: rgba(255, 255, 255, 0.045);
}

.details-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.details-info {
  flex: 1;
  min-width: 0;
}

.details-quote {
  display: flex;
  align-items: center;
  min-height: 1.55em; /* 固定一行占位，请求期间也占住高度，避免下面卡片跳动 */
  margin: 8px 0 0;
  padding-left: 10px;
  border-left: 3px solid rgba(56, 189, 248, 0.48);
  overflow: hidden;
  cursor: pointer;

  &:hover .quote-text {
    color: var(--text-secondary);
  }
}

.quote-text {
  max-width: 100%;
  font-size: clamp(0.85rem, 1.05vw, 0.95rem);
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
  width: clamp(80px, 45%, 220px);
  height: 0.95em;
  border-radius: 4px;
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
  font-size: clamp(1.3rem, 1.9vw, 1.9rem);
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.details-temp {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  white-space: nowrap;
}

.temp-num {
  font-size: clamp(1.5rem, 2.2vw, 2rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--text-secondary);
}

.temp-sep {
  font-size: clamp(1rem, 1.4vw, 1.3rem);
  color: var(--text-muted);
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: clamp(10px, 1.2vw, 16px);
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: clamp(12px, 1.3vw, 16px);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.stat:hover {
  transform: translateY(-2px);
  border-color: var(--glass-border-strong);
}

.stat-icon {
  display: block;
  width: clamp(1.25rem, 1.6vw, 1.55rem);
  height: clamp(1.25rem, 1.6vw, 1.55rem);
  color: var(--text-muted);
}

.stat-label {
  font-size: clamp(0.76rem, 0.88vw, 0.84rem);
  color: var(--text-muted);
}

.stat-value {
  font-size: clamp(1.35rem, 2.2vw, 1.9rem);
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
  gap: 10px;
  font-size: clamp(0.8rem, 0.95vw, 0.9rem);
  color: var(--text-muted);
}

.sun-item b {
  font-weight: 600;
  color: var(--text-secondary);
}

.sun-sep {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--text-muted);
}

/* 生活指数 */
.indices {
  position: relative;
  z-index: 1;
  margin-top: clamp(6px, 0.8vw, 10px);
}

.indices-title {
  margin-bottom: 8px;
  font-size: clamp(0.8rem, 0.95vw, 0.9rem);
  font-weight: 600;
  color: var(--text-muted);
}

.indices-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: clamp(8px, 1vw, 12px);
}

.index-tile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: clamp(10px, 1.1vw, 14px) 12px;
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.index-tile:hover {
  transform: translateY(-2px);
  border-color: var(--glass-border-strong);
}

.index-icon {
  display: block;
  width: clamp(1.15rem, 1.4vw, 1.4rem);
  height: clamp(1.15rem, 1.4vw, 1.4rem);
  color: var(--text-secondary);
}

.index-name {
  font-size: clamp(0.72rem, 0.85vw, 0.8rem);
  color: var(--text-muted);
}

.index-cat {
  font-size: clamp(0.82rem, 1vw, 0.95rem);
  font-weight: 600;
  color: var(--text-secondary);
}

.index-tile.idx-ok .index-cat {
  color: var(--color-ok);
}

.index-tile.idx-warn .index-cat {
  color: var(--color-warn);
}

.forecast-list {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: clamp(10px, 1.2vw, 16px);
}

.forecast-list li {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: clamp(12px, 1.4vw, 18px) 8px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.forecast-list li:hover {
  background: var(--glass-bg-soft);
  transform: translateY(-2px);
}

.forecast-list li.active {
  background: rgba(56, 189, 248, 0.16);
  border-color: rgba(56, 189, 248, 0.5);
  color: var(--text-primary);
  box-shadow: var(--shadow-panel);
}

.forecast-day {
  font-size: clamp(0.8rem, 0.95vw, 0.92rem);
  font-weight: 600;
}

.forecast-list li i {
  font-size: clamp(1.5rem, 2.6vw, 2.4rem);
  line-height: 1;
}

.forecast-list li i::before {
  font-size: 1em;
}

.forecast-temp {
  font-size: clamp(0.8rem, 1vw, 0.94rem);
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
    gap: 16px;
  }
}
</style>
