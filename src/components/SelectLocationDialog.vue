<template>
  <div class="SearchLocation">
    <Transition name="modal-fade">
      <div class="SearchLocationDialog" @click="hideDialog" v-if="DialogIsShow">
        <div class="DialogContainer" @click.stop>
          <h2>选择位置</h2>
          <p style="color: #666; font-weight: bolder; transform: translateY(-10px); font-size: 12px;" v-html="TipText">
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
import { getCityLatitudeAndLatitudeAPI } from '@/apis/getWeatherAPI';
import { useWeatherStore, useWallpaperOptionsStore } from '@/store';
import CityList from '@/assets/CityList.js';
import { Cascader } from '@arco-design/web-vue';
import { UpdataUserSystemInfo } from '@/utils/tools';
import { useStorage } from '@vueuse/core';
const wallpaperOptionsStore = useWallpaperOptionsStore();
const WeatherStore = useWeatherStore()
const DialogIsShow = ref(false)
const SelectCityData = useStorage('SelectCityData',)
const LoadingIsShow = ref(true)
const TipText = ref('选择一个地点以获取天气信息');
const getCityData = async (adcode) => {
  try {
    // 获取城市数据
    const res = await getCityLatitudeAndLatitudeAPI(adcode)
    if (res.location.length === 0) {
      return
    }
    WeatherStore.getLocationInformation({
      city: res.location[0],
      isSearch: true
    })
    UpdataUserSystemInfo(res)
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
  if (wallpaperOptionsStore.UseIpAutoTargeting) return
  // 获取城市数据
  DialogIsShow.value = true
  await nextTick()
}
const handleChange = () => {
  getCityData(SelectCityData.value)
  hideDialog()
  LoadingIsShow.value = false

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
    background-color: rgb(255, 255, 255);
    border-radius: 10px;
    padding: 30px;
    box-sizing: border-box;

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