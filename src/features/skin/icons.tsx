/**
 * 内联 SVG 图标集。
 *
 * 审美纪律：不用 emoji，图标一律内联 SVG（宪章第五节）。
 * 全部走 currentColor，颜色由使用处的 CSS 决定。
 */

type IconProps = {
  className?: string;
};

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

/** 鲸鱼尾鳍：本项目的主标识（角色一致性 > 花哨） */
export function IconWhaleTail({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 20c0-4.2 0-7.4 0-9.6" />
      <path d="M12 10.4C9.2 8 6.4 6.2 3 5c.6 4 2.2 6.6 4.8 8" />
      <path d="M12 10.4c2.8-2.4 5.6-4.2 9-5.4-.6 4-2.2 6.6-4.8 8" />
    </svg>
  );
}

/** 粉笔：能画 */
export function IconPen({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M15.6 4.4l4 4L8.8 19.2l-4.6 1 1-4.6z" />
      <path d="M13.4 6.6l4 4" />
    </svg>
  );
}

/** 擦除 */
export function IconErase({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M8.6 20h10.8" />
      <path d="M4.9 16.1l6.4-6.4a2 2 0 012.8 0l3.3 3.3a2 2 0 010 2.8L14 19.5H8.2l-3.3-3.4z" />
      <path d="M11.3 9.7l6.1 6.1" />
    </svg>
  );
}

/** 指一下 */
export function IconTarget({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="7.4" opacity="0.55" />
      <path d="M12 1.8v3.4M12 18.8v3.4M1.8 12h3.4M18.8 12h3.4" />
    </svg>
  );
}

/** 重播 */
export function IconReplay({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.6 12a8.4 8.4 0 108.4-8.4 8.4 8.4 0 00-6.2 2.7" />
      <path d="M3.4 3.6v4.4h4.4" />
    </svg>
  );
}

/** 清板 */
export function IconClear({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2" />
      <path d="M7.2 9.4h9.6M7.2 13h6" opacity="0.6" />
    </svg>
  );
}

/** 化身/形象：屏幕右侧的鲸鱼少女位 */
export function IconAvatar({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="9" r="3.4" />
      <path d="M5.4 20.2c.7-3.7 3.3-5.8 6.6-5.8s5.9 2.1 6.6 5.8" />
    </svg>
  );
}

/** 信号条：底部状态区 */
export function IconSignal({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 15.4v3.2M9.3 11.6v7M14.7 8v10.6M20 4.6v14" />
    </svg>
  );
}

/** 游动：一道水波 + 尾鳍（B3 流动动画的模式图标） */
export function IconSwim({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 16.4c2.2-2.4 4.4-2.4 6.6 0s4.4 2.4 6.6 0 4.4-2.4 5.8-.6" />
      <path d="M12 12.6c0-2.6 0-4.6 0-6" />
      <path d="M12 6.6C9.8 4.8 7.6 3.6 5 2.8c.5 3 1.7 5 3.6 6" />
      <path d="M12 6.6c2.2-1.8 4.4-3 7-3.8-.5 3-1.7 5-3.6 6" />
    </svg>
  );
}
