import { createApp, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import '@/style/index.scss'
import 'qweather-icons/font/qweather-icons.css'
import WeatherMain from '@/features/weather/WeatherMain.vue'
import { useWeatherStore } from '@/store/index'
import { applyWallpaperProperties, WallpaperPropertiesReady, applyColorTheme } from '@/features/wallpaper/properties'
import { CheckStatus, LocationChosenAt, continueWithoutCheck } from '@/features/onboarding/onboardingState'
import { setUserApiFromBrowser } from '@/api/credentials'

/**
 * 天气卡离线预览：整张卡 + 壁纸属性的真实代码路径，但不发任何真实请求。
 *
 * 存在的理由：预报条要验的是「属性面板天数 → 卡片里显示几条」这条链路，
 * 而 dev/forecast.html 只是 ForecastStrip 单独一个组件，测不到 WeatherMain 里的
 * 截断和选中项回退。这里把「凭据已配置」用死端口（127.0.0.1:9）凑出来，
 * 卡片会正常挂载，所有请求都打在本地空端口上、立刻失败，不消耗任何接口额度。
 */

// 死地址 + 假 key，然后走引导页那条「不检测，继续」的路径：
// 和真实用户点「跳过检测」等价，只是这里填的域名指向本机（没有服务在听）
// 「本机 443」：域名格式合法（不能带端口，isHostLike 只认 a-z0-9-.），
// 但这个地址上没有任何服务，所有请求立刻连接失败
setUserApiFromBrowser('127.0.0.1', 'preview-only')
continueWithoutCheck()
CheckStatus.value = 'ok'
LocationChosenAt.value = Date.now()
WallpaperPropertiesReady.value = true

const DAYS = [
  { fxDate: '今天', tempMax: 20, tempMin: 7, iconDay: '104', textDay: '阴', humidity: 63, windDirDay: '东北风', windScaleDay: '2', precip: 0, cloud: 85, uvIndex: 2, sunrise: '06:14', sunset: '17:03', tempAvg: 13 },
  { fxDate: '明天', tempMax: 22, tempMin: 12, iconDay: '103', textDay: '晴间多云', humidity: 55, windDirDay: '东南风', windScaleDay: '2', precip: 0, cloud: 40, uvIndex: 3, sunrise: '06:15', sunset: '17:02', tempAvg: 17 },
  { fxDate: '周五', tempMax: 23, tempMin: 17, iconDay: '305', textDay: '小雨', humidity: 82, windDirDay: '南风', windScaleDay: '3', precip: 2.35, cloud: 95, uvIndex: 1, sunrise: '06:16', sunset: '17:01', tempAvg: 19 },
  { fxDate: '周六', tempMax: 22, tempMin: 17, iconDay: '305', textDay: '小雨', humidity: 88, windDirDay: '西南风', windScaleDay: '3', precip: 5.1, cloud: 98, uvIndex: 1, sunrise: '06:17', sunset: '17:00', tempAvg: 19 },
  { fxDate: '周日', tempMax: 24, tempMin: 15, iconDay: '100', textDay: '晴', humidity: 48, windDirDay: '西风', windScaleDay: '2', precip: 0, cloud: 10, uvIndex: 4, sunrise: '06:18', sunset: '16:59', tempAvg: 20 },
  { fxDate: '周一', tempMax: 21, tempMin: 14, iconDay: '101', textDay: '多云', humidity: 60, windDirDay: '北风', windScaleDay: '2', precip: 0, cloud: 55, uvIndex: 3, sunrise: '06:19', sunset: '16:58', tempAvg: 17 },
  { fxDate: '周二', tempMax: 20, tempMin: 13, iconDay: '305', textDay: '小雨', humidity: 79, windDirDay: '东北风', windScaleDay: '3', precip: 1.2, cloud: 90, uvIndex: 2, sunrise: '06:20', sunset: '16:57', tempAvg: 16 },
]

const pinia = createPinia()
setActivePinia(pinia)
const store = useWeatherStore()
store.FourDayWeatherData = DAYS

/* ?indices=1：塞 7 条生活指数假数据。真实接口要联网，离线预览里永远是空数组，
   而「图标 / 图标+文字」这类排版判断只能看着真数据做。字段照抄和风 v7 的结构。 */
const INDEX_SAMPLES = [
  { type: '1', name: '运动指数', category: '较适宜', text: '天气较好，较适宜进行户外运动，但早晚较凉，请适当增减衣物。' },
  { type: '2', name: '洗车指数', category: '适宜', text: '较适宜洗车，未来一天无雨，风力较小，擦洗一新的汽车至少能保持一天。' },
  { type: '6', name: '旅游指数', category: '适宜', text: '温度适宜，又有较弱降水和微风作伴，会给您的旅行带来意想不到的景象，适宜旅游，可不要错过机会呦！' },
  { type: '8', name: '舒适度指数', category: '舒适', text: '白天不太热也不太冷，风力不大，相信您在这样的天气条件下，应会感到比较清爽和舒适。' },
  { type: '3', name: '穿衣指数', category: '较冷', text: '建议着厚外套加毛衣等服装。年老体弱者宜着大衣、呢外套加羊毛衫。' },
  { type: '5', name: '紫外线指数', category: '中等', text: '属中等强度紫外线辐射天气，外出时建议涂擦 SPF 高于 15、PA+ 的防晒护肤品。' },
  { type: '9', name: '感冒指数', category: '少发', text: '各项气象条件适宜，无明显降温过程，发生感冒机率较低。' }
]
const query = new URLSearchParams(window.location.search)
if (query.get('indices')) store.WeatherIndices = INDEX_SAMPLES

/* ?aqi=1..6：塞一份空气质量假数据。
   真实接口要联网，离线预览里 AirQuality 永远是 null，而胶囊的宽度、语气色、
   以及「等级词长到四个字时收掉 AQI 标签」这条排版分支只能看着真数据验。
   字段照抄 /airquality/v1/current 的结构（等级 1-6 = 优 / 良 / 轻度 / 中度 / 重度 / 严重）。 */
const AQI_SAMPLES = [
  { aqi: 34, level: 1, category: '优', primaryPollutant: '', advice: '各类人群可正常活动。' },
  { aqi: 78, level: 2, category: '良', primaryPollutant: 'PM2.5', advice: '空气质量可接受，极少数异常敏感人群应减少户外活动。' },
  { aqi: 128, level: 3, category: '轻度污染', primaryPollutant: 'PM2.5', advice: '儿童、老年人及心脏病、呼吸系统疾病患者应减少长时间、高强度的户外锻炼。' },
  { aqi: 176, level: 4, category: '中度污染', primaryPollutant: 'PM2.5', advice: '儿童、老年人及心脏病、呼吸系统疾病患者避免长时间、高强度的户外锻炼。' },
  { aqi: 236, level: 5, category: '重度污染', primaryPollutant: 'PM2.5', advice: '儿童、老年人和病人应当留在室内，避免体力消耗。' },
  { aqi: 328, level: 6, category: '严重污染', primaryPollutant: 'PM10', advice: '一般人群应避免户外活动，儿童、老年人和病人应当留在室内。' },
]
const aqiParam = Number(query.get('aqi'))
if (aqiParam >= 1 && aqiParam <= AQI_SAMPLES.length) {
  const sample = AQI_SAMPLES[aqiParam - 1]
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
}

// 温度也换成两位 / 负数试试：胶囊是「靠右 + 基线对齐」的，温度越宽右边余量越少
const tempParam = query.get('temp')
if (tempParam) store.nowWeatherData = { ...store.nowWeatherData, temp: tempParam, text: '小雨', icon: '305' }

// 天数由 query 决定（?days=5），同时留一个控制台入口给脚本切换
const days = Number(query.get('days')) || 5
applyWallpaperProperties({ forecastdays: { value: String(days) } })
window.__setForecastDays = (value) => applyWallpaperProperties({ forecastdays: { value: String(value) } })
window.__resetDays = () => { store.FourDayWeatherData = DAYS }

const app = createApp({ render: () => h(WeatherMain) })
app.use(pinia)
app.mount('#app')

/* ?day=周六：挂载后点一下对应的预报列。
   选中项是 WeatherMain 的内部状态，预览页只能通过「真的点一下」来换天 ——
   指标卡上的差值角标只有选中未来某天时才会出现，截图 / 手工核对都要用这个入口。 */
const dayParam = new URLSearchParams(window.location.search).get('day')
if (dayParam) {
  nextTick(() => {
    const target = [...document.querySelectorAll('.forecast-item')]
      .find((el) => el.querySelector('.forecast-day')?.textContent.trim() === dayParam)
    target?.click()
  })
}

/* ?theme=mist / ?theme=atlas：换面板主题。
   走的是壁纸属性那条真实路径（applyColorTheme 会写到 data-theme 上），
   角标的冷暖色和提示浮层的材质都是按主题取 token 的，得三套都能看一眼。 */
const themeParam = new URLSearchParams(window.location.search).get('theme')
if (themeParam) applyColorTheme(themeParam)

/* ?refresh=1：1.2 秒后把整批日预报换成「新对象、同样的 fxDate」，模拟一次后台刷新。
   真机每 60 秒走一次这条路（切回标签页也会立刻走一次），
   以前每次成功刷新都会把选中项写回第一天 —— 用户点开周六，一分钟不到就被弹回今天。
   这个入口就是用来看住那条回归的：刷新之后选中项必须还停在周六。 */
if (new URLSearchParams(window.location.search).get('refresh')) {
  setTimeout(() => {
    store.FourDayWeatherData = DAYS.map((day) => ({ ...day }))
  }, 1200)
}
