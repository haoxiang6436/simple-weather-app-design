<template>
  <div class="stage" :style="stageStyle">
    <transition name="Dialog" mode="out-in">
      <SettingsDialog v-if="!closed" :start="start" @close="closed = true" />
      <div v-else class="stage-note">
        <p class="stage-text">设置弹窗已关闭。这一页只是预览壳 —— 真壁纸里「返回天气」会回到天气卡，
          「在地图上查看」会打开地址页。</p>
        <button class="stage-btn" type="button" @click="closed = false">重新打开设置弹窗</button>
      </div>
    </transition>
  </div>
</template>

<script setup>
/* 设置弹窗的预览壳（只供开发时用，不进 dist）
 *
 * 弹窗本体是正式组件（features/onboarding/SettingsDialog.vue），这里只负责给它一张壁纸
 * 当背景 —— 玻璃面板得有东西可以「透」，否则看不出材质。
 * 关掉以后留一个「重新打开」，不然点一下整页就空了。
 *
 * 假数据不在这里：真壁纸里要先配好域名与密钥才进得到设置页，所以预览入口
 * （src/dev/settingsDialogPreview.js）会先塞一份假凭据。 */
import backdrop from '@/assets/dock-1365387_1920.jpg'
import { ref } from 'vue'
import SettingsDialog from '@/features/onboarding/SettingsDialog.vue'

const query = new URLSearchParams(window.location.search)
// ?start=connection：一进来就停在某一页（概览 / 连接与密钥 / 统计 / 外观与背景 / 关于）
const start = query.get('start') || 'overview'

const closed = ref(false)
const stageStyle = { backgroundImage: `url(${backdrop})` }
</script>

<style lang="scss" scoped>
.stage {
  min-height: 100vh;
  background-position: center;
  background-size: cover;
}

.stage-note {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.875rem;
  padding: 2rem;
  text-align: center;
}

.stage-text {
  max-width: 34ch;
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.7;
  color: var(--text-muted);
}

.stage-btn {
  padding: 0.5rem 1rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease;

  &:hover {
    color: var(--text-primary);
    background: var(--glass-border);
    border-color: var(--glass-border-strong);
  }
}
</style>
