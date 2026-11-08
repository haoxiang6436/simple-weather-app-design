<template>
  <div class="MapPointPicker">
    <div ref="wrapEl" class="mp-wrap"
      :class="{ 'mp-wrap--fill': fill, 'is-fs': fullscreen, 'is-tile-dark': invertTiles }">
      <!-- 打底：瓦片还没画上来的地方 = 浅色磨砂玻璃（详见 .mp-void 的说明）。
           必须垫在瓦片下面、跟着全屏裁切框一起走，不能铺在 .mp-wrap 上：
           全屏收放时 `.mp-wrap` 已经铺满整块屏幕，底色会跑到裁切框外面去 -->
      <div class="mp-void" :style="veilStyle" aria-hidden="true"></div>

      <!-- 全屏裁切必须放在不参与缩放的这一层：
           stage 上带着 tileScale，clip-path 会跟着被缩放，卡片矩形就对不上了 -->
      <div class="mp-clip" :style="clipStyle">
        <!-- 底层：缩放前后的旧瓦片，按 2 倍或 1 倍垫在新图下面，
             新瓦片没画上来之前不会闪出底色 -->
        <div v-if="underlay" class="mp-layer" :style="underlayStyle">
          <img v-for="tile in underlayTiles" :key="'u' + tile.key" class="mp-tile"
            :class="{ 'is-inverted': invertTiles }" :src="tile.src" :style="tile.style" alt=""
            draggable="false" referrerpolicy="no-referrer" />
        </div>

        <!-- 视口 = 容器实际像素，瓦片按 256px 原样铺。
             stage 只负责滚轮的连续缩放（围绕视口中心），inner 负责按钮 / 双击的
             一次完整级差动画（围绕锚点），两者拆开就不会在同一个 transform-origin
             上互相打架。 -->
        <!-- 右键不弹系统菜单：双击右键 = 缩小（见 handleContextMenu）。
             只挂在 stage 上，胶囊按钮和右下角的版权字都不受影响 -->
        <div ref="stageEl" class="mp-stage" :class="{ 'is-dragging': dragging }"
          :style="stageStyle" @pointerdown="handlePointerDown" @dragstart.prevent
          @contextmenu="handleContextMenu" @wheel.prevent.stop="handleWheel">
          <div class="mp-stage-inner" :style="innerStyle">
            <img v-for="tile in tiles" :key="tile.key" class="mp-tile"
              :class="{ 'is-failed': failedKeys.has(tile.key), 'is-inverted': invertTiles }"
              :src="tile.src" :style="tile.style" :data-key="tile.key" alt="" draggable="false"
              referrerpolicy="no-referrer" @load="handleTileLoad" @error="handleTileError" />

            <div v-if="pinStyle" class="mp-pin" :style="pinStyle">
              <span class="mp-pin-ripple"></span>
              <svg class="mp-pin-icon" viewBox="0 0 24 32" aria-hidden="true">
                <path
                  d="M12 1.2c-5.6 0-10.1 4.5-10.1 10.1 0 7.3 10.1 19 10.1 19s10.1-11.7 10.1-19c0-5.6-4.5-10.1-10.1-10.1z"
                  fill="var(--color-primary)" stroke="var(--text-on-accent)" stroke-width="1.5" stroke-linejoin="round" />
                <circle cx="12" cy="11.3" r="3.9" fill="var(--text-on-accent)" />
              </svg>
            </div>
          </div>
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
        拖动平移 · 滚轮缩放 · 点击选点 · 双击/右键缩放
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
      <StaggerTransition :preset="fullscreen ? 'mapControls' : 'panel'" :index="3">
        <div v-show="controlsVisible" class="mp-zoom" role="group" aria-label="地图缩放">
          <button class="mp-zoom-btn" type="button" title="放大（滚轮向上 / 双击左键）" aria-label="放大"
            :disabled="zooming || fsBusy || zoom >= ZOOM_MAX" @click.stop="zoomIn">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <span class="mp-zoom-sep" aria-hidden="true"></span>
          <button class="mp-zoom-btn" type="button" title="缩小（滚轮向下 / 双击右键）" aria-label="缩小"
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
      </StaggerTransition>
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
  formatLatLng,
  lngLatToViewPixel,
  lngLatToWorld,
  minZoomForViewport,
  tileUrl,
  toMapCoord,
  toQueryCoord,
  viewOrigin,
  viewPixelToLngLat,
  worldToLngLat,
} from './mapTiles'
import { isReverseGeocodeEnabled, reverseGeocode } from './reverseGeocode'
import { isPlaceLookupAvailable, joinAdminParts, lookupPlaceByCoord, nearbyLabel } from './placeLookup'
import { AmapKey } from '@/api/credentials'
import { ColorTheme } from '@/features/wallpaper/properties'
import StaggerTransition from '@/shared/motion/StaggerTransition'

// eslint-disable-next-line no-undef
const props = defineProps({
  // 初始视口中心 [lng, lat]，由调用方按区县中心传入；之后由拖拽接管
  center: { type: Array, required: true },
  zoom: { type: Number, default: ZOOM_DEFAULT },
  // 是否渲染自带的底部操作条；嵌进地址页时由外层统一放按钮
  bar: { type: Boolean, default: true },
  // 是否撑满父容器（父容器必须有确定高度）；默认按 1:1 方形
  fill: { type: Boolean, default: false },
  // 初始 pin（落库坐标系：大陆 GCJ-02）。从「最近」进来时把上次的点摆好，用户可以微调也可以直接确认
  initialPoint: { type: Object, default: null },
  // 是否处于全屏。真正的「铺满屏幕」由外层完成（整块面板 teleport 到 body），
  // 这里只负责：量尺寸、算相机、把裁切框从卡片那块展开出去
  fullscreen: { type: Boolean, default: false },
  controlsVisible: { type: Boolean, default: true },
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

/* ---------------- 滚轮缩放 ----------------
 * 滚轮不走按钮的「±1 级」逻辑：把 deltaY 当成真实像素位移，按比例换算成
 * 连续的缩放量。鼠标一格约 100px ≈ 0.12 级（约 8.7%），只前进一小步；
 * 触控板本来就是像素级输入，同一条比例曲线自然跟手。
 *
 * 不用 CSS transition：缩放期间 center 也跟着改，只过渡 transform 会和瓦片
 * 位置脱节。这里用 rAF 把当前级别追向目标级别（约 35ms 时间常数），
 * 鼠标一格也能看到一小段连续的推近 / 拉远，而不是一帧跳完。
 */
const WHEEL_ZOOM_PER_PX = 0.0012
const WHEEL_EASE_MS = 35

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

// 视口中心（地图坐标系）与连续缩放。zoom 可以是小数：
// 瓦片只按整数级取，剩下的级差用 tileScale 表现，地图就不会一格一跳。
const center = ref([...(props.center || [0, 0])])
const zoom = ref(props.zoom)
// 动画缩放：只给按钮 / 双击的一次完整级差用；滚轮不动它
const k = ref(1)
// 瓦片只请求整数级；zoom 的小数部分全部由这一层的 scale 补上。
// 取最近整数级，scale 落在 [0.707, 1.414]，放大 / 缩小都不会太糊。
const MIN_TILE_SCALE = 1 / Math.SQRT2
const tileZoom = computed(() => Math.round(zoom.value))
const tileScale = computed(() => 2 ** (zoom.value - tileZoom.value))
// scale<1 时需要多铺一圈。按 5% 分桶，既不会每帧重建瓦片列表，
// 又不会一直按最坏情况多请求一大圈边缘瓦片
const tilePadScale = computed(() => {
  const s = tileScale.value
  if (s >= 1) return 1
  return Math.max(MIN_TILE_SCALE, Math.floor(s * 20) / 20)
})
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
// picked = 落库 / 查询坐标系（和风的：大陆 GCJ-02、境外 WGS-84），对外展示与 emit 都用它
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
// 滚轮：目标级别、锚点（屏幕像素 + 地理位置）、补间帧、上一帧时间
let wheelRaf = 0
let wheelTargetZoom = null
let wheelAnchorPx = null
let wheelAnchorGeo = null
let wheelLastFrameAt = 0
let roadTimer = 0
let roadCtrl = null
// 请求序号：连点时只有最后一次允许写回结果，旧响应晚到直接丢弃
let roadSeq = 0
// 「等这次查询落地」的等待者（确认选点时用，见 waitRoad）
let roadWaiter = null

const attribution = computed(() => TILE_SOURCES[source].label)
// OSM 之类亮色底图靠滤镜压暗，贴合壁纸的深色玻璃风格
const invertTiles = computed(() => !!TILE_SOURCES[source].invert && ColorTheme.value === 'night')

// 缩放下限：卡片里固定 11（看得到路名才有意义），全屏按视口算到「整个世界正好铺满」
const minZoom = computed(() => (
  props.fullscreen ? minZoomForViewport(viewW.value) : ZOOM_MIN
))

// 屏幕坐标点必须是有限数。这条以前漏过：toViewPoint 返回 {px,py}，
// animateZoom 读的是 {x,y}，property 名对不上就直接算出 NaN 坐标
const isFinitePoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y)

/**
 * 视口外始终多留一圈瓦片。
 *
 * 滚轮缩小是连续的：当前这一帧刚好铺满视口，下一帧 stage 就会缩到 0.7 倍，
 * 四周立刻要看视口外的内容。等缩到边缘再发请求已经来不及，会先闪一圈白底。
 * 所以不管当前 scale 是多少，都提前请求视口外一整圈；缩小时这一圈已经在缓存里。
 */
const PRELOAD_TILE_RING = 1

/**
 * 按给定状态算瓦片列表。
 *
 * 铺图范围 = 视口 + 缩放补偿 + 预加载外圈，四边都用显式 tile 边界计算，
 * 不再用 cols/rows 凑，避免某个方向少铺一张。
 *
 * state.scale < 1 时瓦片层会被围绕中心缩小，视口边缘需要看到当前铺图范围
 * 之外的内容；这里按缩小比例补一圈，避免四周露出打底色。
 */
const buildTiles = (state, width, height) => {
  if (!width || !height) return []
  // 中心点必须是有限数：一旦是 NaN，瓦片索引会算成 NaN 拼进 URL
  // （曾因 anchorPoint 的属性名写错，拼出 webrd0nan/...&x=NaN&y=NaN）
  const [clng, clat] = state.center || []
  if (!Number.isFinite(clng) || !Number.isFinite(clat)) return []
  const total = 2 ** state.zoom
  const [ox, oy] = viewOrigin(state.center, state.zoom, width, height)
  // scale<1 时围绕中心缩小，四周要看到当前铺图范围之外的内容
  const needPad = Number.isFinite(state.scale) && state.scale < 1
  const padRatio = needPad ? 1 / state.scale - 1 : 0
  const padX = needPad ? (width / 2) * padRatio : 0
  const padY = needPad ? (height / 2) * padRatio : 0
  // 当前缩放真正需要的范围（不含预加载圈）
  const coreTx0 = Math.floor((ox - padX) / TILE_SIZE)
  const coreTy0 = Math.floor((oy - padY) / TILE_SIZE)
  const coreTx1 = Math.ceil((ox + width + padX) / TILE_SIZE) - 1
  const coreTy1 = Math.ceil((oy + height + padY) / TILE_SIZE) - 1
  // 再向外多铺一圈：缩小时这圈瓦片已经提前加载过
  const tx0 = coreTx0 - PRELOAD_TILE_RING
  const ty0 = coreTy0 - PRELOAD_TILE_RING
  const tx1 = coreTx1 + PRELOAD_TILE_RING
  const ty1 = coreTy1 + PRELOAD_TILE_RING
  // 点「重试」后带一个只影响缓存的查询参数；不加的话 <img> 的 src 没变，
  // 浏览器可能直接复用失败结果 / 不重新请求
  const bust = retryTick.value ? `_r=${retryTick.value}` : ''
  const list = []
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      // 纬度方向没有环绕，越界直接跳过
      if (ty < 0 || ty >= total) continue
      // 经度方向环绕，避免跨 180° 时出现空列
      const wx = ((tx % total) + total) % total
      const url = tileUrl(source, state.zoom, wx, ty)
      const src = bust ? `${url}${url.includes('?') ? '&' : '?'}${bust}` : url
      list.push({
        // 重试计数写进 key：Vue 会换掉旧的 <img>，重新派发 load / error。
        // 位置用未环绕的 tx：低级别跨 180° 时同一张图可能同时出现在屏幕两侧，
        // 用 wx 会让两个 <img> 撞 key
        key: `${source}/${state.zoom}/${tx}/${ty}/${retryTick.value}`,
        src,
        // 预加载圈只负责提前进缓存，不参与「地图加载中」和失败判定：
        // 屏幕内已经画好了就不该因为屏幕外一张边缘图慢而顶着加载提示
        preload: tx < coreTx0 || tx > coreTx1 || ty < coreTy0 || ty > coreTy1,
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
  {
    zoom: tileZoom.value,
    center: center.value,
    scale: tilePadScale.value,
  },
  viewW.value,
  viewH.value
))

// 加载状态只看「当前视口 + 缩放补偿」需要的瓦片；预加载外圈不进账，
// 否则屏内早就画好了，还会因为屏幕外一张边缘图没回来而显示「地图加载中」
const activeTiles = computed(() => tiles.value.filter((tile) => !tile.preload))

// 还没拿到结果的瓦片数：只统计「当前这一屏」里既没 load 也没 error 的。
// 换成按 key 记账后，复用的 <img> 不会再把计数顶上去
const pending = computed(() => activeTiles.value.filter(
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

// 当前这一屏里已经画出来 / 已经明确失败的瓦片数（同样不含预加载外圈）
const failedInView = computed(() => activeTiles.value.filter(
  (tile) => failedKeys.has(tile.key)
).length)
const loadedInView = computed(() => activeTiles.value.filter(
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
  const total = activeTiles.value.length
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

// 垫着的拖动位移 + 滚轮的连续级差共用这个 transform；
// 缩放时 pan 恒为 0（拖动已松手并提交），两者不会互相干扰。
// 全屏裁切在外层 .mp-clip 上，不会跟着这里的 scale 一起被缩放
const stageStyle = computed(() => ({
  transform: `translate3d(${pan.value.x}px, ${pan.value.y}px, 0) scale(${tileScale.value})`,
  transformOrigin: '50% 50%',
}))

// 按钮 / 双击的完整级差单独放在内层，围绕锚点缩放；
// 滚轮的 tileScale 在外层围绕视口中心，两个 origin 互不干扰
const innerStyle = computed(() => ({
  transform: `scale(${k.value})`,
  transformOrigin: anchor.value,
}))

const underlayStyle = computed(() => {
  const u = underlay.value
  const origin = u?.origin
  return {
    transform: `translate3d(${pan.value.x}px, ${pan.value.y}px, 0) scale(${u?.scale || 1})`,
    transformOrigin: origin ? `${origin.x}px ${origin.y}px` : '50% 50%',
  }
})

// pin 会跟着 stage 的 tileScale 和内层的 k 一起放大，用 1/(tileScale*k)
// 反补；transform-origin 在尖端，所以缩放时尖端始终钉在地理点上
const pinStyle = computed(() => {
  if (!point.value) return null
  // 摆在内层瓦片坐标系（tileZoom），外层 stage 的 tileScale 会把它带到
  // 连续级别 zoom 对应的屏幕上；直接按 zoom 算会再被 tileScale 缩一次
  const [px, py] = lngLatToViewPixel(
    point.value.lng, point.value.lat, center.value, tileZoom.value, viewW.value, viewH.value
  )
  const totalScale = Math.max(0.001, tileScale.value * k.value)
  return {
    left: `${px}px`,
    top: `${py}px`,
    transform: `translate(-50%, -100%) scale(${1 / totalScale})`,
  }
})

const coordText = computed(() =>
  picked.value
    ? formatLatLng(picked.value.lat, picked.value.lng)
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
 * 不要在外层再发一次 —— 同一个点查两遍既多花一次高德配额，两次响应又一前一后
 * 回来时，晚到的旧结果可能把新 pin 的地名覆盖掉
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
        // target 是地图坐标系；高德和地图瓦片用的是同一套坐标系，直接传源的 crs
        const amap = await reverseGeocode(target.lng, target.lat, {
          crs: TILE_SOURCES[source].crs,
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
    //    两者取其一，不重复发请求；入参用和风的坐标系（大陆 GCJ-02），
    //    高德源下就是 target 本身，不需要换算
    if (seq !== roadSeq) return
    if ((!info || (!info.road && !info.district)) && isPlaceLookupAvailable()) {
      const [qLng, qLat] = toQueryCoord(target.lng, target.lat, TILE_SOURCES[source].crs)
      try {
        const place = await lookupPlaceByCoord(qLng, qLat, {
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
    // 带上落库坐标，外层可以核对这是不是当前这个 pin 的结果
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

// 把外部传入的落库坐标摆成 pin（查询坐标系 → 地图坐标系）。
// 只给「从最近记录进来」用；用户点过之后 props 不再变，不会把 pin 拽回去
const applyPoint = (p) => {
  if (!p || !Number.isFinite(p.lng) || !Number.isFinite(p.lat)) {
    reset()
    return
  }
  const [lng, lat] = toMapCoord(p.lng, p.lat, TILE_SOURCES[source].crs)
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
 * @param {{lng:number,lat:number}|null} pin 要摆放的落库坐标；null = 不摆 pin
 * @param {{zoom?: number}} [options] zoom 指定落点级别（全屏里从地区卡片重选时用街道级）
 */
const focusTo = (nextCenter, pin = null, options = {}) => {
  const [lng, lat] = nextCenter || []
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
  cancelWheelZoom()
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
  // 兜底：万一 load 事件没来（缓存/中断），不能一直压着一层旧图。
  // 正常情况由下面的 pending watch 在新瓦片齐了之后 160ms 撤掉；
  // 这里留 4s 给慢请求，避免 1.6s 就撤、边缘几张图还在路上时露出白块
  underlayTimer = setTimeout(() => { underlay.value = null }, 4000)
}

/**
 * 算出「目标级别下锚点仍压着同一个地理位置」时的视口中心。
 * 按钮 / 双击动画从当前画面反查锚点；滚轮因为锚点地理坐标已经固定，
 * 走下面的 centerForAnchorGeo，避免每帧反查累积浮点误差。
 */
const centerForAnchoredZoom = (target, fromCenter, fromZoom, pivot) => {
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
  if (!Number.isFinite(candidate[0]) || !Number.isFinite(candidate[1])) {
    return [...fromCenter]
  }
  return clampCenter(candidate)
}

/**
 * 两次围绕不同原点的缩放叠加后，仍然是一次等比缩放。
 * 返回等效 origin，让垫底层可以用单个 transform 复刻「外层 tileScale
 * 围绕视口中心 + 内层动画围绕锚点」的合成效果。
 */
const composeScaleOrigin = (outerScale, innerScale, pivot) => {
  const cx = viewW.value / 2
  const cy = viewH.value / 2
  const total = outerScale * innerScale
  // total=1 时没有缩放，origin 取哪里都不影响；用一个安全值避免除零
  if (Math.abs(total - 1) < 1e-6) return { x: cx, y: cy }
  return {
    x: (cx * (1 - outerScale) + pivot.x * (outerScale - total)) / (1 - total),
    y: (cy * (1 - outerScale) + pivot.y * (outerScale - total)) / (1 - total),
  }
}

/**
 * 缩放动画（按钮 / 双击）。
 *
 * 一次完整级差（2 倍）仍然走动画，但分两段：
 *   外层 stage 的 tileScale 是滚轮留下的连续级差（可能 0.8 / 1.3），
 *   内层 k 再从 1 走到 2（缩小反向从 0.5 走到 1）。
 * 两者叠起来正好是目标级别；收尾时把 stage 换成目标状态，内外两层同时
 * 归位，画面不会先缩一下再跳回来。
 *
 * 放大：先留着旧瓦片，内层 k 从 1 放大到 2，k=2 时旧图覆盖的地理范围
 *       正好等于新视野，此刻换瓦片没有位移。
 * 缩小：先把目标瓦片放到 2 倍（与当前视野重合）再缩回 1；目标瓦片始终
 *       被放大、盖满视口，旧图只在底下垫着。
 *
 * @param {number} target 目标级别（可以是小数）
 * @param {{x:number,y:number}|null} anchorPx 缩放锚点（视口像素）；null = 视口中心
 */
const animateZoom = (target, anchorPx = null) => {
  // 按钮 / 双击开始动画时，丢掉还没跑完的滚轮补间
  cancelWheelZoom()
  if (zooming.value) return
  const targetZoom = Math.min(ZOOM_MAX, Math.max(minZoom.value, target))
  const fromZoom = zoom.value
  if (Math.abs(targetZoom - fromZoom) < 1e-5) return
  // 缩放和拖动位移不能共存：先把残留位移折进 center，动画的 transform 里就只剩 scale
  if (pan.value.x || pan.value.y) commitPan()

  const fromCenter = [...center.value]
  const fromTileZoom = tileZoom.value
  const fromTileScale = tileScale.value
  const zoomIn = targetZoom > fromZoom
  const stepScale = 2 ** (targetZoom - fromZoom)
  const fromK = zoomIn ? 1 : 1 / stepScale
  const toK = zoomIn ? stepScale : 1

  const pivot = isFinitePoint(anchorPx)
    ? anchorPx
    : { x: viewW.value / 2, y: viewH.value / 2 }
  anchorPoint.value = pivot

  const nextCenter = centerForAnchoredZoom(targetZoom, fromCenter, fromZoom, pivot)

  zooming.value = true
  k.value = fromK

  if (!zoomIn) {
    // 缩小：先换到目标瓦片，内层放大 1/stepScale 倍，视觉上和当前一帧完全相同
    underlay.value = {
      zoom: fromTileZoom,
      center: fromCenter,
      scale: fromTileScale,
      origin: { x: viewW.value / 2, y: viewH.value / 2 },
    }
    center.value = nextCenter
    zoom.value = targetZoom
  }

  const startedAt = performance.now()

  const commit = () => {
    cancelAnimationFrame(rafId)
    clearTimeout(zoomGuard)
    rafId = 0
    zoomGuard = 0
    if (!zooming.value) return
    if (zoomIn) {
      // 旧瓦片放大 stepScale 倍后与新视野重合，留在底下等新瓦片画上来。
      // 旧图本身可能还带 tileScale，合成后才是真正的总倍数
      const origin = composeScaleOrigin(fromTileScale, stepScale, pivot)
      underlay.value = {
        zoom: fromTileZoom,
        center: fromCenter,
        scale: fromTileScale * stepScale,
        origin,
      }
      center.value = nextCenter
      zoom.value = targetZoom
    }
    k.value = 1
    anchorPoint.value = null
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

/* ---------------- 滚轮缩放 ---------------- */

// wheel 的 delta 单位不一定是像素：行 / 页要换算成视口像素
const wheelDeltaPx = (event) => {
  if (event.deltaMode === 1) return event.deltaY * 16
  if (event.deltaMode === 2) return event.deltaY * Math.max(1, viewH.value)
  return event.deltaY
}

/**
 * 滚轮事件位置 → 逻辑视口像素。
 *
 * 用 viewportBox 还原 stage 未缩放的屏幕矩形；不能直接用 stage 的
 * getBoundingClientRect：stage 自身带着 tileScale，量出来会被放大 / 缩小。
 */
const wheelPointFromEvent = (event) => {
  const box = viewportBox()
  if (!box || !viewW.value || !viewH.value) return null
  const x = (event.clientX - box.left) * (viewW.value / box.width)
  const y = (event.clientY - box.top) * (viewH.value / box.height)
  if (x < 0 || y < 0 || x > viewW.value || y > viewH.value) return null
  return { x, y }
}

/**
 * 锚点地理坐标固定时，算出目标级别对应的视口中心。
 * 和 centerForAnchoredZoom 的区别是：这里不需要每次从当前 center 反查，
 * 滚轮补间连续调用时不会因为浮点误差把锚点慢慢漂走。
 */
const centerForAnchorGeo = (target, anchorGeo, pivot) => {
  const [wx, wy] = lngLatToWorld(anchorGeo[0], anchorGeo[1])
  const scale = 2 ** target * TILE_SIZE
  return clampCenter(worldToLngLat(
    wx - (pivot.x - viewW.value / 2) / scale,
    wy - (pivot.y - viewH.value / 2) / scale
  ))
}

/**
 * 把连续级别应用到相机上。瓦片只换整数级，小数部分交给 stage 的 scale；
 * 换级时把当前画面压进 underlay，等新瓦片铺上来再撤掉。
 */
const applyViewZoom = (target, pivot, anchorGeo) => {
  const nextZoom = Math.min(ZOOM_MAX, Math.max(minZoom.value, target))
  if (Math.abs(nextZoom - zoom.value) < 1e-5) return
  const fromTileZoom = tileZoom.value
  const fromCenter = [...center.value]
  const fromTileScale = tileScale.value
  const nextCenter = centerForAnchorGeo(nextZoom, anchorGeo, pivot)

  center.value = nextCenter
  zoom.value = nextZoom

  if (tileZoom.value !== fromTileZoom) {
    underlay.value = {
      zoom: fromTileZoom,
      center: fromCenter,
      scale: fromTileScale,
      origin: { x: viewW.value / 2, y: viewH.value / 2 },
    }
    scheduleUnderlayDrop()
  }
}

/**
 * 清掉滚轮的目标级别和补间帧。
 * 外部换视野、进 / 退全屏、开始拖拽之前都要调：相机已经切走了，
 * 滚轮补间再跑下去就会把用户刚切到的位置顶飞。
 */
const cancelWheelZoom = () => {
  cancelAnimationFrame(wheelRaf)
  wheelRaf = 0
  wheelTargetZoom = null
  wheelAnchorPx = null
  wheelAnchorGeo = null
  wheelLastFrameAt = 0
}

/**
 * 滚轮补间：每帧朝目标级别追一点，时间常数约 35ms。
 * 不做长动画、不排队；目标被新的 wheel 事件连续改写时，只是换一个追赶方向。
 */
const wheelFrame = (now) => {
  wheelRaf = 0
  if (wheelTargetZoom == null || !wheelAnchorPx || !wheelAnchorGeo) return
  const diff = wheelTargetZoom - zoom.value
  if (Math.abs(diff) < 0.0005) {
    applyViewZoom(wheelTargetZoom, wheelAnchorPx, wheelAnchorGeo)
    wheelTargetZoom = null
    wheelAnchorPx = null
    wheelAnchorGeo = null
    wheelLastFrameAt = 0
    return
  }

  const dt = wheelLastFrameAt ? Math.min(50, now - wheelLastFrameAt) : 16
  wheelLastFrameAt = now
  const alpha = 1 - Math.exp(-dt / WHEEL_EASE_MS)
  const next = zoom.value + diff * alpha
  const before = zoom.value
  applyViewZoom(next, wheelAnchorPx, wheelAnchorGeo)
  // 已经卡在上下限：补间没必要再空转
  if (Math.abs(zoom.value - before) < 1e-5 && Math.abs(next - zoom.value) > 0.0005) {
    wheelTargetZoom = null
    wheelAnchorPx = null
    wheelAnchorGeo = null
    wheelLastFrameAt = 0
    return
  }
  wheelRaf = requestAnimationFrame(wheelFrame)
}

const handleWheel = (event) => {
  // 全屏展开 / 收回期间相机在过渡，再叠一层缩放会打架；
  // 拖着地图时同理，别让滚轮插进来把相机从指针底下抽走
  if (fsBusy.value || dragState || zooming.value) return
  const pt = wheelPointFromEvent(event)
  if (!pt) return
  const delta = wheelDeltaPx(event)
  if (!Number.isFinite(delta) || delta === 0) return
  // 滚轮和拖动位移不能共存：先把残余位移折进 center，锚点坐标才对得上
  if (pan.value.x || pan.value.y) commitPan()

  const [lng, lat] = viewPixelToLngLat(
    pt.x, pt.y, center.value, zoom.value, viewW.value, viewH.value
  )
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return

  // 锚点每次按当前画面取：指针没动时得到的是同一个地理点，
  // 指针挪了位置就自然换成新位置下的点，不会把地图从指针底下扯走
  wheelAnchorPx = pt
  wheelAnchorGeo = [lng, lat]
  // 向下滚 = 缩小，向上滚 = 放大，和常见地图一致
  const base = wheelTargetZoom == null ? zoom.value : wheelTargetZoom
  wheelTargetZoom = Math.min(
    ZOOM_MAX,
    Math.max(minZoom.value, base - delta * WHEEL_ZOOM_PER_PX)
  )
  if (!wheelRaf) {
    wheelLastFrameAt = 0
    wheelRaf = requestAnimationFrame(wheelFrame)
  }
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
  // 拖动开始前先放弃待执行的滚轮，避免松手后地图又自己补一级
  cancelWheelZoom()
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
 * 锚点现在两个方向都用：缩小从 2 倍缩回 1 倍时也以右键位置为轴，
 * 和滚轮缩放 / 双击放大保持同一种手感。
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

// 事件坐标 → 视口内像素；落在视口外返回 null。
// 同样走 viewportBox，避开 stage 上的 tileScale。
const toViewPoint = (event) => {
  const box = viewportBox()
  if (!box || !Number.isFinite(event?.clientX)) return null
  const px = (event.clientX - box.left) * (viewW.value / box.width)
  const py = (event.clientY - box.top) * (viewH.value / box.height)
  if (px < 0 || py < 0 || px > viewW.value || py > viewH.value) return null
  return { x: px, y: py }
}

const pickAt = (pt) => {
  if (!isFinitePoint(pt)) return
  const [lng, lat] = viewPixelToLngLat(
    pt.x, pt.y, center.value, zoom.value, viewW.value, viewH.value
  )

  // 两种坐标不能混用：pin 用地图坐标系，落库 / 查询用和风的坐标系
  point.value = { lng, lat }
  const [qLng, qLat] = toQueryCoord(lng, lat, TILE_SOURCES[source].crs)
  picked.value = { lng: qLng, lat: qLat }
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
  cancelWheelZoom()
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
  fsBusy.value = true
  try {
    settleMotion()
    const box = viewportBox()
    if (!box) return
    const rect = {
      left: box.left,
      top: box.top,
      right: box.left + box.width,
      bottom: box.top + box.height,
    }
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
  cancelWheelZoom()
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

/**
 * stage 在屏幕上的「未缩放」矩形。
 * 不能用 stage.getBoundingClientRect()：它带着 tileScale，量出来是缩放后的；
 * clientWidth / clientHeight 是布局尺寸，再借 wrap 的边框偏移还原左上角。
 */
const viewportBox = () => {
  const stage = stageEl.value
  if (!stage) return null
  const width = stage.clientWidth
  const height = stage.clientHeight
  if (!width || !height) return null
  const wrap = wrapEl.value
  if (!wrap) return { left: 0, top: 0, width, height }
  const rect = wrap.getBoundingClientRect()
  return {
    left: rect.left + wrap.clientLeft,
    top: rect.top + wrap.clientTop,
    width,
    height,
  }
}

const measure = () => {
  const stage = stageEl.value
  if (!stage) return
  viewW.value = Math.max(1, Math.round(stage.clientWidth))
  viewH.value = Math.max(1, Math.round(stage.clientHeight))
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
  if (typeof ResizeObserver !== 'undefined' && wrapEl.value) {
    observer = new ResizeObserver(scheduleMeasure)
    observer.observe(wrapEl.value)
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
  cancelWheelZoom()
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
  cancelWheelZoom()
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
  if (!Number.isFinite(value)) return
  cancelWheelZoom()
  zoom.value = value
})

// 外层强制收回（比如「重选地区」时动画正好被占住）：把裁切和淡出状态一起清掉
watch(() => props.fullscreen, (on) => {
  if (on) return
  cancelWheelZoom()
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
    radial-gradient(120% 100% at 50% 0%, var(--glass-bg-soft), rgba(255, 255, 255, 0) 62%),
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

/* 全屏展开/收回只改这一层的 clip-path，不动 stage 的 transform：
   瓦片不会被拉伸变糊，裁切矩形也不会被 tileScale 缩放。
   时长要和 MapPointPicker 里的 FS_DURATION 保持一致 */
.mp-clip {
  position: absolute;
  inset: 0;
  /* 只在这里裁：这层不参与 transform，裁切框就是视口本身。
     stage / underlay 自己带 scale，绝不能在它们身上写 overflow:hidden ——
     scale<1 时会先按视口裁掉、再把整个裁切结果一起缩小，四周就露出白边 */
  overflow: hidden;
  transition: clip-path 320ms var(--ease), opacity 130ms ease;
}

.mp-layer {
  position: absolute;
  inset: 0;
  /* 同样不能裁：这层可能带着 <1 的 scale（旧图垫底时） */
  pointer-events: none;
}

.mp-stage {
  position: absolute;
  inset: 0;
  cursor: grab;
  touch-action: none;
  overscroll-behavior: contain;
  user-select: none;
  will-change: transform;

  &.is-dragging {
    cursor: grabbing;
  }
}

/* 按钮 / 双击的内层动画：围绕锚点做一次完整级差。
   stage 自己的 tileScale 围绕视口中心，两层 origin 分开互不影响 */
.mp-stage-inner {
  position: absolute;
  inset: 0;
  will-change: transform;
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
  background: var(--color-primary);
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
  background: var(--surface-modal);
  border: 1px solid rgba(248, 113, 113, 0.4);
  border-radius: var(--radius-md);
  box-shadow: 0 1rem 2.5rem -0.75rem rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.mp-fallback-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--danger-text);
}

.mp-fallback-text {
  margin: 0.5rem 0 0.875rem;
  font-size: 0.84rem;
  line-height: 1.65;
  color: var(--text-secondary);

  strong {
    font-weight: 600;
    color: var(--color-primary-soft);
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
  background: var(--surface-modal);
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
  color: var(--rain-chip-text);
  background: var(--surface-modal);
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
  color: var(--text-muted);
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
  background: var(--surface-modal);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  box-shadow: 0 0.5rem 1.25rem -0.5rem rgba(0, 0, 0, 0.7), inset 0 1px 0 var(--glass-bg-soft);
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
    color: var(--color-primary-soft);
    background: var(--glass-active);
  }

  &:active:not(:disabled) {
    transform: scale(0.92);
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
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
  background: var(--glass-bg-soft);
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
  color: var(--color-primary-soft);
  background: var(--glass-active);
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
  color: var(--text-on-accent);
  background: var(--color-primary);
  border-color: transparent;

  &:hover {
    background: var(--color-primary);
    filter: brightness(1.08);
  }
}
</style>
