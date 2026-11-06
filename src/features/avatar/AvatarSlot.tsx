/**
 * 化身容器（avatar slot）。
 *
 * 屏层只提供"位子"：一个玻璃台座 + 立绘显示 + 素材缺失时的占位提示。
 * 动作状态机、过渡动画、状态切换都由动线在 src/features/motion/ 里做，
 * 这里通过 props 被动接收状态（mood / src），自己不持有任何动作状态。
 */

import type { ReactNode } from 'react';
import { GlassPanel, IconAvatar, IconWhaleTail } from '../skin';
import { useAvatarAssets, type AvatarMood } from './avatarAssets';
import styles from './AvatarSlot.module.css';

type Props = {
  /** 当前动作状态。动线后续接状态机时传进来；默认待机。 */
  mood?: AvatarMood;
  /** 直接指定立绘 URL，优先级高于 mood（动线做过渡/换帧时可用） */
  src?: string | null;
  /** 直接给显示用的状态文字（动线接进来时显示「待机/笑/卖萌」这种人话） */
  stateLabel?: string;
  /**
   * 用 children 当立绘：动线把带过渡动画的 <AvatarMotion /> 放进来。
   * 不给就还是本容器自己的静态图（占位/直接显示）。
   */
  children?: ReactNode;
  className?: string;
};

export function AvatarSlot({ mood = 'idle', src, stateLabel, children, className }: Props) {
  const assets = useAvatarAssets();
  const url = src ?? assets.urls[mood];

  return (
    <GlassPanel tone="strong" className={[styles.slot, className].filter(Boolean).join(' ')}>
      <div className={styles.head}>
        <IconAvatar className={styles.headIcon} />
        <h2 className={styles.headTitle}>化身 · 鲸鱼少女</h2>
        <span className={styles.headState}>{stateLabel ?? (assets.ready ? mood : '待接入')}</span>
      </div>

      <div className={styles.stage}>
        {/* 台座：一圈辉光 + 一道地平线，给立绘一个"站的地方" */}
        <span className={styles.dais} aria-hidden="true" />
        {/* 立绘背后的一层柔光：深色舱里让角色"被照亮"，而不是贴纸贴在黑底上 */}
        <span className={styles.figureGlow} aria-hidden="true" />

        {children ? (
          children
        ) : url ? (
          <img className={styles.figure} src={url} alt={`鲸鱼少女 · ${mood}`} draggable={false} />
        ) : (
          <div className={styles.placeholder} role="img" aria-label="化身占位：等待立绘">
            <IconWhaleTail className={styles.placeholderGlyph} />
            <p className={styles.placeholderText}>立绘待接入</p>
            <p className={styles.placeholderHint}>assets/avatars/ 就位后自动显示</p>
          </div>
        )}
      </div>

      <div className={styles.foot}>
        <span className={styles.footLabel}>动作状态</span>
        <span className={styles.footValue}>
          {assets.ready ? `已接入 ${assets.files.length} 张素材` : '等待美术线出图（L1）'}
        </span>
      </div>
    </GlassPanel>
  );
}
