/**
 * 「天气数据 → 雨量档位」的共用映射
 *
 * 供两个雨滴背景共用：
 *   - rain/RainEffect.vue（backgroundindex = 4，自带背景图的全屏后处理）
 *   - rain-overlay/RainOverlayEffect.vue（backgroundindex = 5，整页雨珠叠加）
 *
 * 自动档的数据源优先级：
 *   1. 分钟级降水的第一条 —— 它就是最近这个 5 分钟段，见 resolveMinutelyIntensity；
 *   2. 分钟级不可用（境外 / 请求失败 / 尚未加载）时，回退实时天气：
 *      先用和风天气的 icon 代码（数字最稳），icon 缺失或未知时再退回文本匹配。
 *
 * 返回 'storm' | 'heavy' | 'moderate' | 'light' | 'none'，各背景用自己的预设表取参数。
 *
 * 和风图标代码（3xx 全是降雨）：
 *   小雨 300/305/309(毛毛雨)    中雨 301/306/314(小到中雨)   大雨 302/307/315(中到大雨)
 *   暴雨 310   大暴雨 311   特大暴雨 312   极端降雨 308
 *   阵雨 350   强阵雨 303/351   雷阵雨 304   冻雨 313
 *   大到暴雨 316   暴雨到大暴雨 317   大暴雨到特大暴雨 318
 */

import { isWetPrecip, precipToRate, rateLevel } from '@/features/weather/minutelyRain'

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

/**
 * 「分钟级降水的第一条」→ 雨量档位
 *
 * 第一条就是最近这个 5 分钟段，所以这里不按时间索引：数据每 5 分钟刷新一次，
 * 刷新后 `points[0]` 自然换成新的当前段，背景跟着变即可。
 * 严格说它是 nowcast（未来 5 分钟），不是观测值；用来驱动「现在多大雨」足够。
 *
 * @param {{ points?: Array<{ precip?: number|string, type?: string }> }|null} minutely
 *   store 里的 MinutelyPrecipitation
 * @returns {'storm'|'heavy'|'moderate'|'light'|'none'|null}
 *   null = 没有可用数据（境外 / 请求失败 / 尚未加载），调用方回退实时天气
 */
export const resolveMinutelyIntensity = (minutely) => {
  const first = minutely?.points?.[0]
  if (!first) return null
  // 雪不交给雨滴背景：与原来 icon 4xx → 无雨的策略保持一致
  if (first.type === 'snow') return 'none'
  // 小于 WET_MM 的降水当作没下（rateLevel(0) 会返回「小雨」）
  if (!isWetPrecip(first.precip)) return 'none'
  return rateLevel(precipToRate(first.precip), first.type).key
}

export default resolveRainIntensity
