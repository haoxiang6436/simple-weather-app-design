<template>
  <Transition name="modal-fade">
    <div class="WelcomeModal" v-if="visible">
      <div class="WelcomeModal-Content">
        <div class="WelcomeModal-Content-Title">
          <icon-info-circle-fill class="icon" />欢迎使用
        </div>
        <div class="WelcomeModal-Content-Text">此壁纸无盈利性质，所有数据来源于网络，若有侵权请联系删除</div>
        <div class="WelcomeModal-Content-Text">如有问题请评论留言或Steam社区反馈</div>
        <div class="button-container">
          <Button type="primary" @click="handleClose">
            <template #icon><icon-arrow-right /></template>
            好的，开始选择位置
          </Button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { Button } from '@arco-design/web-vue'
import { IconInfoCircleFill, IconArrowRight } from '@arco-design/web-vue/es/icon'
import { useWallpaperOptionsStore } from '@/store';

// eslint-disable-next-line no-undef
const props = defineProps({
  openSelectLocation: {
    type: Function,
    default: null,
  },
})

const visible = ref(false)
const wallpaperOptionsStore = useWallpaperOptionsStore();

const handleClose = () => {
  visible.value = false
  props.openSelectLocation?.()
}
onMounted(() => {
  if (!wallpaperOptionsStore.WallpaperOptions.TheFirstTime) return
  visible.value = true
})
</script>

<style lang="scss" scoped>
.WelcomeModal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.32);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);

  .WelcomeModal-Content {
    width: 90%;
    max-width: 520px;
    background: rgba(18, 30, 52, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 22px;
    padding: 32px;
    box-sizing: border-box;
    text-align: center;
    box-shadow: 0 28px 70px -28px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    color: var(--text-primary);

    .WelcomeModal-Content-Title {
      font-size: 20px;
      margin-bottom: 16px;
      font-weight: 600;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;

      .icon {
        color: var(--color-primary);
      }
    }

    .WelcomeModal-Content-Text {
      font-size: 14px;
      margin-bottom: 12px;
      color: var(--text-secondary);
      line-height: 1.6;
    }

    .button-container {
      margin-top: 24px;
    }
  }
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active .WelcomeModal-Content {
  animation: modal-in 0.3s ease-out;
}

.modal-fade-leave-active .WelcomeModal-Content {
  animation: modal-out 0.3s ease-in;
}

@keyframes modal-in {
  from {
    transform: translateY(40px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes modal-out {
  from {
    transform: translateY(0);
    opacity: 1;
  }
  to {
    transform: translateY(-40px);
    opacity: 0;
  }
}
</style>
