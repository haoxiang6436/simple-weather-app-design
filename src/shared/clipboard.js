import { onUnmounted, ref } from 'vue'

/**
 * 复制文本到剪贴板
 *
 * Wallpaper Engine 的 CEF 里 navigator.clipboard 不一定可用（权限 / 安全上下文），
 * 因此再加一层 textarea + document.execCommand('copy') 兜底。
 * 返回是否复制成功，调用方据此给用户"已复制 / 复制失败，请手动输入"的反馈。
 */
export const copyTextToClipboard = async (text) => {
  const value = String(text ?? '')
  if (!value) return false

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch (error) {
    // 继续尝试兜底方案
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-1000px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch (error) {
    return false
  }
}

/** 和风天气控制台（创建项目 / 凭据的页面） */
export const QWEATHER_CONSOLE_URL = 'https://console.qweather.com/project'

/** 壁纸开源仓库 */
export const PROJECT_REPO_URL = 'https://github.com/haoxiang6436/simple-weather-app-design'

/** 去掉协议头，用于界面里更短的展示 */
export const shortUrl = (url) => String(url || '').replace(/^https?:\/\//i, '')

/**
 * 复制 + 反馈文案：点击后 2.5 秒内显示"已复制 / 复制失败，请手动输入"
 * @param {string} text 要复制的文本
 */
export const useCopyFeedback = (text) => {
  const state = ref('')
  let timer = null
  const copy = async () => {
    const ok = await copyTextToClipboard(text)
    state.value = ok ? '已复制' : '复制失败，请手动输入'
    clearTimeout(timer)
    timer = setTimeout(() => {
      state.value = ''
    }, 2500)
  }
  onUnmounted(() => clearTimeout(timer))
  return { state, copy }
}
