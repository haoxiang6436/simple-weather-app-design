<template>
  <div class="BackgroundMain" v-if="BackgroundIndex === '4' || BackgroundIndex === '5'">
    <RainEffect v-if="BackgroundIndex === '4'"></RainEffect>
    <RainOverlayEffect v-else></RainOverlayEffect>
  </div>
  <WallpaperDebugPanel v-if="WallpaperDebugPanel" />
</template>

<script setup>
import RainEffect from './rain/RainEffect.vue';
import RainOverlayEffect from './rain-overlay/RainOverlayEffect.vue';
import { defineAsyncComponent, watch } from 'vue';
import { BackgroundIndex } from '../properties';
// 必须在编译期常量判断内导入：生产构建不会解析调试面板及其 Arco JS / CSS。
const WallpaperDebugPanel = process.env.NODE_ENV === 'development'
  ? defineAsyncComponent(() => import('@/features/wallpaper/WallpaperDebugPanel.vue'))
  : null;
/**
 * 背景序号
 * 0-不显示背景
 * 4-雨滴效果
 * 5-整页雨珠叠加（雨珠层盖在真实 DOM 之上）
 *
 * 旧的 1-小鸟 / 2-星空 / 3-动态粒子 已移除，对应的组件文件也已删除；
 * 老配置里残留的 1/2/3 会在 properties.js 里回退到默认背景。
 */
/**
 * 背景切换：WebGL 上下文重建比较重，直接整页重载最省事。
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
