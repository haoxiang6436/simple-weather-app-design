<template>
  <div ref="stageEl" class="lmp" role="img" :aria-label="ariaLabel">
    <!-- 瓦片按 1:1 像素铺：视口左上角的世界像素 - 瓦片的世界像素 = 这张图在容器里的位置。
         这里不做拖动 / 缩放的容差处理 —— 它只是一张「现在在哪儿」的缩略图，
         真要移动位置，下面的按钮会把用户送到地址页（那边才是可交互的地图）。 -->
    <img v-for="tile in tiles" :key="tile.key" class="lmp-tile" :class="{ 'is-ready': loaded.has(tile.key) }"
      :data-key="tile.key" :src="tile.src" :style="tile.style" alt="" draggable="false" @load="markLoaded(tile.key)"
      @error="markFailed(tile.key)" />

    <!-- 视口就是按这个点铺的，所以针永远在正中间 -->
    <span v-if="hasCenter && !allFailed" class="lmp-pin" aria-hidden="true"></span>

    <p v-if="!hasCenter" class="lmp-hint">{{ placeholder }}</p>
    <p v-else-if="allFailed" class="lmp-hint">底图暂时加载不出来</p>

    <p v-if="hasCenter && caption" class="lmp-caption" :title="caption">{{ caption }}</p>
    <!-- 没有地图就不署名：底图没画出来时挂一行「© 高德地图」只会让人以为图加载失败了 -->
    <span v-if="hasCenter" class="lmp-credit">{{ credit }}</span>
  </div>
</template>

<script setup>
/* 位置缩略图：只读的静态地图（设置页「概览」里那张位置卡）
 *
 * 只做一件事：把一个经纬度周围的几张瓦片拼出来，在正中间摆一根针。
 * 不引入 MapLibre / Leaflet —— 理由和 mapTiles.js 里写的一样（壁纸已有 WebGL 特效，
 * 再开一个上下文抢帧），这里更是连交互都不要，直接 <img> 拼图就够。
 *
 * 尺寸由容器决定：容器尺寸要等布局完成才知道，所以用 ResizeObserver 量完再算瓦片；
 * 量之前 tiles 是空的，容器底色先顶着，不会闪一下白框。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ACTIVE_SOURCE,
  TILE_SIZE,
  TILE_SOURCES,
  ZOOM_DEFAULT,
  tileUrl,
  viewOrigin,
} from './mapTiles'

// eslint-disable-next-line no-undef
const props = defineProps({
  /* 视口中心 [lng, lat]，地图坐标系（高德瓦片 = GCJ-02，和落库坐标一致） */
  center: { type: Array, default: null },
  zoom: { type: Number, default: ZOOM_DEFAULT },
  /* 读屏用的描述，例如「当前位置：黄岩区 新中路」 */
  label: { type: String, default: '' },
  /* 地图上的地点小标签（左下角） */
  caption: { type: String, default: '' },
  /* 没有坐标时中间那句话 */
  placeholder: { type: String, default: '还没选位置' },
  /* 底图署名 */
  credit: { type: String, default: TILE_SOURCES[ACTIVE_SOURCE].label },
})

const stageEl = ref(null)

const hasCenter = computed(() => {
  const point = props.center
  if (!Array.isArray(point) || point.length < 2) return false
  return Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
})

const ariaLabel = computed(() => (hasCenter.value
  ? `位置地图${props.label ? `：${props.label}` : ''}，${props.credit}`
  : '位置地图，尚未选择位置'))

/* ---------------- 尺寸 ---------------- */
const viewW = ref(0)
const viewH = ref(0)
let observer = null

const measure = () => {
  const el = stageEl.value
  if (!el) return
  const w = Math.round(el.clientWidth)
  const h = Math.round(el.clientHeight)
  if (w === viewW.value && h === viewH.value) return
  viewW.value = w
  viewH.value = h
}

/* ---------------- 瓦片 ---------------- */
const tiles = computed(() => {
  const width = viewW.value
  const height = viewH.value
  if (!width || !height || !hasCenter.value) return []
  const lng = Number(props.center[0])
  const lat = Number(props.center[1])
  const zoom = Math.round(props.zoom)
  const total = 2 ** zoom
  const [originX, originY] = viewOrigin([lng, lat], zoom, width, height)
  // 四边都用显式瓦片边界算，避免某一侧少铺一张（和 MapPointPicker.buildTiles 同一套算法，
  // 这里省掉了预加载外圈：缩略图不缩放，视口外那一圈永远看不到）
  const tx0 = Math.floor(originX / TILE_SIZE)
  const ty0 = Math.floor(originY / TILE_SIZE)
  const tx1 = Math.ceil((originX + width) / TILE_SIZE) - 1
  const ty1 = Math.ceil((originY + height) / TILE_SIZE) - 1
  const list = []
  for (let tx = tx0; tx <= tx1; tx += 1) {
    for (let ty = ty0; ty <= ty1; ty += 1) {
      // 纬度方向没有环绕；经度方向绕回来，跨 180° 时不会出现空列
      if (ty < 0 || ty >= total) continue
      const wrappedX = ((tx % total) + total) % total
      list.push({
        // 位置用未环绕的 tx：低级别跨 180° 时同一张图可能同时出现在两侧，用 wrappedX 会撞 key
        key: `${ACTIVE_SOURCE}/${zoom}/${tx}/${ty}`,
        src: tileUrl(ACTIVE_SOURCE, zoom, wrappedX, ty),
        style: {
          left: `${tx * TILE_SIZE - originX}px`,
          top: `${ty * TILE_SIZE - originY}px`,
        },
      })
    }
  }
  return list
})

/* 每张瓦片的加载结果按 key 记账：换位置 / 换尺寸会生成新 key，旧的自然出队。
   只用 Set 而不是响应式对象 —— 这里最多十来张图，换一份新 Set 的代价可以忽略。 */
const loaded = ref(new Set())
const failed = ref(new Set())

const markLoaded = (key) => {
  if (loaded.value.has(key)) return
  const next = new Set(loaded.value)
  next.add(key)
  loaded.value = next
}

const markFailed = (key) => {
  if (failed.value.has(key)) return
  const next = new Set(failed.value)
  next.add(key)
  failed.value = next
}

// 整屏都失败才说「加载不出来」：只坏一张时宁可留个小缺口，也别把整块换成一提示
const allFailed = computed(() => tiles.value.length > 0
  && tiles.value.every((tile) => failed.value.has(tile.key)))

watch(tiles, () => {
  loaded.value = new Set()
  failed.value = new Set()
  nextTick(sweepReady)
})

/* 兜底：浏览器把瓦片直接从缓存里拿出来时，load 事件可能早于监听器挂上，
   那样这张图会永远停在 opacity: 0（实测：同一组瓦片第二次打开时整块地图是空的，
   而 loaded / failed 都还是 0）。渲染完顺手扫一遍 img.complete，把已经解码好的补记上。 */
function sweepReady() {
  const stage = stageEl.value
  if (!stage) return
  stage.querySelectorAll('img.lmp-tile').forEach((img) => {
    const key = img.dataset.key
    if (!key || loaded.value.has(key) || failed.value.has(key) || !img.complete) return
    if (img.naturalWidth > 0) markLoaded(key)
    else markFailed(key)
  })
}

onMounted(() => {
  measure()
  nextTick(sweepReady)
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(measure)
  observer.observe(stageEl.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})
</script>

<style lang="scss" scoped>
/* 容器自己的圆角 + 裁切：瓦片是绝对定位的方图，不裁就会顶出卡片 */
.lmp {
  position: relative;
  overflow: hidden;
  min-height: 7rem;
  background: var(--surface-inset);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  isolation: isolate;
}

/* 瓦片尺寸必须和 TILE_SIZE（256）一致：这里是 <img> 的固有尺寸，用 px 而不是 rem，
   避免根字号变化时瓦片被等比缩放、接缝处露出底色 */
.lmp-tile {
  position: absolute;
  width: 256px;
  height: 256px;
  opacity: 0;
  transition: opacity 0.32s ease;
  pointer-events: none;
  user-select: none;

  &.is-ready {
    opacity: 1;
  }
}

/* 上下压一层暗角：既让底图边缘和玻璃卡片接得住，也给左下角的地点标签垫出对比 */
.lmp::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(180deg, rgba(4, 16, 28, 0.18), transparent 42%, rgba(4, 16, 28, 0.34));
  pointer-events: none;
}

/* 中心的针：一个带白圈 + 光晕的实心点。
   高德街道图本身是浅色的，浅色针在上面几乎看不见（第一版就是那样），
   所以针用主色的深一档，外面套一圈白边，深浅底图都读得出来。
   视口中心就是选中的坐标，所以不用算像素位置。 */
.lmp-pin {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  width: 0.625rem;
  height: 0.625rem;
  translate: -50% -50%;
  background: var(--color-primary-strong);
  border: 2px solid rgba(255, 255, 255, 0.92);
  border-radius: 50%;
  box-shadow:
    0 0 0 0.25rem rgba(72, 182, 229, 0.28),
    0 0.125rem 0.5rem rgba(0, 0, 0, 0.45);
  animation: lmp-pulse 2.8s ease-in-out infinite;
}

@keyframes lmp-pulse {

  0%,
  100% {
    box-shadow:
      0 0 0 0.25rem rgba(72, 182, 229, 0.28),
      0 0.125rem 0.5rem rgba(0, 0, 0, 0.45);
  }

  50% {
    box-shadow:
      0 0 0 0.4375rem rgba(72, 182, 229, 0.16),
      0 0.125rem 0.5rem rgba(0, 0, 0, 0.45);
  }
}

/* 地点标签：贴在瓦片上也照样读得清，所以自带一层玻璃底 */
.lmp-caption {
  position: absolute;
  bottom: 0.5rem;
  left: 0.5rem;
  z-index: 3;
  max-width: calc(100% - 4.5rem);
  margin: 0;
  padding: 0.1875rem 0.4375rem;
  overflow: hidden;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  text-overflow: ellipsis;
  background: rgba(5, 22, 38, 0.56);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.4375rem;
  -webkit-backdrop-filter: blur(0.375rem);
  backdrop-filter: blur(0.375rem);
}

/* 底图署名：字要小到不抢戏，高德街道图又是浅色的，白字直接浮在上面几乎看不见。
   跟地点标签一样给一层玻璃底，深浅底图都读得出来（瓦片本身要求保留署名）。 */
.lmp-credit {
  position: absolute;
  right: 0.375rem;
  bottom: 0.375rem;
  z-index: 3;
  padding: 0.0625rem 0.25rem;
  font-size: 0.58rem;
  letter-spacing: 0.01em;
  color: rgba(255, 255, 255, 0.82);
  background: rgba(5, 22, 38, 0.5);
  border-radius: 0.25rem;
  -webkit-backdrop-filter: blur(0.25rem);
  backdrop-filter: blur(0.25rem);
}

.lmp-hint {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  font-size: 0.72rem;
  color: var(--text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .lmp-pin {
    animation: none;
  }

  .lmp-tile {
    transition: none;
  }
}
</style>
