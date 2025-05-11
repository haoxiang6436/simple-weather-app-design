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
    <SelectLocationDialog ref="SearchLocationDialogRef" />
</template>

<script setup>
import { ref ,} from 'vue'
import {  Button } from '@arco-design/web-vue'
import { IconInfoCircleFill, IconArrowRight } from '@arco-design/web-vue/es/icon'
import SelectLocationDialog from './SelectLocationDialog.vue'
import { onMounted } from 'vue'
import {  useWallpaperOptionsStore } from '@/store';
const visible = ref(false)
const SearchLocationDialogRef = ref(null)
const wallpaperOptionsStore = useWallpaperOptionsStore();

const handleClose = () => {
  visible.value = false
  SearchLocationDialogRef.value.showDialog()
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
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  backdrop-filter: blur(8px);
  .WelcomeModal-Content {
    width: 90%;
    max-width: 500px;
    background-color: var(--color-bg-2);
    border-radius: 16px;
    padding: 24px;
    box-sizing: border-box;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    .WelcomeModal-Content-Title {
      font-size: 20px;
      margin-bottom: 16px;
      font-weight: 600;
      color: var(--color-text-1);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;

      .icon {
        color: rgb(var(--primary-6));
      }
    }

    .WelcomeModal-Content-Text {
      font-size: 14px;
      margin-bottom: 12px;
      color: var(--color-text-2);
      line-height: 1.6;
    }

    .github-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: rgb(var(--primary-6));
      text-decoration: none;
      margin: 12px 0;

      &:hover {
        color: rgb(var(--primary-7));
        text-decoration: underline;
      }
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