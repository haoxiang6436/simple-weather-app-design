# Vue CLI → Vite 迁移要点（PoC 已验证，项目尚未改动）

**结论**：小改造，约 4.5–6 h（含 Wallpaper Engine 内回归雨滴效果）。构建 19.9s → ~6s，dev 启动 650ms，体积持平。

## 核心约束：`file://` 有两条 CORS 限制
1. `<script type="module">` 在 file:// 下不执行（页面空白）；
2. `<link rel="stylesheet" crossorigin>` 样式被静默丢弃。

所以产物必须是 **classic script + 无 crossorigin + 相对路径**，动态 `import()` 也不可用。

## 必改清单
1. `public/index.html` 移到根目录，保留 `<head>` 里的 `wallpaperPropertyListener`，加 `<script type="module" src="/src/main.js"></script>`。
2. `package.json`：
   - 依赖：加 `vite@^5.4`、`@vitejs/plugin-vue@^5`；删 `@vue/cli-*`、`sass-loader`、`babel.config.js`；**保留** `@babel/eslint-parser` 与 `@babel/core`。固定 Vite 5（Node ≥ 18 即可；Node 21 装不了 Vite 7），README 的 Node 要求同步。
   - **lint 配置**：删掉 `babel.config.js` 后，`@babel/eslint-parser` 会报 “No Babel config”。在 `eslintConfig.parserOptions` 里加 `requireConfigFile: false`。
   - **scripts** 全部改写（现有的都调用 `vue-cli-service`，删依赖后会失效）：
     - `serve` → `vite`
     - `build:dist` → `vite build`
     - `build` → `vite build && node scripts/deploy-wallpaper-engine.js`
     - `lint` → `eslint --ext .js,.vue src`
     - `preview:rain` → `vite --open /dev/minutely-rain.html --host 127.0.0.1 --port 8081`（见第 8 条）
3. `vite.config.js`：
   - `base: './'`、`@` 别名；
   - `define` 只内联白名单 `VUE_APP_WEATHER_UPDATE_*` 与 `process.env.NODE_ENV`。**Vite 不会像 Vue CLI 那样把 `.env` 注入 `process.env`**，必须用 `loadEnv(mode, process.cwd(), 'VUE_APP_')` 读取后逐项写入 `define`（形如 `'process.env.VUE_APP_WEATHER_UPDATE_REALTIME': JSON.stringify(env.…|| '')`）。漏了不会报错——`weatherCache.js` 的 try/catch 会吞掉异常，`.env` 覆盖会悄悄失效，验证时要在 `.env` 里设一个值并确认产物里出现；
   - `build`：`target: 'chrome87'`、`cssCodeSplit: false`、`modulePreload: false`、`rollupOptions.output: { format: 'iife', inlineDynamicImports: true }`；
   - 自定义插件的 `transformIndexHtml: { order: 'post', handler(html) {…} }`（Vite 5 写法；`enforce: 'post'` 是插件级选项，不能替代 `order`）：去掉 `crossorigin`，`<script type="module"` → `<script defer`，删 `modulepreload`。
4. CJS → ESM（否则构建失败）：`RainEffectCore.js` 末尾 `module.exports=` 改 `export default `。
   - 另外：Vite 只降级语法、不补 API（现有产物带 core-js，迁移后没有）。`target: 'chrome87'` 须与 Wallpaper Engine 内置 Chromium 版本核对，**确认版本后写在此处**。
5. `BackgroundMain.vue`：`process.env.NODE_ENV` → `import.meta.env.DEV`（Vite 无 `process`）。调试面板与 Arco 用 DEV 分支隔离。
   - `RainEffectCore.js` 改完后同步头部注释。
6. 部署脚本 `BUILD_ENTRIES` 加 `assets`（否则旧 hash 文件堆积），可删已不存在的 `seed.html`；建议加构建后自检：`dist/index.html` 含 `type="module"` 或 `crossorigin` 则报错。
7. 可选：`VUE_APP_*` → `VITE_*`（改名后 `define` 白名单、`weatherCache.js` 的 `envKey`、`.env.example` 一并改）；清理 `public/fonts/` 里重复的 `qweather-icons.*`（源码无引用，与 `qweather-icons/font/*.css` 打出的字体重复，约 490KB）。
8. **开发预览入口**：`preview:rain` 现用 `vue-cli-service serve src/dev/minutelyRainPreview.js`，另有 `src/dev/warningPreview.js`。Vite 不能直接指定 JS 入口，需各加一个 HTML（如 `dev/minutely-rain.html`、`dev/warning.html`，内含 `<div id="app">` 与 `<script type="module" src="/src/dev/xxx.js">`），只用于 dev server，**不得**加入正式构建的 `rollupOptions.input`。
9. **文档与脚本同步**：README（“Vue CLI 5”、各条命令、Node 版本）、`.env.example`（“vue-cli 会内联 VUE_APP_*”的说明）、`build.bat`、`start.bat`（现为 `yarn serve`）。仓库里同时有 `yarn.lock`、`package-lock.json`、`.pnpm-store`，与 README “二选一”冲突，迁移时统一。

## 风险
- 两个 `index.html` 不能共存，须开分支一次性切换。
- 回归项：背景 0/4 切换并刷新页面、雨量档位、属性面板改值（构建通过 ≠ 运行正确）。
- Rollup 与 webpack 的 CSS 顺序可能不同，核对 `arco.css` 与 `index.scss` 覆盖关系。
- 单 chunk 超 500KB 警告：调高 `chunkSizeWarningLimit`。
- `src/style/index.scss` 用 `@import url(../style/font.css)` 引字体，核对产物里字体 URL 正确（相对路径、无 crossorigin 问题）；新版 Sass 对 `@import` 有弃用警告，不影响构建。
- ESLint 升级属另一件事，别混入。

## 落地顺序
分支 → 配置（含 `loadEnv`）+ 3 个库 + NODE_ENV + scripts/lint 配置 → 预览入口 HTML → `build:dist` 后双击 `dist/index.html` 验证 file:// → `serve` 验证 HMR/调试面板、`preview:rain`、`yarn lint` → 用假 `WE_PROJECT_DIR` 试跑部署 → 真机回归 → 删 `vue.config.js`、`public/index.html`、`babel.config.js`，同步文档（第 9 条）。

备选：`vite-plugin-singlefile`（单 HTML，但会 base64 内联 620KB 图片）；或保持 Vue CLI（现状可用，迁移只是工具链升级）。
