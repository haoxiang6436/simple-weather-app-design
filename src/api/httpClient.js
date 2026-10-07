/**
 * HTTP 客户端
 * 统一管理 axios 实例与响应拦截器：
 * - 默认超时与请求头
 * - 把和风天气错误码（400/401/403/404/405/429/500）和网络错误统一转成 ApiError
 * - 错误体是 application/problem+json：{ error: { status, type, title, detail, invalidParams } }
 *   其中 error.type 用于区分同一状态码下的不同错误（见 ./errors.js），一并带进 ApiError
 */

import axios from 'axios';
import { ApiError, getWeatherErrorInfo } from './errors';

const SUCCESS_CODES = ['200', '204'];

const httpClient = axios.create({
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

httpClient.interceptors.response.use(
  (response) => {
    const data = response.data;
    const code = data && data.code;

    // 接口正常返回，但业务码非成功码 → 业务错误
    if (typeof code === 'string' && !SUCCESS_CODES.includes(code)) {
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
    return data;
  },
  (error) => {
    // 收到了 HTTP 响应，但状态码非 2xx
    if (error.response) {
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
    const isTimeout = error.code === 'ECONNABORTED';
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
