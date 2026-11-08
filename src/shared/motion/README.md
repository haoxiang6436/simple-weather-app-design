# 错峰渐入

`StaggerTransition` 内部使用 Vue `Transition`，不增加 DOM 包装层。适合单个元素、组件根元素、`v-if` 和 `v-show`。原生事件（如 `after-enter`、`enter-cancelled`）直接透传。

```vue
<StaggerTransition preset="warning" :index="index">
  <WarningDetailCard :warning="item" />
</StaggerTransition>
```

`StaggerGroup` 内部使用 Vue `TransitionGroup`，按直接子项的渲染顺序计算延迟；`start-index` 可让多个区域衔接到同一阅读顺序。`tag` 复用已有布局容器，每个直接子项必须提供稳定的 `key`。

```vue
<StaggerGroup tag="header" class="hero">
  <div key="location">...</div>
  <div key="weather">...</div>
</StaggerGroup>
```

两者默认 `appear`，首次挂载也会渐入；用 `:appear="false"` 只响应后续显隐。`StaggerTransition` 的 `:enabled="false"` 关闭 CSS 过渡，仍保留 Vue 的显隐管理。

所有预设、时长、缓动、间隔、最大延迟与位移统一修改 `stagger.js`；样式统一在 `src/style/transitions.scss`。业务组件只指定 `preset` 和 `index`，不再使用局部 keyframes、定时器、帧回调或父级 active 类触发错峰。默认离场没有延迟，地图浮层单独配置离场时长。减少动态效果时不保留错峰等待。

现有入口：天气卡两栏（`content`）、引导页与设置页的内容区块、地址页标题/热门/页脚、地区三列与重选地区弹窗（`panel`）、地图表面（`mapSurface`）、预警轮播卡（`warning`）、降水柱（`bar`）与地图全屏浮层（`mapTop` / `mapBottom` / `mapControls`）。

`panel` 预设从整卡 300ms 离场结束时开始错峰，防止内容在父面板透明期间播完。地区列从 `start-index="2"` 接在标题和热门之后；三列保持稳定 key，选择省/市只更新列表内容，不重建滚动实例。地图表面只过渡透明度，不改变视口尺寸或位移。
