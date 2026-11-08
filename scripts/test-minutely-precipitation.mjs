import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sourceUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const root = new URL('../src/features/weather/', import.meta.url)
const levelsUrl = sourceUrl(await readFile(new URL('precipitationLevels.js', root), 'utf8'))
const levels = await import(levelsUrl)
const analysisSource = (await readFile(new URL('minutelyRain.js', root), 'utf8'))
  .replaceAll("'./precipitationLevels'", JSON.stringify(levelsUrl))
const { analyzeMinutely, minutelyTitle, minutelyChipText } = await import(sourceUrl(analysisSource))
const { createGradeHeightScale, selectRainScale } = await import(sourceUrl(await readFile(new URL('minutelyRainScale.js', root), 'utf8')))
let checks = 0
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks += 1 }

// 逐项校验用户提供的两张表，包括 12/24 小时的差别。
for (const [type, hours, expected] of [
  ['rain', 12, [0, 0.1, 5, 15, 30, 70, 140]],
  ['rain', 24, [0, 0.1, 10, 25, 50, 100, 250]],
  ['snow', 12, [0, 0.1, 1, 3, 6, 10, 15]],
  ['snow', 24, [0, 0.1, 2.5, 5, 10, 20, 30]],
]) check(levels.getAccumulationLevelSteps(type, hours).map((step) => step.min), expected)
check(levels.getRateLevelSteps('rain').map((step) => step.min), [0, 0.1, 1, 5, 15, 30, 50])
check(levels.getRateLevelSteps('snow').map((step) => step.min), [0, 0.1, 0.6, 1.1, 2.1, 4.1, 8])
check(levels.getRateLevelSteps('snow').filter((step) => step.rank > 0).length, 6)

for (const type of ['rain', 'snow']) {
  for (const [index, grade] of levels.getRateLevelSteps(type).entries()) {
    check(levels.rateLevel(grade.min, type).rank, grade.exclusive ? index - 1 : index)
    if (grade.exclusive) check(levels.rateLevel(grade.min + 1e-8, type).key, grade.key)
    check(grade.tone, index < 2 ? 'light' : index >= 4 ? 'storm' : grade.key)
    if (index > 0) check(levels.rateLevel(grade.min - 1e-8, type).rank, index - 1)
  }
}
check(levels.rateLevel(0.12, 'rain').label, '小雨')
check(levels.rateLevel(0.12, 'snow').label, '小雪')
check(levels.rateLevel(2.76, 'rain').label, '中雨')
for (const [rate, label] of [
  [0.099, '零星小雨'], [0.1, '小雨'], [0.95, '小雨'], [1, '中雨'],
  [4.99, '中雨'], [5, '大雨'], [14.99, '大雨'], [15, '暴雨'],
  [29.99, '暴雨'], [30, '大暴雨'], [49.99, '大暴雨'], [50, '特大暴雨'],
]) check(levels.rateLevel(rate, 'rain').label, label)
for (const [rate, label] of [
  [0.099, '零星小雪'], [0.1, '小雪'], [0.5, '小雪'],
  [0.6, '中雪'], [1, '中雪'], [1.1, '大雪'], [2, '大雪'],
  [2.1, '暴雪'], [4, '暴雪'], [4.1, '大暴雪'], [8, '大暴雪'],
  [8 + 1e-8, '特大暴雪'], [8.04, '特大暴雪'], [9, '特大暴雪'],
]) check(levels.rateLevel(rate, 'snow').label, label)
check(levels.getReferenceLevelSteps(6).map((level) => level.label), ['中雨', '大雨', '暴雨'])
check(levels.getReferenceLevelSteps(2).map((level) => level.label), ['小雨', '中雨', '大雨'])
check(levels.getReferenceLevelSteps(20).map((level) => level.label), ['大雨', '暴雨', '大暴雨'])
check(levels.getReferenceLevelSteps(1.5, 'snow').map((level) => level.label), ['中雪', '大雪', '暴雪'])
check(levels.getReferenceLevelSteps(0.3, 'snow').map((level) => level.label), ['小雪', '中雪'])
check(levels.getReferenceLevelSteps(9, 'snow').map((level) => level.label), ['大暴雪', '特大暴雪'])
check(levels.getReferenceLevelSteps(8, 'snow').map((level) => level.label), ['暴雪', '大暴雪', '特大暴雪'])
check(levels.getReferenceLevelSteps(0.004, 'snow').map((level) => level.label), ['小雪', '中雪'])

const now = Date.parse('2026-11-08T10:00:00Z')
const points = (amounts, types = 'snow', offset = 0) => amounts.map((precip, index) => ({
  time: new Date(now + (index + offset) * 300000).toISOString(), precip,
  type: Array.isArray(types) ? types[index] : types,
}))
const heavyRain = analyzeMinutely(points([0.5, 0.5, 0.5], 'rain'), now)
check(heavyRain.rate, 6)
check(heavyRain.level.label, '大雨')
check(minutelyChipText(heavyRain), '正在下大雨，未来两小时持续降雨')
check(minutelyTitle(heavyRain), minutelyChipText(heavyRain))
check(levels.precipitationPresentation(heavyRain).referenceLabel, '南昌小时分级参考')
for (const [rate, label] of [[0.6, '中雪'], [1.1, '大雪'], [2.1, '暴雪'], [4.1, '大暴雪'], [8, '大暴雪'], [8.04, '特大暴雪']]) {
  const snow = analyzeMinutely(points([rate / 12, rate / 12]), now)
  check(snow.level.label, label)
  check(minutelyChipText(snow), `正在下${label}，未来两小时持续降雪`)
  check(minutelyTitle(snow), minutelyChipText(snow))
  check(Math.abs(snow.total - rate / 6) < 1e-10, true)
}
const drySnow = analyzeMinutely(points(Array(24).fill(0)), now)
check(minutelyTitle(drySnow), '未来两小时无降雪')
check(levels.precipitationPresentation(drySnow).title, '分钟级降雪')
check(levels.precipitationPresentation(drySnow).dry, '无降雪')
check(levels.precipitationPresentation(drySnow).referenceLabel, '新疆小时分级参考')

const nextSnow = analyzeMinutely(points([0, 0.02, 0.02, 0.02], ['rain', 'snow', 'snow', 'snow']), now)
check(nextSnow.type, 'snow')
check(minutelyChipText(nextSnow), '5分钟后下小雪')
const snowing = analyzeMinutely(points([0.06, 0.06, 0.06]), now)
check(snowing.level.label, '中雪')
check(minutelyTitle(snowing), '正在下中雪，未来两小时持续降雪')
const traceSnow = analyzeMinutely(points([0.0001, 0.0001]), now)
check(traceSnow.raining, true)
check(traceSnow.level.label, '零星小雪')

const snowToRain = analyzeMinutely(points([0.02, 0.02, 0.02, 0.02], ['snow', 'snow', 'rain', 'rain']), now)
check(snowToRain.mixed, true)
check(snowToRain.currentType, 'snow')
check(minutelyTitle(snowToRain), '正在下小雪，10分钟后转小雨')
check(levels.precipitationPresentation(snowToRain).title, '分钟级降水')
check(levels.precipitationPresentation(snowToRain).referenceLabel, '雨雪分级参考')
const rainToSnow = analyzeMinutely(points([0.02, 0.02, 0.02, 0.02], ['rain', 'rain', 'snow', 'snow']), now)
check(rainToSnow.currentType, 'rain')
check(minutelyTitle(rainToSnow), '正在下小雨，10分钟后转小雪')
const stopped = analyzeMinutely(points([0.02, 0, 0.02, 0.02], ['rain', 'rain', 'snow', 'snow'], -1), now)
check(minutelyTitle(stopped), '雨刚停，不过5分钟后又有小雪')

check(levels.precipitationPresentation(null, {icon: '400'}).type, 'snow')
check(levels.precipitationPresentation(null, {icon: '404'}).type, 'mixed')
check(levels.precipitationPresentation(null, {icon: '305'}).type, 'rain')
check(levels.precipitationPresentation(null, {icon: '100'}).type, null)
check(levels.precipitationPresentation({...drySnow, expired: true}, {icon: '305'}).type, 'rain')
check(selectRainScale(0.12, 0, 'snow'), 0.2)
check(selectRainScale(0.18, 0.2, 'snow'), 0.5)
check(selectRainScale(0.18, 0.5, 'snow'), 0.5)
check(selectRainScale(0.12, 0.5, 'snow'), 0.2)
check(selectRainScale(0, 0, 'snow'), 0.002)
check(selectRainScale(0.004, 0, 'snow'), 0.005)
check(selectRainScale(0.1), 0.2)
check(selectRainScale(1.3), 2)
check(selectRainScale(2.76), 5)
check(selectRainScale(110.4), 200)
for (const type of ['rain', 'snow']) {
  for (const peak of [0, 0.001, 0.004, 0.01, 0.1, 0.3, 1.3, 5, 10, 30, 110.4]) {
    check(selectRainScale(peak, 0, type) >= peak * 1.2 - 1e-10, true)
  }
}
check(levels.formatPrecipRate(0.004), '0.004 mm/h')
check(levels.formatPrecipRate(0.12), '0.12 mm/h')
check(levels.formatPrecipRate(8, 'snow'), '8.0 mm/h')
check(levels.formatPrecipRate(0.67 * 12, 'snow'), '8.04 mm/h')
check(levels.formatPrecipRate(8.00004, 'snow'), '8.00004 mm/h')

// 等级线铺满垂直空间，柱高与阈值吻合；峰值跨越最高参考线时也不能压平。
for (const [type, currentRate, peak] of [
  ['rain', 0.05, 0.05], ['rain', 0.5, 0.5], ['rain', 2, 2],
  ['rain', 6, 8], ['rain', 6, 60], ['rain', 60, 60],
  ['snow', 0.004, 0.004], ['snow', 1.5, 1.8], ['snow', 8, 8], ['snow', 9, 9],
]) {
  const references = levels.getReferenceLevelSteps(currentRate, type)
  const scale = createGradeHeightScale(references, peak)
  const positive = scale.ticks.filter((tick) => tick.rate > 0)
  check(positive.at(-1).position, 0.9)
  check(positive.every((tick, index) => Math.abs(tick.position - 0.9 * (index + 1) / positive.length) < 1e-10), true)
  check(scale.ticks.every((tick) => Math.abs(scale.height(tick.rate) - tick.position) < 1e-10), true)
  check(scale.height(0), 0)
  const heights = Array.from({ length: 101 }, (_, index) => scale.height(peak * index / 100))
  check(heights.every((height, index) => height >= 0 && height <= 1 && (!index || height > heights[index - 1])), true)
  if (peak > positive.at(-1).rate) check(scale.height(peak) > 0.9, true)
}
check(createGradeHeightScale([], 0).height(0), 0)
check(createGradeHeightScale([], 0).ticks, [])
console.log(`PASS: ${checks} precipitation checks (classification, totals, boundaries, transitions, dynamic ranges and evenly spaced grade height mapping)`)
