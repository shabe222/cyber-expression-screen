/**
 * 人类作画（B2「你画」）出口。
 *
 * 用法（屏线在 Screen 页接线）：
 *   const el = strokeElement(points);              // 一笔 → stroke 元素（source:'human'）
 *   pushOps({ kind: 'add', element: el });         // 走黑板的 appendOps 增量上板
 *   <HumanTools drawing={...} onMood={...} />       // 工具栏
 */

export { HumanTools } from './HumanTools';
export { HUMAN_INK, HUMAN_LAYER, moodTextElement, moodTextSlot, strokeElement } from './humanInk';
