// Run with: node scripts/test-weather-warnings.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const source = await readFile(new URL('../src/features/weather/warnings.js', import.meta.url), 'utf8')
const { warningStatus, warningAgeLabel, normalizeWarning, deduplicateWarnings } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
let checks = 0
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks += 1 }
const now = Date.parse('2026-11-08T18:00:00+08:00')
const message = (id, code = 'alert', supersedes = [], overrides = {}) => normalizeWarning({
  id, messageType: { code, supersedes }, issuedTime: '2026-11-08T17:00:00+08:00',
  senderName: '黄岩区气象台', eventType: { code: '1006', name: '大风' }, color: { code: 'yellow' },
  ...overrides,
})
for (const [code, label, action] of [['alert', '新增', '发布'], ['update', '更新', '更新'], ['cancel', '已取消', '取消']]) {
  const warning = message(code, code)
  check(warningStatus(warning), { label, action })
  check(warningAgeLabel(warning, now), '1小时前')
}
for (const status of ['', undefined, 'unknown', 'toString', '__proto__']) check(warningStatus({ status }), null)
for (const [pubTime, expected] of [
  ['2026-11-08T16:00:00+08:00', '2小时前'],
  ['2026-11-08T08:00:00Z', '2小时前'], // Same instant with a different offset.
  ['2026-11-08T17:01:00+08:00', '59分钟前'],
  ['2026-11-08T18:00:00+08:00', '刚刚'],
  ['2026-11-07T18:00:00+08:00', '1天前'],
  ['2026-11-08T18:00:00.001+08:00', ''],
  ['', ''], ['invalid', ''], [null, ''], [undefined, ''],
]) check(warningAgeLabel({ pubTime }, now), expected)
check(warningAgeLabel(message('a'), NaN), '')
check(warningAgeLabel(message('a'), now + 2 * 3600000), '3小时前')
const initial = message('a', 'alert', [], { color: { code: 'red' } })
const update = message('b', 'update', ['a'])
const cancel = message('c', 'cancel', ['b'])
const ids = (warnings) => deduplicateWarnings(warnings).map((warning) => warning.id)
check(update.supersedes, ['a'])
check(ids([initial, update]), ['b']) // Explicit downgrade replaces an older red warning.
check(ids([update, initial]), ['b']) // Response order does not affect replacement.
check(ids([initial, cancel, update]), ['c']) // Entire replacement chain.
check(ids([cancel, message('other', 'alert')]), ['c', 'other']) // Another authority's active message survives.
check(ids([message('district'), message('province', 'alert', [], { senderName: '浙江省气象台' })]), ['district'])
check(ids([message('district'), initial]), ['a']) // Existing severity preference remains.
check(ids([message('old'), message('new', 'update', [], { issuedTime: '2026-11-08T17:30:00+08:00' })]), ['new'])
check(normalizeWarning({}).status, '')
check(normalizeWarning({ messageType: { supersedes: null } }).supersedes, [])
check(ids([]), [])
console.log(`Weather warning lifecycle: ${checks} checks passed.`)
