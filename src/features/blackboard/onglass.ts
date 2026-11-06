/**
 * 内容与玻璃的关系 —— **前表面反射**（让内容像"写在玻璃上"而不是"贴上去"）。
 *
 * ## 病根（task-7 第 8 节的评估，Lead 批了就在这里做）
 * `glass.ts` 的 `glassLayers()` 是**一整叠**画完才轮到内容的：
 * ```
 * 景色 → 玻璃本体 → sheen → 反光池 → 暗角 → 磨砂 → 内边缘 → 外沿 → 内圈高光  → 【整叠玻璃画完】→ boardContent
 * ```
 * ⇒ **玻璃的反射画在内容下面**。而真实玻璃的反射（前表面那一次）必须在"里面的东西"**之上** ——
 * 内容写在玻璃**背面**，光先从前表面反一次，再穿过玻璃看到内容。反射在下面，内容就永远像贴纸。
 *
 * ## 做法（纯加一层，完全不碰 glass.ts）
 * 在内容**之上**再画一次**同一块板面、同一条 sheen 渐变**，裁在板面里：
 * - 用 `surface.plate` 的数据自己算板面矩形（与 glass.ts 的 `plateRect()` 同式），
 *   于是反射的形状与下面那一层**完全对齐**（歪一点就会看成两层重影）；
 * - 渐变也用 `surface.plate.sheen` 的同两个色标 ⇒ 上下的反射**是同一束光**；
 * - `mix-blend-mode: soft-light`：**调制**而不是**遮盖** ——
 *   正常 alpha 叠加会把深色墨迹洗白（0.18 → 0.39，整块发灰），soft-light 只让亮处略微提亮、
 *   暗处略微压暗，**保住内容自己的对比**（"舒服"那条硬要求）。
 * - 强度可调（`contentOnGlass`），默认偏淡：这是"极轻的沉浸感"，不是给玻璃再加一层膜。
 *
 * ## 为什么自己算板面矩形、自己建渐变，而不是复用 glass.ts 的 `bbPlateClip` / `bbPlateSheen`
 * 那两条 id 只在**玻璃板**的 defs 里存在（`dark` 板没有）。引用一个不存在的 clipPath / 渐变，
 * 元素会**整个不渲染**（SVG 1.1 对无效 IRI 引用的处理）—— 不能把新功能挂在那上面。
 * 这里自己建（数据仍来自 `resolveSurface()` 的结果），与 glass.ts 解耦、也不会互相踩 id。
 */

import type { BoardSurface, SurfaceSize } from './glass';

/**
 * ## ★ task-9 第 2 条（"深色填充吃板面的光"）**试过两种做法，都回退了**（实测记录见 out/onglass）
 *
 * **做法 A：`mix-blend-mode: multiply`**（任务书给的那条）—— **结构性堵死**：
 * 填充都在 `<g filter="url(#bbPenFill)">` 里，而 filter 会造成**隔离** ⇒
 * 组内元素的 mix-blend-mode 只能跟组内的底混，跟组**外面**的板面混不到。
 * 实测：给 8 个深色填充加 multiply，**只有 0.5% 的像素变了、Δluma 0.0000** —— 等于没做。
 * 要让它生效必须把渲染分组按混合模式拆开（现在的"按滤镜档分组"有实测性能理由：
 * 799 个带滤镜的元素逐帧动只有 ~7fps，归到 ≤5 层后 60fps），代价是分组翻倍。
 * 而且方向也不对：multiply 让颜色变**暗**（近黑的鞋 0.065 × 板面 0.7 = 0.045，更黑而不是吃光），
 * 浅色填充乘上去直接变灰（白围裙 0.99 → 0.70）。
 *
 * **做法 B：让深色墨迹极轻微半透明（α=0.96），板面的光按真实合成透上来** —— 有效，
 * 但**代价是内容的对比度**：实测"深色内容 vs 紧邻板面"的落差掉了
 * **4.1%（鞋 0.634→0.608）与 3.3%（裙 0.671→0.649）**，而且肉眼可见深色裙摆/尾巴变浅、
 * 整块画丢掉了"重量"。任务书明写"不许为了看起来更融合牺牲可读性" ⇒ **回退**。
 *
 * **根因（为什么这一条本质上难做）**：这块板上的调色板是**两极**的 ——
 * 8 个深色（luma 0.065~0.181）+ 9 个浅色（0.904~0.987），**没有中间调**。
 * 半透明对深色是"洗淡"、对浅色是"弄脏"，**没有一个安全的落点**。
 * 想让内容"吃光"，真正有效的是**前表面反射**（`glassFrontLayer`）——
 * 它按位置调制、对深色浅色一视同仁，而且实测对比度几乎不掉（最大 −0.004）。
 */

/** `contentOnGlass: true` 时用的默认强度（0~1） */
export const DEFAULT_CONTENT_ON_GLASS = 1;

/**
 * 反射光带（"玻璃上的一道反光"）的峰值 alpha。
 *
 * 为什么除了板面自己的 sheen 还要这一条：**sheen 的几何是"左上角一团光"**
 * （渐变 42% 处就衰减到 0.02），实测它只覆盖板面左上约 40%，
 * 整块板读不出"有一层反射在内容前面"。加一条柔边的**斜向光带**之后，
 * 反射有了**形状**（一条带子），眼睛才认得出它是反射 —— 而形状正是"在里面"的线索。
 *
 * 数值是实测调的：0.45 时内容对比度**不掉**（见 out/onglass 的对照表），
 * 再往上就会把深色内容洗淡（"舒服"那条硬要求）。
 */
const STREAK_PEAK_ALPHA = 0.45;

/** 前表面反射的裁剪 id（屏端与预览器同一个；自己建，不依赖 glass.ts 的 id） */
export const GLASS_FRONT_CLIP_ID = 'bbGlassFrontClip';
/** 前表面反射（板面 sheen）的渐变 id（同上） */
export const GLASS_FRONT_SHEEN_ID = 'bbGlassFrontSheen';
/** 前表面反射（斜向光带）的渐变 id（同上） */
export const GLASS_FRONT_STREAK_ID = 'bbGlassFrontStreak';

/**
 * 归一 `contentOnGlass`：省略 / `false` / `null` / `0` / 负数 / NaN → `0`（= 关，老 payload 不变）；
 * `true` → 默认强度；数字 → 夹在 `[0, 1]`。屏端与预览器共用这一个函数。
 */
export function normalizeContentOnGlass(v: number | boolean | null | undefined): number {
  if (v === undefined || v === null || v === false) return 0;
  const n = v === true ? DEFAULT_CONTENT_ON_GLASS : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n);
}

/**
 * 板面矩形 —— **与 glass.ts 的 `plateRect()` 同式**（那边是模块私有函数，没导出）。
 * 数据全部来自 `resolveSurface()` 的结果，所以只要那个式子不变，这里就不会漂。
 */
export function plateRectOf(s: BoardSurface, size: SurfaceSize) {
  const pad = s.plate.pad;
  return { x: -pad, y: -pad, w: size.w + pad * 2, h: size.h + pad * 2, rx: s.plate.radius };
}

/** 前表面反射需要的 defs（裁剪 + 两条渐变）—— 与 `surfaceDefs()` 一起放进 `<defs>` */
export function glassFrontDefs(s: BoardSurface, size: SurfaceSize): string {
  const p = plateRectOf(s, size);
  const sh = s.plate.sheen;
  const a = STREAK_PEAK_ALPHA;
  return (
    `<clipPath id="${GLASS_FRONT_CLIP_ID}"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.rx}"/></clipPath>` +
    // ① 板面自己那条 sheen：上下同一条渐变 ⇒ 上下的反射是**同一束光**，不会看成两层重影
    `<linearGradient id="${GLASS_FRONT_SHEEN_ID}" x1="0" y1="0" x2="0.7" y2="1">` +
    `<stop offset="0%" stop-color="${sh.from}"/><stop offset="42%" stop-color="${sh.to}"/>` +
    `<stop offset="100%" stop-color="rgba(255,255,255,0)"/></linearGradient>` +
    // ② 一条柔边的斜向光带：给反射一个**形状**（否则整块板只有左上角一团光，读不出"前面有玻璃"）
    `<linearGradient id="${GLASS_FRONT_STREAK_ID}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="rgba(255,255,255,0)"/>` +
    `<stop offset="32%" stop-color="rgba(255,255,255,${a})"/>` +
    `<stop offset="60%" stop-color="rgba(255,255,255,${(a * 0.55).toFixed(3)})"/>` +
    `<stop offset="100%" stop-color="rgba(255,255,255,0)"/></linearGradient>`
  );
}

/**
 * 前表面反射层 —— **放在内容之后**（DOM 里在 `boardContent` 后面）。
 * `strength <= 0` 返回空串（老 payload 一个字节都不多）。
 */
export function glassFrontLayer(s: BoardSurface, size: SurfaceSize, strength: number): string {
  if (!(strength > 0)) return '';
  const p = plateRectOf(s, size);
  const rect = `x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.rx}"`;
  const sheen = `<rect ${rect} fill="url(#${GLASS_FRONT_SHEEN_ID})"/>`;
  // 光带：一条 260 板面单位高、柔边、斜 24° 的带子；转轴取板面中心，位置在板面上半部
  const streak =
    `<g transform="rotate(-24 ${size.w / 2} ${size.h / 2})">` +
    `<rect x="${-size.w * 0.3}" y="${size.h * 0.1}" width="${size.w * 1.6}" height="${size.h * 0.26}" fill="url(#${GLASS_FRONT_STREAK_ID})"/>` +
    `</g>`;
  return (
    `<g clip-path="url(#${GLASS_FRONT_CLIP_ID})" style="mix-blend-mode:soft-light" opacity="${strength}" pointer-events="none">` +
    sheen +
    streak +
    `</g>`
  );
}
