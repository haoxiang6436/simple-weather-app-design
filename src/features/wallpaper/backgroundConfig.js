/**
 * 各背景（壁纸场景）的专属配置
 *
 * 不同背景有不同的可调参数（如雨滴大小、粒子数量等），配置按背景序号分别
 * 存储，互不干扰。开发环境下由 WallpaperDebugPanel 修改，雨滴/粒子组件
 * 在运行时读取同一份持久化配置。
 *
 * 字段划分与 public/project.json 保持一致：
 *   - backgroundinteraction 是“小鸟”独占的壁纸属性（condition: backgroundindex==="1"）
 *   - showweathermain 是“实时雨滴”独占的壁纸属性（condition: backgroundindex==="4"）
 *   - rainconfig 是“实时雨滴”与“整页雨珠叠加”共用的壁纸属性（condition 见 public/project.json）
 *   - 其余为各背景的运行时效果参数（雨滴大小、粒子数量等）
 * 壁纸属性字段通过 property 标记，渲染时绑定全局壁纸属性状态并走
 * applyWallpaperProperties；运行时参数存储在本地并按背景独立生效。
 *
 * 新增可调参数时，只需在 backgroundConfigSchema 中补充字段定义，并让对应
 * 组件在初始化 / 收到 BackgroundConfigChange 事件时应用即可。
 */

import { useStorage } from '@vueuse/core'
import { STORAGE_KEYS, WALLPAPER_PROPERTIES } from './constants'

// 全部背景配置（持久化到 localStorage，替换时整体写入）
const backgroundConfigs = useStorage(STORAGE_KEYS.WALLPAPER_BACKGROUND_CONFIGS, {}, localStorage)

// 各背景的可配置字段定义
export const backgroundConfigSchema = {
  '1': {
    label: '小鸟',
    fields: [
      {
        key: WALLPAPER_PROPERTIES.BACKGROUND_INTERACTION,
        label: '小鸟互动',
        type: 'boolean',
        property: WALLPAPER_PROPERTIES.BACKGROUND_INTERACTION,
      },
    ],
  },
  '2': {
    label: '星空',
    fields: [],
  },
  '3': {
    label: '动态粒子',
    fields: [
      { key: 'dotsNum', label: '粒子数量', type: 'slider', min: 20, max: 300, step: 5, default: 80 },
      { key: 'connection', label: '连线距离', type: 'slider', min: 50, max: 400, step: 10, default: 150 },
    ],
  },
  '4': {
    label: '实时雨滴',
    fields: [
      {
        key: WALLPAPER_PROPERTIES.SHOW_WEATHER_MAIN,
        label: '隐藏天气面板',
        type: 'boolean',
        property: WALLPAPER_PROPERTIES.SHOW_WEATHER_MAIN,
      },
      {
        key: WALLPAPER_PROPERTIES.RAIN_CONFIG,
        label: '雨滴配置',
        type: 'select',
        property: WALLPAPER_PROPERTIES.RAIN_CONFIG,
        options: [
          { label: '自动', value: 'auto' },
          { label: '暴雨', value: 'storm' },
          { label: '大雨', value: 'heavy' },
          { label: '中雨', value: 'moderate' },
          { label: '小雨', value: 'light' },
          { label: '雨停', value: 'none' },
        ],
      },
      { key: 'dropletSize', label: '雨滴大小', type: 'range', min: 2, max: 80, step: 1, default: [10, 30] },
      { key: 'dropletsPerSeconds', label: '雨滴数量/秒', type: 'slider', min: 0, max: 2000, step: 50, default: 500 },
      { key: 'spawnLimit', label: '雨滴同时上限', type: 'slider', min: 100, max: 2000, step: 100, default: 500 },
    ],
  },
  '5': {
    label: '整页雨珠',
    fields: [
      {
        key: WALLPAPER_PROPERTIES.RAIN_CONFIG,
        label: '雨滴配置',
        type: 'select',
        property: WALLPAPER_PROPERTIES.RAIN_CONFIG,
        options: [
          { label: '自动', value: 'auto' },
          { label: '暴雨', value: 'storm' },
          { label: '大雨', value: 'heavy' },
          { label: '中雨', value: 'moderate' },
          { label: '小雨', value: 'light' },
          { label: '雨停', value: 'none' },
        ],
      },
      // 凝结水珠层（就是看着像“水渍”的那一层）：只会越积越多（仅被下落雨滴擦除，
      // 不会自己变淡）。默认开启成小颗粒低密度（与 RainOverlayConfig.js 的四档预设一致），
      // 只有在下落雨滴不断擦除时才会稳定；调高后注意它会持续变糊。
      { key: 'dropletSize', label: '凝结水珠大小', type: 'range', min: 2, max: 40, step: 1, default: [2, 20] },
      { key: 'dropletsPerSeconds', label: '凝结水珠数量/秒', type: 'slider', min: 0, max: 500, step: 10, default: 150 },
      // 雨滴上限默认取「中雨」预设的值；只有显式调过才会覆盖各档预设，见 RainOverlayEffect.vue
      { key: 'spawnLimit', label: '雨滴同时上限', type: 'slider', min: 40, max: 600, step: 20, default: 150 },
      // 折射源是整页 DOM 的低分辨率快照（html2canvas），这两个参数决定快照成本
      { key: 'snapshotScale', label: '快照分辨率', type: 'slider', min: 0.1, max: 1, step: 0.05, default: 0.25 },
      { key: 'snapshotInterval', label: '快照间隔(ms)', type: 'slider', min: 100, max: 1000, step: 50, default: 400 },
    ],
  },
}

// 读取全部背景配置
export const getBackgroundConfigs = () => {
  const configs = backgroundConfigs.value
  return configs && typeof configs === 'object' ? configs : {}
}

// 读取指定背景的配置（未自定义的字段回退到默认值）
export const getBackgroundConfig = (index) => {
  const schema = backgroundConfigSchema[index]
  if (!schema) return {}
  const stored = getBackgroundConfigs()[index] || {}
  const result = {}
  schema.fields.forEach((field) => {
    // 壁纸属性字段（property）由全局壁纸属性状态管理，不进入背景专属配置
    if (field.property) return
    const value = stored[field.key]
    result[field.key] = value !== undefined
      ? value
      : JSON.parse(JSON.stringify(field.default))
  })
  return result
}

// 保存指定背景的配置
export const setBackgroundConfig = (index, config) => {
  backgroundConfigs.value = {
    ...getBackgroundConfigs(),
    [index]: config,
  }
}

// 恢复指定背景的默认配置
export const resetBackgroundConfig = (index) => {
  const all = getBackgroundConfigs()
  delete all[index]
  backgroundConfigs.value = { ...all }
}
