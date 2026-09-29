/**
 * 用户自带的 和风天气 API 域名 / 密钥
 *
 * 数据来源：
 * - Wallpaper Engine：属性面板里的 textinput，由 features/wallpaper/properties.js 下发；
 * - 普通浏览器（Edge 开发 / 直接打开 dist）：引导面板里的输入框，本地持久化。
 *
 * 两个来源都归一化成 entries：[{ host, key }]。多个域名/密钥用英文逗号分隔、按顺序一一配对，
 * 与旧版 VUE_APP_HOSTS / VUE_APP_KEYS 的规则保持一致，轮询分流逻辑完全复用。
 */
import { computed, ref } from 'vue'
import { useStorage } from '@vueuse/core'
import { isBrowserRuntime } from '@/shared/env'

const DEV_STORAGE_KEY = {
  HOST: 'WallpaperUserApiHost',
  KEY: 'WallpaperUserApiKey',
}
// 壁纸引擎里「上一次成功下发」的域名/密钥。
// 引擎虽然在 config.json 的 wproperties 里存了用户填的值，但它只在页面加载时下发一次；
// 页面重载（换背景会主动 location.reload、部署新版本后引擎也会重载页面）或切换壁纸后
// 偶尔不再补发，只靠内存里的值就会出现「重载之后检测不到域名和密钥」。
// 所以这里和 BackgroundIndex 一样同步落一份缓存当兜底。
const CACHE_STORAGE_KEY = {
  HOST: 'WallpaperUserApiCachedHost',
  KEY: 'WallpaperUserApiCachedKey',
}
const REJECTED_STORAGE_KEY = 'WallpaperUserApiRejected'

// 开发环境（浏览器）持久化，方便刷新后继续调试
const DevHost = useStorage(DEV_STORAGE_KEY.HOST, '')
const DevKey = useStorage(DEV_STORAGE_KEY.KEY, '')
// flush: 'sync'：页面随时可能被 location.reload() 打断，必须同步落盘
const CachedHost = useStorage(CACHE_STORAGE_KEY.HOST, '', localStorage, { flush: 'sync' })
const CachedKey = useStorage(CACHE_STORAGE_KEY.KEY, '', localStorage, { flush: 'sync' })

/**
 * 防呆：判定用户是否把「域名」和「密钥」两个输入框填反了。
 *
 * 和风天气的 API 域名一定包含 qweatherapi.com（形如 abcd.re.qweatherapi.com），
 * 而密钥是一串不含点号的编号，永远不会带上这个后缀。于是可以这样判定：
 *   域名框里没有域名、密钥框里却有域名  →  用户填反了。
 *
 * 这里只「判定」，不改任何输入值：
 * - 壁纸引擎里属性页的值归引擎管（网页侧既没有写入口，也不该去写），
 *   所以引擎下发的原值原样保留，绝不回写；浏览器里用户敲进去的字也一样保留。
 * - 纠正放在「读取」那一层做（见 parseUserApi）：解析、检测、展示、请求拿到的
 *   都是换正之后的一组域名/密钥。全程静默，用户不需要做任何事。
 *
 * 两个框都非空时才判定，只填了一个框、或本来就填得对时都算正常，
 * 免得误伤还没填完的中间状态。
 */
const QWEATHER_HOST_RE = /qweatherapi\.com/i
export const resolveHostKey = (hostRaw, keyRaw) => {
  const host = String(hostRaw ?? '')
  const key = String(keyRaw ?? '')
  if (!host.trim() || !key.trim()) return { host, key, swapped: false }
  if (!QWEATHER_HOST_RE.test(host) && QWEATHER_HOST_RE.test(key)) {
    return { host: key, key: host, swapped: true }
  }
  return { host, key, swapped: false }
}

// 浏览器里用面板里填的值，壁纸引擎里用上次引擎下发过的缓存值（引擎这次可能根本不下发）
const initialHost = isBrowserRuntime() ? String(DevHost.value || '') : String(CachedHost.value || '')
const initialKey = isBrowserRuntime() ? String(DevKey.value || '') : String(CachedKey.value || '')

// 原始输入（未拆分、未归一化）：原样保存来源给的值，防呆纠正只在解析结果里生效
export const UserApiHostRaw = ref(initialHost)
export const UserApiKeyRaw = ref(initialKey)

const splitList = (value) =>
  String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

/**
 * 归一化域名：允许用户粘贴完整 URL 或带路径的地址
 *   https://abcd.re.qweatherapi.com/  →  abcd.re.qweatherapi.com
 */
export const normalizeHost = (value) =>
  String(value ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .split(/[/?#]/)[0]
    .trim()

export const isHostLike = (host) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)

/**
 * 解析用户输入
 * @returns {{ state: 'empty'|'mismatch'|'invalid-host'|'ok', entries: Array<{host:string,key:string}>, reason: string }}
 */
export const parseUserApi = (hostRaw, keyRaw) => {
  // 防呆：两个输入框填反时，先在这里换回来（只影响解析结果，不动用户填的值）
  const resolved = resolveHostKey(hostRaw, keyRaw)
  const hosts = splitList(resolved.host).map(normalizeHost).filter(Boolean)
  const keys = splitList(resolved.key)

  if (!hosts.length && !keys.length) {
    return { state: 'empty', entries: [], reason: '' }
  }
  if (hosts.length !== keys.length) {
    return {
      state: 'mismatch',
      entries: [],
      reason: `域名 ${hosts.length} 个、密钥 ${keys.length} 个，数量不一致`,
    }
  }
  const badHost = hosts.find((host) => !isHostLike(host))
  if (badHost) {
    return { state: 'invalid-host', entries: [], reason: `域名格式不正确：${badHost}` }
  }
  return {
    state: 'ok',
    entries: hosts.map((host, index) => ({ host, key: keys[index] })),
    reason: '',
  }
}

export const UserApiParse = computed(() => parseUserApi(UserApiHostRaw.value, UserApiKeyRaw.value))
export const UserApiEntries = computed(() => UserApiParse.value.entries)
export const UserApiState = computed(() => UserApiParse.value.state)
export const UserApiReason = computed(() => UserApiParse.value.reason)

// 非加密哈希：只用于"凭据是否变化"的比对，不用于安全用途
const hashString = (str) => {
  let hash = 2166136261
  for (let index = 0; index < str.length; index += 1) {
    hash ^= str.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export const UserApiFingerprint = computed(() => {
  const entries = UserApiEntries.value
  if (!entries.length) return ''
  return `${hashString(entries.map((item) => `${item.host}\u0000${item.key}`).join('\u0001'))}-${entries.length}`
})

// 检测失败的域名（按凭据指纹记录），轮询时跳过，避免随机请求落到坏域名上
const RejectedStore = useStorage(REJECTED_STORAGE_KEY, { fingerprint: '', hosts: [] })
export const setRejectedHosts = (fingerprint, hosts) => {
  RejectedStore.value = { fingerprint, hosts: [...new Set(hosts || [])] }
}

/** 实际参与轮询的域名列表：过滤掉上次检测失败的域名（全坏时退回全部，保证仍有请求） */
export const ActiveEntries = computed(() => {
  const entries = UserApiEntries.value
  if (!entries.length) return entries
  if (RejectedStore.value.fingerprint !== UserApiFingerprint.value) return entries
  const rejected = new Set(RejectedStore.value.hosts || [])
  const kept = entries.filter((item) => !rejected.has(item.host))
  return kept.length ? kept : entries
})

const applyRaw = (host, key) => {
  UserApiHostRaw.value = String(host ?? '')
  UserApiKeyRaw.value = String(key ?? '')
}

const cacheRaw = (host, key) => {
  CachedHost.value = String(host ?? '')
  CachedKey.value = String(key ?? '')
}

/**
 * 壁纸引擎下发的属性值（只更新本次带上的字段）
 *
 * @param {string|undefined} host 本次下发里的域名；这次没带上时传 undefined
 * @param {string|undefined} key  同上
 * @param {boolean} fromLoad 这次下发是不是「页面加载阶段」的全量属性快照。
 *   加载阶段偶尔会拿到空值（等于没读到属性面板里的值），此时保留缓存里的旧值，
 *   否则用户每重载一次壁纸就得重填一遍域名和密钥；
 *   壁纸运行中的空值才是用户真的清空了输入框，照常覆盖。
 */
export const setUserApiFromProperties = (host, key, { fromLoad = false } = {}) => {
  const emptyDuringLoad = (value) => fromLoad && !String(value ?? '').trim()
  const patchHost = host === undefined || emptyDuringLoad(host) ? undefined : String(host ?? '')
  const patchKey = key === undefined || emptyDuringLoad(key) ? undefined : String(key ?? '')
  // 两个字段这次都没带来有效值 → 保持现状，别把缓存里的凭据冲掉
  if (patchHost === undefined && patchKey === undefined) return

  const nextHost = patchHost === undefined ? UserApiHostRaw.value : patchHost
  const nextKey = patchKey === undefined ? UserApiKeyRaw.value : patchKey
  applyRaw(nextHost, nextKey)
  cacheRaw(nextHost, nextKey)
}

/** 浏览器调试用：写入并持久化 */
export const setUserApiFromBrowser = (host, key) => {
  applyRaw(host, key)
  cacheRaw(host, key)
  if (isBrowserRuntime()) {
    DevHost.value = UserApiHostRaw.value
    DevKey.value = UserApiKeyRaw.value
  }
}
