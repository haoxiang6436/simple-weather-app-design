<template>
  <div class="BackgroundMain" v-if="BackgroundIndex !== '0'">
    <VantaBird v-if="BackgroundIndex === '1'" :VantaOptions="VantaBirdOptions"></VantaBird>
    <StarrySky v-else-if="BackgroundIndex === '2'"></StarrySky>
    <DynamicParticle v-else-if="BackgroundIndex === '3'"></DynamicParticle>
    <RainEffect v-else-if="BackgroundIndex === '4'"></RainEffect>
    <RainOverlayEffect v-else-if="BackgroundIndex === '5'"></RainOverlayEffect>
  </div>
  <WallpaperDebugPanel v-if="NODE_ENV === 'development'" />
</template>

<script setup>
import StarrySky from './StarrySky.vue';
import VantaBird from './VantaBird.vue';
import DynamicParticle from './DynamicParticle.vue';
import RainEffect from './rain/RainEffect.vue';
import RainOverlayEffect from './rain-overlay/RainOverlayEffect.vue';
import WallpaperDebugPanel from '@/features/wallpaper/WallpaperDebugPanel.vue';
import { ref, watch } from 'vue';
import {
  BackgroundIndex,
  BirdInteraction,
} from '../properties';
let NODE_ENV = process.env.NODE_ENV || 'development';
/**
 * 背景序号
 * 0-不显示背景
 * 小鸟-1
 * 星空-2
 * 动态粒子-3
 * 雨滴效果-4
 * 整页雨珠叠加-5（雨珠层盖在真实 DOM 之上）
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
 * 背景切换：WebGL 上下文（小鸟 / 雨滴）重建比较重，直接整页重载最省事。
 * 壁纸属性监听器在 src/main.js 里统一接管（见 features/wallpaper/properties.js），
 * 属性变更会写进 BackgroundIndex，这里只负责在序号真的变化时重载一次。
 *
 * sessionStorage 里的标记会跨 location.reload 保留：
 * 同一个目标序号最多只为它重载一次。万一壁纸引擎持续下发一个本地存不住的值
 * （例如存储被禁用），也不会陷入「重载 → 引擎又下发 → 再重载」的死循环，
 * 而是直接交给 Vue 重新渲染背景组件。
 */
const RELOAD_GUARD_KEY = 'WallpaperBackgroundReloaded'
const readReloadGuard = () => {
  try {
    return sessionStorage.getItem(RELOAD_GUARD_KEY)
  } catch (e) {
    return null
  }
}
const writeReloadGuard = (value) => {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, value)
  } catch (e) {
    // 存储不可用时退化为「不设防」，行为与旧版一致
  }
}

let reloading = false
watch(BackgroundIndex, (newVal, oldVal) => {
  // immediate 的第一次调用（oldVal === undefined）只是恢复持久化的值，不算切换
  if (oldVal === undefined) return
  const nextIndex = String(newVal)
  if (nextIndex === String(oldVal)) return
  if (reloading) return
  if (readReloadGuard() === nextIndex) return
  reloading = true
  writeReloadGuard(nextIndex)
  location.reload();
}, { immediate: true });

</script>

<style lang="scss" scoped></style>
