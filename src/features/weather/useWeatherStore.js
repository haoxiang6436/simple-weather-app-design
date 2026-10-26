import { defineStore } from 'pinia'
import { get7DayForecast, getCurrentWeather, getWeatherWarnings, getWeatherIndices as getWeatherIndicesAPI, getMinutelyPrecipitation as getMinutelyPrecipitationAPI, lookupCity } from '@/api/weather';
import { isNetworkError } from '@/api/errors';
import Bus from '@/shared/Bus';
import { BUS_EVENTS } from '@/features/wallpaper/constants';
import { UserApiFingerprint } from '@/api/credentials';
import { ref, computed } from 'vue';
import { useStorage } from '@vueuse/core';
import { ChosenLocationPath } from '@/features/onboarding/onboardingState';
import { getCacheTtl, isCacheFresh } from '@/config/weatherCache';
import { isSameAdminName, lookupPlaceByCoord, pointAddressLabel } from '@/features/weather/placeLookup';
import { wgs84ToGcj02 } from '@/features/weather/mapTiles';

// 天气数据缓存的 localStorage key。
// 注意：它必须定义在模块作用域 —— 下面 defineStore 的 persist 选项是在模块加载时求值的，
// 写在 setup 函数里会拿不到（ReferenceError，整个页面起不来）。
// 地址等其他数据各有自己的 key，绝不要复用这一个。
const WEATHER_CACHE_STORAGE_KEY = 'WeatherApp-2026-9-1'

export const useWeatherStore = defineStore('Weather', () => {
  // 展示的生活指数类型 ID（运动/洗车/穿衣/紫外线/旅游/舒适度/感冒）
  const INDICES_TYPES = '1,2,3,5,6,8,9'
  // 各接口的缓存时效不在这里定义：统一由 @/config/weatherCache 按和风天气官方
  // 《缓存你的数据》最佳实践给出（.env 仍可覆盖），改时长只改那一个文件。

  // 当前缓存对应的凭据指纹：用户换了域名/密钥后，旧缓存整体失效，避免继续展示别人的额度拉到的数据
  const WeatherCacheFingerprint = ref(UserApiFingerprint.value)
  /* 缓存结构版本：只有「老缓存不再适用」的改版才 +1（例：生活指数从 6 条变 7 条）。
     它和凭据指纹一样参与下面的 isFresh 判定 —— 版本一对不上，所有接口缓存立刻过期，
     壁纸重载（= 用户更新到新版本）后就会重新拉一次天气，不需要用户重选地址。

     v7：缓存时效改由 @/config/weatherCache 统一管理（生活指数 3h→6h、预警 20min→10min 等），
     并且生活指数失败时不再把时间戳往前挪（改记内存里的重试时间）。旧版本写下的
     「失败时间戳」在新 TTL 下会被误判成有效缓存，所以这里整体作废一次、让老用户重拉。

     为什么单独用一个 localStorage key，而不是放进 pinia 的 persist：
     pinia-plugin-persistedstate 恢复时是「缺字段就跳过」，老用户的持久化状态里根本没有这个字段，
     ref 会停在代码里的默认值（= 新版本号）上，于是永远判不出「这是旧版本留下的缓存」。
     useStorage 的语义正好相反 —— key 不存在就取默认值 0，老用户自然落在「过期」这一侧。

     也不要改 persist 的 key 来代替它：persist 里存着 dayDateCity，换 key 会连用户选的城市一起清掉，
     而 WeatherLocationChosenAt 还留着，结果就是「已经选过地址」却显示默认城市的天气。 */
  const CACHE_VERSION = 7
  const CacheDataVersion = useStorage('WeatherCacheDataVersion', 0)
  // 缓存是否仍然有效：
  // - important = 手动换了位置 / 明确要求强制刷新，不看缓存；
  // - 时长和「跨本地零点」规则统一由 @/config/weatherCache 决定，这里只管
  //   「缓存结构版本」和「凭据指纹」两个本项目自己的失效条件；
  // - 时区取查询地点的 tz：逐天预报 / 生活指数要在当地零点失效，而不是用户机器的零点
  //   （dayDateCity 在下面才声明，这里只是闭包，真正调用时早已初始化）。
  const isFresh = (kind, updatedAt, important) =>
    CacheDataVersion.value === CACHE_VERSION &&
    WeatherCacheFingerprint.value === UserApiFingerprint.value &&
    isCacheFresh(kind, updatedAt, {
      force: important,
      timeZone: dayDateCity.value?.CityDetail?.tz || '',
    })
  // 同一接口 + 同一城市只保留一个在途请求：
  // “手动选择城市”与每分钟的定时轮询撞车时，同一个接口不会重复发两次
  const inFlightRequests = new Map()
  const singleFlight = (key, task) => {
    const pending = inFlightRequests.get(key)
    if (pending) return pending
    const request = task().finally(() => {
      if (inFlightRequests.get(key) === request) {
        inFlightRequests.delete(key)
      }
    })
    inFlightRequests.set(key, request)
    return request
  }
  // 天气数据加载状态
  const TheWeatherDataIsLoaded = ref(100)
  /* ---- 城市（用户选择的地址）----
     地址单独一个 localStorage key，故意不放进下面的天气缓存 persist：
     天气缓存是「可以整块丢弃重建」的数据（改版时会被 CACHE_VERSION 整体作废），
     而地址是用户的选择，必须活得比缓存久。两者共用一个 key 的话，
     任何一次清理、废弃天气缓存都会连地址一起带走，用户就得重新选一遍位置。
     （别的地址相关键也都在各自模块里：WeatherLocationChosenAt 是否选过、
     WeatherLocationPath 地址页回显路径、WeatherLocationHistory 最近选择。） */
  const DAY_DATE_CITY_STORAGE_KEY = 'WeatherChosenCity'
  const DAY_DATE_CITY_DEFAULT = {
    day: '星期日',
    date: '2025年6月1日',
    city: '北京市，北京',
    location: 101010100,
    area_code: null,
    // 地图点选的坐标（和风的坐标系：大陆 GCJ-02，境外 WGS-84）。null = 按区县选择，天气用 LocationID
    point: null,
  }
  // 一次性迁移：老版本把地址塞在天气缓存的 blob 里，这里在 useStorage 初始化之前先原样搬过来。
  // 顺序很关键 —— useStorage 在 key 缺失时会立刻写入默认值，写在它后面就晚了。
  if (typeof localStorage !== 'undefined' && !localStorage.getItem(DAY_DATE_CITY_STORAGE_KEY)) {
    try {
      const legacyState = JSON.parse(localStorage.getItem(WEATHER_CACHE_STORAGE_KEY) || 'null')
      if (legacyState?.dayDateCity?.location) {
        localStorage.setItem(DAY_DATE_CITY_STORAGE_KEY, JSON.stringify(legacyState.dayDateCity))
      }
    } catch (error) {
      // 旧数据解析失败就当没选过地址，用默认值，不影响启动
    }
  }
  const dayDateCity = useStorage(DAY_DATE_CITY_STORAGE_KEY, DAY_DATE_CITY_DEFAULT)
  /**
   * 一次性迁移：早期版本误以为和风只吃 WGS-84，落库的 point 是把高德 GCJ-02
   * 转成 WGS-84 之后存的。现在统一按和风的坐标系落库（大陆 GCJ-02），
   * 没有 crs 标记的旧点一律当作 WGS-84，转换一次并打标；否则升级后 pin 和天气
   * 都会落到 ~500 m 外的邻区。
   */
  const migrateLegacyPoint = () => {
    const current = dayDateCity.value
    const point = current?.point
    if (!point || point.crs === 'GCJ02') return
    const lng = Number(point.lng)
    const lat = Number(point.lat)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
    const [gLng, gLat] = wgs84ToGcj02(lng, lat)
    dayDateCity.value = {
      ...current,
      point: {
        ...point,
        lng: Number(gLng.toFixed(4)),
        lat: Number(gLat.toFixed(4)),
        crs: 'GCJ02',
      },
    }
  }
  migrateLegacyPoint()
  /**
   * 地址文案用的短名：优先 CityDetail.name（区县名），否则取 city 串的最后一段。
   *
   * dayDateCity.city 拼的是 `${adm1}, ${name}`（「浙江省, 黄岩区」）。地图点选之后
   * 地址已经是「区县 + 路名」的精度，卡片上再挂一个省名只是噪音，所以点选场景
   * 统一用这个短名；按区县选择的场景仍然显示完整的「省, 区县」（见各调用处）。
   */
  const CityDisplayName = computed(() => {
    const name = String(dayDateCity.value?.CityDetail?.name || '').trim()
    if (name) return name
    const parts = String(dayDateCity.value?.city || '').split(',')
    return (parts[parts.length - 1] || '').trim()
  })
  /**
   * 当前地址的区县名（点选场景）。
   *
   * 优先级（背后是同一条原则：pin 落在哪，就显示哪）：
   *   1. 新记录里 point.district 带 districtSource：它就是「按坐标查到的」地名
   *      （高德「黄岩区」/ 和风「黄岩」），直接信；
   *   2. 老记录没有 source：point.district 可能是三级下拉框的标签 ——
   *      用户选了北京、pin 却拖到天津，存下来就是「北京市」。拿同一次坐标查询
   *      得到的 CityDetail.name 核对一下，对不上就以坐标为准；
   *   3. 最后才退到地址页持久化的区县路径标签（同样是下拉框来源，只作兜底）。
   */
  const CityDistrictLabel = computed(() => {
    const point = dayDateCity.value?.point
    if (!point) return ''
    const fromPoint = String(point.district || '').trim()
    const source = String(point.districtSource || '').trim()
    if (fromPoint && (source === 'amap' || source === 'qweather')) return fromPoint
    // 老记录：只有和坐标城市名对得上才认（「黄岩区」vs「黄岩」算同一个）
    if (fromPoint && isSameAdminName(fromPoint, CityDisplayName.value)) return fromPoint
    const path = ChosenLocationPath.value || []
    const fromPath = String(path[path.length - 1]?.label || '').trim()
    // CityDisplayName 来自「按坐标查天气」时返回的城市，比下拉框路径更可靠
    return CityDisplayName.value || fromPath || ''
  })
  /**
   * 卡片上的地址文案（点选场景）：`区县 路名`，例如「黄岩区 中学路」。
   *
   * 没有路名（没配高德 key）时写成「台州市 黄岩区附近」/「台州市 黄岩附近」：
   * 和风只反查到三级行政区，说「附近」才是它真实能保证的精度；
   * 带上坐标反查到的市名，单独一个区名才不会让人分不清是哪个市的黄岩。
   * 市名优先用 point.city（选点时按坐标查到的），老记录没有这个字段时退回
   * CityDetail.adm2 —— 点选记录里的 CityDetail 本来就是按坐标反查出来的城市，
   * 父子关系和数据同源。
   *
   * 卡片和「最近」共用同一套值（point.district / point.city / point.road），
   * 所以两边写法必然一致。
   */
  const CityAddressLabel = computed(() => {
    const point = dayDateCity.value?.point
    if (!point) return dayDateCity.value?.city || ''
    const district = CityDistrictLabel.value || CityDisplayName.value
    const city = String(point.city || dayDateCity.value?.CityDetail?.adm2 || '').trim()
    return pointAddressLabel({ district, city, road: point.road })
      || dayDateCity.value?.city
      || '附近'
  })
  // 天气数据更新时间
  const WeatherDataUpdatedAtATime = ref({
    FourDayWeather: 0,
    RealTimeWeather: 0,
    nowDate: 0,
    EarlyWarning: 0,
    Indices: 0,
  })
  // 计算天气数据更新时间与当前时间之间的差值（分钟）
  const WeatherDataUpdatedAtATimeComputed = computed(() => {
    const diffMinutes = (WeatherDataUpdatedAtATime.value.nowDate - WeatherDataUpdatedAtATime.value.RealTimeWeather) / 1000 / 60
    return Number.isFinite(diffMinutes) ? diffMinutes.toFixed(0) : '0'
  })
  // 5日天气
  const FourDayWeatherData = ref(
    [
      {
        fxDate: "今天",
        tempMax: "0",
        tempMin: "0",
        iconDay: "100",
        precip: "0",
        humidity: "0",
        windSpeedDay: "0"
      },
      {
        fxDate: "明天",
        tempMax: "0",
        tempMin: "0",
        iconDay: "100",
        precip: "0",
        humidity: "0",
        windSpeedDay: "0"
      },
      {
        fxDate: "星期一",
        tempMax: "0",
        tempMin: "0",
        iconDay: "100",
        precip: "0",
        humidity: "0",
        windSpeedDay: "0"
      },
      {
        fxDate: "星期二",
        tempMax: "0",
        tempMin: "0",
        iconDay: "100",
        precip: "0",
        humidity: "0",
        windSpeedDay: "0"
      },
    ]
  )
  // 实时天气
  const nowWeatherData = ref({
    icon: '100',
    temp: '0',
    text: '晴',
  })
  // 天气预警信息
  const WeatherEarlyWarning = ref([])
  const EarlyWarningDetailsDialog = ref(false)
  /* ---- 分钟级降水 ----
     独立于主流程的一套状态：只覆盖中国，境外坐标查询会稳定 400，
     混进上面那个 Promise.allSettled 就会把整张卡判成「部分加载失败」。
     这里只影响左侧那颗按钮和它的弹层，失败时其它天气数据照常展示。 */
  const MinutelyPrecipitation = ref(null)
  // idle | loading | ready | unsupported | error
  const MinutelyStatus = ref('idle')
  const MinutelyDetailsDialog = ref(false)
  // 生活指数数据
  const WeatherIndices = ref([])
  /**
   * 这次要选的位置是不是就是当前正在用的那一个。
   *
   * 打开地址页 / 地图选点后什么都没改、直接返回时，调用方仍然可能走到确认流程
   *（例如点卡片外的空白）。这种“重新确认同一个位置”不能被当成手动定位，
   * 否则 important 会让所有接口跳过缓存重新请求 —— 用户只是看了一眼地图，
   * 壁纸却把整份天气缓存强制刷了一遍。
   */
  const pointKey = (point) => {
    if (!point) return ''
    const lng = Number(point.lng)
    const lat = Number(point.lat)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return ''
    // 与 choosePoint 落库精度一致（4 位小数）；同一个点无论确认多少次都是同一个 key
    return `${lng.toFixed(4)},${lat.toFixed(4)}`
  }
  const isSameSelectedLocation = ({ city, point = null } = {}) => {
    const current = dayDateCity.value || {}
    const currentPoint = pointKey(current.point)
    const nextPoint = pointKey(point)
    // 地图点选：按坐标比较（天气缓存 key 也是坐标）
    if (currentPoint || nextPoint) return !!currentPoint && currentPoint === nextPoint
    // 区县选择：当前没有精确点，且 LocationID 没变
    return !!city?.id && String(current.location ?? '') === String(city.id)
  }
  // 获取位置信息
  const getLocationInformation = async (option) => {
    WeatherDataUpdatedAtATime.value.nowDate = Date.now()
    // important = 手动定位或（引导完成后）强制刷新，跳过缓存。
    // 但“确认的位置就是当前位置”不算换地方：这时仍按正常缓存时效走，
    // 没改点就返回不会强制刷新缓存（真正的 force 仍然优先）。
    const isSearch = !!option?.isSearch
    const important = !!option?.force || (isSearch && !isSameSelectedLocation(option))
    // 缓存结构版本对不上（＝ 刚更新到新版本）：生活指数也随主周期立刻刷新一次。
    // 否则要等 30 秒的错峰节拍才会走到指数，用户会先看到上一个版本留下的条数。
    // 只发生在版本刚更新的那一次加载，之后仍按「每周期 3 个请求」的错峰节拍走。
    const cacheVersionStale = CacheDataVersion.value !== CACHE_VERSION
    if (cacheVersionStale) {
      // 同时把各接口的「最后成功更新时间」清零：这样即使这一轮只成功了一部分、
      // 或中途关掉壁纸，没成功的那些下一轮仍会继续重试 ——
      // 不然它们会带着「旧版本写下的时间戳」被当成有效缓存，一直显示到自然过期为止。
      Object.keys(WeatherDataUpdatedAtATime.value)
        .filter((name) => name !== 'nowDate')
        .forEach((name) => { WeatherDataUpdatedAtATime.value[name] = 0 })
    }
    if (option?.isSearch) {
      console.log('手动定位更新');
      const { city, point = null } = option
      dayDateCity.value = {
        ...dayDateCity.value,
        city: city.adm1 === city.name ? city.adm1 : `${city.adm1}, ${city.name}`,
        location: city.id,
        area_code: null,
        CityDetail: city,
        // 传 null 会清掉上一次的地图点选，保证「按区县选」和「按坐标选」不会串
        point,
      }
    }
    // 三个接口并发请求，单个失败不影响其它数据落库
    const results = await Promise.allSettled([
      getFourDayWeatherData(important),
      getRealTimeWeather(important),
      getWeatherEarlyWarning(important),
    ])
    // 生活指数：手动定位时随主流程一起刷新（失败不影响主状态）；
    // 定时轮询不在这里发，改由 useWeatherRefresh 错峰单独触发，
    // 让每个定时周期的请求数保持为域名数的整数倍。
    if (important || cacheVersionStale) {
      await getWeatherIndices(important || cacheVersionStale).catch(() => {})
    }
    // 分钟级降水：独立加载、不 await —— 境外坐标必然 400，
    // 既不能进 allSettled（会判整张卡失败），也不该拖住主流程的加载耗时
    getMinutelyPrecipitation().catch(() => {})
    const failed = results.filter((result) => result.status === 'rejected')
    // 采纳当前凭据指纹与缓存版本：下一次请求按正常缓存时效走。
    // 必须放在数据请求之后 —— 放在前面的话 isFresh 会立刻通过，本轮的重新拉取就被跳过了
    WeatherCacheFingerprint.value = UserApiFingerprint.value
    CacheDataVersion.value = CACHE_VERSION
    if (failed.length === 0) {
      ReviseState(200)
      return
    }
    // 部分失败：网络错误 → 400，其它错误 → 300
    const hasNetworkError = failed.some((result) => isNetworkError(result.reason))
    // 需要用户回去改域名/密钥的错误才重开引导页。
    // 判据用错误表里的 reauth，不能只看状态码：403 里除「额度不足 / API Host 错 /
    // 账号冻结」这些需要用户处理的之外，还有「接口已弃用」这种与凭据完全无关的错误，
    // 只看 401/402/403 的话，好好的密钥会被判成失效，壁纸会一直弹回引导页。
    const credentialError = failed
      .map((result) => result.reason)
      .find((error) => !isNetworkError(error) && error?.reauth === true)
    if (credentialError) {
      Bus.emit(BUS_EVENTS.USER_API_INVALID, {
        code: credentialError.code,
        message: credentialError.message,
      })
    }
    console.error('部分天气请求失败：', failed.map((result) => result.reason))
    ReviseState(hasNetworkError ? 400 : 300)
    throw failed[0].reason
  }
  /**
   * 选择位置：用静态数据里的 adcode 换取和风天气的位置对象，再拉取天气
   * （地址选择页只传 adcode，避免把中文地名直接拼进请求）
   * @param {string} adcode
   */
  const chooseLocation = async (adcode) => {
    const res = await lookupCity(adcode)
    const city = res?.location?.[0]
    if (!city) {
      throw new Error('没有找到该地区的天气数据，换一个城市试试')
    }
    await getLocationInformation({ city, isSearch: true })
    return city
  }
  /**
   * 按地图点选的坐标选位置。
   * 和风的城市搜索支持经纬度入参（最新文档：location=116.41,39.92），
   * 所以不需要任何第三方地理编码，返回的就是离这个点最近的区县。
   *
   * 这次反查同时决定了「地址文案里的区县」：它和天气一样按坐标查，
   * 所以哪怕三级下拉框选的是北京、pin 拖到了天津，地址也会跟着坐标变成天津的区县。
   *
   * @param {{ lng: number, lat: number, road?: string, district?: string,
   *   districtSource?: string }} point
   *   落库坐标（和风的坐标系：大陆 GCJ-02）；road / district 是选点处的地名与区县名，只用于展示
   */
  const choosePoint = async ({ lng, lat, road = '', district = '', districtSource = '' }) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      throw new Error('坐标无效，请在地图上重新选点')
    }
    // 和风地理编码最多接受两位小数；反查结果会按两位小数坐标缓存，
    // 地图那边刚查过的同一个点不会重复消耗额度
    let place
    try {
      place = await lookupPlaceByCoord(lng, lat)
    } catch (error) {
      if (error?.code === 'NO_RESULT') {
        throw new Error('这个位置附近没有天气数据，换个地方试试')
      }
      throw error
    }
    const city = place?.raw
    if (!city?.id) {
      throw new Error('这个位置附近没有天气数据，换个地方试试')
    }
    // 高德 / 地图侧已经给了区县名就用它（高德带「区 / 县 / 市」后缀，更完整），
    // 否则用这次坐标反查到的区县名。两者都是坐标级的，不会再挂上下拉框的标签。
    // 调用方带来的 district 只有明确标了来源才照单全收；没标来源的（老记录）
    // 先和坐标反查结果核对，对不上就换成坐标反查的名字
    const trustedSource = districtSource === 'amap' || districtSource === 'qweather'
      ? districtSource
      : ''
    const mismatch = !!district && !trustedSource && !isSameAdminName(district, place.name)
    const finalDistrict = String((mismatch ? place.name : (district || place.name)) || '').trim()
    const finalSource = finalDistrict
      ? (trustedSource || (isSameAdminName(finalDistrict, place.name) ? 'qweather' : ''))
      : ''
    await getLocationInformation({
      city,
      isSearch: true,
      point: {
        // 展示与预警保留四位小数，比查询精度更高，方便以后回溯
        lng: Number(lng.toFixed(4)),
        lat: Number(lat.toFixed(4)),
        // 坐标系标记：和风的（大陆 GCJ-02）。老记录没有它，启动时由 migrateLegacyPoint 补上
        crs: 'GCJ02',
        // 路名/区县/市名一起存进 point：它会随 store 持久化，卡片地址和「最近」都读它，
        // 比「黄岩区 · 28.66, 121.21」这种两位小数坐标好认。
        // 市名用这次坐标反查到的 adm2：没填高德 key 时地址只能到区县，
        // 文案要写成「台州市 黄岩附近」，单独一个区名太单薄
        road: String(road || ''),
        district: finalDistrict,
        city: String(place.adm2 || '').trim(),
        // 'amap' / 'qweather'：告诉主界面这个区县名是坐标级地名，可以直接信
        districtSource: finalSource,
      },
    })
    return city
  }
  /**
   * 用重新查到的坐标级地名更新当前点（高德密钥变更后由 useAddressRefresh 调用）。
   *
   * 只改展示字段，不重发天气请求：坐标没变，天气缓存仍然有效。
   * 路名允许被更新成空串（清空高德 key 时要退回「xx附近」，不能留着旧路名）；
   * 区县 / 市名只在拿到非空值时才覆盖，避免一次失败的兜底把已有地址冲掉。
   * @param {{road?:string, district?:string, city?:string, districtSource?:string}} [address]
   */
  const applyPointAddress = (address = {}) => {
    const point = dayDateCity.value?.point
    if (!point) return
    const next = { ...point }
    if (address.road !== undefined) next.road = String(address.road || '')
    const district = String(address.district || '').trim()
    if (district) next.district = district
    const city = String(address.city || '').trim()
    if (city) next.city = city
    if (address.districtSource !== undefined) next.districtSource = String(address.districtSource || '')
    dayDateCity.value = { ...dayDateCity.value, point: next }
  }
  /**
   * 新版预警接口（/weatheralert/v1/current）的字段和旧版（/v7/warning/now）完全不同，
   * 这里统一归一化成模板一直在用的那套字段名，UI 侧（天气卡预警 chip、预警详情弹窗）
   * 就不用跟着改。额外的 criteria / instruction 也一并带上，需要时可以取。
   */
  const WARNING_COLOR_CN = {
    white: '白色',
    gray: '灰色',
    green: '绿色',
    blue: '蓝色',
    yellow: '黄色',
    amber: '橙色',
    orange: '橙色',
    red: '红色',
    purple: '紫色',
    black: '黑色',
  }
  const normalizeWarning = (alert) => ({
    id: alert.id,
    // 旧字段名 ← 新字段名
    title: alert.headline || alert.eventType?.name || '',
    text: alert.description || '',
    type: alert.eventType?.code || '',
    typeName: alert.eventType?.name || '',
    // 中国预警只会用到蓝/黄/橙/红四种颜色，其余档位做个兜底映射
    level: WARNING_COLOR_CN[alert.color?.code] || '',
    severity: alert.severity || '',
    urgency: alert.urgency || '',
    certainty: alert.certainty || '',
    // alert（新增）/ update（更新）/ cancel（取消）
    status: alert.messageType?.code || '',
    sender: alert.senderName || '',
    pubTime: alert.issuedTime || '',
    startTime: alert.onsetTime || alert.effectiveTime || '',
    endTime: alert.expireTime || '',
    criteria: alert.criteria || '',
    instruction: alert.instruction || '',
  })

  /* ---- 坐标：所有天气接口都按经纬度查 ---- */

  /**
   * 当前查询坐标：地图点选优先，否则用区县中心。
   * 两者都是和风的坐标系（大陆 GCJ-02，境外 WGS-84）—— 点选坐标在落库前
   * 已经由地图组件换算过，CityDetail 是接口自己返回的，所以这里不需要再转。
   */
  const weatherCoord = computed(() => {
    const point = dayDateCity.value.point
    if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
      return { lat: point.lat, lon: point.lng }
    }
    const detail = dayDateCity.value.CityDetail
    if (detail && Number.isFinite(Number(detail.lat)) && Number.isFinite(Number(detail.lon))) {
      return { lat: Number(detail.lat), lon: Number(detail.lon) }
    }
    return null
  })

  /**
   * 缓存 key 用两位小数：和接口精度一致（约 1.1 km）。
   * 同一个格点无论点几次都命中同一份缓存；三位小数只会让同一份数据产生多个条目。
   */
  const coordKey = (coord) => `${coord.lat.toFixed(2)},${coord.lon.toFixed(2)}`

  // 在途请求 / 缓存的 key：优先坐标，坐标还没就绪时退回 LocationID
  const currentKey = () =>
    weatherCoord.value ? coordKey(weatherCoord.value) : String(dayDateCity.value.location)

  /**
   * 拿不到坐标时补查一次城市信息（老缓存里可能没有 CityDetail）。
   * 同时带出时区，供每日预报把 ISO 时间换算成当地地方时。
   */
  const ensureWeatherCoord = async () => {
    if (weatherCoord.value) {
      return { ...weatherCoord.value, tz: dayDateCity.value.CityDetail?.tz }
    }
    const res = await lookupCity(dayDateCity.value.location)
    const city = res?.location?.[0]
    if (!city?.lat || !city?.lon) {
      throw new Error('缺少经纬度，无法查询天气')
    }
    dayDateCity.value = { ...dayDateCity.value, CityDetail: city }
    return { lat: Number(city.lat), lon: Number(city.lon), tz: city.tz }
  }

  // 获取天气预警信息
  const getWeatherEarlyWarning = (important) =>
    singleFlight(`warning:${currentKey()}`, () => loadWeatherEarlyWarning(important))

  /**
   * 预警接口按经纬度查询，直接用统一坐标（地图点选 > 区县中心）。
   */
  const resolveWarningCoord = async () => {
    const { lat, lon } = await ensureWeatherCoord()
    return { lat, lon }
  }

  const loadWeatherEarlyWarning = async (important) => {
    // 验证数据有效期
    const TimeInterval = Date.now() - WeatherDataUpdatedAtATime.value.EarlyWarning
    if (isFresh('warning', WeatherDataUpdatedAtATime.value.EarlyWarning, important)) {
      console.log(`天气预警未过期：${(TimeInterval / 1000 / 60).toFixed(0)} min前更新`);
      return
    }
    ReviseState(100)
    // 执行请求
    console.log(`天气预警过期、重新获取`);
    const { alerts } = await getWeatherWarnings(await resolveWarningCoord())
    // 当地没有预警时返回空数组（metadata.zeroResult = true），不是错误
    WeatherEarlyWarning.value = (alerts || []).map(normalizeWarning)
    WeatherDataUpdatedAtATime.value.EarlyWarning = Date.now()
  }
  // 获取生活指数
  const getWeatherIndices = (important) =>
    singleFlight(`indices:${currentKey()}`, () => loadWeatherIndices(important))
  // 生活指数失败后的重试间隔（毫秒）：既避免无权限等固定失败每次轮询都重试，
  // 也不至于一次网络抖动就让指数停更一整个缓存周期。
  // 单独记「下次可重试时间」，不再像旧版那样把 Indices 时间戳往前挪：
  // 时间戳一挪就可能落到前一天，跨零点失效会把一次失败判成「一整天都过期」，
  // 之后每分钟都去撞同一个固定失败（例如 403 无权限）。
  const INDICES_RETRY_MS = 300000
  let IndicesRetryAt = 0
  const loadWeatherIndices = async (important) => {
    if (isFresh('indices', WeatherDataUpdatedAtATime.value.Indices, important)) {
      return
    }
    // 失败退避：手动刷新（important）不受它限制
    if (!important && IndicesRetryAt && Date.now() < IndicesRetryAt) {
      return
    }
    try {
      const { daily } = await getWeatherIndicesAPI(await ensureWeatherCoord(), INDICES_TYPES)
      // 7 条全部保留：改版后左栏是「4 列选择器 + 聚焦卡」，
      // 受高度限制的是选择器占几行，而不是能放几条，所以不再截断
      WeatherIndices.value = daily || []
      WeatherDataUpdatedAtATime.value.Indices = Date.now()
      IndicesRetryAt = 0
    } catch (error) {
      IndicesRetryAt = Date.now() + INDICES_RETRY_MS
      throw error
    }
  }
  /* ---- 分钟级降水 ---- */

  // 上次成功/失败的时间戳、坐标 key 和凭据指纹只放内存：分钟级降水不持久化 ——
  // 重载页面时宁可重拉一次，也不想把两小时前的雨画在今天的卡片上。
  let MinutelyFetchedAt = 0
  let MinutelyKey = ''
  let MinutelyFingerprint = ''
  // 失败后的重试间隔：网络/服务端抖动 10 分钟后再试；「没有数据」（境外不支持或临时缺测，
  // 接口都返回 400 data-not-available）30 分钟再试 —— 既不会每个轮询周期都去撞一次，
  // 也能让中国境内偶发的缺测自己恢复
  const MINUTELY_RETRY_MS = 600000
  const MINUTELY_UNSUPPORTED_RETRY_MS = 1800000

  const isMinutelyUnsupported = (error) =>
    String(error?.code || '') === '400' && String(error?.type || '').includes('data-not-available')

  const getMinutelyPrecipitation = (important = false) =>
    singleFlight(`minutely:${currentKey()}`, () => loadMinutelyPrecipitation(important))

  const loadMinutelyPrecipitation = async (important) => {
    const key = currentKey()
    const fingerprint = UserApiFingerprint.value
    // 换了城市、或者换了域名/密钥：旧数据和「失败重试计时」都作废 ——
    // 否则用户改好凭据后，胶囊还会顶着上一次的 401 显示十来分钟「不可用」
    if (key !== MinutelyKey || fingerprint !== MinutelyFingerprint) {
      MinutelyKey = key
      MinutelyFingerprint = fingerprint
      MinutelyFetchedAt = 0
      MinutelyPrecipitation.value = null
      MinutelyStatus.value = 'idle'
    }
    if (!important) {
      // 成功的数据按缓存时效走；失败的不重试太勤
      if (MinutelyStatus.value === 'ready' && isFresh('minutely', MinutelyFetchedAt, false)) return
      if (MinutelyStatus.value === 'unsupported' || MinutelyStatus.value === 'error') {
        const retryMs = MinutelyStatus.value === 'unsupported' ? MINUTELY_UNSUPPORTED_RETRY_MS : MINUTELY_RETRY_MS
        if (MinutelyFetchedAt && Date.now() - MinutelyFetchedAt < retryMs) return
      }
    }
    const coord = weatherCoord.value || (await ensureWeatherCoord().catch(() => null))
    if (!coord) {
      MinutelyStatus.value = 'error'
      return
    }
    if (!MinutelyPrecipitation.value) MinutelyStatus.value = 'loading'
    try {
      const data = await getMinutelyPrecipitationAPI({ lat: coord.lat, lon: coord.lon })
      // 请求期间用户换了城市 / 改了凭据：这份结果已经不属于当前上下文，直接丢掉
      if (key !== MinutelyKey || fingerprint !== MinutelyFingerprint) return
      MinutelyPrecipitation.value = { ...data, key, fetchedAt: Date.now() }
      MinutelyFetchedAt = Date.now()
      MinutelyStatus.value = 'ready'
    } catch (error) {
      if (key !== MinutelyKey || fingerprint !== MinutelyFingerprint) return
      const unsupported = isMinutelyUnsupported(error)
      MinutelyFetchedAt = Date.now()
      if (MinutelyPrecipitation.value) {
        // 手里还有上一次的数据就先接着用：它的时间戳会让按钮自己显示「待更新」
        MinutelyStatus.value = 'ready'
      } else {
        MinutelyStatus.value = unsupported ? 'unsupported' : 'error'
      }
      // 「境外不支持」是预期内的结果，不值得刷错误日志；其它失败要能看到
      if (!unsupported) console.error('分钟级降水获取失败：', error)
    }
  }

  const openMinutelyDetails = () => {
    // 两个全屏弹层不叠着开（都带整页模糊，叠起来既糊又晃）
    EarlyWarningDetailsDialog.value = false
    MinutelyDetailsDialog.value = true
    // 打开时顺手刷一次（仍受缓存时效约束，不会每点一下都发请求）
    getMinutelyPrecipitation().catch(() => {})
  }

  const openWarningDetails = () => {
    MinutelyDetailsDialog.value = false
    EarlyWarningDetailsDialog.value = true
  }

  // 弹层里的「重试」：跳过缓存直接拉
  const retryMinutelyPrecipitation = () => getMinutelyPrecipitation(true).catch(() => {})

  // 获取4日天气
  const getFourDayWeatherData = (important) =>
    singleFlight(`fourDays:${currentKey()}`, () => loadFourDayWeatherData(important))
  const loadFourDayWeatherData = async (important) => {
    const TimeInterval = Date.now() - WeatherDataUpdatedAtATime.value.FourDayWeather
    if (isFresh('fourDays', WeatherDataUpdatedAtATime.value.FourDayWeather, important)) {
      console.log(`4日天气未过期：${(TimeInterval / 1000 / 60).toFixed(0)} min前更新`);
      return
    }
    ReviseState(100)
    console.log(`4日天气过期、重新获取`);
    // 接口层已经归一化好字段，这里只补「今天 / 明天 / 周X」的显示标签
    const { daily } = await get7DayForecast(await ensureWeatherCoord());
    FourDayWeatherData.value = (daily || []).slice(0, 4).map((item, index) => ({
      ...item,
      fxDate: index === 0 ? '今天' : index === 1 ? '明天' : getDayName(item.fxDate),
    }));
    WeatherDataUpdatedAtATime.value.FourDayWeather = Date.now()
  }
  // 获取实时天气
  const getRealTimeWeather = (important) =>
    singleFlight(`now:${currentKey()}`, () => loadRealTimeWeather(important))
  const loadRealTimeWeather = async (important) => {
    const TimeInterval = Date.now() - WeatherDataUpdatedAtATime.value.RealTimeWeather
    if (isFresh('realtime', WeatherDataUpdatedAtATime.value.RealTimeWeather, important)) {
      console.log(`实时天气未过期：${(TimeInterval / 1000 / 60).toFixed(0)} min前更新`);
      return
    }
    // 获取实时天气
    ReviseState(100)
    console.log(`实时天气过期、重新获取`, getCacheTtl('realtime'));
    const now = await getCurrentWeather(await ensureWeatherCoord())
    nowWeatherData.value = {
      icon: now.icon,
      temp: now.temp,
      text: now.text,
      feelsLike: now.feelsLike,
    }
    // v1 的实时天气不带 obsTime，日期用本机时间即可（壁纸就跑在用户机器上）
    const nowTs = new Date()
    dayDateCity.value = {
      ...dayDateCity.value,
      day: getDayName(nowTs, '2'),
      date: formatDate(nowTs)
    }
    WeatherDataUpdatedAtATime.value.RealTimeWeather = Date.now()
  }
  // 日期转中文1
  function getDayName(dateStr, dayType = '1') {
    // 纯日期（YYYY-MM-DD）按本地零点解析：new Date('2024-08-11') 会被当成 UTC，
    // 在负时区会差一天
    const date = typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? new Date(`${dateStr}T00:00:00`)
      : new Date(dateStr);
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dayNames2 = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const dayName = dayType === '1' ? dayNames[date.getDay()] : dayNames2[date.getDay()];
    return dayName;
  }
  // 日期转中文2
  function formatDate(dateStr) {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}年${month}月${day}日`;
  }




  /**
   * 0：未知错误
   * 100：加载中 
   * 200：加载成功 
   * 300：加载失败 
   * 400：无网络 
   * @param {
   * } code 
   */
  function ReviseState(code) {
    TheWeatherDataIsLoaded.value = code
  }
  return {
    // 获取位置/天气
    getLocationInformation,
    chooseLocation,
    choosePoint,
    // 高德密钥变更后只刷新地址文案，不重发天气请求
    applyPointAddress,
    getFourDayWeatherData,
    getRealTimeWeather,
    getWeatherEarlyWarning,
    getWeatherIndices,
    getMinutelyPrecipitation,
    retryMinutelyPrecipitation,
    openMinutelyDetails,
    openWarningDetails,
    // 修改天气状态
    ReviseState,
    // 城市时间日期
    dayDateCity,
    // 地址文案：区县名（「黄岩区」）/ 完整地址（「黄岩区 中学路」）
    CityDisplayName,
    CityDistrictLabel,
    CityAddressLabel,
    // 近四天天气
    FourDayWeatherData,
    // 实时天气
    nowWeatherData,
    WeatherDataUpdatedAtATime,
    // 当前缓存对应的凭据指纹（持久化：重载后凭据没变就可以继续用缓存）
    WeatherCacheFingerprint,
    WeatherDataUpdatedAtATimeComputed,
    TheWeatherDataIsLoaded,
    WeatherEarlyWarning,
    WeatherIndices,
    EarlyWarningDetailsDialog,
    MinutelyPrecipitation,
    MinutelyStatus,
    MinutelyDetailsDialog
  }
}, {
  persist: {
    key: WEATHER_CACHE_STORAGE_KEY,
    // 只持久化天气数据本身。dayDateCity（用户选的地址）不在列表里 ——
    // 它有自己的 key（见上面的 DAY_DATE_CITY_STORAGE_KEY），
    // 这样以后清空 / 废弃天气缓存永远不会把用户选的位置一起冲掉。
    paths: [
      'FourDayWeatherData',
      'nowWeatherData',
      'WeatherEarlyWarning',
      'WeatherIndices',
      'WeatherDataUpdatedAtATime',
      'WeatherCacheFingerprint',
      'TheWeatherDataIsLoaded'
    ]
  },
})
