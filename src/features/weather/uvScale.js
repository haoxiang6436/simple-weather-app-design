/**
 * 紫外线强度等级。
 * 按 WHO《全球紫外线指数指南》的五档划分：
 *   0–2 最弱 · 3–5 弱 · 6–7 中 · 8–10 强 · ≥11 很强
 * 接口 uvIndexMax 的取值范围是 [0, 15]，11 以上统一按「很强」处理。
 *
 * 为什么单独成文件：卡片显示的是等级纯文本（「弱」），而角标要判的是等级的强弱顺序 ——
 * 后者不能把「弱 → 最弱」当成「6 → 1」的数值差，只能比等级在五档里的位置。
 * 两处用同一张表，放在组件里就注定要抄一份。
 */
export const UV_LEVELS = [
  { max: 2, level: '最弱', advice: '紫外线很弱，正常外出无需特别防护。' },
  { max: 5, level: '弱', advice: '紫外线较弱，外出可涂 SPF15+ 防晒霜。' },
  { max: 7, level: '中', advice: '紫外线中等，外出建议涂 SPF30+ 防晒霜、戴遮阳帽。' },
  { max: 10, level: '强', advice: '紫外线强，10–16 点减少户外暴晒，做好防晒。' },
  { max: Infinity, level: '很强', advice: '紫外线很强，尽量避免正午外出，注意遮阳防晒。' },
]

/**
 * 把一个原始指数值翻成等级。
 * @param {number|string|null|undefined} raw
 * @returns {{ index: number, ordinal: number, level: string, advice: string } | null}
 *   ordinal 是等级在五档里的位置（0 = 最弱）；角标只比它，不碰 index。
 *   没有数据 / 不是数字时返回 null，由调用方决定显示「—」还是干脆不显示角标。
 */
export function uvLevel(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const index = Number(raw)
  if (!Number.isFinite(index)) return null
  const found = UV_LEVELS.findIndex((item) => index <= item.max)
  const ordinal = found === -1 ? UV_LEVELS.length - 1 : found
  return {
    index,
    ordinal,
    level: UV_LEVELS[ordinal].level,
    advice: UV_LEVELS[ordinal].advice,
  }
}
