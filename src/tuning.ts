import type { GameContext } from '@hearthbox/sdk';

/**
 * 可调量。
 *
 * 三层的分工（见平台 docs/tuning.md）：
 *   config.ts  常量      分辨率、颜色、体积      永不变
 *   tuning.ts  可调量    速度、经验、出怪        金手指/难度会改
 *   main.ts    逻辑      只读 tuning，不碰数字
 *
 * 每个函数都是"给定基础值，返回调整后的值"。这个签名是刻意的：
 * 金手指只是其中一种调整，难度、坦克天赋、关卡修正都能套进来，调用点不用改。
 */
export interface Tuning {
  /** 玩家移动速度。 */
  moveSpeed: (base: number) => number;
  /** 开火间隔（越小越快）。 */
  fireInterval: (base: number) => number;
  /** 升级所需经验。 */
  xpNeed: (level: number) => number;
  /** 刷怪速率。 */
  spawnRate: (base: number) => number;
  /** 升级卡池的品质权重。 */
  offerQuality: (base: number) => number;
}

/** 未经任何调整的原版数值。 */
export const baseline: Tuning = {
  moveSpeed: (base) => base,
  fireInterval: (base) => base,
  // 14 + 10L + L^2.1：通关拿 12 张卡，必须放弃 3 条流派（docs/cards.md 第 1 节）
  xpNeed: (level) => Math.round(14 + 10 * level + Math.pow(level, 2.1)),
  spawnRate: (base) => base,
  offerQuality: (base) => base,
};

/**
 * 声明全部可调项。
 *
 * 金手指用 ctx.cheats（语义上就是 scope: cheat），设置与成就用 ctx.options
 * 加 scope。分成两套调用只是因为 ctx.cheats 读起来更清楚，底层是同一个 store。
 */
export function declareOptions(ctx: GameContext): void {
  // ---- 金手指 ----
  ctx.cheats.declare({
    id: 'move-speed',
    name: '移动速度',
    description: '玩家移动速度倍率。',
    kind: 'number',
    min: 1,
    max: 3,
    step: 0.25,
    defaultValue: 1,
    unit: '×',
  });

  ctx.cheats.declare({
    id: 'fire-rate',
    name: '射速倍率',
    description: '开火间隔的倒数倍率。',
    kind: 'number',
    min: 1,
    max: 3,
    step: 0.25,
    defaultValue: 1,
    unit: '×',
  });

  ctx.cheats.declare({
    id: 'xp-rate',
    name: '经验倍率',
    description: '每颗经验球给的经验倍率。',
    kind: 'number',
    min: 1,
    max: 5,
    step: 0.5,
    defaultValue: 1,
    unit: '×',
  });

  ctx.cheats.declare({
    id: 'spawn-rate',
    name: '出怪速度',
    description: '越小出怪越慢。0.2 表示只有原版的五分之一。',
    kind: 'number',
    min: 0.2,
    max: 2,
    step: 0.1,
    defaultValue: 1,
    unit: '×',
  });

  ctx.cheats.declare({
    id: 'god-mode',
    name: '无敌',
    description: '不受伤害。',
    severity: 'destructive',
  });

  ctx.cheats.declare({
    id: 'inf-bombs',
    name: '无限炸弹',
    description: '炸弹数量不减少。',
  });

  // ---- 设置 ----
  ctx.options.declare({
    id: 'screen-shake',
    name: '屏幕震动',
    kind: 'choice',
    scope: 'setting',
    defaultValue: 'strong',
    choices: [
      { value: 'strong', label: '强' },
      { value: 'weak', label: '弱' },
      { value: 'off', label: '关' },
    ],
  });

  ctx.options.declare({
    id: 'damage-numbers',
    name: '伤害数字',
    kind: 'boolean',
    scope: 'setting',
    defaultEnabled: true,
  });

  ctx.options.declare({
    id: 'auto-aim',
    name: '自动瞄准',
    description: '键盘玩家靠它锁敌；关掉后只能朝正前方开火。',
    kind: 'boolean',
    scope: 'setting',
    defaultEnabled: true,
  });

  ctx.options.declare({
    id: 'aim-assist',
    name: '瞄准辅助强度',
    kind: 'number',
    scope: 'setting',
    min: 0,
    max: 1,
    step: 0.1,
    defaultValue: 0.6,
  });

  ctx.options.declare({
    id: 'split-mode',
    name: '双人分屏',
    description: '自动：两人拉开时分屏。',
    kind: 'choice',
    scope: 'setting',
    defaultValue: 'auto',
    choices: [
      { value: 'auto', label: '自动' },
      { value: 'never', label: '始终合屏' },
      { value: 'always', label: '始终分屏' },
    ],
  });

  // ---- 成就与统计 ----
  // 平台当前只能"声明时取一次值"，会话内不刷新（docs/systems.md 已记录）。
  const progress = ctx.storage.get<{
    bestTime?: number;
    bestScore?: number;
    bestKills?: number;
    bestLevel?: number;
    clears?: number;
    tanks?: Record<string, { level: number }>;
  }>('progress');
  const stats = ctx.storage.get<{ kills?: number }>('stats');

  const tanksOwned = progress?.tanks ? Object.keys(progress.tanks).length : 0;

  ctx.options.declare({
    id: 'best-time',
    name: '最高存活',
    kind: 'choice',
    scope: 'status',
    defaultValue: 'none',
    choices: [{ value: 'none', label: formatTime(progress?.bestTime ?? 0) }],
  });

  ctx.options.declare({
    id: 'best-score',
    name: '最高得分',
    kind: 'choice',
    scope: 'status',
    defaultValue: 'none',
    choices: [{ value: 'none', label: String(progress?.bestScore ?? 0) }],
  });

  ctx.options.declare({
    id: 'best-kills',
    name: '单局最多击毁',
    kind: 'choice',
    scope: 'status',
    defaultValue: 'none',
    choices: [{ value: 'none', label: String(progress?.bestKills ?? 0) }],
  });

  ctx.options.declare({
    id: 'best-level',
    name: '最高等级',
    kind: 'choice',
    scope: 'status',
    defaultValue: 'none',
    choices: [{ value: 'none', label: String(progress?.bestLevel ?? 0) }],
  });

  ctx.options.declare({
    id: 'clears',
    name: '通关次数',
    kind: 'choice',
    scope: 'status',
    defaultValue: 'none',
    choices: [{ value: 'none', label: String(progress?.clears ?? 0) }],
  });

  ctx.options.declare({
    id: 'total-kills',
    name: '累计击毁',
    kind: 'choice',
    scope: 'status',
    defaultValue: 'none',
    choices: [{ value: 'none', label: String(stats?.kills ?? 0) }],
  });

  ctx.options.declare({
    id: 'tanks-owned',
    name: '已收集坦克',
    kind: 'choice',
    scope: 'status',
    defaultValue: 'none',
    choices: [{ value: 'none', label: `${tanksOwned} / 8` }],
  });
}

/** 把金手指接到 baseline 上。只有这里知道"哪个金手指改哪个数值"。 */
export function resolveTuning(ctx: GameContext): Tuning {
  const cheats = ctx.cheats;
  return {
    moveSpeed: (base) => baseline.moveSpeed(base) * cheats.value('move-speed'),
    fireInterval: (base) => baseline.fireInterval(base) / cheats.value('fire-rate'),
    // 经验倍率是"给得更多"，所以是除以需求，而不是乘经验。
    xpNeed: (level) => baseline.xpNeed(level) / cheats.value('xp-rate'),
    spawnRate: (base) => baseline.spawnRate(base) * cheats.value('spawn-rate'),
    offerQuality: (base) => baseline.offerQuality(base),
  };
}

/** mm:ss */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
