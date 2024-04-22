<script setup>
import WeatherMain from './components/WeatherMain.vue'
import BackgroundMain from './components/Background/BackgroundMain.vue'
import EarlyWarningDetails from './components/EarlyWarningDetails.vue';
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
  transition: all 0.3s ease;
}

.Dialog-enter-from,
.Dialog-leave-to {
  opacity: 0;
}

</style>
