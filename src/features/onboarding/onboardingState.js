/**
 * 新用户引导的状态机
 *
 * 流程：引导说明 → 读取用户填写的域名/密钥 → 自动检测 → 选择位置 → 显示天气
 * 只有「凭据齐备 + 检测通过（或用户手动确认继续）+ 已选位置」三件事都完成，
 * 天气面板才会出现；不使用内置额度。
 */
import { computed, ref, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import Bus from '@/shared/Bus'
import { BUS_EVENTS } from '@/features/wallpaper/constants'
import { checkApiEntry } from '@/api/weather'
import { isNetworkError } from '@/api/errors'
import {
  UserApiEntries,
  UserApiFingerprint,
  UserApiReason,
  UserApiState,
  setRejectedHosts,
} from '@/api/credentials'
import { WallpaperPropertiesReady } from '@/features/wallpaper/properties'

const VERIFIED_STORAGE_KEY = 'WallpaperUserApiVerified'
const LOCATION_CHOSEN_STORAGE_KEY = 'WeatherLocationChosenAt'
const LOCATION_PATH_STORAGE_KEY = 'WeatherLocationPath'
// 自动检测的去抖时间：壁纸引擎可能逐字符下发 textinput
const CHECK_DEBOUNCE_MS = 700

// 上次检测通过的凭据指纹（只存哈希，不存密钥）
export const VerifiedFingerprint = useStorage(VERIFIED_STORAGE_KEY, '')
// 用户是否已经完成过一次位置选择（0 = 没选过）
export const LocationChosenAt = useStorage(LOCATION_CHOSEN_STORAGE_KEY, 0)
// 上次选择的位置路径（省市区的 adcode + 名称），再次打开地址页时用于回显
export const ChosenLocationPath = useStorage(LOCATION_PATH_STORAGE_KEY, [])

// idle | checking | ok | error
export const CheckStatus = ref('idle')
// [{ host, ok, kind, code, message, soft }]
export const CheckResults = ref([])
export const CheckSummary = ref('')
// 用户手动打开引导页（天气卡上的入口）
export const ForceOpen = ref(false)
// 网络类失败时用户选择"仍然继续"的凭据指纹（仅本次会话有效）
const NetworkOverride = ref('')

const classifyCheckError = (error) => {
  if (isNetworkError(error)) {
    const timeout = error?.code === 'TIMEOUT'
    return {
      kind: 'network',
      code: error?.code || 'NETWORK_ERROR',
      message: timeout ? '请求超时' : '网络不可用',
      soft: true,
    }
  }
  const code = String(error?.code || '')
  const table = {
    401: { kind: 'auth', message: '密钥无效或类型不对（需要 Web API Key）' },
    402: { kind: 'quota', message: '额度不足或已超限' },
    403: { kind: 'forbidden', message: '密钥未绑定这个域名，或没有该接口的权限' },
    404: { kind: 'notfound', message: '接口不存在，域名可能填错了' },
    429: { kind: 'rate', message: '请求过于频繁，稍后再试' },
  }
  if (table[code]) return { ...table[code], code, soft: false }
  if (/^5\d\d$/.test(code)) {
    return { kind: 'server', code, message: `接口服务异常（HTTP ${code}）`, soft: true }
  }
  return {
    kind: 'unknown',
    code,
    message: error?.message || '检测失败，请检查域名与密钥',
    soft: false,
  }
}

/** 逐组检测域名/密钥；只要有一组可用就认为可以通过（失败的域名会被轮询跳过） */
export const runApiCheck = async () => {
  const entries = UserApiEntries.value
  const fingerprint = UserApiFingerprint.value
  if (UserApiState.value !== 'ok' || !entries.length) return
  if (CheckStatus.value === 'checking') return

  CheckStatus.value = 'checking'
  const results = await Promise.all(
    entries.map(async (entry) => {
      try {
        await checkApiEntry(entry)
        return { host: entry.host, ok: true, kind: 'ok', code: '200', message: '可用', soft: false }
      } catch (error) {
        return { host: entry.host, ok: false, ...classifyCheckError(error) }
      }
    })
  )

  // 用户在检测期间改了输入 → 丢弃这次结果，等去抖后的下一次检测
  if (fingerprint !== UserApiFingerprint.value) return

  CheckResults.value = results
  const passed = results.filter((item) => item.ok)
  const failed = results.filter((item) => !item.ok)
  setRejectedHosts(fingerprint, failed.map((item) => item.host))

  if (passed.length) {
    CheckStatus.value = 'ok'
    VerifiedFingerprint.value = fingerprint
    CheckSummary.value = failed.length
      ? `${passed.length} 组可用、${failed.length} 组不可用`
      : '域名与密钥可用'
  } else {
    CheckStatus.value = 'error'
    CheckSummary.value = failed[0]?.message || '检测失败，请检查域名与密钥'
  }
}

/** 网络类失败时允许继续（用的还是用户自己的凭据） */
export const canContinueWithoutCheck = computed(() => {
  if (CheckStatus.value !== 'error' || !CheckResults.value.length) return false
  return CheckResults.value.every((item) => item.soft)
})

export const continueWithoutCheck = () => {
  NetworkOverride.value = UserApiFingerprint.value
  // 用户手动确认继续 → 引导页的"强制打开"状态也随之结束
  ForceOpen.value = false
}

export const openOnboarding = () => {
  ForceOpen.value = true
}

export const closeOnboarding = () => {
  ForceOpen.value = false
}

export const markLocationChosen = (path) => {
  LocationChosenAt.value = Date.now()
  if (Array.isArray(path) && path.length) {
    ChosenLocationPath.value = path.map((node) => ({ value: node.value, label: node.label }))
  }
  // 流程已经走完，引导页该让位了。
  // 用户是点天气卡上的入口/「模拟首次使用」手动打开引导页时 ForceOpen 为 true，
  // 不清掉的话即使选好位置也会一直被它按住在引导页上。
  ForceOpen.value = false
}

/** 凭据齐备且已通过检测（或已选择继续） */
export const CredentialsReady = computed(() => {
  if (UserApiState.value !== 'ok' || !UserApiEntries.value.length) return false
  if (CheckStatus.value === 'ok') return true
  return !!NetworkOverride.value && NetworkOverride.value === UserApiFingerprint.value
})

export const NeedsLocation = computed(() => !LocationChosenAt.value)

/** 是否需要显示引导面板 */
export const OnboardingOpen = computed(
  () => ForceOpen.value || !CredentialsReady.value || NeedsLocation.value
)

/** 天气面板可以开始请求数据了 */
export const WeatherReady = computed(
  () => WallpaperPropertiesReady.value && CredentialsReady.value && !NeedsLocation.value
)

/** 给 UI 用的状态描述 */
export const CredentialStatus = computed(() => {
  if (UserApiState.value === 'empty') return { tone: 'wait', title: '等待填写', desc: '还没读取到域名与密钥' }
  if (UserApiState.value === 'mismatch' || UserApiState.value === 'invalid-host') {
    return { tone: 'warn', title: '填写有误', desc: UserApiReason.value }
  }
  if (CheckStatus.value === 'checking') return { tone: 'loading', title: '正在检测…', desc: '正在用你的域名/密钥请求一次和风天气接口' }
  if (CheckStatus.value === 'ok') return { tone: 'ok', title: '检测通过', desc: CheckSummary.value }
  if (CheckStatus.value === 'error') return { tone: 'error', title: '检测失败', desc: CheckSummary.value }
  return { tone: 'wait', title: '等待检测', desc: '已读取到你填写的域名与密钥，稍后自动检测' }
})

let checkTimer = null
watch(
  [UserApiFingerprint, UserApiState],
  ([fingerprint, state]) => {
    clearTimeout(checkTimer)
    if (state !== 'ok' || !fingerprint) {
      CheckStatus.value = 'idle'
      CheckResults.value = []
      CheckSummary.value = ''
      return
    }
    if (fingerprint === VerifiedFingerprint.value) {
      CheckStatus.value = 'ok'
      CheckSummary.value = '检测通过（凭据未变）'
      return
    }
    if (NetworkOverride.value && NetworkOverride.value !== fingerprint) {
      NetworkOverride.value = ''
    }
    CheckStatus.value = 'idle'
    CheckResults.value = []
    checkTimer = setTimeout(() => {
      runApiCheck()
    }, CHECK_DEBOUNCE_MS)
  },
  { immediate: true }
)

// 运行中请求返回 401/402/403：用户填的密钥失效/超额 → 重新打开引导页
Bus.on(BUS_EVENTS.USER_API_INVALID, (payload) => {
  VerifiedFingerprint.value = ''
  setRejectedHosts(UserApiFingerprint.value, [])
  CheckResults.value = []
  CheckStatus.value = 'error'
  CheckSummary.value = payload?.message || '密钥失效或额度不足，请重新填写域名与密钥'
  ForceOpen.value = true
})
