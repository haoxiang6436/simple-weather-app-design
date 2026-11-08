<template>
  <div class="WeatherDialog" role="presentation" @click="handleBackdropClick">
    <section ref="panel" class="WeatherDialogPanel" role="dialog" aria-modal="true" :aria-labelledby="labelledby"
      tabindex="-1" @click.stop @keydown.esc.stop.prevent="$emit('close')" @keydown.tab="handleTabKey">
      <header class="WeatherDialogHeader">
        <div class="WeatherDialogHeading">
          <slot name="title"></slot>
        </div>
        <button v-if="showClose" class="WeatherDialogClose" type="button" aria-label="关闭" @click="$emit('close')">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              d="M6 6l12 12M18 6L6 18"></path>
          </svg>
        </button>
      </header>
      <div class="WeatherDialogBody">
        <slot></slot>
      </div>
    </section>
  </div>
</template>

<script setup>
import { defineEmits, defineProps, onMounted, onBeforeUnmount, ref } from 'vue'

defineProps({
  labelledby: { type: String, required: true },
  showClose: { type: Boolean, default: true },
})
const emit = defineEmits(['close', 'backdrop-click'])
const panel = ref(null)
let previousFocus = null

onMounted(() => {
  previousFocus = document.activeElement
  panel.value?.focus({ preventScroll: true })
})

onBeforeUnmount(() => {
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
})

const handleTabKey = (event) => {
  const controls = [...panel.value.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
    .filter((element) => !element.closest('[inert]') && element.getClientRects().length)
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (!controls.length) {
    event.preventDefault()
    panel.value?.focus()
    return
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

const handleBackdropClick = (event) => {
  if (event.target === event.currentTarget) emit('backdrop-click', event)
}
</script>

<style lang="scss" scoped>
.WeatherDialog {
  box-sizing: border-box;
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background-color: var(--scrim);
  backdrop-filter: blur(1.125rem);
  -webkit-backdrop-filter: blur(1.125rem);
}

.WeatherDialog.Dialog-enter-active .WeatherDialogPanel,
.WeatherDialog.Dialog-leave-active .WeatherDialogPanel {
  transition: transform 0.48s var(--ease-enter), opacity 0.36s ease, filter 0.48s ease;
}

.WeatherDialog.Dialog-enter-from .WeatherDialogPanel {
  transform: translateY(-28px) scale(0.97);
  opacity: 0;
  filter: blur(3px);
}

.WeatherDialog.Dialog-leave-to .WeatherDialogPanel {
  transform: translateY(12px) scale(0.985);
  opacity: 0;
  filter: blur(2px);
}

.WeatherDialogPanel {
  box-sizing: border-box;
  width: min(72vw, 47.45rem, calc((100vh - 3rem) * 1.618));
  height: auto;
  aspect-ratio: 1.618 / 1;
  max-height: calc(100vh - 3rem);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--weather-dialog-bg);
  border: 1px solid var(--glass-border);
  border-radius: 1.375rem;
  corner-shape: squircle;
  box-shadow: 0 1.75rem 4.375rem -1.75rem rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(1.5rem) saturate(1.2);
  -webkit-backdrop-filter: blur(1.5rem) saturate(1.2);
}

.WeatherDialogPanel:focus { outline: none; }

.WeatherDialogHeader {
  box-sizing: border-box;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-width: 0;
  padding: 0.8rem 0.95rem 0.6rem 1rem;
  border-bottom: 1px solid var(--glass-bg-soft);
}

.WeatherDialogHeading { min-width: 0; }

.WeatherDialogClose {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  min-width: 44px;
  min-height: 44px;
  color: var(--text-secondary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 50%;
  transition: background 0.2s ease, color 0.2s ease;
  cursor: pointer;

  &:hover { background: var(--glass-border); }
  &:active { background: var(--glass-active); }
  &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
}

.WeatherDialogBody {
  box-sizing: border-box;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 560px) {
  .WeatherDialog { padding: 0.75rem; }
  .WeatherDialogPanel {
    width: min(92vw, 51.25rem, calc((100vh - 1.5rem) * 1.618));
    height: auto;
    aspect-ratio: 1.618 / 1;
    max-height: calc(100vh - 1.5rem);
    min-height: 0;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .WeatherDialogPanel { backdrop-filter: none; -webkit-backdrop-filter: none; background: var(--surface-modal); }
}

@media (prefers-reduced-motion: reduce) {
  .WeatherDialog.Dialog-enter-active .WeatherDialogPanel,
  .WeatherDialog.Dialog-leave-active .WeatherDialogPanel { transition: none; }
}
</style>
