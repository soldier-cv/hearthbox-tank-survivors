/**
 * 入口与状态机编排。
 *
 * 只做接线：平台循环 → 输入归一 → UI 状态机 → 世界更新 → 相机 → 特效 → 渲染。
 * 不含规则（game.ts）、不含绘制（render.ts / ui.ts）、不认识具体键位（input.ts）。
 */

import { defineGame, type GameContext, type GameInstance } from '@hearthbox/sdk';
import { CONFIG, COLORS, THREATS } from './config';
import { declareOptions, resolveTuning } from './tuning';
import { InputHub } from './input';
import { Fx } from './fx';
import { Audio } from './audio';
import { RngView, FxRng } from './rng';
import { World } from './world';
import { CameraRig } from './camera';
import { Game, type GameEvent, type RunSummary } from './game';
import { Renderer } from './render';
import { Ui, type Screen } from './ui';
import { MAP_BY_ID, SKINS, TANKS } from './data/exports';
import {
  SAVE_KEY,
  applyResult,
  levelOf,
  normalizeProgress,
  scrapFor,
  type Progress,
} from './save';

/** 金手指 id 清单（存档"用过金手指"标记用）。 */
const CHEAT_IDS = ['move-speed', 'fire-rate', 'xp-rate', 'spawn-rate', 'god-mode', 'inf-bombs'] as const;

export default defineGame({
  id: 'hearthbox.tank-survivors',

  async create(ctx: GameContext): Promise<GameInstance> {
    declareOptions(ctx);
    const tuning = resolveTuning(ctx);

    // ---- 存档 ----
    let progress: Progress = normalizeProgress(ctx.storage.get<unknown>(SAVE_KEY));
    const saveNow = (): void => {
      ctx.storage.set(SAVE_KEY, progress);
    };

    const rngView = new RngView(ctx.random);
    const fxRng = new FxRng(Math.floor(ctx.random.next() * 0xffffffff));
    const fx = new Fx(CONFIG.caps.particles + 200, fxRng);
    const audio = new Audio(ctx.audio);
    const input = new InputHub(ctx);

    let game: Game | null = null;
    let rig: CameraRig | null = null;
    let renderer: Renderer | null = null;
    let clock = 0;
    /** 上次看到的救起时刻，用来只在"刚救起"那一帧调用 afterRevive。 */
    let lastRevived = -1;

    const hooks = {
      onStart(twoPlayer: boolean): void {
        startRun(twoPlayer);
      },
      onResume(): void {
        ui.resume();
      },
      onRestart(): void {
        startRun(ui.twoPlayer);
      },
      onQuit(): void {
        game = null;
        rig = null;
        renderer = null;
        audio.musicStop();
        ui.openGarage();
      },
      onExitToShelf(): void {
        ctx.exit();
      },
      onChoose(cardId: string): void {
        if (!game) return;
        const res = game.choose(cardId);
        if (res === 'resume') ui.resume();
      },
      onReroll(): void {
        game?.reroll();
      },
      onSave: saveNow,
      sfx(id: string): void {
        audio.sfx(id as never);
      },
    };

    const ui = new Ui(hooks, input);
    ui.progress = progress;
    ui.openTitle();

    function startRun(twoPlayer: boolean): void {
      const map = MAP_BY_ID[progress.selected.map] ?? MAP_BY_ID.proving;
      const p1 = TANKS.find((t) => t.id === progress.selected.p1) ?? TANKS[0]!;
      const p2def = TANKS.find((t) => t.id === progress.selected.p2) ?? TANKS[1]!;
      const tanks = twoPlayer ? [p1, p2def] : [p1];
      const levels = tanks.map((t) => levelOf(progress, t.id));
      const threat = Math.min(4, Math.max(1, progress.selected.threat));

      const world = new World(map, rngView);
      rig = new CameraRig(world.w, world.h, twoPlayer);
      game = new Game(world, {
        tuning,
        fx,
        audio,
        rng: rngView,
        onEvent: handleEvent,
        cheat: (id) => ctx.cheats.value(id),
        enabled: (id) => ctx.options.enabled(id),
        setting: (id) => ctx.options.value(id) ?? false,
        rumble: (s, w, ms) => ctx.rumble(s, w, ms),
      });
      game.threat = threat;
      game.start(tanks, levels, threat);
      renderer = new Renderer(game, rig);
      lastRevived = -1;

      // 涂装：只换 body/light。
      for (const p of game.players) {
        const skinId = progress.tanks[p.tank.id]?.skin ?? 'factory';
        const sk = SKINS.find((s) => s.id === skinId);
        p.skin = sk && sk.body ? { body: sk.body, light: sk.light } : null;
      }

      ui.resume();
      audio.musicStart();
    }

    function handleEvent(e: GameEvent): void {
      switch (e.type) {
        case 'levelup':
          ui.openLevelup();
          break;
        case 'levelupMore':
        case 'wave':
          break;
        case 'toast':
          ui.toast(e.text);
          break;
        case 'boss':
          ui.toast(`${e.name} 已被摧毁`);
          break;
        case 'evolve':
          ui.toast('进化解锁');
          break;
        case 'over':
        case 'win': {
          finishRun(e.data);
          break;
        }
      }
    }

    function finishRun(summary: RunSummary): void {
      const win = summary.win;
      const firstClear = win && progress.clears === 0;
      const mul = (THREATS[Math.min(4, Math.max(1, game?.threat ?? 1)) - 1] ?? THREATS[0]).scrap;
      summary.scrap = scrapFor(summary.kills, summary.time, summary.bosses, win, game?.threat ?? 1, firstClear);
      // firstClear 奖励不吃威胁倍率（一次性荣誉奖励）
      if (firstClear) summary.scrap += CONFIG.scrap.firstClear;
      void mul;
      summary.win = win;
      const g = game;
      const cheated = CHEAT_IDS.some((id) => ctx.options.enabled(id)) || progress.cheated;
      applyResult(progress, {
        time: summary.time,
        kills: summary.kills,
        level: summary.level,
        score: summary.score,
        scrap: summary.scrap,
        win: summary.win,
        bossKilled: summary.bosses,
        threat: g?.threat ?? 1,
        cheated,
        perPlayer: summary.perPlayer,
      });
      saveNow();
      audio.musicStop();
      ui.progress = progress;
      ui.openResult(summary, win);
    }

    // ===================================================================
    // 每帧
    // ===================================================================

    function update(dt: number): void {
      clock += dt;
      const screen: Screen = ui.screen;
      const inMenu = screen !== 'playing';
      input.sample(inMenu);
      ui.update(game, dt);

      // 设置项每帧同步（随时可改）
      fx.shakeScale = ctx.options.choice('screen-shake') === 'off' ? 0 : ctx.options.choice('screen-shake') === 'weak' ? 0.4 : 1;

      if (game && rig && !inMenu) {
        const p1 = game.players[0]!;
        const p2 = game.players.length > 1 ? game.players[1]! : null;
        const split = ctx.options.choice('split-mode') as 'auto' | 'never' | 'always';

        game.update(dt, [input.p1, input.p2]);

        // 队友被救起 → 保持合屏 0.6s 再重新判定（docs/camera.md 第 8 节）
        if (game.justRevivedAt > lastRevived) {
          lastRevived = game.justRevivedAt;
          rig.afterRevive();
        }

        const downed = !p1.alive || (!!p2 && p2.downed);
        const lead = p1.alive ? p1 : (p2 && p2.alive ? p2 : p1);
        const mate = p1.alive && p2 && p2.alive ? p2 : null;
        rig.update(dt, lead, mate, lead.turretAngle, split, downed);

        ui.rigSplit = rig.mode === 'split';
        // 强制合屏：升级与暂停期间
        if (ui.screen !== 'playing') rig.forceMerge(0.6);
      } else if (rig) {
        rig.forceMerge(0.3);
        const g = game;
        if (g) {
          const p1 = g.players[0]!;
          rig.update(dt, p1, null, p1.turretAngle, 'auto', true);
        }
        ui.rigSplit = false;
      }

      fx.update(dt);
    }

    function render(): void {
      const g = ctx.ctx2d;
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = COLORS.void;
      g.fillRect(0, 0, CONFIG.width, CONFIG.height);

      if (game && rig && renderer) {
        const scale = rig.merged.zoom;
        renderer.render(g, fx, scale);
      }
      ui.render(g, game, clock);
    }

    return {
      update,
      render,
      pause(): void {
        saveNow();
      },
      dispose(): void {
        audio.dispose();
        saveNow();
        fx.clear();
      },
    };
  },
});
