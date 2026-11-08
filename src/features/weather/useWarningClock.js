import { onMounted, onUnmounted, ref } from 'vue'

// Relative issue times keep advancing even when the API response is still cached.
export const useWarningClock = () => {
  const currentTime = ref(Date.now())
  const tick = () => { currentTime.value = Date.now() }
  let timer
  onMounted(() => {
    tick()
    timer = setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
  })
  onUnmounted(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', tick)
    window.removeEventListener('focus', tick)
  })
  return currentTime
}
