/**
 * 版本号的唯一出口
 *
 * 真源只有 package.json 的 version（以前 settingsMenu.js 里手写过一个 '0.1.0'，
 * 和 package.json 各写一份，改了一处另一处就悄悄走散）。构建时 vite.config.js
 * 读出来，通过 define 注入成 __APP_VERSION__ / __APP_BUILD_DATE__ / __APP_BUILD_COMMIT__，
 * 所以这里不需要也不该再出现版本字面量。
 *
 * 发布一版 = 改 package.json 的 version（推荐 `npm version minor`，顺带提交与打 tag）
 * → `npm run build` → 部署脚本会把 dist/version.json 一起同步到壁纸工程。
 *
 * 注入缺失时（例如有人绕过 Vite 直接引这个文件）退回 '0.0.0-dev'，
 * 页面不会因为读不到版本号而报错。
 *
 * 注意：public/project.json 里的 "version": 31 是 Wallpaper Engine 自己的
 * 创意工坊版本号（发布时由引擎改），和这里的应用版本号不是一回事，不要去同步它。
 */

/* global __APP_VERSION__, __APP_BUILD_DATE__, __APP_BUILD_COMMIT__ */

const injectedVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''
const injectedDate = typeof __APP_BUILD_DATE__ === 'string' ? __APP_BUILD_DATE__ : ''
const injectedCommit = typeof __APP_BUILD_COMMIT__ === 'string' ? __APP_BUILD_COMMIT__ : ''

/** 应用版本号，不带前缀（模板里显示成 v 加版本号，如 v1.0.1） */
export const APP_VERSION = injectedVersion || '0.0.0-dev'

/** 构建日期 YYYY-MM-DD（构建机本地时区） */
export const BUILD_DATE = injectedDate

/**
 * git 短提交，带 -dirty 表示构建时工作区有未提交改动。
 * 构建机没有 git 时是空串 —— 页面里按「有没有」决定显不显示。
 */
export const BUILD_COMMIT = injectedCommit

/** 展示用：去掉 -dirty 后缀（那是给部署日志看的，用户看到只会以为是错误） */
export const BUILD_COMMIT_SHORT = BUILD_COMMIT.replace(/-dirty$/, '')

/** 悬停提示用：把提交留在提示里，正文保持干净 */
export const BUILD_TITLE = [
  `版本 v${APP_VERSION}`,
  BUILD_DATE && `构建于 ${BUILD_DATE}`,
  BUILD_COMMIT && `提交 ${BUILD_COMMIT}`,
].filter(Boolean).join(' · ')
