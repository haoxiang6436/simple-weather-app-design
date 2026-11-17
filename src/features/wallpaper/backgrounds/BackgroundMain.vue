<template>
  <div class="BackgroundMain">
    <!-- 底层：当前背景来源的静态画面。
         雨滴开启时上面会盖一层不透明的 WebGL 画布，这层同时充当 WebGL 启动失败时的兜底。 -->
    <SolidBackground v-if="isSolid" :use-theme-color="isThemeSolid" />
    <DefaultBackground v-else-if="isBuiltin" :index="BackgroundIndex" />
    <CustomBackground v-else />

    <!-- 雨滴层：首次需要时挂载，之后只切换可见性。
         RainEffectCore 的 WebGL 资源在同一页面内销毁后重建会产生失效 uniform location，
         所以不在背景切换 / 雨滴开关时卸载它。 -->
    <div v-if="rainMounted" class="rain-layer" :class="{ 'is-muted': !rainActive }">
      <RainEffect />
    </div>

    <WallpaperDebugPanel v-if="WallpaperDebugPanel" />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import RainEffect from './rain/RainEffect.vue';
import CustomBackground from './CustomBackground.vue';
import DefaultBackground from './DefaultBackground.vue';
import SolidBackground from './SolidBackground.vue';
import { BackgroundIndex, RainEnabled } from '../properties';
import { HasCustomBackground } from '../customBackground';
import { isSolidBackgroundIndex } from '../constants';
import { isBuiltinBackgroundIndex } from './builtinBackgrounds';

// 必须在编译期常量判断内导入：生产构建不会解析调试面板及其 Arco JS / CSS。
const WallpaperDebugPanel = import.meta.env.DEV
  ? defineAsyncComponent(() => import('@/features/wallpaper/WallpaperDebugPanel.vue'))
  : null;

/**
 * 背景结构（与 public/project.json 的属性对应）：
 *   backgroundindex = 0       → 纯色（跟随面板配色，取 CSS 的 --color-bg）
 *   backgroundindex = solid   → 自定义纯色（backgroundcolor 取色）
 *   backgroundindex = 4       → 【默认】湖心桥（内置码头图）
 *   backgroundindex = 6       → 雾夜长街（内置雾夜公路图）
 *   backgroundindex = custom  → 用户自选的静态背景图
 *   rainenabled     = true    → 在「当前背景图」上实时渲染雨滴
 *
 * 内置图片背景共用 DefaultBackground，图片清单见 builtinBackgrounds.js。
 *
 * 雨滴和背景是两层：图片背景永远先铺一层静态底图，雨滴开启时再叠 WebGL 画布。
 * 这样雨滴开关、背景切换都不需要整页刷新，WebGL 实例也不会被反复销毁重建。
 */
const isSolid = computed(() => isSolidBackgroundIndex(BackgroundIndex.value))
const isThemeSolid = computed(() => String(BackgroundIndex.value) === '0')
const isCustom = computed(() => String(BackgroundIndex.value) === 'custom')
const isBuiltin = computed(() => isBuiltinBackgroundIndex(BackgroundIndex.value))

// 纯色没有可折射的底图；自定义背景还没选图时先显示占位，等选好图再出雨滴。
const rainActive = computed(() => (
  RainEnabled.value
  && !isSolid.value
  && (!isCustom.value || HasCustomBackground.value)
))

// 一旦需要过雨滴就保持挂载：关闭雨滴只隐藏画布，避免 WebGL context 重建问题。
const rainMounted = ref(false)
watch(rainActive, (active) => {
  if (active) rainMounted.value = true
}, { immediate: true })
</script>

<style lang="scss" scoped>
.rain-layer {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.rain-layer.is-muted {
  /* 用 visibility 而不是 display:none：隐藏时仍保留布局尺寸，
     窗口 resize 触发的 canvas 尺寸计算不会变成 0。 */
  visibility: hidden;
}
</style>
