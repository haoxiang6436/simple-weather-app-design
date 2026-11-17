/* 只验一件事：常驻合成层（backdrop-filter）上的 scale，
   换成 anime.js 逐帧写 transform 之后，字还会不会被重采样。
   四路同帧起跑，参数一致。 */

import { animate, cubicBezier } from 'animejs'

const DURATION = 600
const FROM_SCALE = 0.6
const EASE_CSS = 'cubic-bezier(0.16, 1, 0.3, 1)'
const EASE_ANIME = cubicBezier(0.16, 1, 0.3, 1)

const MODES = [
  ['panel-css', '面板本身 · CSS transition'],
  ['panel-anime', '面板本身 · anime 逐帧'],
  ['child-css', '面板内子块 · CSS transition'],
  ['child-anime', '面板内子块 · anime 逐帧'],
]

const MARKUP = `
  <div class="big">128<span class="unit">AQI</span></div>
  <p class="txt">空气质量可接受，但某些污染物可能对极少数异常敏感人群健康有较弱影响。</p>
  <div class="box">PM 2.5 · 93 μg/m³</div>
`

const root = document.querySelector('#root')
const stages = {}
for (const [mode, cap] of MODES) {
  const stage = document.createElement('div')
  stage.className = 'stage'
  stage.dataset.mode = mode
  stage.innerHTML = `<div class="cap">${cap}</div><div class="panel"><div class="inner">${MARKUP}</div></div>`
  root.append(stage)
  stages[mode] = {
    panel: stage.querySelector('.panel'),
    inner: stage.querySelector('.inner'),
  }
}

const anims = {}

function reset(el) {
  el.style.transition = 'none'
  el.style.opacity = '1'
  el.style.transform = 'none'
  void el.offsetWidth
  el.style.transition = ''
}

function replayCss(mode, target) {
  const el = stages[mode][target]
  reset(el)
  el.style.transition = 'none'
  el.style.opacity = '0'
  el.style.transform = `scale(${FROM_SCALE})`
  void el.offsetWidth
  el.style.transition = `opacity ${DURATION}ms ${EASE_CSS}, transform ${DURATION}ms ${EASE_CSS}`
  el.style.opacity = '1'
  el.style.transform = 'scale(1)'
}

function replayAnime(mode, target) {
  const el = stages[mode][target]
  reset(el)
  if (anims[mode]) anims[mode].revert()
  anims[mode] = animate(el, {
    opacity: [0, 1],
    scale: [FROM_SCALE, 1],
    duration: DURATION,
    ease: EASE_ANIME,
  })
}

window.__replay = () => {
  replayCss('panel-css', 'panel')
  replayAnime('panel-anime', 'panel')
  replayCss('child-css', 'inner')
  replayAnime('child-anime', 'inner')
}

window.__layout = () => {
  const out = {}
  for (const [mode] of MODES) {
    const r = stages[mode].panel.getBoundingClientRect()
    out[mode] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }
  return out
}
