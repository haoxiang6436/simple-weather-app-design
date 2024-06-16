<template>
  <div class="SearchLocation" v-auto-animate>
    <div class="SearchLocationDialog" @click="hideDialog" v-if="DialogIsShow">
      <div class="DialogContainer" @click.stop>
        <h1>搜索位置</h1>
        <p>选择一个地点以获取天气预报。</p>
        <div class="isLoading" v-if="LoadingIsShow">
          <span>Loading...</span>
        </div>
        <div class="SearchResults" v-else v-auto-animate>
          <span v-if="CityDataList.length === 0" class="">没有找到相关城市</span>
          <span class="SearchResItem" v-for="item in CityDataList" :key="item.id" @click="searchCity(item)">{{ item.adm1 }}-{{ item.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref } from 'vue'
import { getCityLatitudeAndLatitudeAPI } from '@/apis/getWeatherAPI';
import { useWeatherStore } from '@/store';
import {useWallpaperOptionsStore} from '@/store';
const wallpaperOptionsStore = useWallpaperOptionsStore();

const WeatherStore = useWeatherStore()
const DialogIsShow = ref(false)
const CityDataList = ref([])
const LoadingIsShow = ref(true)
// const errorMsg = ref('')
// 获取城市数据
const getCityData = async (userMsg) => {
  try {
    // 获取城市数据
    const res = await getCityLatitudeAndLatitudeAPI(userMsg)
    console.log(res.location);
    if (res.location.length === 0) {
      return
    }
    CityDataList.value = res.location
    LoadingIsShow.value = false
  }
  catch (error) {
    CityDataList.value = []
    LoadingIsShow.value = false
    console.error(error);
  }
}

// eslint-disable-next-line no-unused-vars
const showDialog = async () => {
  const userMsg = prompt('输入城市')
  if (userMsg === null ) {
    return
  }
  if (userMsg === '') {
    alert('您没有输入信息')
    return
  }
  // 获取城市数据
  console.log(userMsg);
  DialogIsShow.value = true
  await nextTick()
  getCityData(userMsg)
}

const searchCity = (item) => {
  if (wallpaperOptionsStore.UseIpAutoTargeting) {
    return
  }
  WeatherStore.getLocationInformation({
    city: item,
    isSearch: true
  })
  hideDialog()
}

const hideDialog = () => {
  DialogIsShow.value = false
}

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
    width: 50vw;
    max-height: 60vh;
    height: fit-content;
    background-color: rgb(245, 245, 245);
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