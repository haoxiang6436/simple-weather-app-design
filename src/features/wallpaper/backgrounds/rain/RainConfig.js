/**
 * 实时雨滴（RaindropFX）的五档雨量预设。
 *
 * 视觉上要像「雨水打在玻璃上」，而不是一层油膜，关键有三点：
 *
 *   1. 雨滴要小。RaindropFX 的 dropletSize 是画面上静态小水珠的半径，
 *      spawnSize 是滑动水珠的初始半径（像素）。它们越大，水珠越像一片
 *      凸透镜：整块背景被拉伸成一团，几十个叠在一起就是「油」。官方示例
 *      的滑动水珠也只用到 30~80，这里所有档位都控制在这个量级。
 *   2. 强度靠「数量 / 速度 / 拖尾」区分，不靠尺寸。大雨、暴雨应该是水珠
 *      更密、滑得更快、拖出来的水痕更长，而不是水珠变大。
 *   3. 水珠需要有反光。RaindropFX 默认 raindropSpecularLight 是 [0,0,0]，
 *      水滴只有一圈暗边、没有高光，看起来就像油滴；补一点高光、压掉
 *      默认扩散阴影，才会像水。
 *
 * 另外背景模糊从默认的 3 级降到 2 级：3 级把底图糊成油画，油膜感会更重。
 */
const sharedRainOptions = {
  // 高光：很淡的冷白色，只在水珠上沿留一条亮边
  raindropSpecularLight: [0.5, 0.55, 0.6],
  raindropSpecularShininess: 200,
  // 压掉默认的灰黑扩散阴影（0.2 + 阴影偏移 0.8 会在水珠边缘描一圈黑边）
  raindropDiffuseLight: [0.05, 0.06, 0.07],
  raindropShadowOffset: 0.9,
  // 底图轻度失焦即可；3 级会糊成油画，油膜感更重
  backgroundBlurSteps: 2,
};

// 中雨配置 (默认值)
const moderateRainConfig = {
  ...sharedRainOptions,
  // 拖尾参数：库里 split() 会把父水滴的质量转给拖尾水滴，默认 [0.3,0.5]/[20,30] 会让大水滴
  // 十几秒内缩水成小水滴（「刚切换那一下很大，随后越来越小」）。改成小、稀、间距长即可稳住尺寸。
  trailDistance: [60, 105],
  trailDropSize: [0.14, 0.26],
  trailDropDensity: 0.18,
  velocitySpread: 0.3,
  gravity: 2400,
  trailSpread: 0.6,
  dropletsPerSeconds: 500,
  dropletSize: [6, 20],
  spawnInterval: [0.12, 0.2],
  spawnSize: [30, 60],
  spawnLimit: 450
};

// 大雨配置 - 雨珠更密、滑得更快、水痕更长，但雨珠本身不放大
const heavyRainConfig = {
  ...sharedRainOptions,
  trailDistance: [50, 90],
  trailDropSize: [0.16, 0.28],
  trailDropDensity: 0.24,
  velocitySpread: 0.6,          // 速度差稍大，水珠滑落更有层次
  gravity: 3000,
  trailSpread: 0.8,             // 拖尾更明显
  dropletsPerSeconds: 1100,      // 静态小雨珠更密
  dropletSize: [7, 22],
  spawnInterval: [0.07, 0.12],
  spawnSize: [34, 70],
  spawnLimit: 650
};

// 暴雨配置 - 最密最快：细密水珠铺满玻璃，滑动水珠带出长水痕
const stormRainConfig = {
  ...sharedRainOptions,
  trailDistance: [45, 80],
  trailDropSize: [0.16, 0.3],
  trailDropDensity: 0.3,
  velocitySpread: 0.8,
  gravity: 3600,
  trailSpread: 0.95,
  dropletsPerSeconds: 1600,
  dropletSize: [8, 24],
  spawnInterval: [0.04, 0.07],
  spawnSize: [38, 80],
  spawnLimit: 850
};

// 小雨配置 - 更稀疏、更轻柔的雨滴
const lightRainConfig = {
  ...sharedRainOptions,
  trailDistance: [65, 115],
  trailDropSize: [0.12, 0.22],
  trailDropDensity: 0.1,
  velocitySpread: 0.15,         // 速度减慢
  gravity: 1800,
  trailSpread: 0.3,             // 拖尾效果减弱
  dropletsPerSeconds: 220,
  dropletSize: [5, 16],
  spawnInterval: [0.18, 0.3],
  spawnSize: [24, 48],
  spawnLimit: 260
};

// 无雨配置 - 完全关闭雨滴效果
const noRainConfig = {
  ...sharedRainOptions,
  trailDistance: [70, 120],
  trailDropSize: [0.12, 0.22],
  trailDropDensity: 0.1,
  velocitySpread: 0.3,
  gravity: 2400,
  trailSpread: 0.6,
  dropletsPerSeconds: 0, // 不生成雨滴
  dropletSize: [6, 20],
  spawnInterval: [0.1, 0.1],
  spawnSize: [30, 60],
  spawnLimit: 0
};

// 导出所有配置
export const rainPresets = {
  storm: stormRainConfig, // 暴雨配置
  heavy: heavyRainConfig, // 大雨配置
  moderate: moderateRainConfig, // 中雨配置
  light: lightRainConfig,// 小雨配置
  none: noRainConfig  // 无雨配置
};
