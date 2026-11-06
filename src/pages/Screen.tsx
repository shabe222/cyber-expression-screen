/**
 * 主屏：全能赛博表述屏幕。
 *
 * 用户 2026-10-17 定的最终形态：
 *   「这块黑板没有那么多按钮，**全是你自己来操控**。我与你聊天，然后你来控制这个黑板，
 *     想表达你想表达的……让它动起来，像放动画，像放电视一样。」
 *
 * 所以默认界面只有三样：**表述板 + 化身 + 一行状态**。
 * 所有手动控件（脚本模式、动作、我的笔）都收进右下角「调试」抽屉里，默认不展开。
 *
 * 屏上的内容从哪来：
 * - **Live 通道**（主路）：轮询 /live/board.json，agent 推 payload → 清板 / 逐笔脚本 / 骨骼动画
 * - 调试抽屉（辅路）：用户自己想看演示、或者想亲手画两笔时用
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Blackboard,
  NarrationCaption,
  type BlackboardElement,
  type BlackboardOp,
  type BlackboardScript,
  type BoardNarration,
  type Pt,
} from '../features/blackboard';
import { MOODS, moodFor } from '../artwork/moods';
import { AvatarSlot, useAvatarAssets } from '../features/avatar';
import { moodTextElement, strokeElement } from '../features/human';
import { useLiveBoard } from '../features/live';
import { ASSET_MOOD, AvatarMotion, STATE_LABEL, useAvatarMotion } from '../features/motion';
import { useRigPlayer } from '../features/rig';
import { GlassPanel, IconPen, IconWhaleTail, Scanline } from '../features/skin';
/** 填充缝合的默认宽度 / 上限：与黑板那边同一份（seam.ts） */
import { DEFAULT_FILL_SEAM, FILL_SEAM_MAX } from '../features/blackboard';
/** 前表面反射的默认强度：与黑板那边同一份（onglass.ts） */
import { DEFAULT_CONTENT_ON_GLASS } from '../features/blackboard';
/** 湿边的默认宽度 / 上限：与黑板那边同一份（wetedges.ts） */
import { DEFAULT_WET_EDGE, WET_EDGE_MAX } from '../features/blackboard';
import skin from '../features/skin/Skin.module.css';
import { DebugDrawer } from './DebugDrawer';
import { MODES, MOOD_LABEL, type ModeId } from './modes';
import styles from './Screen.module.css';

/** HUD 上的本地时间：一秒一跳 */
function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now.toLocaleTimeString('zh-CN', { hour12: false });
}

const EMPTY_BOARD: BlackboardScript = { ops: [{ kind: 'clear' }] };

export function Screen() {
  const clock = useClock();
  const avatarAssets = useAvatarAssets();
  /** 动作状态机（动线）：状态 + 眨眼节奏 */
  const motion = useAvatarMotion('idle');
  /**
   * 骨骼动画播放器。
   *
   * 实测（headless 软件渲染）：限 30fps → 实际 21fps；限 60fps → 实际 29fps；
   * **完全不限 → 掉到 2fps**（每帧都触发 React 渲染 + layout effect，把自己饿死了）。
   * 所以留一个上限：60ms 的间隔让 rAF 每隔一帧落一次，稳定在 29fps 左右。
   */
  const player = useRigPlayer(60);
  /** Live 通道：agent 推什么，屏上就是什么 */
  const live = useLiveBoard({ intervalMs: 600 });

  /* ---------------- 板面 ---------------- */
  /** 当前板面脚本 + 重挂序号（换 key = 从头再演一遍）+ 这一份是不是循环播 */
  const [board, setBoard] = useState<{ script: BlackboardScript; runId: number; looping: boolean }>({
    script: EMPTY_BOARD,
    runId: 0,
    looping: false,
  });
  /** 板面在播（黑板自己报，含循环） */
  const [boardPlaying, setBoardPlaying] = useState(false);
  /** 立刻停：Live payload 的 stop 用（停循环但不清板） */
  const [halt, setHalt] = useState(false);
  const [narration, setNarration] = useState<BoardNarration>({ saying: null, leaving: null });
  /** agent 口播（Live 通道给的那一句） */
  const [say, setSay] = useState<string | null>('通道就绪：等 agent 推内容过来。');
  /** 调试抽屉当前高亮的模式（只影响按钮状态与板头文字） */
  const [mode, setMode] = useState<ModeId>('clear');

  const pushBoard = useCallback((script: BlackboardScript, nextMode: ModeId) => {
    setBoard((b) => ({ script, runId: b.runId + 1, looping: !!script.loop }));
    setMode(nextMode);
  }, []);

  /* ---------------- 人类作画（B2「你画」，收在调试抽屉里） ---------------- */
  const [drawing, setDrawing] = useState(false);
  const [myOps, setMyOps] = useState<BlackboardOp[]>([]);
  const [myElements, setMyElements] = useState<BlackboardElement[]>([]);
  const moodCount = useRef(0);
  const [reply, setReply] = useState<{ label: string; script: BlackboardScript } | null>(null);

  const pushOps = useCallback((...ops: BlackboardOp[]) => {
    setMyOps((log) => [...log, ...ops]);
  }, []);

  const handleStroke = useCallback(
    (points: Pt[]) => {
      const el = strokeElement(points);
      setMyElements((list) => [...list, el]);
      pushOps({ kind: 'add', element: el });
    },
    [pushOps],
  );

  const clearMine = useCallback(() => {
    setMyElements((list) => {
      if (list.length) pushOps(...list.map((e) => ({ kind: 'remove' as const, id: e.id })));
      return [];
    });
    moodCount.current = 0;
  }, [pushOps]);

  const handleMood = useCallback(
    (text: string) => {
      const el = moodTextElement(text, moodCount.current);
      moodCount.current += 1;
      setMyElements((list) => [...list, el]);
      // 人的笔迹走 appendOps 立刻补回（写进脚本 ops 会被排在几十笔涂鸦后面等好几秒）
      pushOps({ kind: 'add', element: el }, ...myElements.map((e) => ({ kind: 'add' as const, element: e })));

      const id = moodFor(text);
      const base = MOODS[id];
      if (!base) return;
      setReply({
        label: MOOD_LABEL[id] ?? id,
        script: {
          size: base.size,
          // 剥掉 elements：留着它，黑板会在"板子是空的"那条路上一次铺好，看不到一笔一笔画
          ops: [{ kind: 'clear' }, ...(base.ops ?? [])],
        },
      });
    },
    [myElements, pushOps],
  );

  /* ---------------- 应用 Live payload ---------------- */
  const appliedSeq = useRef(0);
  useEffect(() => {
    const p = live.payload;
    if (!p || live.seq === appliedSeq.current) return;
    appliedSeq.current = live.seq;

    if (typeof p.say === 'string') setSay(p.say);
    if (p.stop) {
      player.stop();
      setHalt(true); // 停循环但不清板：板面停在当前那一帧
    }
    if (p.clear) {
      player.stop();
      setHalt(false);
      pushBoard(EMPTY_BOARD, 'clear');
    }
    if (p.script) {
      setHalt(false);
      /**
       * payload 顶层的 loop / style 并进 script（script 自己写了就听 script 的）。
       * 为什么 style 要在这里并：板面材料（玻璃/景色/笔）是**板子**的属性，
       * 而信封级的 `style` 是用户调板面视觉的入口（见 features/blackboard/glass.ts）。
       * script.style 里更具体的写法优先 —— 信封给默认、script 给这一板的具体要求。
       */
      const merged = {
        ...p.script,
        ...(p.loop !== undefined && p.script.loop === undefined ? { loop: p.loop } : {}),
        ...(p.style ? { style: { ...p.style, ...(p.script.style ?? {}) } } : {}),
      };
      pushBoard(merged, 'clear');
    }
    if (p.rig) {
      setReply(null);
      setHalt(false);
      player.play(p.rig);
    }
    // player / pushBoard 都是稳定引用，只按 seq 触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.payload, live.seq]);

  /* ---------------- 板头 / 状态 ---------------- */
  /**
   * `?fillSeam=4`：临时把"填充缝合"（消掉相邻填充之间的抗锯齿缝）打开，**不改 payload**。
   *
   * 与 `?plane=all` / `?filterMode=element` 同一类调试入口 —— 用来在**真屏上**核对
   * 缝合的效果，不用先去改 live payload。payload 自己的 `style.fillSeam` 优先（这里只在
   * 它没写的时候兜底），所以它不会覆盖生产 payload 的意图。
   */
  const seamOverride = (() => {
    if (typeof window === 'undefined') return 0;
    const raw = new URLSearchParams(window.location.search).get('fillSeam');
    if (raw === null) return 0;
    const n = raw === '' || raw === 'true' ? DEFAULT_FILL_SEAM : Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.min(FILL_SEAM_MAX, n) : 0;
  })();
  /**
   * `?onglass=0.8`：临时把"玻璃前表面反射"（让内容像写在玻璃上）打开，**不改 payload**。
   * 与 `?fillSeam` / `?plane=all` 同一类调试口；payload 自己的 `style.contentOnGlass` 优先。
   */
  const onGlassOverride = (() => {
    if (typeof window === 'undefined') return 0;
    const raw = new URLSearchParams(window.location.search).get('onglass');
    if (raw === null) return 0;
    const n = raw === '' || raw === 'true' ? DEFAULT_CONTENT_ON_GLASS : Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.min(1, n) : 0;
  })();
  /**
   * `?wetedges=1`：临时把"湿边"（平色区域边缘那圈略深的色）打开，**不改 payload**。
   * 与 `?fillSeam` / `?onglass` / `?plane=all` 同一类调试口；payload 自己的 `style.wetEdge` 优先。
   */
  const wetEdgeOverride = (() => {
    if (typeof window === 'undefined') return 0;
    const raw = new URLSearchParams(window.location.search).get('wetedges');
    if (raw === null) return 0;
    const n = raw === '' || raw === 'true' ? DEFAULT_WET_EDGE : Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.min(WET_EDGE_MAX, n) : 0;
  })();
  const script = useMemo(() => {
    const base = reply ? reply.script : board.script;
    if (!seamOverride && !onGlassOverride && !wetEdgeOverride) return base;
    const style = { ...base.style };
    if (seamOverride && style.fillSeam === undefined) style.fillSeam = seamOverride;
    if (onGlassOverride && style.contentOnGlass === undefined) style.contentOnGlass = onGlassOverride;
    if (wetEdgeOverride && style.wetEdge === undefined) style.wetEdge = wetEdgeOverride;
    return { ...base, style };
  }, [reply, board.script, seamOverride, onGlassOverride, wetEdgeOverride]);
  /** 板面在播（含循环播放）—— 与骨骼播放统一成 playing 概念，用户一眼能看出它在放 */
  const playing = player.playing || boardPlaying;

  /**
   * 板头那句"这块板此刻在干嘛"。
   * 翻译成人话：`动画 · goldfish-swim · 29fps` 是给开发看的，用户看的是"在不在动、在动什么"。
   * 具体数值（骨架 id / 帧率）挪到 title，需要时鼠标一停就能看到。
   */
  const headMeta = player.playing
    ? '正在放动画'
    : boardPlaying
      ? board.looping
        ? '正在循环播放'
        : '正在一笔一笔画'
      : reply
        ? `我回画 · ${reply.label}`
        : mode === 'clear'
          ? '等 agent 推内容'
          : (MODES.find((m) => m.id === mode)?.label ?? '');
  const headMetaDetail = player.playing
    ? `骨架动画 ${player.rig?.id ?? ''} · ${player.fps} 帧/秒 · 相位 ${(player.phase * 100).toFixed(0)}%`
    : '';

  const liveLit = live.status === 'live';
  const activePace = reply ? 90 : MODES.find((m) => m.id === mode)?.paceMs;

  const runMode = useCallback(
    (next: ModeId) => {
      setReply(null);
      player.stop();
      if (next === 'clear') {
        pushBoard(EMPTY_BOARD, 'clear');
        return;
      }
      const found = MODES.find((m) => m.id === next);
      if (!found) return;
      pushBoard(found.script ?? found.build!(), next);
    },
    [player, pushBoard],
  );

  const [debugOpen, setDebugOpen] = useState(
    /**
     * 抽屉默认收起 —— 用户要的是一屏干净的「表述板 + 化身 + 一行状态」。
     * `?debug=1` 可以直接把它展开：既是给用户的深链（想自己画两笔时不用先找按钮），
     * 也让既有的交互验收夹具（verify-motion / verify-idle-anim / verify-human / verify-artwork）
     * 真正能点到抽屉里的按钮 —— 它们以前找不到按钮、只能空跑。
     */
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1',
  );
  /**
   * 滤镜档：默认 `layer`（同档合层，性能档）。
   * `?filterMode=element` 切回"每元素各挂一次"的老行为 —— 出静态成图或做质感对照时用。
   */
  const filterMode: 'layer' | 'element' =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('filterMode') === 'element'
      ? 'element'
      : 'layer';

  return (
    <div className={styles.screen}>
      <header className={styles.topBar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <IconWhaleTail className={styles.brandGlyph} />
          </span>
          <span className={styles.brandText}>
            <h1 className={styles.brandTitle}>全能赛博表述屏幕</h1>
            <p className={styles.brandSub}>Cyber Expression Screen</p>
          </span>
        </div>
        <div className={styles.chips}>
          <span
            className={[skin.chip, liveLit ? skin.chipPrimary : ''].filter(Boolean).join(' ')}
            data-live={live.status}
            data-live-seq={live.seq}
            data-live-playing={playing ? '1' : '0'}
            title={`通道状态：${live.status}　已应用序号：${live.seq}`}
          >
            <span className={[skin.dot, liveLit ? '' : styles.dotDim].filter(Boolean).join(' ')} />
            {liveLit ? '对话通道' : live.status === 'connecting' ? '通道连接中' : '通道离线'}
          </span>
          {/* 人话优先：用户关心的是"我推的东西到了没"，不是那个推送序号。
              序号（原始值）留在 title 与 data-live-seq 里，调试照样查得到。 */}
          <span className={skin.chip} title={`推送序号 #${live.seq}`}>
            {live.seq > 0 ? '已收到推送' : '还没收到推送'}
          </span>
          <span className={skin.chip}>{clock}</span>
        </div>
      </header>
      <main className={styles.stage}>
        <GlassPanel tone="strong" className={styles.boardPanel}>
          <div className={styles.boardHead}>
            <IconPen className={styles.boardHeadIcon} />
            <h2 className={styles.boardHeadTitle}>表述板</h2>
            <span className={styles.boardHeadMeta} title={headMetaDetail || undefined}>{headMeta}</span>
          </div>

          <div className={styles.narrationRow}>
            {say ? <p className={styles.say}>{say}</p> : null}
            <NarrationCaption saying={narration.saying} leaving={narration.leaving} />
          </div>

          <div className={styles.boardSurface}>
            <Blackboard
              key={board.runId}
              script={script}
              paceMs={activePace}
              className={styles.board}
              onNarrationChange={setNarration}
              drawMode={drawing}
              onStroke={handleStroke}
              appendOps={myOps}
              overlayElements={player.elements}
              overlayTransforms={player.transforms}
              onPlayingChange={setBoardPlaying}
              halt={halt}
              filterMode={filterMode}
            />
          </div>
        </GlassPanel>

        <aside className={styles.side}>
          <AvatarSlot mood={ASSET_MOOD[motion.state]} stateLabel={STATE_LABEL[motion.state]}>
            <AvatarMotion state={motion.state} blink={motion.blink} />
          </AvatarSlot>
        </aside>
      </main>

      <footer className={styles.statusBar}>
        {/* 技术状态先翻译成人话再显示（项目既有纪律）：
            "通道在线 / 静止 / 素材 7 张 / 相位 42%" 是给开发看的；
            用户看的是"通路通不通、屏上在不在动、东西到了没"。原始值留在 title 里。 */}
        <span
          className={styles.statusItem}
          title={`通道状态 ${live.status}${live.error ? `（${live.error}）` : ''}`}
        >
          {liveLit ? '和 agent 的通路：正常' : live.status === 'connecting' ? '通路连接中…' : '通路断开（屏会自己重试）'}
          {live.lastAt
            ? ` · 最近一次 ${new Date(live.lastAt).toLocaleTimeString('zh-CN', { hour12: false })}`
            : ''}
        </span>
        <span className={styles.statusSep} />
        <span
          className={styles.statusItem}
          data-playing={playing ? '1' : '0'}
          title={`骨架 ${player.playing ? `${player.fps}fps · 相位 ${(player.phase * 100).toFixed(0)}%` : '未播放'}`}
        >
          {player.playing ? '屏上在动 · 逐帧动画' : boardPlaying ? (board.looping ? '屏上在动 · 循环播放' : '屏上在动 · 正在落笔') : '屏上安静'}
        </span>
        <span className={styles.statusSep} />
        <span className={styles.statusItem}>化身素材 {avatarAssets.files.length} 张</span>
        <span className={styles.statusGap} />
        <button
          type="button"
          className={skin.button}
          onClick={() => setDebugOpen((v) => !v)}
          title="脚本演示 / 动作状态 / 我自己画两笔（也可以直接用 ?debug=1 打开）"
        >
          {debugOpen ? '收起调试' : '调试'}
        </button>
      </footer>

      {debugOpen && (
        <DebugDrawer
          onClose={() => setDebugOpen(false)}
          mode={mode}
          onRunMode={runMode}
          motion={motion}
          player={player}
          drawing={drawing}
          onToggleDrawing={() => setDrawing((v) => !v)}
          mineCount={myElements.length}
          onClearMine={clearMine}
          onMood={handleMood}
          replyLabel={reply?.label ?? null}
        />
      )}

      {/* 扫描线：宪章 A2 列出的 HUD 元素之一，组件一直在但之前没挂上。
          按"舒服"重新配过：周期 14s、峰值减半、带子 26vh ——
          它在壳上读得出来（"光在舱里移动"），扫到亮板上几乎看不见，不会变成"屏在闪"。
          prefers-reduced-motion 下自动停（见 Skin.module.css）。 */}
      <Scanline />
    </div>
  );
}
