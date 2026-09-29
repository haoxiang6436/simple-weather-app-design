<template>
  <div class="PickerColumn">
    <div class="pc-head">{{ title }}</div>
    <div class="pc-body">
      <!-- 拖拽滚动由 BetterScroll 负责（Wallpaper Engine 不转发滚轮事件） -->
      <div ref="scrollEl" class="pc-scroll">
        <div class="pc-content">
          <ul class="pc-list">
            <li v-for="item in items" :key="item.value" class="pc-item"
              :class="{ active: item.value === active }" @click="handleSelect(item)">
              <span class="pc-text">{{ item.label }}</span>
              <svg v-if="item.value === active" class="pc-check" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
                  stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
              </svg>
            </li>
          </ul>
          <p v-if="!items.length" class="pc-empty">{{ emptyText }}</p>
        </div>
      </div>
      <!-- 自绘滚动条：可拖拽、可点轨道 -->
      <div ref="barEl" class="pc-bar" :class="{ 'is-visible': bar.visible }" @mousedown="handleTrackDown">
        <div ref="thumbEl" class="pc-thumb" @mousedown.stop="handleThumbDown"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import BetterScroll, { useMouseWheelPlugin } from './betterScroll'

// eslint-disable-next-line no-undef
const props = defineProps({
  title: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  active: { type: String, default: '' },
  emptyText: { type: String, default: '请先选择上一级' },
})
// eslint-disable-next-line no-undef
const emit = defineEmits(['select'])

const scrollEl = ref(null)
const barEl = ref(null)
const thumbEl = ref(null)
// 只把"是否显示滚动条"交给响应式；滑块位置直接写 DOM，
// 否则滚动过程中每帧都会重渲染整个列表（Wallpaper Engine 里会明显掉帧）
const bar = reactive({ visible: false })

let scroll = null
let dragState = null
let thumbHeight = 0

// 滚动时不再读 DOM（避免每帧强制重排），尺寸只在 refresh / resize 时量一次
const metrics = { wrapper: 0, content: 0, track: 0 }

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const measure = () => {
  metrics.wrapper = scrollEl.value?.clientHeight || 0
  metrics.content = scrollEl.value?.firstElementChild?.offsetHeight || 0
  metrics.track = barEl.value?.clientHeight || metrics.wrapper
}

const maxScroll = () => Math.max(metrics.content - metrics.wrapper, 0)
const currentScroll = () => clamp(-(scroll?.y || 0), 0, maxScroll())

const updateBar = () => {
  const { wrapper, content, track } = metrics
  const range = Math.max(content - wrapper, 0)
  if (!range || !wrapper || !track) {
    thumbHeight = 0
    bar.visible = false
    return
  }
  // 滑块最小 28px，保证短列表里也抓得住
  thumbHeight = Math.max((wrapper / content) * track, 28)
  const offset = (currentScroll() / range) * Math.max(track - thumbHeight, 0)
  if (thumbEl.value) {
    thumbEl.value.style.height = `${thumbHeight}px`
    thumbEl.value.style.transform = `translateY(${offset}px)`
  }
  if (!bar.visible) bar.visible = true
}

const refresh = async () => {
  await nextTick()
  scroll?.refresh()
  measure()
  updateBar()
}

const handleSelect = (item) => emit('select', item)

const handleThumbDown = (event) => {
  if (!bar.visible || !scroll) return
  event.preventDefault()
  dragState = {
    startY: event.clientY,
    startScroll: currentScroll(),
    range: Math.max(metrics.track - thumbHeight, 0),
    max: maxScroll(),
  }
  window.addEventListener('mousemove', handleDragMove)
  window.addEventListener('mouseup', handleDragEnd)
}

const handleDragMove = (event) => {
  if (!dragState || !scroll) return
  const delta = event.clientY - dragState.startY
  const ratio = dragState.range ? delta / dragState.range : 0
  const next = clamp(dragState.startScroll + ratio * dragState.max, 0, dragState.max)
  scroll.scrollTo(0, -next, 0)
  updateBar()
}

const handleDragEnd = () => {
  dragState = null
  window.removeEventListener('mousemove', handleDragMove)
  window.removeEventListener('mouseup', handleDragEnd)
  updateBar()
}

const handleTrackDown = (event) => {
  if (!bar.visible || !scroll) return
  const range = Math.max(metrics.track - thumbHeight, 0)
  const barRect = barEl.value?.getBoundingClientRect()
  if (!range || !barRect) return
  event.preventDefault()
  const max = maxScroll()
  const offset = event.clientY - barRect.top - thumbHeight / 2
  const ratio = clamp(offset / range, 0, 1)
  scroll.scrollTo(0, -ratio * max, 200)
}

const onResize = () => refresh()

onMounted(async () => {
  useMouseWheelPlugin()
  await nextTick()
  if (!scroll && scrollEl.value) {
    scroll = new BetterScroll(scrollEl.value, {
      scrollY: true,
      click: true,
      bounce: false,
      // probeType 3：拖拽与惯性滚动过程中持续派发 scroll 事件。
      // 默认值 0 只在滚动结束时派发（甚至不派发），自绘滚动条就会一直停在原地。
      probeType: 3,
      mouseWheel: { speed: 18, easeTime: 200 },
    })
    scroll.on('scroll', updateBar)
    scroll.on('scrollEnd', updateBar)
  }
  refresh()
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  handleDragEnd()
  scroll?.destroy()
  scroll = null
  window.removeEventListener('resize', onResize)
})

// 列表内容变化（切换省/市）→ 复位到顶部并重新计算滚动条
watch(
  () => props.items,
  () => {
    refresh().then(() => scroll?.scrollTo(0, 0, 0))
  }
)

// 选中项变化（例如从"最近选择"恢复）→ 滚动到可见位置
watch(
  () => props.active,
  async (value) => {
    await refresh()
    if (!value || !scroll) return
    try {
      scroll.scrollToElement('.pc-item.active', 260)
    } catch (error) {
      // 找不到元素时忽略（列表还没渲染完）
    }
  }
)
</script>

<style lang="scss" scoped>
.PickerColumn {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.pc-head {
  flex: none;
  padding: 0.75rem 0.875rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.pc-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}

/* BetterScroll 要求外层固定高度 + overflow:hidden */
.pc-scroll {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
}

.pc-content {
  padding: 0.375rem 0.5rem 0.625rem;
}

.pc-list {
  margin: 0;
  padding: 0;
}

.pc-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 2.125rem;
  padding: 0.375rem 0.625rem;
  border-radius: 0.625rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;

  &:hover {
    background: var(--glass-bg-soft);
    color: var(--text-primary);
  }

  &.active {
    background: rgba(56, 189, 248, 0.18);
    color: var(--text-primary);
    font-weight: 600;
  }
}

.pc-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-check {
  flex: none;
  width: 1rem;
  height: 1rem;
  color: var(--color-primary);
}

.pc-empty {
  margin: 0.75rem 0.5rem;
  font-size: 0.82rem;
  color: var(--text-muted);
}

/* 自绘滚动条（Wallpaper Engine 里唯一可见的滚动提示） */
.pc-bar {
  position: relative; /* 滑块绝对定位的参照，缺了这行 top/transform 就全被忽略 */
  flex: none;
  width: 0.375rem;
  margin: 0.5rem 0.25rem 0.5rem 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  opacity: 0;
  transition: opacity 0.2s ease;

  &.is-visible {
    opacity: 1;
  }
}

.pc-thumb {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  border-radius: 999px;
  background: rgba(235, 242, 251, 0.42);
  cursor: grab;
  transition: background 0.16s ease;

  &:hover {
    background: rgba(235, 242, 251, 0.68);
  }

  &:active {
    cursor: grabbing;
  }
}
</style>
