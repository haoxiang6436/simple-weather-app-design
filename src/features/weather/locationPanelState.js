/**
 * 地址页（LocationPicker）的开关
 *
 * 原来这个开关只是 WeatherMain 里的一个局部 ref —— 只有天气卡上的位置按钮能碰它。
 * 设置页的「位置地图」卡也想跳过去（它在独立的弹窗里，拿不到 WeatherMain 的作用域），
 * 所以提到这里：谁都能开关，优先级仍然由 WeatherMain 的 panelView 决定。
 *
 * 不放进 onboardingState：那边管的是「凭据 / 引导」这一套状态机，
 * 地址页是天气侧的面板，混在一起会让依赖方向反过来。
 */
import { ref } from 'vue'

/** 地址页是否打开（WeatherMain 的 panelView 按它切面板） */
export const LocationPickerOpen = ref(false)

export const openLocationPicker = () => {
  LocationPickerOpen.value = true
}

export const closeLocationPicker = () => {
  LocationPickerOpen.value = false
}
