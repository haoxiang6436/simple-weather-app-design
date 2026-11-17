<template>
  <button v-if="air" class="status-chip aqi-chip" :class="[`aqi-${band}`, { 'aqi-compact': longGrade }]"
    type="button" aria-haspopup="dialog"
    :aria-label="`${ariaLabel}，点击查看空气质量详情`" :title="titleText" @click="openDetails">
    <span class="aqi-label" aria-hidden="true">AQI</span>
    <span class="aqi-grade">{{ grade }}</span>
  </button>
</template>

<script setup>
/* 实时空气质量：挂在当前温度右侧的一颗胶囊。
   结构照参考图 —— 「AQI + 等级」同一颗药丸，材质仍走卡片的毛玻璃：
   低透明度语气色 + 1px 同色细边，颜色只由 .aqi-1 ~ .aqi-6 提供（见 style/air-quality.scss）。
   可点：点开是空气质量弹层（AirQualityDialog.vue），AQI 数值、首要污染物、
   健康建议和来源都在里面展开。
   为什么胶囊里不放数字：温度行右边只有约 4rem（负数温度时只剩约 3.7rem）的余量，
   「AQI 128 轻度污染」这种最宽的一档要 6.4rem，一定会顶出卡片；
   而「AQI 优」「轻度污染」最宽也不到 4rem，正反两种温度都放得下，不会出现半截胶囊。

   （说明放在 script 里而不是 <template> 顶层，避免根节点变成 Fragment —— 见 transitions.scss 的 ⚠️） */
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useWeatherStore } from '@/store/index'
import { airQualityBand, airQualityGrade } from './airQuality'

const weatherStore = useWeatherStore()
const { AirQuality } = storeToRefs(weatherStore)
const { openAirQualityDetails } = weatherStore

// 没有数据就整颗不渲染：加载中、没权限、该地点不在覆盖范围，都保持温度行原样
const air = computed(() => AirQuality.value)

/* 语气档位 1-6 和中文用词都来自 airQuality.js —— 弹层用的是同一份口径，
   两处各写一套的话，换标准（英美的 10 档、加拿大的 11 档）时会各算各的。 */
const band = computed(() => airQualityBand(air.value))

const grade = computed(() => airQualityGrade(band.value, air.value?.category))

/* 「轻度污染 / 中度污染 / 重度污染 / 严重污染」是四个字，比「优 / 良」多出三倍宽。
   温度旁边放不下「AQI + 四个字」（约 6.2rem），所以等级词一长就把「AQI」小标签收起来：
   等级词自己已经说清了是什么（空气污染），标签只是补充；
   数字和完整等级仍由提示和读屏文案各自说全。 */
const longGrade = computed(() => grade.value.length > 2)

const ariaLabel = computed(() => {
  const a = air.value
  if (!a) return ''
  return `空气质量指数 ${a.display}，${grade.value}${a.primaryPollutant ? `，首要污染物 ${a.primaryPollutant}` : ''}`
})

const titleText = computed(() => {
  const a = air.value
  if (!a) return ''
  const parts = [`空气质量指数 ${a.display}（${grade.value}）`]
  if (a.primaryPollutant) {
    const pm = a.pm25 ? `${a.primaryPollutant}，PM2.5 ${a.pm25.value} ${a.pm25.unit}` : a.primaryPollutant
    parts.push(`首要污染物：${pm}`)
  }
  if (a.advice) parts.push(a.advice)
  parts.push('点击查看完整空气质量')
  return parts.join(' · ')
})

const openDetails = () => { openAirQualityDetails() }
</script>

<style lang="scss" scoped>
/* 几何：比左栏那两颗状态胶囊（2.375rem）矮一档、圆角做成完整药丸，
   让它看起来是贴在温度旁边的标签，而不是又一条状态信息。
   宽度不写死：两位数 / 四个字的等级都靠内容撑开，最宽的一档
   （四个字的污染等级，收掉「AQI」标签后）正好落在温度行右侧的余量里。 */
.aqi-chip {
  --chip-height: 2.125rem;
  --chip-pad-y: 0.25rem;
  --chip-pad-x: 0.5rem;
  --chip-gap: 0.25rem;
  --chip-font-size: 0.8rem;
  --chip-radius: 999px;
  flex: none;
  max-width: 100%;
  white-space: nowrap;
  /* 胶囊从 span 变成 button 后浏览器会给一套默认外观，这里全部按 chips.scss 的材质来 */
  appearance: none;
  -webkit-appearance: none;
  border: var(--chip-border, 0);
  text-align: left;
}

/* 「AQI」用小一号的半透明字：它是标签，不该和等级抢注意力 */
.aqi-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  opacity: 0.72;
}

.aqi-grade {
  font-weight: 600;
  letter-spacing: 0.01em;
}

.aqi-compact .aqi-label {
  display: none;
}
</style>
