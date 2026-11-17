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

/* ?hourly=1：塞一份 24 小时假数据，并直接切到「24 小时」视图。
   字段照抄 /weather/v1/hourly 归一化之后的结构（见 api/weather.js 的 normalizeHourly），
   起点是「今天 15 时」、第 10 项跨到明天 0 时 —— 跨零点那一格要显示日期而不是 00:00。 */
const HOURLY_SAMPLE = (() => {
  const TEMPS = [15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 10, 9, 9, 10, 11, 13, 15, 16, 17, 18, 19, 19]
  const ICONS = ['305', '305', '300', '300', '104', '104', '101', '150', '150', '150', '150', '150', '150', '150', '101', '101', '103', '103', '100', '100', '100', '100', '100', '100']
  const PROBS = [78, 82, 71, 60, 44, 33, 22, 15, 8, 5, 3, 2, 2, 3, 4, 6, 8, 10, 12, 10, 8, 6, 5, 4]
  const SCALES = [2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3]
  const start = new Date()
  // ?hour=21 可以让跨零点那一格落进首屏（默认 15 时起步，跨零点在第 10 列，要拖动才看得到）
  start.setHours(Number(query.get('hour')) || 15, 0, 0, 0)
  return TEMPS.map((temp, index) => {
    const at = new Date(start.getTime() + index * 60 * 60 * 1000)
    const two = (value) => String(value).padStart(2, '0')
    return {
      ts: at.getTime(),
      date: `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`,
      time: `${two(at.getHours())}:00`,
      temp,
      feelsLike: temp - 1,
      icon: ICONS[index],
      text: '',
      humidity: 80,
      windDir: '东北风',
      windScale: SCALES[index],
      windSpeed: 6,
      precipProb: PROBS[index],
      precip: 0,
      precipType: PROBS[index] > 50 ? 'rain' : 'none',
      pressure: 1012,
      cloud: 90,
      uvIndex: 0,
    }
  })
})()
if (query.get('hourly')) {
  store.HourlyWeatherData = { hours: HOURLY_SAMPLE, attributions: [{ name: '和风天气', url: 'https://www.qweather.com' }] }
  store.HourlyStatus = 'ready'
  store.ForecastView = 'hourly'
}

/* ?status=loading / ?status=error：看 24 小时视图的骨架与失败态（两者都必须和正常态等高）。 */
if (query.get('status')) {
  store.HourlyStatus = query.get('status')
  store.HourlyWeatherData = { hours: [], attributions: [] }
  store.ForecastView = 'hourly'
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

/* ?measure=1：把关键盒子的尺寸写进 <pre id="measure">，配合 --dump-dom 读。
   用途只有一个：切换 7 天 / 24 小时时，卡片总高必须一个像素都不变（两种视图等高），
   而这件事用肉眼比两张截图并不可靠 —— 直接读 rect 更硬。 */
if (new URLSearchParams(window.location.search).get('measure')) {
  const pre = document.createElement('pre')
  pre.id = 'measure'
  pre.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;margin:0;padding:8px;'
    + 'font:11px/1.45 ui-monospace,monospace;white-space:pre-wrap;background:#000c;color:#fff'
  document.body.appendChild(pre)
  const box = (selector) => {
    const el = document.querySelector(selector)
    if (!el) return `${selector}: (none)`
    const rect = el.getBoundingClientRect()
    return `${selector}: y=${rect.y.toFixed(1)} h=${rect.height.toFixed(1)}`
      + ` sh=${el.scrollHeight} ch=${el.clientHeight} sw=${el.scrollWidth} cw=${el.clientWidth}`
  }
  const pick = () => {
    pre.textContent = [
      box('.weather-shell'),
      box('.details'),
      box('.forecast-panel'),
      box('.forecast-head'),
      box('.forecast-views'),
      box('.forecast-pane.is-active'),
      box('.forecast-pane.is-active > *'),
      box('.sun-row'),
      box('.sun-right'),
      box('.view-switch'),
      box('.view-switch-thumb'),
      box('.view-switch-item'),
      `view-switch items rect=${[...document.querySelectorAll('.view-switch-item')]
        .map((el) => ((r) => `x=${r.x.toFixed(1)} w=${r.width.toFixed(1)}`)(el.getBoundingClientRect()))
        .join(' | ')}`,
      `view-switch thumb rect=${(() => {
        const el = document.querySelector('.view-switch-thumb')
        if (!el) return '-'
        const r = el.getBoundingClientRect()
        return `x=${r.x.toFixed(1)} w=${r.width.toFixed(1)}`
      })()}`,
      `view-switch box rect=${(() => {
        const el = document.querySelector('.view-switch')
        if (!el) return '-'
        const r = el.getBoundingClientRect()
        return `x=${r.x.toFixed(1)} y=${r.y.toFixed(1)} w=${r.width.toFixed(1)} h=${r.height.toFixed(1)} clientLeft=${el.clientLeft}`
      })()}`,
      box('.hourly-scroll'),
      box('.hourly-track'),
      box('.hourly-item'),
      `hourly-shift transform=${(() => {
        const el = document.querySelector('.hourly-shift')
        return el ? getComputedStyle(el).transform : '-'
      })()} peak=${(window.__nudgePeak || 0).toFixed(2)}`,
      `hourly enter=${(window.__enter || []).join(' → ') || '-'}`,
      `html.scrollHeight=${document.documentElement.scrollHeight}`,
      `hourly-scroll class=${document.querySelector('.hourly-scroll')?.className}`
        + ` left=${document.querySelector('.hourly-scroll')?.scrollLeft}`,
    ].join('\n')
  }
  pick()
  setInterval(pick, 300)

  /* ?startview=daily&click=hourly：先停在 7 天，再「真的点一下」切换到 24 小时。
     用来验证切换那条真实路径（tab 点击 → ForecastView 变化 → 懒建 BetterScroll），
     而不是像 ?hourly=1 那样直接把状态塞进去。 */
  if (new URLSearchParams(window.location.search).get('startview') === 'daily') {
    store.ForecastView = 'daily'
  }
  const clickParam = new URLSearchParams(window.location.search).get('click')
  if (clickParam) {
    setTimeout(() => {
      // 按位置点，不按文案找：文案会随壁纸属性变（「7 天」可能是「5 天」）
      const index = clickParam === 'hourly' ? 1 : 0
      document.querySelectorAll('.view-switch-item')[index]?.click()
    }, 800)
  }
}

/* ?wheel=down / ?wheel=up：模拟滚轮，用来验证「滚到两头还有没有弹簧」。
   滚轮是离散的一格一列，到头被 clamp 住时全靠 edgeNudge 那一下位移给反馈，
   而这件事一张截图证明不了（位移只有 ~14px、0.6s 就回位），所以这里采样
   .hourly-shift 的 translateX 峰值，写进 window.__nudgePeak，由 ?measure=1 显示；
   同时把采样过程写进 document.title，方便 --dump-dom 一眼看出到底有没有踢到。
   踩过的坑：① 节点必须每次现查（24 小时那一片是 Vue 下一拍才渲染的）；
   ② 命中率和 sentinel 都要数 —— prevented 才说明组件的 wheel 处理真的跑了。 */
const wheelProbe = new URLSearchParams(window.location.search).get('wheel')
if (wheelProbe) {
  const findScroll = () => document.querySelector('.hourly-scroll')
  window.__nudgePeak = 0
  window.__nudgeSamples = 0
  window.__wheelFired = 0
  window.__wheelPrevented = 0
  const sampleShift = () => {
    const shift = document.querySelector('.hourly-shift')
    const matrix = shift ? getComputedStyle(shift).transform : 'none'
    const match = /matrix\(1, 0, 0, 1, (-?[\d.]+)/.exec(matrix)
    if (match) window.__nudgePeak = Math.max(window.__nudgePeak, Math.abs(Number(match[1])))
    window.__nudgeSamples += 1
    document.title = `probe samples=${window.__nudgeSamples} peak=${window.__nudgePeak.toFixed(2)}`
      + ` fired=${window.__wheelFired} prevented=${window.__wheelPrevented} now=${matrix}`
    requestAnimationFrame(sampleShift)
  }
  requestAnimationFrame(sampleShift)
  const direction = wheelProbe === 'up' ? -1 : 1
  let fired = 0
  const fire = () => {
    const scroller = findScroll()
    // 24 小时那一片是 Vue 下一拍才渲染的：没渲染出来就再等一拍，
    // 否则在虚拟时间下一个 setTimeout 可能整轮都跑在 mount 之前（20 次全空放）
    if (!scroller) {
      setTimeout(fire, 60)
      return
    }
    window.__wheelFired += 1
    // dispatchEvent 返回 false = 处理函数调了 preventDefault，说明滚轮被组件接管
    const passed = scroller.dispatchEvent(new WheelEvent('wheel', {
      deltaY: direction * 120,
      bubbles: true,
      cancelable: true,
    }))
    if (!passed) window.__wheelPrevented += 1
    if (++fired < 20) setTimeout(fire, 220)
  }
  setTimeout(fire, 600)
}

/* ?enter=1：验证「切到 24 小时时有错峰渐入 + 曲线画线」。
   一张静态截图证明不了动画：要么截在开头（什么都没出现）、要么截在结尾（一切就位）。
   所以这里不用截图，改用 Web Animations API 直接问浏览器「现在到底有几条过渡在跑」——
   document.getAnimations() 能拿到每条 CSS transition 的目标元素与 timing，
   于是错峰最要紧的那件事（每列的 delay 依次递增）变成了可读的数字，而不是靠肉眼。 */
const enterProbe = new URLSearchParams(window.location.search).get('enter')
if (enterProbe) {
  const CLICK_AT = 800 // 与上面 ?click= 的延时一致
  const describe = (animation) => {
    const target = animation.effect?.target
    if (!target) return null
    const raw = typeof target.className === 'string' ? target.className : target.className?.baseVal
    const className = String(raw || '')
    const isTrend = className.includes('hourly-trend')
    const isItem = className.includes('hourly-item')
    if (!isTrend && !isItem) return null
    const timing = animation.effect.getTiming?.() || {}
    return {
      kind: isTrend ? 'trend' : 'item',
      delay: Math.round(timing.delay || 0),
      duration: Math.round(timing.duration || 0),
      property: animation.transitionProperty || '',
    }
  }
  window.__enter = []
  const snap = (label) => {
    const all = document.getAnimations().map(describe).filter(Boolean)
    const items = all.filter((entry) => entry.kind === 'item')
    const trend = all.filter((entry) => entry.kind === 'trend')
    const delays = [...new Set(items.map((entry) => entry.delay))].sort((a, b) => a - b)
    const firstItem = document.querySelector('.hourly-item')
    window.__enter.push(
      `${label}: item=${items.length} trend=${trend.length}`
      + ` delays=${delays.slice(0, 5).join('/')}${delays.length > 5 ? '/…' : ''}`
      + ` trendDur=${trend[0]?.duration ?? '-'} trendDelay=${trend[0]?.delay ?? '-'}`
      + ` firstCls=${firstItem ? firstItem.className : 'none'}`,
    )
  }
  ;[40, 260, 700, 1600].forEach((at) => setTimeout(() => snap(`+${at}ms`), CLICK_AT + at))
}
