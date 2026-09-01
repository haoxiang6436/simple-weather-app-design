import { ref } from 'vue'
import { useStorage } from '@vueuse/core'
import Bus from '@/shared/Bus'
import { BUS_EVENTS, STORAGE_KEYS, WALLPAPER_PROPERTIES } from './constants'

/**
 * 壁纸属性状态与处理逻辑（与 public/project.json 中的属性一一对应）
 *
 * Wallpaper Engine 环境下，由 window.wallpaperPropertyListener.applyUserProperties
 * 接收引擎下发的属性；开发环境下，由 WallpaperDebugPanel 组件模拟同一套属性并
 * 调用 applyWallpaperProperties，保证两条路径行为完全一致。
 */

// 背景序号：0-无 / 1-小鸟 / 2-星空 / 3-动态粒子 / 4-实时雨滴
// flush: 'sync'：背景切换后 BackgroundMain 会立即触发 location.reload()，
// 必须先同步持久化，避免重载后丢失新的背景序号
export const BackgroundIndex = useStorage(STORAGE_KEYS.BACKGROUND_INDEX, '0', localStorage, {
  flush: 'sync',
})

// 小鸟背景的鼠标交互开关（backgroundinteraction）
export const BirdInteraction = ref(false)

/**
 * 应用壁纸属性变更
 * @param {Object} properties Wallpaper Engine applyUserProperties 入参结构
 *                            { 属性名: { value: 属性值 } }
 */
export const applyWallpaperProperties = (properties) => {
  // 小鸟互动
  if (properties[WALLPAPER_PROPERTIES.BACKGROUND_INTERACTION]) {
    const interaction = properties[WALLPAPER_PROPERTIES.BACKGROUND_INTERACTION].value
    BirdInteraction.value = interaction
  }
  // 背景序号
  if (properties[WALLPAPER_PROPERTIES.BACKGROUND_INDEX]) {
    BackgroundIndex.value = String(properties[WALLPAPER_PROPERTIES.BACKGROUND_INDEX].value)
    Bus.emit(BUS_EVENTS.BACKGROUND_INDEX_CHANGE, BackgroundIndex.value)
  }
  // 天气面板显示隐藏（true = 隐藏）
  if (properties[WALLPAPER_PROPERTIES.SHOW_WEATHER_MAIN]) {
    Bus.emit(BUS_EVENTS.SHOW_WEATHER_MAIN, properties[WALLPAPER_PROPERTIES.SHOW_WEATHER_MAIN].value)
  }
  // 雨滴强度配置
  if (properties[WALLPAPER_PROPERTIES.RAIN_CONFIG]) {
    Bus.emit(BUS_EVENTS.RAIN_CONFIG_CHANGE, properties[WALLPAPER_PROPERTIES.RAIN_CONFIG].value)
  }
}

/**
 * 注册 Wallpaper Engine 属性监听器
 * 仅当页面运行在壁纸引擎环境中时被调用
 */
export const setupWallpaperPropertyListener = () => {
  // 幂等注册，避免覆盖已有的监听器
  if (window.wallpaperPropertyListener) return
  window.wallpaperPropertyListener = {
    applyUserProperties: applyWallpaperProperties,
  }
}
