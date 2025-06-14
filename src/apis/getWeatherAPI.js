// 导入request函数，用于发送请求
import request from '@/utils/request'
import { getServerHost } from '@/utils/tools'
// import axios from 'axios'
// const getServerHost = () => {
//   const hostList = process.env.VUE_APP_HOSTS.split(',')
//   return hostList[1]
// }


// 导出一个函数，用于获取城市纬度和经度信息
export const getCityLatitudeAndLatitudeAPI = (adcode) => {

  // 发送请求，获取城市纬度和经度信息
  return request({
    url: `https://${getServerHost()}/geo/v2/city/lookup`,
    params: {
      location: adcode,
    }
  })
}

// 导出一个函数，用于获取未来7天的天气信息
export const get_7DaysOfWeatherAPI = (adcode) => {
  // 发送请求，获取未来7天的天气信息
  return request({
    url: `https://${getServerHost()}/v7/weather/7d`,
    params: {
      location: adcode,
    }
  })
}
// 导出一个函数，用于获取实时天气信息
export const getRealTimeWeatherAPI = (adcode) => {
  // 发送请求，获取实时天气信息
  return request({
    url: `https://${getServerHost()}/v7/weather/now`,
    params: {
      location: adcode,
    }
  })
}
// 导出一个函数，用于获取天气预警信息
export const getWeatherEarlyWarningAPI = (adcode) => {
  // 发送请求，获取天气预警信息
  return request({
    url: `https://${getServerHost()}/v7/warning/now`,
    params: {
      location: adcode
    }
  })
}