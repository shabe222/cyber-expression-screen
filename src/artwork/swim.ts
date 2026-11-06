/**
 * 流动动画 · 游动的鲸鱼（B3 进阶：连续动画）
 *
 * 原理（读过黑板源码）：黑板按 `paceMs`（默认 170ms）**逐个播 ops**，且 `update` op 会留残影（ghost）。
 * 所以「同一元素的多帧 update」= 逐帧动画 —— 与 world.execute(me) 的逐帧渲染同源。
 * 本脚本 12 帧：鲸鱼从左边游到右边，身体上下起伏、尾鳍摆动，气泡上升。
 */
import type { BlackboardElement, BlackboardOp, BlackboardScript, Pt } from '../features/blackboard/types';

const SIZE = { w: 1600, h: 1000 } as const;
const FRAMES = 12;
let seed = 70001;

function bboxOf(pts: Pt[]) {
  const xs = pts.map(p => p[0]); const ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
const shift = (pts: Pt[], dx: number, dy: number): Pt[] => pts.map(([x, y]) => [x + dx, y + dy]);

/** 鲸鱼基础形状（局部坐标，原点≈身体中心） */
const BODY: Pt[] = [[-120, 40], [-100, -10], [-54, -42], [10, -50], [72, -30], [112, 4], [128, 46], [106, 84], [56, 106], [-6, 108], [-66, 92], [-106, 66]];
const FLUKE: Pt[] = [[-120, 40], [-168, 16], [-222, 4], [-194, 38], [-222, 74], [-168, 60]];
const BELLY: Pt[] = [[-70, 96], [-10, 106], [50, 100], [92, 80], [58, 104], [-4, 112], [-62, 102]];

function whaleFrame(cx: number, cy: number, flukeRot: number, s: number): BlackboardElement[] {
  const at = (pts: Pt[]) => shift(pts, cx, cy);
  const mk = (id: string, pts: Pt[], color: string, extra: Partial<BlackboardElement> = {}): BlackboardElement => {
    const p = at(pts);
    return {
      id, type: 'path', source: 'ai',
      render: { points: p, smooth: true, closed: true, tension: 0.5 },
      bbox: bboxOf(p), color, width: 3.2, seed: seed++,
      fill: color, fillOpacity: 0.9, chalkDensity: 0.9, ...extra,
    };
  };
  return [
    mk('w-body', BODY, '#8fd4f0'),
    mk('w-fluke', FLUKE, '#8fd4f0', { fillOpacity: 0.92, rotation: flukeRot }),
    mk('w-belly', BELLY, '#dff3ff', { fillOpacity: 0.45, chalkDensity: 0.4 }),
    // 眼
    {
      id: 'w-eye', type: 'circle', source: 'ai',
      render: { cx: cx + 62, cy: cy - 14, r: 8 },
      bbox: { x: cx + 54, y: cy - 22, w: 16, h: 16 },
      color: '#0d1c2b', width: 0.6, seed: seed++, fill: '#0d1c2b', fillOpacity: 0.95, chalkDensity: 0.9,
    },
    {
      id: 'w-eyehi', type: 'circle', source: 'ai',
      render: { cx: cx + 59, cy: cy - 17, r: 3 },
      bbox: { x: cx + 56, y: cy - 20, w: 6, h: 6 },
      color: '#ffffff', width: 0.5, seed: seed++, fill: '#ffffff', fillOpacity: 0.95, chalkDensity: 0.9,
    },
    // 喷水（随身体起伏）
    {
      id: 'w-spout', type: 'path', source: 'ai',
      render: { points: [[cx + 6, cy - 52], [cx + 4, cy - 92], [cx + 2, cy - 126]], smooth: true, closed: false, tension: 0.5 },
      bbox: { x: cx + 2, y: cy - 126, w: 6, h: 74 },
      color: '#bfe6f7', width: 3.6, seed: seed++,
    },
  ];
}

function bubbles(cx: number, cy: number, alpha: number): BlackboardElement[] {
  const mk = (id: string, x: number, y: number, r: number, a: number): BlackboardElement => ({
    id, type: 'circle', source: 'ai',
    render: { cx: x, cy: y, r },
    bbox: { x: x - r, y: y - r, w: r * 2, h: r * 2 },
    color: '#bfe6f7', width: 2.2, seed: seed++, fill: '#bfe6f7', fillOpacity: a, chalkDensity: 0.5,
  });
  return [mk('b1', cx + 150, cy - 60, 9, alpha), mk('b2', cx + 178, cy - 96, 6, alpha * 0.9), mk('b3', cx + 162, cy - 132, 4, alpha * 0.8)];
}

function build(): BlackboardScript {
  const ops: BlackboardOp[] = [];
  const startX = 330, startY = 520;
  for (let f = 0; f < FRAMES; f++) {
    const t = f / (FRAMES - 1);
    const cx = startX + t * 900;                        // 从左游到右
    const cy = startY + Math.sin(t * Math.PI * 2.2) * 30; // 起伏
    const flukeRot = Math.sin(t * Math.PI * 5) * 16;    // 尾鳍摆
    const els = [...whaleFrame(cx, cy, flukeRot, 1), ...bubbles(cx, cy, 0.55 - t * 0.35)];
    for (const e of els) ops.push({ kind: f === 0 ? 'add' : 'update', element: e } as BlackboardOp);
  }
  // 收尾：气泡淡出（最后一帧再更新一次透明度）
  return { size: SIZE, ops };
}

export const swimWhale: BlackboardScript = build();
