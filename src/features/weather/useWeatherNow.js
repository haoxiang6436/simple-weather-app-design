import { onUnmounted, ref } from 'vue'

/**
 * 全应用共用的「现在」。
 *
 * 分钟级降水的文案是相对「现在」算的（几分钟后雨停 / 几分钟后下中雨）。
 * 以前胶囊、弹层、壁纸雨滴各自 `Date.now()`：三处读到的是三个不同的「现在」，
 * 于是在 5 分钟段边界附近会出现「胶囊说正在下、雨滴已经停了」「点开弹层后
 * 文案比胶囊少 5 分钟」这种不同步 —— 看起来就像文案在跟网络请求走。
 *
 * 这里只维护一份 `now`：
 *   - 20 秒 tick 一次，分钟级文案不需要秒级精度；
 *   - 页面回到前台（或窗口重新可见）时立刻补一次，避免后台定时器被节流后
 *     还拿十几分钟前的「现在」去读数据；
 *   - 引用计数：最后一个使用者卸载时清掉定时器，不会给整页留一个常驻 interval。
 *
 * 用法（只能在 setup / 生命周期内调用）：
 *   const now = useWeatherNow()
 *   const text = computed(() => fn(now.value))
 */

const now = ref(Date.now())
let timer = null
let users = 0

const tick = () => { now.value = Date.now() }

const onVisibilityChange = () => {
  if (!document.hidden) tick()
}

const start = () => {
  if (timer !== null) return
  tick()
  timer = setInterval(tick, 20000)
  document.addEventListener('visibilitychange', onVisibilityChange)
}

const stop = () => {
  if (timer === null) return
  clearInterval(timer)
  timer = null
  document.removeEventListener('visibilitychange', onVisibilityChange)
}

export const useWeatherNow = () => {
  users += 1
  // 每次取用都先对一次表：共用时钟可能已经跑了十几秒，
  // 新打开的弹层不该先拿一份偏旧的「现在」算一帧文案。
  tick()
  start()
  onUnmounted(() => {
    users -= 1
    if (users <= 0) {
      users = 0
      stop()
    }
  })
  return now
}

export default useWeatherNow
