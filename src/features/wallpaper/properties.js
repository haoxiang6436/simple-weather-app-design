import { ref } from 'vue'
import { useStorage } from '@vueuse/core'
import Bus from '@/shared/Bus'
import {
  BACKGROUND_INDEX_OPTIONS,
  BUS_EVENTS,
  DEFAULT_BACKGROUND_INDEX,
  DEFAULT_PANEL_SCALE,
  PANEL_SCALE_MAX,
  PANEL_SCALE_MIN,
  RAIN_CONFIG_OPTIONS,
  STORAGE_KEYS,
  WALLPAPER_PROPERTIES,
} from './constants'

/**
 * 壁纸属性状态与处理逻辑（与 public/project.json 中的属性一一对应）
 *
 * Wallpaper Engine 环境下，由 window.wallpaperPropertyListener.applyUserProperties
 * 接收引擎下发的属性；开发环境下，由 WallpaperDebugPanel 组件模拟同一套属性并
 * 调用 applyWallpaperProperties，保证两条路径行为完全一致。
 *
 * 官方文档（Web Wallpaper Reference → User Properties → Reading property values）要点：
 *   1. wallpaperPropertyListener 必须在「任何事件之外、尽可能早」被初始化为全局对象，
 *      否则壁纸加载时引擎下发的那一次属性更新会丢失 —— 实现见 public/index.html 的
 *      <head>：那里先注册一个队列版监听器，应用挂载完成后由本文件的
 *      setupWallpaperPropertyListener() 接管并补发；
 *   2. 加载时会一次性下发「全部」属性，之后每次只下发「发生变化」的属性，
 *      所以这里必须逐个属性判空，不能假设一次能拿到所有字段。
 */

// 背景序号：0-无 / 1-小鸟 / 2-星空 / 3-动态粒子 / 4-实时雨滴 / 5-整页雨珠叠加
// flush: 'sync'：背景切换后 BackgroundMain 会立即触发 location.reload()，
// 必须先同步持久化，避免重载后丢失新的背景序号
export const BackgroundIndex = useStorage(STORAGE_KEYS.BACKGROUND_INDEX, DEFAULT_BACKGROUND_INDEX, localStorage, {
  flush: 'sync',
})

// 小鸟背景的鼠标交互开关（backgroundinteraction）
export const BirdInteraction = ref(false)

// 天气面板整体缩放（panelscale，1 = 设计原尺寸）
export const PanelScale = ref(DEFAULT_PANEL_SCALE)

/**
 * 应用面板缩放：写入 CSS 变量 --panel-scale
 * 界面所有尺寸都是相对 rem 的，而 rem 由 html 的 font-size 决定，
 * 因此只改这一个变量就能整体缩放，详见 src/style/index.scss
 */
export const applyPanelScale = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) {
    console.warn(`[Wallpaper] 面板缩放值无效：${value}，已忽略`)
    return
  }
  // 引擎理论上已按 min/max 限制，这里再兜一层，避免手改 project.json 后出现极端值
  const scale = Math.min(PANEL_SCALE_MAX, Math.max(PANEL_SCALE_MIN, num))
  PanelScale.value = scale
  document.documentElement.style.setProperty('--panel-scale', String(scale))
}

// 与 index.scss 里 --panel-scale 的默认值保持一致（先落一次，避免首帧闪烁）
applyPanelScale(DEFAULT_PANEL_SCALE)

/**
 * 读取 Wallpaper Engine 下发的单个属性值
 * 引擎的结构为 { 属性名: { value: 属性值, text?: 选项文案 } }
 * @returns {*} 属性值；该属性不在本次更新里时返回 undefined
 */
const readPropertyValue = (properties, key) => {
  const property = properties[key]
  if (!property || typeof property !== 'object' || !('value' in property)) return undefined
  return property.value
}

/**
 * 应用壁纸属性变更
 * @param {Object} properties Wallpaper Engine applyUserProperties 入参结构
 *                            { 属性名: { value: 属性值 } }，只包含发生变化的属性
 */
export const applyWallpaperProperties = (properties) => {
  if (!properties || typeof properties !== 'object') return
  // 便于在壁纸引擎里自查：壁纸引擎设置 → 常规 → CEF devtools port（建议 8080），
  // 浏览器打开 localhost:8080 选中壁纸页面，就能在控制台看到每次下发的属性
  console.log('[Wallpaper] applyUserProperties', properties)
  // 小鸟互动
  const backgroundInteraction = readPropertyValue(properties, WALLPAPER_PROPERTIES.BACKGROUND_INTERACTION)
  if (backgroundInteraction !== undefined) {
    BirdInteraction.value = !!backgroundInteraction
  }
  // 背景序号
  const backgroundIndex = readPropertyValue(properties, WALLPAPER_PROPERTIES.BACKGROUND_INDEX)
  if (backgroundIndex !== undefined) {
    const nextIndex = String(backgroundIndex)
    if (!BACKGROUND_INDEX_OPTIONS.includes(nextIndex)) {
      console.warn(`[Wallpaper] 未知的背景序号 ${nextIndex}，已忽略（可用值：${BACKGROUND_INDEX_OPTIONS.join('/')}）`)
    } else if (nextIndex !== BackgroundIndex.value) {
      BackgroundIndex.value = nextIndex
      Bus.emit(BUS_EVENTS.BACKGROUND_INDEX_CHANGE, nextIndex)
    }
  }
  // 天气面板显示隐藏（true = 隐藏）
  const showWeatherMain = readPropertyValue(properties, WALLPAPER_PROPERTIES.SHOW_WEATHER_MAIN)
  if (showWeatherMain !== undefined) {
    Bus.emit(BUS_EVENTS.SHOW_WEATHER_MAIN, !!showWeatherMain)
  }
  // 雨滴强度配置
  const rainConfig = readPropertyValue(properties, WALLPAPER_PROPERTIES.RAIN_CONFIG)
  if (rainConfig !== undefined) {
    const nextConfig = String(rainConfig)
    if (!RAIN_CONFIG_OPTIONS.includes(nextConfig)) {
      console.warn(`[Wallpaper] 未知的雨滴配置 ${nextConfig}，已忽略（可用值：${RAIN_CONFIG_OPTIONS.join('/')}）`)
    } else {
      Bus.emit(BUS_EVENTS.RAIN_CONFIG_CHANGE, nextConfig)
    }
  }
  // 天气面板缩放（0.5 ~ 1.5，1 = 设计原尺寸）
  const panelScale = readPropertyValue(properties, WALLPAPER_PROPERTIES.PANEL_SCALE)
  if (panelScale !== undefined) {
    applyPanelScale(panelScale)
  }
}

/**
 * 接管 Wallpaper Engine 属性监听器
 *
 * public/index.html 已经在 <head> 里（任何事件之外、尽可能早）把
 * window.wallpaperPropertyListener 定义为全局对象，并把引擎下发的属性缓存进队列。
 * 这里在应用挂载完成后被调用（见 src/main.js）：
 *   1. 先补发队列里缓存的属性 —— 也就是壁纸加载时引擎下发的「全部属性」，
 *      此时组件都已挂载、Bus 监听器都已注册，属性变更才能真正作用到界面上；
 *   2. 再把 applyWallpaperProperties 挂进消费列表，接收后续的属性变更事件。
 *
 * 若模板没提前注册（例如 index.html 被换成纯净模板），则按官方文档的写法兜底注册。
 */
export const setupWallpaperPropertyListener = () => {
  const listeners = window.__wallpaperPropertyConsumers
  const queue = window.__wallpaperPropertyQueue

  if (!Array.isArray(listeners) || !window.wallpaperPropertyListener) {
    // 兜底：没有提前注册时直接创建监听器（仍然是官方文档要求的全局对象写法）
    window.wallpaperPropertyListener = {
      applyUserProperties: applyWallpaperProperties,
    }
    return false
  }

  // 幂等：重复调用不会重复补发、也不会重复挂载
  if (listeners.includes(applyWallpaperProperties)) return true

  const pending = Array.isArray(queue) ? queue.splice(0) : []
  pending.forEach((properties) => applyWallpaperProperties(properties))
  listeners.push(applyWallpaperProperties)
  return true
}
