/**
 * 动作切换面板（手动切换，为后续"心情 → 动作"预留）。
 *
 * 状态由 useAvatarMotion 持有，这里只负责把按钮画出来 —— 用户点一下，屏上就换动作。
 */

import { GlassPanel, IconAvatar } from '../skin';
import { PANEL_STATES, STATE_LABEL } from './types';
import type { AvatarMotionApi } from './useAvatarMotion';
import skin from '../skin/Skin.module.css';
import styles from './MotionControls.module.css';

export function MotionControls({ motion, className }: { motion: AvatarMotionApi; className?: string }) {
  return (
    <GlassPanel className={[styles.panel, className].filter(Boolean).join(' ')}>
      <div className={styles.head}>
        <IconAvatar className={styles.headIcon} />
        <h2 className={styles.headTitle}>动作</h2>
        <span className={styles.headState}>{STATE_LABEL[motion.state]}</span>
      </div>
      <div className={styles.body}>
        <div className={styles.buttons}>
          {PANEL_STATES.map((s) => (
            <button
              key={s}
              type="button"
              className={skin.button}
              aria-pressed={motion.state === s}
              data-motion-set={s}
              onClick={() => motion.setState(s)}
            >
              {STATE_LABEL[s]}
            </button>
          ))}
        </div>
        <p className={styles.note}>7 个动作差分已全部接入（美术线 7/7）</p>
      </div>
    </GlassPanel>
  );
}
