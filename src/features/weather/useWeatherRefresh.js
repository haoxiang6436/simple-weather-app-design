import { onMounted, onUnmounted, ref, unref, watch } from 'vue'

/**
 * 天气数据定时刷新与重试
 * - 离线时监听 online 事件，恢复后立即刷新
 * - 失败后 5 秒重试；连续失败超过 5 次降级为 30 秒重试
 * - 成功后每 60 秒刷新一次
 * - 生活指数走独立节拍，并比主周期错开一段时间（默认 30 秒）：
 *   主周期固定 3 个请求 = 多域名池的域名数，不会出现“某个域名每个周期都多拿一次请求”
 *
 * @param {Object} options
 * @param {Function} options.refresh        刷新函数（失败时抛出异常）
 * @param {Function} [options.refreshIndices] 生活指数刷新函数（错峰执行，失败不影响主状态）
 * @param {Function} options.setState       更新加载状态（0/100/200/300/400）
 * @param {Function} options.onSuccess      刷新成功后的回调
 * @param {number} [options.indicesOffset]  生活指数首次触发延迟（毫秒）
 * @param {import('vue').Ref<boolean>|Function} [options.enabled]
 *        是否允许请求（新用户引导未完成时不允许，避免用空的域名/密钥发请求）
 */
export const useWeatherRefresh = ({
  refresh,
  refreshIndices,
  setState,
  onSuccess,
  indicesOffset = 1000 * 30,
  enabled = null,
}) => {
  let timer = null
  let indicesTimer = null
  const errCount = ref(0)
  const isEnabled = () => (enabled ? !!unref(enabled) : true)

  const clearTimer = () => {
    clearTimeout(timer)
    timer = null
  }

  const clearIndicesTimer = () => {
    clearTimeout(indicesTimer)
    indicesTimer = null
  }

  const updateWeather = async () => {
    clearTimer()
    if (!isEnabled()) return
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

  // 生活指数：独立节拍 + 与主周期错峰，保证定时请求数与域名池大小对齐
  const updateIndices = async () => {
    clearIndicesTimer()
    if (!isEnabled()) return
    if (refreshIndices && window.navigator.onLine) {
      try {
        await refreshIndices()
      } catch (error) {
        // 生活指数失败不影响主状态，也不改变重试节奏
        console.error(error)
      }
    }
    indicesTimer = setTimeout(updateIndices, 1000 * 60)
  }

  /* 回到前台立刻刷一次：标签页在后台时定时器会被浏览器节流（甚至整个冻结），
     用户切回来看到的可能是十几分钟前的数据 —— 分钟级降水 5 分钟一变，最容易被看出来
     （「正在下雨」早就在后台过去了，胶囊却还按旧窗口说话）。
     各接口自己的缓存时效仍然生效，所以来回切标签页不会真的多打请求。 */
  const onVisibilityChange = () => {
    if (document.hidden || !isEnabled()) return
    updateWeather()
  }

  onMounted(() => {
    // 监听先挂上：引导没完成时 enabled 是 false，等它变 true 之后切换标签页也要能触发刷新
    document.addEventListener('visibilitychange', onVisibilityChange)
    if (!isEnabled()) return
    updateWeather()
    if (refreshIndices) {
      indicesTimer = setTimeout(updateIndices, indicesOffset)
    }
  })
  onUnmounted(() => {
    clearTimer()
    clearIndicesTimer()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('online', updateWeather)
  })

  // 引导完成（拿到可用的域名/密钥）后开始轮询；凭据失效被清空时暂停
  if (enabled) {
    watch(
      () => !!unref(enabled),
      (value) => {
        if (value) {
          updateWeather()
          if (refreshIndices) {
            clearIndicesTimer()
            indicesTimer = setTimeout(updateIndices, indicesOffset)
          }
        } else {
          clearTimer()
          clearIndicesTimer()
        }
      }
    )
  }

  return { errCount, updateWeather }
}
