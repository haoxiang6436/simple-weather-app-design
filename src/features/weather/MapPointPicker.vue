<template>
  <div class="MapPointPicker">
    <div ref="wrapEl" class="mp-wrap"
      :class="{ 'mp-wrap--fill': fill, 'is-fs': fullscreen, 'is-tile-dark': invertTiles }">
      <!-- 打底：瓦片还没画上来的地方 = 浅色磨砂玻璃（详见 .mp-void 的说明）。
           必须垫在瓦片下面、跟着全屏裁切框一起走，不能铺在 .mp-wrap 上：
           全屏收放时 `.mp-wrap` 已经铺满整块屏幕，底色会跑到裁切框外面去 -->
      <div class="mp-void" :style="veilStyle" aria-hidden="true"></div>

      <!-- 底层：缩放前后的旧瓦片，按 2 倍或 1 倍垫在新图下面，
           新瓦片没画上来之前不会闪出底色 -->
      <div v-if="underlay" class="mp-layer" :style="underlayStyle">
        <img v-for="tile in underlayTiles" :key="'u' + tile.key" class="mp-tile"
          :class="{ 'is-inverted': invertTiles }" :src="tile.src" :style="tile.style" alt=""
          draggable="false" referrerpolicy="no-referrer" />
      </div>

      <!-- 视口 = 容器实际像素，瓦片按 256px 原样铺；缩放动画只改这一层的 transform -->
      <!-- 右键不弹系统菜单：双击右键 = 缩小（见 handleContextMenu）。
           只挂在 stage 上，胶囊按钮和右下角的版权字都不受影响 -->
      <div ref="stageEl" class="mp-stage" :class="{ 'is-dragging': dragging }"
        :style="stageStyle" @pointerdown="handlePointerDown" @dragstart.prevent
        @contextmenu="handleContextMenu">
        <img v-for="tile in tiles" :key="tile.key" class="mp-tile"
          :class="{ 'is-failed': failedKeys.has(tile.key), 'is-inverted': invertTiles }"
          :src="tile.src" :style="tile.style" :data-key="tile.key" alt="" draggable="false"
          referrerpolicy="no-referrer" @load="handleTileLoad" @error="handleTileError" />

        <div v-if="pinStyle" class="mp-pin" :style="pinStyle">
          <span class="mp-pin-ripple"></span>
          <svg class="mp-pin-icon" viewBox="0 0 24 32" aria-hidden="true">
            <path
              d="M12 1.2c-5.6 0-10.1 4.5-10.1 10.1 0 7.3 10.1 19 10.1 19s10.1-11.7 10.1-19c0-5.6-4.5-10.1-10.1-10.1z"
              fill="#38bdf8" stroke="#04121f" stroke-width="1.5" stroke-linejoin="round" />
            <circle cx="12" cy="11.3" r="3.9" fill="#04121f" />
          </svg>
        </div>
      </div>

      <!-- 瓦片整体不可用：地图区域里直接给出「用中心坐标」的出路，
           别让用户对着一张空地图反复拖拽、反复等 -->
      <div v-if="mapFailed" class="mp-fallback" role="alert">
        <div class="mp-fallback-card">
          <p class="mp-fallback-title">地图暂时加载不出来</p>
          <p class="mp-fallback-text">
            网络或地图瓦片服务暂时不可用。可以先<strong>用中心坐标</strong>继续，
            等地图恢复后再回来微调。
          </p>
          <div class="mp-fallback-actions">
            <button class="mp-btn" type="button" @click.stop="retryLoad">重试加载</button>
            <button class="mp-btn mp-btn--primary" type="button" @click.stop="useDistrictCenter">
              先用中心坐标
            </button>
          </div>
        </div>
      </div>
      <div v-else-if="loadingHintVisible && !underlay && !dragging" class="mp-hint">地图加载中…</div>
      <div v-else-if="!picked && !dragging && !isLoading" class="mp-hint mp-hint--tip">
        拖动平移 · 点击选点 · 双击放大 / 右键缩小
      </div>

      <!-- 选点后告诉用户「落在哪」。有高德 key 时是最近道路名；
           没有高德 key 时退到和风坐标反查的区县（「黄岩附近」）。
           两者都查不到（无地址数据 / 断网 / 境外无人区）就整块不出现，别在壁纸里报错 -->
      <div v-if="roadHintVisible" class="mp-road" :class="{ 'is-loading': roadLoading }"
        :title="roadTitle">
        <svg v-if="roadInfo?.road" class="mp-road-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6.5 21 10 3" />
          <path d="M17.5 21 14 3" />
          <path d="M12 6.5v2.2M12 12.2v2.2M12 17.9v2.2" />
        </svg>
        <svg v-else class="mp-road-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" />
          <circle cx="12" cy="9" r="2.6" />
        </svg>
        <span class="mp-road-name">{{ roadLoading ? '识别位置…' : roadText }}</span>
      </div>

      <div class="mp-attribution">{{ attribution }}</div>

      <!-- 缩放：44px 圆形按钮装进一枚胶囊里，壁纸场景下也比原来 28px 好点。
           全屏时多出「全国」和「退出全屏」两颗，胶囊整体靠到卡片矩形的右侧边上 -->
      <div class="mp-zoom" role="group" aria-label="地图缩放">
        <button class="mp-zoom-btn" type="button" title="放大（双击左键）" aria-label="放大"
          :disabled="zooming || fsBusy || zoom >= ZOOM_MAX" @click.stop="zoomIn">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <span class="mp-zoom-sep" aria-hidden="true"></span>
        <button class="mp-zoom-btn" type="button" title="缩小（双击右键）" aria-label="缩小"
          :disabled="zooming || fsBusy || zoom <= minZoom" @click.stop="zoomOut">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </button>
        <template v-if="fullscreen">
          <span class="mp-zoom-sep" aria-hidden="true"></span>
          <button class="mp-zoom-btn mp-zoom-btn--globe" type="button"
            :title="zoom <= ZOOM_COUNTRY ? '回到街道级' : '全国视野'" aria-label="全国视野"
            :disabled="fsBusy" @click.stop="toggleCountry">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.4" />
              <path d="M3.6 12h16.8" />
              <path d="M12 3.6c2.7 2.8 2.7 14 0 16.8M12 3.6c-2.7 2.8-2.7 14 0 16.8" />
            </svg>
          </button>
        </template>
        <span class="mp-zoom-sep" aria-hidden="true"></span>
        <button class="mp-zoom-btn" type="button" :title="fullscreen ? '退出全屏（Esc）' : '全屏看地图'"
          :aria-label="fullscreen ? '退出全屏' : '全屏'" :aria-pressed="fullscreen" :disabled="fsBusy"
          @click.stop="toggleFullscreen">
          <svg v-if="!fullscreen" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9V6.2A2.2 2.2 0 0 1 6.2 4H9" />
            <path d="M15 4h2.8A2.2 2.2 0 0 1 20 6.2V9" />
            <path d="M20 15v2.8a2.2 2.2 0 0 1-2.2 2.2H15" />
            <path d="M9 20H6.2A2.2 2.2 0 0 1 4 17.8V15" />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 4v2.8A2.2 2.2 0 0 1 6.8 9H4" />
            <path d="M20 9h-2.8A2.2 2.2 0 0 1 15 6.8V4" />
            <path d="M15 20v-2.8a2.2 2.2 0 0 1 2.2-2.2H20" />
            <path d="M4 15h2.8A2.2 2.2 0 0 1 9 17.2V20" />
          </svg>
        </button>
      </div>
    </div>

    <div v-if="bar" class="mp-bar">
      <div class="mp-coord">
        <span class="mp-coord-label">{{ picked ? '选点坐标' : '未选点' }}</span>
        <span class="mp-coord-value">{{ coordText }}</span>
        <!-- 有路名时贴在坐标后面，一眼能对上「这个点在锦川路上」；
             没高德 key 时这里是和风反查的区县（「黄岩附近」） -->
        <span v-if="roadHintVisible" class="mp-coord-road" :title="roadTitle">
          {{ roadLoading ? '识别中…' : roadText }}
        </span>
      </div>
      <div class="mp-actions">
        <button class="mp-btn" type="button" @click.stop="emit('back')">重选地区</button>
        <button class="mp-btn mp-btn--primary" type="button" @click.stop="handleConfirm">
          {{ picked ? '就用这里' : '用中心坐标' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  ACTIVE_SOURCE,
  MAX_TILE_FAILURES,
  TILE_SIZE,
  TILE_SOURCES,
  ZOOM_COUNTRY,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  gcj02ToWgs84,
  lngLatToViewPixel,
  lngLatToWorld,
  minZoomForViewport,
  tileUrl,
  viewOrigin,
  viewPixelToLngLat,
  wgs84ToGcj02,
  worldToLngLat,
} from './mapTiles'
import { isReverseGeocodeEnabled, reverseGeocode } from './reverseGeocode'
import { isPlaceLookupAvailable, joinAdminParts, lookupPlaceByCoord, nearbyLabel } from './placeLookup'
import { AmapKey } from '@/api/credentials'

// eslint-disable-next-line no-undef
const props = defineProps({
  // 初始视口中心 [lng, lat]，由调用方按区县中心传入；之后由拖拽接管
  center: { type: Array, required: true },
  zoom: { type: Number, default: ZOOM_DEFAULT },
  // 是否渲染自带的底部操作条；嵌进地址页时由外层统一放按钮
  bar: { type: Boolean, default: true },
  // 是否撑满父容器（父容器必须有确定高度）；默认按 1:1 方形
  fill: { type: Boolean, default: false },
  // 初始 pin（WGS-84）。从「最近」进来时把上次的点摆好，用户可以微调也可以直接确认
  initialPoint: { type: Object, default: null },
  // 是否处于全屏。真正的「铺满屏幕」由外层完成（整块面板 teleport 到 body），
  // 这里只负责：量尺寸、算相机、把裁切框从卡片那块展开出去
  fullscreen: { type: Boolean, default: false },
})
// eslint-disable-next-line no-undef
const emit = defineEmits([
  'pick', 'confirm', 'back', 'road', 'update:fullscreen',
  // 开始退全屏：外层要在 320ms 的收窄动画之前把悬浮块淡掉
  'fs-leaving',
])

// 拖动超过这个距离就判定为「平移」，松手不再落点
const DRAG_THRESHOLD = 4
// 缩放动画时长：再短会显得跳，再长会有拖沓感
const ZOOM_DURATION = 220
// 双击判定：WE 里的双击间隔比浏览器原生略长，容差给宽一点
const DOUBLE_CLICK_MS = 320
const DOUBLE_CLICK_SLOP = 8
// 全屏进场：把卡片里那一块展开到整屏（退场反向收回）。
// 必须和 .mp-stage 上 clip-path 的 transition 时长一致
const FS_DURATION = 320
// 退场最后要从「全屏相机」换成「刚选的点 + 街道级」，用一次极短的淡出把这一跳盖掉
const FS_FADE = 130
// 从全屏退回卡片时的落点：刚选的点 + 街道级；已经在更高级就别往回缩
const FS_CARD_ZOOM = 14

/* ---------------- 节流参数 ----------------
 * 拖动分两段，各管一件事：
 *   1) 画面用 rAF 合并（每帧最多一次），跟手；
 *   2) 瓦片列表 100ms 才提交一次，别让指针每动一下就去拼一批新瓦片 URL。
 * 中间那段位移先靠 translate3d 垫着，提交时把位移折进 center，画面不跳。
 */
const PAN_COMMIT_MS = 100
// 容器尺寸变化：面板进出场动画会连续触发 ResizeObserver，去抖后再量
const MEASURE_DEBOUNCE = 120
// 「加载中」延迟出现：几百毫秒就画完的短加载不必闪一下提示
const LOADING_HINT_DELAY = 350

const wrapEl = ref(null)
const stageEl = ref(null)

// 视口尺寸：跟容器实际像素一致，瓦片按 1:1 绘制
const viewW = ref(0)
const viewH = ref(0)

// 视口中心（地图坐标系）与「已提交」的整数缩放
const center = ref([...(props.center || [0, 0])])
const zoom = ref(props.zoom)
// 显示缩放：动画期间在 1 与 2（或 0.5）之间过渡；平时恒为 1
const k = ref(1)
// 还没折进 center 的拖动位移（屏幕像素）：先垫在 transform 上让画面跟手
const pan = ref({ x: 0, y: 0 })
// 换图后的垫底层，新瓦片全部加载后撤掉
const underlay = ref(null)
const zooming = ref(false)

/* ---------------- 全屏状态 ----------------
 * 全屏的「铺满屏幕」不在这里做：卡片外壳是 overflow:hidden + backdrop-filter，
 * 地图留在里面写 position:fixed 只会被裁在卡片里（见 LocationPicker 的 Teleport）。
 * 这里只维护和相机有关的那几件事：裁切框、进场前的屏幕矩形、上下限。
 */
// 动画在跑的时候把按钮锁住，避免连点把相机算乱
const fsBusy = ref(false)
// 换视野时只淡地图（不淡上方悬浮卡和底部操作条）
const stageFading = ref(false)
// 裁切矩形（px，相对视口）；null = 不裁
const clipInsets = ref(null)
// 进场前地图在屏幕上的矩形：退场按它收回去，也用来反算相机补偿
let entryRect = null
let entryViewport = null
// 「全国」按钮记住的街道级级别，再点一次回到这里
let zoomBeforeCountry = 0

// 只保留一个可用源：无 key 且国内可达的只有高德。
// （CARTO 的 basemaps 现在需要 API key，OSM 公共实例有使用政策，都不能当自动兜底）
const source = ACTIVE_SOURCE
// 已画出来的 / 已失败的瓦片，按 key 记账。
// 不能用「计数器」：v-for 的 key 没变时 Vue 复用同一个 <img>，拖拽/换级时
// 已经在 DOM 里的瓦片不会重新派发 load，计数器就永远减不到 0
// —— 表现就是地图早就画好了，顶上还挂着「地图加载中…」。
const loadedKeys = reactive(new Set())
const failedKeys = reactive(new Set())
// 重试计数：只用于给瓦片 URL 加一个 cache-bust 参数并换掉 v-for 的 key，
// 数字变了浏览器才会真的重新发请求（同一个 src 再赋一次通常直接读缓存/不重试）
const retryTick = ref(0)

// point = 地图坐标系（高德源时是 GCJ-02），只用来画 pin
// picked = WGS-84，对外展示与 emit 都用它
const point = ref(null)
const picked = ref(null)
const dragging = ref(false)

// 落点地名：有高德 key 时是高德逆地理编码的最近道路名；
// 没填高德 key 时用和风 GeoAPI 反查区县，只能显示「xx附近」。
// 两者都查不到时保持 null，UI 整块隐藏 —— 选点本身不依赖它
const roadInfo = ref(null)
const roadLoading = ref(false)

let dragState = null
let lastClick = { at: 0, x: 0, y: 0 }
// 右键双击的记账（contextmenu 自己数，浏览器不给右键 dblclick）
let lastRight = { at: 0, x: 0, y: 0 }
let rafId = 0
let zoomGuard = 0
let underlayTimer = 0
let panRaf = 0
let panTimer = 0
let measureTimer = 0
let measurePending = false
let hintTimer = 0
let roadTimer = 0
let roadCtrl = null
// 请求序号：连点时只有最后一次允许写回结果，旧响应晚到直接丢弃
let roadSeq = 0
// 「等这次查询落地」的等待者（确认选点时用，见 waitRoad）
let roadWaiter = null

const attribution = computed(() => TILE_SOURCES[source].label)
// OSM 之类亮色底图靠滤镜压暗，贴合壁纸的深色玻璃风格
const invertTiles = computed(() => !!TILE_SOURCES[source].invert)

// 缩放下限：卡片里固定 11（看得到路名才有意义），全屏按视口算到「整个世界正好铺满」
const minZoom = computed(() => (
  props.fullscreen ? minZoomForViewport(viewW.value) : ZOOM_MIN
))

// 屏幕坐标点必须是有限数。这条以前漏过：toViewPoint 返回 {px,py}，
// animateZoom 读的是 {x,y}，property 名对不上就直接算出 NaN 坐标
const isFinitePoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y)

/**
 * 按给定状态算瓦片列表。
 * 多铺一张（ceil + 1），保证任意偏移下都盖满视口；拖动时不会露出白边。
 */
const buildTiles = (state, width, height) => {
  if (!width || !height) return []
  // 中心点必须是有限数：一旦是 NaN，瓦片索引会算成 NaN 拼进 URL
  // （曾因 anchorPoint 的属性名写错，拼出 webrd0nan/...&x=NaN&y=NaN）
  const [clng, clat] = state.center || []
  if (!Number.isFinite(clng) || !Number.isFinite(clat)) return []
  const total = 2 ** state.zoom
  const [ox, oy] = viewOrigin(state.center, state.zoom, width, height)
  const tx0 = Math.floor(ox / TILE_SIZE)
  const ty0 = Math.floor(oy / TILE_SIZE)
  const cols = Math.ceil(width / TILE_SIZE) + 1
  const rows = Math.ceil(height / TILE_SIZE) + 1
  // 点「重试」后带一个只影响缓存的查询参数；不加的话 <img> 的 src 没变，
  // 浏览器可能直接复用失败结果 / 不重新请求
  const bust = retryTick.value ? `_r=${retryTick.value}` : ''
  const list = []
  for (let dx = 0; dx < cols; dx++) {
    for (let dy = 0; dy < rows; dy++) {
      const tx = tx0 + dx
      const ty = ty0 + dy
      // 纬度方向没有环绕，越界直接跳过
      if (ty < 0 || ty >= total) continue
      // 经度方向环绕，避免跨 180° 时出现空列
      const wx = ((tx % total) + total) % total
      const url = tileUrl(source, state.zoom, wx, ty)
      const src = bust ? `${url}${url.includes('?') ? '&' : '?'}${bust}` : url
      list.push({
        // 重试计数写进 key：Vue 会换掉旧的 <img>，重新派发 load / error
        key: `${source}/${state.zoom}/${wx}/${ty}/${retryTick.value}`,
        src,
        style: {
          left: `${tx * TILE_SIZE - ox}px`,
          top: `${ty * TILE_SIZE - oy}px`,
        },
      })
    }
  }
  return list
}

const tiles = computed(() => buildTiles(
  { zoom: zoom.value, center: center.value }, viewW.value, viewH.value
))

// 还没拿到结果的瓦片数：只统计「当前这一屏」里既没 load 也没 error 的。
// 换成按 key 记账后，复用的 <img> 不会再把计数顶上去
const pending = computed(() => tiles.value.filter(
  (tile) => !loadedKeys.has(tile.key) && !failedKeys.has(tile.key)
).length)

// 兜底：万一某张瓦片的请求既没 load 也没 error（连接被挂住、壁纸被系统暂停过），
// 不能让「加载中」一直顶着。超过这个时间就不再等，图到了照样会画出来
const LOADING_HINT_TIMEOUT = 8000
const loadingTimedOut = ref(false)
let loadingTimer = 0

// 每换一批瓦片就重新起算：拖拽时 tiles 一直在变，计时器跟着重置，
// 松手后没有新的批次了，超时才会真的触发
const armLoadingTimer = () => {
  clearTimeout(loadingTimer)
  loadingTimer = 0
  loadingTimedOut.value = false
  if (pending.value === 0) return
  loadingTimer = setTimeout(() => { loadingTimedOut.value = true }, LOADING_HINT_TIMEOUT)
}

const isLoading = computed(() => pending.value > 0 && !loadingTimedOut.value)

// 当前这一屏里已经画出来 / 已经明确失败的瓦片数
const failedInView = computed(() => tiles.value.filter(
  (tile) => failedKeys.has(tile.key)
).length)
const loadedInView = computed(() => tiles.value.filter(
  (tile) => loadedKeys.has(tile.key)
).length)

/**
 * 是否判定为「地图整体不可用」。
 *
 * 不能一有失败就报警：单张边角瓦片超时、偶发丢包在正常网络里也会发生。
 * 判定分两路：
 *   A. 8 秒一张都没画出来（请求被挂住，可能连 error 事件都没有）；
 *   B. 失败数达到 MAX_TILE_FAILURES、这一批已有结论，
 *      且失败占多数或一张都没画出来。
 * 网络断开 / 瓦片服务不可用时所有瓦片都会失败，B 自然成立。
 */
const mapFailed = computed(() => {
  const total = tiles.value.length
  if (!total) return false
  const failed = failedInView.value
  const loaded = loadedInView.value
  // 超过 8 秒还有请求没回来、且一张都没画出来：连接可能被挂住
  //（连 error 事件都没有），不能让它一直停在空白地图上
  if (loadingTimedOut.value && pending.value > 0 && loaded === 0) return true
  if (failed < MAX_TILE_FAILURES) return false
  if (pending.value > 0 && !loadingTimedOut.value) return false
  const mostlyFailed = failed >= Math.ceil(total * 0.6)
  return mostlyFailed || loaded === 0
})

// 「加载中」提示单独延迟：短加载不闪提示，长加载才出现。
// 不能直接用 isLoading，否则每次拖拽换批都会闪一下
const loadingHintVisible = ref(false)
watch(isLoading, (loading) => {
  clearTimeout(hintTimer)
  hintTimer = 0
  if (!loading) {
    loadingHintVisible.value = false
    return
  }
  hintTimer = setTimeout(() => {
    hintTimer = 0
    loadingHintVisible.value = true
  }, LOADING_HINT_DELAY)
}, { immediate: true })

const underlayTiles = computed(() => (
  underlay.value ? buildTiles(underlay.value, viewW.value, viewH.value) : []
))

// 缩放锚点：按钮缩放落在视口中心，双击落在点击位置。
// 垫底层必须用同一个原点，两者才能严丝合缝
const anchorPoint = ref(null)
const anchor = computed(() => {
  const p = anchorPoint.value
  if (!isFinitePoint(p)) return `${viewW.value / 2}px ${viewH.value / 2}px`
  return `${p.x}px ${p.y}px`
})

/**
 * 全屏裁切：进场时是「卡片里地图那一块」，展开后归零。
 * opacity 只给「换视野」用（缩放到全国、退场换焦点），平时不写内联样式。
 */
const clipStyle = computed(() => {
  const style = {}
  if (stageFading.value) style.opacity = '0'
  if (props.fullscreen && clipInsets.value) {
    const i = clipInsets.value
    style.clipPath = `inset(${i.top}px ${i.right}px ${i.bottom}px ${i.left}px round ${i.radius}px)`
  }
  return style
})

/**
 * 打底那层磨砂只跟裁切框走，不跟 stageFading（交叉淡化）。
 * 缩放 / 换视野的中途它就是那张「空纸」：新瓦片淡入之前先有一块浅色底，
 * 不会在过渡中间露出卡片或者壁纸的暗色。
 */
const veilStyle = computed(() => {
  if (!props.fullscreen || !clipInsets.value) return null
  const i = clipInsets.value
  return {
    clipPath: `inset(${i.top}px ${i.right}px ${i.bottom}px ${i.left}px round ${i.radius}px)`,
  }
})

// 垫着的拖动位移 + 缩放动画共用同一个 transform；
// 缩放时 pan 恒为 0（拖动已松手并提交），两者不会互相干扰。
// 全屏的裁切框也挂在这一层：裁的是地图本身，缩放胶囊等在裁切外面
const stageStyle = computed(() => ({
  transform: `translate3d(${pan.value.x}px, ${pan.value.y}px, 0) scale(${k.value})`,
  transformOrigin: anchor.value,
  ...clipStyle.value,
}))

const underlayStyle = computed(() => ({
  transform: `translate3d(${pan.value.x}px, ${pan.value.y}px, 0) scale(${underlay.value?.scale || 1})`,
  transformOrigin: anchor.value,
}))

// pin 在 stage 内会被一起放大，用 1/k 反补；transform-origin 在尖端，
// 所以缩放时尖端始终钉在地理点上
const pinStyle = computed(() => {
  if (!point.value) return null
  const [px, py] = lngLatToViewPixel(
    point.value.lng, point.value.lat, center.value, zoom.value, viewW.value, viewH.value
  )
  return {
    left: `${px}px`,
    top: `${py}px`,
    transform: `translate(-50%, -100%) scale(${1 / k.value})`,
  }
})

const coordText = computed(() =>
  picked.value
    ? `${picked.value.lat.toFixed(4)}, ${picked.value.lng.toFixed(4)}`
    : '点击地图任意位置'
)

/* ---------------- 落点地名（道路 / 区县） ---------------- */

// 连点时只查最后一次：150ms 内的抖动合并成一次请求，别把凭据额度打满
const ROAD_QUERY_DELAY = 150

// 有道路就显示道路；没有道路（没配高德 key）就显示和风反查到的「市 区县附近」
const roadText = computed(() => {
  const info = roadInfo.value
  if (!info) return ''
  if (info.road) return info.road
  return nearbyLabel(info.district, info.city)
})

// 悬停补全层级 + 距离：和风只到区县，偶尔会返回几十公里外的邻县，
// 把「离查询点有多远」露出来，用户能自己判断这个「附近」可信到什么程度
const roadTitle = computed(() => {
  const info = roadInfo.value
  if (!info) return ''
  const admin = joinAdminParts([info.province, info.city, info.district]).join(' · ')
  const distance = Number.isFinite(info.distanceKm)
    ? `距该区县中心约 ${Math.round(info.distanceKm)} 公里`
    : ''
  return [info.road, admin, distance].filter(Boolean).join(' · ')
})

// 正在查时先占位；查完由 roadText 决定还显不显示，查不到就整块消失
const roadHintVisible = computed(() => (
  !!picked.value && (roadLoading.value || !!roadText.value)
))

const abortRoadQuery = () => {
  clearTimeout(roadTimer)
  roadTimer = 0
  if (roadCtrl) {
    roadCtrl.abort()
    roadCtrl = null
  }
}

const settleRoadWaiter = () => {
  if (!roadWaiter) return
  const resolve = roadWaiter
  roadWaiter = null
  resolve()
}

/**
 * 等当前 pin 的地名查询落地。
 *
 * 给「确认选点」用：外层拿到的是同一个 pin，直接等这一份结果就行。
 * 不要在外层再发一次 —— 两次查询的入参坐标系不同（GCJ-02 / WGS-84），
 * 落点会差 1~2 米，「最近的路」在路口附近就可能翻成隔壁那条
 *（曾经出现过地图上写中学路、存下来是中心路）。
 *
 * 无论成功、失败还是超时都会 resolve，调用方读 roadInfo / 已发出的 road 事件即可。
 * @param {number} timeout 最长等待（毫秒）
 */
const waitRoad = (timeout = 1200) => new Promise((resolve) => {
  if (!roadLoading.value) {
    resolve()
    return
  }
  const timer = setTimeout(() => {
    roadWaiter = null
    resolve()
  }, timeout)
  roadWaiter = () => {
    clearTimeout(timer)
    resolve()
  }
})

const runRoadQuery = async (target, seq) => {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  roadCtrl = controller
  let info = null
  try {
    // 1) 有高德 key：先取道路名（还带省 / 市 / 区 / 街道，地址页标题要用）
    if (isReverseGeocodeEnabled()) {
      try {
        // target 是地图坐标系（高德源 = GCJ-02），传 crs 跳过 WGS-84 往返转换
        const amap = await reverseGeocode(target.lng, target.lat, {
          crs: 'GCJ02',
          signal: controller?.signal,
        })
        info = {
          source: 'amap',
          road: amap.road || '',
          province: amap.province || '',
          city: amap.city || '',
          district: amap.district || '',
          township: amap.township || '',
          address: amap.address || '',
          distanceKm: null,
        }
      } catch (error) {
        // 高德失败（配额 / 断网 / 郊区无命名道路 / key 类型不对）→ 下面用和风兜底
        if (seq !== roadSeq) return
      }
    }

    // 2) 和风只覆盖到区县，作为「没有道路」时的兜底。
    //    两者取其一，不重复发请求；和风只认 WGS-84，地图坐标系是 GCJ-02 时先转回来
    if (seq !== roadSeq) return
    if ((!info || (!info.road && !info.district)) && isPlaceLookupAvailable()) {
      const [wLng, wLat] = TILE_SOURCES[source].crs === 'GCJ02'
        ? gcj02ToWgs84(target.lng, target.lat)
        : [target.lng, target.lat]
      try {
        const place = await lookupPlaceByCoord(wLng, wLat, {
          signal: controller?.signal,
          timeout: 4000,
        })
        if (seq !== roadSeq) return
        info = {
          source: 'qweather',
          road: '',
          province: place.adm1,
          city: place.adm2,
          district: place.name,
          township: '',
          address: '',
          distanceKm: place.distanceKm,
        }
      } catch (error) {
        if (seq !== roadSeq) return
        info = null
      }
    }

    if (seq !== roadSeq) return
    roadInfo.value = info
    // 把地名交给外层落库：「最近」记录和天气卡的地址文案都要用它。
    // 带上 WGS-84 坐标，外层可以核对这是不是当前这个 pin 的结果
    if (info && picked.value) {
      emit('road', {
        point: picked.value,
        source: info.source,
        road: info.road,
        // 省 / 市 / 区县 / 乡镇街道一起带上：地址页标题要拼出
        // 「浙江省-台州市-黄岩区-新前街道-中学路」这样的详细地址。
        // 区县名（「黄岩区」）另有用途：和风给的 CityDetail.name 是「黄岩」，
        // 不带「区」，主界面的地址要跟「最近」里的写法一致，就用高德这个字段
        province: info.province,
        city: info.city,
        district: info.district,
        township: info.township,
        address: info.address,
        distanceKm: info.distanceKm,
      })
    }
  } catch (error) {
    // 查不到地名不影响选点：静默收起即可
    if (seq !== roadSeq) return
    roadInfo.value = null
  } finally {
    if (seq === roadSeq) {
      roadLoading.value = false
      roadCtrl = null
      // 结果已经通过 road 事件交给外层了，这里只是把「确认」那一侧放开
      settleRoadWaiter()
    }
  }
}

/**
 * 安排一次地名查询。
 * @param {{lng:number,lat:number}|null} target 地图坐标系（GCJ-02）的 pin 位置
 */
const scheduleRoadQuery = (target) => {
  // 先递增序号：还在路上的旧请求回来时会因为序号对不上而被丢弃
  const seq = ++roadSeq
  abortRoadQuery()
  roadInfo.value = null
  // 两条路都没有（没配高德 key，和风凭据也还没配）：直接收起 UI，不发请求
  if (!target || (!isReverseGeocodeEnabled() && !isPlaceLookupAvailable())) {
    roadLoading.value = false
    // 不会有结果了，别让等着的「确认」白等到超时
    settleRoadWaiter()
    return
  }
  roadLoading.value = true
  roadTimer = setTimeout(() => {
    roadTimer = 0
    runRoadQuery(target, seq)
  }, ROAD_QUERY_DELAY)
}

const clampCenter = ([lng, lat]) => [
  ((lng + 540) % 360) - 180,
  Math.max(-85, Math.min(85, lat)),
]

const reset = () => {
  point.value = null
  picked.value = null
}

// 把外部传入的初始点摆成 pin（WGS-84 → 地图坐标系）。
// 只给「从最近记录进来」用；用户点过之后 props 不再变，不会把 pin 拽回去
const applyPoint = (p) => {
  if (!p || !Number.isFinite(p.lng) || !Number.isFinite(p.lat)) {
    reset()
    return
  }
  const [lng, lat] = TILE_SOURCES[source].crs === 'GCJ02'
    ? wgs84ToGcj02(p.lng, p.lat)
    : [p.lng, p.lat]
  point.value = { lng, lat }
  picked.value = { lng: p.lng, lat: p.lat }
}

const applyInitialPoint = () => applyPoint(props.initialPoint)

/**
 * 外部把视口移到某个位置（热门城市 / 最近记录 chip / 全屏里的重选地区），
 * 默认保留当前缩放级别。
 * 做成方法而不是靠 props：连着点同一个城市时 props 值没变，watch 不会触发，
 * 地图就「点了没反应」。
 * @param {[number, number]} nextCenter 地图坐标系（GCJ-02）中心
 * @param {{lng:number,lat:number}|null} pin 要摆放的 WGS-84 坐标；null = 不摆 pin
 * @param {{zoom?: number}} [options] zoom 指定落点级别（全屏里从地区卡片重选时用街道级）
 */
const focusTo = (nextCenter, pin = null, options = {}) => {
  const [lng, lat] = nextCenter || []
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
  cancelAnimationFrame(rafId)
  clearTimeout(zoomGuard)
  rafId = 0
  zoomGuard = 0
  zooming.value = false
  k.value = 1
  underlay.value = null
  anchorPoint.value = null
  lastClick.at = 0
  lastRight.at = 0
  cancelPan()
  // 换地区时可能正停在全国视野：留在那一级会看不到路名，至少回到卡片用的街道级。
  // 外层明确给了 zoom 就以它为准（从地区卡片重选 → 直接落街道级，不等用户再放大）
  if (Number.isFinite(options.zoom)) {
    zoom.value = Math.min(ZOOM_MAX, Math.max(minZoom.value, options.zoom))
  } else if (zoom.value < ZOOM_MIN) {
    zoom.value = ZOOM_DEFAULT
  }
  center.value = clampCenter([lng, lat])
  applyPoint(pin)
}

/* ---------------- 缩放动画 ---------------- */

const scheduleUnderlayDrop = () => {
  clearTimeout(underlayTimer)
  // 兜底：万一 load 事件没来（缓存/中断），不能一直压着一层旧图
  underlayTimer = setTimeout(() => { underlay.value = null }, 1600)
}

/**
 * 缩放动画。
 *
 * 两个方向的做法不同，但收尾状态完全一致（zoom=目标值、k=1、垫底层=旧瓦片）：
 *
 *   放大：旧瓦片从 1 放大到 2。旧图会被越放越大，始终盖满视口；
 *         k=2 时它覆盖的地理范围正好等于新一级的视野，此刻换瓦片没有位移。
 *   缩小：先把目标瓦片放到 2 倍（与当前视野重合）再缩回 1。目标瓦片始终被放大、
 *         盖满视口，旧图只在底下垫着（看不见）。反过来做的话，旧图缩到 0.5 倍
 *         就不够铺满视口，四边会露出底色。
 *
 * @param {number} target 目标缩放级别
 * @param {{x:number,y:number}|null} anchorPx 缩放锚点（视口像素）；null = 视口中心
 */
const animateZoom = (target, anchorPx = null) => {
  if (zooming.value || target === zoom.value) return
  if (target < minZoom.value || target > ZOOM_MAX) return
  // 缩放和拖动位移不能共存：先把残留位移折进 center，动画的 transform 里就只剩 scale
  if (pan.value.x || pan.value.y) commitPan()

  const fromZoom = zoom.value
  const fromCenter = [...center.value]
  const zoomIn = target > fromZoom
  const fromK = zoomIn ? 1 : 2
  const toK = zoomIn ? 2 : 1

  const pivot = isFinitePoint(anchorPx)
    ? anchorPx
    : { x: viewW.value / 2, y: viewH.value / 2 }
  anchorPoint.value = zoomIn ? pivot : null

  // 放大时视口中心要跟着锚点移动：否则 k=2 那一帧是以点击点为中心放大的，
  // 而换图后却是以原中心渲染，两者错位，看起来就是「先缩一下再跳回来」
  let nextCenter = fromCenter
  if (zoomIn) {
    const [gLng, gLat] = viewPixelToLngLat(
      pivot.x, pivot.y, fromCenter, fromZoom, viewW.value, viewH.value
    )
    const [wx, wy] = lngLatToWorld(gLng, gLat)
    const targetScale = 2 ** target * TILE_SIZE
    const candidate = worldToLngLat(
      wx - (pivot.x - viewW.value / 2) / targetScale,
      wy - (pivot.y - viewH.value / 2) / targetScale
    )
    // 算不出有限值就保持原中心，宁可少一次居中，也不要让 NaN 流进瓦片索引
    if (Number.isFinite(candidate[0]) && Number.isFinite(candidate[1])) {
      nextCenter = clampCenter(candidate)
    }
  }

  zooming.value = true
  k.value = fromK

  if (!zoomIn) {
    // 缩小：先换到目标瓦片并放大 2 倍，视觉上和当前一帧完全相同
    underlay.value = { zoom: fromZoom, center: fromCenter, scale: 1 }
    zoom.value = target
  }

  const startedAt = performance.now()

  const commit = () => {
    cancelAnimationFrame(rafId)
    clearTimeout(zoomGuard)
    rafId = 0
    zoomGuard = 0
    if (!zooming.value) return
    if (zoomIn) {
      // 旧瓦片放大 2 倍后与新视野重合，留在底下等新瓦片画上来
      underlay.value = { zoom: fromZoom, center: fromCenter, scale: 2 }
      center.value = nextCenter
      zoom.value = target
    }
    k.value = 1
    zooming.value = false
    scheduleUnderlayDrop()
  }

  const step = (now) => {
    const t = Math.min(1, (now - startedAt) / ZOOM_DURATION)
    // easeOutCubic：起步快、收尾稳，比线性更像真实地图
    const eased = 1 - (1 - t) ** 3
    k.value = fromK + (toK - fromK) * eased
    if (t < 1) {
      rafId = requestAnimationFrame(step)
      return
    }
    commit()
  }

  rafId = requestAnimationFrame(step)
  // rAF 在壁纸被遮挡时会被节流甚至暂停，兜底强制收尾，避免卡在动画中间
  zoomGuard = setTimeout(commit, ZOOM_DURATION + 500)
}

/* ---------------- 拖拽平移 ---------------- */

/**
 * 撤掉还没提交的位移。点选 / 重新定位之前必须调一次：
 * 否则画面带着 translate 偏移，算出来的坐标会和看到的位置差一截。
 */
const cancelPan = () => {
  if (panRaf) {
    cancelAnimationFrame(panRaf)
    panRaf = 0
  }
  clearTimeout(panTimer)
  panTimer = 0
  if (pan.value.x || pan.value.y) pan.value = { x: 0, y: 0 }
}

/**
 * 把垫着的屏幕位移折进 center（＝ 触发一次新的瓦片批次），并把拖拽起点
 * 一起挪过去。不挪起点的话，下一帧 dx 会把这 100ms 的位移再算一遍，
 * 地图就会以双倍速度飞出去。
 */
const commitPan = () => {
  const { x, y } = pan.value
  if (!x && !y) return
  const scale = 2 ** zoom.value * TILE_SIZE
  const [wx, wy] = lngLatToWorld(center.value[0], center.value[1])
  const [lng, lat] = worldToLngLat((wx * scale - x) / scale, (wy * scale - y) / scale)
  center.value = clampCenter([lng, lat])
  pan.value = { x: 0, y: 0 }
  if (dragState) {
    dragState.startX += x
    dragState.startY += y
    dragState.pending = { x: 0, y: 0 }
  }
}

// rAF 回调：每帧最多把指针位移贴到画面上一次
const applyPan = () => {
  panRaf = 0
  if (!dragState?.pending) return
  pan.value = dragState.pending
  if (!panTimer) {
    panTimer = setTimeout(() => {
      panTimer = 0
      commitPan()
    }, PAN_COMMIT_MS)
  }
}

const schedulePan = () => {
  if (!panRaf) panRaf = requestAnimationFrame(applyPan)
}

const handlePointerMove = (event) => {
  if (!dragState) return
  const dx = event.clientX - dragState.startX
  const dy = event.clientY - dragState.startY
  const dist = Math.hypot(dx, dy)
  if (dist > dragState.moved) dragState.moved = dist
  if (dist < DRAG_THRESHOLD) return

  dragging.value = true
  // 指针往右拖 → 地图内容右移 → 中心点左移；这里先只记位移，不重算瓦片
  dragState.pending = { x: dx, y: dy }
  schedulePan()
}

const detachDrag = () => {
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
  window.removeEventListener('pointercancel', handlePointerUp)
}

const handlePointerUp = (event) => {
  const state = dragState
  detachDrag()
  dragState = null
  dragging.value = false

  // 确实拖动过：松手立刻提交剩余位移，最后一屏瓦片不用再等满 100ms
  if (state && state.moved >= DRAG_THRESHOLD) {
    if (panRaf) {
      cancelAnimationFrame(panRaf)
      panRaf = 0
    }
    clearTimeout(panTimer)
    panTimer = 0
    if (state.pending) pan.value = state.pending
    commitPan()
    return
  }

  // 没怎么动 = 点击。先清掉阈值内的微小位移，保证点选坐标和画面一致
  cancelPan()
  const pt = toViewPoint(event)
  if (!pt) return

  const now = performance.now()
  const isDouble = now - lastClick.at < DOUBLE_CLICK_MS &&
    Math.hypot(pt.x - lastClick.x, pt.y - lastClick.y) <= DOUBLE_CLICK_SLOP

  if (isDouble) {
    lastClick.at = 0
    // 双击放大：以点击点为锚。第一次点击已经把 pin 落在这一点上，
    // 放大后它仍停在同一地理位置，所以看起来是「点一下、再放大」而不是跳动
    animateZoom(zoom.value + 1, pt)
    return
  }

  lastClick = { at: now, x: pt.x, y: pt.y }
  pickAt(pt)
}

const handlePointerDown = (event) => {
  if (zooming.value) return
  if (event.pointerType === 'mouse' && event.button !== 0) return
  cancelPan()
  dragState = {
    startX: event.clientX,
    startY: event.clientY,
    moved: 0,
    pending: { x: 0, y: 0 },
  }
  dragging.value = false
  window.addEventListener('pointermove', handlePointerMove, { passive: true })
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointercancel', handlePointerUp)
}

/**
 * 右键双击 = 缩小。
 *
 * 浏览器的 dblclick 只认主键，右键给的是 contextmenu（Windows 上还要等松手才来），
 * 所以这里自己数：一次按下的 contextmenu 记一次，两次落在 320ms / 8px 内算双击。
 * 顺手吃掉系统菜单 —— 在地图上弹「另存为图片」没有任何用处。
 *
 * 锚点只在放大时用得上（缩小的动画是从 2 倍缩回 1 倍，天然以视口中心为轴），
 * 这里照样传 pt，和「+」按钮那边保持同一个调用形状。
 */
const handleContextMenu = (event) => {
  event.preventDefault()
  const pt = toViewPoint(event)
  if (!pt) return
  const now = performance.now()
  const isDouble = now - lastRight.at < DOUBLE_CLICK_MS &&
    Math.hypot(pt.x - lastRight.x, pt.y - lastRight.y) <= DOUBLE_CLICK_SLOP
  if (isDouble) {
    lastRight.at = 0
    animateZoom(zoom.value - 1, pt)
    return
  }
  lastRight = { at: now, x: pt.x, y: pt.y }
}

// 事件坐标 → 视口内像素；落在视口外返回 null
const toViewPoint = (event) => {
  const rect = stageEl.value?.getBoundingClientRect()
  if (!rect || !rect.width || !Number.isFinite(event?.clientX)) return null
  // 缩放动画期间不响应指针，此时 k=1，rect 就是逻辑视口
  const px = event.clientX - rect.left
  const py = event.clientY - rect.top
  if (px < 0 || py < 0 || px > rect.width || py > rect.height) return null
  return { x: px, y: py }
}

const pickAt = (pt) => {
  if (!isFinitePoint(pt)) return
  const [lng, lat] = viewPixelToLngLat(
    pt.x, pt.y, center.value, zoom.value, viewW.value, viewH.value
  )

  // 两种坐标不能混用：pin 用地图坐标系，查询用 WGS-84
  point.value = { lng, lat }
  const [wLng, wLat] = TILE_SOURCES[source].crs === 'GCJ02'
    ? gcj02ToWgs84(lng, lat)
    : [lng, lat]
  picked.value = { lng: wLng, lat: wLat }
  emit('pick', picked.value)
}

/* ---------------- 瓦片加载与失败 ---------------- */

const handleTileLoad = (event) => {
  const key = event?.target?.dataset?.key
  if (!key) return
  // 同一张瓦片失败后又加载成功：把失败账销掉，mapFailed 会自动回退
  failedKeys.delete(key)
  loadedKeys.add(key)
}

const handleTileError = (event) => {
  const key = event?.target?.dataset?.key
  if (key) failedKeys.add(key)
  // 具体判定交给 mapFailed：偶发单张失败不打扰用户，
  // 等这一批瓦片有了结论、且失败占多数时才提示
}

/**
 * 重试整屏瓦片。
 * 仅清空账本还不够：<img> 的 src 没变、key 没变，Vue 会复用旧节点，
 * 浏览器也不会重新请求。retryTick 同时改 key 和 URL，强制重发一次。
 */
const retryLoad = () => {
  loadedKeys.clear()
  failedKeys.clear()
  retryTick.value += 1
}

/**
 * 地图实在加载不出来时的兜底：清掉 pin，按「没有精确点」确认。
 * 复用底部条的约定（confirm 收到 null = 用中心坐标），
 * 嵌进地址页时由外层按选中地区的 adcode 查天气。
 */
const useDistrictCenter = () => {
  reset()
  emit('confirm', null)
}

const zoomIn = () => animateZoom(zoom.value + 1)

const zoomOut = () => animateZoom(zoom.value - 1)

const handleConfirm = () => emit('confirm', picked.value)

/* ---------------- 全屏 ---------------- */

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const nextFrame = () => new Promise((resolve) => { requestAnimationFrame(() => resolve()) })

// 卡片里 .mp-wrap 的圆角（rem 换算出来的实际像素），展开从这里开始
const wrapRadius = () => {
  const el = wrapEl.value
  if (!el) return 0
  const value = parseFloat(getComputedStyle(el).borderTopLeftRadius)
  return Number.isFinite(value) ? value : 0
}

// 屏幕矩形 → clip-path 的 inset 值
const insetsOf = (rect, width, height) => ({
  top: Math.max(0, Math.round(rect.top)),
  right: Math.max(0, Math.round(width - rect.right)),
  bottom: Math.max(0, Math.round(height - rect.bottom)),
  left: Math.max(0, Math.round(rect.left)),
  radius: wrapRadius(),
})

// 把正在跑的缩放/拖动动画收干净：裁切框按「静止画面」算，带位移会算错
const settleMotion = () => {
  cancelAnimationFrame(rafId)
  clearTimeout(zoomGuard)
  clearTimeout(underlayTimer)
  rafId = 0
  zoomGuard = 0
  underlayTimer = 0
  zooming.value = false
  k.value = 1
  underlay.value = null
  anchorPoint.value = null
  commitPan()
}

/**
 * 进全屏。
 *
 * 关键是相机补偿：视口从卡片里那一块换成整屏以后，如果 center 不动，
 * 已经画出来的瓦片会整体平移（地图在卡片里并不居中，垂直方向差几十像素）。
 * 取「新视口中心」在旧视口里的像素反算中心点，每个像素就都停在原地——
 * 于是展开只是把一个更大的取景框慢慢掀开，画面本身不动。
 */
const enterFullscreen = async () => {
  if (fsBusy.value || props.fullscreen) return
  const stage = stageEl.value
  if (!stage) return
  fsBusy.value = true
  try {
    settleMotion()
    const rect = stage.getBoundingClientRect()
    const width = window.innerWidth
    const height = window.innerHeight
    const fromW = viewW.value
    const fromH = viewH.value
    const fromCenter = [...center.value]

    entryRect = rect
    entryViewport = { w: width, h: height }
    // 先裁到「现在地图所在的那一块」：这一帧的画面和进全屏前一模一样
    clipInsets.value = insetsOf(rect, width, height)
    stageFading.value = false

    emit('update:fullscreen', true)
    await nextTick()
    // ResizeObserver 有 120ms 去抖，这里必须同步量，否则会先闪一帧旧尺寸
    measure()

    const nextCenter = viewPixelToLngLat(
      width / 2 - rect.left, height / 2 - rect.top, fromCenter, zoom.value, fromW, fromH
    )
    if (Number.isFinite(nextCenter[0]) && Number.isFinite(nextCenter[1])) {
      center.value = clampCenter(nextCenter)
    }

    // 两帧：先让「裁到卡片」这一帧真正画出来，再改成 0 才有过渡
    await nextFrame()
    await nextFrame()
    clipInsets.value = { top: 0, right: 0, bottom: 0, left: 0, radius: 0 }
    await sleep(FS_DURATION)
  } finally {
    fsBusy.value = false
  }
}

// 回到卡片后的落点：刚选的点 + 街道级（没选过点就只把级别夹回卡片范围）
const applyCardCamera = () => {
  const pin = point.value
  if (pin) {
    center.value = clampCenter([pin.lng, pin.lat])
    zoom.value = Math.min(ZOOM_MAX, Math.max(FS_CARD_ZOOM, zoom.value))
  } else {
    zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom.value))
  }
  k.value = 1
  underlay.value = null
  anchorPoint.value = null
}

/**
 * 退全屏。
 *
 * 先把裁切框收回卡片矩形（320ms，内容完全连续），然后一次性搬回卡片、
 * 把相机定到刚选的点。面板本身不做淡入淡出：它一旦淡掉，露出来的是一块
 * 空玻璃卡片，130ms 的「空卡片」比一次干脆的切换更刺眼。
 * 所以这一帧的观感是「地图收进卡片，卡片带着刚选的点回到原位」。
 *
 * 但全屏独有的那两块悬浮玻璃（上沿的标题卡、下沿的操作条）不能干等着：
 * 它们在外面那层排版里，收窄动画管不到，只能先淡掉。这件事由外层做，
 * 这里只负责在收窄开始前发个信。
 */
const exitFullscreen = async () => {
  if (!props.fullscreen || fsBusy.value) return
  emit('fs-leaving')
  fsBusy.value = true
  try {
    const width = window.innerWidth
    const height = window.innerHeight
    const rect = entryRect
    const sameViewport = entryViewport && entryViewport.w === width && entryViewport.h === height

    if (rect && sameViewport) {
      // 相机不动、只收窄裁切框：整个过程内容完全连续
      clipInsets.value = insetsOf(rect, width, height)
      await sleep(FS_DURATION)
    }

    emit('update:fullscreen', false)
    await nextTick()
    clipInsets.value = null
    applyCardCamera()
    measure()
    await nextTick()
    await nextFrame()
  } finally {
    stageFading.value = false
    fsBusy.value = false
    entryRect = null
    entryViewport = null
  }
}

const toggleFullscreen = () => {
  if (props.fullscreen) exitFullscreen()
  else enterFullscreen()
}

/**
 * 「全国」一键档：从街道级一步看到整个国家，再点一下回到原来的级别。
 * 跨了好几级，走不了 ±1 的缩放动画（目标瓦片会被放大成一团糊），
 * 用一次快速交叉淡化代替。
 */
const toggleCountry = async () => {
  if (!props.fullscreen || fsBusy.value) return
  fsBusy.value = true
  try {
    const atCountry = zoom.value <= ZOOM_COUNTRY
    const target = atCountry
      ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomBeforeCountry || ZOOM_DEFAULT))
      : ZOOM_COUNTRY
    if (!atCountry) zoomBeforeCountry = zoom.value

    settleMotion()
    stageFading.value = true
    await sleep(FS_FADE)
    zoom.value = target
    await nextTick()
    await nextFrame()
    await nextFrame()
    stageFading.value = false
    await sleep(FS_FADE)
  } finally {
    fsBusy.value = false
  }
}

/* ---------------- 尺寸自适应 ---------------- */

const measure = () => {
  const el = stageEl.value
  if (!el) return
  const box = el.getBoundingClientRect()
  viewW.value = Math.max(1, Math.round(box.width))
  viewH.value = Math.max(1, Math.round(box.height))
}

/**
 * 尺寸变化节流（首帧立即量，之后每 MEASURE_DEBOUNCE 最多一次 + 末次补量）。
 * 面板切换动画期间 ResizeObserver 会连续回调，每次回调都会重算整屏瓦片，
 * 不节流的话进出一次地址页就能打出几十批请求。
 */
const scheduleMeasure = () => {
  if (measureTimer) {
    measurePending = true
    return
  }
  measure()
  measureTimer = setTimeout(() => {
    measureTimer = 0
    if (!measurePending) return
    measurePending = false
    scheduleMeasure()
  }, MEASURE_DEBOUNCE)
}

let observer = null

onMounted(() => {
  measure()
  // 首次挂载时 center 的 watch 不会触发，初始 pin 要在这里补一次
  applyInitialPoint()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(scheduleMeasure)
    observer.observe(stageEl.value)
  } else {
    window.addEventListener('resize', scheduleMeasure)
  }
})

onBeforeUnmount(() => {
  detachDrag()
  cancelAnimationFrame(rafId)
  clearTimeout(zoomGuard)
  clearTimeout(underlayTimer)
  clearTimeout(loadingTimer)
  cancelPan()
  clearTimeout(measureTimer)
  clearTimeout(hintTimer)
  // 卸掉时把还在路上的道路名请求一起掐掉，避免回写到已卸载的组件
  roadSeq += 1
  abortRoadQuery()
  observer?.disconnect()
  observer = null
  window.removeEventListener('resize', scheduleMeasure)
})

/* ---------------- 外部变更 ---------------- */

// 瓦片列表变了：把已经移出视口的 key 从账本里清掉，
// 既避免长会话里 Set 无限增长，也保证「离屏后又回来」的瓦片会重新记一次 load
watch(tiles, (list) => {
  const alive = new Set(list.map((tile) => tile.key))
  loadedKeys.forEach((key) => { if (!alive.has(key)) loadedKeys.delete(key) })
  failedKeys.forEach((key) => { if (!alive.has(key)) failedKeys.delete(key) })
  // 新的一批瓦片 = 重新开始计时，避免上一批的超时标记影响到这一批
  armLoadingTimer()
}, { immediate: true })

// 同一批里陆续到货的部分变化不用重新计时；已经超时过的也不再复现提示，
// 等下一批瓦片（tiles 变化）再重新开始
watch(pending, (value) => {
  if (value === 0) {
    clearTimeout(loadingTimer)
    loadingTimer = 0
    loadingTimedOut.value = false
    return
  }
  if (loadingTimer || loadingTimedOut.value) return
  armLoadingTimer()
})

// 新瓦片全部到位后撤掉垫底层（留一点余量，避免和最后一像素的绘制抢同一帧）
watch(pending, (value) => {
  if (value > 0 || !underlay.value) return
  clearTimeout(underlayTimer)
  underlayTimer = setTimeout(() => { underlay.value = null }, 160)
})

// 换了区县：终止动画、回正视口、按新的初始点摆 pin
watch(() => (props.center || []).join(','), () => {
  cancelAnimationFrame(rafId)
  clearTimeout(zoomGuard)
  rafId = 0
  zoomGuard = 0
  zooming.value = false
  k.value = 1
  underlay.value = null
  anchorPoint.value = null
  lastClick.at = 0
  lastRight.at = 0
  cancelPan()
  center.value = [...props.center]
  applyInitialPoint()
})

// pin 动了就重新问一次地名（点选、初始点回显、清空都会走到这里）
watch(point, (value) => scheduleRoadQuery(value))

// 用户在壁纸属性面板里改了高德密钥：当前 pin 的地名要重查一次，
// 不必让他再点一遍地图（属性面板是另一个窗口，改完不需要刷新壁纸）。
// 补上 key：升级成道路名；清空 key：退回和风反查的「xx附近」，
// 不能让旧的道路名停留在屏幕上（它已经不再随 pin 更新了）。
watch(AmapKey, () => {
  if (!point.value) return
  scheduleRoadQuery(point.value)
})

watch(() => props.initialPoint, applyInitialPoint)

watch(() => props.zoom, (value) => {
  if (Number.isFinite(value)) zoom.value = value
})

// 外层强制收回（比如「重选地区」时动画正好被占住）：把裁切和淡出状态一起清掉
watch(() => props.fullscreen, (on) => {
  if (on) return
  clipInsets.value = null
  stageFading.value = false
  nextTick(() => measure())
})

// eslint-disable-next-line no-undef
defineExpose({ reset, focusTo, waitRoad, exitFullscreen })
</script>

<style lang="scss" scoped>
.MapPointPicker {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
  min-width: 0;
}

.mp-wrap {
  position: relative;
  width: 100%;
  /* padding-bottom 撑出 1:1，比 aspect-ratio 兼容性更稳（老 CEF 也认） */
  height: 0;
  padding-bottom: 100%;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);

  /* 未加载区域的底色（见 .mp-void）。嫌浅 / 嫌深只改这两行：
     --mp-void 的 alpha 越低越透（越接近卡片的暗色），越高越接近瓦片的纸面白 */
  --mp-void: rgba(232, 238, 246, 0.78);
  --mp-void-blur: 0.625rem;
}

/* ================= 打底：未加载区域的磨砂玻璃 =================
   高德街景底图本身是浅色纸面（≈ #f4f5f3），所以留白也必须走浅色：
   没加载出来的瓦片才会像「地图还没印出来」，而不是地图上被挖了个洞。
   半透明 + backdrop blur 让它仍然是玻璃——背后的卡片、壁纸能透上来一点，
   和卡片是同一套材质，全屏时那一大片留白才不会和黑色底一样割裂。

   层级：铺在 .mp-layer / .mp-stage 之前，瓦片永远盖在它上面；
   跟随全屏裁切框（clip-path），展开 / 收回时不会溢出到卡片外面去。 */
.mp-void {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(120% 100% at 50% 0%, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0) 62%),
    var(--mp-void);
  -webkit-backdrop-filter: blur(var(--mp-void-blur)) saturate(115%);
  backdrop-filter: blur(var(--mp-void-blur)) saturate(115%);
  /* 时长要和 stage 的裁切过渡一致，两层才是同一个框在收放 */
  transition: clip-path 320ms var(--ease);
}

/* 换成 OSM 那种「亮底图压暗」的源时，底图是暗的，留白跟着转暗才不突兀 */
.mp-wrap.is-tile-dark {
  --mp-void: rgba(18, 28, 44, 0.72);
}

/* 撑满父容器：由外层给出确定的宽高，瓦片按真实像素铺满，不做缩放 */
.mp-wrap--fill {
  height: 100%;
  min-height: 16rem;
  padding-bottom: 0;
}

/* ================= 全屏 =================
   控件一律贴着「卡片矩形」（和 .weather-shell 同一套宽度/高度公式），
   不贴屏幕边缘：用户的视线就在卡片这一带，按钮跟过去才不用满屏找。
   地图本身铺到屏幕四边，被裁切框展开盖住的部分才是卡片以外的世界。 */
.mp-wrap.is-fs {
  /* 卡片矩形的宽高：和 .weather-shell 用的是同一套公式，控件锚它而不是锚屏幕边缘。
     写成自定义属性是为了避免在 calc() 里再嵌 min()（Sass 会试着求值） */
  --mp-card-w: min(82vw, 71.25rem);
  --mp-card-h: min(46.5rem, 92vh);
  border: none;
  border-radius: 0;

  /* 全屏时这层留白铺满整屏，而背后的雨滴在一直重绘 → backdrop 模糊每帧重算。
     壁纸掉帧的话把下面这行打开：留白退化成平面浅色，0.78 的不透明度下几乎看不出差别 */
  /* --mp-void-blur: 0px; */

  .mp-zoom {
    top: 50%;
    right: calc((100vw - var(--mp-card-w)) / 2 + 0.75rem);
    transform: translateY(-50%);
  }

  /* 「地图加载中…」原来贴在顶边，全屏时会躲在悬浮卡下面 */
  .mp-hint:not(.mp-hint--tip) {
    top: calc((100vh - var(--mp-card-h)) / 2 + 0.75rem);
  }

  .mp-hint--tip,
  .mp-road {
    bottom: calc((100vh - var(--mp-card-h)) / 2 + 0.5rem);
    left: calc((100vw - var(--mp-card-w)) / 2 + 0.5rem);
  }

  .mp-attribution {
    right: calc((100vw - var(--mp-card-w)) / 2 + 0.75rem);
    bottom: calc((100vh - var(--mp-card-h)) / 2 + 0.375rem);
  }
}

.mp-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.mp-stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  user-select: none;
  will-change: transform;
  /* 全屏展开/收回只改 clip-path，不动 transform：瓦片不会被拉伸变糊。
     时长要和 MapPointPicker 里的 FS_DURATION 保持一致 */
  transition: clip-path 320ms var(--ease), opacity 130ms ease;

  &.is-dragging {
    cursor: grabbing;
  }
}

/* 必须用 px 且不缩放：rem 会随 --panel-scale 变化，瓦片和 left/top 就对不上了 */
.mp-tile {
  position: absolute;
  width: 256px;
  height: 256px;
  display: block;
  pointer-events: none;

  &.is-failed {
    visibility: hidden;
  }
}

.mp-pin {
  position: absolute;
  width: 26px;
  height: 34px;
  /* 尖端（底部中点）对准地理点：transform-origin 放在这里，
     配合内联的 translate(-50%,-100%) scale(1/k)，缩放时尖端钉住不动 */
  transform-origin: 50% 100%;
  pointer-events: none;
  filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.55));
}

.mp-pin-icon {
  display: block;
  width: 100%;
  height: 100%;
}

/* 尖端处的地面涟漪，帮助在密集路名里快速找到 pin */
.mp-pin-ripple {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 16px;
  height: 7px;
  margin: 0 0 -3px -8px;
  border-radius: 50%;
  background: rgba(56, 189, 248, 0.5);
  animation: mp-ripple 2s ease-out infinite;
}

@keyframes mp-ripple {
  from {
    transform: scale(0.6);
    opacity: 0.85;
  }

  to {
    transform: scale(2.2);
    opacity: 0;
  }
}

/* 地图整体不可用时的兜底卡片。
   只盖住地图区域（底部操作条在 .mp-bar 里，不受影响），
   用 z-index 压在缩放按钮和版权信息上面 */
.mp-fallback {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: grid;
  place-items: center;
  padding: 1rem;
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(30, 58, 95, 0.55), transparent 70%),
    rgba(4, 10, 20, 0.86);
  -webkit-backdrop-filter: blur(0.125rem);
  backdrop-filter: blur(0.125rem);
  animation: mp-fallback-in 0.18s ease-out;
}

.mp-fallback-card {
  width: min(22rem, 100%);
  padding: 1.125rem 1.25rem 1rem;
  text-align: center;
  background: rgba(9, 18, 32, 0.94);
  border: 1px solid rgba(248, 113, 113, 0.4);
  border-radius: var(--radius-md);
  box-shadow: 0 1rem 2.5rem -0.75rem rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.mp-fallback-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #ffe0dc;
}

.mp-fallback-text {
  margin: 0.5rem 0 0.875rem;
  font-size: 0.84rem;
  line-height: 1.65;
  color: var(--text-secondary);

  strong {
    font-weight: 600;
    color: #bae6fd;
  }
}

.mp-fallback-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}

@keyframes mp-fallback-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.mp-hint {
  position: absolute;
  top: 0.5rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.25rem 0.625rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
  background: rgba(8, 15, 28, 0.82);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  white-space: nowrap;
  pointer-events: none;
  backdrop-filter: blur(0.375rem);
}

/* 亮色底图（OSM）→ 压成暗色，贴合壁纸的玻璃风格 */
.mp-tile.is-inverted {
  filter: invert(1) hue-rotate(180deg) brightness(0.92) saturate(0.7);
}

.mp-hint--tip {
  top: auto;
  bottom: 0.5rem;
  left: 0.5rem;
  transform: none;
  color: var(--text-muted);
}

/* 最近道路名：占左下角。有 pin 时「拖动平移」那条提示本来就隐藏，位置正好空着 */
.mp-road {
  position: absolute;
  bottom: 0.5rem;
  left: 0.5rem;
  display: inline-flex;
  align-items: center;
  gap: 0.3125rem;
  /* 右边给「© 高德地图」留出位置，窄地图下也不互相压 */
  max-width: calc(100% - 4.75rem);
  padding: 0.25rem 0.5625rem;
  font-size: 0.78rem;
  line-height: 1.4;
  color: #e0f2fe;
  background: rgba(8, 15, 28, 0.82);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  pointer-events: none;
  -webkit-backdrop-filter: blur(0.375rem);
  backdrop-filter: blur(0.375rem);

  &.is-loading {
    color: var(--text-muted);
  }
}

.mp-road-icon {
  flex: none;
  width: 0.8125rem;
  height: 0.8125rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.85;
}

.mp-road-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-attribution {
  position: absolute;
  right: 0.5rem;
  bottom: 0.25rem;
  font-size: 0.625rem;
  line-height: 1.2;
  color: rgba(235, 242, 251, 0.55);
  pointer-events: none;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}

/* 缩放控件：44px 圆形按钮 + 胶囊底。原来的 28px 在壁纸里几乎点不中 */
.mp-zoom {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
  padding: 0.25rem;
  background: rgba(8, 15, 28, 0.8);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  box-shadow: 0 0.5rem 1.25rem -0.5rem rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.07);
  -webkit-backdrop-filter: blur(0.5rem);
  backdrop-filter: blur(0.5rem);
}

.mp-zoom-btn {
  width: 2.75rem;
  height: 2.75rem;
  display: grid;
  place-items: center;
  padding: 0;
  color: var(--text-primary);
  background: transparent;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease, transform 0.12s ease, opacity 0.16s ease;

  svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
  }

  &:hover:not(:disabled) {
    color: #bae6fd;
    background: rgba(56, 189, 248, 0.24);
  }

  &:active:not(:disabled) {
    transform: scale(0.92);
  }

  &:focus-visible {
    outline: 2px solid #7dd3fc;
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.32;
    cursor: default;
  }
}

.mp-zoom-sep {
  width: 1.5rem;
  height: 1px;
  background: rgba(255, 255, 255, 0.14);
}

/* 「全国」那枚线稿地球，用 2.2 的描边会糊成一团，单独压细 */
.mp-zoom-btn--globe svg {
  stroke-width: 1.6;
}

.mp-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.875rem;
}

.mp-coord {
  min-width: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 0.5rem;
}

.mp-coord-label {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.mp-coord-value {
  font-family: 'JetBrains Mono', 'Cascadia Mono', Consolas, monospace;
  font-size: 0.86rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

/* 底栏里的路名：小标签，和坐标同一行，长路名也不把按钮挤走 */
.mp-coord-road {
  max-width: 9rem;
  overflow: hidden;
  padding: 0.0625rem 0.4375rem;
  font-size: 0.75rem;
  line-height: 1.5;
  color: #bae6fd;
  background: rgba(56, 189, 248, 0.16);
  border: 1px solid rgba(56, 189, 248, 0.32);
  border-radius: 999px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-actions {
  flex: none;
  display: inline-flex;
  gap: 0.5rem;
}

.mp-btn {
  padding: 0.4375rem 0.9375rem;
  font-size: 0.86rem;
  color: var(--text-primary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: background 0.2s ease, filter 0.2s ease;

  &:hover {
    background: var(--glass-border);
  }
}

.mp-btn--primary {
  font-weight: 600;
  color: #04121f;
  background: linear-gradient(135deg, #7dd3fc, #38bdf8);
  border-color: transparent;

  &:hover {
    background: linear-gradient(135deg, #7dd3fc, #38bdf8);
    filter: brightness(1.08);
  }
}
</style>
