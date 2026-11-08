// 独立开发入口：node node_modules/@vue/cli-service/bin/vue-cli-service.js serve src/dev/minutelyRainPreview.js --port 8081
// 复用真实组件与数据分析；此入口不会被 src/main.js 或正式构建引用。
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@/style/index.scss'
import MinutelyRainPreview from './MinutelyRainPreview.vue'

document.title = '分钟级降水 · 动态量程预览'
// 独立预览按常规桌面字号展示，便于在浏览器侧栏检查图表细节。
document.documentElement.style.fontSize = 'clamp(6px, 2vw, 16px)'
createApp(MinutelyRainPreview).use(createPinia()).mount('#app')
