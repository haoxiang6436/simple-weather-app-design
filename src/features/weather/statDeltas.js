import { uvLevel } from './uvScale'

/**
 * 六张指标卡的「相对今天」差值。
 *
 * 只在这里做减法，组件不再各自判断：
 *   - 差值从「卡片上显示的那个数字」重算（先按展示精度取整，再减），
 *     所以角标永远和屏幕上的字对得上，也不会出现 0.30000000000000004 这种东西；
 *   - 差值精度比展示精度低一档（降雨 2 位 → 1 位），四舍五入到 0 就算持平；
 *   - 不缓存。七天数据一刷新，下一次 computed 重算就自动跟着变。
 *
 * 每项返回 null（数据不够比）或：
 *   { dir, text, unit, tone, tip, sub }
 *   dir   up / down / flat
 *   text  角标上的数字；持平、以及紫外线这种文字指标，都是空串
 *   unit  紧跟在数字后面的单位（mm / % / °C / 级）；没有数字时同样是空串 ——
 *         角标是「↓ 35%」这样连着念的一小截，单位不能单独出现
 *   tone  tint（温度 / 湿度用冷暖色）| mono（其余保持中性灰）
 *   tip   提示第一行：把基准和差值收成一句口语
 *         —— 比今天少 6.3 mm / 比今天低 5 个点 / 比今天小 2 级 / 比今天弱一档 / 比今天高 2°C / 和今天一样
 *   sub   提示第二行：今天 18°C → 周六 20°C
 *
 * 文案的分工（老句子是「相对今天，降雨量少 6.3 mm」）：
 * 老句子里有两样东西在拖后腿 —— 「相对」是报表用词，中文口语里没有这么起头的；
 * 指标名在卡上就写着（浮层正好压在那一行标签上），再说一遍等于把刚糊掉的字又抄一遍。
 * 所以只改这两处：前缀换成「比今天」，指标名删掉。
 * 第一行因此仍然独立可读（「比今天少 6.3 mm」，主语由卡片和第二行补全），
 * 第二行照旧摆两端原值；六张卡念下来是六句不同的话（少 / 低 / 小 / 弱 / 高），
 * 不是一句话念六遍，长度也从 15 字降到 11 字，浮层跟着窄一截。
 * 更短的一版是「雨少了 6.3 mm」（基准整个交给第二行），但第一行一旦离开第二行就少了主语
 * —— 读屏 / 截图场景下会读成半句话，所以没选。
 * 不要在这里重新加回「相对今天」/「相比今日」这类书面语，也不要加指标名。
 */

/** 接口里可能是数字、数字字符串、null、'' —— 统一收成一个数字或者 null */
const num = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/** 四舍五入到指定位数；-0 归一成 0（气温从负值跨到 0 时不会闪一下负号） */
const roundTo = (value, digits) => {
  const factor = 10 ** digits
  const rounded = Math.round(value * factor) / factor
  return Object.is(rounded, -0) ? 0 : rounded
}

/**
 * 四个纯数值指标的规则。
 * precision 是卡片上的展示精度（和 AnimatedNumber 的 decimals 一致），
 * deltaDigits 是角标上愿意给的小数位，show 负责把值写成屏幕上的样子。
 *
 * unit 是提示句子里用的（带前导空格：「比今天多 3.4 mm」）；
 * badgeUnit 是角标上用的（不带空格：「3.4mm」）—— 角标本身只有 0.75rem，
 * 中间再插一个空格会让「↑ 3.4 mm」散成一个不像整体的词组。
 * tipUnit 只给两个百分数指标（湿度 / 云量）用：它们的数值本身就是百分数，
 * 句子再说「比今天低 5%」会和 badge 的 % 打架，说「比今天低 5 个点」才不会让人以为是「降到 5%」。
 * cmp 是第一行里的比较词（键就是 dir）：雨多 / 少，湿度高 / 低，温度高 / 低，云多 / 少。
 * 每个指标挑自己最顺口的那个 —— 六张卡共用一套「多 / 少」就会读成同一个句式。
 */
const NUMERIC = {
  precip: {
    tone: 'mono',
    // 卡片上是两位小数（0 → 0.00）；角标只留一位：
    // 0.04 mm 这种量级在角标上就是「没变」——差值四舍五入到 0 即持平。
    // 想较真的话，提示第二行照样把两端原值（0.00 mm → 0.04 mm）摆出来。
    precision: 2,
    deltaDigits: 1,
    unit: ' mm',
    badgeUnit: 'mm',
    cmp: { up: '多', down: '少' },
    show: (value) => value.toFixed(2),
  },
  humidity: {
    tone: 'tint',
    precision: 0,
    deltaDigits: 0,
    unit: '%',
    badgeUnit: '%',
    // 湿度说「高 / 低」而不是「多 / 少」：高低位的不是数字个数，是体感
    cmp: { up: '高', down: '低' },
    tipUnit: ' 个点',
    show: (value) => value.toFixed(0),
  },
  temp: {
    tone: 'tint',
    // 接口那边 tempAvg 已经过了一遍 Math.round（见 api/weather.js 的 normalizeDaily），
    // 卡片上也是整数，所以这里同样是 0 位 —— 差值和屏幕上的字必须对得上
    precision: 0,
    deltaDigits: 0,
    unit: '°C',
    badgeUnit: '°C',
    cmp: { up: '高', down: '低' },
    show: (value) => value.toFixed(0),
  },
  cloud: {
    tone: 'mono',
    precision: 0,
    deltaDigits: 0,
    unit: '%',
    badgeUnit: '%',
    cmp: { up: '多', down: '少' },
    // 和湿度同理：云量也是百分数，「少 23%」会被读成「少了 23 个百分点」以外的意思
    tipUnit: ' 个点',
    show: (value) => value.toFixed(0),
  },
}

const direction = (diff) => (diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat')

/** 提示第一行的比较基准：「比今天」。不是「相对今天，」—— 那是报表的说法，六个字里四个是套话 */
const AGAINST = '比今天'

/** 持平的一句话：不说「相同」，也不报指标名 —— 六张卡上是同一句，说短一点 */
const FLAT_TIP = '和今天一样'

/** 紫外线只差「几档」：1 → 一，2 → 两；五档封顶，枚举就够，不必引中文数字库 */
const CN_DIGITS = ['零', '一', '两', '三', '四', '五']
const cnCount = (n) => CN_DIGITS[n] ?? String(n)

function numericDelta(key, todayValue, selectedValue, selectedLabel) {
  const spec = NUMERIC[key]
  const from = num(todayValue)
  const to = num(selectedValue)
  if (from === null || to === null) return null

  // 先按展示精度取整再相减：屏幕上写的是什么，角标比的就是什么
  const shownFrom = roundTo(from, spec.precision)
  const shownTo = roundTo(to, spec.precision)
  const diff = roundTo(shownTo - shownFrom, spec.deltaDigits)
  const dir = direction(diff)
  const amount = Math.abs(diff)

  return {
    dir,
    text: dir === 'flat' ? '' : String(amount),
    unit: dir === 'flat' ? '' : spec.badgeUnit,
    tone: spec.tone,
    tip:
      dir === 'flat'
        ? FLAT_TIP
        : `${AGAINST}${spec.cmp[dir]} ${amount}${spec.tipUnit || spec.unit}`,
    sub: `今天 ${spec.show(shownFrom)}${spec.unit} → ${selectedLabel} ${spec.show(shownTo)}${spec.unit}`,
  }
}

/**
 * 风级：和风偶尔给区间（「3-4」）。区间取中值 3.5 只用来比大小，
 * 卡片上的文字仍是原样（「南风 3-4级」），两边不打架。
 */
function windScale(raw) {
  const text = raw === null || raw === undefined ? '' : String(raw).trim()
  if (!text) return null
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text)
  const range = text.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/)
  if (!range) return null
  return (Number(range[1]) + Number(range[2])) / 2
}

/** 提示第二行里的风：和卡片上同一句（风向 + 原样风级） */
function windText(day) {
  const dir = day?.windDirDay || '—'
  const raw = day?.windScaleDay
  if (raw === null || raw === undefined || raw === '') return dir
  return `${dir} ${raw}级`
}

function windDelta(today, selected, selectedLabel) {
  const from = windScale(today?.windScaleDay)
  const to = windScale(selected?.windScaleDay)
  if (from === null || to === null) return null

  const diff = Math.round(to - from)
  const dir = direction(diff)
  const amount = Math.abs(diff)

  return {
    dir,
    text: dir === 'flat' ? '' : String(amount),
    unit: dir === 'flat' ? '' : '级',
    tone: 'mono',
    tip:
      dir === 'flat'
        ? FLAT_TIP
        // 风不说「多 / 少」：大 / 小是它的量词，「比今天小 2 级」才像人话
        : `${AGAINST}${dir === 'up' ? '大' : '小'} ${amount} 级`,
    sub: `今天 ${windText(today)} → ${selectedLabel} ${windText(selected)}`,
  }
}

function uvDelta(today, selected, selectedLabel) {
  const from = uvLevel(today?.uvIndex)
  const to = uvLevel(selected?.uvIndex)
  if (!from || !to) return null

  // 文字等级只比强弱顺序，不把 6 和 1 的差值当成「差 5 级」摆出来
  const diff = to.ordinal - from.ordinal
  const dir = direction(diff)
  // 差几档 = 相邻两个等级，才说得出「比今天弱一档 / 强两档」
  const steps = Math.abs(diff)

  return {
    dir,
    // 只给方向不给数字：卡片上是「弱」这种等级，旁边再挂一个「2」会像指数值
    text: '',
    // 既然没有数字，也就没有单位可挂 —— 等级本身已经写在「弱」「最弱」里了
    unit: '',
    tone: 'mono',
    tip:
      dir === 'flat'
        ? FLAT_TIP
        // 等级差用「档」：老句子「紫外线更弱」连差几档都不说，等于只念了一遍箭头
        : `${AGAINST}${dir === 'up' ? '强' : '弱'}${cnCount(steps)}档`,
    sub: `今天 ${from.level} → ${selectedLabel} ${to.level}`,
  }
}

/**
 * @param {object|null} today 七天里的第一天（今天）
 * @param {object|null} selected 当前选中的那一天
 * @param {string} selectedLabel 选中日的标签（周六 / 明天 …），用在提示第二行
 * @returns {{ [key: string]: { dir: string, text: string, unit: string, tone: string, tip: string, sub: string } | null }}
 *   选中日就是今天、或还拿不到数据时返回空对象 —— 调用方按 key 取，取不到就不渲染角标。
 */
export function buildStatDeltas(today, selected, selectedLabel = '') {
  if (!today || !selected || today === selected) return {}
  return {
    precip: numericDelta('precip', today.precip, selected.precip, selectedLabel),
    humidity: numericDelta('humidity', today.humidity, selected.humidity, selectedLabel),
    wind: windDelta(today, selected, selectedLabel),
    uv: uvDelta(today, selected, selectedLabel),
    temp: numericDelta('temp', today.tempAvg, selected.tempAvg, selectedLabel),
    cloud: numericDelta('cloud', today.cloud, selected.cloud, selectedLabel),
  }
}
