/**
 * 科幻 HUD 角框：四角折线 + 边中刻度。
 *
 * 用 vector-effect="non-scaling-stroke" 让线宽不随面板拉伸变形 ——
 * 否则一块宽面板的竖边会比横边粗，一眼就假。
 */

import styles from './Skin.module.css';

export function HudFrame({ className }: { className?: string }) {
  const stroke = {
    stroke: 'currentColor',
    strokeWidth: 1,
    fill: 'none',
    vectorEffect: 'non-scaling-stroke' as const,
  };
  return (
    <svg
      className={[styles.hud, className].filter(Boolean).join(' ')}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* 四角 */}
      <path d="M0 7 L0 0 L7 0" {...stroke} />
      <path d="M93 0 L100 0 L100 7" {...stroke} />
      <path d="M100 93 L100 100 L93 100" {...stroke} />
      <path d="M7 100 L0 100 L0 93" {...stroke} />
      {/* 边中刻度 */}
      <path d="M50 0 L50 2.2" {...stroke} opacity={0.6} />
      <path d="M50 100 L50 97.8" {...stroke} opacity={0.6} />
      <path d="M0 50 L2.2 50" {...stroke} opacity={0.6} />
      <path d="M100 50 L97.8 50" {...stroke} opacity={0.6} />
    </svg>
  );
}
