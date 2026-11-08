/**
 * 默认区县中心补查地址；高德密钥变化时刷新当前地址和「最近」记录。
 *
 * 为什么需要它
 * ------------
 * 高德 key 是可选属性，用户完全可能先不填、用一段时间后再去属性面板补上，
 * 或者反过来把 key 清掉。密钥一变，坐标能查到的地名精度就变了：
 *   - 补上 key：地址从「台州市 黄岩附近」升级成「黄岩区 中学路」；
 *   - 清空 key：地址退回「台州市 黄岩区附近」，不能让旧路名继续挂在卡片上。
 * 坐标本身没变，天气数据也完全有效，所以这里只重查地名、不碰天气请求。
 *
 * 地图页里当前 pin 的重查由 MapPointPicker 自己做（它还负责 pin 的实时文案）；
 * 这个模块管的是「已经落库的地址」：主界面卡片和「最近」列表 ——
 * 用户填完 key 时可能正停在天气卡上，不能要求他重新选一遍位置才生效。
 *
 * 默认中心在选址或恢复旧地址后补查，已保存的同精度地址直接复用。
 * 「最近」仍只在 AmapKey 真的变化时刷新，不会每次启动都重查整个列表。
 */
import { onScopeDispose, watch } from 'vue'
import { AmapKey } from '@/api/credentials'
import { useWeatherStore } from '@/store'
import { isReverseGeocodeEnabled } from './reverseGeocode'
import { resolvePointAddress } from './pointAddress'
import { refreshLocationHistory } from './useLocationHistory'

// 属性面板每敲一个字都会下发一次 key（调试面板那边还有 300ms 去抖），
// 这里再去抖一层：等输入稳定下来再查，别拿半截 key 去撞高德接口
const KEY_REFRESH_DELAY = 600
// 高德个人版 Web服务 key 是 3 次/秒。一次刷新最多会查 1 个当前点 + 6 条最近记录，
// 连续发出去必然触发 10021（QPS 超限），那些记录就会退回和风、拿不到路名。
// 按 ~2.8 次/秒 排队，代价是整轮最多 2 秒左右，但结果齐全。
const QUERY_GAP = 360

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

// 点位身份（与落库精度一致）：查询期间用户可能又选了别的位置，
// 旧坐标的结果不能套到新点上
const pointKey = (point) => {
  const lng = Number(point?.lng)
  const lat = Number(point?.lat)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return ''
  return `${lng.toFixed(4)},${lat.toFixed(4)}`
}

export const useAddressRefresh = () => {
  const weatherStore = useWeatherStore()
  let timer = 0
  // 每次 key 变化都递增：上一轮还没跑完的查询回来时序号对不上，直接丢弃
  let seq = 0
  let lastQueryAt = 0
  let historyPending = false

  // 同坐标的中心选择与地图选点也有不同身份，不能互相写入地址。
  const currentKey = () => {
    const key = pointKey(weatherStore.CityAddressPoint)
    if (!key) return ''
    const mode = weatherStore.dayDateCity?.point ? 'point' : 'center'
    return `${mode}:${weatherStore.dayDateCity?.location}:${key}`
  }

  // 和风 / 高德的查询都很快，但「最近」可能有 6 条：排队按 QPS 放行
  const resolveThrottled = async (point) => {
    const wait = QUERY_GAP - (Date.now() - lastQueryAt)
    if (wait > 0) await sleep(wait)
    lastQueryAt = Date.now()
    return resolvePointAddress(point.lng, point.lat)
  }

  const run = async () => {
    const mySeq = seq

    // 清空 key 时先把旧路名摘掉：和风反查可能失败（断网 / 境外），
    // 不能让一条高德给的路名继续冒充「附近」等级的地址
    if (!isReverseGeocodeEnabled()) {
      weatherStore.applyPointAddress({ road: '', districtSource: '' })
    }

    // 1) 当前正在用的位置：卡片地址立刻跟着变
    const current = weatherStore.CityAddressPoint
    if (current) {
      const keyAtStart = currentKey()
      const info = await resolveThrottled(current)
      if (mySeq !== seq) return
      // 查询期间用户重新选了位置：这份结果是上一个点的，不能写进新点
      if (currentKey() !== keyAtStart) return
      if (info) weatherStore.applyPointAddress(info)
    }

    // 2) 「最近」记录：每条有坐标的记录都重查一次，并同步 chip 上的 label
    if (historyPending) {
      await refreshLocationHistory(resolveThrottled, {
        shouldStop: () => mySeq !== seq,
      })
      if (mySeq === seq) historyPending = false
    }
  }

  watch([AmapKey, currentKey], ([key], [previousKey] = []) => {
    // 换密钥或换位置都立即作废上一轮，避免旧坐标的结果落到新地址。
    seq += 1
    clearTimeout(timer)
    timer = 0
    const keyChanged = previousKey !== undefined && key !== previousKey
    if (keyChanged) historyPending = true

    const current = weatherStore.CityAddressPoint
    const source = current?.districtSource
    const needsCenterAddress = !weatherStore.dayDateCity?.point && !!current &&
      (!source || (isReverseGeocodeEnabled() ? source !== 'amap' : source === 'amap'))
    if (!historyPending && !needsCenterAddress) return

    timer = setTimeout(() => {
      timer = 0
      run().catch((error) => console.error('刷新地址失败：', error))
    }, keyChanged ? KEY_REFRESH_DELAY : 0)
  }, { immediate: true })

  onScopeDispose(() => {
    clearTimeout(timer)
    timer = 0
    // 让还在路上的这一轮作废，避免回写到已经卸载的页面
    seq += 1
  })
}

export default useAddressRefresh
