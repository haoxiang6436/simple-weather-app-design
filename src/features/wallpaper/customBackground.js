/**
 * 用户自选背景图
 *
 * Wallpaper Engine 的 file 属性只会返回「本机文件路径」，官方要求读取时补上
 * `file:///` 前缀才能被壁纸的 web 页面访问。这里集中处理三件事：
 *   1. 路径 → 可直接给 <img> 使用的 URL（兼容 Windows 反斜杠 / 中文 / 空格）；
 *   2. 图片 → canvas 纹理，供 RaindropFX.setBackground() 使用。
 *      不走它内部的 fetch(file://)，避免 CEF 对本地文件请求的拦截；
 *   3. 把选择结果按本机路径持久化。雨滴引擎页面重载后不一定会再补发 file 属性，
 *      只靠内存会丢图。
 *
 * 「实时渲染雨滴」现在是一个独立的开关（rainenabled），不再和这张图绑在一起：
 * 雨滴组件按当前背景来源决定用内置图还是这里的自定义图。
 */

import { computed, ref } from 'vue'
import { STORAGE_KEYS } from './constants'

// 开发调试时选的文件会先压成 data: URL。它跨刷新有效，但可能很大；
// 超过这个长度就不落盘，避免把 localStorage 配额撑爆。
const MAX_PERSISTED_SOURCE_LENGTH = 1_200_000

const isBlobSource = (value) => /^blob:/i.test(String(value || ''))

// 单张纹理最长边。超大图（8K/16K）可能超过 GPU 的 MAX_TEXTURE_SIZE，
// 而且雨滴只需要一张折射底图，缩到 4096 足够清晰。
const MAX_TEXTURE_EDGE = 4096

const readStoredString = (key) => {
  try {
    return localStorage.getItem(key) || ''
  } catch (error) {
    return ''
  }
}

const writeStoredString = (key, value) => {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch (error) {
    // 配额满 / 隐私模式禁用存储：当前会话仍可用，只是刷新后要重新选图
    console.warn('[Wallpaper] 自定义背景状态写入失败', error)
  }
}

/** 引擎下发的原始值（路径或调试用 blob:/data: URL） */
export const CustomBackgroundRaw = ref(readStoredString(STORAGE_KEYS.WALLPAPER_CUSTOM_BACKGROUND))

// Windows 盘符（C:\... / C:/...）不能当成 URL scheme，先单独识别
const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[\\/]/
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/**
 * 把 Wallpaper Engine 的 file 属性值转成浏览器可读取的 URL
 *
 * 官方只要求补 `file:///` 前缀，不能再对路径做 URL 编码：引擎返回的值本身
 * 已经是编码过的（实测为 `C%3A/Users/.../bg.png`，盘符冒号被写成 %3A），
 * 再编码一次 `%3A` 会变成 `%253A`，Chromium 找不到文件，背景就会加载失败。
 * 浏览器会自己解码 %3A、并对路径里的中文/空格做转义，所以保持原样即可。
 *
 * @param {string} value 例如 C:\Users\me\Pictures\bg.png 或 C%3A/Users/me/bg.png
 * @returns {string} file:///C:/Users/me/Pictures/bg.png 或 file:///C%3A/Users/me/bg.png（空值返回空字符串）
 */
export const toFileUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  // 已经是 file: / http: / data: / blob: 的直接用，避免重复拼前缀
  if (!WINDOWS_DRIVE_PATH.test(raw) && URL_SCHEME.test(raw)) return raw

  const normalized = raw.replace(/\\/g, '/')
  // UNC 路径 \\server\share → file://server/share
  if (normalized.startsWith('//')) return `file:${normalized}`
  return `file:///${normalized.replace(/^\/+/, '')}`
}

/** 供 <img> / CSS 使用的最终地址 */
export const CustomBackgroundUrl = computed(() => toFileUrl(CustomBackgroundRaw.value))

/** 是否已经选了一张可用的背景图 */
export const HasCustomBackground = computed(() => !!CustomBackgroundUrl.value)

/** 设置页 / 调试面板展示用的文件名 */
export const CustomBackgroundFileName = computed(() => {
  const raw = CustomBackgroundRaw.value
  if (!raw) return ''
  if (isBlobSource(raw)) return '已选择图片（仅本次会话）'
  if (/^data:/i.test(raw)) return '已选择图片（调试）'
  const name = raw.replace(/\\/g, '/').split('/').pop() || raw
  try {
    return decodeURIComponent(name)
  } catch (error) {
    return name
  }
})

/**
 * 写入用户选择的背景图
 * @param {*} value 引擎 file 属性的 value，或调试面板的 blob:/data: URL
 * @returns {string} 规范化后的值
 */
export const setCustomBackground = (value) => {
  const next = typeof value === 'string' ? value.trim() : ''
  if (next === CustomBackgroundRaw.value) return next
  CustomBackgroundRaw.value = next
  // blob: 一定不落盘；data: 只在体积可控时落盘（调试面板会先压缩）
  const persistable = next && !isBlobSource(next) && next.length <= MAX_PERSISTED_SOURCE_LENGTH
  writeStoredString(
    STORAGE_KEYS.WALLPAPER_CUSTOM_BACKGROUND,
    persistable ? next : ''
  )
  return next
}

// 图片和纹理都按 URL 缓存：反复切换背景时不用重新解码大图
const imagePromises = new Map()
const texturePromises = new Map()

/**
 * 用 <img> 加载一张图（file:// 在 CEF 里也是支持的，官方文档推荐用法）
 * @param {string} url toFileUrl() 的结果
 * @returns {Promise<HTMLImageElement>}
 */
export const loadCustomBackgroundImage = (url) => {
  if (!url) return Promise.reject(new Error('自定义背景地址为空'))
  if (imagePromises.has(url)) return imagePromises.get(url)

  const promise = new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`自定义背景图片加载失败：${url}`))
    image.src = url
  })

  imagePromises.set(url, promise)
  // 失败不缓存，下次属性变化时还能重试
  promise.catch(() => imagePromises.delete(url))
  return promise
}

/**
 * 把图片画进 canvas，限制最长边后作为 WebGL 纹理源
 * @param {string} url
 * @returns {Promise<HTMLCanvasElement>}
 */
export const loadCustomBackgroundTexture = (url) => {
  if (!url) return Promise.reject(new Error('自定义背景地址为空'))
  if (texturePromises.has(url)) return texturePromises.get(url)

  const promise = loadCustomBackgroundImage(url).then((image) => {
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) throw new Error('自定义背景图片尺寸无效')

    const scale = Math.min(1, MAX_TEXTURE_EDGE / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建 2D canvas 上下文')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas
  })

  texturePromises.set(url, promise)
  promise.catch(() => texturePromises.delete(url))
  return promise
}

/** 背景图被替换 / 清除时释放缓存（目前按 URL 缓存，保留导出便于后续扩展） */
export const clearCustomBackgroundCache = () => {
  imagePromises.clear()
  texturePromises.clear()
}
