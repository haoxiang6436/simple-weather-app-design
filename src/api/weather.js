/**
 * 和风天气接口
 * 每个接口：轮询取一个域名 → 配上对应 Key → 发起 GET 请求
 * 域名与密钥均来自用户在壁纸属性面板里填写的值（见 ./credentials.js）。
 *
 * 2026-10 迁移说明：
 *   - 实时天气 / 每日预报 改走 /weather/v1/*，按经纬度查询，1 km 分辨率。
 *     老版本 /v7/weather/* 只认 LocationID，且新注册的账号已经拿不到权限；
 *     反过来 v1 是新老账号都支持的，所以这里是单向迁移，不做双通道。
 *   - 生活指数仍是 /v7/indices/*（没有 v1 版本），但它同样接受坐标。
 *   - 四个数据源从此全部基于坐标，LocationID 只用于反查显示名和时区。
 *
 * v1 的响应结构和 v7 完全不同（嵌套对象、无 code 字段、湿度是 0~1 小数、
 * 风速是 m/s、时间戳是 ISO），所以这里统一做归一化，向上只暴露一套字段，
 * store 和 UI 不需要知道数据来自哪个版本。
 */

import httpClient from './httpClient';
import { getNextTarget } from './hostPool';
import { STATS_SERVICE } from './requestStats';

/**
 * 路径 → 统计用的接口代号（见 api/requestStats.js 的 REQUEST_API_LABELS）
 *
 * 从路径推，而不是让每个接口多传一个参数：路径本来就是接口的身份，
 * 少一个能写错的地方。以后加接口时忘了在这里登记，统计里会落到「其他」——
 * 看得见，不会悄悄算进别的接口。
 */
const API_BY_PATH = [
  [/^\/weather\/v1\/current\//, 'current'],
  [/^\/weather\/v1\/daily\//, 'daily'],
  [/^\/weather\/v1\/hourly\//, 'hourly'],
  [/^\/weatheralert\/v1\/current\//, 'alert'],
  [/^\/v7\/indices\//, 'indices'],
  [/^\/airquality\/v1\/current\//, 'air'],
  [/^\/v7\/minutely\//, 'minutely'],
  [/^\/geo\/v2\/city\/lookup/, 'geo'],
];

const apiOfPath = (path) => {
  const hit = API_BY_PATH.find(([pattern]) => pattern.test(path));
  return hit ? hit[1] : 'other';
};

/**
 * @param {string} path 接口路径，如 /weather/v1/current/39.92/116.41
 * @param {Object} params 查询参数（不含 key）
 * @param {{host:string,key:string}} [target] 指定域名/密钥；不传则走轮询池
 * @param {Object} [config] 透传给 axios 的请求配置（signal / timeout 等）
 */
const requestWeather = (path, params, target, config = {}) => {
  const { host, key } = target || getNextTarget();
  return httpClient.get(`https://${host}${path}`, {
    ...config,
    // 计数用：响应拦截器靠这几个字段把这次请求归到「哪个服务、哪个接口、哪个域名」。
    // service 是必须的（见 api/requestStats.js 的 STATS_SERVICE）：
    // 高德路名、一言那些请求不计入和风额度，不带这个标记就进不了统计。
    // 放在 config 之后，调用方即使误传 meta 也覆盖不掉（同下面 params 的道理）
    meta: { service: STATS_SERVICE, api: apiOfPath(path), host },
    // params 放最后：config 里即使误传了 params，也不能把 key / location 覆盖掉
    params: { ...params, key },
  });
};

// 检测凭据可用性用的查询地点：北京的 adcode，固定值，不消耗用户额度之外的额外参数
export const API_CHECK_LOCATION = '110000';

/**
 * 检测"域名 + 密钥"是否可用
 * 用最轻量的城市查询接口：1 次请求即可同时验证域名可达性、密钥有效性与接口权限。
 * @param {{host:string,key:string}} entry
 */
export const checkApiEntry = (entry) =>
  requestWeather('/geo/v2/city/lookup', { location: API_CHECK_LOCATION }, entry);

// 城市搜索：通过 adcode / 经纬度查找城市信息（结果里带 lat/lon/tz）
// config 用于地图选点的实时反查：传 signal 取消旧请求、timeout 缩短等待
export const lookupCity = (location, config) =>
  requestWeather('/geo/v2/city/lookup', { location }, undefined, config);

/* ------------------------------------------------------------------ *
 * 归一化：v1 的响应结构 → UI 用的字段
 * ------------------------------------------------------------------ */

// 接口经纬度最多两位小数；两位小数约 1.1 km，和数据的 1 km 分辨率对得上
export const round2 = (value) => Number(value).toFixed(2);

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value) => (num(value) === null ? null : Math.round(Number(value)));
// 湿度 / 云量：v1 是 0~1 小数，UI 用百分比
const percent = (value) => (num(value) === null ? null : Math.round(Number(value) * 100));

/**
 * 风速 → km/h。
 * 单位从响应的 unit 字段读，而不是硬编码：文档默认 m/s，但接口有权改成 km/h。
 */
const speedToKmh = (speed) => {
  const value = num(speed?.value);
  if (value === null) return null;
  const unit = String(speed?.unit || 'm/s').toLowerCase();
  if (unit === 'km/h') return Math.round(value);
  if (unit === 'mph') return Math.round(value * 1.60934);
  return Math.round(value * 3.6); // m/s
};

/** 能见度 → km，同样按 unit 判断单位 */
const distanceToKm = (distance) => {
  const value = num(distance?.value);
  if (value === null) return null;
  const unit = String(distance?.unit || 'm').toLowerCase();
  if (unit === 'km') return Math.round(value);
  return Math.round(value / 1000);
};

/** 一组风速里取最大，转 km/h（阵风是白天/夜间各一份，取大的那个代表全天） */
const maxSpeedToKmh = (...speeds) => {
  const values = speeds.map(speedToKmh).filter((value) => value !== null);
  return values.length ? Math.max(...values) : null;
};

/**
 * 风向只保留 8 个方位。
 * 接口给的是 16 方位，逐字翻出来是「北西北风」「东东北风」这种听着像病句的名字；
 * 中文气象里的正名「西北偏北风」又太长，塞不进指标卡。
 * 所以优先用 direction.degree 就近取整到 45°，没有角度时才退回 compass 查表。
 */
const WIND_DIR_8 = ['北风', '东北风', '东风', '东南风', '南风', '西南风', '西风', '西北风'];

// 16 方位 → 8 方位：等价于 round(index * 22.5 / 45)，和按角度取整的结果一致
const COMPASS_TO_8 = {
  n: 0, nne: 1, ne: 1, ene: 2, e: 2, ese: 3, se: 3, sse: 4,
  s: 4, ssw: 5, sw: 5, wsw: 6, w: 6, wnw: 7, nw: 7, nnw: 0,
};

const windDir = (direction) => {
  const degree = num(direction?.degree);
  if (degree !== null) {
    const normalized = ((degree % 360) + 360) % 360;
    return WIND_DIR_8[Math.round(normalized / 45) % 8];
  }
  const index = COMPASS_TO_8[String(direction?.compass || '').toLowerCase()];
  return index === undefined ? '' : WIND_DIR_8[index];
};

/**
 * 把 ISO 时间格式化到「查询地点」的时区。
 * 即使接口忽略了 localTime 参数、返回的是 UTC，这里也能得到正确的地方时。
 */
const formatInZone = (iso, timeZone, options) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', { ...options, timeZone: timeZone || undefined }).format(date);
  } catch (error) {
    // 时区名不合法（老缓存里可能是空的）→ 退回浏览器本地时区
    try {
      return new Intl.DateTimeFormat('en-CA', options).format(date);
    } catch (fallbackError) {
      return '';
    }
  }
};

const dateInZone = (iso, timeZone) => formatInZone(iso, timeZone, {
  year: 'numeric', month: '2-digit', day: '2-digit',
});

const clockInZone = (iso, timeZone) => formatInZone(iso, timeZone, {
  hour: '2-digit', minute: '2-digit', hour12: false,
});

/** /weather/v1/current 的响应 → UI 用的实时天气字段 */
const normalizeCurrent = (raw) => ({
  icon: raw?.condition?.code || '100',
  text: raw?.condition?.text || '',
  temp: round(raw?.temperature?.value),
  feelsLike: round(raw?.feelsLike?.value),
  humidity: percent(raw?.humidity),
  windDir: windDir(raw?.wind?.direction),
  windScale: num(raw?.wind?.scale),
  windSpeed: speedToKmh(raw?.wind?.speed),
  precip: num(raw?.precipitation?.amount?.value),
  pressure: round(raw?.pressure?.value),
  vis: distanceToKm(raw?.visibility),
  cloud: percent(raw?.cloudCover),
  uvIndex: num(raw?.uvIndex),
});

/**
 * /weather/v1/daily 的响应 → UI 用的每日字段
 * 注意：v1 的每日预报不提供气压和能见度（只有实况有），
 * 所以界面上这两项换成了它提供的「最大阵风」和「云量」；气压/能见度仍由实况接口给出。
 */
const normalizeDaily = (raw, timeZone) => ({
  daily: (raw?.days || []).map((day) => ({
    fxDate: dateInZone(day.forecastStartTime, timeZone),
    tempMax: round(day.temperatureMax?.value),
    tempMin: round(day.temperatureMin?.value),
    tempAvg: round(day.temperatureAvg?.value),
    iconDay: day.daytime?.condition?.code || '100',
    iconNight: day.nighttime?.condition?.code || day.daytime?.condition?.code || '100',
    textDay: day.daytime?.condition?.text || '',
    textNight: day.nighttime?.condition?.text || '',
    sunrise: clockInZone(day.astro?.sunrise, timeZone),
    sunset: clockInZone(day.astro?.sunset, timeZone),
    uvIndex: num(day.uvIndexMax),
    gust: maxSpeedToKmh(day.daytime?.windGustMax, day.nighttime?.windGustMax),
    cloud: percent(day.daytime?.cloudCover),
    windDirDay: windDir(day.daytime?.wind?.direction),
    windScaleDay: num(day.daytime?.wind?.scale),
    windSpeedDay: speedToKmh(day.daytime?.wind?.speed),
    precip: num(day.daytime?.precipitation?.amount?.value),
    humidity: percent(day.daytime?.humidity),
  })),
});

/* ------------------------------------------------------------------ *
 * 逐小时预报
 * GET /weather/v1/hourly/{latitude}/{longitude}?hours=24&localTime=true
 *
 * 和 v1 其它接口一样：没有 code 字段、湿度/云量/降水概率都是 0~1 小数、
 * 风速是 m/s、时间是 ISO。这里全部换成 UI 直接能用的形状：
 *   - time / date 已经按查询地点的时区换算好（跨零点要靠 date 判断「明天」）
 *   - ts 是毫秒时间戳，用来丢掉已经过去的整点（接口返回的第一项常常就是过去）
 *   - precipProb 是百分比（0~100），不是 0~1
 * ------------------------------------------------------------------ */

/** 两位小数（降水量的量级是 0.01mm，用整数会全变成 0） */
const twoDecimals = (value) => {
  const number = num(value);
  return number === null ? null : Math.round(number * 100) / 100;
};

/**
 * 数据来源署名。
 * v1 的 metadata.attributions 既可能是字符串数组（旧版），也可能是
 * [{name, url}] 对象数组，两种都收；官方要求「署名必须与数据同时展示」。
 */
const normalizeAttributions = (list) => (Array.isArray(list) ? list : [])
  .map((item) => (typeof item === 'string'
    ? { name: '', url: item }
    : { name: String(item?.name || ''), url: String(item?.url || '') }))
  .filter((item) => item.name || item.url);

/** /weather/v1/hourly 的响应 → UI 用的逐小时字段 */
const normalizeHourly = (raw, timeZone) => ({
  hours: (raw?.hours || []).map((hour) => {
    const ts = Date.parse(hour.forecastTime);
    return {
      ts: Number.isFinite(ts) ? ts : null,
      date: dateInZone(hour.forecastTime, timeZone),
      time: clockInZone(hour.forecastTime, timeZone),
      temp: round(hour.temperature?.value),
      feelsLike: round(hour.feelsLike?.value),
      icon: hour.condition?.code || '',
      text: hour.condition?.text || '',
      humidity: percent(hour.humidity),
      windDir: windDir(hour.wind?.direction),
      windScale: num(hour.wind?.scale),
      windSpeed: speedToKmh(hour.wind?.speed),
      // 0~1 小数 → 百分比：卡片上直接写「78%」，不再乘 100
      precipProb: percent(hour.precipitation?.probability),
      precip: twoDecimals(hour.precipitation?.amount?.value),
      precipType: hour.precipitation?.type || '',
      pressure: round(hour.pressure?.value),
      cloud: percent(hour.cloudCover),
      uvIndex: num(hour.uvIndex),
    };
  }),
  attributions: normalizeAttributions(raw?.metadata?.attributions),
});

/* ------------------------------------------------------------------ *
 * 数据接口（全部按坐标查询）
 * ------------------------------------------------------------------ */
/**
 * 实时天气（1 km 分辨率）
 * @param {{lat:number, lon:number}} coord
 */
export const getCurrentWeather = ({ lat, lon }) =>
  requestWeather(`/weather/v1/current/${round2(lat)}/${round2(lon)}`, { localTime: 'true' })
    .then(normalizeCurrent);

/**
 * 每日天气预报（1 km 分辨率，最多 10 天）
 * @param {{lat:number, lon:number, tz?:string}} coord tz 用来把 ISO 时间换算成当地地方时
 * @param {number} [days] 默认 7
 */
export const get7DayForecast = ({ lat, lon, tz }, days = 7) =>
  requestWeather(`/weather/v1/daily/${round2(lat)}/${round2(lon)}`, {
    days: Math.min(Math.max(Number(days) || 7, 1), 10),
    localTime: 'true',
  }).then((raw) => normalizeDaily(raw, tz));

/**
 * 逐小时天气预报（1 km 分辨率，1-240 小时）
 * @param {{lat:number, lon:number, tz?:string}} coord tz 用来把 ISO 时间换算成当地地方时
 * @param {number} [hours] 默认 24
 */
export const getHourlyForecast = ({ lat, lon, tz }, hours = 24) =>
  requestWeather(`/weather/v1/hourly/${round2(lat)}/${round2(lon)}`, {
    hours: Math.min(Math.max(Number(hours) || 24, 1), 240),
    // 不传的话接口默认给 UTC —— 卡片上的「15时」会整体偏移一个时区
    localTime: 'true',
  }).then((raw) => normalizeHourly(raw, tz));

/**
 * 实时天气预警（新版接口，按经纬度）
 * GET /weatheralert/v1/current/{latitude}/{longitude}
 * @param {{lat: string|number, lon: string|number}} coord
 */
export const getWeatherWarnings = ({ lat, lon }) =>
  requestWeather(`/weatheralert/v1/current/${round2(lat)}/${round2(lon)}`);

/**
 * 生活指数（只有 v7 版本，但它接受经纬度，注意是「经度,纬度」）
 * @param {{lat:number, lon:number}} coord
 * @param {string} type 多个类型用英文逗号分隔，如 '1,3,5,9'
 */
export const getWeatherIndices = ({ lat, lon }, type) =>
  requestWeather('/v7/indices/1d', { location: `${round2(lon)},${round2(lat)}`, type });

/* ------------------------------------------------------------------ *
 * 实时空气质量
 * GET /airquality/v1/current/{latitude}/{longitude}
 *
 * 接口一次最多返回两个 AQI：一个是本地标准（中国是 cn-mee），另一个是和风通用 QAQI。
 * 展示哪一个必须挑：
 *   1. 优先本地标准 —— 用户看到的「优 / 良 / 轻度污染」和环保部门发布的口径一致；
 *   2. 中国不返回 QAQI（官方明确「暂不适用于中国地区」），所以大陆只会命中 cn-mee，
 *      不存在「两个都差不多、挑谁都行」的情况；
 *   3. 只有 qaqi 时（没有本地标准的国家 / 地区）才退回它。
 * 顺序表按「中国大陆 → 港澳台 → 日韩 → 英美欧」排，未列出的地区按接口返回顺序取第一个本地 AQI。
 * ------------------------------------------------------------------ */
const AQI_PREFERENCE = [
  'cn-mee', 'cn-mee-1h',
  'hk-epd', 'mo-smg', 'tw-me', 'tw-me-1h',
  'jp-moe', 'kr-moe',
  'us-epa', 'us-epa-nc',
  'gb-defra', 'eu-eea', 'fr-atmo', 'ca-eccc',
  'sg-nea', 'sg-nea-pm1h', 'th-pcd',
]

const pickAirIndex = (indexes) => {
  const list = (Array.isArray(indexes) ? indexes : []).filter(
    (item) => item && Number.isFinite(Number(item.aqi))
  )
  if (!list.length) return null
  // qaqi 不参与排序，只在没有本地标准时才用（见上面的注释）
  const rank = (item) => {
    if (item.code === 'qaqi') return AQI_PREFERENCE.length + 1
    const index = AQI_PREFERENCE.indexOf(item.code)
    return index === -1 ? AQI_PREFERENCE.length : index
  }
  return list.slice().sort((a, b) => rank(a) - rank(b))[0]
}

/**
 * 只留 buildAirQualityView（features/weather/airQuality.js）真正会读的字段。
 *
 * 为什么要裁：这份数据会跟着 AirQuality 一起进 localStorage（见 useWeatherStore 的
 * persist.paths）。原始响应里有整个 pollutants 的多语言名、additionalInfo、
 * 每个污染物下所有标准的 subIndexes（一个响应能翻出十几份指数），
 * 全都存下来会让缓存膨胀几倍，而弹层一个字也用不到。
 * 为什么是白名单而不是原样存：白名单一旦加了不被读的字段就会被发现；
 * 反过来「以后弹层要多看一个字段」时，改这里必须同时改 buildAirQualityView —— 两处挨着写注释互相指认。
 */
const trimAirQualityDetail = (raw) => ({
  indexes: (Array.isArray(raw?.indexes) ? raw.indexes : []).map((item) => ({
    code: item?.code,
    name: item?.name,
    aqi: item?.aqi,
    aqiDisplay: item?.aqiDisplay,
    level: item?.level,
    category: item?.category,
    primaryPollutant: item?.primaryPollutant ? { name: item.primaryPollutant.name } : null,
    health: {
      effect: item?.health?.effect,
      advice: {
        generalPopulation: item?.health?.advice?.generalPopulation,
        sensitivePopulation: item?.health?.advice?.sensitivePopulation,
      },
    },
  })),
  pollutants: (Array.isArray(raw?.pollutants) ? raw.pollutants : []).map((item) => ({
    code: item?.code,
    name: item?.name,
    fullName: item?.fullName,
    concentration: { value: item?.concentration?.value, unit: item?.concentration?.unit },
    subIndexes: (Array.isArray(item?.subIndexes) ? item.subIndexes : [])
      .map((sub) => ({ code: sub?.code, aqi: sub?.aqi })),
  })),
  stations: (Array.isArray(raw?.stations) ? raw.stations : [])
    .map((item) => ({ id: item?.id, name: item?.name })),
  metadata: { attributions: raw?.metadata?.attributions },
})

/**
 * /airquality/v1/current 的响应 → UI 用的空气质量字段
 *
 * 顶层是「摘要」：胶囊、悬停提示、持久化缓存里那份够用的一眼数据。
 * detail 是同一份响应裁过的明细：弹层（AirQualityDialog）要靠它展开六个污染物、
 * 监测站和两类人群的健康建议 —— 只留摘要的话，点开只能看到 PM2.5 一条。
 *
 * metadata.attributions 一并带上：官方要求空气质量数据必须与来源一起展示。
 */
const normalizeAirQuality = (raw) => {
  const index = pickAirIndex(raw?.indexes)
  if (!index) return null
  const pm25 = (raw?.pollutants || []).find((item) => item?.code === 'pm2p5')
  return {
    aqi: Math.round(Number(index.aqi)),
    // aqiDisplay 才是「给人看」的值（可能带 10+ 之类的非数字写法），优先用它
    display: String(index.aqiDisplay || Math.round(Number(index.aqi))),
    level: Number(index.level) || null,
    category: String(index.category || '').trim(),
    standard: String(index.code || ''),
    standardName: String(index.name || ''),
    primaryPollutant: String(index.primaryPollutant?.name || ''),
    effect: String(index.health?.effect || '').trim(),
    advice: String(index.health?.advice?.generalPopulation || '').trim(),
    pm25: Number.isFinite(Number(pm25?.concentration?.value))
      ? { value: Number(pm25.concentration.value), unit: String(pm25.concentration.unit || 'μg/m³') }
      : null,
    attributions: (raw?.metadata?.attributions || []).filter((url) => typeof url === 'string'),
    // 弹层专用的明细（同一份响应，裁掉没人读的字段）
    detail: trimAirQualityDetail(raw),
  }
}

/**
 * 实时空气质量（1 km 分辨率，全球覆盖）
 * @param {{lat:number, lon:number}} coord
 */
export const getAirQuality = ({ lat, lon }) =>
  requestWeather(`/airquality/v1/current/${round2(lat)}/${round2(lon)}`)
    .then(normalizeAirQuality);

/**
 * 分钟级降水（只有 v7 版本，没有 v1；同样注意是「经度,纬度」）
 *
 * 只覆盖中国：境外坐标会返回 400 + data-not-available，调用方要按「该地区不支持」处理，
 * 不能当凭据错误、也不能因此把整张天气卡判成加载失败。
 *
 * 返回未来两小时、每 5 分钟一个点的累计降水量（precip 是字符串，单位 mm）。
 * 这里只做字段归一化，怎么看「几分钟后雨停」由 features/weather/minutelyRain.js 负责。
 *
 * @param {{lat:number, lon:number}} coord
 */
export const getMinutelyPrecipitation = ({ lat, lon }) =>
  requestWeather('/v7/minutely/5m', { location: `${round2(lon)},${round2(lat)}` })
    .then((raw) => ({
      // 数据发布时间，对齐到 5 分钟
      updateTime: raw?.updateTime || '',
      points: (raw?.minutely || [])
        .map((item) => ({
          time: item.fxTime || '',
          // 文档/实测都是两位小数字符串（"0.00"），必须转成数字再比较
          precip: num(item.precip) ?? 0,
          type: item.type || 'rain',
        }))
        .filter((item) => item.time),
    }));
