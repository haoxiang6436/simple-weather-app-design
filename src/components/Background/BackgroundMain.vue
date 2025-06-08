<template>
  <div class="BackgroundMain" v-if="BackgroundIndex !== '0'">
    <VantaBird v-if="BackgroundIndex === '1'" :VantaOptions="VantaBirdOptions"></VantaBird>
    <StarrySky v-else-if="BackgroundIndex === '2'"></StarrySky>
    <DynamicParticle v-else-if="BackgroundIndex === '3'"></DynamicParticle>
    <RainEffect v-else-if="BackgroundIndex === '4'"></RainEffect>
  </div>
  <div v-if="NODE_ENV === 'development'" class="select" style="position: fixed; left: 50px; top: 50px; z-index: 1000;">
    <select  v-model="BackgroundIndex" :style="{ width: '120px' }" placeholder="Please select ..."
      @change="(val) => BackgroundIndex = val.target.value">
      <option>0</option>
      <option>1</option>
      <option>2</option>
      <option>3</option>
      <option>4</option>
    </select>
  </div>
</template>

<script setup>
import StarrySky from './components/StarrySky.vue';
import VantaBird from './components/VantaBird.vue';
import DynamicParticle from './components/DynamicParticle.vue';
import RainEffect from './components/RainEffect.vue';
import { ref } from 'vue';
import { useStorage } from '@vueuse/core'
import { watch } from 'vue';
let NODE_ENV = process.env.NODE_ENV || 'development';
/**
 * 背景序号
 * 0-不显示背景
 * 小鸟-1
 * 星空-2
 * 动态粒子-3
 * 雨滴效果-4
 */
const BackgroundIndex = useStorage('BackgroundIndex', '0', localStorage)
/**
 * 小鸟相关配置
 */
const VantaBirdOptions = ref({
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
 * wallpaperPropertyListener
 */
window.wallpaperPropertyListener = {
  applyUserProperties: function (properties) {
    //小鸟相关配置
    if (properties.backgroundinteraction) {
      const interaction = properties.backgroundinteraction.value;
      VantaBirdOptions.value.mouseControls = interaction
      VantaBirdOptions.value.touchControls = interaction
    }
    //背景序号
    if (properties.backgroundindex) {
      console.log(BackgroundIndex.value, 'BackgroundIndex.value');
      BackgroundIndex.value = properties.backgroundindex.value
    }
  },
};

watch(BackgroundIndex, (newVal,oldVal) => {
  if (oldVal === undefined) return
  if (newVal!==oldVal) {
    location.reload();
  }
}, { immediate: true });

</script>

<style lang="scss" scoped></style>