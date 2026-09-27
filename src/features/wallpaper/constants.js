/**
 * 壁纸相关常量：属性 key、Bus 事件名、本地存储 key 的单一数据源。
 *
 * 属性 key 与 public/project.json 中 general.properties 的字段名一一对应。
 * project.json 是 Wallpaper Engine 的配置定义，无法引用本文件，修改属性名时需同步两处。
 */

// Wallpaper Engine 属性名（与 project.json 对应）
export const WALLPAPER_PROPERTIES = {
  BACKGROUND_INDEX: 'backgroundindex',
  BACKGROUND_INTERACTION: 'backgroundinteraction',
  SHOW_WEATHER_MAIN: 'showweathermain',
  RAIN_CONFIG: 'rainconfig',
  PANEL_SCALE: 'panelscale',
  // 用户自带的 和风天气 API 域名 / 密钥（textinput）
  QWEATHER_HOST: 'qweatherhost',
  QWEATHER_KEY: 'qweatherkey',
}

// backgroundindex 的合法取值（与 public/project.json 的 options 一一对应）
// 0 无 / 1 小鸟 / 2 星空 / 3 动态粒子 / 4 实时雨滴 / 5 整页雨珠叠加
export const BACKGROUND_INDEX_OPTIONS = ['0', '1', '2', '3', '4', '5']
// 默认背景：整页雨珠叠加
export const DEFAULT_BACKGROUND_INDEX = '5'

// rainconfig 的合法取值（与 public/project.json 的 options 一一对应）
export const RAIN_CONFIG_OPTIONS = ['auto', 'storm', 'heavy', 'moderate', 'light', 'none']

// panelscale：天气面板整体缩放（1 = 设计原尺寸）
// 与 public/project.json 里的 min / max / value 保持一致，改一处要同步另一处
export const PANEL_SCALE_MIN = 0.5
export const PANEL_SCALE_MAX = 1.5
export const DEFAULT_PANEL_SCALE = 0.75

// Bus 事件名
export const BUS_EVENTS = {
  SHOW_WEATHER_MAIN: 'ShowWeatherMain',
  BACKGROUND_INDEX_CHANGE: 'BackgroundIndexChange',
  RAIN_CONFIG_CHANGE: 'RainConfigChange',
  BACKGROUND_CONFIG_CHANGE: 'BackgroundConfigChange',
  // 运行中请求返回 401/402/403：用户填写的密钥失效/超额，需要重新打开引导页
  USER_API_INVALID: 'UserApiInvalid',
}

// 本地存储 key
export const STORAGE_KEYS = {
  BACKGROUND_INDEX: 'BackgroundIndex',
  WALLPAPER_BACKGROUND_CONFIGS: 'WallpaperBackgroundConfigs',
  WALLPAPER_USER_RAIN_CONFIG: 'WallpaperUserConfigRainConfig',
  WALLPAPER_DEBUG_PROPERTIES: 'WallpaperDebugProperties',
}
