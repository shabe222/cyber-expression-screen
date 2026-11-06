/**
 * 三层语义 `plane` —— **唯一事实源**（屏上与本地预览器共用这一份）。
 *
 * 契约见 `docs/three-layer-schema.md` 第二节（冻结）：
 *
 * ```
 * hidden   Layer 0  靶子（traceImage 的产出）。**默认不给用户看**，只给自己"看"：
 *                   judge 比较 / 动画分件 / "该画哪一块"。
 * visible  Layer 1  用户看到的每一笔（我亲手画）。省略 `plane` 就是它 —— 老 payload 行为不变。
 * result   Layer 2  可选结果层（成品 / 上色 / 特效）。
 * ```
 *
 * ## 为什么单独成文件
 * 老师/契约的硬要求：**"本地看着对、屏上是另一个样"是失败**。
 * 所以判定逻辑只写一遍，两个消费者都 import 它：
 * - 屏端 `Blackboard.tsx`（React）
 * - 本地预览器 `tools/preview.mjs`（Node，直接 import 同一份源码）
 * 预览器里**不许**再出现第二个 `if (plane === 'hidden')`。
 *
 * ## 边界（不许越界）
 * - `plane` **不是** `layer`：`layer: number` 是同层内的 z 序（已有语义），
 *   两者并存、互不干扰 —— 本文件只做"这一条内容属于哪一层"，不碰绘制顺序。
 * - `plane` **不进 STYLE_KEYS、不参与 sticky 继承**（和 `surface` 同理）：
 *   它是"这条内容属于哪一层"，不是"这支笔什么手感"。
 * - **live 通道契约不动**：`plane` 只是 payload 里的一个新可选字段。
 */

/** 三层语义里的归属。省略 = `'visible'`。 */
export type Plane = 'hidden' | 'visible' | 'result';

/** 三层的固定顺序（从"只给自己"到"给用户看"）—— 判定的遍历顺序，也是 UI 的呈现顺序。 */
export const PLANES: readonly Plane[] = ['hidden', 'visible', 'result'] as const;

/** 省略 plane 时的归属：老 payload（没有这个字段）= 全部 visible。 */
export const DEFAULT_PLANE: Plane = 'visible';

/** 所有元素都在的元素类型（`plane` 是**可选**字段，省略即 visible）。 */
export type PlaneCarrier = { plane?: Plane };

/**
 * 一个元素最终归哪一层。**省略 / 写错 / 写 null 一律按 visible** ——
 * 宁可多画一笔（老行为），也不许因为一个笔误把用户的笔迹吞掉。
 */
export function planeOf(el: PlaneCarrier | null | undefined): Plane {
  const p = el?.plane;
  return p === 'hidden' || p === 'result' || p === 'visible' ? p : DEFAULT_PLANE;
}

/** 屏上 / 预览器上"此刻渲染哪几层"的设置（两种入口归一到这里）。 */
export type PlaneVisibility = {
  /**
   * 显式可见层集合。**省略 = 默认**（visible + result，hidden 不给看）。
   * 给了就按它来（`['hidden']` 只画靶子 = Layer Debugger 的"单看 hidden"）。
   */
  planes?: readonly Plane[];
  /** 调试：把 hidden 也画出来（半透明 + 红色描边）。等价于把 `'hidden'` 并进 planes。 */
  showHidden?: boolean;
};

/**
 * 设置 → 实际可见层集合（**唯一判定入口**）。
 *
 * - `resolveVisiblePlanes()`          → `['visible','result']`（默认：靶子不给用户看）
 * - `resolveVisiblePlanes({showHidden:true})` → 三层全开
 * - `resolveVisiblePlanes({planes:['hidden']})` → 只看靶子
 */
export function resolveVisiblePlanes(v: PlaneVisibility = {}): Plane[] {
  const base = v.planes ? PLANES.filter((p) => v.planes?.includes(p)) : PLANES.filter((p) => p !== 'hidden');
  if (!v.showHidden || base.includes('hidden')) return base;
  return PLANES.filter((p) => base.includes(p) || p === 'hidden');
}

/** 这一层此刻画不画。 */
export function isPlaneVisible(plane: Plane, visible: readonly Plane[]): boolean {
  return visible.includes(plane);
}

/**
 * 这一条元素此刻画不画 —— 屏端与预览器**唯一**的过滤判定（不许在调用方另写 if）。
 */
export function isPlaneShown(el: PlaneCarrier | null | undefined, visible: readonly Plane[]): boolean {
  return isPlaneVisible(planeOf(el), visible);
}

/**
 * 从查询串里读"要看哪几层"（`?plane=all` / `?plane=hidden` / `?planes=visible,result`）。
 *
 * **这是 URL 入口的唯一解析点**：屏端把 `window.location.search` 交给它，
 * 预览器把 `--query=...` 交给它 —— 两边同一份。
 *
 * - `all` / `*` / `1` / `true` → 三层全开（= 调试看靶子）
 * - `default` / 空 / 认不出的值 → 不改变默认（返回 `{}`，绝不悄悄把 hidden 打开）
 * - `visible,result` → 显式层集合（`hidden` 给了也算，debug 时就是要能单看它）
 */
export function parsePlaneQuery(search: string | null | undefined): PlaneVisibility {
  if (!search) return {};
  const q = search.startsWith('?') ? search.slice(1) : search;
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(q).get('plane') ?? new URLSearchParams(q).get('planes');
  } catch {
    return {};
  }
  if (!raw) return {};
  const tokens = raw
    .split(/[,+\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) return {};
  if (tokens.some((t) => t === 'all' || t === '*' || t === '1' || t === 'true')) return { showHidden: true };
  if (tokens.every((t) => t === 'default' || t === 'auto')) return {};
  const planes = PLANES.filter((p) => tokens.includes(p));
  // 一个都不认识（拼错、或者给了别的东西）：不动默认，别把靶子悄悄打开
  return planes.length ? { planes } : {};
}

/* ────────────────────── 调试渲染（hidden 怎么画出来）────────────────────── */

/**
 * 调试可见时 hidden 的**不透明度**（半透明）。
 * 让靶子"能看清形状、但一眼知道它不是给用户看的笔迹"。
 */
export const PLANE_DEBUG_OPACITY = 0.4;

/**
 * 调试可见时 hidden 的**红色描边**：不是给笔迹改色，而是给它整个剪影描一圈红边。
 *
 * 为什么用滤镜（而不是把每条 path 的 stroke 改成红色）：
 * - 元素可能是文字、可能是 group、可能 `fill` 盖住 stroke —— 逐 path 改色既漏又改坏内容；
 * - 滤镜只看**光栅化后的 alpha**，任何元素类型都成立，且内容本身一个字节不改。
 *
 * 实现：`SourceAlpha` 放大 → 染红 → 与 `SourceGraphic` 合起来 = 红色剪影 + 原内容。
 * 外扩量固定 **5 用户单位**（板面坐标，1600×1000 的板子上一眼看得见，又不会糊成一团）。
 */
export const PLANE_DEBUG_STROKE_COLOR = '#ff3b3b';

/** 调试滤镜的 id（板面 defs 里定义，屏端与预览器共用同一个字符串）。 */
export const PLANE_DEBUG_FILTER_ID = 'bbPlaneDebug';

/**
 * 调试滤镜定义 —— **必须与 `surfaceDefs()` 的输出一起放进 `<defs>`**。
 * 调用方（Blackboard.tsx / preview.mjs）都写 `surfaceDefs(...) + planeDebugDefs()`。
 */
export function planeDebugDefs(): string {
  const { r, g, b } = hexToRgb01(PLANE_DEBUG_STROKE_COLOR);
  const grow = 5;
  return [
    `<filter id="${PLANE_DEBUG_FILTER_ID}" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB">`,
    `<feMorphology in="SourceAlpha" operator="dilate" radius="${grow}" result="grow"/>`,
    `<feFlood flood-color="${PLANE_DEBUG_STROKE_COLOR}" flood-opacity="1" result="red"/>`,
    `<feComposite in="red" in2="grow" operator="in" result="edge"/>`,
    `<feMerge>`,
    `<feMergeNode in="edge"/>`,
    `<feMergeNode in="SourceGraphic"/>`,
    `</feMerge>`,
    `</filter>`,
    // 兜底：万一某台浏览器不给 `<g filter>` 里的 feMorphology 外扩，红边也还能靠这层细描边看出来
    `<style>`,
    `[data-plane="hidden"] .bbPlaneDebugEdge{fill:none;stroke:${PLANE_DEBUG_STROKE_COLOR};stroke-width:3;stroke-linejoin:round}`,
    `</style>`,
  ].join('');
}

/** `#rrggbb` → 0..1 三通道（`feFlood` 的 flood-color 用得上，这里只为把色值写在一处） */
function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  const h = m ? m[1] : 'ff3b3b';
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

/** hidden 元素调试包装的公共属性（屏端与预览器共用同一组值，避免"本地半透明 0.3、屏上 0.5"） */
export const PLANE_DEBUG_ATTRS = {
  'data-plane': 'hidden',
  'data-plane-debug': '1',
  opacity: PLANE_DEBUG_OPACITY,
  filter: `url(#${PLANE_DEBUG_FILTER_ID})`,
} as const;
