<template>
  <div class="RainPreview">
    <nav class="RainPreviewControls" aria-label="降水假数据场景">
      <span class="RainPreviewLabel">假数据预览</span>
      <button
        v-for="scenario in scenarios"
        :key="scenario.key"
        type="button"
        :aria-pressed="selected === scenario.key"
        @click="selectScenario(scenario)"
      >{{ scenario.label }}</button>
      <button type="button" :aria-pressed="mist" @click="toggleTheme">{{ mist ? '切换夜雨' : '切换晨雾' }}</button>
      <button v-if="!weatherStore.MinutelyDetailsDialog" type="button" @click="weatherStore.MinutelyDetailsDialog = true">打开图表</button>
    </nav>
    <MinutelyRainDialog v-if="weatherStore.MinutelyDetailsDialog" />
    <div class="RainPreviewChip"><span>主界面入口</span><MinutelyRainChip /></div>
    <p class="RainPreviewNote">原始降雨采用提供的 24 条数据；其余场景按相同结构生成，时间平移到当前。</p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useWeatherStore } from '@/store/index'
import MinutelyRainDialog from '@/features/weather/MinutelyRainDialog.vue'
import MinutelyRainChip from '@/features/weather/MinutelyRainChip.vue'

const weatherStore = useWeatherStore()
const selected = ref('light')
const mist = ref(false)
// 用户提供的 precip 原始值，每项为其后 5 分钟累计降水量（mm）。
const sample = [0, 0, 0, 0, 0, 0, 0, 0.08, 0.10, 0.15, 0.15, 0.12, 0.14, 0.12, 0.12, 0.19, 0.17, 0.12, 0.14, 0.18, 0.23, 0.15, 0.13, 0.14]
const scenarios = [
  { key: 'current-heavy', label: '正在下大雨', peak: 8, ongoing: true },
  { key: 'current-snow-heavy', label: '正在下大雪', peak: 1.8, ongoing: true, type: 'snow' },
  { key: 'light', label: '原始降雨', factor: 1 },
  { key: 'rain-trace', label: '零星小雨', peak: 0.05 },
  { key: 'rain-light', label: '小雨', peak: 0.5 },
  { key: 'moderate', label: '中雨', peak: 2 },
  { key: 'heavy', label: '大雨', peak: 8 },
  { key: 'storm', label: '暴雨', peak: 20 },
  { key: 'severe', label: '大暴雨', peak: 40 },
  { key: 'extreme', label: '特大暴雨', peak: 60 },
  { key: 'dry', label: '无雨', factor: 0 },
  { key: 'snow-dry', label: '无雪', factor: 0, type: 'snow' },
  { key: 'snow-trace', label: '零星小雪', peak: 0.004, type: 'snow' },
  { key: 'snow-light', label: '小雪', peak: 0.3, type: 'snow' },
  { key: 'snow-moderate', label: '中雪', peak: 0.8, type: 'snow' },
  { key: 'snow-heavy', label: '大雪', peak: 1.5, type: 'snow' },
  { key: 'snow-storm', label: '暴雪', peak: 3, type: 'snow' },
  { key: 'snow-severe', label: '大暴雪', peak: 6, type: 'snow' },
  { key: 'snow-boundary', label: '8.0水当量边界', peak: 8, type: 'snow' },
  { key: 'snow-extreme', label: '特大暴雪', peak: 9, type: 'snow' },
  { key: 'mixed', label: '先雨后雪', peak: 1.5, type: 'mixed' },
]

function selectScenario(scenario) {
  selected.value = scenario.key
  const start = Math.floor(Date.now() / 300000) * 300000
  const factor = scenario.factor ?? (scenario.peak / 2.76)
  // 按 API 响应结构构造数据，再走与 weather.js 一致的字段归一化。
  const raw = {
    code: '200',
    updateTime: new Date(start).toISOString(),
    fxLink: 'https://www.qweather.com',
    summary: '35分钟后开始降水',
    minutely: sample.map((precip, index) => ({
      fxTime: new Date(start + index * 300000).toISOString(),
      // 边界场景保留 8/12 的精度，避免 toFixed 将 8.0 人为推过严格上界。
      precip: scenario.key === 'snow-boundary' && index === 20
        ? String(8 / 12)
        : ((scenario.ongoing && index < 7 ? 0.18 : precip) * factor).toFixed(5),
      type: scenario.type === 'mixed' ? (index < 14 ? 'rain' : 'snow') : (scenario.type || 'rain'),
    })),
    refer: { sources: ['QWeather'], license: ['QWeather Developers License'] },
  }
  weatherStore.MinutelyPrecipitation = {
    updateTime: raw.updateTime,
    points: raw.minutely.map((item) => ({
      time: item.fxTime,
      precip: Number(item.precip),
      type: item.type,
    })),
  }
  weatherStore.MinutelyStatus = 'ready'
  weatherStore.nowWeatherData = { icon: scenario.type === 'snow' ? '400' : '305', text: scenario.type === 'snow' ? '小雪' : '小雨' }
  weatherStore.MinutelyDetailsDialog = true
}

function toggleTheme() {
  mist.value = !mist.value
  document.documentElement.dataset.theme = mist.value ? 'mist' : ''
}

selectScenario(scenarios[0])
</script>

<style scoped>
.RainPreview {
  min-height: 100vh;
  background: radial-gradient(ellipse at 15% 15%, #577584, transparent 65%), var(--color-bg);
}
.RainPreviewControls {
  position: fixed;
  z-index: 80;
  top: 1rem;
  left: 50%;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0.4rem;
  width: calc(100% - 2rem);
  transform: translateX(-50%);
}
.RainPreviewLabel {
  margin-right: 0.4rem;
  color: var(--text-secondary);
  font-size: 0.8rem;
}
.RainPreviewControls button {
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--glass-border);
  border-radius: 0.6rem;
  background: var(--surface-modal);
  color: var(--text-secondary);
  font-size: 0.78rem;
}
.RainPreviewControls button[aria-pressed='true'] {
  border-color: var(--color-primary);
  color: var(--color-primary-soft);
}
.RainPreviewNote {
  position: fixed;
  z-index: 80;
  right: 1rem;
  bottom: 0.75rem;
  left: 1rem;
  margin: 0;
  color: var(--text-muted);
  font-size: 0.75rem;
  text-align: center;
}

.RainPreviewChip {
  position: fixed;
  z-index: 80;
  left: 50%;
  bottom: 3rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: calc(100% - 2rem);
  transform: translateX(-50%);
  color: var(--text-secondary);
  font-size: 0.75rem;
  white-space: nowrap;
}
</style>
