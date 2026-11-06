/**
 * Live 通道：轮询 `/live/board.json`，seq 变了就把 payload 交给屏。
 *
 * 为什么轮询而不是 WebSocket：零依赖、不碰 Vite 配置、断了自己会好；
 * 600ms 的延迟对"我说话 → 屏上出现东西"这个场景完全够用。
 *
 * 实现细节：
 * - 用 setTimeout 链而不是 setInterval —— 上一次没回来就不发下一次，慢的时候不会堆请求
 * - 状态没变就不 setState（否则每 600ms 白渲染一次）
 * - 请求失败只把状态标成 offline，**继续轮询**（文件可能还没被推第一次）
 */

import { useEffect, useRef, useState } from 'react';
import type { LivePayload, LiveStatus } from './types';

export type LiveBoardApi = {
  /** 最近一次"新的" payload（seq 变化时更新） */
  payload: LivePayload | null;
  /** 已应用到的序号 */
  seq: number;
  status: LiveStatus;
  /** 最近一次收到新 payload 的时间戳 */
  lastAt: number | null;
  error: string | null;
};

export function useLiveBoard(opts: { url?: string; intervalMs?: number } = {}): LiveBoardApi {
  const url = opts.url ?? '/live/board.json';
  const intervalMs = opts.intervalMs ?? 600;

  const [api, setApi] = useState<LiveBoardApi>({
    payload: null,
    seq: 0,
    status: 'connecting',
    lastAt: null,
    error: null,
  });

  const seqRef = useRef(0);
  const statusRef = useRef<LiveStatus>('connecting');
  const errorRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer = 0;

    const setStatus = (next: LiveStatus, error: string | null) => {
      if (statusRef.current === next && errorRef.current === error) return;
      statusRef.current = next;
      errorRef.current = error;
      setApi((s) => ({ ...s, status: next, error }));
    };

    const poll = async () => {
      try {
        // 带时间戳绕过缓存：board.json 会被反复覆盖，缓存住就永远看不到新内容
        const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as LivePayload;
        if (!alive) return;

        const seq = Number(data?.seq ?? 0);
        if (seq !== seqRef.current) {
          seqRef.current = seq;
          setApi((s) => ({ ...s, payload: data, seq, lastAt: Date.now(), status: 'live', error: null }));
          statusRef.current = 'live';
          errorRef.current = null;
        } else {
          setStatus('live', null);
        }
      } catch (err) {
        if (!alive) return;
        setStatus('offline', err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) timer = window.setTimeout(poll, intervalMs);
      }
    };

    poll();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [url, intervalMs]);

  return api;
}
