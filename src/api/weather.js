/**
 * 和风天气接口
 * 每个接口：轮询取一个域名 → 配上对应 Key → 发起 GET 请求
 * 域名与密钥均来自用户在壁纸属性面板里填写的值（见 ./credentials.js）。
 */

import httpClient from './httpClient';
import { getNextTarget } from './hostPool';

/**
 * @param {string} path 接口路径，如 /v7/weather/now
 * @param {Object} params 查询参数（不含 key）
 * @param {{host:string,key:string}} [target] 指定域名/密钥；不传则走轮询池
 */
const requestWeather = (path, params, target) => {
  const { host, key } = target || getNextTarget();
  return httpClient.get(`https://${host}${path}`, {
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

// 城市搜索：通过 adcode 查找城市信息
export const lookupCity = (location) =>
  requestWeather('/geo/v2/city/lookup', { location });

// 未来 7 天天气预报
export const get7DayForecast = (location) =>
  requestWeather('/v7/weather/7d', { location });

// 实时天气
export const getCurrentWeather = (location) =>
  requestWeather('/v7/weather/now', { location });

// 经纬度按官方要求裁到两位小数（文档：十进制，最多支持小数点后两位）
const round2 = (value) => Number(value).toFixed(2)

/**
 * 实时天气预警（新版接口）
 *
 * 旧接口 GET /v7/warning/now 已被官方下线，任何账号调用都返回
 * 403 #deprecated（"This API has been deprecated and is no longer available"），
 * 新版按经纬度查询：GET /weatheralert/v1/current/{latitude}/{longitude}
 * 认证方式不变，仍然是查询参数里的 key。
 *
 * @param {{lat: string|number, lon: string|number}} coord 查询地点的经纬度
 */
export const getWeatherWarnings = ({ lat, lon }) =>
  requestWeather(`/weatheralert/v1/current/${round2(lat)}/${round2(lon)}`);

// 生活指数（type 必填：多个类型用英文逗号分隔，如 '1,3,5,9'）
export const getWeatherIndices = (location, type) =>
  requestWeather('/v7/indices/1d', { location, type });
