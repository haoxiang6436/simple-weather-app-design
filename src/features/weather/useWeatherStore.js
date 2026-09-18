import { defineStore } from 'pinia'
import { get7DayForecast, getCurrentWeather, getWeatherWarnings, getWeatherIndices as getWeatherIndicesAPI } from '@/api/weather';
import { isNetworkError } from '@/api/errors';
import { ref, computed } from 'vue';

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
  // 缓存是否仍然有效（important = 手动定位，强制刷新，不看缓存）
  const isFresh = (updatedAt, ttl, important) =>
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
  // 城市日期信息
  const dayDateCity = ref({
    day: '星期日',
    date: '2025年6月1日',
    city: '北京市，北京',
    location: 101010100,
    area_code: null
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
  // 生活指数数据
  const WeatherIndices = ref([])
  // 获取位置信息
  const getLocationInformation = async (option) => {
    WeatherDataUpdatedAtATime.value.nowDate = Date.now()
    const important = !!option?.isSearch
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
    if (important) {
      await getWeatherIndices(important).catch(() => {})
    }
    const failed = results.filter((result) => result.status === 'rejected')
    if (failed.length === 0) {
      ReviseState(200)
      return
    }
    // 部分失败：网络错误 → 400，其它错误 → 300
    const hasNetworkError = failed.some((result) => isNetworkError(result.reason))
    console.error('部分天气请求失败：', failed.map((result) => result.reason))
    ReviseState(hasNetworkError ? 400 : 300)
    throw failed[0].reason
  }
  // 获取天气预警信息
  const getWeatherEarlyWarning = (important) =>
    singleFlight(`warning:${dayDateCity.value.location}`, () => loadWeatherEarlyWarning(important))
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
    const { warning } = await getWeatherWarnings(dayDateCity.value.location)
    WeatherEarlyWarning.value = warning
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
      WeatherIndices.value = (daily || []).slice(0, 6)
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
    WeatherDataUpdatedAtATimeComputed,
    TheWeatherDataIsLoaded,
    WeatherEarlyWarning,
    WeatherIndices,
    EarlyWarningDetailsDialog
  }
}, {
  persist: {
    key: 'WeatherApp-2026-9-1'
  },
})
