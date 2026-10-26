/**
 * 高德逆地理编码：坐标 → 最近的道路名
 *
 * 只做一件事：给「地图选点」一个人类可读的路名（如「锦川路」），
 * 让用户确认 pin 到底落在哪条路上；省 / 市 / 区 / 街道也一并返回，
 * 地址页拿它们拼「浙江省-台州市-黄岩区-新前街道-中学路」这样的详细地址。
 * 不参与天气查询。
 *
 * 三个容易踩的坑，都在这里一次性封住：
 *
 * 1. 参数顺序：高德 `location` 是「经度,纬度」。传反了**不报错**，
 *    只会返回 status=1 + formatted_address=[]（空数组），看起来像「这个地方没有地址」。
 * 2. 坐标系：高德要 GCJ-02。本项目的落库 / 查询坐标就是和风的坐标系
 *    （大陆 GCJ-02，境外 WGS-84），默认按 GCJ-02 收参、不再换算；
 *    手里是 GPS / WGS-84 坐标时传 { crs: 'WGS84' }，这里补上大陆的偏移。
 * 3. 空结果：`formatted_address` 无结果时是数组 [] 而不是空字符串；
 *    `status` / `infocode` 也都是字符串（'1' / '10000'），不能和数字比。
 *
 * 配额：Web服务 key 有 QPS 限制（个人档 3 次/秒），所以这里带了结果缓存，
 * 同一个点（1e-5 度 ≈ 1 m）反复选不会重复消耗配额。
 */
import { wgs84ToGcj02 } from './mapTiles'
import { AmapKey } from '@/api/credentials'

const ENDPOINT = 'https://restapi.amap.com/v3/geocode/regeo'
// 逆地理编码正常是几十毫秒的接口；超过这个时间基本是网络挂了，不必让 UI 干等
const TIMEOUT = 6000
// 缓存上限：一次选点会话里点的位置不会太多，留个上限防止长会话无限增长
const CACHE_LIMIT = 200

const readAmapKey = () => String(AmapKey.value || '').trim()

/**
 * 用户是否填了高德 key。
 * key 由用户自己在「壁纸属性」面板填写（见 api/credentials.js），不随构建产物分发：
 * Web服务 key 没有域名白名单，打进包里等于公开，谁都能拆包拿去刷额度。
 * 没填时调用方应该整块隐藏路名 UI，而不是发一个必然失败的请求。
 */
export const isReverseGeocodeEnabled = () => !!readAmapKey()

/**
 * 失败时的错误对象。
 * code 取值：NO_KEY / INVALID_COORD / TIMEOUT / ABORTED / NETWORK /
 *           HTTP_<状态码> / <高德 infocode 如 10001、10003、10021>
 */
const fail = (code, message, cause) => {
  const error = new Error(message)
  error.name = 'ReverseGeocodeError'
  error.code = code
  if (cause) error.cause = cause
  return error
}

/**
 * 高德把「空」统一塞成空数组（formatted_address、street、name 都可能）。
 * 统一收敛成字符串，省得每个调用点都判断一遍。
 */
const asText = (value) => {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string').join('')
  return ''
}

/**
 * 从响应里挑出「最近的那条路」。
 *
 * 优先级：
 *   1. roads[0]（extensions=all 才有）—— 真正距离最近的命名道路；
 *   2. streetNumber.street —— 门牌所在道路，点正好压在门牌上时更准；
 *   3. businessAreas[0].name —— 商圈名，通常在市区比「XX路」更好认；
 *   4. township —— 乡镇/街道名，最兜底，至少有个人类可读的地名。
 */
const pickRoad = (regeo, component) => {
  const roads = Array.isArray(regeo?.roads) ? regeo.roads : []
  // 高德本来就按距离升序给，但不保证，这里自己取最小值，别依赖返回顺序
  const nearest = roads.reduce((best, road) => {
    const name = asText(road?.name)
    if (!name) return best
    const distance = Number(road?.distance)
    if (!best) return { name, distance: Number.isFinite(distance) ? distance : Infinity }
    return Number.isFinite(distance) && distance < best.distance
      ? { name, distance }
      : best
  }, null)

  return {
    name: nearest?.name ||
      asText(component?.streetNumber?.street) ||
      asText(component?.businessAreas?.[0]?.name) ||
      asText(component?.township) ||
      '',
    distance: Number.isFinite(nearest?.distance) ? nearest.distance : null,
  }
}

const normalize = (regeo) => {
  const component = regeo?.addressComponent || {}
  const road = pickRoad(regeo, component)
  return {
    /** 最近道路名，查不到是 '' */
    road: road.name,
    /** 到最近道路中心线的距离（米），仅 extensions=all 且命中时才有 */
    roadDistance: road.distance,
    address: asText(regeo?.formatted_address),
    province: asText(component.province),
    city: asText(component.city),
    district: asText(component.district),
    township: asText(component.township),
    adcode: asText(component.adcode),
  }
}

// 结果缓存：key 用转换后的 GCJ-02 坐标（它才决定结果），1e-5 度约 1 m
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

/** 清空缓存（调试 / 换 key 后用） */
export const clearReverseGeocodeCache = () => cache.clear()

const buildUrl = (lng, lat) => {
  const params = new URLSearchParams({
    output: 'json',
    // 经度在前！写反了不报错，只会拿到空地址
    location: `${lng.toFixed(6)},${lat.toFixed(6)}`,
    // 只有 all 才带 roads[]，也就是「最近的那条路」
    extensions: 'all',
    radius: '1000',
    key: readAmapKey(),
  })
  return `${ENDPOINT}?${params.toString()}`
}

const request = async (lng, lat, outerSignal, timeout = TIMEOUT) => {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const onOuterAbort = () => controller?.abort()
  let timedOut = false
  let timer = 0

  if (controller) {
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeout)
    if (outerSignal) {
      if (outerSignal.aborted) controller.abort()
      else outerSignal.addEventListener('abort', onOuterAbort, { once: true })
    }
  }

  try {
    const response = await fetch(buildUrl(lng, lat), {
      signal: controller?.signal,
      // 高德不需要凭据；显式 omit，避免给跨域请求多带一份 cookie
      credentials: 'omit',
    })
    if (!response.ok) {
      throw fail(`HTTP_${response.status}`, `逆地理编码请求失败（HTTP ${response.status}）`)
    }
    const data = await response.json()
    // status 是字符串 '1'，不是数字 1
    if (String(data?.status) !== '1') {
      const code = asText(data?.infocode) || 'UNKNOWN'
      const info = asText(data?.info) || '高德返回了未知错误'
      throw fail(code, `逆地理编码失败：${info}（${code}）`)
    }
    return normalize(data?.regeocode)
  } catch (error) {
    if (timedOut) throw fail('TIMEOUT', '逆地理编码请求超时', error)
    if (error?.name === 'ReverseGeocodeError') throw error
    if (controller?.signal.aborted) throw fail('ABORTED', '逆地理编码请求已取消', error)
    throw fail('NETWORK', '逆地理编码请求失败（网络错误）', error)
  } finally {
    clearTimeout(timer)
    outerSignal?.removeEventListener?.('abort', onOuterAbort)
  }
}

/**
 * 逆地理编码：坐标 → 最近道路名 + 行政区划。
 *
 * @param {number} lng 经度
 * @param {number} lat 纬度
 * @param {object} [options]
 * @param {'GCJ02'|'WGS84'} [options.crs='GCJ02'] 入参坐标系。默认就是本项目落库坐标系
 *   （和风的：大陆 GCJ-02、境外 WGS-84），高德直接可用；传 'WGS84' 时先补偏移
 * @param {AbortSignal} [options.signal] 取消信号
 * @param {boolean} [options.force=false] 跳过缓存，强制重新请求
 * @param {number} [options.timeout] 单次请求超时（毫秒），默认 6 秒。
 *   「确认选点时顺带补查路名」这种会卡住按钮的场景可以调短
 * @returns {Promise<{road:string, roadDistance:number|null, address:string,
 *   province:string, city:string, district:string, township:string, adcode:string}>}
 * @throws {Error} error.code 见 fail() 的说明
 */
export const reverseGeocode = async (lng, lat, options = {}) => {
  const { crs = 'GCJ02', signal, force = false, timeout = TIMEOUT } = options

  if (!readAmapKey()) {
    throw fail('NO_KEY', '用户没填高德 key（壁纸属性 → 高德密钥），无法查询道路名')
  }

  const x = Number(lng)
  const y = Number(lat)
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw fail('INVALID_COORD', '经纬度不是有效数字')
  }
  if (x < -180 || x > 180 || y < -90 || y > 90) {
    throw fail('INVALID_COORD', '经纬度超出有效范围')
  }

  // 高德只认 GCJ-02；默认的落库坐标已经是这个坐标系。传 WGS-84 时补偏移，
  // 境外坐标转换函数原样返回（GCJ-02 只在大陆偏移）
  const [gLng, gLat] = crs === 'GCJ02' ? [x, y] : wgs84ToGcj02(x, y)
  const cacheKey = `${gLng.toFixed(5)},${gLat.toFixed(5)}`

  if (!force) {
    const hit = cacheGet(cacheKey)
    if (hit) return hit
  }

  const info = await request(gLng, gLat, signal, timeout)
  cacheSet(cacheKey, info)
  return info
}

export default reverseGeocode
