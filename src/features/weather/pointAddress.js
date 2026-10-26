/**
 * 坐标 → 地址的两级兜底（主界面 / 「最近」记录 / 密钥变更后的重查共用）。
 *
 * 和地图选点（MapPointPicker.runRoadQuery）是同一套优先级：
 *   1. 有高德 key：逆地理编码，能到最近的道路名；
 *   2. 没 key / 高德失败：和风 GeoAPI 反查，只能到区县。
 *
 * 区别只在于坐标系：地图组件手里是地图坐标系，能省掉一次转换；这里入参统一是
 * 落库坐标（和风的坐标系：大陆 GCJ-02、境外 WGS-84），高德和和风都直接可用。
 */
import { isReverseGeocodeEnabled, reverseGeocode } from './reverseGeocode'
import { isPlaceLookupAvailable, lookupPlaceByCoord } from './placeLookup'

/**
 * @param {number} lng 经度（落库坐标系：大陆 GCJ-02）
 * @param {number} lat 纬度
 * @param {{signal?: AbortSignal, timeout?: number}} [options]
 * @returns {Promise<null | {source:'amap'|'qweather', road:string, district:string,
 *   city:string, province:string, township:string}>}
 *   两路都失败时返回 null（调用方保留原值，不要拿空结果把已有地址冲掉）
 */
export const resolvePointAddress = async (lng, lat, options = {}) => {
  const x = Number(lng)
  const y = Number(lat)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const { signal, timeout = 5000 } = options

  if (isReverseGeocodeEnabled()) {
    try {
      const info = await reverseGeocode(x, y, { crs: 'GCJ02', signal, timeout })
      return {
        source: 'amap',
        road: info.road || '',
        district: info.district || '',
        city: info.city || '',
        province: info.province || '',
        township: info.township || '',
      }
    } catch (error) {
      // 配额 / 断网 / key 类型不对 / 郊区没有命名道路 → 交给和风兜底。
      // 主动取消不算失败：直接返回 null，避免把取消当成「没查到」写回去
      if (signal?.aborted) return null
    }
  }

  if (isPlaceLookupAvailable()) {
    try {
      const place = await lookupPlaceByCoord(x, y, { signal, timeout })
      return {
        source: 'qweather',
        road: '',
        district: place.name || '',
        city: place.adm2 || '',
        province: place.adm1 || '',
        township: '',
      }
    } catch (error) {
      if (signal?.aborted) return null
    }
  }

  // 和风凭据还没配：没有任何可查的地址来源，保持原样
  return null
}

export default resolvePointAddress
