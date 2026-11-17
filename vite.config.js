import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// 版本号的唯一来源是 package.json 的 version：这里读一次，注入给前端（src/config/version.js），
// 同时写一份 dist/version.json 交给部署脚本核对。页面里不要再手写版本字符串。
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'))

// 构建机没有 git（或不是仓库）时返回空串，页面只显示版本号 + 日期，不显示提交。
function readGitCommit () {
  try {
    return execSync('git describe --tags --always --dirty', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

// 用构建机的本地日期，别用 ISO 串直接截前 10 位：那是 UTC，会给北京时间减出前一天。
function formatBuildDate (date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const builtAt = new Date()
const buildInfo = {
  version: pkg.version,
  builtOn: formatBuildDate(builtAt),
  builtAt: builtAt.toISOString(),
  commit: readGitCommit(),
}

/**
 * 把构建信息落成 dist/version.json。
 * 前端不读它（版本已经用 define 注入了），它的用途是「这个目录里跑的是哪一版」
 * —— 部署脚本、排查用户反馈、以及以后做更新检查时都能直接拿出来看。
 */
const buildInfoFile = () => ({
  name: 'emit-build-info',
  apply: 'build',
  generateBundle () {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: `${JSON.stringify(buildInfo, null, 2)}\n`,
    })
  },
})

// 允许进入构建产物的非敏感环境变量（只有缓存时效）。
// 与旧 vue.config.js 的 CLIENT_ENV_KEYS 保持一致，逐项读取，绝不整体注入 process.env，
// 避免 .env 里误填的密钥被带进 dist。
const CLIENT_ENV_KEYS = [
  'VUE_APP_WEATHER_UPDATE_REALTIME',
  'VUE_APP_WEATHER_UPDATE_FOURDAYS',
  'VUE_APP_WEATHER_UPDATE_WARNING',
  'VUE_APP_WEATHER_UPDATE_INDICES',
  'VUE_APP_WEATHER_UPDATE_MINUTELY',
  'VUE_APP_WEATHER_UPDATE_AIR',
]

const fileUrlSafe = () => ({
  name: 'file-url-safe',
  // 只在构建产物上做 file:// 兼容改写。dev server 必须保留 type=module，
  // 否则入口模块图无法执行（白屏）。
  apply: 'build',
  // Vite 5 写法：transformIndexHtml 用 order，插件级 enforce 不能替代。
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      return html
        // file:// 下带 crossorigin 的样式会被静默丢弃，必须去掉
        .replace(/\s+crossorigin(="[^"]*")?/g, '')
        // file:// 下 type="module" 不执行，改成 defer 的 classic script
        .replace(/<script type="module"/g, '<script defer')
        // 动态 import() 在 file:// + iife 产物下不可用，删掉 modulepreload
        .replace(/<link rel="modulepreload"[^>]*>/g, '')
    },
  },
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VUE_APP_')

  // Vite 不会像 Vue CLI 那样把 .env 注入 process.env，这里逐项写进 define。
  // weatherCache.js 只按名字访问这几个变量，缺失时 try/catch 兜底静默回退默认值，
  // 因此漏配不会报错，只会在 .env 覆盖失效时才暴露。
  const define = {
    'process.env.NODE_ENV': JSON.stringify(mode),
    // 版本信息：dev / build 都注入，未走 Vite 的环境不会看到这些标识符。
    __APP_VERSION__: JSON.stringify(buildInfo.version),
    __APP_BUILD_DATE__: JSON.stringify(buildInfo.builtOn),
    __APP_BUILD_COMMIT__: JSON.stringify(buildInfo.commit),
  }
  for (const key of CLIENT_ENV_KEYS) {
    define[`process.env.${key}`] = JSON.stringify(env[key] || '')
  }

  return {
    base: './',
    plugins: [vue(), fileUrlSafe(), buildInfoFile()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    define,
    build: {
      minify: 'terser',
      // Wallpaper Engine 内置 CEF 为 Chromium 146（libcef.dll 146.0.7680.179，2026-11-09 实测），
      // 现代语法/API 全部原生支持，target 用 esnext 可直接跳过 esbuild 的整包降级，
      // 也顺带避开 esbuild 在 Windows 上删除 >1MB 临时文件时报 Access is denied 的问题。
      target: 'esnext',
      cssCodeSplit: false,
      modulePreload: false,
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          format: 'iife',
          inlineDynamicImports: true,
        },
      },
    },
  }
})