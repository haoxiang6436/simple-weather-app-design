/**
 * 壁纸相关常量：属性 key、Bus 事件名、本地存储 key 的单一数据源。
 *
 * 属性 key 与 public/project.json 中 general.properties 的字段名一一对应。
 * project.json 是 Wallpaper Engine 的配置定义，无法引用本文件，修改属性名时需同步两处。
 */

import { BUILTIN_BACKGROUNDS } from './backgrounds/builtinBackgrounds'

// Wallpaper Engine 属性名（与 project.json 对应）
export const WALLPAPER_PROPERTIES = {
  // 背景来源：纯色 / 内置图片（湖心桥、雾夜长街）/ 自定义背景
  BACKGROUND_INDEX: 'backgroundindex',
  // 「纯色」背景使用的颜色（color，引擎下发 "r g b" 三个 0~1 的小数）
  BACKGROUND_COLOR: 'backgroundcolor',
  // 是否在当前背景图上实时渲染雨滴（bool）。纯色背景下不生效，属性面板里也会隐藏
  RAIN_ENABLED: 'rainenabled',
  SHOW_WEATHER_MAIN: 'showweathermain',
  RAIN_CONFIG: 'rainconfig',
  PANEL_SCALE: 'panelscale',
  PANEL_OFFSET_X: 'paneloffsetx',
  PANEL_OFFSET_Y: 'paneloffsety',
  // 面板材质主题：夜雨玻璃 / 晨雾玻璃
  COLOR_THEME: 'colortheme',
  // 底部预报条显示几天（5 / 6 / 7）：只影响显示，接口始终取 7 天
  FORECAST_DAYS: 'forecastdays',
  // 用户自带的 和风天气 API 域名 / 密钥（textinput）
  QWEATHER_HOST: 'qweatherhost',
  QWEATHER_KEY: 'qweatherkey',
  // 用户自带的高德「Web服务」key（textinput，可选）：只用于地图选点处显示最近道路名，
  // 留空不影响任何其它功能
  AMAP_KEY: 'amapkey',
  // 用户自选的背景图片（file，fileType: image）。值为引擎返回的本地路径；
  // 渲染时统一补成 file:/// 再交给 <img> / WebGL，见 customBackground.js
  CUSTOM_BACKGROUND: 'custombackground',
}

// backgroundindex 的合法取值（与 public/project.json 的 options 一一对应）
// 0 纯色（跟随面板配色） / solid 自定义纯色 / 4 【默认】湖心桥 / 6 雾夜长街 / custom 自定义背景
// 内置图片背景（4 / 6）由 backgrounds/builtinBackgrounds.js 定义，这里自动派生，新增图只改那一处；
// 1 小鸟 / 2 星空 / 3 动态粒子 / 5 整页雨珠叠加 已移除；
// 4 继续沿用原来的序号，老用户保存的 4 会自动落到「默认湖心桥」。
export const BACKGROUND_INDEX_OPTIONS = ['0', 'solid', ...Object.keys(BUILTIN_BACKGROUNDS), 'custom']
export const DEFAULT_BACKGROUND_INDEX = '4'

// 两种「纯色」背景：都没有可折射的底图，所以都不显示雨滴开关、也不渲染雨滴。
// 0 跟随面板配色（直接用 CSS 的 --color-bg），solid 用用户在属性面板里挑的颜色。
export const SOLID_BACKGROUND_INDEXES = ['0', 'solid']
export const isSolidBackgroundIndex = (index) => SOLID_BACKGROUND_INDEXES.includes(String(index))

// 背景下拉框文案（设置页等只读展示用）
// 内置图片背景的中文名来自 builtinBackgrounds.js，避免同一张图两处起名
export const BACKGROUND_INDEX_LABELS = {
  0: '跟随面板配色',
  solid: '自定义纯色',
  custom: '自定义背景',
  ...Object.fromEntries(
    Object.entries(BUILTIN_BACKGROUNDS).map(([index, background]) => [index, background.label])
  ),
}

// 「自定义纯色」的默认颜色：与 index.scss 的 --color-bg（#12304d）一致。
// 引擎的 color 属性用 "r g b" 三个 0~1 的小数表示，改这里要同步 project.json 的 value。
export const DEFAULT_BACKGROUND_COLOR = '0.07058823529411765 0.18823529411764706 0.30196078431372547'

// 新安装默认打开雨滴（壁纸的主视觉）。纯色背景不渲染雨滴，见 BackgroundMain.vue
export const DEFAULT_RAIN_ENABLED = true

// rainconfig 的合法取值（与 public/project.json 的 options 一一对应）
export const RAIN_CONFIG_OPTIONS = ['auto', 'storm', 'heavy', 'moderate', 'light', 'none']

// 面板主题（与 public/project.json 的 options 一一对应）
export const COLOR_THEME_OPTIONS = ['night', 'mist', 'atlas']
export const DEFAULT_COLOR_THEME = 'night'

// forecastdays：预报条显示的天数（与 public/project.json 的 options 一一对应）
// 接口永远只请求一次 7 天，这里只决定「显示前几条」，切换不改任何请求
export const FORECAST_DAYS_OPTIONS = [5, 6, 7]
export const DEFAULT_FORECAST_DAYS = 5

// panelscale：天气面板整体缩放（1 = 设计原尺寸）
// 与 public/project.json 里的 min / max / value 保持一致，改一处要同步另一处
export const PANEL_SCALE_MIN = 0.5
export const PANEL_SCALE_MAX = 1.5
export const DEFAULT_PANEL_SCALE = 0.9

// 主界面相对屏幕中心的偏移（屏幕宽 / 高的百分比）；实际位置由 CSS 限制在屏幕内。
export const PANEL_OFFSET_MIN = -50
export const PANEL_OFFSET_MAX = 50
export const DEFAULT_PANEL_OFFSET = 0

// Bus 事件名
export const BUS_EVENTS = {
  SHOW_WEATHER_MAIN: 'ShowWeatherMain',
  RAIN_CONFIG_CHANGE: 'RainConfigChange',
  BACKGROUND_CONFIG_CHANGE: 'BackgroundConfigChange',
  // 运行中请求返回 401/402/403：用户填写的密钥失效/超额，需要重新打开引导页
  USER_API_INVALID: 'UserApiInvalid',
}

// 本地存储 key
export const STORAGE_KEYS = {
  BACKGROUND_INDEX: 'BackgroundIndex',
  WALLPAPER_BACKGROUND_COLOR: 'WallpaperBackgroundColor',
  WALLPAPER_RAIN_ENABLED: 'WallpaperRainEnabled',
  WALLPAPER_BACKGROUND_CONFIGS: 'WallpaperBackgroundConfigs',
  WALLPAPER_USER_RAIN_CONFIG: 'WallpaperUserConfigRainConfig',
  WALLPAPER_DEBUG_PROPERTIES: 'WallpaperDebugProperties',
  // 壁纸属性调试面板是否处于收起状态（刷新后保持）
  WALLPAPER_DEBUG_PANEL_COLLAPSED: 'WallpaperDebugPanelCollapsed',
  // 引擎上一次下发过的属性快照（页面重载后引擎不一定再补发，用它兜底）
  WALLPAPER_PROPERTY_SNAPSHOT: 'WallpaperPropertySnapshot',
  WALLPAPER_COLOR_THEME: 'WallpaperColorTheme',
  // 用户自选背景图（引擎下发的是本机绝对路径，重载后不一定再补发，单独落盘一份）
  WALLPAPER_CUSTOM_BACKGROUND: 'WallpaperCustomBackground',
  // 一言缓存（文案 + 来源 + 成功时间），用于 2 小时有效期和首屏兜底
  HITOKOTO_CACHE: 'HitokotoCache',
}
