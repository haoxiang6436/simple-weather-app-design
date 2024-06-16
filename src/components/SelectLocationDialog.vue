<template>
  <div class="SearchLocation" v-auto-animate>
    <div class="SearchLocationDialog" @click="hideDialog" v-if="DialogIsShow">
      <div class="DialogContainer" @click.stop>
        <h2>搜索位置</h2>
        <Cascader :options="CityList" value-key="label" v-model="SelectCityData" expand-trigger="hover"
          :style="{ width: '320px' }" placeholder="选择一个地点以获取天气预报。" size="large" @change="handleChange" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, onMounted } from 'vue'
import { getCityLatitudeAndLatitudeAPI } from '@/apis/getWeatherAPI';
import { useWeatherStore, useWallpaperOptionsStore } from '@/store';
import CityList from '@/assets/CityList.js';
import { Cascader, Modal } from '@arco-design/web-vue';
const wallpaperOptionsStore = useWallpaperOptionsStore();
const WeatherStore = useWeatherStore()
const DialogIsShow = ref(false)
const SelectCityData = ref()
const LoadingIsShow = ref(true)
// eslint-disable-next-line no-unused-vars
const getCityData = async (adcode) => {
  try {
    // 获取城市数据
    const res = await getCityLatitudeAndLatitudeAPI(adcode)
    console.log(res.location);
    if (res.location.length === 0) {
      return
    }
    LoadingIsShow.value = false
    WeatherStore.getLocationInformation({
      city: res.location[0],
      isSearch: true
    })
    hideDialog()
  }
  catch (error) {
    LoadingIsShow.value = false
    console.error(error);
  }
}
// eslint-disable-next-line no-unused-vars
const showDialog = async () => {
  if (wallpaperOptionsStore.UseIpAutoTargeting) return
  // 获取城市数据
  DialogIsShow.value = true
  await nextTick()
}
const handleChange = () => {
  console.log(SelectCityData.value);
  getCityData(SelectCityData.value)
}
const hideDialog = () => {
  DialogIsShow.value = false
}
const handleClickSuccess = () => {
  if (!wallpaperOptionsStore.WallpaperOptions.TheFirstTime) return
  Modal.success({
    title: '',
    content: '你好！如果遇到请求失败，请在壁纸属性页取消勾选IP定位，并点击地址切换位置即可解决。（此提示仅会出现一次）',
    onClose: ()=>{
      wallpaperOptionsStore.WallpaperOptions.TheFirstTime = false
    },
  });
}
onMounted(() => {
  handleClickSuccess()
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
    width: 36vw;
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
    .SearchResults {
      .SearchResItem {
        &:hover {
          background-color: rgb(121, 121, 121);
        }
      }
    }
  }
}
</style>