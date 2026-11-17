/**
 * AQI 弹层「三版配色」对比板的独立入口（只供开发时用，不进 dist）。
 *
 * 启动：npm run preview:air   →   http://127.0.0.1:8084/dev/air-quality.html
 * 参数：?theme=mist 浅色主题 / ?view=one 1 : 1 单列 / ?data=stress 中度污染长文案
 *       / ?full=tinted 直接开某一版的全屏弹层
 *
 * 这里只负责起应用；页面顶端那颗真胶囊要读的 store.AirQuality 由对比板自己同步
 *（切数据档位时胶囊的等级用词也要跟着变，见 AirQualityPreview.vue）。
 */
import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import '@/style/index.scss'
import 'qweather-icons/font/qweather-icons.css'
import AirQualityPreview from './AirQualityPreview.vue'
import { useWeatherStore } from '@/store/index'
import { applyColorTheme } from '@/features/wallpaper/properties'

setActivePinia(createPinia())
// 先把 store 建出来（对比板里的胶囊会直接用）
useWeatherStore()
const query = new URLSearchParams(window.location.search)

const theme = query.get('theme') === 'mist' ? 'mist' : 'night'
applyColorTheme(theme)
document.title = '空气质量弹层 · 三版配色'

createApp(AirQualityPreview).mount('#app')
