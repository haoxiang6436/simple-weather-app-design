<template>
  <button class="status-chip early-chip" type="button"
    :class="warning.status === 'cancel' ? 'is-cancelled' : 'sev-' + severityKey(warning.level)"
    @click="$emit('open', warning.id)">
    <Transition name="chip-fade" mode="out-in">
      <span :key="warning.id" class="early-chip-main">
        <i class="early-chip-icon" :class="`qi-${warning.icon || '100'}`" aria-hidden="true"></i>
        <span class="early-chip-text">{{ warning.typeName }}{{ warning.level }}预警</span>
        <time v-if="issuedAgo" class="early-chip-time" :datetime="warning.pubTime" :title="warning.pubTime">{{ issuedAgo }}</time>
      </span>
    </Transition>
    <span v-if="count > 1" class="early-count">×{{ count }}</span>
  </button>
</template>

<script setup>
import { computed, defineProps, defineEmits, watch } from 'vue'
import { useWarningClock } from './useWarningClock'
import { warningAgeLabel } from './warnings'

const props = defineProps({ warning: { type: Object, required: true }, count: { type: Number, default: 1 } })
defineEmits(['open'])
const currentTime = useWarningClock()
watch(() => props.warning.pubTime, () => { currentTime.value = Date.now() })
const issuedAgo = computed(() => warningAgeLabel(props.warning, currentTime.value))
const severityKey = (level = '') => {
  if (level.includes('红')) return 'red'
  if (level.includes('橙')) return 'orange'
  if (level.includes('黄')) return 'yellow'
  return 'blue'
}
</script>

<style scoped>
.early-chip-icon { width: var(--chip-icon-size); height: var(--chip-icon-size); flex: none; font-size: var(--chip-icon-size); line-height: 1; }
.early-chip-main { display: inline-flex; align-items: center; gap: var(--chip-gap); flex-wrap: wrap; min-width: 0; }
.early-chip-text { overflow-wrap: anywhere; }
.early-chip-time { flex: none; font-size: 0.8em; font-weight: 400; line-height: 1.4; white-space: nowrap; opacity: 0.8; }
.early-count { display: inline-flex; flex: none; align-items: center; justify-content: center; min-width: 1.5em; height: 1.5em; padding: 0 0.35em; font-size: 0.72em; font-weight: 700; line-height: 1; color: var(--chip-text); background: var(--glass-bg-soft); border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 999px; }
.early-chip.is-cancelled { --chip-bg: var(--glass-bg-soft); --chip-border: 1px solid var(--text-muted); --chip-text: var(--text-secondary); --chip-icon: var(--text-secondary); }
</style>
