/**
 * HTTP 客户端
 * 统一管理 axios 实例与响应拦截器：
 * - 默认超时与请求头
 * - 把业务码错误（401/429 等）和网络错误统一转成 ApiError
 */

import axios from 'axios';
import { ApiError, getBusinessErrorMessage } from './errors';

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
      return Promise.reject(
        new ApiError({
          code,
          message: getBusinessErrorMessage(code),
        })
      );
    }
    return data;
  },
  (error) => {
    // 收到了 HTTP 响应，但状态码非 2xx
    if (error.response) {
      return Promise.reject(
        new ApiError({
          code: String(error.response.status),
          message: `请求失败（HTTP ${error.response.status}）`,
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
