/**
 * 输入归一化（docs/port.md：输入抽象成"动作"，不直接读按键）。
 *
 * 逻辑层只读 ActionState，不认识 ctx.input，也不认识具体键位。
 * 这是"完全适配平台"的核心：Android 上换输入源，这里一行不改。
 */

import type { GameContext, PadState } from '@hearthbox/sdk';
import { CAMERA } from './config';

/** 动作。持续状态与边沿分开。 */
export type Action =
  | 'dash'
  | 'bomb'
  | 'reroll'
  | 'start'
  | 'menuUp'
  | 'menuDown'
  | 'menuLeft'
  | 'menuRight'
  | 'confirm'
  | 'back'
  | 'skinPrev'
  | 'skinNext'
  | 'tabPrev'
  | 'tabNext'
  | 'pick1'
  | 'pick2'
  | 'pick3';

export interface ActionState {
  /** 本帧刚按下（边沿）。 */
  readonly pressed: ReadonlySet<Action>;
  /** 按住（持续）。 */
  readonly held: ReadonlySet<Action>;
}

/**
 * 玩家动作。每帧由 InputHub.fill() 写入复用对象，不分配。
 */
export class PlayerInput {
  moveX = 0;
  moveY = 0;
  aimX = 0;
  aimY = 0;
  aimMag = 0;
  aiming = false;
  dash = false;
  bomb = false;
  /** 上一帧的按下状态，用于自己做边沿（炸弹与冲刺需要"按一次触发一次"）。 */
  private prevDash = false;
  private prevBomb = false;
  dashEdge = false;
  bombEdge = false;

  /** 读一个 PadState 进来。inMenu 时不产生冲刺/炸弹边沿，避免菜单里"确认"同时触发冲刺。 */
  read(pad: PadState, extraDashKey: boolean, extraBombKey: boolean, inMenu: boolean): void {
    this.moveX = pad.move.x;
    this.moveY = pad.move.y;

    this.aimX = pad.rx;
    this.aimY = pad.ry;
    this.aimMag = Math.hypot(pad.rx, pad.ry);
    this.aiming = this.aimMag > 0.3;

    const dash = !inMenu && (pad.held('south') || extraDashKey);
    const bomb = !inMenu && (pad.held('west') || pad.held('r1') || extraBombKey);

    this.dashEdge = dash && !this.prevDash;
    this.bombEdge = bomb && !this.prevBomb;
    this.dash = dash;
    this.bomb = bomb;
    this.prevDash = dash;
    this.prevBomb = bomb;
  }

  get aimAngle(): number {
    return Math.atan2(this.aimY, this.aimX);
  }
}

/**
 * 输入中枢。
 *
 * 注意"空格既是冲刺又是确认"：平台把 Space 映射到 south。
 * 所以这里不在同一帧里既读 keyboard.pressed('Space') 又读 p1.pressed('south')，
 * 而是由状态机决定 south 归谁 —— 菜单里 south 是确认，战斗中 south 是冲刺。
 */
export class InputHub {
  readonly p1 = new PlayerInput();
  readonly p2 = new PlayerInput();
  private readonly pressed = new Set<Action>();
  private readonly held = new Set<Action>();
  readonly view: ActionState = { pressed: this.pressed, held: this.held };

  /** 上一帧的菜单键状态（用于自己做边沿，避免依赖平台边沿的时机）。 */
  private prev: Record<string, boolean> = {};

  constructor(private readonly ctx: GameContext) {}

  /** 每帧 update 开头调用一次。 */
  sample(inMenu: boolean): void {
    this.pressed.clear();
    this.held.clear();

    const ctx = this.ctx;
    const kb = ctx.input.keyboard;
    const pads = ctx.input.players;

    // ---- 玩家动作：P1 用 players[0]，P2 用 players[1] ----
    this.p1.read(pads[0] ?? ctx.input.p1, kb.held('Space'), kb.held('ShiftLeft'), inMenu);
    this.p2.read(
      pads[1] ?? pads[0] ?? ctx.input.p1,
      kb.held('Enter') || kb.held('NumpadEnter'),
      kb.held('ShiftRight') || kb.held('Numpad0'),
      inMenu,
    );

    // ---- 菜单导航：south/east 在菜单里是确认与返回，不重复给动作 ----
    const edge = (key: string, now: boolean): boolean => {
      const was = this.prev[key] === true;
      this.prev[key] = now;
      return now && !was;
    };

    // 菜单导航只认 P1 的手柄与键盘 —— 否则第二只手柄会抢走菜单焦点。
    const nav = pads[0] ?? ctx.input.p1;
    const up = nav.pressed('up') || nav.ly < -0.7 || kb.pressed('ArrowUp') || kb.pressed('KeyW');
    const down = nav.pressed('down') || nav.ly > 0.7 || kb.pressed('ArrowDown') || kb.pressed('KeyS');
    const left = nav.pressed('left') || nav.lx < -0.7 || kb.pressed('ArrowLeft') || kb.pressed('KeyA');
    const right = nav.pressed('right') || nav.lx > 0.7 || kb.pressed('ArrowRight') || kb.pressed('KeyD');

    if (edge('up', up)) this.pressed.add('menuUp');
    if (edge('down', down)) this.pressed.add('menuDown');
    if (edge('left', left)) this.pressed.add('menuLeft');
    if (edge('right', right)) this.pressed.add('menuRight');

    // 确认/返回：任一已连接手柄都算 —— 双人选卡时"任一名玩家选择"。
    const confirm = inMenu
      ? this.padAny((p) => p.pressed('south')) || kb.pressed('Space') || kb.pressed('Enter') || kb.pressed('NumpadEnter')
      : false;
    if (edge('confirm', confirm)) this.pressed.add('confirm');

    const back = inMenu
      ? this.padAny((p) => p.pressed('east')) || kb.pressed('Escape') || kb.pressed('Backspace')
      : false;
    if (edge('back', back)) this.pressed.add('back');

    // ---- 全局键：任一玩家都能开暂停 ----
    const start = this.padAny((p) => p.pressed('start')) || kb.pressed('KeyP');
    if (edge('start', start)) this.pressed.add('start');

    // 战斗中 south 是冲刺（由 PlayerInput 处理），菜单中是 confirm（上面处理）。
    // 炸弹在战斗中外加 r1 / Shift；这里只给菜单用的快捷直选。
    if (edge('q1', kb.pressed('Digit1') || kb.pressed('Numpad1'))) this.pressed.add('pick1');
    if (edge('q2', kb.pressed('Digit2') || kb.pressed('Numpad2'))) this.pressed.add('pick2');
    if (edge('q3', kb.pressed('Digit3') || kb.pressed('Numpad3'))) this.pressed.add('pick3');

    // 菜单动作只认 P1 的手柄（重选、涂装、页签），避免第二只手柄抢焦点。
    const reroll = nav.pressed('north') || kb.pressed('KeyQ');
    if (edge('reroll', reroll)) this.pressed.add('reroll');

    if (edge('l1', nav.pressed('l1') || kb.pressed('KeyE'))) this.pressed.add('skinPrev');
    if (edge('r1menu', nav.pressed('r1') || kb.pressed('KeyR'))) this.pressed.add('skinNext');
    // 页签：L2/R2 扳机。不读 select —— 它与 start 组成平台保留的系统菜单组合键。
    if (edge('lt', nav.lt > 0.6)) this.pressed.add('tabPrev');
    if (edge('rt', nav.rt > 0.6)) this.pressed.add('tabNext');
  }

  /** 任一已连接手柄满足条件。 */
  private padAny(test: (p: PadState) => boolean): boolean {
    const pads = this.ctx.input.players;
    for (let i = 0; i < pads.length; i += 1) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      if (test(p)) return true;
    }
    return false;
  }

  /** P2 是否连了独立手柄（双人模式判定用）。 */
  get p2HasPad(): boolean {
    const p = this.ctx.input.players[1];
    return !!p && p.connected;
  }

  has(action: Action): boolean {
    return this.pressed.has(action);
  }

  /** 是否有人按了任意键（用于"按任意键开始"的解锁判断，平台已处理）。 */
  anyPressed(): boolean {
    return this.pressed.size > 0 || this.p1.dashEdge || this.p1.bombEdge;
  }

  /**
   * 瞄准辅助：把摇杆方向向最近目标偏一点。
   * assist = 0 时完全按玩家输入，= 1 时强吸附。
   */
  aimAssist(aim: PlayerInput, targetAngle: number | null, assist: number): number {
    const raw = aim.aiming ? aim.aimAngle : targetAngle ?? 0;
    if (!aim.aiming || targetAngle === null || assist <= 0) return raw;
    // 角差插值，保持方向连续
    let d = targetAngle - aim.aimAngle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return aim.aimAngle + d * Math.min(1, assist);
  }
}

/** 相机前瞻用的瞄准方向（玩家可能没手动瞄准，用炮塔朝向）。 */
export function lookAheadVector(aimAngle: number): { x: number; y: number } {
  return { x: Math.cos(aimAngle) * CAMERA.lookAhead, y: Math.sin(aimAngle) * CAMERA.lookAhead };
}
