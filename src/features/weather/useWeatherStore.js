import { defineStore } from 'pinia'
import { get7DayForecast, getCurrentWeather, getWeatherWarnings, getWeatherIndices as getWeatherIndicesAPI, lookupCity } from '@/api/weather';
import { isNetworkError } from '@/api/errors';
import Bus from '@/shared/Bus';
import { BUS_EVENTS } from '@/features/wallpaper/constants';
import { UserApiFingerprint } from '@/api/credentials';
import { ref, computed } from 'vue';
import { useStorage } from '@vueuse/core';

// 天气数据缓存的 localStorage key。
// 注意：它必须定义在模块作用域 —— 下面 defineStore 的 persist 选项是在模块加载时求值的，
// 写在 setup 函数里会拿不到（ReferenceError，整个页面起不来）。
// 地址等其他数据各有自己的 key，绝不要复用这一个。
const WEATHER_CACHE_STORAGE_KEY = 'WeatherApp-2026-9-1'

export const useWeatherStore = defineStore('Weather', () => {
  // 展示的生活指数类型 ID（运动/洗车/穿衣/紫外线/旅游/舒适度/感冒）
  const INDICES_TYPES = '1,2,3,5,6,8,9'
  // 各接口缓存时效（毫秒），可通过 .env 覆盖
  const CACHE_MS = {
    // 实时天气
    realtime: Number(process.env.VUE_APP_WEATHER_UPDATE_REALTIME) || 600000,
    // 7 日预报（面板只取前 4 天）
    fourDays: Number(process.env.VUE_APP_WEATHER_UPDATE_FOURDAYS) || 7200000,
    // 天气预警
    warning: Number(process.env.VUE_APP_WEATHER_UPDATE_WARNING) || 600000,
    // 生活指数
    indices: Number(process.env.VUE_APP_WEATHER_UPDATE_INDICES) || 10800000,
  }
  // 当前缓存对应的凭据指纹：用户换了域名/密钥后，旧缓存整体失效，避免继续展示别人的额度拉到的数据
  const WeatherCacheFingerprint = ref(UserApiFingerprint.value)
  /* 缓存结构版本：只有「老缓存不再适用」的改版才 +1（例：生活指数从 6 条变 7 条）。
     它和凭据指纹一样参与下面的 isFresh 判定 —— 版本一对不上，所有接口缓存立刻过期，
     壁纸重载（= 用户更新到新版本）后就会重新拉一次天气，不需要用户重选地址。

     为什么单独用一个 localStorage key，而不是放进 pinia 的 persist：
     pinia-plugin-persistedstate 恢复时是「缺字段就跳过」，老用户的持久化状态里根本没有这个字段，
     ref 会停在代码里的默认值（= 新版本号）上，于是永远判不出「这是旧版本留下的缓存」。
     useStorage 的语义正好相反 —— key 不存在就取默认值 0，老用户自然落在「过期」这一侧。

     也不要改 persist 的 key 来代替它：persist 里存着 dayDateCity，换 key 会连用户选的城市一起清掉，
     而 WeatherLocationChosenAt 还留着，结果就是「已经选过地址」却显示默认城市的天气。 */
  const CACHE_VERSION = 3
  const CacheDataVersion = useStorage('WeatherCacheDataVersion', 0)
  // 缓存是否仍然有效（important = 手动定位，强制刷新，不看缓存）
  const isFresh = (updatedAt, ttl, important) =>
    CacheDataVersion.value === CACHE_VERSION &&
    WeatherCacheFingerprint.value === UserApiFingerprint.value &&
    !important && !!updatedAt && Date.now() - updatedAt < ttl
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
  // 生活指数数据
  const WeatherIndices = ref([])
  // 获取位置信息
  const getLocationInformation = async (option) => {
    WeatherDataUpdatedAtATime.value.nowDate = Date.now()
    // important = 手动定位或（引导完成后）强制刷新，跳过缓存
    const important = !!(option?.isSearch || option?.force)
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
      const { city } = option
      dayDateCity.value = {
        ...dayDateCity.value,
        city: city.adm1 === city.name ? city.adm1 : `${city.adm1}, ${city.name}`,
        location: city.id,
        area_code: null,
        CityDetail: city,
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

  // 获取天气预警信息
  const getWeatherEarlyWarning = (important) =>
    singleFlight(`warning:${dayDateCity.value.location}`, () => loadWeatherEarlyWarning(important))

  /**
   * 预警接口按经纬度查询，经纬度优先用已选城市自带的（lookupCity 的返回里就有，
   * 且随 dayDateCity 一起持久化）；老缓存里没有 CityDetail 时补查一次并回填，
   * 避免每一轮预警请求都多打一次城市查询。
   */
  const resolveWarningCoord = async () => {
    const detail = dayDateCity.value.CityDetail
    if (detail?.lat && detail?.lon) return { lat: detail.lat, lon: detail.lon }
    const res = await lookupCity(dayDateCity.value.location)
    const city = res?.location?.[0]
    if (!city?.lat || !city?.lon) {
      throw new Error('缺少经纬度，无法查询天气预警')
    }
    dayDateCity.value = { ...dayDateCity.value, CityDetail: city }
    return { lat: city.lat, lon: city.lon }
  }

  const loadWeatherEarlyWarning = async (important) => {
    // 验证数据有效期
    const TimeInterval = Date.now() - WeatherDataUpdatedAtATime.value.EarlyWarning
    if (isFresh(WeatherDataUpdatedAtATime.value.EarlyWarning, CACHE_MS.warning, important)) {
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
    singleFlight(`indices:${dayDateCity.value.location}`, () => loadWeatherIndices(important))
  // 生活指数失败后的重试间隔（毫秒）：既避免无权限等固定失败每次轮询都重试，
  // 也不至于一次网络抖动就让指数停更一整个缓存周期
  const INDICES_RETRY_MS = 300000
  const loadWeatherIndices = async (important) => {
    if (isFresh(WeatherDataUpdatedAtATime.value.Indices, CACHE_MS.indices, important)) {
      return
    }
    try {
      const { daily } = await getWeatherIndicesAPI(dayDateCity.value.location, INDICES_TYPES)
      // 7 条全部保留：改版后左栏是「4 列选择器 + 聚焦卡」，
      // 受高度限制的是选择器占几行，而不是能放几条，所以不再截断
      WeatherIndices.value = daily || []
      WeatherDataUpdatedAtATime.value.Indices = Date.now()
    } catch (error) {
      // 失败也记录时间（避免固定失败每次都重试），但只延后 INDICES_RETRY_MS
      WeatherDataUpdatedAtATime.value.Indices = Date.now() - CACHE_MS.indices + INDICES_RETRY_MS
      throw error
    }
  }
  // 获取4日天气
  const getFourDayWeatherData = (important) =>
    singleFlight(`fourDays:${dayDateCity.value.location}`, () => loadFourDayWeatherData(important))
  const loadFourDayWeatherData = async (important) => {
    const TimeInterval = Date.now() - WeatherDataUpdatedAtATime.value.FourDayWeather
    if (isFresh(WeatherDataUpdatedAtATime.value.FourDayWeather, CACHE_MS.fourDays, important)) {
      console.log(`4日天气未过期：${(TimeInterval / 1000 / 60).toFixed(0)} min前更新`);
      return
    }
    ReviseState(100)
    console.log(`4日天气过期、重新获取`);
    const { daily } = await get7DayForecast(dayDateCity.value.location);
    FourDayWeatherData.value = daily.slice(0, 4).map((item, index) => {
      return {
        // 日期
        fxDate: index === 0 ? '今天' : index === 1 ? '明天' : getDayName(item.fxDate),
        // 最高温度
        tempMax: item.tempMax,
        // 最低温度
        tempMin: item.tempMin,
        // 天气图标
        iconDay: item.iconDay,
        iconNight: item.iconNight,
        // 白天/夜间天气文案
        textDay: item.textDay,
        textNight: item.textNight,
        // 日出日落
        sunrise: item.sunrise,
        sunset: item.sunset,
        // 紫外线 / 气压 / 能见度 / 云量
        uvIndex: item.uvIndex,
        pressure: item.pressure,
        vis: item.vis,
        cloud: item.cloud,
        // 风向 / 风力
        windDirDay: item.windDirDay,
        windScaleDay: item.windScaleDay,
        // 降雨量
        precip: item.precip,
        // 湿度
        humidity: item.humidity,
        // 风速
        windSpeedDay: item.windSpeedDay,
      }
    });
    WeatherDataUpdatedAtATime.value.FourDayWeather = Date.now()
  }
  // 获取实时天气
  const getRealTimeWeather = (important) =>
    singleFlight(`now:${dayDateCity.value.location}`, () => loadRealTimeWeather(important))
  const loadRealTimeWeather = async (important) => {
    const TimeInterval = Date.now() - WeatherDataUpdatedAtATime.value.RealTimeWeather
    if (isFresh(WeatherDataUpdatedAtATime.value.RealTimeWeather, CACHE_MS.realtime, important)) {
      console.log(`实时天气未过期：${(TimeInterval / 1000 / 60).toFixed(0)} min前更新`);
      return
    }
    // 获取实时天气
    ReviseState(100)
    console.log(`实时天气过期、重新获取`, CACHE_MS.realtime);
    const { now } = await getCurrentWeather(dayDateCity.value.location)
    nowWeatherData.value = {
      icon: now.icon,
      temp: now.temp,
      text: now.text,
      feelsLike: now.feelsLike,
    }
    dayDateCity.value = {
      ...dayDateCity.value,
      day: getDayName(now.obsTime, '2'),
      date: formatDate(now.obsTime)
    }
    WeatherDataUpdatedAtATime.value.RealTimeWeather = Date.now()
  }
  // 日期转中文1
  function getDayName(dateStr, dayType = '1') {
    const date = new Date(dateStr);
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
    getFourDayWeatherData,
    getRealTimeWeather,
    getWeatherEarlyWarning,
    getWeatherIndices,
    // 修改天气状态
    ReviseState,
    // 城市时间日期
    dayDateCity,
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
    EarlyWarningDetailsDialog
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
