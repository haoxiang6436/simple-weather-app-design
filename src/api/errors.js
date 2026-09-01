/**
 * 请求错误统一封装
 * - 业务错误：接口正常返回，但业务码不是 200/204（如 401、429）
 * - 网络错误：超时、断网等没有收到响应的错误
 */

export class ApiError extends Error {
  constructor({ code, message, isNetwork = false, cause = null }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.isNetwork = isNetwork;
    this.cause = cause;
  }
}

export const isNetworkError = (error) => error?.isNetwork === true;

// 和风天气业务状态码说明
const BUSINESS_CODE_MESSAGE = {
  400: '请求参数错误',
  401: '认证失败：KEY 无效或类型错误',
  402: '访问次数超限或余额不足',
  403: '无访问权限：域名/包名未绑定或需要付费数据',
  404: '查询的数据或地区不存在',
  429: '请求过于频繁，请稍后重试',
  500: '接口服务异常，请稍后重试',
};

export const getBusinessErrorMessage = (code) =>
  BUSINESS_CODE_MESSAGE[code] || `接口返回错误（code: ${code}）`;
