<template>
  <div class="BackgroundContainer" v-if="vantaEffectIsShow">
    <div id="my-background"></div>
  </div>
</template>

<script setup>
import BIRDS from 'vanta/dist/vanta.birds.min'
import { onMounted, watch ,reactive ,ref, nextTick} from 'vue'

const vantaEffectIsShow = ref(false)

const VantaOptions = reactive({
  el: "#my-background",
  mouseControls: false,
  touchControls: false,
  gyroControls: false,
  minHeight: 200.00,
  minWidth: 200.00,
  scale: 1.00,
  scaleMobile: 1.00
})

// eslint-disable-next-line no-unused-vars
let vantaEffect
const initVanta = async () => {
  await nextTick()
  if (vantaEffectIsShow.value) {
    vantaEffect = BIRDS({
      ...VantaOptions
    })
  }
}
onMounted(() => {
  initVanta()
})
watch(() => vantaEffectIsShow.value,initVanta)
watch(VantaOptions, () => {
  console.log('变化')
  vantaEffect.destroy()
  vantaEffect = BIRDS({
    ...VantaOptions
  })
})

window.wallpaperPropertyListener = {
  applyUserProperties: function (properties) {
    if (properties.backgroundinteraction) {
      VantaOptions.mouseControls = properties.backgroundinteraction.value;
      VantaOptions.touchControls = properties.backgroundinteraction.value;
    }
    if (properties.background) {
      vantaEffectIsShow.value = properties.background.value;
    }
  },
};

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
