import { defineStore } from 'pinia'
import { get_7DaysOfWeatherAPI, getRealTimeWeatherAPI, getWeatherEarlyWarningAPI } from '@/apis/getWeatherAPI';
import { ref, computed } from 'vue';



export const useWallpaperOptionsStore = defineStore('WallpaperOptions', () => {
  const WallpaperOptions = ref({
    TheFirstTime: true,
  })
  return {
    WallpaperOptions
  }
}, {
  persist: {
    key: 'WallpaperOptions-2025-4.23'
  },
})

export const useWeatherStore = defineStore('Weather', () => {
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
  })
  // 计算天气数据更新时间与当前时间之间的差值（分钟）
  const WeatherDataUpdatedAtATimeComputed = computed(() => {
    return ((WeatherDataUpdatedAtATime.value.nowDate - WeatherDataUpdatedAtATime.value.RealTimeWeather) / 1000 / 60).toFixed(0)
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
  // 获取位置信息
  const getLocationInformation = async (option) => {
    WeatherDataUpdatedAtATime.value.nowDate = Date.now()
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
      await Promise.all([getFourDayWeatherData(true), getRealTimeWeather(true), getWeatherEarlyWarning(true)])
    }
    else {
      await Promise.all([getFourDayWeatherData(), getRealTimeWeather(), getWeatherEarlyWarning()])
    }
    ReviseState(200)
  }
  // 获取天气预警信息
  const getWeatherEarlyWarning = async (important) => {
    // 验证数据有效期
    const TimeInterval = Date.now() - WeatherDataUpdatedAtATime.value.EarlyWarning
    if (TimeInterval < process.env.VUE_APP_WEATHER_UPDATE_WARNING && WeatherDataUpdatedAtATime.value.FourDayWeather && !important) {
      console.log(`天气预警未过期：${(TimeInterval / 1000 / 60).toFixed(0)} min前更新`);
      return
    }
    ReviseState(100)
    // 执行请求
    console.log(`天气预警过期、重新获取`);
    const { warning } = await getWeatherEarlyWarningAPI(dayDateCity.value.location)
    WeatherEarlyWarning.value = warning
    WeatherDataUpdatedAtATime.value.EarlyWarning = Date.now()
  }
  // 获取4日天气
  const getFourDayWeatherData = async (important) => {
    const TimeInterval = Date.now() - WeatherDataUpdatedAtATime.value.FourDayWeather
    if (TimeInterval < process.env.VUE_APP_WEATHER_UPDATE_FOURDAYS && WeatherDataUpdatedAtATime.value.FourDayWeather && !important) {
      console.log(`4日天气未过期：${(TimeInterval / 1000 / 60).toFixed(0)} min前更新`);
      return
    }
    ReviseState(100)
    console.log(`4日天气过期、重新获取`);
    const { daily } = await get_7DaysOfWeatherAPI(dayDateCity.value.location);
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
  const getRealTimeWeather = async (important) => {
    const TimeInterval = Date.now() - WeatherDataUpdatedAtATime.value.RealTimeWeather
    if (TimeInterval < process.env.VUE_APP_WEATHER_UPDATE_REALTIME && WeatherDataUpdatedAtATime.value.RealTimeWeather && !important) {
      console.log(`实时天气未过期：${(TimeInterval / 1000 / 60).toFixed(0)} min前更新`);
      return
    }
    // 获取实时天气
    ReviseState(100)
    console.log(`实时天气过期、重新获取`,process.env.VUE_APP_WEATHER_UPDATE_REALTIME);
    const { now } = await getRealTimeWeatherAPI(dayDateCity.value.location)
    nowWeatherData.value = {
      icon: now.icon,
      temp: now.temp,
      text: now.text,
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
    EarlyWarningDetailsDialog
  }
}, {
  persist: {
    key: 'WeatherApp-2025-4-23'
  },
})