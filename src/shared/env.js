/**
 * 运行环境判定：当前页面是跑在 Wallpaper Engine 里，还是普通浏览器里。
 *
 * 为什么需要它：
 * - Wallpaper Engine 的网页壁纸收不到页面内的键盘输入，引导面板只能"提示 + 读取属性"；
 * - Edge 等普通浏览器（开发调试、直接打开 dist/index.html）可以正常输入，
 *   所以引导面板里要给出可以直接输入域名/密钥的调试入口。
 *
 * 判定依据：
 * 1. 壁纸引擎的 CEF 会在页面脚本执行前注入若干 API（如下），
 *    而 public/index.html 只自己定义了 wallpaperPropertyListener，不会误判；
 * 2. 兜底：引擎加载时会通过监听器下发一次属性，收到过就说明在引擎里。
 */
import { ref } from 'vue'

const readWindow = () => (typeof window === 'undefined' ? null : window)

export const hasWallpaperEngineApi = () => {
  const w = readWindow()
  if (!w) return false
  return (
    typeof w.wallpaperRegisterAudioListener === 'function' ||
    typeof w.wallpaperRequestRandomFileForProperty === 'function' ||
    typeof w.wallpaperRegisterMediaPlaybackListener === 'function'
  )
}

// 壁纸引擎下发的属性事件次数（由 properties.js 在补发队列时累加）
export const WallpaperEngineEventCount = ref(0)
export const markWallpaperEngineEvent = () => {
  WallpaperEngineEventCount.value += 1
}

export const isWallpaperEngineRuntime = () =>
  hasWallpaperEngineApi() || WallpaperEngineEventCount.value > 0

// 普通浏览器（Edge 开发 / 直接打开 dist）→ 引导面板允许直接输入
export const isBrowserRuntime = () => !isWallpaperEngineRuntime()
