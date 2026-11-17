# 预报条：7 日 / 24 小时 双视图切换 · UI/UX 设计路线

> 对象：`WeatherMain.vue` → `.details` 底部的预报条区域（截图红框）
> 目标：这一块支持「7 天」与「24 小时」两种取样方式，共用同一块画布、同一套视觉语言。
> 状态：设计路线（待评审），尚未写实现代码。

---

## 0. 一句话结论

**不要做横滚、不要做分页、不要把 24 小时拆成 8 张卡片。**
在**同一块 12.5625rem 高、约 42rem 宽**的画布上，把 7 个「天」列换成 24 个「小时」列（每 3 小时一个标签），把「高低温带」换成「24 点温度曲线 + 24 根降水概率柱」，切换控件放在预报面板自己的标题行右端。
两条铁律贯穿全文：

| 铁律 | 含义 | 为什么 |
| --- | --- | --- |
| **零交互可读** | 不点、不悬停、不滚动，也能一眼读出「何时下雨 / 何时最暖 / 何时转冷」 | 这是壁纸，用户 95% 的时间只是瞥一眼 |
| **同高不跳版** | 两种视图像素级等高（12.5625rem），切换时右侧卡片不发生任何回流 | 壁纸页面上任何跳动都像 bug；也让切换动画可以只做内容层 |

---

## 1. 官方「逐小时天气预报」返回结果解读

接口：`GET https://<apiHost>/weather/v1/hourly/{latitude}/{longitude}`

| 位置 | 参数 | 说明 | 本项目要注意的 |
| --- | --- | --- | --- |
| path | `latitude` / `longitude` | 十进制，**最多两位小数** | `Number(x).toFixed(2)`，不要传原始浮点 |
| query | `hours` | 1–240，默认 24 | 传 `24`（clamp 到区间） |
| query | `localTime` | 默认 `false`（UTC） | **必须传 `'true'`**，与 `get7DayForecast` 保持一致 |
| query | `lang` | 多语言 | 项目未用，忽略 |

返回体：`{ metadata: { tag, attributions }, hours: [...] }`，**没有 `code` 字段**（v1 特性，错误走 HTTP 状态码），所以错误判定依赖 `requestWeather` 已有的 deny 逻辑，不要写 `res.code === '200'`。

### 1.1 `hours[]` 的每一项

| 字段 | 形态 | 归一化动作（复用 `src/api/weather.js` 现有工具） |
| --- | --- | --- |
| `forecastTime` | ISO 串，如 `2024-05-31T03:00Z` | 保留原串作为 **key**；展示用 `clockInZone()` → `3时`；`dateInZone()` 判断是否已跨天 |
| `condition.text` / `condition.code` | 文案 + 图标码 | 图标 `qi-{code}`，与 7 日条同源 |
| `temperature.value` / `.unit` | 数值 + 单位 | `round()` |
| `feelsLike.value` | 体感 | `round()`，**只在选中小时读数里出现**，不上主图 |
| `humidity` | **0~1 小数** | `percent()` → 整数百分比 |
| `wind.direction.degree` / `.compass` | 角度 + 16 方位代码 | `windDir()`（项目内已归一到 8 方位中文） |
| `wind.speed.value` / `.unit` | 多为 m/s | `speedToKmh()` / `round2()` |
| `wind.scale` | 蒲福风级 | 直接展示「2 级」 |
| `windGust.value` | 阵风 | 仅读数里用 |
| `precipitation.amount.value` | 降水量 | `round2()`，单位随 `unit` |
| `precipitation.intensity.value` | 降水强度 mm/h | 本期不用（分钟级降水已覆盖「现在下多大」） |
| `precipitation.probability` | **0~1 小数** | `percent()` → 0~100 整数，**这是概率柱的唯一数据源** |
| `precipitation.type` | `rain\|snow\|ice\|mixed\|none\|unknown` | 决定概率柱的形态/颜色；`none` 且概率 <10% 时不画柱 |
| `pressure` / `visibility` / `dewPoint` | 数值 + 单位 | 本期不进 UI，先归一化留下（后续做「气压趋势」时不必再改接口层） |
| `cloudCover` | 0~1 小数 | `percent()` |
| `uvIndex` | 0–15 | 已有 `uvScale.js` 可出等级文字 |

### 1.2 五个容易踩的坑

1. **单位小数 vs 百分比**：`humidity` / `cloudCover` / `precipitation.probability` 都是 0~1，直接当 0~100 会得到「0.8% 湿度」。统一走 `percent()`。
2. **`localTime` 默认是 UTC**：不传就是 UTC 串，`clockInZone()` 之后会整体偏 8 小时。
3. **首项不一定是「现在」**：接口给的是「从当前整点开始」的序列，但网络/缓存延迟后首项可能已经是过去时刻。要按「丢弃早于 now−30min 的项」再重新索引。
4. **首项落在当天的 0 时**：如果现在正好是 00:0x，序列 24 项全在「今天」；其余时候第 15 项左右跨零点。**跨零点必须在图上标出来**，否则「0时」在最右端会读成「刚过去」。
5. **`metadata.attributions` 合规**：官方要求数据与来源同时展示。项目里 `normalizeCurrent`（`src/api/weather.js:327`）和空气质量（`:337`、`:357`）都保留了 attributions 字段，但**没有任何 UI 渲染它**。逐小时预报同样要把它随数据带回来（`metadata: { attributions }`），是否在 UI 落位见 §13 开放问题 Q5。

---

## 2. 硬约束（实测，不是估计）

| 约束 | 数值 | 出处 |
| --- | --- | --- |
| 卡片外框 | `min(82vw, 71.25rem)` × `min(46.5rem, 92vh)` | `src/style/weather-panel.scss:27-34` |
| 右栏内容宽 | **≈ 39–42rem**（按 71.25rem 宽、两栏 `0.88fr : 1.6fr`、`padding: 2rem` 反推 ≈ 39.4rem） | `WeatherMain.vue:731` + `dev/forecast.html` 注明 42rem |
| 右栏底部余量 | 正常状态约 **5rem 空白** | `weather-panel.scss` 注释 |
| 7 日条总高 | **12.5625rem**，5 行基线 `1.5 / 2 / 1.5 / 3.5 / 1.5 rem`，`padding-y 0.75rem`，`gap 0.75rem` | `ForecastStrip.vue` |
| 7 日条列宽 | `--fc-col: calc((100% - 6*gap) / 7)` ≈ 6rem | 同上 |
| 现有动效基建 | anime.js `SPRING_PRESETS.slide`、`StaggerTransition preset="trend"/"sunRow"`、`plotKey` 指纹重绘 | `ForecastStrip.vue:225-247` |

**推论：24 列时每列只有 ≈ 1.64–1.75rem（26–28px）。** 所有 24 小时的视觉密度问题都源自这一个数字。

---

## 3. 信息设计：24 小时该回答的 5 个问题

| 用户问题 | 数据字段 | 落在哪一层 |
| --- | --- | --- |
| 现在什么情况 | `condition` / `temperature` / `feelsLike` | 第 0 列 + 读数行 |
| 几小时后会不会下雨 / 什么时候停 | `precipitation.probability` + `type` + 图标 | 概率柱 + 图标行 + 读数行 |
| 温度走势（何时最暖、何时转冷） | `temperature.value` × 24 | 曲线 + 8 个整点温度标注 |
| 风什么时候起来 | `wind.scale` / `speed` | 只在读数行 |
| 天黑没 / 还有多久天黑 | `sunset`、`sunrise`（取自 daily[0]/[1]） | P3 的日落竖标记；本期靠 24h 标签的「明天」提示 |

**取舍：**
- 湿度、气压、能见度、露点、紫外线 **不进 24 小时主图**。它们不是「按小时变化时用户会关心」的量，放进来只会把 28px 的列塞爆。已在接口层归一化保留，将来做「点击小时 → 展开详情」时零成本取出。
- 降水**概率**优先于降**水量**：一小时内「下多大」比「下不下」更难读，而「下不下」才是排期的依据。量放读数行（如「降雨 0.4mm」）。
- **不做「现在」到「+24h」的相对时间轴标签**（+1h、+2h…），一律用绝对钟点（`15时`），因为跨零点后相对轴会失去意义，而绝对钟点天然解释了「明天」。

---

## 4. 布局：与 7 日条共用一套几何

### 4.1 几何推导（关键结论：`--fc-gap: 0` 时现有轴公式原样成立）

7 日条的做法：列宽 `--fc-col`，列间 `--fc-gap: 0.75rem`，曲线画布 `.forecast-band` 左右各内缩**半列**，于是第 i 个点的相对横坐标就是 `axis(i) = i / (n - 1)`。

24 小时模式只需要改两个变量：

```css
--fc-n: 24;
--fc-gap: 0;   /* 28px 的列再留 12px 间隙就没地方放字了 */
```

此时 `--fc-col = 100% / 24`，半列内缩后画布宽度 = `W - 1 列`，第 i 个小时的中心在画布内的相对位置**恰好仍是 `i / 23`**。
⇒ 现有的贝塞尔平滑、`clip-path` 进场、`--fc-active` 滑块公式**全部不用改**，只是 `n` 从 7 变 24。这是本方案能在一天内落地 P0 的根本原因。

### 4.2 五行结构（总高不变）

```
┌─ 标题行（新增，1.5rem）未来 24 小时 · 15时 – 明天 14时          [7 天 | 24 小时] ─┐
├────────────────────────────────────────────────────────────────────────────────┤
│ 行1 时刻   现在    3时     6时     9时    12时    15时    18时    21时            │ 1.5rem
│ 行2 图标    ☁      ☁      ☀      ☀      ☀      ☁      ☁      ☀                │ 2rem
│ 行3 温度   16°    15°    14°    17°    19°    19°    17°    15°                │ 1.5rem
│ 行4 图  ┌ 2.25rem 温度曲线（24 点 + 线下渐变面积）                              │
│         └ 1.25rem 降水概率柱（24 根，带 50% 参考虚线）                          │ 3.5rem
│ 行5 读数   18时 · 多云 · 体感 15° · 东北风 2 级 · 降水 20%                      │ 1.5rem
└────────────────────────────────────────────────────────────────────────────────┘
   标签/图标/温度只出现在每 3 小时（8 组）；24 根柱与 24 个点保留全部小时精度
   每个 1.75rem 宽的列整列都是可点按钮（28 × ~180px）
```

**为什么标签是 8 组（每 3 小时）而不是 24 个或 12 个：**
- 24 个标签 = 28px/个，`16px` 的字必然互相压；12 个（每 2 小时）能放下但整块会变成「密集刻度盘」，与左侧生活指数区的松弛感冲突。
- 8 组让组内间距 = 3 列 = 84px，字号得以与 7 日条**完全一致（1rem / 600）**。切换时字不缩水，「同一个仪表、换了量程」的观感才成立。
- 损失的是「组内另外 2 个小时没有文字标签」——但这 2 小时的温度仍在曲线上（且可点、可键盘到达、`aria-label` 带完整读数）。

### 4.3 图层（沿用 7 日条的分层约定）

```html
<div class="strip" style="--fc-n:24; --fc-gap:0; --fc-active:0">
  <div class="strip-thumb"      />            <!-- z0 选中列底色，宽度 = 1 列 -->
  <svg  class="strip-plot"      />            <!-- z1 曲线 + 面积 + 概率柱 -->
  <div class="strip-cols">                    <!-- z2 24 个 <button>，行1~3 的内容 + 行4 占位 -->
  <div class="strip-frame"      />            <!-- z3 1px 描边，hover/focus 时出现 -->
</div>
```

`strip-plot` 必须 `aria-hidden="true"`，另配视觉隐藏的文字摘要（见 §8）。

### 4.4 曲线与概率柱的画法

| 元素 | 规格 |
| --- | --- |
| 温度曲线 | SVG `<path>`，`d` 由 24 点经三次贝塞尔平滑（沿用现有 `handle = (700/(n-1))*0.34` 公式）；`stroke: var(--color-primary)`，`stroke-width: 1.75px`，`vector-effect="non-scaling-stroke"`（24 点跨度更大，不加这条线宽会被 `viewBox` 拉伸） |
| 面积 | 同 path 闭合到底线，`linear-gradient(var(--color-primary) 22%, transparent 100%)`，`opacity: .5` |
| 值域 | `min..max` 上下各留 0.25rem 内边距；`min === max` 时压平居中；**不画刻度网格**——这一层表达「形状」，精确值由行 3 与行 5 提供 |
| 概率柱 | DOM `<span class="prob-bar">`（与 `MinutelyRainDialog` 同做法，不用 SVG）；宽 = 列宽 56%（≈15px），`border-radius: 2px 2px 0 0`，高度 = 概率 × 1.25rem |
| 柱色 | `rain` = `color-mix(in srgb, var(--color-primary) 45%, transparent)`；`snow` = `rgba(232,242,248,.55)`；`ice/mixed` = 两者渐变；选中小时的柱提到 90% 不透明 |
| 参考线 | 概率带内 50% 处一条 `1px dashed var(--glass-border)`，让「一半概率」可被量化而不必悬停 |
| 不画柱的条件 | `probability < 0.1` 且 `type === 'none'` → 该小时不画（不是画 0 高柱，避免视觉噪声） |

---

## 5. 交互模型

### 5.1 切换控件：位置与形态

**推荐方案 B：预报面板自己的标题行（右端）**

```
未来 24 小时 · 15时 – 明天 14时                    ╭───────────╮
                                                    │ 7 天 │24 小时│
                                                    ╰───────────╯
```

- 成本：**+1.5rem 高度 + 0.625rem 内间距 ≈ 2.1rem**，来自右栏底部那 5rem 空白，不挤占任何现有内容。
- 收益：控件紧贴它控制的东西；标题行左侧本就该有「这块是什么时间范围」的说明（现在这块完全没有），24 小时模式下 `15时 – 明天 14时` 顺手解决了 §1.2 第 4 条的跨天困惑。
- 语义：面板自己持有视图状态，标题行归面板所有，不侵入 `.sun-row`。

**备选方案 A（空间吃紧时）：挂在 `.sun-row` 同一行右端**
`.sun-row` 是 `inline-flex` 左对齐，右侧本来空着，包一层 `display:flex; justify-content:space-between` 即零高度成本。缺点是「日出日落」和「视图切换」挤一行，语义混搭；如果将来 sun-row 要加内容（月相、空气质量）就会打架。

**控件形态**（两种方案通用）：

| 属性 | 值 |
| --- | --- |
| 结构 | `role="tablist"` + 两个 `role="tab"`（`aria-selected`、`aria-controls`），胶囊底槽 `height: 1.5rem`、`padding: 0.125rem`、`border-radius: 999px`、`background: var(--glass-bg-subtle)` |
| 段 | `padding: 0 0.625rem`，`font-size: 0.8125rem`，`font-weight: 600`，未选中 `var(--text-muted)` |
| 选中态 | 滑块层（不是给按钮换背景）：`background: var(--glass-active)`，`border: 1px solid color-mix(in srgb, var(--color-primary) 35%, transparent)`，文字 `var(--color-primary-soft)` |
| 滑块动效 | `SPRING_PRESETS.slide`，与 7 日条的选中浮层同一套手感 |
| 键盘 | ←/→ 切换并把焦点移到新 tab，Home/End 到首/尾；不用 div 冒充按钮 |
| 焦点 | 全局 `:focus-visible { outline: 2px solid var(--color-primary) }`（`src/style/index.scss:362`）已覆盖，勿覆盖掉 |
| 文案 | 「7 天」「24 小时」（不写「日/时」，避免与「今天 19°/14°」里的日混淆） |

### 5.2 选中模型（两种视图各自独立，互不干扰）

| 视图 | 选中单位 | 默认 | 影响范围 |
| --- | --- | --- | --- |
| 7 天 | 一整天（现有 `activeDate`） | 今天 | 联动顶部日期、6 张指标卡、日出日落 |
| 24 小时 | 一个小时（新 `selectedHour`） | 第 0 项（现在） | **只影响预报条内部**（滑块 + 行 5 读数），不碰顶部指标卡 |

**为什么 24 小时的选中不联动顶部**：顶部 6 张指标卡带 `StatDelta`（与前一天对比的角标），语义是「这一天整体」；把某一小时的湿度塞进去会让角标变成谎言，而且是一次高风险的跨组件耦合。24 小时的详细信息用行 5 就地解决。

**选中状态的健壮性**：存 `forecastTime` 字符串而不是数组下标；数据刷新后按 key 找回，找不到就回落到第 0 项。切回 7 天时保留用户的日期选择。

### 5.3 状态机

```
daily ──tab──▶ hourly(候选) ─ensureHourly()─▶
  ├─ 命中缓存 ─────────────▶ hourly(ready)
  ├─ 请求中 ───────────────▶ hourly(loading)  行1~3 骨架胶囊 + 行5「正在获取逐小时预报…」
  └─ 失败 ─────────────────▶ hourly(error)    行5「加载失败，点击重试」（真按钮，可 Tab 聚焦）
hourly ──tab──▶ daily（保留 selectedHour，下次切回原样）
```

- **懒加载**：首次切进 24 小时才发请求。壁纸用户里相当一部分从不切换，不该为此多花配额。
- **首次之后纳入主节拍**：`useWeatherRefresh` 的 60s 主循环里带上 hourly（`useWeatherRefresh.js:56`），命中 TTL 就直接早退，不会多打请求；不需要另开节拍，也不需要改 `useWeatherRefresh`。
- **默认视图 = 7 天**：老用户升级后看不到任何变化（`useStorage` 默认值 `'daily'`）。

---

## 6. 动效规格

| 场景 | 规格 | 备注 |
| --- | --- | --- |
| 视图切换 | 出 120ms（opacity 1→0，translateX ∓8px）→ 入 200ms（0→1，±8px），方向由目标视图在左/右决定；`<Transition mode="out-in">` | 容器高度锁定 12.5625rem，动画期间整体不位移 |
| 曲线进场 | 复用 `plotKey` 指纹（`首项 forecastTime + 24 个温度拼接`）→ `StaggerTransition preset="trend"` 的 `clip-path` 左→右 | 与 7 日条数据刷新时的观感一致，用户不会觉得是两套东西 |
| 概率柱进场 | `height: 0 → 目标值`，每根延迟 12ms，240ms `ease-out` | 纯 CSS transition，逐帧不跑 JS |
| 选中滑块 | `--fc-active` 由 anime.js 逐帧写入，`SPRING_PRESETS.slide`；`prefers-reduced-motion` 直接落位 | 切换视图时用 snap（不弹），沿用现有 `snapSlide` 判断 |
| 键盘移动 | 与鼠标同一条弹簧路径（不要为键盘另写瞬间切换，否则焦点环和滑块会脱节） | |

**可中断要求**：所有动画句柄存 ref，切换/连续点击前 `previous?.cancel()`，**状态落定不得依赖 `transitionend`**（动画被打断时该事件不会来，视图就会卡在半透明）。

---

## 7. 视觉规格（全部用现有 token，不新增硬编码色值）

| 用途 | 值 |
| --- | --- |
| 行 1 时刻 | `1rem / 600`，未选中 `var(--text-muted)`，选中 `var(--text-primary)`；跨天那组标签下加 1px 短下划线 |
| 行 2 图标 | `1.75rem`（7 日条为 2rem，因列距从 96px 缩到 84px 降一档） |
| 行 3 温度 | `1rem / 600`，`font-variant-numeric: tabular-nums`（防抖），缺数据 `—` 不带度符号（与 7 日条一致） |
| 行 5 读数 | `0.9rem`，`var(--text-secondary)`；「现在/18时」用 `600` 加粗做视觉锚点 |
| 选中列底色 | 复用 7 日条 `.forecast-thumb`：`var(--glass-bg-soft)` + 圆角 0.75rem |
| 选中列描边 | `var(--glass-border)` 1px，只在 hover/focus 时出现（`.forecast-frame` 同款） |
| 跨零点分隔 | 1px 竖线 `var(--glass-border)`，从行 1 顶到行 3 底（不穿过曲线，避免切断走势） |
| 概率柱 | 见 §4.4；**只靠高度与参考线区分量级，不依赖颜色**（色觉障碍兜底） |
| 浅色主题（`mist`） | 柱的 45% 透明度会发灰 → 改用 `--color-primary-strong` 并把不透明度提到 55%；曲线描边不变 |

---

## 8. 无障碍

| 项 | 做法 |
| --- | --- |
| 24 个可点列 | 原生 `<button type="button">`，`aria-pressed`（沿用 7 日条的做法）或 `aria-current`，`aria-label="18时，多云，17度，降水概率20%，东北风2级"` |
| Tab 停靠点 | roving tabindex：仅选中列 `tabindex=0`，其余 `-1`；否则键盘用户要按 24 次 Tab 才能走出去 |
| 方向键 | ←/→ 逐小时移动（含组内未标注的小时），Home/End 到首/尾；视觉焦点环 + 滑块同步 |
| 图表层 | `aria-hidden="true"`；另给一段视觉隐藏摘要：「未来 24 小时最高 19 度（15时），最低 11 度（明晨 5时）；18–20 时降水概率最高 60%」 |
| 目标尺寸 | 列 28 × ~180px：满足 WCAG 2.5.8 (≥24px)，但**达不到 44px**。本产品是桌面壁纸、指针优先，键盘是等价路径——这一点要写进 README 的可访问性说明，避免以后被当成缺陷 |
| 读数行变化 | 不做 `aria-live`（鼠标划过会疯狂播报）；信息已通过按钮 `aria-label` 与摘要提供 |
| 动效 | `prefers-reduced-motion` 下：无位移、无绘制、滑块瞬移、骨架改为静态占位 |

---

## 9. 边界与降级

| 场景 | 处理 |
| --- | --- |
| 首项早于 now−30min | 丢弃过期项后重新索引；标签写实际钟点（`15时`）而非「现在」 |
| 序列不足 24 项 | 按实际项数渲染（`--fc-n` 动态），标签仍是「每 3 小时 / 从首项起算」，不补齐假数据 |
| 跨零点 | 在 0 时那列画竖线；该组标签 `0时`；行 5 读数前缀 `明天` |
| 字段缺失 | 温度/概率 `—`；图标 `qi-unknown`；整项缺失 `condition` 时行 5 只显示时间与温度 |
| 请求失败 | 保留 24 小时布局，行 5 变「加载失败，点击重试」（真 `<button>`），下个主节拍自动重试；**不自动弹回 7 天**（会显得控件失灵） |
| 时区 | 一切时间/日期换算走 `formatInZone` / `clockInZone` / `dateInZone` + 查询地 `tz`，禁用 `new Date().getHours()` |
| 壁纸属性 5/6/7 天 | 只影响 daily 视图；hourly 固定 24 项（48 小时档位见 §11 P3） |
| 换城市 / 换凭据 | 沿用 `isFresh` 的指纹 + 版本判定；hourly 的更新时间戳独立，失败**不推进时间戳**（与生活指数 v7 的教训一致） |

---

## 10. 工程落地清单

### 10.1 数据层

**`src/api/weather.js`**
- `API_BY_PATH`（:29-37）末尾追加 `[/^\/weather\/v1\/hourly\//, 'hourly']`；并在 `src/api/requestStats.js:69` 的 `REQUEST_API_LABELS` 里补 `hourly: '逐小时预报'`（否则统计面板会把新接口显示成 `other`）；顺带更新 `requestStats.js:254` JSDoc 里的代号列举。
- 新增：
  ```js
  export const normalizeHourly = (raw, timeZone) => ({ /* forecastTime, hourLabel, dayOffset,
     icon, text, temp, feelsLike, humidity, windDir, windScale, windSpeed, gust,
     precipProb, precipAmount, precipType, pressure, visibility, cloud, uvIndex, dewPoint */ })

  export const getHourlyForecast = ({ lat, lon, tz }, hours = 24) => requestWeather(
    `/weather/v1/hourly/${Number(lat).toFixed(2)}/${Number(lon).toFixed(2)}`,
    { hours: clamp(hours, 1, 240), localTime: 'true' },
    'hourly'
  )
  ```
  返回值保持与现有 `get7DayForecast` 同形：`{ hours: normalizeHourly(...), metadata: { attributions } }`。
- 复用工具：`percent()`(:90)、`round()`(:88)、`windDir()`(:134)、`clockInZone()`(:168)、`dateInZone()`(:164)、`speedToKmh()`(:96)。

**`src/config/weatherCache.js`**
- `WEATHER_CACHE_SPECS` 增加：`hourly: { ttl: 30 * 60 * 1000, recommended: [30, 60], updateFrequency: 60, envKey: 'VUE_APP_WEATHER_UPDATE_HOURLY', crossLocalDay: true, label: '逐小时预报' }`
  —— 官方「缓存 30–60 分钟、更新频率 60 分钟」取区间下界 30min：最坏陈旧度 = 30 + 60 = 90min，仍在「2 倍」容忍内。
- `crossLocalDay: true`：跨本地零点后首项会变成「昨天的 15时」，必须整块作废。
- 文件头注释表把「逐小时预报 ——（未使用）」改为实际使用的时长。
- **`vite.config.js:56-63` 的 `CLIENT_ENV_KEYS` 要加 `VUE_APP_WEATHER_UPDATE_HOURLY`**，否则 `.env` 覆盖静默失效（该文件注释已警告过这个坑），同时补 `.env.example`。

**`src/features/weather/useWeatherStore.js`**
- `import { getHourlyForecast as getHourlyForecastAPI }`
- 新增 `HOURLY_COLUMNS = 24`、`HourlyWeatherData = ref([])`、`HourlyStatus = ref('idle'|'loading'|'ready'|'error')`、`WeatherDataUpdatedAtATime.value.hourly`
- `getHourlyWeatherData(force = false)`：`singleFlight('hourly:' + key, ...)`；`isFresh('hourly', at, force)` 命中直接返回；成功后写数据 + 时间戳；失败写 `HourlyStatus='error'` 且**不动时间戳**
- 主 `refresh()`（:362 的 `Promise.allSettled`）里按 `HourlyEverRequested` 门闩决定是否带上 hourly
- persist `paths`（:946）追加 `HourlyWeatherData` 与时间戳；**不要把 `HourlyStatus` 持久化**

### 10.2 视图层

| 文件 | 动作 |
| --- | --- |
| `src/style/forecast-grid.scss`（新，或并入 `weather-panel.scss`） | 抽出两边共用的 `.strip` 5 行网格与 `--fc-n/--fc-gap/--fc-col/--fc-active/--fc-text/--fc-pad-y/--strip-h`，**保证等高**是这份文件的唯一职责 |
| `ForecastStrip.vue` | 仅把网格/变量改为引用共享 scss；行为逻辑（滑块、`plotKey`、StaggerTransition）零改动 |
| `ForecastPanel.vue`（新） | 持有 `view`（`useStorage('WeatherForecastView','daily')`）与 `selectedHourKey`；渲染标题行 + 控件 + `<Transition>` + 两个子视图；负责骨架/失败态 |
| `ViewSegmentedControl.vue`（新） | `role="tablist"` 两段控件 + 弹簧滑块；props `modelValue`、`options`；emit `update:modelValue` |
| `HourlyStrip.vue`（新） | 24 列结构与 SVG/柱渲染，props `hours`、`selectedKey`、`status`；emit `select`、`retry` |
| `WeatherMain.vue` | `<ForecastStrip :days …/>` → `<ForecastPanel :days="forecastDays" :active-date="activeItem" @select-day="activeItem = $event" />`；`activeItem` 逻辑不变 |
| `src/dev/hourly.html` + `src/dev/hourlyPreview.js`（新） | 照 `forecast.html` 的结构，挂在 `.preview-details { width: 46rem; padding: 2rem }` 里；支持 `?view=`、`?n=`、`?theme=`、`?loading=1`、`?error=1`、`?group=8|12` |

> `vite.config.js` 只有 `index.html` 一个入口，`src/dev/*.html` 靠 dev server 直接访问（现有 `forecast.html` 即如此），**不需要改构建配置**。

### 10.3 数据署名（合规章节）

`metadata.attributions` 随 hourly 数据一起带回 store，至少保证「不丢」。UI 落位有两个候选：设置面板的「数据来源」区，或 24 小时标题行右侧一个 10px 的极淡 `QWeather` 文字——需要产品决定（§13 Q5），**不在 P0 阻塞**。

---

## 11. 实施路线（每阶段都可独立验收）

| 阶段 | 内容 | 工时估 | 验收标准 |
| --- | --- | --- | --- |
| **P0 几何先行** | 预览页 + 假数据 + `forecast-grid.scss` + `HourlyStrip` 静态结构 | 1 天 | `dev/hourly.html` 在 46rem 下无横向溢出；`getBoundingClientRect().height` 与 7 日条**完全相等**；`?n=` 换成 6/7 天数据也不塌 |
| **P1 数据通路** | `normalizeHourly` + `getHourlyForecast` + 缓存 spec + store + `.env` 链路 | 1 天 | 预览页用真实响应渲染；0~1 百分比全部显示正确；跨零点标签正确；连续刷新命中缓存（Network 面板只 1 次请求 / 30min） |
| **P2 切换** | `ForecastPanel` + `ViewSegmentedControl` + 过场 + 懒加载/骨架/失败重试 + `useStorage` 持久化 | 1 天 | 来回切换 20 次高度零抖动；重载页面记住上次视图；reduced-motion 下无动画；快速连点不出半透明残留 |
| **P3 读数与动效** | 行 5 读数、滑块弹簧、曲线绘制、概率柱进场、roving tabindex + 文字摘要 | 1.5 天 | 键盘 ←/→/Home/End 全通；屏幕阅读器能读出完整摘要；鼠标划过 24 列时读数行不横向跳动 |
| **P4 增强（可选）** | 夜间底纹（daily[0]/[1] 的日出日落）、日落竖标记、体感温度副线、48 小时档位、壁纸属性 `forecastview` | 1–2 天 | 每项独立开关，缺数据时静默不画 |
| **P5 收尾** | attributions 落位、README/可访问性说明、视觉回归截图（三套主题 × 两种视图） | 0.5 天 | 三主题下颜色对比达标；截图归档 |

---

## 12. 备选方案与决策记录

| 备选 | 为什么否决 |
| --- | --- |
| **24 小时横向滚动** | 违反「内容装进视口宽」的基本 UX 约束；壁纸场景里滚轮常被 Wallpaper Engine 或外层页面吃掉，滚动条会成为常驻噪声；且「零交互可读」直接破功 |
| **分页（3 页 × 8 小时 + 箭头）** | 保留了列语言和 44px 目标，但一次只能看 1/3 数据，还需要第二组控件（页码/箭头）来解释第一组控件；对「瞥一眼」的用户来说信息密度反而更低 |
| **24 个完整列（每列都有标签/图标/温度）** | 28px 的列放不下 `16px` 的三个字，只能把字号降到 12px 以下——切换时字会缩水，破坏「同一个仪表」的观感，也低于正文可读下限 |
| **12 组（每 2 小时）** | 可行备选（`?group=12` 已在预览页留口）。取 8 组是因为 12 组会让整块逼近「刻度盘」，且组内 2 小时的精度提升对「排期决策」帮助有限 |
| **把 24 小时做成 8 张卡片（Bento 风格）** | 卡片意味着边界，24 个连续小时被切成 8 段后，「趋势」这个最重要的信息就没了；且 8 张卡在 12.5rem 高里只能放很小的字 |
| **切到 24 小时时同步更新顶部 6 张指标卡** | 指标卡带「与前一天的差」角标，语义属于「整天」；改成小时会让角标变成谎言，且是一次高风险的跨组件耦合 |
| **另开一个独立面板/弹窗展示 24 小时** | 壁纸不能有「必须点开才看得到」的核心信息；弹窗还会盖住左侧「现在」那张很有价值的卡片 |

---

## 13. 需要你拍板的 5 件事

| # | 问题 | 我的建议 |
| --- | --- | --- |
| Q1 | 切换控件位置：面板自己的标题行（+2.1rem，语义清晰）还是 `.sun-row` 右端（零高度，语义混搭） | **标题行** |
| Q2 | 标签密度：8 组（每 3 小时，字号与 7 日条一致）/ 12 组（每 2 小时，更密） | **8 组**，预览页留 `?group=12` 现场对比 |
| Q3 | 默认视图是否保持 7 天 | **保持**，老用户零感知 |
| Q4 | 24 小时的选中小时是否联动顶部指标卡 | **不联动**，读数放行 5 |
| Q5 | `metadata.attributions` 放哪：设置面板「数据来源」/ 24 小时标题行右侧极淡文字 / 暂不展示但保留字段 | **保留字段 + 设置面板落位**（不打扰主界面） |

你确认后我按 P0 → P5 顺序推进，P0 交付时会附 `dev/hourly.html` 预览页与两张等高对照截图。
