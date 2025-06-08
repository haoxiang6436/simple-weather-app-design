// 中雨配置 (默认值)
const moderateRainConfig = {
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
  velocitySpread: 0.8,          // 速度增加
  gravity: 3200,                // 重力增加
  trailSpread: 0.9,             // 拖尾效果增强
  dropletsPerSeconds: 1200,      // 小雨滴数量大幅增加
  dropletSize: [15, 40],        // 小雨滴变大
  spawnInterval: [0.05, 0.08],  // 生成间隔缩短
  spawnSize: [80, 150],         // 雨滴更大
  spawnLimit: 800               // 允许更多雨滴同时存在
};

// 小雨配置 - 更稀疏、更轻柔的雨滴
const lightRainConfig = {
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
  heavy: heavyRainConfig, // 大雨配置
  moderate: moderateRainConfig, // 中雨配置
  light: lightRainConfig,// 小雨配置
  none: noRainConfig  // 无雨配置
};