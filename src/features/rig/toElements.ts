/**
 * 把一具骨架的某一帧，映射成黑板元素。
 *
 * 关键手法：**局部坐标画形状 + transform 摆位**。
 * 每个部件都在"挂点为原点"的作者坐标系里画好，然后由 `transform="translate(挂点) rotate(骨角)"`
 * 摆到骨上 —— 这就是 Live2D / Spine 的剪影动画思路，也是 `BlackboardElement.transform` 存在的原因。
 * （换一种做法是在路径数据上做坐标变换：弧线命令根本没法简单平移旋转，会画错。）
 *
 * id 用 `rig.id#部件序号`，**每帧都一样** —— 整帧重绘时 React 按 id 复用 DOM，
 * 元素不会无限增长，也不会闪烁。
 */

import type { BlackboardElement, Pt, Rect } from '../blackboard';
import { attachPoint, solveRig } from './solve';
import type { Part, Rig } from './types';

const DEG = 180 / Math.PI;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** 从 path 数据里粗取包围盒：把所有数字按坐标成对读，得到的是**超集**（含控制点）——
 *  只用于擦除动画的框，够用且不用真解析 SVG。 */
function approxPathBBox(d: string): Rect {
  const nums = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!nums || nums.length < 2) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = Number(nums[i]);
    const y = Number(nums[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function bboxOfPoints(pts: Pt[]): Rect {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * 一帧的产物，刻意分成两半：
 * - `elements`：**几何**（局部坐标），每帧完全一样 —— 只在换角色时重算一次
 * - `transforms`：每帧在变的只有 transform —— 交给黑板直接写 DOM 属性，不走 React 重渲染
 *
 * 这么分是因为实测：86 个部件每帧重建 React 元素只能跑到 20fps，
 * 而每帧只改 86 个 transform 属性可以跑到 40fps 以上。
 */
export type RigFrame = {
  elements: BlackboardElement[];
  transforms: Record<string, string>;
};

/** 求解一帧 → 元素 + 每部件的 transform（已按 layer 排好遮挡关系） */
export function rigFrame(rig: Rig, pose: Record<string, number>): RigFrame {
  const world = solveRig(rig, pose);
  const out: BlackboardElement[] = [];
  const transforms: Record<string, string> = {};

  rig.parts.forEach((part: Part, index: number) => {
    const id = `${rig.id}#${index}`;
    const layer = part.layer ?? 0;
    const base = {
      id,
      source: 'ai' as const,
      color: part.color,
      fill: part.fill,
      fillOpacity: part.fillOpacity,
      width: part.width,
      layer,
      label: `${part.kind}:${part.bone}`,
      /** 逐帧动画层：用轻量笔触（详见 BlackboardElement.stream 的注释） */
      stream: true,
    };

    // ① 骨的描边：画在**局部坐标**里（原点→+x 方向 len），靠 transform 摆到骨上。
    //    这一点很关键：几何每帧完全一样，只有 transform 在变 ——
    //    浏览器就能把粉笔滤镜的栅格结果缓存住，React 也只需要改一个属性。
    if (part.kind === 'bone') {
      const w = world.get(part.bone);
      if (!w) return;
      const boneLen = rig.bones.find((b) => b.id === part.bone)?.len ?? Math.hypot(w.ex - w.x, w.ey - w.y);
      transforms[id] = `translate(${r1(w.x)} ${r1(w.y)}) rotate(${r1(w.deg)})`;
      out.push({
        ...base,
        type: 'line',
        render: { points: [[0, 0], [r1(boneLen), 0]] },
        bbox: { x: w.x, y: w.y, w: boneLen, h: 1 },
        seed: 900000 + index * 131,
        taper: part.taper,
        chalkDensity: part.chalkDensity,
        transform: transforms[id],
      });
      return;
    }

    // ② 其余部件都挂在骨的某个位置上
    const ap = attachPoint(rig, world, part.bone, part.at ?? 1);
    if (!ap) return;
    const align = part.align ?? 'bone';
    const transform =
      align === 'bone'
        ? `translate(${r1(ap.x)} ${r1(ap.y)}) rotate(${r1(ap.rad * DEG)})`
        : `translate(${r1(ap.x)} ${r1(ap.y)})`;
    transforms[id] = transform;

    if (part.kind === 'circle') {
      const dx = part.dx ?? 0;
      const dy = part.dy ?? 0;
      const r = part.r;
      out.push({
        ...base,
        type: 'circle',
        render: { cx: dx, cy: dy, r },
        // 圆在局部坐标系里，bbox 只是给擦除动画用的近似框
        bbox: { x: ap.x + dx - r, y: ap.y + dy - r, w: r * 2, h: r * 2 },
        seed: 910000 + index * 137,
        transform,
      });
      return;
    }

    if (part.kind === 'poly') {
      const pts = part.points;
      out.push({
        ...base,
        type: 'path',
        render: { points: pts, smooth: part.smooth, closed: part.closed },
        bbox: (() => {
          const b = bboxOfPoints(pts);
          return { x: b.x + ap.x, y: b.y + ap.y, w: b.w, h: b.h };
        })(),
        seed: 920000 + index * 139,
        transform,
      });
      return;
    }

    // part.kind === 'path'：作者画好的 SVG 路径，原样搬过来，靠 transform 摆位
    const local = approxPathBBox(part.d);
    out.push({
      ...base,
      type: 'path',
      render: { d: part.d },
      bbox: { x: local.x + ap.x, y: local.y + ap.y, w: local.w, h: local.h },
      seed: 930000 + index * 149,
      transform,
    });
  });

  // 稳定排序：同层保持作者写的顺序
  const ordered = out
    .map((el, i) => ({ el, i }))
    .sort((a, b) => (a.el.layer ?? 0) - (b.el.layer ?? 0) || a.i - b.i)
    .map(({ el }) => el);

  return { elements: ordered, transforms };
}

/** 兼容入口：只要元素（几何部分） */
export function rigToElements(rig: Rig, pose: Record<string, number>): BlackboardElement[] {
  return rigFrame(rig, pose).elements;
}
