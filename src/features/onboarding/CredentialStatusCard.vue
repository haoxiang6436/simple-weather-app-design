<template>
  <!-- 凭据检测结果卡：引导页与设置页共用同一份渲染，避免两处各写一套状态提示。
       数据全部来自 onboardingState（检测状态机），组件本身不持有状态。 -->
  <div class="cred-status" :class="'tone-' + status.tone">
    <div class="cred-status-main">
      <span class="cred-status-icon">
        <span class="cred-status-glyph" :class="{ spinning: status.tone === 'loading' }">{{ glyph }}</span>
      </span>
      <div class="cred-status-text">
        <div class="cred-status-title">{{ status.title }}</div>
        <div class="cred-status-desc">{{ status.desc }}</div>
      </div>
    </div>

    <!-- 多个域名时，逐组结果收进同一张卡里，避免两块信息各说各话；
         只检测了一组时汇总行已经说清楚，再列一遍反而重复 -->
    <ul v-if="list && CheckResults.length > 1" class="cred-status-list">
      <li v-for="item in CheckResults" :key="item.host" :class="{ bad: !item.ok }">
        <i class="cred-status-dot"></i>
        <span class="cred-status-host">{{ item.host }}</span>
        <span class="cred-status-msg">{{ item.ok ? '可用' : item.message }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { CheckResults, CredentialStatus } from './onboardingState'

// eslint-disable-next-line no-undef
defineProps({
  // 是否在汇总下面再列一次逐组结果（设置页自己有更详细的凭据列表，传 false）
  list: { type: Boolean, default: true },
})

const status = CredentialStatus
const glyph = computed(
  () => ({ wait: '…', loading: '↻', ok: '✓', warn: '!', error: '×' }[status.value.tone] || '…')
)
</script>

<style lang="scss" scoped>
/* ---- 检测结果卡：所有 tone 共用的骨架，颜色由下面 .tone-* 变量给出 ---- */
.cred-status {
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
.cred-status::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(72% 62% at 10% 0%, var(--tone-halo), transparent 72%);
  pointer-events: none;
}

.cred-status-main {
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
.cred-status-icon {
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

.cred-status-glyph {
  display: block;
  line-height: 1;

  &.spinning {
    animation: cred-spin 1.1s linear infinite;
  }
}

@keyframes cred-spin {
  to {
    transform: rotate(360deg);
  }
}

.cred-status-text {
  position: relative;
  min-width: 0;
}

.cred-status-title {
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: 0.005em;
  color: var(--tone-glyph);
}

.cred-status-desc {
  margin-top: 0.1875rem;
  font-size: 0.8rem;
  line-height: 1.55;
  color: var(--text-secondary);
  /* 错误提示可能带换行（如「主体 + 建议」多行），保留换行符 */
  white-space: pre-line;
}

/* 多域名时逐组列出：小圆点区分可用 / 不可用，域名过长省略 */
.cred-status-list {
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

.cred-status-dot {
  flex: none;
  display: block;
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  background: var(--color-ok);
  box-shadow: 0 0 0 0.1875rem rgba(149, 213, 174, 0.14);
}

.cred-status-list li.bad .cred-status-dot {
  background: var(--color-warn);
  box-shadow: 0 0 0 0.1875rem rgba(235, 155, 98, 0.14);
}

.cred-status-host {
  min-width: 0;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cred-status-msg {
  flex: none;
  margin-left: auto;
}

.cred-status-list li.bad .cred-status-msg {
  color: #ffcb9e;
}
</style>
