/**
 * 骨骼绑定动画出口。
 *
 * 用法：
 *   const player = useRigPlayer(30);
 *   player.play(GOLDFISH_ACTIONS.run);       // 无限循环播放
 *   <Blackboard overlayElements={player.elements} ... />
 *   player.stop();
 */

export { useRigPlayer } from './useRigPlayer';
export type { RigPlayerApi } from './useRigPlayer';
export { attachPoint, ease, poseAt, solveRig } from './solve';
export { rigFrame, rigToElements } from './toElements';
export type { RigFrame } from './toElements';
export type { Bone, BonePart, BoneWorld, CirclePart, Keyframe, Part, PathPart, PolyPart, Rig } from './types';
