import axios from 'axios';
import { useWeatherStore } from '@/store'

export const getSystemInfo = async () =>{
  // 1. 获取操作系统类型（增强版检测）
  const getOS = () => {
    const ua = navigator.userAgent;
    if (/Windows/.test(ua)) return 'Windows';
    if (/Macintosh/.test(ua)) return navigator.maxTouchPoints > 2 ? 'iPadOS' : 'MacOS';
    if (/Linux/.test(ua)) return 'Linux';
    if (/Android/.test(ua)) return 'Android';
    if (/iOS|iPhone|iPad|iPod/.test(ua)) return 'iOS';
    return navigator.platform || 'unknown';
  };

  // 2. 获取GPU信息（安全模式）
  const getGPUInfo = () => {
    const result = { vendor: 'unknown', renderer: 'unknown' };
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return result;

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        result.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || result.vendor;
        result.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || result.renderer;
      }
    } catch (e) {
      console.debug('GPU检测被限制');
    }
    return result;
  };

  return {
    os: getOS(),
    cpuCores: navigator.hardwareConcurrency || 0, // 返回数字类型，0表示未知
    gpu: getGPUInfo()
  };
}


export const UpdataUserSystemInfo = async () => {
  const WeatherStore = useWeatherStore()
  let visitorId = '' // 浏览器指纹
  const fpPromise = import('@/assets/fingerprintv4.js')
    .then(FingerprintJS => FingerprintJS.load()) // 加载FingerprintJS
  fpPromise.then(fp => fp.get())
    .then(result => {
      visitorId = result.visitorId
      let location =  WeatherStore.dayDateCity.CityDetail? {...WeatherStore.dayDateCity.CityDetail} : {city:WeatherStore.dayDateCity.city,location:WeatherStore.dayDateCity.location}
      getSystemInfo().then(info => {
        axios.post(process.env.VUE_APP_SERVER_HOST + 'adduser', { visitorId, SystemInfo: info, location,date:new Date().toISOString().split('T')[0],time: new Date().toTimeString().slice(0, 8)  })
      })
    })
}
// 每日检查工具函数（使用LocalStorage持久化记录）
export const shouldExecuteDaily = ()=> {
  const storageKey = 'last_execution_date';
  
  // 获取当前日期（本地时区）
  const currentDate = new Date();
  const currentDateString = currentDate.toLocaleDateString('zh-CN'); // 格式：YYYY/M/D
  
  // 获取上次执行日期
  const lastExecution = localStorage.getItem(storageKey);
  
  if (!lastExecution) {
    // 首次执行
    localStorage.setItem(storageKey, currentDateString);
    return UpdataUserSystemInfo();
  }
  
  // 日期对比
  if (currentDateString !== lastExecution) {
    localStorage.setItem(storageKey, currentDateString);
    return UpdataUserSystemInfo();
  }
  return false;
}


let roundRobinIndex = 0;
export const getServerHost = () => {
  const hostList = process.env.VUE_APP_HOSTS.split(',');
  roundRobinIndex = (roundRobinIndex + 1) % hostList.length;
  return hostList[roundRobinIndex];
}