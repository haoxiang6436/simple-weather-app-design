import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

const pinia = createPinia()

pinia.use(piniaPluginPersistedstate)

// store 按功能域拆分：
// - 天气相关：src/features/weather/useWeatherStore.js
// - 壁纸选项：src/store/modules/useWallpaperOptionsStore.js
export * from '@/features/weather/useWeatherStore.js'
export * from './modules/useWallpaperOptionsStore.js'

export default pinia
