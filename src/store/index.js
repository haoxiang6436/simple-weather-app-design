import {createPinia} from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

const pinia = createPinia()

pinia.use(piniaPluginPersistedstate)

export *  from './modules/useWeatherStore.js'

export default pinia