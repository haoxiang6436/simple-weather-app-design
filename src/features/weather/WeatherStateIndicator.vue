<template>
  <div class="state" role="status" aria-live="polite">
    <!-- 一整行就是刷新按钮：平时只有一个不打扰的图标，点击后原地变成「正在更新 → 更新完成」 -->
    <button class="state-btn" :class="[`is-${phase}`, { 'is-syncing': syncing }]" type="button" :title="hint"
      :aria-label="hint" @click="onRefresh">
      <!-- 进行中：轨道 + 90° 弧，整体旋转 -->
      <svg v-if="phase === 'loading' || phase === 'retry'" class="ico ico-spin" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
        <circle class="ring" cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 1 9 9" />
      </svg>
      <!-- 完成：对勾自己画出来 -->
      <svg v-else-if="phase === 'done'" class="ico ico-done" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle class="ring" cx="12" cy="12" r="9" />
        <path class="tick" d="M7.6 12.2l2.9 2.9 5.6-5.8" />
      </svg>
      <!-- 离线：wifi 断掉 -->
      <svg v-else-if="phase === 'offline'" class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
        <path d="M4.2 9.6a12 12 0 0 1 15.6 0" />
        <path d="M7.3 12.9a8 8 0 0 1 9.4 0" />
        <path d="M10.3 16.2a4 4 0 0 1 3.4 0" />
        <circle cx="12" cy="19" r="1.1" fill="currentColor" stroke="none" />
        <path d="M3 3.4 21 20.6" />
      </svg>
      <!-- 出错：感叹号 -->
      <svg v-else-if="phase === 'error'" class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.4v5.4" />
        <circle cx="12" cy="16.5" r="1.05" fill="currentColor" stroke="none" />
      </svg>
      <!-- 静止：环形箭头（缺口 + 折角箭头，15px 下比实心三角清楚），hover 转半圈，后台轮询时慢慢自转 -->
      <svg v-else class="ico ico-refresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-9-9" />
        <path d="M8.6 1.2 12.8 3.4 10.6 7.9" />
      </svg>

      <span class="state-text" :class="{ 'is-visible': !!text }">{{ text }}</span>
    </button>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref } from 'vue'
import { useWeatherStore } from '@/store/index'

// eslint-disable-next-line no-undef
const props = defineProps({
  state: { type: Number, required: true },
  updatedMinutesAgo: { type: Number, default: 0 },
  errCount: { type: Number, default: 0 },
})

/* 手动刷新：接口额度是用户自己申请的，什么时候再问一次由用户决定。
   节流（在途合并 + 30 秒冷却）全在 store 的 refreshWeatherManually 里，这里只负责「看起来对」：
   - 按钮永远可点（不 disabled、不进冷却态）。节流窗口内的点击不发请求，但照样走一遍
     正在更新 → 更新完成 的节奏，不然用户会以为没点上，然后一直点。
   - loading 至少亮 LOADING_MIN_MS 才允许关掉，再停 DONE_HOLD_MS 说「更新完成」，
     避免接口很快返回时闪一下就没了的廉价感。
   平时这一行不显示任何文案（只留一个刷新图标），「几分钟前更新」放进 title 提示里。 */
const weatherStore = useWeatherStore()
const { refreshWeatherManually } = weatherStore

const LOADING_MIN_MS = 700
const DONE_HOLD_MS = 1600

// idle | loading | done | offline —— 只描述「这一次手动点击」的节奏，和自动轮询互不干扰
// （offline 是点了之后发现没网：说一句「网络已断开」，停一会儿再交回常驻的「已离线」）
const manualPhase = ref('idle')
let doneTimer = null

// 后台 60 秒轮询此刻正在请求：图标慢慢自转，不弹文字、不闪
const syncing = computed(() => props.state === 100)

const phase = computed(() => {
  if (manualPhase.value !== 'idle') return manualPhase.value
  if (props.state === 300) return 'retry'
  if (props.state === 400) return 'offline'
  if (props.state === 0) return 'error'
  if (props.state === 200 || props.state === 100) return 'idle'
  return 'error'
})

const text = computed(() => {
  switch (phase.value) {
    case 'loading': return '正在更新'
    case 'done': return '更新完成'
    case 'retry': return `请求失败，第 ${props.errCount} 次重试中`
    // 点了一下但确实没网：单独说一句「网络已断开」，过一会儿再退回常驻的「已离线」
    case 'offline': return manualPhase.value === 'offline' ? '网络已断开' : '已离线'
    case 'error': return '接口出错了'
    default: return ''
  }
})

const hint = computed(() => {
  switch (phase.value) {
    case 'loading': return '正在更新天气数据'
    case 'done': return '更新完成'
    case 'retry': return `上一次请求失败了（已重试 ${props.errCount} 次），点击立即重试`
    case 'offline': return '网络已断开，点击重试'
    case 'error': return '接口出错了，点击重试'
    default: {
      const ago = props.updatedMinutesAgo < 1 ? '刚刚更新' : `${props.updatedMinutesAgo} 分钟前更新`
      return `${ago}，点击立即刷新（跳过缓存，消耗一次接口额度）`
    }
  }
})

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const onRefresh = async () => {
  // 正在跑的这一轮不叠加：等它自己走完
  if (manualPhase.value === 'loading') return
  clearTimeout(doneTimer)
  manualPhase.value = 'loading'
  const startedAt = Date.now()
  const result = await refreshWeatherManually()
  // loading 至少亮这么久，再切文案 —— 接口 200ms 返回也不会闪
  const remain = LOADING_MIN_MS - (Date.now() - startedAt)
  if (remain > 0) await wait(remain)
  // 离线：store 连请求都没发（或者请求是以断网失败的），绝不能报「更新完成」
  if (result?.reason === 'offline') {
    manualPhase.value = 'offline'
    doneTimer = setTimeout(() => {
      manualPhase.value = 'idle'
      doneTimer = null
    }, DONE_HOLD_MS)
    return
  }
  // 被节流挡下的点击（冷却中 / 已有请求在途）也算「完成」：不发请求，但要让用户看到反馈
  const throttled = result?.reason === 'cooling' || result?.reason === 'busy'
  if (!result?.ok && !throttled) {
    // 真的失败了，交回给 state 驱动的 retry / offline / error 文案
    manualPhase.value = 'idle'
    return
  }
  manualPhase.value = 'done'
  doneTimer = setTimeout(() => {
    manualPhase.value = 'idle'
    doneTimer = null
  }, DONE_HOLD_MS)
}

onUnmounted(() => clearTimeout(doneTimer))
</script>

<style scoped lang="scss">
.state {
  display: inline-flex;
  align-items: center;
  flex: none;
  font-size: 0.74rem;
  line-height: 1;
  color: var(--text-muted);
  white-space: nowrap;
}

/* 负 margin 把热区撑大，视觉上仍与图标一样大 */
.state-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.3125rem 0.375rem;
  margin: -0.3125rem -0.375rem;
  font: inherit;
  line-height: 1;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  transition: color 0.2s ease, background-color 0.2s ease, transform 0.12s ease;

  &:hover {
    color: var(--text-primary);
    background: var(--glass-bg-soft);
  }

  &:active {
    transform: scale(0.94);
  }

  &:focus-visible {
    outline: 2px solid var(--text-muted);
    outline-offset: 2px;
  }

  &.is-loading,
  &.is-done {
    color: var(--text-primary);
  }

  &.is-retry {
    color: var(--color-warn);
  }

  &.is-error {
    color: var(--color-danger);
  }
}

.state-text {
  display: inline-block;
  max-width: 0;
  margin-left: 0;
  overflow: hidden;
  opacity: 0;
  transition: max-width 0.22s ease, margin-left 0.22s ease, opacity 0.18s ease;

  &.is-visible {
    max-width: 12rem;
    margin-left: 0.4375rem;
    opacity: 1;
  }
}

.ico {
  display: block;
  flex: none;
  width: 0.9375rem;
  height: 0.9375rem;
}

.ring {
  opacity: 0.22;
}

.ico-refresh {
  transition: transform 0.35s ease;
}

.state-btn:hover .ico-refresh {
  transform: rotate(180deg);
}

.ico-spin {
  animation: spin 0.85s linear infinite;
}

/* 后台轮询在跑：不弹文字，图标自己慢转一圈 */
.is-syncing .ico-refresh {
  animation: spin 2.6s linear infinite;
}

.ico-done {
  animation: pop 0.3s ease;
}

.ico-done .tick {
  stroke-dasharray: 14;
  stroke-dashoffset: 14;
  animation: draw 0.34s 0.06s ease forwards;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pop {
  0% {
    opacity: 0;
    transform: scale(0.6);
  }

  60% {
    opacity: 1;
    transform: scale(1.08);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ico-spin,
  .is-syncing .ico-refresh,
  .ico-done,
  .ico-done .tick {
    animation: none;
  }

  .ico-done .tick {
    stroke-dashoffset: 0;
  }

  .ico-refresh,
  .state-btn,
  .state-text {
    transition: none;
  }
}
</style>
