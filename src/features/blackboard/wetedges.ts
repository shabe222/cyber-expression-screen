/**
 * **湿边**（wet edge）—— 让平色区域读起来像"用蘸饱的笔涂的"而不是"切出来的色块"。
 *
 * ## 为什么这条是材料上忠实的（不是装饰）
 * 真墨落在玻璃上，**边缘会聚一圈略深的色**（墨在边界处堆积、干燥后比中间实）。
 * 这与"这块玻璃上的笔是白板笔/玻璃笔"是同一套材料语言（见 glass.ts 顶部那段）。
 * 顺带还有一个副作用是好的：**它也能盖住相邻填充之间的缝**（task-7 那条）。
 *
 * ## 做法
 * 在填充**之上**再描一圈：`stroke = 同色加深 12%`、宽 `wetEdge` 板面单位、柔和的圆角接头。
 * - 用**独立的一条 path**（`fill="none"`）而不是把 stroke 挂在填充那条 path 上：
 *   填充那条 path 上的 stroke 已经被**缝合**用掉了（同色、宽 `seam`，负责盖缝），
 *   一条 path 挂不了两种 stroke。
 * - 描边是**居中**在轮廓上的 ⇒ 一半在里、一半在外：外半圈给出"边"，里半圈给出"墨在边上更实"。
 * - 透明度与填充一起由外层 `<g opacity>` 施加一次（和缝合同一套），
 *   所以半透明铺色（fillOpacity 0.5）也不会把边叠成双倍浓度。
 *
 * ## 为什么不写死成默认
 * 观感变化明显（实测对照图见 out/onglass/wetedge-compare.png）——
 * 这是**风格选择**，必须能一键关掉。所以它是**板面级 style 字段**（`wetEdge`），
 * 与 `surface` / `fillSeam` / `contentOnGlass` 同类：**不进 STYLE_KEYS、不参与 sticky**。
 *
 * ## 什么时候开 / 什么时候关
 * - **开**：多区域平色作画（Phase 1 那种按部件分区的色块）—— 边让每块"有笔"，也让相邻色块的分界更清楚。
 * - **关**：① 细腻线条为主、色块很少的稿子（边会显得脏）；
 *   ② 想要"干净平涂/扁平插画"的味道时；③ 相邻色块本来就同色系、边会读成描线。
 */

/** `wetEdge: true` 时用的默认宽度（板面单位）—— 1.5 单位 ≈ 1 设备像素，细到像"墨边"而不是"描线" */
export const DEFAULT_WET_EDGE = 1.5;

/** 边比填充深多少（0.88 = 加深 12%） */
const WET_EDGE_DARKEN = 0.88;

/** 边本身的浓度（乘在填充透明度之上）—— 太高会读成描线，太低看不见 */
const WET_EDGE_OPACITY = 0.55;

/** `wetEdge` 允许的最大宽度（板面单位） */
export const WET_EDGE_MAX = 6;

/**
 * 归一 `wetEdge`：省略 / `false` / `null` / `0` / 负数 / NaN → `0`（= 关，老 payload 一个字节不变）；
 * `true` → 默认宽度；数字 → 夹在 `[0, WET_EDGE_MAX]`。
 * 屏端（`Blackboard.tsx`）与预览器（`tools/preview.mjs`）都走这一个函数。
 */
export function normalizeWetEdge(v: number | boolean | null | undefined): number {
  if (v === undefined || v === null || v === false) return 0;
  const n = v === true ? DEFAULT_WET_EDGE : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(WET_EDGE_MAX, n);
}

/**
 * `#rrggbb` 按比例压暗（色相不变）。认不出的颜色（rgba()/具名色）返回原串 ——
 * 那就退化成"同色描边"，仍然能盖缝，只是没有"湿边"那点深色。
 */
export function darkenHex(hex: string | undefined, k: number): string | undefined {
  if (!hex) return undefined;
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const h = m[1];
  const c = [0, 2, 4].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) * k))));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * 湿边的颜色与透明度（屏端与预览器共用同一份判定）。
 * `width <= 0` 或没有填充色时返回 `null`（= 不画边）。
 */
export function wetEdgeStyle(
  fill: string | undefined,
  width: number,
): { color: string; opacity: number; width: number } | null {
  if (!(width > 0) || !fill) return null;
  return { color: darkenHex(fill, WET_EDGE_DARKEN) ?? fill, opacity: WET_EDGE_OPACITY, width };
}
