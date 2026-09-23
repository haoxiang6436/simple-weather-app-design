// 中雨配置 (默认值)
const moderateRainConfig = {
  // 拖尾参数：库里 split() 会把父水滴的质量转给拖尾水滴，默认 [0.3,0.5]/[20,30] 会让大水滴
  // 十几秒内缩水成小水滴（「刚切换那一下很大，随后越来越小」）。改成小、稀、间距长即可稳住尺寸。
  trailDistance: [70, 120],
  trailDropSize: [0.12, 0.22],
  trailDropDensity: 0.16,
  velocitySpread: 0.3,
  gravity: 2400,
  trailSpread: 0.6,
  dropletsPerSeconds: 500,
  dropletSize: [10, 30],
  spawnInterval: [0.1, 0.1],
  spawnSize: [60, 100],
  spawnLimit: 500
};

// 大雨配置 - 更密集、更快的雨滴
const heavyRainConfig = {
  trailDistance: [70, 120],
  trailDropSize: [0.12, 0.22],
  trailDropDensity: 0.22,
  velocitySpread: 0.8,          // 速度增加
  gravity: 3200,                // 重力增加
  trailSpread: 0.9,             // 拖尾效果增强
  dropletsPerSeconds: 1200,      // 小雨滴数量大幅增加
  dropletSize: [15, 40],        // 小雨滴变大
  spawnInterval: [0.05, 0.08],  // 生成间隔缩短
  spawnSize: [80, 150],         // 雨滴更大
  spawnLimit: 800               // 允许更多雨滴同时存在
};

// 暴雨配置 - 最强档：雨滴更大更密、落得更急，拖尾也更明显
const stormRainConfig = {
  trailDistance: [70, 120],
  trailDropSize: [0.12, 0.22],
  trailDropDensity: 0.26,
  velocitySpread: 1.0,
  gravity: 3600,
  trailSpread: 1.0,
  dropletsPerSeconds: 1800,
  dropletSize: [18, 46],
  spawnInterval: [0.03, 0.05],
  spawnSize: [95, 180],
  spawnLimit: 1100
};

// 小雨配置 - 更稀疏、更轻柔的雨滴
const lightRainConfig = {
  trailDistance: [70, 120],
  trailDropSize: [0.12, 0.22],
  trailDropDensity: 0.1,
  velocitySpread: 0.15,         // 速度减慢
  gravity: 1800,                // 重力减小
  trailSpread: 0.3,             // 拖尾效果减弱
  dropletsPerSeconds: 200,       // 小雨滴数量减少
  dropletSize: [5, 20],         // 小雨滴变小
  spawnInterval: [0.2, 0.3],    // 生成间隔延长
  spawnSize: [30, 70],          // 雨滴更小
  spawnLimit: 300               // 限制雨滴数量
};

// 无雨配置 - 完全关闭雨滴效果
const noRainConfig = {
  trailDistance: [70, 120],
  trailDropSize: [0.12, 0.22],
  trailDropDensity: 0.1,
  velocitySpread: 0.3,
  gravity: 2400,
  trailSpread: 0.6,
  dropletsPerSeconds: 0, // 不生成雨滴
  dropletSize: [10, 30],
  spawnInterval: [0.1, 0.1],
  spawnSize: [60, 100],
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
