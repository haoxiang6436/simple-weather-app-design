/**
 * 弹层 / 列表通用的「顺滑滚动」：BetterScroll + 自绘细滚动条。
 *
 * 为什么要自己接管滚动：
 *   1. 原生滚动条是系统灰条，压在玻璃面板上很突兀（而且会占掉 15px 宽度，
 *      内容宽度随之变化 → 文字折行位置跟着跳）；
 *   2. Wallpaper Engine 不转发滚轮事件，能拖才是主力交互 —— BetterScroll 的拖拽 + 惯性
 *      正好补上，浏览器里再顺手接住滚轮；
 *   3. 滚动条可以自己排版：细、半透明、只在真的溢出时出现。
 *
 * 用法的前提是 BetterScroll 的约定：
 *   · wrapperEl 绑在「尺寸确定 + overflow:hidden」的容器上；
 *   · 容器里的**第一个元素**就是滚动内容（本文件也按这个约定取内容层量高度）。
 * 绑 barEl / thumbEl 就多一条自绘滚动条，不绑也能用；
 * 传 onScroll 就能拿到滚动位置（边缘淡出之类的「还有内容」提示要靠它）。
 *
 * 尺寸只在 start / refresh / ResizeObserver 回调里量一次：滚动过程中读 DOM 会强制重排，
 * Wallpaper Engine 里直接掉帧。
 */
import { onBeforeUnmount, ref } from 'vue'
import BetterScroll, { useMouseWheelPlugin } from './betterScroll'

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export const useSmoothScroll = ({ wheelSpeed = 20, onScroll } = {}) => {
  const wrapperEl = ref(null)
  const barEl = ref(null)
  const thumbEl = ref(null)
  const barVisible = ref(false)

  let scroll = null
  let observer = null
  let dragState = null
  let thumbHeight = 0
  // 量出来的尺寸：wrapper 可视高、内容高、轨道高
  const metrics = { wrapper: 0, content: 0, track: 0 }

  const contentEl = () => wrapperEl.value?.firstElementChild || null

  const measure = () => {
    metrics.wrapper = wrapperEl.value?.clientHeight || 0
    metrics.content = contentEl()?.offsetHeight || 0
    metrics.track = barEl.value?.clientHeight || metrics.wrapper
  }

  const maxScroll = () => Math.max(metrics.content - metrics.wrapper, 0)
  const currentScroll = () => clamp(-(scroll?.y || 0), 0, maxScroll())

  /* 把「滚到哪儿了」交给调用方：三种边界状态都在这里算好，调用方只管亮 / 灭 UI。
     只在 bs 的 scroll / scrollEnd 和尺寸量完之后调，滚动过程中不额外读 DOM。 */
  const notify = () => {
    if (!onScroll) return
    const max = maxScroll()
    const y = currentScroll()
    onScroll({
      y,
      max,
      overflow: max > 2,
      atStart: y <= 2,
      atEnd: max <= 2 || y >= max - 2,
    })
  }

  /* 滚动条滑块：位置直接写 DOM，不走响应式 —— 否则滚动过程中每帧都要重渲染整个弹层 */
  const updateBar = () => {
    const { wrapper, content, track } = metrics
    const range = Math.max(content - wrapper, 0)
    if (!range || !wrapper || !track) {
      thumbHeight = 0
      barVisible.value = false
      return
    }
    // 滑块最小 28px：内容只溢出一点点时也抓得住
    thumbHeight = Math.max((wrapper / content) * track, 28)
    const offset = (currentScroll() / range) * Math.max(track - thumbHeight, 0)
    if (thumbEl.value) {
      thumbEl.value.style.height = `${thumbHeight}px`
      thumbEl.value.style.transform = `translateY(${offset}px)`
    }
    if (!barVisible.value) barVisible.value = true
  }

  const refresh = () => {
    // 拖拽 / 惯性过程中不 refresh：BetterScroll 会把当前位移重算一遍，手感会「顿一下」
    if (!scroll || dragState) return
    scroll.refresh()
    measure()
    updateBar()
    notify()
  }

  const start = () => {
    if (scroll || !wrapperEl.value) return
    useMouseWheelPlugin()
    scroll = new BetterScroll(wrapperEl.value, {
      scrollY: true,
      // 内容里有链接和按钮：不打开这个，拖拽之后的 click 会被 bs 吞掉
      click: true,
      bounce: false,
      // probeType 3：拖拽与惯性滚动过程中持续派发 scroll，自绘滚动条才跟得上
      probeType: 3,
      mouseWheel: { speed: wheelSpeed, easeTime: 200 },
    })
    scroll.on('scroll', () => {
      updateBar()
      notify()
    })
    scroll.on('scrollEnd', () => {
      updateBar()
      notify()
    })
    measure()
    updateBar()
    notify()

    /* 浏览器为了让聚焦元素（比如弹层底部那个「和风天气」链接）进入视口，会去改 wrapper 的
       scrollTop —— 即使 overflow:hidden，程序化滚动照样生效。那一段位移会和 bs 的 transform
       叠在一起，画面「跳一下」，之后 bs 的位置也跟人对不上。
       所以：原生位移一律归零，位置只由 bs 决定；真要露出来，由下面的 focusin 用 bs 滚过去。 */
    wrapperEl.value.addEventListener('scroll', onNativeScroll, { passive: true })
    wrapperEl.value.addEventListener('focusin', onFocusIn)

    /* 面板高度是「跟着内容长」的（见 WeatherDialog.vue 的尺寸注释），
       所以 wrapper 和内容都可能随时变高变矮 —— 变一次就要重新量、
       否则滚动条的范围会停在旧值上，拖到底也滚不到最后一行。 */
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        const wrapper = wrapperEl.value?.clientHeight || 0
        const content = contentEl()?.offsetHeight || 0
        // 尺寸真的变了再 refresh：RO 在 observe 时也会回调一次，且 refresh 可能再触发一轮
        if (wrapper === metrics.wrapper && content === metrics.content) return
        refresh()
      })
      observer.observe(wrapperEl.value)
      if (contentEl()) observer.observe(contentEl())
    }
  }

  const onNativeScroll = () => {
    const wrapper = wrapperEl.value
    if (!wrapper) return
    if (wrapper.scrollTop) wrapper.scrollTop = 0
    if (wrapper.scrollLeft) wrapper.scrollLeft = 0
  }

  const onFocusIn = (event) => {
    const wrapper = wrapperEl.value
    const target = event.target
    if (!scroll || !wrapper || !(target instanceof HTMLElement)) return
    // 先把浏览器刚做的原生滚动同步归零，再量位置 ——
    // 不然量到的是「已经被原生滚动带进来」的假位置，看起来可见、就不会补滚了
    onNativeScroll()
    // 只在真的看不见时才滚：正常 Tab 在可见区域内移动，不该让整块面板跟着动
    const margin = 12
    const wrapRect = wrapper.getBoundingClientRect()
    const rect = target.getBoundingClientRect()
    const top = rect.top - wrapRect.top
    const bottom = rect.bottom - wrapRect.top
    const limit = maxScroll()
    let next = null
    if (top < margin) next = currentScroll() - (margin - top)
    else if (bottom > wrapper.clientHeight - margin) next = currentScroll() + (bottom - wrapper.clientHeight + margin)
    if (next === null) return
    scroll.scrollTo(0, -clamp(next, 0, limit), 220)
  }

  /* 调用方自己发起的滚动（切分区归零、方向键按像素滚）：bs 只认绝对位移，
     所以在这里把「滚到哪」夹进 [0, maxScroll] 再换成负数 translate。
     scrollTo 触发的 scroll 事件会把 updateBar / notify 一起带起来。 */
  const scrollTo = (y, duration = 0) => {
    if (!scroll) return
    scroll.scrollTo(0, -clamp(y, 0, maxScroll()), duration)
  }

  const scrollBy = (delta, duration = 160) => {
    if (!scroll) return
    scrollTo(currentScroll() + delta, duration)
  }

  const scrollToTop = () => scrollTo(0, 0)

  const stop = () => {
    endDrag()
    observer?.disconnect()
    observer = null
    wrapperEl.value?.removeEventListener('scroll', onNativeScroll)
    wrapperEl.value?.removeEventListener('focusin', onFocusIn)
    scroll?.destroy()
    scroll = null
    metrics.wrapper = 0
    metrics.content = 0
    metrics.track = 0
    barVisible.value = false
  }

  /* ---------------- 自绘滚动条：滑块拖动 + 轨道点击 ----------------
     调用方要用 @mousedown.stop 绑这两个 handler：滚动条通常躺在 wrapper 里面，
     事件冒到 bs 那儿会被当成「按住正文拖」，顺手把刚发起的滚动动画停掉。 */
  const endDrag = () => {
    dragState = null
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', endDrag)
  }

  const onDragMove = (event) => {
    if (!dragState || !scroll) return
    const delta = event.clientY - dragState.startY
    const ratio = dragState.range ? delta / dragState.range : 0
    const next = clamp(dragState.startScroll + ratio * dragState.max, 0, dragState.max)
    scroll.scrollTo(0, -next, 0)
    updateBar()
  }

  const onThumbDown = (event) => {
    if (!barVisible.value || !scroll) return
    event.preventDefault()
    // 就算调用方忘了 .stop，也不能让这次按下冒泡给 bs（否则它会当成「拖正文」）
    event.stopPropagation()
    dragState = {
      startY: event.clientY,
      startScroll: currentScroll(),
      range: Math.max(metrics.track - thumbHeight, 0),
      max: maxScroll(),
    }
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', endDrag)
  }

  const onTrackDown = (event) => {
    if (!barVisible.value || !scroll) return
    const range = Math.max(metrics.track - thumbHeight, 0)
    const barRect = barEl.value?.getBoundingClientRect()
    if (!range || !barRect) return
    event.preventDefault()
    event.stopPropagation()
    const offset = event.clientY - barRect.top - thumbHeight / 2
    const ratio = clamp(offset / range, 0, 1)
    scroll.scrollTo(0, -ratio * maxScroll(), 220)
  }

  onBeforeUnmount(stop)

  return {
    wrapperEl,
    barEl,
    thumbEl,
    barVisible,
    start,
    stop,
    refresh,
    scrollTo,
    scrollBy,
    scrollToTop,
    onThumbDown,
    onTrackDown,
  }
}
