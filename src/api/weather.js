/**
 * 和风天气接口
 * 每个接口：轮询取一个域名 → 配上对应 Key → 发起 GET 请求
 */

import httpClient from './httpClient';
import { getNextHost, getKeyForHost } from './hostPool';

const requestWeather = (path, params) => {
  const host = getNextHost();
  const key = getKeyForHost(host);
  return httpClient.get(`https://${host}${path}`, {
    params: { ...params, key },
  });
};

// 城市搜索：通过 adcode 查找城市信息
export const lookupCity = (location) =>
  requestWeather('/geo/v2/city/lookup', { location });

// 未来 7 天天气预报
export const get7DayForecast = (location) =>
  requestWeather('/v7/weather/7d', { location });

// 实时天气
export const getCurrentWeather = (location) =>
  requestWeather('/v7/weather/now', { location });

// 天气预警
export const getWeatherWarnings = (location) =>
  requestWeather('/v7/warning/now', { location });

// 生活指数（type 必填：多个类型用英文逗号分隔，如 '1,3,5,9'）
export const getWeatherIndices = (location, type) =>
  requestWeather('/v7/indices/1d', { location, type });
