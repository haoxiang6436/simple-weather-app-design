/**
 * 多域名 / 多 Key 轮询池
 * 请求时按顺序取一个域名，并返回与该域名配对的 Key。
 *
 * 数据来源已改为「用户自带的域名/密钥」（见 ./credentials.js），不再读取构建期环境变量：
 * 域名与密钥按逗号分隔、下标一一对应，逻辑与旧版 VUE_APP_HOSTS / VUE_APP_KEYS 完全一致。
 *
 * 起始下标：
 * - 首次运行（localStorage 里还没有记录）时取一个随机起点，避免长期把第一次请求压给同一个域名；
 * - 下标持久化到 localStorage，刷新页面后从上次的位置继续轮。
 */

import { useStorage } from '@vueuse/core';
import { ActiveEntries } from './credentials';

const STORAGE_KEY = 'weather-host-round-robin-index';

// 轮询下标：首次取随机起点；之后刷新页面从上次的位置继续轮
const roundRobinIndex = useStorage(
  STORAGE_KEY,
  () => Math.floor(Math.random() * 1000),
  undefined,
  {
    flush: 'sync',
  }
);

export const getNextHost = () => {
  const entries = ActiveEntries.value;
  if (entries.length === 0) {
    throw new Error('未配置和风天气 API 域名与密钥');
  }
  const index = Math.abs(Number(roundRobinIndex.value) || 0) % entries.length;
  roundRobinIndex.value = (index + 1) % entries.length;
  return entries[index].host;
};

export const getKeyForHost = (host) => {
  const entry = ActiveEntries.value.find((item) => item.host === host);
  if (!entry) {
    throw new Error(`未在已配置的域名中找到：${host}`);
  }
  if (!entry.key) {
    throw new Error(`缺少与 ${host} 配对的密钥`);
  }
  return entry.key;
};

/** 取一个「域名 + 密钥」目标（轮询） */
export const getNextTarget = () => {
  const host = getNextHost();
  return { host, key: getKeyForHost(host) };
};
