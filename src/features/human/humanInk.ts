/**
 * 人类笔迹的构造（B2「你画」）。
 *
 * 人和 AI 共用同一套黑板元素契约，只在 `source` 上区分：
 * - `source: 'human'` → 用户的笔迹色（三色体系里的强调色），画在最上层
 * - `source: 'ai'`    → agent 画的，维持各自的颜色
 *
 * 这样"你画"和"我画"叠在同一块板上，谁也不用迁就谁。
 */

import type { BlackboardElement, Pt } from '../blackboard';

/** 用户的笔迹色：强调色（鲸尾粉），一眼能认出哪一笔是自己画的 */
export const HUMAN_INK = '#ff7aa8';

/** 人的笔迹画在所有 AI 内容之上 */
export const HUMAN_LAYER = 60;

let seq = 0;

function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

function bboxOfPoints(pts: Pt[], pad = 8) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x: x - pad,
    y: y - pad,
    w: Math.max(...xs) - x + pad * 2,
    h: Math.max(...ys) - y + pad * 2,
  };
}

/**
 * 一笔手绘 → `stroke` 元素。
 *
 * 开 `smooth`：鼠标采样点是折线，交给黑板做 Catmull-Rom 平滑才像人画的。
 * 给 `taper`：起笔收笔细一点，手写的味道就出来了。
 */
export function strokeElement(points: Pt[]): BlackboardElement {
  return {
    id: nextId('human-stroke'),
    type: 'stroke',
    source: 'human',
    render: { points, smooth: true, closed: false, tension: 0.5 },
    bbox: bboxOfPoints(points),
    color: HUMAN_INK,
    width: 4.4,
    seed: 700000 + seq * 977,
    layer: HUMAN_LAYER,
    taper: 0.4,
    chalkDensity: 0.85,
    label: '我的笔迹',
  };
}

/** 心情文字放哪：板面左上往下排，排满 6 条换一列（避开中间那幅涂鸦） */
export function moodTextSlot(index: number): { x: number; y: number } {
  const col = Math.floor(index / 6);
  const row = index % 6;
  return { x: 110 + col * 560, y: 90 + row * 58 };
}

/** 心情文字 → `text` 元素（以用户的笔迹色写上板） */
export function moodTextElement(text: string, index: number): BlackboardElement {
  const size = 34;
  const { x, y } = moodTextSlot(index);
  return {
    id: nextId('human-mood'),
    type: 'text',
    source: 'human',
    render: { x, y, text, size },
    bbox: { x, y, w: Math.max(1, text.length) * size, h: size * 1.35 },
    color: HUMAN_INK,
    seed: 800000 + index * 613,
    layer: HUMAN_LAYER + 1,
    label: '我的心情',
  };
}
