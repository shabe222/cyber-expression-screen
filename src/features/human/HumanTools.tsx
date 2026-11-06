/**
 * 「我来画」工具栏：手绘开关 + 清掉我的笔迹 + 心情输入。
 *
 * 输入框的状态留在这里（不往 Screen 提），否则用户每敲一个字整块黑板都要重渲染。
 */

import { useState } from 'react';
import { IconClear, IconPen, IconWhaleTail } from '../skin';
import skin from '../skin/Skin.module.css';
import styles from './HumanTools.module.css';

type Props = {
  /** 手绘模式开着没 */
  drawing: boolean;
  onToggleDrawing: () => void;
  /** 板上已有几笔我的东西（0 时"清掉我的笔迹"不可点） */
  mineCount: number;
  onClearMine: () => void;
  /** 提交一个心情词 */
  onMood: (text: string) => void;
  /** agent 回画了什么（如「我回画 · 开心」） */
  replyLabel?: string | null;
  className?: string;
};

export function HumanTools({
  drawing,
  onToggleDrawing,
  mineCount,
  onClearMine,
  onMood,
  replyLabel,
  className,
}: Props) {
  const [text, setText] = useState('');

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onMood(t);
    setText('');
  };

  return (
    <div className={[styles.bar, className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={skin.button}
        aria-pressed={drawing}
        data-human-draw-toggle={drawing ? '1' : '0'}
        onClick={onToggleDrawing}
      >
        <IconPen className={skin.icon} />
        我来画
      </button>

      <button
        type="button"
        className={skin.button}
        disabled={mineCount === 0}
        onClick={onClearMine}
      >
        <IconClear className={skin.icon} />
        清掉我的笔迹
        {mineCount > 0 ? <span className={styles.count}>{mineCount}</span> : null}
      </button>

      <span className={styles.sep} aria-hidden="true" />

      <label className={styles.moodLabel} htmlFor="mood-input">
        <IconWhaleTail className={styles.moodIcon} />
        说一句心情
      </label>
      <input
        id="mood-input"
        className={styles.input}
        value={text}
        placeholder="开心 / 有点累 / 平静…"
        maxLength={24}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
      <button type="button" className={skin.button} onClick={submit} disabled={!text.trim()}>
        写上板
      </button>

      <span className={styles.hint}>
        {drawing ? '在板上按住拖动就能画（再点一次「我来画」退出）' : replyLabel ? `我回画 · ${replyLabel}` : '我画一笔，她回一幅'}
      </span>
    </div>
  );
}
