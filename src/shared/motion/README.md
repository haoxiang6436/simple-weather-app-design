# 错峰渐入 / 数值滚动

- `StaggerTransition`：包装 Vue `Transition`，无额外 DOM；用于单元素、组件根、`v-if`/`v-show`。`<StaggerTransition preset="warning" :index="i">`
- `StaggerGroup`：包装 `TransitionGroup`，按直接子项顺序算延迟；`tag` 复用布局容器，子项必须有稳定 `key`；`start-index` 用于跨区域衔接。

被这两个包装的组件必须是**单根元素**：模板顶层写 HTML 注释会让根节点在 dev 下变成 Fragment，进场照旧、离场被 Vue 直接摘掉（`npm run lint` 里的 `check-vue-roots` 会拦）。
- `AnimatedNumber`：数值 count-up，无第三方依赖；`:value` 支持数字/数字字符串，`:decimals` 固定小数位（降雨量用 2），`:delay` 只影响首次挂载；缺数据、`prefers-reduced-motion` 都直接落到终值/占位。单位放默认插槽：`<AnimatedNumber :value="d.precip" :decimals="2"><small> mm</small></AnimatedNumber>`。

两者默认 `appear`（`:appear="false"` 关闭）；`StaggerTransition` 的 `:enabled="false"` 关闭 CSS 过渡但保留显隐管理。

预设、时长、缓动、间隔、位移统一改 `stagger.js`，样式在 `src/style/transitions.scss`；业务组件只传 `preset` 和 `index`，不要用局部 keyframes、定时器或父级 active 类。离场默认无延迟，减少动态效果时不等待。

`stagger.js` 里还有一档 `SPRING_PRESETS`：给「由点击触发、可以随时被打断」的位移用（七日预报的选中滑动块、设置弹窗左导轨的选中块）。它走 anime.js 的 `spring()` 缓动，不是 CSS 错峰预设，所以单独放一档，参数按 `bounce`（回弹量）+ `duration`（感知时长）描述。两档的弹性刻意不同：横向滑动块跨的是一整列（97px 起），过冲一大就会冲出末列，所以只给 0.2；竖向导轨一次只跨 1～2 行（36 / 72px），0.35 咬进邻居一行再收回来才像弹簧。

注意：`panel` 预设从父卡 300ms 离场结束后开始错峰；地区三列用稳定 key 且 `start-index="2"`；地图表面只过渡透明度。`trend` 是七日预报的温度曲线，进场延迟（340ms）略短于离场时长（360ms），换数据时新旧两条曲线会有一小段同时在场，不会出现空窗。

**CSS 入场一律不缩放，只动 `opacity` + `translate`。** `scale` 会让合成器把整块当成一张纹理去缩放，收尾拆层那一帧按 1:1 重新栅格化，文字（亚像素 → 像素网格）和 1px 边框会明显跳一下——就是「错峰结束之后文本和盒子抖一下」。位移只移动纹理、不改变内容到像素的映射，跳变小到看不见；「浮起来」的手感靠 `travel`，不要靠 `scale`。例外只有 `bar`（柱状图从基线长高，没有文字）和地图瓦片 / 滑动块这类功能性缩放。弹层外壳（`WeatherDialog` / 设置页 / 帮助页 / 地区选择）同理：进场只位移 + 去模糊。

天气卡右栏不再把整块详情当成一个错峰项：标题与日出日落行各用 `StaggerTransition`（`content` / `sunRow`），六张指标卡用 `StaggerGroup` + `stat` 逐张浮起，七日预报的七列用 `forecastDay` 逐列落位。**装卡片的容器本身不要再淡入一次**（例如 `ul.stat-grid`、`.forecast` 根节点），否则外层透明度和子项透明度相乘，前几项会明显比后几项更淡；需要逐项进场时，只让子项走 `stagger-*` 过渡。七日预报选中列的底色 / 描边（`.forecast-thumb` / `.forecast-frame`）也用 `forecastDay` + `activeIndex`，与选中列同时出现。

**例外（anime.js 逐帧写样式）**：空气质量弹层正文五块、分钟级降水弹层正文各块（标题 / 副标题 / 图表 / 时间轴 / 汇总 / 来源）不用 CSS 过渡，改由组件自己的 `playEntrance()` 用 `animate()` + `stagger()` 逐帧写内联 opacity / scale —— 这两屏的正文是滚动容器，加不了位移（会闪滚动条），只能靠缩放维持「浮起」的手感；而缩放交给 CSS transition 会被合成器当纹理缩放、收尾重栅格时跳一下，逐帧写样式才按当前尺寸重画。分钟级降水里那 24 根柱子仍然是 CSS 预设 `bar`（靠 scale 的 Y 分量从基线长高），它的 `base: 280` 就是正文图块开始落位的时间（`170 + 2 × 55`）：改一边要同步改另一边。

指标角标的悬停提示也归这一档：`StatDelta.vue` 的 `playTip()` 用 anime 的 `inOutBack` 逐帧写 `opacity` 和 `--tip-hide` 两个量，位移 / 去模糊由 CSS 的 `calc()` 从 `--tip-hide` 换算（写法同下面的 `--fc-active`），节奏在组件的 `TIP_MOTION`。它原来是 `transitions.scss` 里一条 `.stat:hover` 的纯 CSS 过渡，搬走是因为 back 曲线（先反向拉一点、再冲过目标）写不进 `cubic-bezier`；0.16s 意图延迟 / 0.12s 离场宽限随之改为 `setTimeout`，热区仍是整张指标卡。

七日预报选中块的**横移**不归 `transitions.scss` 管：`ForecastStrip.vue` 用 anime.js 的弹簧逐帧写一个「带小数的列号」`--fc-active` 到自己的根节点，块 / 描边 / 导引线三片各用 CSS `calc` 从同一个变量换算位置（所以不需要测像素、不需要 ResizeObserver，缩放换主题都自动跟着走）。改手感只改 `SPRING_PRESETS.slide`；`--fc-active` 千万别再写回模板的 `:style`，也不要给 `transform` / `left` 加 `transition`。

设置弹窗左导轨的选中块（`.sd-nav-thumb`）同理，只是它竖着走：行高由文字撑开，CSS 算不出来，所以位置仍是脚本量出来的 `offsetTop` / `offsetHeight`，再由 anime.js 逐帧写 `translateY` + `height`（`SPRING_PRESETS.navThumb`）。`transform` / `height` 不要再挂 CSS `transition`，否则逐帧写和过渡会互相拖；`.sd-nav-thumb` 上只剩 `opacity` 的过渡，负责「换组时旧滑块淡出、新组那块显出来」，换组不滑（中间隔着分组标题，飞过去会盖住它们）。
