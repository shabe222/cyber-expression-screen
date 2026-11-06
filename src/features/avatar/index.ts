/**
 * 化身容器出口。
 *
 * 动线接入方式：
 *   import { AvatarSlot, useAvatarAssets } from '../avatar';
 *   <AvatarSlot mood={mood} />            // mood 由 motion/ 的状态机决定
 *   const assets = useAvatarAssets();      // 需要直接拿 URL 时用这个
 */

export { AvatarSlot } from './AvatarSlot';
export { resolveAvatarAssets, resolveAvatarUrl, useAvatarAssets } from './avatarAssets';
export type { AvatarAssets, AvatarMood } from './avatarAssets';
