/** 按本次峰值选择 1 / 2 / 5 的量程，上方至少留 20% 余量。 */
export const selectRainScale = (peakRate, currentMax = 0, type = 'rain') => {
  const peak = Number.isFinite(peakRate) ? Math.max(0, peakRate) : 0
  const required = peak * 1.2
  const target = Math.max(required, type === 'snow' ? 0.002 : 0.02)
  const magnitude = 10 ** Math.floor(Math.log10(target))
  const factor = [1, 2, 5, 10].find((step) => step * magnitude >= target - magnitude * 1e-10)
  const nextMax = factor * magnitude

  // 扩档立即生效；缩档要比扩档边界再低 20%，避免临界值附近反复跳动。
  if (nextMax < currentMax && required > currentMax * 0.4) return currentMax
  return nextMax
}

/** 等级线等距分布，柱体共用分段线性映射；顶部留一小段显示超过最高参考线的强度。 */
export const createGradeHeightScale = (referenceLevels, peakRate) => {
  const topPosition = 0.9
  const positiveCount = referenceLevels.filter((level) => level.min > 0).length
  let positiveIndex = 0
  const ticks = referenceLevels.map((level) => ({
    key: level.key,
    label: level.label,
    rate: level.min,
    position: level.min > 0 ? topPosition * (++positiveIndex / positiveCount) : 0,
  }))
  const anchors = [{ rate: 0, position: 0 }, ...ticks.filter((tick) => tick.rate > 0)]
  const highest = anchors[anchors.length - 1]
  const previous = anchors[anchors.length - 2]
  // 超出最高参考档时仍保持单调，不把更大的值全部截成同样高度。
  anchors.push({
    rate: Math.max(Number.isFinite(peakRate) ? peakRate : 0, highest.rate + (highest.rate - (previous?.rate || 0)), 0.001),
    position: 1,
  })
  const height = (rate) => {
    if (!Number.isFinite(rate) || rate <= 0) return 0
    const index = anchors.findIndex((anchor) => anchor.rate >= rate)
    if (index < 0) return 1
    const lower = anchors[index - 1]
    const upper = anchors[index]
    return lower.position + (rate - lower.rate) / (upper.rate - lower.rate) * (upper.position - lower.position)
  }
  return { ticks, height }
}
