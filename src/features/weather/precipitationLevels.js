/**
 * 降水量等级，单位为毫米（水当量）。
 * 雨强参考 DB3601/T 13—2025（南昌市）表 1 的 1 小时阈值；适用范围为南昌市。
 * https://sgj.nc.gov.cn/ncsgj/tztg/202501/444acbb76a5546b59d39d1ecb8837e99.shtml
 * 分钟图用 5 分钟量折算的 mm/h 对照分级，不代表实际 1 小时累计量。
 * 雪强参考 DB65/T 3273—2026（新疆）表 2 的 1 小时水当量阈值。
 * https://std.samr.gov.cn/db/search/stdDBDetailed?id=5C24191F6005B53CE06397BE0A0A5D7A
 * 雪表的六个等级从 0.1 mm 起；更小的非零值用「零星小雪」提示，不属于表内等级。
 */
const GRADES = [
  { key: 'trace', rain: '零星小雨', snow: '零星小雪', tone: 'light' },
  { key: 'light', rain: '小雨', snow: '小雪', tone: 'light' },
  { key: 'moderate', rain: '中雨', snow: '中雪', tone: 'moderate' },
  { key: 'heavy', rain: '大雨', snow: '大雪', tone: 'heavy' },
  { key: 'storm', rain: '暴雨', snow: '暴雪', tone: 'storm' },
  { key: 'severe', rain: '大暴雨', snow: '大暴雪', tone: 'storm' },
  { key: 'extreme', rain: '特大暴雨', snow: '特大暴雪', tone: 'storm' },
]
const LIMITS = {
  rain: { 12: [0, 0.1, 5, 15, 30, 70, 140], 24: [0, 0.1, 10, 25, 50, 100, 250] },
  snow: { 12: [0, 0.1, 1, 3, 6, 10, 15], 24: [0, 0.1, 2.5, 5, 10, 20, 30] },
}
const RAIN_HOURLY_LIMITS = [0, 0.1, 1, 5, 15, 30, 50]
const SNOW_HOURLY_LIMITS = [0, 0.1, 0.6, 1.1, 2.1, 4.1, 8]

export const getAccumulationLevelSteps = (type = 'rain', hours = 12) => {
  if (hours !== 12 && hours !== 24) throw new RangeError('累计分级只适用于 12 或 24 小时')
  const kind = type === 'snow' ? 'snow' : 'rain'
  return GRADES.map((grade, rank) => ({
    ...grade, rank, type: kind, label: grade[kind], min: LIMITS[kind][hours][rank],
  }))
}

export const getRateLevelSteps = (type = 'rain') => {
  const kind = type === 'snow' ? 'snow' : 'rain'
  return GRADES.map((grade, rank) => ({
    ...grade, rank, type: kind, label: grade[kind],
    min: (kind === 'snow' ? SNOW_HOURLY_LIMITS : RAIN_HOURLY_LIMITS)[rank],
    // 表 2 明确规定特大暴雪 >8.0；8.0 仍属于大暴雪。
    exclusive: kind === 'snow' && grade.key === 'extreme',
  }))
}

export const rateLevel = (rate, type = 'rain') => {
  const levels = getRateLevelSteps(type)
  return [...levels].reverse().find((grade) => grade.exclusive
    ? Number(rate) - grade.min > 1e-10
    : Number(rate) + 1e-10 >= grade.min) || levels[0]
}

/** 参考线围绕当前等级：下一级、当前级、上一级；两端只保留已有档位。 */
export const getReferenceLevelSteps = (rate, type = 'rain') => {
  const levels = getRateLevelSteps(type)
  const { rank } = rateLevel(rate, type)
  // 零星小雪是表外微量提示，不画作地方标准中的参考等级。
  if (rank === 0) return type === 'snow' ? levels.slice(1, 3) : levels.slice(0, 2)
  return levels.slice(Math.max(1, rank - 1), rank + 2)
}

/** 有效分钟预报优先；没有有效数据时才用实时天气的明确雨雪信息兜底。 */
export const precipitationPresentation = (analysis, weather = {}) => {
  let type = analysis && !analysis.expired ? (analysis.mixed ? 'mixed' : analysis.type) : null
  if (!type) {
    const icon = String(weather.icon || '')
    const text = String(weather.text || '')
    if (['404', '405', '406', '456'].includes(icon) || /雨夹雪|雨雪/.test(text)) type = 'mixed'
    else if (['400', '401', '402', '403', '407', '408', '409', '410', '457', '499'].includes(icon) || /雪/.test(text)) type = 'snow'
    else if (/^3\d\d$/.test(icon) || /雨/.test(text)) type = 'rain'
  }
  const noun = type === 'snow' ? '降雪' : type === 'rain' ? '降雨' : '降水'
  const strength = type === 'snow' ? '降雪强度' : type === 'rain' ? '雨强' : '降水强度'
  const referenceLabel = type === 'snow' ? '新疆小时分级参考' : type === 'mixed' ? '雨雪分级参考' : '南昌小时分级参考'
  return { type, noun, strength, referenceLabel, title: `分钟级${noun}`, dry: `无${noun}` }
}

export const formatPrecipRate = (rate, type = 'rain') => {
  const value = Math.max(0, Number(rate) || 0)
  // 刚超过 8.0 时保留足够精度，避免特大暴雪明细却显示「8.0」。
  if (type === 'snow' && value > 8 && value.toFixed(1) === '8.0') {
    for (let digits = 2; digits <= 10; digits += 1) {
      const rounded = value.toFixed(digits)
      if (Number(rounded) > 8) return `${rounded} mm/h`
    }
  }
  return `${value.toFixed(value > 0 && value < 0.1 ? 3 : value < 1 ? 2 : 1)} mm/h`
}
