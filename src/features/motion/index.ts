/**
 * 动线出口。
 *
 * 用法（屏线在 Screen 页接线）：
 *   const motion = useAvatarMotion('idle');
 *   <AvatarSlot mood={ASSET_MOOD[motion.state]} stateLabel={STATE_LABEL[motion.state]}>
 *     <AvatarMotion state={motion.state} blink={motion.blink} />
 *   </AvatarSlot>
 *   <MotionControls motion={motion} />
 */

export { AvatarMotion } from './AvatarMotion';
export { MotionControls } from './MotionControls';
export { useAvatarMotion } from './useAvatarMotion';
export type { AvatarMotionApi } from './useAvatarMotion';
export {
  ASSET_MOOD,
  MOTION_STATES,
  PANEL_STATES,
  STATE_LABEL,
  TRANSITION_MS,
  type AvatarMotionState,
} from './types';
