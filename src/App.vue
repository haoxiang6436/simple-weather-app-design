<script setup>
import WeatherMain from '@/features/weather/WeatherMain.vue'
import BackgroundMain from '@/features/wallpaper/backgrounds/BackgroundMain.vue'
import EarlyWarningDetails from '@/features/weather/EarlyWarningDetails.vue';
import MinutelyRainDialog from '@/features/weather/MinutelyRainDialog.vue';
import { useWeatherStore } from '@/store/index';
import { storeToRefs } from 'pinia';
import { useAddressRefresh } from '@/features/weather/useAddressRefresh';
const weatherStore = useWeatherStore()
const { EarlyWarningDetailsDialog, MinutelyDetailsDialog } = storeToRefs(weatherStore)

// 运行中在属性面板补填 / 清空高德密钥时，卡片地址和「最近」记录跟着重查。
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
  </div>
</template>
