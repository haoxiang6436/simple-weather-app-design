/**
 * 地址选择页的"最近选择"记录
 * 只存 adcode 路径、显示名和地图选点坐标，不存任何密钥/接口数据。
 *
 * 坐标必须一起存：只留 adcode 的话，"在朝阳区点了个位置"重新选时
 * 会被还原成"整个朝阳区"，点选的精度就丢了。
 */
import { computed } from 'vue'
import { useStorage } from '@vueuse/core'
import { pointAddressLabel } from './placeLookup'
import { wgs84ToGcj02 } from './mapTiles'

const STORAGE_KEY = 'WeatherLocationHistory'
const MAX_HISTORY = 6

const Stored = useStorage(STORAGE_KEY, [])

/**
 * 一次性迁移：早期版本误以为和风只吃 WGS-84，记录里的坐标是 WGS-84。
 * 现在统一用和风的坐标系落库（大陆 GCJ-02）：没有 crs 标记的旧记录转换一次并打标，
 * 否则升级后「最近」里的 pin 会整体偏 ~500 m（和 useWeatherStore 的迁移同一条规则）。
 */
const migrateLegacyPoints = () => {
  const items = Stored.value || []
  let changed = false
  const next = items.map((item) => {
    const point = item?.point
    if (!point || point.crs === 'GCJ02') return item
    const lng = Number(point.lng)
    const lat = Number(point.lat)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return item
    const [gLng, gLat] = wgs84ToGcj02(lng, lat)
    changed = true
    return {
      ...item,
      point: {
        ...point,
        lng: Number(gLng.toFixed(4)),
        lat: Number(gLat.toFixed(4)),
        crs: 'GCJ02',
      },
    }
  })
  if (changed) Stored.value = next
}
migrateLegacyPoints()

/** 坐标只取整数度：丢掉小数点后的部分，并规避 -0 这种边界值 */
const coordKey = (value) => {
  const truncated = Math.trunc(Number(value))
  return String(truncated === 0 ? 0 : truncated)
}

/**
 * 归一化的去重键。
 * 经纬度完全忽略小数：地图上在同一片区域微调几百米，小数位一直在变，
 * 按小数位去重会在「最近」里堆出一串「朝阳区 · 39.92, 116.44」这样的近似项。
 * 路径本身仍留在键里，所以整数度相同但区县不同的记录不会互相吞掉。
 * 这里从 path/point 现算而不是读 item.key，所以老版本按两位/四位小数存下的记录
 * 也能和新记录对上，不会在列表里留一份旧副本。
 */
const keyOf = ({ path = [], point = null } = {}) => {
  const pathKey = (path || []).join('/')
  if (!point || !Number.isFinite(Number(point.lng)) || !Number.isFinite(Number(point.lat))) {
    return pathKey
  }
  return `${pathKey}@${coordKey(point.lng)},${coordKey(point.lat)}`
}

/**
 * 列表 / 删除用的记录键：和落库时的 keyOf 完全一致。
 * 同一地址在旧缓存里的多份副本会算成同一个 key，删一条就能一起清掉。
 */
export const locationHistoryKey = (entry) => keyOf(entry)

/**
 * 高亮用的「当前地址」身份：路径 + 4 位小数坐标。
 *
 * 去重键故意忽略坐标小数（同一个区县只留一条记录），但高亮不能跟着忽略：
 * 用户在地图上挪了几百米之后其实已经换了地址，原来那条「最近」不该继续亮着。
 * 4 位小数与落库精度一致（见 addLocationHistory / useWeatherStore.choosePoint）。
 */
export const locationHistoryIdentity = ({ path = [], point = null } = {}) => {
  const pathKey = (path || []).join('/')
  if (!point || !Number.isFinite(Number(point.lng)) || !Number.isFinite(Number(point.lat))) {
    return pathKey
  }
  return `${pathKey}@${Number(point.lng).toFixed(4)},${Number(point.lat).toFixed(4)}`
}

/** 按归一化 key 折叠重复项，保留先出现的（＝ 最近使用的那个） */
const collapse = (items) => {
  const seen = new Set()
  return items.filter((item) => {
    const key = keyOf(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// 读的时候也折叠一次：老缓存里的重复项不必等用户再选一次才能消失
export const LocationHistory = computed(() => collapse(Stored.value || []))

/**
 * @param {{ label: string, path: string[], point?: {lng:number,lat:number}|null }} entry
 */
export const addLocationHistory = (entry) => {
  if (!entry?.path?.length) return

  const point = entry.point &&
    Number.isFinite(entry.point.lng) &&
    Number.isFinite(entry.point.lat)
    ? {
      lng: Number(entry.point.lng.toFixed(4)),
      lat: Number(entry.point.lat.toFixed(4)),
      // 坐标系标记：和风的（大陆 GCJ-02）。老记录没有它，模块加载时已由 migrateLegacyPoints 补上
      crs: 'GCJ02',
      // 路名/区县/市名跟着点一起存：这是「最近」列表的显示文案（「黄岩区 中学路」/
      // 「台州市 黄岩区附近」），也免得重新选回同一个点时要再查一次逆地理编码。
      // 老记录没有这些字段，照常能用
      ...(entry.point.road ? { road: String(entry.point.road) } : {}),
      ...(entry.point.district ? { district: String(entry.point.district) } : {}),
      // 市名：没填高德 key 时地址只能到区县，文案里带上市名（「台州市 黄岩附近」）
      ...(entry.point.city ? { city: String(entry.point.city) } : {}),
      // 区县名是「按坐标查到的」还是三级下拉框的标签：老记录没有这个字段，
      // 主界面会拿 CityDetail 核对，对不上就以坐标为准
      ...(entry.point.districtSource ? { districtSource: String(entry.point.districtSource) } : {}),
    }
    : null

  // 同一个选择只留一条，并且挪到最前面（重复选同一个地方 = 一次「最近使用」）
  const key = keyOf({ path: entry.path, point })
  const rest = (Stored.value || []).filter((item) => keyOf(item) !== key)
  Stored.value = collapse([
    { key, label: entry.label, path: [...entry.path], point },
    ...rest,
  ]).slice(0, MAX_HISTORY)
}

export const clearLocationHistory = () => {
  Stored.value = []
}

/**
 * 删除单条「最近」记录。
 *
 * 按归一化 key 删除而不是按数组下标：列表是 collapse 之后的视图，
 * 下标和 Stored 里的原始顺序不一定对得上；同一地址在旧缓存里留下的多份副本
 * 也会一起清掉，否则删完一条，折叠后另一条又会冒出来。
 *
 * @param {string|{path?:string[],point?:object|null}} target 记录 key，或记录本身
 */
export const removeLocationHistory = (target) => {
  if (!target) return
  const key = typeof target === 'string' ? target : keyOf(target)
  if (!key) return
  const items = Stored.value || []
  const next = items.filter((item) => keyOf(item) !== key)
  if (next.length !== items.length) Stored.value = next
}

/**
 * 重新解析「最近」记录里的坐标级地名（供高德密钥变化时调用）。
 *
 * 记录里有坐标才需要重查：只按区县选的记录（point 为 null）没有道路可补。
 * 每条记录都交给 resolve(point) 重新查一次，拿到 { road, district, city, source }
 * 后同时更新 point 和 chip 上的 label，所以「最近」和主界面的写法始终一致。
 *
 * @param {(point: {lng:number, lat:number}) => Promise<null | {
 *   road?:string, district?:string, city?:string, source?:string }>} resolve
 * @param {{shouldStop?: () => boolean}} [options] 密钥又被改了 / 组件卸载时提前放弃，
 *   避免旧一轮的查询结果覆盖新状态
 * @returns {Promise<number>} 实际更新的记录条数
 */
export const refreshLocationHistory = async (resolve, options = {}) => {
  const { shouldStop } = options
  const items = Stored.value || []
  if (!items.length || typeof resolve !== 'function') return 0

  const updates = new Map()
  for (const item of items) {
    if (shouldStop?.()) return 0
    const point = item.point
    if (!point || !Number.isFinite(Number(point.lng)) || !Number.isFinite(Number(point.lat))) continue
    const info = await resolve({ lng: Number(point.lng), lat: Number(point.lat) })
    if (shouldStop?.()) return 0
    // 两路都没查回来：保留原值（旧路名 / 旧区县），不要把已有地址冲成空
    if (!info) continue
    const district = String(info.district || point.district || '').trim()
    const city = String(info.city || point.city || '').trim()
    const road = String(info.road || '').trim()
    updates.set(keyOf(item), {
      label: pointAddressLabel({ district, city, road }) || item.label,
      point: {
        ...point,
        road,
        district,
        city,
        districtSource: info.source || point.districtSource || '',
      },
    })
  }
  if (!updates.size) return 0

  // 按 key 合并回「当前」列表而不是直接写回 next：
  // 查询期间用户可能又确认过一次位置（addLocationHistory 已经把新记录插到最前面），
  // 直接整体覆盖会把那条刚选好的记录弄丢。
  Stored.value = (Stored.value || []).map((item) => {
    const patch = updates.get(keyOf(item))
    return patch ? { ...item, ...patch } : item
  })
  return updates.size
}
