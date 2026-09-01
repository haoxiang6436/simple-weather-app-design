<template>
    <div style="position: fixed;top: 0;left:0;bottom: 0;right: 0;z-index: 0">
        <canvas ref="DynamicParticleCanvas" id="canvas" style="background-color: #07192f;"></canvas>
    </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import Bus from '@/shared/Bus';
import { getBackgroundConfig } from '@/features/wallpaper/backgroundConfig';
import { BUS_EVENTS } from '@/features/wallpaper/constants';
const DynamicParticleCanvas = ref(null)


let ctx = null;
let width = window.innerWidth;
let height = window.innerHeight;

// 从壁纸专属配置读取（可在开发调试面板中调整）
let dotsNum = getBackgroundConfig('3').dotsNum // 点的数量
const radius = 1.5 // 圆的半径，连接线宽度的一半
const fillStyle = 'rgb(255,255,255)' // 点的颜色
const lineWidth = 1
let connection = getBackgroundConfig('3').connection // 连线最大距离
const followLength = 80 // 鼠标跟随距离
const speedFactor = 0.3 // 速度因子，值越小点移动越慢
const elasticFactor = 0.6 // 弹射因子，值越大弹射越明显


let dots = []
let animationFrame = null
let mouseX = null
let mouseY = null

onMounted(() => {
    ctx = DynamicParticleCanvas.value.getContext('2d')
    addCanvasSize()
    initDots(dotsNum)
    moveDots()
    document.addEventListener('mousemove', mouseMove)
    document.addEventListener('mouseout', mouseOut)
    document.addEventListener('click', mouseClick)
    window.addEventListener('resize', addCanvasSize)
    Bus.on(BUS_EVENTS.BACKGROUND_CONFIG_CHANGE, handleConfigChange)
})

function handleConfigChange(payload) {
  if (payload.index !== '3') return
  const cfg = getBackgroundConfig('3')
  dotsNum = cfg.dotsNum
  connection = cfg.connection
  addCanvasSize()
}

onUnmounted(() => {
  if (animationFrame) window.cancelAnimationFrame(animationFrame)
  animationFrame = null
  Bus.off(BUS_EVENTS.BACKGROUND_CONFIG_CHANGE, handleConfigChange)
  document.removeEventListener('mousemove', mouseMove)
  document.removeEventListener('mouseout', mouseOut)
  document.removeEventListener('click', mouseClick)
  window.removeEventListener('resize', addCanvasSize)
  ctx = null
})

function addCanvasSize() { // 改变画布尺寸
    width = window.innerWidth
    height = window.innerHeight
    DynamicParticleCanvas.value.width = width
    DynamicParticleCanvas.value.height = height
    ctx.clearRect(0, 0, width, height)
    dots = []
    if (animationFrame) window.cancelAnimationFrame(animationFrame)
    initDots(dotsNum)
    moveDots()
}

function mouseMove(e) {
    mouseX = e.clientX
    mouseY = e.clientY
}

function mouseOut() {
    mouseX = null
    mouseY = null
}

function mouseClick() {
    for (const dot of dots) dot.elastic()
}

class Dot {
    constructor(x, y) {
        this.x = x
        this.y = y
        this.speedX = (Math.random() * 2 - 1) * speedFactor
        this.speedY = (Math.random() * 2 - 1) * speedFactor
        this.follow = false
    }
    draw() {
        ctx.beginPath()
        ctx.arc(this.x, this.y, radius, 0, 2 * Math.PI)
        ctx.fill()
        ctx.closePath()
    }
    move() {
        if (this.x >= width || this.x <= 0) this.speedX = -this.speedX
        if (this.y >= height || this.y <= 0) this.speedY = -this.speedY
        this.x += this.speedX
        this.y += this.speedY
        if (this.speedX >= speedFactor) this.speedX -= speedFactor
        if (this.speedX <= -speedFactor) this.speedX += speedFactor
        if (this.speedY >= speedFactor) this.speedY -= speedFactor
        if (this.speedY <= -speedFactor) this.speedY += speedFactor
        this.correct()
        this.connectMouse()
        this.draw()
    }
    correct() { // 根据鼠标的位置修正
        if (!mouseX || !mouseY) return
        let lengthX = mouseX - this.x
        let lengthY = mouseY - this.y
        const distance = Math.sqrt(lengthX ** 2 + lengthY ** 2)
        if (distance <= followLength) this.follow = true
        else if (this.follow === true && distance > followLength && distance <= followLength + 8) {
            let proportion = followLength / distance
            lengthX *= proportion
            lengthY *= proportion
            this.x = mouseX - lengthX
            this.y = mouseY - lengthY
        } else this.follow = false
    }
    connectMouse() { // 点与鼠标连线
        if (mouseX && mouseY) {
            let lengthX = mouseX - this.x
            let lengthY = mouseY - this.y
            const distance = Math.sqrt(lengthX ** 2 + lengthY ** 2)
            if (distance <= connection) {
                let opacity = (1 - distance / connection) * 0.5
                ctx.strokeStyle = `rgba(255,255,255,${opacity})`
                ctx.beginPath()
                ctx.moveTo(this.x, this.y)
                ctx.lineTo(mouseX, mouseY);
                ctx.stroke();
                ctx.closePath()
            }
        }
    }
    elastic() { // 鼠标点击后的弹射
        let lengthX = mouseX - this.x
        let lengthY = mouseY - this.y
        const distance = Math.sqrt(lengthX ** 2 + lengthY ** 2)
        if (distance >= connection) return
        const rate = 1 - distance / connection // 距离越小此值约接近1
        this.speedX = 40 * rate * -lengthX / distance * elasticFactor
        this.speedY = 40 * rate * -lengthY / distance * elasticFactor
    }
}

function initDots(num) { // 初始化粒子
    ctx.fillStyle = fillStyle
    ctx.lineWidth = lineWidth
    for (let i = 0; i < num; i++) {
        const x = Math.floor(Math.random() * width)
        const y = Math.floor(Math.random() * height)
        const dot = new Dot(x, y)
        dot.draw()
        dots.push(dot)
    }
}

function moveDots() { // 移动并建立点与点之间的连接线
    ctx.clearRect(0, 0, width, height)
    for (const dot of dots) {
        dot.move()
    }
    for (let i = 0; i < dots.length; i++) {
        for (let j = i; j < dots.length; j++) {
            const distance = Math.sqrt((dots[i].x - dots[j].x) ** 2 + (dots[i].y - dots[j].y) ** 2)
            if (distance <= connection) {
                let opacity = (1 - distance / connection) * 0.5
                ctx.strokeStyle = `rgba(255,255,255,${opacity})`
                ctx.beginPath()
                ctx.moveTo(dots[i].x, dots[i].y)
                ctx.lineTo(dots[j].x, dots[j].y);
                ctx.stroke();
                ctx.closePath()
            }
        }
    }
    animationFrame = window.requestAnimationFrame(moveDots)
}


</script>

<style lang="scss" scoped></style>
