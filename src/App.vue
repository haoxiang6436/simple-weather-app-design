<script setup>
import WeatherMain from '@/features/weather/WeatherMain.vue'
import BackgroundMain from '@/features/wallpaper/backgrounds/BackgroundMain.vue'
import EarlyWarningDetails from '@/features/weather/EarlyWarningDetails.vue';
import { useWeatherStore } from '@/store/index';
import { storeToRefs } from 'pinia';
const weatherStore = useWeatherStore()
const { EarlyWarningDetailsDialog } = storeToRefs(weatherStore)

</script>

<template>
  <div class="App">
    <BackgroundMain></BackgroundMain>
    <WeatherMain></WeatherMain>
    <transition name="Dialog" mode="out-in">
      <EarlyWarningDetails v-if="EarlyWarningDetailsDialog"></EarlyWarningDetails>
    </transition>
  </div>
</template>

<style scoped>
.Dialog-enter-active,
.Dialog-leave-active {
  transition: opacity 0.3s ease;
}

.Dialog-enter-from,
.Dialog-leave-to {
  opacity: 0;
}
</style>
