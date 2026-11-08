# Vue CLI → Vite 迁移评估

> 评估对象：`simple-weather-app-design`（Vue 3.5 SPA，Wallpaper Engine 网页壁纸）
> 结论基于**实际 PoC 验证**：在临时副本里装 Vite、改配置、跑构建、用 Chromium 以 `file://` 打开、跑 dev server、模拟部署脚本，而不是只看文档推断。
> 你的项目本身没有任何改动（临时副本：`%TEMP%\vite-poc`，可随时删）。

---

## 一、结论先说

**成本不大，属于"小改造"，不是重写。**

- 纯配置 + 代码改动：**约 2–3 小时**（已有什么都不用改的地方，见第二节）
- 加上在 Wallpaper Engine 里肉眼回归两个雨滴效果：**半天到一天**
- 风险：**低**。真正会踩的坑只有 3 个，且都已实测出具体现象和修法（见第三、五节）
- 收益：dev server 启动/热更新快一个量级，构建从 19.9s → 6s，配置从 40 行"安全补丁"缩到几行，摆脱已停止新特性开发的 `vue-cli-service`

**前提（很重要）**：迁移后必须让构建产物仍然是"一个 classic script + 相对路径资源"，不能直接用 Vite 默认的 ESM 输出。这正是你说的 Wallpaper Engine 跨域问题的根源。

---

## 二、项目现状里"对迁移有利"的部分

| 项目特征 | 对迁移的影响 |
| --- | --- |
| Vue 3.5 SPA、单入口、**没有 vue-router** | 没有路由懒加载/分包，最简单的情况 |
| pinia + pinia-plugin-persistedstate、@vueuse、better-scroll、arco-design | 全是标准 ESM 包，Vite 原生支持，无需 polyfill 配置 |
| SCSS 只用了 `:deep()`，没有 `::v-deep` / `/deep/` / `>>>` | 样式一行都不用改（`::v-deep` 在 Vue 3 里已废弃） |
| 没有 `require.context`、没有自定义 webpack loader、没有 `devServer.proxy` | 没有 webpack 专有能力要"翻译" |
| 仅开发调试面板使用动态 `import()`，没有 `new URL(..., import.meta.url)` 取资源 | 调试面板与 Arco 需用 `import.meta.env.DEV` 隔离；生产仍可打成单 chunk |
| Worker 全部用 `URL.createObjectURL(blob)` | file:// 下可用，迁移后行为不变 |
| `.env` 目前**全是注释、没有任何键** | 环境变量这块几乎没有实际迁移工作量 |
| 本机 Wallpaper Engine 的 CEF = **Chromium 146**（读 `libcef.dll` 版本得知） | 不存在"语法太新跑不了"的问题，Vite 默认 `build.target` 就够 |

**真正需要动源码的只有 3 个文件**（两个 CJS 大库 + 一个 UMD 库）+ 一个 `process.env` 判断。

---

## 三、Wallpaper Engine 的 `file://` 到底卡在哪（已实测）

用 Chromium 无头模式直接打开 `file:///.../dist/index.html`，逐项验证：

| 产物形态 | 实测结果 |
| --- | --- |
| Vite 默认输出：`<script type="module" crossorigin src="./assets/index.js">` | **`<div id="app">` 始终为空**，JS 完全没执行（module script 的跨域检查在 file:// 下必然失败） |
| 改成 `<script defer src="...">`（经典脚本） | 应用正常挂载（初始引导页渲染出来了） |
| 但 `<link rel="stylesheet" crossorigin href="...">` 保留 | **JS 正常、DOM 正常、样式全丢**：`styleSheets` 里有一项，但 `getComputedStyle(document.body).backgroundColor` 是透明的，`cssRules` 读取被拒 |
| 去掉 stylesheet 上的 `crossorigin` | 样式生效：body 背景 `rgb(7,25,47)`，字体/布局/Canvas 尺寸全部正常 |

也就是说，**file:// 下有两条独立的跨域限制**：

1. `<script type="module">` —— 模块脚本一律按 CORS 拉取，`file://` 的 origin 是 `null`，直接失败；
2. `<link rel="stylesheet" crossorigin>` —— 带 `crossorigin` 的样式表同样走 CORS，**样式会被静默丢弃**。

第 2 条最阴，因为控制台报错很容易被忽略，而且页面"看起来还在跑"。Vite 默认会给 script 和 stylesheet 都加上 `crossorigin`，所以两个都要处理。

> 顺带确认：动态 `import()` 出的 chunk 在 file:// 下同样会失败。本项目现在没有，但迁移后要防止以后引入。

---

## 四、PoC 实测数据（临时副本，非你的工作区）

| 指标 | 现有 webpack（vue-cli 5） | Vite 5.4 方案 |
| --- | --- | --- |
| 生产构建耗时 | **19.9 s** | **5.7–6.2 s** |
| JS 体积 | 1300.47 KiB（gzip 384.28） | 1188.07 KiB（gzip 372.35） |
| CSS 体积 | 513.75 KiB（gzip 68.96） | 518.74 KiB（gzip 69.95） |
| 产物结构 | `js/ app.js`、`css/app.css`、`img/`、`fonts/` | `assets/`（js/css/图片/字体带 hash） |
| dev server 启动 | 未测 | **650 ms** ready |
| `file://` 直接打开 | 可用（当前方案） | **可用**：应用挂载、样式生效、Canvas 1250×705、`typeof window.html2canvas === 'function'` |
| `npm run deploy:we` 部署脚本 | 可用 | 可用，但**需要给清理列表加 `assets`**（见 5.7） |

构建产物的总大小基本持平，Vite 少的那 110 KB 主要是 babel 注入的 core-js polyfill（CEF 146 根本不需要）。

---

## 五、必须改的清单（按落地顺序）

### 5.1 `public/index.html` → 根目录 `index.html`

- 把 `public/index.html` 整个挪到项目根目录（Vite 的模板约定），
- 保留 `<head>` 里那段 `wallpaperPropertyListener` 的早期监听脚本（原样不动），
- 在 `</body>` 前加一行：

```html
<script type="module" src="/src/main.js"></script>
```

迁移完成后 `public/` 里只留 `favicon.ico`、`project.json`、`preview.jpg`（`public/fonts/` 见 5.8）。
`vue.config.js` 和 `public/index.html` 不能和 Vite 共存，所以这一步要跟着分支切换一起做。

### 5.2 `package.json`

```json
{
  "scripts": {
    "serve": "vite",
    "build": "vite build && node scripts/deploy-wallpaper-engine.js",
    "build:dist": "vite build",
    "deploy:we": "node scripts/deploy-wallpaper-engine.js",
    "lint": "eslint src --ext .js,.vue"
  }
}
```

- 新增 devDeps：`vite@^5.4`、`@vitejs/plugin-vue@^5`
- 删除：`@vue/cli-service`、`@vue/cli-plugin-babel`、`@vue/cli-plugin-eslint`、`sass-loader`、`babel.config.js`
- **保留** `@babel/eslint-parser` + `@babel/core`（ESLint 7 的解析器还要用，别一起删）
- `browserslist` 字段迁移后失效（由 `build.target` 决定），可留可删
- `@arco-design/web-vue` 保留在 devDependencies：仅开发调试面板使用，迁移时保留开发分支的异步导入及面板内 CSS 导入，生产构建不包含 Arco。

### 5.3 `vite.config.js`（已验证可用的完整版本）

```js
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 沿用现有的 VUE_APP_* 白名单：只把这些非敏感变量带进产物
const CLIENT_ENV_KEYS = [
  'VUE_APP_WEATHER_UPDATE_REALTIME',
  'VUE_APP_WEATHER_UPDATE_FOURDAYS',
  'VUE_APP_WEATHER_UPDATE_WARNING',
  'VUE_APP_WEATHER_UPDATE_INDICES',
  'VUE_APP_WEATHER_UPDATE_MINUTELY',
]

// file:// 兼容：去掉 crossorigin、把 module 脚本降级成经典脚本
const wallpaperEngineFileProtocol = () => ({
  name: 'we-file-protocol',
  enforce: 'post',
  transformIndexHtml (html) {
    return html
      .replace(/\scrossorigin(="[^"]*")?/g, '')
      .replace(/<script type="module"/g, '<script defer')
      .replace(/<link rel="modulepreload"[^>]*>/g, '')
  },
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const define = { 'process.env.NODE_ENV': JSON.stringify(mode) }
  for (const key of CLIENT_ENV_KEYS) {
    define[`process.env.${key}`] = JSON.stringify(env[key] || '')
  }

  return {
    base: './',
    plugins: [vue(), wallpaperEngineFileProtocol()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    define,
    build: {
      target: 'chrome87',        // CEF 146，够用；想更保守可以再降
      cssCodeSplit: false,        // 只出一个 CSS
      modulePreload: false,
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          format: 'iife',             // 经典脚本，file:// 下不会被 CORS 拦
          inlineDynamicImports: true, // 强制单 chunk，防止以后出现动态 import
        },
      },
    },
  }
})
```

几点说明：

- `base: './'` 对应原来的 `publicPath: './'`。
- `define` 里显式列 5 个变量，等价于原来 `vue.config.js` 里那段"裁剪 process.env"的 define hack，但**不再有密钥泄漏风险**：Vite 只会内联 `define` 里写死的字符串，不会把整个 env 对象塞进产物。
- `format: 'iife'` + `inlineDynamicImports` 是 file:// 的关键。副作用：以后代码里一旦出现 `import()`，构建会直接报错（这是好事，等于帮你守住了 file:// 的底线）。
- `build.target` 建议不要低于 `chrome87`，更老的目标要靠 `@vitejs/plugin-legacy`，而 legacy 的 SystemJS 在 file:// 下又会踩坑，不推荐。

### 5.4 两个 CJS 大库改成 ESM（这是唯一会**构建失败**的阻塞点）

Vite 的 commonjs 插件默认只处理 `node_modules`，项目源码里的 CommonJS 不会被转换，构建直接报：

```
"default" is not exported by "src/features/wallpaper/backgrounds/rain/RainEffectCore.js"
```

改法很简单——这两个文件末尾都是 `module.exports=`（全文件只出现一次），改成 `export default ` 即可：

```diff
- module.exports=(()=>{ ... })()
+ export default (()=>{ ... })()
```

- `src/features/wallpaper/backgrounds/rain/RainEffectCore.js`（约 18.6 万字符，只改末尾一处）
- `src/features/wallpaper/backgrounds/rain-overlay/lib/raindrop-fx.js`（只改第 5 行那处）

第三处 `html2canvas.min.js` 是 UMD，改法不同：不要动压缩代码，改 `RainOverlayAdapter.js` 的引用方式：

```diff
- import html2canvas from './lib/html2canvas.min.js'
+ import './lib/html2canvas.min.js'
+ const html2canvas = window.html2canvas
```

UMD 在没有 `exports/module` 的环境会挂到 `globalThis`，实测打包后 `typeof window.html2canvas === 'function'`。

### 5.5 `process.env.NODE_ENV`（不报错但会坏）

`BackgroundMain.vue` 里：

```diff
- let NODE_ENV = process.env.NODE_ENV || 'development';
+ const IS_DEV = import.meta.env.DEV;
```

```diff
- <WallpaperDebugPanel v-if="NODE_ENV === 'development'" />
+ <WallpaperDebugPanel v-if="IS_DEV" />
```

Vite 不会自动定义 `process`，这个判断在浏览器里会抛 `process is not defined`（在 `setup()` 里，会直接打断 `BackgroundMain` 的渲染）。注意它和 `weatherCache.js` 不同：后者每个变量都包了 `try/catch`，所以不会炸，但新写法还是建议一起清掉。

### 5.6 环境变量（可选清理）

现在 `.env` 里实际上没有任何键，所以迁移时**可以完全不动**（5.3 的 `define` 已经兼容 `VUE_APP_*`）。如果想让写法更"Vite 味"：

- `.env` / `.env.example` 里 `VUE_APP_*` → `VITE_*`
- `weatherCache.js` 里 `process.env.VUE_APP_...` → `import.meta.env.VITE_...`
- 顺手删掉 `weatherCache.js` 里那段解释 vue-cli `DefinePlugin` 的注释（已过时）
- `README.md` 里关于 `vue-cli` 把 `VUE_APP_*` 内联进产物的说明要同步改（Vite 只暴露 `VITE_*`，反而更安全）

### 5.7 部署脚本：加一个 `assets`

Vite 把带 hash 的资源都放进 `assets/`，而 `scripts/deploy-wallpaper-engine.js` 的清理列表还是 webpack 时代的：

```diff
- const BUILD_ENTRIES = ['index.html', 'seed.html', 'favicon.ico', 'css', 'js', 'img', 'fonts']
+ const BUILD_ENTRIES = ['index.html', 'seed.html', 'favicon.ico', 'css', 'js', 'img', 'fonts', 'assets']
```

不加的后果我实测复现了：每次部署旧的 hash 文件都会堆在 WE 工程目录里，越积越多（`assets/stale-from-old-build.js` 在第二次部署后依然存在）。

建议再加一个 10 行的构建后自检（`scripts/check-dist.js`，接在 `vite build` 后面）：

```js
const fs = require('fs')
const html = fs.readFileSync('dist/index.html', 'utf8')
if (/type="module"|crossorigin/.test(html)) {
  throw new Error('dist/index.html 含 module/crossorigin，file:// 下会白屏或丢样式')
}
```

### 5.8 顺手清理（非必须）

- `public/fonts/` 里还有一套 `qweather-icons.*`（约 490 KB），字体实际走 `qweather-icons` 包的 CSS（打进 `assets/`），这套大概率是历史遗留，确认无引用后可删。
- `scripts/deploy-wallpaper-engine.js` 的 `BUILD_ENTRIES` 里 `seed.html` 已经不存在，可删。
- `README.md` 有 10 处左右 `vue-cli / vue.config / VUE_APP` 的描述，加上 `build.bat` / `start.bat`（`yarn build` / `yarn serve` 不变，其实不用改）。

---

## 六、风险与注意

| 风险 | 说明 / 对策 |
| --- | --- |
| 两个 `index.html` 不能共存 | Vite 要根目录的，vue-cli 要 `public/` 的。建议开分支一次性切换，不要试图在同一工作区长期并行 |
| 雨滴效果必须肉眼回归 | `RainEffectCore`（背景 4，WebGL）和 `raindrop-fx` + `html2canvas`（背景 5，整页雨珠）都动过导出方式；构建通过 ≠ 运行正确。回归项：背景 0/4/5 切换、雨量档位、整页雨珠的折射/模糊、属性面板改值后的整页重载 |
| CSS 顺序可能变化 | webpack 与 Rollup 的模块遍历顺序不同，`arco.css` 和 `index.scss` 的先后可能变，覆盖关系要肉眼核对（本项目只有一处全局顺序，风险低） |
| 以后不要引入动态 `import()` | file:// 下会重新踩 CORS。`inlineDynamicImports` + 5.7 的构建后自检就是为这个兜底 |
| Vite 版本与 Node | 本机 Node 21.7：**Vite 7 要求 Node ≥ 20.19 或 ≥ 22.12，装不上**，用 Vite 5.4/6 即可；想用 Vite 7 先升 Node |
| `chunkSizeWarningLimit` | 单 chunk 1.2 MB 必然触发 500 KB 警告，调高阈值即可，不是问题 |
| vue-cli 的 `transpileDependencies` / `productionSourceMap` / `chainWebpack` | 在 Vite 里没有对应物：前者不需要，sourcemap 默认关，`splitChunks` 那两行是为了单文件产物，Vite 默认就是单 chunk |
| ESLint 7 | `eslint src --ext .js,.vue` 可以继续用，配置不用动；升级 ESLint 9 flat config 是**另一件事**，别混在这次迁移里 |

---

## 七、成本估算

| 任务 | 预计 |
| --- | --- |
| `vite.config.js` + package.json + 依赖调整 | 1 h |
| `index.html` 迁移、`public/index.html` 移除 | 0.25 h |
| 3 个 CJS/UMD 库改造 | 0.5 h |
| `process.env` / 环境变量 / 注释同步 | 0.5 h |
| 部署脚本 + 构建后自检 | 0.25 h |
| 本地验证（dev + 双击 dist + 体积/耗时对比） | 0.5 h |
| **在 Wallpaper Engine 里回归两个雨滴效果 + 属性面板** | **1–2 h** |
| README / babel / vue.config 清理 | 0.5 h |
| **合计** | **约 4.5–6 h（含 WE 回归）** |

不含 ESLint 9 升级、不含把样式里 `@import` 改成 `@use` 这类可选清理。

---

## 八、建议的落地顺序

1. 开分支（例如 `chore/vite`），先只做配置 + 3 个库 + `NODE_ENV`；
2. `npm run build:dist`（不部署），**直接双击 `dist/index.html`**：控制台无 CORS 报错、样式正常、引导页能操作 —— 这一关过了，file:// 就没问题了；
3. `npm run serve` 跑一遍 dev server（650 ms 级别启动），确认 HMR、调试悬浮块、属性监听都正常；
4. 临时把 `WE_PROJECT_DIR` 指到一个假目录试跑 `deploy:we`，确认只覆盖产物、`project.json` 的属性能合并；
5. 再真正部署到 WE 工程，重启壁纸，按第六节的回归项过一遍；
6. 全部通过后再删 `vue.config.js`、`public/index.html`、`babel.config.js`，更新 README，合并。

---

## 九、备选方案对比

| 方案 | 做法 | 评价 |
| --- | --- | --- |
| **A. 经典 IIFE + 外链资源（推荐，已实测）** | 5.3 的配置 | 产物结构和现在最接近，部署脚本只改一行；图片/字体仍是独立文件，HTML 只有 1.7 KB |
| B. `vite-plugin-singlefile` | 所有 JS/CSS 内联进一个 `index.html` | 也能解决 file://，适合"我只想发一个文件"；默认会把 620 KB 的 jpg 也 base64 进 HTML（+33%），需要额外配置才能只内联 JS/CSS |
| C. 继续用 Vue CLI 5 | 不动 | 现状能给 WE 用，迁移不是修 bug，纯工具链升级；代价是继续用已停止新特性开发、构建 20s 的方案 |

**我的判断**：如果迁移的动机是"开发体验/构建速度/长期维护"，值得做，成本 1 天以内；如果只是想解决某个 WE 上的具体问题，先确认问题是不是真的由构建方式引起——现在的 webpack 产物已经能在 WE 里跑。
