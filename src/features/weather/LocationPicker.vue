<template>
  <div ref="rootRef" class="panel-view LocationPicker">
    <!-- ⚠️ 这段说明必须放在根节点「里面」：模板最外层多一条 HTML 注释，根节点就变成
         「注释 + div」的多根 Fragment，Vue 的 <Transition> 会报
         "Component inside <Transition> renders non-element root node that cannot be animated"，
         并且面板切换时旧面板的 DOM 不会被移除 —— 表现就是「地址页关掉了，但卡片里那层地图还在」
         （实测：关掉后 .weather-shell 里同时留着 LocationPicker 和天气卡）。
         同理，Teleport 也只能在里面，不能当根节点。 -->
    <!-- 全屏：把这块内容搬出卡片外壳。外壳是 overflow: hidden + backdrop-filter，
         地图在里面写 position: fixed 只会被裁在卡片里，所以必须 teleport 到 body 才铺得满全屏。
         卡片形态下 Teleport 是 disabled 的：.lp-frame 就留在卡片里当列布局的容器，
         两种形态的排版差异全由 .lp-frame.is-fs 承担（见样式） -->
    <Teleport to="body" :disabled="!mapFullscreen">
      <div class="lp-frame"
        :class="{ 'is-fs': mapFullscreen }">
        <!-- 标题和热门/最近：卡片里原样参与排版（display: contents），
             全屏时整体变成屏幕上沿那块悬浮卡片 -->
        <StaggerTransition preset="mapTop" :enabled="mapFullscreen" :appear="false">
          <div v-show="chromeVisible" class="lp-top">
            <StaggerTransition preset="panel" :enabled="!mapFullscreen">
              <header v-show="mapFullscreen || chromeVisible" class="lp-head">
                <div class="lp-head-text">
                  <!-- 地图步骤标题直接用当前选中的详细地址（省-市-区-街道-路）；
                       地址还没拿到时退回原本文案 -->
                  <h2 class="lp-title">{{ title }}</h2>
                  <p class="lp-sub">{{ subText }}</p>
                </div>
                <!-- 日常地址页只留「返回天气」；面板不会自己关，用户想待多久就待多久 -->
                <div v-if="dismissable" class="lp-head-side">
                  <button class="lp-back" type="button" @click="requestClose">返回天气</button>
                </div>
              </header>
            </StaggerTransition>

            <!-- 热门 / 最近：两步都常驻。选完区县进地图后依然留在页面上，
                 方便在"精确选点"这一步直接换城市，而不用退回三列重选 -->
            <StaggerTransition preset="panel" :index="1" :enabled="!mapFullscreen">
              <div v-show="mapFullscreen || chromeVisible" class="lp-chips">
                <div class="lp-chip-row">
                  <span class="lp-chip-label">热门</span>
                  <button v-for="city in HOT_CITIES" :key="city.label" class="lp-chip" type="button"
                    :class="{ 'is-current': isHotCitySelected(city.path) }"
                    :aria-pressed="isHotCitySelected(city.path)"
                    :disabled="submitting || locating" @click="applyIds(city.path)">{{ city.label }}</button>
                </div>
                <div v-if="history.length" class="lp-chip-row">
                  <span class="lp-chip-label">最近</span>
                  <!-- 一条记录 = 「选中」和「删除」两个按钮。不能把删除按钮嵌进选中按钮里：
                       <button> 里面套 <button> 是非法结构，键盘和读屏都会乱 -->
                  <div v-for="item in history" :key="locationHistoryKey(item)" class="lp-chip-history"
                    :class="{ 'is-current': isHistoryCurrent(item) }">
                    <button class="lp-chip-main" type="button" :aria-pressed="isHistoryCurrent(item)"
                      :disabled="submitting || locating" @click="applyHistory(item)">{{ item.label }}</button>
                    <button class="lp-chip-remove" type="button"
                      :aria-label="`删除最近地址：${item.label}`" :title="`删除「${item.label}」`"
                      :disabled="submitting || locating" @click="removeHistoryItem(item)">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  </div>
                  <button class="lp-chip-clear" type="button" :disabled="submitting || locating"
                    @click="clearLocationHistory()">清空</button>
                </div>
              </div>
            </StaggerTransition>
          </div>
        </StaggerTransition>

        <!-- 中间区域：三列 ↔ 地图。只换这一块，热门/最近与页脚都不动 -->
        <StaggerTransition preset="mapSurface">
          <div class="lp-body" :class="{ 'is-locating': locating }">
            <Transition name="lp-swap" mode="out-in">
              <div v-if="step === 'cascade'" key="cascade" class="lp-columns">
                <RegionCascade :path="selectedPath" @select="handleCascadeSelect" />
              </div>

              <!-- 第二步：选完区县后，在地图上点一个更精确的位置 -->
              <div v-else key="map" class="lp-map">
                <MapPointPicker ref="mapRef" :center="districtCenter" :initial-point="mapInitialPoint" :fill="true"
                  :bar="false" :fullscreen="mapFullscreen" :controls-visible="chromeVisible" @pick="handlePick" @road="handleRoad"
                  @confirm="handleMapConfirm" @update:fullscreen="handleFullscreenChange"
                  @fs-leaving="handleFsLeaving" />
              </div>
            </Transition>
          </div>
        </StaggerTransition>

        <StaggerTransition :preset="mapFullscreen ? 'mapBottom' : 'panel'" :index="mapFullscreen ? 1 : 5">
          <footer v-show="chromeVisible" class="lp-foot">
            <span class="lp-path">{{ step === 'cascade' ? pathText : coordText }}</span>
            <div class="lp-foot-right">
              <span v-if="locating" class="lp-hint">正在定位…</span>
              <span v-if="errorText" class="lp-error">{{ errorText }}</span>
              <template v-if="step === 'cascade'">
                <button class="lp-confirm" type="button" :disabled="!canConfirm || submitting || locating"
                  @click="handleFooterAction">
                  {{ submitting ? '正在获取天气…' : confirmText }}
                </button>
              </template>
              <template v-else>
                <button ref="reselectBtnRef" class="lp-back" type="button" :disabled="submitting || locating"
                  @click="handleReselect">重选地区</button>
                <button class="lp-confirm" type="button" :disabled="submitting || locating" @click="confirm(pickedPoint)">
                  {{ submitting ? '正在获取天气…' : pickedPoint ? '就用这里' : '用中心坐标' }}
                </button>
              </template>
            </div>
          </footer>
        </StaggerTransition>

        <!-- 点卡片外返回时，如果 pin 已经移动过，先确认再丢掉这次修改。
             Teleport 到 body：卡片外壳有 overflow: hidden，弹层留在里面会被裁掉 -->
        <Teleport to="body">
          <Transition name="lp-confirm">
            <div v-if="leaveConfirmOpen" class="lp-confirm-mask" @click.self="cancelLeave">
              <section class="lp-confirm-dialog" role="alertdialog" aria-modal="true"
                aria-labelledby="lp-confirm-title" aria-describedby="lp-confirm-desc">
                <h2 id="lp-confirm-title" class="lp-confirm-title">放弃这次选点？</h2>
                <p id="lp-confirm-desc" class="lp-confirm-desc">
                  地图上的位置已经改过。现在返回天气会放弃这次修改，仍保留原来的位置。
                </p>
                <div class="lp-confirm-actions">
                  <button ref="keepChoosingRef" class="lp-dialog-btn" type="button" @click="cancelLeave">
                    继续选点
                  </button>
                  <button class="lp-dialog-btn is-danger" type="button" @click="discardLeave">
                    放弃修改
                  </button>
                </div>
              </section>
            </div>
          </Transition>
        </Teleport>

        <!-- 全屏地图里的「重选地区」：不再退回三列页（那会先收全屏、再重新展开），
             直接在整屏地图上叠一块地区卡片，确认后地图原地定位过去。
             自己在组件内部 Teleport 到 body，放在这里只是为了跟着面板的生命周期走 -->
        <RegionPickerDialog :open="regionDialogOpen" :path="selectedPath" :locating="locating"
          :error="regionDialogError" @update:open="handleRegionDialogOpenChange"
          @confirm="applyRegionFromDialog" />
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useWeatherStore } from '@/store'
import { lookupCity } from '@/api/weather'
import { ZOOM_DEFAULT, formatLatLng, toMapCoord } from './mapTiles'
import { isReverseGeocodeEnabled, reverseGeocode } from './reverseGeocode'
import { isPlaceLookupAvailable, isSameAdminName, joinAdminParts, lookupPlaceByCoord, pointAddressLabel } from './placeLookup'
import RegionCascade from './RegionCascade.vue'
import RegionPickerDialog from './RegionPickerDialog.vue'
import MapPointPicker from './MapPointPicker.vue'
import StaggerTransition from '@/shared/motion/StaggerTransition'
import { canLocateRegion, findNode, isLeaf, needsCityFirst as pathNeedsCityFirst, pathLabels } from './regionTree'
import {
  LocationHistory,
  addLocationHistory,
  clearLocationHistory,
  locationHistoryIdentity,
  locationHistoryKey,
  removeLocationHistory,
} from './useLocationHistory'
import { ChosenLocationPath, markLocationChosen } from '@/features/onboarding/onboardingState'
import { useLayerOutsideClick } from '@/shared/useLayerOutsideClick'

// eslint-disable-next-line no-undef
const props = defineProps({
  // 引导流程里不可关闭（必须选完位置才能进天气）；日常换城市时可以返回
  dismissable: { type: Boolean, default: false },
})
// eslint-disable-next-line no-undef
const emit = defineEmits(['close', 'selected'])

// 热门城市：用 adcode 路径定位，避免中文地名直接拼进接口
const HOT_CITIES = [
  { label: '北京', path: ['110000', '110101'] },
  { label: '上海', path: ['310000', '310101'] },
  { label: '广州', path: ['440000', '440100'] },
  { label: '深圳', path: ['440000', '440300'] },
  { label: '杭州', path: ['330000', '330100'] },
  { label: '成都', path: ['510000', '510100'] },
  { label: '武汉', path: ['420000', '420100'] },
  { label: '西安', path: ['610000', '610100'] },
  { label: '重庆', path: ['500000', '500103'] },
  { label: '南京', path: ['320000', '320100'] },
]

const weatherStore = useWeatherStore()
const history = LocationHistory

// 两步流程：先省/市/区，再在地图上精确选点
const step = ref('cascade')
// 根节点：点卡片外时要从它往上找 .weather-layer（见 useLayerOutsideClick）
const rootRef = ref(null)
// 地图实例：热门/最近在地图步骤里点击时用它「跳转视口」，不必重新挂载
const mapRef = ref(null)
// 「重选地区」按钮：地区卡片关掉后把焦点还给它，键盘用户不会丢位置
const reselectBtnRef = ref(null)
// 地图全屏：面板整块 teleport 到 body，header/chips 和底部条改成悬浮块。
// 真正的展开/收回动画在地图组件里（它才知道相机和裁切框），这里只跟着切换布局
const mapFullscreen = ref(false)
// 控件的进退场交给 Vue；只在布局切换时改变可见性，不用计时器猜动画终点。
const chromeVisible = ref(true)
let chromeRevision = 0
// 全屏里的「重选地区」卡片：打开时遮住地图、但不退出全屏。
// 卡片里的选择先存成草稿（RegionPickerDialog 内部），确认后才落到 selectedPath 上，
// 所以「打开又取消」不会动到地图和当前 pin
const regionDialogOpen = ref(false)
const regionDialogError = ref('')
// 当前区县中心 [lng, lat]，地图的初始视口；拿不到时退回「点区县即确认」
const districtCenter = ref(null)
// 地图上点选的位置（落库坐标系：大陆 GCJ-02；境外 WGS-84），null = 没点，确认时用区县中心
const pickedPoint = ref(null)
// 当前 pin 最近的道路名（高德逆地理编码）。保存时一起写入 point，
// 「最近」和天气卡就用「黄岩区 中学路」代替原来的两位小数坐标
const pickedRoad = ref('')
// 当前 pin 所在的区县名（高德给的，带「区/县/市」后缀）。
// 和风的 CityDetail.name 是「黄岩」，少了后缀，主界面直接用会显示成「黄岩 中学路」
const pickedDistrict = ref('')
// 这个区县名是哪来的：'amap'（逆地理编码）/ 'qweather'（坐标反查）/ ''（还没查到）。
// 主界面靠它判断 point.district 能不能信 —— 老记录里可能是三级下拉框的标签，
// 和 pin 真正所在的区县不是一回事（选北京、点到天津）。
const pickedDistrictSource = ref('')
// 当前 pin 的完整行政区划 + 道路（逆地理编码结果）。
// 标题要拼「浙江省-台州市-黄岩区-新前街道-中学路」，只有路名/区县不够。
// 没配高德 key、断网或老记录时保持 null，标题退回三列选中的省 / 市 / 区
const mapGeo = ref(null)
// 进地图时要预先摆好的 pin（落库坐标系）：区县中心，或当前选址 / 「最近」记录里已有的坐标
const mapInitialPoint = ref(null)
// 同一个区县来回切换时不必重复查；同时留一份 city 对象给「不点地图直接确认」复用
const districtCache = new Map()

// 回显上次选择的位置（省市县 adcode 路径由引导/地址页持久化）
const initialPath = (ChosenLocationPath.value || [])
  .map((node) => findNode(node.value))
  .filter(Boolean)
const selectedPath = ref(initialPath)
const submitting = ref(false)
// 正在查中心点 / 移动地图（热门城市、最近、下一步都会走这一步）。
// 请求可能要几百毫秒，期间必须禁用 chip 并给一句提示，否则点击看起来就是「没反应」
const locating = ref(false)
const errorText = ref('')

// 地区树规则（findNode / isLeaf / toItems / needsCityFirst）全在 regionTree.js：
// 卡片里的三列页和全屏地图上的重选卡片共用同一份，不各写一套。

/**
 * 取区县的中心点与城市对象。
 * 复用和风的城市查询：同一个 adcode 既能查到 LocationID 也能查到经纬度，
 * 所以进地图这一步不额外花钱，结果还能给「不点地图直接确认」复用。
 * 失败返回 null —— 调用方退回原来的「点区县即确认」，不让网络问题卡住选位。
 */
const resolveDistrict = async (adcode) => {
  if (districtCache.has(adcode)) return districtCache.get(adcode)
  try {
    const res = await lookupCity(adcode)
    const city = res?.location?.[0]
    if (!city?.id) return null
    const lng = Number(city.lon)
    const lat = Number(city.lat)
    const entry = {
      city,
      center: Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null,
    }
    districtCache.set(adcode, entry)
    return entry
  } catch (error) {
    return null
  }
}

/**
 * 和风给的经纬度是它自己的坐标系（大陆 GCJ-02，境外 WGS-84），和地图瓦片一致，
 * 默认高德源下直接可用；换成 WGS-84 底图源时 toMapCoord 会自动换算。
 */
const toMapCenter = ([lng, lat]) => toMapCoord(lng, lat)

/**
 * 壁纸当前正在用的精确坐标 —— 只有上次在地图上点过才会有。
 * 路径对不上（用户刚在别处换过城市）就不认，否则会把上一个区的点摆到新城市上。
 */
const savedPointOfCurrent = () => {
  const point = weatherStore.dayDateCity?.point
  if (!point || !Number.isFinite(point.lng) || !Number.isFinite(point.lat)) return null
  const current = (ChosenLocationPath.value || []).map((node) => node.value).join('/')
  const selected = selectedPath.value.map((node) => node.value).join('/')
  // 必须真的保存过一条路径，才认这份坐标。
  //
  // 旧写法是 `if (current && selected && current !== selected) return null`：
  // 路径为空时整条校验被跳过，于是「有旧坐标、没旧路径」的状态（模拟首次使用时
  // 路径被清空、但 WeatherChosenCity 里的 point 还留着）会让地址页一打开就进
  // 「地图步骤」——pin 摆在旧位置、按钮直接是「就用这里」、三列根本不出现。
  // 用户以为已经选好位置，实际上 selectedPath 始终是空的，后面 confirm 拿到空路径，
  // 引导页就永远停在这一步。现在路径对不上（含从没保存过路径）一律不认，
  // 宁可从三列重新选一次，也不要凭空摆一个来路不明的 pin。
  if (!current || current !== selected) return null
  // 区县名/路名一起带出来：重新打开地址页时「最近」文案和卡片地址还能用上次存下的
  return {
    lng: Number(point.lng),
    lat: Number(point.lat),
    road: String(point.road || ''),
    district: String(point.district || ''),
    // 市名一起带出来：没填高德 key 时标题 / 「最近」文案写成「台州市 黄岩附近」
    city: String(point.city || ''),
    // 老记录没有这个字段：交给主界面用 CityDetail 核对（见 useWeatherStore 的 CityDistrictLabel）
    districtSource: String(point.districtSource || ''),
  }
}

/**
 * 老记录里只有区县 + 路名，没有省市/街道：先拿这两段顶住标题，
 * 等地图那边的逆地理编码（或和风区县反查）回来再补成完整地址。
 *
 * 有一个例外必须挡住：老记录没有 districtSource，如果又没存路名，
 * 那个「区县」很可能是旧版从三级下拉框直接抄下来的标签（选北京、pin 在天津）。
 * 这种宁可不显示，等地图重新查回坐标级地名 —— 不能拿它冒充地址。
 */
const geoFromSaved = (saved) => {
  if (!saved) return null
  const source = String(saved.districtSource || '')
  const road = String(saved.road || '')
  // 没有 source 时，只有「有路名」才说明当时确实查到了坐标级地址（旧版只有高德能给路名）
  if (!source && !road) return null
  if (!saved.district && !road) return null
  return {
    province: '',
    city: saved.city || '',
    district: saved.district || '',
    township: '',
    road,
    source,
  }
}

/**
 * 进入地图步骤。拿不到中心点就退回「直接确认」，不让网络问题卡住选位。
 */
const goToMap = async () => {
  const node = lastNode.value
  if (!node || submitting.value || locating.value) return
  pickedPoint.value = null
  mapInitialPoint.value = null
  mapGeo.value = null
  // 已经有缓存（同一个区县来回切）就不必闪一下「正在定位…」
  const needsLookup = !districtCache.has(node.value)
  if (needsLookup) {
    locating.value = true
    errorText.value = ''
  }
  let entry = null
  try {
    entry = await resolveDistrict(node.value)
  } finally {
    if (needsLookup) locating.value = false
  }
  if (!entry?.center) {
    await confirm()
    return
  }
  // 进地图就把「当前选址」标出来，而不是给一块没有任何 pin 的空地图：
  // 有上次点过的坐标就摆那个点，没有就摆区县中心，用户还能在上面微调
  const saved = savedPointOfCurrent()
  const [centerLng, centerLat] = entry.center
  districtCenter.value = toMapCenter(saved ? [saved.lng, saved.lat] : entry.center)
  mapInitialPoint.value = saved || { lng: centerLng, lat: centerLat }
  // 点过的坐标是「真选点」，确认时按坐标走；区县中心只是占位，确认时仍走 adcode 查城市
  pickedPoint.value = saved
  pickedRoad.value = saved?.road || ''
  pickedDistrict.value = saved?.district || ''
  pickedDistrictSource.value = saved?.districtSource || ''
  mapGeo.value = geoFromSaved(saved)
  step.value = 'map'
}

// 打开地址页时如果上次已经是「地图点选」的精确坐标，直接以地图作为第一屏：
// 没必要让用户把省 / 市 / 区再选一遍。
// 放在 setup 里而不是 onMounted：首帧就渲染地图，不会先闪一下三列再切走。
const savedOnOpen = savedPointOfCurrent()
if (savedOnOpen) {
  pickedPoint.value = savedOnOpen
  pickedRoad.value = savedOnOpen.road || ''
  pickedDistrict.value = savedOnOpen.district || ''
  pickedDistrictSource.value = savedOnOpen.districtSource || ''
  mapGeo.value = geoFromSaved(savedOnOpen)
  mapInitialPoint.value = savedOnOpen
  districtCenter.value = toMapCenter([savedOnOpen.lng, savedOnOpen.lat])
  step.value = 'map'
}

// 选到叶子节点（区县）就自动进地图，普通省份和直辖市共用这一条
const advanceIfLeaf = async () => {
  if (!isLeaf(lastNode.value)) return
  await goToMap()
}

// 底部按钮：选到区县时是「下一步」（进地图），选到二级行政区（市）时同样是
// 「下一步 · 地图选点」——首屏只选到市也能进地图，不用被迫先选一个区县；
// 三级点选仍然保留，想按区县筛就继续点第三列。
// 省级（下面还有地级市）既不进地图也不能确认：和风的城市查询只认市级 / 区县级
// adcode，省级 adcode（如 440000）会直接 400，按钮在 needsCityFirst 里变成
// 禁用的「请先选择城市」（直辖市 / 香港 / 澳门这类可查询节点不受影响）。
const handleFooterAction = () => {
  if (needsCityFirst.value) return
  if (canOpenMap.value) {
    goToMap()
    return
  }
  confirm()
}

/**
 * 三列页里点了一级。
 * RegionCascade 只负责算出新的路径，这里统一写回并按「是不是叶子」决定是否自动进地图：
 * 选完区县 → 进地图步骤；拿不到中心点则维持旧行为（直接确认）。
 */
const handleCascadeSelect = async ({ nodes }) => {
  if (!nodes?.length) return
  selectedPath.value = nodes
  errorText.value = ''
  await advanceIfLeaf()
}

const handlePick = (point) => {
  pickedPoint.value = point
  // 换了点，旧路名/旧区县/旧地址立刻作废：新值要等逆地理编码 / 和风反查回来
  pickedRoad.value = ''
  pickedDistrict.value = ''
  pickedDistrictSource.value = ''
  mapGeo.value = null
  errorText.value = ''
}

/**
 * 地图里查到了当前 pin 的地名（高德路名，或和风反查的区县）。
 * 地图组件内部已经用请求序号丢弃过期响应，这里再按坐标核对一次，
 * 免得手快时把上一个点的结果存进这一条记录。
 */
const handleRoad = (info) => {
  const point = pickedPoint.value
  if (!point || !info?.point) return
  if (Math.abs(Number(info.point.lng) - point.lng) > 1e-9) return
  if (Math.abs(Number(info.point.lat) - point.lat) > 1e-9) return
  if (info.road) pickedRoad.value = info.road
  if (info.district) {
    pickedDistrict.value = info.district
    // 'amap' / 'qweather'：主界面据此决定要不要信任 point.district
    pickedDistrictSource.value = info.source || ''
  }
  // 整个行政区划一起留下：高德结果能显示到街道和路名，
  // 和风结果只到区县（source='qweather'，标题会写成「xx附近」）
  mapGeo.value = {
    province: info.province || '',
    city: info.city || '',
    district: info.district || '',
    township: info.township || '',
    road: info.road || '',
    source: info.source || '',
    distanceKm: Number.isFinite(info.distanceKm) ? info.distanceKm : null,
  }
}

/**
 * 确认前把坐标级地名补齐（高德路名 + 区县名，或和风区县名）。
 *
 * 关键是「只查一次」：地图组件已经为这个 pin 查过（或正在查），这里直接等它那一份结果。
 * 以前这里会自己再发一次逆地理编码，同一个点查两遍既多花配额，两次响应又一前一后
 * 回来，旧的那份把新的覆盖掉，路口附近「最近的路」就会翻成隔壁那条 ——
 * 结果是地图上写中学路、存进卡片却是中心路。
 * 等待上限 1.2 秒，查不到就留空按坐标兜底，绝不能为了地名把「确认」卡住。
 */
const ensureRoad = async (point) => {
  if (!point) return pickedRoad.value
  // 已经有「带来源的」坐标级地名（高德区县 / 和风区县）就不必再等。
  // 只有 district 没有 source 的不算：老记录里它可能是三级下拉框的标签
  if (pickedDistrict.value && pickedDistrictSource.value) return pickedRoad.value
  const wait = mapRef.value?.waitRoad
  if (typeof wait === 'function') {
    await wait(1200)
    if (pickedDistrict.value && pickedDistrictSource.value) return pickedRoad.value
  }
  // 地图实例不在（理论上走不到）/ 地图那边查失败了：自己补一次。
  // 先高德（有 key 时能拿到路名），失败再和风（只到区县）。
  if (isReverseGeocodeEnabled()) {
    try {
      const info = await reverseGeocode(point.lng, point.lat, { timeout: 1500 })
      if (info.road) pickedRoad.value = info.road
      if (info.district) {
        pickedDistrict.value = info.district
        pickedDistrictSource.value = 'amap'
        mapGeo.value = {
          province: info.province || '',
          city: info.city || '',
          district: info.district || '',
          township: info.township || '',
          road: info.road || '',
          source: 'amap',
        }
      }
    } catch (error) {
      // 查不到地址不影响选点，继续尝试和风
    }
  }
  if (!(pickedDistrict.value && pickedDistrictSource.value) && isPlaceLookupAvailable()) {
    try {
      const place = await lookupPlaceByCoord(point.lng, point.lat, { timeout: 1500 })
      pickedDistrict.value = place.name
      pickedDistrictSource.value = 'qweather'
      mapGeo.value = {
        province: place.adm1,
        city: place.adm2,
        district: place.name,
        township: '',
        road: '',
        source: 'qweather',
        distanceKm: place.distanceKm,
      }
    } catch (error) {
      // 同上：境外无人区 / 断网时就是没有地名，按坐标照常走
    }
  }
  return pickedRoad.value
}

// 地图自己发出的确认：有坐标就是精确点选，null = 地图加载失败后用区县中心
const handleMapConfirm = (point) => {
  if (point) {
    confirm(point)
    return
  }
  handleUseDistrictCenter()
}

/**
 * 地图瓦片加载失败时，用户选择「先用中心坐标」。
 * 正常的省/市/区流程直接按 adcode 查天气，拿到的是选中地区（市或区县）的中心；
 * 只有「老数据只带坐标进来、没有路径」时才退回地图当前那个点，避免无路可走。
 */
const handleUseDistrictCenter = () => {
  if (submitting.value) return
  pickedPoint.value = null
  pickedRoad.value = ''
  pickedDistrict.value = ''
  pickedDistrictSource.value = ''
  mapGeo.value = null
  if (selectedPath.value.length) {
    confirm()
    return
  }
  if (mapInitialPoint.value) {
    confirm(mapInitialPoint.value)
    return
  }
  errorText.value = '暂时拿不到中心坐标，请重新选择地区后再试'
}

/**
 * 全屏开关由地图发出（按钮在它的缩放胶囊里，全国档也在那儿）：
 * 布局切换留在这里，相机和裁切动画留在地图组件里，两边只靠这一个布尔值对齐。
 */
const handleFullscreenChange = async (on) => {
  const revision = ++chromeRevision
  mapFullscreen.value = !!on
  chromeVisible.value = false
  if (!on) {
    regionDialogOpen.value = false
    regionDialogError.value = ''
  }
  // 先提交隐藏状态；下一次渲染由 Transition 安排起止帧，地图节点保持挂载。
  await nextTick()
  if (revision === chromeRevision) chromeVisible.value = true
}

// 地图开始收窄时，先让浮层离场；v-show 保留表单和地图的状态。
const handleFsLeaving = () => {
  if (mapFullscreen.value) chromeVisible.value = false
}

/**
 * 退出全屏。
 * Esc 和「重选地区」都要先走它：面板还在 body 上铺满屏幕时直接切步骤，
 * 三列会跟着变成全屏排版。
 */
const exitMapFullscreen = async () => {
  if (!mapFullscreen.value) return
  await mapRef.value?.exitFullscreen?.()
  // 动画被占住（连点）时兜底：无论如何都要从全屏布局里退出来。
  // 走 handleFullscreenChange 而不是直接改布尔值，收尾的动画状态才不会漏掉
  if (mapFullscreen.value) handleFullscreenChange(false)
}

const backToCascade = async () => {
  regionDialogOpen.value = false
  if (mapFullscreen.value) await exitMapFullscreen()
  step.value = 'cascade'
  pickedPoint.value = null
  pickedRoad.value = ''
  pickedDistrict.value = ''
  pickedDistrictSource.value = ''
  mapGeo.value = null
  errorText.value = ''
}

/**
 * 「重选地区」按钮。
 *
 * 卡片形态：本来就在地址页里，三列就是这一屏，直接换回去（和以前一样）。
 * 全屏形态：不能先退全屏再重新展开 —— 那一段 320ms 的收放会白跑一趟，
 * 用户还会丢掉刚调好的视野。改成在整屏地图上叠一块地区卡片，选完原地飞过去。
 */
const handleReselect = async () => {
  if (submitting.value || locating.value) return
  if (!mapFullscreen.value) {
    await backToCascade()
    return
  }
  regionDialogError.value = ''
  regionDialogOpen.value = true
}

const handleRegionDialogOpenChange = (open) => {
  if (open) {
    regionDialogError.value = ''
    regionDialogOpen.value = true
    return
  }
  closeRegionDialog()
}

// 关卡片（取消 / Esc / 确认后的收尾都走这里）：焦点还给「重选地区」，
// 否则焦点落在被移走的卡片上，下一次 Tab 会从文档开头重新数
const closeRegionDialog = () => {
  regionDialogOpen.value = false
  regionDialogError.value = ''
  nextTick(() => {
    if (mapFullscreen.value) reselectBtnRef.value?.focus()
  })
}

/**
 * 地区卡片里点了「定位到这里」。
 *
 * 走 focusOnPath 而不是另写一份：热门 / 最近 / 重选三处的落点规则必须一致
 *（换路径、清掉旧 pin、按区县中心摆位、地图原地移动）。
 * 全屏里可能已经缩到全国，这里显式要街道级，否则「定位过去」只是换了个视野中心，
 * 画面还停在「两个中国」那一档，看起来像没反应。
 */
const applyRegionFromDialog = async (nodes) => {
  if (!nodes?.length || submitting.value || locating.value) return
  regionDialogError.value = ''
  const moved = await focusOnPath(nodes, null, { zoom: ZOOM_DEFAULT })
  if (moved) {
    closeRegionDialog()
    return
  }
  // 定位失败：提示留在卡片里（页脚那份在弹层后面也看不见，别让它同时亮着）
  errorText.value = ''
  regionDialogError.value = '定位失败，请检查网络后重试'
}

const lastNode = computed(() => selectedPath.value[selectedPath.value.length - 1] || null)
// 只选到省 / 自治区：不能确认，按钮变成禁用的「请先选择城市」。
// 省级 adcode 查不到城市，点下去只会得到一个 No Such Location 的报错；
// 与其让用户对着报错猜，不如在按钮上直接说明下一步要做什么（规则见 regionTree.js）。
const needsCityFirst = computed(() => pathNeedsCityFirst(selectedPath.value))
const canConfirm = computed(() => !!lastNode.value && !submitting.value && !needsCityFirst.value)
// 「下一步 · 地图选点」的适用范围：
// - 选到区县（叶子）：一定有中心点，和以前一样自动进地图；
// - 选到二级行政区（市）：和风的市级 adcode 能查到中心点，直接进地图，
//   不必非要先在第三列里挑一个区县；
// - 省级（下面还有地级市）：和风不认省级 adcode，不能确认也不进地图；
//   直辖市 / 香港 / 澳门本身是可查询节点，不在这一条里。
const canOpenMap = computed(() => canLocateRegion(selectedPath.value))
const confirmText = computed(() => {
  if (!lastNode.value) return '请选择位置'
  if (needsCityFirst.value) return '请先选择城市'
  return canOpenMap.value ? '下一步 · 地图选点' : `就用 ${lastNode.value.label}`
})
const pathText = computed(() =>
  selectedPath.value.length ? pathLabels(selectedPath.value) : '请选择省 / 市 / 区'
)

// 地图步骤的副标题：老数据可能只有坐标没有路径，别把「请选择省 / 市 / 区」顶上去
const contextText = computed(() => (
  selectedPath.value.length ? pathText.value : (weatherStore.dayDateCity?.city || '当前位置')
))

// 标题文案：引导流程里带步骤号
const baseTitle = computed(() => (
  props.dismissable ? '选择位置' : '第 2 步 · 选择你所在的位置'
))

/**
 * 地图步骤的标题：pin 真正落在哪，就显示哪（坐标级地名）。
 *
 * - 有高德 key：省-市-区-乡镇-道路，例如「浙江省-台州市-黄岩区-新前街道-中学路」；
 * - 没高德 key：和风坐标反查到区县，写「浙江省-台州-黄岩附近」。和风只到三级
 *   行政区，没有街道 / 道路，所以「附近」是它能给出的最诚实的精度；
 * - 两个都没查回来（断网 / 境外无人区）：绝不拿三列下拉框的路径顶替地址 ——
 *   用户可能选了北京、pin 却落在天津。这时只写「已选位置」，具体坐标看页脚；
 * - pin 还只是区县中心占位（没点过地图）：天气按这个区县的 adcode 查，
 *   标题用三列路径是准确的。
 *
 * 高德在没有命名道路时会拿街道名顶替路名，相邻重复的段只保留一次；
 * 和风的 adm1 / adm2 也可能和下拉框标签重名（「北京市」+「北京」），同样只留一个。
 */
const titleAddress = computed(() => {
  // 三列那一步页脚已经有路径了，标题不必再显示一遍
  if (step.value !== 'map') return ''
  const path = selectedPath.value.map((node) => node.label)
  const geo = mapGeo.value

  // 和风只到区县：三段拼完统一加「附近」，不要冒充完整地址
  if (geo?.source === 'qweather') {
    const kept = joinAdminParts([geo.province, geo.city, geo.district])
    if (kept.length) return `${kept.join('-')}附近`
  }

  if (geo) {
    // 高德 / 老记录：只用坐标级地名，缺哪一级就缺着 —— 不拿三列路径补齐，
    // 否则「省-市-区」看着完整，实际有一段是用户在下拉框里点的、和 pin 无关
    const kept = joinAdminParts([geo.province, geo.city, geo.district, geo.township, geo.road])
    if (kept.length) return kept.join('-')
  }

  // pin 已经移过位置，但没有坐标级地名：三列路径和它可能完全不是一个地方
  if (pickedPoint.value) return '已选位置'

  // 只是区县中心占位：天气会按这个地区查，路径就是准确地址
  return joinAdminParts(path).join('-')
})

const title = computed(() => (
  step.value === 'map' && titleAddress.value ? titleAddress.value : baseTitle.value
))

const subText = computed(() => {
  if (step.value === 'cascade') {
    return '天气数据按你选择的城市展示；之后点天气卡左上角的地址可以随时更换'
  }
  const hint = '拖动可平移，点一下选更精确的位置'
  // 标题已经带了详细地址，副标题就不再重复一遍省 / 市 / 区
  return titleAddress.value ? hint : `${contextText.value} · ${hint}`
})

// 当前选中路径的 adcode 串：热门城市只按地区判断（它们没有精确坐标）
const selectedIds = computed(() => selectedPath.value.map((node) => node.value))
const selectedKey = computed(() => selectedIds.value.join('/'))

// 当前选择的完整身份 = 路径 + 精确坐标。
// 以前「最近」只比 adcode 路径，同一个区县里存过两条记录（比如旧版的纯地区记录
// 和后来地图点选的记录）时会一起高亮；现在必须坐标也一致才算同一条。
const currentLocationKey = computed(() => locationHistoryIdentity({
  path: selectedIds.value,
  point: pickedPoint.value,
}))

// 当前选择命中了哪条「最近」。命中后高亮只留给它，
// 热门城市不再重复点亮同一个地址。
const currentHistoryKey = computed(() => {
  const key = currentLocationKey.value
  if (!key) return ''
  return history.value.some((item) => locationHistoryIdentity(item) === key) ? key : ''
})

const isHistoryCurrent = (item) => (
  !!currentHistoryKey.value && locationHistoryIdentity(item) === currentHistoryKey.value
)

// 热门城市没有坐标：只有「当前选择还停在地区级」时才算选中。
// 已经在地图上点过精确坐标时，热门只是地区快捷入口，不再冒充当前地址。
const isHotCitySelected = (ids) => {
  if (pickedPoint.value) return false
  // 同一条地址正在「最近」里高亮：只保留一个高亮，避免两个 chip 同时亮
  if (currentHistoryKey.value) return false
  const key = (ids || []).join('/')
  return !!key && key === selectedKey.value
}

const coordText = computed(() => {
  const point = pickedPoint.value || mapInitialPoint.value
  if (!point) return '未选点 · 将使用中心坐标'
  const coords = formatLatLng(point.lat, point.lng)
  // 中心点只是占位，明确标出来，免得用户以为已经选到街一级
  return pickedPoint.value ? coords : `中心 ${coords}`
})

/**
 * 直接进地图时可能只有坐标、没有省市县路径（老数据）。
 * 这时确认走的是坐标，只需要一个展示用的名字，兜底用当前城市。
 */
const fallbackTarget = () => {
  const city = weatherStore.dayDateCity
  const label = city?.CityDetail?.name || city?.city || '当前位置'
  return { value: city?.CityDetail?.id || '', label }
}

/**
 * 确认位置。
 * @param {Object|null} point 地图点选的坐标（和风坐标系：大陆 GCJ-02）；不传 / 传 null 时按区县 adcode 查天气
 */
const confirm = async (point) => {
  // 只认真正的坐标对象：模板里写成 @click="confirm" 会传进来 MouseEvent
  const exact = point && Number.isFinite(point.lng) && Number.isFinite(point.lat) ? point : null
  const target = lastNode.value || fallbackTarget()
  if (submitting.value || !target) return
  if (!exact && !target.value) {
    errorText.value = '请先选择区县'
    return
  }
  submitting.value = true
  errorText.value = ''
  try {
    // 这次要存下去的地址先算好、冻住，再落库。
    // 不要在 addLocationHistory 里回头读 pickedRoad / pickedDistrict ——
    // choosePoint 里有 await，这期间地图可能又抛来一个新结果，
    // 那样「最近」的文案和卡片里的 point 就会对不上（一个中学路、一个中心路）
    let savedPoint = null
    if (exact) {
      const road = await ensureRoad(exact)
      savedPoint = {
        lng: Number(exact.lng),
        lat: Number(exact.lat),
        road,
        // 只保存「按坐标查到的」区县名（高德带后缀，和风不带）。
        // 绝不拿三级下拉框的 target.label 顶替 —— 用户可能选了北京、pin 在天津，
        // 那样保存下来的地址会和天气（始终按坐标查）对不上。
        // 高德 / 和风都没查到时留空，主界面会用 CityDetail 兜底。
        district: pickedDistrict.value || '',
        districtSource: pickedDistrict.value ? pickedDistrictSource.value : '',
      }
      const chosenCity = await weatherStore.choosePoint(savedPoint)
      // choosePoint 内部已经按坐标查过一次和风，返回的 name 才是 pin 真正所在的区县。
      // 地图那边没来得及给出区县 / 给出的是老记录里没标来源的名字时，用它校正：
      //   - 没有 district：直接补上；
      //   - 有 district 但没来源：和坐标反查结果对得上就保留（高德带后缀的写法），
      //     对不上说明它是旧版抄下来的下拉框标签，换成坐标反查的名字。
      const trusted = savedPoint.districtSource === 'amap' ||
        savedPoint.districtSource === 'qweather'
      if (!trusted && chosenCity?.name) {
        if (!savedPoint.district) {
          savedPoint.district = chosenCity.name
        } else if (!isSameAdminName(savedPoint.district, chosenCity.name)) {
          savedPoint.district = chosenCity.name
        }
        savedPoint.districtSource = 'qweather'
      }
      // 市名用这次坐标反查到的 adm2：没填高德 key 时「最近」文案写成
      // 「台州市 黄岩附近」，和主界面 / 地图提示保持同一套写法
      if (chosenCity?.adm2) savedPoint.city = String(chosenCity.adm2)
    } else {
      // 刚才为进地图查过这个区县，直接复用，省一次请求
      const cachedCity = districtCache.get(target.value)?.city
      if (cachedCity?.id) {
        await weatherStore.getLocationInformation({ city: cachedCity, isSearch: true })
      } else {
        await weatherStore.chooseLocation(target.value)
      }
    }
    addLocationHistory({
      // 点选过就带上坐标一起存，否则「最近」里只剩区县，再点回去精度就丢了。
      // 文案优先用「区县 路名」；没有路名（没配高德 key）就用「市 区县附近」，
      // 这样它和天气卡上的地址始终是同一套写法
      label: savedPoint
        ? (pointAddressLabel(savedPoint)
          || `${exact.lat.toFixed(2)}, ${exact.lng.toFixed(2)}`)
        : target.label,
      path: selectedPath.value.map((node) => node.value),
      point: savedPoint,
    })
    const scope = selectedPath.value.map((node) => ({ value: node.value, label: node.label }))
    // 位置已经确认，就必须标记完成 —— 这里不能加「有路径才标记」的条件。
    // scope 为空（只确认了坐标、没有省市区路径）时跳过标记，会让引导页永远停在
    // 选区县页：天气请求全都发了、界面一帧不动、也没有任何报错。
    // 空数组交给 markLocationChosen 当成「这次没有路径」，顺手清掉可能对不上的旧路径。
    markLocationChosen(scope)
    emit('selected', scope)
  } catch (error) {
    errorText.value = error?.message || '获取天气数据失败，换个位置或稍后重试'
  } finally {
    submitting.value = false
  }
}

/**
 * 两个坐标是不是同一个点（精确到落库精度 4 位小数）。
 */
const isSamePoint = (a, b) => {
  if (!a || !b) return false
  const aLng = Number(a.lng)
  const aLat = Number(a.lat)
  const bLng = Number(b.lng)
  const bLat = Number(b.lat)
  if (![aLng, aLat, bLng, bLat].every(Number.isFinite)) return false
  return aLng.toFixed(4) === bLng.toFixed(4) && aLat.toFixed(4) === bLat.toFixed(4)
}

/**
 * pin 是否被移动过。只比较真正的点选坐标：区县中心只是占位，不算修改。
 */
const hasUnsavedPoint = computed(() => {
  if (!pickedPoint.value) return false
  return !savedOnOpen || !isSamePoint(pickedPoint.value, savedOnOpen)
})

const leaveConfirmOpen = ref(false)
// 弹层打开后焦点落在这里：误按 Enter 也是「继续选点」，不会丢掉修改
const keepChoosingRef = ref(null)

/**
 * 关闭地址页的统一入口。
 * 没改过 pin 就直接返回；改过则先弹确认 —— 无论点卡片外还是点「返回天气」，
 * 都不能让一次误点悄悄丢掉刚调好的选点。
 */
const requestClose = () => {
  if (!props.dismissable || submitting.value) return
  if (hasUnsavedPoint.value) {
    leaveConfirmOpen.value = true
    return
  }
  emit('close')
}

const cancelLeave = () => {
  leaveConfirmOpen.value = false
}

const discardLeave = () => {
  leaveConfirmOpen.value = false
  emit('close')
}

// Esc = 继续选点。不能把 Esc 当成「确认放弃」，否则防误触的弹层本身又成了误触入口。
// 没有弹层时 Esc 用来退出地图全屏（顺序不能反：上层开着时 Esc 只关上层）。
const handleLeaveKeydown = (event) => {
  if (event.key !== 'Escape') return
  if (leaveConfirmOpen.value) {
    event.preventDefault()
    cancelLeave()
    return
  }
  // 地区卡片压在全屏地图上：Esc 只关卡片，不能顺手把全屏也收了
  if (regionDialogOpen.value) {
    event.preventDefault()
    if (!locating.value) closeRegionDialog()
    return
  }
  if (mapFullscreen.value) {
    event.preventDefault()
    exitMapFullscreen()
  }
}
onMounted(() => window.addEventListener('keydown', handleLeaveKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', handleLeaveKeydown)
  chromeRevision += 1
})

watch(leaveConfirmOpen, async (open) => {
  if (!open) return
  await nextTick()
  keepChoosingRef.value?.focus()
})

/**
 * 点击卡片外的空白 → 返回天气。
 *
 * 没改过 pin：直接关，不触发 confirm —— 否则会被当成一次手动定位，
 * 强制绕过天气缓存重新请求所有接口。
 * 改过 pin：日常地址页由 requestClose 弹出确认，等用户明确选择是否放弃；
 * 引导流程没有“返回天气”，点外面仍按确认选点处理。
 * 三列阶段，或者 pin 还只是区县中心占位时同样不响应，避免误确认。
 */
const confirmFromOutside = () => {
  if (step.value !== 'map' || submitting.value || locating.value) return
  if (leaveConfirmOpen.value || !pickedPoint.value) return
  // 引导流程没有「返回天气」，点外面仍然是确认选点；只有日常地址页才弹放弃确认
  if (!props.dismissable) {
    if (hasUnsavedPoint.value) confirm(pickedPoint.value)
    return
  }
  requestClose()
}
useLayerOutsideClick(rootRef, confirmFromOutside)

/**
 * 把地图移到某个路径（热门城市 / 最近记录 / 全屏里的重选地区）。
 * 只移动视口、不直接确认 —— 地图步骤里用户很可能只是想过去看看，
 * 直接 confirm 会悄无声息地把他刚调好的精度换掉。
 * @param {Array} nodes 省 / 市 / 区 的节点路径
 * @param {Object|null} point 记录里带过来的精确坐标；null = 用区县中心
 * @param {Object} options 透传给地图：{ zoom } 指定落点级别（重选地区用街道级）
 * @returns {Promise<boolean>} 是否成功移动
 */
const focusOnPath = async (nodes, point = null, options = {}) => {
  const node = nodes?.[nodes.length - 1]
  if (!node) return false

  // 带坐标进来的记录不需要查中心点；同区县来回切时中心点也已缓存，都不要闪提示
  const needsLookup = !point && !districtCache.has(node.value)
  if (needsLookup) {
    locating.value = true
    errorText.value = ''
  }
  let entry = null
  try {
    entry = point ? null : await resolveDistrict(node.value)
  } finally {
    if (needsLookup) locating.value = false
  }
  const anchor = point || (entry?.center
    ? { lng: Number(entry.center[0]), lat: Number(entry.center[1]) }
    : null)
  if (!anchor) {
    // 已经在地图里却定位失败：得给个反馈，否则看起来就是「点了没反应」
    if (step.value === 'map') errorText.value = '定位失败，请检查网络后重试'
    return false
  }

  selectedPath.value = nodes
  errorText.value = ''
  // 历史点算「真选点」；区县中心只是占位，确认时仍走 adcode
  pickedPoint.value = point
  // 历史记录里存过路名/区县就直接用（老记录没存，等地图那边查回来再填）
  pickedRoad.value = point?.road || ''
  pickedDistrict.value = point?.district || ''
  pickedDistrictSource.value = point?.districtSource || ''
  mapGeo.value = geoFromSaved(point)
  districtCenter.value = toMapCenter([anchor.lng, anchor.lat])
  mapInitialPoint.value = { lng: anchor.lng, lat: anchor.lat }

  if (step.value === 'map') {
    // 地图已经挂着：直接驱动它移动，避免重挂载导致整片瓦片重新请求
    mapRef.value?.focusTo(districtCenter.value, mapInitialPoint.value, options)
  } else {
    step.value = 'map'
  }
  return true
}

const applyIds = async (ids) => {
  if (submitting.value || locating.value) return
  const nodes = (ids || []).map(findNode).filter(Boolean)
  if (!nodes.length) return
  // 热门城市：无论当前在三列页还是已经在地图里，都进 / 移动地图。
  // 以前三列页点热门城市是 `selectedPath = nodes; confirm()`，等于点一下就直接
  // 拉天气、跳过地图 —— 十座热门城市全部都不进地图，看起来就是「点了没反应」
  // （只换了一下地址，面板直接开始加载天气）。地图步骤里则只移动视口，
  // 不直接 confirm，避免把用户刚调好的精度悄悄换掉。
  const moved = await focusOnPath(nodes)
  if (moved) return
  // 拿不到中心点（断网 / 接口异常）：必须给反馈，否则和「没点到」没有区别
  errorText.value = '定位失败，请检查网络后重试'
}

/**
 * 「最近」记录：先进地图，把上次的点摆好当起点，用户可以微调再确认。
 * 之前的实现是直接 confirm()，等于点一下就定了，没有改的余地。
 */
const applyHistory = async (item) => {
  if (submitting.value || locating.value) return
  const nodes = (item?.path || []).map(findNode).filter(Boolean)
  if (!nodes.length) return

  const point = item?.point &&
    Number.isFinite(item.point.lng) &&
    Number.isFinite(item.point.lat)
    ? { lng: item.point.lng, lat: item.point.lat }
    : null

  if (step.value === 'map') {
    await focusOnPath(nodes, point)
    return
  }

  selectedPath.value = nodes
  const moved = await focusOnPath(nodes, point)
  if (!moved) {
    // 拿不到中心点、记录里也没有坐标（网络问题 / 老记录）→ 退回直接确认
    await confirm(point)
  }
}

/**
 * 删除单条「最近」记录。
 * 按归一化 key 删，旧缓存里被列表折叠掉、但实际仍躺在 localStorage 里的副本一起清掉，
 * 否则删完一条，折叠逻辑又会把另一份同名记录顶出来。
 */
const removeHistoryItem = (item) => {
  removeLocationHistory(locationHistoryKey(item))
}
</script>

<style lang="scss" scoped>
.LocationPicker {
  display: flex;
  flex-direction: column;
  padding: 2rem;
}

/* 卡片 / 全屏共用的内容壳。根节点（.LocationPicker）是纯粹的「外壳 + 布局槽」，
   列布局和间距放在这里转给子元素；全屏时这一层自己被 teleport 到 body 并铺满屏幕。
   两种形态的排版差异全部写在下面的 .lp-frame.is-fs 里 */
.lp-frame {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 1.375rem;
}

/* 标题 + 热门/最近的外壳。
   卡片里用 display: contents：两块仍然是面板这个 flex column 的直接子项，
   间距和以前完全一样（不这么写会把 gap 从 1.375rem 变成 2×1.375rem）；
   全屏时它才真的变成一个盒子，也就是屏幕上沿那块悬浮卡片。 */
.lp-top {
  display: contents;
}

.lp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.lp-head-text {
  flex: 1;
  min-width: 0;
}

.lp-title {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.3;
  color: var(--text-primary);
  /* 地图步骤的标题是详细地址，可能很长：允许在汉字/连字符处换行，不撑破头部 */
  overflow-wrap: anywhere;
}

.lp-sub {
  margin: 0.375rem 0 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.lp-back {
  flex: none;
  padding: 0.4375rem 0.9375rem;
  font-size: 0.85rem;
  color: var(--text-primary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: background 0.2s ease;

  &:hover {
    background: var(--glass-border);
  }
}

/* 页头右侧：只有「返回天气」。
   全屏时这块是屏幕上沿的悬浮玻璃卡，宽度固定；卡片里靠 nowrap 撑住，
   真挤不开时先让标题换行（.lp-head-text 有 flex: 1 + min-width: 0） */
.lp-head-side {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.lp-chips {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.lp-chip-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.lp-chip-label {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.lp-chip {
  padding: 0.3125rem 0.75rem;
  font-size: 0.82rem;
  color: var(--text-secondary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;

  &:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--glass-border);
    border-color: var(--glass-border-strong);
  }

  &.is-current {
    color: var(--text-on-accent);
    background: var(--color-primary);
    border-color: transparent;
    font-weight: 600;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

/* 「最近」的一个条目：左边是地址（点击后把地图移过去），右边是独立的删除按钮。
   两块共用一个胶囊外框，但不能写成 button 套 button —— 那是非法结构，键盘和读屏都会乱 */
.lp-chip-history {
  display: inline-flex;
  align-items: stretch;
  overflow: hidden;
  color: var(--text-secondary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: background 0.2s ease, border-color 0.2s ease;

  &:hover:not(.is-current) {
    background: var(--glass-border);
    border-color: var(--glass-border-strong);
  }

  &.is-current {
    color: var(--text-on-accent);
    background: var(--color-primary);
    border-color: transparent;

    .lp-chip-main {
      color: var(--text-on-accent);
      font-weight: 600;
    }

    .lp-chip-remove {
      color: var(--text-muted);
      border-left-color: var(--glass-border);

      &:hover:not(:disabled) {
        color: var(--text-on-accent);
        background: var(--glass-bg-subtle);
      }
    }
  }
}

.lp-chip-main {
  padding: 0.3125rem 0.4375rem 0.3125rem 0.75rem;
  font-size: 0.82rem;
  color: inherit;
  background: transparent;
  border: 0;
  transition: color 0.2s ease;

  &:hover:not(:disabled) {
    color: var(--text-primary);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }
}

/* 删除按钮：用一条细分隔线和地址文案分开，点击只删这一条，不触发选中。
   图标是内联 SVG 而不是「×」字符 —— 字符的基线受字体影响，垂直方向会偏 */
.lp-chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  padding: 0;
  color: var(--text-muted);
  background: transparent;
  border: 0;
  border-left: 1px solid var(--glass-border);
  transition: color 0.2s ease, background 0.2s ease;

  svg {
    display: block;
    width: 0.6875rem;
    height: 0.6875rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
  }

  &:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--glass-bg-soft);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }
}

.lp-chip-clear {
  padding: 0.3125rem 0.625rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  background: transparent;
  border: 1px dashed var(--glass-border);
  border-radius: 999px;

  &:hover {
    color: var(--text-secondary);
  }
}

/* 中间区域：三列和地图共用同一块空间，高度由外壳剩余空间决定。
   min-height: 0 是关键 —— 不写的话 flex 子项的最小内容高度会把面板顶破 */
.lp-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

/* 定位请求在途时锁住三列：避免这期间又点了一个区县，
   等请求回来把刚选的路径覆盖掉（地图步骤本身不用锁） */
.lp-body.is-locating .lp-columns {
  pointer-events: none;
}

.lp-columns {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.875rem;
}

/* 地图区域吃掉剩余空间；宽高都由外层给出确定值，组件按像素 1:1 渲染 */
.lp-map {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.lp-map :deep(.MapPointPicker) {
  width: 100%;
  height: 100%;
}

/* 面板高度是锁死的，小屏下宁可让地图矮一点，也不要撑出外壳 */
.lp-map :deep(.mp-wrap--fill) {
  min-height: 0;
}

/* ================= 全屏地图 =================
   面板整块被 teleport 到 body 并铺满屏幕（卡片外壳 overflow: hidden + backdrop-filter，
   留在里面写 position: fixed 只会被裁在卡片里）。
   两块悬浮玻璃 + 三个控件锚的都是「卡片矩形」——和 .weather-shell 同一套宽度 / 高度公式，
   而不是屏幕边缘：用户的视线就在卡片这一带，按钮跟过去才不用满屏找。 */
.lp-frame.is-fs {
  /* 卡片矩形的宽高（和 .weather-shell 同一套公式）。写成自定义属性，
     免得在 calc() 里嵌套 min() 让 Sass 去求值 */
  --lp-card-w: min(82vw, 71.25rem);
  --lp-card-h: min(46.5rem, 92vh);
  position: fixed;
  inset: 0;
  z-index: 40;
  width: 100vw;
  height: 100vh;
  /* 子元素全改成绝对定位（地图铺满、两块悬浮玻璃锚卡片边），这里不再需要列布局 */
  display: block;
  padding: 0;
  gap: 0;

  .lp-top {
    position: absolute;
    top: 1.5rem;
    left: 50%;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: var(--lp-card-w);
    padding: 1.125rem 1.375rem;
    background: var(--glass-bg-strong);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    transform: translateX(-50%);
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(150%);
    backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  }

  /* 地图铺满整屏，两块悬浮块只是压在它上面 */
  .lp-body {
    position: absolute;
    inset: 0;
    z-index: 1;
  }

  .lp-foot {
    position: absolute;
    /* 底边对齐卡片下沿，而不是贴着屏幕最底下 */
    bottom: calc((100vh - var(--lp-card-h)) / 2);
    left: 50%;
    z-index: 2;
    width: var(--lp-card-w);
    padding: 0.75rem 1.125rem;
    background: var(--glass-bg-strong);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-panel);
    transform: translateX(-50%);
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(150%);
    backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  }

}


/* 三列 ↔ 地图：只做淡入淡出，不做缩放，避免动效期间量到错误尺寸 */
.lp-swap-enter-active,
.lp-swap-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.lp-swap-enter-from,
.lp-swap-leave-to {
  opacity: 0;
  transform: translateY(0.375rem);
}

.lp-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.lp-path {
  min-width: 0;
  font-size: 0.88rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-foot-right {
  display: inline-flex;
  align-items: center;
  gap: 0.875rem;
}

.lp-error {
  max-width: 22rem;
  font-size: 0.82rem;
  color: var(--danger-text);
  /* 错误提示可能带换行，保留换行符 */
  white-space: pre-line;
}

/* 查中心点期间的轻提示：放在错误提示的位置，不抢按钮的宽度 */
.lp-hint {
  font-size: 0.82rem;
  color: var(--text-muted);
}

.lp-confirm {
  flex: none;
  padding: 0.5625rem 1.25rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-on-accent);
  background: var(--color-primary);
  border: none;
  border-radius: 999px;
  transition: filter 0.2s ease, opacity 0.2s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}

/* ================= 点外返回的二次确认 =================
   Teleport 到 body，所以这里要自己盖过 .weather-layer（z-index: 5）。
   背后的地图留一点模糊，让用户仍能看出自己刚选的位置。 */
.lp-confirm-mask {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: var(--scrim);
  -webkit-backdrop-filter: blur(1.125rem);
  backdrop-filter: blur(1.125rem);
}

.lp-confirm-dialog {
  width: min(25rem, 100%);
  padding: 1.5rem;
  color: var(--text-primary);
  background: var(--surface-modal);
  border: 1px solid var(--glass-border);
  border-radius: 1.25rem;
  box-shadow: 0 1.75rem 4.375rem -1.75rem rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.lp-confirm-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.4;
}

.lp-confirm-desc {
  margin: 0.625rem 0 1.25rem;
  font-size: 0.88rem;
  line-height: 1.7;
  color: var(--text-muted);
}

.lp-confirm-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.625rem;
}

.lp-dialog-btn {
  padding: 0.5rem 1rem;
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;

  &:hover {
    background: var(--glass-border);
    border-color: var(--glass-border-strong);
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  &.is-danger {
    color: var(--danger-text);
    background: rgba(223, 125, 120, 0.14);
    border-color: rgba(223, 125, 120, 0.32);

    &:hover {
      background: rgba(223, 125, 120, 0.2);
      border-color: rgba(223, 125, 120, 0.48);
    }
  }
}

.lp-confirm-enter-active,
.lp-confirm-leave-active {
  transition: opacity 0.18s ease;
}

.lp-confirm-enter-active .lp-confirm-dialog,
.lp-confirm-leave-active .lp-confirm-dialog {
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.lp-confirm-enter-from,
.lp-confirm-leave-to {
  opacity: 0;
}

.lp-confirm-enter-from .lp-confirm-dialog,
.lp-confirm-leave-to .lp-confirm-dialog {
  transform: translateY(0.5rem) scale(0.97);
  opacity: 0;
}

/* 窄屏只压缩间距：三列堆成一列的话每列都没有高度，BetterScroll 直接废掉，
   反而不如让三列继续并排、靠省略号收名字 */
@media (max-width: 880px) {
  .LocationPicker {
    padding: 1.375rem;
  }

  .lp-frame {
    gap: 1rem;
  }

  .lp-title {
    font-size: 1.35rem;
  }

  .lp-columns {
    gap: 0.5rem;
  }

  .lp-chip {
    padding: 0.25rem 0.625rem;
  }

  .lp-chip-main {
    padding: 0.25rem 0.375rem 0.25rem 0.625rem;
  }
}
</style>
