<script setup>
import WeatherMain from '@/features/weather/WeatherMain.vue'
import BackgroundMain from '@/features/wallpaper/backgrounds/BackgroundMain.vue'
import EarlyWarningDetails from '@/features/weather/EarlyWarningDetails.vue';
import MinutelyRainDialog from '@/features/weather/MinutelyRainDialog.vue';
import AirQualityDialog from '@/features/weather/AirQualityDialog.vue';
import SettingsDialog from '@/features/onboarding/SettingsDialog.vue';
import { SettingsOpen, closeSettings } from '@/features/onboarding/onboardingState';
import { useWeatherStore } from '@/store/index';
import { storeToRefs } from 'pinia';
import { useAddressRefresh } from '@/features/weather/useAddressRefresh';
const weatherStore = useWeatherStore()
const { EarlyWarningDetailsDialog, MinutelyDetailsDialog, AirQualityDetailsDialog } = storeToRefs(weatherStore)

// 默认区县中心自动补查街道；补填 / 清空高德密钥时，地址和「最近」记录跟着重查。
// 放在根组件里只实例化一次，地址页是否打开都不影响
useAddressRefresh()

</script>

<template>
  <div class="App">
    <BackgroundMain></BackgroundMain>
    <WeatherMain></WeatherMain>
    <transition name="Dialog" mode="out-in">
      <EarlyWarningDetails v-if="EarlyWarningDetailsDialog"></EarlyWarningDetails>
    </transition>
    <transition name="Dialog" mode="out-in">
      <MinutelyRainDialog v-if="MinutelyDetailsDialog"></MinutelyRainDialog>
    </transition>
    <transition name="Dialog" mode="out-in">
      <AirQualityDialog v-if="AirQualityDetailsDialog"></AirQualityDialog>
    </transition>
    <!-- 设置 / 状态页（天气卡右上角齿轮的落点）：和上面几个弹层同一种做法，
         挂在这一层而不是卡片外壳里 —— 它要盖住整张天气卡，而不是替换卡里的内容 -->
    <transition name="Dialog" mode="out-in">
      <SettingsDialog v-if="SettingsOpen" @close="closeSettings"></SettingsDialog>
    </transition>
  </div>
</template>
