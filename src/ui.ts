/**
 * 画布内界面（docs/port.md 第 3 步）。
 *
 * 平台的可调项面板只支持鼠标与键盘（手柄导航要等平台 M3），所以游戏内所有
 * 流程界面都必须自己画在画布里 —— 电视上没有鼠标。
 *
 * 焦点规则：每个界面维护一个 focus 索引，方向键移动、south 确认、east 返回。
 * 平台不提供画布内焦点系统，这里自己实现。
 */

import { CONFIG, COLORS, THREATS } from './config';
import {
  KIND_COLORS, KIND_NAMES, RARITY_COLORS, RARITY_NAMES,
  type CardEvol,
} from './data/cards';
import { MAPS, SKINS, TANKS, CARD_BY_ID } from './data/exports';
import { chassisOf, levelScale } from './stats';
import {
  levelOf,
  isOwned,
  isMapUnlocked,
  isSkinOwned,
  tankUnlockPrice,
  upgradePrice,
  threatLocked,
  buyTank,
  buyMap,
  buySkin,
  markEvolutionSeen,
  pendingEvolution,
  type Progress,
} from './save';
import { drawTank } from './draw/tank';
import type { Game, Player, RunSummary } from './game';
import type { InputHub } from './input';
import { formatTime } from './tuning';

const W = CONFIG.width;
const H = CONFIG.height;

export type Screen = 'title' | 'garage' | 'playing' | 'paused' | 'levelup' | 'result';

export interface UiHooks {
  onStart(twoPlayer: boolean): void;
  onResume(): void;
  onRestart(): void;
  onQuit(): void;
  onExitToShelf(): void;
  onChoose(cardId: string, evolveId?: string): void;
  onReroll(): void;
  /** 存档被改动，需要立刻落盘。 */
  onSave(): void;
  sfx(id: string): void;
}

export class Ui {
  screen: Screen = 'title';
  twoPlayer = false;
  private focus = 0;
  private branchFocus = 0;
  private tab: 0 | 1 | 2 | 3 = 0;
  private result: RunSummary | null = null;
  /** 进化预览（机库里按 north 打开）。 */
  private evolutionView: { tankId: string; page: number } | null = null;
  private toastText = '';
  private toastTime = 0;
  /** 机库里当前聚焦项的购买反馈。 */
  private notice = '';
  private noticeTime = 0;

  constructor(
    private readonly hooks: UiHooks,
    private readonly input: InputHub,
  ) {}

  // ===================================================================
  // 状态切换
  // ===================================================================

  openTitle(): void {
    this.screen = 'title';
    this.focus = 0;
  }

  openGarage(): void {
    this.screen = 'garage';
    this.tab = 0;
    this.focus = 0;
    this.notice = '';
  }

  openPause(): void {
    if (this.screen !== 'playing') return;
    this.screen = 'paused';
    this.focus = 0;
  }

  closePause(): void {
    if (this.screen !== 'paused') return;
    this.screen = 'playing';
  }

  openLevelup(): void {
    this.screen = 'levelup';
    this.focus = 0;
    this.branchFocus = 0;
  }

  openResult(r: RunSummary, win: boolean): void {
    this.result = r;
    this.screen = 'result';
    this.focus = win ? 0 : 0;
  }

  resume(): void {
    this.screen = 'playing';
  }

  toast(text: string): void {
    this.toastText = text;
    this.toastTime = 2.4;
  }

  private notify(text: string): void {
    this.notice = text;
    this.noticeTime = 2.2;
  }

  /** 每帧调用：处理输入。返回 true 表示世界应当暂停（菜单打开）。 */
  update(game: Game | null, dt: number): boolean {
    this.toastTime = Math.max(0, this.toastTime - dt);
    this.noticeTime = Math.max(0, this.noticeTime - dt);
    const inp = this.input;

    if (this.screen === 'playing') {
      if (inp.has('start')) {
        this.openPause();
        this.hooks.sfx('ui');
        return true;
      }
      return false;
    }

    if (this.screen === 'paused') {
      this.handlePause(game, dt);
      return true;
    }
    if (this.screen === 'levelup') {
      this.handleLevelup(game);
      return true;
    }
    if (this.screen === 'result') {
      this.handleResult(dt);
      return true;
    }
    if (this.screen === 'garage') {
      this.handleGarage(dt);
      return true;
    }
    this.handleTitle(dt);
    return true;
  }

  // ===================================================================
  // 输入处理
  // ===================================================================

  private handleTitle(dt: number): void {
    const inp = this.input;
    if (inp.has('menuLeft')) { this.twoPlayer = false; this.hooks.sfx('ui'); }
    if (inp.has('menuRight')) { this.twoPlayer = true; this.hooks.sfx('ui'); }
    if (inp.has('start')) { this.openGarage(); this.hooks.sfx('ui'); return; }
    if (inp.has('confirm')) { this.openGarage(); this.hooks.sfx('ui'); }
    void dt;
  }

  private handlePause(game: Game | null, dt: number): void {
    const items = ['继续', '重开', '返回机库', '退出到货架'];
    if (inp(this.input, 'menuUp')) {
      this.focus = (this.focus + items.length - 1) % items.length;
      this.hooks.sfx('ui');
    }
    if (inp(this.input, 'menuDown')) {
      this.focus = (this.focus + 1) % items.length;
      this.hooks.sfx('ui');
    }
    if (this.input.has('start') || this.input.has('back') || this.input.has('confirm')) {
      const act = this.input.has('start') || this.input.has('back') ? 0 : this.focus;
      if (act === 0) { this.closePause(); this.hooks.onResume(); }
      else if (act === 1) { this.hooks.onRestart(); }
      else if (act === 2) { this.openGarage(); this.hooks.onQuit(); }
      else this.hooks.onExitToShelf();
      this.hooks.sfx('ui');
    }
    void game;
    void dt;
  }

  private handleLevelup(game: Game | null): void {
    if (!game) return;
    const n = game.offers.length;
    if (n === 0) { this.resume(); return; }
    if (this.focus >= n) this.focus = 0;
    const cur = game.offers[this.focus];
    const maxEvo = (cur?.evolves.length ?? 0) - 1;
    if (this.branchFocus > maxEvo) this.branchFocus = 0;
    if (this.branchFocus < 0) this.branchFocus = 0;

    if (this.input.has('menuLeft')) { this.focus = (this.focus + n - 1) % n; this.branchFocus = 0; this.hooks.sfx('ui'); }
    if (this.input.has('menuRight')) { this.focus = (this.focus + 1) % n; this.branchFocus = 0; this.hooks.sfx('ui'); }
    if (cur && cur.evolves.length > 1) {
      if (this.input.has('menuUp')) { this.branchFocus = (this.branchFocus + cur.evolves.length - 1) % cur.evolves.length; this.hooks.sfx('ui'); }
      if (this.input.has('menuDown')) { this.branchFocus = (this.branchFocus + 1) % cur.evolves.length; this.hooks.sfx('ui'); }
    }
    if (this.input.has('reroll') && game.rerollsLeft > 0) {
      if (game.reroll()) this.hooks.sfx('ui');
      this.branchFocus = 0;
    }
    const pick = this.input.has('pick1') ? 0 : this.input.has('pick2') ? 1 : this.input.has('pick3') ? 2 : -1;
    const want = pick >= 0 ? pick : this.input.has('confirm') ? this.focus : -1;
    if (want >= 0 && want < n) {
      const offer = game.offers[want]!;
      const ev: CardEvol | null = offer.evolves.length > 0
        ? offer.evolves[want === this.focus ? this.branchFocus : 0] ?? offer.evolves[0]!
        : null;
      this.hooks.onChoose(offer.card.id, ev?.id);
      this.hooks.sfx('ui');
      this.focus = 0;
      this.branchFocus = 0;
    }
  }

  private handleResult(dt: number): void {
    const items = ['再来一局', '返回机库', '退出到货架'];
    if (this.focus >= items.length) this.focus = 0;
    if (this.input.has('menuUp') || this.input.has('menuLeft')) {
      this.focus = (this.focus + items.length - 1) % items.length;
      this.hooks.sfx('ui');
    }
    if (this.input.has('menuDown') || this.input.has('menuRight')) {
      this.focus = (this.focus + 1) % items.length;
      this.hooks.sfx('ui');
    }
    if (this.input.has('confirm') || this.input.has('start')) {
      this.focus = 0;
      this.hooks.onRestart();
      this.hooks.sfx('ui');
      return;
    }
    if (this.input.has('back')) {
      this.openGarage();
      this.hooks.onQuit();
      this.hooks.sfx('ui');
    }
    void dt;
  }

  private handleGarage(dt: number): void {
    const p = this.progress;
    if (!p) return;

    const ev = this.evolutionView;
    if (ev) {
      if (this.input.has('back') || this.input.has('confirm')) {
        markEvolutionSeen(p, ev.tankId);
        this.hooks.onSave();
        this.evolutionView = null;
        this.hooks.sfx('ui');
      }
      if (this.input.has('menuLeft')) ev.page = Math.max(0, ev.page - 1);
      if (this.input.has('menuRight')) ev.page = Math.min(3, ev.page + 1);
      return;
    }

    // 页签切换
    if (this.input.has('tabPrev')) { this.tab = ((this.tab + 3) % 4) as 0 | 1 | 2 | 3; this.focus = 0; this.hooks.sfx('ui'); }
    if (this.input.has('tabNext')) { this.tab = ((this.tab + 1) % 4) as 0 | 1 | 2 | 3; this.focus = 0; this.hooks.sfx('ui'); }

    const count = this.tab === 0 ? TANKS.length : this.tab === 1 ? MAPS.length : this.tab === 2 ? THREATS.length : this.statRows().length;
    if (this.focus >= count) this.focus = 0;
    if (this.input.has('menuLeft')) {
      this.focus = (this.focus + count - 1) % count;
      this.hooks.sfx('ui');
    }
    if (this.input.has('menuRight')) {
      this.focus = (this.focus + 1) % count;
      this.hooks.sfx('ui');
    }
    if (this.input.has('menuUp')) { this.focus = (this.focus + count - 2) % count; this.hooks.sfx('ui'); }
    if (this.input.has('menuDown')) { this.focus = (this.focus + 2) % count; this.hooks.sfx('ui'); }

    // 涂装切换 / 进化预览
    if (this.tab === 0) {
      const tank = TANKS[this.focus]!;
      if (this.input.has('skinNext')) { this.cycleSkin(p, tank.id, 1); }
      if (this.input.has('skinPrev')) { this.cycleSkin(p, tank.id, -1); }
      if (this.input.has('confirm')) {
        if (!isOwned(p, tank.id)) {
          const r = buyTank(p, tank.id);
          if (r.ok) { this.notify('解锁 · ' + tank.name); this.hooks.sfx('evolve'); }
          else this.notify(buyFail(tank.id, r));
          this.hooks.onSave();
        } else {
          const ownedBySelection = this.selectedIds();
          if (ownedBySelection.includes(tank.id) && pendingEvolution(p, tank.id)) {
            this.evolutionView = { tankId: tank.id, page: 0 };
            this.hooks.sfx('ui');
          } else {
            p.selected.p1 = tank.id;
            this.hooks.onSave();
            this.hooks.sfx('ui');
          }
        }
      }
    } else if (this.tab === 1) {
      const map = MAPS[this.focus]!;
      if (this.input.has('confirm')) {
        if (!isMapUnlocked(p, map.id)) {
          const r = buyMap(p, map.id);
          if (r.ok) { this.notify('解锁 · ' + map.name); this.hooks.sfx('evolve'); }
          else this.notify(r.reason === 'scrap' ? `废铁不足 · 差 ${r.short}` : '已拥有');
          this.hooks.onSave();
        } else {
          p.selected.map = map.id;
          this.hooks.onSave();
          this.hooks.sfx('ui');
        }
      }
    } else if (this.tab === 2) {
      const th = THREATS[this.focus]!;
      if (this.input.has('confirm')) {
        const need = threatLocked(p, this.focus + 1, this.selectedIds());
        if (need > 0) this.notify(`需要坦克升到 Lv${[0, 0, 5, 10, 15][this.focus + 1]} · 还差 ${need} 级`);
        else { p.selected.threat = this.focus + 1; this.hooks.onSave(); this.hooks.sfx('ui'); }
      }
      void th;
    }
    // tab 3（战绩）只读，无确认动作

    if (this.input.has('start')) {
      this.tryStart();
    }
    if (this.input.has('back') && this.tab === 0) {
      this.openTitle();
      this.hooks.sfx('ui');
    }
    void dt;
  }

  /** 战绩页的行。数据全部来自存档，实时准确（不像平台 status 面板会冻结）。 */
  private statRows(): [string, string][] {
    const p = this.progress;
    if (!p) return [];
    return [
      ['最高存活', formatTime(p.bestTime)],
      ['最高得分', String(p.bestScore)],
      ['单局最多击毁', String(p.bestKills)],
      ['到达过的最高等级', String(p.bestLevel)],
      ['通关次数', String(p.clears)],
      ['累计击毁', String(p.totalKills)],
      ['累计时长', formatTime(p.totalTime)],
      ['击杀 BOSS', String(p.bossKills)],
      ['已收集坦克', `${p.owned.length} / ${TANKS.length}`],
      ['已解锁地图', `${p.maps.length} / ${MAPS.length}`],
      ['已购涂装', `${p.skins.length} / ${SKINS.length}`],
      ['总局数', String(p.runs)],
    ];
  }

  private cycleSkin(p: Progress, tankId: string, dir: number): void {
    const cur = p.tanks[tankId]?.skin ?? 'factory';
    let i = Math.max(0, SKINS.findIndex((s) => s.id === cur));
    for (let guard = 0; guard < SKINS.length; guard += 1) {
      i = (i + dir + SKINS.length) % SKINS.length;
      const sk = SKINS[i]!;
      if (isSkinOwned(p, sk.id)) {
        p.tanks[tankId] = { level: levelOf(p, tankId), skin: sk.id };
        this.hooks.onSave();
        this.hooks.sfx('ui');
        return;
      }
      const r = buySkin(p, sk.id);
      if (r.ok) {
        p.tanks[tankId] = { level: levelOf(p, tankId), skin: sk.id };
        this.hooks.onSave();
        this.notify('购买涂装 · ' + sk.name);
        this.hooks.sfx('evolve');
        return;
      }
      this.notify(r.reason === 'scrap' ? `废铁不足 · 差 ${r.short}` : '已拥有');
      return;
    }
  }

  private selectedIds(): string[] {
    const p = this.progress;
    if (!p) return [];
    return this.twoPlayer ? [p.selected.p1, p.selected.p2] : [p.selected.p1];
  }

  tryStart(): void {
    const p = this.progress;
    if (!p) return;
    const owned = this.selectedIds();
    if (owned.some((id) => !isOwned(p, id))) {
      this.notify('该坦克尚未解锁');
      return;
    }
    const th = this.progress ? p.selected.threat : 1;
    const need = threatLocked(p, th, owned);
    if (need > 0) {
      this.notify(`威胁等级需要坦克达到 Lv${[0, 0, 5, 10, 15][th]}`);
      return;
    }
    this.hooks.onStart(this.twoPlayer);
  }

  /** 由 main 注入，避免 UI 直接依赖存档实现。 */
  progress: Progress | null = null;

  // ===================================================================
  // 绘制
  // ===================================================================

  render(g: CanvasRenderingContext2D, game: Game | null, time: number): void {
    if (this.screen === 'playing') {
      if (game) this.drawHud(g, game);
      this.drawToast(g);
      return;
    }
    if (this.screen === 'title') this.drawTitle(g, time);
    else if (this.screen === 'garage') this.drawGarage(g, time);
    else if (this.screen === 'paused') {
      if (game) this.drawHud(g, game);
      this.drawPause(g, game);
    } else if (this.screen === 'levelup') {
      if (game) this.drawLevelup(g, game);
    } else if (this.screen === 'result') {
      this.drawResult(g);
    }
  }

  // ---- HUD ----

  private drawHud(g: CanvasRenderingContext2D, game: Game): void {
    const vs = this.rigViewports();
    const barW = 200;

    for (let i = 0; i < vs.length; i += 1) {
      const v = vs[i]!;
      const p = game.players[Math.min(i, game.players.length - 1)];
      if (!p) continue;
      this.drawPlayerCard(g, p, v);
    }

    // 顶部条：计时 / 等级 / 经验 / 击毁（跨屏一份）
    g.save();
    g.fillStyle = 'rgba(11,14,16,0.62)';
    g.fillRect(0, 0, W, 44);
    g.textBaseline = 'middle';
    g.textAlign = 'left';

    g.fillStyle = COLORS.textBright;
    g.font = '20px monospace';
    g.fillText(formatTime(game.time), 16, 22);
    g.font = '10px monospace';
    g.fillStyle = COLORS.textDim;
    g.fillText('存活', 16, 37);

    g.textAlign = 'center';
    g.fillStyle = COLORS.p1;
    g.font = '16px monospace';
    g.fillText(`LV ${game.level}`, W / 2 - 130, 17);

    const ratio = Math.max(0, Math.min(1, game.xp / Math.max(1, game.xpNeedNow)));
    g.fillStyle = COLORS.grid;
    g.fillRect(W / 2 - 96, 12, barW * 0.9, 9);
    g.fillStyle = COLORS.heal;
    g.fillRect(W / 2 - 96, 12, barW * 0.9 * ratio, 9);
    g.fillStyle = COLORS.text;
    g.font = '10px monospace';
    g.fillText(`${Math.floor(game.xp)} / ${game.xpNeedNow}`, W / 2 + 6, 27);

    g.textAlign = 'right';
    g.fillStyle = COLORS.textBright;
    g.font = '18px monospace';
    g.fillText(String(game.kills), W - 16, 17);
    g.font = '10px monospace';
    g.fillStyle = COLORS.textDim;
    g.fillText('击毁', W - 16, 32);

    // 阶段名
    g.textAlign = 'center';
    g.fillStyle = COLORS.textDim;
    g.font = '10px monospace';
    g.fillText(game.phaseInfo().name, W / 2, 40);
    g.restore();

    // BOSS 血条
    const boss = game.boss?.alive ? game.boss : game.finalBoss?.alive ? game.finalBoss : null;
    if (boss) {
      const bw = 420;
      const bx = (W - bw) / 2;
      const by = 52;
      g.save();
      g.fillStyle = 'rgba(11,14,16,0.6)';
      g.fillRect(bx - 8, by - 12, bw + 16, 30);
      g.fillStyle = COLORS.void;
      g.fillRect(bx, by, bw, 8);
      const r = Math.max(0, boss.hp / boss.maxHp);
      g.fillStyle = boss === game.finalBoss ? '#ff5a3c' : '#d9533f';
      g.fillRect(bx, by, bw * r, 8);
      g.strokeStyle = COLORS.void;
      g.lineWidth = 1;
      g.strokeRect(bx + 0.5, by + 0.5, bw - 1, 7);
      g.fillStyle = COLORS.textBright;
      g.font = '11px monospace';
      g.textAlign = 'left';
      g.fillText(boss.boss!.name, bx, by - 4);
      g.textAlign = 'right';
      g.fillStyle = COLORS.text;
      g.fillText(`${Math.max(0, Math.ceil(boss.hp))} / ${Math.round(boss.maxHp)}`, bx + bw, by - 4);
      g.restore();
    }

    // 流派进度（小角标，让玩家知道自己往哪长）
    this.drawSchoolChips(g, game);
    this.drawToast(g);
  }

  private drawPlayerCard(g: CanvasRenderingContext2D, p: Player, v: { x: number; y: number; w: number; h: number }): void {
    const cw = 208;
    const ch = 90;
    const x = v.x + 12;
    const y = v.y + v.h - ch - 12;

    g.save();
    g.fillStyle = 'rgba(11,14,16,0.6)';
    roundRect(g, x, y, cw, ch, 5);
    g.fill();
    if (!p.alive) g.globalAlpha = 0.5;

    // 名字 / 血量
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = p.tank.body;
    g.font = '12px monospace';
    g.fillText(`${p.name} ${p.tank.name}`, x + 10, y + 14);
    g.textAlign = 'right';
    g.fillStyle = COLORS.textBright;
    g.font = '13px monospace';
    g.fillText(p.alive ? `${Math.ceil(p.hp)} / ${Math.round(p.maxHp)}` : (p.downed ? '等待救援' : '阵亡'), x + cw - 10, y + 14);

    // 血条
    const hpRatio = Math.max(0, p.hp / p.maxHp);
    g.fillStyle = COLORS.grid;
    roundRect(g, x + 10, y + 24, cw - 20, 9, 2);
    g.fill();
    g.fillStyle = hpRatio > 0.5 ? COLORS.heal : hpRatio > 0.25 ? COLORS.scout : COLORS.bomber;
    roundRect(g, x + 10, y + 24, (cw - 20) * hpRatio, 9, 2);
    g.fill();

    // 护盾格
    if (p.shieldMax > 0) {
      for (let i = 0; i < p.shieldMax; i += 1) {
        const sx = x + 10 + i * 12;
        g.fillStyle = i < p.shield ? COLORS.p2 : COLORS.grid;
        g.fillRect(sx, y + 37, 9, 3);
      }
    }

    // 炸弹 pip
    const bombY = y + 50;
    g.textAlign = 'left';
    g.fillStyle = COLORS.textDim;
    g.font = '9px monospace';
    g.fillText('炸弹', x + 10, bombY + 4);
    for (let i = 0; i < CONFIG.combat.bombsMax; i += 1) {
      const bx = x + 40 + i * 13;
      g.beginPath();
      g.arc(bx, bombY + 3, 4.5, 0, Math.PI * 2);
      g.fillStyle = i < p.bombs ? COLORS.p1 : COLORS.grid;
      g.fill();
    }

    // 冲刺冷却
    const dashReady = 1 - Math.max(0, Math.min(1, p.dashCd / CONFIG.combat.dashCd));
    g.fillStyle = COLORS.grid;
    g.fillRect(x + 112, bombY, 86, 6);
    g.fillStyle = dashReady >= 1 ? COLORS.p2 : COLORS.textDim;
    g.fillRect(x + 112, bombY, 86 * dashReady, 6);

    // 初始技能（签名）：名字 + 实时状态，让玩家看得见它什么时候生效
    g.textAlign = 'left';
    g.fillStyle = p.tank.glow;
    g.font = '9px monospace';
    g.fillText(`◆ ${p.tank.signatureName}`, x + 10, y + ch - 13);
    const state = this.sigState(p);
    if (state) {
      g.textAlign = 'right';
      g.fillStyle = COLORS.textBright;
      g.fillText(state, x + cw - 10, y + ch - 13);
    }

    // 救援进度
    if (p.downed) {
      const r = Math.max(0, Math.min(1, 1 - p.reviveT / CONFIG.combat.reviveTime));
      g.fillStyle = COLORS.grid;
      g.fillRect(x + 10, y + ch - 6, cw - 20, 4);
      g.fillStyle = COLORS.heal;
      g.fillRect(x + 10, y + ch - 6, (cw - 20) * r, 4);
    }
    g.restore();
  }

  /** 签名技能的实时状态文字（无状态时返回空串）。 */
  private sigState(p: Player): string {
    const s = p.sig;
    switch (p.tank.signature) {
      case 'anvil':
        if (p.hurtFlash > 0) return '';
        if (p.still >= s.stillNeed) return `定格 +${Math.round(s.stillDmg * 100)}%`;
        if (s.heavyEvery > 0 && p.heavyCharge > 0) return `重击 ${Math.round(p.heavyCharge * 100)}%`;
        return '';
      case 'echo':
        return p.dashBoost > 0 ? `射速 +${Math.round(s.dashRoF * 100)}%` : '';
      case 'bastion':
        return p.desperate ? `应急装甲 减伤 ${Math.round(s.lowHpReduction * 100)}%` : '';
      case 'lance':
        return s.railDmg > 0 ? `轨道炮 ${(p.railCd).toFixed(1)}s` : '贯穿 +1';
      case 'furnace':
        return `爆炸 ${Math.round(p.blastRadius)}`;
      case 'arc':
        return `连锁 ${p.weapon.chain}`;
      case 'swarm':
        return p.swarmStacks > 0 ? `叠 ${Math.round(p.swarmStacks / 2)} 层` : '散射';
      case 'mk2':
        return p.barrageCd > 0 ? `齐射 ${p.barrageCd.toFixed(1)}s` : '齐射就绪';
      default:
        return '';
    }
  }

  /** 右上角：本局拿到的卡与等级（颜色 = 类别）。 */
  private drawSchoolChips(g: CanvasRenderingContext2D, game: Game): void {
    const x = W - 12;
    const y = 78;
    g.save();
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.font = '10px monospace';
    let i = 0;
    for (const [id, lv] of game.cardLevels) {
      const card = CARD_BY_ID.get(id);
      if (!card) continue;
      const evo = game.evolved.get(id);
      g.fillStyle = KIND_COLORS[card.kind];
      g.fillText(
        `${card.name} ${'●'.repeat(lv)}${evo ? '★' : ''}`,
        x,
        y + i * 15,
      );
      i += 1;
      if (i >= 10) break;
    }
    g.restore();
  }

  // ---- 标题 ----

  private drawTitle(g: CanvasRenderingContext2D, time: number): void {
    g.save();
    g.fillStyle = 'rgba(11,14,16,0.82)';
    g.fillRect(0, 0, W, H);
    this.drawVignette(g);

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = COLORS.p1;
    g.font = '54px monospace';
    g.fillText('坦克幸存者', W / 2, 128);
    g.fillStyle = COLORS.textDim;
    g.font = '12px monospace';
    g.fillText('TANK SURVIVORS · HEARTHBOX ARCADE', W / 2, 166);
    g.fillStyle = COLORS.text;
    g.font = '14px monospace';
    g.fillText('八分钟。八台坦克。一条活到底的战线。', W / 2, 196);

    // 人数选择
    const modes = ['单人', '双人同屏'];
    for (let i = 0; i < 2; i += 1) {
      const on = (i === 1) === this.twoPlayer;
      const x = W / 2 + (i === 0 ? -110 : 110);
      const y = 258;
      g.fillStyle = on ? COLORS.p1 : COLORS.grid;
      roundRect(g, x - 84, y - 26, 168, 52, 4);
      g.fill();
      g.fillStyle = on ? COLORS.void : COLORS.text;
      g.font = on ? '18px monospace' : '16px monospace';
      g.fillText(modes[i]!, x, y);
    }
    g.fillStyle = COLORS.textDim;
    g.font = '11px monospace';
    g.fillText('← → 切换人数 · A / 空格 进入机库', W / 2, 302);

    // 最佳战绩
    const p = this.progress;
    if (p && (p.bestScore > 0 || p.bestTime > 0)) {
      g.fillStyle = COLORS.text;
      g.font = '13px monospace';
      g.fillText(`最佳 ${formatTime(p.bestTime)} · ${p.bestScore} 分 · 通关 ${p.clears} 次`, W / 2, 348);
    }
    if (p) {
      g.fillStyle = COLORS.p1;
      g.font = '13px monospace';
      g.fillText(`废铁 ${Math.floor(p.scrap)}`, W / 2, 372);
    }

    // 操作说明
    g.fillStyle = COLORS.textDim;
    g.font = '11px monospace';
    const lines = [
      '移动 左摇杆 / WASD      瞄准 右摇杆（松手自动瞄准）',
      '冲刺 A / 空格          炸弹 X / RB / 左 Shift',
      '暂停 Start / Esc       选卡 ← → + A · 1 2 3 直选',
    ];
    for (let i = 0; i < lines.length; i += 1) g.fillText(lines[i]!, W / 2, 418 + i * 18);

    const pulse = 0.45 + Math.sin(time * 3) * 0.3;
    g.globalAlpha = pulse;
    g.fillStyle = COLORS.textBright;
    g.font = '14px monospace';
    g.fillText('按 A / 空格 开始', W / 2, 500);
    g.restore();
  }

  // ---- 机库 ----

  private drawGarage(g: CanvasRenderingContext2D, time: number): void {
    const p = this.progress;
    if (!p) return;
    g.save();
    g.fillStyle = 'rgba(11,14,16,0.9)';
    g.fillRect(0, 0, W, H);

    // 顶栏
    g.fillStyle = 'rgba(18,24,28,0.9)';
    g.fillRect(0, 0, W, 46);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = COLORS.textBright;
    g.font = '16px monospace';
    g.fillText('机库', 16, 23);
    const tabs = ['坦克', '地图', '威胁', '战绩'];
    for (let i = 0; i < tabs.length; i += 1) {
      const x = 108 + i * 84;
      const on = this.tab === i;
      g.fillStyle = on ? COLORS.p1 : COLORS.grid;
      roundRect(g, x - 34, 10, 76, 26, 3);
      g.fill();
      g.fillStyle = on ? COLORS.void : COLORS.text;
      g.font = '13px monospace';
      g.textAlign = 'center';
      g.fillText(tabs[i]!, x + 4, 23);
    }
    g.textAlign = 'right';
    g.fillStyle = COLORS.p1;
    g.font = '16px monospace';
    g.fillText(`废铁 ${Math.floor(p.scrap)}`, W - 16, 23);
    g.textAlign = 'center';

    if (this.evolutionView) {
      this.drawEvolution(g, this.evolutionView, time);
      g.restore();
      return;
    }
    if (this.tab === 0) this.drawTankTab(g, p, time);
    else if (this.tab === 1) this.drawMapTab(g, p);
    else if (this.tab === 2) this.drawThreatTab(g, p);
    else this.drawStatTab(g, p);

    // 底栏
    g.fillStyle = 'rgba(18,24,28,0.9)';
    g.fillRect(0, H - 46, W, 46);
    g.textAlign = 'left';
    g.fillStyle = COLORS.textDim;
    g.font = '11px monospace';
    g.fillText('A 选择 / 购买   L1 R1 换涂装   LB RB 换页签   Start 出发   B 返回', 16, H - 23);
    if (this.noticeTime > 0 && this.notice) {
      g.textAlign = 'right';
      g.fillStyle = COLORS.p1;
      g.globalAlpha = Math.min(1, this.noticeTime * 2);
      g.font = '13px monospace';
      g.fillText(this.notice, W - 16, H - 23);
    }
    g.restore();
  }

  private drawTankTab(g: CanvasRenderingContext2D, p: Progress, time: number): void {
    const cols = 4;
    const cw = 168;
    const ch = 122;
    const gx = (W - cols * cw) / 2 + cw / 2;
    const gy = 92;

    for (let i = 0; i < TANKS.length; i += 1) {
      const tank = TANKS[i]!;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gx + col * cw - cw / 2;
      const y = gy + row * (ch + 10);
      const owned = isOwned(p, tank.id);
      const focused = this.focus === i;
      const selected = p.selected.p1 === tank.id;

      g.fillStyle = focused ? 'rgba(242,177,60,0.16)' : 'rgba(26,34,40,0.85)';
      roundRect(g, x, y, cw - 8, ch, 4);
      g.fill();
      g.strokeStyle = focused ? COLORS.p1 : selected ? COLORS.heal : COLORS.grid;
      g.lineWidth = focused || selected ? 2 : 1;
      g.stroke();

      // 车
      g.save();
      if (!owned) g.globalAlpha = 0.32;
      drawTank(g, x + (cw - 8) / 2, y + 42, -Math.PI / 2, 17, {
        body: tank.body, light: tank.light, tread: COLORS.tread, glow: tank.glow,
      }, owned ? (levelScaleOf(p, tank.id) as 1 | 2 | 3 | 4) : 1, tank.id, {
        t: time, moving: false, speed: 0,
      });
      g.restore();

      g.textAlign = 'center';
      g.fillStyle = owned ? COLORS.textBright : COLORS.textDim;
      g.font = '12px monospace';
      g.fillText(tank.name, x + (cw - 8) / 2, y + 76);

      if (owned) {
        g.fillStyle = COLORS.p1;
        g.font = '10px monospace';
        g.fillText(`Lv ${levelOf(p, tank.id)} · ${skinName(p, tank.id)}`, x + (cw - 8) / 2, y + 92);
        const price = upgradePrice(p, tank.id);
        g.fillStyle = COLORS.textDim;
        g.fillText(price > 0 ? `强化 ${price}` : '满级', x + (cw - 8) / 2, y + 108);
      } else {
        const up = tankUnlockPrice(tank.id);
        g.fillStyle = COLORS.bomber;
        g.font = '11px monospace';
        g.fillText(up === 'clear' ? '通关解锁' : `🔒 ${up}`, x + (cw - 8) / 2, y + 94);
      }
      if (tank.amphibious) {
        g.fillStyle = COLORS.p2;
        g.font = '9px monospace';
        g.fillText('渡水', x + cw - 26, y + 14);
      }
    }

    // 详情
    const tank = TANKS[Math.min(this.focus, TANKS.length - 1)]!;
    const dy = 358;
    g.fillStyle = 'rgba(18,24,28,0.9)';
    roundRect(g, 24, dy, W - 48, 96, 4);
    g.fill();
    g.strokeStyle = COLORS.grid;
    g.lineWidth = 1;
    g.stroke();

    g.textAlign = 'left';
    g.fillStyle = COLORS.textBright;
    g.font = '14px monospace';
    g.fillText(`${tank.code} ${tank.name} · ${tank.role}`, 40, dy + 20);

    const st = chassisPreview(tank);
    g.fillStyle = COLORS.text;
    g.font = '12px monospace';
    g.fillText(`生命 ${st.maxHp}   伤害 ${st.dmg}   移速 ${st.speed}   防护 ${st.armor}%   射速 ${st.interval}s`, 40, dy + 42);
    g.fillStyle = tank.glow;
    g.fillText(`签名 · ${tank.signatureName}：${tank.signatureDesc}`, 40, dy + 64);
    if (!isOwned(p, tank.id)) {
      g.fillStyle = COLORS.textDim;
      g.fillText(`未解锁 · ${tankUnlockPrice(tank.id) === 'clear' ? '通关一次即可获得' : tankUnlockPrice(tank.id) + ' 废铁'}`, 40, dy + 84);
    } else {
      const price = upgradePrice(p, tank.id);
      const next = price > 0 ? nextChassisPreview(tank, levelOf(p, tank.id)) : null;
      g.fillStyle = next ? COLORS.heal : COLORS.textDim;
      g.fillText(
        next
          ? `下一级 → 生命 ${next.maxHp} 伤害 ${next.dmg} 移速 ${next.speed} 射速 ${next.interval}s（${price} 废铁）`
          : '已满级',
        40,
        dy + 84,
      );
    }
  }

  private drawMapTab(g: CanvasRenderingContext2D, p: Progress): void {
    const cw = 168;
    const gx = (W - MAPS.length * cw) / 2 + cw / 2;
    for (let i = 0; i < MAPS.length; i += 1) {
      const m = MAPS[i]!;
      const x = gx + i * cw - cw / 2;
      const y = 92;
      const owned = isMapUnlocked(p, m.id);
      const focused = this.focus === i;
      const selected = p.selected.map === m.id;

      g.fillStyle = focused ? 'rgba(242,177,60,0.16)' : 'rgba(26,34,40,0.85)';
      roundRect(g, x, y, cw - 10, 150, 4);
      g.fill();
      g.strokeStyle = focused ? COLORS.p1 : selected ? COLORS.heal : COLORS.grid;
      g.lineWidth = focused || selected ? 2 : 1;
      g.stroke();

      // 地形缩略
      g.save();
      g.beginPath();
      roundRect(g, x + 8, y + 8, cw - 26, 56, 3);
      g.clip();
      g.fillStyle = m.tint;
      g.fillRect(x + 8, y + 8, cw - 26, 56);
      g.fillStyle = COLORS.ground;
      g.globalAlpha = 1 - m.tintAlpha;
      g.fillRect(x + 8, y + 8, cw - 26, 56);
      g.globalAlpha = 1;
      drawTerrainPreview(g, m.id, x + 8, y + 8, cw - 26, 56);
      g.restore();

      g.textAlign = 'center';
      g.fillStyle = COLORS.textBright;
      g.font = '14px monospace';
      g.fillText(m.name, x + (cw - 10) / 2, y + 80);
      g.fillStyle = COLORS.scout;
      g.font = '11px monospace';
      g.fillText('★'.repeat(m.danger) + '☆'.repeat(3 - m.danger), x + (cw - 10) / 2, y + 98);
      g.fillStyle = COLORS.text;
      g.font = '10px monospace';
      g.fillText(m.summary, x + (cw - 10) / 2, y + 118);
      g.fillStyle = owned ? COLORS.textDim : COLORS.bomber;
      g.fillText(owned ? (selected ? '已选用' : 'A 选用') : `🔒 ${m.price}`, x + (cw - 10) / 2, y + 136);
    }

    const m = MAPS[Math.min(this.focus, MAPS.length - 1)]!;
    const dy = 274;
    g.fillStyle = 'rgba(18,24,28,0.9)';
    roundRect(g, 24, dy, W - 48, 180, 4);
    g.fill();
    g.textAlign = 'left';
    g.fillStyle = COLORS.textBright;
    g.font = '15px monospace';
    g.fillText(`${m.name} · ${'★'.repeat(m.danger)}`, 40, dy + 24);
    g.fillStyle = COLORS.text;
    g.font = '12px monospace';
    g.fillText(m.tactic, 40, dy + 48);

    const p1 = TANKS.find((t) => t.id === p.selected.p1);
    const p2 = TANKS.find((t) => t.id === p.selected.p2);
    const water = m.id === 'delta';
    g.fillStyle = water ? (p1?.amphibious ? COLORS.heal : COLORS.bomber) : COLORS.textDim;
    g.font = '12px monospace';
    const cross = water
      ? `P1 ${p1?.name ?? '?'}（渡水：${p1?.amphibious ? '能' : '不能'}）` +
        (p2 ? `   P2 ${p2.name}（渡水：${p2.amphibious ? '能' : '不能'}）` : '')
      : '当前地图没有水域，渡水能力不影响';
    g.fillText(cross, 40, dy + 74);
    g.fillStyle = COLORS.textDim;
    g.fillText(
      water
        ? '提示：不能渡水时只能走桥与浅滩；桥会被打塌。'
        : m.id === 'jungle'
          ? '提示：草丛双向遮挡 —— 里面的敌人也看不见你，草叶摇动是破绽。'
          : m.id === 'tundra'
            ? '提示：冰面上松手仍会滑行约 1.2 秒，冲刺是唯一急停手段。'
            : m.id === 'ruins'
              ? '提示：残楼倒塌造成 40 伤害，对双方都算。'
              : '提示：基准图，没有特殊地形。',
      40,
      dy + 98,
    );
    g.fillStyle = COLORS.textDim;
    g.fillText('地图是战术选择，不是难度阶梯：不给额外废铁倍率。', 40, dy + 122);
    g.fillText('危险度只是提示，任何地图配任何威胁都能玩。', 40, dy + 146);
  }

  private drawThreatTab(g: CanvasRenderingContext2D, p: Progress): void {
    const cw = 200;
    const gx = (W - THREATS.length * cw) / 2 + cw / 2;
    for (let i = 0; i < THREATS.length; i += 1) {
      const t = THREATS[i]!;
      const x = gx + i * cw - cw / 2;
      const y = 96;
      const focused = this.focus === i;
      const selected = p.selected.threat === i + 1;
      const need = threatLocked(p, i + 1, this.selectedIds());

      g.fillStyle = focused ? 'rgba(242,177,60,0.16)' : 'rgba(26,34,40,0.85)';
      roundRect(g, x, y, cw - 12, 132, 4);
      g.fill();
      g.strokeStyle = focused ? COLORS.p1 : selected ? COLORS.heal : COLORS.grid;
      g.lineWidth = focused || selected ? 2 : 1;
      g.stroke();

      g.textAlign = 'center';
      g.fillStyle = need > 0 ? COLORS.textDim : COLORS.textBright;
      g.font = '17px monospace';
      g.fillText(t.name, x + (cw - 12) / 2, y + 26);
      g.fillStyle = COLORS.scout;
      g.font = '12px monospace';
      g.fillText('★'.repeat(t.stars) + '☆'.repeat(4 - t.stars), x + (cw - 12) / 2, y + 48);
      g.fillStyle = COLORS.text;
      g.font = '11px monospace';
      g.fillText(`敌人血量 ×${t.hp}  伤害 ×${t.dmg}`, x + (cw - 12) / 2, y + 70);
      g.fillText(`精英率 ${Math.round(t.elite * 100)}%`, x + (cw - 12) / 2, y + 88);
      g.fillStyle = need > 0 ? COLORS.bomber : COLORS.heal;
      g.fillText(need > 0 ? `需要 Lv${[0, 0, 5, 10, 15][i + 1]}（差 ${need}）` : t.need === 0 ? '无门槛' : `已解锁 Lv${levelOf(p, p.selected.p1)}`, x + (cw - 12) / 2, y + 112);
    }

    const t = THREATS[Math.min(this.focus, THREATS.length - 1)]!;
    const dy = 260;
    g.fillStyle = 'rgba(18,24,28,0.9)';
    roundRect(g, 24, dy, W - 48, 194, 4);
    g.fill();
    g.textAlign = 'left';
    g.fillStyle = COLORS.textBright;
    g.font = '15px monospace';
    g.fillText(`${t.name} · ${'★'.repeat(t.stars)}`, 40, dy + 24);
    g.fillStyle = COLORS.text;
    g.font = '12px monospace';
    g.fillText('会出现的兵种：', 40, dy + 48);
    g.fillStyle = COLORS.textDim;
    g.fillText(
      this.poolText(this.focus + 1),
      40,
      dy + 68,
    );
    g.fillStyle = COLORS.heal;
    g.fillText(`废铁倍率 ×${t.scrap}`, 40, dy + 94);
    g.fillStyle = COLORS.textDim;
    g.fillText('难度主要来自兵种数与精英率，数值只微调。', 40, dy + 118);
    g.fillText('威胁越高废铁越多 —— 主动承担风险应有回报（地图不给，地图是选择）。', 40, dy + 140);
    g.fillText('高威胁需要对应坦克等级：尺度与对手同步上升，不会越级碾压。', 40, dy + 162);
  }

  /** 战绩页：12 行只读统计，全部来自存档。 */
  private drawStatTab(g: CanvasRenderingContext2D, p: Progress): void {
    const rows = this.statRows();
    const cols = 2;
    const cw = 420;
    const rowH = 46;
    const gx = (W - cols * cw) / 2;
    const gy = 96;

    for (let i = 0; i < rows.length; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gx + col * cw;
      const y = gy + row * rowH;
      const on = this.focus === i;
      const [label, value] = rows[i]!;

      g.fillStyle = on ? 'rgba(242,177,60,0.14)' : 'rgba(26,34,40,0.7)';
      roundRect(g, x, y, cw - 14, rowH - 8, 3);
      g.fill();
      if (on) {
        g.strokeStyle = COLORS.p1;
        g.lineWidth = 1.5;
        g.stroke();
      }
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = COLORS.text;
      g.font = '13px monospace';
      g.fillText(label, x + 14, y + (rowH - 8) / 2);
      g.textAlign = 'right';
      g.fillStyle = on ? COLORS.p1 : COLORS.textBright;
      g.font = '16px monospace';
      g.fillText(value, x + cw - 28, y + (rowH - 8) / 2);
    }

    // 底部说明：为什么成就在这里而不是平台面板
    const dy = gy + Math.ceil(rows.length / cols) * rowH + 14;
    g.textAlign = 'left';
    g.fillStyle = COLORS.textDim;
    g.font = '11px monospace';
    g.fillText(
      '成就与统计画在机库里，而不是平台的「成就面板」：',
      24,
      dy,
    );
    g.fillText(
      '平台的可调项没有"更新值"的接口，第一次写入后就会冻结 —— 显示假数据比没有面板更糟。',
      24,
      dy + 20,
    );
    g.fillText(
      '这里的数据每次打开都从存档重读，所以永远实时。等平台补上 setStatus 后再接平台面板。',
      24,
      dy + 40,
    );
    void p;
  }

  private poolText(threat: number): string {
    const names: string[] = [];
    const times = [0, 0, 90, 180, 210, 270, 270, 330, 330, 330];
    void times;
    const map: [string, number, number][] = [
      ['轻型', 1, 0], ['侦察', 1, 0], ['炮手', 1, 90], ['迫击', 2, 180], ['自爆', 1, 210],
      ['重装', 2, 270], ['狙击', 3, 270], ['布雷', 4, 270], ['护卫', 3, 330], ['召唤', 4, 330],
    ];
    for (const [name, th, at] of map) {
      if (threat >= th) names.push(`${name}${at > 0 ? `(${Math.floor(at / 60)}:00)` : ''}`);
    }
    return names.join(' · ');
  }

  private drawEvolution(
    g: CanvasRenderingContext2D,
    view: { tankId: string; page: number },
    time: number,
  ): void {
    const tank = TANKS.find((t) => t.id === view.tankId);
    if (!tank) return;
    g.fillStyle = 'rgba(11,14,16,0.94)';
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.fillStyle = COLORS.textBright;
    g.font = '22px monospace';
    g.fillText(`${tank.name} · 进化线`, W / 2, 48);
    g.fillStyle = COLORS.textDim;
    g.font = '11px monospace';
    g.fillText('← → 翻页 · A 关闭', W / 2, 72);

    const labels = ['原型 Lv1', '定型 Lv4', '精工 Lv8', '王牌 Lv12'];
    const cw = 210;
    const gx = (W - 4 * cw) / 2 + cw / 2;
    for (let i = 0; i < 4; i += 1) {
      const x = gx + i * cw - cw / 2;
      const y = 100;
      const unlocked = levelOf(this.progress!, tank.id) >= [1, 4, 8, 12][i]!;
      g.fillStyle = i === view.page ? 'rgba(242,177,60,0.14)' : 'rgba(26,34,40,0.7)';
      roundRect(g, x, y, cw - 10, 200, 4);
      g.fill();
      g.strokeStyle = i === view.page ? COLORS.p1 : unlocked ? COLORS.grid : 'rgba(106,106,122,0.4)';
      g.lineWidth = i === view.page ? 2 : 1;
      g.stroke();

      g.save();
      if (!unlocked) g.globalAlpha = 0.4;
      drawTank(g, x + (cw - 10) / 2, y + 80, -Math.PI / 2, 30, {
        body: tank.body, light: tank.light, tread: COLORS.tread, glow: tank.glow,
      }, (i + 1) as 1 | 2 | 3 | 4, tank.id, { t: time, moving: false, speed: 0 });
      g.restore();

      g.textAlign = 'center';
      g.fillStyle = unlocked ? COLORS.textBright : COLORS.textDim;
      g.font = '13px monospace';
      g.fillText(labels[i]!, x + (cw - 10) / 2, y + 140);
      g.fillStyle = COLORS.textDim;
      g.font = '10px monospace';
      const sigLine = [
        '基础形态',
        '挡泥板 + 炮口制退器',
        '加固环 + 铆钉 + 排气 + 天线',
        '发光描边 + 专属动效',
      ][i]!;
      g.fillText(sigLine, x + (cw - 10) / 2, y + 162);
      g.fillStyle = i <= view.page ? COLORS.heal : COLORS.textDim;
      g.fillText(unlocked ? '已解锁' : '未解锁', x + (cw - 10) / 2, y + 182);
    }

    // 签名四阶
    const sigLines = [
      `${tank.signatureName} Ⅰ：${tank.signatureDesc}`,
      `${tank.signatureName} Ⅱ：Lv6 解锁`,
      `${tank.signatureName} Ⅲ：Lv10 解锁`,
      `${tank.signatureName} Ⅳ：Lv14 解锁（质变）`,
    ];
    g.textAlign = 'left';
    g.fillStyle = COLORS.text;
    g.font = '12px monospace';
    for (let i = 0; i < sigLines.length; i += 1) {
      g.fillText(sigLines[i]!, 40, 340 + i * 22);
    }
  }

  // ---- 暂停 ----

  private drawPause(g: CanvasRenderingContext2D, game: Game | null): void {
    g.save();
    g.fillStyle = 'rgba(11,14,16,0.78)';
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = COLORS.textDim;
    g.font = '12px monospace';
    g.fillText('PAUSED', W / 2, 156);
    g.fillStyle = COLORS.textBright;
    g.font = '40px monospace';
    g.fillText('暂停', W / 2, 192);

    const items = ['继续战斗', '重开', '返回机库', '退出到货架'];
    for (let i = 0; i < items.length; i += 1) {
      const y = 254 + i * 44;
      const on = this.focus === i;
      g.fillStyle = on ? 'rgba(242,177,60,0.16)' : 'transparent';
      roundRect(g, W / 2 - 150, y - 18, 300, 36, 4);
      g.fill();
      if (on) {
        g.strokeStyle = COLORS.p1;
        g.lineWidth = 2;
        g.stroke();
      }
      g.fillStyle = on ? COLORS.p1 : COLORS.text;
      g.font = on ? '18px monospace' : '16px monospace';
      g.fillText(items[i]!, W / 2, y);
    }
    g.fillStyle = COLORS.textDim;
    g.font = '11px monospace';
    g.fillText('↑↓ 选择 · A 确认 · Start / B 继续', W / 2, 440);
    if (game) {
      g.fillText(`第 ${game.waveIndex} 波 · 击毁 ${game.kills} · 存活 ${formatTime(game.time)}`, W / 2, 466);
    }
    g.restore();
  }

  // ---- 升级选卡 ----

  private drawLevelup(g: CanvasRenderingContext2D, game: Game): void {
    const offers = game.offers;
    if (offers.length === 0) return;
    g.save();
    g.fillStyle = 'rgba(11,14,16,0.78)';
    g.fillRect(0, 0, W, H);

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = COLORS.textDim;
    g.font = '11px monospace';
    g.fillText('FIELD PROMOTION', W / 2, 56);
    g.fillStyle = COLORS.textBright;
    g.font = '26px monospace';
    g.fillText(`升级 ${game.level}`, W / 2, 84);
    g.fillStyle = COLORS.text;
    g.font = '11px monospace';
    g.fillText('同一张卡拿 3 次：第 3 次选质变方向', W / 2, 106);

    const cw = 252;
    const chm = 302;
    const rowLeft = (W - offers.length * cw) / 2;
    for (let i = 0; i < offers.length; i += 1) {
      const o = offers[i]!;
      const c = o.card;
      const x = rowLeft + cw / 2 + i * cw;
      const y = 120;
      const on = this.focus === i;
      const rc = RARITY_COLORS[c.rarity];
      const left = x - cw / 2 + 8;
      const inner = cw - 16;
      const isEvolve = o.evolves.length > 0;

      g.fillStyle = on ? 'rgba(26,34,40,0.98)' : 'rgba(18,24,28,0.94)';
      roundRect(g, left, y, inner, chm, 6);
      g.fill();
      g.strokeStyle = on ? rc : COLORS.grid;
      g.lineWidth = on ? 3 : 1;
      g.stroke();

      // 稀有度色条
      g.fillStyle = rc;
      g.globalAlpha = on ? 1 : 0.72;
      roundRect(g, left, y, inner, 5, 3);
      g.fill();
      g.globalAlpha = 1;

      // 类别 + 稀有度
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.font = '10px monospace';
      g.fillStyle = KIND_COLORS[c.kind];
      g.fillText(`${KIND_NAMES[c.kind]} · ${RARITY_NAMES[c.rarity]}`, left + 12, y + 23);

      // 等级点
      g.textAlign = 'right';
      g.fillStyle = COLORS.textDim;
      for (let k = 0; k < c.steps.length; k += 1) {
        const px = left + inner - 12 - (c.steps.length - 1 - k) * 9;
        g.fillStyle = k < o.nextLevel ? rc : COLORS.grid;
        g.beginPath();
        g.arc(px, y + 23, 2.8, 0, Math.PI * 2);
        g.fill();
      }

      // 名字
      g.textAlign = 'center';
      g.fillStyle = COLORS.textBright;
      g.font = '22px monospace';
      g.fillText(c.name, x, y + 54);

      if (isEvolve) {
        g.fillStyle = COLORS.p1;
        g.font = '11px monospace';
        g.fillText('满级 · 选一个质变', x, y + 80);
        g.fillStyle = COLORS.textDim;
        g.font = '10px monospace';
        g.fillText('↑ ↓ 切换', x, y + 96);

        for (let e = 0; e < o.evolves.length; e += 1) {
          const ev = o.evolves[e]!;
          const by = y + 108 + e * 88;
          const sel = on && this.branchFocus === e;
          g.fillStyle = sel ? 'rgba(242,177,60,0.14)' : 'rgba(255,255,255,0.035)';
          roundRect(g, left + 14, by, inner - 28, 80, 5);
          g.fill();
          g.strokeStyle = sel ? COLORS.p1 : COLORS.grid;
          g.lineWidth = sel ? 2 : 1;
          g.stroke();
          g.textAlign = 'left';
          g.fillStyle = sel ? COLORS.p1Light : COLORS.textBright;
          g.font = '14px monospace';
          g.fillText(ev.name, left + 26, by + 18);
          g.fillStyle = COLORS.text;
          g.font = '10px monospace';
          const lines = wrap(ev.desc, 20);
          for (let l = 0; l < lines.length && l < 4; l += 1) {
            g.fillText(lines[l]!, left + 26, by + 36 + l * 13);
          }
        }
      } else {
        g.fillStyle = COLORS.textBright;
        g.font = '13px monospace';
        const lines = wrap(c.steps[Math.min(o.nextLevel, c.steps.length) - 1]!.desc, 17);
        const startY = y + 150 - (lines.length * 19) / 2;
        for (let l = 0; l < lines.length && l < 6; l += 1) {
          g.fillText(lines[l]!, x, startY + l * 19);
        }
      }

      g.textAlign = 'center';
      g.fillStyle = on ? rc : COLORS.textDim;
      g.font = '11px monospace';
      g.fillText(`${i + 1} · A`, x, y + chm - 14);
    }

    // 重选按钮
    const hasReroll = game.rerollsLeft > 0;
    const bw = 128;
    const bh = 34;
    const bx = W - bw - 18;
    const by = 28;
    g.fillStyle = hasReroll ? 'rgba(26,34,40,0.96)' : 'rgba(18,24,28,0.8)';
    roundRect(g, bx, by, bw, bh, 5);
    g.fill();
    g.strokeStyle = hasReroll ? COLORS.p1 : COLORS.grid;
    g.lineWidth = hasReroll ? 1.5 : 1;
    g.stroke();
    g.textAlign = 'left';
    g.fillStyle = hasReroll ? COLORS.textBright : COLORS.textDim;
    g.font = '12px monospace';
    g.fillText(`重选 ×${game.rerollsLeft}`, bx + 12, by + bh / 2 - 1);
    g.fillStyle = hasReroll ? COLORS.p1 : COLORS.textDim;
    g.font = '10px monospace';
    g.fillText('Q / Y', bx + 84, by + bh / 2 - 1);

    g.textAlign = 'center';
    g.fillStyle = COLORS.textDim;
    g.font = '11px monospace';
    g.fillText('← → 选卡 · ↑ ↓ 选方向 · A 确认 · 1 2 3 直选', W / 2, 456);
    g.restore();
  }

  // ---- 结算 ----

  private drawResult(g: CanvasRenderingContext2D): void {
    const r = this.result;
    if (!r) return;
    g.save();
    g.fillStyle = 'rgba(11,14,16,0.88)';
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    g.fillStyle = r.win ? COLORS.heal : COLORS.bomber;
    g.font = '12px monospace';
    g.fillText(r.win ? 'MISSION COMPLETE' : 'MISSION FAILED', W / 2, 116);
    g.fillStyle = COLORS.textBright;
    g.font = '42px monospace';
    g.fillText(r.win ? '要塞已摧毁' : '全员阵亡', W / 2, 158);
    g.fillStyle = COLORS.text;
    g.font = '13px monospace';
    g.fillText(r.win ? '八分钟，你把整条战线推平了。' : '再试一次，这次先活下来。', W / 2, 192);

    const cells: [string, string][] = [
      [formatTime(r.time), '存活时间'],
      [String(r.kills), '击毁'],
      [String(r.level), '等级'],
      [String(r.score), '得分'],
    ];
    const cw = 150;
    const gx = (W - cells.length * cw) / 2 + cw / 2;
    for (let i = 0; i < cells.length; i += 1) {
      const x = gx + i * cw - cw / 2;
      g.fillStyle = 'rgba(26,34,40,0.8)';
      roundRect(g, x - 66, 226, 132, 82, 4);
      g.fill();
      g.fillStyle = COLORS.textBright;
      g.font = '30px monospace';
      g.fillText(cells[i]![0], x, 256);
      g.fillStyle = COLORS.textDim;
      g.font = '11px monospace';
      g.fillText(cells[i]![1], x, 290);
    }

    // 废铁
    g.fillStyle = COLORS.p1;
    g.font = '20px monospace';
    g.fillText(`废铁 +${r.scrap}`, W / 2, 338);
    g.fillStyle = COLORS.textDim;
    g.font = '11px monospace';
    g.fillText(
      this.progress ? `余额 ${Math.floor(this.progress.scrap)} · 击毁 ${r.perPlayer.map((n) => n).join(' / ')}` : '',
      W / 2,
      362,
    );
    if (this.progress?.cheated) {
      g.fillStyle = COLORS.scout;
      g.fillText('本局用过金手指 · 数值非原版', W / 2, 384);
    }

    const items = ['再来一局', '返回机库', '退出到货架'];
    for (let i = 0; i < items.length; i += 1) {
      const y = 420 + i * 34;
      const on = this.focus === i;
      g.fillStyle = on ? COLORS.p1 : COLORS.text;
      g.font = on ? '17px monospace' : '15px monospace';
      g.fillText((on ? '▶ ' : '   ') + items[i]!, W / 2, y);
    }
    g.fillStyle = COLORS.textDim;
    g.font = '11px monospace';
    g.fillText('↑↓ 选择 · A 确认 · B 返回机库', W / 2, 524);
    g.restore();
  }

  private drawToast(g: CanvasRenderingContext2D): void {
    if (this.toastTime <= 0 || !this.toastText) return;
    g.save();
    g.globalAlpha = Math.min(1, this.toastTime * 1.8);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '16px monospace';
    const tw = g.measureText(this.toastText).width + 36;
    const y = 100;
    g.fillStyle = 'rgba(11,14,16,0.8)';
    roundRect(g, W / 2 - tw / 2, y - 17, tw, 34, 4);
    g.fill();
    g.fillStyle = COLORS.p1;
    g.fillText(this.toastText, W / 2, y);
    g.restore();
  }

  private drawVignette(g: CanvasRenderingContext2D): void {
    const grad = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
    grad.addColorStop(0, 'rgba(11,14,16,0)');
    grad.addColorStop(1, 'rgba(11,14,16,0.75)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }

  private rigViewports(): { x: number; y: number; w: number; h: number }[] {
    if (this.twoPlayer && this.rigSplit) {
      return [
        { x: 0, y: 0, w: W / 2, h: H },
        { x: W / 2, y: 0, w: W / 2, h: H },
      ];
    }
    return [{ x: 0, y: 0, w: W, h: H }];
  }

  /** 由 main 每帧写入：当前是否分屏，决定 HUD 布局。 */
  rigSplit = false;
}

// ===================================================================
// 辅助
// ===================================================================

function inp(hub: InputHub, a: Parameters<InputHub['has']>[0]): boolean {
  return hub.has(a);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}

/** 按字符数折行（等宽字体，够用）。 */
function wrap(text: string, perLine: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ch === '，' || ch === '。' || ch === '；') {
      line += ch;
      out.push(line);
      line = '';
      continue;
    }
    line += ch;
    if (line.length >= perLine) {
      out.push(line);
      line = '';
    }
  }
  if (line) out.push(line);
  return out.slice(0, 5);
}

function buyFail(tankId: string, r: { ok: boolean; reason?: string; short?: number }): string {
  if (r.reason === 'scrap') return `废铁不足 · 差 ${r.short}`;
  if (r.reason === 'needClear') return '需要通关一次';
  const t = TANKS.find((x) => x.id === tankId);
  return r.reason === 'owned' ? '已拥有' : `不可购买 · ${t?.name ?? tankId}`;
}

function skinName(p: Progress, tankId: string): string {
  const id = p.tanks[tankId]?.skin ?? 'factory';
  return SKINS.find((s) => s.id === id)?.name ?? '出厂';
}

function levelScaleOf(p: Progress, tankId: string): number {
  const lvl = levelOf(p, tankId);
  for (let i = 0; i < CONFIG.decalLevels.length; i += 1) {
    // 括号必须：`lvl < X ?? 999` 会被解析成 `(lvl < X) ?? 999`
    if (lvl < (CONFIG.decalLevels[i + 1] ?? 999)) return i + 1;
  }
  return 4;
}

/** 底盘预览：走 stats 的同一套公式，保证机库与游戏里数字一致。 */
function chassisPreview(tank: (typeof TANKS)[number]): { maxHp: number; dmg: number; speed: number; armor: string; interval: string } {
  const st = chassisOfPreview(tank, 1);
  return { maxHp: Math.round(st.maxHp), dmg: Math.round(st.dmg), speed: Math.round(st.speed), armor: (st.armor * 100).toFixed(0), interval: st.interval.toFixed(3) };
}

function nextChassisPreview(tank: (typeof TANKS)[number], level: number) {
  const a = chassisOfPreview(tank, level);
  const b = chassisOfPreview(tank, level + 1);
  if (a.maxHp === b.maxHp && a.dmg === b.dmg && a.speed === b.speed) return null;
  return {
    maxHp: Math.round(b.maxHp),
    dmg: Math.round(b.dmg),
    speed: Math.round(b.speed),
    interval: b.interval.toFixed(3),
  };
}

function chassisOfPreview(tank: (typeof TANKS)[number], level: number) {
  const base = chassisOf(tank);
  const sc = levelScale(level);
  return {
    maxHp: base.maxHp * sc.hp,
    dmg: base.dmg * sc.dmg,
    speed: base.speed * sc.speed,
    armor: Math.min(0.15, base.armor + sc.armor),
    interval: base.interval / sc.rof,
  };
}

/** 地图缩略预览：只画地形特征，不追求精确。 */
function drawTerrainPreview(
  g: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  g.save();
  g.globalAlpha = 0.85;
  if (id === 'jungle') {
    g.fillStyle = '#4a7a2f';
    for (let i = 0; i < 9; i += 1) {
      const px = x + 8 + ((i * 37) % (w - 20));
      const py = y + 8 + ((i * 53) % (h - 18));
      g.fillRect(px, py, 12, 9);
    }
  } else if (id === 'tundra') {
    g.fillStyle = '#1b3040';
    for (let i = 0; i < 4; i += 1) {
      g.beginPath();
      g.ellipse(x + 24 + i * 34, y + h * (i % 2 ? 0.35 : 0.66), 18, 11, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else if (id === 'delta') {
    g.fillStyle = '#1a4a5c';
    g.fillRect(x, y + h * 0.4, w, h * 0.26);
    g.fillStyle = '#7a6242';
    for (const bx of [0.25, 0.5, 0.75]) g.fillRect(x + w * bx - 3, y + h * 0.34, 6, h * 0.38);
  } else if (id === 'ruins') {
    g.fillStyle = '#43435a';
    for (let i = 0; i < 7; i += 1) {
      const px = x + 6 + ((i * 41) % (w - 16));
      const py = y + 6 + ((i * 29) % (h - 14));
      g.fillRect(px, py, 20, 4);
      g.fillRect(px + 6, py + 8, 4, 14);
    }
  } else {
    g.fillStyle = '#8a5c3a';
    for (let i = 0; i < 10; i += 1) {
      const px = x + 8 + ((i * 47) % (w - 22));
      const py = y + 8 + ((i * 31) % (h - 22));
      g.fillRect(px, py, 10, 7);
    }
  }
  g.restore();
}
