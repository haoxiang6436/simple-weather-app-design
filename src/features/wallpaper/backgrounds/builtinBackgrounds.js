/**
 * 内置图片背景的单一数据源
 *
 * `backgroundindex` 里除纯色（`0` 跟随面板配色 / `solid` 自定义纯色）和用户自选图
 * （`custom`）之外的序号，都对应这里的一张内置图片：
 *   4 湖心桥     —— 码头落日（默认背景）
 *   6 雾夜长街   —— 雾夜里亮着路灯光晕的公路
 *
 * 为什么单独抽一份：静态底图（DefaultBackground）和雨滴折射底图（RainEffect）
 * 必须是同一张图 —— 雨滴层的 WebGL 画布是不透明的，底图由它自己绘制，
 * 两边各写一份 import 一旦走散，就会出现「打开雨滴后背景突然换成另一张」。
 *
 * 新增内置背景：把图片放进 src/assets/，在这里补一条，再到
 * public/project.json 的 backgroundindex options 里加同名选项即可；
 * 选项清单与中文名由 constants.js 自动从这里派生。
 */

import dockImage from '@/assets/dock-1365387_1920.jpg'
import foggyRoadImage from '@/assets/rhamely-7fR24IUudk4-unsplash.jpg'

export const BUILTIN_BACKGROUNDS = {
  4: { label: '湖心桥', image: dockImage },
  6: { label: '雾夜长街', image: foggyRoadImage },
}

// 老用户 localStorage 里存的 4 继续落到「湖心桥」，不要跟着对象顺序变
export const DEFAULT_BUILTIN_BACKGROUND_INDEX = '4'

/**
 * 按 backgroundindex 取内置背景。
 * 未知序号回退到默认图，避免背景渲染成空白（也只会在手改 project.json 时出现）。
 */
export const getBuiltinBackground = (index) => (
  BUILTIN_BACKGROUNDS[String(index)] || BUILTIN_BACKGROUNDS[DEFAULT_BUILTIN_BACKGROUND_INDEX]
)

// 是否是内置图片背景：纯色与自定义背景都不是
export const isBuiltinBackgroundIndex = (index) => String(index) in BUILTIN_BACKGROUNDS
