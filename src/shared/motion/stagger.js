// 错峰进场的唯一定时配置；业务组件只选择预设与顺序。
// delay = base + min(index * step, maxDelay)，leave 不沿用 enter 的延迟。
export const STAGGER_PRESETS = Object.freeze({
  content: { duration: 480, base: 80, step: 50, maxDelay: 250, travel: '0.75rem' },
  // 面板切换先离场 300ms，内容从面板开始显现时再按阅读顺序进入。
  panel: { duration: 480, base: 300, step: 60, maxDelay: 360, travel: '0.75rem' },
  // 地图只淡入，避免位移影响视口测量、选点坐标与裁切框。
  mapSurface: { duration: 480, base: 420, step: 0, maxDelay: 0, travel: '0px' },
  warning: { duration: 420, base: 0, step: 90, maxDelay: 360, travel: 'calc(var(--warning-unit) * 0.7)', scale: '0.985' },
  bar: { duration: 500, base: 0, step: 16, maxDelay: 240, travel: '0px', scale: '1 0', opacity: 1 },
  restore: { duration: 220, base: 0, step: 20, maxDelay: 40, travel: '0.375rem' },
  mapTop: { duration: 240, base: 0, step: 40, maxDelay: 40, leave: 160, travel: '-0.5rem', easing: 'var(--ease)' },
  mapBottom: { duration: 240, base: 0, step: 40, maxDelay: 40, leave: 160, travel: '0.5rem', easing: 'var(--ease)' },
  mapControls: { duration: 240, base: 0, step: 0, maxDelay: 0, leave: 160, travel: '0px', easing: 'var(--ease)' },
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
