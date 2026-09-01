<template>
  <div class="SearchLocation">
    <Transition name="modal-fade">
      <div class="SearchLocationDialog" @click="hideDialog" v-if="DialogIsShow">
        <div class="DialogContainer" @click.stop>
          <h2>选择位置</h2>
          <p class="tip" v-html="TipText">
          </p>
          <Cascader :options="CityList" value-key="label" v-model="SelectCityData" expand-trigger="hover"
            :style="{ width: '320px' }" placeholder="选择一个地点以获取天气信息" size="large" @change="handleChange" />
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { nextTick, ref, onMounted } from 'vue'
import { lookupCity } from '@/api/weather';
import { useWeatherStore, useWallpaperOptionsStore } from '@/store';
import CityList from '@/data/CityList';
import { Cascader } from '@arco-design/web-vue';
import { useStorage } from '@vueuse/core';
const wallpaperOptionsStore = useWallpaperOptionsStore();
const WeatherStore = useWeatherStore()
const DialogIsShow = ref(false)
const SelectCityData = useStorage('SelectCityData',)
const TipText = ref('选择一个地点以获取天气信息');
const getCityData = async (adcode) => {
  try {
    // 获取城市数据
    const res = await lookupCity(adcode)
    if (res.location.length === 0) {
      return
    }
    await WeatherStore.getLocationInformation({
      city: res.location[0],
      isSearch: true
    })
  }
  catch (error) {
    console.error(error);
  }
}
const showDialog = async () => {
  if (wallpaperOptionsStore.WallpaperOptions.TheFirstTime) {
    TipText.value = '#之后可以通过点击卡片左上角地址文本的进行更新定位<br/>#点击空白处可关闭此弹窗'
    wallpaperOptionsStore.WallpaperOptions.TheFirstTime = false
  } else {
    TipText.value = '#选择一个地点以获取天气信息<br/>#点击空白处可关闭此弹窗'
  }
  // 获取城市数据
  DialogIsShow.value = true
  await nextTick()
}
const handleChange = () => {
  getCityData(SelectCityData.value)
  hideDialog()

}
const hideDialog = () => {
  DialogIsShow.value = false
  // wallpaperOptionsStore.WallpaperOptions.TheFirstTime = false
}
// const handleClickSuccess = () => {
//   // if (!wallpaperOptionsStore.WallpaperOptions.TheFirstTime) return
//   Modal.success({
//     title: '',
//     content: '经反馈测试,现IP定位接口存在异常，已作移除处理，点击地址进行手动定位',
//     onClose: () => {
//       wallpaperOptionsStore.WallpaperOptions.TheFirstTime = false
//     },
//   });
// }
onMounted(() => {
  // handleClickSuccess()
})
// eslint-disable-next-line no-undef
defineExpose({
  showDialog
})
</script>

<style lang="scss" scoped>
.SearchLocationDialog {
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.3);
  position: fixed;
  top: 0;
  left: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  align-items: center;
  backdrop-filter: blur(10px);

  .DialogContainer {
    width: fit-content;
    max-height: 60vh;
    height: fit-content;
    background: rgba(18, 30, 52, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 22px;
    padding: 32px;
    box-sizing: border-box;
    color: var(--text-primary);
    box-shadow: 0 28px 70px -28px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.06);

    h2 {
      color: var(--text-primary);
      margin: 0 0 10px;
    }

    .tip {
      margin: 0 0 18px;
      color: var(--text-secondary);
      font-weight: 500;
      font-size: 13px;
      line-height: 1.6;
    }

    .SearchResults {
      margin: 15px 0;

      .SearchResItem {
        display: inline-block;
        font-size: .6em;
        background-color: rgb(220, 220, 220);
        padding: 5px 10px;
        margin: 5px;
        border-radius: 5px;
        cursor: pointer;

        // transition: all 0.2s ease-in-out;
        &:hover {
          background-color: rgb(230, 230, 230);
        }
      }
    }
  }
}
</style>

<style lang="scss">
.SearchLocationDialog {
  .DialogContainer {
    h2 {
      font-size: 30px;
      line-height: 1em;
    }

    .SearchResults {
      .SearchResItem {
        &:hover {
          background-color: rgb(121, 121, 121);
        }
      }
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

.modal-fade-enter-active .DialogContainer {
  animation: modal-in 0.3s ease-out;
}

.modal-fade-leave-active .DialogContainer {
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
