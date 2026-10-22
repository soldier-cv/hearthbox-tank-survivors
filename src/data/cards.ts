/**
 * 25 张技能卡（docs/cards.md）。
 *
 * 卡的效果用"加值 / 乘值 / 标记"三种修饰表达，逻辑层只累加，不认具体卡 id。
 * 终极卡受三条红线约束：收益由操作触发、增量 ≤ 参照 DPS 的 35%、有场景上限。
 */

import { SCHOOL_COLORS, SCHOOL_NAMES, type School } from '../config';

/** 加性修饰（伤害、数量、半径…累加）。 */
export interface Add {
  dmg?: number;
  projectiles?: number;
  pierce?: number;
  bulletSpeed?: number;
  range?: number;
  blastRadius?: number;
  puddleDps?: number;
  chainTargets?: number;
  drones?: number;
  teslaChain?: number;
  mines?: number;
  maxHp?: number;
  armorFlat?: number;
  regen?: number;
  shieldMax?: number;
  critAdd?: number;
  critMulAdd?: number;
  pickup?: number;
  xpGain?: number;
  spread?: number;
  railgun?: number;
  radial?: number;
  nova?: number;
  chainBlast?: number;
}

/** 乘性修饰（间隔、速度…相乘）。 */
export interface Mul {
  interval?: number;
  speed?: number;
  dashCd?: number;
  shieldRecharge?: number;
  mineCd?: number;
  teslaCd?: number;
  droneCd?: number;
  falloff?: number;
  blastRadius?: number;
  wallDmg?: number;
  chainDmg?: number;
  droneDmg?: number;
  mineDmg?: number;
  teslaDmg?: number;
}

/** 标记：改变行为，不只是数值。 */
export type Flag =
  | 'noSpread'
  | 'lockCrit'
  | 'heavyShot'
  | 'decoy'
  | 'dashBurst'
  | 'slowChain'
  | 'markBonus'
  | 'swarmStrike'
  | 'focusFire'
  | 'doubleBlast'
  | 'chainEliteImmune'
  | 'railWall';

export interface CardDef {
  id: string;
  school: School;
  /** 1..4 为普通级，5 为终极。 */
  level: number;
  name: string;
  desc: string;
  add?: Add;
  mul?: Mul;
  flags?: Flag[];
}

export const CARDS: CardDef[] = [
  // ---- 火力 ----
  {
    id: 'fire-1',
    school: 'fire',
    level: 1,
    name: '主炮校准',
    desc: '伤害 +5，射速 +9%。',
    add: { dmg: 5 },
    mul: { interval: 1 / 1.09 },
  },
  {
    id: 'fire-2',
    school: 'fire',
    level: 2,
    name: '双联装',
    desc: '并联多一发炮弹，散布 ±4°。',
    add: { projectiles: 1, spread: 4 },
  },
  {
    id: 'fire-3',
    school: 'fire',
    level: 3,
    name: '稳压装填',
    desc: '伤害 +6，射速再 +11%。',
    add: { dmg: 6 },
    mul: { interval: 1 / 1.11 },
  },
  {
    id: 'fire-4',
    school: 'fire',
    level: 4,
    name: '四联装',
    desc: '再并联两发（总 4），散布 ±9°。',
    add: { projectiles: 2, spread: 5 },
  },
  {
    id: 'fire-x',
    school: 'fire',
    level: 5,
    name: '饱和打击',
    desc: '静止蓄力 1.2s 后的那一发变成全向 12 发。',
    add: { radial: 12 },
    flags: ['noSpread'],
  },

  // ---- 穿透 ----
  {
    id: 'pierce-1',
    school: 'pierce',
    level: 1,
    name: '穿甲弹芯',
    desc: '穿透 +1，弹速 +70，伤害 +2。',
    add: { pierce: 1, bulletSpeed: 70, dmg: 2 },
  },
  {
    id: 'pierce-2',
    school: 'pierce',
    level: 2,
    name: '硬化弹体',
    desc: '穿透 +1，对砖墙与残楼 ×1.5。',
    add: { pierce: 1 },
    mul: { wallDmg: 1.5 },
  },
  {
    id: 'pierce-3',
    school: 'pierce',
    level: 3,
    name: '贯穿引信',
    desc: '穿透 +1，穿透后伤害衰减从 30% 降到 15%。',
    add: { pierce: 1 },
    mul: { falloff: 0.85 / 0.7 },
  },
  {
    id: 'pierce-4',
    school: 'pierce',
    level: 4,
    name: '长杆弹',
    desc: '穿透 +2，暴击率 +5%。',
    add: { pierce: 2, critAdd: 0.05 },
  },
  {
    id: 'pierce-x',
    school: 'pierce',
    level: 5,
    name: '轨道炮',
    desc: '每 5s 蓄力一发：穿墙、贯穿 4 个目标、无衰减。',
    add: { railgun: 1 },
    flags: ['railWall'],
  },

  // ---- 爆破 ----
  {
    id: 'blast-1',
    school: 'blast',
    level: 1,
    name: '高爆装药',
    desc: '命中爆炸，半径 34，波及 60% 伤害。',
    add: { blastRadius: 34 },
  },
  {
    id: 'blast-2',
    school: 'blast',
    level: 2,
    name: '破片衬层',
    desc: '爆炸半径 +20，对砖墙 ×1.4。',
    add: { blastRadius: 20 },
    mul: { wallDmg: 1.4 },
  },
  {
    id: 'blast-3',
    school: 'blast',
    level: 3,
    name: '二次引爆',
    desc: '0.25s 后在原位再炸一次（半径 60%）。',
    flags: ['doubleBlast'],
  },
  {
    id: 'blast-4',
    school: 'blast',
    level: 4,
    name: '燃烧残留',
    desc: '爆炸留下 3s 火池，每秒 8 伤害。',
    add: { puddleDps: 8 },
  },
  {
    id: 'blast-x',
    school: 'blast',
    level: 5,
    name: '连锁反应',
    desc: '被爆炸击杀的敌人也爆炸：最多 3 层，逐层 ×0.6，精英不连锁。',
    add: { chainBlast: 3 },
    flags: ['chainEliteImmune'],
  },

  // ---- 自动化 ----
  {
    id: 'auto-1',
    school: 'auto',
    level: 1,
    name: '僚机',
    desc: '+1 架环绕无人机，自动索敌，伤害 = 主炮 ×0.55。',
    add: { drones: 1 },
    mul: { droneDmg: 0.55 },
  },
  {
    id: 'auto-2',
    school: 'auto',
    level: 2,
    name: '布雷器',
    desc: '每 2.4s 在车尾布一颗雷，伤害 = 主炮 ×1.6。',
    add: { mines: 1 },
    mul: { mineDmg: 1.6 },
  },
  {
    id: 'auto-3',
    school: 'auto',
    level: 3,
    name: '电磁链',
    desc: '每 2.8s 电击最近敌人，连锁 3 个，伤害 = 主炮 ×0.45。',
    add: { teslaChain: 3 },
    mul: { teslaDmg: 0.45 },
  },
  {
    id: 'auto-4',
    school: 'auto',
    level: 4,
    name: '弹幕协调',
    desc: '无人机 +1，地雷与电击冷却 ÷1.25。',
    add: { drones: 1 },
    mul: { mineCd: 1 / 1.25, teslaCd: 1 / 1.25 },
  },
  {
    id: 'auto-x',
    school: 'auto',
    level: 5,
    name: '蜂群指挥',
    desc: '无人机共 5 架，且集火玩家手动瞄准的目标。',
    add: { drones: 5 },
    flags: ['focusFire'],
  },

  // ---- 生存 ----
  {
    id: 'survive-1',
    school: 'survive',
    level: 1,
    name: '复合装甲',
    desc: '血上限 +18，受到的所有伤害 −1.5。',
    add: { maxHp: 18, armorFlat: 1.5 },
  },
  {
    id: 'survive-2',
    school: 'survive',
    level: 2,
    name: '强化引擎',
    desc: '移速 +8.5%，冲刺冷却 −15%。',
    mul: { speed: 1.085, dashCd: 0.85 },
  },
  {
    id: 'survive-3',
    school: 'survive',
    level: 3,
    name: '维修组',
    desc: '每秒恢复 0.85 点生命。',
    add: { regen: 0.85 },
  },
  {
    id: 'survive-4',
    school: 'survive',
    level: 4,
    name: '能量护盾',
    desc: '+1 层护盾，9.5s 自充。',
    add: { shieldMax: 1 },
  },
  {
    id: 'survive-x',
    school: 'survive',
    level: 5,
    name: '壁垒形态',
    desc: '血上限 +40，护盾 +2；护盾破碎时释放清屏冲击波。',
    add: { maxHp: 40, shieldMax: 2, nova: 1 },
  },
];

/** 空卡（卡池耗尽时的兜底）。 */
export const SUPPLY_CARD: CardDef = {
  id: 'supply',
  school: 'survive',
  level: 0,
  name: '战场补给',
  desc: '恢复 25 生命，补 1 枚炸弹。',
};

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(
  CARDS.map((c) => [c.id, c]),
);

/** 每流派的普通卡（1–4 级）与终极卡。 */
export function schoolCards(school: School): CardDef[] {
  return CARDS.filter((c) => c.school === school && c.level >= 1 && c.level <= 4);
}

export function schoolUltimate(school: School): CardDef {
  const u = CARDS.find((c) => c.school === school && c.level === 5);
  if (!u) throw new Error(`流派 ${school} 没有终极卡`);
  return u;
}

export { SCHOOL_COLORS, SCHOOL_NAMES };
