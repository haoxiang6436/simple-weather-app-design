/**
 * 地区树（CityList）的公共读取逻辑。
 *
 * 全屏地图里「重选地区」用的是和卡片三列页完全相同的省 / 市 / 区结构，
 * 两边如果各写一套 findNode / 叶子判断，很容易出现「卡片里能选、弹窗里不能选」
 * 这类只在某个入口复现的怪问题。所以这里只保留一份规则：
 *   - findNode      adcode → 节点
 *   - isLeaf        区县是叶子；直辖市是「省 → 区」两层，规则同样成立
 *   - toItems       节点 → PickerColumn 要的 { value, label }
 *   - needsCityFirst 只选到省 / 自治区：和风不认省级 adcode，必须再选一级
 *   - canLocateRegion 选了这一级的路径后，能不能让地图定位过去
 */
import CityList from '@/data/CityList'

/**
 * 直辖市：省级节点本身就是和风可查询的城市（城市搜索直接返回城市中心），
 * 所以「就用 北京市」是可用的；其余省 / 自治区只给省份时，和风不认省级 adcode
 *（如 440000 → 400 No Such Location），必须再选到市 / 区县。
 */
export const MUNICIPALITY_ADCODES = new Set(['110000', '120000', '310000', '500000'])

/**
 * 按 adcode 找地区树节点。
 * @param {string} value
 * @returns {Object|null}
 */
export const findNode = (value) => {
  for (const province of CityList) {
    if (province.value === value) return province
    for (const city of province.children || []) {
      if (city.value === value) return city
      for (const district of city.children || []) {
        if (district.value === value) return district
      }
    }
  }
  return null
}

// 区县是整棵树的叶子；直辖市是「省 → 区」两层，这条判断同样成立
export const isLeaf = (node) => !!node && !(node.children && node.children.length)

export const toItems = (nodes) => (nodes || []).map((node) => ({
  value: node.value,
  label: node.label,
}))

// 路径最后一级；空路径返回 null
export const lastNodeOf = (path) => (path && path.length ? path[path.length - 1] : null)

/**
 * 只选到省 / 自治区（下面还有地级市）时不能定位：按钮上直接说明下一步要做什么，
 * 不要等用户点下去再拿到一个 No Such Location。
 * @param {Array} path 省 / 市 / 区 的节点路径
 */
export const needsCityFirst = (path = []) => {
  const node = lastNodeOf(path)
  return !!node &&
    path.length === 1 &&
    !isLeaf(node) &&
    !MUNICIPALITY_ADCODES.has(node.value)
}

/**
 * 这一级路径能不能让地图定位过去：
 * - 选到区县（叶子）：一定有中心点；
 * - 选到二级行政区（市）：和风的市级 adcode 也能查到中心点；
 * - 只选到省 / 自治区：不能（见 needsCityFirst）。
 * @param {Array} path
 */
export const canLocateRegion = (path = []) => {
  const node = lastNodeOf(path)
  return !!node && !needsCityFirst(path) && (path.length >= 2 || isLeaf(node))
}

// 路径文案：「浙江省 · 台州市 · 黄岩区」
export const pathLabels = (path = []) => path.map((node) => node.label).join(' · ')
