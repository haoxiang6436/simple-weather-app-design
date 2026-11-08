<template>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path v-if="type === 'snow'"
      d="M12 2v20M3.34 7l17.32 10M3.34 17L20.66 7M9 4l3 3 3-3M9 20l3-3 3 3M3.5 10.5l4.1-1.1-1.1-4.1M17.5 18.7l-1.1-4.1 4.1-1.1M3.5 13.5l4.1 1.1-1.1 4.1M17.5 5.3l-1.1 4.1 4.1 1.1"
      fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
    <g v-else-if="type === 'mixed'">
      <path d="M7 3c2.8 3.5 4 5.7 4 7.6a4 4 0 0 1-8 0C3 8.7 4.2 6.5 7 3z" fill="currentColor"></path>
      <path d="M17 10v12m-5.2-9 10.4 6m-10.4 0 10.4-6m-7.2-2 2 2 2-2m-4 10 2-2 2 2"
        fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path>
    </g>
    <path v-else-if="type === 'rain'"
      d="M12 3.1c3.35 4.27 4.85 6.87 4.85 9.3a4.85 4.85 0 0 1-9.7 0c0-2.43 1.5-5.03 4.85-9.3z"
      fill="currentColor"></path>
    <path v-else d="M7 18a5 5 0 0 1-.5-10A6 6 0 0 1 18 9.5 4.3 4.3 0 1 1 18 18H7z"
      fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
</template>

<script setup>
import { defineProps } from 'vue'

defineProps({ type: { type: String, default: null } })
</script>
