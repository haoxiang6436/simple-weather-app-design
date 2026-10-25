<template>
  <!-- 设置 / 状态页（天气卡右上角齿轮的落点）
       和引导页刻意分开：引导页回答「第一次怎么配」，这一页回答「现在什么状态、去哪儿改」。
       域名与密钥的写入口只在壁纸属性面板（引擎侧）和右上角调试悬浮块（浏览器侧），
       所以这一页不设任何输入框，只做状态展示、重新检测与修改指引。 -->
  <div class="panel-view SettingsPanel">
    <section class="set-left">
      <div class="set-aura" aria-hidden="true"></div>

      <header class="set-head">
        <span class="set-kicker"><i class="set-kicker-dot"></i>设置</span>
        <h1 class="set-title">连接与凭据</h1>
        <p class="set-lead">
          天气数据走你自己的和风天气 <b>域名 + 密钥</b>。这里看当前状态；
          要修改请到右侧「壁纸属性」面板，改完回到这一页会自动重新检测。
        </p>
      </header>

      <!-- 和引导页共用同一张状态卡；逐组明细交给下面的「当前凭据」，不重复列 -->
      <CredentialStatusCard :list="false" />

      <div class="set-actions">
        <button class="set-btn" type="button" :disabled="retryDisabled" @click="runApiCheck()">
          {{ CheckStatus === 'checking' ? '检测中…' : '重新检测' }}
        </button>
        <span class="set-actions-hint">每组只发 1 次地址查询，几乎不占额度</span>
      </div>

      <div class="set-cred">
        <div class="set-card-head">
          <span class="set-card-title">当前凭据</span>
          <span class="set-card-pill">{{ entries.length }} 组</span>
        </div>

        <p v-if="!credentialRows.length" class="set-cred-empty">还没有读取到域名与密钥。</p>
        <div v-for="item in credentialRows" :key="item.host" class="set-cred-item">
          <div class="set-cred-row">
            <span class="set-cred-host" :title="item.host">{{ item.host }}</span>
            <span class="set-cred-key">{{ item.key }}</span>
            <span class="set-cred-state" :class="'is-' + item.tone">{{ item.state }}</span>
          </div>
          <p v-if="item.detail" class="set-cred-detail">{{ item.detail }}</p>
        </div>

        <div class="set-cred-row set-cred-amap">
          <span class="set-cred-host">高德密钥（路名）</span>
          <span class="set-cred-key">{{ amapFilled ? '已填写' : '未填写' }}</span>
          <span class="set-cred-state is-muted">{{ amapFilled ? '选点显示路名' : '不影响使用' }}</span>
        </div>
      </div>

      <p class="set-hint">改完属性面板里的输入框后，点一下输入框外的空白处让它生效。</p>
    </section>

    <section class="set-right">
      <header class="set-right-head">
        <div class="set-right-head-text">
          <span class="set-right-kicker">怎么修改</span>
          <p class="set-right-sub">这一页只显示状态，不回写任何凭据</p>
        </div>
        <button class="set-close" type="button" @click="closeSettings()">返回天气</button>
      </header>

      <ol class="set-steps">
        <li v-for="(step, index) in changeSteps" :key="step.title">
          <span class="set-step-no">{{ index + 1 }}</span>
          <div class="set-step-body">
            <div class="set-step-title">{{ step.title }}</div>
            <p class="set-step-text">{{ step.text }}</p>
          </div>
        </li>
      </ol>

      <button class="set-help" type="button" @click="showHelp = true">
        <svg class="set-help-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"
            d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
        打开图文教程：怎么申请域名与密钥
      </button>

      <div class="set-appearance">
        <div class="set-card-head">
          <span class="set-card-title">外观与背景</span>
          <span class="set-card-pill">只读</span>
        </div>
        <ul class="set-appearance-list">
          <li><span>面板缩放</span><b>{{ panelScaleText }}</b></li>
          <li><span>动态背景</span><b>{{ backgroundText }}</b></li>
        </ul>
        <p class="set-hint">{{ appearanceHint }}</p>
      </div>

      <div class="set-foot">
        <div class="set-repo">
          <span class="set-repo-label">开源仓库</span>
          <button class="set-repo-url" type="button" :title="'点击复制：' + repoUrl"
            @click="copyRepoUrl()">{{ repoShort }}</button>
          <span class="set-repo-state">{{ repoCopyState }}</span>
        </div>
        <p class="set-disclaimer">
          本壁纸为开源项目（无盈利）；你填写的域名与密钥只保存在本机、不会上传；天气数据来自和风天气，仅供参考。
        </p>
        <button class="set-review" type="button" @click="reviewOnboarding">重新查看新手引导 →</button>
      </div>
    </section>

    <ApiHelpPanel :open="showHelp" @close="showHelp = false" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import CredentialStatusCard from './CredentialStatusCard.vue'
import ApiHelpPanel from './ApiHelpPanel.vue'
import { AmapKey, UserApiEntries } from '@/api/credentials'
import { BackgroundIndex, PanelScale } from '@/features/wallpaper/properties'
import { PROJECT_REPO_URL, shortUrl, useCopyFeedback } from '@/shared/clipboard'
import {
  CheckResults,
  CheckStatus,
  closeSettings,
  maskKey,
  openOnboarding,
  runApiCheck,
} from './onboardingState'

const entries = UserApiEntries
const showHelp = ref(false)

// 「怎么修改」只有一条路径：去壁纸属性面板（浏览器里就是右上角的调试悬浮块）
const changeSteps = [
  { title: '右键这张壁纸 →「设置」', text: '属性面板在窗口右侧，最上方就是域名与密钥' },
  { title: '改「域名」和「密钥」', text: '多个用英文逗号分隔、按顺序一一配对' },
  { title: '回到这一页，自动重新检测', text: '也可以直接点左边的「重新检测」' },
]

// 每组凭据的状态：优先用本次检测的逐组结果，其次看整体检测状态。
// 只有一组时，失败原因已经写在状态卡里，这一行只作「域名 + 打码密钥 + 可用/不可用」；
// 多组时才在行下补各自的原因，避免同一个错误说两遍。
const resultByHost = computed(() => {
  const map = new Map()
  CheckResults.value.forEach((item) => map.set(item.host, item))
  return map
})

const credentialRows = computed(() =>
  entries.value.map(({ host, key }) => {
    const result = resultByHost.value.get(host)
    if (result) {
      return {
        host,
        key: maskKey(key),
        tone: result.ok ? 'ok' : 'bad',
        state: result.ok ? '可用' : '不可用',
        // 只有一组时，失败原因已经写在状态卡里，逐组再重复一遍反而啰嗦
        detail: result.ok || CheckResults.value.length < 2 ? '' : result.message || '检测未通过',
      }
    }
    const tone = { checking: 'wait', ok: 'ok', error: 'bad' }[CheckStatus.value] || 'wait'
    const state = { checking: '检测中…', ok: '已通过', error: '未通过' }[CheckStatus.value] || '等待检测'
    return { host, key: maskKey(key), tone, state, detail: '' }
  })
)

const amapFilled = computed(() => !!String(AmapKey.value || '').trim())

// 重新检测：检测中或没有可检测的凭据时按钮不可点（没有凭据时这一页本来也进不来，兜一层）
const retryDisabled = computed(() => CheckStatus.value === 'checking' || !entries.value.length)

// 外观与背景是壁纸属性，页面只读不写：让用户知道「为什么面板这么小 / 背景怎么换」
const BACKGROUND_LABELS = {
  0: '无',
  4: '实时渲染雨滴',
  5: '整页雨珠叠加',
}
const panelScaleText = computed(() => `${Math.round(Number(PanelScale.value) * 100)}%`)
const backgroundText = computed(() => BACKGROUND_LABELS[String(BackgroundIndex.value)] || '未知')
const appearanceHint = '这些和雨滴强度、隐藏天气面板一样，都在壁纸属性面板里调整。'

// 开源仓库地址：点击写入剪贴板（控制台地址只在帮助页里出现）
const repoUrl = PROJECT_REPO_URL
const repoShort = shortUrl(repoUrl)
const { state: repoCopyState, copy: copyRepoUrl } = useCopyFeedback(repoUrl)

// 主动回顾引导：引导页会切成「回顾」文案，且不自动前进（见 OnboardingPanel）
const reviewOnboarding = () => openOnboarding({ review: true })
</script>

<style lang="scss" scoped>
.SettingsPanel {
  display: grid;
  grid-template-columns: minmax(15.625rem, 1fr) 1.2fr;
  overflow: hidden;
}

/* ================= 左栏：状态 + 凭据 ================= */
.set-left {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1.0625rem;
  padding: 2.125rem;
  background: linear-gradient(155deg, rgba(14, 165, 233, 0.34), rgba(56, 189, 248, 0.1) 55%, transparent);
  /* 凭据组数多时让左栏自己滚，不把外壳撑高 */
  overflow-y: auto;
}

/* 和引导页同一套柔光：左上提亮主体，右下补一点余晖 */
.set-aura {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(120% 90% at 18% -10%, rgba(56, 189, 248, 0.3), transparent 60%),
    radial-gradient(95% 70% at 108% 106%, rgba(56, 189, 248, 0.16), transparent 62%);
}

.set-head {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.set-kicker {
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

.set-kicker-dot {
  display: block;
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  background: var(--color-primary);
  box-shadow: 0 0 0 0.1875rem rgba(56, 189, 248, 0.16);
}

.set-title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.28;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.set-lead {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.78;
  color: var(--text-secondary);

  b {
    color: var(--text-primary);
    font-weight: 600;
  }
}

.set-actions {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
}

.set-btn {
  flex: none;
  padding: 0.5rem 1.125rem;
  font-size: 0.84rem;
  font-weight: 600;
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
}

.set-actions-hint {
  font-size: 0.72rem;
  line-height: 1.5;
  color: var(--text-muted);
}

.set-cred {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5625rem;
  padding: 0.875rem 1rem;
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
}

.set-card-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.set-card-title {
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
}

.set-card-pill {
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

.set-cred-empty {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.set-cred-item + .set-cred-item {
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.set-cred-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: baseline;
  gap: 0.5rem;
}

.set-cred-host {
  min-width: 0;
  font-size: 0.78rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.set-cred-key {
  flex: none;
  font-size: 0.72rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.set-cred-state {
  flex: none;
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;
}

.set-cred-state.is-ok {
  color: var(--color-ok);
}

.set-cred-state.is-bad {
  color: #ffcb9e;
}

.set-cred-state.is-wait,
.set-cred-state.is-muted {
  color: var(--text-muted);
}

.set-cred-detail {
  margin: 0.1875rem 0 0;
  font-size: 0.7rem;
  line-height: 1.5;
  color: #ffcb9e;
}

/* 高德是选填项，用一条分隔线和上面的和风凭据分开 */
.set-cred-amap {
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.set-hint {
  position: relative;
  z-index: 1;
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.6;
  color: var(--text-muted);
}

/* ================= 右栏：修改指引 + 外观 + 关于 ================= */
.set-right {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1.0625rem;
  padding: 2.125rem;
  background:
    radial-gradient(118% 80% at 100% 0%, rgba(56, 189, 248, 0.15), transparent 62%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.016));
  overflow-y: auto;
}

.set-right-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.set-right-head-text {
  display: flex;
  flex-direction: column;
  gap: 0.3125rem;
  min-width: 0;
}

.set-right-kicker {
  display: inline-flex;
  align-items: center;
  gap: 0.4375rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: #8ed3f7;
}

.set-right-kicker::before {
  content: '';
  display: block;
  width: 0.875rem;
  height: 0.0625rem;
  background: linear-gradient(90deg, rgba(125, 211, 252, 0.2), #7dd3fc);
}

.set-right-sub {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--text-muted);
}

/* 返回天气：设置页的出口，放在右栏标题旁，和地址页的「返回」同一位置 */
.set-close {
  flex: none;
  padding: 0.4375rem 0.9375rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease;

  &:hover {
    color: var(--text-primary);
    background: var(--glass-border);
    border-color: var(--glass-border-strong);
  }
}

/* 三步用编号徽标 + 简介，不画引导页那条竖线：这一页是「操作提示」，不是流程 */
.set-steps {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.set-steps li {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.set-step-no {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #eaf7ff;
  background: linear-gradient(160deg, rgba(56, 189, 248, 0.56), rgba(14, 165, 233, 0.28));
  border: 1px solid rgba(125, 211, 252, 0.56);
  border-radius: 50%;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
}

.set-step-body {
  min-width: 0;
}

.set-step-title {
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text-primary);
}

.set-step-text {
  margin: 0.1875rem 0 0;
  font-size: 0.8rem;
  line-height: 1.6;
  color: var(--text-muted);
}

.set-help {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.4375rem;
  padding: 0.5rem 0.875rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #8ed3f7;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.34);
  border-radius: 999px;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;

  &:hover {
    color: #bae6fd;
    background: rgba(56, 189, 248, 0.18);
    border-color: rgba(56, 189, 248, 0.6);
  }
}

.set-help-icon {
  flex: none;
  width: 0.875rem;
  height: 0.875rem;
}

.set-appearance {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0.875rem;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
}

.set-appearance .set-card-head {
  margin-bottom: 0.0625rem;
}

.set-appearance-list {
  display: flex;
  flex-direction: column;
  gap: 0.3125rem;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  b {
    font-weight: 600;
    color: var(--text-secondary);
  }
}

.set-foot {
  display: flex;
  flex-direction: column;
  gap: 0.4375rem;
  margin-top: auto;
  padding-top: 0.875rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.set-repo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.set-repo-label {
  flex: none;
  min-width: 3.25rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.set-repo-url {
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

.set-repo-state {
  flex: none;
  min-width: 3.25rem;
  font-size: 0.72rem;
  text-align: right;
  color: #95d5ae;
}

.set-disclaimer {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.6;
  color: var(--text-muted);
}

.set-review {
  align-self: flex-start;
  padding: 0;
  font-size: 0.75rem;
  color: #8ed3f7;
  background: none;
  border: none;
  text-decoration: underline;
  text-underline-offset: 0.1875rem;
  transition: color 0.2s ease;

  &:hover {
    color: #bae6fd;
  }
}

@media (max-width: 880px) {
  .SettingsPanel {
    grid-template-columns: 1fr;
    overflow: auto;
  }
}
</style>
