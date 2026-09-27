/**
 * 地址选择页的"最近选择"记录
 * 只存 adcode 路径与显示名，不存任何密钥/接口数据。
 */
import { computed } from 'vue'
import { useStorage } from '@vueuse/core'

const STORAGE_KEY = 'WeatherLocationHistory'
const MAX_HISTORY = 6

const Stored = useStorage(STORAGE_KEY, [])

export const LocationHistory = computed(() => Stored.value || [])

export const addLocationHistory = (entry) => {
  if (!entry?.path?.length) return
  const key = entry.path.join('/')
  const rest = (Stored.value || []).filter((item) => item.key !== key)
  Stored.value = [{ key, label: entry.label, path: [...entry.path] }, ...rest].slice(0, MAX_HISTORY)
}

export const clearLocationHistory = () => {
  Stored.value = []
}
