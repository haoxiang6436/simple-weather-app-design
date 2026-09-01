<template>
  <div class="BackgroundMain" v-if="BackgroundIndex !== '0'">
    <VantaBird v-if="BackgroundIndex === '1'" :VantaOptions="VantaBirdOptions"></VantaBird>
    <StarrySky v-else-if="BackgroundIndex === '2'"></StarrySky>
    <DynamicParticle v-else-if="BackgroundIndex === '3'"></DynamicParticle>
    <RainEffect v-else-if="BackgroundIndex === '4'"></RainEffect>
  </div>
  <WallpaperDebugPanel v-if="NODE_ENV === 'development'" />
</template>

<script setup>
import StarrySky from './StarrySky.vue';
import VantaBird from './VantaBird.vue';
import DynamicParticle from './DynamicParticle.vue';
import RainEffect from './rain/RainEffect.vue';
import WallpaperDebugPanel from '@/features/wallpaper/WallpaperDebugPanel.vue';
import { ref, watch } from 'vue';
import {
  BackgroundIndex,
  BirdInteraction,
  setupWallpaperPropertyListener,
} from '../properties';
let NODE_ENV = process.env.NODE_ENV || 'development';
/**
 * 背景序号
 * 0-不显示背景
 * 小鸟-1
 * 星空-2
 * 动态粒子-3
 * 雨滴效果-4
 */
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

// 小鸟互动开关（壁纸属性 backgroundinteraction）
watch(BirdInteraction, (interaction) => {
  VantaBirdOptions.value.mouseControls = interaction
  VantaBirdOptions.value.touchControls = interaction
})

/**
 * wallpaperPropertyListener：Wallpaper Engine 属性回调
 * 开发环境下由 WallpaperDebugPanel 模拟调用同一套 applyWallpaperProperties
 */
setupWallpaperPropertyListener();

watch(BackgroundIndex, (newVal, oldVal) => {
  if (oldVal === undefined) return
  if (newVal !== oldVal) {
    location.reload();
  }
}, { immediate: true });

</script>

<style lang="scss" scoped></style>
