/**
 * 八台坦克（docs/tanks.md）。
 *
 * 点数顺序：生命 / 伤害 / 移速 / 防护 / 射速，**每台合计恒为 10**。
 * 形态由点数与武器决定，等级只放大尺度（docs/tank-levels.md 第 2 节）。
 */

import { COLORS, EXT_COLORS } from '../config';

export type StatPoint = 'hp' | 'dmg' | 'spd' | 'arm' | 'rof';

export type WeaponId = 'plain' | 'ap' | 'he' | 'arc' | 'scatter';
export type SignatureId = 'anvil' | 'echo' | 'bastion' | 'lance' | 'furnace' | 'arc' | 'swarm' | 'mk2';

export interface TankDef {
  id: string;
  code: string;
  name: string;
  /** T0–T3，只表示上手难度，不表示强度。 */
  tier: 0 | 1 | 2 | 3;
  points: Record<StatPoint, number>;
  weapon: WeaponId;
  signature: SignatureId;
  /** 能否渡深水（docs/maps.md 第 6 节）。 */
  amphibious: boolean;
  /** 解锁：废铁价格，或 'clear'（通关解锁）。 */
  unlock: number | 'clear';
  /** 默认涂装。 */
  body: string;
  light: string;
  glow: string;
  /** 一句话定位。 */
  role: string;
  signatureName: string;
  signatureDesc: string;
}

const T0_POINTS = { hp: 3, dmg: 3, spd: 2, arm: 1, rof: 1 };

export const TANKS: TankDef[] = [
  {
    id: 'anvil',
    code: 'ANVIL-01',
    name: '铁砧',
    tier: 0,
    points: T0_POINTS,
    weapon: 'plain',
    signature: 'anvil',
    amphibious: false,
    unlock: 0,
    body: COLORS.p1,
    light: COLORS.p1Light,
    glow: COLORS.p1Light,
    role: '均衡，新手默认',
    signatureName: '稳定炮座',
    signatureDesc: '连续静止后伤害提升',
  },
  {
    id: 'echo',
    code: 'ECHO-02',
    name: '回声',
    tier: 0,
    points: { hp: 2, dmg: 2, spd: 3, arm: 1, rof: 2 },
    weapon: 'plain',
    signature: 'echo',
    amphibious: true,
    unlock: 0,
    body: COLORS.p2,
    light: COLORS.p2Light,
    glow: COLORS.p2Light,
    role: '快、灵活、脆',
    signatureName: '轻量履带',
    signatureDesc: '冲刺更远，冲刺后射速提升',
  },
  {
    id: 'bastion',
    code: 'BASTION-03',
    name: '港湾',
    tier: 0,
    points: { hp: 4, dmg: 1, spd: 1, arm: 2, rof: 2 },
    weapon: 'plain',
    signature: 'bastion',
    amphibious: true,
    unlock: 0,
    body: '#a8b4bc',
    light: EXT_COLORS.arcticLight,
    glow: COLORS.p2Light,
    role: '肉盾，输出低',
    signatureName: '应急装甲',
    signatureDesc: '血量低时大幅减伤',
  },
  {
    id: 'lance',
    code: 'LANCE-04',
    name: '长矛',
    tier: 1,
    points: { hp: 1, dmg: 4, spd: 2, arm: 1, rof: 2 },
    weapon: 'ap',
    signature: 'lance',
    amphibious: false,
    unlock: 900,
    body: '#7ec8a0',
    light: '#d6f5e4',
    glow: COLORS.heal,
    role: '玻璃大炮，穿透',
    signatureName: '贯穿校射',
    signatureDesc: '每穿透一个目标，该发伤害累加',
  },
  {
    id: 'furnace',
    code: 'FURNACE-05',
    name: '熔炉',
    tier: 1,
    points: { hp: 2, dmg: 3, spd: 1, arm: 2, rof: 2 },
    weapon: 'he',
    signature: 'furnace',
    amphibious: false,
    unlock: 900,
    body: '#d9663c',
    light: '#ffc8a8',
    glow: COLORS.blast,
    role: '范围清场，慢',
    signatureName: '装药过量',
    signatureDesc: '爆炸半径提升，移速下降',
  },
  {
    id: 'arc',
    code: 'ARC-06',
    name: '电弧',
    tier: 2,
    points: { hp: 2, dmg: 2, spd: 2, arm: 1, rof: 3 },
    weapon: 'arc',
    signature: 'arc',
    amphibious: false,
    unlock: 2600,
    body: '#6b8fd4',
    light: '#cfe0ff',
    glow: COLORS.spark,
    role: '连锁，反集群',
    signatureName: '导电链',
    signatureDesc: '命中后连锁更多目标',
  },
  {
    id: 'swarm',
    code: 'SWARM-07',
    name: '蜂群',
    tier: 2,
    points: { hp: 1, dmg: 2, spd: 3, arm: 1, rof: 3 },
    weapon: 'scatter',
    signature: 'swarm',
    amphibious: false,
    unlock: 2600,
    body: '#9b7fd4',
    light: '#e2d4ff',
    glow: COLORS.drone,
    role: '散射，贴脸爆发',
    signatureName: '蜂群协议',
    signatureDesc: '散射收窄，连续命中同一目标增伤',
  },
  {
    id: 'mk2',
    code: 'MK-II',
    name: '终焉',
    tier: 3,
    points: { hp: 2, dmg: 3, spd: 2, arm: 2, rof: 1 },
    weapon: 'plain',
    signature: 'mk2',
    amphibious: true,
    unlock: 'clear',
    body: '#c0392b',
    light: '#ff9c8a',
    glow: COLORS.p1Light,
    role: '全能，靠主动技',
    signatureName: '要塞协议',
    signatureDesc: '周期性全向齐射',
  },
];

export const TANK_BY_ID: Record<string, TankDef> = Object.fromEntries(
  TANKS.map((t) => [t.id, t]),
);

/** 涂装：只改 body/light，不改数值与技能（docs/tanks.md 第 5 节）。 */
export interface SkinDef {
  id: string;
  name: string;
  body: string;
  light: string;
  price: number;
}

export const SKINS: SkinDef[] = [
  { id: 'factory', name: '出厂涂装', body: '', light: '', price: 0 },
  { id: 'wasteland', name: '荒原棕', body: EXT_COLORS.wasteland, light: EXT_COLORS.wastelandLight, price: 150 },
  { id: 'arctic', name: '极地白', body: EXT_COLORS.arctic, light: EXT_COLORS.arcticLight, price: 150 },
  { id: 'night', name: '夜战黑', body: EXT_COLORS.night, light: EXT_COLORS.nightLight, price: 150 },
  { id: 'hazard', name: '警告黄', body: EXT_COLORS.hazard, light: EXT_COLORS.hazardLight, price: 300 },
];

export const SKIN_BY_ID: Record<string, SkinDef> = Object.fromEntries(
  SKINS.map((s) => [s.id, s]),
);

/** 全部坦克默认解锁的 id（T0）。 */
export const FREE_TANKS = TANKS.filter((t) => t.unlock === 0).map((t) => t.id);
