/**
 * 板面材料（surface）——「一整块清新透亮的玻璃 + 背后模糊的景色」。
 *
 * 这是**板面视觉的单一事实源**：
 * - 屏上（Blackboard.tsx）从这里取 defs / 板面图层 / 笔迹滤镜；
 * - 本地预览器（tools/preview.mjs）也 import 这里。
 * 于是"本地渲出来的图"和"屏上看到的板"是同一份材料，不会各写一套漂移
 * （改之前 preview.mjs 里抄了一份简化版粉笔滤镜，填充的颗粒和屏上其实不一样）。
 *
 * 一个板面 = 三件事，且它们必须是一套材料语言：
 *   1. `scenery` 玻璃**背后**的景色（渐变/色块/远景），重度模糊 —— 只剩色彩氛围；
 *   2. `plate`   玻璃本体：透光率、磨砂颗粒、边缘高光、厚度、投影、暗角；
 *   3. `ink`     在这块材料上写字的笔（质感滤镜 + 默认墨色 + 浅色笔迹保护）。
 *
 * 用法（payload 的 style 里就能切，不动渲染代码）：
 *   style: { surface: 'glass' }                    // 默认：清新透亮的玻璃
 *   style: { surface: 'dark' }                     // 旧深色玻璃（回滚/对照）
 *   style: { surface: { plate: { opacity: 0.62 }, scenery: { blur: 90 } } }  // 局部微调
 */

export type SurfaceSize = { w: number; h: number };

/** 景色里的一团色彩（径向渐变椭圆）。给大半径 + 大模糊 = 只剩氛围 */
export type SceneryBlob = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  color: string;
  opacity: number;
};

export type BoardSurface = {
  id: string;
  label: string;
  /** 玻璃背后的景色 */
  scenery: {
    /** 竖向底色（天空 → 地面） */
    base: { top: string; horizon: string; below: string; bottom: string };
    blobs: SceneryBlob[];
    /** 重度模糊半径（"越模糊越好"就调这个） */
    blur: number;
    /** 模糊之后提一点彩度（玻璃的白压上来会掉彩度；不提就是"灰蒙蒙"而不是"清新"） */
    saturate?: number;
    /** 提亮薄雾：把景色压淡，玻璃才"清新"而不是"浓艳" */
    veil: { color: string; opacity: number };
  };
  /** 玻璃本体 */
  plate: {
    /** 玻璃板比板面区域往外扩多少 px（>0 时四周留出更多景色） */
    pad: number;
    radius: number;
    /** 透光：fill 越不透明越"白"，越透明景色越明显 */
    fill: string;
    opacity: number;
    /** 上左来光 */
    sheen: { from: string; to: string };
    /** 下沿的冷色体积 */
    shade: string;
    /** 磨砂颗粒强度（0 = 光面玻璃） */
    frost: number;
    /** 边缘：受光侧亮、背光侧冷 —— "这是一块玻璃"的关键一笔 */
    rim: { light: string; mid: string; cool: string; width: number };
    /** 内圈高光 = 玻璃的厚度 */
    inner: { color: string; opacity: number; inset: number };
    shadow: { dy: number; blur: number; color: string; opacity: number };
    /** 四角轻微压暗，防一大块亮面刺眼 */
    vignette: { color: string; opacity: number };
    /** 斜向一片柔光（玻璃上的反光池） */
    pool: { cx: number; cy: number; rx: number; ry: number; opacity: number; blur: number };
  };
  /** 写在这块板上的笔 */
  ink: {
    family: 'chalk' | 'glasspen';
    /** 元素没写 color 时的默认墨色（浅色板上必须是深墨） */
    defaultColor: string;
    /** 浅色笔迹保护：亮度高于它的颜色按比例压暗（0 = 关）。
     *  老 payload 的配色是给深色板做的，直接搬到亮玻璃上会"白到看不见"。 */
    lightGuard: number;
    /**
     * 笔色翻译表（**只对笔迹与文字生效，不动填充**）：`{ '#深色板上的色': '#这块板上的墨色' }`。
     *
     * 为什么需要：老脚本用的是深色板那套荧光色（青 #43d9e6 / 粉 #ff7aa8 / 白 #e6eef5）。
     * 荧光青落在亮玻璃上亮度几乎相同 —— 不是看不见，是**看得累**（同亮度不同色相会"抖"）。
     * 与其让每个老脚本自己改配色，不如由材料声明"这套色在我这翻译成什么"。
     * 填充不翻译：大色块靠彩度还读得出来，改了反而是篡改别人的画。
     */
    remap?: Record<string, string>;
    /** 界面点缀色（指一下的圈、手绘预览笔） */
    accent: string;
    palette: Record<string, string>;
  };
};

/** 板面样式可写：预设名，或对某个预设的局部覆盖 */
export type BoardSurfaceSpec = string | (Partial<Omit<BoardSurface, 'id'>> & { id?: string });

export const DEFAULT_SURFACE_ID = 'glass';

/* ────────────────────────── 笔迹滤镜（两种材料，两套） ────────────────────────── */

/**
 * 粉笔：干性颜料掉在粗糙深色石板上 —— 高频率毛边 + 颗粒镂空 + 一层更宽更淡的灰晕。
 * 这套数值一个字没动（就是原来 Blackboard.tsx 里那份），深色板行为不变。
 */
const CHALK_DEFS = `
  <filter id="bbChalkStroke" x="-14%" y="-14%" width="128%" height="128%">
    <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="3" seed="9" result="fray"/>
    <feDisplacementMap in="SourceGraphic" in2="fray" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="disp"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="31" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.9 -0.5" result="mask"/>
    <feComposite in="disp" in2="mask" operator="in" result="grainy"/>
    <feGaussianBlur in="disp" stdDeviation="0.6" result="soft"/>
    <feMerge><feMergeNode in="soft"/><feMergeNode in="grainy"/></feMerge>
  </filter>
  <filter id="bbChalkStrokeLight" x="-16%" y="-16%" width="132%" height="132%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="9" result="fray"/>
    <feDisplacementMap in="SourceGraphic" in2="fray" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="disp"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.05" numOctaves="4" seed="31" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.5 -0.6" result="mask"/>
    <feComposite in="disp" in2="mask" operator="in"/>
  </filter>
  <filter id="bbChalkStrokeHeavy" x="-12%" y="-12%" width="124%" height="124%">
    <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" seed="9" result="fray"/>
    <feDisplacementMap in="SourceGraphic" in2="fray" scale="1.8" xChannelSelector="R" yChannelSelector="G" result="disp"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" seed="31" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 2.4 -0.3" result="mask"/>
    <feComposite in="disp" in2="mask" operator="in"/>
  </filter>
  <filter id="bbChalkStrokeFast" x="-8%" y="-8%" width="116%" height="116%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="9" result="fray"/>
    <feDisplacementMap in="SourceGraphic" in2="fray" scale="1.5" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="bbChalkGrain" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.4" numOctaves="2" seed="23" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.25 0.28" result="m"/>
    <feComposite in="SourceGraphic" in2="m" operator="in"/>
  </filter>
  <filter id="bbChalkDust" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="2.8"/>
  </filter>
  <filter id="bbChalkText" x="-8%" y="-8%" width="116%" height="116%">
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="3" seed="5" result="t"/>
    <feDisplacementMap in="SourceGraphic" in2="t" scale="1.7" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="3" seed="13" result="n2"/>
    <feColorMatrix in="n2" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 2.2 -0.35" result="m2"/>
    <feComposite in="d" in2="m2" operator="in"/>
  </filter>`;

/**
 * 玻璃笔（白板笔/电子墨）：饱和的墨，落在光滑材料上。
 *
 * 为什么不是粉笔：粉笔是**干性颜料沉积在粗糙深色石板**上，它靠"掉粉"造毛边和颗粒 ——
 * 本质是脏的质感。放到通透玻璃上，粉笔灰会读成污渍；而且粉笔没有深色墨水，
 * 亮玻璃上要么看不见、要么就是假的。
 * 玻璃上真实的书写工具是白板笔：边缘利落、微透、偶尔断墨、手会抖。
 * 所以这套滤镜把"高频毛边"换成**长波长的手抖位移**（0.009 而不是 0.72 的 baseFrequency），
 * 把"逐像素颗粒镂空"换成**长波长浓淡**（45px 级的墨量起伏，像一笔扫过去的轻重）。
 */
const PEN_DEFS = `
  <filter id="bbPenStroke" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.009 0.016" numOctaves="2" seed="9" result="flow"/>
    <feDisplacementMap in="SourceGraphic" in2="flow" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="disp"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="3" seed="31" result="ink"/>
    <feColorMatrix in="ink" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.5 0.1" result="cov"/>
    <feComposite in="disp" in2="cov" operator="in"/>
  </filter>
  <filter id="bbPenStrokeLight" x="-14%" y="-14%" width="128%" height="128%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="2" seed="9" result="flow"/>
    <feDisplacementMap in="SourceGraphic" in2="flow" scale="4.2" xChannelSelector="R" yChannelSelector="G" result="disp"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="3" seed="31" result="ink"/>
    <feColorMatrix in="ink" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.2 -0.15" result="cov"/>
    <feComposite in="disp" in2="cov" operator="in"/>
  </filter>
  <filter id="bbPenStrokeHeavy" x="-9%" y="-9%" width="118%" height="118%">
    <feTurbulence type="fractalNoise" baseFrequency="0.008 0.013" numOctaves="2" seed="9" result="flow"/>
    <feDisplacementMap in="SourceGraphic" in2="flow" scale="2" xChannelSelector="R" yChannelSelector="G" result="disp"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="31" result="ink"/>
    <feColorMatrix in="ink" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 2 0.1" result="cov"/>
    <feComposite in="disp" in2="cov" operator="in"/>
  </filter>
  <filter id="bbPenFast" x="-7%" y="-7%" width="114%" height="114%">
    <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="1" seed="9" result="flow"/>
    <feDisplacementMap in="SourceGraphic" in2="flow" scale="2" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="bbPenFill" x="-6%" y="-6%" width="112%" height="112%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="23" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0.72" result="m"/>
    <feComposite in="SourceGraphic" in2="m" operator="in"/>
  </filter>
  <filter id="bbPenBleed" x="-25%" y="-25%" width="150%" height="150%">
    <feGaussianBlur stdDeviation="1.15"/>
  </filter>
  <filter id="bbPenText" x="-6%" y="-6%" width="112%" height="112%">
    <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="5" result="flow"/>
    <feDisplacementMap in="SourceGraphic" in2="flow" scale="0.9" xChannelSelector="R" yChannelSelector="G"/>
  </filter>`;

/** 两套笔的滤镜定义都在（板面决定用哪一支；CSS 里手绘预览笔那条 url(#bbChalkStrokeHeavy) 也还在） */
export const inkDefs = () => CHALK_DEFS + PEN_DEFS;

/* ────────────────────────── 笔迹滤镜的取用 ────────────────────────── */

export type InkFilters = {
  family: 'chalk' | 'glasspen';
  stroke: string;
  light: string;
  heavy: string;
  fast: string;
  grain: string;
  text: string;
  /** 笔画底下那层"晕"：粉笔是灰，玻璃笔是渗开的墨 */
  dust: { id: string; widthScale: number; opacity: number } | null;
  defaultColor: string;
  lightGuard: number;
  accent: string;
  palette: Record<string, string>;
  remap: Record<string, string>;
};

export function inkOf(s: BoardSurface): InkFilters {
  const pen = s.ink.family === 'glasspen';
  const common = {
    defaultColor: s.ink.defaultColor,
    lightGuard: s.ink.lightGuard,
    accent: s.ink.accent,
    palette: s.ink.palette,
    remap: s.ink.remap ?? {},
  };
  return pen
    ? {
        family: 'glasspen',
        stroke: 'bbPenStroke',
        light: 'bbPenStrokeLight',
        heavy: 'bbPenStrokeHeavy',
        fast: 'bbPenFast',
        grain: 'bbPenFill',
        text: 'bbPenText',
        dust: { id: 'bbPenBleed', widthScale: 1.22, opacity: 0.09 },
        ...common,
      }
    : {
        family: 'chalk',
        stroke: 'bbChalkStroke',
        light: 'bbChalkStrokeLight',
        heavy: 'bbChalkStrokeHeavy',
        fast: 'bbChalkStrokeFast',
        grain: 'bbChalkGrain',
        text: 'bbChalkText',
        dust: { id: 'bbChalkDust', widthScale: 1.8, opacity: 0.15 },
        ...common,
      };
}

/** 粉笔浓度 → 描边滤镜（干的一档断口多，实的一档更连续） */
export function strokeFilterFor(ink: InkFilters, density: number): string {
  if (density < 0.35) return ink.light;
  if (density > 0.72) return ink.heavy;
  return ink.stroke;
}

/**
 * 滤镜档位：把"每个元素各自挂 filter"改成"同一档的元素合到一层、挂一次"。
 *
 * 为什么必须这样：SVG 滤镜**即使复用同一份定义，每个元素仍要单独栅格化 + 合成**。
 * 实测 799 个带 filter 的元素逐帧动 → 平均帧间隔 130ms（≈7fps）。
 * 归到 ≤5 层之后，栅格化次数从 799 降到 ≤5。
 *
 * 放在这里（而不是屏端组件里）是为了让本地预览器用**同一套**分组规则 ——
 * 否则"本地图"会把每个元素各自打一遍滤镜，跟屏上不是一回事。
 */
export type FilterTier = 'none' | 'grain' | 'light' | 'default' | 'heavy';

/** 档位 → 滤镜 id（粉笔档 / 玻璃笔档由 ink 决定） */
export function tierFilter(ink: InkFilters, tier: FilterTier): string {
  if (tier === 'none') return '';
  if (tier === 'grain') return ink.grain;
  if (tier === 'light') return ink.light;
  if (tier === 'heavy') return ink.heavy;
  return ink.stroke;
}

/** 元素归哪一档：逐帧动画层不挂滤镜；有填充的走颗粒档（保住实心块质感）；其余按浓度分三档 */
export function filterTierOf(
  el: { stream?: boolean; fill?: string; chalkDensity?: number },
  ink: InkFilters,
): FilterTier {
  if (el.stream) return 'none';
  if (el.fill) return 'grain';
  const f = strokeFilterFor(ink, el.chalkDensity ?? 0.55);
  if (f === ink.light) return 'light';
  if (f === ink.heavy) return 'heavy';
  return 'default';
}

/* ────────────────────────── 浅色笔迹保护 ────────────────────────── */

const hex2rgb = (hex: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

const rgb2hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** 感知亮度（0..1，gamma 编码空间 —— 判断"白不白"用这个比线性更贴眼睛） */
export function luma(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * 浅色笔迹保护：亮玻璃上"白笔"看不见，也不舒服。
 *
 * 规则：亮度超过 `maxL` 的颜色按比例压暗（整体乘一个系数 → 色相与饱和度关系不变，
 * 只是变深），**彩度高的颜色允许留亮一点** —— 有色相的浅黄/浅粉靠色相还能跟
 * 冷调玻璃分开，纯白/浅灰没有色相可用，必须压下来。
 *
 * 只在板面声明了 lightGuard 时生效（深色板是 0 = 完全不碰颜色），
 * 不是"偷偷改用户的配色"，而是"这块材料上的墨色下限"。
 */
export function guardColor(color: string | undefined, maxL: number): string | undefined {
  if (!color || !maxL || maxL >= 1) return color;
  const rgb = hex2rgb(color);
  if (!rgb) return color;
  const [r, g, b] = rgb;
  const L = luma(r, g, b);
  const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  const target = Math.min(0.98, maxL + chroma * 0.25);
  if (L <= target) return color;
  const k = target / L;
  return rgb2hex(r * k, g * k, b * k);
}

/**
 * 笔色翻译：把"深色板那套笔色"翻成这块材料上的墨色（表在 surface.ink.remap 里）。
 * 只认 `#rgb`/`#rrggbb`，大小写不敏感；表里没有的原样返回。
 * **只用在笔迹与文字上**：填充是大色块，靠彩度还读得出来，翻译它等于改别人的画。
 */
export function remapInk(color: string | undefined, ink: InkFilters): string | undefined {
  if (!color) return color;
  const hit = ink.remap[color.toLowerCase()];
  return hit ?? color;
}

/** 笔迹/文字的最终颜色：先翻译（材料语言），再压暗（亮度下限） */
export function inkColor(color: string | undefined, ink: InkFilters): string {
  return (guardColor(remapInk(color ?? ink.defaultColor, ink), ink.lightGuard) as string) ?? ink.defaultColor;
}

/* ────────────────────────── 预设 ────────────────────────── */

/** 清新透亮的玻璃：浅色、通透、磨砂，背后一片重度模糊的景色 */
const GLASS: BoardSurface = {
  id: 'glass',
  label: '清新透亮玻璃',
  scenery: {
    base: { top: '#3f9fe0', horizon: '#cfe6f2', below: '#c9e6d2', bottom: '#2f8560' },
    blobs: [
      { cx: 1230, cy: 180, rx: 460, ry: 380, color: '#ffc46a', opacity: 0.6 }, // 太阳一侧的暖
      { cx: 150, cy: 40, rx: 640, ry: 430, color: '#2f8ed2', opacity: 0.5 }, // 天空更深的那一块
      { cx: 90, cy: 850, rx: 470, ry: 330, color: '#3f9a68', opacity: 0.6 }, // 近处树丛
      { cx: 1520, cy: 870, rx: 520, ry: 350, color: '#1f7a66', opacity: 0.55 },
      { cx: 950, cy: 630, rx: 430, ry: 170, color: '#ffdca0', opacity: 0.4 }, // 地平线上的暖光
      { cx: 300, cy: 660, rx: 230, ry: 250, color: '#2f7050', opacity: 0.5 }, // 树影
    ],
    blur: 64,
    /** 模糊 + 提饱和：白色玻璃压上来会掉彩度，不提就成"灰蒙蒙"而不是"清新" */
    saturate: 1.1,
    veil: { color: '#ffffff', opacity: 0 },
  },
  plate: {
    /**
     * 玻璃铺满整个画布（正好到 viewBox 边，比板面区域往外 20px）：**一整块玻璃**，
     * 景色只在玻璃后面，四周不留"相框"。
     */
    pad: 20,
    radius: 14,
    fill: '#fbfeff',
    opacity: 0.3,
    sheen: { from: 'rgba(255,255,255,0.26)', to: 'rgba(255,255,255,0.02)' },
    shade: 'rgba(150,185,205,0.12)',
    frost: 0.12,
    rim: { light: 'rgba(255,255,255,0.95)', mid: 'rgba(255,255,255,0.34)', cool: 'rgba(110,150,170,0.36)', width: 1.6 },
    inner: { color: '#ffffff', opacity: 0.4, inset: 3 },
    shadow: { dy: 0, blur: 0, color: '#0e2f3c', opacity: 0 },
    vignette: { color: 'rgba(70,105,130,0.10)', opacity: 1 },
    pool: { cx: 360, cy: 80, rx: 640, ry: 260, opacity: 0.1, blur: 44 },
  },
  ink: {
    family: 'glasspen',
    defaultColor: '#21414f',
    lightGuard: 0.62,
    accent: '#a8446b',
    /** 深色板那套荧光笔色 → 玻璃上的墨色（同一个"主色/强调/中性"的角色，换材料换颜料） */
    remap: {
      '#43d9e6': '#12707f', // 主色 青 → 深青
      '#ff7aa8': '#a8446b', // 强调 粉 → 深玫
      '#e6eef5': '#21414f', // 中性 冷白 → 墨
      '#f3f5f0': '#21414f', // 粉笔白 → 墨
      '#ffd98a': '#8a5a3c', // 琥珀 → 赭
      '#a8d3f5': '#2f5f7a', // 蓝 → 深蓝
      '#b6e2a1': '#3f6b4a', // 绿 → 深绿
      '#9db0c2': '#557585', // 次级中性 → 次级墨
    },
    palette: {
      ink: '#21414f',
      soft: '#557585',
      primary: '#12707f',
      accent: '#a8446b',
      warm: '#8a5a3c',
    },
  },
};

/** 旧深色玻璃科幻板（回滚 / 对照用）。这里的数值 = 改之前屏上的那一版，一个都没动。 */
const DARK: BoardSurface = {
  id: 'dark',
  label: '深色玻璃科幻板（旧）',
  scenery: {
    base: { top: '#10283a', horizon: '#0a1a28', below: '#0a1a28', bottom: '#060e18' },
    blobs: [],
    blur: 0,
    veil: { color: '#ffffff', opacity: 0 },
  },
  plate: {
    pad: 0,
    radius: 0,
    fill: '#0a1826',
    opacity: 1,
    sheen: { from: 'rgba(0,0,0,0)', to: 'rgba(0,0,0,0)' },
    shade: 'rgba(0,0,0,0)',
    frost: 0,
    rim: { light: 'rgba(67,217,230,0.26)', mid: 'rgba(67,217,230,0.26)', cool: 'rgba(67,217,230,0.26)', width: 1 },
    inner: { color: '#000000', opacity: 0, inset: 0 },
    shadow: { dy: 0, blur: 0, color: '#000000', opacity: 0 },
    vignette: { color: 'rgba(0,0,0,0)', opacity: 0 },
    pool: { cx: 0, cy: 0, rx: 0, ry: 0, opacity: 0, blur: 0 },
  },
  ink: {
    family: 'chalk',
    defaultColor: '#f3f5f0',
    lightGuard: 0,
    accent: '#43d9e6',
    palette: { ink: '#f3f5f0', soft: '#a8d3f5', primary: '#43d9e6', accent: '#ff7aa8', warm: '#ffd98a' },
  },
};

const PRESETS: Record<string, BoardSurface> = { glass: GLASS, dark: DARK };

/** 深色板的固定擦痕：让板子看起来是用过的（固定种子，不随机） */
const SMUDGES: [number, number, number, number][] = [
  [280, 200, 190, 70],
  [1180, 260, 220, 90],
  [700, 760, 260, 80],
  [1380, 720, 150, 60],
  [420, 620, 170, 65],
];

/** 深合并：数组整体替换（blobs 是"换一批"，不是"逐个合并"） */
function mergeDeep<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base;
  if (typeof over !== 'object' || Array.isArray(over)) return over as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(over as Record<string, unknown>)) {
    out[k] = mergeDeep((base as Record<string, unknown>)?.[k], (over as Record<string, unknown>)[k]);
  }
  return out as T;
}

/** 把 style.surface 解析成一块完整的板面材料（省略 = 默认的清新玻璃） */
export function resolveSurface(spec?: BoardSurfaceSpec): BoardSurface {
  if (!spec) return PRESETS[DEFAULT_SURFACE_ID];
  if (typeof spec === 'string') return PRESETS[spec] ?? PRESETS[DEFAULT_SURFACE_ID];
  const base = PRESETS[spec.id ?? DEFAULT_SURFACE_ID] ?? PRESETS[DEFAULT_SURFACE_ID];
  return mergeDeep(base, spec);
}

/* ────────────────────────── 标记生成 ────────────────────────── */

const n = (v: number) => Math.round(v * 100) / 100;

/** 板面 defs：两套笔迹滤镜 + 这块材料自己的渐变/滤镜/裁剪 */
export function surfaceDefs(s: BoardSurface, size: SurfaceSize): string {
  if (s.id === 'dark') return inkDefs() + darkDefs(size);
  return inkDefs() + glassDefs(s, size);
}

/** 板面图层：玻璃背后的景色 → 投影 → 玻璃本体 → 边缘/厚度。画在内容之前。 */
export function surfaceLayers(s: BoardSurface, size: SurfaceSize): string {
  if (s.id === 'dark') return darkLayers(size);
  return glassLayers(s, size);
}

function plateRect(s: BoardSurface, size: SurfaceSize) {
  const pad = s.plate.pad;
  return { x: -pad, y: -pad, w: size.w + pad * 2, h: size.h + pad * 2, rx: s.plate.radius };
}

function glassDefs(s: BoardSurface, size: SurfaceSize): string {
  const p = plateRect(s, size);
  const b = s.scenery.base;
  const sc = s.scenery;
  const blobs = sc.blobs
    .map(
      (bl, i) => `
    <radialGradient id="bbBlob${i}">
      <stop offset="0%" stop-color="${bl.color}" stop-opacity="${bl.opacity}"/>
      <stop offset="62%" stop-color="${bl.color}" stop-opacity="${n(bl.opacity * 0.45)}"/>
      <stop offset="100%" stop-color="${bl.color}" stop-opacity="0"/>
    </radialGradient>`,
    )
    .join('');
  return `
    <clipPath id="bbPlateClip">
      <rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" rx="${p.rx}"/>
    </clipPath>
    <linearGradient id="bbSceneryBase" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${b.top}"/>
      <stop offset="46%" stop-color="${b.horizon}"/>
      <stop offset="60%" stop-color="${b.below}"/>
      <stop offset="100%" stop-color="${b.bottom}"/>
    </linearGradient>${blobs}
    <filter id="bbSceneryBlur" x="-12%" y="-12%" width="124%" height="124%">
      <feGaussianBlur stdDeviation="${sc.blur}" result="b"/>
      ${
        sc.saturate && sc.saturate !== 1
          ? `<feColorMatrix in="b" type="saturate" values="${sc.saturate}"/>`
          : ''
      }
    </filter>
    <filter id="bbSoftBlur" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
    <filter id="bbPoolBlur" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="${s.plate.pool.blur}"/>
    </filter>
    <filter id="bbPlateFrost" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.42" numOctaves="3" seed="41" result="f"/>
      <feColorMatrix in="f" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="a"/>
      <feComponentTransfer in="a" result="dim">
        <feFuncA type="linear" slope="${s.plate.frost * 1.6}"/>
      </feComponentTransfer>
      <feComposite in="SourceGraphic" in2="dim" operator="in"/>
    </filter>
    <linearGradient id="bbPlateSheen" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0%" stop-color="${s.plate.sheen.from}"/>
      <stop offset="42%" stop-color="${s.plate.sheen.to}"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
    <linearGradient id="bbPlateShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="52%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="${s.plate.shade}"/>
    </linearGradient>
    <linearGradient id="bbPlateRim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${s.plate.rim.light}"/>
      <stop offset="42%" stop-color="${s.plate.rim.mid}"/>
      <stop offset="100%" stop-color="${s.plate.rim.cool}"/>
    </linearGradient>
    <linearGradient id="bbPlateEdgeIn" x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.55)"/>
      <stop offset="45%" stop-color="rgba(255,255,255,0.10)"/>
      <stop offset="100%" stop-color="rgba(70,110,130,0.42)"/>
    </linearGradient>
    <radialGradient id="bbPlateVignette" cx="50%" cy="46%" r="76%">
      <stop offset="58%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="${s.plate.vignette.color}"/>
    </radialGradient>`;
}

function glassLayers(s: BoardSurface, size: SurfaceSize): string {
  const { w, h } = size;
  const p = plateRect(s, size);
  const sc = s.scenery;
  const blobs = sc.blobs
    .map((bl, i) => `<ellipse cx="${bl.cx}" cy="${bl.cy}" rx="${bl.rx}" ry="${bl.ry}" fill="url(#bbBlob${i})"/>`)
    .join('\n      ');
  const sh = s.plate.shadow;
  const rect = `x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}"`;
  return `
    ${
      /* 玻璃"浮"起来的那点影：画在玻璃底下、玻璃形状之外可见 */
      sh.opacity > 0
        ? `<rect x="${n(p.x)}" y="${n(p.y + sh.dy)}" width="${n(p.w)}" height="${n(p.h)}" rx="${p.rx}" fill="${sh.color}" opacity="${sh.opacity}" filter="url(#bbSoftBlur)"/>`
        : ''
    }
    <!-- ① 玻璃背后的景色：**只在玻璃后面**（裁到玻璃形状），重度模糊后只剩色彩氛围 -->
    <g clip-path="url(#bbPlateClip)">
      <g filter="url(#bbSceneryBlur)">
        <rect x="-24" y="-24" width="${w + 48}" height="${h + 48}" fill="url(#bbSceneryBase)"/>
        ${blobs}
        <!-- 一点"远处景物"的结构：模糊之后读成柔和的明暗，而不是色块 -->
        <ellipse cx="${w * 0.5}" cy="${h * 0.71}" rx="${w * 0.64}" ry="${h * 0.15}" fill="#7fb497" opacity="0.42"/>
        <ellipse cx="${w * 0.16}" cy="${h * 0.62}" rx="${w * 0.1}" ry="${h * 0.18}" fill="#4e8768" opacity="0.5"/>
        <ellipse cx="${w * 0.88}" cy="${h * 0.64}" rx="${w * 0.12}" ry="${h * 0.2}" fill="#3d7a63" opacity="0.45"/>
        <circle cx="${w * 0.72}" cy="${h * 0.18}" r="${h * 0.11}" fill="#fff0d2" opacity="0.6"/>
      </g>
      <rect x="-24" y="-24" width="${w + 48}" height="${h + 48}" fill="${sc.veil.color}" opacity="${sc.veil.opacity}"/>

      <!-- ② 玻璃本体：透光的磨砂面 + 上左来光 + 下沿冷色 + 反光池 + 暗角 + 磨砂颗粒 -->
      <rect ${rect} fill="${s.plate.fill}" opacity="${s.plate.opacity}"/>
      <rect ${rect} fill="url(#bbPlateSheen)"/>
      <rect ${rect} fill="url(#bbPlateShade)"/>
      <ellipse cx="${s.plate.pool.cx}" cy="${s.plate.pool.cy}" rx="${s.plate.pool.rx}" ry="${s.plate.pool.ry}"
        fill="#ffffff" opacity="${s.plate.pool.opacity}" filter="url(#bbPoolBlur)"/>
      <rect ${rect} fill="url(#bbPlateVignette)"/>
      <rect ${rect} fill="#c9d9e2" filter="url(#bbPlateFrost)"/>

      <!-- ③ 玻璃的厚度：内边缘一道斜向的明暗（受光侧亮、背光侧沉下去） -->
      <rect x="${n(p.x + 1.2)}" y="${n(p.y + 1.2)}" width="${n(p.w - 2.4)}" height="${n(p.h - 2.4)}" rx="${Math.max(0, p.rx - 1.2)}"
        fill="none" stroke="url(#bbPlateEdgeIn)" stroke-width="2.4"/>
    </g>

    <!-- ④ 外边缘：受光侧亮、背光侧冷 + 内圈一道高光（"这是一块玻璃"的关键一笔） -->
    <rect x="${n(p.x + s.plate.rim.width / 2)}" y="${n(p.y + s.plate.rim.width / 2)}"
      width="${n(p.w - s.plate.rim.width)}" height="${n(p.h - s.plate.rim.width)}" rx="${p.rx}"
      fill="none" stroke="url(#bbPlateRim)" stroke-width="${s.plate.rim.width}"/>
    <rect x="${n(p.x + s.plate.inner.inset)}" y="${n(p.y + s.plate.inner.inset)}"
      width="${n(p.w - s.plate.inner.inset * 2)}" height="${n(p.h - s.plate.inner.inset * 2)}" rx="${Math.max(0, p.rx - s.plate.inner.inset)}"
      fill="none" stroke="${s.plate.inner.color}" stroke-opacity="${s.plate.inner.opacity}" stroke-width="1"/>`;
}

/* 深色板（旧）：完全照搬改之前 Blackboard.tsx 里的 defs 与图层 */
function darkDefs(size: SurfaceSize): string {
  const { w, h } = size;
  return `
    <filter id="bbBoardDust" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" seed="2"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.62  0 0 0 0 0.85  0 0 0 0 0.95  0 0 0 0.16 0"/>
    </filter>
    <filter id="bbBoardMottle" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.0055" numOctaves="3" seed="17"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.7  0 0 0 0 0.88  0 0 0 0 0.95  0 0 0 0.45 -0.2"/>
    </filter>
    <pattern id="bbGrid" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(67,217,230,0.075)" stroke-width="1"/>
    </pattern>
    <linearGradient id="bbHorizon" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(67,217,230,0)"/>
      <stop offset="55%" stop-color="rgba(67,217,230,0.09)"/>
      <stop offset="100%" stop-color="rgba(67,217,230,0)"/>
    </linearGradient>
    <filter id="bbSmudge" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="30"/>
    </filter>
    <radialGradient id="bbSurface" cx="50%" cy="42%" r="78%">
      <stop offset="0%" stop-color="#10283a"/>
      <stop offset="52%" stop-color="#0a1a28"/>
      <stop offset="100%" stop-color="#060e18"/>
    </radialGradient>
    <radialGradient id="bbVignette" cx="50%" cy="45%" r="74%">
      <stop offset="52%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.36)"/>
    </radialGradient>`;
}

function darkLayers(size: SurfaceSize): string {
  const { w, h } = size;
  const smudges = SMUDGES.map((s) => `<ellipse cx="${s[0]}" cy="${s[1]}" rx="${s[2]}" ry="${s[3]}" fill="#cfd8cc" opacity="0.045"/>`).join('\n        ');
  return `
    <rect x="-24" y="-24" width="${w + 48}" height="${h + 48}" fill="#060e18"/>
    <rect x="-16" y="-16" width="${w + 32}" height="${h + 32}" rx="12" fill="#0a1826" opacity="0.94"/>
    <rect x="0" y="0" width="${w}" height="${h}" fill="url(#bbSurface)"/>
    <rect x="0" y="0" width="${w}" height="${h}" fill="url(#bbGrid)"/>
    <rect x="0" y="0" width="${w}" height="${h}" filter="url(#bbBoardMottle)" opacity="0.42"/>
    <rect x="0" y="0" width="${w}" height="${h * 0.34}" fill="url(#bbHorizon)"/>
    <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="rgba(67,217,230,0.26)" stroke-width="1"/>
    <g style="mix-blend-mode:screen" filter="url(#bbSmudge)">
        ${smudges}
    </g>
    <rect x="0" y="0" width="${w}" height="${h}" filter="url(#bbBoardDust)"/>
    <rect x="0" y="0" width="${w}" height="${h}" fill="url(#bbVignette)"/>`;
}
