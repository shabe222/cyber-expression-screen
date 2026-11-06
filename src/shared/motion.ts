/**
 * 动效偏好（屏层共用）。
 *
 * 黑板组件（借自柿子智学的基线）里 import 了 `../../shared/motion`，
 * 在那边它是柿子智学 shared 目录下的一堆动效工具之一；这里只保留屏层真正用到的那一个：
 * 「用户是否要求减少动态效果」。
 *
 * 刻意放在 src/shared/ 而不是 src/features/motion/ ——
 * features/motion 是动线的写作用域（动作状态机），屏层不碰。
 */

/** 用户/系统是否要求减少动态效果。SSR 或旧浏览器下按 false 处理。 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
