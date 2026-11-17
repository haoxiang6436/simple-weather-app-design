/**
 * 空气质量的公共口径：等级用词、国标分档，以及接口响应 → 弹层视图模型。
 *
 * 两处都要用同一套口径：
 *   - 天气卡上的胶囊（AirQualityChip.vue）只需要「第几档 + 中文用词」；
 *   - 点开胶囊后的弹层（AirQualityDialog.vue）还要刻度位置、每个污染物的分指数条。
 *
 * 为什么用词不直接取接口的 category：接口回的是**本地语言**
 *（东京会回「オレンジ/警報」，英美会回整句 "Unhealthy for Sensitive Groups"），
 * 既跟中文界面不搭，宽度也会顶出温度行。国标 1-6 档和下面 6 个词一一对应，
 * 其它国家标准按各自的档数折算（见 STANDARD_LEVELS）。
 */

// 胶囊上只用这 6 个中文用词
export const AQI_GRADE_WORDS = ['优', '良', '轻度污染', '中度污染', '重度污染', '严重污染']

/* 各本地标准的总档数，取自官方「支持的空气质量指数」分档表：
   中 / 美 / 欧 / 日 / 法 / 澳门 / 台湾 是 6 档，香港 5 档，韩国 4 档，英国 10 档，加拿大 11 档。
   用它把 level 折成 0-1 的强度再套 6 档中文用词 —— 不能直接拿 level 当档位：
   英国第 7 档已经是「高」，按 level 当档位会算成「严重污染」。 */
export const STANDARD_LEVELS = {
  'cn-mee': 6, 'cn-mee-1h': 6,
  'tw-me': 6, 'tw-me-1h': 6,
  'hk-epd': 5, 'mo-smg': 6,
  'jp-moe': 6, 'kr-moe': 4,
  'us-epa': 6, 'us-epa-nc': 6,
  'eu-eea': 6, 'gb-defra': 10, 'fr-atmo': 6, 'ca-eccc': 11,
  'sg-nea': 5, 'th-pcd': 5,
}

/* 中国国标（HJ 633-2012）的六段区间，含左端点、不含右端点（最后一个含 500）。
   刻度总长按 0-500 画，所以每段的宽度就是它自己的跨度：
   优/良/轻度/中度各 50，重度 100，严重 200 —— 这就是「越往上越难涨」的真实比例。 */
export const AQI_BANDS = [
  { band: 1, min: 0, max: 50, label: AQI_GRADE_WORDS[0] },
  { band: 2, min: 50, max: 100, label: AQI_GRADE_WORDS[1] },
  { band: 3, min: 100, max: 150, label: AQI_GRADE_WORDS[2] },
  { band: 4, min: 150, max: 200, label: AQI_GRADE_WORDS[3] },
  { band: 5, min: 200, max: 300, label: AQI_GRADE_WORDS[4] },
  { band: 6, min: 300, max: 500, label: AQI_GRADE_WORDS[5] },
]

const AQI_MAX = 500

/** 国标数值 → 1-6 档（接口没给 level 时的兜底，也是污染物分指数用的换算） */
export const aqiBandFromValue = (value) => {
  const aqi = Number(value)
  if (!Number.isFinite(aqi)) return 1
  const hit = AQI_BANDS.find((item) => aqi < item.max)
  return hit ? hit.band : 6
}

/**
 * 胶囊 / 弹层都用的语气档位 1-6：既是 .aqi-N 的类名，也是 AQI_GRADE_WORDS 的下标。
 * 中国国标下它就等于接口的 level（1 优 … 6 严重）；
 * 其它标准先把 level 除以总档数，再乘 6 —— 英国第 3 档会自动落进「良」，
 * 韩国第 2 档落进「轻度污染」，颜色和用词不会各说各话。
 */
export const airQualityBand = (air) => {
  const raw = Number(air?.level)
  if (Number.isFinite(raw) && raw >= 1) {
    const max = STANDARD_LEVELS[air?.standard] || 6
    const ratio = Math.min(raw / max, 1)
    return Math.min(Math.max(Math.ceil(ratio * 6), 1), 6)
  }
  return aqiBandFromValue(air?.aqi)
}

/** 档位 → 中文用词（接口没给 level / 未知标准时退回接口给的 category） */
export const airQualityGrade = (band, category = '') =>
  AQI_GRADE_WORDS[band - 1] || String(category || '')

/** 数值在 0-500 刻度上的位置（0-1），弹层的指针和进度条都用它 */
export const aqiScalePosition = (value) => {
  const aqi = Number(value)
  if (!Number.isFinite(aqi)) return 0
  return Math.min(Math.max(aqi, 0), AQI_MAX) / AQI_MAX
}

const num = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * /airquality/v1/current 的响应 → 弹层视图模型。
 *
 * 和 api/weather.js 里的 normalizeAirQuality 不是一回事：那个是「存进缓存的一份摘要」
 *（数字、等级、PM2.5，够胶囊和悬停提示用），并在同一份缓存里附带 raw 明细；
 * 这里把 raw 明细展开成弹层真正要的一屏 —— 六个污染物、健康建议、监测站。
 *
 * @param {Object} raw /airquality/v1/current 的响应（或 api 层裁过的同形明细）
 * @param {{standard?: string}} [options] standard 指定要展示哪个标准的指数。
 *   缓存里那份摘要已经按「本地标准优先」挑过一次了（见 api/weather.js 的 pickAirIndex），
 *   把它的 code 传进来，弹层和胶囊才是同一个数字 —— 否则两边各按各的规则挑，
 *   一个响应里同时有 cn-mee 和 qaqi 时会出现胶囊 25、弹层 32 这种自相矛盾。
 */
export const buildAirQualityView = (raw, { standard = '' } = {}) => {
  const indexes = (Array.isArray(raw?.indexes) ? raw.indexes : [])
    .filter((item) => item && num(item.aqi) !== null)
  if (!indexes.length) return null
  /* 一个响应里可能同时有本地标准和 QAQI：优先用调用方指定的那条（胶囊展示的那档），
     没指定时退回「第一个非 qaqi」—— qaqi 是给没有本地标准的地区兜底用的。 */
  const index = (standard && indexes.find((item) => String(item.code || '') === standard))
    || indexes.find((item) => item.code !== 'qaqi')
    || indexes[0]
  const scaleCode = String(index.code || '')

  const pollutants = (Array.isArray(raw?.pollutants) ? raw.pollutants : [])
    .map((item) => {
      const concentration = item?.concentration || {}
      const sub = (Array.isArray(item?.subIndexes) ? item.subIndexes : [])
        .find((entry) => entry && String(entry.code || '') === scaleCode)
        || (Array.isArray(item?.subIndexes) ? item.subIndexes[0] : null)
      const subAqi = num(sub?.aqi)
      if (subAqi === null) return null
      return {
        code: String(item?.code || ''),
        name: String(item?.name || '').trim(),
        fullName: String(item?.fullName || '').trim(),
        value: num(concentration.value),
        unit: String(concentration.unit || ''),
        subAqi: Math.round(subAqi),
        band: aqiBandFromValue(subAqi),
      }
    })
    .filter(Boolean)

  // 污染条画的是「相对最高分指数」的占比：绝对值都在旁边写着，条只负责一眼比出谁高
  const peakSub = Math.max(1, ...pollutants.map((item) => item.subAqi))
  pollutants.forEach((item) => { item.share = Math.min(item.subAqi / peakSub, 1) })

  const aqiValue = Math.round(num(index.aqi))
  const band = airQualityBand({ level: index.level, standard: scaleCode, aqi: aqiValue })

  return {
    aqi: aqiValue,
    display: String(index.aqiDisplay || aqiValue),
    band,
    grade: airQualityGrade(band, index.category),
    standard: scaleCode,
    standardName: String(index.name || '').trim(),
    primaryPollutant: String(index.primaryPollutant?.name || '').trim(),
    effect: String(index.health?.effect || '').trim(),
    adviceGeneral: String(index.health?.advice?.generalPopulation || '').trim(),
    adviceSensitive: String(index.health?.advice?.sensitivePopulation || '').trim(),
    pollutants,
    stations: (Array.isArray(raw?.stations) ? raw.stations : [])
      .map((item) => ({ id: String(item?.id || ''), name: String(item?.name || '').trim() }))
      .filter((item) => item.name),
    attributions: (Array.isArray(raw?.metadata?.attributions) ? raw.metadata.attributions : [])
      .filter((url) => typeof url === 'string'),
  }
}
