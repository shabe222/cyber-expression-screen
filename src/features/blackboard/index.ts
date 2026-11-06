/**
 * 黑板能力的前端出口。
 *
 * 用法（对话区与通话面板都只是把它放进容器）：
 *
 *   const script = useBlackboardScript(moment);   // 从消息里取黑板脚本
 *   const [narration, setNarration] = useState<BoardNarration>({ saying: null, leaving: null });
 *   <NarrationCaption {...narration} />           // 板子上方：DARYA 此刻在讲的那一句
 *   <Blackboard script={script} onBusyChange={setDrawing} onNarrationChange={setNarration} />
 *
 * 设计约束：
 * - 零新依赖；几何由后端解算，这里只渲染
 * - 通话模式通过 onBusyChange 知道"还在写"，从而在动作做完前不打断自己
 * - 逐句讲解由 Blackboard 排、由 NarrationCaption 画：板面只留粉笔，字回到说话的位置
 */

export { Blackboard } from './Blackboard';
export type { BoardNarration, Narration } from './Blackboard';
export { NarrationCaption } from './NarrationCaption';
export * from './types';
/** 笔刷 / 压感 / 简写：AI 端（penkit、同源预渲染器）也用这一份，别另写一套 */
export { BRUSHES, brushOf, hasPressure, normalizeElement, parsePts, pointPressure, pressureFactor } from './brushes';
export type { BrushName, BrushSpec } from './brushes';
/**
 * 三层语义（hidden 靶子 / visible 用户的笔迹 / result 结果层）——
 * **唯一判定入口**：屏端组件与本地预览器（tools/preview.mjs）都 import 这一份，
 * 不许在别处再写一遍 `if (plane === 'hidden')`（见 docs/three-layer-schema.md 第二节）。
 */
export {
  DEFAULT_PLANE,
  isPlaneShown,
  isPlaneVisible,
  parsePlaneQuery,
  PLANE_DEBUG_ATTRS,
  PLANE_DEBUG_FILTER_ID,
  PLANE_DEBUG_OPACITY,
  PLANE_DEBUG_STROKE_COLOR,
  PLANES,
  planeDebugDefs,
  planeOf,
  resolveVisiblePlanes,
} from './plane';
export type { Plane, PlaneCarrier, PlaneVisibility } from './plane';
/**
 * 填充缝合（消掉相邻填充之间的抗锯齿缝，即"碎玻璃"）——
 * **唯一事实源**：屏端组件与本地预览器（tools/preview.mjs）都从这里取。
 */
export { DEFAULT_FILL_SEAM, FILL_SEAM_MAX, FILL_UNION_CLIP_ID, fillUnionDefs, normalizeFillSeam } from './seam';
/**
 * 内容与玻璃的关系（玻璃前表面反射，让内容像"写在玻璃上"）——
 * **唯一事实源**：屏端组件与本地预览器（tools/preview.mjs）都从这里取。
 */
export {
  DEFAULT_CONTENT_ON_GLASS,
  GLASS_FRONT_CLIP_ID,
  GLASS_FRONT_SHEEN_ID,
  GLASS_FRONT_STREAK_ID,
  glassFrontDefs,
  glassFrontLayer,
  normalizeContentOnGlass,
  plateRectOf,
} from './onglass';
/**
 * 湿边（平色区域边缘那圈略深的色）—— **唯一事实源**，屏端与预览器共用。
 */
export { DEFAULT_WET_EDGE, WET_EDGE_MAX, darkenHex, normalizeWetEdge, wetEdgeStyle } from './wetedges';
export { useBlackboardScript } from './useBlackboardScript';
/** 板面材料（玻璃 + 背后的景色 + 笔）：payload 的 style.surface 用它切换 */
export { DEFAULT_SURFACE_ID, guardColor, inkDefs, inkOf, resolveSurface, strokeFilterFor, surfaceDefs, surfaceLayers } from './glass';
export type { BoardSurface, BoardSurfaceSpec, InkFilters, SceneryBlob } from './glass';
export { buildDemoScript, buildEraseDemoScript } from './demoScript';
export { buildWhaleMoodScript } from './cyberScript';
export { buildDrawTestScript } from './drawTest';
