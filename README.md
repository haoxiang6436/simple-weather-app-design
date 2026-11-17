# 极简天气 QWeather

基于 **Vue 3** 的极简天气应用，也是 **Wallpaper Engine** 网页壁纸（Steam 创意工坊 ID `3149014795`，Beta）。天气数据来自[和风天气](https://www.qweather.com/)。

## 功能

- 实时天气、4 日预报、7 项生活指数、分钟级雨雪降水（未来 2 小时）、天气预警、实时空气质量（AQI）、一言
- 三套配色（`night` / `mist` / `atlas`），面板缩放与偏移可在壁纸属性调整
- 背景：`backgroundindex` 可选 `4` 湖心桥（默认，内置码头图）/ `6` 雾夜长街（内置雾夜公路图）/ `0` 跟随面板配色 / `solid` 自定义纯色（颜色由 `backgroundcolor` 控制）/ `custom` 自定义背景图
- 实时雨滴：`rainenabled` 是独立开关，湖心桥、雾夜长街和自定义背景图都可以开；雨量可选「自动」（按分钟级降水，回退实时天气）
- 自定义背景：`custombackground` 为 `file` 类型，仅当背景选「自定义背景」时在属性面板显示；开启实时雨滴后会自动以它为折射底图（未选图/加载失败回退内置图）
- 新用户引导：用户须在壁纸属性填写自己的和风 API 域名 + 密钥（支持多组逗号分隔、轮询），检测通过并选好位置后才显示天气
- 地址选择：省市县三级 + 地图选点（高德瓦片），可选填高德 Web服务 key 显示路名，否则用和风区县反查

## 技术栈

Vue 3（`<script setup>`）、Vite 5、Pinia（持久化）、Axios、raindrop-fx、BetterScroll、Swiper、@vueuse/core、mitt、SCSS。Arco Design 仅用于开发调试面板。

## 命令

建议 Node 24（Vite 5 ≥18 即可）。本项目统一使用 npm。

```bash
npm run serve        # 开发（或双击 start.bat）
npm run build        # 构建到 dist/ 并同步到 Wallpaper Engine 工程
npm run build:dist   # 只构建
npm run deploy:we    # 只同步现有 dist/
npm run lint
node scripts/test-minutely-precipitation.mjs
node scripts/test-weather-warnings.mjs
node --experimental-vm-modules scripts/test-location-address.mjs
npm run preview:rain     # 降水假数据预览 127.0.0.1:8081
npm run preview:warning  # 天气预警假数据预览 127.0.0.1:8082

# `npm run serve` 之后可打开的假数据预览页（都不发请求、不进 dist）：
#   /dev/card.html           整张天气卡，可加 ?aqi=1..6（等级）/ ?temp=-10（两位负数）/ ?theme=mist|atlas
#   /dev/aqi-positions.html  AQI 胶囊「摆哪儿」的对比板，参数同上，一页看 16 个位置

### 部署到 Wallpaper Engine

`scripts/deploy-wallpaper-engine.js` 将 `dist/` 镜像到工程目录（默认 `D:/Steam/steamapps/common/wallpaper_engine/projects/myprojects/qweater`，可用 `WE_PROJECT_DIR` 覆盖）：

- 先清理旧构建产物，保留 `preview.jpg` 等引擎自维护文件；
- `project.json` 只合并 `general.properties`（以 `public/project.json` 为准），其余字段保留；`WE_SYNC_PROPERTIES=0` 可关闭。引擎读的是工程目录里的 `project.json`，不合并则新属性不会出现；
- 目录或 `project.json` 不存在时直接报错退出。

## 配置与密钥

- `.env` 仅用于覆盖缓存时效（`VUE_APP_WEATHER_UPDATE_REALTIME/FOURDAYS/WARNING/INDICES/MINUTELY/AIR`，毫秒），模板见 `.env.example`。
- **不要把任何密钥写进 `.env`**（`VUE_APP_*` 会明文内联进产物）。和风域名/密钥、高德 key 只通过壁纸属性（`qweatherhost` / `qweatherkey` / `amapkey`）或开发调试面板（localStorage）填写，见 `src/api/credentials.js`。

## 壁纸属性（`public/project.json`）

`backgroundindex`（4 湖心桥 / 6 雾夜长街 / 0 跟随面板配色 / solid 自定义纯色 / custom 自定义背景）、`backgroundcolor`（自定义纯色取色，`condition: backgroundindex.value === "solid"`）、`rainenabled`（实时渲染雨滴）、`showweathermain`（沉浸式雨滴）、`rainconfig`（自动/暴雨/大雨/中雨/小雨/雨停）、`panelscale`（0.5–1.5）、`paneloffsetx/y`（-50–50）、`colortheme`、`forecastdays`、`custombackground`（图片文件）、`qweatherhost`、`qweatherkey`、`amapkey`（选填）。

属性面板用 `type: "group"` 分成四组（官方 Group 属性：分组头之后、下一个分组头之前的所有属性都归入该组）：**数据源 / 背景与配色 / 界面与布局 / 关于**。`schemecolor` 是引擎自用的浏览页配色，留在第一个分组之前，不参与分组。雨滴三项（`rainenabled` / `rainconfig` / `showweathermain`）放在「背景与配色」组内，不单独成组。

`rainconfig`（雨滴强度）的 `condition` 是 `rainenabled.value && backgroundindex.value !== "0" && backgroundindex.value !== "solid"`：只有「实时渲染雨滴」打开、且当前是图片背景（湖心桥 / 雾夜长街 / 自定义背景）时才出现在面板里；`rainenabled` / `showweathermain` 也各自带条件，纯色背景（`0` 跟随面板配色 / `solid` 自定义纯色）下自动隐藏；`backgroundcolor` / `custombackground` 各按背景选项显示。旧版为规避「下拉框反复显隐可能重复建行」而让 `rainconfig` 常显，现在按需求改为条件显示——其他 web 壁纸（如创意工坊 3799142774、2986163106）对 combo 属性也普遍使用 `condition`。

属性文案统一写成 `<b>标题</b><br/><small>提示</small>`，不再用 `<h4>`：WE 属性面板在 400–950px 窗口下会给普通行套 85% 字号，但 Bootstrap 的 `h4` 是固定 18px，标签会显得比分组标题还大并频繁换行。提示语也控制在一行内——窄窗口下滑块标签最大宽度只有 70px、combo 标签 130px，超长会被 `word-break` 折行；分组标题限制在约 20 个半角字符内。

## 目录要点

```text
index.html               入口；<head> 内最早挂 window.wallpaperPropertyListener
public/project.json      壁纸属性定义
src/api/                 和风接口、凭据、域名轮询池
src/config/weatherCache.js  各接口缓存时效
src/config/version.js    版本号出口（构建时由 package.json 注入）
src/config/changelog.js  更新日志（设置页「关于」的数据源）
src/features/weather/    天气卡、地址/地图选点、预警、分钟级降水、store
src/features/onboarding/ 引导页、设置弹窗（左菜单 + 右内容）、帮助页、检测状态机
src/features/wallpaper/  属性处理、背景配置、rain/
src/shared/motion/       错峰动效组件
src/style/               全局样式；transitions.scss 为切换动效唯一定义处
scripts/                 部署与回归测试脚本
```

## 关键实现

**数据流**：`WeatherMain.vue` 挂载后每 60 秒轮询；先查 `navigator.onLine`；并行请求预报/实时/预警；同接口+同城在途请求复用；生活指数错峰 30 秒独立刷新；分钟级降水 / 实时空气质量 fire-and-forget，失败（境外 400、账号无空气质量权限）只影响各自那颗胶囊，不参与主卡的加载状态；空气质量缓存 30 分钟，固定失败 6 小时后再试，避免每分钟撞同一个 403；失败 5 秒重试，连续 >5 次降为 30 秒。

**缓存时效**（`weatherCache.js`，取自和风官方推荐）：实时 10 分钟、预报 2 小时、预警 10 分钟、生活指数 6 小时、分钟级 5 分钟、空气质量 30 分钟。预报/指数/实时另在查询地点的本地零点失效。GeoAPI 禁止缓存，不落盘。

**版本号**：唯一真源是 `package.json` 的 `version`。`vite.config.js` 构建时把它连同构建日期与 git 短提交注入成 `__APP_VERSION__ / __APP_BUILD_DATE__ / __APP_BUILD_COMMIT__`（前端只从 `src/config/version.js` 读，页面里不写版本字面量），并生成 `dist/version.json`。部署脚本会把 `version.json` 一起同步进壁纸工程，并核对产物版本与 `package.json` 是否一致——改了版本号忘记重新构建时给出警告。设置页「关于 → 版本与更新」显示当前版本（胶囊）、构建日期和最近几版的更新日志，日志数据在 `src/config/changelog.js`；提交哈希放在悬停提示里。发布流程：先在 `src/config/changelog.js` 加一版条目（预览性质的版本在条目里加 `preview: true`，「关于」页会在版本号后挂一个「预览」小标，转正式时删掉即可），再 `npm version patch|minor|major`（顺带打 tag）→ `npm run build`。注意 `public/project.json` 的 `version` 是 Wallpaper Engine 创意工坊版本号，由引擎维护，不要和它同步。

**加载状态码** `TheWeatherDataIsLoaded`：`100` 加载中 / `200` 成功 / `300` 失败重试 / `400` 离线 / `0` 未知。

**localStorage 与缓存版本**
- 天气缓存 `WeatherApp-2026-9-1`；地址 `WeatherChosenCity`（**必须与天气缓存分开**，缓存可整块丢弃，地址是用户选择）；另有 `WeatherLocationChosenAt` / `WeatherLocationPath` / `WeatherLocationHistory` / `HitokotoCache` / `WeatherCacheDataVersion`。
- 数据结构变化时将 `useWeatherStore.js` 的 `CACHE_VERSION` +1，旧缓存立即失效；该版本号独立存储，不放进 pinia persist，也不要靠换 persist key 代替。
- 旧版 `dayDateCity` → `WeatherChosenCity` 的迁移必须写在 `useStorage` 之前。

**属性监听**：官方要求 `window.wallpaperPropertyListener` 尽早全局初始化，且每个属性单独判空（首次全量下发，之后仅下发变化项）。`index.html` 负责入队，`properties.js` 在 `mount()` 后补发队列并接管；非法值警告并忽略。

**背景与雨滴**：背景分三层——`SolidBackground`（两种纯色：`0` 跟随面板配色直接用 CSS `--color-bg`，`solid` 用 `backgroundcolor`）、`DefaultBackground`（内置图片：湖心桥 / 雾夜长街，清单见 `src/features/wallpaper/backgrounds/builtinBackgrounds.js`，静态底图与雨滴折射底图同源）、`CustomBackground`（用户图片）；雨滴是独立的一层 `RainEffect`，`rainenabled` 打开且当前是图片背景时才显示。`custombackground` 是 `file` 属性，值是本机路径，读取时补 `file:///` 前缀（见 `customBackground.js`），并通过 `condition: backgroundindex.value === "custom"` 只在「自定义背景」下显示。注意引擎返回的路径**已经做过 URL 编码**（Windows 盘符变成 `C%3A/...`），不能再编码一次（`%3A` → `%253A` 会加载失败）；浏览器会自行解码。静态背景直接交给 `<img>`；雨滴开启时先用 `<img>` 解码、画进 canvas，再通过 `RaindropFX.setBackground()` 上传 WebGL，避开 CEF 直接 `fetch(file://)` 的限制。未选图、图片被移动/删除或上传失败时回退当前内置背景图；调试面板会把选中的文件压成 data URL 以便跨刷新预览，`blob:` 地址不落盘。雨滴组件首次显示后保持挂载，切换背景 / 开关雨滴只换纹理和可见性，避免 `RainEffectCore` 的 WebGL 资源销毁重建问题；因此背景切换不再整页刷新。雨滴不可见时（纯色背景 / 关掉雨滴）会 `cancelAnimationFrame` 停掉整条渲染循环（不再 `update`、不再 WebGL draw），恢复时只重启循环，不重新 `start()`（那会重新加载纹理）；常驻的只有一份 WebGL context 与背景纹理显存。`setBackground()` 只做 `renderer.options.background = x` + `reloadBackground()`（销毁旧纹理、上传新纹理、重算缩放），renderer / GL context / shader 都不重建。

**地址**
- 天气按经纬度查询；地图点选的地址只认坐标级地名（高德路名 → 和风「市 区县附近」），不得用下拉框路径顶替。
- 坐标系：大陆 GCJ-02（高德瓦片，不转换），其他 WGS-84；旧记录按 `point.crs` 迁移一次。
- 和风坐标仅两位小数，返回的是「最近城市」故文案带「附近」。高德 key 必须是「Web服务」类型。
- 台湾省和风无 adcode，`CityList.js` 直接用 LocationID；数据用 `scripts/sync-taiwan-city-list.js` 重新生成。
- 只有 `WeatherLocationPath` 保存过且与当前一致时才把 `point` 摆成 pin；`markLocationChosen` 必须在用户确认时无条件调用，否则界面会卡死无报错；三列选中项挂载后需滚到可见。
- 「最近」的交互：单击只选中（进地图 / 把上次的 pin 摆好，仍靠页脚按钮确认），双击直接应用这条记录（`applyHistoryNow`，只认记录里的路径 / 坐标，不再等区县中心）；键盘没有第二下，所以在已选中的记录上再按一次 Enter 与双击等价。这颗 chip 在 `locating` 期间保持可点：只有区县的记录第一下点击会联网查中心点，button 一旦 disabled，浏览器就不会再派发第二次 click 和 dblclick。

**引导与设置**：属性下发后去抖 700ms，用 `/geo/v2/city/lookup` 逐组检测，结果按凭据指纹（哈希）缓存。设置页刻意不提供输入框（引擎收不到页面键盘输入，写入口只在属性面板/调试面板）。接口返回 401/402/403 时通过 `BUS_EVENTS.USER_API_INVALID` 重开引导页。开发调试面板仅在 development 构建中异步导入。

## 注意事项

- 天气卡/引导/设置/地址页共用固定外壳（`min(46.5rem, 92vh)`，`weather-panel.scss`）；改动后检查最长地址、预警胶囊、指数与地图全屏是否被裁切。
- 外壳换面板的过渡**不要用 `mode="out-in"`**（Vue 3.2 下会卡在离场、外壳变空卡），现用「离场 + 进场延迟」。
- 动效见 [src/shared/motion/README.md](src/shared/motion/README.md)；切换动效类名统一在 `transitions.scss`。
- 项目面向中国大陆用户；雨滴背景需 WebGL。
- 实时空气质量（`/airquality/v1/current`）：账号没开通该数据权限、或该地点不在覆盖范围时接口回 403/400，胶囊**整颗不显示**（不弹引导页、不写错误日志），6 小时后再试一次；境外没有本地 AQI 标准时接口只回 QAQI（中国地区不提供 QAQI）。胶囊上的等级固定用「优 / 良 / 轻度污染 / 中度污染 / 重度污染 / 严重污染」6 个中文词，由 level 折算（各国家标准档数不同），不直接用接口的 `category`（本地语言、长度不可控）。位置是「当前温度左下角」：底边与温度数字墨迹的下沿齐平、横向紧跟 °C（`margin-right:auto` 把右侧余量整块留白），可用 [位置对比板](src/dev/AqiPositionBoard.vue) 换档；温度行右边只有约 90px 余量，两位负数时只剩约 58px，所以胶囊里只放「AQI + 等级词」，数值/首要污染物/建议都在悬停提示里。
- 和风条款要求空气质量数据与来源共同展示（`metadata.attributions`）：目前来源写在胶囊的悬停提示里，若要严格合规，应在设置页或卡片角落补一行「和风天气」署名。

## 致谢与免责

天气数据：和风天气；界面灵感：CodePen。本壁纸无盈利性质，数据来自网络，如有侵权请联系删除。
