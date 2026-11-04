/**
 * 「天气数据 → 雨量档位」的共用映射
 *
 * 供两个雨滴背景共用：
 *   - rain/RainEffect.vue（backgroundindex = 4，自带背景图的全屏后处理）
 *   - rain-overlay/RainOverlayEffect.vue（backgroundindex = 5，整页雨珠叠加）
 *
 * 自动档的数据源优先级：
 *   1. 分钟级降水里「现在」所在的那一个 5 分钟段 —— 和胶囊 / 弹层用同一套分析
 *      （analyzeMinutely），见 resolveMinutelyIntensity；
 *   2. 分钟级不可用（境外 / 请求失败 / 尚未加载 / 数据窗口已过期）时，回退实时天气：
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

import { analyzeMinutely } from '@/features/weather/minutelyRain'

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
 * 分钟级降水 → 「现在」所在 5 分钟段的雨量档位
 *
 * 以前这里取 `points[0]`，理由是「第一条就是最近这个 5 分钟段」。实际上接口窗口的起点
 * 比现在早 5~10 分钟（服务端网格延迟，minutelyRain.js 里也是按这个前提写的），
 * 所以 `points[0]` 是**已经过去**的那一段：雨刚下起来时雨滴要晚 5~10 分钟才出现，
 * 雨停了却还在下 —— 和胶囊上那句「正在下 / 雨刚停」正好对不上（胶囊按「现在」索引）。
 *
 * 现在改成和胶囊、弹层共用 analyzeMinutely：同一份数据、同一个「现在」、同一种「当前段」。
 * 调用方要把 useWeatherNow() 的 now 传进来（5 分钟边界处会重算），雨滴才会和文案一起变。
 *
 * @param {{ points?: Array<{ time?: string, precip?: number|string, type?: string }>,
 *   fetchedAt?: number }|null} minutely store 里的 MinutelyPrecipitation
 * @param {number} [now] 「现在」的时间戳，默认取本机时间
 * @returns {'storm'|'heavy'|'moderate'|'light'|'none'|null}
 *   null = 没有可用数据（境外 / 请求失败 / 尚未加载 / 窗口已过期），调用方回退实时天气
 */
export const resolveMinutelyIntensity = (minutely, now = Date.now()) => {
  const analysis = analyzeMinutely(minutely?.points, now)
  // 没有点，或数据窗口已经整个过去：都不要再拿它驱动雨滴
  if (!analysis || analysis.expired) return null
  // 雪不交给雨滴背景：与原来 icon 4xx → 无雨的策略保持一致
  if (analysis.type === 'snow') return 'none'
  if (!analysis.raining) return 'none'
  return analysis.level.key
}

export default resolveRainIntensity
