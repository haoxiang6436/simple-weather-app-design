import { onMounted, onUnmounted } from 'vue'

/**
 * 点击卡片外的空白处（.weather-layer 自身）触发一次回调。
 *
 * 所有面板都放在固定满屏、内容居中的 .weather-layer 里：
 * 卡片外的点击目标是这一层本身，卡片内的点击目标仍是卡里的元素（冒泡到这一层时 target 不变）。
 * 因此「点了空白」必须同时满足：
 *   1. 按下和抬起的目标都是 .weather-layer 自己；
 *   2. 按下也在外面 —— 从卡片里按下、拖到卡片外松开（比如选文字）不算点了空白。
 *
 * @param {import('vue').Ref<HTMLElement|null>} rootRef 面板根节点。
 *   面板可能被嵌在引导页里，所以从根节点往上找 .weather-layer，而不是假设它是直接父级。
 * @param {() => void} handler 面板自己的处理：设置页关闭、地址页确认已选点…
 */
export const useLayerOutsideClick = (rootRef, handler) => {
  let layer = null
  // 本次按下是否落在卡片外：只有「按下也在外面」的点击才算，避免把选文字/拖拽误判成点空白
  let downOutside = false

  const handlePointerDown = (event) => {
    downOutside = event.target === layer
  }

  const handleClick = (event) => {
    if (!downOutside || event.target !== layer) return
    handler()
  }

  onMounted(() => {
    layer = rootRef.value?.closest('.weather-layer') || null
    layer?.addEventListener('pointerdown', handlePointerDown)
    layer?.addEventListener('click', handleClick)
  })

  onUnmounted(() => {
    layer?.removeEventListener('pointerdown', handlePointerDown)
    layer?.removeEventListener('click', handleClick)
    layer = null
  })
}
