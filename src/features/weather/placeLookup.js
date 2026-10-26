/**
 * 和风天气 GeoAPI 坐标反查：坐标 → 区县（三级行政区）
 *
 * 为什么需要它
 * ------------
 * 天气始终按经纬度查询，但界面上要给人看一个地名。没填高德 key 时，原来的地址文案
 * 只能拿三级下拉框里选中的区县顶替 —— 可 pin 可以被拖到别的城市（选了北京、点到的
 * 却在天津），那条文案就会和天气对不上。
 *
 * 和风自带的 /geo/v2/city/lookup 支持「经度,纬度」反查，返回离坐标最近的一个
 * 城市 / 区县，带 adm1（省）、adm2（市）、name（区县），正好是我们需要的三级行政区。
 * 它没有街道和道路，所以界面只能写「xx附近」——这不是精度损失，而是老实承认
 * 「只知道到这个区县」。
 *
 * 两个接口语义决定的边界（代码里兜不住，只能靠文案和调用方一起消化）
 * ------------------------------------------------------------------
 * 1. 它返回的是「离坐标最近的城市」，不是「包含该坐标的行政区」。如果邻区 / 邻市的
 *    中心离得更近，它会返回邻区（实测：湛江徐闻附近会返回海口美兰；青海湖附近会返回
 *    兴海）。所以地址文案一律带「附近」，并且信息里保留 distanceKm，调用方想更保守时
 *    可以据此降级。天气本身仍然只认坐标，不受这条影响。
 * 2. 坐标只接受两位小数（约 1.1 km）。县区级地名本来也不靠这个精度区分。
 *
 * 请求复用 api/weather 的 lookupCity：同一个域名轮询池、同一套凭据与错误表，
 * 不额外引入一个请求通道。结果按两位小数坐标缓存（同一片区域反复选点只查一次），
 * 和风免费额度每月 5 万次，一次选点通常只有 1~3 次请求。
 */
import { lookupCity } from '@/api/weather'
import { ActiveEntries } from '@/api/credentials'

// 缓存上限：一次选点会话不会点太多位置，留个上限防止长会话无限增长
const CACHE_LIMIT = 200

/**
 * 用户是否配置了和风凭据。
 * 没配时调用方应该整块隐藏「附近」UI，而不是发一个必然失败的请求
 *（引导流程里凭据是第一步，正常走到选位置时这里已经为 true）。
 */
export const isPlaceLookupAvailable = () => ActiveEntries.value.length > 0

/**
 * 失败时的错误对象。
 * code 取值：NO_KEY / INVALID_COORD / NO_RESULT / ABORTED，其余（网络、401、429…）
 * 原样抛出 api/weather 那边的 ApiError，调用方自己决定静默还是提示。
 */
const fail = (code, message, cause) => {
  const error = new Error(message)
  error.name = 'PlaceLookupError'
  error.code = code
  if (cause) error.cause = cause
  return error
}

/** 两点间大圆距离（km）：用来判断「最近的城市」到底离这个坐标有多远 */
export const distanceKm = (lat1, lon1, lat2, lon2) => {
  const values = [lat1, lon1, lat2, lon2].map(Number)
  if (!values.every(Number.isFinite)) return null
  const [a, b, c, d] = values
  const toRad = (value) => (value * Math.PI) / 180
  const dLat = toRad(c - a)
  const dLon = toRad(d - b)
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/* ---------------- 行政区名归一化 ----------------
 * 和风给的名字不带后缀（「黄岩」「东城」），高德带（「黄岩区」「东城区」），
 * 三级下拉框的标签也带。比较时先剥掉行政级别后缀，避免「黄岩区 ≠ 黄岩」这种误判。
 */
const ADMIN_SUFFIX_RE = /(特别行政区|自治区|自治州|自治县|自治旗|林区|特区|新区|地区|省|市|盟|区|县|旗)$/

/** 「黄岩区」→「黄岩」；已经是「黄岩」就原样返回 */
export const adminCoreName = (value) => String(value || '').trim().replace(ADMIN_SUFFIX_RE, '').trim()

/**
 * 两个行政区名是不是同一级 / 同一个地方。
 * 只比较剥掉后缀后的全名，不做 startsWith —— 「朝阳区」和「朝阳县」在同一个点位上
 * 不可能同时出现，但「朝阳」和「朝阳区」必须算同一个。
 */
export const isSameAdminName = (a, b) => {
  const left = adminCoreName(a)
  const right = adminCoreName(b)
  return !!left && left === right
}

/**
 * 把省 / 市 / 区几段拼成一个地址：相邻的重复段（「北京市」+「北京」）只留第一个。
 * 用于地图页标题，避免出现「北京市-北京-东城附近」这种拗口的写法。
 * @param {Array<string>} parts
 * @returns {string[]}
 */
export const joinAdminParts = (parts = []) => {
  const kept = []
  parts.forEach((part) => {
    const text = String(part || '').trim()
    if (!text) return
    const last = kept[kept.length - 1]
    if (last && isSameAdminName(last, text)) return
    kept.push(text)
  })
  return kept
}

/**
 * 区县名 → 界面上的「附近」文案。
 *
 * 带上 optional 的市名：`nearbyLabel('黄岩', '台州市')` → 「台州市 黄岩附近」。
 * 没填高德 key 时地址只能到区县，单独一个「黄岩附近」既单薄又难分辨
 *（同名区县不少），把坐标反查到的市名一起写上更像一条地址。
 * 直辖市 / 市区同名时 joinAdminParts 会把重复的那一段去掉，不会出现「北京市 北京附近」。
 *
 * 名字为空时返回 ''，调用方整块隐藏即可。
 * @param {string} name 区县名
 * @param {string} [city] 上级市名（可选；老调用方不传时行为不变）
 */
export const nearbyLabel = (name, city) => {
  const text = String(name || '').trim()
  if (!text) return ''
  const kept = joinAdminParts([city, text])
  return `${kept.join(' ')}附近`
}

/**
 * 卡片 / 「最近」共用的地址短文案：
 *   有路名 → 「黄岩区 中学路」
 *   没路名 → 「台州市 黄岩区附近」（和风只到区县，把市名一起带上）
 * 没拿到区县名时返回 ''，调用方自己兜底（坐标 / 已选城市的完整写法）。
 * @param {{district?:string, city?:string, road?:string}} [place]
 */
export const pointAddressLabel = (place = {}) => {
  const district = String(place.district || '').trim()
  const road = String(place.road || '').trim()
  if (road) return `${district} ${road}`.trim()
  return nearbyLabel(district, place.city)
}

/* ---------------- 请求与缓存 ---------------- */

const cache = new Map()

const cacheGet = (key) => {
  if (!cache.has(key)) return null
  // 命中后挪到队尾，让 Map 的插入顺序当 LRU 用
  const value = cache.get(key)
  cache.delete(key)
  cache.set(key, value)
  return value
}

const cacheSet = (key, value) => {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, value)
}

/** 清空缓存（调试 / 换 key 后用；地理数据本身与凭据无关，正常不需要清） */
export const clearPlaceLookupCache = () => cache.clear()

/**
 * 响应 → 统一结构。
 * 保留 raw（原始 city 对象）给 store 的 choosePoint 复用：它需要 id / tz / lat / lon
 * 去查天气，没必要为了拿这几个字段再解析一遍。
 */
const normalize = (raw, queryLat, queryLon) => {
  const lat = Number(raw?.lat)
  const lon = Number(raw?.lon)
  return {
    raw,
    id: String(raw?.id || ''),
    /** 区县级地名（「黄岩」「东城」），不带后缀 */
    name: String(raw?.name || '').trim(),
    /** 上级行政区：市 */
    adm2: String(raw?.adm2 || '').trim(),
    /** 一级行政区：省 / 直辖市 / 自治区 */
    adm1: String(raw?.adm1 || '').trim(),
    country: String(raw?.country || '').trim(),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    /** 查询点与返回地名中心的距离（km）；返回体缺经纬度时为 null */
    distanceKm: Number.isFinite(lat) && Number.isFinite(lon)
      ? distanceKm(queryLat, queryLon, lat, lon)
      : null,
  }
}

const isAbort = (error, signal) =>
  !!signal?.aborted ||
  error?.code === 'ABORTED' ||
  error?.cause?.code === 'ERR_CANCELED' ||
  error?.cause?.name === 'CanceledError'

/**
 * 按坐标反查最近的区县。
 *
 * @param {number} lng 经度（和风的坐标系：大陆 GCJ-02，境外 WGS-84）
 * @param {number} lat 纬度
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] 取消信号（地图上快速连点时丢弃旧请求）
 * @param {number} [options.timeout] 单次请求超时（毫秒），默认走 httpClient 的 5 秒
 * @param {boolean} [options.force=false] 跳过缓存，强制重新请求
 * @returns {Promise<{raw:object, id:string, name:string, adm1:string, adm2:string,
 *   country:string, lat:number|null, lon:number|null, distanceKm:number|null}>}
 * @throws {Error} error.code 见 fail() 的说明
 */
export const lookupPlaceByCoord = async (lng, lat, options = {}) => {
  const { signal, timeout, force = false } = options
  const x = Number(lng)
  const y = Number(lat)

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw fail('INVALID_COORD', '经纬度不是有效数字')
  }
  if (x < -180 || x > 180 || y < -90 || y > 90) {
    throw fail('INVALID_COORD', '经纬度超出有效范围')
  }
  if (!isPlaceLookupAvailable()) {
    throw fail('NO_KEY', '没有配置和风天气域名 / 密钥，无法反查区县')
  }

  // 和风只接受两位小数，且是「经度,纬度」；写反了会得到一个完全不同的地点
  const query = `${x.toFixed(2)},${y.toFixed(2)}`
  if (!force) {
    const hit = cacheGet(query)
    if (hit) return hit
  }

  let res
  try {
    // 注意这里传的是拼好的字符串，不是两个参数：和风的 location 就是 "lon,lat"
    res = await lookupCity(query, { signal, timeout })
  } catch (error) {
    if (isAbort(error, signal)) throw fail('ABORTED', '区县反查请求已取消', error)
    // 400 no-such-location：海上 / 无人区，和风的城市库里没有附近的城市。
    // 这不是错误配置，地图上把「附近」UI 收起来就行
    if (error?.type === 'no-such-location') {
      throw fail('NO_RESULT', '这个位置附近没有可用的区县信息', error)
    }
    throw error
  }

  const city = res?.location?.[0]
  if (!city?.id) throw fail('NO_RESULT', '这个位置附近没有可用的区县信息')

  const place = normalize(city, y, x)
  if (!place.name) throw fail('NO_RESULT', '这个位置附近没有可用的区县信息')

  cacheSet(query, place)
  return place
}

export default lookupPlaceByCoord
