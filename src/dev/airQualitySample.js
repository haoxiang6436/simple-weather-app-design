/**
 * 预览用的固定数据：一次和风天气 /airquality/v1/current 的真实响应（台州 · 黄岩区）。
 *
 * 原样贴进来、不做裁剪 —— 弹层要展示的每个字段（等级、六种污染物、健康建议、监测站）
 * 都能从这份响应推出来（见 features/weather/airQuality.js 的 buildAirQualityView）。
 * 只有 src/dev/ 下的预览页会引用它；正式界面的数据来自 api/weather.js 的真实请求。
 *
 * 这一份的关键点：AQI 25「优」，primaryPollutant 为 null。
 * 国标只在 AQI > 50 时才设首要污染物，所以弹层里那一栏要显示「无」而不是硬挑一个出来。
 */
import { buildAirQualityView } from '@/features/weather/airQuality'

export const PLACE = '台州市 黄岩区'

export const AIR_QUALITY_SAMPLE = {
  metadata: {
    tag: 'e8c1d2f3a4b5',
    attributions: ['https://www.qweather.com/attribution'],
  },
  indexes: [
    {
      code: 'cn-mee',
      name: 'AQI (CN)',
      aqi: 25,
      aqiDisplay: '25',
      level: 1,
      category: '优',
      color: null,
      primaryPollutant: null,
      health: {
        effect: '空气质量令人满意，基本无空气污染。',
        advice: {
          generalPopulation: '各类人群可正常活动。',
          sensitivePopulation: '各类人群可正常活动。',
        },
      },
    },
  ],
  pollutants: [
    {
      code: 'pm2p5',
      name: 'PM2.5',
      fullName: '细颗粒物',
      concentration: { value: 17, unit: 'μg/m³' },
      subIndexes: [{ code: 'cn-mee', aqi: 25, aqiDisplay: '25' }],
    },
    {
      code: 'pm10',
      name: 'PM10',
      fullName: '可吸入颗粒物',
      concentration: { value: 20, unit: 'μg/m³' },
      subIndexes: [{ code: 'cn-mee', aqi: 21, aqiDisplay: '21' }],
    },
    {
      code: 'no2',
      name: 'NO₂',
      fullName: '二氧化氮',
      concentration: { value: 16, unit: 'μg/m³' },
      subIndexes: [{ code: 'cn-mee', aqi: 8, aqiDisplay: '8' }],
    },
    {
      code: 'o3',
      name: 'O₃',
      fullName: '臭氧',
      concentration: { value: 45, unit: 'μg/m³' },
      subIndexes: [{ code: 'cn-mee', aqi: 15, aqiDisplay: '15' }],
    },
    {
      code: 'so2',
      name: 'SO₂',
      fullName: '二氧化硫',
      concentration: { value: 5, unit: 'μg/m³' },
      subIndexes: [{ code: 'cn-mee', aqi: 2, aqiDisplay: '2' }],
    },
    {
      code: 'co',
      name: 'CO',
      fullName: '一氧化碳',
      concentration: { value: 1, unit: 'mg/m³' },
      subIndexes: [{ code: 'cn-mee', aqi: 10, aqiDisplay: '10' }],
    },
  ],
  // id 只用于去重，预览里不影响显示
  stations: [
    { id: 'P4601', name: '黄岩环保大楼' },
    { id: 'P4602', name: '台州科技职业学院' },
  ],
}

/* ------------------------------------------------------------------ *
 * dev 页专用：把一份响应折算成 store 里 AirQuality 的形状。
 *
 * 页面顶端那颗真胶囊（AirQualityChip）读的是 store，不塞它会整颗不渲染，
 * 而「点胶囊开弹层」正是预览页要验的路径。字段名对齐 api/weather.js 的
 * normalizeAirQuality，不直接把弹层的视图模型塞进去。
 * 正式界面不走这里 —— 真实摘要由接口归一化产出，不用这份。
 * ------------------------------------------------------------------ */
export const airQualitySummary = (raw) => {
  const view = buildAirQualityView(raw)
  if (!view) return null
  const index = raw.indexes[0]
  return {
    aqi: view.aqi,
    display: view.display,
    level: index.level,
    category: index.category,
    standard: view.standard,
    standardName: view.standardName,
    primaryPollutant: view.primaryPollutant,
    effect: view.effect,
    advice: view.adviceGeneral,
    pm25: view.pollutants.length
      ? { value: view.pollutants[0].value, unit: view.pollutants[0].unit }
      : null,
    attributions: view.attributions,
    // 弹层用的明细。正式界面这份由 api/weather.js 的 trimAirQualityDetail 裁过再存，
    // dev 里直接把整份样本当明细 —— buildAirQualityView 只读它认识的字段，多出来的不影响。
    detail: raw,
  }
}

/* ------------------------------------------------------------------ *
 * 压力样本：**不是真实响应**，只用在预览页量「长文案会不会把一屏撑破」。
 *
 * 日常城市大多落在「优 / 良」，那两档的文案短到两行以内，看不出问题；
 * 真正吃排版的是国标第 4 档「中度污染」——「儿童、老年人及心脏病、呼吸系统疾病患者…」
 * 是全表里最长的两句（约 40 字），而且这一档开始才真正有首要污染物（PM2.5）。
 * 数值按 172 编，六种污染物一起抬高，好顺便看第 4 档的染色（沉浸版在深色下最显眼的档位）。
 * ------------------------------------------------------------------ */
export const AIR_QUALITY_STRESS = {
  ...AIR_QUALITY_SAMPLE,
  indexes: [
    {
      code: 'cn-mee',
      name: 'AQI (CN)',
      aqi: 172,
      aqiDisplay: '172',
      level: 4,
      category: '中度污染',
      color: null,
      primaryPollutant: { code: 'pm2p5', name: 'PM2.5' },
      health: {
        effect: '进一步加剧易感人群症状，可能对健康人群心脏、呼吸系统有影响。',
        advice: {
          generalPopulation: '儿童、老年人及心脏病、呼吸系统疾病患者避免长时间、高强度的户外锻炼，一般人群适量减少户外运动。',
          sensitivePopulation: '儿童、老年人及心脏病、呼吸系统疾病患者应避免长时间、高强度的户外锻炼，一般人群适量减少户外运动。',
        },
      },
    },
  ],
  // 分指数按同一档重排：PM2.5 172 是首要污染物，其余按各自量级递减
  pollutants: [
    ['pm2p5', 130, 172],
    ['pm10', 210, 128],
    ['no2', 76, 47],
    ['o3', 155, 63],
    ['so2', 22, 18],
    ['co', 2.1, 35],
  ].map(([code, value, aqi]) => {
    const base = AIR_QUALITY_SAMPLE.pollutants.find((item) => item.code === code)
    return {
      ...base,
      concentration: { value, unit: base.concentration.unit },
      subIndexes: [{ code: 'cn-mee', aqi, aqiDisplay: String(aqi) }],
    }
  }),
}
