<template>
  <div class="board" :class="{ 'is-atlas': isAtlas }">
    <header class="board-head">
      <h1>AQI 胶囊 · 位置预览</h1>
      <p class="lead">
        全部用真组件 + 真字号：温度 6rem / 800、胶囊高 2.125rem、温度行内容宽 21.25rem。
        虚线框是温度右边那片「余量」—— 真实卡片里胶囊能用的全部宽度：
        19° 时约 6.3rem（90px），两位数负数（-10°）时只剩约 3rem，刚好够放一颗 4 个字的等级。
      </p>
      <p class="facts">
        假数据 AQI <b>{{ aqiText }}</b> {{ category }}
        <span class="dot">·</span>温度 <b>{{ temp }} °C</b>
        <span class="dot">·</span>换一组看：<code>?aqi=3</code> <code>?temp=-10</code>
        <code>?theme=mist</code> <code>?theme=atlas</code>
      </p>
    </header>

    <section v-for="group in groups" :key="group.key" class="group">
      <div class="group-head">
        <h2><span class="group-index">{{ group.index }}</span>{{ group.title }}</h2>
        <p class="group-note">{{ group.note }}</p>
      </div>

      <div class="grid">
        <figure v-for="variant in group.items" :key="variant.id" class="tile">
          <figcaption class="tile-head">
            <span class="tile-name">{{ variant.name }}</span>
            <span v-if="variant.badge" class="tile-badge" :class="`is-${variant.tone || 'info'}`">
              {{ variant.badge }}
            </span>
          </figcaption>

          <div class="stage">
            <div class="hero-date">星期日 2025年6月1日</div>

            <div class="hero-row">
              <i :class="`qi-${icon} hero-icon`" aria-hidden="true"></i>
              <div class="hero-temp">
                <span class="hero-num">{{ temp }}</span>
                <span class="hero-unit">°C</span>
              </div>
              <!-- 行内：胶囊放进「余量条」，九宫格就是这条里的 3 × 3 -->
              <div v-if="variant.mode === 'strip'" class="hero-free" :class="[variant.va, variant.ha]">
                <AirQualityChip />
              </div>
            </div>

            <!-- 另起一行 -->
            <div v-if="variant.mode === 'flow'" class="hero-flow" :class="variant.flow">
              <AirQualityChip />
            </div>

            <div class="hero-desc">小雨 <span class="hero-sub">体感 20° · 20°/7°</span></div>

            <!-- 卡片四角：相对整块 hero 绝对定位 -->
            <AirQualityChip v-if="variant.mode === 'corner'" class="corner-chip" :class="`pos-${variant.pos}`" />
          </div>

          <p class="tile-note">{{ variant.note }}</p>
        </figure>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useWeatherStore } from '@/store/index'
import AirQualityChip from '@/features/weather/AirQualityChip.vue'

const store = useWeatherStore()
const temp = computed(() => store.nowWeatherData?.temp ?? '19')
const icon = computed(() => store.nowWeatherData?.icon ?? '305')
const aqiText = computed(() => store.AirQuality?.display ?? '—')
const category = computed(() => store.AirQuality?.category ?? '')
// 图谱主题把温度换成 6.65rem 的衬线字，基线整条往下沉，行高也跟着变 —— 墨迹对位要另算
const isAtlas = document.documentElement.getAttribute('data-theme') === 'atlas'

/* 位置清单。mode:
     strip —— 塞在温度右边的余量条里（九宫格：va 竖 × ha 横）
     flow  —— 另起一行，跟在温度行下面
     corner —— 贴在整块 hero 的四角（绝对定位，会压到别的内容）
   每条的 note 写的是「这个位置实际会发生什么」，不是装饰文案。 */
const groups = [
  {
    key: 'strip',
    index: '1',
    title: '温度右边的余量里（行内）',
    note: '3 × 3：竖向与数字墨迹齐平 / 居中 / 上沿，横向贴 °C / 居中 / 贴右沿。「下 · 中」就是现在卡片里的实现。最紧的一档是「-10° + 四个字的等级」：胶囊会比内容右沿多出约 0.2rem，落进卡片内边距里（不裁字、也不出卡）。',
    items: [
      { id: 'in-tl', mode: 'strip', name: '上 · 左', va: 'va-start', ha: 'ha-start', note: '上沿与数字齐平，紧贴 °C。' },
      { id: 'in-tc', mode: 'strip', name: '上 · 中', va: 'va-start', ha: 'ha-center', note: '同上，在余量里居中。' },
      { id: 'in-tr', mode: 'strip', name: '上 · 右', va: 'va-start', ha: 'ha-end', note: '贴卡片内容右沿，离温度最远。' },
      { id: 'in-ml', mode: 'strip', name: '中 · 左', va: 'va-center', ha: 'ha-start', note: '垂直居中、紧贴 °C —— 胶囊骑在数字腰上。' },
      { id: 'in-mc', mode: 'strip', name: '中 · 中', va: 'va-center', ha: 'ha-center', note: '数字腰部居中：和温度没有共同基准线，看着最「浮」。' },
      { id: 'in-mr', mode: 'strip', name: '中 · 右', va: 'va-center', ha: 'ha-end', note: '居中改成靠右，离温度更远一档。' },
      { id: 'in-bl', mode: 'strip', name: '下 · 左', va: 'va-end', ha: 'ha-start', note: '底边与数字下沿齐平、紧贴 °C，右侧余量整块留白。', badge: '当前实现', tone: 'current' },
      { id: 'in-bc', mode: 'strip', name: '下 · 中', va: 'va-end', ha: 'ha-center', note: '底边齐平 + 在余量里居中：两头都有呼吸（上一版用的这档）。' },
      { id: 'in-br', mode: 'strip', name: '下 · 右', va: 'va-end', ha: 'ha-end', note: '底边齐平、贴右沿：看着最像「页脚状态」。' },
    ],
  },
  {
    key: 'flow',
    index: '2',
    title: '另起一行（温度行下方）',
    note: '不再和温度抢那 4–7rem，必须新增一行：整块 hero 会往下长高约 2.6rem，下面的体感 / 分钟级降水会被顶下去。',
    items: [
      { id: 'flow-l', mode: 'flow', name: '行下 · 左', flow: 'flow-start', note: '和图标左沿对齐，最规整的一行。' },
      { id: 'flow-c', mode: 'flow', name: '行下 · 中', flow: 'flow-center', note: '居中，和温度块的中轴对齐。' },
      { id: 'flow-r', mode: 'flow', name: '行下 · 右', flow: 'flow-end', note: '靠右，和卡片右沿对齐。' },
    ],
  },
  {
    key: 'corner',
    index: '3',
    title: '整块 hero 的四角',
    note: '绝对定位，不占布局：要么压住已有内容，要么离温度很远、读起来像另一条卡片级状态。',
    items: [
      { id: 'corner-tl', mode: 'corner', pos: 'tl', name: '左上', note: '直接压住日期文字 —— 不可用。', badge: '冲突', tone: 'warn' },
      { id: 'corner-tr', mode: 'corner', pos: 'tr', name: '右上', note: '和日期行同高、贴右沿：卡片里唯一能「常驻可见」的位置。' },
      { id: 'corner-bl', mode: 'corner', pos: 'bl', name: '左下', note: '离温度最远，像另一条状态信息。' },
      { id: 'corner-br', mode: 'corner', pos: 'br', name: '右下', note: '同上，但靠右更像状态栏。' },
    ],
  },
]
</script>

<style lang="scss" scoped>
/* 整块板的几何常量。真实卡片里 hero 列的内容宽是 21.24rem（1920 下 305.8px），
   这里钉死同一个宽度，九宫格的横向余量才和真机一致。 */
.board {
  --hero-w: 21.25rem;
  /* 行顶 → 数字墨迹上沿 / 行底 → 数字墨迹下沿。
     6rem 的 Montserrat 数字在 line-height:1 的行盒里，墨迹上下各留约 0.85 / 0.7rem；
     图谱换成 6.65rem 衬线字后墨迹几乎顶满行盒，两边都变成 1.03rem。 */
  --ink-top: 0.85rem;
  --ink-bottom: 0.7rem;
  box-sizing: border-box;
  /* 一级三列：3 × 24.5rem 栅格 + 2 × 1.25rem 间距 + 左右 padding = 84rem 才排得下 */
  max-width: 84rem;
  margin: 0 auto;
  padding: 2rem 2rem 4rem;
  font-family: var(--font-sans);
  color: var(--text-primary);
}

.board.is-atlas {
  --ink-top: 1.03rem;
  --ink-bottom: 1.03rem;
}

/* ---------- 页头 ---------- */
.board-head {
  margin-bottom: 0.5rem;
}

.board-head h1 {
  margin: 0 0 0.75rem;
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.lead {
  max-width: 62rem;
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  line-height: 1.7;
  color: var(--text-secondary);
}

.facts {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.facts b {
  color: var(--text-primary);
}

.dot {
  margin: 0 0.5rem;
  opacity: 0.6;
}

.facts code {
  margin: 0 0.15rem;
  padding: 0.1rem 0.4rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
  background: var(--glass-bg-subtle);
  border: 1px solid var(--glass-border);
  border-radius: 0.35rem;
}

/* ---------- 分组 ---------- */
.group-head {
  margin: 2rem 0 0.75rem;
}

.group-head h2 {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0 0 0.35rem;
  font-size: 1.05rem;
  font-weight: 700;
}

.group-index {
  display: inline-grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  font-size: 0.8rem;
  font-weight: 700;
  /* 不用 --color-primary-soft 当字色：晨雾主题下它是浅蓝，压在浅底上几乎看不见 */
  color: var(--text-primary);
  background: var(--glass-active);
  border: 1px solid var(--glass-border-strong);
  border-radius: 999px;
}

.group-note {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--text-muted);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(24.5rem, 1fr));
  gap: 1.5rem 1.25rem;
}

.tile {
  display: grid;
  gap: 0.45rem;
  align-content: start;
  margin: 0;
}

.tile-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  font-weight: 700;
}

.tile-badge {
  padding: 0.1rem 0.45rem;
  font-size: 0.7rem;
  font-weight: 700;
  border-radius: 999px;
}

.tile-badge.is-current {
  color: #8cc8a6;
  background: rgba(140, 200, 166, 0.16);
  border: 1px solid rgba(140, 200, 166, 0.32);
}

.tile-badge.is-warn {
  color: #e3a36e;
  background: rgba(227, 163, 110, 0.16);
  border: 1px solid rgba(227, 163, 110, 0.32);
}

.tile-badge.is-info {
  color: var(--text-secondary);
  background: var(--glass-bg-subtle);
  border: 1px solid var(--glass-border);
}

.tile-note {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.6;
  color: var(--text-muted);
}

/* ---------- 迷你 hero（照 WeatherMain 的 hero 结构缩到一块） ---------- */
.stage {
  position: relative;
  width: calc(var(--hero-w) + 2.5rem);
  padding: 1.25rem;
  background: var(--glass-bg);
  background-image: var(--hero-gradient);
  border: 1px solid var(--glass-border);
  border-radius: 1rem;
}

.hero-date {
  font-size: 0.9rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.hero-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.875rem;
  margin: 0.4rem 0 0.7rem;
}

.hero-icon {
  font-size: 5rem;
  line-height: 1;
  color: var(--text-primary);
}

.hero-temp {
  display: flex;
  align-items: baseline;
  line-height: 1;
}

.hero-num {
  font-size: 6rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text-primary);
  white-space: nowrap;
}

.hero-unit {
  margin-left: 0.25rem;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.hero-desc {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.hero-sub {
  margin-left: 0.5rem;
  font-weight: 500;
  color: var(--text-muted);
}

/* 图谱：衬线数字 + 铜色单位（和 index.scss 的 atlas 覆写同款） */
.board.is-atlas .hero-date {
  font-family: var(--atlas-serif);
  color: var(--atlas-paper);
}

.board.is-atlas .hero-num {
  font-family: var(--atlas-serif);
  font-size: 6.65rem;
  letter-spacing: -0.055em;
  color: var(--atlas-paper);
}

.board.is-atlas .hero-unit {
  color: var(--atlas-copper);
}

.board.is-atlas .hero-desc {
  color: var(--atlas-paper);
}

/* ---------- ① 余量条：胶囊的九宫格 ----------
   min-width 保持 flex 的默认 auto（= min-content = 胶囊自身宽度）：余量不够时整条被胶囊撑开，
   胶囊越过温度行内容右沿 2-3px 落进卡片内边距里 —— 和真卡片里 auto 外边距归零后的行为一致。
   若写 min-width:0，胶囊会被自己的 max-width:100% 压窄、四个字的等级词被裁掉一笔，那是假象。 */
.hero-free {
  display: flex;
  flex: 1;
  align-self: stretch;
  padding: var(--ink-top) 0 var(--ink-bottom);
  outline: 1px dashed var(--glass-border-strong);
  outline-offset: 0;
}

.va-start {
  align-items: flex-start;
}

.va-center {
  align-items: center;
}

.va-end {
  align-items: flex-end;
}

.ha-start {
  justify-content: flex-start;
}

.ha-center {
  justify-content: center;
}

.ha-end {
  justify-content: flex-end;
}

/* ---------- ② 另起一行 ---------- */
.hero-flow {
  display: flex;
  margin: 0 0 0.7rem;
}

.flow-start {
  justify-content: flex-start;
}

.flow-center {
  justify-content: center;
}

.flow-end {
  justify-content: flex-end;
}

/* ---------- ③ 四角（绝对定位，压在 hero 上） ---------- */
.corner-chip {
  position: absolute;
  z-index: 2;
}

.pos-tl {
  top: 1.25rem;
  left: 1.25rem;
}

.pos-tr {
  top: 1.25rem;
  right: 1.25rem;
}

.pos-bl {
  bottom: 1.25rem;
  left: 1.25rem;
}

.pos-br {
  right: 1.25rem;
  bottom: 1.25rem;
}
</style>
