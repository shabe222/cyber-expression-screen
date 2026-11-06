/**
 * 骨骼绑定数据契约（对应 docs/rig-format.md 第二节）。
 *
 * 角度单位「度」，0 = 正右，顺时针为正（SVG y 向下）。
 * 这套类型同时被屏线（求解/播放）和 Lead（rig-data/ 里的角色数据）使用，
 * 所以字段一旦定下就不要随意改名。
 */

/** 一根骨：树形；parent=null 是根 */
export type Bone = {
  id: string;
  parent: string | null;
  /** 骨长（板面单位） */
  len: number;
  /** 静息角（度）：所有 pose 都是相对它的偏移 */
  rest: number;
  /** 挂点：在父骨上的位置 0~1（默认 1 = 父骨末端） */
  at?: number;
};

/**
 * 关键帧：t 归一化 0~1；pose = 各骨相对静息角的偏移（度）。
 * 三个**保留键**作用于整具骨架的根：
 *   `__dx` / `__dy` 根平移（板面单位，做起伏/跳跃）
 *   `__rot`         根旋转（度，做前倾/翻滚）
 */
export type Keyframe = { t: number; pose: Record<string, number> };

/** 渲染件的公共字段 */
type PartCommon = {
  /** 挂在哪根骨上 */
  bone: string;
  /** 挂点位置 0~1（默认 1 = 骨末端） */
  at?: number;
  /**
   * 'bone'（默认）：局部坐标跟着骨转 —— 用于**要跟骨摆**的鳍/尾/裙摆
   * 'world'：局部坐标轴向与世界一致（+x 右、+y 下）—— 用于**好画**的头发/头饰/脸
   */
  align?: 'bone' | 'world';
  color?: string;
  fill?: string;
  fillOpacity?: number;
  /** 图层：大的画在上面（同一具骨架内部的遮挡关系） */
  layer?: number;
  width?: number;
};

/** 一根骨的描边（四肢、尾节） */
export type BonePart = PartCommon & {
  kind: 'bone';
  /** 起笔收笔变细 0~1 */
  taper?: number;
  chalkDensity?: number;
};

/** 挂在骨上的圆（头、眼、关节、腮红） */
export type CirclePart = PartCommon & {
  kind: 'circle';
  r: number;
  /** 相对挂点的偏移（align='world' 时是屏幕轴向，'bone' 时随骨转） */
  dx?: number;
  dy?: number;
};

/** 挂在骨上的折线/平滑形状（局部坐标，原点=挂点） */
export type PolyPart = PartCommon & {
  kind: 'poly';
  points: [number, number][];
  closed?: boolean;
  smooth?: boolean;
};

/**
 * 挂在骨上的 SVG 路径（局部坐标，原点=挂点）。
 * 画角色主要用这个 —— 曲线形状表达能力最强。
 */
export type PathPart = PartCommon & {
  kind: 'path';
  /** SVG path 数据，支持 M/L/H/V/C/S/Q/T/A/Z */
  d: string;
};

export type Part = BonePart | CirclePart | PolyPart | PathPart;

export type Rig = {
  id: string;
  size: { w: number; h: number };
  root: { x: number; y: number };
  /** 骨按父在前排列（求解按数组顺序走一遍即可） */
  bones: Bone[];
  parts: Part[];
  keyframes: Keyframe[];
  /** 一轮时长（毫秒），播放时**无限循环** */
  loopMs: number;
  /** 帧间缓动，默认 'sine' */
  easing?: 'linear' | 'sine' | 'cubic';
};

/** 求解后的世界变换 */
export type BoneWorld = {
  /** 起点 */
  x: number;
  y: number;
  /** 终点 */
  ex: number;
  ey: number;
  /** 世界角（度） */
  deg: number;
  /** 世界角（弧度，省得每帧再转） */
  rad: number;
};
