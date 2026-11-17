/**
 * 设置弹窗的左侧菜单模型
 *
 * 这一份数据就是「后期加菜单」的全部成本：加一项 = 往 groups 里塞一条，
 * 再在 SettingsDialog.vue 里给对应 key 写一个面板。外壳、导航、滚动都不用动。
 *
 * 只放「结构和静态文案」：凭据、检测结果、外观属性全在各自的模块里，
 * 走后门塞进来一份示例值，最后一定会和真实状态对不上。
 */

import { PROJECT_REPO_URL, shortUrl } from '@/shared/clipboard'

// 统一 24×24、1.7 描边的线性图标：和天气卡上那把齿轮同一套画法
export const ICONS = {
  // 概览：一块仪表。四宫格的方块在这个尺寸下会糊成「88」，换成表盘就一眼认得出
  overview: 'M3.8 16.6a8.2 8.2 0 1 1 16.4 0M12 16.6l3.5-5.2M12 16.6h.01',
  // 连接与密钥：一把钥匙。原本「连接」和「密钥」分两页，合并后钥匙最认得出，
  // 而且 17px 下比两个套在一起的圆环清楚得多
  connection: 'M8.8 15.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8ZM12.2 12.2H20M17.2 12.2v3M14.6 12.2v2.4',
  // 统计：柱状
  stats: 'M4.4 20V10M9.6 20V4.6M14.8 20v-6.4M20 20V8.2',
  // 外观与背景：一幅画
  appearance: 'M3.6 5h16.8v14H3.6zM3.6 15.4 8.6 10.8l4.6 4.4M14.4 12.6l2.6-2.4 3.4 3.2',
  // 关于：信息
  about: 'M12 3.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8ZM12 11v5.4M12 7.8v.5',
}

export const MENU = [
  {
    title: '连接',
    items: [
      { key: 'overview', label: '概览', icon: ICONS.overview },
      // 连接状态、域名与密钥本是同一件事：一个页面上，检测结果在顶、凭据在中、怎么改在下
      { key: 'connection', label: '连接与密钥', icon: ICONS.connection },
    ],
  },
  {
    title: '数据',
    items: [{ key: 'stats', label: '统计', icon: ICONS.stats }],
  },
  {
    title: '其他',
    items: [
      { key: 'appearance', label: '外观与背景', icon: ICONS.appearance },
      { key: 'about', label: '关于', icon: ICONS.about },
    ],
  },
]

/** 每个面板的标题区文案：kicker 是标题上方那截短横 + 小字（沿用设置页原来的写法） */
export const PANES = {
  overview: {
    kicker: '概览',
    title: '这台机器的天气',
    // 三块卡的顺序就是这句话的顺序：此刻读数 → 位置地图 → 本月用量
    sub: '当前状态、位置与本月的请求量，一屏看全。',
  },
  connection: {
    kicker: '连接',
    title: '连接与密钥',
    sub: '天气数据走你自己的和风天气域名与密钥。这里只显示状态，不回写凭据。',
  },
  stats: {
    kicker: '数据',
    title: '统计',
    // 标题区就说清三件事：数的是本机、官方每月重置、所以只是参考。
    // 页脚那三条口径是给想看细节的人，大多数人只看这一行。
    sub: '这个月这台机器发给和风天气多少请求、花在哪儿。数字来自本机统计，和风额度每月 1 日重置，仅供参考。',
  },
  appearance: {
    kicker: '其他',
    title: '外观与背景',
    sub: '缩放、背景、雨滴都在「壁纸属性」面板里调，这一页只读，方便你对着改。',
  },
  about: {
    kicker: '其他',
    title: '关于',
    sub: '版本与更新记录、开源仓库、非官方声明，以及把新手引导再走一遍的入口。',
  },
}

/** 「怎么改」三步 */
export const CHANGE_STEPS = [
  { title: '打开「壁纸属性」面板', text: '它位于 Wallpaper Engine 窗口右侧，最上方就是域名与密钥。' },
  { title: '改「域名」和「密钥」', text: '多个用英文逗号分隔、按顺序一一配对。' },
  { title: '回到这一页，自动重新检测', text: '也可以直接点「重新检测」。' },
]

// 展示用地址：去掉 https:// 那一截（复制时用的仍是完整地址，见 SettingsDialog 的 copyRepo）
export const REPO_URL = shortUrl(PROJECT_REPO_URL)

// 版本号不在这里：真源是 package.json，构建时注入，统一从 @/config/version 取。
