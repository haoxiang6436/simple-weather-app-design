<template>
    <div class="EarlyWarningDialog" @click="EarlyWarningDetailsDialog = false">
      <div class="EarlyContainer" >
        <div class="EarlyCont"  @click.stop="">
          <div class="EarlyItem" @click.stop="" v-for="item in WeatherEarlyWarning"  :key="item.id" :style='{"--severityColor":item.severityColor?item.severityColor:"white",}'>
            <div class="title">{{ item.title }}</div>
            <div class="text">{{item.text}}</div>
            <div class="info">
              {{ DateFormat(item.pubTime) }}
              -
              {{ item.sender }}
            </div>
          </div>
        </div>
      </div>
    </div>
</template>

<script setup>
import BetterScroll from '@better-scroll/core';
import MouseWheel from '@better-scroll/mouse-wheel';
import { onMounted } from 'vue';
import { useWeatherStore } from '@/store/index';
import { storeToRefs } from 'pinia';
const weatherStore = useWeatherStore()
// eslint-disable-next-line no-unused-vars
const { EarlyWarningDetailsDialog,WeatherEarlyWarning } = storeToRefs(weatherStore)
BetterScroll.use(MouseWheel)
onMounted(() => {
  new BetterScroll('.EarlyContainer', {
    scrollY: true,
    mouseWheel: {
      speed: 20,
      invert: false,
      easeTime: 300
    }
  })
})
// eslint-disable-next-line no-unused-vars
const DateFormat = (date) => {
  const inputDate = new Date(date);
  const now = new Date();
  const diffInMilliseconds = Math.abs(now - inputDate);
  if (diffInMilliseconds < 1000 * 60) {
    return "刚刚";
  } else if (diffInMilliseconds < 1000 * 60 * 60) {
    const minutes = Math.floor(diffInMilliseconds / (1000 * 60));
    return `${minutes} 分钟前`;
  } else if (diffInMilliseconds < 1000 * 60 * 60 * 24) {
    const hours = Math.floor(diffInMilliseconds / (1000 * 60 * 60));
    return `${hours} 小时前`;
  } else {
    const days = Math.floor(diffInMilliseconds / (1000 * 60 * 60 * 24));
    return `${days} 天前`;
  }
};

</script>

<style lang="scss" scoped>
.EarlyWarningDialog {
  position: fixed;
  left: 0;
  top: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;

  // &.show {
  background-color: #33333380;
  backdrop-filter: blur(20px);

  // }
  // EarlyContainer
  // EarlyCont
  // EarlyItem
  .EarlyContainer {
    width: 40vw;
    min-height: 15vw;
    max-height: 40vw;
    // height: 100vh;
    overflow: hidden;
    display: flex;
    flex-flow: column nowrap;
    border-radius: 2vw;

    .EarlyItem {
      box-sizing: border-box;
      background-color: #ffffff20;
      color: #f0f0f0;
      min-height: 15vw;
      margin: 3vw 0vw;
      border-radius: 2vw;
      padding: 2vw;
      font-size: 1vw;
      .title {
        font-size: 1.6em;
        line-height: 1.7em;
        margin-bottom: 1vw;
        &::before{
          content: '';
          border-radius: 50%;
          width: 1vw;
          height: 1vw;
          display: inline-block;
          margin-right: 1vw;
          background-color: var(--severityColor);
        }
      }
      .info {
        font-size: 0.8em;
        margin: 1vw 0;
        text-align: right;
        color: #ddd;
      }
      .text {
        font-size: 1em;
        line-height: 1.5em;
        color: #ddd;
      }
    }
  }
}

</style>