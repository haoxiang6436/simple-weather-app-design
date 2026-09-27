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
        <div class="pc-thumb" :style="{ top: bar.top + 'px', height: bar.height + 'px' }"
          @mousedown.stop="handleThumbDown"></div>
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
const bar = reactive({ top: 0, height: 0, visible: false })

let scroll = null
let dragState = null

const contentHeight = () => scrollEl.value?.firstElementChild?.offsetHeight || 0
const wrapperHeight = () => scrollEl.value?.clientHeight || 0
const maxScroll = () => Math.max(contentHeight() - wrapperHeight(), 0)

const updateBar = () => {
  const wrapper = wrapperHeight()
  const content = contentHeight()
  const range = Math.max(content - wrapper, 0)
  if (!range || !wrapper) {
    bar.visible = false
    bar.top = 0
    bar.height = wrapper
    return
  }
  const height = Math.max((wrapper / content) * wrapper, 28)
  const y = Math.min(Math.max(-(scroll?.y || 0), 0), range)
  bar.visible = true
  bar.height = height
  bar.top = (y / range) * (wrapper - height)
}

const refresh = async () => {
  await nextTick()
  scroll?.refresh()
  updateBar()
}

const handleSelect = (item) => emit('select', item)

const handleThumbDown = (event) => {
  if (!bar.visible) return
  dragState = {
    startY: event.clientY,
    startScroll: Math.min(Math.max(-(scroll?.y || 0), 0), maxScroll()),
    range: Math.max(wrapperHeight() - bar.height, 0),
    max: maxScroll(),
  }
  window.addEventListener('mousemove', handleDragMove)
  window.addEventListener('mouseup', handleDragEnd)
}

const handleDragMove = (event) => {
  if (!dragState || !scroll) return
  const delta = event.clientY - dragState.startY
  const ratio = dragState.range ? delta / dragState.range : 0
  const next = Math.min(Math.max(dragState.startScroll + ratio * dragState.max, 0), dragState.max)
  scroll.scrollTo(0, -next, 0)
  updateBar()
}

const handleDragEnd = () => {
  dragState = null
  window.removeEventListener('mousemove', handleDragMove)
  window.removeEventListener('mouseup', handleDragEnd)
}

const handleTrackDown = (event) => {
  if (!bar.visible || !scroll) return
  const barRect = barEl.value?.getBoundingClientRect()
  if (!barRect) return
  const max = maxScroll()
  const offset = event.clientY - barRect.top - bar.height / 2
  const range = Math.max(barRect.height - bar.height, 0)
  const ratio = range ? Math.min(Math.max(offset / range, 0), 1) : 0
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
      mouseWheel: { speed: 18, easeTime: 200 },
    })
    scroll.on('scroll', updateBar)
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
