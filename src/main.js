import { createApp } from 'vue'
import '@/style/index.scss'
import pinia from '@/store';
import App from './App.vue'

const vueApp = createApp(App)

vueApp.use(pinia)

vueApp.mount('#app')
