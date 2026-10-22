/**
 * 底盘换算 + 签名进化 + 坦克等级（docs/tanks.md 第 3 节、docs/tank-levels.md 第 3/5 节）。
 *
 * 纯函数：不持有状态、不读平台。逻辑层只调用这里，不出现任何字面数字。
 */

import { CONFIG } from './config';
import { silhouetteOf, type Silhouette } from './data/silhouette';
import type { TankDef } from './data/tanks';

// =====================================================================
// 底盘：10 点分配 → 具体数值
// =====================================================================

export interface Chassis {
  maxHp: number;
  dmg: number;
  speed: number;
  /** 承伤减免比例 0..0.15。 */
  armor: number;
  /** 开火间隔（秒）。 */
  interval: number;
  /** 基础弹速 / 射程 / 拾取 / 暴击。 */
  bulletSpeed: number;
  range: number;
  pickup: number;
  crit: number;
  critMul: number;
  projectiles: number;
  pierce: number;
}

export function chassisOf(tank: TankDef): Chassis {
  const C = CONFIG.chassis;
  const p = tank.points;
  return {
    maxHp: C.hp + C.hpPerPoint * p.hp,
    dmg: C.dmg + C.dmgPerPoint * p.dmg,
    speed: C.speed * (1 + C.speedPerPoint * p.spd),
    armor: Math.min(0.15, C.armorPerPoint * p.arm),
    interval: C.interval / Math.pow(1 + C.rofPerPoint, p.rof),
    bulletSpeed: CONFIG.combat.bulletSpeed,
    range: CONFIG.combat.range,
    pickup: CONFIG.combat.pickup,
    crit: CONFIG.combat.crit,
    critMul: CONFIG.combat.critMul,
    projectiles: 1,
    pierce: 0,
  };
}

// =====================================================================
// 坦克等级：只放大尺度，不改形态（docs/tank-levels.md 第 3 节）
// =====================================================================

/** 每级增长。 */
const LEVEL_GAIN = {
  hp: 0.04,
  dmg: 0.03,
  speed: 0.008,
  rof: 0.012,
  armor: 0.003,
} as const;

export interface LevelScale {
  hp: number;
  dmg: number;
  speed: number;
  /** 间隔除以它（越大越快）。 */
  rof: number;
  /** 百分点加到 armor 上。 */
  armor: number;
  level: number;
  decalStage: 1 | 2 | 3 | 4;
  signatureStage: 1 | 2 | 3 | 4;
}

export function levelScale(level: number): LevelScale {
  const n = Math.max(0, level - 1);
  return {
    hp: 1 + LEVEL_GAIN.hp * n,
    dmg: 1 + LEVEL_GAIN.dmg * n,
    speed: 1 + LEVEL_GAIN.speed * n,
    rof: 1 + LEVEL_GAIN.rof * n,
    armor: LEVEL_GAIN.armor * n,
    level,
    decalStage: stageOf(CONFIG.decalLevels, level),
    signatureStage: stageOf(CONFIG.signatureLevels, level),
  };
}

function stageOf(levels: readonly number[], level: number): 1 | 2 | 3 | 4 {
  let stage = 1 as 1 | 2 | 3 | 4;
  for (let i = 0; i < levels.length; i += 1) {
    if (level >= levels[i]) stage = (i + 1) as 1 | 2 | 3 | 4;
  }
  return stage;
}

/** 外观 / 签名升到该级所需的花费。 */
export function levelCost(level: number): number {
  return CONFIG.tankLevelCost.base + CONFIG.tankLevelCost.per * level;
}

/** 从 Lv1 升到 target 的累计花费。 */
export function levelCostTo(target: number): number {
  let sum = 0;
  for (let l = 1; l < Math.min(target, CONFIG.tankMaxLevel); l += 1) sum += levelCost(l);
  return sum;
}

// =====================================================================
// 武器形态（docs/tanks.md 第 3 节）
// =====================================================================

export interface WeaponBonus {
  pierce: number;
  /** 穿透后伤害保留比例（普通弹 0.7）。 */
  falloff: number;
  /** 命中即爆炸的半径（0 = 无）。 */
  blastRadius: number;
  /** 散射弹数与单颗伤害比例。 */
  pellets: number;
  pelletRatio: number;
  spread: number;
  /** 连锁目标数与连锁伤害比例。 */
  chain: number;
  chainRatio: number;
  /** 是否无衰减（长矛）。 */
  noFalloff: boolean;
}

export function weaponOf(tank: TankDef): WeaponBonus {
  switch (tank.weapon) {
    case 'ap':
      return {
        pierce: 1, falloff: 1, blastRadius: 0, pellets: 1, pelletRatio: 1, spread: 0,
        chain: 0, chainRatio: 0, noFalloff: true,
      };
    case 'he':
      return {
        pierce: 0, falloff: 0.7, blastRadius: 34, pellets: 1, pelletRatio: 1, spread: 0,
        chain: 0, chainRatio: 0, noFalloff: false,
      };
    case 'arc':
      return {
        pierce: 0, falloff: 0.7, blastRadius: 0, pellets: 1, pelletRatio: 1, spread: 0,
        chain: 1, chainRatio: 0.6, noFalloff: false,
      };
    case 'scatter':
      return {
        pierce: 0, falloff: 0.7, blastRadius: 0, pellets: 3, pelletRatio: 0.45, spread: 7,
        chain: 0, chainRatio: 0, noFalloff: false,
      };
    case 'plain':
    default:
      return {
        pierce: 0, falloff: 0.7, blastRadius: 0, pellets: 1, pelletRatio: 1, spread: 0,
        chain: 0, chainRatio: 0, noFalloff: false,
      };
  }
}

// =====================================================================
// 签名技能：四阶（docs/tank-levels.md 第 5 节）
// =====================================================================

export interface SignatureState {
  /** 静止累计时长（铁砧）。 */
  still: number;
  /** 静止获得的"锁定"层数。 */
  lock: number;
  /** 是否刚冲刺结束（回声）。 */
  dashBoost: number;
  /** 残影剩余时长（回声 Ⅲ）。 */
  decoy: number;
  /** 低血状态（港湾）。 */
  desperate: boolean;
  /** 无敌剩余（港湾 Ⅳ）。 */
  emergency: number;
  /** 本局紧急无敌剩余次数。 */
  emergencyCharges: number;
  /** 该发已穿透数量（长矛）。 */
  pierceCount: number;
  /** 轨道炮冷却。 */
  railCd: number;
  /** 目标叠层（蜂群）。 */
  swarmStacks: Map<number, number>;
  /** 要塞协议冷却（终焉）。 */
  barrageCd: number;
  /** 要塞协议齐射前的预亮。 */
  chargeUp: number;
  /** 标记（终焉 Ⅲ）。 */
  marks: Map<number, number>;
}

export interface SignatureConfig {
  /** 静止多久触发（铁砧）。 */
  stillNeed: number;
  stillDmg: number;
  lockMax: number;
  heavyEvery: number;
  dashRange: number;
  dashRoF: number;
  dashCdMul: number;
  decoyTime: number;
  dashBurst: number;
  lowHpAt: number;
  lowHpReduction: number;
  lowHpSpeed: number;
  lostHpDmgPer: number;
  lostHpDmgMax: number;
  emergencyCharges: number;
  pierceBonus: number;
  pierceBonusMax: number;
  pierceExtra: number;
  railDmg: number;
  railPierce: number;
  swarmSpread: number;
  swarmStackCap: number;
  swarmTeamBonus: number;
  strikeAt: number;
  barrageCd: number;
  barrageShots: number;
  barrageRatio: number;
  markBonus: number;
  barrageInvuln: number;
}

const EMPTY_SIGNATURE: SignatureConfig = {
  stillNeed: 0, stillDmg: 0, lockMax: 0, heavyEvery: 0,
  dashRange: 1, dashRoF: 0, dashCdMul: 1, decoyTime: 0, dashBurst: 0,
  lowHpAt: 0, lowHpReduction: 0, lowHpSpeed: 0, lostHpDmgPer: 0, lostHpDmgMax: 0,
  emergencyCharges: 0,
  pierceBonus: 0, pierceBonusMax: 0, pierceExtra: 0, railDmg: 0, railPierce: 0,
  swarmSpread: 0, swarmStackCap: 0, swarmTeamBonus: 0, strikeAt: 0,
  barrageCd: 0, barrageShots: 0, barrageRatio: 0, markBonus: 0, barrageInvuln: 0,
};

/**
 * 每台车 × 每阶的签名参数。
 *
 * 用表而不是 if-else：逻辑层只读 SignatureConfig，不认具体坦克。
 */
const SIGNATURES: Record<string, SignatureConfig[]> = {
  anvil: [
    { ...EMPTY_SIGNATURE, stillNeed: 1.5, stillDmg: 0.12, lockMax: 0 },
    { ...EMPTY_SIGNATURE, stillNeed: 1.2, stillDmg: 0.18, lockMax: 1 },
    { ...EMPTY_SIGNATURE, stillNeed: 0.8, stillDmg: 0.24, lockMax: 2 },
    { ...EMPTY_SIGNATURE, stillNeed: 0.8, stillDmg: 0.24, lockMax: 2, heavyEvery: 2 },
  ],
  echo: [
    { ...EMPTY_SIGNATURE, dashRange: 1.25, dashRoF: 0.15 },
    { ...EMPTY_SIGNATURE, dashRange: 1.35, dashRoF: 0.22 },
    { ...EMPTY_SIGNATURE, dashRange: 1.35, dashRoF: 0.22, decoyTime: 1.2 },
    { ...EMPTY_SIGNATURE, dashRange: 1.35, dashRoF: 0.22, decoyTime: 1.2, dashCdMul: 0.75, dashBurst: 4 },
  ],
  bastion: [
    { ...EMPTY_SIGNATURE, lowHpAt: 0.3, lowHpReduction: 0.2, lowHpSpeed: -0.08 },
    { ...EMPTY_SIGNATURE, lowHpAt: 0.4, lowHpReduction: 0.24, lowHpSpeed: -0.08 },
    { ...EMPTY_SIGNATURE, lowHpAt: 0.4, lowHpReduction: 0.24, lowHpSpeed: -0.08, lostHpDmgPer: 0.03, lostHpDmgMax: 0.18 },
    { ...EMPTY_SIGNATURE, lowHpAt: 0.25, lowHpReduction: 0.24, lowHpSpeed: -0.08, lostHpDmgPer: 0.03, lostHpDmgMax: 0.18, emergencyCharges: 2 },
  ],
  lance: [
    { ...EMPTY_SIGNATURE, pierceBonus: 0.08, pierceBonusMax: 0.24 },
    { ...EMPTY_SIGNATURE, pierceBonus: 0.08, pierceBonusMax: 0.32, pierceExtra: 1 },
    { ...EMPTY_SIGNATURE, pierceBonus: 0.08, pierceBonusMax: 0.32, pierceExtra: 1 },
    { ...EMPTY_SIGNATURE, pierceBonus: 0.08, pierceBonusMax: 0.32, pierceExtra: 1, railDmg: 1.8, railPierce: 3 },
  ],
  furnace: [
    { ...EMPTY_SIGNATURE },
    { ...EMPTY_SIGNATURE },
    { ...EMPTY_SIGNATURE },
    { ...EMPTY_SIGNATURE },
  ],
  arc: [
    { ...EMPTY_SIGNATURE },
    { ...EMPTY_SIGNATURE },
    { ...EMPTY_SIGNATURE },
    { ...EMPTY_SIGNATURE },
  ],
  swarm: [
    { ...EMPTY_SIGNATURE, swarmSpread: 4, swarmStackCap: 20 },
    { ...EMPTY_SIGNATURE, swarmSpread: 2, swarmStackCap: 30 },
    { ...EMPTY_SIGNATURE, swarmSpread: 2, swarmStackCap: 30, swarmTeamBonus: 0.03 },
    { ...EMPTY_SIGNATURE, swarmSpread: 2, swarmStackCap: 30, swarmTeamBonus: 0.03, strikeAt: 5 },
  ],
  mk2: [
    { ...EMPTY_SIGNATURE, barrageCd: 12, barrageShots: 8, barrageRatio: 0.4 },
    { ...EMPTY_SIGNATURE, barrageCd: 10, barrageShots: 10, barrageRatio: 0.45 },
    { ...EMPTY_SIGNATURE, barrageCd: 10, barrageShots: 10, barrageRatio: 0.45, markBonus: 0.08 },
    { ...EMPTY_SIGNATURE, barrageCd: 8, barrageShots: 12, barrageRatio: 0.5, markBonus: 0.08, barrageInvuln: 0.5 },
  ],
};

/** 熔炉与电弧的签名是乘性 / 连锁参数，单独处理避免混进通用表。 */
export const FURNACE_SIG = {
  blastMul: [1.25, 1.35, 1.35, 1.35],
  speedMul: [0.94, 0.94, 0.94, 0.94],
  wallMul: [1, 1, 1.5, 1.5],
  puddle: [0, 0, 2, 2],
  doubleBlast: [false, false, false, true],
} as const;

export const ARC_SIG = {
  chainAdd: [1, 2, 2, 2],
  chainRatio: [0.7, 0.75, 0.75, 0.75],
  slow: [0, 0, 0.25, 0.25],
  loop: [false, false, false, true],
  chainDmgPer: [0, 0, 0, 0.05],
} as const;

export function signatureOf(tank: TankDef, stage: number): SignatureConfig {
  const list = SIGNATURES[tank.signature];
  if (!list) return EMPTY_SIGNATURE;
  return list[Math.min(stage, list.length) - 1] ?? list[0];
}

/**
 * 武器形态随签名阶段的变化（熔炉 / 电弧）。
 *
 * 这两台的签名直接改武器参数，所以在这里按阶段取。
 */
export function weaponStageBonus(tank: TankDef, stage: number): Partial<WeaponBonus> {
  const i = Math.min(stage, 4) - 1;
  if (tank.signature === 'furnace') {
    return {
      blastRadius: FURNACE_SIG.blastMul[i],
      noFalloff: false,
    };
  }
  if (tank.signature === 'arc') {
    return { chain: ARC_SIG.chainAdd[i], chainRatio: ARC_SIG.chainRatio[i] };
  }
  return {};
}

// =====================================================================
// 剪影
// =====================================================================

export function silhouetteFor(tank: TankDef): Silhouette {
  return silhouetteOf(tank.id);
}
