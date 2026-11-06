/**
 * 玻璃面板：屏上所有分区的容器。
 * 半透明 + backdrop-blur + 上沿高光 + HUD 角框 = A2 的玻璃科幻底座。
 */

import type { ReactNode } from 'react';
import { HudFrame } from './HudFrame';
import styles from './Skin.module.css';

type Props = {
  children: ReactNode;
  className?: string;
  /** strong = 更实的玻璃，用于承载内容（黑板、化身）的主面板 */
  tone?: 'default' | 'strong';
  /** 是否画 HUD 角框 */
  hud?: boolean;
};

export function GlassPanel({ children, className, tone = 'default', hud = true }: Props) {
  return (
    <div
      className={[styles.panel, tone === 'strong' ? styles.panelStrong : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.panelSheen} aria-hidden="true" />
      {hud && <HudFrame />}
      {children}
    </div>
  );
}
