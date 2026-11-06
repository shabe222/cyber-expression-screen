/**
 * 会动的化身立绘（动线）。
 *
 * 怎么动（全 CSS/SVG，零动画库）：
 * - 换状态：上一张淡出上移、下一张淡入上浮 —— 两张同时在 DOM 里，交接处不空一拍
 * - 呼吸：idle 时缩放 1.8% + 轻微上浮（4.2s 一个来回），其他状态更轻
 * - 眨眼：按不定间隔在眼睛高度压一道柔和的眼睑（纯 CSS 过渡）
 *
 * 动画分在两层元素上：外层跑"进场/退场"，内层跑"呼吸"。
 * 同一元素上写两个 animation 会互相覆盖（animation 是简写属性），分层是最省事的解法。
 */

import { useEffect, useRef, useState } from 'react';
import { useAvatarAssets } from '../avatar';
import { ASSET_MOOD, STATE_LABEL, TRANSITION_MS, type AvatarMotionState } from './types';
import styles from './AvatarMotion.module.css';

type Props = {
  state: AvatarMotionState;
  /** 直接指定图片（否则按 state 解析立绘差分） */
  src?: string | null;
  /** 是否眨眼（由 useAvatarMotion 给；不给就一直睁着） */
  blink?: boolean;
  /**
   * 眼睛在立绘里的位置：纵向 0-1 / 横向 0-1 / 双眼宽度占图宽比例。
   * 默认值是按美术线当前这版**全身立绘**实测的（眼高约 14%、中心约 47%、双眼宽约 17%，
   * 用 3 倍像素密度截头部量出来的）。立绘换构图/换裁剪时改这三个数即可 —— 别去改 CSS。
   */
  eyeLine?: number;
  eyeCenterX?: number;
  eyeWidth?: number;
  className?: string;
};

type Layer = { url: string; key: number };

export function AvatarMotion({
  state,
  src,
  blink = false,
  eyeLine = 0.14,
  eyeCenterX = 0.47,
  eyeWidth = 0.17,
  className,
}: Props) {
  const assets = useAvatarAssets();
  const url = src ?? assets.urls[ASSET_MOOD[state]];

  const [shown, setShown] = useState<Layer | null>(null);
  const [leaving, setLeaving] = useState<Layer | null>(null);
  /** 立绘真实宽高比：眨眼条按它定位，换素材尺寸也不会跑偏 */
  const [aspect, setAspect] = useState<number | null>(null);
  const shownRef = useRef<Layer | null>(null);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (!url) {
      shownRef.current = null;
      setShown(null);
      setLeaving(null);
      return;
    }
    const cur = shownRef.current;
    if (cur && cur.url === url) return;
    seq.current += 1;
    const incoming: Layer = { url, key: seq.current };
    shownRef.current = incoming;
    if (cur) {
      setLeaving(cur);
      const gone = cur.key;
      timers.current.push(
        window.setTimeout(() => setLeaving((l) => (l && l.key === gone ? null : l)), TRANSITION_MS + 40),
      );
    }
    setShown(incoming);
  }, [url]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    },
    [],
  );

  if (!shown) {
    return (
      <div className={[styles.box, className].filter(Boolean).join(' ')} data-motion-state={state}>
        <p className={styles.empty}>立绘未就位</p>
      </div>
    );
  }

  const breatheClass = state === 'idle' ? styles.breatheIdle : styles.breatheSoft;

  return (
    <div
      className={[styles.box, className].filter(Boolean).join(' ')}
      style={{
        ['--cs-eye-line' as string]: `${eyeLine * 100}%`,
        ['--cs-eye-x' as string]: `${eyeCenterX * 100}%`,
        ['--cs-eye-w' as string]: `${eyeWidth * 100}%`,
        /**
         * 立绘纵横比（**数值**，不是 `832 / 1216` 那种比例式）。
         * 必须是数值：CSS 里要用它做 `calc(100cqw / var(--cs-avatar-ar))` 来夹宽度，
         * 而 calc 不能除以一个比例式。取不到时用 CSS 里的兜底 0.6842（= 832/1216）。
         */
        ...(aspect ? { ['--cs-avatar-ar' as string]: String(aspect) } : {}),
      }}
      data-motion-state={state}
      data-blink={blink ? '1' : '0'}
    >
      <div className={styles.stack}>
        {leaving && (
          <div key={`out-${leaving.key}`} className={`${styles.layer} ${styles.exit}`} aria-hidden="true">
            <img className={styles.img} src={leaving.url} alt="" draggable={false} />
          </div>
        )}
        <div key={`in-${shown.key}`} className={`${styles.layer} ${styles.enter}`}>
          <div className={breatheClass}>
            <img
              className={styles.img}
              src={shown.url}
              alt={`鲸鱼少女 · ${STATE_LABEL[state]}`}
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) setAspect(img.naturalWidth / img.naturalHeight);
              }}
            />
          </div>
          <span className={`${styles.eyelid} ${blink ? styles.eyelidOn : ''}`} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
