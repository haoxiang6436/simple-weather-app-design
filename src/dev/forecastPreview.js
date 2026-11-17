import { createApp, h, ref } from 'vue'
import '@/style/index.scss'
import 'qweather-icons/font/qweather-icons.css'
import ForecastStrip from '@/features/weather/ForecastStrip.vue'

// 与 store 里 get7DayForecast 归一化后的字段保持一致
const DAYS = [
  { fxDate: '今天', tempMax: 20, tempMin: 7, iconDay: '104', textDay: '阴' },
  { fxDate: '明天', tempMax: 22, tempMin: 12, iconDay: '103', textDay: '晴间多云' },
  { fxDate: '周五', tempMax: 23, tempMin: 17, iconDay: '305', textDay: '小雨' },
  { fxDate: '周六', tempMax: 22, tempMin: 17, iconDay: '305', textDay: '小雨' },
  { fxDate: '周日', tempMax: 24, tempMin: 15, iconDay: '100', textDay: '晴' },
  { fxDate: '周一', tempMax: 21, tempMin: 14, iconDay: '101', textDay: '多云' },
  { fxDate: '周二', tempMax: 20, tempMin: 13, iconDay: '305', textDay: '小雨' },
]

// 极端数据用来看边界：温差很小的连阴天 / 跨零度 / 缺一天
const SCENARIOS = {
  flat: [
    { fxDate: '今天', tempMax: 12, tempMin: 11, iconDay: '104', textDay: '阴' },
    { fxDate: '明天', tempMax: 13, tempMin: 11, iconDay: '104', textDay: '阴' },
    { fxDate: '周五', tempMax: 13, tempMin: 12, iconDay: '104', textDay: '阴' },
    { fxDate: '周六', tempMax: 14, tempMin: 12, iconDay: '101', textDay: '多云' },
    { fxDate: '周日', tempMax: 14, tempMin: 12, iconDay: '101', textDay: '多云' },
    { fxDate: '周一', tempMax: 13, tempMin: 11, iconDay: '104', textDay: '阴' },
    { fxDate: '周二', tempMax: 12, tempMin: 10, iconDay: '104', textDay: '阴' },
  ],
  winter: [
    { fxDate: '今天', tempMax: 2, tempMin: -6, iconDay: '100', textDay: '晴' },
    { fxDate: '明天', tempMax: 0, tempMin: -8, iconDay: '101', textDay: '多云' },
    { fxDate: '周五', tempMax: -3, tempMin: -11, iconDay: '400', textDay: '小雪' },
    { fxDate: '周六', tempMax: -1, tempMin: -9, iconDay: '101', textDay: '多云' },
    { fxDate: '周日', tempMax: 1, tempMin: -7, iconDay: '100', textDay: '晴' },
    { fxDate: '周一', tempMax: 3, tempMin: -5, iconDay: '100', textDay: '晴' },
    { fxDate: '周二', tempMax: 4, tempMin: -4, iconDay: '101', textDay: '多云' },
  ],
  // 接口只返回 4 天时 store 的补位结果：前 4 天是真实数据，后 3 天是「—」占位。
  // 用来确认补位之后既不会变成 4 根宽柱子，也不会画出一段假曲线。
  short: [
    { fxDate: '今天', tempMax: 12, tempMin: 7, iconDay: '305', textDay: '中雨' },
    { fxDate: '明天', tempMax: 17, tempMin: 9, iconDay: '305', textDay: '中雨' },
    { fxDate: '周五', tempMax: 17, tempMin: 9, iconDay: '305', textDay: '中雨' },
    { fxDate: '周六', tempMax: 20, tempMin: 8, iconDay: '100', textDay: '晴' },
    { fxDate: '周日', tempMax: null, tempMin: null, iconDay: null, textDay: '' },
    { fxDate: '周一', tempMax: null, tempMin: null, iconDay: null, textDay: '' },
    { fxDate: '周二', tempMax: null, tempMin: null, iconDay: null, textDay: '' },
  ],
}

const params = new URLSearchParams(window.location.search)
// 用 ref：?swap=1 时在 900ms 后换一组温度，检查「数据变更」也走一次进场动画
const days = ref(SCENARIOS[params.get('scenario')] || DAYS)
if (params.get('swap')) {
  setTimeout(() => { days.value = SCENARIOS.flat }, Number(params.get('swap')) || 900)
}
const initialDay = params.get('day') || days.value[0].fxDate
// 属性面板里的「预报天数」：只显示前 n 天（5 / 6 / 7），数据本身仍然是 7 天
const visibleCount = Number(params.get('n')) || days.value.length
// 主题用 query 切换，预览页不必再复制一套 token
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme')
// 列卡底色 / 列间距：只在这张对比页里当开关用，正式页面走组件默认值
if (params.get('tiles')) document.documentElement.style.setProperty('--fc-tile-bg-override', 'var(--glass-bg-subtle)')
if (params.get('gap')) document.documentElement.style.setProperty('--fc-gap-override', params.get('gap'))
// 对比「色带 / 只要两条线」：色带铺在卡片上会压掉卡片材质
// 静态截图里没有鼠标，用 ?hover=2 强制第 n 列停在 hover 态，检查「选中 + hover」两张卡是否真的分开
if (params.get('hover')) {
  const style = document.createElement('style')
  style.textContent = `.forecast-list li:nth-child(${Number(params.get('hover'))}) .forecast-item{background:var(--glass-bg-soft)}`
  document.head.appendChild(style)
}
if (params.get('ribbon') === '0') {
  const style = document.createElement('style')
  style.textContent = '.forecast-ribbon{display:none}'
  document.head.appendChild(style)
}

const Preview = {
  setup() {
    const activeDate = ref(initialDay)
    return () => h('div', { class: 'preview-details' }, [
      h('div', { class: 'preview-eyebrow' }, [
        '日出 ', h('b', '06:14'), h('span', { class: 'preview-sep' }), '日落 ', h('b', '17:03'),
      ]),
      h(ForecastStrip, {
        days: days.value.slice(0, visibleCount),
        activeDate: activeDate.value,
        onSelect: (date) => { activeDate.value = date },
      }),
    ])
  },
}

createApp(Preview).mount('#app')
