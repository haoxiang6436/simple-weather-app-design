/**
 * 和风天气请求错误统一封装 + 错误码提示表
 *
 * 错误码来源：https://dev.qweather.com/docs/resource/error-code/
 *
 * 和风天气出错时返回的是「HTTP 状态码 + 结构化错误体」：
 *   HTTP/2 403
 *   Content-Type: application/problem+json
 *   {
 *     "error": {
 *       "status": 403,
 *       "type": "https://dev.qweather.com/docs/resource/error-code/#no-credit",
 *       "title": "No Credit",
 *       "detail": "...",
 *       "invalidParams": ["lang"]
 *     }
 *   }
 *
 * 注意：同一个 HTTP 状态码下可能对应多种错误（403 有 7 种、400 有 4 种、429 有 2 种），
 * 所以取提示时要优先用 error.type / error.title 精确匹配，匹配不到再退回按状态码的通用提示。
 *
 * 文案排版：长提示在 advice 里用 \n 手工分行，每行都控制在十几个字，
 * 方便在窄面板里直接显示。展示时用 tip（多行字符串）或 lines（数组）都行，
 * 但承载的 CSS 需要 white-space: pre-line / pre-wrap，否则 \n 会被折叠成空格。
 */

export class ApiError extends Error {
  constructor({
    code,
    message,
    type = '',
    title = '',
    detail = '',
    invalidParams = [],
    kind = 'unknown',
    advice = '',
    tipLines = [],
    retryable = false,
    soft = false,
    reauth = false,
    isNetwork = false,
    cause = null,
  }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.type = type;
    this.title = title;
    this.detail = detail;
    this.invalidParams = invalidParams;
    this.kind = kind;
    this.advice = advice;
    this.tipLines = tipLines;
    this.retryable = retryable;
    this.soft = soft;
    this.reauth = reauth;
    this.isNetwork = isNetwork;
    this.cause = cause;
  }
}

export const isNetworkError = (error) => error?.isNetwork === true;

/**
 * 完整错误提示表（按官方文档 17 种错误逐一整理）
 *
 * 字段说明：
 * - code        HTTP 状态码（和风天气的错误码就是 HTTP 状态码）
 * - type        官方 error.type 的锚点，用于区分同一状态码下的不同错误
 * - title       官方英文标题（error.title，日志排查用）
 * - kind        归类，方便 UI 分组/着色：
 *               param 参数 | location 地点 | data 数据 | auth 认证 | quota 额度
 *               security 安全限制 | host 域名 | account 账号 | api 接口
 *               permission 权限 | rate 频率 | server 服务端
 * - message     第一行：一句话概括 + HTTP 状态码，适合状态条 / toast 标题
 * - advice      后续行：怎么做；长句用 \n 手工分行，每行都较短
 * - tip         message + 换行 + advice，只有一处展示位时直接用
 * - lines       [message, ...advice 分行]，需要逐行渲染（v-for）时用
 * - codeLabel   "HTTP 403 · No Credit"，方便单独做成徽标或写进日志
 * - retryable   是否值得稍后重试（可配合指数退避）
 * - soft        是否属于「非用户配置错误」，可以先继续用缓存数据
 * - reauth      是否需要引导用户回到「域名 / 密钥」设置页处理
 * - aliases     同一错误的其他写法（官方文档标题与锚点用词不完全一致时兜底）
 */
export const QWEATHER_ERRORS = [
  // ---------- 400 请求错误 ----------
  {
    code: '400',
    type: 'invalid-parameter',
    title: 'Invalid Parameters',
    kind: 'param',
    message: '请求参数不正确',
    advice: '请检查参数值是否正确\n（如位置、日期、语言等）',
    retryable: false,
    soft: false,
    reauth: false,
    aliases: ['invalid-parameters'],
  },
  {
    code: '400',
    type: 'missing-parameter',
    title: 'Missing Parameters',
    kind: 'param',
    message: '请求缺少必填参数',
    advice: '请补齐缺失的参数后重试',
    retryable: false,
    soft: false,
    reauth: false,
    aliases: ['missing-parameters'],
  },
  {
    code: '400',
    type: 'no-such-location',
    title: 'No Such Location',
    kind: 'location',
    message: '没有找到这个地点',
    advice: '请检查城市名称或 Location ID\n或换一个地点试试',
    retryable: false,
    soft: false,
    reauth: false,
  },
  {
    code: '400',
    type: 'data-not-available',
    title: 'Data Not Available',
    kind: 'data',
    message: '该地点暂无这项数据',
    advice: '当前地点不在数据覆盖范围内\n请换一个地点查询',
    retryable: false,
    soft: true,
    reauth: false,
  },

  // ---------- 401 认证失败 ----------
  {
    code: '401',
    type: 'unauthorized',
    title: 'Unauthorized',
    kind: 'auth',
    message: '身份认证失败',
    advice: 'KEY 或 Token 无效\n请检查域名对应的 KEY\n并确认使用的是 Web API Key',
    retryable: false,
    soft: false,
    reauth: true,
  },

  // ---------- 403 请求被拒绝 ----------
  {
    code: '403',
    type: 'no-credit',
    title: 'No Credit',
    kind: 'quota',
    message: '账户可用额度不足',
    advice: '请到和风天气控制台充值\n或购买额度后再试',
    retryable: false,
    soft: false,
    reauth: true,
  },
  {
    code: '403',
    type: 'overdue',
    title: 'Overdue',
    kind: 'quota',
    message: '账户有逾期未付账单',
    advice: '请先结清逾期账单\n再继续请求数据',
    retryable: false,
    soft: false,
    reauth: true,
  },
  {
    code: '403',
    type: 'security-restriction',
    title: 'Security Restriction',
    kind: 'security',
    message: '请求触发了访问限制',
    advice: '请检查控制台里的请求限制\n若不是你发出的请求\n请尽快更换密钥',
    retryable: false,
    soft: false,
    reauth: true,
  },
  {
    code: '403',
    type: 'invalid-host',
    title: 'Invalid Host',
    kind: 'host',
    message: 'API Host 不正确',
    advice: '请到控制台「设置 → API Host」\n核对你的专属域名\n并更新到壁纸设置里',
    retryable: false,
    soft: false,
    reauth: true,
  },
  {
    code: '403',
    type: 'account-suspension',
    title: 'Account Suspension',
    kind: 'account',
    message: '账户已被冻结',
    advice: '请登录和风天气控制台\n查看冻结原因\n或提交工单联系官方',
    retryable: false,
    soft: false,
    reauth: true,
  },
  {
    code: '403',
    type: 'deprecated',
    title: 'Deprecated',
    kind: 'api',
    message: '该接口已弃用',
    advice: '请在官方文档中查找\n并使用最新版接口',
    retryable: false,
    soft: false,
    reauth: false,
  },
  {
    code: '403',
    type: 'forbidden',
    title: 'Forbidden',
    kind: 'permission',
    message: '暂无这项数据的权限',
    advice: '请提交工单联系和风天气\n确认该数据的开通方式',
    retryable: false,
    soft: false,
    reauth: false,
  },

  // ---------- 404 / 405 ----------
  {
    code: '404',
    type: 'not-found',
    title: 'Not Found',
    kind: 'api',
    message: '接口地址不存在',
    advice: '请检查 API Host\n和接口路径是否正确',
    retryable: false,
    soft: false,
    reauth: true,
  },
  {
    code: '405',
    type: 'method-not-allowed',
    title: 'Method Not Allowed',
    kind: 'api',
    message: '请求方法不被允许',
    advice: '该接口只支持 GET 请求',
    retryable: false,
    soft: false,
    reauth: false,
  },

  // ---------- 429 请求过多 ----------
  {
    code: '429',
    type: 'too-many-requests',
    title: 'Too Many Requests',
    kind: 'rate',
    message: '请求过于频繁，被限流',
    advice: '请稍后重试（建议指数退避）\n持续触发可能导致账号被冻结',
    retryable: true,
    soft: true,
    reauth: false,
  },
  {
    code: '429',
    type: 'over-monthly-limit',
    title: 'Over Monthly Limit',
    kind: 'quota',
    message: '本月请求量已超限额',
    advice: '请等额度下月重置\n或联系商务升级套餐',
    retryable: false,
    soft: true,
    reauth: true,
  },

  // ---------- 500 服务端错误 ----------
  {
    code: '500',
    type: 'unknown-error',
    title: 'Unknown Error',
    kind: 'server',
    message: '和风天气服务故障',
    advice: '请稍后重试\n若持续出现请提交工单',
    retryable: true,
    soft: true,
    reauth: false,
  },
];

/** 只有状态码、拿不到 type/title 时的兜底提示（按状态码归类） */
const STATUS_FALLBACK = {
  400: { kind: 'param', message: '请求参数有误', advice: '请检查请求参数是否正确', retryable: false, soft: false, reauth: false },
  401: { kind: 'auth', message: '身份认证失败', advice: '请检查域名与密钥是否正确', retryable: false, soft: false, reauth: true },
  // 402 是旧版接口的「余额/访问次数不足」，新版文档已并入 403，这里保留兜底
  402: { kind: 'quota', message: '额度不足或超限', advice: '请检查和风天气账户额度\n再重新请求数据', retryable: false, soft: false, reauth: true },
  403: { kind: 'permission', message: '请求被拒绝', advice: '请检查账号状态、密钥权限\n与 API Host 设置', retryable: false, soft: false, reauth: true },
  404: { kind: 'api', message: '请求的资源不存在', advice: '请检查 API Host\n与接口路径是否正确', retryable: false, soft: false, reauth: true },
  405: { kind: 'api', message: '请求方法不被允许', advice: '请检查请求方式是否为 GET', retryable: false, soft: false, reauth: false },
  429: { kind: 'rate', message: '请求过于频繁', advice: '请稍后重试\n并放慢请求频率', retryable: true, soft: true, reauth: false },
  500: { kind: 'server', message: '和风天气服务异常', advice: '请稍后重试', retryable: true, soft: true, reauth: false },
};

/** 把 error.type（可能是完整 URL）/ error.title / 自定义写法统一成「连字符小写」形式 */
const normalizeErrorKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^.*#/, '') // 取 type URL 里 # 后面的锚点
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

// 建索引：type / aliases / title 都能定位到同一条
const ERROR_BY_KEY = new Map();
for (const item of QWEATHER_ERRORS) {
  ERROR_BY_KEY.set(normalizeErrorKey(item.type), item);
  for (const alias of item.aliases || []) {
    ERROR_BY_KEY.set(normalizeErrorKey(alias), item);
  }
  ERROR_BY_KEY.set(normalizeErrorKey(item.title), item);
}

/**
 * 精确匹配一条官方错误；匹配不到返回 null。
 * @param {string|number} code HTTP 状态码
 * @param {string} key  error.type 或 error.title
 */
export const findWeatherError = (code, key) => {
  const status = String(code ?? '');
  const item = ERROR_BY_KEY.get(normalizeErrorKey(key));
  if (!item) return null;
  // 状态码对得上才算命中（避免 400 的错误配到 403 上）
  if (status && item.code !== status) return null;
  return item;
};

/**
 * 组装最终提示：
 * - message 末尾统一带上 HTTP 状态码（本来已含状态码的不重复加）
 * - advice 按 \n 拆行，拼成 lines（逐行渲染）和 tip（多行字符串）
 */
const withTip = (item) => {
  const codeText = `HTTP ${item.code}`;
  const codeLabel = item.title ? `${codeText} · ${item.title}` : codeText;
  const message =
    item.message && String(item.message).includes(String(item.code))
      ? item.message
      : `${item.message}（${codeText}）`;
  const adviceLines = String(item.advice || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const lines = [message, ...adviceLines];
  return { ...item, message, codeLabel, lines, tip: lines.join('\n') };
};

/**
 * 取某次请求错误的完整提示信息。
 * 优先用 error.type 精确匹配，其次用 error.title，最后按 HTTP 状态码兜底。
 * @param {{code?:string|number, type?:string, title?:string}} [error]
 * @returns {{code:string, type:string, title:string, kind:string, message:string,
 *           advice:string, tip:string, lines:string[], codeLabel:string,
 *           retryable:boolean, soft:boolean, reauth:boolean}}
 */
export const getWeatherErrorInfo = ({ code = '', type = '', title = '' } = {}) => {
  const status = String(code ?? '');
  const matched = findWeatherError(status, type) || findWeatherError(status, title);
  if (matched) return withTip(matched);

  const fallback = {
    kind: 'unknown',
    message: status ? `请求失败（HTTP ${status}）` : '请求失败',
    advice: '如果反复出现\n请检查域名与密钥是否正确',
    retryable: false,
    soft: false,
    reauth: false,
    ...(STATUS_FALLBACK[status] || {}),
    code: status,
  };

  return {
    type: normalizeErrorKey(type),
    title: title || '',
    ...withTip(fallback),
  };
};

/** 只要第一行（短），适合状态条 / toast 标题 */
export const getWeatherErrorMessage = (code, type = '', title = '') =>
  getWeatherErrorInfo({ code, type, title }).message;

/** 要完整多行提示，适合直接展示给用户（记得给承载元素加 white-space: pre-line） */
export const getWeatherErrorTip = (code, type = '', title = '') =>
  getWeatherErrorInfo({ code, type, title }).tip;

/** 要逐行渲染的数组（v-for） */
export const getWeatherErrorLines = (code, type = '', title = '') =>
  getWeatherErrorInfo({ code, type, title }).lines;

/**
 * 兼容旧调用：只传业务码时返回第一行短提示。
 * 新代码建议直接用 getWeatherErrorInfo / getWeatherErrorTip / getWeatherErrorLines。
 */
export const getBusinessErrorMessage = (code) => getWeatherErrorMessage(code);
