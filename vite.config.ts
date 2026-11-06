import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * 全能赛博表述屏幕 · 屏层构建配置。
 *
 * 三条刻意的选择：
 * - 不引入任何额外插件/依赖，只保留 React（宪章：不引入重依赖、要能独立跑）
 * - publicDir 就是 ./public：立绘放 public/avatars/，页面里以 /avatars/<文件名> 访问
 * - 一个小插件把「avatars 目录里有哪些图 + manifest 声明的状态映射」做成虚拟模块交给前端：
 *   这样化身容器只引用真实存在的文件，不会因为盲目试文件名而在控制台刷 404；
 *   manifest.json 里写的 state → 文件 映射优先于按文件名猜。
 */

const AVATAR_DIR = fileURLToPath(new URL('./public/avatars', import.meta.url));
const AVATAR_MANIFEST = fileURLToPath(new URL('./public/avatars/manifest.json', import.meta.url));
const AVATAR_EXT = /\.(png|webp|jpe?g|svg|avif)$/i;
/** Live 通道的传输口：agent 往这里写 payload，屏端轮询它 */
const LIVE_BOARD = fileURLToPath(new URL('./public/live/board.json', import.meta.url));

type StateEntry = { file: string; label?: string };

/**
 * Live 通道的兜底中间件。
 *
 * board.json 是**运行时状态**（不该进 git，否则 agent 每推一次仓库就脏一次），
 * 但文件不存在时 Vite 会回 404，浏览器控制台就会多一条 error ——
 * 验收要求"零 console error"，所以这里永远回 200：有文件就回文件，没有就回 seq:0。
 */
function liveChannel(): Plugin {
  return {
    name: 'cyber-screen:live-channel',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/live/board.json')) return next();
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        try {
          res.end(readFileSync(LIVE_BOARD, 'utf8'));
        } catch {
          res.end('{"seq":0}');
        }
      });
    },
  };
}

function avatarManifest(): Plugin {
  const virtualId = 'virtual:avatar-manifest';
  const resolvedId = '\0' + virtualId;
  return {
    name: 'cyber-screen:avatar-manifest',
    resolveId(id) {
      if (id === virtualId) return resolvedId;
      return null;
    },
    load(id) {
      if (id !== resolvedId) return null;

      let files: string[] = [];
      try {
        files = readdirSync(AVATAR_DIR).filter((name) => AVATAR_EXT.test(name));
      } catch {
        files = [];
      }
      files.sort();

      // 美术线的 manifest.json：只认「文件确实存在」的条目，避免声明与实物不一致
      const states: Record<string, StateEntry> = {};
      try {
        const parsed = JSON.parse(readFileSync(AVATAR_MANIFEST, 'utf8')) as {
          states?: Record<string, { file?: string; label?: string }>;
        };
        for (const [key, value] of Object.entries(parsed.states ?? {})) {
          if (value?.file && files.includes(value.file)) {
            states[key] = { file: value.file, label: value.label ?? key };
          }
        }
      } catch {
        /* 没有 manifest.json 也不影响：前端还有按文件名猜的兜底 */
      }

      return [
        `export const files = ${JSON.stringify(files)};`,
        `export const states = ${JSON.stringify(states)};`,
        'export default files;',
      ].join('\n');
    },
  };
}

export default defineConfig({
  plugins: [react(), avatarManifest(), liveChannel()],
  publicDir: 'public',
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
  },
});
