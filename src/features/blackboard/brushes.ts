/**
 * 笔刷预设 + 压感 + 简写解析（治"积木感"的那一层）。
 *
 * 核心观念（来自 docs/drawing-design-advice.md B1）：
 * **一切线最终都是「点序列 + 每点压力 + 笔刷」** —— 几何（多边形/骨骼）只是笔库的输出结果。
 * 所以这里给的是「这根线怎么画」，不是「这个形状是什么」。
 *
 * 向后兼容是硬要求：元素没有 `brush` 时，所有取值都退回原来的默认，老 payload 行为一字不变。
 */

import type { BlackboardElement, Pt } from './types';

export type BrushName = 'ink' | 'sketch' | 'flat' | 'bold';

export type BrushSpec = {
  /** 基准线宽 */
  width: number;
  /** 手抖幅度（粉笔抖动采样的 amp） */
  jitter: number;
  /** 粉笔颗粒浓度 */
  chalkDensity: number;
  /** 整体透明度 */
  opacity: number;
  /** 'taper' = 两端细（等价于两端压感归零）；'flat' = 等宽 */
  pressure: 'taper' | 'flat';
  /** 干笔断口：用最破的那档粉笔滤镜 */
  broken?: boolean;
};

/**
 * 四个预设。数值是按"手绘习惯"定的，不是按美术风格定的：
 * - ink    主勾线：细抖、实、两端收 —— 画轮廓
 * - sketch 草图：大抖、半透明、断口多 —— 打草稿，后面要擦掉
 * - flat   排线/铺色：几乎不抖、等宽 —— 大面积
 * - bold   强调：更宽、略抖 —— 重点轮廓、签名
 */
export const BRUSHES: Record<BrushName, BrushSpec> = {
  ink: { width: 3.4, jitter: 0.8, chalkDensity: 0.75, opacity: 1, pressure: 'taper' },
  sketch: { width: 2.6, jitter: 1.8, chalkDensity: 0.3, opacity: 0.5, pressure: 'flat', broken: true },
  flat: { width: 3, jitter: 0.6, chalkDensity: 0.7, opacity: 1, pressure: 'flat' },
  bold: { width: 6, jitter: 1.2, chalkDensity: 0.85, opacity: 1, pressure: 'taper' },
};

/** 取笔刷；名字不认识就当没给（不让一个笔误毁掉整笔） */
export function brushOf(name: string | undefined | null): BrushSpec | null {
  if (!name) return null;
  return (BRUSHES as Record<string, BrushSpec>)[name] ?? null;
}

/** 压感 → 线宽系数：两端细、中间粗（p=0 → 0.35 倍；p=1 → 满宽） */
export function pressureFactor(p: number): number {
  const v = p <= 0 ? 0 : p >= 1 ? 1 : p;
  return 0.35 + 0.65 * v;
}

/** 点有没有带压感（第三维） */
export function pointPressure(pt: Pt): number {
  const p = pt[2];
  return p === undefined || Number.isNaN(p) ? 1 : p;
}

/** 这串点里有没有"明显的压感变化"（全 1 就等于没有，按老路径渲染） */
export function hasPressure(pts: Pt[] | undefined): boolean {
  if (!pts) return false;
  for (const pt of pts) {
    if (pt.length > 2 && pt[2] !== undefined && pt[2] < 0.995) return true;
  }
  return false;
}

/**
 * 解析点序列字符串：`"668,352,.15 700,336,.7"`（空格分点、逗号分 x,y[,p]）。
 * 比嵌套数组省一半 token，坐标可写整数。
 */
export function parsePts(pts: string): Pt[] {
  const out: Pt[] = [];
  for (const chunk of pts.trim().split(/\s+/)) {
    if (!chunk) continue;
    const parts = chunk.split(',');
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (parts.length > 2) {
      const p = Number(parts[2]);
      out.push([x, y, Number.isFinite(p) ? p : 1]);
    } else {
      out.push([x, y]);
    }
  }
  return out;
}

/**
 * 元素归一化：把 `render.pts` 字符串转成 `render.points`。
 * 只在真的需要转的时候才复制对象（不改变引用 = React 能整棵跳过）。
 */
export function normalizeElement(el: BlackboardElement): BlackboardElement {
  const r = el.render;
  if (r.pts && !r.points) {
    const points = parsePts(r.pts);
    if (points.length) return { ...el, render: { ...r, points } };
  }
  return el;
}
