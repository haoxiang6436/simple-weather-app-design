<template>
  <section class="forecast-panel" aria-label="天气预报">
    <!--
      预报面板：两片等高视图（7 天 / 24 小时），切哪个由外面那行日出日落上的分段控件决定。
      为什么不给面板自己加一行标题：右侧这一列是硬高度（46.5rem 卡片减掉 padding），
      实测只剩 7px 余量，加一行 2.125rem 的标题会把 7 天条最后一行温度顶出卡片。
      于是那把控件改挂在「日出 06:14 · 日落 17:03」右边 —— 那行本来就是 inline-flex、右边空着。
      两种视图固定 12.5625rem 等高：切换时整张卡一个像素都不动，否则下面内容会上下跳。
    -->
    <div class="forecast-views">
      <!-- 两片绝对定位、互斥显示：谁在前台谁可见，另一片留在原地量尺寸（BetterScroll 需要宽度） -->
      <div id="forecast-pane-daily" class="forecast-pane" :class="{ 'is-active': view === 'daily' }"
        :aria-hidden="view !== 'daily'">
        <ForecastStrip :days="days" :active-date="activeDate" :active="view === 'daily'"
          @select="emit('select', $event)" />
      </div>
      <div id="forecast-pane-hourly" class="forecast-pane" :class="{ 'is-active': view === 'hourly' }"
        :aria-hidden="view !== 'hourly'">
        <HourlyStrip :hours="hours" :status="status" :active="view === 'hourly'"
          @retry="emit('retry')" />
      </div>
    </div>
  </section>
</template>

<script setup>
import ForecastStrip from './ForecastStrip.vue'
import HourlyStrip from './HourlyStrip.vue'

// eslint-disable-next-line no-undef
defineProps({
  days: { type: Array, default: () => [] },
  activeDate: { type: String, default: '' },
  hours: { type: Array, default: () => [] },
  status: { type: String, default: 'idle' },
  view: { type: String, default: 'daily' },
})
// eslint-disable-next-line no-undef
const emit = defineEmits(['select', 'retry'])
</script>

<style scoped>
.forecast-panel {
  /* 两种视图共用的高度：7 天条和 24 小时条都按这个数排版（见各自组件顶部的高度账） */
  --forecast-height: 12.5625rem;
}

.forecast-views {
  position: relative;
  height: var(--forecast-height);
}

/* 切换：旧视图 120ms 淡出、新视图 200ms 淡入并上移 4px。
   不用 height / margin 过渡 —— 那会让下面的内容跟着动。 */
.forecast-pane {
  position: absolute;
  inset: 0;
  opacity: 0;
  visibility: hidden;
  transform: translateY(0.25rem);
  transition: opacity 0.12s ease, transform 0.12s ease, visibility 0s linear 0.12s;
}

.forecast-pane.is-active {
  opacity: 1;
  visibility: visible;
  transform: none;
  transition: opacity 0.2s ease 0.04s, transform 0.2s ease 0.04s, visibility 0s;
}

@media (prefers-reduced-motion: reduce) {
  .forecast-pane,
  .forecast-pane.is-active {
    transition: none;
    transform: none;
  }
}
</style>
