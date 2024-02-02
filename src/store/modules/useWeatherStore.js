import { defineStore } from 'pinia'
import { getGeographicalLocationAPI, getCityLatitudeAndLatitudeAPI, get_7DaysOfWeatherAPI, getRealTimeWeatherAPI } from '@/apis/getWeatherAPI';
import { ref } from 'vue';

export const useWeatherStore = defineStore('Weather', () => {
  const dayDateCity = ref({
    day: '星期八',
    date: '2028年8月8日',
    city: '中国大陆',
  })
  const WeatherDataUpdatedAtATime = ref({
    FourDayWeather: 0,
    RealTimeWeather: 0
  })
  const FourDayWeatherData = ref(
    [
      {
        fxDate: "今天",
        tempMax: "6",
        tempMin: "4",
        iconDay: "305",
        precip: "1.0",
        humidity: "94",
        windSpeedDay: "9"
      },
      {
        fxDate: "明天",
        tempMax: "6",
        tempMin: "4",
        iconDay: "305",
        precip: "1.0",
        humidity: "94",
        windSpeedDay: "9"
      },
      {
        fxDate: "星期一",
        tempMax: "6",
        tempMin: "4",
        iconDay: "305",
        precip: "1.0",
        humidity: "94",
        windSpeedDay: "9"
      },
      {
        fxDate: "星期二",
        tempMax: "6",
        tempMin: "4",
        iconDay: "305",
        precip: "1.0",
        humidity: "94",
        windSpeedDay: "9"
      },
    ]
  )
  const nowWeatherData = ref({
    icon: '100',
    temp: '0',
    text: '晴',
  })
  const getLocationInformation = async () => {
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
    const TimeInterval = new Date().getTime() - WeatherDataUpdatedAtATime.value.FourDayWeather
    if (TimeInterval < 1000 * 60 * 120 && WeatherDataUpdatedAtATime.value.FourDayWeather && !important) {
      console.log('实时天气未过期 < 30min：', TimeInterval / 1000);
      return
    }
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
    WeatherDataUpdatedAtATime.value.FourDayWeather = new Date().getTime()
  }
  const getRealTimeWeather = async (important) => {
    const TimeInterval = new Date().getTime() - WeatherDataUpdatedAtATime.value.RealTimeWeather
    if (TimeInterval < 1000 * 60 * 30 && WeatherDataUpdatedAtATime.value.RealTimeWeather && !important) {
      console.log('4日天气未过期 < 120min：', TimeInterval / 1000);
      return
    }
    // 获取实时天气
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
    WeatherDataUpdatedAtATime.value.RealTimeWeather = new Date().getTime()
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
  return {
    // 获取位置/天气
    getLocationInformation,
    getFourDayWeatherData,
    getRealTimeWeather,
    // 城市时间日期
    dayDateCity,
    // 近四天天气
    FourDayWeatherData,
    // 实时天气
    nowWeatherData,
    WeatherDataUpdatedAtATime
  }
}, {
  persist: {
    key: 'WeatherApp-2024-2-1'
  },
})