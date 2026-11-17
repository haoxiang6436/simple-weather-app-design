<template>
  <div class="WeatherDialog" :class="{ 'is-inline': inline, 'is-smooth': smoothScroll }" role="presentation"
    @click="handleBackdropClick">
    <section ref="panel" class="WeatherDialogPanel" role="dialog" aria-modal="true" :aria-labelledby="labelledby"
      tabindex="-1" @click.stop @keydown.esc.stop.prevent="$emit('close')" @keydown.tab="handleTabKey">
      <header class="WeatherDialogHeader">
        <div class="WeatherDialogHeading">
          <slot name="title"></slot>
        </div>
        <button v-if="showClose" class="WeatherDialogClose" type="button" aria-label="关闭" @click="$emit('close')">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              d="M6 6l12 12M18 6L6 18"></path>
          </svg>
        </button>
      </header>
      <div ref="wrapperEl" class="WeatherDialogBody">
        <!-- 开了顺滑滚动的弹层：正文包一层，作为 BetterScroll 的内容层。
             必须只有一个根节点（bs 只认 wrapper 的第一个元素），所以这里固定包 div。 -->
        <div v-if="smoothScroll" class="WeatherDialogScroll">
          <slot></slot>
        </div>
        <template v-else>
          <slot></slot>
        </template>
        <!-- 自绘滚动条：只在真的溢出时淡入，平时不占位、不吃点击。
             mousedown 必须 .stop：滚动条在 wrapper 内部，不拦住的话 BetterScroll
             也会收到这次按下、开始一次「拖正文」，顺手把刚发起的滚动动画停掉。 -->
        <div v-if="smoothScroll" ref="barEl" class="WeatherDialogBar" :class="{ 'is-visible': barVisible }"
          @mousedown.stop="onTrackDown">
          <div ref="thumbEl" class="WeatherDialogThumb" @mousedown.stop="onThumbDown"></div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { defineEmits, defineProps, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useSmoothScroll } from './useSmoothScroll'

const props = defineProps({
  labelledby: { type: String, required: true },
  showClose: { type: Boolean, default: true },
  /* 只给 dev 对比板用：不做全屏遮罩，面板按容器宽度排版。
     dev 页要在一屏里并排看几个配色 / 几种状态的同一块面板，全屏 fixed 摆不下。 */
  inline: { type: Boolean, default: false },
  /* 内容超出面板高度时，用 BetterScroll 接管滚动（滚轮 + 拖拽 + 自绘细滚动条），
     而不是让浏览器原生滚动条压在玻璃面板上。
     默认关闭是有意的：正文靠 flex 定高、用百分比高度的弹层（分钟级降水的柱状图）
     换掉滚动容器就会塌，这类弹层继续用原生滚动。 */
  smoothScroll: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'backdrop-click'])
const panel = ref(null)
let previousFocus = null

const { wrapperEl, barEl, thumbEl, barVisible, start, stop, onThumbDown, onTrackDown } = useSmoothScroll()

onMounted(async () => {
  previousFocus = document.activeElement
  panel.value?.focus({ preventScroll: true })
  if (props.smoothScroll) {
    // 等正文渲染完再建实例：BetterScroll 会在初始化时量一次 wrapper / 内容尺寸
    await nextTick()
    start()
  }
})

// 对比板那种静态展示页不会来回切，但 prop 变了还是跟着走，别留着上一份状态
watch(() => props.smoothScroll, async (enabled) => {
  if (enabled) {
    await nextTick()
    start()
  } else {
    stop()
  }
})

onBeforeUnmount(() => {
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
})

const handleTabKey = (event) => {
  const controls = [...panel.value.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
    .filter((element) => !element.closest('[inert]') && element.getClientRects().length)
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (!controls.length) {
    event.preventDefault()
    panel.value?.focus()
    return
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

const handleBackdropClick = (event) => {
  if (event.target === event.currentTarget) emit('backdrop-click', event)
}
</script>

<style lang="scss" scoped>
.WeatherDialog {
  box-sizing: border-box;
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background-color: var(--scrim);
  backdrop-filter: blur(1.125rem);
  -webkit-backdrop-filter: blur(1.125rem);
}

/* 面板自身的进场 / 离场。遮罩那层的淡入淡出在 style/transitions.scss 的 .Dialog-* 里。
   两个方向刻意不对称：进场慢（0.48s，expo-out，一路减速稳稳停住），离场快（0.34s，
   ease-leave，越走越快），"进来要看清、出去别挡路"。
   离场总时长必须和遮罩一致：Vue 按根元素的过渡结束时间摘整棵子树，根元素先结束的话，
   面板这段位移会被砍掉最后一截。 */
/* 只做位移、不做 scale：面板是一整块玻璃，缩放会让合成器把整棵子树当纹理缩放，
   收尾重栅格时里面的文字和 1px 边框会一起跳一下。位移 + 淡入 + 去模糊已经足够「落位」。 */
/* filter 只走 0.26s，有意短于 opacity（0.36s）和 transform（0.48s）：
   带 filter 的元素会把整棵子树压成一张离屏表面，滤镜一撤，面板里的文字要在同一帧
   重新栅格化。让它提前收完，那次重绘就发生在面板还半透明的时候，看不出来；
   收成和 transform 一样长的话，重绘正好落在"面板最清楚"的那一帧上，整屏文字会抖一下。 */
.WeatherDialog.Dialog-enter-active .WeatherDialogPanel {
  transition: transform 0.48s var(--ease-enter), opacity 0.36s ease, filter 0.26s ease;
}

.WeatherDialog.Dialog-leave-active .WeatherDialogPanel {
  transition: transform 0.34s var(--ease-leave), opacity 0.26s var(--ease-leave), filter 0.3s var(--ease-leave);
}

.WeatherDialog.Dialog-enter-from .WeatherDialogPanel {
  transform: translateY(-28px);
  opacity: 0;
  filter: blur(3px);
}

.WeatherDialog.Dialog-leave-to .WeatherDialogPanel {
  transform: translateY(12px);
  opacity: 0;
  filter: blur(2px);
}

/* 面板尺寸：宽度定死、1.618 : 1 只是「默认」比例。
   —— 不用 aspect-ratio 锁死高度，而是拿它反推出一个「最矮高度」（min-height）：
      · 内容装不满时，面板就停在这个比例上（和设计稿长得一样，不会缩成一条窄带）；
      · 内容更高时，宽度不变、面板往下长高，正文不被裁、也不出滚动条；
      · 长到屏幕高度的 80%（max-height: 80vh）为止，再高就由正文自己的滚动区接住。

   为什么不用 aspect-ratio：它和「高度跟着内容走」是互斥的 —— 只要写了 aspect-ratio，
   高度就永远是宽度 / 1.618，内容多一点就会被 body 的 overflow 变成滚动条。
   之前空气质量弹层就是这么出问题的：面板高 = 47.45rem / 1.618 ≈ 29.33rem，
   而它的正文本来就被压到 ≈ 29.25rem，差不到 2px，缩放一取整就溢出 1~11px 见滚动条。

   两个变量：--dialog-w 是宽度本身；--dialog-min-h 是它对应的默认高度。
   子组件要彻底接管尺寸（比如预警详情那种透明外壳），把这两个变量一起改掉即可。

   实测（空气质量弹层，真全屏层，Chromium；px。「改前」= aspect-ratio 锁死高度的旧外壳）：

     视口        改前 正文可用/内容  溢出  面板高 │ 改后 面板高  溢出
     1920×1080      348 / 348          0    422  │     422        0
     1600×900       290 / 291          1    352  │     353        0
     1440×810       260 / 263          3    317  │     320        0
     1280×720       231 / 231          0    282  │     282        0
     1024×768       184 / 191          7    225  │     232        0
      800×600       143 / 152          9    176  │     184        0
      768×1024      143 / 154         11    176  │     187        0

   宽屏上面板仍然落在 1.62 : 1（正文恰好填满），窄屏才比设计稿高一点（1.52~1.57 : 1）。
   超长内容（灌了 200 遍占位文案）：面板停在 80vh（1440×810 下 = 648px），
   正文滚动区接住剩下的内容，宽度自始至终不变。 */
.WeatherDialogPanel {
  box-sizing: border-box;
  --dialog-w: min(72vw, 47.45rem, calc(80vh * 1.618));
  --dialog-min-h: calc(var(--dialog-w) / 1.618);
  width: var(--dialog-w);
  height: auto;
  min-height: var(--dialog-min-h);
  max-height: 80vh;
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--weather-dialog-bg);
  border: 1px solid var(--glass-border);
  border-radius: 1.375rem;
  corner-shape: squircle;
  box-shadow: 0 1.75rem 4.375rem -1.75rem rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(1.5rem) saturate(1.2);
  -webkit-backdrop-filter: blur(1.5rem) saturate(1.2);
}

.WeatherDialogPanel:focus { outline: none; }

/* 对比板模式：遮罩层退成普通容器，面板宽度交给外面的格子决定（缩放由外层的 zoom 做） */
.WeatherDialog.is-inline {
  position: relative;
  inset: auto;
  display: block;
  padding: 0;
  background: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.WeatherDialog.is-inline .WeatherDialogPanel {
  width: 100%;
  max-height: none;
}

.WeatherDialogHeader {
  box-sizing: border-box;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-width: 0;
  padding: 0.8rem 0.95rem 0.6rem 1rem;
  border-bottom: 1px solid var(--glass-bg-soft);
}

.WeatherDialogHeading { min-width: 0; }

.WeatherDialogClose {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  min-width: 44px;
  min-height: 44px;
  color: var(--text-secondary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 50%;
  transition: background 0.2s ease, color 0.2s ease;
  cursor: pointer;

  &:hover { background: var(--glass-border); }
  &:active { background: var(--glass-active); }
  &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
}

/* 正文区：外壳只提供「一块能长高的 flex 区域」，具体怎么排由各弹层自己定。
   注意给子组件的约定：正文根元素要撑满这里，请用 flex: 1 1 auto，
   不要写 height: 100% —— 面板是 height: auto + min-height（1.618 只是最矮高度，
   不是定高），百分比高度在这种盒子里会被解析成 auto，正文就只拿到自身内容高：
   面板停在最矮高度时底下会白出一截，而靠 flex 定高的图表区也涨不起来。
   分钟级降水弹层就是这么被压到顶部、底下空 98px 的（见 MinutelyRainDialog.vue）。 */
.WeatherDialogBody {
  box-sizing: border-box;
  /* 自绘滚动条的定位参照 */
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* ================= 顺滑滚动（smooth-scroll） =================
   BetterScroll 的约定：wrapper 定高 + overflow:hidden，wrapper 的第一个元素是内容。
   所以内容层不能用 flex 去「填满」—— 它必须跟着内容自然高，
   超出的部分由 bs 用 transform 挪，否则 bs 量不到可滚的距离。 */
.WeatherDialogScroll {
  flex: 0 0 auto;
  width: 100%;
}

/* 自绘滚动条：细、半透明，只在真的溢出时淡入。
   藏起来的时候 pointer-events 也要关掉，否则它会挡住弹层右下角的点击。 */
.WeatherDialogBar {
  position: absolute;
  top: 0.4rem;
  right: 0.25rem;
  bottom: 0.55rem;
  width: 0.3rem;
  border-radius: 999px;
  background: var(--glass-bg-soft);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.22s ease;

  &.is-visible { opacity: 1; pointer-events: auto; }
}

.WeatherDialogThumb {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  border-radius: 999px;
  background: var(--glass-border-strong);
  cursor: grab;
  transition: background 0.16s ease;

  &:hover { background: var(--text-muted); }
  &:active { cursor: grabbing; }
}

@media (prefers-reduced-motion: reduce) {
  .WeatherDialogBar { transition: none; }
}

/* 窄屏只是换一套宽度参数：高度那一套（默认比例 / 内容撑高 / 80vh 封顶）完全继承 */
@media (max-width: 560px) {
  .WeatherDialog { padding: 0.75rem; }
  .WeatherDialogPanel {
    --dialog-w: min(92vw, 51.25rem, calc(80vh * 1.618));
  }
}

@media (prefers-reduced-transparency: reduce) {
  .WeatherDialogPanel { backdrop-filter: none; -webkit-backdrop-filter: none; background: var(--surface-modal); }
}

@media (prefers-reduced-motion: reduce) {
  .WeatherDialog.Dialog-enter-active .WeatherDialogPanel,
  .WeatherDialog.Dialog-leave-active .WeatherDialogPanel { transition: none; }
}
</style>
