<template>
  <div class="RainEffectComponent" ref="RainEffectComponent">
    <canvas ref="canvas" class="canvas"></canvas>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import RaindropFX from './RainEffectCore.js';
import { getBuiltinBackground } from '../builtinBackgrounds';
import { rainPresets } from './RainConfig.js';
import { resolveMinutelyIntensity, resolveRainIntensity } from '@/features/wallpaper/rainIntensity';
import { useWeatherNow } from '@/features/weather/useWeatherNow';
import { useWeatherStore } from '@/store';
import Bus from '@/shared/Bus';
import { getBackgroundConfigOverrides } from '@/features/wallpaper/backgroundConfig';
import { BUS_EVENTS, STORAGE_KEYS, isSolidBackgroundIndex } from '@/features/wallpaper/constants';
import { BackgroundIndex, RainEnabled } from '@/features/wallpaper/properties';
import {
  CustomBackgroundUrl,
  HasCustomBackground,
  loadCustomBackgroundTexture,
} from '@/features/wallpaper/customBackground';

const WallpaperUserConfigRainConfig = useStorage(STORAGE_KEYS.WALLPAPER_USER_RAIN_CONFIG, 'auto', localStorage);
const WeatherStore = useWeatherStore();
const canvas = ref(null);
const RainEffectComponent = ref(null);
let raindropFx = null
let rect = null;
let stopWeatherWatch = null;
let stopBackgroundWatch = null;
let stopRainActiveWatch = null;
let disposed = false;

// 自管的渲染循环：雨滴不可见时（纯色背景 / 关掉雨滴）直接停掉 requestAnimationFrame，
// 不让 RaindropFX 在看不见的画布上继续 update + 每帧绘制。实例、纹理、framebuffer 都保留，
// 恢复时只重启循环，不需要重建 WebGL 资源（重建正是之前 uniform location 失效的原因）。
let frameHandle = null;
let lastFrameTs = 0;
let elapsedSeconds = 0;

// 背景纹理切换需要异步加载图片；用请求序号 + 串行队列保证「最后一次操作」生效，
// 避免快速切换时旧的 setBackground 晚到、把新背景又覆盖回去。
let backgroundRequestId = 0;
let backgroundTask = Promise.resolve();
// 当前已经上传到 WebGL 的纹理标识：`builtin:<backgroundindex>` 或 `custom:<url>`
// 初始为 null：RaindropFX 构造时用哪张图取决于当时的背景序号，让第一次队列任务自己校准。
let appliedBackgroundKey = null;

// 雨滴参数的尺寸单位是画布像素：同一组数值在 1080p 和 4K 上占屏幕的比例差很多。
// 预设统一按 1280×720 调，渲染时按画布面积换算，换成别的分辨率观感才一致。
// 数量按面积、尺寸按线性缩放；档位相差越大越明显，所以把缩放限制在合理区间，
// 也避免 4K 下 spawnLimit 涨到几千个水滴。
const RAIN_REFERENCE_AREA = 1280 * 720;
const RAIN_SCALE_MIN = 0.85;
const RAIN_SCALE_MAX = 1.8;
const RAIN_MAX_DROPLETS_PER_SECOND = 4000;
const RAIN_MAX_SPAWN_LIMIT = 1500;

let resolutionScale = 1;

const updateResolutionScale = () => {
  const dpr = window.devicePixelRatio || 1;
  const width = (rect?.width || window.innerWidth) * dpr;
  const height = (rect?.height || window.innerHeight) * dpr;
  const raw = Math.sqrt((width * height) / RAIN_REFERENCE_AREA);
  resolutionScale = Math.min(RAIN_SCALE_MAX, Math.max(RAIN_SCALE_MIN, raw));
}

/**
 * 把预设里的绝对像素参数换算到当前画布分辨率。
 * 只处理有单位的字段；trailDropDensity / velocitySpread 这类比例值不换算。
 */
const scaleRainOptions = (options) => {
  const scale = resolutionScale;
  const area = scale * scale;
  const scaled = { ...options };
  const scaleRange = (value) => (
    Array.isArray(value) ? value.map(item => Number((item * scale).toFixed(2))) : value
  );

  scaled.dropletSize = scaleRange(scaled.dropletSize);
  scaled.spawnSize = scaleRange(scaled.spawnSize);
  scaled.trailDistance = scaleRange(scaled.trailDistance);
  if (Array.isArray(scaled.spawnInterval)) {
    scaled.spawnInterval = scaled.spawnInterval.map(item => Math.max(0.02, item / area));
  }
  if (typeof scaled.gravity === 'number') scaled.gravity = Math.round(scaled.gravity * scale);
  if (typeof scaled.dropletsPerSeconds === 'number') {
    scaled.dropletsPerSeconds = Math.min(RAIN_MAX_DROPLETS_PER_SECOND, Math.round(scaled.dropletsPerSeconds * area));
  }
  if (typeof scaled.spawnLimit === 'number') {
    scaled.spawnLimit = Math.min(RAIN_MAX_SPAWN_LIMIT, Math.round(scaled.spawnLimit * area));
  }
  return scaled;
}

const handleResize = () => {
  if (!canvas.value) return;
  rect = canvas.value.getBoundingClientRect();
  updateResolutionScale();
  raindropFx?.resize(rect.width * window.devicePixelRatio, rect.height * window.devicePixelRatio);
  // 分辨率变了，预设换算出来的尺寸也要跟着变
  applyActiveRainConfig();
}

const stopFrameLoop = () => {
  if (frameHandle !== null) cancelAnimationFrame(frameHandle);
  frameHandle = null;
  lastFrameTs = 0;
}

// 单帧步长封顶：主线程卡顿 / 窗口被挂起后回来，不要一次性推进好几秒的模拟
const frameTick = (ts) => {
  frameHandle = null;
  if (disposed || !raindropFx) return;
  if (!lastFrameTs) lastFrameTs = ts;
  const dt = Math.min(0.05, Math.max(0.001, (ts - lastFrameTs) / 1000));
  lastFrameTs = ts;
  elapsedSeconds += dt;
  raindropFx.update({ dt, total: elapsedSeconds });
  frameHandle = requestAnimationFrame(frameTick);
}

const startFrameLoop = () => {
  if (disposed || !raindropFx || frameHandle !== null) return;
  lastFrameTs = 0;
  frameHandle = requestAnimationFrame(frameTick);
}

const applyRainConfig = (config) => {
  if (!raindropFx) return;
  // 预设里的尺寸 / 数量按当前画布分辨率换算；用户手动改过的参数是绝对像素值，
  // 原样生效（调试面板填多少就是多少，不再跟着分辨率放大缩小）。
  // “雨停”预设除外，避免自定义数值破坏无雨效果。
  const options = scaleRainOptions(config);
  if (config !== rainPresets.none) {
    Object.assign(options, getBackgroundConfigOverrides('4'));
  }
  Object.keys(options).forEach(key => {
    raindropFx.options[key] = options[key];
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
  applyRainConfig(rainPresets[state] || rainPresets.moderate);
}
// 当前雨滴是否真的可见：两种纯色都没有底图；自定义背景还没选图时先不渲染。
// 这个值也决定隐藏期间是否把雨量压到「雨停」，避免看不见的画布继续生成水滴。
const rainActive = computed(() => (
  RainEnabled.value
  && !isSolidBackgroundIndex(BackgroundIndex.value)
  && (BackgroundIndex.value !== 'custom' || HasCustomBackground.value)
))

// 雨滴开关关闭 / 画布隐藏时（组件仍挂载）把雨量压到「雨停」，
// 避免看不见的画布继续生成水滴白耗 GPU。
const applyActiveRainConfig = () => {
  if (!raindropFx) return;
  if (!rainActive.value) {
    applyRainConfig(rainPresets.none);
    return;
  }
  if (WallpaperUserConfigRainConfig.value === 'auto') {
    applyAutoRainConfig();
  }
  else {
    applyRainConfig(rainPresets[WallpaperUserConfigRainConfig.value] || rainPresets.moderate);
  }
}

/**
 * 雨滴可见性变化：先按当前设置落一次雨量，再开 / 停渲染循环。
 * 隐藏时停掉整条循环（不再 update、不再 WebGL draw），只占一份常驻显存。
 */
const applyRainActivity = () => {
  applyActiveRainConfig();
  if (rainActive.value) startFrameLoop();
  else stopFrameLoop();
}
const handleRainConfigChange = (str) => {
  WallpaperUserConfigRainConfig.value = str;
  applyActiveRainConfig();
}
const handleBackgroundConfigChange = (payload) => {
  if (payload.index !== '4') return;
  applyActiveRainConfig();
}

/**
 * 当前应该作为雨滴折射底图的纹理：
 *   - 背景是「自定义背景」且已经选好图片 → 用用户图片；
 *   - 其余情况（内置湖心桥 / 雾夜长街 / 自定义图加载失败） → 对应的内置图。
 * 纯色背景不会挂载雨滴层，因此这里不需要处理。
 *
 * 注意底图必须与 BackgroundMain 铺的静态图一致：雨滴画布是不透明的，
 * 背景图一旦走散，打开雨滴就会像换了一张壁纸。
 */
const builtinBackground = computed(() => getBuiltinBackground(BackgroundIndex.value))

const desiredBackgroundKey = computed(() => (
  BackgroundIndex.value === 'custom' && HasCustomBackground.value
    ? `custom:${CustomBackgroundUrl.value}`
    : `builtin:${String(BackgroundIndex.value)}`
))

/**
 * 把雨滴的折射底图切到当前背景，或切回对应的内置图。
 *
 * RaindropFX 的 setBackground() 支持字符串（内部 fetch）和带 width/height 的纹理源。
 * 这里统一走 canvas：file:// 图片已经由 <img> 解码过，再画进 canvas 上传 WebGL，
 * 绕开 CEF 直接 fetch(file://) 的限制；加载失败则回退内置图，雨滴不会消失。
 */
const queueRainBackground = () => {
  const requestId = ++backgroundRequestId;
  backgroundTask = backgroundTask
    .then(async () => {
      // 队列里的旧请求直接跳过，只有最后一次切换 / 最后一次属性下发算数
      if (disposed || requestId !== backgroundRequestId || !raindropFx) return;

      const key = desiredBackgroundKey.value;
      if (key === appliedBackgroundKey) return;

      // 内置背景（湖心桥 / 雾夜长街）：换成对应那张图；未知序号已由 getBuiltinBackground 回退到默认图
      const builtinImage = builtinBackground.value.image;
      if (!key.startsWith('custom:')) {
        await raindropFx.setBackground(builtinImage);
        appliedBackgroundKey = key;
        return;
      }

      const url = CustomBackgroundUrl.value;
      try {
        const texture = await loadCustomBackgroundTexture(url);
        if (disposed || requestId !== backgroundRequestId || !raindropFx) return;
        try {
          await raindropFx.setBackground(texture);
        }
        catch (canvasError) {
          // 极少数 CEF 配置下 file:// 图片会污染 canvas，导致 texImage2D 被拒绝。
          // 退回 RaindropFX 自带的 URL 加载器再试一次（它会 fetch 原文件）。
          console.warn('[RainEffect] canvas 纹理上传失败，改用 URL 加载', canvasError);
          if (disposed || requestId !== backgroundRequestId || !raindropFx) return;
          await raindropFx.setBackground(url);
        }
        appliedBackgroundKey = key;
      }
      catch (error) {
        console.warn('[RainEffect] 自定义背景加载失败，回退内置背景', error);
        if (disposed || requestId !== backgroundRequestId || !raindropFx) return;
        await raindropFx.setBackground(builtinImage);
        appliedBackgroundKey = `builtin:${String(BackgroundIndex.value)}`;
      }
    })
    .catch((error) => {
      console.warn('[RainEffect] 应用雨滴背景失败', error);
    });
}

onMounted(async () => {
  disposed = false;
  let fx;
  try {
    fx = await startRain();
  } catch (error) {
    console.error('[RainEffect] 启动雨滴背景失败', error);
    return;
  }
  // 组件可能在 WebGL 资源加载期间被切换卸载；旧实例不能再接管画布或注册监听。
  if (disposed || !fx) {
    fx?.stop();
    fx?.destroy();
    return;
  }
  raindropFx = fx;
  // RaindropFX 构造时按当前内置背景图起步；纹理标识留空，交给下面的队列按当前背景校准
  // （构造期间背景可能已经切走，队列会换成真正该用的那张图）。
  appliedBackgroundKey = null;
  // 先按当前壁纸设置应用一次：手动档不会随 autoRainIntensity 变化，必须在这里落地；
  // 雨滴当前可见时才启动渲染循环。
  updateResolutionScale();
  applyRainActivity();
  queueRainBackground();
  stopBackgroundWatch = watch(
    [BackgroundIndex, CustomBackgroundUrl],
    () => queueRainBackground()
  );
  stopWeatherWatch = watch(
    autoRainIntensity,
    () => {
      if (RainEnabled.value && WallpaperUserConfigRainConfig.value === 'auto') {
        applyAutoRainConfig();
      }
    }
  );
  stopRainActiveWatch = watch(rainActive, applyRainActivity);
  Bus.on(BUS_EVENTS.RAIN_CONFIG_CHANGE, handleRainConfigChange);
  Bus.on(BUS_EVENTS.BACKGROUND_CONFIG_CHANGE, handleBackgroundConfigChange);
})

const startRain = async () => {
  return reload();
}
async function reload() {
  if (disposed || !canvas.value) return null;
  rect = canvas.value.getBoundingClientRect();
  canvas.value.width = rect.width * window.devicePixelRatio;
  canvas.value.height = rect.height * window.devicePixelRatio;
  const fx = new RaindropFX({
    canvas: canvas.value,
    // 起步底图用当前内置背景（4 湖心桥 / 6 雾夜长街）；自定义背景由队列随后替换
    background: builtinBackground.value.image,
  });
  try {
    await fx.start();
  } catch (error) {
    fx.stop();
    fx.destroy();
    throw error;
  }
  // RaindropFX.start() 自带一条 rAF 循环；这里先停掉，改由本组件的 frameTick 驱动，
  // 这样雨滴隐藏时能整条停掉，恢复时也不用重新 start()（它会重新 loadAssets / 上传纹理）。
  fx.stop();
  if (disposed || !canvas.value) return fx;
  window.addEventListener('resize', handleResize);
  return fx
}

onUnmounted(() => {
  disposed = true;
  // 让队列里还没跑完的背景请求失效，避免卸载后还去碰旧 WebGL context
  backgroundRequestId++;
  stopWeatherWatch?.();
  stopWeatherWatch = null;
  stopBackgroundWatch?.();
  stopBackgroundWatch = null;
  stopRainActiveWatch?.();
  stopRainActiveWatch = null;
  Bus.off(BUS_EVENTS.RAIN_CONFIG_CHANGE, handleRainConfigChange);
  Bus.off(BUS_EVENTS.BACKGROUND_CONFIG_CHANGE, handleBackgroundConfigChange);
  stopFrameLoop();
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
