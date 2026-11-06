/**
 * 鲸鱼少女的「表述」演示脚本（屏层自写，不依赖后端）。
 *
 * 和 demoScript.ts 的区别：这份脚本带 `steps` —— 一节 = 一句话 + 那几笔，
 * 板子会"说一句、画一节"地演出来，字幕由 NarrationCaption 接住。
 * 颜色也换成屏层的三色体系（主色鲸蓝青 / 强调鲸尾粉 / 中性冷白），
 * 让板上的笔迹和玻璃科幻皮肤是同一套语言。
 *
 * 真实使用时脚本由后端下发，结构完全一样（见 types.ts 的 ops 契约）。
 */

import type { BlackboardScript } from './types';

const INK = {
  neutral: '#e6eef5',
  primary: '#43d9e6',
  accent: '#ff7aa8',
} as const;

/** 一头鲸：身体 + 尾鳍 + 眼睛 + 上浮的气泡 */
export function buildWhaleMoodScript(): BlackboardScript {
  return {
    size: { w: 1600, h: 1000 },
    steps: [
      {
        narration: '先写下今天的题目。',
        ops: [
          {
            kind: 'add',
            element: {
              id: 'whale-title',
              type: 'text',
              source: 'ai',
              render: { x: 90, y: 70, text: '今天的心情', size: 48 },
              bbox: { x: 90, y: 70, w: 240, h: 64 },
              color: INK.primary,
              seed: 401,
              label: '标题',
            },
          },
          {
            kind: 'add',
            element: {
              id: 'whale-title-line',
              type: 'annotate',
              source: 'ai',
              render: { style: 'underline', points: [[88, 154], [352, 154]], size: 48 },
              bbox: { x: 88, y: 146, w: 264, h: 20 },
              color: INK.accent,
              width: 3.4,
              seed: 402,
              label: '标题下划线',
            },
          },
        ],
      },
      {
        narration: '她住在一片很深很蓝的地方。',
        ops: [
          {
            kind: 'add',
            element: {
              id: 'whale-body',
              type: 'polyline',
              source: 'ai',
              render: {
                points: [
                  [300, 560], [360, 470], [480, 430], [620, 440], [740, 500],
                  [780, 560], [740, 620], [620, 660], [480, 660], [360, 630], [300, 560],
                ],
              },
              bbox: { x: 300, y: 430, w: 480, h: 230 },
              color: INK.neutral,
              width: 3.6,
              seed: 403,
              label: '鲸身',
            },
          },
          {
            kind: 'add',
            element: {
              id: 'whale-tail-up',
              type: 'polyline',
              source: 'ai',
              render: { points: [[780, 560], [868, 500], [934, 442]] },
              bbox: { x: 780, y: 442, w: 154, h: 118 },
              color: INK.neutral,
              width: 3.6,
              seed: 404,
              label: '尾鳍上',
            },
          },
          {
            kind: 'add',
            element: {
              id: 'whale-tail-down',
              type: 'polyline',
              source: 'ai',
              render: { points: [[780, 560], [868, 620], [934, 678]] },
              bbox: { x: 780, y: 560, w: 154, h: 118 },
              color: INK.neutral,
              width: 3.6,
              seed: 405,
              label: '尾鳍下',
            },
          },
          {
            kind: 'add',
            element: {
              id: 'whale-eye',
              type: 'circle',
              source: 'ai',
              render: { cx: 388, cy: 540, r: 11 },
              bbox: { x: 377, y: 529, w: 22, h: 22 },
              color: INK.primary,
              width: 3.2,
              seed: 406,
              label: '眼睛',
            },
          },
        ],
      },
      {
        narration: '旁边有几颗气泡浮上去。',
        ops: [
          {
            kind: 'add',
            element: {
              id: 'whale-bubble-1',
              type: 'circle',
              source: 'ai',
              render: { cx: 430, cy: 372, r: 16 },
              bbox: { x: 414, y: 356, w: 32, h: 32 },
              color: INK.primary,
              width: 3,
              seed: 407,
              label: '气泡1',
            },
          },
          {
            kind: 'add',
            element: {
              id: 'whale-bubble-2',
              type: 'circle',
              source: 'ai',
              render: { cx: 486, cy: 318, r: 10 },
              bbox: { x: 476, y: 308, w: 20, h: 20 },
              color: INK.primary,
              width: 3,
              seed: 408,
              label: '气泡2',
            },
          },
          {
            kind: 'add',
            element: {
              id: 'whale-bubble-3',
              type: 'circle',
              source: 'ai',
              render: { cx: 524, cy: 272, r: 6 },
              bbox: { x: 518, y: 266, w: 12, h: 12 },
              color: INK.primary,
              width: 3,
              seed: 409,
              label: '气泡3',
            },
          },
          {
            kind: 'add',
            element: {
              id: 'whale-up',
              type: 'arrow',
              source: 'ai',
              render: { points: [[566, 252], [566, 168]] },
              bbox: { x: 566, y: 168, w: 2, h: 84 },
              color: INK.accent,
              width: 3,
              seed: 410,
              label: '向上',
            },
          },
        ],
      },
      {
        narration: '写下来，就是今天的表述。',
        ops: [
          {
            kind: 'add',
            element: {
              id: 'whale-mood',
              type: 'text',
              source: 'ai',
              render: { x: 960, y: 420, text: '心情：晴\n想被夸一句', size: 34 },
              bbox: { x: 960, y: 420, w: 240, h: 92 },
              color: INK.primary,
              seed: 411,
              label: '心情',
            },
          },
          {
            kind: 'add',
            element: {
              id: 'whale-say',
              type: 'text',
              source: 'ai',
              render: { x: 960, y: 580, text: '想和你一起看海。', size: 38 },
              bbox: { x: 960, y: 580, w: 342, h: 52 },
              color: INK.accent,
              seed: 412,
              label: '一句话',
            },
          },
          { kind: 'pointer', bbox: { x: 290, y: 420, w: 660, h: 250 }, ms: 2600 },
        ],
      },
    ],
    ops: [],
  };
}
