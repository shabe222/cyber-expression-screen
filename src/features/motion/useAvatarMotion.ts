/**
 * 动作状态机（动线）。
 *
 * 只做三件事：记住当前动作状态、按节奏眨眼、把"心情"翻译成动作。
 * 怎么动（淡入淡出/位移/呼吸）在 AvatarMotion 与它的 CSS 里，这里不管画。
 *
 * 用法：
 *   const motion = useAvatarMotion('idle');
 *   <AvatarMotion state={motion.state} blink={motion.blink} />
 *   <MotionControls motion={motion} />
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ASSET_MOOD, MOTION_STATES, type AvatarMotionState } from './types';
import type { AvatarMood } from '../avatar';

/** 眨眼：闭合停留时长与两次之间的随机间隔 */
const BLINK_MS = 130;
const BLINK_GAP_MIN_MS = 3200;
const BLINK_GAP_MAX_MS = 5600;

export type AvatarMotionApi = {
  /** 当前动作状态 */
  state: AvatarMotionState;
  /** 切到某个状态（过渡由 AvatarMotion 做） */
  setState: (next: AvatarMotionState) => void;
  /** 按状态序列切到下一个（给"点一下就换"的场景） */
  next: () => void;
  /** 面板上直接可点的状态 */
  states: AvatarMotionState[];
  /** 此刻是否在眨眼 */
  blink: boolean;
  /** 上一次切换的时间戳（验收/调试用） */
  changedAt: number;
  /**
   * 心情 → 动作：为后续"用户/agent 说一句心情，屏上换动作"预留的入口。
   * 现在按立绘差分的名字直接对应，接入语义判断时只改这一个函数。
   */
  setFromMood: (mood: AvatarMood) => void;
};

export function useAvatarMotion(initial: AvatarMotionState = 'idle'): AvatarMotionApi {
  const [state, setStateRaw] = useState<AvatarMotionState>(initial);
  const [blink, setBlink] = useState(false);
  const [changedAt, setChangedAt] = useState(0);

  const setState = useCallback((next: AvatarMotionState) => {
    setStateRaw((cur) => (cur === next ? cur : next));
  }, []);

  const next = useCallback(() => {
    setStateRaw((cur) => MOTION_STATES[(MOTION_STATES.indexOf(cur) + 1) % MOTION_STATES.length]);
  }, []);

  // 状态真的变了才记时间戳（不把副作用塞进 setState 的更新函数里）
  useEffect(() => {
    setChangedAt(Date.now());
  }, [state]);

  const setFromMood = useCallback(
    (mood: AvatarMood) => {
      const hit = (Object.keys(ASSET_MOOD) as AvatarMotionState[]).find((s) => ASSET_MOOD[s] === mood);
      if (hit) setState(hit);
    },
    [setState],
  );

  // 眨眼节奏：不定间隔地眨一下，人不会像节拍器一样眨眼
  useEffect(() => {
    let alive = true;
    let closeTimer = 0;
    let openTimer = 0;

    const schedule = () => {
      const gap = BLINK_GAP_MIN_MS + Math.random() * (BLINK_GAP_MAX_MS - BLINK_GAP_MIN_MS);
      closeTimer = window.setTimeout(() => {
        if (!alive) return;
        setBlink(true);
        openTimer = window.setTimeout(() => {
          if (!alive) return;
          setBlink(false);
          schedule();
        }, BLINK_MS);
      }, gap);
    };

    schedule();
    return () => {
      alive = false;
      window.clearTimeout(closeTimer);
      window.clearTimeout(openTimer);
    };
  }, []);

  // 卸载时别把"正在眨"留在外面
  useEffect(() => () => setBlink(false), []);

  return { state, setState, next, states: MOTION_STATES, blink, changedAt, setFromMood };
}
