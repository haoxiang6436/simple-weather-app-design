<template>
  <article class="warning-slide" :class="[warning.status === 'cancel' ? 'is-cancelled' : 'sev-' + severityKey(warning.level)]"
    :aria-label="warning.typeName + warning.level + '预警'" :inert="!active || undefined"
    :aria-hidden="!active || undefined">
    <div class="warning-card-content" :tabindex="active ? 0 : -1" role="region"
      :aria-label="warning.typeName + '预警正文与防御指南'">
      <header class="warning-detail-header">
        <div class="warning-title-row">
          <span class="warning-icon-surface">
          <i class="warning-event-icon" :class="'qi-' + (warning.icon || warning.type || '100')" aria-hidden="true"></i>
          </span>
          <h2 class="warning-detail-title">{{ warning.typeName }}预警</h2>
          <span v-if="warning.level" class="warning-level">{{ warning.level }}预警</span>
        </div>
        <div class="warning-detail-meta">
          <span class="warning-sender">{{ warning.sender || '气象部门发布' }}</span>
          <div class="warning-times">
            <time v-if="warning.pubTime" :datetime="warning.pubTime" :title="warning.pubTime">
              {{ relativeTime(warning.pubTime) }}{{ warningStatus(warning)?.action || '发布' }}
            </time>
            <time v-if="warning.endTime" :datetime="warning.endTime" :title="warning.endTime">
              {{ warning.status === 'cancel' ? '取消通知：' : '' }}{{ expiryLabel(warning.endTime) }}
            </time>
          </div>
        </div>
      </header>

      <div class="warning-details">
        <section class="warning-section">
          <p class="warning-text">{{ warning.text || '暂无详细说明。' }}</p>
        </section>
        <section v-if="warning.instruction && warning.status !== 'cancel'" class="warning-section warning-guidance">
          <h3 class="warning-section-title">防御指南</h3>
          <ol class="warning-guidance-list">
            <li v-for="(line, lineIndex) in instructionLines(warning.instruction)"
              :key="warning.id + '-guide-' + lineIndex" class="warning-text warning-guidance-line">{{ line }}</li>
          </ol>
        </section>
      </div>
    </div>
  </article>
</template>

<script setup>
import { defineProps } from 'vue'
import { warningStatus } from './warnings'

const props = defineProps({
  warning: { type: Object, required: true },
  currentTime: { type: Number, default: () => Date.now() },
  active: { type: Boolean, default: true },
})

const severityKey = (level) => {
  const value = level || ''
  if (value.includes('红')) return 'red'
  if (value.includes('橙')) return 'orange'
  if (value.includes('黄')) return 'yellow'
  return 'blue'
}

const parseTime = (date) => {
  const value = new Date(date)
  return Number.isNaN(value.getTime()) ? null : value.getTime()
}

const relativeTime = (date, mode = 'auto') => {
  const timestamp = parseTime(date)
  if (timestamp === null) return date || '时间未知'
  const delta = timestamp - props.currentTime
  const future = delta > 0
  if (mode === 'future' && !future) return '已过期'
  const absoluteMinutes = Math.floor(Math.abs(delta) / 60_000)
  if (absoluteMinutes < 1) return future ? '即将' : '刚刚'
  let amount
  let unit
  if (absoluteMinutes < 60) {
    amount = absoluteMinutes
    unit = '分钟'
  } else if (absoluteMinutes < 24 * 60) {
    amount = Math.floor(absoluteMinutes / 60)
    unit = '小时'
  } else {
    amount = Math.floor(absoluteMinutes / (24 * 60))
    unit = '天'
  }
  if (mode === 'past' || (mode === 'auto' && !future)) return amount + unit + '前'
  return '约' + amount + unit + '后'
}

const expiryLabel = (date) => {
  const relative = relativeTime(date, 'future')
  return relative === '已过期' ? relative : relative + '失效'
}

const instructionLines = (instruction) => String(instruction || '')
  .split(/[；;\n]+/)
  .map((line) => line.trim().replace(/^\d+\s*[.、．)）]\s*/, ''))
  .filter(Boolean)
</script>

<style lang="scss" scoped>
.warning-slide {
  --warning-accent: #956316;
  --warning-bg: rgba(250, 232, 176, 0.94);
  --warning-text: #493910;
  --warning-muted: #705c37;
  --warning-heading: #725a2c;
  --warning-marker: #806947;
  --warning-border: rgba(120, 83, 24, 0.42);
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  height: auto;
  white-space: normal;
  color: var(--warning-text);
  background: var(--warning-bg);
  border: 1px solid var(--warning-border);
  border-radius: calc(var(--warning-unit) * 1.6);
  overflow: visible;
  box-shadow: 0 calc(var(--warning-unit) * 0.8) calc(var(--warning-unit) * 2.4) rgba(4, 17, 30, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(calc(var(--warning-unit) * 1.1)) saturate(1.3);
  -webkit-backdrop-filter: blur(calc(var(--warning-unit) * 1.1)) saturate(1.3);
}

.warning-slide.sev-blue {
  --warning-accent: #137ca5;
  --warning-bg: rgba(185, 222, 240, 0.94);
  --warning-text: #123f57;
  --warning-muted: #315f73;
  --warning-heading: #16617f;
  --warning-marker: #39748d;
  --warning-border: rgba(19, 124, 165, 0.42);
}

.warning-slide.sev-yellow {
  --warning-accent: #b77700;
  --warning-bg: rgba(250, 232, 176, 0.94);
  --warning-text: #493910;
  --warning-muted: #705c37;
  --warning-heading: #725a2c;
  --warning-marker: #806947;
  --warning-border: rgba(183, 119, 0, 0.42);
}

.warning-slide.sev-orange {
  --warning-accent: #c15c18;
  --warning-bg: rgba(250, 210, 170, 0.94);
  --warning-text: #54311f;
  --warning-muted: #765440;
  --warning-heading: #7d4626;
  --warning-marker: #86604a;
  --warning-border: rgba(193, 92, 24, 0.42);
}

.warning-slide.sev-red {
  --warning-accent: #b43f48;
  --warning-bg: rgba(248, 195, 199, 0.94);
  --warning-text: #542828;
  --warning-muted: #765050;
  --warning-heading: #7f3838;
  --warning-marker: #865858;
  --warning-border: rgba(180, 63, 72, 0.42);
}

.warning-slide.is-cancelled {
  --warning-accent: #49616e;
  --warning-bg: rgba(218, 230, 235, 0.96);
  --warning-text: #293f4a;
  --warning-muted: #4c626d;
  --warning-heading: #3d5664;
  --warning-border: rgba(73, 97, 110, 0.42);
}

// A square spacer supplies the default height without constraining long content.
.warning-slide::before {
  content: '';
  grid-area: 1 / 1;
  width: 100%;
  aspect-ratio: 1 / 1;
  pointer-events: none;
}

.warning-card-content {
  box-sizing: border-box;
  grid-area: 1 / 1;
  min-width: 0;
  height: auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: calc(var(--warning-unit) * 0.8);
  padding: calc(var(--warning-unit) * 1.4) calc(var(--warning-unit) * 1.5);
  border-radius: inherit;
  overflow: visible;
  user-select: none;
}

.warning-slide { flex: 1 1 auto; }

.warning-card-content:focus-visible { outline: 2px solid var(--warning-accent); outline-offset: -3px; }
.warning-detail-header { padding-bottom: calc(var(--warning-unit) * 0.65); border-bottom: 1px solid var(--warning-border); }
.warning-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: calc(var(--warning-unit) * 0.48); }
.warning-icon-surface { display: grid; place-items: center; flex: none; width: calc(var(--warning-unit) * 1.9); height: calc(var(--warning-unit) * 1.9); color: var(--warning-accent); background: color-mix(in srgb, var(--warning-accent) 12%, transparent); border-radius: calc(var(--warning-unit) * 0.45); }
.warning-detail-title { min-width: 0; margin: 0; font-size: calc(var(--warning-unit) * 1.28); font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
.warning-event-icon { font-size: calc(var(--warning-unit) * 1.1); line-height: 1; }
.warning-level { flex: none; padding: calc(var(--warning-unit) * 0.15) calc(var(--warning-unit) * 0.4); color: var(--warning-accent); background: color-mix(in srgb, var(--warning-accent) 8%, transparent); border: 1px solid color-mix(in srgb, var(--warning-accent) 28%, transparent); border-radius: calc(var(--warning-unit) * 0.2); font-size: calc(var(--warning-unit) * 0.78); font-weight: 600; line-height: 1.3; white-space: nowrap; }
.warning-detail-meta { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: calc(var(--warning-unit) * 0.2) calc(var(--warning-unit) * 0.65); margin-top: calc(var(--warning-unit) * 0.3); color: var(--warning-muted); font-size: calc(var(--warning-unit) * 0.84); line-height: 1.35; }
.warning-times { display: flex; flex-wrap: wrap; gap: calc(var(--warning-unit) * 0.2) calc(var(--warning-unit) * 0.7); }
.warning-details { display: grid; gap: calc(var(--warning-unit) * 0.65); }
.warning-section { min-width: 0; }
.warning-section-title { margin: 0 0 calc(var(--warning-unit) * 0.4); color: var(--warning-heading); font-size: calc(var(--warning-unit) * 1.02); font-weight: 700; line-height: 1.4; }
.warning-guidance {
  padding: calc(var(--warning-unit) * 0.55) calc(var(--warning-unit) * 0.72);
  background: color-mix(in srgb, var(--warning-bg) 62%, rgba(255, 255, 255, 0.74));
  border: 1px solid color-mix(in srgb, var(--warning-accent) 28%, transparent);
  border-left: calc(var(--warning-unit) * 0.16) solid var(--warning-accent);
  border-radius: calc(var(--warning-unit) * 0.42);
}
.warning-text { margin: 0; color: var(--warning-text); font-size: calc(var(--warning-unit) * 1.15); line-height: 1.55; white-space: pre-line; overflow-wrap: anywhere; }
.warning-guidance-list { display: grid; gap: calc(var(--warning-unit) * 0.32); margin: 0; padding-left: 1.4em; }
.warning-guidance-line { padding-left: calc(var(--warning-unit) * 0.15); color: var(--warning-muted); font-size: calc(var(--warning-unit) * 0.98); line-height: 1.55; }
.warning-guidance-line::marker { color: var(--warning-marker); font-variant-numeric: tabular-nums; }

@media (max-width: 560px) {
  .warning-card-content { gap: calc(var(--warning-unit) * 0.75); padding: calc(var(--warning-unit) * 1.1); }
  .warning-detail-meta { justify-content: flex-start; }
  .warning-sender { width: 100%; }
  .warning-text { line-height: 1.5; }
}

</style>
