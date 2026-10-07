<template>
  <!-- 第 1 步 ↔ 第 2 步：换的是外壳里的内容，外壳不动（动效定义见 style/weather-panel.scss） -->
  <!-- 根节点必须是一个普通元素，不能直接是 <Transition>：
       外层（WeatherMain 的 .weather-shell）用 mode="out-in" 做「引导页 ↔ 天气卡」的切换时，
       会顺着组件树去找真实元素；如果这里直接返回 Transition，一旦内层正处于切换中，
       外层就取不到元素、只渲染一个注释占位，结果天气卡永远出不来、外壳变成一张空卡。 -->
  <div class="panel-view onb-stage">
    <Transition name="panel-swap">
      <!-- 检测通过 + 用户点了「下一步」→ 同一个面板内的第 2 步：选择位置 -->
      <LocationPicker v-if="showLocationStep" @selected="handleLocationSelected" />

      <!-- 第 1 步：说明 + 实时读取用户填写的域名/密钥 + 检测结果 -->
      <!-- 页面里任何一次点击 / 按键都说明用户在场，立刻停掉自动前进（见下方 autoSecondsLeft） -->
      <div v-else class="panel-view OnboardingPanel" @pointerdown="stopAutoAdvance" @keydown="stopAutoAdvance">
        <section class="onb-left">
          <div class="onb-aura" aria-hidden="true"></div>

          <div class="onb-body">
            <header class="onb-head">
              <span class="onb-kicker"><i class="onb-kicker-dot"></i>首次使用</span>
              <h1 class="onb-title">还差一步，<br />才能<span class="onb-title-hl">显示天气</span></h1>
              <p class="onb-lead">
                请在右侧「壁纸属性」面板填入 <b>你自己的域名与密钥</b>，壁纸会自动读取并检测。
              </p>
            </header>

            <div class="onb-status" :class="'tone-' + status.tone">
              <div class="onb-status-main">
                <span class="onb-status-icon">
                  <span class="onb-status-glyph" :class="{ spinning: status.tone === 'loading' }">{{ statusGlyph }}</span>
                </span>
                <div class="onb-status-text">
                  <div class="onb-status-title">{{ status.title }}</div>
                  <div class="onb-status-desc">{{ status.desc }}</div>
                </div>
              </div>

              <!-- 多个域名时，逐组结果收进同一张卡里，避免两块信息各说各话 -->
              <ul v-if="CheckResults.length > 1" class="onb-status-list">
                <li v-for="item in CheckResults" :key="item.host" :class="{ bad: !item.ok }">
                  <i class="onb-status-dot"></i>
                  <span class="onb-status-host">{{ item.host }}</span>
                  <span class="onb-status-msg">{{ item.ok ? '可用' : item.message }}</span>
                </li>
              </ul>
            </div>

            <div class="onb-actions">
              <button v-if="primaryAction" class="onb-btn primary" type="button" :disabled="primaryAction.disabled"
                @click="primaryAction.run()">{{ primaryLabel }}</button>
              <button v-if="secondaryAction" class="onb-btn ghost" type="button" :disabled="secondaryAction.disabled"
                @click="secondaryAction.run()">{{ secondaryAction.label }}</button>
              <div v-if="autoSecondsLeft > 0" class="onb-auto">
                <span>不想自动继续？</span>
                <button class="onb-auto-cancel" type="button" @click="stopAutoAdvance">留在此页</button>
              </div>
              <button class="onb-help" type="button" @click="showHelp = true">
                <svg class="onb-help-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"
                    d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
                怎么获取域名与密钥？
              </button>
            </div>
          </div>

          <div class="onb-progress">
            <span class="onb-progress-dots"><i class="on" :class="{ done: stepDone }"></i><i></i></span>
            <span>{{ stepHint }}</span>
          </div>
        </section>

        <section class="onb-right">
          <div class="onb-right-body">
            <header class="onb-right-head">
              <span class="onb-right-kicker">操作指引</span>
              <p class="onb-right-sub">按顺序完成下面 3 步即可</p>
            </header>

            <ol class="onb-steps">
              <li>
                <span class="onb-step-no">1</span>
                <div class="onb-step-body">
                  <div class="onb-step-title">打开「壁纸属性」面板</div>
                  <p class="onb-step-text">右键这张壁纸 →「设置」，面板在窗口右侧</p>
                </div>
              </li>
              <li>
                <span class="onb-step-no">2</span>
                <div class="onb-step-body">
                  <div class="onb-step-title">粘贴域名与密钥</div>
                  <p class="onb-step-text">多个用英文逗号分隔、按顺序一一配对</p>
                </div>
              </li>
              <li>
                <span class="onb-step-no">3</span>
                <div class="onb-step-body">
                  <div class="onb-step-title">检测通过 → 选好城市，显示天气</div>
                  <p class="onb-step-text">检测通过后会倒数几秒自动继续；也可以直接点按钮马上走</p>
                </div>
              </li>
            </ol>

            <div v-if="entries.length" class="onb-readout">
              <div class="onb-card-head">
                <span class="onb-card-title">已读取到</span>
                <span class="onb-card-pill">{{ entries.length }} 组</span>
              </div>
              <div v-for="item in maskedEntries" :key="item.host" class="onb-readout-row">
                <span class="onb-readout-host">{{ item.host }}</span>
                <span class="onb-readout-key">{{ item.key }}</span>
              </div>
            </div>

            <!-- 浏览器（Edge 调试 / 直接打开 dist）能输入；壁纸引擎里没有这一块 -->
            <div v-if="browserRuntime" class="onb-dev">
              <div class="onb-card-head">
                <span class="onb-card-title">浏览器调试</span>
                <span class="onb-card-pill dev">仅浏览器可用</span>
              </div>
              <label class="onb-dev-row">
                <span class="onb-dev-label">域名</span>
                <input v-model="devHost" class="onb-dev-input" type="text" spellcheck="false"
                  placeholder="xxxx.re.qweatherapi.com" />
              </label>
              <label class="onb-dev-row">
                <span class="onb-dev-label">密钥</span>
                <input v-model="devKey" class="onb-dev-input" type="text" spellcheck="false" placeholder="Web API Key" />
              </label>
              <p class="onb-dev-hint">输入后自动检测，多个用英文逗号分隔</p>
            </div>
            <p v-else class="onb-hint">填完没反应？点一下输入框外的空白处，让属性生效。</p>
          </div>

          <!-- 底部：开源地址 + 免责声明 -->
          <div class="onb-foot">
            <div class="onb-repo">
              <span class="onb-repo-label">开源仓库</span>
              <button class="onb-console-url" type="button" :title="'点击复制：' + repoUrl"
                @click="copyRepoUrl()">{{ repoShort }}</button>
              <span class="onb-console-state">{{ repoCopyState }}</span>
            </div>
            <p class="onb-disclaimer">
              本壁纸为开源项目（无盈利）；你填写的域名与密钥只保存在本机、不会上传；天气数据来自和风天气，仅供参考。
            </p>
          </div>
        </section>

        <!-- 怎么获取域名与密钥：弹层形式，不再顶掉整个引导面板 -->
        <ApiHelpPanel :open="showHelp" @close="showHelp = false" />
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import LocationPicker from '@/features/weather/LocationPicker.vue'
import ApiHelpPanel from './ApiHelpPanel.vue'
import {
  UserApiEntries,
  UserApiFingerprint,
  UserApiHostRaw,
  UserApiKeyRaw,
  setUserApiFromBrowser,
} from '@/api/credentials'
import { isBrowserRuntime } from '@/shared/env'
import { PROJECT_REPO_URL, shortUrl, useCopyFeedback } from '@/shared/clipboard'
import {
  CheckResults,
  CheckStatus,
  CredentialStatus,
  CredentialsReady,
  NeedsLocation,
  canContinueWithoutCheck,
  closeOnboarding,
  continueWithoutCheck,
  runApiCheck,
} from './onboardingState'

const status = CredentialStatus
const entries = UserApiEntries
const browserRuntime = computed(() => isBrowserRuntime())
// 帮助页（怎么获取域名与密钥）开关
const showHelp = ref(false)

// 开源仓库地址：点击写入剪贴板（控制台地址只在帮助页里出现）
const repoUrl = PROJECT_REPO_URL
const repoShort = shortUrl(repoUrl)
const { state: repoCopyState, copy: copyRepoUrl } = useCopyFeedback(repoUrl)

// 检测通过后由用户点「下一步」再进第 2 步：否则「检测通过」一闪而过，用户根本没看到结果
const nextStepRequested = ref(false)
// 这里刻意不把 NeedsLocation 写进条件：
// 选好位置后 NeedsLocation 会立刻变 false，如果第 2 步跟着变回第 1 步，
// 就会在外层外壳「引导页 → 天气卡」的离场动画进行到一半时把它正在动画的节点摘掉，
// 外层 Transition 的 mode="out-in" 收不到 transitionend，天气卡永远进不来（只剩一张空壳卡）。
// 引导页整体被卸载后这个状态自然失效，不需要在这里回退。
const showLocationStep = computed(
  () => CredentialsReady.value && nextStepRequested.value
)

const goToLocationStep = () => {
  nextStepRequested.value = true
}

const statusGlyph = computed(
  () => ({ wait: '…', loading: '↻', ok: '✓', warn: '!', error: '×' }[status.value.tone] || '…')
)

const canClose = computed(() => CredentialsReady.value && !NeedsLocation.value)

/**
 * 两个按钮槽位各只放最该点的那一个，避免一排按钮让人不知道点哪个
 * 主按钮：下一步（凭据可用但还没选位置）> 返回天气（已可用）> 网络异常仍然继续
 * 次按钮：检测中 / 重新检测（填写过才出现）
 *
 * 这里用 CredentialsReady 而不是 CheckStatus === 'ok'：网络异常时用户点了
 * 「仍然继续」，凭据也已经是「可用」状态（NetworkOverride），只是还没选位置；
 * 只看 CheckStatus 的话按钮会一直停在「网络异常，仍然继续」上，怎么点都没反应。
 */
const primaryAction = computed(() => {
  if (CredentialsReady.value && NeedsLocation.value) {
    return { label: '下一步 · 选择所在位置', run: goToLocationStep }
  }
  if (canClose.value) return { label: '返回天气', run: closeOnboarding }
  if (canContinueWithoutCheck.value) return { label: '网络异常，仍然继续', run: continueWithoutCheck }
  return null
})

const secondaryAction = computed(() => {
  if (CheckStatus.value === 'checking') return { label: '检测中…', run: () => {}, disabled: true }
  if (!entries.value.length) return null
  return { label: '重新检测', run: runApiCheck }
})

/**
 * 检测通过后自动前进：倒计时结束后直接触发「当前」主按钮（未选位置是下一步，已选过位置是返回天气）。
 * 这里刻意不区分是不是首次使用 —— 按钮本来就会随状态变，倒计时只负责点它。
 *
 * 这里不看引导页是怎么打开的（首次使用、密钥失效、还是用户点钥匙图标回来看设置都一样）：
 * 只要检测通过、还停在第 1 步，就倒数几秒自动点当前主按钮。
 * 用户真要留在这一页时，界面内任何一次点击 / 按键都会立刻停掉倒计时，
 * 按钮下面也留了「留在此页」的出口 —— 自动跳转必须让人看得见、能取消。
 */
const AUTO_ADVANCE_SECONDS = 9
// 倒计时的计时心跳。这里不用页面里的 setInterval：壁纸引擎进全屏 / 切走窗口时页面会被隐藏，
// 页面定时器会被节流（项目里的预警轮播、指数轮播都因为这个改用了 Worker），
// 倒计时会停在那儿不动。用 Worker 计时，再按时间戳算剩余秒数，睡多久都能补回来。
const AUTO_TICK_MS = 500
const autoSecondsLeft = ref(0)
let autoTicker = null
let autoTickerUrl = ''
let autoDeadline = 0

const stopAutoAdvance = () => {
  autoTicker?.terminate()
  autoTicker = null
  if (autoTickerUrl) {
    URL.revokeObjectURL(autoTickerUrl)
    autoTickerUrl = ''
  }
  autoSecondsLeft.value = 0
}

// 「检测通过 + 还停在第 1 步」就自动走
const canAutoAdvance = computed(
  () => CheckStatus.value === 'ok' && !showLocationStep.value
)

// 倒计时直接写在主按钮上：用户盯的是按钮，秒数出现在别处等于没提示
const primaryLabel = computed(() => {
  const label = primaryAction.value?.label || ''
  if (autoSecondsLeft.value <= 0) return label
  return `${label}（${autoSecondsLeft.value} 秒后自动）`
})

const tickAutoAdvance = () => {
  if (!autoTicker) return
  autoSecondsLeft.value = Math.max(0, Math.ceil((autoDeadline - Date.now()) / 1000))
  if (autoSecondsLeft.value > 0) return
  stopAutoAdvance()
  // 到点了再取一次当前主按钮：这几秒里状态可能已经变了
  if (!canAutoAdvance.value) return
  const action = primaryAction.value
  if (action && !action.disabled) action.run()
}

const startAutoAdvance = () => {
  if (autoTicker) return
  if (!canAutoAdvance.value || !primaryAction.value || primaryAction.value.disabled) return
  autoDeadline = Date.now() + AUTO_ADVANCE_SECONDS * 1000
  autoSecondsLeft.value = AUTO_ADVANCE_SECONDS
  const blob = new Blob([`setInterval(function(){postMessage(1)},${AUTO_TICK_MS})`], {
    type: 'application/javascript',
  })
  autoTickerUrl = URL.createObjectURL(blob)
  autoTicker = new Worker(autoTickerUrl)
  autoTicker.onmessage = tickAutoAdvance
}

// 条件成立就起表、不成立就收表，两种情况共用同一个 watch，避免多处漏清理
watch(canAutoAdvance, (ok) => (ok ? startAutoAdvance() : stopAutoAdvance()), { immediate: true })

// 壁纸引擎进入全屏游戏等场景会把页面挂起，页面里的定时器会被节流：
// 回到可见时补算一次，避免倒计时停在那儿不动
const handleAutoVisibility = () => {
  if (document.visibilityState === 'visible') tickAutoAdvance()
}
onMounted(() => document.addEventListener('visibilitychange', handleAutoVisibility))
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleAutoVisibility)
  stopAutoAdvance()
})

// 底部步骤条：凭据可用（检测通过，或网络异常时用户选择继续）后第 1 步点亮，
// 和主按钮用同一个判据，避免「按钮已经能进下一步、步骤条还说没检测完」
const stepDone = computed(() => CredentialsReady.value)
const stepHint = computed(() =>
  stepDone.value ? '第 1 步已完成 · 下一步：选择所在位置' : '第 1 步 · 填写并检测域名与密钥'
)

const maskKey = (key) => {
  const text = String(key || '')
  if (text.length <= 8) return '•'.repeat(Math.max(text.length, 4))
  return `${text.slice(0, 4)}••••${text.slice(-4)}`
}
const maskedEntries = computed(() =>
  entries.value.map((item) => ({ host: item.host, key: maskKey(item.key) }))
)

// 浏览器调试输入框：与凭据模块双向同步（带一点去抖，避免逐字符触发检测）
const devHost = ref(UserApiHostRaw.value)
const devKey = ref(UserApiKeyRaw.value)
let devTimer = null

watch([devHost, devKey], ([host, key]) => {
  clearTimeout(devTimer)
  devTimer = setTimeout(() => setUserApiFromBrowser(host, key), 300)
})
watch([UserApiHostRaw, UserApiKeyRaw], ([host, key]) => {
  if (host !== devHost.value) devHost.value = host
  if (key !== devKey.value) devKey.value = key
})

// 凭据被改动 → 退回第 1 步，重新看过检测结果再决定要不要继续
watch(UserApiFingerprint, () => {
  stopAutoAdvance()
  nextStepRequested.value = false
})

const handleLocationSelected = () => {
  // 位置选完 OnboardingOpen 会自动变 false（见 onboardingState），这里不需要额外处理
}
</script>

<style lang="scss" scoped>
.OnboardingPanel {
  display: grid;
  grid-template-columns: minmax(15.625rem, 0.88fr) 1.6fr;
  overflow: hidden;
}

/* 第 1 步 ↔ 第 2 步也是淡入淡出：让两端叠在同一格，
   否则切换瞬间两块内容会上下排开、把第二块顶到可视区外 */
.onb-stage {
  display: grid;
  /* 同上：行高跟着外壳，不让内容把面板顶高 */
  grid-template-rows: minmax(0, 1fr);
}

.onb-stage > * {
  grid-area: 1 / 1;
  min-width: 0;
  min-height: 0;
}

/* ================= 左侧：说明 + 状态 ================= */
.onb-left {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 2.125rem;
  background: linear-gradient(155deg, rgba(14, 165, 233, 0.34), rgba(56, 189, 248, 0.1) 55%, transparent);
  overflow: hidden;
}

/* 叠加在渐变上的两层柔光：左上提亮主体，右下补一点余晖，避免大面积单色发闷 */
.onb-aura {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(120% 90% at 18% -10%, rgba(56, 189, 248, 0.3), transparent 60%),
    radial-gradient(95% 70% at 108% 106%, rgba(56, 189, 248, 0.16), transparent 62%);
}

.onb-head {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* 说明 + 结果卡 + 按钮作为一组在竖直方向居中，底部步骤条单独贴底 */
.onb-body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  margin: auto 0;
}

.onb-kicker {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.4375rem;
  padding: 0.3125rem 0.75rem 0.3125rem 0.625rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  background: rgba(4, 18, 31, 0.26);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
}

.onb-kicker-dot {
  display: block;
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  background: var(--color-primary);
  box-shadow: 0 0 0 0.1875rem rgba(56, 189, 248, 0.16);
}

.onb-title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.28;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

/* 关键词用主色渐变，和天气卡的天空蓝呼应；不支持 background-clip 时退回纯色 */
.onb-title-hl {
  color: #7dd3fc;
}

@supports ((-webkit-background-clip: text) or (background-clip: text)) {
  .onb-title-hl {
    background: linear-gradient(115deg, #bae6fd, #7dd3fc 48%, #38bdf8);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
  }
}

.onb-lead {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.78;
  color: var(--text-secondary);

  b {
    color: var(--text-primary);
    font-weight: 600;
  }
}

/* ---- 检测结果卡：所有 tone 共用的骨架，颜色由下面 .tone-* 变量给出 ---- */
.onb-status {
  --tone-glyph: var(--text-secondary);
  --tone-wash: rgba(255, 255, 255, 0.075);
  --tone-line: var(--glass-border);
  --tone-tint: rgba(255, 255, 255, 0.03);
  --tone-halo: rgba(255, 255, 255, 0.05);

  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding: 1.0625rem 1.125rem;
  border: 1px solid var(--tone-line);
  border-radius: var(--radius-md);
  background:
    linear-gradient(158deg, var(--tone-tint), transparent 62%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.018));
  box-shadow:
    0 1.125rem 2.5rem -1.875rem rgba(0, 0, 0, 0.85),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

/* 从左上角透出的状态色，让卡片有颜色倾向但不喧宾夺主 */
.onb-status::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(72% 62% at 10% 0%, var(--tone-halo), transparent 72%);
  pointer-events: none;
}

.onb-status-main {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.tone-ok {
  --tone-glyph: #a7ecc9;
  --tone-wash: rgba(111, 220, 174, 0.15);
  --tone-line: rgba(111, 220, 174, 0.34);
  --tone-tint: rgba(111, 220, 174, 0.1);
  --tone-halo: rgba(111, 220, 174, 0.24);
}

.tone-error {
  --tone-glyph: #ffb3ae;
  --tone-wash: rgba(239, 97, 89, 0.16);
  --tone-line: rgba(239, 97, 89, 0.36);
  --tone-tint: rgba(239, 97, 89, 0.12);
  --tone-halo: rgba(239, 97, 89, 0.28);
}

.tone-warn {
  --tone-glyph: #ffcf9e;
  --tone-wash: rgba(235, 155, 98, 0.16);
  --tone-line: rgba(235, 155, 98, 0.34);
  --tone-tint: rgba(235, 155, 98, 0.11);
  --tone-halo: rgba(235, 155, 98, 0.24);
}

.tone-loading {
  --tone-glyph: #a5dcff;
  --tone-wash: rgba(56, 189, 248, 0.16);
  --tone-line: rgba(56, 189, 248, 0.36);
  --tone-tint: rgba(56, 189, 248, 0.12);
  --tone-halo: rgba(56, 189, 248, 0.26);
}

/* 圆角方块而不是实心彩球：色更浅、更克制，和面板里的其他玻璃块同一家族 */
.onb-status-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1;
  color: var(--tone-glyph);
  background: var(--tone-wash);
  border: 1px solid var(--tone-line);
  border-radius: 0.875rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0.75rem 1.5rem -0.9375rem var(--tone-halo);
}

.onb-status-glyph {
  display: block;
  line-height: 1;

  &.spinning {
    animation: onb-spin 1.1s linear infinite;
  }
}

@keyframes onb-spin {
  to {
    transform: rotate(360deg);
  }
}

.onb-status-text {
  position: relative;
  min-width: 0;
}

.onb-status-title {
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: 0.005em;
  color: var(--tone-glyph);
}

.onb-status-desc {
  margin-top: 0.1875rem;
  font-size: 0.8rem;
  line-height: 1.55;
  color: var(--text-secondary);
  /* 错误提示可能带换行（如「主体 + 建议」多行），保留换行符 */
  white-space: pre-line;
}

/* 多域名时逐组列出：小圆点区分可用 / 不可用，域名过长省略 */
.onb-status-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin: 0;
  padding: 0.75rem 0 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  list-style: none;

  li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.72rem;
    color: var(--text-muted);
  }
}

.onb-status-dot {
  flex: none;
  display: block;
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  background: var(--color-ok);
  box-shadow: 0 0 0 0.1875rem rgba(149, 213, 174, 0.14);
}

.onb-status-list li.bad .onb-status-dot {
  background: var(--color-warn);
  box-shadow: 0 0 0 0.1875rem rgba(235, 155, 98, 0.14);
}

.onb-status-host {
  min-width: 0;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.onb-status-msg {
  flex: none;
  margin-left: auto;
}

.onb-status-list li.bad .onb-status-msg {
  color: #ffcb9e;
}

.onb-actions {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.onb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.4375rem;
  padding: 0.625rem 1rem;
  font-size: 0.85rem;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
  color: var(--text-secondary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;

  &:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--glass-border);
    border-color: var(--glass-border-strong);
  }

  &:disabled {
    opacity: 0.42;
    cursor: default;
  }

  &.primary {
    color: #04121f;
    background: linear-gradient(135deg, #7dd3fc, #38bdf8);
    border-color: transparent;
    box-shadow: 0 1rem 2rem -1.125rem rgba(56, 189, 248, 0.85);

    &:hover:not(:disabled) {
      color: #04121f;
      background: linear-gradient(135deg, #7dd3fc, #38bdf8);
      border-color: transparent;
      filter: brightness(1.07);
    }
  }
}

/* 自动前进的出口：秒数已经写在主按钮上，这里只留一句「别自动走」的退路 */
.onb-auto {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.25rem 0.4375rem;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--text-muted);
}

.onb-auto-cancel {
  padding: 0;
  font: inherit;
  color: #8ed3f7;
  background: none;
  border: none;
  text-decoration: underline;
  text-underline-offset: 0.1875rem;
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover {
    color: #bae6fd;
  }
}

/* 帮助入口收成一条文字链：它是「了解更多」，不该和主操作抢按钮位 */
.onb-help {
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  background: none;
  border: none;
  border-radius: 999px;
  transition: color 0.2s ease;

  &:hover {
    color: var(--text-secondary);
    text-decoration: underline;
    text-underline-offset: 0.1875rem;
  }
}

.onb-help-icon {
  flex: none;
  width: 0.875rem;
  height: 0.875rem;
}

/* 底部步骤指示：告诉用户「现在在第 1 步」，同时把左下角的空间收住 */
.onb-progress {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.5625rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.72rem;
  color: var(--text-muted);
}

.onb-progress-dots {
  flex: none;
  display: inline-flex;
  gap: 0.25rem;

  i {
    display: block;
    width: 1rem;
    height: 0.1875rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);

    &.on {
      background: linear-gradient(90deg, #7dd3fc, #38bdf8);
    }

    &.on.done {
      background: linear-gradient(90deg, #6fdcae, #8ee9c2);
    }
  }
}

/* ================= 右侧：操作指引 + 读取结果 + 调试输入 ================= */
.onb-right {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.9375rem;
  padding: 2.125rem;
  /* 和左栏同族、但更浅一档的玻璃：右上角透一缕主色，底部收暗，
     让右栏有明暗方向，不至于整块平铺发灰 */
  background:
    radial-gradient(118% 80% at 100% 0%, rgba(56, 189, 248, 0.15), transparent 62%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.016));
  overflow-y: auto;
}

/* 主体分组：说明 + 步骤 + 数据卡作为一整块参与居中，页脚之外的空白由它吸收 */
.onb-right-body {
  display: flex;
  flex-direction: column;
  gap: 0.9375rem;
  /* 和左栏同一套排布：主体在「顶部留白 ↔ 底部开源信息」之间竖直居中，
     这样凭据多少都不影响观感，也不会在页脚上方留出一大块空档 */
  margin: auto 0;
}

/* 分组标题：和左栏的 kicker 呼应，但更克制，不跟左侧抢重量 */
.onb-right-head {
  display: flex;
  flex-direction: column;
  gap: 0.3125rem;
}

.onb-right-kicker {
  display: inline-flex;
  align-items: center;
  gap: 0.4375rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: #8ed3f7;
}

.onb-right-kicker::before {
  content: '';
  display: block;
  width: 0.875rem;
  height: 0.0625rem;
  background: linear-gradient(90deg, rgba(125, 211, 252, 0.2), #7dd3fc);
}

.onb-right-sub {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--text-muted);
}

/* ---- 步骤：一条竖直时间线，3 步读起来是一串流程而不是 3 个孤立的点 ---- */
.onb-steps {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.onb-steps li {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 0.8125rem;
}

/* 连接上一枚徽标的下沿与下一枚的上沿；末步不画，线自然收束 */
.onb-steps li:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 0.875rem;
  top: 2rem;
  bottom: -1rem;
  width: 0.0625rem;
  transform: translateX(-50%);
  background: linear-gradient(180deg, rgba(125, 211, 252, 0.55), rgba(125, 211, 252, 0.14));
}

.onb-step-no {
  position: relative;
  z-index: 1;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: #eaf7ff;
  background: linear-gradient(160deg, rgba(56, 189, 248, 0.56), rgba(14, 165, 233, 0.28));
  border: 1px solid rgba(125, 211, 252, 0.56);
  border-radius: 50%;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    0 0.5rem 1rem -0.5rem rgba(56, 189, 248, 0.9);
}

.onb-step-title {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text-primary);
}

.onb-step-text {
  margin: 0.25rem 0 0;
  font-size: 0.84rem;
  line-height: 1.6;
  color: rgba(235, 242, 251, 0.62);

  code {
    padding: 0 0.25rem;
    font-size: 0.95em;
    color: var(--text-secondary);
    background: rgba(255, 255, 255, 0.08);
    border-radius: 0.25rem;
  }
}

/* ---- 卡片通用的「小标题 + 右侧标签」头，让两块数据卡同一副长相 ---- */
.onb-card-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5625rem;
}

.onb-card-title {
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
}

.onb-card-pill {
  flex: none;
  margin-left: auto;
  padding: 0.125rem 0.4375rem;
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
}

.onb-card-pill.dev {
  color: #a5dcff;
  background: rgba(56, 189, 248, 0.14);
  border-color: rgba(56, 189, 248, 0.4);
}

.onb-readout {
  padding: 0.75rem 0.875rem;
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
}

/* 底部：开源地址 + 免责声明（始终贴在右栏底部，和主体的居中留白互补） */
.onb-foot {
  display: flex;
  flex-direction: column;
  gap: 0.4375rem;
  padding-top: 0.875rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.onb-repo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.onb-repo-label {
  flex: none;
  min-width: 3.25rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.onb-disclaimer {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.6;
  color: var(--text-muted);
}

.onb-console-url {
  flex: 1;
  min-width: 0;
  padding: 0.3125rem 0.625rem;
  font-family: inherit;
  font-size: 0.78rem;
  text-align: left;
  color: var(--text-secondary);
  background: rgba(4, 18, 31, 0.38);
  border: 1px solid rgba(56, 189, 248, 0.32);
  border-radius: 0.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.2s ease, border-color 0.2s ease;

  &:hover {
    color: var(--text-primary);
    border-color: rgba(56, 189, 248, 0.75);
  }
}

.onb-console-state {
  flex: none;
  min-width: 3.25rem;
  font-size: 0.72rem;
  text-align: right;
  color: #95d5ae;
}

.onb-readout-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.8rem;
}

/* 多组凭据时拉开行距，避免两行域名糊成一段 */
.onb-readout-row + .onb-readout-row {
  margin-top: 0.375rem;
}

.onb-readout-host {
  min-width: 0;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.onb-readout-key {
  flex: none;
  color: var(--text-muted);
}

/* 调试输入：实线玻璃卡，和「已读取到」同一族；
   用主色描边 + 浅色底把它和真实数据卡区分开，而不是靠虚线暗示「临时」 */
.onb-dev {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0.875rem;
  background: linear-gradient(160deg, rgba(56, 189, 248, 0.11), rgba(56, 189, 248, 0.02));
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: var(--radius-sm);
}

.onb-dev-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.onb-dev-label {
  flex: none;
  width: 2.25rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.onb-dev-input {
  flex: 1;
  min-width: 0;
  padding: 0.375rem 0.625rem;
  font-family: inherit;
  font-size: 0.8rem;
  color: var(--text-primary);
  background: rgba(4, 18, 31, 0.5);
  border: 1px solid var(--glass-border);
  border-radius: 0.5rem;
  outline: none;

  &::placeholder {
    color: var(--text-muted);
  }

  &:focus {
    border-color: rgba(56, 189, 248, 0.7);
  }
}

.onb-dev-hint {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--text-muted);
}

/* 壁纸引擎里没有调试输入框，这里给一句提示；
   做成一张轻量的卡，免得右栏在中段只剩一行孤零零的小字 */
.onb-hint {
  margin: 0;
  padding: 0.625rem 0.875rem 0.625rem 0.75rem;
  font-size: 0.78rem;
  line-height: 1.6;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid var(--glass-border);
  border-left: 0.125rem solid rgba(125, 211, 252, 0.5);
  border-radius: var(--radius-sm);
}

@media (max-width: 880px) {
  .OnboardingPanel {
    grid-template-columns: 1fr;
    overflow: auto;
  }
}
</style>
