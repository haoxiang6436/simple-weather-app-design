<template>
  <main class="WarningPreview">
    <h1>预警时间预览</h1>
    <p>使用假数据查看按钮末尾的相对发布时间。点击入口查看详情弹窗。</p>
    <nav aria-label="预警场景">
      <button v-for="scenario in scenarios" :key="scenario.key" type="button"
        :aria-pressed="selected === scenario.key" @click="selectScenario(scenario)">{{ scenario.label }}</button>
      <button type="button" @click="toggleTheme">切换深浅配色</button>
    </nav>
    <section class="WarningPreviewEntry" aria-label="天气卡预警入口">
      <WeatherWarningChip :warning="weatherStore.WeatherEarlyWarning[0]" :count="weatherStore.WeatherEarlyWarning.length"
        @open="weatherStore.openWarningDetails" />
    </section>
    <EarlyWarningDetails v-if="weatherStore.EarlyWarningDetailsDialog" />
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { useWeatherStore } from '@/store/index'
import { normalizeWarning } from '@/features/weather/warnings'
import WeatherWarningChip from '@/features/weather/WeatherWarningChip.vue'
import EarlyWarningDetails from '@/features/weather/EarlyWarningDetails.vue'

const weatherStore = useWeatherStore()
const selected = ref('alert')
const scenarios = [
  { key: 'alert', label: '新增 · 10分钟前', code: 'alert', age: 10 },
  { key: 'update', label: '更新 · 30分钟前', code: 'update', age: 30 },
  { key: 'old', label: '更新 · 3小时前', code: 'update', age: 180 },
  { key: 'cancel', label: '取消 · 5分钟前', code: 'cancel', age: 5 },
  { key: 'invalid', label: '时间缺失', code: 'alert', invalid: true },
  { key: 'future', label: '未来时间', code: 'alert', age: -5 },
  { key: 'long', label: '长正文与防御指南', code: 'alert', age: 23 * 60, long: true },
  { key: 'overflow', label: '超长内容滚动', code: 'alert', age: 23 * 60, long: true, repeat: 3 },
]
const longDescription = '宜春市自然资源局与宜春市气象局联合发布地质灾害气象风险蓝色预警：预计未来两天，袁州区大部、万载县大部、宜丰县大部、铜鼓县南部、奉新县南部、靖安县东部、高安市北部、上高县南部、丰城市东部等地质灾害高易发区和部分中易发区，有发生崩塌、滑坡、泥石流灾害的一定风险（蓝色预警）。'
const longInstructions = [
  '预警区内各级地质灾害应急指挥机构应根据应急预案要求，做好预警响应工作。上述地区易受强降水的地段，要加强地质灾害隐患点和山区城镇、中小学校、医院和农村建房的切坡段、重要工程设施、露天矿山、公路、铁路、水利等工程边坡地段、旅游景区高陡斜坡地段、林区与矿区的临时工棚等巡查监测与防范。',
  '各市、县要密切关注最新气象预警、山洪灾害预警及地质灾害气象风险预警信息，及时将预警信息传递给受威胁对象。',
  '发现地质灾害危险，及时做好人员撤离工作。',
  '正在进行工程建设的地段，应采取严格的防灾措施。',
]
const selectScenario = (scenario) => {
  selected.value = scenario.key
  const warning = normalizeWarning({
    id: scenario.key,
    issuedTime: scenario.invalid ? '' : new Date(Date.now() - scenario.age * 60_000).toISOString(),
    expireTime: new Date(Date.now() + 60 * 60_000).toISOString(),
    senderName: '黄岩区气象台', messageType: { code: scenario.code, supersedes: [] },
    eventType: { name: scenario.long ? '地质灾害气象风险' : '大风', code: '1006' },
    color: { code: scenario.long ? 'blue' : 'yellow' }, icon: '1006',
    description: scenario.long ? longDescription : scenario.code === 'cancel' ? '黄岩区气象台取消大风黄色预警信号。' : '黄岩区气象台发布大风黄色预警信号：预计未来24小时内将出现6级以上大风，请做好防范。',
    instruction: scenario.long ? Array(scenario.repeat || 1).fill(longInstructions).flat().join('\n') : '1. 关好门窗，加固易被风吹动的搭建物。\n2. 行人注意远离广告牌、临时搭建物。',
  })
  weatherStore.WeatherEarlyWarning = [warning, { ...warning, id: `${scenario.key}-rain`, typeName: '暴雨', icon: '1003' }]
}
const toggleTheme = () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'mist' ? '' : 'mist'
}
selectScenario(scenarios[0])
</script>

<style scoped>
.WarningPreview { min-height: 100vh; padding: 2rem; color: var(--text-primary); background: var(--color-bg); }
h1 { margin: 0; font-size: 1.5rem; }
p { max-width: 40rem; color: var(--text-secondary); }
nav { display: flex; flex-wrap: wrap; gap: 0.5rem; }
nav button { padding: 0.6rem 0.8rem; color: var(--text-primary); background: var(--glass-bg-soft); border: 1px solid var(--text-muted); border-radius: 0.5rem; }
nav button[aria-pressed='true'] { background: var(--text-primary); color: var(--color-bg); }
.WarningPreviewEntry { box-sizing: content-box; width: 15rem; padding: 2rem; margin-top: 2rem; background: var(--hero-gradient); border-radius: 1rem; }
</style>
