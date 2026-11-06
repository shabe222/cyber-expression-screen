/**
 * 化身素材的解析（屏层只负责"把美术线的图接上来"，不做动作状态机）。
 *
 * 动作状态机在 src/features/motion/（动线负责）。这里只做两件事：
 * 1. 把素材文件按动作状态归位：**优先用美术线 manifest.json 声明的映射**，
 *    没有声明时才按文件名线索猜
 * 2. 给动线一个稳定的接口：useAvatarAssets() / resolveAvatarUrl(mood)
 *
 * 为什么用虚拟模块拿清单，而不是在浏览器里挨个试文件名：
 * 试错会在控制台留下一串 404，验收要求"零 console error"。
 */

import { files as manifestFiles, states as manifestStates } from 'virtual:avatar-manifest';

/**
 * 动作状态：与美术线已交付的 7 张立绘一一对应。
 * MVP 三态（待机 / 笑 / 卖萌）= idle / smile / pout；
 * shy、think 是加分项，run、wave 是宪章 B1 的动作扩展。
 */
export type AvatarMood = 'idle' | 'smile' | 'pout' | 'shy' | 'think' | 'run' | 'wave';

/** 本模块的动作名 → 美术线 manifest.json 里的状态名（卖萌在美术线叫 charm） */
const MANIFEST_KEY: Record<AvatarMood, string> = {
  idle: 'idle',
  smile: 'smile',
  pout: 'charm',
  shy: 'shy',
  think: 'think',
  run: 'run',
  wave: 'wave',
};

const ALL_MOODS: AvatarMood[] = ['idle', 'smile', 'pout', 'shy', 'think', 'run', 'wave'];

export type AvatarAssets = {
  /** 每种状态对应的图片 URL；没有对应素材时为 null */
  urls: Record<AvatarMood, string | null>;
  /** 美术线在 manifest.json 里给的中文名（没有就用状态名兜底） */
  labels: Record<AvatarMood, string>;
  /** 美术线是否已经交了图（清单非空） */
  ready: boolean;
  /** avatars 目录里的全部文件名，便于调试/展示 */
  files: string[];
  /** 素材来源：manifest = 美术线声明的映射，guess = 按文件名猜的 */
  source: 'manifest' | 'guess' | 'none';
};

/**
 * 文件名 → 动作状态的匹配线索（manifest.json 没覆盖到时的兜底）。
 * 先按线索包含匹配，匹配不到就退回待机图 —— 有图总比空框强，形象一致 > 花哨。
 * 顺序有意义：卖萌(pout)优先认 charm，避免被 shy 抢走。
 */
const MOOD_HINTS: Record<AvatarMood, string[]> = {
  idle: ['idle', 'standby', 'normal', 'default', '待机', '默认', '平静'],
  smile: ['smile', 'happy', 'joy', 'laugh', '笑', '开心', '高兴'],
  pout: ['pout', 'charm', 'cute', '卖萌', '傲娇'],
  shy: ['shy', '害羞', '脸红'],
  think: ['think', 'thinking', '思考', '沉思'],
  run: ['run', 'running', '跑', '奔跑'],
  wave: ['wave', 'waving', '挥手', '打招呼'],
};

function pick(files: string[], mood: AvatarMood): string | null {
  for (const hint of MOOD_HINTS[mood]) {
    const hit = files.find((name) => name.toLowerCase().includes(hint.toLowerCase()));
    if (hit) return hit;
  }
  return null;
}

/** 美术线声明的映射优先（且只在文件确实存在时才认） */
function fromManifest(mood: AvatarMood, files: string[]): string | null {
  const entry = manifestStates[MANIFEST_KEY[mood]];
  if (entry?.file && files.includes(entry.file)) return entry.file;
  return null;
}

/** 把文件名清单解析成每种状态的 URL */
export function resolveAvatarAssets(files: string[] = manifestFiles): AvatarAssets {
  const idle = fromManifest('idle', files) ?? pick(files, 'idle') ?? files[0] ?? null;
  const byManifest = ALL_MOODS.some((m) => fromManifest(m, files) !== null);

  // 没有专门素材的状态退回待机图：状态切换至少"有人"，不会突然空框
  const nameFor = (mood: AvatarMood) => fromManifest(mood, files) ?? pick(files, mood) ?? idle;
  const toUrl = (name: string | null) => (name ? `/avatars/${encodeURIComponent(name)}` : null);

  const urls = {} as Record<AvatarMood, string | null>;
  const labels = {} as Record<AvatarMood, string>;
  for (const mood of ALL_MOODS) {
    urls[mood] = toUrl(mood === 'idle' ? idle : nameFor(mood));
    labels[mood] = manifestStates[MANIFEST_KEY[mood]]?.label ?? mood;
  }

  return {
    urls,
    labels,
    ready: files.length > 0,
    files,
    source: files.length === 0 ? 'none' : byManifest ? 'manifest' : 'guess',
  };
}

/** 屏上的化身素材（同步可得，因为清单在构建期就注入了） */
export function useAvatarAssets(): AvatarAssets {
  return resolveAvatarAssets(manifestFiles);
}

/** 单个状态的 URL，方便动线按状态取值 */
export function resolveAvatarUrl(mood: AvatarMood): string | null {
  return resolveAvatarAssets(manifestFiles).urls[mood];
}
