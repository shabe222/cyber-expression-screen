/**
 * Live 通道的数据契约（对应 docs/rig-format.md 第一节）。
 *
 * Lead 用 tools/board-push.cjs 把 payload 写进 screen/public/live/board.json，
 * 屏端轮询这个静态文件；seq 变了才应用 —— 零依赖、不碰构建、断线自愈。
 */

import type { BlackboardLoop, BlackboardScript, BlackboardStyle } from '../blackboard';
import type { Rig } from '../rig';

export type LivePayload = {
  /** 协议版本（实际下发的 payload 里一直有，之前类型漏了） */
  protocol?: number;
  /** 递增序号：客户端只在 seq 变化时应用（防重复播放） */
  seq: number;
  ts?: string;
  /** 口播/字幕 */
  say?: string;
  /** 清板 */
  clear?: boolean;
  /** 一次性黑板脚本（逐笔落笔） */
  script?: BlackboardScript;
  /** 循环播放：给在 payload 顶层也行（会并进 script.loop） */
  loop?: BlackboardLoop;
  /** 播放模式（实际下发里有；屏端目前只用 script.mode） */
  mode?: 'live' | 'instant';
  /** 信封级落笔间隔（实际下发里有；屏端目前按 script.paceMs 走） */
  paceMs?: number;
  /**
   * 信封级板面样式：**屏端会并进 script.style**（script 自己写了的字段优先）。
   * 板面材料（玻璃/景色/笔）走 `style.surface`，见 features/blackboard/glass.ts。
   */
  style?: BlackboardStyle;
  /** 保留字段（实际下发里有，屏端暂未消费） */
  marks?: Record<string, unknown>;
  /** 绑定角色动画 —— 给了它就进入"放电视"模式 */
  rig?: Rig;
  /** 停止当前动画 */
  stop?: boolean;
};

export type LiveStatus = 'connecting' | 'live' | 'offline';
