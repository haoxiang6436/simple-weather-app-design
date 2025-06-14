import { createApp } from 'vue'
import '@/style/index.scss'
import pinia from '@/store';
import App from './App.vue'
import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import '@arco-design/web-vue/dist/arco.css';

const vueApp = createApp(App)

vueApp.use(pinia)
vueApp.use(autoAnimatePlugin)

vueApp.mount('#app')