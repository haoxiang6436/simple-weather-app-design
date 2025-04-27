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