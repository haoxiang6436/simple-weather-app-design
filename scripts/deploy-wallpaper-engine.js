/**
 * 把 dist/ 里的构建产物同步到 Wallpaper Engine 工程目录。
 *
 * 工程目录里除了构建产物，还有壁纸引擎自己维护的文件（project.json、preview.jpg 等），
 * 同步时只覆盖构建产物，不动这些文件，避免把壁纸工程配置写坏。
 *
 * 例外：project.json 里的「壁纸属性定义」（general.properties）以 public/project.json 为准，
 * 每次同步时合并进工程目录的 project.json —— 否则改完 public/project.json 里的属性
 * （新增背景选项、改 display condition 等）工程里还是旧的一份，壁纸引擎的属性面板里
 * 就看不到新选项（例如「整页雨珠叠加」）。其余字段（workshopid / version / preview /
 * description / tags 等）由壁纸引擎维护，合并时原样保留。
 *
 * 用法：
 *   node scripts/deploy-wallpaper-engine.js
 *   WE_PROJECT_DIR="D:/path/to/project" node scripts/deploy-wallpaper-engine.js
 *   WE_SYNC_PROPERTIES=0 node scripts/deploy-wallpaper-engine.js   # 跳过属性合并
 */
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const distDir = path.join(projectRoot, 'dist')
const publicProjectPath = path.join(projectRoot, 'public', 'project.json')

const defaultWeDir = 'D:/Steam/steamapps/common/wallpaper_engine/projects/myprojects/qweater'
const weDir = path.resolve(process.env.WE_PROJECT_DIR || defaultWeDir)

// 构建产物：每次同步前先清掉，避免旧的 hash 文件越堆越多
const BUILD_ENTRIES = ['index.html', 'favicon.ico', 'css', 'js', 'img', 'fonts', 'assets', 'version.json']

// Wallpaper Engine 自己维护的文件：同步时跳过，保留工程目录里的版本
const WE_KEEP_ENTRIES = ['project.json', 'preview.jpg', 'preview.gif']

/**
 * 壁纸引擎按 order 排序属性面板，index 则是属性在面板里的序号（编辑器生成的项目里都是唯一值）。
 * public/project.json 是手工维护的，允许出现重复 index，这里按 order 重新编号后再写回工程目录。
 */
function withUniqueIndexes (properties) {
  const keys = Object.keys(properties).sort((a, b) => {
    const orderA = Number(properties[a].order)
    const orderB = Number(properties[b].order)
    return (Number.isFinite(orderA) ? orderA : 0) - (Number.isFinite(orderB) ? orderB : 0)
  })
  const result = {}
  keys.forEach((key, index) => {
    result[key] = { ...properties[key], index }
  })
  return result
}

/**
 * 把 public/project.json 里的属性定义合并进工程目录的 project.json
 */
function syncProjectProperties () {
  if (process.env.WE_SYNC_PROPERTIES === '0') {
    console.log('[deploy] 已跳过属性合并（WE_SYNC_PROPERTIES=0）')
    return
  }
  if (!fs.existsSync(publicProjectPath)) {
    console.warn(`[deploy] 没找到 ${publicProjectPath}，跳过属性合并`)
    return
  }

  const weProjectPath = path.join(weDir, 'project.json')
  const publicProject = JSON.parse(fs.readFileSync(publicProjectPath, 'utf8'))
  const weProject = JSON.parse(fs.readFileSync(weProjectPath, 'utf8'))

  const publicProperties = publicProject.general && publicProject.general.properties
  if (!publicProperties) {
    console.warn('[deploy] public/project.json 里没有 general.properties，跳过属性合并')
    return
  }

  const before = Object.keys((weProject.general && weProject.general.properties) || {})
  const merged = withUniqueIndexes(publicProperties)
  const after = Object.keys(merged)

  weProject.general = { ...(weProject.general || {}), properties: merged }
  fs.writeFileSync(weProjectPath, `${JSON.stringify(weProject, null, '\t')}\n`, 'utf8')

  const added = after.filter((key) => !before.includes(key))
  const removed = before.filter((key) => !after.includes(key))
  console.log(`[deploy] 属性定义已同步：共 ${after.length} 项` +
    (added.length ? `，新增 ${added.join('、')}` : '') +
    (removed.length ? `，移除 ${removed.join('、')}` : ''))
}

function fail (message) {
  console.error(`\n[deploy] ${message}\n`)
  process.exit(1)
}

// 迁移到 Vite 后，产物必须兼容 file://：不能有 type="module" 或 crossorigin。
// 否则 Wallpaper Engine 加载时会出现白屏或样式被静默丢弃。
function assertFileUrlSafe () {
  const indexPath = path.join(distDir, 'index.html')
  if (!fs.existsSync(indexPath)) return
  const html = fs.readFileSync(indexPath, 'utf8')
  if (/type="module"/.test(html)) {
    fail('dist/index.html 包含 type="module"，file:// 下不执行，请检查构建配置。')
  }
  if (/crossorigin/.test(html)) {
    fail('dist/index.html 包含 crossorigin，file:// 下样式会丢失，请检查构建配置。')
  }
}

if (!fs.existsSync(distDir)) {
  fail(`没有找到构建产物目录 ${distDir}，请先执行构建。`)
}

assertFileUrlSafe()

// 版本核对：dist/version.json 由 vite.config.js 的 emit-build-info 插件生成，
// 记录 version / builtOn / commit。它同时会被同步进壁纸工程，写上「这个目录是哪一版」。
// 这里再对一遍 package.json —— 改了版本号却忘了重新构建时，发布出去的仍是旧产物。
function readBuildInfo () {
  try {
    return JSON.parse(fs.readFileSync(path.join(distDir, 'version.json'), 'utf8'))
  } catch {
    return null
  }
}

function reportBuildVersion () {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
  const buildInfo = readBuildInfo()
  if (!buildInfo) {
    console.warn('[deploy] dist 里没有 version.json（旧版构建产物），本次部署留不下版本标记，建议重新构建。')
    return
  }
  console.log(`[deploy] 构建版本 v${buildInfo.version}（${buildInfo.builtOn}，${buildInfo.commit || '无 git 信息'}）`)
  if (buildInfo.version !== pkg.version) {
    console.warn(
      `[deploy] ⚠ package.json 是 v${pkg.version}，dist 里却是 v${buildInfo.version}：` +
        '版本号改过但没有重新构建，这次发布出去的仍是旧代码。'
    )
  }
}

reportBuildVersion()

if (!fs.existsSync(weDir)) {
  fail(
    `没有找到 Wallpaper Engine 工程目录 ${weDir}。\n` +
      '         可通过环境变量 WE_PROJECT_DIR 指定工程目录，或运行 npm run build:dist 只生成 dist/。'
  )
}

if (!fs.existsSync(path.join(weDir, 'project.json'))) {
  fail(`${weDir} 看起来不是 Wallpaper Engine 工程目录（缺少 project.json），已中止同步。`)
}

const removed = []
for (const entry of BUILD_ENTRIES) {
  const target = path.join(weDir, entry)
  if (!fs.existsSync(target)) continue
  fs.rmSync(target, { recursive: true, force: true })
  removed.push(entry)
}

const copied = []
for (const entry of fs.readdirSync(distDir)) {
  if (WE_KEEP_ENTRIES.includes(entry)) continue
  fs.cpSync(path.join(distDir, entry), path.join(weDir, entry), { recursive: true })
  copied.push(entry)
}

if (!fs.existsSync(path.join(weDir, 'index.html'))) {
  fail('同步后没有找到 index.html，Wallpaper Engine 工程可能不完整，请检查 dist/。')
}

const kept = fs.readdirSync(weDir).filter(entry => WE_KEEP_ENTRIES.includes(entry))

syncProjectProperties()

console.log(`[deploy] 构建产物已同步到 ${weDir}`)
console.log(`[deploy] 清理旧产物：${removed.length ? removed.join('、') : '无'}`)
console.log(`[deploy] 写入：${copied.join('、')}`)
console.log(`[deploy] 保留壁纸工程文件：${kept.length ? kept.join('、') : '无'}`)
