/**
 * 「实时天气 → 雨量档位」的共用映射
 *
 * 供两个雨滴背景共用：
 *   - rain/RainEffect.vue（backgroundindex = 4，自带背景图的全屏后处理）
 *   - rain-overlay/RainOverlayEffect.vue（backgroundindex = 5，整页雨珠叠加）
 *
 * 优先级：先用和风天气的 icon 代码（数字最稳），icon 缺失或未知时再退回文本匹配。
 * 返回 'storm' | 'heavy' | 'moderate' | 'light' | 'none'，各背景用自己的预设表取参数。
 *
 * 和风图标代码（3xx 全是降雨）：
 *   小雨 300/305/309(毛毛雨)    中雨 301/306/314(小到中雨)   大雨 302/307/315(中到大雨)
 *   暴雨 310   大暴雨 311   特大暴雨 312   极端降雨 308
 *   阵雨 350   强阵雨 303/351   雷阵雨 304   冻雨 313
 *   大到暴雨 316   暴雨到大暴雨 317   大暴雨到特大暴雨 318
 */

const ICON_STORM = ['308', '310', '311', '312', '316', '317', '318']
const ICON_HEAVY = ['302', '303', '307', '315', '351']
const ICON_MODERATE = ['301', '304', '306', '314', '350', '399']
const ICON_LIGHT = ['300', '305', '309', '313']

const TEXT_STORM = /特大暴雨|大暴雨|暴雨|极端降雨/
const TEXT_HEAVY = /强阵雨|大到暴雨|中到大雨|大雨/
const TEXT_MODERATE = /中雨|阵雨|雷阵雨|冻雨|降水|雨夹雪|雨/
const TEXT_LIGHT = /小雨|细雨|毛毛雨|微雨/

/**
 * @param {{ icon?: string|number, text?: string }|string} weather 实时天气（nowWeatherData）或天气文本
 * @returns {'storm'|'heavy'|'moderate'|'light'|'none'}
 */
export const resolveRainIntensity = (weather) => {
  const icon = typeof weather === 'object' && weather !== null ? String(weather.icon ?? '') : ''
  if (ICON_STORM.includes(icon)) return 'storm'
  if (ICON_HEAVY.includes(icon)) return 'heavy'
  if (ICON_MODERATE.includes(icon)) return 'moderate'
  if (ICON_LIGHT.includes(icon)) return 'light'

  const text = (typeof weather === 'string' ? weather : weather?.text) || ''
  if (TEXT_STORM.test(text)) return 'storm'
  if (TEXT_HEAVY.test(text)) return 'heavy'
  if (TEXT_MODERATE.test(text)) return 'moderate'
  if (TEXT_LIGHT.test(text)) return 'light'
  return 'none'
}

export default resolveRainIntensity
