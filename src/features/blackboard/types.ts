/**
 * 黑板的数据模型。
 *
 * 约定：几何一律由后端解算好再下发（`render` 里已是可直接绘制的坐标），
 * 前端不做任何布局/几何计算 —— 只负责画出来和做动画。
 * 这样前端保持极薄，而且"AI 看到的"和"用户看到的"永远是同一份数据。
 */

import type { BoardSurfaceSpec } from './glass';
import type { Plane } from './plane';

/**
 * 一个点：`[x, y, p?]`。
 *
 * 第三维是**逐点压感** 0~1（治"积木感"的核心，见 docs/drawing-design-advice.md B1）：
 * 线宽 = `width × (0.35 + 0.65·p)` —— 两端细中间粗就靠它。
 * **不写 p 时按 p = 1 处理**，所以老 payload（两维点）行为完全不变。
 */
export type Pt = [number, number, number?];

export type Rect = { x: number; y: number; w: number; h: number };

export type BlackboardElementKind =
  | 'text'
  | 'line'
  | 'polyline'
  | 'polygon'
  | 'circle'
  | 'arrow'
  | 'stroke'
  | 'annotate'
  /* ---- 作画能力（让 AI 亲手画画）---- */
  /** 任意 SVG 路径：贝塞尔曲线/圆弧的地基，画脸、身体、头发、尾巴全靠它 */
  | 'path'
  /** 弧线：给定圆心/半径/起止角，画笑脸、眉毛最快 */
  | 'arc'
  /** 分组：把若干元素当成一个整体一起变换（动线让"整只角色一起动"用） */
  | 'group';

/** 绘制就绪的几何：后端算好，前端直接用 */
export type BlackboardRender = {
  /** 折线/多边形/线段/箭头的顶点（第三维可选 = 压感） */
  points?: Pt[];
  /**
   * 点序列的**字符串简写**：`"668,352,.15 700,336,.7"`（空格分点、逗号分 x,y[,p]）。
   * 比嵌套数组省一半 token；解析后与 `points` 等价。
   */
  pts?: string;
  /**
   * 平滑曲线：`points` 不再是折线，而是用 Catmull-Rom 转成三次贝塞尔的光滑曲线。
   * 画脸/身体/头发这类有机形状时开它，配合 tension 调圆润程度。
   */
  smooth?: boolean;
  /** 平滑张力 0-1：0 接近折线，0.5 标准，1 更圆更胖 */
  tension?: number;
  /** 曲线是否闭合（画脸的轮廓、头发块要 true；开口的线条不填） */
  closed?: boolean;
  /**
   * `path` 元素的原生 SVG 路径数据，支持 M/L/H/V/C/S/Q/T/A/Z 全部命令。
   * 与 `points` 二选一：`d` 给已经算好的曲线，`points` 给采样点让前端转曲线。
   */
  d?: string;
  /** 文字的左上角 */
  x?: number;
  y?: number;
  text?: string;
  size?: number;
  /** 圆与椭圆 */
  cx?: number;
  cy?: number;
  r?: number;
  rx?: number;
  ry?: number;
  /** `arc` 的起止角（度）：0 = 正右，顺时针为正 */
  start?: number;
  end?: number;
  /** annotate 的样式 */
  style?: 'circle' | 'underline' | 'highlight';
  /** `group` 的子元素 id，按此顺序绘制 */
  children?: string[];
};

export type BlackboardElement = {
  id: string;
  type: BlackboardElementKind;
  /** 谁写的：ai | human。前端据此可以区分笔迹来源 */
  source?: 'ai' | 'human';
  render: BlackboardRender;
  /** 板面坐标下的包围盒（后端算好） */
  bbox: Rect;
  /** 颜色，直接给 CSS 颜色值 */
  color?: string;
  /** 线宽（板面单位） */
  width?: number;
  /** 决定粉笔抖动形状的随机种子，后端给，保证每次渲染一致 */
  seed: number;
  /** 元素标签，便于调试与指代 */
  label?: string | null;

  /* ---------- 作画能力（全部可选，不影响原有 8 种元素）---------- */

  /** 填充色：画实心形状（脸、身体、眼睛、头发块） */
  fill?: string;
  /** 填充透明度 0-1，默认 0.85 */
  fillOpacity?: number;
  /** 整体透明度 0-1（描边 + 填充一起），默认 1 */
  opacity?: number;
  /** 绕自身包围盒中心的旋转角（度），画倾斜的眼睛/手臂/尾巴用 */
  rotation?: number;
  /**
   * 原生 SVG transform 字符串（如 `translate(800,640) rotate(-90)`）。
   * 骨骼动画的每个部件都用它把自己摆到挂点上 ——
   * 局部坐标画形状、transform 负责摆位，省掉在路径数据上做坐标变换
   * （弧线命令没法简单平移旋转）。与 rotation 同时给时先 transform 后 rotation。
   */
  transform?: string;
  /** 图层：数值大的画在上面；同层按加入顺序。不填按 0 */
  layer?: number;
  /**
   * **三层语义里的归属**（见 `plane.ts` 与 `docs/three-layer-schema.md` 第二节）。
   *
   * - `'hidden'`  —— Layer 0：靶子（traceImage 的产出）。**默认不渲染**，调试开关打开才画
   *   （半透明 + 红色描边）。它不是给观众看的，是给自己"看"的：judge 比较 / 动画分件 / 该画哪一块。
   * - `'visible'` —— Layer 1：用户看到的每一笔（我亲手画）。**省略 = 这个**，所以老 payload 行为完全不变。
   * - `'result'`  —— Layer 2：可选结果层（成品 / 上色 / 特效），默认渲染。
   *
   * **这不是 `layer`**：`layer: number` 是同层内的 z 序，`plane` 是"这条内容属于哪一层"。
   * 两者并存、互不干扰。它**不进 STYLE_KEYS、不参与 sticky 继承**（和 `surface` 同理）。
   */
  plane?: Plane;
  /** 粉笔颗粒浓度 0-1：小=更破碎像干粉笔，大=更实。默认 0.55 */
  chalkDensity?: number;
  /**
   * 起笔收笔变细 0-1（0=等宽）。只对给了 `points` 的线条有效；
   * 直接给 `d` 的路径按原样画（无法在任意路径上做变宽）。
   */
  taper?: number;
  /**
   * 属于**逐帧动画层**：用轻量笔触渲染（不做粉笔灰重描、单层湍流、填充不打颗粒）。
   *
   * 为什么需要这个开关：粉笔质感靠 feTurbulence，是逐像素 CPU 光栅化的，
   * 而且元素一移动就要重算。板上静态内容无所谓，但骨骼动画每秒几十帧、
   * 几十个部件同时动 —— 实测满配笔触只有 15fps，轻量笔触能到 30fps 以上。
   * 代价是动画角色看起来更"干净"（更像动画上色），静止内容依旧是粉笔味。
   */
  stream?: boolean;
  /**
   * 笔刷预设：`'ink' | 'sketch' | 'flat' | 'bold'`（见 brushes.ts）。
   *
   * 给了它就按预设取默认的 线宽/抖动/颗粒/透明度/压感方式；
   * 元素上显式写的字段优先级更高。**不给就完全按老逻辑渲染**（向后兼容）。
   */
  brush?: string;
};

/**
 * 信封级 sticky style：脚本顶层给一次，后面每个 op 不写就继承。
 *
 * 动机很实在：aiWhaleGirl.ts 里 `chalkDensity: 0.9` 重复了五十多次。
 * 语义是"**写了就覆盖并粘住**" —— 某个 op 显式给了 color，从那以后都按它走。
 *
 * 注意这里**故意不含 `fill`/`fillOpacity`**：填充是"这个形状是什么"，
 * 不是"这支笔什么手感"。让 fill 粘住会出事 —— 实测：先画一个圆（fill 青色），
 * 紧跟一根不写 fill 的 stroke 会继承青色被填成一坨色块。
 */
export type BlackboardStyle = {
  brush?: string;
  color?: string;
  width?: number;
  layer?: number;
  chalkDensity?: number;
  opacity?: number;
  /**
   * 板面材料（玻璃 + 背后的景色 + 这块板上的笔）—— 见 glass.ts。
   *
   * 它是**板子**的属性，不是某一笔的属性，所以刻意不进 STYLE_KEYS（不参与 sticky 继承）。
   * 省略 = 默认的"清新透亮的玻璃"；给 `'dark'` 回到旧的深色玻璃科幻板。
   */
  surface?: BoardSurfaceSpec;
  /**
   * **缝合相邻填充之间的抗锯齿缝**（"碎玻璃"）。
   *
   * 病根：多区域平色图形里相邻的两个填充各自抗锯齿 —— 共享边界上两边各覆盖半格，
   * 叠加后覆盖率只有 ~0.75，**亮玻璃底就从这条发丝缝里透出来**，整只角色像裂开的贴纸。
   * 凡是"按色分区 / 按部件分区"的作画（traceImage 的逐色矢量、Phase 1 的大区域平色、
   * 以后的分层上色）都会被它毁掉 ⇒ 这是**渲染层的通用能力**，不是某个 payload 的补丁。
   *
   * 值：
   * - 省略 / `0` / `false` = **关**（老 payload 一个字节都不变）
   * - `true` = 默认宽度（`DEFAULT_FILL_SEAM`，板面单位）
   * - 数字 = 指定宽度（板面单位；实际向外扩 宽度/2）
   *
   * 做法（见 `seam.ts`，那里是唯一事实源）：
   * ① 这一块填充包进 `<g opacity=填充透明度>`，里面用**不透明**的同色 `fill + stroke` 画
   *    （组内全不透明 ⇒ 描边与填充重叠处不会叠加变浓；透明度由组统一施加一次 ⇒ 内部浓度不变）；
   * ② 再把描边**裁到所有填充的并集**上 —— 于是外轮廓不长、真正的镂空也不会被填掉。
   *
   * 与 `surface` 同类：它是**板面渲染设置**，不是"这支笔什么手感"，
   * 所以同样**不进 STYLE_KEYS、不参与 sticky 继承**。
   */
  fillSeam?: number | boolean;
  /**
   * **内容与玻璃的关系**：在内容之上再叠一层"玻璃前表面反射"，让内容读起来像
   * **写在玻璃上**而不是贴上去（见 `onglass.ts`）。
   *
   * 病根：`glass.ts` 把整叠玻璃（景色 → 本体 → sheen → 反光池 → 暗角 → 磨砂 → 边缘）
   * **一次画完**才轮到内容 ⇒ 玻璃的反射画在内容**下面**。真实玻璃的反射必须在
   * "里面的东西"**之上**（内容写在背面，光先从前表面反一次）—— 这一条不改，怎么调都是贴纸。
   *
   * 值：
   * - 省略 / `0` / `false` = **关**（老 payload 一个字节都不变）
   * - `true` = 默认强度（`DEFAULT_CONTENT_ON_GLASS`）
   * - 数字 = 强度 0~1（夹在范围内）
   *
   * 实现：用 `surface.plate` 的数据自己算板面矩形、自己建同色标的 sheen 渐变，
   * 裁在板面里、`mix-blend-mode: soft-light`（**调制**而非遮盖，保住内容自己的对比）。
   * 与 `surface` / `fillSeam` 同类：**板面渲染设置**，不进 STYLE_KEYS、不参与 sticky。
   */
  contentOnGlass?: number | boolean;
  /**
   * **湿边**：在每块填充的边缘再描一圈"同色加深 12%"的细边，让平色区域读起来像
   * "用蘸饱的笔涂的"而不是"切出来的色块"（见 `wetedges.ts`）。
   *
   * 材料上是忠实的：真墨落在玻璃上，边缘会聚一圈略深的色。顺带也能盖住相邻填充之间的缝。
   *
   * 值：
   * - 省略 / `0` / `false` = **关**（老 payload 一个字节都不变）
   * - `true` = 默认宽度（`DEFAULT_WET_EDGE`，板面单位）
   * - 数字 = 指定宽度（夹在 `[0, WET_EDGE_MAX]`）
   *
   * **观感变化明显**（对照图 out/onglass/wetedge-compare.png），所以刻意做成可一键关掉的
   * **板面级 style 字段**，与 `surface` / `fillSeam` / `contentOnGlass` 同类：
   * 不进 STYLE_KEYS、不参与 sticky。
   *
   * 适合开：多区域平色作画（每块"有笔"、相邻分界更清楚）。
   * 适合关：以线条为主、色块很少的稿子；想要干净平涂的味道；相邻色块本来就同色系（边会读成描线）。
   */
  wetEdge?: number | boolean;
};

/** 一次板面操作。后端下发有序 ops，前端按序执行并做动画。 */
export type BlackboardOp = {
  /** 这一条 op 单独的落笔间隔（覆盖脚本级的 paceMs）。语义是**累进**：这一笔到下一笔的间隔 */
  paceMs?: number;
  /**
   * 帧号（逐帧动画用）：同一个 frame 的 ops **同时**应用。
   * 配合 `loop.frameMs` = 每帧停多久 —— 逐帧笔迹动画靠它精确控速。
   */
  frame?: number;
} & (
  | { kind: 'add'; element: BlackboardElement }
  | { kind: 'update'; element: BlackboardElement }
  | { kind: 'remove'; id: string }
  | { kind: 'clear' }
  | { kind: 'pointer'; bbox: Rect; ms?: number }
);

/**
 * 循环播放配置（"像放电视"）。
 *
 * - 省略 / `false` = 播一次就停（老 payload 行为不变）
 * - `true` = 最后一笔落完、等 `gapMs` 后**从头重新播**，无限循环
 * - 给了 `fromOp`/`toOp` = **首遍照旧播全部**（那是"画出来"的过程），之后只循环这个 op 区间
 *
 * 停止时机：`stop` / `clear` / 新 payload 到来 → 立刻停掉循环，不留野定时器。
 */
export type BlackboardLoop =
  | boolean
  | {
      /** 循环区间的起止 op 下标（含端点）；不给就是全部 ops */
      fromOp?: number;
      toOp?: number;
      /** 每轮之间停多久（毫秒），默认 0 */
      gapMs?: number;
      /** 逐帧模式：每 frameMs 毫秒推进一帧（要求 ops 上带 `frame`） */
      frameMs?: number;
    };

/** 一节 = DARYA 要说的一句话 + 这句话对应的那几笔。 */
export type BlackboardStep = {
  /** 说这句话的同时落这几笔。为空表示这一节只有动作（擦板、指一下）没有说话。 */
  narration?: string;
  ops: BlackboardOp[];
};

/** 一条消息附带的黑板脚本 */
export type BlackboardScript = {
  /** 板面逻辑尺寸，默认 1600×1000 */
  size?: { w: number; h: number };
  /** 执行完 ops 之后整块板的完整元素。板子是空的时候（重开历史、通话中途进入）
   *  用它直接铺好，不必把前面每一轮都重放一遍。 */
  elements?: BlackboardElement[];
  ops: BlackboardOp[];
  /** 把 ops 按"一句话"分好组。有它的时候前端按节说、按节画；没有（老消息）就照旧
   *  一次性把 ops 排出去。分组由后端按场景归属算，前端不猜。 */
  steps?: BlackboardStep[];
  /**
   * 播放模式：
   * - `live`（默认）= 按 paceMs 逐 op 演，给用户看的表演
   * - `instant`    = 一次性出结果、连落笔动画都不放（AI 自验/改稿用；没人盯着改稿看）
   */
  mode?: 'live' | 'instant';
  /** 信封级 sticky style：op 不写就继承，写了就覆盖并粘住 */
  style?: BlackboardStyle;
  /** 这个脚本的默认落笔间隔（op 上的 paceMs 优先级更高） */
  paceMs?: number;
  /** 循环播放（"像放电视"）：播完自动从头再来。省略 = 现状（播一次就停） */
  loop?: BlackboardLoop;
};

export const DEFAULT_BOARD_SIZE = { w: 1600, h: 1000 } as const;

/** 粉笔色板（与后端保持一致；后端也可直接下发任意 CSS 颜色） */
export const CHALK = {
  white: '#f3f5f0',
  amber: '#ffd98a',
  blue: '#a8d3f5',
  pink: '#f5a8b8',
  green: '#b6e2a1',
} as const;

/** 元素落笔的默认节奏（毫秒）：让一批元素依次写出来，而不是一起冒出来 */
export const DEFAULT_PACE_MS = 170;

/**
 * 一句话在板子上停留多久（毫秒）。
 *
 * 比落笔慢：人是把话说完，手才停。按字数算，短句不闪、长句不拖，两头都封住 ——
 * 一节最长也就四秒出头，六七个要点的板子全程二十几秒，和一个人边讲边画差不多。
 */
export const NARRATION_PER_CHAR_MS = 135;
export const MIN_NARRATION_MS = 1100;
export const MAX_NARRATION_MS = 4200;
