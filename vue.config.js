const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  transpileDependencies: true,
  publicPath: './', // 配置默认路径从 绝对->相对 ,方便打包后的文件能直接在本地运行
  productionSourceMap: false, // 不生成.js.map文件
  chainWebpack: config => {
    config.optimization.delete('splitChunks')
    config.optimization.concatenateModules(false)
  }
})
