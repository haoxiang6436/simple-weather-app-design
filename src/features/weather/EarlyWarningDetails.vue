<template>
  <div class="EarlyWarningDialog" @click="EarlyWarningDetailsDialog = false">
    <div class="EarlyPanel" @click.stop>
      <div class="EarlyHeader">
        <span class="EarlyHeaderTitle">天气预警<em v-if="WeatherEarlyWarning.length" class="EarlyHeaderCount">×{{ WeatherEarlyWarning.length }}</em></span>
        <button class="EarlyClose" type="button" aria-label="关闭" @click="EarlyWarningDetailsDialog = false">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              d="M6 6l12 12M18 6L6 18"></path>
          </svg>
        </button>
      </div>

      <!-- 手风琴：一次展开一条；溢出交给 BetterScroll 拖拽滚动 -->
      <div class="EarlyScroll">
        <div class="EarlyContent">
          <div v-for="item in WeatherEarlyWarning" :key="item.id" class="warning-item"
            :class="['sev-' + severityKey(item.level), { open: expandedId === item.id }]">
            <button class="warning-head" type="button" @click="toggle(item.id)">
              <span class="warning-dot"></span>
              <span class="warning-title-label">{{ item.title }}</span>
              <span class="warning-level">{{ item.level }}</span>
              <svg class="warning-chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                  stroke-linejoin="round" d="M6 9l6 6 6-6"></path>
              </svg>
            </button>
            <div class="warning-body">
              <div class="warning-body-inner">
                <div class="warning-text">{{ item.text }}</div>
                <div class="warning-info">{{ DateFormat(item.pubTime) }} - {{ item.sender }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import BetterScroll from '@better-scroll/core';
import MouseWheel from '@better-scroll/mouse-wheel';
import { nextTick, onMounted, onUnmounted, watch, ref } from 'vue';
import { useWeatherStore } from '@/store/index';
import { storeToRefs } from 'pinia';
const weatherStore = useWeatherStore()
const { EarlyWarningDetailsDialog, WeatherEarlyWarning } = storeToRefs(weatherStore)
BetterScroll.use(MouseWheel)

// 手风琴：一次只展开一条，默认展开第一条
const expandedId = ref(null)
const toggle = (id) => {
  expandedId.value = expandedId.value === id ? null : id
  // 展开/收起会改变内容高度，等待过渡结束后刷新 BetterScroll 的滚动范围
  setTimeout(() => scroll?.refresh(), 380)
}

let scroll = null
const initScroll = async () => {
  await nextTick()
  if (!scroll) {
    scroll = new BetterScroll('.EarlyScroll', {
      scrollY: true,
      mouseWheel: {
        speed: 20,
        invert: false,
        easeTime: 300
      },
      bounce: true,
      bounceTime: 800,
      click: true,
    })
  } else {
    scroll.refresh()
  }
}

const onResize = () => scroll?.refresh()

onMounted(async () => {
  await initScroll()
  requestAnimationFrame(() => scroll?.refresh())
  // 默认展开第一条会带动画，等动画结束再刷新一次滚动范围
  setTimeout(() => scroll?.refresh(), 400)
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  scroll?.destroy()
  scroll = null
  window.removeEventListener('resize', onResize)
})

watch(WeatherEarlyWarning, (list) => {
  expandedId.value = list?.[0]?.id ?? null
  initScroll()
}, { immediate: true })

// 预警等级 -> 强调色 class（与全局 .sev-* 色板对应）
const severityKey = (level) => {
  const l = level || ''
  if (l.includes('红')) return 'red'
  if (l.includes('橙')) return 'orange'
  if (l.includes('黄')) return 'yellow'
  return 'blue'
}

const DateFormat = (date) => {
  const inputDate = new Date(date);
  const now = new Date();
  const diffInMilliseconds = Math.abs(now - inputDate);
  if (diffInMilliseconds < 1000 * 60) {
    return "刚刚";
  } else if (diffInMilliseconds < 1000 * 60 * 60) {
    const minutes = Math.floor(diffInMilliseconds / (1000 * 60));
    return `${minutes} 分钟前`;
  } else if (diffInMilliseconds < 1000 * 60 * 60 * 24) {
    const hours = Math.floor(diffInMilliseconds / (1000 * 60 * 60));
    return `${hours} 小时前`;
  } else {
    const days = Math.floor(diffInMilliseconds / (1000 * 60 * 60 * 24));
    return `${days} 天前`;
  }
};
</script>

<style lang="scss" scoped>
.EarlyWarningDialog {
  position: fixed;
  left: 0;
  top: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  /* 顶部固定：面板从固定 top 位置向下生长，头部不随高度变化上下晃 */
  align-items: flex-start;
  padding-top: clamp(48px, 12vh, 110px);
  background-color: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  z-index: 60;
}

/* 卡片滑入 / 滑出 */
.EarlyWarningDialog.Dialog-enter-active .EarlyPanel,
.EarlyWarningDialog.Dialog-leave-active .EarlyPanel {
  transition: transform 0.34s var(--ease), opacity 0.3s ease;
}

.EarlyWarningDialog.Dialog-enter-from .EarlyPanel {
  transform: translateY(28px) scale(0.96);
  opacity: 0;
}

.EarlyWarningDialog.Dialog-leave-to .EarlyPanel {
  transform: translateY(20px) scale(0.97);
  opacity: 0;
}

/* 面板：不写死高度，只给最大高度；内容少则自动变矮，多则封顶交给 BetterScroll 滚动 */
.EarlyPanel {
  width: min(62vw, 820px);
  max-height: min(78vh, 800px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(18, 30, 52, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 22px;
  box-shadow: 0 28px 70px -28px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.EarlyHeader {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 12px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.EarlyHeaderTitle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: clamp(1.1rem, 1.6vw, 1.4rem);
  font-weight: 700;
  color: var(--text-primary);
}

.EarlyHeaderCount {
  font-style: normal;
  font-size: 0.62em;
  font-weight: 700;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.25);
  padding: 2px 8px;
  border-radius: 999px;
}

.EarlyClose {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--text-secondary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 50%;
  transition: background 0.2s ease;

  &:hover {
    background: var(--glass-border);
  }
}

/* BetterScroll 包裹层：固定高度、overflow:hidden、不封顶内容层 */
.EarlyScroll {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.EarlyContent {
  padding: 14px 16px 18px;
}

/* ===== 手风琴 ===== */
.warning-item {
  margin: 10px 0;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--glass-border);
  border-left: 4px solid var(--sev);
  border-radius: 16px;
  overflow: hidden;
  transition: background 0.2s ease, border-color 0.2s ease, border-left-color 0.2s ease;

  &.open {
    background: var(--sev-bg);
    border-color: var(--glass-border-strong);
    border-left-color: var(--sev);
  }
}

.warning-head {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 15px 20px;
  text-align: left;
  color: var(--text-primary);
  background: transparent;
  border: none;
  font-size: clamp(0.95rem, 1.05vw, 1.05rem);

  &:hover {
    background: rgba(255, 255, 255, 0.04);
  }
}

.warning-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: var(--sev);
}

.warning-title-label {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.warning-level {
  flex: none;
  font-size: 0.82em;
  font-weight: 700;
  color: var(--sev-text);
  background: var(--sev-bg);
  border: 1px solid var(--sev-border);
  padding: 2px 10px;
  border-radius: 999px;
}

.warning-chevron {
  flex: none;
  color: var(--text-muted);
  transition: transform 0.3s var(--ease);
}

.warning-item.open .warning-chevron {
  transform: rotate(180deg);
}

.warning-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.34s var(--ease);
}

.warning-item.open .warning-body {
  grid-template-rows: 1fr;
}

.warning-body-inner {
  min-height: 0;
  overflow: hidden;
  padding: 0 20px;
  text-align: left;
}

.warning-item.open .warning-body-inner {
  padding-bottom: 16px;
}

.warning-text {
  font-size: 0.95rem;
  line-height: 1.65;
  color: var(--text-secondary);
}

.warning-info {
  margin-top: 12px;
  font-size: 0.8rem;
  color: var(--text-muted);
  text-align: right;
}
</style>
