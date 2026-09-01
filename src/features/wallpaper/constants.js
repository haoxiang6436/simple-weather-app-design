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
}

// Bus 事件名
export const BUS_EVENTS = {
  SHOW_WEATHER_MAIN: 'ShowWeatherMain',
  BACKGROUND_INDEX_CHANGE: 'BackgroundIndexChange',
  RAIN_CONFIG_CHANGE: 'RainConfigChange',
  BACKGROUND_CONFIG_CHANGE: 'BackgroundConfigChange',
}

// 本地存储 key
export const STORAGE_KEYS = {
  BACKGROUND_INDEX: 'BackgroundIndex',
  WALLPAPER_BACKGROUND_CONFIGS: 'WallpaperBackgroundConfigs',
  WALLPAPER_USER_RAIN_CONFIG: 'WallpaperUserConfigRainConfig',
  WALLPAPER_DEBUG_PROPERTIES: 'WallpaperDebugProperties',
}
