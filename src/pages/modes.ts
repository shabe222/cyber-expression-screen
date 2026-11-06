/**
 * 屏上的脚本模式表（默认界面不显示，收在「调试」抽屉里）。
 *
 * 用户 2026-10-17 定的方向：**屏上不要一堆按钮，由 agent 通过对话驱动**。
 * 这些模式是调试/演示用的入口，保留但不占主界面。
 */

import {
  buildDemoScript,
  buildDrawTestScript,
  buildEraseDemoScript,
  buildWhaleMoodScript,
  type BlackboardScript,
} from '../features/blackboard';
import { aiWhaleGirl } from '../artwork/aiWhaleGirl';
import { swimWhale } from '../artwork/swim';
import { IconClear, IconErase, IconPen, IconSwim, IconTarget, IconWhaleTail } from '../features/skin';

export type ModeId = 'artwork' | 'swim' | 'whale' | 'draw' | 'board' | 'erase' | 'clear';

/** 脚本来源：要么现算一份（build），要么直接给一份（script，如 Lead 手绘的资产） */
export type ModeDef = {
  id: Exclude<ModeId, 'clear'>;
  label: string;
  icon: typeof IconPen;
  build?: () => BlackboardScript;
  script?: BlackboardScript;
  /** 逐个播 op 的间隔。逐帧动画类脚本（游动）要压小，否则一帧等太久 */
  paceMs?: number;
};

export const MODES: ModeDef[] = [
  { id: 'artwork', label: 'AI 手绘', icon: IconPen, script: aiWhaleGirl },
  // 游动是逐帧动画（12 帧 / 108 ops）：170ms 一帧要 18 秒，压到 60ms 才像在游
  { id: 'swim', label: '游动', icon: IconSwim, script: swimWhale, paceMs: 60 },
  { id: 'whale', label: '鲸鱼少女表述', icon: IconWhaleTail, build: buildWhaleMoodScript },
  { id: 'draw', label: '画画自测', icon: IconTarget, build: buildDrawTestScript },
  { id: 'board', label: '板书演示', icon: IconClear, build: buildDemoScript },
  { id: 'erase', label: '擦除演示', icon: IconErase, build: buildEraseDemoScript },
];

/** 心情 id → 屏上人话（artwork/moods.ts 的关键词表） */
export const MOOD_LABEL: Record<string, string> = {
  happy: '开心',
  tired: '有点累',
  calm: '平静',
  cheer: '加油',
};
