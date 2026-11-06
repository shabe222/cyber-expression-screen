/**
 * 小鲸鱼 · 骨骼绑定（Lead 手作）—— 用来证明「换一份绑定数据就能绑新角色」
 *
 * 骨架只有 6 根：身体 → 尾柄 → 尾 1/2/3 + 胸鳍。
 * 动作：游动（身体起伏 + 尾巴大幅摆动）、跃出水面（整条鱼跳）。
 */
import type { Bone, Keyframe, Part, Rig } from '../features/rig/types';

const BONES: Bone[] = [
  { id: 'body', parent: null, len: 0, rest: 0 },
  { id: 'nose', parent: 'body', len: 96, rest: 0 },      // 从尾向头（朝右）
  { id: 'tail1', parent: 'body', len: 58, rest: 180 },   // 朝左
  { id: 'tail2', parent: 'tail1', len: 52, rest: 0 },
  { id: 'tail3', parent: 'tail2', len: 46, rest: 0 },
  { id: 'fin', parent: 'body', len: 54, rest: 118 },     // 胸鳍朝下
];

const C = {
  body: '#7fc9ea', bodyDeep: '#3f93bd', belly: '#dff3ff',
  fin: '#a8dcf2', finEdge: '#5aa9cd', ink: '#12303f', white: '#ffffff', spout: '#cfeaff',
};

const PARTS: Part[] = [
  // 尾（跟骨摆）
  { kind: 'bone', bone: 'tail1', color: C.finEdge, width: 30, taper: 0.3, layer: 2 },
  { kind: 'bone', bone: 'tail2', color: C.finEdge, width: 24, taper: 0.3, layer: 2 },
  { kind: 'bone', bone: 'tail3', color: C.finEdge, width: 18, taper: 0.3, layer: 2 },
  // 尾鳍（两叶，跟骨转）
  { kind: 'path', bone: 'tail3', at: 1, align: 'bone', color: C.finEdge, fill: C.fin, fillOpacity: 0.92, width: 3.4, layer: 2,
    d: 'M 0 -12 C 30 -44 74 -58 108 -48 C 122 -44 124 -22 108 -10 C 76 4 34 8 0 -2 Z' },
  { kind: 'path', bone: 'tail3', at: 1, align: 'bone', color: C.finEdge, fill: C.fin, fillOpacity: 0.92, width: 3.4, layer: 2,
    d: 'M 0 12 C 30 44 74 58 108 48 C 122 44 124 22 108 10 C 76 -4 34 -8 0 2 Z' },
  // 身体（world 对齐，绕 body 点）
  { kind: 'path', bone: 'body', at: 1, align: 'world', color: C.bodyDeep, fill: C.body, fillOpacity: 0.96, width: 4, layer: 4,
    d: 'M -96 2 C -70 -58 10 -84 74 -60 C 116 -44 138 -14 136 8 C 134 30 108 56 66 66 C 2 80 -70 58 -96 2 Z' },
  // 腹部亮色
  { kind: 'path', bone: 'body', at: 1, align: 'world', color: C.belly, fill: C.belly, fillOpacity: 0.55, width: 2.6, layer: 5,
    d: 'M -66 30 C -20 62 44 70 92 50 C 118 38 130 20 134 8 C 120 42 74 68 20 70 C -24 72 -56 54 -66 30 Z' },
  // 胸鳍
  { kind: 'path', bone: 'fin', at: 0.6, align: 'bone', color: C.finEdge, fill: C.fin, fillOpacity: 0.88, width: 3, layer: 6,
    d: 'M 0 -10 C 26 -14 52 0 62 26 C 36 32 8 18 -8 -2 Z' },
  // 背鳍
  { kind: 'path', bone: 'body', at: 1, align: 'world', color: C.finEdge, fill: C.fin, fillOpacity: 0.9, width: 3, layer: 6,
    d: 'M -10 -70 C 6 -104 40 -112 58 -96 C 34 -88 12 -80 -10 -70 Z' },
  // 眼 + 高光
  { kind: 'circle', bone: 'body', at: 1, align: 'world', dx: 88, dy: -14, r: 11, color: C.ink, fill: C.ink, fillOpacity: 0.96, layer: 8 },
  { kind: 'circle', bone: 'body', at: 1, align: 'world', dx: 84, dy: -18, r: 4, color: C.white, fill: C.white, fillOpacity: 1, layer: 9 },
  // 嘴（微笑）
  { kind: 'path', bone: 'body', at: 1, align: 'world', color: C.ink, width: 3.4, layer: 8,
    d: 'M 108 6 C 118 14 122 22 120 30' },
  // 喷水（挂身体上方）
  { kind: 'path', bone: 'body', at: 1, align: 'world', color: C.spout, width: 4, layer: 7,
    d: 'M 30 -78 C 28 -108 26 -132 24 -152' },
  { kind: 'path', bone: 'body', at: 1, align: 'world', color: C.spout, width: 3.2, layer: 7,
    d: 'M 26 -122 C 6 -138 -12 -144 -30 -144' },
  { kind: 'path', bone: 'body', at: 1, align: 'world', color: C.spout, width: 3.2, layer: 7,
    d: 'M 26 -122 C 46 -138 64 -144 82 -144' },
];

const K = 16;

/** 游动：身体起伏 + 尾巴大幅摆动 + 胸鳍划水 */
function swimKeys(): Keyframe[] {
  const kfs: Keyframe[] = [];
  for (let i = 0; i < K; i++) {
    const t = i / K, ph = t * Math.PI * 2;
    kfs.push({ t, pose: {
      __dy: 12 * Math.sin(ph), __rot: 3 * Math.sin(ph + 0.4),
      nose: 5 * Math.sin(ph),
      fin: 18 * Math.sin(ph * 2),
      tail1: 16 * Math.sin(ph), tail2: 24 * Math.sin(ph - 0.7), tail3: 32 * Math.sin(ph - 1.4),
    }});
  }
  return kfs;
}

/** 跃出水面：整条鱼跳起来再落下 */
function leapKeys(): Keyframe[] {
  const kfs: Keyframe[] = [];
  for (let i = 0; i < K; i++) {
    const t = i / K;
    let dy = 0, rot = 0;
    if (t < 0.2) { const u = t / 0.2; dy = u * 30; rot = -u * 20; }
    else if (t < 0.65) { const u = (t - 0.2) / 0.45; dy = 30 - u * 210; rot = -20 + u * 40; }
    else { const u = (t - 0.65) / 0.35; dy = -180 + u * 180; rot = 20 - u * 20; }
    const ph = t * Math.PI * 2;
    kfs.push({ t, pose: {
      __dy: dy, __rot: rot,
      nose: -8,
      fin: -30 + 20 * Math.sin(ph * 2),
      tail1: 22 * Math.sin(ph), tail2: 30 * Math.sin(ph - 0.7), tail3: 38 * Math.sin(ph - 1.4),
    }});
  }
  return kfs;
}

const ROOT = { x: 780, y: 520 };
const make = (id: string, loopMs: number, keyframes: Keyframe[]): Rig => ({
  id: `whale/${id}`, size: { w: 1600, h: 1000 }, root: ROOT,
  bones: BONES, parts: PARTS, keyframes, loopMs, easing: 'sine',
});

export const WHALE_ACTIONS: Record<string, Rig> = {
  swim: make('swim', 1600, swimKeys()),
  leap: make('leap', 1300, leapKeys()),
};
export const WHALE_BONES = BONES;
export const WHALE_PARTS = PARTS;
