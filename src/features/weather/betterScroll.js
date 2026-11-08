/**
 * BetterScroll 统一入口
 *
 * 项目里多处需要"可以拖拽滚动"的列表（Wallpaper Engine 不转发鼠标滚轮事件，
 * 所以拖拽是主要滚动方式），这里统一注册一次 MouseWheel 插件（浏览器里顺手支持滚轮），
 * 避免重复注册导致同一个滚轮事件被处理多次。
 */
import BetterScroll from '@better-scroll/core'
import MouseWheel from '@better-scroll/mouse-wheel'
import Slide from '@better-scroll/slide'

let mouseWheelApplied = false
let slideApplied = false

export const useMouseWheelPlugin = () => {
  if (mouseWheelApplied) return
  mouseWheelApplied = true
  BetterScroll.use(MouseWheel)
}

export const useSlidePlugin = () => {
  if (slideApplied) return
  slideApplied = true
  // Slide exposes goToPage/getCurrentPage on the BetterScroll instance.
  BetterScroll.use(Slide)
}

export default BetterScroll
