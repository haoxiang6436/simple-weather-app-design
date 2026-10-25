<template>
  <!-- 分钟级降水入口：常驻在天气预警胶囊前面，点开看未来两小时的柱状图 -->
  <button class="minutely-chip" :class="`tone-${tone}`" type="button" aria-haspopup="dialog"
    :title="`分钟级降水：${text}（点击查看未来两小时）`"
    :aria-label="`分钟级降水：${text}，点击查看未来两小时`" @click="openMinutelyDetails">
    <svg class="minutely-chip-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.1c3.35 4.27 4.85 6.87 4.85 9.3a4.85 4.85 0 0 1-9.7 0c0-2.43 1.5-5.03 4.85-9.3z"
        fill="currentColor"></path>
    </svg>
    <span class="minutely-chip-text">{{ text }}</span>
  </button>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useWeatherStore } from '@/store/index'
import { analyzeMinutely, minutelyChipText } from './minutelyRain'

const weatherStore = useWeatherStore()
const { MinutelyPrecipitation, MinutelyStatus } = storeToRefs(weatherStore)
const { openMinutelyDetails } = weatherStore

/* 文案里的分钟数是相对「现在」算的，而数据 5 分钟才更新一次 ——
   所以除了数据刷新，还需要让「现在」自己往前走。
   20 秒一次足够（分钟级文案，不需要秒级精度）；页面被隐藏时定时器会被节流，
   回到前台时再补算一次即可（这里没有用 Worker：晚算几秒只是文案差一分钟，不影响观感）。 */
const now = ref(Date.now())
let timer = null
const tick = () => { now.value = Date.now() }
const onVisibilityChange = () => { if (!document.hidden) tick() }

onMounted(() => {
  timer = setInterval(tick, 20000)
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onUnmounted(() => {
  clearInterval(timer)
  timer = null
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

const analysis = computed(() => analyzeMinutely(MinutelyPrecipitation.value?.points, now.value))

const text = computed(() => {
  if (MinutelyStatus.value === 'unsupported') return '分钟级降水暂不可用'
  if (!MinutelyPrecipitation.value) {
    return MinutelyStatus.value === 'error' ? '分钟级降水暂不可用' : '分钟级降水加载中'
  }
  return minutelyChipText(analysis.value) || '分钟级降水'
})

// 语气色：正在下 → 按雨强分档；马上要下 → 蓝色描边；不下/不可用 → 中性
const tone = computed(() => {
  if (!analysis.value || MinutelyStatus.value === 'unsupported' || MinutelyStatus.value === 'error') return 'muted'
  if (analysis.value.expired) return 'muted'
  if (analysis.value.raining) return analysis.value.level.key
  if (analysis.value.startsIn !== null) return 'soon'
  return 'dry'
})
</script>

<style lang="scss" scoped>
/* 和天气预警胶囊同一套尺寸/圆角语言，保证前两颗胶囊看起来是一个系列。
   字号比预警胶囊（0.95rem）小一档：这颗胶囊装的是完整一句话（「正在下中雨，25 分钟后雨停，
   隔 15 分钟又有小雨」），0.9rem 时会在 250px 的左栏里被省略号截掉尾巴，压到 0.84rem 才整句放得下；
   内边距/图标间距也一起收窄（实测最长 216px / 可用 220px），把宽度让给文字。
   高度仍由 min-height 管着，和预警胶囊一样高，左栏排版不会因为文案变长而上下跳。 */
.minutely-chip {
  --rain-accent: var(--text-muted);
  --rain-bg: var(--glass-bg-soft);
  --rain-border: var(--glass-border);
  --rain-text: var(--text-secondary);

  position: relative;
  z-index: 1;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  width: fit-content;
  max-width: 100%;
  min-height: 2.375rem;
  padding: 0.4375rem 0.65rem;
  color: var(--rain-text);
  font-size: 0.84rem;
  font-weight: 600;
  text-align: left;
  background: var(--rain-bg);
  border: 1px solid var(--rain-border);
  border-radius: 999px;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.minutely-chip:hover {
  filter: brightness(1.12);
}

.minutely-chip-icon {
  flex: none;
  width: 0.95em;
  height: 0.95em;
  color: var(--rain-accent);
  overflow: hidden;
}

.minutely-chip-text {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 正在下：雨越大，蓝色越亮 */
.tone-light {
  --rain-accent: #7dd3fc;
  --rain-bg: rgba(56, 189, 248, 0.16);
  --rain-border: rgba(125, 211, 252, 0.42);
  --rain-text: #e2f4ff;
}

.tone-moderate {
  --rain-accent: #5cc8f8;
  --rain-bg: rgba(56, 189, 248, 0.24);
  --rain-border: rgba(94, 200, 248, 0.55);
  --rain-text: #eaf8ff;
}

.tone-heavy {
  --rain-accent: #38bdf8;
  --rain-bg: rgba(56, 189, 248, 0.32);
  --rain-border: rgba(56, 189, 248, 0.68);
  --rain-text: #f2fbff;
}

.tone-storm {
  --rain-accent: #67a8ff;
  --rain-bg: rgba(59, 130, 246, 0.34);
  --rain-border: rgba(103, 168, 255, 0.7);
  --rain-text: #f4f9ff;
}

/* 马上要下（现在还没下）：描边提示，不抢正在下雨的实心蓝 */
.tone-soon {
  --rain-accent: #7dd3fc;
  --rain-bg: rgba(56, 189, 248, 0.08);
  --rain-border: rgba(125, 211, 252, 0.5);
  --rain-text: #d7efff;
}

/* 两小时内不下：中性玻璃，弱化存在感 */
.tone-dry {
  --rain-accent: rgba(235, 242, 251, 0.6);
  --rain-bg: var(--glass-bg-soft);
  --rain-border: var(--glass-border);
  --rain-text: var(--text-secondary);
}

/* 不可用 / 数据过期：虚线描边，一眼看出不是「没雨」 */
.tone-muted {
  --rain-accent: var(--text-muted);
  --rain-bg: transparent;
  --rain-border: var(--glass-border);
  --rain-text: var(--text-muted);
  border-style: dashed;
}
</style>
