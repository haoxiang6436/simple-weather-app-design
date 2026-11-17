<template>
  <div class="CustomBackground">
    <img
      v-if="imageUrl && !loadFailed"
      :key="imageUrl"
      class="custom-background-image"
      :src="imageUrl"
      alt="自定义背景"
      @error="loadFailed = true"
    />
    <!-- 没选图 / 图片被移动删除时，不要留白屏；给一张和面板同一套底色的占位 -->
    <div v-else class="custom-background-fallback">
      <span class="fallback-title">{{ loadFailed ? '自定义背景加载失败' : '还没有选择自定义背景' }}</span>
      <span class="fallback-hint">
        {{ loadFailed ? '图片可能已被移动或删除，请在壁纸属性中重新选择' : '在壁纸属性 → 背景 → 自定义背景中选择一张图片' }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { CustomBackgroundUrl } from '@/features/wallpaper/customBackground'

const imageUrl = CustomBackgroundUrl
const loadFailed = ref(false)

// 换图 / 重新选同一路径后都允许浏览器再试一次
watch(imageUrl, () => {
  loadFailed.value = false
})
</script>

<style lang="scss" scoped>
.CustomBackground {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  background: var(--color-bg);
}

.custom-background-image {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.custom-background-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.375rem;
  padding: 2rem;
  background:
    radial-gradient(90% 70% at 20% 0%, var(--glass-active), transparent 60%),
    var(--color-bg);
  color: var(--text-muted);
}

.fallback-title {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.fallback-hint {
  font-size: 0.75rem;
  line-height: 1.6;
}
</style>
