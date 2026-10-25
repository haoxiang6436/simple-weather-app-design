<template>
  <!-- 重选地区卡片。Teleport 到 body：地图全屏时 .lp-frame 是 position: fixed 的整屏层，
       卡片留在里面会被它的排版和裁切带着走；挂到 body 才能盖在整屏地图上做一块独立的悬浮玻璃 -->
  <Teleport to="body">
    <Transition name="region-pop">
      <div v-if="open" class="rpd-mask" @click.self="requestClose">
        <section ref="cardRef" class="rpd-card" role="dialog" aria-modal="true"
          aria-labelledby="rpd-title" aria-describedby="rpd-desc" tabindex="-1">
          <header class="rpd-head">
            <div class="rpd-head-text">
              <h2 id="rpd-title" class="rpd-title">重选地区</h2>
              <p id="rpd-desc" class="rpd-sub">选好地区后地图会直接定位过去，当前视野不会丢</p>
            </div>
            <button class="rpd-close" type="button" aria-label="关闭" :disabled="locating"
              @click="requestClose">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </header>

          <!-- 三列和卡片里的三列页完全一致（同一个 RegionCascade）。
               定位请求在途时锁住列：这期间再点一个区县，等请求回来会把刚选的路径覆盖掉 -->
          <div class="rpd-body" :class="{ 'is-locating': locating }">
            <RegionCascade :path="draftPath" @select="handleSelect" />
          </div>

          <p v-if="error" class="rpd-error">{{ error }}</p>

          <footer class="rpd-foot">
            <span class="rpd-path" :class="{ 'is-empty': !canLocate }">{{ draftText }}</span>
            <div class="rpd-actions">
              <button class="rpd-btn" type="button" :disabled="locating" @click="requestClose">
                取消
              </button>
              <button class="rpd-btn is-primary" type="button" :disabled="!canGo" @click="handleConfirm">
                {{ locating ? '正在定位…' : '定位到这里' }}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import RegionCascade from './RegionCascade.vue'
import { canLocateRegion, needsCityFirst, pathLabels } from './regionTree'

// eslint-disable-next-line no-undef
const props = defineProps({
  // 是否显示。由外层控制（地图全屏里点「重选地区」时打开）
  open: { type: Boolean, default: false },
  // 当前已选的地区路径：打开时复制一份做草稿，取消就丢掉，不会动到地图
  path: { type: Array, default: () => [] },
  // 外层的定位请求在途：按钮显示「正在定位…」，避免连点
  locating: { type: Boolean, default: false },
  // 外层定位失败时的提示；留空则不占位
  error: { type: String, default: '' },
})
// eslint-disable-next-line no-undef
const emit = defineEmits(['update:open', 'confirm'])

const cardRef = ref(null)
// 草稿路径：卡片里怎么点都不影响背后的地图，只有「定位到这里」才把结果交出去
const draftPath = ref([])

watch(() => props.open, async (open) => {
  if (!open) return
  draftPath.value = [...(props.path || [])]
  await nextTick()
  // 打开就把焦点收进来：Esc / 回车不会落到背后的地图上
  cardRef.value?.focus()
}, { immediate: true })

const draftText = computed(() => {
  if (!draftPath.value.length) return '请选择省 / 市 / 区'
  const text = pathLabels(draftPath.value)
  // 只选到省 / 自治区：和风查不到中心点，直接在文案里说清楚还差哪一步
  return needsCityFirst(draftPath.value) ? `${text} · 请再选到市或区县` : text
})

const canLocate = computed(() => canLocateRegion(draftPath.value))
const canGo = computed(() => canLocate.value && !props.locating)

const handleSelect = ({ nodes }) => {
  if (!nodes?.length) return
  draftPath.value = nodes
}

const requestClose = () => {
  // 定位中不让关：请求回来以后地图会跳到新地区，用户会以为「取消掉了」
  if (props.locating) return
  emit('update:open', false)
}

const handleConfirm = () => {
  if (!canGo.value) return
  emit('confirm', draftPath.value.slice())
}
</script>

<style lang="scss" scoped>
/* 遮罩只做「压暗 + 轻度磨砂」，地图还要看得出来：这块卡片是浮在地图上的，
   不是把用户赶回三列页。z-index 要盖过全屏地图的 .lp-frame（40）和点外确认弹层（50） */
.rpd-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: rgba(4, 10, 20, 0.42);
  -webkit-backdrop-filter: blur(0.75rem);
  backdrop-filter: blur(0.75rem);
}

.rpd-card {
  display: flex;
  flex-direction: column;
  /* 宽度故意和全屏里的上沿标题卡 / 下沿操作条同一套公式（.lp-frame.is-fs 的 --lp-card-w）：
     三块悬浮玻璃左右对齐，弹层看起来是「夹在它们中间的一块」，而不是另开一个窗口。
     卡片形态下这个宽度也正好等于面板宽度，不会溢出 */
  width: min(82vw, 71.25rem);
  max-width: 100%;
  max-height: calc(100vh - 4rem);
  padding: 1.375rem 1.5rem 1.125rem;
  color: var(--text-primary);
  /* 比普通玻璃更实一点：卡片里是三列长列表，背后的地图必须压得住。
     磨砂交给遮罩那一层做，这里不再叠第二层 backdrop-filter ——
     整屏地图上叠两层实时模糊在壁纸里很吃 GPU，视觉上也看不出差别 */
  background: rgba(15, 27, 48, 0.92);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  outline: none;
}

.rpd-head {
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.rpd-head-text {
  min-width: 0;
}

.rpd-title {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 700;
  line-height: 1.3;
}

.rpd-sub {
  margin: 0.375rem 0 0;
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--text-muted);
}

.rpd-close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  color: var(--text-secondary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: background 0.2s ease, color 0.2s ease;

  svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  &:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--glass-border);
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}

/* 三列需要确定高度：PickerColumn 内部是 flex + BetterScroll，
   没有高度就没有滚动区域（三列会塌成 0）。宽度和卡片一致后每列约 1/3，
   够放下「巴音郭楞蒙古自治州」这类长名字，放不下也有省略号 */
.rpd-body {
  flex: none;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.875rem;
  height: clamp(14rem, 46vh, 26rem);
  min-height: 0;

  &.is-locating {
    pointer-events: none;
    opacity: 0.7;
  }
}

.rpd-error {
  flex: none;
  margin: 0.875rem 0 0;
  font-size: 0.82rem;
  line-height: 1.6;
  color: #ffbab5;
}

.rpd-foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1rem;
}

.rpd-path {
  min-width: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.is-empty {
    color: var(--text-muted);
  }
}

.rpd-actions {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
}

.rpd-btn {
  padding: 0.5rem 1.0625rem;
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: background 0.2s ease, border-color 0.2s ease, filter 0.2s ease;

  &:hover:not(:disabled) {
    background: var(--glass-border);
    border-color: var(--glass-border-strong);
  }

  &:focus-visible {
    outline: 2px solid #7dd3fc;
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }

  &.is-primary {
    color: #04121f;
    background: linear-gradient(135deg, #7dd3fc, #38bdf8);
    border-color: transparent;

    &:hover:not(:disabled) {
      filter: brightness(1.08);
    }
  }
}

/* 进场：卡从下方轻轻浮起，和全屏里那两块悬浮玻璃同一套观感 */
.region-pop-enter-active,
.region-pop-leave-active {
  transition: opacity 0.18s ease;
}

.region-pop-enter-active .rpd-card,
.region-pop-leave-active .rpd-card {
  transition: transform 0.2s var(--ease), opacity 0.18s ease;
}

.region-pop-enter-from,
.region-pop-leave-to {
  opacity: 0;
}

.region-pop-enter-from .rpd-card,
.region-pop-leave-to .rpd-card {
  transform: translateY(0.75rem) scale(0.98);
  opacity: 0;
}

/* 窄屏：三列并排会挤成省略号，宁可缩小间距、保留列宽，
   也不堆成一列（每列没有高度，BetterScroll 直接失效） */
@media (max-width: 880px) {
  .rpd-mask {
    padding: 1.25rem;
  }

  .rpd-card {
    padding: 1.125rem 1.125rem 1rem;
  }

  .rpd-body {
    gap: 0.5rem;
    height: clamp(12rem, 48vh, 20rem);
  }
}
</style>
