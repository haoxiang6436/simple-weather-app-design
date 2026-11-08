<template>
  <!-- 分钟级降水入口：常驻在天气预警胶囊前面，点开看未来两小时的柱状图 -->
  <button class="status-chip minutely-chip" :class="`tone-${tone}`" type="button" aria-haspopup="dialog"
    :title="`${presentation.title}：${text}（${presentation.referenceLabel}，点击查看未来两小时）`"
    :aria-label="`${presentation.title}：${text}，${presentation.referenceLabel}，点击查看未来两小时`" @click="openMinutelyDetails">
    <PrecipitationIcon class="minutely-chip-icon" :type="presentation.type" :data-precip-type="presentation.type || 'unknown'" />
    <span class="minutely-chip-text">{{ text }}</span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useWeatherStore } from '@/store/index'
import { useWeatherNow } from './useWeatherNow'
import { analyzeMinutely, minutelyChipText } from './minutelyRain'
import { precipitationPresentation } from './precipitationLevels'
import PrecipitationIcon from './PrecipitationIcon.vue'

const weatherStore = useWeatherStore()
const { MinutelyPrecipitation, MinutelyStatus, nowWeatherData } = storeToRefs(weatherStore)
const { openMinutelyDetails } = weatherStore

/* 文案里的分钟数是相对「现在」算的，而数据 5 分钟才更新一次 ——
   所以除了数据刷新，还需要让「现在」自己往前走。
   这里用全应用共用的 useWeatherNow（20 秒一次，回前台立刻补一次）：
   弹层标题、壁纸雨滴读的是同一个 now，三处不会在 5 分钟边界附近各说各话。 */
const now = useWeatherNow()

const analysis = computed(() => analyzeMinutely(MinutelyPrecipitation.value?.points, now.value))
const presentation = computed(() => precipitationPresentation(analysis.value, nowWeatherData.value))

const text = computed(() => {
  if (MinutelyStatus.value === 'unsupported') return `${presentation.value.title}暂不可用`
  if (!MinutelyPrecipitation.value) {
    return `${presentation.value.title}${MinutelyStatus.value === 'error' ? '暂不可用' : '加载中'}`
  }
  if (analysis.value?.expired) return `${presentation.value.title}待更新`
  return minutelyChipText(analysis.value) || presentation.value.title
})

// 语气色：正在下 → 按雨强分档；马上要下 → 蓝玻璃；不下/不可用 → 中性
const tone = computed(() => {
  if (!analysis.value || MinutelyStatus.value === 'unsupported' || MinutelyStatus.value === 'error') return 'muted'
  if (analysis.value.expired) return 'muted'
  if (analysis.value.raining) return analysis.value.level.tone
  if (analysis.value.startsIn !== null) return 'soon'
  return 'dry'
})
</script>

<style lang="scss" scoped>
/* 和天气预警胶囊共用 .status-chip 的几何 / 字号（0.875rem / 600 / 12px 圆角）。
   A 方案：只有「正在下 / 马上要下」才点亮；无雨 / 加载中 / 不可用保持
   暗玻璃或中性，不常亮，避免常驻亮块抢大温度。
   点亮时是半透明蓝色玻璃 + 1px 同色细边（--chip-bg / --chip-border +
   backdrop blur，材质见 chips.scss），不是浅色平涂，也不用深色文字。
   宽度仍是最紧的一处：1920×1080 + panel-scale 0.75 下左栏内容宽约 255px（padding 2rem），
   最长的一句在 0.875rem 下接近这个宽度；改文案前先量一次，别让后半场被省略号截掉。
   高度由 .status-chip 的 min-height 管着，和预警胶囊一样高，左栏排版不会因文案变长而上下跳。 */
.minutely-chip-icon {
  flex: none;
  width: var(--chip-icon-size);
  height: var(--chip-icon-size);
  overflow: hidden;
}

.minutely-chip-text {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 正在下 / 马上要下：半透明蓝色玻璃。雨强交给文案，一种蓝就够 */
.minutely-chip.tone-light,
.minutely-chip.tone-moderate,
.minutely-chip.tone-heavy,
.minutely-chip.tone-storm {
  --chip-bg: var(--rain-chip-bg);
  --chip-border: 1px solid var(--rain-chip-border);
  --chip-text: var(--rain-chip-text);
  --chip-icon: var(--rain-chip-icon);
}

/* 马上要下（现在还没下）：同属蓝玻璃，略冷一档 */
.minutely-chip.tone-soon {
  --chip-bg: var(--rain-chip-bg);
  --chip-border: 1px solid var(--rain-chip-border);
  --chip-text: var(--rain-chip-text);
  --chip-icon: var(--rain-chip-icon);
}

/* 两小时内不下：保持暗玻璃，弱化存在感 */
.minutely-chip.tone-dry {
  --chip-bg: var(--glass-bg-soft);
  --chip-text: var(--text-secondary);
  --chip-icon: var(--text-muted);
  --chip-border: 1px solid var(--glass-border);
}

/* 不可用 / 数据过期：虚线 + 次级文字，和「没雨」区分开 */
.minutely-chip.tone-muted {
  --chip-bg: transparent;
  --chip-text: var(--text-secondary);
  --chip-icon: var(--text-muted);
  --chip-border: 1px dashed var(--glass-border);
}
</style>
