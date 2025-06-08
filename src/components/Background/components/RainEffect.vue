<template>
  <div class="RainEffectComponent" ref="RainEffectComponent">
    <canvas ref="canvas" class="canvas"></canvas>
  </div>
</template>

<script setup>
import img from '@/assets/dock-1365387_1920.jpg'; // 使用图片的URL
import { onMounted, ref } from 'vue';
import RaindropFX from '@/utils/RainEffectCore.js';
import { rainPresets } from '@/utils/RainConfig.js';
import { useWeatherStore } from '@/store';
import { watch, onUnmounted } from 'vue';
const WeatherStore = useWeatherStore();
const canvas = ref(null);
const RainEffectComponent = ref(null);
let raindropFx = null
let rect = null;
let timer = null;
const applyRainConfig = (config) => {
  if (raindropFx) {
    Object.keys(config).forEach(key => {
      raindropFx.options[key] = config[key];
    });
  }
}
const autoApplyRainConfig = (str) => {
  if (!raindropFx) {
    console.warn('RaindropFX 未加载完成，无法应用配置');
    timer && clearTimeout(timer);
    timer = setTimeout(() => {
      autoApplyRainConfig(str);
    }, 500);
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
onMounted(async () => {

  console.log('RainEffect.vue mounted');
  await startRain();
  watch(() => WeatherStore.nowWeatherData.text, async (newVal) => {
    autoApplyRainConfig(newVal);
  }, { immediate: true });
})
const startRain = async () => {
  raindropFx = await reload();
}
async function reload() {
  rect = canvas.value.getBoundingClientRect();
  canvas.value.width = rect.width * window.devicePixelRatio;
  canvas.value.height = rect.height * window.devicePixelRatio;
  let raindropFx = new RaindropFX({
    canvas: canvas.value,
    background: img,
  });
  window.onresize = () => {
    rect = canvas.value.getBoundingClientRect();
    raindropFx.resize(rect.width * window.devicePixelRatio, rect.height * window.devicePixelRatio);
  }
  await raindropFx.start();
  return raindropFx
}

onUnmounted(() => {
  raindropFx.stop();
  raindropFx.destroy();
  raindropFx = null;
  canvas.value = null;
  rect = null;
  timer && clearTimeout(timer);
  timer = null;
  window.onresize = null;
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