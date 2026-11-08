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
          <SwiperSlide v-for="(item, index) in WeatherEarlyWarning" :key="item.id">
            <StaggerTransition preset="warning" :index="index">
              <WarningDetailCard :warning="item" :current-time="currentTime" :active="index === currentIndex" />
            </StaggerTransition>
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

const handleDialogClick = (event) => {
  if (event.target === event.currentTarget) EarlyWarningDetailsDialog.value = false
}

const onSwiper = (instance) => {
  swiperInstance.value = instance
  currentIndex.value = instance.activeIndex
}

const onSlideChange = (instance) => {
  currentIndex.value = instance.activeIndex
  requestAnimationFrame(() => {
    instance.updateAutoHeight(240)
    instance.el.closest('.EarlyWarningDialog')?.scrollTo({ top: 0 })
  })
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

.EarlyWarningDialog :deep(.WeatherDialogPanel) {
  flex: none;
  margin-block: auto;
  width: auto;
  height: auto;
  max-width: calc(100vw - 2rem);
  max-height: none;
  aspect-ratio: auto;
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

@media (max-width: 560px) {
  .EarlyWarningDialog {
    --warning-unit: clamp(0.9375rem, calc(4vmin * var(--panel-scale)), 1.125rem);
  }
  .EarlyContent { width: min(calc(100vw - 2.5rem), calc(100vh - 3rem)); }
}
</style>
