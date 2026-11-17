<template>
  <div class="wallpaper-debug-panel">
    <Card :bordered="false" size="small" class="panel-card">
      <template #title>
        <span class="panel-title">🛠 壁纸属性调试</span>
      </template>
      <template #extra>
        <Button size="mini" type="text" @click="collapsed = !collapsed">
          {{ collapsed ? '展开' : '收起' }}
        </Button>
      </template>

      <div v-show="!collapsed" class="panel-body">
        <Space direction="vertical" fill :size="10">
          <!-- 用户自带的域名/密钥（对应 project.json 的 qweatherhost / qweatherkey）
               壁纸引擎里由属性面板下发，开发环境（Edge 浏览器）在这里直接输入 -->
          <div class="section-title">域名与密钥（用户自带）</div>
          <div class="row">
            <span class="label">域名</span>
            <Input v-model="apiHost" size="small" class="control" placeholder="xxxx.re.qweatherapi.com" />
          </div>
          <div class="row">
            <span class="label">密钥</span>
            <Input v-model="apiKey" size="small" class="control" placeholder="Web API Key" />
          </div>
          <div class="api-status">{{ checkStatusText }}</div>
          <Space :size="8">
            <Button size="mini" @click="openSettings">打开设置页</Button>
            <Button size="mini" @click="openOnboarding()">打开引导页</Button>
            <Button size="mini" @click="resetOnboarding">模拟首次使用</Button>
          </Space>

          <!-- 可选的高德密钥（对应 project.json 的 amapkey）
               填了显示「最近道路名」；留空时地址退回和风区县反查（「xx附近」），照常使用 -->
          <div class="section-title">高德密钥（选填）</div>
          <div class="row">
            <span class="label">Key</span>
            <Input v-model="amapKey" size="small" class="control" placeholder="留空 = 显示区县附近" />
          </div>
          <div class="api-status">{{ amapStatusText }}</div>
          <Divider style="margin: 2px 0" />

          <!-- 天气面板整体缩放（全局属性，对应 project.json 的 panelscale） -->
          <div class="config-row">
            <div class="config-label">
              <span>面板缩放</span>
              <span class="config-value">{{ Math.round(state.panelscale * 100) }}%</span>
            </div>
            <Slider
              v-model="state.panelscale"
              :min="PANEL_SCALE_MIN"
              :max="PANEL_SCALE_MAX"
              :step="0.05"
              @change="applyAll"
            />
          </div>

          <div class="section-title">主界面位置</div>
          <div class="api-status" id="panel-offset-hint">相对屏幕中心，X 正值向右，Y 正值向下；到达屏幕边缘后停止移动。</div>
          <div v-for="axis in offsetAxes" :key="axis.key" class="config-row">
            <div class="config-label">
              <label :for="axis.key">{{ axis.label }}</label>
              <span class="config-value">{{ state[axis.key] > 0 ? '+' : '' }}{{ state[axis.key] }}%</span>
            </div>
            <input
              :id="axis.key"
              v-model.number="state[axis.key]"
              class="offset-slider"
              type="range"
              :min="PANEL_OFFSET_MIN"
              :max="PANEL_OFFSET_MAX"
              :step="1"
              aria-describedby="panel-offset-hint"
              @input="applyOffsets"
            />
          </div>
          <Button size="mini" long @click="resetPanelPosition">恢复居中</Button>

          <!-- 面板材质主题（对应 project.json 的 colortheme） -->
          <div class="row">
            <span class="label">面板配色</span>
            <Select v-model="state.colortheme" size="small" class="control" @change="applyAll">
              <Option value="night">夜雨玻璃</Option>
              <Option value="mist">晨雾玻璃</Option>
              <Option value="atlas">风暴图谱</Option>
            </Select>
          </div>

          <!-- 预报条显示天数（对应 project.json 的 forecastdays） -->
          <div class="row">
            <span class="label">预报天数</span>
            <Select v-model="state.forecastdays" size="small" class="control" @change="applyAll">
              <Option v-for="days in FORECAST_DAYS_OPTIONS" :key="days" :value="days">{{ days }} 天</Option>
            </Select>
          </div>

          <!-- 背景来源（对应 project.json 的 backgroundindex） -->
          <div class="row">
            <span class="label">背景</span>
            <Select v-model="state.backgroundindex" size="small" class="control" @change="applyAll">
              <Option value="4">湖心桥</Option>
              <Option value="6">雾夜长街</Option>
              <Option value="0">跟随面板配色</Option>
              <Option value="solid">自定义纯色</Option>
              <Option value="custom">自定义背景</Option>
            </Select>
          </div>

          <!-- 自定义纯色的颜色（对应 project.json 的 backgroundcolor） -->
          <div v-if="isCustomSolid" class="row">
            <span class="label">背景颜色</span>
            <input v-model="backgroundColorHex" class="color-input" type="color" />
          </div>

          <!-- 用户自选背景图（开发环境用 data URL 模拟引擎的 file 属性）。
               与壁纸属性面板的显示条件保持一致：只有背景切到「自定义背景」时才出现 -->
          <template v-if="isCustomBackground">
            <div class="section-title">自定义背景</div>
            <div class="row">
              <span class="label">图片</span>
              <span class="custom-background-name" :title="CustomBackgroundFileName">
                {{ CustomBackgroundFileName || '未选择' }}
              </span>
            </div>
            <Space :size="8">
              <label class="file-button">
                选择图片
                <input type="file" accept="image/*" @change="handleCustomBackgroundFile" />
              </label>
              <Button size="mini" :disabled="!CustomBackgroundRaw" @click="clearCustomBackground">清除</Button>
            </Space>
            <div class="api-status">仅浏览器调试用；壁纸引擎里请用属性面板的「自定义背景图」。</div>
          </template>

          <!-- 实时渲染雨滴：任意图片背景都能开，纯色背景隐藏 -->
          <template v-if="!isSolidBackground">
            <div class="section-title">实时雨滴</div>
            <div class="row">
              <span class="label">实时渲染雨滴</span>
              <Switch v-model="state.rainenabled" size="small" @change="applyAll" />
            </div>
            <div class="api-status">
              在当前背景图上渲染雨滴；自定义背景还没选图时先显示占位，选好图后自动生效。
            </div>
          </template>

          <!-- 当前背景的专属配置（按 project.json 中 rainenabled 的 condition 划分） -->
          <template v-if="currentFields.length">
            <Divider style="margin: 2px 0" />
            <div class="section-title">实时雨滴专属配置</div>

            <template v-for="field in currentFields" :key="field.key">
              <!-- 该背景独占的壁纸属性 -->
              <div v-if="field.property" class="row">
                <span class="label">{{ field.label }}</span>
                <Switch
                  v-if="field.type === 'boolean'"
                  v-model="state[field.property]"
                  size="small"
                  @change="applyAll"
                />
                <Select
                  v-else-if="field.type === 'select'"
                  v-model="state[field.property]"
                  size="small"
                  class="control"
                  @change="applyAll"
                >
                  <Option v-for="opt in field.options" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </Option>
                </Select>
              </div>

              <!-- 该背景的运行时效果参数 -->
              <div v-else class="config-row">
                <div class="config-label">
                  <span>{{ field.label }}</span>
                  <span class="config-value">{{ formatValue(bgConfig[field.key]) }}</span>
                </div>
                <Slider
                  v-if="field.type === 'slider'"
                  v-model="bgConfig[field.key]"
                  :min="field.min"
                  :max="field.max"
                  :step="field.step"
                  @change="applyBgConfig"
                />
                <Slider
                  v-else-if="field.type === 'range'"
                  v-model="bgConfig[field.key]"
                  range
                  :min="field.min"
                  :max="field.max"
                  :step="field.step"
                  @change="applyBgConfig"
                />
              </div>
            </template>

            <Button v-if="hasRuntimeFields" size="mini" long @click="resetBgConfig">
              恢复雨滴默认参数
            </Button>
          </template>
        </Space>
      </div>
    </Card>
  </div>
</template>

<script setup>
// 与调试面板一起加载，仅进入开发构建。
import '@arco-design/web-vue/dist/arco.css'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import { useWeatherStore } from '@/store'
import {
  Button,
  Card,
  Divider,
  Input,
  Option,
  Select,
  Slider,
  Space,
  Switch,
} from '@arco-design/web-vue'
import Bus from '@/shared/Bus'
import {
  BACKGROUND_INDEX_OPTIONS,
  BUS_EVENTS,
  COLOR_THEME_OPTIONS,
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_BACKGROUND_INDEX,
  DEFAULT_COLOR_THEME,
  DEFAULT_FORECAST_DAYS,
  DEFAULT_PANEL_OFFSET,
  DEFAULT_PANEL_SCALE,
  DEFAULT_RAIN_ENABLED,
  FORECAST_DAYS_OPTIONS,
  PANEL_OFFSET_MAX,
  PANEL_OFFSET_MIN,
  PANEL_SCALE_MAX,
  PANEL_SCALE_MIN,
  STORAGE_KEYS,
  WALLPAPER_PROPERTIES,
  isSolidBackgroundIndex,
} from './constants'
import {
  BackgroundColor,
  BackgroundIndex,
  ColorTheme,
  PanelOffsetX,
  PanelOffsetY,
  RainEnabled,
  applyWallpaperProperties,
} from './properties'
import {
  backgroundConfigSchema,
  getBackgroundConfig,
  resetBackgroundConfig,
  setBackgroundConfig,
} from './backgroundConfig'
import {
  CustomBackgroundFileName,
  CustomBackgroundRaw,
  setCustomBackground,
} from './customBackground'
import {
  hexToWallpaperColor,
  normalizeWallpaperColor,
  wallpaperColorToHex,
} from './backgrounds/backgroundColors'
import {
  AmapKeyRaw,
  UserApiHostRaw,
  UserApiKeyRaw,
  setAmapKeyFromBrowser,
  setUserApiFromBrowser,
} from '@/api/credentials'
import {
  ChosenLocationPath,
  CheckStatus,
  CheckSummary,
  LocationChosenAt,
  VerifiedFingerprint,
  openOnboarding,
  openSettings,
} from '@/features/onboarding/onboardingState'

// 收起状态落盘：刷新 / 重新加载后保持收起，不用每次重新点一遍
const collapsed = useStorage(STORAGE_KEYS.WALLPAPER_DEBUG_PANEL_COLLAPSED, false, localStorage)
const rainConfigStorage = useStorage(STORAGE_KEYS.WALLPAPER_USER_RAIN_CONFIG, 'auto', localStorage)

// 用户自带的 API 域名/密钥：与引导面板共用同一份状态（见 api/credentials.js）
const apiHost = ref(UserApiHostRaw.value)
const apiKey = ref(UserApiKeyRaw.value)
let apiTimer = null
watch([apiHost, apiKey], ([host, key]) => {
  clearTimeout(apiTimer)
  apiTimer = setTimeout(() => setUserApiFromBrowser(host, key), 300)
})
watch([UserApiHostRaw, UserApiKeyRaw], ([host, key]) => {
  if (apiHost.value !== host) apiHost.value = host
  if (apiKey.value !== key) apiKey.value = key
})

// 可选的高德密钥：只在开发环境用得上（发布版包里不带 key，用户在属性面板自己填）。
// 与凭据模块双向同步，同样带去抖，避免逐字符落盘
const amapKey = ref(AmapKeyRaw.value)
let amapTimer = null
watch(amapKey, (value) => {
  clearTimeout(amapTimer)
  amapTimer = setTimeout(() => setAmapKeyFromBrowser(value), 300)
})
watch(AmapKeyRaw, (value) => {
  if (amapKey.value !== value) amapKey.value = value
})
const amapStatusText = computed(() => (
  String(AmapKeyRaw.value || '').trim()
    ? '已填写：地图选点会显示最近的道路名'
    : '未填写：地址改用和风区县反查，显示「xx附近」'
))

const checkStatusText = computed(() => {
  const status = CheckStatus.value
  if (status === 'checking') return '检测中…'
  if (status === 'ok') return `可用：${CheckSummary.value}`
  if (status === 'error') return `不可用：${CheckSummary.value}`
  return '等待填写域名/密钥'
})

// 模拟新用户：清掉凭据、验证结果与已选位置，强制打开引导页
const weatherStore = useWeatherStore()
const resetOnboarding = () => {
  apiHost.value = ''
  apiKey.value = ''
  setUserApiFromBrowser('', '')
  VerifiedFingerprint.value = ''
  LocationChosenAt.value = 0
  ChosenLocationPath.value = []
  // 上一次地图点选的坐标也要清掉：只清「是否选过」和路径的话，地址页会把这份
  // 残留坐标当成「当前位置」，一进去就跳过三列直接开地图、按钮直接是「就用这里」，
  // 于是「模拟首次使用」压根不是首次。
  weatherStore.dayDateCity = { ...weatherStore.dayDateCity, point: null }
  openOnboarding()
}

// 调试属性直接持久化到 localStorage，修改即保存，无需手动读写
const state = useStorage(
  STORAGE_KEYS.WALLPAPER_DEBUG_PROPERTIES,
  {
    backgroundindex: BackgroundIndex.value,
    backgroundcolor: BackgroundColor.value,
    rainenabled: RainEnabled.value,
    showweathermain: false,
    rainconfig: rainConfigStorage.value,
    panelscale: DEFAULT_PANEL_SCALE,
    paneloffsetx: PanelOffsetX.value,
    paneloffsety: PanelOffsetY.value,
    colortheme: ColorTheme.value,
    forecastdays: DEFAULT_FORECAST_DAYS,
  },
  localStorage
)

// 兼容旧数据：背景序号统一为字符串
if (state.value.backgroundindex !== undefined) {
  state.value.backgroundindex = String(state.value.backgroundindex)
}
// 兼容旧数据：1/2/3 背景已移除，残留的序号回退到默认背景
if (!BACKGROUND_INDEX_OPTIONS.includes(state.value.backgroundindex)) {
  state.value.backgroundindex = DEFAULT_BACKGROUND_INDEX
}
// 兼容旧数据：早期版本没有纯色颜色 / 雨滴开关字段
state.value.backgroundcolor = normalizeWallpaperColor(state.value.backgroundcolor, DEFAULT_BACKGROUND_COLOR)
if (state.value.rainenabled === undefined || state.value.rainenabled === null) {
  state.value.rainenabled = DEFAULT_RAIN_ENABLED
} else {
  state.value.rainenabled = !!state.value.rainenabled
}
// 兼容旧数据：早期版本没有面板缩放字段
if (state.value.panelscale === undefined) {
  state.value.panelscale = DEFAULT_PANEL_SCALE
}
const offsetAxes = [
  { key: WALLPAPER_PROPERTIES.PANEL_OFFSET_X, label: 'X 轴偏移（左右）' },
  { key: WALLPAPER_PROPERTIES.PANEL_OFFSET_Y, label: 'Y 轴偏移（上下）' },
]
offsetAxes.forEach(({ key }) => {
  const value = state.value[key]
  const num = Number(value)
  state.value[key] = value === null || value === undefined || !Number.isFinite(num)
    ? DEFAULT_PANEL_OFFSET
    : Math.min(PANEL_OFFSET_MAX, Math.max(PANEL_OFFSET_MIN, num))
})
if (!COLOR_THEME_OPTIONS.includes(state.value.colortheme)) {
  state.value.colortheme = DEFAULT_COLOR_THEME
}
// 兼容旧数据：早期版本没有预报天数字段，非法值也回退到默认 7 天
if (!FORECAST_DAYS_OPTIONS.includes(Number(state.value.forecastdays))) {
  state.value.forecastdays = DEFAULT_FORECAST_DAYS
}

// 与 project.json 的显示条件一致：选图入口只在「自定义背景」下出现；
// 两种纯色背景都不显示雨滴开关和雨滴专属配置
const isCustomBackground = computed(() => state.value.backgroundindex === 'custom')
const isSolidBackground = computed(() => isSolidBackgroundIndex(state.value.backgroundindex))
const isCustomSolid = computed(() => state.value.backgroundindex === 'solid')
const showRainConfig = computed(() => !!state.value.rainenabled && !isSolidBackground.value)

// 纯色颜色：引擎里是 "r g b"，调试面板用原生取色器（#rrggbb）编辑
const backgroundColorHex = computed({
  get: () => wallpaperColorToHex(state.value.backgroundcolor),
  set: (hex) => {
    const normalized = hexToWallpaperColor(hex)
    if (!normalized) return
    state.value.backgroundcolor = normalized
    applyAll()
  },
})

// 转换为 Wallpaper Engine applyUserProperties 的入参结构
const toWallpaperProperties = (p) => ({
  [WALLPAPER_PROPERTIES.BACKGROUND_INDEX]: { value: String(p.backgroundindex) },
  [WALLPAPER_PROPERTIES.BACKGROUND_COLOR]: { value: p.backgroundcolor },
  [WALLPAPER_PROPERTIES.RAIN_ENABLED]: { value: p.rainenabled },
  [WALLPAPER_PROPERTIES.SHOW_WEATHER_MAIN]: { value: p.showweathermain },
  [WALLPAPER_PROPERTIES.RAIN_CONFIG]: { value: p.rainconfig },
  [WALLPAPER_PROPERTIES.PANEL_SCALE]: { value: p.panelscale },
  [WALLPAPER_PROPERTIES.PANEL_OFFSET_X]: { value: p.paneloffsetx },
  [WALLPAPER_PROPERTIES.PANEL_OFFSET_Y]: { value: p.paneloffsety },
  [WALLPAPER_PROPERTIES.COLOR_THEME]: { value: p.colortheme },
  [WALLPAPER_PROPERTIES.FORECAST_DAYS]: { value: String(p.forecastdays) },
  // 自定义背景单独走 customBackground.js 的持久化；调试时允许 blob: URL 只在当前会话有效
  [WALLPAPER_PROPERTIES.CUSTOM_BACKGROUND]: { value: CustomBackgroundRaw.value },
})

// 只下发自定义背景属性，避免选一张图就把其它面板状态重新广播一遍
const applyCustomBackgroundProperties = () => {
  applyWallpaperProperties({
    [WALLPAPER_PROPERTIES.CUSTOM_BACKGROUND]: { value: CustomBackgroundRaw.value },
  })
}

// 开发环境无法拿到 file:// 路径，用 data URL 模拟引擎下发的图片。
// 先压到最长边 1920 + WebP：通常只有几百 KB，可以跨刷新保留，
// 重新打开调试面板后也能直接看到上次选的图。
const MAX_DEBUG_BACKGROUND_EDGE = 1920
const createDebugBackground = (file) => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file)
  const image = new Image()
  image.onload = () => {
    URL.revokeObjectURL(objectUrl)
    try {
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      if (!width || !height) {
        reject(new Error('图片尺寸无效'))
        return
      }
      const scale = Math.min(1, MAX_DEBUG_BACKGROUND_EDGE / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('无法创建 2D canvas 上下文'))
        return
      }
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/webp', 0.82))
    } catch (error) {
      reject(error)
    }
  }
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl)
    reject(new Error('图片解码失败'))
  }
  image.src = objectUrl
})

const handleCustomBackgroundFile = async (event) => {
  const file = event.target.files && event.target.files[0]
  // 清空 value，允许连续选择同一个文件
  event.target.value = ''
  if (!file) return
  if (!file.type || !file.type.startsWith('image/')) {
    console.warn('[Wallpaper] 调试面板只接受图片文件')
    return
  }
  try {
    const dataUrl = await createDebugBackground(file)
    setCustomBackground(dataUrl)
    applyCustomBackgroundProperties()
  } catch (error) {
    console.warn('[Wallpaper] 调试面板读取图片失败', error)
  }
}

const clearCustomBackground = () => {
  setCustomBackground('')
  applyCustomBackgroundProperties()
}

const applyAll = () => {
  applyWallpaperProperties(toWallpaperProperties(state.value))
}

// 拖动时只下发位置，避免反复广播显示隐藏、雨滴强度等无关属性。
const applyOffsets = () => {
  applyWallpaperProperties(Object.fromEntries(offsetAxes.map(({ key }) => [key, { value: state.value[key] }])))
}
const resetPanelPosition = () => {
  offsetAxes.forEach(({ key }) => { state.value[key] = DEFAULT_PANEL_OFFSET })
  applyOffsets()
}

// ---------- 实时雨滴的专属配置 ----------
// 雨滴参数固定存在 '4' 下，与背景是纯色 / 默认图 / 自定义图无关
const RAIN_CONFIG_INDEX = '4'
const currentSchema = computed(() => (
  showRainConfig.value ? backgroundConfigSchema[RAIN_CONFIG_INDEX] : null
))
const currentFields = computed(() => currentSchema.value?.fields || [])
const hasRuntimeFields = computed(() => currentFields.value.some((field) => !field.property))

const bgConfig = reactive({})
const loadBgConfig = (index) => {
  const cfg = getBackgroundConfig(index)
  Object.keys(bgConfig).forEach((key) => delete bgConfig[key])
  Object.assign(bgConfig, cfg)
}

const applyBgConfig = () => {
  const index = RAIN_CONFIG_INDEX
  setBackgroundConfig(index, JSON.parse(JSON.stringify(bgConfig)))
  Bus.emit(BUS_EVENTS.BACKGROUND_CONFIG_CHANGE, { index, config: { ...bgConfig } })
}

const resetBgConfig = () => {
  resetBackgroundConfig(RAIN_CONFIG_INDEX)
  loadBgConfig(RAIN_CONFIG_INDEX)
  applyBgConfig()
}

const formatValue = (val) => (Array.isArray(val) ? `${val[0]} ~ ${val[1]}` : val)

watch(showRainConfig, (visible) => {
  if (visible) loadBgConfig(RAIN_CONFIG_INDEX)
}, { immediate: true })

// 背景切换不再刷新页面，挂载后把当前调试状态下发一次即可
onMounted(() => {
  setTimeout(() => {
    applyAll()
  }, 0)
})
</script>

<style lang="scss" scoped>
.wallpaper-debug-panel {
  position: fixed;
  top: 50px;
  right: 50px;
  /* 需低于 Arco 弹层默认 z-index(1000)，避免遮住 Select 下拉浮层 */
  z-index: 900;
  width: 280px;
  max-width: calc(100vw - 100px);

  .panel-card {
    border-radius: 10px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  }

  .panel-title {
    font-weight: 600;
  }

  .panel-body {
    max-height: 70vh;
    overflow-y: auto;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;

    .label {
      flex-shrink: 0;
      font-size: 13px;
    }

    .control {
      flex: 1;
    }
  }

  .section-title {
    font-size: 13px;
    font-weight: 600;
  }

  .color-input {
    width: 48px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: 1px solid var(--glass-border);
    border-radius: 4px;
    cursor: pointer;
  }

  .custom-background-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 12px;
    color: var(--text-muted);
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    padding: 0 10px;
    font-size: 12px;
    font-weight: 500;
    color: rgb(var(--primary-6));
    background: transparent;
    border: 1px solid rgb(var(--primary-6));
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease;

    &:hover {
      color: #fff;
      background: rgb(var(--primary-6));
    }

    input {
      display: none;
    }
  }

  .api-status {
    font-size: 12px;
    line-height: 1.5;
    opacity: 0.7;
  }

  .config-row {
    margin-bottom: 6px;
  }

  .offset-slider {
    display: block;
    box-sizing: border-box;
    width: 100%;
    min-height: 24px;
    margin: 0;
    accent-color: rgb(var(--primary-6));
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid rgb(var(--primary-6));
      outline-offset: 2px;
    }
  }

  .config-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    margin-bottom: 2px;

    .config-value {
      opacity: 0.6;
    }
  }
}
</style>
