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
