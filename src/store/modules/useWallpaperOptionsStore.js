import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useWallpaperOptionsStore = defineStore('WallpaperOptions', () => {
  const WallpaperOptions = ref({
    TheFirstTime: true,
  })
  return {
    WallpaperOptions
  }
}, {
  persist: {
    key: 'WallpaperOptions-2026-9.1'
  },
})
