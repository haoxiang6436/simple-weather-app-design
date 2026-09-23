/**
 * 整页雨珠叠加（backgroundindex = 5）专属的雨量预设
 *
 * 为什么不复用 `rain/RainConfig.js`：
 *   `4 实时渲染雨滴` 是「自带背景图的全屏后处理」，它的雨滴画在不透明的底图上，
 *   大颗、密、糊一点都无所谓；而 `5` 的雨珠是盖在真实 UI 文字上面的，
 *   同样的参数不仅会糊住文字，还会因为凝结水珠层（只增不减的水渍）越积越脏。
 *   所以这里单开一套：雨滴更小更疏、拖尾更克制，凝结水珠层改成小颗粒低密度
 *   （2~20px、150 个/秒），既能看到湿润的玻璃感，又不会糊住文字。
 *
 * 四档强度：light 小雨 / moderate 中雨 / heavy 大雨 / storm 暴雨（none 为雨停）。
 * 与实时天气的对应关系见 `features/wallpaper/rainIntensity.js`。
 *
 * 参数语义（来自 raindrop-fx v1.0.8 源码）：
 *   spawnInterval  两次生成下落雨滴之间的秒数（越小越密）
 *   spawnSize      下落雨滴的尺寸区间（px，决定初始质量 → 视觉大小）
 *   spawnLimit     同时存在的下落雨滴上限
 *   gravity        下滑速度（越大越急）
 *   velocitySpread 速度随机度
 *   trailSpread    拖尾水滴的扩散程度（越大拖尾越明显）
 *   trailDropDensity 拖尾水滴密度
 *   shrinkRate     雨滴边滑边缩小的速率（越大越快消失）
 *   evaporate      下落雨滴的质量蒸发速率
 *   dropletsPerSeconds / dropletSize  凝结水珠层（就是“水渍”，只增不减）
 *   refractBase / refractScale        折射强度
 *
 * 拖尾参数为什么这么小：
 *   库里的 `split()` 每走一段 trailDistance 就复制出一颗拖尾水滴，并**从父水滴身上扣掉它的质量**
 *   （`this.mass -= i.mass`），而拖尾水滴的质量 = (父尺寸 × trailDropSize × trailDropDensity)²。
 *   默认 [0.3, 0.5] + 0.38 + 间距 [20,30] 时，大水滴一秒内就把大半质量转给了拖尾，
 *   尺寸从 138 掉到 47（实测：60fps 等效下 10 秒内 top20% 尺寸 138 → 47）——
 *   表现就是「刚切到暴雨那一下很大，随后越来越小」。把拖尾水滴调小调稀、间距拉长后，
 *   父水滴质量基本不流失，尺寸稳定在 121 左右（同一实测口径）。
 */

// 叠加模式下的公共项：效果强度只体现在「下落雨滴 + 拖尾」上
const overlayBase = {
  // 雾气层会把整页糊成一片，叠加模式一律关闭
  mist: false,
  // 折射源（预模糊过的底图）本身已经很柔，这里只补一点
  backgroundBlurSteps: 1,
  raindropShadowOffset: 0.75,

  // 与 4 同语义的公共项，写出来便于单独调
  slipRate: 0,
  colliderSize: 1,
  motionInterval: [0.1, 0.4],
  initialSpread: 0.5,
  smoothRaindrop: [0.96, 0.99],
  raindropEraserSize: [0.93, 1],
  trailDistance: [70, 120], // 拖尾水滴的间距（越大：父水滴掉质量越慢）
  trailDropSize: [0.12, 0.22], // 拖尾水滴相对父水滴的尺寸
  xShifting: [0, 0.12],

  // 凝结水珠层（就是“水渍”那一层）：只被下落雨滴擦掉、不会自己变淡。
  // 默认开启：2~20px 的小颗粒、150 个/秒，靠不停落下的雨滴不断擦掉，
  // 一般会稳定在「玻璃上有水汽」的程度；觉得太糊可以把数量调低
  // （调试面板：凝结水珠数量/秒；壁纸引擎里没有这个属性，改这里即可）。
  dropletsPerSeconds: 150,
  dropletSize: [2, 20],
}

// 小雨：偶尔几颗小水珠慢慢滑，几乎不影响阅读
const lightRainConfig = {
  ...overlayBase,
  gravity: 1500,
  velocitySpread: 0.22,
  spawnInterval: [0.42, 0.68], // 约 1.8 滴/秒
  spawnSize: [26, 50],
  spawnLimit: 60,
  trailSpread: 0.34,
  trailDropDensity: 0.1,
  shrinkRate: 0.016,
  evaporate: 12,
  refractBase: 0.4,
  refractScale: 0.6,
}

// 中雨：默认档，能明显看出在下雨，同时文字仍然清楚
const moderateRainConfig = {
  ...overlayBase,
  gravity: 2200,
  velocitySpread: 0.34,
  spawnInterval: [0.15, 0.24], // 约 5 滴/秒
  spawnSize: [40, 78],
  spawnLimit: 150,
  trailSpread: 0.5,
  trailDropDensity: 0.16,
  shrinkRate: 0.013,
  evaporate: 11,
  refractBase: 0.45,
  refractScale: 0.7,
}

// 大雨：明显比中雨密、雨滴也更大，能看到连成片的雨帘
const heavyRainConfig = {
  ...overlayBase,
  gravity: 3300,
  velocitySpread: 0.62,
  spawnInterval: [0.04, 0.07], // 约 18 滴/秒
  spawnSize: [62, 112],
  spawnLimit: 320,
  trailSpread: 0.74,
  trailDropDensity: 0.22,
  shrinkRate: 0.01,
  evaporate: 10,
  refractBase: 0.52,
  refractScale: 0.85,
}

// 暴雨：雨滴又大又密、落得急，几乎是一层流动的雨幕（面板依旧可读，只是遮挡明显变多）
const stormRainConfig = {
  ...overlayBase,
  gravity: 3700,
  velocitySpread: 0.72,
  spawnInterval: [0.018, 0.04], // 约 34 滴/秒
  spawnSize: [76, 138],
  spawnLimit: 460,
  trailSpread: 0.82,
  trailDropDensity: 0.26,
  shrinkRate: 0.009,
  evaporate: 9,
  refractBase: 0.56,
  refractScale: 0.9,
  xShifting: [0, 0.18],
}

// 雨停：沿用小雨的手感，但不生成任何雨滴
// 凝结水珠层保持关闭：没有下落雨滴去擦，150 个/秒会只增不减地越积越糊
const noRainConfig = {
  ...overlayBase,
  gravity: 1500,
  velocitySpread: 0.22,
  spawnInterval: [0.42, 0.68],
  spawnSize: [26, 50],
  spawnLimit: 0,
  dropletsPerSeconds: 0,
  trailSpread: 0.34,
  trailDropDensity: 0.1,
  shrinkRate: 0.016,
  evaporate: 12,
  refractBase: 0.4,
  refractScale: 0.6,
}

export const overlayRainPresets = {
  storm: stormRainConfig,
  heavy: heavyRainConfig,
  moderate: moderateRainConfig,
  light: lightRainConfig,
  none: noRainConfig,
}
