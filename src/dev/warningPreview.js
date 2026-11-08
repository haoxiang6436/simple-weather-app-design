// Isolated fixture preview; never imported by the production entry.
// node node_modules/@vue/cli-service/bin/vue-cli-service.js serve src/dev/warningPreview.js --host 127.0.0.1 --port 8082
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@/style/index.scss'
import WarningPreview from './WarningPreview.vue'

document.title = '天气预警 · 发布时间预览'
document.documentElement.style.fontSize = '16px'
createApp(WarningPreview).use(createPinia()).mount('#app')
