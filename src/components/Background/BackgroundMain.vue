<template>
  <div class="BackgroundMain" v-if="BackgroundIndex !== '0'">
    <VantaBird v-if="BackgroundIndex === '1'" :VantaOptions="VantaOptions"></VantaBird>
    <StarrySky v-else-if="BackgroundIndex === '2'"></StarrySky>
  </div>
</template>

<script setup>
import StarrySky from './components/StarrySky.vue';
import VantaBird from './components/VantaBird.vue';
import {useWallpaperOptionsStore,useWeatherStore} from '@/store';
const wallpaperOptionsStore = useWallpaperOptionsStore();
const WeatherStore = useWeatherStore();
import { ref } from 'vue';
/**
 * 背景序号
 * 小鸟-1
 * 星空-2
 */
const BackgroundIndex = ref('0')
/**
 * 小鸟相关配置
 */
const VantaOptions = ref({
  el: "#my-background",
  mouseControls: false,
  touchControls: false,
  gyroControls: false,
  minHeight: 200.00,
  minWidth: 200.00,
  scale: 1.00,
  scaleMobile: 1.00
})
/**
 * 星空相关配置
 */

/**
 * wallpaperPropertyListener
 */
window.wallpaperPropertyListener = {
  applyUserProperties: function (properties) {
    //小鸟相关配置
    if (properties.backgroundinteraction) {
      const interaction = properties.backgroundinteraction.value;
      VantaOptions.value.mouseControls = interaction
      VantaOptions.value.touchControls = interaction
    }
    //背景序号
    if (properties.backgroundindex) {
      BackgroundIndex.value = properties.backgroundindex.value
    }
    // ip定位
    if (properties.ipautotargeting) {
      wallpaperOptionsStore.SetUseIpAutoTargeting(properties.ipautotargeting.value)
      WeatherStore.getLocationInformation()
    }
  },
};

</script>

<style lang="scss" scoped></style>