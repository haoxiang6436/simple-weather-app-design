/**
 * RainOverlayAdapter —— 把 raindrop-fx 从「全屏后处理（自带不透明背景）」改造成
 * 「叠在真实 DOM 之上的透明雨珠层」。
 *
 * 移植自桌面 temp 目录的 PoC：C:\Users\haoxi\Desktop\temp\raindrop-overlay\raindrop-overlay.js
 * （原文件是挂在 window.RaindropOverlay 上的 UMD 脚本；这里改为 ES Module，
 *   RaindropFX 与 html2canvas 都直接从 lib/ 静态引入，不再依赖全局变量。）
 *
 * 原理：
 *   raindrop-fx 每帧做两件事
 *     1. renderer.clear(Color.black) + drawBackground()
 *        把一张模糊过的背景纹理铺满整个 canvas —— 这一步让它变成「不透明画面」
 *     2. blit(matrlCompose) 用 SrcAlpha / OneMinusSrcAlpha 把雨滴折射层合上去
 *   只要把第 1 步换成「清成透明」，canvas 上就只剩 alpha = 雨滴遮罩 的那一层，
 *   再配合 position:fixed + pointer-events:none 就是一层盖在网页上的雨珠。
 *
 * 折射源：
 *   页面里已有的 canvas / video / img 可以直连（零成本，可每帧更新）；
 *   DOM 元素则用 html2canvas 光栅化成一张「干净」纹理（CPU 重绘，按需降分辨率/降帧率）。
 *   注意：<svg><foreignObject> 那条路在 Chromium 会把 canvas 标记为 tainted，
 *   texImage2D 抛 SecurityError，所以这里不再实现它。
 */
import RaindropFX from './lib/raindrop-fx.js'
import html2canvas from './lib/html2canvas.min.js'

const VERSION = '1.0.0'

// 直连源：这些元素本身就是可用的纹理工件，不需要快照
function isDirectSource(el) {
  return (
    el instanceof HTMLCanvasElement ||
    el instanceof HTMLVideoElement ||
    el instanceof HTMLImageElement ||
    (typeof ImageBitmap !== 'undefined' && el instanceof ImageBitmap)
  )
}

/**
 * 把真实 DOM 光栅化成一张可以上传 WebGL 的纹理。
 * 带 data-html2canvas-ignore / data-raindrop-exclude 的元素会被跳过
 * （叠加层自己的 canvas 必须带上，否则快照里会拍到自己，形成反馈环）。
 */
function createDomSnapshotter(pageEl, options) {
  const scale = options.scale || 0.5
  return {
    capture(width, height) {
      return html2canvas(pageEl, {
        scale,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        backgroundColor: options.backgroundColor || null,
        logging: false,
        useCORS: true,
      })
    },
  }
}

/**
 * 创建整页雨珠叠加层。
 *
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas        渲染雨滴的 canvas
 * @param {Element|object} [options.source=document.body] 折射源：DOM 元素 / canvas / video / img
 * @param {Function} [options.getSource]            自定义源，返回任意 TexImageSource
 * @param {number} [options.snapshotInterval=400]   DOM 快照间隔 ms（Infinity = 只拍一次）
 * @param {number} [options.snapshotScale=0.25]     DOM 快照缩放
 * @param {boolean} [options.autoResize=true]       跟随 canvas 的 CSS 尺寸自动 resize
 * @param {number} [options.pixelRatio=1]           渲染分辨率倍率
 * @param {boolean} [options.autoStyle=true]        自动套「全屏不吃事件」样式
 * @param {number} [options.zIndex=9999]
 * @param {boolean} [options.observeMutations=false] DOM 变化时防抖重拍
 * @param {object} [options.effect]                 透传给 RaindropFX 的效果参数
 * @param {function} [options.onStats]              { fps, captureMs }
 * @param {function} [options.onError]              快照/上传失败回调
 */
export async function createRainOverlay(options) {
  const canvas = options.canvas
  if (!canvas) throw new Error('RainOverlay: 缺少 canvas')
  if (typeof RaindropFX !== 'function') {
    throw new Error('RainOverlay: raindrop-fx 未正确加载')
  }

  let source = options.source || document.body
  let direct = !options.getSource && isDirectSource(source)
  let interval = options.snapshotInterval == null ? 400 : options.snapshotInterval
  let scale = options.snapshotScale || 0.25
  const pixelRatio = options.pixelRatio || 1
  const autoResize = options.autoResize !== false
  const observeMutations = options.observeMutations === true
  const effect = options.effect || {}

  if (options.autoStyle !== false) applyDefaultStyle(canvas, options.zIndex)

  // 第一帧快照到达前的占位背景，避免黑屏或上传空纹理
  const seed = document.createElement('canvas')
  seed.width = seed.height = 8
  const sctx = seed.getContext('2d')
  sctx.fillStyle = '#0b0e17'
  sctx.fillRect(0, 0, 8, 8)

  const fx = new RaindropFX(
    Object.assign({ canvas, background: seed, mist: false }, effect)
  )
  await fx.start()

  // ---- 核心补丁：把「铺满不透明背景」换成「清成透明」 ----
  const renderer = fx.renderer
  const gl = renderer && renderer.renderer ? renderer.renderer.gl : null
  if (!gl || typeof renderer.drawBackground !== 'function') {
    throw new Error(
      'RainOverlay: 当前 raindrop-fx 版本内部结构不匹配（缺少 renderer.gl / drawBackground），透明叠加补丁无法生效'
    )
  }
  const originalDrawBackground = renderer.drawBackground
  let overlayMode = true

  renderer.drawBackground = function () {
    if (!overlayMode) return originalDrawBackground.call(this)
    // 此刻帧缓冲已绑定到 canvas 自身，直接清成全透明。
    // 后面的 compose pass 用 SrcAlpha / OneMinusSrcAlpha，alpha = mask 的雨滴就被写到透明画布上。
    // 注意必须是 (0,0,0,0)：Color.transparent 是 (1,1,1,0)，白色会从雨滴边缘漏出来。
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  if (gl.getContextAttributes && gl.getContextAttributes().alpha === false) {
    overlayMode = false
    console.warn('RainOverlay: WebGL 上下文 alpha=false，无法叠加，已退回普通模式')
  }

  // ---- 折射源 ----
  // 自定义源 / 直连源（canvas、video、img）都不需要快照器，只有 DOM 才要
  let snapshotter = options.getSource || direct
    ? null
    : createDomSnapshotter(source, { scale, backgroundColor: options.backgroundColor })

  let busy = false
  let stopped = false
  let lastCapture = 0
  let lastFrame = 0
  let frames = 0
  let captureMs = 0
  let warned = false

  async function refresh(force) {
    if (stopped || busy) return
    // 纯静态图源（img / ImageBitmap）没必要反复上传
    if (
      !force &&
      !options.getSource &&
      direct &&
      !(source instanceof HTMLCanvasElement || source instanceof HTMLVideoElement)
    ) {
      return
    }
    const rect = canvas.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    busy = true
    const t0 = performance.now()
    try {
      const tex = options.getSource
        ? await options.getSource(rect.width, rect.height)
        : direct
          ? source
          : await snapshotter.capture(rect.width, rect.height)
      await fx.setBackground(tex)
    } catch (e) {
      if (!warned) {
        warned = true
        console.warn('[RainOverlay]', e)
      }
      if (options.onError) options.onError(e)
    } finally {
      captureMs = performance.now() - t0
      busy = false
    }
  }

  // ---- 尺寸 ----
  function fitCanvas() {
    const rect = canvas.getBoundingClientRect()
    const w = Math.max(2, Math.round(rect.width * pixelRatio))
    const h = Math.max(2, Math.round(rect.height * pixelRatio))
    if (canvas.width === w && canvas.height === h) return false
    canvas.width = w
    canvas.height = h
    fx.resize(w, h)
    return true
  }
  fitCanvas()

  // ---- 帧循环 ----
  function frame(now) {
    if (stopped) return
    requestAnimationFrame(frame)
    frames++
    if (now - lastFrame >= 1000) {
      const fps = Math.round((frames * 1000) / Math.max(1, now - lastFrame))
      frames = 0
      lastFrame = now
      if (options.onStats) options.onStats({ fps, captureMs: Math.round(captureMs * 10) / 10 })
    }
    if (now - lastCapture >= interval && !busy && !document.hidden) {
      lastCapture = now
      refresh(false)
    }
  }

  // ---- resize / DOM 变化 ----
  let resizeObserver = null
  function onResize() {
    if (fitCanvas()) refresh(true)
  }
  if (autoResize) {
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(onResize)
      resizeObserver.observe(canvas)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
  }

  let mutationObserver = null
  let mutationTimer = 0
  if (observeMutations && !direct && source.nodeType === 1) {
    mutationObserver = new MutationObserver(() => {
      clearTimeout(mutationTimer)
      mutationTimer = setTimeout(() => {
        refresh(true)
      }, 120)
    })
    mutationObserver.observe(source, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    })
  }

  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready
    } catch (e) {
      /* 字体没就绪也照常出图 */
    }
  }
  await refresh(true) // 首帧先拿到真实内容
  requestAnimationFrame(frame)

  return {
    version: VERSION,
    fx,
    /** 关掉叠加模式会退回 raindrop-fx 原本的「自带背景」模式，方便对比 */
    setOverlay(on) {
      overlayMode = !!on
    },
    isOverlay() {
      return overlayMode
    },
    refresh() {
      return refresh(true)
    },
    /** 运行时调整快照间隔；传 Infinity 即「冻结成静态图」 */
    setSnapshotInterval(ms) {
      interval = ms
    },
    /** 运行时调整快照分辨率（会换掉内部的快照器，下一帧生效） */
    setSnapshotScale(nextScale) {
      scale = nextScale || scale
      if (!options.getSource && !direct) {
        snapshotter = createDomSnapshotter(source, { scale, backgroundColor: options.backgroundColor })
      }
      return refresh(true)
    },
    /** 换折射源：DOM 元素 / canvas / video / img */
    setSource(el) {
      if (options.getSource) throw new Error('使用了 options.getSource 时不能再 setSource')
      source = el
      direct = isDirectSource(el)
      snapshotter = direct
        ? null
        : createDomSnapshotter(source, { scale, backgroundColor: options.backgroundColor })
      return refresh(true)
    },
    /** 停止渲染（保留 canvas 上的最后一帧） */
    stop() {
      stopped = true
      fx.stop()
    },
    /** 彻底回收：停渲染 + 摘掉所有监听 */
    destroy() {
      stopped = true
      fx.stop()
      if (typeof fx.destroy === 'function') fx.destroy()
      if (resizeObserver) resizeObserver.disconnect()
      if (mutationObserver) mutationObserver.disconnect()
      clearTimeout(mutationTimer)
      if (autoResize) {
        window.removeEventListener('resize', onResize)
        window.removeEventListener('orientationchange', onResize)
      }
    },
  }
}

function applyDefaultStyle(canvas, zIndex) {
  const s = canvas.style
  s.position = 'fixed'
  s.left = s.top = s.right = s.bottom = '0px'
  // 注意：别写 width:auto —— 绝对定位的替换元素会退回 canvas 的固有尺寸(300x150)
  s.width = '100%'
  s.height = '100%'
  s.pointerEvents = 'none'
  s.zIndex = String(zIndex == null ? 9999 : zIndex)
}

export { createDomSnapshotter }

export default {
  version: VERSION,
  create: createRainOverlay,
  createDomSnapshotter,
}
