/**
 * 作画能力自测：用**曲线 + 填充**画一张脸。
 *
 * 这份脚本是黑板升级（曲线/填充/旋转/图层/分组/弧线/笔触）的硬证据 ——
 * 它刻意把每个新能力都用上，并且全部走公开的 ops 契约（和真实后端下发的东西同构）。
 *
 * 用到的能力对照：
 * - `path` + `smooth` + `closed` → 脸、头发、肩（有机形状，Catmull-Rom 平滑闭合曲线）
 * - `path` + `d`                 → 刘海（原生三次贝塞尔 C 命令）
 * - `fill` / `fillOpacity`       → 皮肤、头发块、眼白、瞳孔、腮红
 * - `layer`                      → 头发在脸后面：插入顺序在脸之后，靠 layer 压回去
 * - `rotation`                   → 整对眼睛歪 -6°（画歪的眼睛才像人）
 * - `opacity`                    → 腮红组整体压淡
 * - `group`                      → 一对眼睛 / 两块腮红各自成组（动线可整组一起动）
 * - `arc`                        → 眉毛与嘴（不用手算采样点）
 * - `taper`                      → 前面两缕头发（起笔收笔变细）
 * - `chalkDensity`               → 眉毛嘴实、头发丝干
 */

import type { BlackboardElement, BlackboardOp, BlackboardScript } from './types';

const INK = {
  neutral: '#e6eef5',
  primary: '#43d9e6',
  accent: '#ff7aa8',
} as const;

/** 圆（也用来画眼白/瞳孔/腮红/光晕） */
function circ(
  id: string,
  cx: number,
  cy: number,
  r: number,
  color: string,
  opts: { layer: number; seed: number; fill?: string; fillOpacity?: number; width?: number; opacity?: number; label?: string },
): BlackboardOp {
  const el: BlackboardElement = {
    id,
    type: 'circle',
    source: 'ai',
    render: { cx, cy, r },
    bbox: { x: cx - r, y: cy - r, w: r * 2, h: r * 2 },
    color,
    width: opts.width ?? 3,
    seed: opts.seed,
    layer: opts.layer,
    fill: opts.fill,
    fillOpacity: opts.fillOpacity,
    opacity: opts.opacity,
    label: opts.label ?? id,
  };
  return { kind: 'add', element: el };
}

/** 平滑闭合曲线（脸、头发、肩） */
function blob(
  id: string,
  points: [number, number][],
  color: string,
  opts: { layer: number; seed: number; fill: string; fillOpacity: number; width?: number; tension?: number; taper?: number; chalkDensity?: number; label?: string },
): BlackboardOp {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const el: BlackboardElement = {
    id,
    type: 'path',
    source: 'ai',
    render: { points, smooth: true, closed: true, tension: opts.tension ?? 0.5 },
    bbox: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y },
    color,
    width: opts.width ?? 3.4,
    seed: opts.seed,
    layer: opts.layer,
    fill: opts.fill,
    fillOpacity: opts.fillOpacity,
    taper: opts.taper,
    chalkDensity: opts.chalkDensity,
    label: opts.label ?? id,
  };
  return { kind: 'add', element: el };
}

/** 文字 */
function txt(id: string, x: number, y: number, text: string, size: number, color: string, layer: number, seed: number): BlackboardOp {
  return {
    kind: 'add',
    element: {
      id,
      type: 'text',
      source: 'ai',
      render: { x, y, text, size },
      bbox: { x, y, w: text.length * size, h: size * 1.35 },
      color,
      seed,
      layer,
      label: id,
    },
  };
}

/** 弧线（眉毛、嘴） */
function arc(
  id: string,
  cx: number,
  cy: number,
  r: number,
  start: number,
  end: number,
  color: string,
  opts: { layer: number; seed: number; width: number; chalkDensity?: number; label?: string },
): BlackboardOp {
  return {
    kind: 'add',
    element: {
      id,
      type: 'arc',
      source: 'ai',
      render: { cx, cy, r, start, end },
      bbox: { x: cx - r, y: cy - r, w: r * 2, h: r * 2 },
      color,
      width: opts.width,
      seed: opts.seed,
      layer: opts.layer,
      chalkDensity: opts.chalkDensity,
      label: opts.label ?? id,
    },
  };
}

/** 脸与头发的采样点（Catmull-Rom 会穿过它们，所以点不用很密） */
const FACE: [number, number][] = [
  [760, 260], [840, 275], [905, 330], [925, 415], [890, 515], [830, 585],
  [760, 625], [690, 585], [630, 515], [595, 415], [615, 330], [680, 275],
];

const HAIR_BACK: [number, number][] = [
  [760, 195], [885, 215], [970, 300], [995, 425], [965, 545], [905, 640],
  [760, 690], [615, 640], [555, 545], [525, 425], [550, 300], [635, 215],
];

const SHOULDERS: [number, number][] = [
  [760, 640], [880, 665], [990, 720], [1050, 830], [1080, 950],
  [440, 950], [470, 830], [530, 720], [640, 665],
];

const EYE_IDS = ['eyeL-white', 'eyeL-iris', 'eyeL-hi', 'eyeR-white', 'eyeR-iris', 'eyeR-hi'];
const CHEEK_IDS = ['cheekL', 'cheekR'];

/** 刘海：原生三次贝塞尔（C 命令），演示 path 的 d 直给能力 */
const BANGS_D =
  'M 610 345 C 645 255, 760 225, 875 262 C 905 272, 918 300, 922 338 ' +
  'C 880 300, 838 288, 796 296 C 752 304, 700 318, 660 350 C 640 366, 620 362, 610 345 Z';

export function buildDrawTestScript(): BlackboardScript {
  return {
    size: { w: 1600, h: 1000 },
    steps: [
      {
        narration: '先画一张脸的轮廓。',
        ops: [
          // 头后的一圈光晕（压得很淡：它只是氛围，不该看着像气泡）
          circ('draw-halo', 760, 470, 310, INK.primary, {
            layer: 0, seed: 501, fill: INK.primary, fillOpacity: 0.07, width: 1.4, opacity: 0.3, label: '光晕',
          }),
          blob('draw-face', FACE, INK.neutral, {
            layer: 3, seed: 502, fill: INK.neutral, fillOpacity: 0.16, width: 3.6, label: '脸',
          }),
        ],
      },
      {
        narration: '头发先铺后面那一层，再垫上肩。',
        ops: [
          // 注意：这一笔在脸之后插入，但 layer=1 < 脸的 3，所以仍然画在脸后面
          blob('draw-hair-back', HAIR_BACK, INK.primary, {
            layer: 1, seed: 503, fill: INK.primary, fillOpacity: 0.22, width: 3.4, label: '后发',
          }),
          blob('draw-shoulders', SHOULDERS, INK.primary, {
            layer: 2, seed: 504, fill: INK.primary, fillOpacity: 0.18, width: 3.4, label: '肩',
          }),
        ],
      },
      {
        narration: '五官放上去：眼睛、眉毛、腮红、嘴。',
        ops: [
          // 眼睛整对成组，一起歪 -6°（group + rotation）
          {
            kind: 'add',
            element: {
              id: 'draw-eye-group',
              type: 'group',
              source: 'ai',
              render: { children: EYE_IDS },
              bbox: { x: 664, y: 440, w: 192, h: 70 },
              seed: 530,
              layer: 4,
              rotation: -6,
              label: '眼组',
            },
          },
          circ('eyeL-white', 700, 475, 32, INK.neutral, { layer: 4, seed: 505, fill: INK.neutral, fillOpacity: 0.85, label: '左眼白' }),
          circ('eyeL-iris', 703, 477, 17, INK.primary, { layer: 4, seed: 506, fill: INK.primary, fillOpacity: 0.95, width: 2.4, label: '左瞳' }),
          circ('eyeL-hi', 695, 467, 6, INK.neutral, { layer: 4, seed: 507, fill: INK.neutral, fillOpacity: 1, width: 1.4, label: '左高光' }),
          circ('eyeR-white', 820, 475, 32, INK.neutral, { layer: 4, seed: 508, fill: INK.neutral, fillOpacity: 0.85, label: '右眼白' }),
          circ('eyeR-iris', 817, 477, 17, INK.primary, { layer: 4, seed: 509, fill: INK.primary, fillOpacity: 0.95, width: 2.4, label: '右瞳' }),
          circ('eyeR-hi', 809, 467, 6, INK.neutral, { layer: 4, seed: 510, fill: INK.neutral, fillOpacity: 1, width: 1.4, label: '右高光' }),
          // 腮红成组，整组压到 0.9（group + opacity）
          {
            kind: 'add',
            element: {
              id: 'draw-cheek-group',
              type: 'group',
              source: 'ai',
              render: { children: CHEEK_IDS },
              bbox: { x: 618, y: 503, w: 284, h: 64 },
              seed: 531,
              layer: 4,
              opacity: 0.9,
              label: '腮红组',
            },
          },
          circ('cheekL', 650, 535, 32, INK.accent, { layer: 4, seed: 511, fill: INK.accent, fillOpacity: 0.28, width: 2.6, label: '左腮红' }),
          circ('cheekR', 870, 535, 32, INK.accent, { layer: 4, seed: 512, fill: INK.accent, fillOpacity: 0.28, width: 2.6, label: '右腮红' }),
          // 眉毛与嘴用弧线：不用手算采样点
          arc('browL', 700, 420, 46, 205, 335, INK.primary, { layer: 4, seed: 513, width: 4.2, chalkDensity: 0.8, label: '左眉' }),
          arc('browR', 820, 420, 46, 205, 335, INK.primary, { layer: 4, seed: 514, width: 4.2, chalkDensity: 0.8, label: '右眉' }),
          arc('mouth', 760, 550, 52, 35, 145, INK.accent, { layer: 4, seed: 515, width: 4.4, chalkDensity: 0.85, label: '嘴' }),
        ],
      },
      {
        narration: '前面几缕头发压上来，就画完了。',
        ops: [
          // 起笔收笔变细 + 干粉笔：发丝
          blob('strandL', [[615, 330], [575, 480], [565, 650], [585, 800], [620, 880]], INK.primary, {
            layer: 5, seed: 516, fill: INK.primary, fillOpacity: 0.1, width: 7, taper: 0.7, chalkDensity: 0.28, label: '左发丝',
          }),
          blob('strandR', [[905, 330], [945, 480], [955, 650], [935, 800], [900, 880]], INK.primary, {
            layer: 5, seed: 517, fill: INK.primary, fillOpacity: 0.1, width: 7, taper: 0.7, chalkDensity: 0.28, label: '右发丝',
          }),
          {
            kind: 'add',
            element: {
              id: 'draw-bangs',
              type: 'path',
              source: 'ai',
              render: { d: BANGS_D },
              bbox: { x: 610, y: 225, w: 312, h: 141 },
              color: INK.primary,
              width: 3.2,
              seed: 518,
              layer: 6,
              fill: INK.primary,
              fillOpacity: 0.4,
              label: '刘海',
            },
          },
          txt('draw-title', 100, 90, '她在纸上被画出来', 44, INK.primary, 8, 519),
          txt('draw-sub', 100, 165, '曲线 · 填充 · 旋转 · 图层 · 分组', 28, INK.neutral, 8, 520),
          { kind: 'pointer', bbox: { x: 595, y: 260, w: 330, h: 365 }, ms: 2600 },
        ],
      },
    ],
    ops: [],
  };
}
