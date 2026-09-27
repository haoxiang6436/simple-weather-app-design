<template>
  <!-- 检测通过且还没选位置 → 同一个面板内的第 2 步：选择位置 -->
  <LocationPicker v-if="showLocationStep" @selected="handleLocationSelected" />

  <!-- 帮助页：教用户怎么获取自己的域名与密钥 -->
  <ApiHelpPanel v-else-if="showHelp" @close="showHelp = false" />

  <!-- 第 1 步：说明 + 实时读取用户填写的域名/密钥 + 检测结果 -->
  <div v-else class="weather-panel OnboardingPanel">
    <section class="onb-left">
      <div class="onb-tag">首次使用</div>
      <h1 class="onb-title">还差一步，<br />才能显示天气</h1>
      <p class="onb-lead">
        请在右侧「壁纸属性」面板填入 <b>你自己的域名与密钥</b>，壁纸会自动读取并检测。
      </p>

      <div class="onb-status" :class="'tone-' + status.tone">
        <span class="onb-status-icon" :class="{ spinning: status.tone === 'loading' }">{{ statusGlyph }}</span>
        <div class="onb-status-text">
          <div class="onb-status-title">{{ status.title }}</div>
          <div class="onb-status-desc">{{ status.desc }}</div>
        </div>
      </div>

      <div v-if="CheckResults.length > 1" class="onb-results">
        <div v-for="item in CheckResults" :key="item.host" class="onb-result" :class="{ bad: !item.ok }">
          <span class="onb-result-host">{{ item.host }}</span>
          <span class="onb-result-msg">{{ item.ok ? '可用' : item.message }}</span>
        </div>
      </div>

      <div class="onb-actions">
        <button class="onb-btn primary" type="button" @click="showHelp = true">📖 怎么获取域名与密钥？</button>
        <button v-if="secondaryAction" class="onb-btn" type="button" :disabled="secondaryAction.disabled"
          @click="secondaryAction.run()">{{ secondaryAction.label }}</button>
      </div>

    </section>

    <section class="onb-right">
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
            <div class="onb-step-title">自动检测 → 选择所在位置</div>
            <p class="onb-step-text">检测通过后选好城市，就会显示天气</p>
          </div>
        </li>
      </ol>

      <div v-if="entries.length" class="onb-readout">
        <div class="onb-readout-title">已读取到（{{ entries.length }} 组）</div>
        <div v-for="item in maskedEntries" :key="item.host" class="onb-readout-row">
          <span class="onb-readout-host">{{ item.host }}</span>
          <span class="onb-readout-key">{{ item.key }}</span>
        </div>
      </div>

      <!-- 浏览器（Edge 调试 / 直接打开 dist）能输入；壁纸引擎里没有这一块 -->
      <div v-if="browserRuntime" class="onb-dev">
        <div class="onb-dev-title">浏览器调试（壁纸引擎里没有这块）</div>
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
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import LocationPicker from '@/features/weather/LocationPicker.vue'
import ApiHelpPanel from './ApiHelpPanel.vue'
import { UserApiEntries, UserApiHostRaw, UserApiKeyRaw, setUserApiFromBrowser } from '@/api/credentials'
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

// 检测通过 + 还没选位置 → 显示第 2 步
const showLocationStep = computed(() => CredentialsReady.value && NeedsLocation.value)

const statusGlyph = computed(
  () => ({ wait: '…', loading: '↻', ok: '✓', warn: '!', error: '×' }[status.value.tone] || '…')
)

const canClose = computed(() => CredentialsReady.value && !NeedsLocation.value)

/**
 * 次要按钮只保留一个：同一时刻只出现最该点的那一个，避免一排按钮让人不知道点哪个
 * 优先级：返回天气（已可用）> 网络异常继续 > 重新检测（填写过才出现）
 */
const secondaryAction = computed(() => {
  if (canClose.value) return { label: '返回天气', run: closeOnboarding }
  if (canContinueWithoutCheck.value) return { label: '网络异常，仍然继续', run: continueWithoutCheck }
  if (!entries.value.length) return null
  if (CheckStatus.value === 'checking') return { label: '检测中…', run: () => {}, disabled: true }
  return { label: '重新检测', run: runApiCheck }
})

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

/* ================= 左侧：说明 + 状态 ================= */
.onb-left {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding: 2.125rem;
  background: linear-gradient(155deg, rgba(14, 165, 233, 0.34), rgba(56, 189, 248, 0.1) 55%, transparent);
  overflow: hidden;
}

.onb-left::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 90% at 18% -10%, rgba(56, 189, 248, 0.3), transparent 60%);
  pointer-events: none;
}

.onb-tag {
  position: relative;
  z-index: 1;
  align-self: flex-start;
  padding: 0.25rem 0.6875rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
}

.onb-title {
  position: relative;
  z-index: 1;
  margin: 0.25rem 0 0;
  font-size: 1.75rem;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.onb-lead {
  position: relative;
  z-index: 1;
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.7;
  color: var(--text-secondary);

  b {
    color: var(--text-primary);
  }
}

.onb-status {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.375rem;
  padding: 0.75rem 0.875rem;
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
}

.onb-status-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  font-size: 1rem;
  font-weight: 700;
  border-radius: 50%;
  color: #04121f;
  background: var(--text-muted);

  &.spinning {
    animation: onb-spin 1s linear infinite;
  }
}

.tone-ok .onb-status-icon {
  background: #95d5ae;
}

.tone-warn .onb-status-icon {
  background: #eb9b62;
}

.tone-error .onb-status-icon {
  background: #ef6159;
  color: #fff;
}

.tone-loading .onb-status-icon {
  background: var(--color-primary);
}

@keyframes onb-spin {
  to {
    transform: rotate(360deg);
  }
}

.onb-status-text {
  min-width: 0;
}

.onb-status-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.onb-status-desc {
  margin-top: 0.125rem;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--text-muted);
}

.onb-results {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.3125rem;
}

.onb-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-ok);

  &.bad {
    color: var(--color-warn);
  }
}

.onb-result-host {
  min-width: 0;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.onb-result-msg {
  flex: none;
}

.onb-actions {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.625rem;
  margin-top: 0.5rem;
}

.onb-btn {
  padding: 0.5rem 1.125rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: background 0.2s ease, opacity 0.2s ease;

  &:hover:not(:disabled) {
    background: var(--glass-border);
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }

  &.primary {
    color: #04121f;
    background: linear-gradient(135deg, #7dd3fc, #38bdf8);
    border-color: transparent;

    &:hover:not(:disabled) {
      filter: brightness(1.08);
    }
  }
}

/* ================= 右侧：步骤 + 读取结果 + 调试输入 ================= */
.onb-right {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 2.5rem;
  background: rgba(255, 255, 255, 0.045);
  overflow-y: auto;
}

.onb-steps {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.onb-steps li {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.onb-step-no {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: #04121f;
  background: rgba(125, 211, 252, 0.9);
  border-radius: 50%;
}

.onb-step-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

.onb-step-text {
  margin: 0.1875rem 0 0;
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--text-muted);

  code {
    padding: 0 0.25rem;
    font-size: 0.95em;
    color: var(--text-secondary);
    background: rgba(255, 255, 255, 0.08);
    border-radius: 0.25rem;
  }
}

.onb-readout {
  padding: 0.75rem 0.875rem;
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
}

/* 底部：开源地址 + 免责声明（固定在右栏底部） */
.onb-foot {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: auto;
  padding-top: 0.875rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
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
  background: rgba(4, 18, 31, 0.45);
  border: 1px dashed rgba(56, 189, 248, 0.45);
  border-radius: 0.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.2s ease, border-color 0.2s ease;

  &:hover {
    color: var(--text-primary);
    border-color: rgba(56, 189, 248, 0.8);
  }
}

.onb-console-state {
  flex: none;
  min-width: 3.25rem;
  font-size: 0.72rem;
  text-align: right;
  color: #95d5ae;
}

.onb-readout-title {
  margin-bottom: 0.375rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.onb-readout-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.8rem;
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

.onb-dev {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0.875rem;
  background: rgba(56, 189, 248, 0.08);
  border: 1px dashed rgba(56, 189, 248, 0.4);
  border-radius: var(--radius-sm);
}

.onb-dev-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
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

.onb-dev-hint,
.onb-hint {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--text-muted);
}

@media (max-width: 880px) {
  .OnboardingPanel {
    grid-template-columns: 1fr;
    overflow: auto;
  }
}
</style>
