<template>
  <div class="RainEffectComponent" ref="RainEffectComponent">
    <canvas ref="canvas" class="canvas"></canvas>
  </div>
</template>

<script setup>
import img from '@/assets/dock-1365387_1920.jpg'; // 使用图片的URL
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import RaindropFX from './RainEffectCore.js';
import { rainPresets } from './RainConfig.js';
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
let timer = null;
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
const autoApplyRainConfig = (str) => {
  if (!raindropFx) {
    console.warn('RaindropFX 未加载完成，无法应用配置');
    timer && clearTimeout(timer);
    timer = setTimeout(() => {
      autoApplyRainConfig(str);
    }, 500);
    return
  }
  let state = 'moderate'; // 默认中雨
  if (!/雨/.test(str)) {
    state = 'none';
  }
  else {
    if (/大/.test(str) || /暴/.test(str)) {
      state = 'heavy'
    }
    if (/中/.test(str) || /阵/.test(str) || /冻/.test(str) || /降/.test(str)) {
      state = 'moderate'
    }
    if (/小/.test(str) || /细/.test(str) || /毛/.test(str)) {
      state = 'light'
    }
  }
  console.log('自动应用配置:', state);
  applyRainConfig(rainPresets[state]);
}
const handleRainConfigChange = (str) => {
  WallpaperUserConfigRainConfig.value = str;
  if (!raindropFx) return;
  if (str === 'auto') {
    // 自动模式：根据当前实时天气文本匹配雨量强度
    autoApplyRainConfig(WeatherStore.nowWeatherData.text);
  }
  else {
    applyRainConfig(rainPresets[str]);
  }
}
const handleBackgroundConfigChange = (payload) => {
  if (payload.index !== '4' || !raindropFx) return;
  const cur = WallpaperUserConfigRainConfig.value;
  if (cur === 'auto') {
    autoApplyRainConfig(WeatherStore.nowWeatherData.text);
  }
  else {
    applyRainConfig(rainPresets[cur]);
  }
}
onMounted(async () => {
  await startRain();
  stopWeatherWatch = watch(
    () => WeatherStore.nowWeatherData.text,
    (newVal) => {
      if (WallpaperUserConfigRainConfig.value === 'auto') {
        autoApplyRainConfig(newVal);
      }
      else {
        applyRainConfig(rainPresets[WallpaperUserConfigRainConfig.value]);
      }
    },
    { immediate: true }
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
  timer && clearTimeout(timer);
  timer = null;
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
