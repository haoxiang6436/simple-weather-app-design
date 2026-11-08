// QWeather: messageType describes the message lifecycle; issuedTime is its issue time.
// https://dev.qweather.com/docs/api/warning/alert-changes/
const WARNING_STATUS = {
  alert: { label: '新增', action: '发布' },
  update: { label: '更新', action: '更新' },
  cancel: { label: '已取消', action: '取消' },
}

export const warningStatus = (warning) => Object.prototype.hasOwnProperty.call(WARNING_STATUS, warning?.status)
  ? WARNING_STATUS[warning.status] : null

export const warningAgeLabel = (warning, now = Date.now()) => {
  const issuedAt = Date.parse(warning?.pubTime)
  const age = now - issuedAt
  if (!Number.isFinite(issuedAt) || !Number.isFinite(now) || age < 0) return ''
  const minutes = Math.floor(age / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}小时前`
  return `${Math.floor(minutes / (24 * 60))}天前`
}

const WARNING_COLOR_CN = {
  white: '白色', gray: '灰色', green: '绿色', blue: '蓝色', yellow: '黄色',
  amber: '橙色', orange: '橙色', red: '红色', purple: '紫色', black: '黑色',
}

export const normalizeWarning = (alert) => ({
  id: alert.id,
  title: alert.headline || alert.eventType?.name || '',
  text: alert.description || '',
  type: alert.eventType?.code || '',
  typeName: alert.eventType?.name || '',
  icon: alert.icon || alert.eventType?.code || '100',
  level: WARNING_COLOR_CN[alert.color?.code] || '',
  severity: alert.severity || '',
  urgency: alert.urgency || '',
  certainty: alert.certainty || '',
  status: alert.messageType?.code || '',
  supersedes: Array.isArray(alert.messageType?.supersedes) ? alert.messageType.supersedes : [],
  sender: alert.senderName || '',
  pubTime: alert.issuedTime || '',
  startTime: alert.onsetTime || alert.effectiveTime || '',
  effectiveTime: alert.effectiveTime || '',
  onsetTime: alert.onsetTime || '',
  endTime: alert.expireTime || '',
  criteria: alert.criteria || '',
  instruction: alert.instruction || '',
})

const warningSenderRank = (sender) => {
  const region = String(sender || '').replace(/气象(?:台|局).*$/, '').trim()
  if (/(县|旗|区)$/.test(region) && !/自治区$/.test(region)) return 3
  if (/(北京|上海|天津|重庆)市$/.test(region)) return 1
  if (/(市|州|盟)$/.test(region)) return 2
  if (/(省|自治区|直辖市)$/.test(region)) return 1
  return 0
}

const warningLevelRank = (level) => {
  const value = String(level || '')
  if (value.includes('红')) return 4
  if (value.includes('橙')) return 3
  if (value.includes('黄')) return 2
  if (value.includes('蓝')) return 1
  return 0
}

export const deduplicateWarnings = (warnings) => {
  // Resolve explicit replacements before severity ranking: an update may downgrade a warning.
  const superseded = new Set(warnings.flatMap((warning) =>
    ['update', 'cancel'].includes(warning.status) ? warning.supersedes || [] : []))
  const unique = new Map()
  for (const warning of warnings) {
    if (superseded.has(warning.id)) continue
    const event = warning.typeName || warning.type || warning.title
    // A cancellation from one authority must not hide another authority's active warning.
    const key = JSON.stringify([event, warning.status === 'cancel' ? 'cancel' : 'active'])
    const current = unique.get(key)
    if (!current) {
      unique.set(key, warning)
      continue
    }
    const levelRank = warningLevelRank(warning.level)
    const currentLevelRank = warningLevelRank(current.level)
    const rank = warningSenderRank(warning.sender)
    const currentRank = warningSenderRank(current.sender)
    const issuedAt = Date.parse(warning.pubTime) || 0
    const currentIssuedAt = Date.parse(current.pubTime) || 0
    if (levelRank > currentLevelRank || (levelRank === currentLevelRank && (
      rank > currentRank || (rank === currentRank && issuedAt > currentIssuedAt)
    ))) unique.set(key, warning)
  }
  return [...unique.values()]
}
