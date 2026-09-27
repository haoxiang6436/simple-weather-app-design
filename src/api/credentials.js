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
const REJECTED_STORAGE_KEY = 'WallpaperUserApiRejected'

// 开发环境（浏览器）持久化，方便刷新后继续调试；壁纸引擎里不落盘，
// 因为引擎每次加载都会把属性面板里的值重新下发一遍。
const DevHost = useStorage(DEV_STORAGE_KEY.HOST, '')
const DevKey = useStorage(DEV_STORAGE_KEY.KEY, '')

const initialHost = isBrowserRuntime() ? String(DevHost.value || '') : ''
const initialKey = isBrowserRuntime() ? String(DevKey.value || '') : ''

// 原始输入（未拆分、未归一化）
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
  const hosts = splitList(hostRaw).map(normalizeHost).filter(Boolean)
  const keys = splitList(keyRaw)

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

/** 壁纸引擎下发的属性值（只更新本次带上的字段） */
export const setUserApiFromProperties = (host, key) => {
  applyRaw(host, key)
}

/** 浏览器调试用：写入并持久化 */
export const setUserApiFromBrowser = (host, key) => {
  applyRaw(host, key)
  if (isBrowserRuntime()) {
    DevHost.value = UserApiHostRaw.value
    DevKey.value = UserApiKeyRaw.value
  }
}
