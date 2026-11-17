import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import '@/style/index.scss'
import 'qweather-icons/font/qweather-icons.css'
import AqiPositionBoard from '@/dev/AqiPositionBoard.vue'
import { useWeatherStore } from '@/store/index'
import { applyColorTheme } from '@/features/wallpaper/properties'

/**
 * AQI 胶囊「摆哪儿」的对比板：一张页面里并排放同一个小胶囊的各种位置。
 *
 * 只供开发时用（不进 dist：vite 的 build.input 目前只有 index.html）。
 * 全部用真组件（AirQualityChip）+ 真字号，所以在这里选中的位置可以直接搬回 WeatherMain。
 *
 * 参数：
 *   ?aqi=1..6   等级（1 优 … 6 严重污染），默认 1；4 个字的长等级会收掉「AQI」标签
 *   ?temp=19    当前温度，可以直接给 -10 看「右边余量只剩 4rem」的极限情况
 *   ?theme=mist|atlas  面板主题（默认夜雨）
 */

setActivePinia(createPinia())
const store = useWeatherStore()
const query = new URLSearchParams(window.location.search)

/* 等级假数据：字段照抄 /airquality/v1/current 的结构 */
const AQI_SAMPLES = [
  { aqi: 34, level: 1, category: '优', primaryPollutant: '', advice: '各类人群可正常活动。' },
  { aqi: 78, level: 2, category: '良', primaryPollutant: 'PM2.5', advice: '空气质量可接受，极少数异常敏感人群应减少户外活动。' },
  { aqi: 128, level: 3, category: '轻度污染', primaryPollutant: 'PM2.5', advice: '儿童、老年人及心脏病、呼吸系统疾病患者应减少长时间、高强度的户外锻炼。' },
  { aqi: 176, level: 4, category: '中度污染', primaryPollutant: 'PM2.5', advice: '儿童、老年人及心脏病、呼吸系统疾病患者避免长时间、高强度的户外锻炼。' },
  { aqi: 236, level: 5, category: '重度污染', primaryPollutant: 'PM2.5', advice: '儿童、老年人和病人应当留在室内，避免体力消耗。' },
  { aqi: 328, level: 6, category: '严重污染', primaryPollutant: 'PM10', advice: '一般人群应避免户外活动，儿童、老年人和病人应当留在室内。' },
]
const aqiParam = Number(query.get('aqi'))
const sample = AQI_SAMPLES[(aqiParam >= 1 && aqiParam <= AQI_SAMPLES.length ? aqiParam : 1) - 1]
store.AirQuality = {
  ...sample,
  display: String(sample.aqi),
  standard: 'cn-mee',
  standardName: 'AQI (CN)',
  effect: '',
  pm25: { value: Math.round(sample.aqi * 0.72), unit: 'μg/m³' },
  attributions: [],
  key: '',
}

const tempParam = query.get('temp')
store.nowWeatherData = {
  icon: '305',
  temp: tempParam || '19',
  text: '小雨',
}

const theme = query.get('theme') || ''
if (theme) applyColorTheme(theme)
// 晨雾是浅色面板，压在同一条深色页面上会看不出玻璃的边界，页面底色跟着换
document.body.style.background = theme === 'mist'
  ? 'radial-gradient(120% 100% at 20% 0%, #dce9f5, #a8c2d7 70%)'
  : 'radial-gradient(120% 100% at 20% 0%, #16344a, #0b1720 70%)'

createApp(AqiPositionBoard).mount('#app')
