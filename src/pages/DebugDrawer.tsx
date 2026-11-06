/**
 * 「调试」抽屉：所有手动控件都收在这里。
 *
 * 默认界面是干净的（只有板 + 化身 + 状态），这些按钮是给用户/开发调试用的，
 * 用户要看某个演示、或者想自己画两笔时，点右下角「调试」展开。
 */

import { useState } from 'react';
import { HumanTools } from '../features/human';
import { MotionControls } from '../features/motion';
import type { AvatarMotionApi } from '../features/motion';
import type { RigPlayerApi } from '../features/rig';
import { GOLDFISH_ACTIONS } from '../rig-data/goldfish';
import { GlassPanel, IconClear, IconPen, IconReplay, IconSwim } from '../features/skin';
import skin from '../features/skin/Skin.module.css';
import { MODES, type ModeId } from './modes';
import styles from './DebugDrawer.module.css';

type Props = {
  onClose: () => void;
  mode: ModeId;
  onRunMode: (mode: ModeId) => void;
  motion: AvatarMotionApi;
  /** 骨骼动画播放器：抽屉里可以直接试播 Lead 的绑定 */
  player: RigPlayerApi;
  drawing: boolean;
  onToggleDrawing: () => void;
  mineCount: number;
  onClearMine: () => void;
  onMood: (text: string) => void;
  replyLabel: string | null;
};

export function DebugDrawer({
  onClose,
  mode,
  onRunMode,
  motion,
  player,
  drawing,
  onToggleDrawing,
  mineCount,
  onClearMine,
  onMood,
  replyLabel,
}: Props) {
  const [replayKey, setReplayKey] = useState(0);

  return (
    <div className={styles.layer}>
      <GlassPanel tone="strong" className={styles.sheet}>
        <div className={styles.head}>
          <IconPen className={styles.headIcon} />
          <h2 className={styles.headTitle}>调试</h2>
          <span className={styles.headNote}>日常不用开：屏上的东西由对话驱动</span>
          <button type="button" className={skin.button} onClick={onClose}>
            收起
          </button>
        </div>

        <div className={styles.body}>
          <section className={styles.group}>
            <h3 className={styles.groupTitle}>脚本</h3>
            <div className={styles.buttons}>
              {MODES.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={skin.button}
                    aria-pressed={mode === m.id}
                    onClick={() => onRunMode(m.id)}
                  >
                    <Icon className={skin.icon} />
                    {m.label}
                  </button>
                );
              })}
              <button
                type="button"
                className={skin.button}
                onClick={() => {
                  setReplayKey((k) => k + 1);
                  onRunMode(mode);
                }}
              >
                <IconReplay className={skin.icon} />
                重播
              </button>
              <button type="button" className={skin.button} onClick={() => onRunMode('clear')}>
                <IconClear className={skin.icon} />
                清板
              </button>
            </div>
            <p className={styles.groupNote}>重播计数 {replayKey}</p>
          </section>

          <section className={styles.group}>
            <h3 className={styles.groupTitle}>骨骼动画（Lead 的绑定，可直接试播）</h3>
            <div className={styles.buttons}>
              {Object.entries(GOLDFISH_ACTIONS).map(([key, rig]) => (
                <button
                  key={key}
                  type="button"
                  className={skin.button}
                  data-rig-play={key}
                  aria-pressed={player.rig?.id === rig.id}
                  onClick={() => player.play(rig)}
                >
                  <IconSwim className={skin.icon} />
                  {key}
                </button>
              ))}
              <button type="button" className={skin.button} onClick={() => player.stop()}>
                停
              </button>
            </div>
            <p className={styles.groupNote}>
              {player.playing
                ? `播放中 · ${player.rig?.id} · ${player.fps}fps · 相位 ${(player.phase * 100).toFixed(0)}%`
                : '未播放'}
            </p>
          </section>

          <section className={styles.group}>
            <h3 className={styles.groupTitle}>动作</h3>
            <MotionControls motion={motion} className={styles.inlinePanel} />
          </section>

          <section className={styles.group}>
            <h3 className={styles.groupTitle}>我的笔</h3>
            <div className={styles.humanWrap}>
              <HumanTools
                drawing={drawing}
                onToggleDrawing={onToggleDrawing}
                mineCount={mineCount}
                onClearMine={onClearMine}
                onMood={onMood}
                replyLabel={replyLabel}
              />
            </div>
          </section>
        </div>
      </GlassPanel>
    </div>
  );
}
