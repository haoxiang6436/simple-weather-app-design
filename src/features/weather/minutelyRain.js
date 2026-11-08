/**
 * 分钟级降水的解读
 *
 * 接口（/v7/minutely/5m）给的是「未来两小时、每 5 分钟一个累计降水量（mm）」的数组，
 * 这里把它读成人话：现在下不下、多大、几分钟后停 / 几分钟后开始。
 *
 * 纯计算 + 文案，不碰 store 和 UI：阈值、措辞、取整规则想调整都只改这一个文件。
 * 注意接口返回的 precip 是字符串（"0.00"），也不要假设数组一定有 24 个点。
 */

import { getRateLevelSteps, rateLevel } from './precipitationLevels'
export { getRateLevelSteps, rateLevel } from './precipitationLevels'

// 每个点代表它之后 5 分钟的累计降水量
export const STEP_MINUTES = 5
const STEP_MS = STEP_MINUTES * 60 * 1000
const MINUTE_MS = 60 * 1000

/** 看多久之内的变化：3 个点 = 15 分钟，再远就不能说「10 分钟后」了（也越不准） */
const TREND_LOOKAHEAD = 3

// 保留非零的微量降水，低于标准最低阈值时仍能提示零星雨雪。
const WET_MM = 0

/** 降雨的参考强度下界；雪图通过 getRateLevelSteps('snow') 取独立阈值。 */
export const LEVEL_STEPS = getRateLevelSteps('rain').map((level) => ({
  ...level,
  mm: (level.min * STEP_MINUTES) / 60,
}))

/** 每 5 分钟降水量（mm）→ 小时雨强（mm/h） */
export const precipToRate = (precip) => (Number(precip) || 0) * (60 / STEP_MINUTES)

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
 *   trend: {dir:'up'|'down', level:{key:string,label:string}, minutes:number}|null,
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
  const wetTypes = new Set(remaining.filter(isWet).map((point) => point.type))
  // 当前无降水时，界面应先展示下一场的类型，而不是空白段的占位类型。
  const displayType = (isWet(current) ? current : remaining.find(isWet))?.type || current.type
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

  /* 雨在变大还是变小：拿「现在这一档」和往后 15 分钟内的点比档位。
   *
   * 只说「跨档」的变化。同为中雨从 2.6 涨到 3.1mm/h 也算变大，但用户看不出来，
   * 说一句占地方的废话还挤掉后面的停雨时间。
   *
   * 两个必须做的工程处理：
   * 1. 要求下一个点也在同一侧才算数 —— 5 分钟网格的单点抖动会让文案在
   *    「10分钟后转大雨」和「正在下中雨，30分钟后停」之间来回闪；
   * 2. 起变化的时间至少要比停雨早一格（见下面的分钟数判断），否则会出现
   *    「10分钟后转大雨，10分钟后停」这种自相矛盾的句子。
   */
  let trend = null
  if (raining) {
    const spell = runs[0]
    const nowRank = level.rank
    // k + 1 < spell.end：确认点也必须是「这一场雨」里还下着的点
    for (let k = 1; k <= TREND_LOOKAHEAD && k + 1 < spell.end; k += 1) {
      const point = remaining[k]
      if (point.type !== current.type || remaining[k + 1].type !== current.type) continue
      const pointLevel = rateLevel(precipToRate(point.precip), point.type)
      const rank = pointLevel.rank
      if (rank === nowRank) continue
      const confirm = remaining[k + 1]
      const confirmRank = rateLevel(precipToRate(confirm.precip), confirm.type).rank
      const goingUp = rank > nowRank
      if (goingUp ? confirmRank < rank : confirmRank > rank) continue
      const minutes = roundToStep((point.ts - now) / MINUTE_MS)
      // 离停雨只剩一格：一会儿就停了，这句「还会变大」说了也没用
      if (stopsIn !== null && minutes + STEP_MINUTES >= stopsIn) continue
      trend = { dir: goingUp ? 'up' : 'down', level: pointLevel, minutes }
      break
    }
  }

  /* 雨停了还会不会再下：记下「第几分钟再来」和那一场的峰值雨强，
     文案才能说「5分钟后雨停，30分钟后转大雨」而不是只报前半场。 */
  let resumesIn = null
  let resumeLevel = null
  let resumeRate = 0
  const again = raining ? runs[1] : null
  if (again) {
    resumesIn = roundToStep((remaining[again.start].ts - now) / MINUTE_MS)
    const phaseEnd = remaining.findIndex((point, offset) => offset > again.start && point.type !== remaining[again.start].type)
    resumeRate = remaining.slice(again.start, phaseEnd < 0 ? again.end : Math.min(phaseEnd, again.end))
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
      const phaseEnd = remaining.findIndex((point, offset) => offset > start && point.type !== remaining[start].type)
      const peak = spell
        ? remaining.slice(spell.start, phaseEnd < 0 ? spell.end : Math.min(phaseEnd, spell.end))
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
    type: displayType,
    currentType: current.type,
    mixed: wetTypes.size > 1,
    transition: raining ? (() => {
      const spell = runs[0]
      const offset = remaining.findIndex((point, i) => i > 0 && i < spell.end && point.type !== current.type)
      return offset < 0 ? null : {
        minutes: roundToStep((remaining[offset].ts - now) / MINUTE_MS),
        level: rateLevel(precipToRate(remaining[offset].precip), remaining[offset].type),
      }
    })() : null,
    startsIn,
    stopsIn,
    continuous,
    // 现在没下、但最近一次「在下」刚结束：隔了几分钟 + 那一场的等级（文案说「雨刚停」「刚才在下小雨」）
    stoppedAgo,
    stoppedLevel,
    // 现在没下、之后第一场雨：第几分钟开始 + 那一场的等级
    nextLevel,
    // 正在下、15 分钟内档位会变：{ dir: 'up'|'down', level, minutes }，否则 null
    trend,
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
   文案要接着说「雨刚停」，否则界面会在雨停的那一刻突然跳成「15分钟后下中雨」，
   像刚才那场雨凭空消失了。超过这个分钟数就改用「刚才在下…」，再久就完全不再提它。 */
const JUST_STOPPED_MINUTES = 10
const RECENT_RAIN_MINUTES = 20

/** 「15分钟」「1小时」——停雨之后隔多久，用来描述「下一场」 */
const gapText = (minutes) => {
  const value = Math.max(STEP_MINUTES, roundToStep(minutes))
  return value < 60 ? `${value}分钟` : `${Math.round(value / 60)}小时`
}

/** 「10分钟后转大雨」——趋势只说档位，不写「雨会变大」：
    后者没说变大多少，还多 50px（实测 182.5 vs 131.6）。 */
const trendText = (analysis) => (analysis.trend
  ? afterText(analysis.trend.minutes, `转${analysis.trend.level.label}`)
  : null)

/**
 * 一句完整的人话 —— 胶囊和弹层标题共用同一句。
 * 胶囊是入口、标题是详情，两边说法不一致时用户会以为是两件事；共用一份文案就没有这个问题。
 *
 * 「下一场」一律从**雨停那一刻**开始数，而不是从「现在」：
 * 「30分钟后停，45分钟后转小雨」要用户自己把 45 − 30 = 15 减一遍，
 * 还会误读成「45 分钟后（雨还没停就）转小雨」；换成「隔15分钟又有小雨」，两段之间的关系一眼就能看出来。
 *
 * @param {object} analysis
 * @param {boolean} [contrast] 是否在转折句前加「不过」——弹层标题有横向空间，胶囊没有
 *   （两个字约 20px，会把整句顶出 243px 的左栏，见 MinutelyRainChip.vue），所以只有详情里带着它。
 */
const phrase = (analysis, contrast = false) => {
  const isSnow = analysis.type === 'snow'
  const wetWord = isSnow ? '降雪' : '降雨'
  const stopWord = isSnow ? '雪停' : '雨停'
  if (analysis.raining) {
    if (analysis.transition) return `正在下${analysis.level.label}，${afterText(analysis.transition.minutes, `转${analysis.transition.level.label}`)}`
    /* 一句话只装两件事：现在多大 + 一件「接下来会怎样」。
       三段（现状 + 趋势 + 停时/持续）读起来太密，信息密度反而下降，
       所以有趋势时只说趋势，不再跟「30分钟后停」「持续两小时」——
       停雨时间在弹层的柱状图里一眼就能看到。
       有「停一会儿又下」的时候让位的是趋势：那一支要讲「几点停、隔多久又有」，
       而且留趋势会让它变成三段（详见趋势计算的注释）。 */
    const hasAgain = analysis.resumesIn !== null && Boolean(analysis.resumeLevel)
    const trend = hasAgain ? null : trendText(analysis)
    if (trend) return `正在下${analysis.level.label}，${trend}`
    // 持续到窗口末尾也要先说清现在多大：这一支原来只说「未来两小时降雨持续」，
    // 胶囊上唯一能看出雨大不大的线索是底色深浅，文字本身反而漏了最有用的那半句。
    if (analysis.continuous) return `正在下${analysis.level.label}，未来两小时持续${wetWord}`
    /* 5 分钟是这套数据能表达的最小粒度，说「即将」比「5分钟后」更贴近感受。
       带时间的那支省掉「雨/雪」字：「正在下中雨，30分钟后停」不会误解主语，
       而省下的这一个字正好让最长的那句（雨停后隔一阵又下）留在胶囊一行的宽度里
       —— 见 MinutelyRainChip.vue 里关于「可用 243px」的说明。
       「即将雨停」保留完整说法：只留「即将停」读起来太生硬。 */
    const stopText = analysis.stopsIn <= STEP_MINUTES ? `即将${stopWord}` : afterText(analysis.stopsIn, '停')
    const text = `正在下${analysis.level.label}，${stopText}`
    if (!hasAgain) return text
    // 「隔」已经说明是以停雨为起点，所以后面直接说「又有」——量级由等级词自己交代
    const again = `隔${gapText(analysis.resumesIn - analysis.stopsIn)}又有${analysis.resumeLevel.label}`
    return `${text}，${contrast ? '不过' : ''}${again}`
  }
  /* 雨刚停的这段里先交代这件事，再接下一场 —— 这是「现在」和「下一场」之间唯一还看得见的联系。
     少了它，界面会在雨停那一刻从「正在下小雨，即将雨停」直接跳成「15分钟后下中雨」。 */
  if (analysis.stoppedAgo !== null && analysis.stoppedAgo <= RECENT_RAIN_MINUTES) {
    const head = analysis.stoppedAgo <= JUST_STOPPED_MINUTES
      ? (analysis.stoppedLevel?.type === 'snow' ? '雪刚停' : '雨刚停')
      : `刚才在下${analysis.stoppedLevel?.label || (isSnow ? '雪' : '雨')}`
    if (analysis.startsIn === null || !analysis.nextLevel) return `${head}，未来两小时无${wetWord}`
    return `${head}，${contrast ? '不过' : ''}${afterText(analysis.startsIn, `又有${analysis.nextLevel.label}`)}`
  }
  if (analysis.startsIn !== null) {
    // 「15分钟后下中雨」而不是「15分钟后开始下雨」：直接带上档位，用户不用点开弹层再判断要不要带伞
    const next = analysis.nextLevel
      ? `下${analysis.nextLevel.label}`
      : (isSnow ? '开始下雪' : '开始下雨')
    return afterText(analysis.startsIn, next)
  }
  return `未来两小时无${wetWord}`
}

/** 胶囊上那句（= 弹层标题，去掉转折词「不过」，长度才塞得进左栏） */
export const minutelyChipText = (analysis) => {
  if (!analysis) return ''
  if (analysis.expired) return `分钟级${analysis.type === 'snow' ? '降雪' : '降水'}待更新`
  return phrase(analysis)
}

/** 弹层标题那句完整文案 */
export const minutelyTitle = (analysis) => {
  if (!analysis) return ''
  if (analysis.expired) return `分钟级${analysis.type === 'snow' ? '降雪' : '降水'}数据待更新`
  return phrase(analysis, true)
}
