const { defineConfig } = require('@vue/cli-service')

// 允许进入构建产物的非敏感环境变量（只有缓存时效）。
// 即使有人往 .env 里加了 VUE_APP_* 密钥，也不会被这些逐项访问带进包。
const CLIENT_ENV_KEYS = [
  'VUE_APP_WEATHER_UPDATE_REALTIME',
  'VUE_APP_WEATHER_UPDATE_FOURDAYS',
  'VUE_APP_WEATHER_UPDATE_WARNING',
  'VUE_APP_WEATHER_UPDATE_INDICES',
  'VUE_APP_WEATHER_UPDATE_MINUTELY',
]

module.exports = defineConfig({
  transpileDependencies: true,
  publicPath: './', // 配置默认路径从 绝对->相对 ,方便打包后的文件能直接在本地运行
  productionSourceMap: false, // 不生成.js.map文件
  chainWebpack: config => {
    config.optimization.delete('splitChunks')
    config.optimization.concatenateModules(false)

    // vue-cli 默认把整个 process.env（含所有 VUE_APP_*）定义成对象字面量，
    // 一旦 .env 里出现密钥就会明文进包。这里把 env 对象裁剪成只含缓存时效等
    // 非敏感项，再把 5 个缓存时效变量显式定义成字符串（缺失时为空串），
    // 保证无论 webpack 走对象还是走逐项替换，产物里都不会出现密钥。
    config.plugin('define').tap((args) => {
      const definitions = args[0] || {}
      const clientEnv = definitions['process.env']
      if (clientEnv && typeof clientEnv === 'object') {
        const allowed = new Set(['NODE_ENV', 'BASE_URL', ...CLIENT_ENV_KEYS])
        Object.keys(clientEnv).forEach((key) => {
          if (!allowed.has(key)) delete clientEnv[key]
        })
      }
      CLIENT_ENV_KEYS.forEach((key) => {
        definitions[`process.env.${key}`] = JSON.stringify(process.env[key] || '')
      })
      return args
    })
  }
})
