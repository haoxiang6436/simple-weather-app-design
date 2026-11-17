<template>
  <div class="SolidBackground" :style="inlineStyle" aria-hidden="true"></div>
</template>

<script setup>
import { computed } from 'vue'
import { BackgroundColor } from '@/features/wallpaper/properties'
import { wallpaperColorToCss } from './backgroundColors'

// eslint-disable-next-line no-undef
const props = defineProps({
  // true = 「纯色（跟随配色）」：底色直接用面板主题的 --color-bg，切主题就跟着变；
  // false = 「自定义纯色」：用属性面板里取色器挑的 backgroundcolor。
  useThemeColor: { type: Boolean, default: false },
})

const inlineStyle = computed(() => (
  props.useThemeColor ? null : { backgroundColor: wallpaperColorToCss(BackgroundColor.value) }
))
</script>

<style lang="scss" scoped>
.SolidBackground {
  position: fixed;
  inset: 0;
  z-index: 0;
  /* 兜底 / 跟随配色：与当前面板主题同色（夜雨玻璃 #12304d、晨雾玻璃 #b8cddd…） */
  background-color: var(--color-bg);
  /* 换色 / 换主题时柔和过渡，不要闪一下 */
  transition: background-color 0.35s var(--ease);
}
</style>
