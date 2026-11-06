/**
 * 骨骼动画播放器：requestAnimationFrame 循环，按时间取相位，无限循环。
 *
 * 两条刻意的做法：
 * 1. **按时间取 t，不做累加** —— `t = (now % loopMs) / loopMs`。
 *    掉帧时相位照样往前走，速度不会变慢（累加式播放一卡就会"慢动作"）。
 * 2. **限帧**：每帧都重绘整具骨架（几十个带粉笔滤镜的部件）代价不小，
 *    默认 30fps。24fps 也够"放电视"的味道，需要时传参即可。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BlackboardElement } from '../blackboard';
import { poseAt } from './solve';
import { rigFrame } from './toElements';
import type { Rig } from './types';

export type RigPlayerApi = {
  /** 骨架的**几何**（局部坐标）：换角色才变，交给 <Blackboard overlayElements> */
  elements: BlackboardElement[];
  /** 每帧在变的 transform：交给 <Blackboard overlayTransforms>，由它直接写 DOM 属性 */
  transforms: Record<string, string>;
  rig: Rig | null;
  playing: boolean;
  /** 实测帧率（每秒更新一次） */
  fps: number;
  /** 当前循环相位 0~1 */
  phase: number;
  play: (rig: Rig) => void;
  stop: () => void;
};

export function useRigPlayer(targetFps = 0): RigPlayerApi {
  const [rig, setRig] = useState<Rig | null>(null);
  const [elements, setElements] = useState<BlackboardElement[]>([]);
  const [transforms, setTransforms] = useState<Record<string, string>>({});
  const [fps, setFps] = useState(0);
  const [phase, setPhase] = useState(0);

  const rafRef = useRef(0);
  const rigRef = useRef<Rig | null>(null);
  const startRef = useRef(0);
  const lastFrameRef = useRef(0);
  const fpsWindow = useRef({ count: 0, since: 0 });

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    rigRef.current = null;
    setRig(null);
    setElements([]);
    setTransforms({});
    setFps(0);
    setPhase(0);
  }, []);

  const play = useCallback((next: Rig) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    rigRef.current = next;
    const now = performance.now();
    startRef.current = now;
    lastFrameRef.current = 0;
    fpsWindow.current = { count: 0, since: now };
    const first = rigFrame(next, poseAt(next, 0));
    setRig(next);
    setElements(first.elements); // 结构只在这里设一次
    setTransforms(first.transforms);
    setPhase(0);
  }, []);

  useEffect(() => {
    if (!rig) return;
    // targetFps = 0 → 不设上限，跟着 rAF 走（浏览器给多少帧就画多少帧）
    const minGap = targetFps > 0 ? 1000 / targetFps : 0;

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const current = rigRef.current;
      if (!current) return;
      if (now - lastFrameRef.current < minGap) return;
      lastFrameRef.current = now;

      const loopMs = Math.max(1, current.loopMs);
      const p = ((now - startRef.current) % loopMs) / loopMs;
      // 每帧只产出 transform（几何不变），由黑板直接写 DOM —— 不走 React 重渲染
      setTransforms(rigFrame(current, poseAt(current, p)).transforms);
      setPhase(p);

      const w = fpsWindow.current;
      w.count += 1;
      if (now - w.since >= 1000) {
        setFps(Math.round((w.count * 1000) / (now - w.since)));
        w.count = 0;
        w.since = now;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [rig, targetFps]);

  return { elements, transforms, rig, playing: !!rig, fps, phase, play, stop };
}
