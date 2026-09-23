import { createApp } from 'vue'
// 图标 svg symbol（天气预警图标等）：尽早注入，保证第一次渲染就能取到
import '@/assets/iconfont.js'
import '@/style/index.scss'
import pinia from '@/store';
import App from './App.vue'
import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import '@arco-design/web-vue/dist/arco.css';
import { setupWallpaperPropertyListener } from '@/features/wallpaper/properties'

const vueApp = createApp(App)

vueApp.use(pinia)
vueApp.use(autoAnimatePlugin)

vueApp.mount('#app')

// 接管 public/index.html 里提前注册的壁纸属性监听器：
// 官方文档说明「加载时引擎会一次性下发全部属性」，那一次事件可能早于应用启动，
// 因此这里在挂载完成后补发缓存里的属性（此时组件与 Bus 监听器都已就绪），
// 并开始接收后续的属性变更事件
setupWallpaperPropertyListener()
