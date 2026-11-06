/**
 * 粉笔笔迹生成。
 *
 * 几何形状由后端给定，这里只负责"画得像粉笔"。所有随机都从 seed 派生 ——
 * 同一个元素每次渲染、以及截图给别人看，形状都完全一致。
 */

import type { Pt } from './types';
import { pointPressure, pressureFactor } from './brushes';

export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** 把采样点连成 SVG 折线路径 */
export function polylineToPath(pts: Pt[]): string {
  if (!pts.length) return '';
  let d = `M ${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${r1(pts[i][0])} ${r1(pts[i][1])}`;
  return d;
}

/**
 * 沿折线走一遍，按固定间距取点并叠加"平滑漂移"，得到手画的轻微起伏。
 * 用平滑漂移而不是逐点乱抖 —— 逐点抖动看起来像噪点，不像人手。
 * 返回采样点（不是路径字符串）：变宽（压感/起收笔）要用它切片。
 *
 * 压感跟着点走：重采样时按 t 线性插值第三维，变宽才是连续的。
 */
export function wobbleSamples(
  points: Pt[],
  seed: number,
  opts: { closed?: boolean; step?: number; amp?: number } = {},
): Pt[] {
  const { closed = false, step = 16, amp = 1.6 } = opts;
  if (!points || points.length < 2) return [];
  const rnd = mulberry32(seed);
  const src: Pt[] = closed ? [...points, points[0]] : points;
  const out: Pt[] = [];
  let drift = 0;

  for (let i = 0; i < src.length - 1; i++) {
    const [x0, y0] = src[i];
    const [x1, y1] = src[i + 1];
    const p0 = pointPressure(src[i]);
    const p1 = pointPressure(src[i + 1]);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len / step));
    const nx = len ? -(y1 - y0) / len : 0;
    const ny = len ? (x1 - x0) / len : 0;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      drift = drift * 0.74 + (rnd() - 0.5) * amp;
      const taper = k === 0 ? 0.35 : 1; // 起笔收笔稍微收一点
      out.push([
        x0 + (x1 - x0) * t + nx * drift * taper,
        y0 + (y1 - y0) * t + ny * drift * taper,
        p0 + (p1 - p0) * t,
      ]);
    }
  }
  const last = src[src.length - 1];
  out.push([last[0], last[1], pointPressure(last)]);
  return out;
}

/** 手画折线路径 */
export function wobblePath(
  points: Pt[],
  seed: number,
  opts: { closed?: boolean; step?: number; amp?: number } = {},
): string {
  return polylineToPath(wobbleSamples(points, seed, opts));
}

/**
 * 变宽笔迹 → **一条闭合轮廓 path**（而不是把一笔切成十几段）。
 *
 * 沿中心线两侧各偏移半个线宽、首尾封口：1 个 path 顶原来 18 段。
 * 这是性能上的关键一招 —— 实测 44 条压感笔迹按"每段一个 path"切会炸出 600+ path，
 * 每一条都要单独过粉笔滤镜；改成轮廓后是 44 个 path，而且变宽是连续的（没有台阶感）。
 *
 * 宽度来源二选一：逐点压感（`usePressure`）或端点 taper。
 */
export function widthOutline(
  pts: Pt[],
  width: number,
  opts: { taper?: number; usePressure?: boolean } = {},
): string {
  const n = pts.length;
  if (n < 2) return '';
  const usePressure = !!opts.usePressure;
  const taper = opts.taper ?? 0;

  const half: number[] = [];
  for (let i = 0; i < n; i++) {
    let f: number;
    if (usePressure) {
      f = pressureFactor(pointPressure(pts[i]));
    } else {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const edge = Math.min(1, Math.min(t, 1 - t) / 0.3); // 两头 30% 内收细
      f = 1 - taper * (1 - edge) * 0.75;
    }
    half.push(Math.max(0.3, (width * f) / 2));
  }

  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;
    const h = half[i];
    left.push([pts[i][0] + nx * h, pts[i][1] + ny * h]);
    right.push([pts[i][0] - nx * h, pts[i][1] - ny * h]);
  }

  let d = `M ${r1(left[0][0])} ${r1(left[0][1])}`;
  for (let i = 1; i < n; i++) d += ` L ${r1(left[i][0])} ${r1(left[i][1])}`;
  for (let i = n - 1; i >= 0; i--) d += ` L ${r1(right[i][0])} ${r1(right[i][1])}`;
  return `${d} Z`;
}

/**
 * 平滑曲线：Catmull-Rom 样条转三次贝塞尔。
 *
 * 这是"能画有机形状"的地基 —— 给一串采样点，出来的是穿过所有点、
 * 且处处切线连续的曲线。画脸、头发、鲸身、尾巴都用它。
 * tension 0.5 是标准 Catmull-Rom；调小更贴点（接近折线），调大更圆。
 */
export function catmullRomPath(points: Pt[], tension = 0.5, closed = false): string {
  if (!points || points.length < 2) return '';
  const p = points;
  const n = p.length;
  const k = Math.max(0, Math.min(1, tension)) / 0.5; // 0.5 → 1（标准）

  const at = (i: number): Pt => {
    if (closed) return p[((i % n) + n) % n];
    return p[Math.max(0, Math.min(n - 1, i))];
  };

  let d = `M ${r1(p[0][0])} ${r1(p[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1: Pt = [p1[0] + ((p2[0] - p0[0]) / 6) * k, p1[1] + ((p2[1] - p0[1]) / 6) * k];
    const c2: Pt = [p2[0] - ((p3[0] - p1[0]) / 6) * k, p2[1] - ((p3[1] - p1[1]) / 6) * k];
    d += ` C ${r1(c1[0])} ${r1(c1[1])}, ${r1(c2[0])} ${r1(c2[1])}, ${r1(p2[0])} ${r1(p2[1])}`;
  }
  if (closed) d += ' Z';
  return d;
}

/** 由圆心/半径/起止角（度）生成弧线路径；跨 360° 时自动补成整圆 */
export function arcPath(cx: number, cy: number, r: number, startDeg = 0, endDeg = 180): string {
  const norm = (a: number) => ((a % 360) + 360) % 360;
  let delta = endDeg - startDeg;
  if (delta === 0) delta = 360;
  if (Math.abs(delta) >= 360) {
    // 整圆：两段半弧拼起来（单段 arc 画不出闭合圆）
    const a = (startDeg * Math.PI) / 180;
    const x0 = cx + Math.cos(a) * r;
    const y0 = cy + Math.sin(a) * r;
    const x1 = cx - Math.cos(a) * r;
    const y1 = cy - Math.sin(a) * r;
    return `M ${r1(x0)} ${r1(y0)} A ${r1(r)} ${r1(r)} 0 1 1 ${r1(x1)} ${r1(y1)} A ${r1(r)} ${r1(r)} 0 1 1 ${r1(x0)} ${r1(y0)}`;
  }
  const sweep = delta > 0 ? 1 : 0;
  const large = Math.abs(delta) > 180 ? 1 : 0;
  const s = (startDeg * Math.PI) / 180;
  const e = (endDeg * Math.PI) / 180;
  const x0 = cx + Math.cos(s) * r;
  const y0 = cy + Math.sin(s) * r;
  const x1 = cx + Math.cos(e) * r;
  const y1 = cy + Math.sin(e) * r;
  return `M ${r1(x0)} ${r1(y0)} A ${r1(r)} ${r1(r)} 0 ${large} ${sweep} ${r1(x1)} ${r1(y1)}`;
}

/** 手画椭圆（圈注用）：不均匀的闭合曲线，起止处留个出头 */
export function wobbleEllipse(cx: number, cy: number, rx: number, ry: number, seed: number): string {
  const rnd = mulberry32(seed);
  const n = 34;
  const start = rnd() * Math.PI * 2;
  const pts: Pt[] = [];
  for (let i = 0; i <= n + 3; i++) {
    const a = start + (i / n) * Math.PI * 2;
    const wob = 1 + (rnd() - 0.5) * 0.035;
    pts.push([cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * wob]);
  }
  let d = `M ${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [xn, yn] = pts[i + 1];
    d += ` Q ${r1(x)} ${r1(y)} ${r1((x + xn) / 2)} ${r1((y + yn) / 2)}`;
  }
  return d;
}

/** 每个字的轻微歪斜，让文字像手写上去的 */
export function charJitter(seed: number, index: number) {
  const rnd = mulberry32(seed * 7919 + index * 104729);
  return {
    dx: (rnd() - 0.5) * 1.6,
    dy: (rnd() - 0.5) * 2.2,
    rot: (rnd() - 0.5) * 2.4,
    opacity: 0.84 + rnd() * 0.16,
  };
}

/** 与服务端一致的字符宽度估算（CJK 按 1em，西文按 0.55em） */
export function charWidth(ch: string, size: number): number {
  return /[\u2E80-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/.test(ch) ? size : size * 0.55;
}

export function layoutLine(line: string, size: number): { ch: string; x: number }[] {
  const out: { ch: string; x: number }[] = [];
  let x = 0;
  for (const ch of line) {
    out.push({ ch, x });
    x += charWidth(ch, size);
  }
  return out;
}

/**
 * 板面材料（玻璃 + 背后的景色 + 这块板上的笔）也从这个模块出口。
 *
 * 为什么挂在这里：`tools/preview.mjs` 的约定是"直接 import 黑板自己的 chalk.ts，
 * 于是本地渲出来的图 ≈ 屏上的样子"。板面视觉必须走同一条路 —— 样式源在 glass.ts，
 * 这里把它转出去，预览器就不必自己抄一份板面（以前正是抄了一份，于是和屏上漂移）。
 */
export * from './glass';
