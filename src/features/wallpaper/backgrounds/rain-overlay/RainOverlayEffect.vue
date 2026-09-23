<template>
  <div class="RainOverlayEffect">
    <!-- 底层：折射用的底图，天气面板（z-index 5）盖在它上面 -->
    <div class="backdrop" :style="backdropStyle"></div>

    <!--
      顶层：整页雨珠叠加层。
      全屏样式、尺寸监听、快照刷新、生命周期都由 RainOverlayAdapter 负责；
      data-html2canvas-ignore 保证叠加层不会出现在自己的折射快照里（否则会形成反馈环）。
    -->
    <canvas
      ref="canvas"
      class="rain-overlay-canvas"
      data-raindrop-exclude
      data-html2canvas-ignore
    ></canvas>
  </div>
</template>

<script setup>
// 底图用的是预模糊过的版本（高斯 sigma=16 烘焙进图片，见 temp/_tools/blur-image.py）：
// 为什么不用 CSS filter: blur()——折射源是 html2canvas 的 DOM 快照，而 html2canvas 不支持
// CSS filter，快照里会重新变回清晰图，底图与雨珠里看到的折射内容就不一致了。
import backdropImage from '@/assets/dock-1365387_1920-blur.jpg';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import { createRainOverlay } from './RainOverlayAdapter';
import { overlayRainPresets } from './RainOverlayConfig';
import { resolveRainIntensity } from '@/features/wallpaper/rainIntensity';
import { useWeatherStore } from '@/store';
import Bus from '@/shared/Bus';
import { getBackgroundConfig, getBackgroundConfigs } from '@/features/wallpaper/backgroundConfig';
import { BUS_EVENTS, STORAGE_KEYS } from '@/features/wallpaper/constants';

/**
 * 整页雨珠叠加背景
 *
 * 与「实时雨滴」(backgroundindex=4) 的区别：
 *   1. 雨珠层不是自带背景图的全屏后处理，而是一层透明 canvas 盖在真实 DOM 之上
 *      （position:fixed + pointer-events:none），折射源是整页 DOM 的低分辨率快照，
 *      所以天气面板本身也会被雨珠折射，且照常可点；
 *   2. 雨量预设也用自己的一套（见 RainOverlayConfig.js），不复用 rain/RainConfig.js。
 */

// 高于天气面板(5)与各类弹窗(60/100)，低于欢迎弹窗(9999)
const OVERLAY_Z_INDEX = 200;

const WallpaperUserConfigRainConfig = useStorage(STORAGE_KEYS.WALLPAPER_USER_RAIN_CONFIG, 'auto', localStorage);
const WeatherStore = useWeatherStore();

const canvas = ref(null);
const backdropStyle = { backgroundImage: `url(${backdropImage})` };

let overlay = null;
let appliedScale = null;
let stopWeatherWatch = null;
let unmounted = false;

// 当前生效的雨量预设：
// auto 时按实时天气（icon 代码优先，其次天气文本）自动选档，否则用壁纸属性里选的强度
const currentPreset = () => {
  const key = WallpaperUserConfigRainConfig.value;
  const state = key === 'auto' ? resolveRainIntensity(WeatherStore.nowWeatherData) : key;
  return overlayRainPresets[state] || overlayRainPresets.moderate;
};

// 把雨量预设 + 背景专属配置应用到叠加层
const syncEffect = () => {
  if (!overlay) return;
  const preset = currentPreset();
  const merged = { ...preset };
  // 只有用户在调试面板里显式调过的项才覆盖预设：
  // 否则「大雨 / 中雨 / 小雨」的差异会被背景默认值直接抹平。
  // 这三项恰好是最容易糊住文字的部分（凝结水珠层 + 雨滴上限）。
  const stored = getBackgroundConfigs()['5'] || {};
  if (preset !== overlayRainPresets.none) {
    if (Array.isArray(stored.dropletSize)) merged.dropletSize = stored.dropletSize;
    if (stored.dropletsPerSeconds !== undefined) merged.dropletsPerSeconds = stored.dropletsPerSeconds;
    if (stored.spawnLimit !== undefined) merged.spawnLimit = stored.spawnLimit;
  }
  Object.keys(merged).forEach((key) => {
    overlay.fx.options[key] = merged[key];
  });
  // 快照参数与雨量档位无关，直接用背景配置（含默认值）
  const custom = getBackgroundConfig('5');
  if (custom.snapshotInterval !== undefined) overlay.setSnapshotInterval(custom.snapshotInterval);
  if (custom.snapshotScale !== undefined && custom.snapshotScale !== appliedScale) {
    appliedScale = custom.snapshotScale;
    overlay.setSnapshotScale(custom.snapshotScale);
  }
};

const handleRainConfigChange = (value) => {
  WallpaperUserConfigRainConfig.value = value;
  syncEffect();
};

const handleBackgroundConfigChange = (payload) => {
  if (payload.index !== '5') return;
  syncEffect();
};

const startOverlay = async () => {
  const custom = getBackgroundConfig('5');
  appliedScale = custom.snapshotScale;
  overlay = await createRainOverlay({
    canvas: canvas.value,
    source: document.body, // 折射源：整页 DOM（含底图与天气面板）
    snapshotScale: custom.snapshotScale, // 折射本来就是糊的，低分辨率足够
    snapshotInterval: custom.snapshotInterval, // 默认 400ms（约 2.5Hz），靠雨滴动画本身补足流畅度
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    zIndex: OVERLAY_Z_INDEX,
    effect: { ...overlayRainPresets.moderate },
    onError: (e) => console.warn('[RainOverlayEffect] 折射源快照失败', e),
  });
};

onMounted(async () => {
  try {
    await startOverlay();
  } catch (e) {
    // WebGL 不可用时保留底图，不影响天气面板本身
    console.warn('[RainOverlayEffect] 雨珠叠加层启动失败', e);
  }
  // 启动是异步的，期间组件可能已经被卸载（例如切换背景触发 location.reload）
  if (unmounted) {
    overlay?.destroy();
    overlay = null;
    return;
  }
  syncEffect();
  // 自动模式：实时天气（图标 / 文本）变化时重算雨量
  stopWeatherWatch = watch(
    () => `${WeatherStore.nowWeatherData.icon}|${WeatherStore.nowWeatherData.text}`,
    () => {
      if (WallpaperUserConfigRainConfig.value === 'auto') syncEffect();
    }
  );
  Bus.on(BUS_EVENTS.RAIN_CONFIG_CHANGE, handleRainConfigChange);
  Bus.on(BUS_EVENTS.BACKGROUND_CONFIG_CHANGE, handleBackgroundConfigChange);
});

onUnmounted(() => {
  unmounted = true;
  stopWeatherWatch?.();
  stopWeatherWatch = null;
  Bus.off(BUS_EVENTS.RAIN_CONFIG_CHANGE, handleRainConfigChange);
  Bus.off(BUS_EVENTS.BACKGROUND_CONFIG_CHANGE, handleBackgroundConfigChange);
  overlay?.destroy();
  overlay = null;
  appliedScale = null;
});
</script>

<style lang="scss" scoped>
.RainOverlayEffect {
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 0;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }
}
</style>
