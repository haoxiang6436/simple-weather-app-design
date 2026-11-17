/**
 * 请求量计数 —— 本机口径的「这个壁纸花掉了多少次请求」
 *
 * 为什么自己数，而不是调和风的控制台 API：
 *   1. 控制台 API（GET /metrics/v1/stats）**只有最近 24 小时**，固定返回 24 个小时桶，
 *      而计费周期是「一个自然月」，两套口径对不上，「月初到月底」这个数它根本给不出来；
 *   2. 它要 Ed25519 私钥签的 JWT，私钥不能进前端包（进了就等于公开）；
 *   3. 控制台 API 自己也计入请求量（定价页把它和天气服务列在同一档），
 *      做个统计页去轮询它，等于为了看用量而消耗用量。
 *   官方 FAQ「如何查询统计」也是这个意思：控制台给 24 小时 / 30 天 / 6 个月三档，
 *   需要更细的统计请「在产品中进行自行统计」。
 *
 * 计数口径对齐官方「什么是一次请求」：
 *   一次 HTTP 请求 = 一次请求，但「状态码非 2xx 不计算请求次数」。
 *   所以四个桶分开记，别混成一个数：
 *     ok   —— 2xx 且业务码成功：计入额度，这是页面上那个大数字
 *     soft —— HTTP 200 但业务码失败：只有还在用 body code 的 v7 接口（/v7/indices）会这样，
 *             官方没说这种算不算一次请求，单独挂着，不并进 ok
 *     err  —— 非 2xx（400/401/403/404/429/500…）：按官方规则不计费
 *     net  —— 没有响应（超时 / 断网）：不计费
 *   「被取消的请求」（地图选点每敲一个字就取消上一个）根本没到服务端，直接不记 ——
 *   否则手一抖就是几十条假的网络错误。
 *
 * 只数「发给和风天气」的请求。
 * 项目里另外还有三条外部网络是**不消耗和风额度**的，一概不算：
 *   - 高德逆地理编码（features/weather/reverseGeocode.js，自带 fetch，restapi.amap.com）
 *   - 地图底图瓦片（features/weather/mapTiles.js，是 <img>，高德网页版的瓦片端点）
 *   - 一言（features/weather/WeatherMain.vue，自带 fetch，v1.hitokoto.cn）
 * 前两条根本不经过 httpClient，第三条也不经过；为了不让「以后谁顺手用同一个实例」混进来，
 * 计数事件必须带 service: 'qweather' 才会被接收（见 recordRequest）。这道闸是代码里的边界，
 * 不是注释里的约定。
 *
 * 分桶：小时桶留 48 个、日桶留 40 天、月桶留 7 个月。日桶里另外带一层
 * apis / hosts（只数 ok），用来出「各接口占比」「各域名占比」，月合计由日桶加起来。
 *
 * 落盘：壁纸每分钟都在请求，不能来一次就 JSON.stringify 一遍整个对象。
 * 所以内存里的 state 是普通对象（不进响应式），只有落盘时序列化，节流 2 秒，
 * 并在页面隐藏 / 卸载时强制刷一次 —— 壁纸被引擎杀掉时最多丢最后两秒的计数。
 */

import { ref } from 'vue'

/** localStorage 键：和其它 Wallpaper* 键同一套命名 */
const STORAGE_KEY = 'WallpaperRequestStats'
/** 数据结构版本：对不上就重来（计数不是必须保留的历史，宁可清零也别读出脏数据） */
const SCHEMA = 1

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** 保留窗口 */
const KEEP_HOURS = 48
const KEEP_DAYS = 40
const KEEP_MONTHS = 7

/** 落盘节流（毫秒） */
const FLUSH_DELAY = 2000

/** 和风天气免费额度：每个自然月 5 万次（阶梯价第一档 0 元），页面拿它当分母 */
export const FREE_QUOTA_MONTH = 50000

/**
 * 计数服务的标记值。目前只有和风天气一家 —— 额度是「和风账号的额度」，
 * 高德的请求打在这张表里就是假账（见文件头）。
 */
export const STATS_SERVICE = 'qweather'

/** 接口代号 → 中文名。代号由 api/weather.js 从路径推出来（见那里的 API_BY_PATH） */
export const REQUEST_API_LABELS = Object.freeze({
  current: '实时天气',
  daily: '每日预报',
  alert: '天气预警',
  indices: '生活指数',
  air: '空气质量',
  minutely: '分钟降水',
  geo: '城市查询',
  other: '其他',
})

/* ------------------------------------------------------------------ *
 * 时间键：一律用本机时区
 *
 * 账单是「自然月」，但和风没公开月度接口，月边界只能自己切。
 * 这个壁纸只面向国内用（城市数据、高德底图都是国内的），本机时间就是北京时间，
 * 所以本机切出来的月边界和官方账单的月边界是同一天零点 —— 不用再做时区换算。
 * 页面上的说明也照这个写：两边每个月 1 日一起归零。
 * 键都是零填充、可以直接比大小。
 * ------------------------------------------------------------------ */

const pad2 = (value) => String(value).padStart(2, '0')

const dayKey = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
const hourKey = (date) => `${dayKey(date)}T${pad2(date.getHours())}`
const monthKey = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */

const emptyBucket = () => ({ ok: 0, soft: 0, err: 0, net: 0 })
const emptyDay = () => ({ ...emptyBucket(), apis: {}, hosts: {} })
const emptyState = () => ({ v: SCHEMA, firstAt: 0, lastAt: 0, hours: {}, days: {}, months: {} })

const toCount = (value) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}

const readBucket = (raw) => ({
  ok: toCount(raw?.ok),
  soft: toCount(raw?.soft),
  err: toCount(raw?.err),
  net: toCount(raw?.net),
})

const readCounts = (raw) => {
  const counts = {}
  if (!raw || typeof raw !== 'object') return counts
  Object.keys(raw).forEach((key) => {
    const value = toCount(raw[key])
    if (value) counts[key] = value
  })
  return counts
}

const readBucketMap = (raw) => {
  const map = {}
  if (!raw || typeof raw !== 'object') return map
  Object.keys(raw).forEach((key) => {
    map[key] = readBucket(raw[key])
  })
  return map
}

const readDayMap = (raw) => {
  const map = {}
  if (!raw || typeof raw !== 'object') return map
  Object.keys(raw).forEach((key) => {
    map[key] = {
      ...readBucket(raw[key]),
      apis: readCounts(raw[key]?.apis),
      hosts: readCounts(raw[key]?.hosts),
    }
  })
  return map
}

const loadState = () => {
  let raw = ''
  try {
    raw = typeof localStorage === 'undefined' ? '' : String(localStorage.getItem(STORAGE_KEY) || '')
  } catch (error) {
    return emptyState()
  }
  if (!raw) return emptyState()
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return emptyState()
  }
  if (!parsed || parsed.v !== SCHEMA) return emptyState()
  return {
    v: SCHEMA,
    firstAt: toCount(parsed.firstAt),
    lastAt: toCount(parsed.lastAt),
    hours: readBucketMap(parsed.hours),
    days: readDayMap(parsed.days),
    months: readBucketMap(parsed.months),
  }
}

let state = loadState()
/** 有未落盘的改动 */
let dirty = false
let flushTimer = null
/** 写失败（隐私模式 / 配额满）只警告一次，别每分钟刷一屏 */
let writeWarned = false

/**
 * 计数版本号：每记一次 +1。
 * 页面里用它当 computed 的依赖来重算，不必把整个 state 做成响应式对象 ——
 * 那意味着每次请求都要走一遍 Proxy 的 get/set，而壁纸每分钟都在请求。
 */
export const RequestStatsVersion = ref(0)

const trim = () => {
  const now = Date.now()
  const hourFloor = hourKey(new Date(now - (KEEP_HOURS - 1) * HOUR_MS))
  const dayFloor = dayKey(new Date(now - (KEEP_DAYS - 1) * DAY_MS))
  const monthFloor = monthKey(new Date(now - KEEP_MONTHS * 31 * DAY_MS))
  Object.keys(state.hours).forEach((key) => {
    if (key < hourFloor) delete state.hours[key]
  })
  Object.keys(state.days).forEach((key) => {
    if (key < dayFloor) delete state.days[key]
  })
  Object.keys(state.months).forEach((key) => {
    if (key < monthFloor) delete state.months[key]
  })
}

const flush = () => {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (!dirty) return
  dirty = false
  trim()
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    }
  } catch (error) {
    if (!writeWarned) {
      writeWarned = true
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[请求统计] 写入 localStorage 失败，计数只在本次运行内有效', error)
      }
    }
  }
}

const scheduleFlush = () => {
  if (flushTimer) return
  flushTimer = setTimeout(flush, FLUSH_DELAY)
}

/* 页面随时可能被引擎杀掉 / 刷新：隐藏和卸载时各补一刀，最多丢 FLUSH_DELAY 的计数 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush()
  })
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush)
}

/* ------------------------------------------------------------------ *
 * 记账
 * ------------------------------------------------------------------ */

const OUTCOMES = ['ok', 'soft', 'err', 'net']
const bump = (bucket, field) => {
  bucket[field] = (bucket[field] || 0) + 1
}

/**
 * 记一次请求结果。由 httpClient 的响应拦截器调用（见 ./httpClient.js）。
 *
 * @param {Object} event
 * @param {string} event.service   服务标识，必须是 'qweather'，否则整条丢弃（见 STATS_SERVICE）
 * @param {string} [event.api]     接口代号（current / daily / alert / indices / air / minutely / geo）
 * @param {string} [event.host]     发往哪个 API Host（用户填了多组域名时，额度其实分在各自账号上）
 * @param {'ok'|'soft'|'err'|'net'} [event.outcome] 结果分类，未知值按 err 处理（不虚增额度）
 * @param {number} [event.now]      时间戳，默认当前时间（测试时可注入）
 * @returns {boolean} 是否真的记了一笔（被服务标记挡掉时返回 false，方便调用方 / 测试判断）
 */
export const recordRequest = ({
  service = '',
  api = 'other',
  host = '',
  outcome = 'ok',
  now = Date.now(),
} = {}) => {
  // 只收和风天气的请求：高德 / 一言这类不计入额度的流量，即使误传了 meta 也进不来。
  // 静默丢弃而不是抛错 —— 计数是旁路，不该因为它失败把正常的请求流程搅黄。
  if (service !== STATS_SERVICE) return false

  const field = OUTCOMES.includes(outcome) ? outcome : 'err'
  const at = new Date(now)

  const keyHour = hourKey(at)
  const keyDay = dayKey(at)
  const keyMonth = monthKey(at)

  if (!state.hours[keyHour]) state.hours[keyHour] = emptyBucket()
  if (!state.days[keyDay]) state.days[keyDay] = emptyDay()
  if (!state.months[keyMonth]) state.months[keyMonth] = emptyBucket()

  bump(state.hours[keyHour], field)
  bump(state.months[keyMonth], field)

  const day = state.days[keyDay]
  bump(day, field)

  // 接口 / 域名两层只数「计入额度」的那些：这是配额花在哪儿，失败的请求不占额度
  if (field === 'ok') {
    if (api) day.apis[api] = (day.apis[api] || 0) + 1
    if (host) day.hosts[host] = (day.hosts[host] || 0) + 1
  }

  if (!state.firstAt) state.firstAt = now
  state.lastAt = now
  dirty = true
  RequestStatsVersion.value += 1
  scheduleFlush()
  return true
}

/* ------------------------------------------------------------------ *
 * 读取（给设置页的「统计」分区用）
 * ------------------------------------------------------------------ */

const sumBucket = (bucket) => {
  const total = bucket.ok + bucket.soft + bucket.err + bucket.net
  return { ...bucket, total }
}

const shareList = (counts) => {
  const rows = Object.keys(counts).map((key) => ({ key, value: counts[key] }))
  rows.sort((a, b) => b.value - a.value || (a.key < b.key ? -1 : 1))
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  return rows.map((row) => ({ ...row, share: total ? row.value / total : 0 }))
}

/**
 * 读一份快照。值都是纯数据，不含格式化，格式化交给页面。
 *
 * @param {Object} [options]
 * @param {number} [options.now] 当前时间，默认 Date.now()（测试时可注入）
 * @param {number} [options.hourCount] 小时曲线取多少个桶，默认 24
 */
export const readRequestStats = ({ now = Date.now(), hourCount = 24 } = {}) => {
  const at = new Date(now)
  const keyMonth = monthKey(at)
  const keyToday = dayKey(at)

  // 本月合计以月桶为准；各接口 / 各域名从本月日桶加起来（月桶不存这两层，省空间）
  const month = sumBucket(state.months[keyMonth] || emptyBucket())
  const today = sumBucket(state.days[keyToday] || emptyBucket())

  const apis = {}
  const hosts = {}
  Object.keys(state.days).forEach((key) => {
    if (!key.startsWith(keyMonth)) return
    const day = state.days[key]
    Object.keys(day.apis).forEach((api) => {
      apis[api] = (apis[api] || 0) + day.apis[api]
    })
    Object.keys(day.hosts).forEach((host) => {
      hosts[host] = (hosts[host] || 0) + day.hosts[host]
    })
  })

  // 小时曲线：补满空洞（壁纸被暂停 / 电脑关机的那些小时），否则柱子会错位
  const hours = []
  for (let offset = hourCount - 1; offset >= 0; offset -= 1) {
    const slot = new Date(now - offset * HOUR_MS)
    const key = hourKey(slot)
    const bucket = sumBucket(state.hours[key] || emptyBucket())
    hours.push({
      key,
      hour: slot.getHours(),
      label: `${pad2(slot.getHours())}:00`,
      ok: bucket.ok,
      total: bucket.total,
    })
  }

  return {
    hasData: state.firstAt > 0,
    firstAt: state.firstAt,
    lastAt: state.lastAt,
    monthKey: keyMonth,
    month,
    today,
    // 本页的三个分母：免费额度、本月「可能计费」的上限（ok + soft）
    quota: FREE_QUOTA_MONTH,
    hours,
    apis: shareList(apis),
    hosts: shareList(hosts),
  }
}

/**
 * 清空计数（调试用：浏览器悬浮块 / 单元测试里调，页面上不放入口 ——
 * 「本月用了多少」这种数一旦能一键清零，用户看到的就只是一份不完整的账单）
 */
export const resetRequestStats = () => {
  state = emptyState()
  dirty = true
  flush()
  RequestStatsVersion.value += 1
}
