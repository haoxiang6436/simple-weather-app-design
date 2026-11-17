/**
 * Wallpaper Engine color 属性的读写转换。
 *
 * 引擎下发的颜色是三个 0~1 的小数，用空格分隔（例如 "1.0 0.1 0.25"），
 * 官方示例的做法是 split 后乘以 255 再拼成 CSS rgb()。这里集中处理：
 *   1. 解析 / 兜底（非法值回退到默认色，避免整块背景变透明）；
 *   2. 转 CSS 颜色给「纯色」背景用；
 *   3. 转 #rrggbb 给调试面板的 <input type="color"> 用，再转回引擎格式。
 */

import { DEFAULT_BACKGROUND_COLOR } from '../constants'

const clamp01 = (value) => Math.min(1, Math.max(0, value))

/** 解析 "r g b"（兼容多写的 alpha 分量），返回 [r, g, b] 或 null */
export const parseWallpaperColor = (value) => {
  if (typeof value !== 'string') return null
  const parts = value.trim().split(/\s+/)
  if (parts.length < 3) return null
  const channels = parts.slice(0, 3).map(Number)
  if (channels.some((channel) => !Number.isFinite(channel))) return null
  return channels.map(clamp01)
}

/** 引擎颜色 → 规整后的 "r g b"（解析失败返回 fallback） */
export const normalizeWallpaperColor = (value, fallback = DEFAULT_BACKGROUND_COLOR) => {
  const channels = parseWallpaperColor(value) || parseWallpaperColor(fallback)
  if (!channels) return DEFAULT_BACKGROUND_COLOR
  return channels.map((channel) => String(Number(channel.toFixed(6)))).join(' ')
}

/** 引擎颜色 → "#rrggbb"（解析失败时用 fallback） */
export const wallpaperColorToHex = (value, fallback = DEFAULT_BACKGROUND_COLOR) => {
  const channels = parseWallpaperColor(value) || parseWallpaperColor(fallback)
  if (!channels) return '#12304d'
  return `#${channels
    .map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0'))
    .join('')}`
}

/** 引擎颜色 → CSS rgb() */
export const wallpaperColorToCss = (value, fallback = DEFAULT_BACKGROUND_COLOR) => {
  const channels = parseWallpaperColor(value) || parseWallpaperColor(fallback)
  if (!channels) return '#12304d'
  return `rgb(${channels.map((channel) => Math.round(channel * 255)).join(', ')})`
}

/** "#rrggbb" / "#rgb" → 引擎颜色 "r g b"（解析失败返回 null） */
export const hexToWallpaperColor = (hex) => {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!match) return null
  const raw = match[1].length === 3
    ? match[1].split('').map((char) => char + char).join('')
    : match[1]
  const channels = [0, 2, 4].map((offset) => Number.parseInt(raw.slice(offset, offset + 2), 16) / 255)
  return channels.map((channel) => String(Number(channel.toFixed(6)))).join(' ')
}
