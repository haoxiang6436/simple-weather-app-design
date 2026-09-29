<template>
  <div class="panel-view LocationPicker">
    <header class="lp-head">
      <div class="lp-head-text">
        <h2 class="lp-title">{{ dismissable ? '选择位置' : '第 2 步 · 选择你所在的位置' }}</h2>
        <p class="lp-sub">天气数据按你选择的城市展示；之后点天气卡左上角的地址可以随时更换</p>
      </div>
      <button v-if="dismissable" class="lp-back" type="button" @click="emit('close')">返回天气</button>
    </header>

    <div class="lp-chips">
      <div class="lp-chip-row">
        <span class="lp-chip-label">热门</span>
        <button v-for="city in HOT_CITIES" :key="city.label" class="lp-chip" type="button"
          :disabled="submitting" @click="applyIds(city.path)">{{ city.label }}</button>
      </div>
      <div v-if="history.length" class="lp-chip-row">
        <span class="lp-chip-label">最近</span>
        <button v-for="item in history" :key="item.key" class="lp-chip" type="button"
          :disabled="submitting" @click="applyIds(item.path)">{{ item.label }}</button>
        <button class="lp-chip-clear" type="button" @click="clearLocationHistory()">清空</button>
      </div>
    </div>

    <div class="lp-columns">
      <PickerColumn title="省 / 直辖市" :items="provinceItems" :active="provinceId" @select="handleProvince" />
      <PickerColumn title="市 / 区" :items="cityItems" :active="cityId" empty-text="请先选择省份"
        @select="handleCity" />
      <PickerColumn title="区 / 县" :items="districtItems" :active="districtId" empty-text="可跳过，直接点上面确认"
        @select="handleDistrict" />
    </div>

    <footer class="lp-foot">
      <span class="lp-path">{{ pathText }}</span>
      <div class="lp-foot-right">
        <span v-if="errorText" class="lp-error">{{ errorText }}</span>
        <button class="lp-confirm" type="button" :disabled="!canConfirm || submitting" @click="confirm()">
          {{ submitting ? '正在获取天气…' : confirmText }}
        </button>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import CityList from '@/data/CityList'
import { useWeatherStore } from '@/store'
import PickerColumn from './PickerColumn.vue'
import { LocationHistory, addLocationHistory, clearLocationHistory } from './useLocationHistory'
import { ChosenLocationPath, markLocationChosen } from '@/features/onboarding/onboardingState'

// eslint-disable-next-line no-undef
defineProps({
  // 引导流程里不可关闭（必须选完位置才能进天气）；日常换城市时可以返回
  dismissable: { type: Boolean, default: false },
})
// eslint-disable-next-line no-undef
const emit = defineEmits(['close', 'selected'])

// 热门城市：用 adcode 路径定位，避免中文地名直接拼进接口
const HOT_CITIES = [
  { label: '北京', path: ['110000', '110101'] },
  { label: '上海', path: ['310000', '310101'] },
  { label: '广州', path: ['440000', '440100'] },
  { label: '深圳', path: ['440000', '440300'] },
  { label: '杭州', path: ['330000', '330100'] },
  { label: '成都', path: ['510000', '510100'] },
  { label: '武汉', path: ['420000', '420100'] },
  { label: '西安', path: ['610000', '610100'] },
  { label: '重庆', path: ['500000', '500103'] },
  { label: '南京', path: ['320000', '320100'] },
]

const weatherStore = useWeatherStore()
const history = LocationHistory

// 回显上次选择的位置（省市县 adcode 路径由引导/地址页持久化）
const initialPath = (ChosenLocationPath.value || [])
  .map((node) => findNode(node.value))
  .filter(Boolean)
const selectedPath = ref(initialPath)
const submitting = ref(false)
const errorText = ref('')

// 用函数声明（会被提升），上面的初始路径回显会用到它
function findNode (value) {
  for (const province of CityList) {
    if (province.value === value) return province
    for (const city of province.children || []) {
      if (city.value === value) return city
      for (const district of city.children || []) {
        if (district.value === value) return district
      }
    }
  }
  return null
}

const provinceNode = computed(() => selectedPath.value[0] || null)
const cityNode = computed(() => selectedPath.value[1] || null)
const districtNode = computed(() => selectedPath.value[2] || null)

const provinceId = computed(() => provinceNode.value?.value || '')
const cityId = computed(() => cityNode.value?.value || '')
const districtId = computed(() => districtNode.value?.value || '')

const toItems = (nodes) => (nodes || []).map((node) => ({ value: node.value, label: node.label }))
const provinceItems = computed(() => toItems(CityList))
const cityItems = computed(() => toItems(provinceNode.value?.children))
const districtItems = computed(() => toItems(cityNode.value?.children))

const handleProvince = (item) => {
  const node = findNode(item.value)
  if (!node) return
  selectedPath.value = [node]
  errorText.value = ''
}

const handleCity = (item) => {
  const node = findNode(item.value)
  if (!node) return
  selectedPath.value = [provinceNode.value, node].filter(Boolean)
  errorText.value = ''
}

// 点区/县直接确认，和原来的三级下拉一致
const handleDistrict = (item) => {
  const node = findNode(item.value)
  if (!node) return
  selectedPath.value = [provinceNode.value, cityNode.value, node].filter(Boolean)
  confirm()
}

const lastNode = computed(() => selectedPath.value[selectedPath.value.length - 1] || null)
const canConfirm = computed(() => !!lastNode.value && !submitting.value)
const confirmText = computed(() =>
  lastNode.value ? `就用 ${lastNode.value.label}` : '请选择位置'
)
const pathText = computed(() =>
  selectedPath.value.length ? selectedPath.value.map((node) => node.label).join(' · ') : '请选择省 / 市 / 区'
)

const confirm = async () => {
  const target = lastNode.value
  if (!target || submitting.value) return
  submitting.value = true
  errorText.value = ''
  try {
    await weatherStore.chooseLocation(target.value)
    addLocationHistory({ label: target.label, path: selectedPath.value.map((node) => node.value) })
    markLocationChosen(selectedPath.value.map((node) => ({ value: node.value, label: node.label })))
    emit('selected', selectedPath.value.map((node) => ({ value: node.value, label: node.label })))
  } catch (error) {
    errorText.value = error?.message || '获取天气数据失败，换个城市或稍后重试'
  } finally {
    submitting.value = false
  }
}

const applyIds = async (ids) => {
  const nodes = (ids || []).map(findNode).filter(Boolean)
  if (!nodes.length) return
  selectedPath.value = nodes
  await confirm()
}
</script>

<style lang="scss" scoped>
.LocationPicker {
  display: flex;
  flex-direction: column;
  gap: 1.375rem;
  padding: 2rem;
}

.lp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.lp-title {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text-primary);
}

.lp-sub {
  margin: 0.375rem 0 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.lp-back {
  flex: none;
  padding: 0.4375rem 0.9375rem;
  font-size: 0.85rem;
  color: var(--text-primary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: background 0.2s ease;

  &:hover {
    background: var(--glass-border);
  }
}

.lp-chips {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.lp-chip-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.lp-chip-label {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.lp-chip {
  padding: 0.3125rem 0.75rem;
  font-size: 0.82rem;
  color: var(--text-secondary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;

  &:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--glass-border);
    border-color: var(--glass-border-strong);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.lp-chip-clear {
  padding: 0.3125rem 0.625rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  background: transparent;
  border: 1px dashed var(--glass-border);
  border-radius: 999px;

  &:hover {
    color: var(--text-secondary);
  }
}

.lp-columns {
  flex: 1;
  min-height: 12rem;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.875rem;
}

.lp-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.lp-path {
  min-width: 0;
  font-size: 0.88rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-foot-right {
  display: inline-flex;
  align-items: center;
  gap: 0.875rem;
}

.lp-error {
  max-width: 22rem;
  font-size: 0.82rem;
  color: #ffbab5;
}

.lp-confirm {
  flex: none;
  padding: 0.5625rem 1.25rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: #04121f;
  background: linear-gradient(135deg, #7dd3fc, #38bdf8);
  border: none;
  border-radius: 999px;
  transition: filter 0.2s ease, opacity 0.2s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}

@media (max-width: 880px) {
  .lp-columns {
    grid-template-columns: 1fr;
  }
}
</style>
