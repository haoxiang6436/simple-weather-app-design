import { onMounted, onUnmounted, ref } from 'vue'

/**
 * 天气数据定时刷新与重试
 * - 离线时监听 online 事件，恢复后立即刷新
 * - 失败后 5 秒重试；连续失败超过 5 次降级为 30 秒重试
 * - 成功后每 60 秒刷新一次
 *
 * @param {Object} options
 * @param {Function} options.refresh   刷新函数（失败时抛出异常）
 * @param {Function} options.setState  更新加载状态（0/100/200/300/400）
 * @param {Function} options.onSuccess 刷新成功后的回调
 */
export const useWeatherRefresh = ({ refresh, setState, onSuccess }) => {
  let timer = null
  const errCount = ref(0)

  const clearTimer = () => {
    clearTimeout(timer)
    timer = null
  }

  const updateWeather = async () => {
    clearTimer()
    if (!window.navigator.onLine) {
      setState(400)
      window.addEventListener('online', updateWeather)
      return
    }
    window.removeEventListener('online', updateWeather)
    try {
      await refresh()
      onSuccess?.()
      errCount.value = 0
      timer = setTimeout(updateWeather, 1000 * 60)
    } catch (error) {
      console.error(error)
      errCount.value++
      if (errCount.value > 5) {
        setState(0)
        timer = setTimeout(updateWeather, 1000 * 30)
        return
      }
      setState(300)
      timer = setTimeout(updateWeather, 1000 * 5)
    }
  }

  onMounted(updateWeather)
  onUnmounted(() => {
    clearTimer()
    window.removeEventListener('online', updateWeather)
  })

  return { errCount, updateWeather }
}
