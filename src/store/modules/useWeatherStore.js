import { defineStore } from 'pinia'
import { getGeographicalLocationAPI, getCityLatitudeAndLatitudeAPI, get_7DaysOfWeatherAPI, getRealTimeWeatherAPI } from '@/apis/getWeatherAPI';
import { ref, computed } from 'vue';

export const useWeatherStore = defineStore('Weather', () => {
  const TheWeatherDataIsLoaded = ref(100)
  const dayDateCity = ref({
    day: '星期八',
    date: '2028年8月8日',
    city: '中国大陆',
  })
  const WeatherDataUpdatedAtATime = ref({
    FourDayWeather: 0,
    RealTimeWeather: 0,
    nowDate: Date.now(),
  })
  const WeatherDataUpdatedAtATimeComputed = computed(() => {
    return ((WeatherDataUpdatedAtATime.value.nowDate - WeatherDataUpdatedAtATime.value.RealTimeWeather) / 1000 / 60).toFixed(0)
  })
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
  const nowWeatherData = ref({
    icon: '100',
    temp: '0',
    text: '晴',
  })
  const getLocationInformation = async () => {
    WeatherDataUpdatedAtATime.value.nowDate = Date.now()
    // 获取位置
    const { data: { adcode } } = await getGeographicalLocationAPI();
    // 获取location
    if (adcode !== dayDateCity.value.adcode) {
      console.log('位置变化');
      const { location } = await getCityLatitudeAndLatitudeAPI(adcode);
      dayDateCity.value = {
        ...dayDateCity.value,
        city: `${location[0].adm2}, ${location[0].name}`,
        location: location[0].id,
        adcode: adcode
      }
      await getFourDayWeatherData(true)
      await getRealTimeWeather(true)
      return
    }
  }
  const getFourDayWeatherData = async (important) => {
    const TimeInterval = Date.now() - WeatherDataUpdatedAtATime.value.FourDayWeather
    if (TimeInterval < 1000 * 60 * 60 * 2 && WeatherDataUpdatedAtATime.value.FourDayWeather && !important) {
      console.log(`4日天气未过期 < 2h：${(TimeInterval / 1000 / 60).toFixed(0)} 前更新`);
      return
    }
    ReviseState(100)
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
    FourDayWeatherData.value.map(item => {
      return {
        ...item,
        fxDate: item.fxDate
      }
    })
    WeatherDataUpdatedAtATime.value.FourDayWeather = Date.now()
  }
  const getRealTimeWeather = async (important) => {
    const TimeInterval = Date.now() - WeatherDataUpdatedAtATime.value.RealTimeWeather
    if (TimeInterval < 1000 * 60 * 5 && WeatherDataUpdatedAtATime.value.RealTimeWeather && !important) {
      console.log(`实时天气未过期 < 5min：${(TimeInterval / 1000 / 60).toFixed(0)} 前更新`);
      return
    }
    // 获取实时天气
    ReviseState(100)
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
  function getDayName(dateStr, dayType = '1') {
    const date = new Date(dateStr);
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dayNames2 = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const dayName = dayType === '1' ? dayNames[date.getDay()] : dayNames2[date.getDay()];
    return dayName;
  }
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
    TheWeatherDataIsLoaded
  }
}, {
  persist: {
    key: 'WeatherApp-2024-2-12'
  },
})