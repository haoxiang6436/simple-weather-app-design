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
            <Button size="mini" @click="openOnboarding">打开引导页</Button>
            <Button size="mini" @click="resetOnboarding">模拟首次使用</Button>
          </Space>
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

          <!-- 背景切换（全局属性，对应 project.json 的 backgroundindex） -->
          <div class="row">
            <span class="label">背景</span>
            <Select v-model="state.backgroundindex" size="small" class="control" @change="applyAll">
              <Option value="0">无</Option>
              <Option value="1">小鸟</Option>
              <Option value="2">星空</Option>
              <Option value="3">动态粒子</Option>
              <Option value="4">实时渲染雨滴</Option>
              <Option value="5">整页雨珠叠加</Option>
            </Select>
          </div>

          <!-- 当前背景的专属配置（按 project.json 中 backgroundindex 的 condition 划分） -->
          <template v-if="currentFields.length">
            <Divider style="margin: 2px 0" />
            <div class="section-title">{{ currentSchema.label }}专属配置</div>

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
              恢复该背景默认参数
            </Button>
          </template>
        </Space>
      </div>
    </Card>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useStorage } from '@vueuse/core'
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
  BUS_EVENTS,
  DEFAULT_PANEL_SCALE,
  PANEL_SCALE_MAX,
  PANEL_SCALE_MIN,
  STORAGE_KEYS,
  WALLPAPER_PROPERTIES,
} from './constants'
import {
  BackgroundIndex,
  BirdInteraction,
  applyWallpaperProperties,
} from './properties'
import {
  backgroundConfigSchema,
  getBackgroundConfig,
  resetBackgroundConfig,
  setBackgroundConfig,
} from './backgroundConfig'
import { UserApiHostRaw, UserApiKeyRaw, setUserApiFromBrowser } from '@/api/credentials'
import {
  ChosenLocationPath,
  CheckStatus,
  CheckSummary,
  ForceOpen,
  LocationChosenAt,
  VerifiedFingerprint,
  openOnboarding,
} from '@/features/onboarding/onboardingState'

const collapsed = ref(false)
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

const checkStatusText = computed(() => {
  const status = CheckStatus.value
  if (status === 'checking') return '检测中…'
  if (status === 'ok') return `可用：${CheckSummary.value}`
  if (status === 'error') return `不可用：${CheckSummary.value}`
  return '等待填写域名/密钥'
})

// 模拟新用户：清掉凭据、验证结果与已选位置，强制打开引导页
const resetOnboarding = () => {
  apiHost.value = ''
  apiKey.value = ''
  setUserApiFromBrowser('', '')
  VerifiedFingerprint.value = ''
  LocationChosenAt.value = 0
  ChosenLocationPath.value = []
  ForceOpen.value = true
}

// 调试属性直接持久化到 localStorage，修改即保存，无需手动读写
const state = useStorage(
  STORAGE_KEYS.WALLPAPER_DEBUG_PROPERTIES,
  {
    backgroundindex: BackgroundIndex.value,
    backgroundinteraction: BirdInteraction.value,
    showweathermain: false,
    rainconfig: rainConfigStorage.value,
    panelscale: DEFAULT_PANEL_SCALE,
  },
  localStorage
)

// 兼容旧数据：背景序号统一为字符串
if (state.value.backgroundindex !== undefined) {
  state.value.backgroundindex = String(state.value.backgroundindex)
}
// 兼容旧数据：早期版本没有面板缩放字段
if (state.value.panelscale === undefined) {
  state.value.panelscale = DEFAULT_PANEL_SCALE
}

// 转换为 Wallpaper Engine applyUserProperties 的入参结构
const toWallpaperProperties = (p) => ({
  [WALLPAPER_PROPERTIES.BACKGROUND_INTERACTION]: { value: p.backgroundinteraction },
  [WALLPAPER_PROPERTIES.BACKGROUND_INDEX]: { value: String(p.backgroundindex) },
  [WALLPAPER_PROPERTIES.SHOW_WEATHER_MAIN]: { value: p.showweathermain },
  [WALLPAPER_PROPERTIES.RAIN_CONFIG]: { value: p.rainconfig },
  [WALLPAPER_PROPERTIES.PANEL_SCALE]: { value: p.panelscale },
})

const applyAll = () => {
  applyWallpaperProperties(toWallpaperProperties(state.value))
}

// ---------- 当前背景的专属配置 ----------
const currentSchema = computed(() => backgroundConfigSchema[state.value.backgroundindex])
const currentFields = computed(() => currentSchema.value?.fields || [])
const hasRuntimeFields = computed(() => currentFields.value.some((field) => !field.property))

const bgConfig = reactive({})
const loadBgConfig = (index) => {
  const cfg = getBackgroundConfig(index)
  Object.keys(bgConfig).forEach((key) => delete bgConfig[key])
  Object.assign(bgConfig, cfg)
}

const applyBgConfig = () => {
  const index = state.value.backgroundindex
  setBackgroundConfig(index, JSON.parse(JSON.stringify(bgConfig)))
  Bus.emit(BUS_EVENTS.BACKGROUND_CONFIG_CHANGE, { index, config: { ...bgConfig } })
}

const resetBgConfig = () => {
  resetBackgroundConfig(state.value.backgroundindex)
  loadBgConfig(state.value.backgroundindex)
  applyBgConfig()
}

const formatValue = (val) => (Array.isArray(val) ? `${val[0]} ~ ${val[1]}` : val)

watch(() => state.value.backgroundindex, (index) => loadBgConfig(index), { immediate: true })

// 切换背景会触发 location.reload()，页面重载后恢复并重新应用调试属性
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

  .api-status {
    font-size: 12px;
    line-height: 1.5;
    opacity: 0.7;
  }

  .config-row {
    margin-bottom: 6px;
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
