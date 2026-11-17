#!/usr/bin/env node
/**
 * 检查每个 .vue 的 <template> 是否以「元素」开头，而不是以 HTML 注释开头。
 *
 * 为什么需要这条检查：
 *   模板顶层的注释在开发构建里会被保留成真实的注释节点，组件根节点就变成
 *   「注释 + 元素」两截 Fragment。这时外面包着它的 <Transition> / <TransitionGroup>：
 *     · 进场照样能动（过渡 hooks 挂在组件 vnode 上，会往下推给子树）；
 *     · 离场却走 Vue 的 removeFragment 分支 —— 一个 leave 钩子都不跑，
 *       整棵子树直接被摘掉，看起来就是「渐出没动效、元素瞬间消失」。
 *   生产构建会剥掉模板注释，所以这个 bug 只在 npm run dev 里发作，最难查。
 *
 * 约定见 src/style/transitions.scss 开头的 ⚠️ 段：顶层说明请写进 <script> 里，
 * 或者挪到根元素内部。
 *
 * 无依赖实现：只做「<template> 之后的第一个非空内容是不是 <!--」这一件事，
 * 宁可漏报复杂情况，也不要引入新的解析依赖。
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd(), 'src')

function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collect(full, out)
    else if (entry.name.endsWith('.vue')) out.push(full)
  }
  return out
}

const problems = []

for (const file of collect(ROOT)) {
  // 去掉可能的 BOM：否则 ^<template> 匹配不到，检查会静默放过这个文件
  const src = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  const open = /^[ \t]*<template(\s[^>]*)?>/m.exec(src)
  if (!open) continue

  const bodyStart = open.index + open[0].length
  // 模板体到对应的 </template> 之间（不存在嵌套的顶层 </template>，取第一个即可）
  const bodyEnd = src.indexOf('</template>', bodyStart)
  const body = src.slice(bodyStart, bodyEnd < 0 ? undefined : bodyEnd)
  const first = body.replace(/^\s+/, '')

  if (first.startsWith('<!--')) {
    const offset = bodyStart + body.indexOf('<!--')
    const line = src.slice(0, offset).split('\n').length
    problems.push(`${path.relative(process.cwd(), file)}:${line}`)
  }
}

if (problems.length) {
  console.error('✗ <template> 顶层以注释开头（dev 下根节点会变成 Fragment，丢离场动效）：')
  for (const p of problems) console.error('  ' + p)
  console.error('\n  把注释写进 <script> 里，或挪到根元素内部。详见 src/style/transitions.scss 开头的 ⚠️ 段。')
  process.exit(1)
}

console.log('✓ 所有 .vue 的 <template> 都以元素开头（根节点不会退化成 Fragment）')
