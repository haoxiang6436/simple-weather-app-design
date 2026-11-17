import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import '@/style/index.scss'
import SettingsDialogPreview from '@/dev/settings-dialog/SettingsDialogPreview.vue'
import { applyColorTheme } from '@/features/wallpaper/properties'
import { AmapKeyRaw, UserApiFingerprint, UserApiHostRaw, UserApiKeyRaw, UserApiState } from '@/api/credentials'
import { useWeatherStore } from '@/store/index'
import { CheckResults, VerifiedFingerprint } from '@/features/onboarding/onboardingState'
import { recordRequest, resetRequestStats, STATS_SERVICE } from '@/api/requestStats'

/**
 * 设置弹窗的预览入口（只供开发时用，不进 dist）
 *
 *   /dev/settings-dialog.html                     默认停在「概览」
 *   /dev/settings-dialog.html?start=connection    直接看某一页
 *   /dev/settings-dialog.html?start=stats         直接看「统计」页（本机真实计数，新环境里全是 0）
 *   /dev/settings-dialog.html?start=stats&stats=demo   顺便塞一份假计数，看有数据时的版式
 *   /dev/settings-dialog.html?theme=mist          换面板配色（night / mist / atlas）
 *   /dev/settings-dialog.html?point=none          不塞坐标：看「还没选位置」时地图卡的空状态
 *
 * 弹窗用的是正式组件，数据也全都来自 onboardingState / 天气 store / 壁纸属性。
 * 这一页只做两件事：
 *   1. 起一个 pinia —— 弹窗要读天气 store 里的位置和刷新时间；
 *   2. 塞一份假凭据，好让「检测通过」这条路显示出来（真壁纸里得先配好密钥才进得到设置页）。
 *
 * 假数据全部收在这个文件里，组件本身不存任何示例值。全程离线：下面把
 * VerifiedFingerprint 对齐成这份假凭据的指纹，onboardingState 的 watcher 就会走
 * 「凭据未变 → 检测通过」那条捷径，不会真发请求（也就不会几秒后变成红色的检测失败）。
 */

const pinia = createPinia()
setActivePinia(pinia)

const query = new URLSearchParams(window.location.search)
const theme = query.get('theme')
if (theme) applyColorTheme(theme)

/* ---------- 假凭据：3 组域名，全部「可用」 ---------- */
const HOSTS = [
  'ku44u65ghn.re.qweatherapi.com',
  'md6aq2ey8e.re.qweatherapi.com',
  'n663yvm2fn.re.qweatherapi.com',
]
const KEYS = ['029b71f4af0e4d8e8d4d', 'b0a1c3d9e2f14a21b219', '1313a7c2e4b04f1e9f63']

UserApiHostRaw.value = HOSTS.join(', ')
UserApiKeyRaw.value = KEYS.join(', ')
AmapKeyRaw.value = 'dev-amap-key'
if (UserApiState.value === 'ok') {
  VerifiedFingerprint.value = UserApiFingerprint.value
  // 逐组结果照真检测的形状填一份，概览与「当前凭据」才显示得出「3 组可用」
  CheckResults.value = HOSTS.map((host) => ({ host, ok: true, kind: 'ok', code: '200', message: '可用', soft: false }))
}

/* ---------- 天气 store 里的位置与刷新时间 ----------
   位置要连 point 一起给：概览里的「位置地图」卡按 CityAddressPoint 铺瓦片，
   省 / 市 / 区 / 街道 / 路齐全时，地址才显示成
   「浙江省-台州市-黄岩区-新前街道-中学路」那种完整层级。
   ?point=none：不塞坐标，用来看「还没选位置」时地图卡的空状态。 */
const weatherStore = useWeatherStore()
const hasPoint = query.get('point') !== 'none'
weatherStore.dayDateCity = {
  ...weatherStore.dayDateCity,
  city: '浙江省, 黄岩区',
  point: hasPoint ? {
    lng: 121.2683,
    lat: 28.6405,
    crs: 'GCJ02',
    province: '浙江省',
    city: '台州市',
    district: '黄岩区',
    districtSource: 'amap',
    township: '新前街道',
    road: '中学路',
  } : null,
}
weatherStore.TheWeatherDataIsLoaded = 100
weatherStore.WeatherDataUpdatedAtATime = {
  ...weatherStore.WeatherDataUpdatedAtATime,
  nowDate: Date.now(),
  RealTimeWeather: Date.now() - 2 * 60 * 1000,
}

/* ---------- 假计数：只在 ?stats=demo 时塞 ----------
   走的是正式的 recordRequest（api/requestStats.js），只是把时间戳往回拨，
   所以曲线、占比、额度进度条都是真算出来的，不是画上去的假图。
   要显式带参数，是因为「一个请求都没有」也是要看的版式（新用户第一次点进来就是这样）。
   每次塞之前先 reset：预览页要的是稳定版式，不是上去一行行累加。 */
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

// 接口按「谁更常被轮询」重复排一遍：实时天气最勤，城市查询只在地点变化时才发
const API_MIX = [
  'current', 'current', 'current', 'current',
  'alert', 'alert',
  'minutely', 'minutely', 'minutely',
  'air', 'air',
  'indices',
  'geo',
]

// 一天里的节奏：白天多、凌晨几乎不动（和 60 秒轮询 + 各级缓存的形状接近）
const HOUR_PATTERN = [2, 1, 0, 0, 0, 1, 3, 6, 9, 12, 14, 13, 11, 10, 12, 15, 13, 10, 8, 7, 6, 5, 4, 3]

const seedRequestStats = () => {
  resetRequestStats()
  const now = Date.now()
  const hit = (at, api, host, outcome = 'ok') =>
    recordRequest({ service: STATS_SERVICE, api, host, outcome, now: at })

  // 本月已经过去的 18 天
  for (let day = 18; day >= 1; day -= 1) {
    const base = now - day * DAY_MS
    for (let index = 0; index < 180; index += 1) {
      hit(base + index * 5 * 60 * 1000, API_MIX[index % API_MIX.length], HOSTS[index % HOSTS.length])
    }
  }
  // 今天这 24 小时
  HOUR_PATTERN.forEach((count, offset) => {
    const slot = now - (23 - offset) * HOUR_MS + 5 * 60 * 1000
    for (let index = 0; index < count; index += 1) {
      hit(slot + index * 2 * 60 * 1000, API_MIX[index % API_MIX.length], HOSTS[index % HOSTS.length])
    }
  })
  // 最近一小时里掺几次失败：非 2xx 和超时都不计入额度，但要在「失败 · 不计费」那行露出来
  hit(now - 20 * 60 * 1000, 'alert', HOSTS[1], 'err')
  hit(now - 45 * 60 * 1000, 'indices', HOSTS[0], 'net')
  hit(now - 90 * 60 * 1000, 'minutely', HOSTS[2], 'net')
}

if (query.get('stats') === 'demo') seedRequestStats()

createApp(SettingsDialogPreview).use(pinia).mount('#app')
