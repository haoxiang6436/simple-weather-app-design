<template>
  <div class="RainEffectComponent" ref="RainEffectComponent">
    <canvas ref="canvas" class="canvas"></canvas>
  </div>
</template>

<script setup>
import img from '@/assets/dock-1365387_1920.jpg'; // 使用图片的URL
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import RaindropFX from './RainEffectCore.js';
import { rainPresets } from './RainConfig.js';
import { resolveMinutelyIntensity, resolveRainIntensity } from '@/features/wallpaper/rainIntensity';
import { useWeatherNow } from '@/features/weather/useWeatherNow';
import { useWeatherStore } from '@/store';
import Bus from '@/shared/Bus';
import { getBackgroundConfig } from '@/features/wallpaper/backgroundConfig';
import { BUS_EVENTS, STORAGE_KEYS } from '@/features/wallpaper/constants';
const WallpaperUserConfigRainConfig = useStorage(STORAGE_KEYS.WALLPAPER_USER_RAIN_CONFIG, 'auto', localStorage);
const WeatherStore = useWeatherStore();
const canvas = ref(null);
const RainEffectComponent = ref(null);
let raindropFx = null
let rect = null;
let stopWeatherWatch = null;

const handleResize = () => {
  rect = canvas.value.getBoundingClientRect();
  raindropFx?.resize(rect.width * window.devicePixelRatio, rect.height * window.devicePixelRatio);
}

const applyRainConfig = (config) => {
  if (!raindropFx) return;
  // 雨滴背景的专属配置（雨滴大小/数量/上限）覆盖在预设之上；
  // “雨停”预设除外，避免自定义数值破坏无雨效果
  const merged = { ...config };
  if (config !== rainPresets.none) {
    const custom = getBackgroundConfig('4');
    if (Array.isArray(custom.dropletSize)) merged.dropletSize = custom.dropletSize;
    if (custom.dropletsPerSeconds !== undefined) merged.dropletsPerSeconds = custom.dropletsPerSeconds;
    if (custom.spawnLimit !== undefined) merged.spawnLimit = custom.spawnLimit;
  }
  Object.keys(merged).forEach(key => {
    raindropFx.options[key] = merged[key];
  });
}
// 自动档：和胶囊 / 弹层用同一个「现在」，读分钟级降水里当前这一格；
// 没有可用数据（境外 / 失败 / 过期）时回退实时天气。见 rainIntensity.js
const now = useWeatherNow()
const autoRainIntensity = computed(() => {
  const fromMinutely = resolveMinutelyIntensity(WeatherStore.MinutelyPrecipitation, now.value)
  return fromMinutely ?? resolveRainIntensity(WeatherStore.nowWeatherData)
})
const applyAutoRainConfig = () => {
  if (!raindropFx) return;
  // 分钟级降水 → 当前 5 分钟段的雨量档位，不可用时回退实时天气，见 rainIntensity.js
  const state = autoRainIntensity.value;
  console.log('自动应用配置:', state);
  applyRainConfig(rainPresets[state] || rainPresets.moderate);
}
const handleRainConfigChange = (str) => {
  WallpaperUserConfigRainConfig.value = str;
  if (!raindropFx) return;
  if (str === 'auto') {
    // 自动模式：按分钟级降水里当前这一格的雨量强度
    applyAutoRainConfig();
  }
  else {
    applyRainConfig(rainPresets[str]);
  }
}
const handleBackgroundConfigChange = (payload) => {
  if (payload.index !== '4' || !raindropFx) return;
  const cur = WallpaperUserConfigRainConfig.value;
  if (cur === 'auto') {
    applyAutoRainConfig();
  }
  else {
    applyRainConfig(rainPresets[cur]);
  }
}
onMounted(async () => {
  await startRain();
  // 先按当前壁纸设置应用一次：手动档不会随 autoRainIntensity 变化，必须在这里落地
  if (WallpaperUserConfigRainConfig.value === 'auto') {
    applyAutoRainConfig();
  }
  else {
    applyRainConfig(rainPresets[WallpaperUserConfigRainConfig.value] || rainPresets.moderate);
  }
  stopWeatherWatch = watch(
    autoRainIntensity,
    () => {
      if (WallpaperUserConfigRainConfig.value === 'auto') {
        applyAutoRainConfig();
      }
    }
  );
  Bus.on(BUS_EVENTS.RAIN_CONFIG_CHANGE, handleRainConfigChange);
  Bus.on(BUS_EVENTS.BACKGROUND_CONFIG_CHANGE, handleBackgroundConfigChange);
})
const startRain = async () => {
  raindropFx = await reload();
}
async function reload() {
  rect = canvas.value.getBoundingClientRect();
  canvas.value.width = rect.width * window.devicePixelRatio;
  canvas.value.height = rect.height * window.devicePixelRatio;
  const fx = new RaindropFX({
    canvas: canvas.value,
    background: img,
  });
  window.addEventListener('resize', handleResize);
  await fx.start();
  return fx
}

onUnmounted(() => {
  stopWeatherWatch?.();
  stopWeatherWatch = null;
  Bus.off(BUS_EVENTS.RAIN_CONFIG_CHANGE, handleRainConfigChange);
  Bus.off(BUS_EVENTS.BACKGROUND_CONFIG_CHANGE, handleBackgroundConfigChange);
  raindropFx?.stop();
  raindropFx?.destroy();
  raindropFx = null;
  canvas.value = null;
  rect = null;
  window.removeEventListener('resize', handleResize);
})
</script>

<style lang="scss" scoped>
canvas {
  width: 100vw;
  height: 100vh;
  display: block;
  position: absolute;
  top: 0;
  left: 0;
}
</style>
