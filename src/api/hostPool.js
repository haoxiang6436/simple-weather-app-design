/**
 * 多域名 / 多 Key 轮询池
 * 请求时按顺序取一个域名，并返回与该域名配对的 Key。
 * 域名与 Key 通过 VUE_APP_HOSTS / VUE_APP_KEYS 的下标一一对应。
 * 轮询下标会持久化到 localStorage，避免刷新页面后重置导致第一个域名被过度请求。
 */

import { useStorage } from '@vueuse/core';

const HOSTS = (process.env.VUE_APP_HOSTS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const KEYS = (process.env.VUE_APP_KEYS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const STORAGE_KEY = 'weather-host-round-robin-index';

// 轮询下标：刷新页面后从上次的位置继续轮，而不是重新从第一个域名开始
const roundRobinIndex = useStorage(STORAGE_KEY, 0, undefined, {
  flush: 'sync',
});

export const getNextHost = () => {
  if (HOSTS.length === 0) {
    throw new Error('未配置 VUE_APP_HOSTS');
  }
  const host = HOSTS[roundRobinIndex.value % HOSTS.length];
  roundRobinIndex.value = (roundRobinIndex.value + 1) % HOSTS.length;
  return host;
};

export const getKeyForHost = (host) => {
  const index = HOSTS.indexOf(host);
  if (index === -1) {
    throw new Error(`未在 VUE_APP_HOSTS 中找到域名：${host}`);
  }
  const key = KEYS[index];
  if (!key) {
    throw new Error(`VUE_APP_KEYS 缺少与 ${host} 配对的 Key`);
  }
  return key;
};
