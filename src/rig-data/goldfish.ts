/**
 * 金鱼少女 · 分部件 SVG + 骨骼驱动（Lead 手作 · v3）
 *
 * 方法论转向（v1/v2 失败的教训）：
 *   手工盲写多边形拼角色 = 火柴人/一团糊。**正路是照旧用 SVG 画好每个部件**（我的强项），
 *   再把每个部件挂到一根骨上，由骨骼变换驱动 —— 即 Live2D/Spine 的剪影动画思路。
 *   部件内部坐标 = 作者坐标系（原点在挂点），渲染时套 `<g transform="translate(挂点) rotate(骨角)">`。
 *
 * 规格 docs/rig-format.md；角度 0=正右，顺时针为正（SVG y 向下）。
 */
import type { Bone, Keyframe, Part, Rig } from '../features/rig/types';

/* ─────────── 骨架（Q版：大头 + 短粗四肢 + 长尾） ─────────── */
const BONES: Bone[] = [
  { id: 'hip', parent: null, len: 0, rest: 0 },
  { id: 'spine', parent: 'hip', len: 76, rest: -90 },
  { id: 'chest', parent: 'spine', len: 62, rest: 0 },
  { id: 'neck', parent: 'chest', len: 22, rest: 0 },
  { id: 'head', parent: 'neck', len: 30, rest: 0 },

  /* 手臂 rest 的参照是**父骨 chest 的世界角 = -90°（朝上）**，
   * 所以"垂下来"要写 ~180±20，写 38/102 会变成**朝上/横着**（踩过）。 */
  { id: 'armLU', parent: 'chest', len: 64, rest: 200, at: 0.72 },
  { id: 'armLF', parent: 'armLU', len: 56, rest: -12 },
  { id: 'armRU', parent: 'chest', len: 64, rest: 160, at: 0.72 },
  { id: 'armRF', parent: 'armRU', len: 56, rest: 12 },

  { id: 'thighL', parent: 'hip', len: 76, rest: 98 },
  { id: 'shinL', parent: 'thighL', len: 72, rest: -6 },
  { id: 'footL', parent: 'shinL', len: 34, rest: -76 },
  { id: 'thighR', parent: 'hip', len: 76, rest: 82 },
  { id: 'shinR', parent: 'thighR', len: 72, rest: 6 },
  { id: 'footR', parent: 'shinR', len: 34, rest: -76 },

  { id: 'tail1', parent: 'hip', len: 46, rest: 170 },
  { id: 'tail2', parent: 'tail1', len: 42, rest: 6 },
  { id: 'tail3', parent: 'tail2', len: 38, rest: 8 },
];

const C = {
  skin: '#ffe6d4', skinShade: '#f3c9ad',
  hair: '#ff8f4d', hairDeep: '#e8652e', hairLight: '#ffbe86',
  dress: '#ff7a4d', dressDeep: '#cf4d28', trim: '#ffd98a',
  fin: '#ffb37a', finEdge: '#ff8a4c', finLight: '#ffe0c4',
  farSkin: '#e0b195', farHair: '#d97240',
  ink: '#3a241c', eye: '#37a6e2', eyeDeep: '#1f7fb8', white: '#fffaf4', blush: '#ff9db3',
};

/* 部件：path 的 d 用「挂点为原点」的局部坐标 */
const PARTS: Part[] = [
  /* ══ 远侧腿 / 手臂（暗色，压在最底） ══ */
  { kind: 'bone', bone: 'thighL', color: C.farSkin, width: 48, taper: 0.28, layer: 1 },
  { kind: 'bone', bone: 'shinL', color: C.farSkin, width: 42, taper: 0.32, layer: 1 },
  { kind: 'path', bone: 'footL', at: 0.5, align: 'bone', color: '#7d3f26', fill: '#a3532f', fillOpacity: 0.95, width: 3,
    d: 'M -18 -18 C 8 -22 26 -14 30 2 C 32 16 18 22 -2 22 C -18 22 -26 12 -24 -2 Z', layer: 1 },
  { kind: 'bone', bone: 'armLU', color: C.farSkin, width: 40, taper: 0.3, layer: 2 },
  { kind: 'bone', bone: 'armLF', color: C.farSkin, width: 36, taper: 0.34, layer: 2 },

  /* ══ 金鱼大尾（三节 + 双层大尾鳍，跟骨摆） ══ */
  { kind: 'bone', bone: 'tail1', color: C.finEdge, width: 34, taper: 0.32, layer: 2 },
  { kind: 'bone', bone: 'tail2', color: C.finEdge, width: 28, taper: 0.32, layer: 2 },
  { kind: 'bone', bone: 'tail3', color: C.finEdge, width: 22, taper: 0.32, layer: 2 },
  // 外层大尾鳍：**向后飘的长双叶**（叶尖只 ±50 张角；张太开像两片树叶，踩过）
  { kind: 'path', bone: 'tail3', at: 1, align: 'bone', color: C.finEdge, fill: C.fin, fillOpacity: 0.92, width: 4, layer: 2,
    d: 'M 0 -14 C 44 -54 106 -72 158 -60 C 178 -56 182 -30 160 -14 C 120 2 58 8 0 -4 Z' },
  { kind: 'path', bone: 'tail3', at: 1, align: 'bone', color: C.finEdge, fill: C.fin, fillOpacity: 0.92, width: 4, layer: 2,
    d: 'M 0 14 C 44 54 106 72 158 60 C 178 56 182 30 160 14 C 120 -2 58 -8 0 4 Z' },
  // 中间飘带
  { kind: 'path', bone: 'tail3', at: 1, align: 'bone', color: C.finLight, width: 9, layer: 3,
    d: 'M 4 0 C 44 -8 92 -4 138 0' },
  // 内层透光
  { kind: 'path', bone: 'tail3', at: 1, align: 'bone', color: C.finLight, fill: C.finLight, fillOpacity: 0.5, width: 2.6, layer: 3,
    d: 'M 16 -10 C 42 -38 80 -58 120 -66 C 142 -70 152 -56 138 -40 C 116 -18 80 -8 52 -8 C 34 -8 24 -12 16 -8 Z' },
  { kind: 'path', bone: 'tail3', at: 1, align: 'bone', color: C.finLight, fill: C.finLight, fillOpacity: 0.5, width: 2.6, layer: 3,
    d: 'M 16 10 C 40 36 76 56 114 64 C 136 68 146 54 134 38 C 112 16 78 8 50 8 C 32 8 24 12 16 8 Z' },
  // 尾根小鳍（分叉感）
  { kind: 'path', bone: 'tail2', at: 1, align: 'bone', color: C.finEdge, fill: C.fin, fillOpacity: 0.85, width: 3, layer: 2,
    d: 'M 0 -18 C 24 -54 60 -74 88 -66 C 96 -62 96 -46 84 -34 C 60 -30 30 -14 0 18 Z' },

  /* ══ 躯干：和服式连衣裙（收窄，好让手臂露在轮廓外） ══ */
  { kind: 'path', bone: 'spine', at: 0.5, align: 'world', color: C.dressDeep, fill: C.dress, fillOpacity: 0.97, width: 4, layer: 4,
    d: 'M -44 -70 C -18 -86 18 -86 44 -70 L 52 6 L 72 58 C 50 78 18 86 -18 86 C -50 78 -72 62 -72 58 L -52 6 Z' },
  // 腰带
  { kind: 'path', bone: 'spine', at: 0.5, align: 'world', color: C.trim, fill: C.trim, fillOpacity: 0.92, width: 3, layer: 5,
    d: 'M -50 0 L 50 0 L 54 26 L -54 26 Z' },
  // 裙上金鱼小纹（点题）
  { kind: 'path', bone: 'spine', at: 0.5, align: 'world', color: C.trim, fill: C.trim, fillOpacity: 0.78, width: 2.4, layer: 5,
    d: 'M -22 46 C -10 40 4 44 8 54 C 4 64 -10 68 -22 62 C -28 58 -28 50 -22 46 Z' },
  { kind: 'path', bone: 'spine', at: 0.5, align: 'world', color: C.trim, width: 2.2, layer: 5,
    d: 'M 14 52 C 24 50 32 52 34 56' },
  // 领口（V 字 + 金鱼尾纹）
  { kind: 'path', bone: 'chest', at: 0.15, align: 'world', color: C.trim, fill: C.trim, fillOpacity: 0.9, width: 3, layer: 6,
    d: 'M -30 -6 C -14 18 14 18 30 -6 L 20 22 L 0 34 L -20 22 Z' },
  // 背鳍（world 放，贴后背）
  { kind: 'path', bone: 'chest', at: 0.5, align: 'world', color: C.finEdge, fill: C.fin, fillOpacity: 0.9, width: 3, layer: 3,
    d: 'M -40 -14 C -78 -30 -104 -62 -96 -84 C -70 -76 -46 -50 -30 -20 Z' },

  /* ══ 近侧腿 + 靴 ══ */
  { kind: 'bone', bone: 'thighR', color: C.skin, width: 50, taper: 0.28, layer: 6 },
  { kind: 'bone', bone: 'shinR', color: C.skin, width: 44, taper: 0.32, layer: 6 },
  { kind: 'path', bone: 'footR', at: 0.5, align: 'bone', color: '#6f3620', fill: '#96492a', fillOpacity: 0.97, width: 3.2, layer: 7,
    d: 'M -20 -20 C 10 -24 30 -14 34 4 C 36 20 20 26 -2 26 C -20 26 -30 14 -28 -2 Z' },

  /* ══ 近侧手臂 + 胸鳍（layer 10：画在后层头发之上，否则被头发吞掉） ══ */
  { kind: 'bone', bone: 'armRU', color: C.skin, width: 42, taper: 0.3, layer: 10 },
  { kind: 'bone', bone: 'armRF', color: C.skin, width: 38, taper: 0.34, layer: 10 },
  { kind: 'path', bone: 'armRU', at: 0.62, align: 'bone', color: C.finEdge, fill: C.fin, fillOpacity: 0.88, width: 3, layer: 9,
    d: 'M 0 -12 C 34 -12 64 8 78 40 C 48 44 16 28 -6 4 Z' },

  /* ══ 脖子 ══ */
  { kind: 'bone', bone: 'neck', color: C.skin, width: 40, layer: 8 },

  /* ══ 后层长发（收短到腰以上，否则会把身体和手臂全遮住，踩过） ══ */
  { kind: 'path', bone: 'head', at: 1, align: 'world', color: C.hairDeep, fill: C.hair, fillOpacity: 0.97, width: 4, layer: 8,
    d: 'M -8 -186 C 66 -186 126 -130 122 -52 C 118 6 100 40 96 88 C 92 118 74 132 52 122 C 26 110 12 84 10 54 C -30 60 -78 42 -98 6 C -120 -34 -98 -86 -58 -126 C -38 -146 -24 -186 -8 -186 Z' },

  /* ══ 头（大圆润脸） ══ */
  { kind: 'path', bone: 'head', at: 1, align: 'world', color: C.skinShade, fill: C.skin, fillOpacity: 0.99, width: 4, layer: 9,
    d: 'M 0 -166 C 54 -166 96 -128 96 -70 C 96 -14 56 26 0 26 C -56 26 -96 -14 -96 -70 C -96 -128 -54 -166 0 -166 Z' },

  /* ══ 前发 / 刘海（压住额头） ══ */
  { kind: 'path', bone: 'head', at: 1, align: 'world', color: C.hairDeep, fill: C.hairLight, fillOpacity: 0.95, width: 3.6, layer: 10,
    d: 'M -98 -60 C -80 -128 -20 -170 52 -156 C 96 -148 116 -120 112 -84 C 92 -122 46 -140 0 -130 C -46 -120 -80 -96 -98 -60 Z' },
  // 头顶金鱼尾发饰
  { kind: 'path', bone: 'head', at: 1, align: 'world', color: C.trim, fill: C.trim, fillOpacity: 0.97, width: 3.4, layer: 11,
    d: 'M -6 -172 C -46 -204 -52 -240 -16 -230 C -8 -252 26 -250 32 -226 C 62 -232 76 -204 48 -184 C 30 -172 6 -164 -6 -172 Z' },

  /* ══ 大眼睛（Q版：白底 + 大虹膜 + 双高光）
   *  注意：head 骨世界角是 -90°（竖着），所以 head 上的**圆也必须 align:'world'**，
   *  否则 dx/dy 会被旋转 90° —— 虹膜跑到脸颊外（踩过）。 */
  { kind: 'path', bone: 'head', at: 1, align: 'world', color: C.ink, fill: C.white, fillOpacity: 0.98, width: 3, layer: 12,
    d: 'M 12 -104 C 44 -112 70 -94 70 -66 C 70 -38 46 -22 18 -28 C -6 -34 -14 -58 -8 -80 C -4 -94 4 -101 12 -104 Z' },
  { kind: 'circle', bone: 'head', at: 1, align: 'world', dx: 40, dy: -64, r: 20, color: C.eyeDeep, fill: C.eye, fillOpacity: 0.98, layer: 13 },
  { kind: 'circle', bone: 'head', at: 1, align: 'world', dx: 34, dy: -74, r: 7.5, color: C.white, fill: C.white, fillOpacity: 1, layer: 14 },
  { kind: 'circle', bone: 'head', at: 1, align: 'world', dx: 48, dy: -54, r: 3.4, color: C.white, fill: C.white, fillOpacity: 0.85, layer: 14 },
  { kind: 'path', bone: 'head', at: 1, align: 'world', color: C.ink, fill: C.white, fillOpacity: 0.98, width: 3, layer: 12,
    d: 'M -74 -100 C -46 -110 -22 -94 -22 -68 C -22 -42 -44 -26 -68 -32 C -88 -38 -96 -58 -92 -78 C -89 -92 -82 -98 -74 -100 Z' },
  { kind: 'circle', bone: 'head', at: 1, align: 'world', dx: -50, dy: -64, r: 18, color: C.eyeDeep, fill: C.eye, fillOpacity: 0.98, layer: 13 },
  { kind: 'circle', bone: 'head', at: 1, align: 'world', dx: -56, dy: -73, r: 6.8, color: C.white, fill: C.white, fillOpacity: 1, layer: 14 },
  // 眉毛
  { kind: 'path', bone: 'head', at: 1, align: 'world', color: C.hairDeep, width: 6, layer: 13,
    d: 'M 14 -124 C 34 -134 58 -132 72 -122' },
  { kind: 'path', bone: 'head', at: 1, align: 'world', color: C.hairDeep, width: 6, layer: 13,
    d: 'M -76 -122 C -60 -132 -38 -132 -24 -124' },
  // 腮红 + 嘴
  { kind: 'circle', bone: 'head', at: 1, align: 'world', dx: 76, dy: -30, r: 16, color: C.blush, fill: C.blush, fillOpacity: 0.4, layer: 13 },
  { kind: 'circle', bone: 'head', at: 1, align: 'world', dx: -80, dy: -32, r: 14, color: C.blush, fill: C.blush, fillOpacity: 0.4, layer: 13 },
  { kind: 'path', bone: 'head', at: 1, align: 'world', color: '#c8553f', width: 4.5, layer: 13,
    d: 'M -8 -34 C -2 -24 8 -24 14 -34' },
];

/* ─────────── 动作（正弦驱动） ─────────── */
const K = 16;
function runKeys(): Keyframe[] {
  const kfs: Keyframe[] = [];
  for (let i = 0; i < K; i++) {
    const t = i / K, ph = t * Math.PI * 2, sw = 42;
    kfs.push({ t, pose: {
      __dy: -10 * Math.sin(ph * 2) - 6, __rot: -8,
      spine: 5 * Math.sin(ph * 2), chest: -4 * Math.sin(ph * 2), head: -5 - 4 * Math.sin(ph * 2),
      thighR: sw * Math.cos(ph), shinR: -36 + 32 * Math.cos(ph - 1.0), footR: 22 * Math.cos(ph - 1.6),
      thighL: -sw * Math.cos(ph), shinL: -36 + 32 * Math.cos(ph - 1.0 + Math.PI), footL: 22 * Math.cos(ph - 1.6 + Math.PI),
      armRU: -sw * 0.8 * Math.cos(ph), armRF: -22 + 20 * Math.cos(ph - 0.8),
      armLU: sw * 0.8 * Math.cos(ph), armLF: -22 + 20 * Math.cos(ph - 0.8 + Math.PI),
      tail1: 13 * Math.sin(ph), tail2: 18 * Math.sin(ph - 0.7), tail3: 24 * Math.sin(ph - 1.4),
    }});
  }
  return kfs;
}
function idleKeys(): Keyframe[] {
  const kfs: Keyframe[] = [];
  for (let i = 0; i < K; i++) {
    const t = i / K, ph = t * Math.PI * 2;
    kfs.push({ t, pose: {
      __dy: 5 * Math.sin(ph), spine: 3 * Math.sin(ph), head: -2 - 3 * Math.sin(ph),
      armRU: 5 * Math.sin(ph + 0.4), armLU: -5 * Math.sin(ph + 0.4),
      armRF: 4 * Math.sin(ph + 0.9), armLF: -4 * Math.sin(ph + 0.9),
      thighR: 2.5 * Math.sin(ph), thighL: -2.5 * Math.sin(ph),
      tail1: 9 * Math.sin(ph), tail2: 14 * Math.sin(ph - 0.6), tail3: 20 * Math.sin(ph - 1.2),
    }});
  }
  return kfs;
}
function waveKeys(): Keyframe[] {
  const kfs: Keyframe[] = [];
  for (let i = 0; i < K; i++) {
    const t = i / K, ph = t * Math.PI * 2;
    kfs.push({ t, pose: {
      __dy: 4 * Math.sin(ph), head: -4,
      armRU: -132 + 18 * Math.sin(ph * 3), armRF: -30 + 32 * Math.sin(ph * 3 + 0.6),
      armLU: 8 * Math.sin(ph), thighR: 3 * Math.sin(ph), thighL: -3 * Math.sin(ph),
      tail1: 8 * Math.sin(ph), tail2: 12 * Math.sin(ph - 0.6), tail3: 17 * Math.sin(ph - 1.2),
    }});
  }
  return kfs;
}

/** 游动：身体后仰、手臂张开如鳍、腿并拢后摆、尾巴大幅摆动 —— 金鱼本该会游 */
function swimKeys(): Keyframe[] {
  const kfs: Keyframe[] = [];
  for (let i = 0; i < K; i++) {
    const t = i / K, ph = t * Math.PI * 2;
    kfs.push({ t, pose: {
      __dy: 14 * Math.sin(ph) - 10, __rot: -20 + 5 * Math.sin(ph),
      spine: -4 + 4 * Math.sin(ph), chest: 3 * Math.sin(ph), head: -6 - 4 * Math.sin(ph),
      armRU: -58 + 12 * Math.sin(ph), armRF: -20 + 14 * Math.sin(ph + 0.5),
      armLU: 58 - 12 * Math.sin(ph), armLF: 20 - 14 * Math.sin(ph + 0.5),
      thighR: 16 + 8 * Math.sin(ph), shinR: -22 + 10 * Math.sin(ph + 0.4),
      thighL: -16 - 8 * Math.sin(ph), shinL: -22 + 10 * Math.sin(ph + 0.4 + Math.PI),
      tail1: 20 * Math.sin(ph), tail2: 28 * Math.sin(ph - 0.7), tail3: 34 * Math.sin(ph - 1.4),
    }});
  }
  return kfs;
}

/** 害羞：双手举到脸前、头低、身体微缩，轻轻左右摇 */
function shyKeys(): Keyframe[] {
  const kfs: Keyframe[] = [];
  for (let i = 0; i < K; i++) {
    const t = i / K, ph = t * Math.PI * 2;
    kfs.push({ t, pose: {
      __dy: 6 + 2 * Math.sin(ph), __rot: 4 * Math.sin(ph * 0.5),
      spine: -3 + 2 * Math.sin(ph), chest: -4, head: 8 - 3 * Math.sin(ph),
      armRU: -96 + 6 * Math.sin(ph * 2), armRF: -76 + 10 * Math.sin(ph * 2),
      armLU: -84 - 6 * Math.sin(ph * 2), armLF: -70 - 10 * Math.sin(ph * 2),
      thighR: 3 * Math.sin(ph), thighL: -3 * Math.sin(ph),
      tail1: 6 * Math.sin(ph), tail2: 9 * Math.sin(ph - 0.6), tail3: 12 * Math.sin(ph - 1.2),
    }});
  }
  return kfs;
}

/** 跳：蹲 → 起跳 → 落地（用分段的正弦做一次完整弹跳，循环播放就是连续跳） */
function jumpKeys(): Keyframe[] {
  const kfs: Keyframe[] = [];
  for (let i = 0; i < K; i++) {
    const t = i / K;
    // 0~0.25 蹲，0.25~0.7 腾空，0.7~1 落地缓冲
    let dy = 0, crouch = 0;
    if (t < 0.25) { crouch = t / 0.25; dy = crouch * 26; }
    else if (t < 0.7) { const u = (t - 0.25) / 0.45; dy = 26 - u * 150; crouch = 1 - u * 2.4; }
    else { const u = (t - 0.7) / 0.3; dy = -124 + u * 124; crouch = Math.max(0, 1 - u * 1.6) * -0.6; }
    const ph = t * Math.PI * 2;
    kfs.push({ t, pose: {
      __dy: dy, __rot: -4,
      spine: 4 * Math.max(0, crouch), chest: -3, head: -4,
      thighR: -26 * crouch + 10, shinR: -46 * Math.max(0, crouch) - 8,
      thighL: -26 * crouch - 10, shinL: -46 * Math.max(0, crouch) - 8,
      armRU: -70 * Math.max(0, crouch) + 10 * Math.sin(ph), armRF: -30 * Math.max(0, crouch),
      armLU: -70 * Math.max(0, crouch) - 10 * Math.sin(ph), armLF: -30 * Math.max(0, crouch),
      tail1: 14 * Math.sin(ph), tail2: 20 * Math.sin(ph - 0.7), tail3: 26 * Math.sin(ph - 1.4),
    }});
  }
  return kfs;
}

const ROOT = { x: 800, y: 620 };
const make = (id: string, loopMs: number, keyframes: Keyframe[]): Rig => ({
  id: `goldfish-girl/${id}`, size: { w: 1600, h: 1000 }, root: ROOT,
  bones: BONES, parts: PARTS, keyframes, loopMs, easing: 'sine',
});

export const GOLDFISH_ACTIONS: Record<string, Rig> = {
  idle: make('idle', 2600, idleKeys()),
  run: make('run', 640, runKeys()),
  wave: make('wave', 1500, waveKeys()),
  swim: make('swim', 1800, swimKeys()),
  shy: make('shy', 3000, shyKeys()),
  jump: make('jump', 1100, jumpKeys()),
};
export const GOLDFISH_BONES = BONES;
export const GOLDFISH_PARTS = PARTS;
