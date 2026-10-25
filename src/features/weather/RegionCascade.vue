<template>
  <!-- display: contents（见样式）：根节点不生成盒子，三列直接成为外层容器的 grid 项。
       卡片里的三列页和全屏地图上的「重选地区」卡片共用这一份结构，
       列的宽高、间距都由各自的容器决定（.lp-columns / .rpd-body） -->
  <div class="RegionCascade">
    <PickerColumn title="省 / 直辖市" :items="provinceItems" :active="provinceId"
      @select="handleProvince" />
    <PickerColumn title="市 / 区" :items="cityItems" :active="cityId" empty-text="请先选择省份"
      @select="handleCity" />
    <PickerColumn title="区 / 县" :items="districtItems" :active="districtId"
      empty-text="选到市或区县后可在地图上选点" @select="handleDistrict" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import CityList from '@/data/CityList'
import PickerColumn from './PickerColumn.vue'
import { findNode, toItems } from './regionTree'

// eslint-disable-next-line no-undef
const props = defineProps({
  // 当前路径（节点数组，最多三级）。完全受控：点击只发出「新的路径」，
  // 由外层决定是立即切换（卡片三列页）还是先攒着等确认（全屏里的重选卡片）
  path: { type: Array, default: () => [] },
})
// eslint-disable-next-line no-undef
const emit = defineEmits(['select'])

const provinceNode = computed(() => props.path[0] || null)
const cityNode = computed(() => props.path[1] || null)
const districtNode = computed(() => props.path[2] || null)

const provinceId = computed(() => provinceNode.value?.value || '')
const cityId = computed(() => cityNode.value?.value || '')
const districtId = computed(() => districtNode.value?.value || '')

const provinceItems = computed(() => toItems(CityList))
const cityItems = computed(() => toItems(provinceNode.value?.children))
const districtItems = computed(() => toItems(cityNode.value?.children))

const emitPath = (nodes, level) => emit('select', { nodes, level })

const handleProvince = (item) => {
  const node = findNode(item.value)
  if (node) emitPath([node], 'province')
}

// 直辖市（北京/上海/天津/重庆）的 CityList 是「省 → 区」两层，
// 点第二列的区县走的也是这里，所以同样要判断是不是已经选到叶子节点
const handleCity = (item) => {
  const node = findNode(item.value)
  if (!node) return
  emitPath([provinceNode.value, node].filter(Boolean), 'city')
}

const handleDistrict = (item) => {
  const node = findNode(item.value)
  if (!node) return
  emitPath([provinceNode.value, cityNode.value, node].filter(Boolean), 'district')
}
</script>

<style lang="scss" scoped>
.RegionCascade {
  display: contents;
}
</style>
