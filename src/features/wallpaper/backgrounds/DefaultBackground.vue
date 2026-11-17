<template>
  <div class="DefaultBackground">
    <img class="default-background-image" :src="background.image" alt="" aria-hidden="true" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { getBuiltinBackground } from './builtinBackgrounds';

// 内置图片背景的序号（4 湖心桥 / 6 雾夜长街 …）：图片清单与回退规则见 builtinBackgrounds.js
// eslint-disable-next-line no-undef
const props = defineProps({
  index: { type: [String, Number], default: '4' },
});

const background = computed(() => getBuiltinBackground(props.index));
</script>

<style lang="scss" scoped>
.DefaultBackground {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  background: var(--color-bg);
}

.default-background-image {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}
</style>
