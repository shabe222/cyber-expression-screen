/// <reference types="vite/client" />

/**
 * 由 vite.config.ts 里的 avatarManifest 插件提供：
 * - files  : assets/avatars 下真实存在的图片文件名
 * - states : 美术线 manifest.json 声明的 state → 文件映射（只保留文件确实存在的条目）
 */
declare module 'virtual:avatar-manifest' {
  export const files: string[];
  export const states: Record<string, { file: string; label?: string }>;
  const defaultExport: string[];
  export default defaultExport;
}
