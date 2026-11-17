// 错峰进场的唯一定时配置；业务组件只选择预设与顺序。
// delay = base + min(index * step, maxDelay)，leave 不沿用 enter 的延迟。
//
// ⚠️ 入场一律不用 scale，只动 opacity + translate。
//    原因：CSS transition 的 transform/scale 交给合成器后，整块会被当成一张纹理去缩放；
//    收尾拆层那一帧按 1:1 重新栅格化，文字（亚像素 → 像素网格）和 1px 边框会明显跳一下——
//    就是「错峰结束之后文本和盒子抖一下」。位移只移动纹理、不改变内容到像素的映射，跳变小到看不见。
//    例外只有 `bar`：柱子从基线长高是功能性缩放（没有文字），仍走 scale 的 Y 分量。
export const STAGGER_PRESETS = Object.freeze({
  content: { duration: 480, base: 80, step: 50, maxDelay: 250, travel: '0.75rem' },
  // 面板切换先离场 300ms，内容从面板开始显现时再按阅读顺序进入。
  panel: { duration: 480, base: 300, step: 60, maxDelay: 360, travel: '0.75rem' },
  // 地图只淡入，避免位移影响视口测量、选点坐标与裁切框。
  mapSurface: { duration: 480, base: 420, step: 0, maxDelay: 0, travel: '0px' },
  // 右侧六张指标卡：每张单独浮起，按阅读顺序逐张落位（整块网格不再算一个错峰项）。
  // base 紧跟着标题（80ms）起步，卡片不会先空一拍；位移比整块进场小一档，
  // 因为卡片本身有底色和描边，0.5rem 已经能看出「浮上来」。
  stat: { duration: 440, base: 120, step: 42, maxDelay: 210, travel: '0.5rem' },
  // 日出日落行：接在六张指标卡之后单独落位（最后一张卡 330ms 起）。
  sunRow: { duration: 480, base: 330, step: 0, maxDelay: 0, travel: '0.5rem' },
  // 七日预报的七列：从左到右逐列落位。选中列的底色 / 描边（thumb / frame）也走这一档，
  // 高亮会和它那一列同时出现，而不是提前亮在一片还没出现的文字上。
  forecastDay: { duration: 460, base: 340, step: 44, maxDelay: 264, travel: '0.5rem' },
  // 温度趋势曲线：不淡入、不位移，进场靠 clip-path 从左往右把线「画」出来
  // （reveal 的声明在 ForecastStrip.vue，时长/延迟就用这里的 --stagger-* 变量）。
  // 缓动刻意不用 --ease-enter：那条曲线一上来就冲刺 40%，看着像「刷」地一下出现；
  // 这里要的是匀速偏减速，线条才能一路「画」过去。
  // 进场延迟（340）略短于离场时长（360）：换数据时旧的曲线还在淡出，新的才开始画，
  // 两条曲线会短暂同框，预报区不会先空一下。
  // 340 = 预报七列开始落位的时间：曲线和第一列同时起笔，不会在空白的预报区里先画一遍。
  trend: { duration: 640, base: 340, step: 0, maxDelay: 0, travel: '0px', opacity: 1, leave: 360, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  // 曲线的「选中日端点 / 导引线」：曲线快画完时（340 + 640 - 40）落下来，
  // 和原来的相对时序一致 —— 不用等满一整条线，免得最后只剩两个点在动。
  trendMarker: { duration: 300, base: 940, step: 0, maxDelay: 0, travel: '0px', leave: 160, easing: 'var(--ease-enter)' },
  warning: { duration: 420, base: 0, step: 90, maxDelay: 360, travel: 'calc(var(--warning-unit) * 0.7)' },
  // 空气质量弹层正文（结论 / 刻度 / 污染物 / 建议 / 来源）不再走这里：
  // 那五块改用 anime.js 逐帧写内联 opacity / scale（见 AirQualityDialog.vue 的 playEntrance()）。
  // 原因是纯文字的块贴在同一张玻璃上没有底色遮挡，CSS transition 的 opacity 会在
  // 结束时把文字重新栅格化，看着就是"错峰结束时抖一下"；对照样机在 dev/stagger-lab.html。
  // 原来的时序（起点 170 / 间距 55 / 时长 380）已经搬进组件的 AQI_ENTER 常量。
  // 设置弹窗（左导轨 + 右正文）：菜单逐行亮起，正文再晚半拍跟上。
  // 面板自己走的是全局 Dialog 动效（0.48s 从上方落位 + 去模糊，和预警 / 空气质量弹层同一套），
  // 所以两档的 base 都从 200ms 之后起，内容不会在面板还糊着的时候就把戏演完。
  // 换分区时只有正文重播这一档：菜单是外壳，不跟着再闪一次。
  settingsNav: { duration: 400, base: 200, step: 32, maxDelay: 160, travel: '0.5rem' },
  // base 比 settingsNav 再晚 40ms：先看到菜单落定，再读正文。
  // travel 只用 0.625rem：正文区是 overflow-y 的滚动容器，位移再多会在短面板里顶出滚动条。
  settingsPane: { duration: 440, base: 240, step: 56, maxDelay: 260, travel: '0.625rem' },
  // 分钟级降水弹层的 24 根柱子：不淡入，靠 scale 的 Y 分量从 0 长到 1（transform-origin 在基线）。
  // base 已经不是 0：那一屏正文的其它块（标题 / 副标题 / 图表 / 时间轴 / 汇总 / 来源）改用
  // anime.js 的 stagger() 逐帧进场（MinutelyRainDialog.vue 的 playEntrance()），
  // 柱子得等「图表块」开始落位才长，否则面板还在往里滑的时候柱子就已经长完了。
  // 280 = 那边的 MINUTELY_ENTER.start(170) + 2 × spacing(55)：改一边就要同步另一边。
  // 没有副标题时图表是第 2 块（225ms 起），柱子晚 55ms 起步，肉眼看不出先后。
  bar: { duration: 500, base: 280, step: 16, maxDelay: 240, travel: '0px', scale: '1 0', opacity: 1 },
  restore: { duration: 220, base: 0, step: 20, maxDelay: 40, travel: '0.375rem' },
  mapTop: { duration: 240, base: 0, step: 40, maxDelay: 40, leave: 160, travel: '-0.5rem', easing: 'var(--ease)' },
  mapBottom: { duration: 240, base: 0, step: 40, maxDelay: 40, leave: 160, travel: '0.5rem', easing: 'var(--ease)' },
  mapControls: { duration: 240, base: 0, step: 0, maxDelay: 0, leave: 160, travel: '0px', easing: 'var(--ease)' },
})

// 弹簧动效（anime.js 的 spring 缓动）参数。给「由点击触发、可以随时被打断」的位移用，
// 目前是七日预报的选中滑动块和设置弹窗左导轨的选中块（一个横着走、一个竖着走）。
// 它不是「进场 / 离场」，所以单独放一档，不混进上面的错峰预设。
//
// spring({ bounce, duration }) 用的是 Apple SwiftUI 那套「感知时长 + 回弹量」：
//   bounce   0 = 临界阻尼，一点都不过冲；越接近 1 越弹。负数 = 过阻尼（慢慢贴上去）
//   duration 主观上多久「差不多走完」，真正的 settlingDuration 由求解器算出来
// 0.2 / 340 实测：感知 340ms、峰值出现在 ~283ms、求解器给的总时长 ~680ms
// （最后那截只有零点几像素，眼睛看不出来）。
// 过冲幅度是按距离比例的：跨一列（~97px）约 1.5px，跨六列（~585px）约 9px。
// 为什么不再弹一点：滑动块是「一列宽」的整块，冲过头就会伸出末列、跑到卡片内边距上，
// 跨六列时 27px（bounce 0.3）已经明显离开了这条趋势带。0.2 是还能看出弹簧、
// 又不会飞出行外的那一档；想更弹只改这一个数（0.25 ≈ 17px，0.3 ≈ 27px）。
export const SPRING_PRESETS = Object.freeze({
  slide: { bounce: 0.2, duration: 340 },
  // 设置弹窗左导轨的选中块（组内换项时上下移动）。
  // 竖着走，一次就跨 1～2 行（38 / 76px），所以敢比上面那档弹一些：
  // 0.35 ≈ 过冲 6.8%，跨一行 2.6px、跨两行 5.2px —— 块会稍微咬进相邻那行再收回来，
  // 正是竖向列表最像「弹簧」的幅度；再往上（0.4 ≈ 3.6/7.2px）就开始盖住邻居的字了。
  navThumb: { bounce: 0.35, duration: 300 },
})

export function staggerStyle(preset = 'content', index = 0) {
  const config = STAGGER_PRESETS[preset] || STAGGER_PRESETS.content
  const order = Number.isFinite(Number(index)) ? Math.max(0, Number(index)) : 0
  return {
    '--stagger-duration': `${config.duration}ms`,
    '--stagger-delay': `${config.base + Math.min(order * config.step, config.maxDelay)}ms`,
    '--stagger-leave-duration': `${config.leave || 0}ms`,
    '--stagger-travel': config.travel,
    '--stagger-scale': config.scale || '1',
    '--stagger-opacity': config.opacity ?? 0,
    '--stagger-easing': config.easing || 'var(--ease-enter)',
  }
}
