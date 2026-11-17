// Run with: node scripts/test-request-stats.mjs
//
// 请求量计数的口径守卫。这些断言就是 api/requestStats.js 的契约：
//   - 「一次请求计一次，但非 2xx 不计费」→ ok / soft / err / net 四个桶分开放；
//   - 小时桶只留 48 个，但月合计是独立桶，不能被小时桶裁剪带走；
//   - 月边界按本机自然月，换月后「本月」清零；
//   - 各接口 / 各域名只统计计入额度的那些（配额花在哪儿，失败不占额度）。
//   - 只认和风天气的请求：高德 / 一言带什么 meta 都进不来（额度是「和风账号的额度」）。
// 计费口径一旦被改错，账单是事后才发现的，所以这里写成能跑的断言。
import assert from 'node:assert/strict'
import { recordRequest, readRequestStats, RequestStatsVersion, STATS_SERVICE } from '../src/api/requestStats.js'

const at = (iso) => new Date(iso).getTime()
// 固定一个「现在」：2026-11-15 15:30（本地时间）
const NOW = at('2026-11-15T15:30:00')

let checks = 0
const check = (actual, expected) => {
  assert.deepEqual(actual, expected)
  checks += 1
}

const hit = (iso, api, host, outcome) =>
  recordRequest({ service: STATS_SERVICE, api, host, outcome, now: at(iso) })

// 本月（11 月）：4 次计入额度、1 次 401、1 次业务失败、1 次超时
hit('2026-11-15T15:05:00', 'current', 'a.re.qweatherapi.com', 'ok')
hit('2026-11-15T15:10:00', 'current', 'a.re.qweatherapi.com', 'ok')
hit('2026-11-15T14:05:00', 'daily', 'b.re.qweatherapi.com', 'ok')
hit('2026-11-15T13:00:00', 'alert', 'b.re.qweatherapi.com', 'err')
hit('2026-11-15T15:20:00', 'indices', 'a.re.qweatherapi.com', 'soft')
hit('2026-11-15T15:25:00', 'minutely', 'a.re.qweatherapi.com', 'net')
// 52 小时前：小时桶已经滚出窗口，但仍是本月，月合计和按接口要算上它
hit('2026-11-13T11:30:00', 'air', 'a.re.qweatherapi.com', 'ok')
// 上个月：不进本月
hit('2026-10-31T23:00:00', 'current', 'a.re.qweatherapi.com', 'ok')

const snapshot = readRequestStats({ now: NOW })

check(snapshot.month.ok, 4)
check([snapshot.month.soft, snapshot.month.err, snapshot.month.net], [1, 1, 1])
check(snapshot.month.total, 7)
check(snapshot.today.ok, 3)
check(snapshot.hours.length, 24)
check(snapshot.hours[0].key, '2026-11-14T16')
check(snapshot.hours[23].key, '2026-11-15T15')
check(snapshot.hours[23].ok, 2)
check(snapshot.hours[22].ok, 1)
check([snapshot.hours[21].ok, snapshot.hours[21].total], [0, 1])
check(snapshot.hours[0].total, 0)
check(snapshot.apis.map((row) => row.value), [2, 1, 1])
check(snapshot.apis.map((row) => row.key), ['current', 'air', 'daily'])
check(snapshot.hosts.map((row) => row.value), [3, 1])
check(snapshot.hosts.map((row) => row.key), ['a.re.qweatherapi.com', 'b.re.qweatherapi.com'])
check(Math.round(snapshot.apis.reduce((sum, row) => sum + row.share, 0) * 1000), 1000)
check(RequestStatsVersion.value, 8)
check(snapshot.hasData, true)

// 未知 outcome 按 err 处理：宁可少算额度，也不虚增
hit('2026-11-15T15:28:00', 'current', 'a.re.qweatherapi.com', 'who-knows')
const after = readRequestStats({ now: NOW })
check(after.month.err, snapshot.month.err + 1)
check(after.month.ok, 4)

// 换月：本月清零，但上个月的月桶还在（留给趋势用）
const nextMonth = readRequestStats({ now: at('2026-12-01T00:10:00') })
check(nextMonth.month.ok, 0)
check(nextMonth.today.ok, 0)

/* 服务闸门：只有 service === 'qweather' 才记账。
   高德路名（restapi.amap.com）、一言（v1.hitokoto.cn）不消耗和风额度，
   哪怕以后有人顺手用同一个 httpClient 发它们，也不该出现在这张表里。 */
const foreign = [
  { service: 'amap', api: 'current', host: 'restapi.amap.com' },
  { service: 'hitokoto', api: 'current', host: 'v1.hitokoto.cn' },
  // 漏传 service 也不收：默认值是空串，掉不进白名单
  { api: 'current', host: 'a.re.qweatherapi.com' },
]
const foreignResult = foreign.map((event) => recordRequest({ ...event, now: NOW }))
check(foreignResult, [false, false, false])

const afterForeign = readRequestStats({ now: NOW })
check(afterForeign.month.total, after.month.total)
check(afterForeign.hosts.map((row) => row.key), after.hosts.map((row) => row.key))
check(RequestStatsVersion.value, 9)

console.log(`✓ 请求量计数口径：${checks} 项断言通过`)
