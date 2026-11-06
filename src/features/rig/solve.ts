/**
 * 正向运动学（FK）求解 + 关键帧插值。
 *
 * 纯函数、无副作用、不碰 DOM —— 这样播放器和测试都能直接用。
 */

import type { BoneWorld, Rig } from './types';

const DEG = Math.PI / 180;

/**
 * 按 bones 数组顺序（父在前）求解每根骨的世界变换。
 *
 * 每根骨：
 *   1. 挂点 = 父骨起点 + 父骨方向 × 父骨长 × at
 *   2. 世界角 = 父骨世界角 + rest + pose[id]
 *   3. 终点 = 挂点 + (cos, sin) × len
 * 根骨：起点 = root + (__dx,__dy)，父角视为 __rot。
 *
 * 父骨缺失（数据写错）时跳过这根骨而不是抛错 —— 一个笔误不该让整屏白掉。
 */
export function solveRig(rig: Rig, pose: Record<string, number>): Map<string, BoneWorld> {
  const out = new Map<string, BoneWorld>();
  const dx = pose.__dx ?? 0;
  const dy = pose.__dy ?? 0;
  const rootRot = pose.__rot ?? 0;
  const boneById = new Map(rig.bones.map((b) => [b.id, b]));

  for (const bone of rig.bones) {
    const offset = pose[bone.id] ?? 0;
    let sx: number;
    let sy: number;
    let parentDeg: number;

    if (!bone.parent) {
      sx = rig.root.x + dx;
      sy = rig.root.y + dy;
      parentDeg = rootRot;
    } else {
      const parentWorld = out.get(bone.parent);
      const parentBone = boneById.get(bone.parent);
      if (!parentWorld || !parentBone) continue;
      const at = bone.at ?? 1;
      sx = parentWorld.x + Math.cos(parentWorld.rad) * parentBone.len * at;
      sy = parentWorld.y + Math.sin(parentWorld.rad) * parentBone.len * at;
      parentDeg = parentWorld.deg;
    }

    const deg = parentDeg + bone.rest + offset;
    const rad = deg * DEG;
    out.set(bone.id, {
      x: sx,
      y: sy,
      ex: sx + Math.cos(rad) * bone.len,
      ey: sy + Math.sin(rad) * bone.len,
      deg,
      rad,
    });
  }

  return out;
}

/** 骨上的挂点（0~1）：渲染件按它定位 */
export function attachPoint(
  rig: Rig,
  world: Map<string, BoneWorld>,
  boneId: string,
  at = 1,
): { x: number; y: number; rad: number } | null {
  const w = world.get(boneId);
  if (!w) return null;
  const bone = rig.bones.find((b) => b.id === boneId);
  const len = bone?.len ?? 0;
  return { x: w.x + Math.cos(w.rad) * len * at, y: w.y + Math.sin(w.rad) * len * at, rad: w.rad };
}

/** 缓动 */
export function ease(u: number, kind: 'linear' | 'sine' | 'cubic' = 'sine'): number {
  const x = u <= 0 ? 0 : u >= 1 ? 1 : u;
  if (kind === 'linear') return x;
  if (kind === 'cubic') return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  // sine：两头速度为 0，循环时不会在关键帧上"顿"一下
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

/**
 * 取 t（0~1，可越界）处各骨的偏移量。
 * 缺失的骨视为 0；关键帧之间的最后一段自动绕回第一帧，保证首尾接得上。
 */
export function poseAt(rig: Rig, t: number): Record<string, number> {
  const kfs = rig.keyframes;
  if (!kfs || kfs.length === 0) return {};
  if (kfs.length === 1) return { ...kfs[0].pose };

  const tt = ((t % 1) + 1) % 1;

  let i = 0;
  for (; i < kfs.length - 1; i++) {
    if (tt < kfs[i + 1].t) break;
  }
  const a = kfs[i];
  const b = kfs[(i + 1) % kfs.length];
  // 最后一段跨过 1.0 绕回第一帧
  const span = i === kfs.length - 1 ? 1 + b.t - a.t : b.t - a.t;
  const u = span > 0 ? (tt - a.t) / span : 0;
  const e = ease(u, rig.easing ?? 'sine');

  const keys = new Set([...Object.keys(a.pose), ...Object.keys(b.pose)]);
  const out: Record<string, number> = {};
  for (const k of keys) {
    const av = a.pose[k] ?? 0;
    const bv = b.pose[k] ?? 0;
    out[k] = av + (bv - av) * e;
  }
  return out;
}
