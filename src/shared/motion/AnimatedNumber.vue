<template>
  <span class="animated-number">{{ display }}<slot /></span>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * 数值滚动（count-up）。
 *
 * 只做一件事：把 value 从当前显示值缓动到新值，`requestAnimationFrame` 自己算，
 * 不引入动画库，也不会像 Arco Statistic 那样带一套组件 DOM / 全局样式。
 *
 * 几个容易踩的点，都在这里统一处理：
 * - 小数位固定：降雨量 0 显示成 0.00，动画过程中也不会从「0」变成「0.00」再跳一下；
 * - 连续换数据不跳：新动画从「当前显示值」起步，而不是每次都从 0 重来；
 * - 缺数据不滚：null / '' / 非数字直接显示 fallback（默认「—」），单位仍由插槽给；
 * - 系统开了「减少动态效果」时直接落到终值，不跑 rAF。
 *
 * 用法：
 *   <AnimatedNumber :value="daily.precip" :decimals="2"><small> mm</small></AnimatedNumber>
 *   <AnimatedNumber :value="daily.tempAvg"><small> °C</small></AnimatedNumber>
 */

// eslint-disable-next-line no-undef
const props = defineProps({
  // 数字或数字字符串；null / undefined / '' / 非数字都按「没有数据」处理
  value: { type: [Number, String], default: null },
  // 固定小数位，默认 0
  decimals: { type: Number, default: 0 },
  // 动画时长（毫秒）
  duration: { type: Number, default: 820 },
  // 首次挂载的起步延迟，用来和卡片错峰进场对齐；数据后续更新不延迟
  delay: { type: Number, default: 0 },
  // 首次挂载从哪个值开始滚；默认 0（从 0 滚到目标值）
  from: { type: Number, default: 0 },
  fallback: { type: String, default: '—' },
  // 首屏已经有数据时是否也滚一次；false 则直接显示终值
  animateOnMount: { type: Boolean, default: true },
})

const precision = computed(() => Math.min(3, Math.max(0, Math.trunc(props.decimals))))

// 字符串先转数字，避免把 "63" 当成文本直接显示、失去动画
const target = computed(() => {
  if (props.value === null || props.value === undefined || props.value === '') return null
  const value = Number(props.value)
  return Number.isFinite(value) ? value : null
})

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// toFixed 会把 -0.2 舍入成字符串 "-0"，温度从负值滚到正值时会闪一下负号
const format = (value) => {
  const rounded = Number(value.toFixed(precision.value))
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(precision.value)
}

const canAnimateMount = props.animateOnMount && !reducedMotion()
const initialTarget = target.value
const display = ref(
  initialTarget === null ? props.fallback : format(canAnimateMount ? props.from : initialTarget)
)
let currentValue = initialTarget === null ? null : canAnimateMount ? props.from : initialTarget

let frameId = 0
let delayTimer = 0
let runId = 0

const stop = () => {
  runId += 1
  cancelAnimationFrame(frameId)
  clearTimeout(delayTimer)
  frameId = 0
  delayTimer = 0
}

const tweenTo = (to, startDelay = 0) => {
  stop()
  const token = runId
  const startValue = currentValue === null ? props.from : currentValue

  // 值没变就不跑一帧空动画
  if (startValue === to) {
    currentValue = to
    display.value = format(to)
    return
  }

  const beginAt = performance.now() + Math.max(0, startDelay)
  const duration = Math.max(1, props.duration)

  const step = (now) => {
    if (token !== runId) return
    if (now < beginAt) {
      frameId = requestAnimationFrame(step)
      return
    }
    const progress = Math.min(1, (now - beginAt) / duration)
    // quartOut：起手快、收尾慢，数字停下来的那一下不会显得机械
    const eased = 1 - (1 - progress) ** 4
    currentValue = startValue + (to - startValue) * eased
    display.value = format(currentValue)
    if (progress < 1) {
      frameId = requestAnimationFrame(step)
    } else {
      currentValue = to
      display.value = format(to)
      frameId = 0
    }
  }

  // 用 setTimeout 而不是把延迟算进第一帧：延迟期间不占用 rAF 回调
  if (startDelay > 0) {
    delayTimer = setTimeout(() => {
      delayTimer = 0
      frameId = requestAnimationFrame(step)
    }, startDelay)
  } else {
    frameId = requestAnimationFrame(step)
  }
}

onMounted(() => {
  const to = target.value
  if (to === null) {
    display.value = props.fallback
    return
  }
  if (!canAnimateMount) {
    currentValue = to
    display.value = format(to)
    return
  }
  tweenTo(to, props.delay)
})

watch(target, (to, previous) => {
  if (to === null) {
    stop()
    currentValue = null
    display.value = props.fallback
    return
  }
  // 首次从「无数据」变成有数据：从 from 起步，不要接着上一次的 null 跳
  if (previous === null) {
    currentValue = props.from
    display.value = format(props.from)
  }
  if (reducedMotion()) {
    stop()
    currentValue = to
    display.value = format(to)
    return
  }
  tweenTo(to)
})

onBeforeUnmount(stop)
</script>

<style scoped>
/* 等宽数字：动画过程中 1 和 8 不会因为字宽不同把后面的单位推来推去 */
.animated-number {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}
</style>
