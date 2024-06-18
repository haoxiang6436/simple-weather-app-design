import axios from 'axios';
import { useWeatherStore } from '@/store';


// 创建一个axios实例
const instance = axios.create({
  // 设置默认的请求配置
  timeout: 5000, // 设置请求超时时间
  defaults: {
    // 设置默认的请求头
    headers: {
      'Content-Type': 'application/json',
    },
  },
});

// 设置请求拦截器
instance.interceptors.request.use(
  (config) => {
    // 在发送请求之前做些什么
    config.params = {
      ...config.params,
      key: '029b583cfbcb40b38c93eb408b298d4d', // 设置你的API密钥
    }
    return config;
  },
  (error) => {
    // 对请求错误做些什么
    return Promise.reject(error);
  }
);

// 设置响应拦截器
instance.interceptors.response.use(
  (response) => {
    // 对响应数据做点什么
    if (response.status >= 200 && response.status <= 300) {
      const data = response.data;
      if (data.code !== '200' && response.config.url !== "https://api.qjqq.cn/api/Local") {
        switch (data.code) {
          case '200':
            // 请求成功
            break;
          case '204':
            // 请求成功，但你查询的地区暂时没有你需要的数据。
            break;
          case '400':
            // 请求错误，可能包含错误的请求参数或缺少必选的请求参数。
            break;
          case '401':
            // 认证失败，可能使用了错误的KEY、数字签名错误、KEY的类型错误（如使用SDK的KEY去访问Web API）。
            break;
          case '402':
            // 超过访问次数或余额不足以支持继续访问服务，你可以充值、升级访问量或等待访问量重置。
            break;
          case '403':
            // 无访问权限，可能是绑定的PackageName、BundleID、域名IP地址不一致，或者是需要额外付费的数据。
            break;
          case '404':
            // 查询的数据或地区不存在。
            break;
          case '429':
            // 请求的接口不存在。
            break;
          case '500':
            // 请求的接口不存在。
            break;
          default:
            // 接口服务异常请联系我们
            break;
        }
        return Promise.reject(new Error(data.code))
      }
      return data;
    }
    return Promise.reject(response);
  },
  (error) => {
    // 对响应错误做点什么
    console.log('网络错误');
    const WeatherStore = useWeatherStore()
    WeatherStore.ReviseState(400)
    
    return Promise.reject(error);
  }
);

export default instance;