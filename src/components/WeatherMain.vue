<template>
  <div class="container">
    <div class="weather-side">
      <div class="weather-gradient"></div>
      <div class="date-container">
        <h2 class="date-dayname">{{ dayDateCity.day }}</h2>
        <span class="date-day">{{ dayDateCity.date }}</span>
        <svg class="location-icon" t="1706273774654" viewBox="0 0 1024 1024" version="1.1"
          xmlns="http://www.w3.org/2000/svg" p-id="4350" width="16" height="16">
          <path
            d="M512 938.666667c-53.333333 0-384-257.258667-384-469.333334S299.925333 85.333333 512 85.333333s384 171.925333 384 384-330.666667 469.333333-384 469.333334z m0-352c64.8 0 117.333333-52.533333 117.333333-117.333334s-52.533333-117.333333-117.333333-117.333333-117.333333 52.533333-117.333333 117.333333 52.533333 117.333333 117.333333 117.333334z"
            fill="#ffffff" p-id="4351"></path>
        </svg>
        <span class="location">{{ dayDateCity.city }}</span>
        <!-- <p>{{((Date.now()-WeatherDataUpdatedAtATime.RealTimeWeather)/1000/60).toFixed(0) + '分钟前更新'}}</p> -->
        <!-- <p>{{((Date.now()-WeatherDataUpdatedAtATime.RealTimeWeather)/1000/60).toFixed(0)<5? '刚刚更新' : `${((Date.now()-WeatherDataUpdatedAtATime.RealTimeWeather)/1000/60).toFixed(0)} 分钟前更新`}}</p> -->
      </div>
      <div class="weather-container">
        <i :class="`qi-${nowWeatherData.icon} weather-icon`"></i>
        <h1 class="weather-temp">{{ nowWeatherData.temp }}°C</h1>
        <h3 class="weather-desc">{{ nowWeatherData.text }}</h3>
      </div>
    </div>
    <div class="info-side">
      <div class="today-info-container">
        <div class="today-info">
          <div class="precipitation"> <span class="title">降雨量</span><span class="value">{{ activeWeatherDate[0]?.precip ||
            '' }}
              mm</span>
          </div>
          <div class="humidity"> <span class="title">湿度</span><span class="value">{{ activeWeatherDate[0]?.humidity ||
            '' }}
              %</span>
          </div>
          <div class="wind"> <span class="title">风速</span><span class="value">{{ activeWeatherDate[0]?.windSpeedDay ||
            '' }}
              km/h</span>
          </div>
        </div>
      </div>
      <div class="week-container">
        <ul class="week-list">
          <li v-for="item in FourDayWeatherData" :key="item.fxDate" :class="{ active: activeItem === item.fxDate }"
            @click="handleChangeActiveItem(item.fxDate)">
            <i :class="`qi-${item.iconDay} day-icon`"></i>
            <span class="day-name">{{ item.fxDate }}</span>
            <span class="day-temp">{{ `${item.tempMax}/${item.tempMin}` }}°C</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
  <transition>
    <LoadingView :loading-msg="loadingMsg" v-if="!TheWeatherDataIsLoaded"></LoadingView>
  </transition>
</template>

<script setup>
import LoadingView from './LoadingView.vue';
import 'qweather-icons/font/qweather-icons.css'
import { onMounted, ref, computed, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useWeatherStore } from '@/store/index';
let timer = null
const weatherStore = useWeatherStore()

const loadingMsg = ref('正在获取天气信息')
const TheWeatherDataIsLoaded = ref(false)
const activeItem = ref('')

const { dayDateCity, FourDayWeatherData, nowWeatherData, WeatherDataUpdatedAtATime } = storeToRefs(weatherStore)
console.log(WeatherDataUpdatedAtATime.value);
const { getLocationInformation, getFourDayWeatherData, getRealTimeWeather } = weatherStore
const activeWeatherDate = computed(() => FourDayWeatherData.value.filter(item => item.fxDate === activeItem.value))
const handleChangeActiveItem = (item) => {
  activeItem.value = item
}

const updateWeather = async () => {
  if (!window.navigator.onLine) {
    loadingMsg.value = '当前无网络, 稍后自动重试'
    window.addEventListener('online', updateWeather)
    return
  }
  try {
    await getLocationInformation()
    await getFourDayWeatherData()
    await getRealTimeWeather()
    activeItem.value = FourDayWeatherData.value[0].fxDate
    setTimeout(() => {
      TheWeatherDataIsLoaded.value = true
    }, 1000)
    clearTimeout(timer)
    timer = setTimeout(() => {
      updateWeather()
    }, 1000 * 60)
  }
  catch (error) {
    console.log(error);
    clearTimeout(timer)
    timer = setTimeout(() => {
      updateWeather()
    }, 1000 * 3)
  }
}

onMounted(() => {
  updateWeather()
})
onUnmounted(() => {
  clearInterval(timer)
})
</script>

<style lang="scss" >
.v-enter-active,
.v-leave-active {
  transition: opacity 0.5s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}
p {
  margin: 1vw 0;
  padding: 0;
  font-size: 0.7em;
}
</style>