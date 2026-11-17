<template>
  <WeatherDialog class="EarlyWarningDialog" labelledby="early-warning-dialog-title" :show-close="false" @close="EarlyWarningDetailsDialog = false"
    @backdrop-click="handleDialogClick">
      <span id="early-warning-dialog-title" class="visually-hidden">天气预警详情</span>
      <div v-if="WeatherEarlyWarning.length" class="EarlyContent">
        <Swiper class="warning-carousel" :modules="swiperModules" :initial-slide="initialSlide"
          :slides-per-view="1" :space-between="0" :auto-height="true" :grab-cursor="WeatherEarlyWarning.length > 1"
          :allow-touch-move="WeatherEarlyWarning.length > 1" :threshold="8" :touch-angle="35"
          :resistance="false" :speed="swiperSpeed" :keyboard="{ enabled: true, onlyInViewport: true }"
          :a11y="{ enabled: true, containerMessage: '天气预警详情', slideLabelMessage: '{{index}} / {{slidesLength}}' }"
          @swiper="onSwiper" @slide-change="onSlideChange">
          <SwiperSlide v-for="(item, index) in WeatherEarlyWarning" :key="item.id" class="warning-slide-host"
            :class="{ 'is-active': index === currentIndex }">
            <StaggerTransition preset="warning" :index="index">
              <WarningDetailCard :warning="item" :current-time="currentTime" :active="index === currentIndex" />
            </StaggerTransition>
            <!-- 露在旁边的卡也直接可点：点一下就滑到正中并接管焦点，不用再按住鼠标拖。
                 卡片本体是 inert 的（收不到指针事件），所以命中层必须是它外面的按钮。 -->
            <button v-if="index !== currentIndex" class="warning-focus-hit" type="button"
              :aria-label="`聚焦${item.typeName || ''}${item.level || ''}预警`" @pointerdown="rememberPress"
              @click="focusSlide($event, index)" @keydown.enter.prevent="focusSlide($event, index)"
              @keydown.space.prevent="focusSlide($event, index)" />
          </SwiperSlide>
        </Swiper>
      </div>

      <div v-else class="warning-empty">当前没有可展示的天气预警。</div>
  </WeatherDialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import 'qweather-icons/font/qweather-icons.css'
import 'swiper/css'
import { A11y, Keyboard } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/vue'
import WeatherDialog from './WeatherDialog.vue'
import WarningDetailCard from './WarningDetailCard.vue'
import StaggerTransition from '@/shared/motion/StaggerTransition'
import { useWarningClock } from './useWarningClock'
import { useWeatherStore } from '@/store/index'
import { storeToRefs } from 'pinia'

const weatherStore = useWeatherStore()
const { EarlyWarningDetailsDialog, EarlyWarningDetailsWarningId, WeatherEarlyWarning } = storeToRefs(weatherStore)

const swiperInstance = ref(null)
const currentIndex = ref(0)
const currentTime = useWarningClock()
const swiperModules = [A11y, Keyboard]
const initialSlide = computed(() => {
  const index = WeatherEarlyWarning.value.findIndex((item) => item.id === EarlyWarningDetailsWarningId.value)
  return index >= 0 ? index : 0
})
const swiperSpeed = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300

// 按下位置：拖拽换页和点击共用同一块区域，位移超过阈值就判定为拖拽而不是点击。
const pressOrigin = ref(null)
// 由点击/键盘触发的换页，落位后把焦点交给新卡正文，读屏和 Tab 都不会停在已移除的按钮上。
let moveFocusAfterSlide = false

const handleDialogClick = (event) => {
  if (event.target === event.currentTarget) EarlyWarningDetailsDialog.value = false
}

const onSwiper = (instance) => {
  swiperInstance.value = instance
  currentIndex.value = instance.activeIndex
}

const onSlideChange = (instance) => {
  // Tab 到露出的卡片时 Swiper 会先把这张卡滑进来（scrollOnFocus），此时焦点还在卡上；
  // 卡片一翻页，那张被聚焦的按钮就会卸载，所以落位后统一把焦点交给新卡正文。
  const focusWasOnCard = instance.el.contains(document.activeElement)
  currentIndex.value = instance.activeIndex
  requestAnimationFrame(() => {
    instance.updateAutoHeight(240)
    instance.el.closest('.EarlyWarningDialog')?.scrollTo({ top: 0 })
    if (!moveFocusAfterSlide && !focusWasOnCard) return
    moveFocusAfterSlide = false
    instance.el.querySelectorAll('.warning-card-content')[currentIndex.value]?.focus({ preventScroll: true })
  })
}

const rememberPress = (event) => {
  pressOrigin.value = { x: event.clientX, y: event.clientY }
}

const focusSlide = (event, index) => {
  const origin = pressOrigin.value
  pressOrigin.value = null
  // 键盘触发（Enter / 空格）的 click 没有指针按下点，detail 为 0，不受位移判定影响。
  if (event.detail > 0 && origin && (Math.abs(event.clientX - origin.x) > 6 || Math.abs(event.clientY - origin.y) > 6)) return
  if (index === currentIndex.value) return
  moveFocusAfterSlide = true
  // 这里必须让 Swiper 正常跑回调：currentIndex 靠 slideChange 更新，第三参数传 false 会把事件吞掉。
  swiperInstance.value?.slideTo(index, swiperSpeed)
}

const syncInitialWarning = () => {
  currentIndex.value = initialSlide.value
  swiperInstance.value?.slideTo(currentIndex.value, swiperSpeed, false)
  requestAnimationFrame(() => swiperInstance.value?.updateAutoHeight(0))
}

watch(WeatherEarlyWarning, async () => {
  syncInitialWarning()
  await new Promise((resolve) => requestAnimationFrame(resolve))
  swiperInstance.value?.update()
  swiperInstance.value?.updateAutoHeight(0)
}, { deep: true })

watch(EarlyWarningDetailsWarningId, () => {
  syncInitialWarning()
})

watch(EarlyWarningDetailsDialog, (open) => {
  if (!open) return
  syncInitialWarning()
})

</script>

<style lang="scss" scoped>
.EarlyContent {
  position: relative;
  width: min(48vw, 36rem, calc(100vh - 3rem));
  min-height: 0;
  padding: 0;
}

.EarlyWarningDialog {
  --warning-unit: clamp(1rem, calc(1.55vmin * var(--panel-scale)), 1.75rem);
  /* 卡片高度上限：一屏减弹层上下留白（padding 1.5rem × 2）。
     和 .EarlyContent 宽度里的 「100vh - 3rem」 是同一个数 —— 设计上这张卡最方就是「一屏见方」，
     方卡本身永远装得下；装不下的是长正文：它没有上限，面板缩放调到 150% 时能把卡片顶到
     两倍屏幕高，整层遮罩于是出现一条「整页滚动条」（这条滚动条一直在遮罩上，不在文档上）。
     封顶之后由卡片内部接住滚动，见 WarningDetailCard.vue 的 --warning-avail-h。 */
  --warning-max-h: calc(100vh - 3rem);
  flex-direction: column;
  justify-content: flex-start;
  padding: 1.5rem 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.warning-carousel {
  width: 100%;
  height: auto;
  min-height: 0;
  overflow: visible;
}

.warning-carousel :deep(.swiper-wrapper) {
  align-items: flex-start;
}

.warning-carousel :deep(.swiper-slide) {
  box-sizing: border-box;
  display: flex;
  height: auto;
  align-items: flex-start;
  padding-inline: calc(var(--warning-unit) * 0.55);
}

/* 旁边的卡不是装饰：整张卡就是「跳到这一条」的按钮。 */
.warning-slide-host { position: relative; }

.warning-focus-hit {
  position: absolute;
  inset-block: 0;
  inset-inline: calc(var(--warning-unit) * 0.55);
  display: block;
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: calc(var(--warning-unit) * 1.6);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: box-shadow 0.2s ease;
}

.warning-focus-hit:hover { box-shadow: inset 0 0 0 2px rgba(12, 32, 48, 0.32); }
.warning-focus-hit:active { box-shadow: inset 0 0 0 2px rgba(12, 32, 48, 0.46); }
.warning-focus-hit:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.95);
  outline-offset: 2px;
  box-shadow: inset 0 0 0 2px rgba(12, 32, 48, 0.32), 0 0 0 4px rgba(6, 19, 30, 0.42);
}

.EarlyWarningDialog :deep(.WeatherDialogPanel) {
  flex: none;
  margin-block: auto;
  width: auto;
  height: auto;
  /* 预警详情是透明外壳：里面的内容自己按 1:1 的方形排版，
     所以把外壳的「默认宽高比高度」一起清掉，否则会凭空拿到 29.3rem 的下限。 */
  --dialog-min-h: 0;
  min-height: 0;
  max-width: calc(100vw - 2rem);
  max-height: none;
  overflow: visible;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
.EarlyWarningDialog :deep(.WeatherDialogHeader) { display: none; }
.EarlyWarningDialog :deep(.WeatherDialogBody) { flex: initial; overflow: visible; }

.warning-empty { display: grid; place-items: center; color: var(--text-secondary); font-size: var(--warning-unit); }

@media (prefers-reduced-motion: reduce) {
  .warning-focus-hit { transition: none; }
}

@media (max-width: 560px) {
  .EarlyWarningDialog {
    --warning-unit: clamp(0.9375rem, calc(4vmin * var(--panel-scale)), 1.125rem);
  }
  .EarlyContent { width: min(calc(100vw - 2.5rem), calc(100vh - 3rem)); }
}
</style>
