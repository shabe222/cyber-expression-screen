/**
 * 黑板渲染层。
 *
 * 只做三件事：把后端下发的元素画成粉笔字、把新元素"写"出来、把被擦的元素"擦"掉。
 * 不做几何计算、不发请求、不持有业务状态 —— 因此可以同时嵌进对话区和通话面板。
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BlackboardElement, BlackboardLoop, BlackboardOp, BlackboardScript, BlackboardStep, BlackboardStyle, Pt, Rect } from './types';
import {
  DEFAULT_BOARD_SIZE,
  DEFAULT_PACE_MS,
  MAX_NARRATION_MS,
  MIN_NARRATION_MS,
  NARRATION_PER_CHAR_MS,
} from './types';
/** 填充缝合（消掉相邻填充之间的"碎玻璃"缝）：判定与定义串都在 seam.ts（屏端/预览器共用） */
import { FILL_UNION_CLIP_ID, fillUnionDefs, normalizeFillSeam } from './seam';
/** 内容与玻璃的关系（玻璃前表面反射）：见 onglass.ts —— 屏端与预览器共用同一份生成器 */
import { glassFrontDefs, glassFrontLayer, normalizeContentOnGlass } from './onglass';
/** 湿边（平色区域边缘那圈略深的色）：见 wetedges.ts */
import { normalizeWetEdge, wetEdgeStyle } from './wetedges';
import { arcPath, catmullRomPath, charJitter, layoutLine, polylineToPath, widthOutline, wobbleEllipse, wobblePath, wobbleSamples } from './chalk';
import { brushOf, hasPressure, normalizeElement, pointPressure, pressureFactor } from './brushes';
/**
 * 板面材料（玻璃 + 背后的景色 + 这支笔）全部来自 glass.ts ——
 * 板面视觉不在这里写死，payload 的 `style.surface` 就能换（见 glass.ts 顶部）。
 */
import { filterTierOf, guardColor, inkColor, inkOf, resolveSurface, strokeFilterFor, surfaceDefs, surfaceLayers, tierFilter } from './glass';
import type { FilterTier, InkFilters } from './glass';
/**
 * 三层语义（`hidden` 靶子 / `visible` 用户的笔迹 / `result` 结果层）——
 * 判定逻辑全在 plane.ts，屏端与本地预览器**共用同一份**（契约要求，见 docs/three-layer-schema.md 第二节）。
 */
import { isPlaneShown, parsePlaneQuery, PLANE_DEBUG_ATTRS, planeDebugDefs, planeOf, resolveVisiblePlanes } from './plane';
import type { Plane } from './plane';
import { prefersReducedMotion } from '../../shared/motion';
import styles from './Blackboard.module.css';

/** 信封级 sticky style 管的字段（元素显式写了就覆盖并粘住）。
 *  **刻意不含 fill/fillOpacity**：填充粘住会让后面不写 fill 的 stroke 被填成色块（踩过）。 */
const STYLE_KEYS = ['brush', 'color', 'width', 'layer', 'chalkDensity', 'opacity'] as const;
/** 这几个字段由**笔刷预设**说了算：元素自己声明了笔刷时，sticky 不覆盖它们 */
const BRUSH_OWNED_KEYS = new Set<string>(['width', 'chalkDensity', 'opacity']);

const CHALK_FONT = '"KaiTi", "楷体", "STKaiti", "Kaiti SC", "Microsoft YaHei", sans-serif';
/** 落笔/擦拭动画的时长，与 CSS 里保持一致；用于判断"这一批动作做完了" */
const WRITE_ANIM_MS = 520;
const WIPE_ANIM_MS = 560;
const GHOST_TTL_MS = 700;
/** 一句说完了喘口气再写下一句。太紧会像在念稿，太松会让人等。 */
const STEP_BREATH_MS = 260;
/** 上一句话淡出所用的时间，与 CSS 里的 bbCaptionOut 一致 */
const CAPTION_EXIT_MS = 420;

/** 这句大概要说多久：按字数算，两头封住 */
function spokenMs(sentence: string): number {
  return Math.min(MAX_NARRATION_MS, Math.max(MIN_NARRATION_MS, sentence.length * NARRATION_PER_CHAR_MS));
}

/** 这一节停留多久：话要说，笔要落完，取更长的那个 */
function stepHoldMs(step: BlackboardStep, paceMs: number): number {
  const drawing = step.ops.length ? (step.ops.length - 1) * paceMs + WRITE_ANIM_MS : 0;
  const spoken = step.narration ? spokenMs(step.narration) : 0;
  return Math.max(drawing, spoken) + STEP_BREATH_MS;
}

/** 这一节的笔什么时候停 —— 通话模式据此决定什么时候可以打断 */
function stepDrawingMs(step: BlackboardStep, paceMs: number): number {
  return step.ops.length ? (step.ops.length - 1) * paceMs + WRITE_ANIM_MS : 0;
}

/**
 * 把一串 ops 排成「什么时候执行哪一条」。
 *
 * 两种节奏：
 * - 默认按 op 累进：`at` 逐条累加 `op.paceMs ?? basePace`
 * - 逐帧（给了 frameMs 且 ops 带 frame）：**同一帧的 ops 同时执行**，
 *   每帧推进 `frameMs` —— 逐帧笔迹动画靠它精确控速（而不是 35 笔 × 55ms 一帧）
 */
function planOps(
  ops: BlackboardOp[],
  basePace: number,
  frameMs?: number,
): { items: { op: BlackboardOp; at: number }[]; total: number } {
  const items: { op: BlackboardOp; at: number }[] = [];
  const framed = typeof frameMs === 'number' && frameMs > 0 && ops.some((o) => o.frame != null);

  if (framed) {
    let at = 0;
    let lastFrame: number | null = null;
    for (const op of ops) {
      const f: number = op.frame ?? lastFrame ?? 0;
      if (lastFrame !== null && f !== lastFrame) at += frameMs as number;
      lastFrame = f;
      items.push({ op, at });
    }
    return { items, total: at + (frameMs as number) };
  }

  let cursor = 0;
  for (const op of ops) {
    items.push({ op, at: cursor });
    cursor += op.paceMs ?? basePace;
  }
  return { items, total: cursor };
}

/** loop 配置归一化：false/省略 → null（播一次就停）；true → 全区间；对象 → 补默认值并夹进合法范围 */
function normalizeLoop(
  loop: BlackboardLoop | undefined,
  opCount: number,
): { fromOp: number; toOp: number; gapMs: number; frameMs?: number } | null {
  if (!loop || opCount <= 0) return null;
  if (loop === true) return { fromOp: 0, toOp: opCount - 1, gapMs: 0 };
  const fromOp = Math.max(0, Math.min(opCount - 1, loop.fromOp ?? 0));
  const toOp = Math.max(fromOp, Math.min(opCount - 1, loop.toOp ?? opCount - 1));
  return { fromOp, toOp, gapMs: Math.max(0, loop.gapMs ?? 0), frameMs: loop.frameMs };
}

/** 正在讲的那一句。key 只用来区分前后两句，让交接时两句能同时待在 DOM 里。 */
export type Narration = { text: string; key: number };

/** 此刻在说的那句 + 刚让位的那句。要两句都在手上，交接处才不空一拍。 */
export type BoardNarration = { saying: Narration | null; leaving: Narration | null };

type Props = {
  script: BlackboardScript | null;
  /** 元素之间落笔的间隔，越大越像一笔一笔写 */
  paceMs?: number;
  /**
   * 要不要把这一板"当场写出来"。
   *
   * false 用于翻回来的历史（刷新页面、切线程、通话中途进来）：直接给最终板面。
   * 边讲边画是当场发生的事 —— 把上一轮从头再演一遍，那不是回放，那是假直播，
   * 而且这时候人根本没在讲。
   */
  animate?: boolean;
  /** 板面是否还在一批动作里 —— 通话模式用它来决定此时不打断。
   *  分节模式下"一批"= 一节（一句话的几笔），句间让位，笔不停在半画上。 */
  onBusyChange?: (busy: boolean) => void;
  /**
   * 正在讲的那一句交给谁画。
   *
   * 不给的时候板子自己把它压在板面下沿。给了就由调用方放到板子上方的说话区 ——
   * 板面是粉笔的地盘，字盖上去会挡住刚写的那一笔。
   */
  onNarrationChange?: (narration: BoardNarration) => void;
  className?: string;
  /* ---------- 人类作画（B2「你画」）---------- */
  /** 自由手绘模式：接管 pointer 事件，在板上直接拖出一笔 */
  drawMode?: boolean;
  /** 一笔画完的回调。坐标**已经是板面坐标**，调用方直接拿去当元素几何用 */
  onStroke?: (points: Pt[]) => void;
  /**
   * 增量板面操作：只在数组**变长**时执行新增的那一段（不重放旧的）。
   * 人类笔迹这类"边画边追加"的场景用它 —— 走 script 会重跑整份脚本。
   */
  appendOps?: BlackboardOp[];
  /**
   * 逐帧动画层（骨骼动画用）：每帧整批换掉，按 id 复用 DOM，**不进 ops 通道**。
   *
   * 为什么不走 update ops：ops 通道每应用一个元素都会 markFresh（落笔动画 + 一个定时器）。
   * 每秒 30 帧 × 二十来个元素 = 每秒几百个定时器、且每一帧都重放"落笔"动画（视觉上是永远画不完）。
   * 这一层只做"同一批 id 的整体重绘"，元素不会无限增长，也不打扰板上的其他内容。
   */
  overlayElements?: BlackboardElement[];
  /**
   * 逐帧动画的**每帧变化量**：`id → transform`。
   *
   * 骨骼动画的几何（局部坐标）是不变的，每帧只有 transform 在变 ——
   * 所以这里不走 React 重渲染，而是直接写 DOM 属性（见 overlayTransforms 的 effect）。
   * 实测：86 个部件每帧重建 React 元素只有 20fps，只改属性可以到 40fps 以上。
   */
  overlayTransforms?: Record<string, string>;
  /**
   * 板面是不是在播（含循环播放）。
   * 屏上底栏把"板面在播"和"骨骼在播"统一成一个 playing 概念，用户才能一眼看出它在放。
   */
  onPlayingChange?: (playing: boolean) => void;
  /**
   * 立刻停：停掉循环与所有待执行定时器，**但不清板**。
   * Live payload 的 `stop` 用它 —— 循环要能马上停，且板面停在当前那一帧。
   */
  halt?: boolean;
  /**
   * 滤镜挂哪一层：
   * - `'layer'`（默认）= 同档元素合成一层挂一次 —— 性能档。实测 799 个带滤镜的元素
   *   逐帧动只有 ~7fps；归到 ≤5 层后 60fps
   * - `'element'` = 每个元素各挂一次（老行为）—— 质感档，用于出静态成图/对照
   */
  filterMode?: 'layer' | 'element';
  /**
   * 调试：把 `hidden` 层（Layer 0 靶子）也画出来 —— **半透明 + 红色描边**。
   *
   * 默认 `false`：靶子不给用户看（老师裁定的铁律）。只有"我要核对靶子"时才打开，
   * 显式写 true 优先级最高（压过 `visiblePlanes` 与 URL 参数）。
   * 另一个入口是 URL 查询参数 `?plane=all`（解析在 plane.ts 的 parsePlaneQuery，唯一一份）。
   */
  showHidden?: boolean;
  /**
   * 显式指定"此刻渲染哪几层"（Layer Debugger 用：`['hidden']` = 只看靶子）。
   * 省略 = 默认（visible + result，hidden 不给看）；显式给了就按它来（与 `showHidden` 取并集）。
   */
  visiblePlanes?: readonly Plane[];
};

const baseStroke = {
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none' as const,
};

/**
 * 一笔墨：一层更宽更淡的"晕"（粉笔是灰、玻璃笔是渗开的墨）+ 一层带毛边/浓淡的实笔。
 * 里面到底是什么质感由 `ink` 决定 —— 也就是由**板面材料**决定（见 glass.ts）。
 */
function InkStroke({
  make,
  color,
  width,
  fresh,
  delay = 0,
  ink,
  filterId,
  dust = true,
}: {
  make: (seedOffset: number) => string;
  color: string;
  width: number;
  fresh: boolean;
  delay?: number;
  /** 这块板上的笔（滤镜 id 与晕的宽度/浓度） */
  ink: InkFilters;
  /** 浓度对应的描边滤镜（见 strokeFilterFor）；分组渲染时传 '' */
  filterId?: string;
  /** 要不要底下那层晕。逐帧动画里关掉（省一遍滤镜光栅化） */
  dust?: boolean;
}) {
  const d = make(0);
  if (!d) return null;
  const stroke = (
    <path
      d={d}
      {...baseStroke}
      stroke={color}
      strokeWidth={width}
      filter={filterId ? `url(#${filterId})` : undefined}
      pathLength={1}
      className={fresh ? styles.drawIn : undefined}
      style={fresh ? { animationDelay: `${delay}s` } : undefined}
    />
  );
  // 逐帧动画层不打晕：直接返回这一条 path，少一层 <g>
  // （骨骼动画几十个部件，每帧都在动，节点数直接决定帧率）
  if (!dust || !ink.dust) return stroke;
  return (
    <g>
      <path
        d={make(733)}
        {...baseStroke}
        stroke={color}
        strokeWidth={width * ink.dust.widthScale}
        opacity={ink.dust.opacity}
        filter={`url(#${ink.dust.id})`}
      />
      {stroke}
    </g>
  );
}

/**
 * 滤镜档位与"元素归哪一档"都搬到 glass.ts 了 —— 本地预览器要按**同一套**规则分组，
 * 否则"本地图"和"屏上的板"就不是一回事（各挂各的滤镜，质感完全不同）。
 */

/** 元素级变换：先 transform（骨骼摆位），再绕包围盒中心 rotation */
function transformOf(el: BlackboardElement): string | undefined {
  const rot = rotationOf(el);
  if (el.transform && rot) return `${el.transform} ${rot}`;
  return el.transform ?? rot;
}

/** 元素级旋转：绕自身包围盒中心转 */
function rotationOf(el: BlackboardElement): string | undefined {
  if (!el.rotation) return undefined;
  const cx = el.bbox.x + el.bbox.w / 2;
  const cy = el.bbox.y + el.bbox.h / 2;
  return `rotate(${el.rotation} ${cx} ${cy})`;
}

/**
 * 把元素几何转成一条可用于填充的闭合路径。
 * 开口的线要填充时按闭合处理 —— 否则浏览器会自己补一条直线收口，形状不可控。
 */
function shapePathD(el: BlackboardElement): string | null {
  const r = el.render;
  if (el.type === 'path') {
    if (r.d) return r.d;
    return r.points?.length ? catmullRomPath(r.points, r.tension ?? 0.5, r.closed ?? true) : null;
  }
  if (el.type === 'polygon' && r.points?.length) {
    // 平滑多边形：填充也要跟着平滑，否则描边是圆的、填充是折的
    return r.smooth ? catmullRomPath(r.points, r.tension ?? 0.5, true) : polylineToPath([...r.points, r.points[0]]);
  }
  if (el.type === 'circle' && r.cx != null && r.r != null) return arcPath(r.cx, r.cy ?? 0, r.r, 0, 360);
  if ((el.type === 'polyline' || el.type === 'stroke' || el.type === 'line' || el.type === 'arrow') && r.points?.length) {
    return catmullRomPath(r.points, r.tension ?? 0.5, true);
  }
  return null;
}

/** 实心形状的填充层：带颗粒的颜色块，像粉笔涂出来的面而不是矢量色块 */
function FillLayer({
  el,
  d,
  ink,
  filterId,
  seam = 0,
  wetEdge = 0,
}: {
  el: BlackboardElement;
  d: string | null;
  ink: InkFilters;
  filterId?: string;
  /**
   * 缝合宽度（板面单位，0 = 关）。见 `BlackboardStyle.fillSeam` 的注释。
   *
   * 为什么不是"给每条 path 简单加个 `stroke=fill`"：
   * 那样会让**描边与填充重叠的那一圈叠加变浓** —— 半透明铺色（fillOpacity 0.5）的图形
   * 内部会从 0.5 变成 0.75，整块明显变实。这里把"这一块填充"包进
   * `<g opacity=填充透明度>`，组内用**不透明**的同色 fill+stroke 画：
   * 组内全不透明 ⇒ 重叠处不叠加；透明度由组统一施加一次 ⇒ 内部浓度与原来一致。
   */
  seam?: number;
  /** 湿边宽度（板面单位，0 = 关）。见 `wetedges.ts` / `BlackboardStyle.wetEdge` */
  wetEdge?: number;
}) {
  if (!el.fill || !d) return null;
  const fo = el.fillOpacity ?? 0.85;
  // 很淡的填充（光晕、发丝底色）本来就看不出颗粒，却要付整块面积的湍流滤镜开销 —— 跳过
  // 逐帧动画的填充也不打颗粒：每秒几十帧重算湍流，帧率直接腰斩
  const grainy = fo >= 0.15 && !el.stream;
  // 外层分组时由分组决定滤镜（传 '' 就是不打）
  const f = filterId !== undefined ? filterId : grainy ? ink.grain : '';
  const color = guardColor(el.fill, ink.lightGuard);
  const filter = f ? `url(#${f})` : undefined;
  const edge = wetEdgeStyle(color, wetEdge);
  /**
   * 湿边：填充**之上**再描一圈"同色加深 12%"的细边（真墨在玻璃上边缘会聚一圈略深的色）。
   * 必须是**独立的一条 path**：填充那条 path 上的 stroke 已经被缝合用掉了（同色、宽 seam）。
   * 它与填充一起放进 `<g opacity>` —— 透明度只施加一次，半透明铺色也不会把边叠成双倍。
   */
  const edgePath = edge ? (
    <path
      d={d}
      fill="none"
      stroke={edge.color}
      strokeWidth={edge.width}
      strokeLinejoin="round"
      strokeLinecap="round"
      opacity={edge.opacity}
    />
  ) : null;
  if (seam > 0 || edgePath) {
    /**
     * ① 组内**不透明**的同色 fill+stroke：缝被盖住，且重叠处不会叠加变浓；
     * ② 裁到"所有填充的并集"（`bbFillUnion`）：外轮廓不长、真正的镂空不被填掉
     *    （只在开了缝合时裁；只开湿边时不必裁 —— 那圈边本来就只有 1.5 单位宽）。
     * 两层 `<g>` 的顺序无所谓，但把 clip 放外面更省：clip 先裁，透明度后施加。
     */
    const inner = (
      <g opacity={fo}>
        <path
          d={d}
          fill={color}
          stroke={seam > 0 ? color : undefined}
          strokeWidth={seam > 0 ? seam : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
          filter={filter}
        />
        {edgePath}
      </g>
    );
    return seam > 0 ? <g clipPath={`url(#${FILL_UNION_CLIP_ID})`}>{inner}</g> : inner;
  }
  return <path d={d} fill={color} fillOpacity={fo} stroke="none" filter={filter} />;
}

/* 变宽笔迹已改为「一条闭合轮廓 path」（见 chalk.ts 的 widthOutline）——
   原来按段切的 VariableStroke 会把一条笔迹炸成 18 个 path，44 条就是 600+ path，
   每个 path 都要单独过粉笔滤镜，实测把整机拖到 4~7fps。 */

function ArrowHead({ points, color, width, seed, ink }: { points: Pt[]; color: string; width: number; seed: number; ink: InkFilters }) {
  const [x1, y1] = points[points.length - 2];
  const [x2, y2] = points[points.length - 1];
  const a = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.max(18, width * 5.5);
  const spread = 0.42;
  return (
    <path
      d={wobblePath(
        [
          [x2 - Math.cos(a - spread) * len, y2 - Math.sin(a - spread) * len],
          [x2, y2],
          [x2 - Math.cos(a + spread) * len, y2 - Math.sin(a + spread) * len],
        ],
        seed + 91,
      )}
      {...baseStroke}
      stroke={color}
      strokeWidth={width}
      filter={`url(#${ink.stroke})`}
    />
  );
}

function InkText({ el, fresh, delay, ink }: { el: BlackboardElement; fresh: boolean; delay: number; ink: InkFilters }) {
  const r = el.render;
  const size = r.size ?? 30;
  const lineH = size * 1.34;
  const lines = String(r.text ?? '').split('\n');
  const seed = el.seed;
  let order = 0;

  return (
    <g filter={`url(#${ink.text})`}>
      {lines.map((line, li) => (
        <g key={li}>
          {layoutLine(line, size).map(({ ch, x }, ci) => {
            const j = charJitter(seed, li * 137 + ci);
            const at = fresh ? delay + Math.min(0.55, order * 0.026) : 0;
            order += 1;
            return (
              <text
                key={ci}
                x={(r.x ?? 0) + x + j.dx}
                y={(r.y ?? 0) + li * lineH + size * 0.88 + j.dy}
                fontSize={size}
                fill={inkColor(el.color, ink)}
                opacity={j.opacity}
                className={fresh ? styles.charIn : undefined}
                style={{
                  fontFamily: CHALK_FONT,
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                  transform: `rotate(${j.rot}deg)`,
                  // 逐字依次出现靠延迟实现，关键帧写在 CSS 里（CSS Module 会给它加作用域哈希）
                  ...(fresh ? { animationDelay: `${at}s` } : {}),
                }}
              >
                {ch}
              </text>
            );
          })}
        </g>
      ))}
    </g>
  );
}

function ElementView({
  el,
  fresh,
  delay,
  ink,
  filterId: filterOverride,
  fillFilterId,
  fillSeam = 0,
  wetEdge = 0,
  visible = true,
  showHidden = false,
}: {
  el: BlackboardElement;
  fresh: boolean;
  delay: number;
  /** 这块板上的笔（粉笔 / 玻璃笔），来自板面材料 */
  ink: InkFilters;
  /** 外层分组已经挂了滤镜时这里传 ''（不再单独打），避免"组一次 + 元素再一次" */
  filterId?: string;
  fillFilterId?: string;
  /** 缝合相邻填充的抗锯齿缝（板面单位，0 = 关）。见 `BlackboardStyle.fillSeam` */
  fillSeam?: number;
  /** 湿边宽度（板面单位，0 = 关）。见 `BlackboardStyle.wetEdge` */
  wetEdge?: number;
  /**
   * 这一条此刻画不画（`hidden` 层默认 false）。
   * 判定由调用方用 plane.ts 的 `isPlaneShown` 做好 —— 这里不自己再判一层。
   */
  visible?: boolean;
  /** 调试：`hidden` 层显式打开时才画，且画成"半透明 + 红色描边"的靶子 */
  showHidden?: boolean;
}) {
  const r = el.render;
  const stream = !!el.stream;
  // hidden 层（Layer 0 靶子）：默认根本不进 DOM；调试打开时才画，且包一层"半透明 + 红色描边"
  if (!visible) return null;
  const plane = planeOf(el);
  /**
   * 笔刷预设：**只在元素显式给了 brush 时生效** ——
   * 没给就完全走老逻辑，保证老 payload（含 rig 的 86 个部件）渲染一字不变。
   */
  const brush = brushOf(el.brush);
  // 墨色优先级：元素自己写的 > sticky style 合并进来的 > 板面的默认墨色。
  // 默认墨色必须由板面给 —— 亮玻璃上默认白色等于什么都没画。
  // 再走一遍 inkColor：先把深色板那套笔色翻成这块材料的墨，再压暗到不刺眼。
  const color = inkColor(el.color, ink);
  const width = el.width ?? brush?.width ?? 3.4;
  const chalkDensity = el.chalkDensity ?? brush?.chalkDensity ?? 0.55;
  // 滤镜优先由外层分组决定（一整层挂一次）；没分组时才自己挂
  const grouped = filterOverride !== undefined;
  const filterId = grouped ? (filterOverride as string) : stream ? '' : strokeFilterFor(ink, chalkDensity);
  /** 晕那层重描：分组时不做 —— 它要自己的模糊滤镜，进了分组反而变硬；也省一半 path */
  const dust = !stream && !grouped;
  // taper 是"两端细"的快捷方式；笔刷声明了 pressure:'taper' 时等价于给一个默认 taper
  const taper = el.taper ?? (brush?.pressure === 'taper' ? 0.45 : 0);
  /** 这一点串有没有真压感（有就按压感变宽，而不是按端点收细） */
  const pressure = hasPressure(r.points);
  /** 抖动幅度：笔刷给了就按笔刷，否则沿用老的两档 */
  const jitterAmp = brush ? brush.jitter : r.smooth ? 0.9 : 1.6;
  const opacity = el.opacity ?? brush?.opacity;
  const fillD = shapePathD(el);
  let body: React.ReactNode = null;

  if (el.type === 'text') {
    body = <InkText el={el} fresh={fresh} delay={delay} ink={ink} />;
  } else if (el.type === 'annotate') {
    if (r.rx != null && r.cy != null) {
      body = (
        <InkStroke
          make={(off) => wobbleEllipse(r.cx ?? 0, r.cy ?? 0, r.rx ?? 0, r.ry ?? r.rx ?? 0, el.seed + off)}
          color={color}
          width={el.width || 3.8}
          fresh={fresh}
          delay={delay}
          ink={ink}
          filterId={filterId}
          dust={dust}
        />
      );
    } else if (r.points?.length) {
      body =
        r.style === 'highlight' ? (
          <path
            d={wobblePath(r.points, el.seed)}
            {...baseStroke}
            stroke={color}
            strokeWidth={(r.size ?? 34) * 0.9}
            opacity={0.2}
            filter={`url(#${ink.dust?.id ?? ink.stroke})`}
          />
        ) : (
          <InkStroke
            make={(off) => wobblePath(r.points ?? [], el.seed + off)}
            color={color}
            width={el.width || 3.8}
            fresh={fresh}
            delay={delay}
            ink={ink}
            filterId={filterId}
            dust={dust}
          />
        );
    }
  } else if (el.type === 'arc') {
    const d = arcPath(r.cx ?? 0, r.cy ?? 0, r.r ?? 0, r.start ?? 0, r.end ?? 180);
    body = (
      <>
        <FillLayer el={el} d={el.fill ? d : null} ink={ink} filterId={fillFilterId} seam={fillSeam} wetEdge={wetEdge} />
        <InkStroke make={() => d} color={color} width={width} fresh={fresh} delay={delay} ink={ink} filterId={filterId} dust={dust} />
      </>
    );
  } else if (el.type === 'path') {
    // 给了 d 就用原样路径；只给 points 就转成平滑曲线（画有机形状的主力）
    const closedPath = !!r.closed;
    const smoothD = r.d ?? (r.points?.length ? catmullRomPath(r.points, r.tension ?? 0.5, closedPath) : '');
    const samples =
      !r.d && r.points?.length
        ? wobbleSamples(r.points, el.seed, { step: 14, amp: brush ? jitterAmp : 1.1, closed: closedPath })
        : null;
    const variable = !!samples && (pressure || taper > 0.05);
    body = (
      <>
        <FillLayer el={el} d={fillD} ink={ink} filterId={fillFilterId} seam={fillSeam} wetEdge={wetEdge} />
        {variable && samples ? (
          <path
            d={widthOutline(samples, width, { taper, usePressure: pressure })}
            fill={color}
            stroke="none"
            filter={filterId ? `url(#${filterId})` : undefined}
            className={fresh ? styles.charIn : undefined}
            style={fresh ? { animationDelay: `${delay}s` } : undefined}
          />
        ) : (
          <InkStroke make={() => smoothD} color={color} width={width} fresh={fresh} delay={delay} ink={ink} filterId={filterId} dust={dust} />
        )}
      </>
    );
  } else if (r.points?.length) {
    const closed = el.type === 'polygon';
    const smooth = !!r.smooth;
    const samples = wobbleSamples(r.points, el.seed, { closed, step: 16, amp: jitterAmp });
    const variable = pressure || taper > 0.05;
    body = (
      <>
        <FillLayer el={el} d={fillD} ink={ink} filterId={fillFilterId} seam={fillSeam} wetEdge={wetEdge} />
        {variable && samples.length > 2 ? (
          // 变宽笔迹 = **一条闭合轮廓**（不是切 18 段）：44 条笔迹从 600+ path 降到 44
          <path
            d={widthOutline(samples, width, { taper, usePressure: pressure })}
            fill={color}
            stroke="none"
            filter={filterId ? `url(#${filterId})` : undefined}
            className={fresh ? styles.charIn : undefined}
            style={fresh ? { animationDelay: `${delay}s` } : undefined}
          />
        ) : (
          <InkStroke
            make={(off) =>
              smooth
                ? catmullRomPath(r.points ?? [], r.tension ?? 0.5, closed)
                : wobblePath(r.points ?? [], el.seed + off, { closed })
            }
            color={color}
            width={width}
            fresh={fresh}
            delay={delay}
            ink={ink}
            filterId={filterId}
            dust={dust}
          />
        )}
        {el.type === 'arrow' && <ArrowHead points={r.points} color={color} width={width} seed={el.seed} ink={ink} />}
      </>
    );
  } else if (r.cx != null && r.r != null) {
    body = (
      <>
        <FillLayer el={el} d={fillD} ink={ink} filterId={fillFilterId} seam={fillSeam} wetEdge={wetEdge} />
        <InkStroke
          make={(off) => wobbleEllipse(r.cx ?? 0, r.cy ?? 0, r.r ?? 0, r.r ?? 0, el.seed + off)}
          color={color}
          width={width}
          fresh={fresh}
          delay={delay}
          ink={ink}
          filterId={filterId}
          dust={dust}
        />
      </>
    );
  }

  if (!body) return null;
  // 元素级透明度与变换：整块（含填充）一起变换
  // data-source / data-el-id 只是把"这一笔是谁的"暴露到 DOM，便于验收与样式钩子
  const node = (
    <g
      opacity={opacity ?? undefined}
      transform={transformOf(el)}
      data-source={el.source ?? 'ai'}
      data-el-id={el.id}
    >
      {body}
    </g>
  );
  /**
   * 靶子（hidden）在调试时才画：**半透明 + 红色描边**（契约 2.2-5）。
   * 红色描边走 `bbPlaneDebug` 滤镜（按光栅化后的 alpha 外扩染色）——
   * 对文字/group/带填充的形状一律成立，且**内容本身一个字节不改**。
   * 注意这里不挂 `filterMode` 的档位滤镜（外层 tier 分组仍照旧）：
   * 靶子只有调试时才出现，值得为"一眼看得出它不是用户的笔迹"多花这一次滤镜。
   */
  if (plane !== 'hidden') return node;
  if (!showHidden) return null;
  // 半透明度与红色描边滤镜的**值**也来自 plane.ts：屏上与预览器共用同一组常量，不会一边 0.3 一边 0.5
  return <g {...PLANE_DEBUG_ATTRS}>{node}</g>;
}

export function Blackboard({ script, paceMs = DEFAULT_PACE_MS, animate = true, onBusyChange, onNarrationChange, className, drawMode = false, onStroke, appendOps, overlayElements, overlayTransforms, onPlayingChange, halt = false, filterMode = 'layer', showHidden, visiblePlanes }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [elements, setElements] = useState<BlackboardElement[]>([]);
  const [ghosts, setGhosts] = useState<{ el: BlackboardElement; key: string }[]>([]);
  const [fresh, setFresh] = useState<Map<string, number>>(new Map());
  const [pointer, setPointer] = useState<Rect | null>(null);
  const [scale, setScale] = useState(1);
  /** 正在说的那句 + 刚被顶掉的那句 */
  const [saying, setSaying] = useState<{ text: string; key: number } | null>(null);
  const [leaving, setLeaving] = useState<{ text: string; key: number } | null>(null);

  const timers = useRef<number[]>([]);
  const writeStart = useRef(0);
  const busyUntil = useRef(0);
  /** 当前板上的元素。用 ref 而不是只读 state：执行 ops 时要判断"这块是不是已经写过了"，
   *  setState 更新函数里做副作用在严格模式下会被调用两次。 */
  const boardRef = useRef<BlackboardElement[]>([]);
  const lastScriptKey = useRef<string | null>(null);
  /** 循环链的代次：clearTimers 一加，已经排进队列的那一轮就自己退出 */
  const loopGen = useRef(0);
  const boardSize = script?.size ?? DEFAULT_BOARD_SIZE;
  /**
   * 板面材料：`style.surface` 一给就换（省略 = 默认的清新透亮玻璃，见 glass.ts）。
   * 板面一变，笔也跟着变 —— 粉笔只能写在深色石板上，玻璃上写字的是玻璃笔。
   */
  const surface = useMemo(() => resolveSurface(script?.style?.surface), [script]);
  const ink = useMemo(() => inkOf(surface), [surface]);
  /**
   * 缝合相邻填充之间的抗锯齿缝（"碎玻璃"）。
   *
   * 板面级渲染设置（和 `surface` 同类）：省略 / 0 / false = **关**，
   * 于是老 payload 的标记一个字节都不变（FillLayer 走原来那条分支）。
   * 归一规则在 seam.ts（与预览器同一份）。
   */
  const fillSeam = useMemo(() => normalizeFillSeam(script?.style?.fillSeam), [script]);
  /**
   * 内容与玻璃的关系：玻璃**前表面反射**的强度（0 = 关）。
   * 板面级渲染设置（与 `surface` / `fillSeam` 同类）；省略时一个字节都不多。
   */
  const contentOnGlass = useMemo(() => normalizeContentOnGlass(script?.style?.contentOnGlass), [script]);
  /**
   * 湿边：平色区域边缘那圈略深的色（板面级渲染设置，与 `surface` / `fillSeam` 同类）。
   * 省略时 0 ⇒ 老 payload 的标记一个字节都不变。
   */
  const wetEdge = useMemo(() => normalizeWetEdge(script?.style?.wetEdge), [script]);
  /** 前表面反射的 defs（裁剪 + 渐变）：只在开着的时候才插，老 payload 不受影响 */
  const glassFrontDefsMemo = useMemo(
    () => (contentOnGlass > 0 ? glassFrontDefs(surface, boardSize) : ''),
    [contentOnGlass, surface, boardSize],
  );
  const glassFrontLayerMemo = useMemo(
    () => (contentOnGlass > 0 ? glassFrontLayer(surface, boardSize, contentOnGlass) : ''),
    [contentOnGlass, surface, boardSize],
  );
  /**
   * 三层语义：此刻渲染哪几层。
   *
   * 优先级：props（显式给了就听 props）> URL 查询参数 `?plane=all` > 默认。
   * 默认**不含 hidden** —— 靶子（Layer 0）不给用户看（老师裁定的铁律）；
   * 调试时 `?plane=all` 或 `showHidden` 才把它画出来（半透明 + 红色描边）。
   * 判定逻辑一个字都不在这里：全部来自 plane.ts（预览器 import 的同一份）。
   */
  const urlPlane = useMemo(
    () => (typeof window === 'undefined' ? {} : parsePlaneQuery(window.location.search)),
    [],
  );
  const visible = useMemo(
    () =>
      resolveVisiblePlanes({
        planes: visiblePlanes ?? urlPlane.planes,
        showHidden: showHidden || urlPlane.showHidden,
      }),
    [visiblePlanes, urlPlane, showHidden],
  );
  /** hidden 层此刻画不画（画的话要按"靶子"的调试样式画） */
  const showHiddenNow = visible.includes('hidden');
  /**
   * 板面标记算成字符串（不是 React 元素树）：一是屏上与本地预览器共用同一份生成器，
   * 二是它跟笔迹无关 —— 字符串没变 React 就一个字节都不写 DOM，
   * 重度模糊那层不会被逐笔重绘带着一起重算。
   *
   * 末尾接上靶子的调试滤镜定义（`bbPlaneDebug`）—— 它只在 hidden 层被画出来时用得上，
   * 但定义常驻 `<defs>` 不影响任何元素（没有被引用的滤镜不参与光栅化）。
   */
  const surfaceDefsMemo = useMemo(
    () => surfaceDefs(surface, boardSize) + planeDebugDefs(),
    [surface, boardSize],
  );
  const surfaceLayersMemo = useMemo(() => surfaceLayers(surface, boardSize), [surface, boardSize]);
  /**
   * 填充缝合的并集裁剪：所有**填充**元素的路径并集。
   *
   * 描边只在这块区域里生效 ⇒ **外轮廓一点不长**（还是原来那个并集），
   * 真正的镂空（发丝之间、手臂与身体之间）也不会被填掉。
   * 必须放在 `visible` 之后（要用它过滤掉不画的层）。
   *
   * 单独一个 `<defs>`，不并进 surfaceDefsMemo：板面那串带重度模糊的滤镜定义
   * 不该因为"又画了一块填充"而被重写（那会把重度模糊重新光栅化）。
   */
  const fillUnionDefsMemo = useMemo(() => {
    if (!fillSeam) return '';
    const ds: string[] = [];
    for (const el of elements) {
      if (!el.fill || !isPlaneShown(el, visible)) continue;
      const d = shapePathD(el);
      if (d) ds.push(d);
    }
    return fillUnionDefs(ds);
  }, [elements, fillSeam, visible]);
  /** 有几节的笔还悬着。分节模式下"还在写"要按节计数，否则最后一节写完之前，
   *  所有中间节都让不出位子。 */
  const openSteps = useRef(0);
  const captionSeq = useRef(0);
  const sayingRef = useRef<{ text: string; key: number } | null>(null);
  /** 板子上方那块说话区。走 ref 而不是把 onNarrationChange 塞进 say 的依赖 ——
   *  say 一变，排脚本的 effect 就会重跑，板子会从头再演一遍。 */
  const narrationSink = useRef(onNarrationChange);

  useEffect(() => {
    narrationSink.current = onNarrationChange;
    if (!onNarrationChange) return;
    onNarrationChange({ saying: sayingRef.current, leaving: null });
  }, [onNarrationChange]);

  // 板子没了，它那句话也不能留在外面。
  useEffect(
    () => () => {
      narrationSink.current?.({ saying: null, leaving: null });
    },
    [],
  );

  /** 清理所有待执行的定时器（组件卸载或脚本被替换时） */
  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    // 循环链是按代次自续的：代次一变，已经排进队列的那一轮也会自己退出
    loopGen.current += 1;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  /**
   * 换一句话说。
   *
   * 新的一句出现时，上一句还在淡出 —— 两句同时在 DOM 里，"消失"和"出现"是同一个瞬间，
   * 而不是先空一下再冒出下一句。板子上正在被讲的那一部分因此始终有焦点。
   */
  const say = useCallback((text: string) => {
    const clean = text.trim();
    if (sayingRef.current?.text === clean) return;
    const previous = sayingRef.current;
    captionSeq.current += 1;
    const next = clean ? { text: clean, key: captionSeq.current } : null;
    sayingRef.current = next;
    setSaying(next);
    if (!previous) {
      narrationSink.current?.({ saying: next, leaving: null });
      return;
    }
    setLeaving(previous);
    narrationSink.current?.({ saying: next, leaving: previous });
    timers.current.push(
      window.setTimeout(
        () => {
          setLeaving((current) => (current && current.key === previous.key ? null : current));
          narrationSink.current?.({ saying: sayingRef.current, leaving: null });
        },
        CAPTION_EXIT_MS,
      ),
    );
  }, []);

  const commit = useCallback((list: BlackboardElement[]) => {
    boardRef.current = list;
    setElements(list);
  }, []);

  /** 让这个元素"正在被写出来"，写完动画结束后摘掉标记 */
  const markFresh = useCallback((id: string, base: number) => {
    setFresh((m) => new Map(m).set(id, Math.min(base, 2.2)));
    timers.current.push(
      window.setTimeout(() => {
        setFresh((m) => {
          const next = new Map(m);
          next.delete(id);
          return next;
        });
      }, 1800),
    );
  }, []);

  /**
   * 信封级 sticky style：按 op 顺序滚动继承。
   * 语义是"**写了就覆盖并粘住**" —— 某个 op 显式给了 color，从那以后都按它走。
   * 换脚本时用 script.style 重置（见脚本 effect）。
   */
  const stickyStyle = useRef<BlackboardStyle>({});

  /** 把 sticky style 合并进元素：元素显式写的优先，并写回 sticky；没写的从 sticky 继承 */
  const mergeStyle = useCallback((raw: BlackboardElement): BlackboardElement => {
    const el = normalizeElement(raw);
    const sticky = stickyStyle.current;
    /**
     * 元素**自己声明了笔刷**时，笔刷管的字段（线宽/颗粒/透明度）不被 sticky 覆盖。
     * 否则会出现这种事：前面某笔显式给了 width:14 粘住，后面写 `brush:'sketch'`
     * 的元素也变成 14 —— 那 sketch 就不是 sketch 了。命名笔刷是"这一笔要什么手感"的
     * 明确表达，优先级高于省 token 用的全局默认。
     */
    const ownBrush = brushOf(el.brush);
    let changed = false;
    const out: BlackboardElement = { ...el };
    for (const key of STYLE_KEYS) {
      const own = el[key];
      if (own !== undefined) {
        if (sticky[key] !== own) {
          (sticky as Record<string, unknown>)[key] = own;
        }
      } else if (sticky[key] !== undefined) {
        if (ownBrush && BRUSH_OWNED_KEYS.has(key)) continue;
        (out as Record<string, unknown>)[key] = sticky[key];
        changed = true;
      }
    }
    return changed ? out : el;
  }, []);

  const applyOp = useCallback((op: BlackboardOp, opts?: { silent?: boolean }) => {
    const base = (Date.now() - writeStart.current) / 1000;
    const silent = !!opts?.silent;
    switch (op.kind) {
      case 'add': {
        const el = mergeStyle(op.element);
        const existing = boardRef.current.find((e) => e.id === el.id);
        // 已经写着同样的内容了就不重描：冷启动时整块板是铺上去的，
        // 再把每个元素重写一遍会像有人在黑板上反复描。
        if (existing && JSON.stringify(existing) === JSON.stringify(el)) break;
        commit(existing
          ? boardRef.current.map((e) => (e.id === el.id ? el : e))
          : [...boardRef.current, el]);
        if (!silent) markFresh(el.id, base);
        break;
      }
      case 'update': {
        const el = mergeStyle(op.element);
        commit(
          boardRef.current.some((e) => e.id === el.id)
            ? boardRef.current.map((e) => (e.id === el.id ? el : e))
            : [...boardRef.current, el],
        );
        if (!silent) markFresh(el.id, base);
        break;
      }
      case 'remove': {
        const gone = boardRef.current.find((e) => e.id === op.id);
        if (gone) {
          const key = `${gone.id}@${Date.now()}`;
          setGhosts((g) => [...g, { el: gone, key }]);
          timers.current.push(
            window.setTimeout(() => setGhosts((g) => g.filter((x) => x.key !== key)), GHOST_TTL_MS),
          );
        }
        commit(boardRef.current.filter((e) => e.id !== op.id));
        break;
      }
      case 'clear': {
        commit([]);
        setGhosts([]);
        setFresh(new Map());
        break;
      }
      case 'pointer': {
        const ms = op.ms ?? 2200;
        setPointer(op.bbox);
        timers.current.push(window.setTimeout(() => setPointer(null), ms));
        break;
      }
    }
  }, [commit, markFresh, mergeStyle]);

  /** 板面按容器自适应缩放：居中、留边 */
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const fit = () => {
      const { width, height } = wrap.getBoundingClientRect();
      if (!width || !height) return;
      const pad = 12;
      setScale(Math.min((width - pad * 2) / boardSize.w, (height - pad * 2) / boardSize.h));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [boardSize.w, boardSize.h]);

  /**
   * 把脚本排出去。
   *
   * 有分节的时候一节一节来：说一句，画这一句对应的那几笔，说完了才轮到下一句，
   * 板子上的焦点始终只有一处。没有分节（老消息、系统里存下来的旧脚本）或者用户
   * 说了减少动态效果，就照旧把 ops 一口气排出去 —— 不能因为多了个新字段就不画了。
   */
  useEffect(() => {
    if (!script) return;
    // 同一条消息在历史刷新后会重新构造对象；内容没变就不要重放动画。
    const key = JSON.stringify(script);
    if (lastScriptKey.current === key) return;
    lastScriptKey.current = key;
    clearTimers();
    openSteps.current = 0;
    say('');
    // 换脚本 = 重置 sticky style，用脚本顶层给的 style 起头
    stickyStyle.current = { ...(script.style ?? {}) };

    // instant：一次性出结果，连落笔动画都不放（AI 自验/改稿用；没人盯着改稿看）
    const instant = script.mode === 'instant' || !animate;

    // 板子是空的但脚本不是从零开始（重开历史、通话中途进来）：
    // 先把整块板铺好，再执行这一轮的改动，否则那些 update 找不到落点。
    if (boardRef.current.length === 0 && script.elements?.length) {
      const laid = script.elements.map(mergeStyle);
      boardRef.current = laid;
      setElements(laid);
    }

    if (instant) {
      // 翻回来的板子 / 自验：整块铺好，一个字都不重写，也不放落笔动画
      onPlayingChange?.(false);
      if (script.elements?.length) {
        const laid = script.elements.map(mergeStyle);
        boardRef.current = laid;
        setElements(laid);
        return;
      }
      (script.ops ?? []).forEach((op) => applyOp(op, { silent: true }));
      return;
    }

    const now = Date.now();
    if (now - writeStart.current > 1200) writeStart.current = now;

    const scriptPace = script.paceMs ?? paceMs;

    const steps = (script.steps ?? []).filter((step) => step.ops?.length || step.narration?.trim());
    if (steps.length && !prefersReducedMotion()) {
      // "还在写"按节计数：中间节写完就让出位子，最后一节写完才算这一板结束。
      // 笔不会停在半画上 —— 一节里的几笔是排完的。
      const busyOn = () => {
        openSteps.current += 1;
        if (openSteps.current === 1) onBusyChange?.(true);
      };
      const busyOff = () => {
        openSteps.current = Math.max(0, openSteps.current - 1);
        if (openSteps.current === 0) onBusyChange?.(false);
      };
      let cursor = 0;
      onPlayingChange?.(true);
      steps.forEach((step) => {
        const startedAt = cursor;
        const drawingMs = stepDrawingMs(step, scriptPace);
        timers.current.push(window.setTimeout(() => say(step.narration ?? ''), startedAt));
        // op 级的 paceMs 覆盖脚本级：草图 30ms / 勾线 160ms / 上色 20ms 的分层配速靠它
        let stepCursor = 0;
        step.ops.forEach((op) => {
          const at = startedAt + stepCursor;
          if (at === 0) applyOp(op);
          else timers.current.push(window.setTimeout(() => applyOp(op), at));
          stepCursor += op.paceMs ?? scriptPace;
        });
        if (drawingMs > 0) {
          timers.current.push(window.setTimeout(busyOn, startedAt));
          timers.current.push(window.setTimeout(busyOff, startedAt + drawingMs));
        }
        cursor += stepHoldMs(step, paceMs);
      });
      // 最后一句也要留够读完的时间再收起，别让要点一闪而过
      timers.current.push(window.setTimeout(() => say(''), cursor));
      timers.current.push(window.setTimeout(() => onPlayingChange?.(false), cursor + 60));
      return;
    }

    if (!script.ops?.length) return;

    const markBusy = (ms: number) => {
      busyUntil.current = Math.max(busyUntil.current, Date.now() + ms);
      onBusyChange?.(true);
    };
    const settle = (ms: number) => {
      const t = window.setTimeout(() => {
        if (Date.now() >= busyUntil.current) onBusyChange?.(false);
      }, ms);
      timers.current.push(t);
    };

    // 逐帧/循环播放：先把整段 ops 排成「什么时候执行哪一条」
    const loopCfg = normalizeLoop(script.loop, script.ops.length);
    const plan = planOps(script.ops, scriptPace, loopCfg?.frameMs);

    onPlayingChange?.(true);

    if (loopCfg) {
      /**
       * 首遍照旧播**全部** ops（那是"一笔一笔画出来"的过程，带落笔动画）；
       * 之后每轮只播循环区间，且**不打落笔动画**（循环是"放出来"不是"重画一遍"）。
       * 所有定时器都进 timers，所以 clearTimers（换脚本/卸载/halt）一叫就全停，不留野定时器。
       */
      const range = script.ops.slice(loopCfg.fromOp, loopCfg.toOp + 1);
      const cycle = planOps(range, scriptPace, loopCfg.frameMs);
      const gen = ++loopGen.current;

      const runCycle = () => {
        if (gen !== loopGen.current) return;
        cycle.items.forEach(({ op, at }) => {
          if (at === 0) applyOp(op, { silent: true });
          else timers.current.push(window.setTimeout(() => applyOp(op, { silent: true }), at));
        });
        timers.current.push(
          window.setTimeout(runCycle, Math.max(60, cycle.total) + loopCfg.gapMs),
        );
      };

      plan.items.forEach(({ op, at }) => {
        if (at === 0) applyOp(op);
        else timers.current.push(window.setTimeout(() => applyOp(op), at));
      });
      markBusy(plan.total + WRITE_ANIM_MS);
      timers.current.push(window.setTimeout(runCycle, plan.total + WRITE_ANIM_MS + loopCfg.gapMs));
      return;
    }

    plan.items.forEach(({ op, at }) => {
      if (at === 0) applyOp(op);
      else timers.current.push(window.setTimeout(() => applyOp(op), at));
    });

    // 最后一个元素落笔 + 写完动画 = 这一批结束
    const totalMs = plan.total + WRITE_ANIM_MS;
    markBusy(totalMs);
    settle(totalMs + 40);
    timers.current.push(window.setTimeout(() => onPlayingChange?.(false), totalMs + 60));
  }, [script, paceMs, animate, applyOp, say, clearTimers, onBusyChange, mergeStyle, onPlayingChange]);

  // 卸载时不能把"还在写"留在外面，否则通话那边会一直等一个永远不会来的收笔。
  useEffect(
    () => () => {
      openSteps.current = 0;
      onBusyChange?.(false);
      onPlayingChange?.(false);
    },
    [onBusyChange, onPlayingChange],
  );

  /**
   * `halt`：立刻停掉循环与所有待执行定时器，**但不清板**。
   * Live payload 的 `stop` 用它 —— 循环要能马上停，板面停在当前那一帧。
   */
  useEffect(() => {
    if (!halt) return;
    clearTimers();
    openSteps.current = 0;
    setPointer(null);
    onBusyChange?.(false);
    onPlayingChange?.(false);
  }, [halt, clearTimers, onBusyChange, onPlayingChange]);

  /** 元素查表：group 要按 id 取子元素 */
  const byId = useMemo(() => {
    const m = new Map<string, BlackboardElement>();
    elements.forEach((e) => m.set(e.id, e));
    return m;
  }, [elements]);

  /** 被 group 收编的元素（含嵌套）：由 group 渲染，顶层不再重复画 */
  const groupedIds = useMemo(() => {
    const owned = new Set<string>();
    const queue = elements.filter((e) => e.type === 'group');
    while (queue.length) {
      const g = queue.pop() as BlackboardElement;
      for (const id of g.render.children ?? []) {
        if (id === g.id || owned.has(id)) continue;
        owned.add(id);
        const child = elements.find((e) => e.id === id);
        if (child && child.type === 'group') queue.push(child);
      }
    }
    return owned;
  }, [elements]);

  /** 绘制顺序：先按 layer 升序，同层保持加入顺序 */
  const renderOrder = useMemo(
    () =>
      elements
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => !groupedIds.has(e.id))
        // Number(...) || 0：payload 里的 layer 可能是语义名（老脚本给过 'line'），别让 NaN 把顺序搞乱
        .sort((a, b) => (Number(a.e.layer) || 0) - (Number(b.e.layer) || 0) || a.i - b.i)
        .map(({ e }) => e),
    [elements, groupedIds],
  );

  /**
   * 板上的内容（不含逐帧动画层）。
   *
   * useMemo 是刻意的：骨骼动画每秒改几十次 overlayElements，
   * 这一棵子树必须能原样复用 —— 元素对象引用不变时 React 会整棵跳过，
   * 否则每秒几十次把整块板的粉笔滤镜（feTurbulence）全部重算，必然掉帧。
   * group 递归画子元素，子元素继承 group 的旋转与透明度。
   */
  const boardContent = useMemo(() => {
    /**
     * 元素递归（group 展开）。`tier` 传下去：分组已经挂了滤镜，元素自己就不要再挂一次。
     * `visible` 也传下去：**靶子（hidden）默认整支不画**，调试时才按半透明红边画出来。
     */
    const draw = (el: BlackboardElement, depth: number, tier: FilterTier | null): React.ReactNode => {
      if (el.type !== 'group') {
        // 分组已经挂了滤镜 → 元素自己**必须传 ''**（不打），否则组一次 + 元素再一次 = 双重滤镜
        const f = tier === null ? undefined : '';
        return (
          <ElementView
            key={el.id}
            el={el}
            fresh={fresh.has(el.id)}
            delay={fresh.get(el.id) ?? 0}
            ink={ink}
            filterId={f}
            fillFilterId={f}
            fillSeam={fillSeam}
            wetEdge={wetEdge}
            visible={isPlaneShown(el, visible)}
            showHidden={showHiddenNow}
          />
        );
      }
      if (depth > 3) return null;
      const kids = (el.render.children ?? [])
        .map((id) => byId.get(id))
        .filter((k): k is BlackboardElement => !!k);
      /**
       * 分组的 plane 与子元素不同时，**分组以自己为准**：
       * 一个 hidden 的 group = 整组是靶子（里面的子元素不必各自再包一层调试标记）；
       * 一个 visible 的 group 里混着 hidden 子元素时，由子元素自己带调试标记。
       */
      const selfVisible = isPlaneShown(el, visible);
      if (!selfVisible) return null;
      const hiddenInside = kids.some((k) => planeOf(k) === 'hidden');
      const asTarget = planeOf(el) === 'hidden' || hiddenInside;
      const group = (
        <g
          key={el.id}
          opacity={el.opacity ?? undefined}
          transform={rotationOf(el)}
          data-source={el.source ?? 'ai'}
          data-el-id={el.id}
          data-plane={planeOf(el) === 'hidden' ? 'hidden' : undefined}
        >
          {kids.map((k) => draw(k, depth + 1, tier))}
        </g>
      );
      if (!asTarget || !showHiddenNow) return group;
      // 组里有靶子（或整组就是靶子）：外层包一层"半透明 + 红色描边"，一眼分得出不是用户的笔迹
      return (
        <g key={`${el.id}-plane`} {...PLANE_DEBUG_ATTRS}>
          {group}
        </g>
      );
    };

    /**
     * 按档位把**连续的**同档元素合成一层 `<g filter>`。
     * 只合并连续段（而不是把所有同档的归一堆）是为了**不破坏图层顺序** ——
     * 远侧的腿必须还在近侧腿下面。
     */
    const nodes: React.ReactNode[] = [];
    let run: React.ReactNode[] = [];
    let runTier: FilterTier | null = null;

    const flush = () => {
      if (!run.length || runTier === null) return;
      const f = tierFilter(ink, runTier);
      if (f) {
        nodes.push(
          <g key={`tier-${nodes.length}`} filter={`url(#${f})`}>
            {run}
          </g>,
        );
      } else {
        nodes.push(...run); // 不挂滤镜的档不必多包一层
      }
      run = [];
    };

    for (const el of renderOrder) {
      if (filterMode === 'element') {
        // 质感档：每个元素自己挂滤镜（老行为），不分组
        nodes.push(draw(el, 0, null));
        continue;
      }
      const tier = filterTierOf(el, ink);
      if (runTier !== null && tier !== runTier) flush();
      runTier = tier;
      run.push(draw(el, 0, tier));
    }
    flush();
    return nodes;
  }, [renderOrder, byId, fresh, filterMode, ink, visible, showHiddenNow, fillSeam, wetEdge]);

  /**
   * 逐帧动画层：同一批 id 整体重绘，不落笔、不留残影、不进 ops 通道。
   * 整层挂**一次**粉笔滤镜（而不是每个部件一次）—— 部件多的时候按部件挂会让每帧的
   * 湍流光栅化翻几十倍。结构只在换角色时重建，每帧变的只有 transform。
   */
  const overlayRefs = useRef(new Map<string, SVGGElement>());
  const overlayContent = useMemo(() => {
    const all = overlayElements ?? [];
    if (!all.length) return null;
    // 逐帧动画层也守三层语义：靶子（hidden）默认不画，调试时才画出来。
    // **元素全是可见层时保持原数组引用**（不复制）—— 逐帧层每秒几十次重渲染，别白白重建这棵子树。
    const els = all.every((el) => isPlaneShown(el, visible))
      ? all
      : all.filter((el) => isPlaneShown(el, visible));
    if (!els.length) return null;
    return (
      <g filter={`url(#${ink.fast})`}>
        {els.map((el) => {
          // transform 只由这一层 <g> 持有（每帧由下面的 effect 直接改属性）。
          // 必须把 element 上的 transform 剥掉：ElementView 自己也会应用它，
          // 两边都应用就会位移翻倍 —— 角色会被摆到两倍远的地方（踩过）。
          const { transform, ...shape } = el;
          const isTarget = planeOf(el) === 'hidden';
          const node = (
            <g
              key={el.id}
              ref={(node) => {
                if (node) overlayRefs.current.set(el.id, node);
                else overlayRefs.current.delete(el.id);
              }}
              opacity={el.opacity ?? undefined}
              transform={transform}
              data-source={el.source ?? 'ai'}
              data-el-id={el.id}
              data-plane={isTarget ? 'hidden' : undefined}
            >
              <ElementView el={shape as BlackboardElement} fresh={false} delay={0} ink={ink} fillSeam={fillSeam} wetEdge={wetEdge} />
            </g>
          );
          // 靶子的"半透明 + 红色描边"包在外面：里面那层 <g> 的 transform 每帧被直接改写，别搅在一起
          return isTarget && showHiddenNow ? (
            <g key={`${el.id}-plane`} {...PLANE_DEBUG_ATTRS}>
              {node}
            </g>
          ) : (
            node
          );
        })}
      </g>
    );
  }, [overlayElements, ink, visible, showHiddenNow, fillSeam, wetEdge]);

  /**
   * 每帧的 transform 直接写 DOM：不触发 React 重渲染。
   * 这是骨骼动画能跑到 30fps 以上的关键（走 React 每帧重建 86 个元素只有 20fps）。
   */
  useLayoutEffect(() => {
    if (!overlayTransforms) return;
    for (const id in overlayTransforms) {
      const node = overlayRefs.current.get(id);
      const tf = overlayTransforms[id];
      if (node && tf && node.getAttribute('transform') !== tf) node.setAttribute('transform', tf);
    }
  }, [overlayTransforms]);

  /* ---------------- 人类作画（B2「你画」） ---------------- */

  /**
   * 追加操作：只跑新增的那一段。
   * 人类每画一笔就往数组尾上添一条，走 script 会把整份脚本重跑一遍。
   */
  const appliedOps = useRef(0);
  useEffect(() => {
    const ops = appendOps ?? [];
    if (ops.length <= appliedOps.current) return;
    const pending = ops.slice(appliedOps.current);
    appliedOps.current = ops.length;
    pending.forEach((op) => applyOp(op));
  }, [appendOps, applyOp]);

  const drawing = useRef(false);
  const drawPts = useRef<Pt[]>([]);
  /** 落笔预览的那条 path：直接改它的 d，不触发 React 渲染 */
  const liveRef = useRef<SVGPathElement>(null);

  /** 屏幕坐标 → 板面坐标（用 SVG 自己的 CTM，viewBox 与缩放都自动算进去） */
  const toBoard = useCallback((clientX: number, clientY: number): Pt | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
  }, []);

  /** 落笔预览直接改 DOM，不走 state —— 每 move 一次都重渲染整块板会卡 */
  const paintLive = useCallback(() => {
    liveRef.current?.setAttribute('d', polylineToPath(drawPts.current));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!drawMode) return;
      const p = toBoard(e.clientX, e.clientY);
      if (!p) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drawing.current = true;
      drawPts.current = [p];
      paintLive();
    },
    [drawMode, toBoard, paintLive],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!drawMode || !drawing.current) return;
      const p = toBoard(e.clientX, e.clientY);
      if (!p) return;
      const last = drawPts.current[drawPts.current.length - 1];
      // 抽稀：手抖出来的密集点没必要都留，也省得元素爆掉
      if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 3) return;
      drawPts.current = [...drawPts.current, p];
      paintLive();
    },
    [drawMode, toBoard, paintLive],
  );

  const endStroke = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    const pts = drawPts.current;
    drawPts.current = [];
    liveRef.current?.setAttribute('d', '');
    if (pts.length === 1) {
      // 只点了一下：给个极短的两点线，让它至少看得见一个点
      const [x, y] = pts[0];
      onStroke?.([[x, y], [x + 0.9, y + 0.9]]);
      return;
    }
    if (pts.length >= 2) onStroke?.(pts);
  }, [onStroke]);

  return (
    <div
      ref={wrapRef}
      className={[styles.wrap, className].filter(Boolean).join(' ')}
      data-filter-mode={filterMode}
      data-surface={surface.id}
      /* 此刻渲染了哪几层 —— 验收时不用翻代码就知道靶子开没开 */
      data-planes={visible.join(',')}
      data-show-hidden={showHiddenNow ? '1' : '0'}
      style={
        {
          // 手绘那一笔和"指一下"的圈也属于这块材料：深色板是青+辉光，
          // 亮玻璃上得换成墨色，否则浅底上看不见（见 glass.ts 的 ink.accent）
          '--bb-live-filter': `url(#${ink.family === 'chalk' ? 'bbChalkStrokeHeavy' : 'bbPenStrokeHeavy'})`,
          '--bb-live-ink': ink.accent,
          '--bb-pointer-ink': ink.accent,
        } as React.CSSProperties
      }
    >
      <svg
        ref={svgRef}
        className={[styles.svg, drawMode ? styles.drawing : ''].filter(Boolean).join(' ')}
        viewBox={`${-20} ${-20} ${boardSize.w + 40} ${boardSize.h + 40}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="黑板"
        data-draw-mode={drawMode ? '1' : '0'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      >
        {/* 板面材料与笔迹滤镜：**全部来自 glass.ts**（屏上与本地预览器同一份）。
            玻璃、背后的景色、边缘厚度、这块板上的笔 —— 要改都去改 glass.ts，
            这里只是插槽（payload 的 style.surface 就能换板面，不用动渲染代码）。 */}
        <defs dangerouslySetInnerHTML={{ __html: surfaceDefsMemo }} />

        {/* 填充缝合的并集裁剪：单独一个 <defs>，免得它一变就把上面那串带重度模糊的定义重写。
            没开缝合（老 payload）时这里是空的 —— 一个字节都不多。 */}
        {fillUnionDefsMemo ? <defs dangerouslySetInnerHTML={{ __html: fillUnionDefsMemo }} /> : null}

        {/* 玻璃前表面反射的 defs（裁剪 + sheen 渐变）：同样单独一个 <defs>，开着才插 */}
        {glassFrontDefsMemo ? <defs dangerouslySetInnerHTML={{ __html: glassFrontDefsMemo }} /> : null}

        {/* 板面：背后模糊的景色 → 投影 → 玻璃本体 → 边缘与厚度。
            整块板是**一层静态标记**（useMemo 成字符串，内容不变就不碰 DOM），
            所以每帧重绘的只有笔迹，不含这层重度模糊。 */}
        <g dangerouslySetInnerHTML={{ __html: surfaceLayersMemo }} />

        {/* 内容：按 layer 排序，group 收编的元素由 group 画。
            这里刻意 useMemo：逐帧动画层每帧都在变，但这一棵子树要能原样复用
            （元素对象引用不变时 React 会整棵跳过），否则 30fps 会把整块板的粉笔滤镜重算一遍。 */}
        {boardContent}

        {/* 刚被擦掉的：把"擦"这个动作演完再消失。
            靶子（hidden）不在这里露头 —— 它本来就不该被用户看见，更不该在擦除动画里闪现一下。 */}
        {ghosts
          .filter((g) => isPlaneShown(g.el, visible))
          .map((g) => (
            <g key={g.key} className={styles.wipeGroup}>
              <defs>
                <clipPath id={`bbWipe-${g.key}`}>
                  <rect
                    className={styles.wipeRect}
                    style={
                      {
                        '--bbwx': `${g.el.bbox.x - 12}px`,
                        '--bbww': `${g.el.bbox.w + 24}px`,
                        x: `${g.el.bbox.x - 12}px`,
                        y: `${g.el.bbox.y - 12}px`,
                        width: `${g.el.bbox.w + 24}px`,
                        height: `${g.el.bbox.h + 24}px`,
                      } as React.CSSProperties
                    }
                  />
                </clipPath>
              </defs>
              <g clipPath={`url(#bbWipe-${g.key})`}>
                <ElementView el={g.el} fresh={false} delay={0} ink={ink} fillSeam={fillSeam} wetEdge={wetEdge} />
              </g>
            </g>
          ))}

        {/* 「指一下」：闪几下一会儿就没，不在板上留东西 */}
        {pointer && (
          <rect className={styles.pointerRing} x={pointer.x - 16} y={pointer.y - 16} width={pointer.w + 32} height={pointer.h + 32} rx={12} />
        )}

        {/* 逐帧动画层（骨骼动画）：压在所有内容之上，每帧整体重绘 */}
        {overlayContent}

        {/* 人类正在拖的这一笔：d 由 pointer 事件直接改，不走 state */}
        {drawMode && <path ref={liveRef} className={styles.liveStroke} />}

        {/* ★ 玻璃前表面反射：**画在内容之上**（这是"写在玻璃上"与"贴上去"的分界）。
            与下面那层玻璃用的是**同一条 sheen 渐变、同一块板面矩形**，所以上下的反射
            是同一束光、不会看成两层重影；soft-light 只调制不遮盖，内容自己的对比保得住。
            pointer-events:none 写在生成器里，不影响人类作画的 pointer 事件。 */}
        {glassFrontLayerMemo ? <g dangerouslySetInnerHTML={{ __html: glassFrontLayerMemo }} /> : null}
      </svg>

      {/* 正在讲的那一句。上一句一边淡出一边让位，所以"消失"和"下一句出现"
          是同一个瞬间 —— 眼睛始终只需跟着一处。
          调用方接手（onNarrationChange）时这里就不画了，由它放到板子上方。 */}
      {!onNarrationChange && (saying || leaving) && (
        <div className={styles.captionLayer} aria-hidden="true">
          {leaving && <p key={leaving.key} className={`${styles.caption} ${styles.captionOut}`}>{leaving.text}</p>}
          {saying && <p key={saying.key} className={styles.caption}>{saying.text}</p>}
        </div>
      )}

      {/* 读屏软件要的是完整的几句话，不是一句一句插播进来的字幕 */}
      <ol className={styles.srOnly}>
        {(script?.steps ?? [])
          .map((step) => step.narration?.trim() ?? '')
          .filter(Boolean)
          .map((sentence, index) => <li key={index}>{sentence}</li>)}
      </ol>
    </div>
  );
}
