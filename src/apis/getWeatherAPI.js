import request from '@/utils/request';

export const getGeographicalLocationAPI = () => {
  return request("https://api.qjqq.cn/api/Local")
}

export const getCityLatitudeAndLatitudeAPI = (adcode) => {
  return request({
    url: 'https://geoapi.qweather.com/v2/city/lookup',
    params: {
      location: adcode,
      // key: '55926e800bcb4e4abd0e81e1e25f5165'
    }
  })
}

export const get_7DaysOfWeatherAPI = (adcode) => {
  return request({
    url: 'https://devapi.qweather.com/v7/weather/7d',
    params: {
      location: adcode,
    }
  })
}
export const getRealTimeWeatherAPI = (adcode) => {
  return request({
    url: 'https://devapi.qweather.com/v7/weather/now',
    params: {
      location: adcode,
    }
  })
}