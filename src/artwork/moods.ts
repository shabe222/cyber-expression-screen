/**
 * 心情涂鸦 · Lead 手写（B2「你我画出心情」的 agent 侧）
 *
 * 用法：屏线做好心情输入后，按关键词选一份脚本喂黑板 → 用户打一个词，我回画一幅。
 * 全部用黑板原生元素（points+smooth 让黑板做 Catmull-Rom 平滑，circle/arc/path/text）。
 * 板面 1600×1000，涂鸦集中在中间偏左，右边留给化身的语义空间。
 */
import type { BlackboardElement, BlackboardOp, BlackboardScript, Pt } from '../features/blackboard/types';

let seed = 90001;

function bboxOf(pts: Pt[]) {
  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** 平滑闭合形状（身体、云、叶） */
function blob(id: string, pts: Pt[], color: string, opts: Partial<BlackboardElement> = {}): BlackboardElement {
  return {
    id, type: 'path', source: 'ai',
    render: { points: pts, smooth: true, closed: true, tension: 0.5 },
    bbox: bboxOf(pts), color, width: 3.2, seed: seed++,
    fill: color, fillOpacity: 0.9, chalkDensity: 0.9,
    ...opts,
  };
}

/** 描边曲线（不填充） */
function line(id: string, pts: Pt[], color: string, width = 3.4, opts: Partial<BlackboardElement> = {}): BlackboardElement {
  return {
    id, type: 'path', source: 'ai',
    render: { points: pts, smooth: true, closed: false, tension: 0.5 },
    bbox: bboxOf(pts), color, width, seed: seed++,
    ...opts,
  };
}

/** 圆（眼、日、星点） */
function dot(id: string, cx: number, cy: number, r: number, color: string, opts: Partial<BlackboardElement> = {}): BlackboardElement {
  return {
    id, type: 'circle', source: 'ai',
    render: { cx, cy, r }, bbox: { x: cx - r, y: cy - r, w: r * 2, h: r * 2 },
    color, width: 0.6, seed: seed++, fill: color, fillOpacity: 0.95, chalkDensity: 0.9,
    ...opts,
  };
}

/** 字 */
function word(id: string, x: number, y: number, text: string, color: string, size = 76): BlackboardElement {
  return {
    id, type: 'text', source: 'ai',
    render: { x, y, text, size }, bbox: { x, y, w: text.length * size, h: size * 1.2 },
    color, seed: seed++,
  };
}

function script(size: { w: number; h: number }, elements: BlackboardElement[]): BlackboardScript {
  const ops: BlackboardOp[] = elements.map(e => ({ kind: 'add', element: e }));
  return { size, elements, ops };
}

const SIZE = { w: 1600, h: 1000 } as const;

/* ───────────── 开心：太阳 + 笑眯眯的鲸鱼 + 星星 ───────────── */
const HAPPY: BlackboardElement[] = [
  // 太阳 + 光芒
  dot('sun', 470, 285, 62, '#ffd98a', { fillOpacity: 0.92 }),
  ...Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return line(`ray${i}`, [
      [470 + Math.cos(a) * 82, 285 + Math.sin(a) * 82],
      [470 + Math.cos(a) * 112, 285 + Math.sin(a) * 112],
    ], '#ffd98a', 3.2);
  }),
  // 鲸鱼身体（圆钝）
  blob('body', [[700, 560], [716, 512], [762, 482], [824, 476], [884, 496], [924, 532], [942, 572], [922, 610], [880, 638], [822, 646], [764, 636], [716, 606]], '#8fd4f0'),
  // 尾鳍（横向双叶）
  blob('fluke', [[700, 560], [652, 534], [598, 522], [626, 556], [598, 592], [652, 578]], '#8fd4f0', { fillOpacity: 0.92 }),
  // 腹部亮色
  blob('belly', [[742, 620], [800, 632], [862, 622], [900, 600], [872, 630], [812, 644], [756, 636]], '#dff3ff', { fillOpacity: 0.5, chalkDensity: 0.4 }),
  // 眼（笑成弯月）
  line('eye', [[876, 536], [888, 526], [900, 536]], '#0d1c2b', 5),
  // 嘴（笑）
  line('mouth', [[860, 572], [886, 592], [912, 570]], '#2b5f7d', 4),
  // 腮红
  dot('blush', 858, 556, 12, '#ff9db3', { fillOpacity: 0.45 }),
  // 喷水
  line('spout', [[820, 470], [818, 430], [816, 396]], '#bfe6f7', 4),
  line('spoutL', [[816, 424], [792, 408], [774, 404]], '#bfe6f7', 3.2),
  line('spoutR', [[816, 424], [840, 408], [858, 404]], '#bfe6f7', 3.2),
  // 星星（四角星，用闭合折线）
  blob('star1', [[1120, 380], [1132, 404], [1158, 408], [1138, 426], [1144, 452], [1120, 438], [1096, 452], [1102, 426], [1082, 408], [1108, 404]], '#ffd98a', { fillOpacity: 0.95 }),
  blob('star2', [[1210, 500], [1218, 516], [1236, 518], [1222, 530], [1226, 548], [1210, 538], [1194, 548], [1198, 530], [1184, 518], [1202, 516]], '#ffd98a', { fillOpacity: 0.9 }),
  // 字
  word('label', 700, 760, '开心', '#ff7aa8', 88),
];

/* ───────────── 有点累：睡着的鲸鱼 + zzz + 云 ───────────── */
const TIRED: BlackboardElement[] = [
  // 云（用叠圆做轮廓，比平滑点更像云）
  dot('cloud1', 452, 336, 44, '#a8d3f5', { fillOpacity: 0.34, chalkDensity: 0.45 }),
  dot('cloud2', 520, 314, 58, '#a8d3f5', { fillOpacity: 0.34, chalkDensity: 0.45 }),
  dot('cloud3', 592, 338, 42, '#a8d3f5', { fillOpacity: 0.34, chalkDensity: 0.45 }),
  dot('cloud4', 540, 352, 46, '#a8d3f5', { fillOpacity: 0.34, chalkDensity: 0.45 }),
  // 鲸鱼身体（趴着）
  blob('body', [[700, 620], [720, 572], [772, 546], [836, 542], [896, 562], [938, 598], [950, 636], [924, 668], [862, 682], [796, 678], [734, 658]], '#8fd4f0', { fillOpacity: 0.82, chalkDensity: 0.7 }),
  // 尾鳍（下垂）
  blob('fluke', [[700, 620], [650, 636], [596, 662], [628, 676], [678, 668], [704, 648]], '#8fd4f0', { fillOpacity: 0.8 }),
  // 闭眼（两条向下弯的线）
  line('eyeL', [[850, 600], [864, 612], [878, 600]], '#0d1c2b', 4.6),
  line('eyeR', [[900, 600], [914, 612], [928, 600]], '#0d1c2b', 4.6),
  // 打呼的嘴
  dot('mouth', 890, 646, 7, '#2b5f7d', { fillOpacity: 0.75 }),
  // zzz
  word('z1', 1000, 480, 'z', '#a8d3f5', 54),
  word('z2', 1064, 416, 'z', '#a8d3f5', 68),
  word('z3', 1140, 340, 'z', '#a8d3f5', 84),
  // 字
  word('label', 660, 800, '有点累', '#a8d3f5', 84),
];

/* ───────────── 平静：月亮 + 水波 + 静静浮着的鲸鱼 ───────────── */
const CALM: BlackboardElement[] = [
  // 月
  dot('moon', 470, 268, 66, '#e6eef5', { fillOpacity: 0.9 }),
  dot('moonCut', 448, 250, 54, '#0d1c2b', { fillOpacity: 0.96, chalkDensity: 0.9 }),
  // 水波（三道弧）
  line('wave1', [[380, 620], [460, 600], [540, 620], [620, 600], [700, 620], [780, 600], [860, 620], [940, 600], [1020, 620]], '#4fc3f7', 3.6),
  line('wave2', [[420, 676], [500, 658], [580, 676], [660, 658], [740, 676], [820, 658], [900, 676], [980, 658]], '#4fc3f7', 3),
  line('wave3', [[470, 728], [550, 712], [630, 728], [710, 712], [790, 728], [870, 712]], '#4fc3f7', 2.6),
  // 鲸鱼（半浮在水面，只露上半）
  blob('body', [[700, 560], [724, 518], [776, 496], [840, 494], [898, 514], [936, 548], [930, 580], [860, 592], [784, 590], [726, 580]], '#8fd4f0', { fillOpacity: 0.88 }),
  blob('fluke', [[700, 560], [654, 542], [604, 536], [630, 562], [604, 590], [654, 580]], '#8fd4f0', { fillOpacity: 0.88 }),
  // 眼（平静的睁眼）
  dot('eye', 886, 534, 8, '#0d1c2b'),
  dot('eyeHi', 883, 531, 3, '#ffffff', { fillOpacity: 0.95 }),
  // 喷水（轻轻一道）
  line('spout', [[824, 490], [822, 456], [820, 428]], '#bfe6f7', 3.4),
  // 字
  word('label', 690, 810, '平静', '#4fc3f7', 88),
];

/* ───────────── 加油：鲸鱼举小旗 + 星 ───────────── */
const CHEER: BlackboardElement[] = [
  // 鲸鱼身体（挺起）
  blob('body', [[700, 580], [712, 528], [756, 494], [818, 486], [880, 504], [924, 540], [946, 582], [928, 622], [880, 650], [818, 656], [756, 644], [714, 616]], '#8fd4f0'),
  blob('fluke', [[700, 580], [650, 552], [596, 538], [624, 574], [596, 610], [650, 596]], '#8fd4f0', { fillOpacity: 0.92 }),
  // 眼（有神）
  dot('eye', 890, 552, 9, '#0d1c2b'),
  dot('eyeHi', 886, 548, 3.4, '#ffffff', { fillOpacity: 0.95 }),
  // 张嘴喊
  blob('shout', [[874, 596], [900, 590], [918, 604], [900, 620], [876, 616]], '#243447', { fillOpacity: 0.9 }),
  // 胸鳍举旗
  line('fin', [[770, 520], [742, 470], [724, 430]], '#8fd4f0', 7),
  line('pole', [[722, 432], [716, 356]], '#e6eef5', 3.4),
  blob('flag', [[716, 358], [800, 372], [716, 400]], '#ff7aa8', { fillOpacity: 0.92, chalkDensity: 0.85 }),
  // 星
  blob('star1', [[1080, 420], [1092, 444], [1118, 448], [1098, 466], [1104, 492], [1080, 478], [1056, 492], [1062, 466], [1042, 448], [1068, 444]], '#ffd98a', { fillOpacity: 0.95 }),
  blob('star2', [[1176, 540], [1184, 556], [1202, 558], [1188, 570], [1192, 588], [1176, 578], [1160, 588], [1164, 570], [1150, 558], [1168, 556]], '#ffd98a', { fillOpacity: 0.9 }),
  // 字
  word('label', 690, 790, '加油', '#ff7aa8', 88),
];

export const MOODS: Record<string, BlackboardScript> = {
  happy: script(SIZE, HAPPY),
  tired: script(SIZE, TIRED),
  calm: script(SIZE, CALM),
  cheer: script(SIZE, CHEER),
};

/** 关键词 → 心情 id（供屏线在心情输入后调用） */
export function moodFor(text: string): string {
  const t = (text || '').trim();
  const hit = (keys: string[]) => keys.some(k => t.includes(k));
  if (hit(['开心', '高兴', '快乐', '爽', '好耶', '哈哈', '笑', 'happy', 'joy'])) return 'happy';
  if (hit(['累', '疲惫', '困', '乏', '睡', 'tired', 'sleepy'])) return 'tired';
  if (hit(['平静', '安静', '放松', '稳', '静', 'calm', 'relax'])) return 'calm';
  if (hit(['加油', '努力', '冲', '拼', '坚持', '干', 'cheer', 'go'])) return 'cheer';
  return 'calm'; // 兜底：平静
}
