/**
 * 敌人（docs/enemies.md）。
 *
 * 按角色分类，不按数值。每种都有至少一种有效打法、也都有废柴场景。
 * 只有接触伤害不给预警。
 */

import { COLORS } from '../config';

export type EnemyId =
  | 'grunt'
  | 'scout'
  | 'gunner'
  | 'mortar'
  | 'brute'
  | 'bomber'
  | 'sapper'
  | 'warden'
  | 'summoner'
  | 'marksman';

export type AttackKind = 'none' | 'direct' | 'lob' | 'explode' | 'mine' | 'aura' | 'summon' | 'charge';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  model: string;
  /** 出现的最早时间（秒），同时也是兵种池的门槛。 */
  fromTime: number;
  /** 出现的最低威胁等级。 */
  fromThreat: number;
  r: number;
  hp: number;
  speed: number;
  contact: number;
  attack: AttackKind;
  /** 攻击伤害 / 半径 / 冷却 / 射程。 */
  dmg: number;
  radius: number;
  cooldown: number;
  range: number;
  /** 预警时长（秒）。 */
  telegraph: number;
  xp: number;
  score: number;
  color: string;
  tread: string;
  /** 正面减伤（重装）。 */
  frontalReduction?: number;
  /** 能否渡深水。 */
  amphibious: boolean;
  /** 死亡时爆炸（自爆车）。 */
  explodeOnDeath?: number;
  /** 光环加成（护卫者）。 */
  auraBonus?: number;
  auraRadius?: number;
  /** 召唤内容（召唤器）。 */
  summons?: { id: EnemyId; count: number };
  /** 行为：贴近后保持距离（炮手 / 迫击 / 狙击）。 */
  standoff?: number;
  desc: string;
}

export const ENEMIES: EnemyDef[] = [
  {
    id: 'grunt',
    name: '轻型坦克',
    model: 'anvil',
    fromTime: 0,
    fromThreat: 1,
    r: 15,
    hp: 24,
    speed: 62,
    contact: 10,
    attack: 'none',
    dmg: 0,
    radius: 0,
    cooldown: 0,
    range: 0,
    telegraph: 0,
    xp: 1,
    score: 12,
    color: COLORS.enemy,
    tread: '#6f2419',
    amphibious: false,
    desc: '最便宜的那种保安装甲',
  },
  {
    id: 'scout',
    name: '侦察车',
    model: 'echo',
    fromTime: 0,
    fromThreat: 1,
    r: 12,
    hp: 16,
    speed: 118,
    contact: 8,
    attack: 'none',
    dmg: 0,
    radius: 0,
    cooldown: 0,
    range: 0,
    telegraph: 0,
    xp: 1,
    score: 14,
    color: COLORS.scout,
    tread: '#8a5a1c',
    amphibious: true,
    desc: '没有主炮，因为它跑得够快',
  },
  {
    id: 'gunner',
    name: '炮手',
    model: 'bastion',
    fromTime: 90,
    fromThreat: 1,
    r: 16,
    hp: 42,
    speed: 52,
    contact: 8,
    attack: 'direct',
    dmg: 9,
    radius: 0,
    cooldown: 2.4,
    range: 380,
    telegraph: 0.14,
    xp: 2,
    score: 22,
    color: COLORS.gunner,
    tread: '#5f3574',
    amphibious: false,
    standoff: 260,
    desc: '停在墙后，靠射程欺负人',
  },
  {
    id: 'mortar',
    name: '迫击车',
    model: 'furnace',
    fromTime: 180,
    fromThreat: 2,
    r: 17,
    hp: 46,
    speed: 46,
    contact: 8,
    attack: 'lob',
    dmg: 14,
    radius: 70,
    cooldown: 3.6,
    range: 520,
    telegraph: 1.2,
    xp: 3,
    score: 30,
    color: '#c9663c',
    tread: '#6f3a1c',
    amphibious: false,
    standoff: 320,
    desc: '落点画圈，一直移动就炸不到你',
  },
  {
    id: 'brute',
    name: '重装坦克',
    model: 'bastion',
    fromTime: 240,
    fromThreat: 2,
    r: 24,
    hp: 180,
    speed: 38,
    contact: 20,
    attack: 'none',
    dmg: 0,
    radius: 0,
    cooldown: 0,
    range: 0,
    telegraph: 0,
    xp: 4,
    score: 42,
    color: COLORS.brute,
    tread: '#4e241c',
    frontalReduction: 0.6,
    amphibious: false,
    desc: '设计目标是"不被击穿"，正面减伤 60%',
  },
  {
    id: 'bomber',
    name: '自爆车',
    model: 'echo',
    fromTime: 210,
    fromThreat: 1,
    r: 17,
    hp: 34,
    speed: 96,
    contact: 12,
    attack: 'explode',
    dmg: 26,
    radius: 90,
    cooldown: 0.5,
    range: 44,
    telegraph: 0.5,
    xp: 3,
    score: 30,
    color: COLORS.bomber,
    tread: '#7c1d12',
    amphibious: true,
    explodeOnDeath: 26,
    desc: '一次性，但它自己不知道',
  },
  {
    id: 'sapper',
    name: '布雷车',
    model: 'swarm',
    fromTime: 270,
    fromThreat: 4,
    r: 16,
    hp: 40,
    speed: 58,
    contact: 8,
    attack: 'mine',
    dmg: 12,
    radius: 60,
    cooldown: 2.8,
    range: 0,
    telegraph: 0,
    xp: 2,
    score: 26,
    color: '#b5893c',
    tread: '#5f4517',
    amphibious: false,
    desc: '在身后留下地雷',
  },
  {
    id: 'warden',
    name: '护卫者',
    model: 'arc',
    fromTime: 330,
    fromThreat: 3,
    r: 18,
    hp: 60,
    speed: 44,
    contact: 8,
    attack: 'aura',
    dmg: 0,
    radius: 240,
    cooldown: 0,
    range: 220,
    telegraph: 0,
    xp: 3,
    score: 34,
    color: '#4a9d8c',
    tread: '#1f5044',
    amphibious: false,
    auraBonus: 0.2,
    auraRadius: 240,
    standoff: 200,
    desc: '让周围的敌人更疼，优先点掉它',
  },
  {
    id: 'summoner',
    name: '召唤器',
    model: 'swarm',
    fromTime: 330,
    fromThreat: 4,
    r: 20,
    hp: 90,
    speed: 34,
    contact: 10,
    attack: 'summon',
    dmg: 0,
    radius: 0,
    cooldown: 6,
    range: 0,
    telegraph: 0.4,
    xp: 5,
    score: 50,
    color: '#8f6bd4',
    tread: '#4a2f7a',
    amphibious: false,
    summons: { id: 'grunt', count: 2 },
    standoff: 300,
    desc: '放着不管会滚雪球',
  },
  {
    id: 'marksman',
    name: '狙击手',
    model: 'lance',
    fromTime: 270,
    fromThreat: 3,
    r: 16,
    hp: 38,
    speed: 40,
    contact: 8,
    attack: 'charge',
    dmg: 22,
    radius: 0,
    cooldown: 4.2,
    range: 620,
    telegraph: 0.9,
    xp: 4,
    score: 44,
    color: '#d4b03c',
    tread: '#6f5617',
    amphibious: false,
    standoff: 440,
    desc: '蓄力贯穿，断视线就能躲',
  },
];

export const ENEMY_BY_ID: Record<EnemyId, EnemyDef> = Object.fromEntries(
  ENEMIES.map((e) => [e.id, e]),
) as Record<EnemyId, EnemyDef>;

/**
 * 精英词缀（docs/enemies.md 第 5 节）。
 *
 * 替换"精英 = 血量 ×4.2"那种粗暴做法：词缀改变打法，不只是更耐打。
 */
export type AffixId = 'armor' | 'swift' | 'volatile' | 'shielded' | 'commander';

export interface AffixDef {
  id: AffixId;
  name: string;
  desc: string;
  hp?: number;
  speed?: number;
  dmg?: number;
  /** 额外护盾比例（打掉后 5s 未受击回满）。 */
  shieldRatio?: number;
  /** 周围敌人伤害加成。 */
  aura?: number;
  color: string;
}

export const AFFIXES: AffixDef[] = [
  { id: 'armor', name: '装甲', desc: '血量翻倍，更慢', hp: 2.2, speed: 0.9, color: COLORS.textDim },
  { id: 'swift', name: '迅捷', desc: '更快更疼', speed: 1.45, dmg: 1.2, color: COLORS.scout },
  { id: 'volatile', name: '爆破', desc: '死亡时爆炸', color: COLORS.blast },
  { id: 'shielded', name: '护盾', desc: '额外护盾，未受击时回满', shieldRatio: 0.5, color: COLORS.p2 },
  { id: 'commander', name: '指挥官', desc: '周围敌人更疼，自身减伤', aura: 0.15, color: COLORS.drone },
];

export const AFFIX_BY_ID: Record<AffixId, AffixDef> = Object.fromEntries(
  AFFIXES.map((a) => [a.id, a]),
) as Record<AffixId, AffixDef>;

/**
 * 兵种投放表（docs/enemies.md 第 4 节 + docs/levels.md 第 1 节）。
 *
 * 按威胁等级决定随机权重：池子扩大，不是数值变大。
 */
export const ROLLS: Record<number, [EnemyId, number][]> = {
  0: [['grunt', 0.72], ['scout', 0.28]],
  90: [['grunt', 0.56], ['scout', 0.26], ['gunner', 0.18]],
  180: [['grunt', 0.44], ['scout', 0.22], ['gunner', 0.2], ['mortar', 0.14]],
  210: [['grunt', 0.4], ['scout', 0.2], ['gunner', 0.18], ['mortar', 0.12], ['bomber', 0.1]],
  270: [['grunt', 0.3], ['scout', 0.18], ['gunner', 0.16], ['mortar', 0.12], ['bomber', 0.1], ['brute', 0.14]],
  330: [['grunt', 0.24], ['scout', 0.16], ['gunner', 0.14], ['mortar', 0.12], ['bomber', 0.1], ['brute', 0.12], ['marksman', 0.12]],
};

/** 高威胁时额外加入的兵种权重（在 ROLLS 之上重新分配）。 */
export const THREAT_EXTRA: Record<number, Partial<Record<EnemyId, number>>> = {
  3: { sapper: 0.06, warden: 0.06, summoner: 0.04 },
  4: { sapper: 0.08, warden: 0.07, summoner: 0.05, marksman: 0.04 },
};

/**
 * 波次节点（docs/levels.md 第 2 节）。
 *
 * `spawns` 里的 null 表示"按当前兵种池随机"。
 */
export interface WaveNode {
  at: number;
  name: string;
  /** 编队形状。 */
  formation: 'ring' | 'column' | 'flank' | 'line' | 'hold' | 'quiet';
  count: number;
  /** 固定兵种，null = 随机。 */
  set?: Partial<Record<EnemyId, number>>;
  /** 高威胁时的替换（威胁 ≥ 该值时改用 elite 名单）。 */
  eliteFrom?: number;
  eliteSet?: Partial<Record<EnemyId, number>>;
  /** 静默期长度（quiet 阵型用）。 */
  quietFor?: number;
}

export const WAVES: WaveNode[] = [
  { at: 0, name: '开场包围', formation: 'ring', count: 6 },
  { at: 30, name: '装甲纵队', formation: 'column', count: 10 },
  { at: 60, name: '侧翼夹击', formation: 'flank', count: 6, set: { scout: 1 } },
  { at: 90, name: '炮手分队', formation: 'ring', count: 12, set: { gunner: 0.34, grunt: 0.66 } },
  { at: 120, name: '火力压制', formation: 'hold', count: 6, set: { gunner: 1 } },
  { at: 150, name: '精英推进', formation: 'column', count: 10, eliteFrom: 3, eliteSet: { brute: 1 } },
  { at: 180, name: '混合编队', formation: 'ring', count: 20 },
  { at: 210, name: '自爆冲锋', formation: 'line', count: 6, set: { bomber: 1 } },
  // 4:00 是 BOSS，见 BOSS_TIMES
  { at: 270, name: '焦土', formation: 'ring', count: 18 },
  { at: 300, name: '双线突击', formation: 'flank', count: 16 },
  { at: 330, name: '围剿', formation: 'ring', count: 20 },
  { at: 360, name: '最后抵抗', formation: 'ring', count: 24 },
  { at: 390, name: '静默', formation: 'quiet', count: 0, quietFor: 25 },
];

/** 补给时间点（docs/levels.md 第 5 节）。 */
export const SUPPLY_TIMES = [90, 180, 270, 360];

/** BOSS 时间（docs/levels.md 第 3 节）。 */
export const BOSS_FIRST = 240;
export const BOSS_FINAL = 420;
/** 常规刷怪停止时间。 */
export const SPAWN_STOP = 420;

export interface BossDef {
  id: 'bulwark' | 'fortress';
  name: string;
  at: number;
  r: number;
  hp: number;
  speed: number;
  contact: number;
  color: string;
  tread: string;
  /** 主攻击。 */
  cooldown: number;
  dmg: number;
  /** 扇形 / 环形。 */
  pattern: 'fan' | 'ring';
  shots: number;
  spread: number;
  bulletSpeed: number;
  /** 血量到该比例时进入二阶段。 */
  phase2At: number;
  /** 二阶段加速与召唤。 */
  phase2Speed?: number;
  summonEvery?: number;
  summonCount?: number;
  summons?: EnemyId;
  /** 召唤护卫的血量节点。 */
  escortAt?: number[];
  xp: number;
  score: number;
}

export const BOSSES: BossDef[] = [
  {
    id: 'bulwark',
    name: '铁壁',
    at: BOSS_FIRST,
    r: 36,
    hp: 2800,
    speed: 38,
    contact: 24,
    color: '#d9533f',
    tread: '#4d100c',
    cooldown: 2.3,
    dmg: 12,
    pattern: 'fan',
    shots: 3,
    spread: 0.26,
    bulletSpeed: 420,
    phase2At: 0.5,
    escortAt: [0.66, 0.33],
    xp: 30,
    score: 800,
  },
  {
    id: 'fortress',
    name: '终焉要塞 MK-II',
    at: BOSS_FINAL,
    r: 46,
    hp: 8200,
    speed: 30,
    contact: 34,
    color: '#b9362a',
    tread: '#230604',
    cooldown: 3.2,
    dmg: 12,
    pattern: 'ring',
    shots: 16,
    spread: Math.PI * 2,
    bulletSpeed: 360,
    phase2At: 0.55,
    phase2Speed: 37.5,
    summonEvery: 8,
    summonCount: 4,
    summons: 'bomber',
    xp: 60,
    score: 2500,
  },
];
