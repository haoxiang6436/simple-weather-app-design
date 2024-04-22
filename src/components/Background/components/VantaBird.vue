<template>
  <div class="BackgroundContainer">
    <div id="my-background"></div>
  </div>
</template>

<script setup>
import BIRDS from 'vanta/dist/vanta.birds.min'
import { onMounted, watch,  nextTick, defineProps } from 'vue'
const props = defineProps({
  VantaOptions: Object,
})

let vantaEffect
const initVanta = async () => {
  await nextTick()
  vantaEffect = BIRDS({
    ...props.VantaOptions
  })
}

watch(props.VantaOptions, () => {
  vantaEffect.destroy()
  vantaEffect = BIRDS({
    ...props.VantaOptions
  })
})
onMounted(() => {
  initVanta()
})
</script>

<style lang="scss" scoped>
.BackgroundContainer {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  z-index: -1;

  #my-background {
    width: 100%;
    height: 100%;
  }
}
</style>
