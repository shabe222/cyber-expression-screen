/**
 * 填充缝合（消掉相邻填充之间的"碎玻璃"缝）—— **唯一事实源**，屏端与本地预览器共用。
 *
 * ## 病根
 * 多区域平色图形里，相邻的两个填充**各自抗锯齿**：共享边界上两边各覆盖半格，
 * 叠加后覆盖率只有 ~0.75 ⇒ **亮玻璃底就从这条发丝缝里透出来**，整只角色像裂开的贴纸。
 * 凡是"按色分区 / 按部件分区"的作画（traceImage 的逐色矢量、Phase 1 的大区域平色、
 * 以后的分层上色）都会被它毁掉，所以这是**渲染层的通用能力**，不是某个 payload 的补丁。
 *
 * ## 两步（缺一不可）
 * ① **同色极细描边**（`stroke = fill`，宽度 `fillSeam` 板面单位）：把每块填充的边缘
 *    向外撑 `宽度/2`，于是共享边界上两边的覆盖率都到 1 ⇒ 缝被盖住。
 *    同时把这一块包进 `<g opacity=填充透明度>` 里、内部用**不透明**颜色画 ——
 *    否则描边与填充重叠的那一圈会叠加变浓（半透明铺色 0.5 会变 0.75）。
 * ② **把描边裁到"所有填充的并集"**（`clipPath` 里放多条 path 天然就是并集）：
 *    只靠 ① 的话，描边会**把外轮廓也撑大** `宽度/2`，而且会**把真正的镂空填掉**
 *    （发丝之间、手臂与身体之间的负空间）。
 *    裁到并集之后：轮廓还是原来那个并集、镂空还是镂空，只有"图形内部"的缝被填上。
 *    附带好处：外轮廓由 clip **统一抗锯齿一次**，比"N 个区域各自抗锯齿再叠加"更干净。
 *
 * ## 实测（out/seams/，白底探针把"缝"变成可数的白线）
 * | 夹具 | 缝合前 | 缝合后（并集裁剪） |
 * |---|---|---|
 * | Phase 1 的 17 个大区域平色（**边界互相咬合**） | 284 缝像素 | **69（−76%）** |
 * | traceImage 的 10 个逐色区（**边界不咬合**） | 453 | 553（没改善） |
 *
 * ⇒ **并集裁剪只能缝"几何上真的挨着"的边界**。traceImage 的逐色多边形是
 * **各自独立简化**的（RDP 各做各的），相邻色区的边界根本不重合，缝宽可达 6 板面单位 ——
 * 那些缝在**并集之外**，裁剪就永远够不到它们。想填它们只有"让描边长到并集外面"，
 * 代价是**外轮廓胖一圈**（实测宽 8 单位时图形面积 +26%，发丝之间的镂空也被填掉）——
 * 那是拿"不像"换"没缝"，不划算。
 * **结论：那是生产者的问题（边界要共享/要并集），不是渲染层的。**
 * 渲染层保证的是：**凡是几何挨着的边界，一律不再漏底**，且**一点副作用都没有**。
 *
 * ## 为什么不用别的办法
 * - 只用 `stroke=fill` 不裁剪：外轮廓会长、镂空会被填（实测面积 +6~26%，见上表）。
 * - `filter` + `feMorphology` 外扩：形态学只处理 alpha，补不出**颜色**；
 *   而且 feMorphology 在 premultiplied/non-premultiplied 上的行为各家实现有差异。
 * - 让生产者保证共享边界：那是 layerkit/penkit 的事（本任务不许动它们），
 *   渲染层也不该假设 —— 但这条是 traceImage 那类"碎玻璃"的**真正解法**，已上报。
 */

/** 并集裁剪的 id（屏端与预览器同一个；与 glass.ts 里那些固定 id 的用法一致） */
export const FILL_UNION_CLIP_ID = 'bbFillUnion';

/** `fillSeam` 允许的最大宽度（板面单位）—— 别让一个笔误把几何撑爆 */
export const FILL_SEAM_MAX = 8;

/** `fillSeam: true` 时用的默认宽度（板面单位）。4 单位 ⇒ 向外撑 2 单位 ≈ 1.4 设备像素 */
export const DEFAULT_FILL_SEAM = 4;

/**
 * 归一 `fillSeam`：省略 / `false` / `null` / `0` / 负数 / NaN → `0`（= 关，老 payload 标记不变）；
 * `true` → 默认宽度；数字 → 夹在 `[0, FILL_SEAM_MAX]`。
 *
 * 屏端（`Blackboard.tsx`）与预览器（`tools/preview.mjs`）都走这一个函数，
 * 免得"本地看着对、屏上是另一个样"。
 */
export function normalizeFillSeam(v: number | boolean | null | undefined): number {
  if (v === undefined || v === null || v === false) return 0;
  const n = v === true ? DEFAULT_FILL_SEAM : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(FILL_SEAM_MAX, n);
}

/**
 * 并集裁剪的定义串 —— **必须与 `surfaceDefs()` / `planeDebugDefs()` 一起放进 `<defs>`**。
 *
 * `ds` 是所有**填充**元素的路径数据（按绘制顺序）。
 * 没有填充（或没开缝合）时返回空串，调用方就不要插这个 `<defs>`。
 */
export function fillUnionDefs(ds: readonly string[]): string {
  const paths = ds.filter((d) => typeof d === 'string' && d.length > 0);
  if (!paths.length) return '';
  return `<clipPath id="${FILL_UNION_CLIP_ID}" clipPathUnits="userSpaceOnUse">${paths
    .map((d) => `<path d="${d}"/>`)
    .join('')}</clipPath>`;
}
