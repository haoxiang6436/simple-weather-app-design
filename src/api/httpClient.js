/**
 * HTTP 客户端
 * 统一管理 axios 实例与响应拦截器：
 * - 默认超时与请求头
 * - 把和风天气错误码（400/401/403/404/405/429/500）和网络错误统一转成 ApiError
 * - 错误体是 application/problem+json：{ error: { status, type, title, detail, invalidParams } }
 *   其中 error.type 用于区分同一状态码下的不同错误（见 ./errors.js），一并带进 ApiError
 *
 * 这里同时是「请求量计数」的唯一落点（见 ./requestStats.js）：
 * 计费口径是「一次 HTTP 请求算一次，但状态码非 2xx 不计费」，
 * 所以只能挂在响应这一侧 —— 请求拦截器只知道发出去了几次，不知道成没成，
 * 会把超时、401、429 统统算进额度里。
 */

import axios from 'axios';
import { ApiError, getWeatherErrorInfo } from './errors';
import { recordRequest } from './requestStats';

const SUCCESS_CODES = ['200', '204'];

const httpClient = axios.create({
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * 请求自带的统计信息（由 api/weather.js 的 requestWeather 塞进 config.meta）。
 * 没有 meta 的请求一概不计数；带了 meta 但 service 不是 'qweather' 的也不计数
 * （闸门在 requestStats.recordRequest 里 —— 这里只负责原样转发）。
 *
 * 目前只有和风天气走这个实例：高德逆地理编码、地图瓦片、一言都是各自的 fetch，
 * 不消耗和风额度，也不该出现在统计页上。
 */
const readMeta = (config) => (config && config.meta) || null;

httpClient.interceptors.response.use(
  (response) => {
    const data = response.data;
    const code = data && data.code;
    const meta = readMeta(response.config);

    // 接口正常返回，但业务码非成功码 → 业务错误
    if (typeof code === 'string' && !SUCCESS_CODES.includes(code)) {
      // HTTP 200 但业务码失败：只有还在用 body code 的 v7 接口会这样。
      // 官方没说这种算不算一次请求，单独记成 soft，不并进「计入额度」的那一档
      if (meta) recordRequest({ ...meta, outcome: 'soft' });
      const problem = data?.error || {};
      const info = getWeatherErrorInfo({
        code,
        type: problem.type,
        title: problem.title,
      });
      return Promise.reject(
        new ApiError({
          code,
          message: info.tip,
          type: problem.type || info.type,
          title: problem.title || info.title,
          detail: problem.detail || '',
          invalidParams: Array.isArray(problem.invalidParams) ? problem.invalidParams : [],
          kind: info.kind,
          advice: info.advice,
          tipLines: info.lines,
          retryable: info.retryable,
          soft: info.soft,
          reauth: info.reauth,
        })
      );
    }
    if (meta) recordRequest({ ...meta, outcome: 'ok' });
    return data;
  },
  (error) => {
    const meta = readMeta(error.config);

    // 收到了 HTTP 响应，但状态码非 2xx
    if (error.response) {
      // 按官方规则「状态码非 2xx 不计费」，所以这一笔记 err，不进额度
      if (meta) recordRequest({ ...meta, outcome: 'err' });
      const status = String(error.response.status);
      const problem = error.response.data?.error || {};
      const info = getWeatherErrorInfo({
        code: status,
        type: problem.type,
        title: problem.title,
      });
      return Promise.reject(
        new ApiError({
          code: status,
          message: info.tip,
          type: problem.type || info.type,
          title: problem.title || info.title,
          detail: problem.detail || '',
          invalidParams: Array.isArray(problem.invalidParams) ? problem.invalidParams : [],
          kind: info.kind,
          advice: info.advice,
          tipLines: info.lines,
          retryable: info.retryable,
          soft: info.soft,
          reauth: info.reauth,
          cause: error,
        })
      );
    }
    // 超时 / 断网等没有响应的错误
    const isCanceled = error.code === 'ERR_CANCELED' || error.name === 'CanceledError';
    const isTimeout = error.code === 'ECONNABORTED';
    // 主动取消的请求（地图选点每敲一个字就取消上一个）根本没到服务端，不计入统计，
    // 否则手一抖就是几十条假的网络错误
    if (meta && !isCanceled) recordRequest({ ...meta, outcome: 'net' });
    return Promise.reject(
      new ApiError({
        code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: isTimeout ? '请求超时' : '网络错误',
        isNetwork: true,
        cause: error,
      })
    );
  }
);

export default httpClient;
