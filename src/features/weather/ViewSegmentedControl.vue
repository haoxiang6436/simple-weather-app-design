<template>
  <div ref="rootEl" class="view-switch" role="tablist" aria-label="预报视图">
    <!--
      分段控件（7 天 / 24 小时）。
      为什么用 tablist 而不是两个普通按钮：它在语义上就是「同一块内容的两种视图」，
      读屏软件报「选项卡，2 个中的第 1 个」比「切换 7 天 按钮」更贴切。
      键盘：左右键在两项之间移动（roving tabindex），Home/End 跳到首尾。
      ⚠️ 只负责「选中了哪一项」，不持有业务状态 —— 视图由外部传入，重载后能恢复。
      ⚠️ 滑块不是「两个等分的一半」：两段文案长度不同（「7 天」比「24 小时」窄一截），
         写死 50% 会让胶囊和字对不齐，所以宽度和位移都按被选中那一项实测出来。
    -->
    <span class="view-switch-thumb" aria-hidden="true"
      :style="{ width: `${thumbWidth}px`, transform: `translateX(${thumbLeft}px)` }"></span>
    <button v-for="(option, index) in options" :key="option.value" ref="buttons" type="button" role="tab"
      class="view-switch-item" :aria-selected="option.value === modelValue"
      :aria-controls="controls[index] || undefined"
      :tabindex="option.value === modelValue ? 0 : -1" @click="select(option.value)"
      @keydown="onKeydown">
      {{ option.label }}
    </button>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// eslint-disable-next-line no-undef
const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  // 被控制的那几片内容的 id（与 options 同下标），用来给 tab 加 aria-controls
  controls: { type: Array, default: () => [] },
})
// eslint-disable-next-line no-undef
const emit = defineEmits(['update:modelValue'])

const rootEl = ref(null)
const buttons = ref([])

const activeIndex = computed(() => {
  const index = props.options.findIndex((option) => option.value === props.modelValue)
  return index < 0 ? 0 : index
})

/* 滑块的几何：直接读被选中那一项的量，而不是算「一半」。
   两段宽度不一样（「7 天」34px /「24 小时」52px 这种事），算一半必然错位。
   注意坐标：整张卡片会被 transform: scale() 缩放，getBoundingClientRect() 拿到的是
   缩放后的尺寸，而滑块的 translateX / width 写在元素自身的坐标系里，所以要先除回缩放比；
   clientLeft 是容器边框宽度，绝对定位的包含块是 padding box，得把它扣掉。 */
const thumbWidth = ref(0)
const thumbLeft = ref(0)

const updateThumb = () => {
  const box = rootEl.value
  const el = buttons.value[activeIndex.value]
  if (!box || !el || !el.offsetWidth) return
  const boxRect = box.getBoundingClientRect()
  const itemRect = el.getBoundingClientRect()
  const scale = box.offsetWidth ? boxRect.width / box.offsetWidth : 1
  thumbWidth.value = itemRect.width / (scale || 1)
  thumbLeft.value = (itemRect.left - boxRect.left) / (scale || 1) - box.clientLeft
}

watch(activeIndex, () => nextTick(updateThumb), { flush: 'post' })
/* 文案本身也可能变（「7 天」会随壁纸属性变成「5 天」），那种变化不换选中项，
   只换宽度 —— 用量尺寸兜住它对滑块的连带影响（容器是 inline-flex，文案一变宽度就变）。 */
let sizeObserver = null
// 字体加载完宽度会变一档（Montserrat → 回退字体），量完再量一次
onMounted(() => {
  updateThumb()
  if (typeof ResizeObserver === 'function' && rootEl.value) {
    sizeObserver = new ResizeObserver(updateThumb)
    sizeObserver.observe(rootEl.value)
  }
  window.addEventListener('resize', updateThumb)
  if (document.fonts?.ready) document.fonts.ready.then(updateThumb).catch(() => {})
})
onBeforeUnmount(() => {
  sizeObserver?.disconnect()
  sizeObserver = null
  window.removeEventListener('resize', updateThumb)
})

const select = (value) => {
  if (value === props.modelValue) return
  emit('update:modelValue', value)
}

/* 方向键移动选中项，同时把焦点带过去：只有焦点和选中在同一项上，
   下一次按方向键才是「继续往同方向走」，而不是从旧位置重新开始。 */
const onKeydown = (event) => {
  const total = props.options.length
  if (!total) return
  let next = activeIndex.value
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (next + 1) % total
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (next - 1 + total) % total
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = total - 1
  else return
  event.preventDefault()
  select(props.options[next].value)
  buttons.value[next]?.focus()
}
</script>

<style scoped>
.view-switch {
  position: relative;
  display: inline-flex;
  flex: none;
  height: 2rem;
  padding: 0.1875rem;
  border-radius: 999px;
  background: var(--glass-bg-subtle);
  border: 1px solid var(--glass-border);
}

/* 滑块：宽高与位移都由 JS 按选中项实测写入（见 updateThumb） */
.view-switch-thumb {
  position: absolute;
  top: 0.1875rem;
  left: 0;
  height: calc(100% - 0.375rem);
  border-radius: 999px;
  background: var(--glass-active);
  border: 1px solid color-mix(in srgb, var(--color-primary) 35%, transparent);
  transition: transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1),
    width 0.28s cubic-bezier(0.34, 1.4, 0.64, 1);
  pointer-events: none;
}

.view-switch-item {
  appearance: none;
  position: relative;
  z-index: 1;
  height: 100%;
  min-width: 3rem;
  padding: 0 0.8125rem;
  border: 0;
  border-radius: 999px;
  background: none;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text-secondary);
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.2s ease;
}

.view-switch-item:hover {
  color: var(--text-secondary);
}

.view-switch-item[aria-selected='true'] {
  color: var(--color-primary-soft);
}

/* 减少动态效果：滑块直接落位，不做横移 */
@media (prefers-reduced-motion: reduce) {
  .view-switch-thumb {
    transition: none;
  }
}
</style>
