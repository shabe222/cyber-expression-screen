/**
 * 动作状态与过渡参数（动线）。
 *
 * 状态命名对齐美术线交付的立绘差分：
 *   idle 待机 / smile 笑 / pout 卖萌 / shy 害羞 / think 思考 / wave 挥手 / run 跑
 * 7 张差分已全部交付（manifest.json 声明），ASSET_MOOD 一一对应。
 */

import type { AvatarMood } from '../avatar';

export type AvatarMotionState = 'idle' | 'smile' | 'pout' | 'shy' | 'think' | 'wave' | 'run';

/** 状态机的完整状态序列（手动切换按这个顺序循环） */
export const MOTION_STATES: AvatarMotionState[] = ['idle', 'smile', 'pout', 'shy', 'think', 'wave', 'run'];

/** 屏上显示用的中文名（界面=产品内语言，不用 emoji） */
export const STATE_LABEL: Record<AvatarMotionState, string> = {
  idle: '待机',
  smile: '笑',
  pout: '卖萌',
  shy: '害羞',
  think: '思考',
  wave: '挥手',
  run: '跑',
};

/** 状态 → 立绘差分。美术线 7 张已齐，全部一一对应 */
export const ASSET_MOOD: Record<AvatarMotionState, AvatarMood> = {
  idle: 'idle',
  smile: 'smile',
  pout: 'pout',
  shy: 'shy',
  think: 'think',
  wave: 'wave',
  run: 'run',
};

/** 过渡时长（毫秒），与 AvatarMotion.module.css 里的关键帧保持一致 */
export const TRANSITION_MS = 460;

/** 手动切换面板上直接给按钮的状态（7 张差分齐了，全部放上来） */
export const PANEL_STATES: AvatarMotionState[] = ['idle', 'smile', 'pout', 'shy', 'think', 'wave', 'run'];
