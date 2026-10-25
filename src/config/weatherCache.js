/**
 * 和风天气数据缓存时效 —— 全项目唯一的缓存时长配置
 *
 * 依据官方《缓存你的数据》最佳实践：
 *   https://dev.qweather.com/docs/best-practices/cache/
 * 对照日期：2026-10-25
 *
 * 官方给出的「推荐缓存时间」是一个区间（例如实时天气 10-30 分钟），本项目在区间内
 * 取偏保守的值，具体取值理由写在各数据类型的注释里。官方强调的三条原则也在这里落地：
 *
 * 1. 合理性 —— 缓存不能太长，否则用户上午看到的是清晨的气温。所以 .env 里把时长
 *    调到超出官方上限时，控制台会打一条警告（只提醒、不拦截，方便本地调试）。
 * 2. 弹性 —— 不能所有数据共用一条时长，且必须处理跨小时 / 跨天 / 夏令时 / 时区。
 *    → 每类数据各有时长（WEATHER_CACHE_SPECS）；逐天预报、生活指数、实时天气
 *      还会在「查询地点的本地零点」强制失效（crossLocalDay + isCacheFresh）：
 *      23:59 拉到的 7 天预报，00:00 之后第一条就变成「昨天」了，只靠 2 小时 TTL
 *      兜不住（官方原文专门举了这个例子）。本地日期用 Intl 按 IANA 时区计算，
 *      夏令时开始 / 结束当天也能算对。
 * 3. 可清除 —— 官方要求「出现错误时可以立即清除缓存」。本项目的开关是
 *    useWeatherStore.js 里的 CACHE_VERSION +1（它参与 isFresh 判定，改完所有接口
 *    缓存立刻整体作废），不需要发新版本才能清。
 *
 * 官方完整推荐表（原文抓取，供以后扩接口时查；本项目只用到其中 5 类）：
 *
 *   数据类型            推荐缓存时间        官方更新频率       本项目
 *   实时天气            10-30 分钟          5-10 分钟          realtime
 *   逐小时天气预报      30-60 分钟          60 分钟            ——（未使用）
 *   逐天天气预报        1-6 小时            60 分钟            fourDays
 *   天气预警            5-20 分钟           3 分钟             warning
 *   天气指数            6-12 小时           60 分钟            indices
 *   分钟降水            5-10 分钟           5 分钟             minutely
 *   实时空气质量        30-60 分钟          30-60 分钟         ——（未使用）
 *   空气质量逐天预报    8-12 小时           1-6 小时           ——（未使用）
 *   潮汐                8-12 小时           8 小时             ——（未使用）
 *   台风                活跃 20 / 非活跃 60 分钟  10-60 分钟   ——（未使用）
 *   太阳辐照            6 小时              3-6 小时           ——（未使用）
 *
 * 特别注意：GeoAPI（城市搜索）的数据官方明确禁止缓存、提取和批量存储，
 * 违反会涉及版权问题。本项目只在选地址时实时查一次、不落盘，所以这里没有 geo 项，
 * 以后也不要把 lookupCity 的结果塞进这份缓存里。
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

export const QWEATHER_CACHE_DOC_URL = 'https://dev.qweather.com/docs/best-practices/cache/'

/**
 * 每类数据的缓存配置。新增接口时在这里加一项即可，store 里只认 kind 字符串。
 *
 * @typedef {Object} WeatherCacheSpec
 * @property {string} label          中文名（只用于日志和警告）
 * @property {number} ttl            默认缓存时长（毫秒），已落在官方推荐区间内
 * @property {[number, number]} recommended 官方推荐区间 [下限, 上限]（毫秒）
 * @property {string} updateFrequency 和风天气的更新频率（官方表格原值）
 * @property {string} envKey         .env 里的覆盖变量名
 * @property {boolean} crossLocalDay 是否在查询地点的本地零点强制失效
 */
export const WEATHER_CACHE_SPECS = Object.freeze({
  // 官方 10-30 分钟，更新频率 5-10 分钟。
  // 取区间下限：官方提示「缓存与原数据最多相差 2 倍」，取 10 分钟时最坏间隔
  // 15-20 分钟，正好卡在这条线内（旧版 .env 是 15 分钟，最坏会到 25 分钟）。
  // 跨零点：卡片顶部的「星期 + 日期」是随实时天气一起写进 store 的
  //（见 loadRealTimeWeather），不失效的话零点之后最多还会挂着昨天的日期。
  realtime: Object.freeze({
    label: '实时天气',
    ttl: 10 * MINUTE,
    recommended: Object.freeze([10 * MINUTE, 30 * MINUTE]),
    updateFrequency: '5-10 分钟',
    envKey: 'VUE_APP_WEATHER_UPDATE_REALTIME',
    crossLocalDay: true,
  }),

  // 官方 1-6 小时，更新频率 60 分钟。取 2 小时（区间中段）：
  // 逐天预报本身一天才变一次，但官方特别点名「跨天」场景，所以下面同时开了
  // crossLocalDay —— TTL 到没到都要保证第二天看到的是新的一天。
  fourDays: Object.freeze({
    label: '逐天预报',
    ttl: 2 * HOUR,
    recommended: Object.freeze([1 * HOUR, 6 * HOUR]),
    updateFrequency: '60 分钟',
    envKey: 'VUE_APP_WEATHER_UPDATE_FOURDAYS',
    crossLocalDay: true,
  }),

  // 官方 5-20 分钟，更新频率 3 分钟。预警是安全相关信息，在区间里取偏短的
  // 10 分钟：壁纸每分钟轮询一次，实际大约 11 分钟就能看到新预警（旧版 20 分钟）。
  warning: Object.freeze({
    label: '天气预警',
    ttl: 10 * MINUTE,
    recommended: Object.freeze([5 * MINUTE, 20 * MINUTE]),
    updateFrequency: '3 分钟',
    envKey: 'VUE_APP_WEATHER_UPDATE_WARNING',
    crossLocalDay: false,
  }),

  // 官方 6-12 小时，更新频率 60 分钟。旧版写的是 3 小时 —— 比官方推荐还「新」，
  // 但生活指数按天发布，3 小时只是白白多花额度。取区间下限 6 小时。
  // 跨零点：接口返回的是「当天」的指数，不失效的话 00:00 之后最多 6 小时
  // 还在展示昨天的指数。
  indices: Object.freeze({
    label: '生活指数',
    ttl: 6 * HOUR,
    recommended: Object.freeze([6 * HOUR, 12 * HOUR]),
    updateFrequency: '60 分钟',
    envKey: 'VUE_APP_WEATHER_UPDATE_INDICES',
    crossLocalDay: true,
  }),

  // 官方 5-10 分钟，更新频率 5 分钟。取 5 分钟与数据更新频率对齐，
  // 最坏间隔 10 分钟（= 官方的 2 倍上限）。
  minutely: Object.freeze({
    label: '分钟级降水',
    ttl: 5 * MINUTE,
    recommended: Object.freeze([5 * MINUTE, 10 * MINUTE]),
    updateFrequency: '5 分钟',
    envKey: 'VUE_APP_WEATHER_UPDATE_MINUTELY',
    crossLocalDay: false,
  }),
})

/* ------------------------------------------------------------------ *
 * .env 覆盖
 * ------------------------------------------------------------------ */

/**
 * 打包时 vue-cli 会把 process.env 整体替换成对象字面量
 * （见 @vue/cli-service/lib/util/resolveClientEnv.js），所以这里用变量下标访问是安全的。
 *
 * 注意不要写成 `typeof process !== 'undefined'` 守卫：浏览器里没有 process 全局，
 * 这个守卫恒为 false，会把整条 .env 覆盖机制短路掉，用户改了 .env 也不生效。
 * 用 try/catch 是为了兼容没经过打包的环境（例如直接 Node 里 import 这个模块）。
 */
let env = {}
try {
  env = process.env || {}
} catch (error) {
  // 没有 process 全局的运行时：全部使用下面代码里的默认值
}

const formatMs = (ms) => {
  if (ms >= HOUR && ms % HOUR === 0) return `${ms / HOUR} 小时`
  if (ms >= MINUTE && ms % MINUTE === 0) return `${ms / MINUTE} 分钟`
  return `${ms} 毫秒`
}

const warn = (message) => {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(`[天气缓存] ${message}`)
  }
}

/**
 * 读 .env 覆盖值：
 * - 没填 / 空串 → 用代码里的默认值
 * - 非法值（NaN、0、负数）→ 打警告后回退默认值
 * - 合法但超出官方推荐区间 → 照用（本地调试可能故意调小），只打警告
 */
const resolveTtl = (spec) => {
  const raw = env[spec.envKey]
  if (raw === undefined || raw === null || String(raw).trim() === '') return spec.ttl
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    warn(`${spec.label}的 ${spec.envKey}=${JSON.stringify(raw)} 不是有效的正数，改用默认 ${formatMs(spec.ttl)}`)
    return spec.ttl
  }
  const [min, max] = spec.recommended
  if (value < min || value > max) {
    warn(
      `${spec.label}的 ${spec.envKey}=${value}ms（${formatMs(value)}）超出和风天气官方推荐区间 ` +
      `${formatMs(min)}-${formatMs(max)}，仍按 .env 的值使用`
    )
  }
  return Math.round(value)
}

/**
 * 解析后的缓存时长表（毫秒）。UI / store 只读这里，不再各写一份。
 * @type {Readonly<Record<string, number>>}
 */
export const WEATHER_CACHE_MS = Object.freeze(
  Object.keys(WEATHER_CACHE_SPECS).reduce((map, kind) => {
    map[kind] = resolveTtl(WEATHER_CACHE_SPECS[kind])
    return map
  }, {})
)

/**
 * 取某类数据的缓存时长；未知类型按 0 处理（= 永远过期、每次都重新请求），
 * 宁可多花一次额度，也不要因为拼错 kind 读到一份无限期的缓存。
 * @param {string} kind
 * @returns {number} 毫秒
 */
export const getCacheTtl = (kind) => {
  const ttl = WEATHER_CACHE_MS[kind]
  if (!ttl) {
    warn(`未知的缓存类型「${kind}」，按「立即过期」处理`)
    return 0
  }
  return ttl
}

/* ------------------------------------------------------------------ *
 * 时区 / 跨天
 * ------------------------------------------------------------------ */

/**
 * 某个时间戳在指定 IANA 时区里是哪一天，返回 `YYYY-MM-DD`。
 *
 * 用 formatToParts 而不是直接 format：不同 ICU 版本的同一个 locale
 * 可能给出不同顺序（"2026-10-25" / "10/25/2026"），拆成部件再拼才稳。
 * 时区名不合法（老缓存里可能是空串或写错）时退回浏览器本地时区。
 */
const localDateKey = (timestamp, timeZone) => {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const pick = (type) => (parts.find((part) => part.type === type) || {}).value || ''
    return `${pick('year')}-${pick('month')}-${pick('day')}`
  } catch (error) {
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${date.getFullYear()}-${month}-${day}`
  }
}

/**
 * 缓存是否仍然有效。
 *
 * 判定顺序：
 * 1. force（手动换位置 / 明确要求强制刷新）→ 一律视为过期；
 * 2. 没有时间戳、时间戳非法、或系统时间被往回调过 → 一律视为过期（宁可重拉）；
 * 3. 超过该数据类型的 TTL（官方推荐值 / .env 覆盖）→ 过期；
 * 4. crossLocalDay 的数据类型跨了查询地点的本地零点 → 过期。
 *
 * @param {string} kind WEATHER_CACHE_SPECS 的键
 * @param {number} updatedAt 上次成功获取的时间戳（毫秒）
 * @param {Object} [options]
 * @param {number} [options.now] 当前时间，默认 Date.now()（测试时可注入）
 * @param {boolean} [options.force] 强制视为过期
 * @param {string} [options.timeZone] 查询地点的 IANA 时区（如 'Asia/Shanghai'）
 * @returns {boolean}
 */
export const isCacheFresh = (kind, updatedAt, { now = Date.now(), force = false, timeZone = '' } = {}) => {
  if (force) return false
  const timestamp = Number(updatedAt)
  const current = Number(now)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false
  if (!Number.isFinite(current)) return false
  const age = current - timestamp
  if (age < 0) return false
  const ttl = getCacheTtl(kind)
  if (!ttl || age >= ttl) return false
  const spec = WEATHER_CACHE_SPECS[kind]
  if (spec && spec.crossLocalDay && localDateKey(timestamp, timeZone) !== localDateKey(current, timeZone)) {
    return false
  }
  return true
}
