/**
 * 分钟级降水的解读
 *
 * 接口（/v7/minutely/5m）给的是「未来两小时、每 5 分钟一个累计降水量（mm）」的数组，
 * 这里把它读成人话：现在下不下、多大、几分钟后停 / 几分钟后开始。
 *
 * 纯计算 + 文案，不碰 store 和 UI：阈值、措辞、取整规则想调整都只改这一个文件。
 * 注意接口返回的 precip 是字符串（"0.00"），也不要假设数组一定有 24 个点。
 */

// 每个点代表它之后 5 分钟的累计降水量
export const STEP_MINUTES = 5
const STEP_MS = STEP_MINUTES * 60 * 1000
const MINUTE_MS = 60 * 1000

// 小于这个值就当作没下（0.01 mm/5min ≈ 0.12 mm/h，比「毛毛雨」还小一档）
const WET_MM = 0.005

/**
 * 小时雨强分级（按中国气象局的雨量等级折算到小时）。
 * key 与壁纸雨量档位同名（见 features/wallpaper/rainIntensity.js），方便以后直接复用。
 */
const LEVELS = [
  { key: 'storm', min: 16, rain: '暴雨', snow: '暴雪' },
  { key: 'heavy', min: 8, rain: '大雨', snow: '大雪' },
  { key: 'moderate', min: 2.5, rain: '中雨', snow: '中雪' },
  { key: 'light', min: 0, rain: '小雨', snow: '小雪' },
]

/**
 * 各等级的下界，同时换算成「每 5 分钟降水量」（mm/5min）。
 * 图表纵轴就是 mm/5min，画分级参考线时直接拿这个值和柱子比高度——
 * 和柱子的配色取自同一张表，所以「柱子压在哪个带里」和「柱子是什么颜色」永远一致。
 * 顺序按雨量从小到大：小雨 → 中雨 → 大雨 → 暴雨。
 */
export const LEVEL_STEPS = [...LEVELS].reverse().map((level) => ({
  ...level,
  mm: (level.min * STEP_MINUTES) / 60,
}))

/** 每 5 分钟降水量（mm）→ 小时雨强（mm/h） */
export const precipToRate = (precip) => (Number(precip) || 0) * (60 / STEP_MINUTES)

/**
 * 小时雨强 → 档位
 * @param {number} rate mm/h
 * @param {'rain'|'snow'} [type]
 * @returns {{ key: 'storm'|'heavy'|'moderate'|'light', label: string }}
 */
export const rateLevel = (rate, type = 'rain') => {
  const level = LEVELS.find((item) => rate >= item.min) || LEVELS[LEVELS.length - 1]
  return { key: level.key, label: type === 'snow' ? level.snow : level.rain }
}

/** 分钟数取整到 5 分钟：接口本身就是 5 分钟一个点，说「32 分钟后」只会显得很假 */
const roundToStep = (minutes) => Math.max(0, Math.round(minutes / STEP_MINUTES) * STEP_MINUTES)

/** 「30分钟后雨停」「即将雨停」「1小时后雨停」 */
const afterText = (minutes, suffix) => {
  const value = Math.max(0, Number(minutes) || 0)
  if (value <= 0) return `即将${suffix}`
  if (value < 60) return `${value}分钟后${suffix}`
  return `${Math.floor(value / 60)}小时后${suffix}`
}

/** 这个 5 分钟的降水量算不算「在下」——图表和时长统计也用同一把尺子 */
export const isWetPrecip = (precip) => (Number(precip) || 0) > WET_MM

const isWet = (point) => isWetPrecip(point.precip)

/**
 * 把接口的点读成「现在的雨况」
 *
 * @param {Array<{time:string, precip:number, type:string}>} points 接口返回的点
 * @param {number} [now] 当前时间戳（默认取本机时间；测试/预览时可以传固定值）
 * @returns {null | {
 *   points: Array<{ ts:number, precip:number, type:string }>,
 *   index: number, expired: boolean,
 *   raining: boolean, level: { key:string, label:string }, rate: number,
 *   startsIn: number|null, stopsIn: number|null, continuous: boolean,
 *   resumesIn: number|null, resumeLevel: {key:string,label:string}|null, resumeRate: number,
 *   total: number, peakRate: number, windowEnd: number,
 *   type: 'rain'|'snow',
 * }}
 */
export const analyzeMinutely = (points, now = Date.now()) => {
  const list = (Array.isArray(points) ? points : [])
    .map((point) => ({
      ts: Date.parse(point?.time),
      precip: Math.max(0, Number(point?.precip) || 0),
      type: point?.type === 'snow' ? 'snow' : 'rain',
    }))
    .filter((point) => Number.isFinite(point.ts))
    .sort((a, b) => a.ts - b.ts)
  if (!list.length) return null

  const windowEnd = list[list.length - 1].ts + STEP_MS
  // 数据窗口整个过去了（长时间没刷新成功）：不再拿它算「现在」。
  // 这种时候把整段数据原样画出来（而不是只留最后一根柱子），并靠文案提示「待更新」。
  const expired = now > windowEnd

  // 「现在」落在哪一段：最后一个 ts <= now 的点就代表当前这 5 分钟
  let index = 0
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].ts <= now) index = i
  }
  if (expired) index = 0
  const current = list[index]
  const remaining = list.slice(index)
  const raining = !expired && isWet(current)
  const rate = precipToRate(current.precip)
  const level = rateLevel(rate, current.type)

  /* 把剩余的点切成一段段「在下」的区间（下标相对 remaining）。
     阵雨常常是下—停—再下，光知道「几点停」会把后半场漏掉，所以先切好段落。 */
  const runs = []
  let runStart = -1
  remaining.forEach((point, offset) => {
    if (isWet(point)) {
      if (runStart < 0) runStart = offset
    } else if (runStart >= 0) {
      runs.push({ start: runStart, end: offset })
      runStart = -1
    }
  })
  if (runStart >= 0) runs.push({ start: runStart, end: remaining.length })

  // 现在在下：这一段什么时候结束（一直下到窗口末尾就是持续降雨）
  let stopsIn = null
  let continuous = false
  if (raining) {
    const spell = runs[0]
    if (spell.end >= remaining.length) continuous = true
    else stopsIn = roundToStep((remaining[spell.end].ts - now) / MINUTE_MS)
  }

  /* 雨停了还会不会再下：记下「第几分钟再来」和那一场的峰值雨强，
     文案才能说「5分钟后雨停，30分钟后转大雨」而不是只报前半场。 */
  let resumesIn = null
  let resumeLevel = null
  let resumeRate = 0
  const again = raining ? runs[1] : null
  if (again) {
    resumesIn = roundToStep((remaining[again.start].ts - now) / MINUTE_MS)
    resumeRate = remaining.slice(again.start, again.end)
      .reduce((peak, point) => Math.max(peak, precipToRate(point.precip)), 0)
    resumeLevel = rateLevel(resumeRate, remaining[again.start].type)
  }

  // 现在没下：往前找最近一次「在下」——接口的几分钟延迟正好把这段历史留在窗口里
  let stoppedAgo = null
  let stoppedLevel = null
  if (!raining && !expired) {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (!isWet(list[i])) continue
      // 这一段代表 i.ts ~ i.ts+5min 的降水，所以「停」的时刻是它的右边界
      stoppedAgo = roundToStep((now - (list[i].ts + STEP_MS)) / MINUTE_MS)
      stoppedLevel = rateLevel(precipToRate(list[i].precip), list[i].type)
      break
    }
  }

  // 现在没下：找之后第一个要下的点，顺带记下那一场的峰值等级（文案要说「又有小雨」）
  let startsIn = null
  let nextLevel = null
  if (!raining && !expired) {
    const start = remaining.findIndex((point, offset) => offset > 0 && isWet(point))
    if (start > 0) {
      startsIn = roundToStep((remaining[start].ts - now) / MINUTE_MS)
      const spell = runs.find((run) => run.start === start)
      const peak = spell
        ? remaining.slice(spell.start, spell.end)
          .reduce((best, point) => Math.max(best, precipToRate(point.precip)), 0)
        : precipToRate(remaining[start].precip)
      nextLevel = rateLevel(peak, remaining[start].type)
    }
  }

  return {
    points: list,
    index,
    expired,
    raining,
    level,
    rate,
    type: current.type,
    startsIn,
    stopsIn,
    continuous,
    // 现在没下、但最近一次「在下」刚结束：隔了几分钟 + 那一场的等级（文案说「雨刚停」「刚才在下小雨」）
    stoppedAgo,
    stoppedLevel,
    // 现在没下、之后第一场雨：第几分钟开始 + 那一场的等级
    nextLevel,
    // 现在在下、一会儿停、之后又会再下时才有值：第几分钟再来 + 那一场的等级/峰值雨强
    resumesIn,
    resumeLevel,
    resumeRate,
    // 未来两小时（其实是到窗口结束）的累计降水量和峰值雨强
    total: remaining.reduce((sum, point) => sum + point.precip, 0),
    peakRate: remaining.reduce((peak, point) => Math.max(peak, precipToRate(point.precip)), 0),
    windowEnd,
  }
}

/* 「刚停」的分界：接口返回的窗口起点一般比「现在」早 5~10 分钟（服务端网格有延迟），
   所以窗口开头那几段往往是刚刚过去的雨。现在没下时，如果最近这次「在下」结束得还不久，
   文案要接着说「雨刚停」，否则界面会在雨停的那一刻突然跳成「15分钟后开始下雨」，
   像刚才那场雨凭空消失了。超过这个分钟数就改用「刚才在下…」，再久就完全不再提它。 */
const JUST_STOPPED_MINUTES = 10
const RECENT_RAIN_MINUTES = 20

/** 「15分钟」「1小时」——停雨之后隔多久，用来描述「下一场」 */
const gapText = (minutes) => {
  const value = Math.max(STEP_MINUTES, roundToStep(minutes))
  return value < 60 ? `${value}分钟` : `${Math.round(value / 60)}小时`
}

/**
 * 一句完整的人话 —— 胶囊和弹层标题共用同一句。
 * 胶囊是入口、标题是详情，两边说法不一致时用户会以为是两件事；共用一份文案就没有这个问题。
 *
 * 「下一场」一律从**雨停那一刻**开始数，而不是从「现在」：
 * 「30分钟后雨停，45分钟后转小雨」要用户自己把 45 − 30 = 15 减一遍，
 * 还会误读成「45 分钟后（雨还没停就）转小雨」；换成「隔15分钟又有小雨」，两段之间的关系一眼就能看出来。
 *
 * @param {object} analysis
 * @param {boolean} [contrast] 是否在转折句前加「不过」——弹层标题有横向空间，胶囊没有（两个字约 20px，
 *   会把整句顶出 250px 的左栏），所以只有详情里带着它。
 */
const phrase = (analysis, contrast = false) => {
  const isSnow = analysis.type === 'snow'
  const wetWord = isSnow ? '降雪' : '降雨'
  const stopWord = isSnow ? '雪停' : '雨停'
  if (analysis.raining) {
    if (analysis.continuous) return `未来两小时${wetWord}持续`
    // 5 分钟是这套数据能表达的最小粒度，说「即将」比「5分钟后」更贴近感受
    const stopText = analysis.stopsIn <= STEP_MINUTES ? `即将${stopWord}` : afterText(analysis.stopsIn, stopWord)
    const text = `正在下${analysis.level.label}，${stopText}`
    if (analysis.resumesIn === null || !analysis.resumeLevel) return text
    // 「隔」已经说明是以停雨为起点，所以后面直接说「又有」——量级由等级词自己交代
    const again = `隔${gapText(analysis.resumesIn - analysis.stopsIn)}又有${analysis.resumeLevel.label}`
    return `${text}，${contrast ? '不过' : ''}${again}`
  }
  /* 雨刚停的这段里先交代这件事，再接下一场 —— 这是「现在」和「下一场」之间唯一还看得见的联系。
     少了它，界面会在雨停那一刻从「正在下小雨，即将雨停」直接跳成「15分钟后开始下雨」。 */
  if (analysis.stoppedAgo !== null && analysis.stoppedAgo <= RECENT_RAIN_MINUTES) {
    const head = analysis.stoppedAgo <= JUST_STOPPED_MINUTES
      ? (isSnow ? '雪刚停' : '雨刚停')
      : `刚才在下${analysis.stoppedLevel?.label || (isSnow ? '雪' : '雨')}`
    if (analysis.startsIn === null || !analysis.nextLevel) return `${head}，未来两小时无${wetWord}`
    return `${head}，${contrast ? '不过' : ''}${afterText(analysis.startsIn, `又有${analysis.nextLevel.label}`)}`
  }
  if (analysis.startsIn !== null) {
    return afterText(analysis.startsIn, isSnow ? '开始下雪' : '开始下雨')
  }
  return `未来两小时无${wetWord}`
}

/** 胶囊上那句（= 弹层标题，去掉转折词「不过」，长度才塞得进左栏） */
export const minutelyChipText = (analysis) => {
  if (!analysis) return ''
  if (analysis.expired) return '分钟级降水待更新'
  return phrase(analysis)
}

/** 弹层标题那句完整文案 */
export const minutelyTitle = (analysis) => {
  if (!analysis) return ''
  if (analysis.expired) return '分钟级降水数据待更新'
  return phrase(analysis, true)
}
