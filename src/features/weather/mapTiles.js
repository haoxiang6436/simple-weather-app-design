/**
 * 地图瓦片工具：瓦片源配置、Web Mercator 换算、GCJ-02 → WGS-84 转换
 *
 * 设计前提（见《地图选点-开发路线》§5）：
 *   1. 不引入 MapLibre / Leaflet，直接用 <img> 拼瓦片 —— 壁纸里已有雨滴 WebGL
 *      重特效，再开一个 WebGL 上下文会直接抢帧；
 *   2. 用高德 raster（中文标注全、道路密度高、国内快）。它无需 key，但属于调用
 *      高德网页版的内部瓦片端点，不是公开 API，失效风险由使用方承担；
 *   3. 高德瓦片是 GCJ-02，和风吃 WGS-84。点选得到的坐标必须先转换再交给 store，
 *      否则会有数百米偏移（北京实测 ≈ 555 m；区县级查询看不出来，但依然是 bug）。
 */

export const TILE_SIZE = 256
// 默认方形视口尺寸（仅作函数默认值）；实际视口由容器决定，见 MapPointPicker 的 viewW / viewH
export const MAP_VIEW = TILE_SIZE * 4

// 卡片里（小地图）的最小级别：再往外缩就只剩区县轮廓，已经没法选路
export const ZOOM_MIN = 11
export const ZOOM_MAX = 17
// 全屏时的硬下限：再往外缩，经度方向会把世界铺两遍（buildTiles 做了经度环绕），
// 屏幕上出现「两个中国」，看起来就是 bug
export const ZOOM_MIN_WORLD = 3
// 「全国」一键档位：1920 宽下中国东西向约占屏 1300px，正好一屏装下
export const ZOOM_COUNTRY = 5

/**
 * 全屏时的最小级别：保证「整个世界」不比视口窄。
 * 1080p → 3、4K → 4；再小就会看到重复的世界。
 * 卡片尺寸的视口按同一个公式算出来会是 2 级，所以卡片单独用 ZOOM_MIN，
 * 不能用这个函数的返回值。
 * @param {number} width 视口宽（CSS 像素）
 */
export const minZoomForViewport = (width) => Math.max(
  ZOOM_MIN_WORLD,
  Math.ceil(Math.log2(Math.max(1, width) / TILE_SIZE))
)
/**
 * 默认缩放 14：约 6.7km × 2.9km（850×370 视口），1 px ≈ 8.4 m。
 *
 * 之前用 12，整幅视口 27km 宽、1 px ≈ 34 m —— 那个级别高德瓦片里几乎没有路名
 * （只有区县界和大型 POI），所以看起来「比高德官方糊」：不是被拉伸糊掉的，
 * 而是 z12 的瓦片本身就没画路名。要按「XX街道XX路」找位置，必须在有路名的
 * 级别上，12 做不到；14 起主干道名和大部分 POI 都在。
 *
 * 想看全区县可以按 −（ZOOM_MIN 11 仍可用），比反过来「开局糊、要靠放大补救」好。
 */
export const ZOOM_DEFAULT = 14

// 当前这一屏里失败这么多张瓦片，才考虑判定地图不可用（还要看失败占比）
export const MAX_TILE_FAILURES = 3

/**
 * 瓦片源。新增源只要满足 { label, crs, url(z,x,y), invert? } 即可。
 * crs 决定点选坐标要不要做 GCJ-02 → WGS-84 转换。
 *
 * 只有 amap 是「无 key 且国内可达」的：CARTO 的 basemaps 已经收进 API key
 * （https://carto.com/basemaps/apikey/），不能再当零配置的回退源。
 * osm 留作参考/自用切换，正式发布前请先读 OSM 的 Tile Usage Policy。
 */
export const TILE_SOURCES = {
  amap: {
    label: '© 高德地图',
    crs: 'GCJ02',
    // style=8 是街道图；webrd01~04 是同一组服务器，按 x+y 散开避免单域名连接数打满
    url: (z, x, y) =>
      `https://webrd0${((x + y) % 4) + 1}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=${x}&y=${y}&z=${z}`,
  },
  // 备用：亮色底图，靠 invert 滤镜压成暗色。无 key，但公共实例有使用政策，
  // 不适合当成「所有用户自动切换」的兜底
  osm: {
    label: '© OpenStreetMap contributors',
    crs: 'WGS84',
    invert: true,
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  },
}

export const ACTIVE_SOURCE = 'amap'

export const tileUrl = (source, z, x, y) => TILE_SOURCES[source].url(z, x, y)

/* ------------------------------------------------------------------ *
 * Web Mercator（EPSG:3857）换算
 * 全部用「归一化世界坐标」0~1 计算，乘以 2^z * TILE_SIZE 得到世界像素
 * ------------------------------------------------------------------ */

/**
 * 经纬度 → 归一化世界坐标
 * @returns {[number, number]} [x, y]，均为 0~1
 */
export const lngLatToWorld = (lng, lat) => {
  const s = Math.sin((lat * Math.PI) / 180)
  return [(lng + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)]
}

/**
 * 归一化世界坐标 → 经纬度
 * @returns {[number, number]} [lng, lat]
 */
export const worldToLngLat = (x, y) => [
  x * 360 - 180,
  (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI,
]

/**
 * 计算视口左上角的世界像素坐标
 * @param {[number, number]} center 视口中心 [lng, lat]
 * @param {number} zoom
 * @param {number} [viewW] 视口宽（CSS 像素），默认按 MAP_VIEW 方形处理
 * @param {number} [viewH] 视口高
 * @returns {[number, number]} [originX, originY]
 */
export const viewOrigin = (center, zoom, viewW = MAP_VIEW, viewH = MAP_VIEW) => {
  const scale = 2 ** zoom * TILE_SIZE
  const [wx, wy] = lngLatToWorld(center[0], center[1])
  return [wx * scale - viewW / 2, wy * scale - viewH / 2]
}

/**
 * 视口内逻辑像素 → 经纬度（地图坐标系，未做基准转换）
 * @param {number} px 相对视口左上角的像素
 * @param {number} py
 */
export const viewPixelToLngLat = (px, py, center, zoom, viewW = MAP_VIEW, viewH = MAP_VIEW) => {
  const [originX, originY] = viewOrigin(center, zoom, viewW, viewH)
  const scale = 2 ** zoom * TILE_SIZE
  return worldToLngLat((originX + px) / scale, (originY + py) / scale)
}

/**
 * 经纬度 → 视口内像素（用于摆放 pin）
 * @returns {[number, number]} [px, py]
 */
export const lngLatToViewPixel = (lng, lat, center, zoom, viewW = MAP_VIEW, viewH = MAP_VIEW) => {
  const [originX, originY] = viewOrigin(center, zoom, viewW, viewH)
  const scale = 2 ** zoom * TILE_SIZE
  const [wx, wy] = lngLatToWorld(lng, lat)
  return [wx * scale - originX, wy * scale - originY]
}

/* ------------------------------------------------------------------ *
 * GCJ-02 → WGS-84
 * ------------------------------------------------------------------ */

const A = 6378245.0
const EE = 0.00669342162296594323
const PI = Math.PI

const outOfChina = (lng, lat) =>
  lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271

const transformLat = (x, y) => {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3
  ret += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3
  ret += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3
  return ret
}

const transformLng = (x, y) => {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3
  ret += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3
  ret += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3
  return ret
}

/**
 * 高德 / 腾讯坐标（GCJ-02）→ GPS 坐标（WGS-84）
 * 境外坐标原样返回（GCJ-02 只在中国境内偏移）
 * @returns {[number, number]} [lng, lat]
 */
export const gcj02ToWgs84 = (lng, lat) => {
  if (outOfChina(lng, lat)) return [lng, lat]
  let dLat = transformLat(lng - 105, lat - 35)
  let dLng = transformLng(lng - 105, lat - 35)
  const radLat = (lat / 180) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI)
  dLng = (dLng * 180) / ((A / sqrtMagic) * Math.cos(radLat) * PI)
  return [lng - dLng, lat - dLat]
}

/**
 * 反向：WGS-84 → GCJ-02（把历史记录里的坐标摆回高德底图上时要用）
 * 用同一个偏移公式正向计算，误差在 1~2 m 量级，摆 pin 完全够
 * @returns {[number, number]} [lng, lat]
 */
export const wgs84ToGcj02 = (lng, lat) => {
  if (outOfChina(lng, lat)) return [lng, lat]
  let dLat = transformLat(lng - 105, lat - 35)
  let dLng = transformLng(lng - 105, lat - 35)
  const radLat = (lat / 180) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI)
  dLng = (dLng * 180) / ((A / sqrtMagic) * Math.cos(radLat) * PI)
  return [lng + dLng, lat + dLat]
}
