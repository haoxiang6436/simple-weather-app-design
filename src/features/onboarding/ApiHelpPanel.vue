<template>
  <Teleport to="body">
    <Transition name="help-dialog">
      <div v-if="open" class="HelpDialog" @click="emit('close')">
        <section class="HelpCard" role="dialog" aria-modal="true" aria-labelledby="api-help-title" @click.stop>
          <header class="help-head">
            <div class="help-head-text">
              <h2 id="api-help-title" class="help-title">如何获取域名与密钥</h2>
              <p class="help-sub">数据来自和风天气，注册免费账号即可获取，不需要付费</p>
            </div>
            <button class="help-close" type="button" aria-label="关闭" @click="emit('close')">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div class="help-body">
            <section class="help-steps">
              <ol class="step-list">
                <li>
                  <span class="step-no">1</span>
                  <div class="step-body">
                    <div class="step-title">打开控制台并登录</div>
                    <p class="step-text">
                      复制下面的网址，在浏览器里打开；用邮箱 / 手机号注册并登录（免费，不需要付费）
                    </p>
                    <div class="url-block">
                      <span class="url-badge">✓ 和风天气开发者官方地址</span>
                      <div class="url-row">
                        <span class="url-text">{{ consoleUrl }}</span>
                        <button class="url-copy" type="button" @click="copyUrl()">
                          {{ copyState || '复制网址' }}
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
                <li>
                  <span class="step-no">2</span>
                  <div class="step-body">
                    <div class="step-title">复制域名</div>
                    <p class="step-text">
                      控制台左侧「设置」→「API Host」，复制形如
                      <code>abcd1234.re.qweatherapi.com</code> 的地址
                      （不要带 <code>https://</code> 和后面的路径）
                    </p>
                  </div>
                </li>
                <li>
                  <span class="step-no">3</span>
                  <div class="step-body">
                    <div class="step-title">创建密钥（KEY）</div>
                    <p class="step-text">
                      「项目管理」→ 创建项目 → 在项目里「创建凭据」：凭据名称随意（如「壁纸」），
                      <b>身份认证方式选「API KEY」</b>，<b>启用的 API 选「启用全部 API」</b>，
                      点「保存」后复制生成的 KEY
                    </p>
                  </div>
                </li>
                <li>
                  <span class="step-no">4</span>
                  <div class="step-body">
                    <div class="step-title">填进壁纸属性面板</div>
                    <p class="step-text">
                      右键这张壁纸 →「设置」，属性面板在窗口右侧：最上方的「域名」和「密钥」分别粘贴。
                      多个用英文逗号分隔、按顺序一一配对，填好后壁纸会自动检测
                    </p>
                  </div>
                </li>
              </ol>
            </section>

            <section class="help-side">
              <div class="quota-card">
                <div class="quota-title">每月 <b>50000</b> 次请求免费</div>
                <p class="quota-sub">
                  按每天运行 8 小时、每月 31 天估算：约 <b>1950</b> 次/月，约占免费额度的 <b>4%</b>
                </p>
                <p class="quota-services">
                  适用于：天气预报 · 分钟预报 · 预警 · 天气指数 · 空气质量 · 时光机 · GeoAPI · 天文 · 控制台 API
                </p>
              </div>

              <table class="price-table">
                <thead>
                  <tr>
                    <th>请求量（每月）</th>
                    <th>价格（每次请求）</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in PRICE_ROWS" :key="row.range">
                    <td>{{ row.range }}</td>
                    <td>{{ row.price }}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </div>

          <footer class="help-foot">
            <span class="help-foot-hint">填好后回到引导页，检测通过即可进入下一步</span>
            <button class="help-done" type="button" @click="emit('close')">知道了</button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { QWEATHER_CONSOLE_URL, useCopyFeedback } from '@/shared/clipboard'

// open 由父组件控制：组件本身常驻，靠内部 v-if 触发 Transition，
// 否则父级 v-if 会在关闭瞬间把整个组件连弹层一起销毁，leave 动效根本没机会播。
// eslint-disable-next-line no-undef
const props = defineProps({
  open: { type: Boolean, default: false },
})
// eslint-disable-next-line no-undef
const emit = defineEmits(['close'])

const consoleUrl = QWEATHER_CONSOLE_URL
const { state: copyState, copy: copyUrl } = useCopyFeedback(consoleUrl)

// Esc 也能关掉弹层，和点遮罩、点 ✕ 三条路都对得上
const handleKeydown = (event) => {
  if (props.open && event.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))

const PRICE_ROWS = [
  { range: '0 – 50000', price: 'CNY 0' },
  { range: '之后的 950000', price: 'CNY 0.0007' },
  { range: '之后的 4000000', price: 'CNY 0.0005' },
  { range: '之后的 5000000', price: 'CNY 0.00035' },
  { range: '之后的 40000000', price: 'CNY 0.00015' },
  { range: '之后的 50000000', price: 'CNY 0.0001' },
  { range: '超过 100000000', price: '联系我们' },
]

</script>

<style lang="scss" scoped>
/* ================= 弹层外壳（沿用天气预警弹层的语言：压暗 + 模糊 + 居中卡片） ================= */
.HelpDialog {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3.5rem 2rem;
  background: rgba(0, 0, 0, 0.45);
  -webkit-backdrop-filter: blur(1.125rem);
  backdrop-filter: blur(1.125rem);
}

.help-dialog-enter-active,
.help-dialog-leave-active {
  transition: opacity 0.18s var(--ease-enter);
}

.help-dialog-leave-active {
  transition: opacity 0.14s var(--ease-leave);
}

.help-dialog-enter-from,
.help-dialog-leave-to {
  opacity: 0;
}

.help-dialog-enter-active .HelpCard,
.help-dialog-leave-active .HelpCard {
  transition: transform 0.26s var(--ease-enter), opacity 0.2s ease;
}

.help-dialog-leave-active .HelpCard {
  transition: transform 0.18s var(--ease-leave), opacity 0.14s ease;
}

.help-dialog-enter-from .HelpCard {
  transform: translateY(1rem) scale(0.98);
  opacity: 0;
}

.help-dialog-leave-to .HelpCard {
  transform: translateY(0.5rem) scale(0.99);
  opacity: 0;
}

/* 只给最大高度：内容少时自动变矮，内容多时封顶，滚动交给中间的 .help-body */
.HelpCard {
  display: flex;
  flex-direction: column;
  width: min(76vw, 56.25rem);
  max-height: min(84vh, 45rem);
  overflow: hidden;
  background: rgba(18, 30, 52, 0.9);
  border: 1px solid var(--glass-border);
  border-radius: 1.375rem;
  box-shadow: 0 1.75rem 4.375rem -1.75rem rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.help-head {
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.375rem 1.5rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.help-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-primary);
}

.help-sub {
  margin: 0.3125rem 0 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.help-close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.125rem;
  height: 2.125rem;
  color: var(--text-secondary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 50%;
  transition: color 0.2s ease, background 0.2s ease;

  &:hover {
    color: var(--text-primary);
    background: var(--glass-border);
  }
}

.help-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  gap: 1.5rem;
  padding: 1.375rem 1.5rem;
  overflow-y: auto;
}

.help-foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.875rem 1.5rem 1.125rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.help-foot-hint {
  font-size: 0.76rem;
  color: var(--text-muted);
}

.help-done {
  flex: none;
  padding: 0.5rem 1.375rem;
  font-size: 0.86rem;
  font-weight: 600;
  color: #04121f;
  background: linear-gradient(135deg, #7dd3fc, #38bdf8);
  border: none;
  border-radius: 999px;

  &:hover {
    filter: brightness(1.07);
  }
}

.step-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.step-no {
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

.step-title {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
}

.step-text {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  line-height: 1.65;
  color: var(--text-muted);

  b {
    color: var(--text-secondary);
  }

  code {
    padding: 0 0.25rem;
    font-size: 0.95em;
    color: var(--text-secondary);
    background: rgba(255, 255, 255, 0.08);
    border-radius: 0.25rem;
  }
}

.url-block {
  display: flex;
  flex-direction: column;
  gap: 0.3125rem;
  margin-top: 0.5rem;
}

/* 明确标识这是和风天气开发者官方地址 */
.url-badge {
  align-self: flex-start;
  padding: 0.125rem 0.5rem;
  font-size: 0.68rem;
  font-weight: 600;
  color: #95d5ae;
  background: rgba(149, 213, 174, 0.12);
  border: 1px solid rgba(149, 213, 174, 0.4);
  border-radius: 999px;
}

.url-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.4375rem 0.5rem 0.4375rem 0.75rem;
  background: rgba(4, 18, 31, 0.45);
  border: 1px dashed rgba(56, 189, 248, 0.45);
  border-radius: 0.625rem;
}

.url-text {
  flex: 1;
  min-width: 0;
  font-size: 0.78rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.url-copy {
  flex: none;
  padding: 0.3125rem 0.6875rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #04121f;
  background: linear-gradient(135deg, #7dd3fc, #38bdf8);
  border: none;
  border-radius: 999px;

  &:hover {
    filter: brightness(1.08);
  }
}

.quota-card {
  padding: 0.875rem 1rem;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.38);
  border-radius: var(--radius-sm);
}

.quota-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);

  b {
    color: #7dd3fc;
    font-size: 1.1em;
  }
}

.quota-services {
  margin: 0.5rem 0 0;
  font-size: 0.7rem;
  line-height: 1.6;
  color: var(--text-muted);
}

.quota-sub {
  margin: 0.3125rem 0 0;
  font-size: 0.78rem;
  line-height: 1.6;
  color: var(--text-secondary);

  b {
    color: #7dd3fc;
  }
}

.price-table {
  width: 100%;
  margin-top: 0.875rem;
  border-collapse: collapse;
  font-size: 0.72rem;
  color: var(--text-secondary);

  th,
  td {
    padding: 0.3125rem 0.5rem;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }

  th {
    font-weight: 600;
    color: var(--text-muted);
    background: rgba(255, 255, 255, 0.05);
  }

  td:last-child,
  th:last-child {
    text-align: right;
  }

  tbody tr:first-child td {
    color: #95d5ae;
    font-weight: 600;
  }
}

@media (max-width: 880px) {
  .HelpCard {
    width: min(92vw, 56.25rem);
  }

  .help-body {
    grid-template-columns: 1fr;
  }
}
</style>
