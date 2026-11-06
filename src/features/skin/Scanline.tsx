/**
 * 扫描线：一条很淡的光带缓慢自上而下扫过整屏。
 * 纯 CSS 关键帧，不用动画库；prefers-reduced-motion 下自动停。
 */

import styles from './Skin.module.css';

export function Scanline() {
  return (
    <div className={styles.scanline} aria-hidden="true">
      <span className={styles.scanlineBeam} />
    </div>
  );
}
