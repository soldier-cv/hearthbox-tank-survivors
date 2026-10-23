/**
 * 常量层。运行中永不变。
 *
 * 会被金手指 / 设置 / 难度改的东西在 tuning.ts，不在这里。
 * 逻辑代码只 import 本文件与 tuning，不允许出现字面数字。
 */

export const CONFIG = {
  width: 960,
  height: 540,
  /** 战斗网格边长。 */
  tile: 40,
  /** 一局时长（秒）。7:00 进终局 BOSS，8:00 停止常规刷怪。 */
  roundSeconds: 480,
  /** 玩家碰撞半径。屏幕上直径 28px。 */
  playerRadius: 14,
  /** 底盘基础值（0 点时）。见 docs/tanks.md 第 2 节。 */
  chassis: {
    hp: 40,
    hpPerPoint: 16,
    dmg: 10,
    dmgPerPoint: 4,
    speed: 190,
    speedPerPoint: 0.06,
    armorPerPoint: 0.05,
    interval: 0.45,
    rofPerPoint: 0.08,
  },
  /** 通用战斗参数。 */
  combat: {
    bulletSpeed: 520,
    range: 465,
    pickup: 92,
    crit: 0.05,
    critMul: 1.7,
    bombs: 3,
    bombsMax: 5,
    bombRadius: 320,
    bombBase: 150,
    bombPerLevel: 6,
    dashSpeed: 760,
    dashTime: 0.28,
    dashCd: 1.45,
    invuln: 0.6,
    spawnProtect: 1.5,
    reviveTime: 2.2,
    reviveRadius: 48,
    reviveHpRatio: 0.5,
    /** 单次受击上限（比例）。 */
    maxHitRatio: 0.3,
    maxChargedHitRatio: 0.4,
  },
  /** 实体上限，超出即丢弃新增（帧预算保护）。 */
  caps: {
    enemies: 200,
    bullets: 400,
    ebullets: 400,
    particles: 900,
    texts: 90,
    puddles: 40,
    mines: 40,
    drones: 24,
    arcs: 32,
    decals: 120,
    rings: 60,
  },
  /** 坦克等级。 */
  tankMaxLevel: 16,
  tankLevelCost: { base: 40, per: 12 },
  /** 外观 / 签名解锁等级。 */
  decalLevels: [1, 4, 8, 12] as const,
  signatureLevels: [1, 6, 10, 14] as const,
  /** 卡池。 */
  offers: 3,
  rerollsPerRound: 2,
  /** 分数。 */
  score: { perSecond: 4, perLevel: 110, perKill: 12, clearBonus: 5000 },
  /** 废铁。 */
  scrap: {
    perKill: 0.4,
    perSecond: 0.5,
    perBoss: 120,
    clear: 400,
    firstClear: 800,
  },
  /**
   * 卡牌机制的常数（docs/cards-v2.md 第 6 节）。
   *
   * 逻辑层只读这里，卡表只写"改哪一项"。
   */
  cards: {
    grenade: { cd: 6, r: 70, dmg: 80, range: 220, shellLife: 1.2, count: 1, twinOffset: 40 },
    napalm: { cd: 4.5, r: 60, dps: 8, puddleLife: 3, range: 340, shellLife: 0.45, coneR: 220, coneArc: 0.9, coneRatio: 0.5 },
    cone: { r: 135, arc: 0.61, dmgRatio: 0.45, cd: 2.2, chillT: 1.6 },
    tesla: { cd: 2.8, chain: 3, dmgRatio: 0.45, jump: 90, pillarLife: 8, pillarCd: 1.5, pillarR: 120 },
    drone: { cd: 1.4, dmgRatio: 0.55, speed: 460, life: 1.1, missileCd: 3, missileR: 50, missileRatio: 0.7, shieldRegen: 6 },
    mine: { cd: 2.4, dmgRatio: 1.6, trigger: 80, life: 15, jumpMul: 1.4, tetherRange: 220, tetherSlow: 0.4 },
    missile: { cd: 3, dmgRatio: 0.5, speed: 380, turn: 4.5, blast: 40 },
    turret: { life: 15, cd: 0.85, dmgRatio: 0.6, r: 14, range: 320, max: 2, heavyMul: 1.4, heavyCd: 1.3, deployCd: 4 },
    well: { cd: 6, r: 180, dur: 1.2, pull: 300, dmgRatio: 1.6, singularityDur: 2, singularityR: 120, inertSlow: 0.45, inertVuln: 0.2 },
    storm: { cd: 1.2, r: 360, dmgRatio: 0.6, arcLife: 2, arcR: 46, arcTick: 0.35 },
    reflect: { dmgRatio: 0.8, speed: 420, life: 0.5 },
    rail: {
      cd: 5, charge: 0.35, pierce: 4, dmgMul: 3, speedMul: 1.6, slow: 0.4,
      overloadCharge: 0.7, overloadDmg: 4, overloadPierce: 99,
      fastCd: 2.5, fastDmg: 2, fastPierce: 2,
    },
    stop: {
      cd: 45, dur: 1.2, beamMul: 6,
      shortCd: 20, shortDur: 0.8, shortMul: 4,
      longCd: 60, longDur: 2.4, longMul: 10,
    },
    heat: { max: 100, perShot: 9, rest: 1.0, restFast: 0.6, redAt: 0.7, redMul: 1.25, redSlow: 0.1, cool: 12 },
    /** 应急维修包：定时一次性回血（不是持续回复）。 */
    med: { cd: 30, heal: 15, fastCd: 20, fastHeal: 12, share: 0.66 },
    aura: { r: 260 },
    phase: { dmg: 90, delay: 0.35, r: 70, slow: 0.45 },
    chill: { t: 1.5, root: 0.5, rootAfter: 1 },
    regen: { combat: 1.2, lowAt: 0.3, lowMul: 3, outOfCombat: 2.5, share: 10 },
    react: { t: 0.6, mul: 0.5 },
    pickupShock: { r: 100, dmg: 40 },
    scrapDrop: { chance: 0.12, scrap: 4 },
    /** 掉落率卡的换算：卡上 +10% → 每次击杀约 1.2% 掉补给。 */
    drops: { base: 0.12 },
  },
} as const;

/**
 * 核心 21 色：玩家、敌人、子弹、特效、UI、文字。
 * 地形与涂装用 EXT_COLORS，不能混用（docs/art.md 第 2 节）。
 */
export const COLORS = {
  void: '#0b0e10',
  groundDark: '#12181c',
  ground: '#1a2228',
  grid: '#242f36',
  tread: '#3d2d15',

  textDim: '#6a6a7a',
  text: '#9a9aa8',
  textBright: '#f3ecdd',

  p1: '#f2b13c',
  p1Light: '#ffe6b0',
  p2: '#58c8d8',
  p2Light: '#c9f5fb',

  enemy: '#c94b37',
  scout: '#e0973c',
  gunner: '#a963c9',
  brute: '#8f4a3c',
  bomber: '#d9452b',

  heal: '#9ad14f',
  spark: '#7bd6ff',
  blast: '#ff6b35',
  drone: '#c9a0ff',
} as const;

/** 扩展 14 色：只用于地形与涂装。 */
export const EXT_COLORS = {
  stone: '#43435a',
  stoneDeep: '#2b3238',
  wood: '#7a6242',
  deepWater: '#1a4a5c',
  snow: '#e6f2f7',
  grassDark: '#4a7a2f',
  grassMid: '#6fae3d',
  wasteland: '#a8895c',
  wastelandLight: '#e2c9a0',
  arctic: '#d8e4ea',
  arcticLight: '#f7fbfd',
  night: '#2b3238',
  nightLight: '#6b7780',
  hazard: '#e8c33c',
  hazardLight: '#fff3b0',
} as const;

export type ColorKey = keyof typeof COLORS;

/** 卡类别。只用于权重加成与"三张至少两类"，不再表示等级序列。 */
export const CARD_TAGS = ['direct', 'area', 'control', 'auto', 'survive', 'economy'] as const;
export type CardTag = (typeof CARD_TAGS)[number];

export const TAG_COLORS: Record<CardTag, string> = {
  direct: COLORS.p1,
  area: COLORS.blast,
  control: COLORS.p2,
  auto: COLORS.drone,
  survive: COLORS.heal,
  economy: COLORS.textBright,
};

export const TAG_NAMES: Record<CardTag, string> = {
  direct: '直射',
  area: '面域',
  control: '场控',
  auto: '自主',
  survive: '生存',
  economy: '经济',
};

/**
 * 稀有度（docs/cards-v2.md 第 3 节）。
 *
 * **不是强度阶梯**：它只决定出现频率与构筑角色。做成"越稀有越强"会让玩家跳过白卡。
 */
export const RARITIES = ['common', 'refined', 'military', 'rare', 'prototype'] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_NAMES: Record<Rarity, string> = {
  common: '常规',
  refined: '精制',
  military: '军用',
  rare: '稀有',
  prototype: '原型',
};

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#d8dde6',
  refined: '#6fcf7a',
  military: '#4aa3ff',
  rare: '#f2b13c',
  prototype: '#ff4d4d',
};

/** 出现权重（每次抽新装置时）。 */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 52,
  refined: 26,
  military: 14,
  rare: 6,
  prototype: 2,
};

/** 作用轴：近 / 中 / 远是距离；自身 = 光环、全局或只作用于自己；部署 = 放在地上的单位。 */
export const AXES = ['near', 'mid', 'far', 'self', 'deploy'] as const;
export type CardAxis = (typeof AXES)[number];
export const AXIS_NAMES: Record<CardAxis, string> = {
  near: '近',
  mid: '中',
  far: '远',
  self: '自身',
  deploy: '部署',
};

/** 卡池规则（docs/cards-v2.md 第 7 节）。 */
export const CARD_RULES = {
  /** 每张卡的改装方向数（白卡 2，其余 3），抽到改装时展示其中 2 个。 */
  shownBranches: 2,
  /** 一局最多几张红卡。 */
  maxPrototypes: 2,
  /** 红卡最早出现时间（秒）。 */
  prototypeAfter: 240,
  /** 连续几次升级没出金/红就保底。 */
  pityEvery: 6,
  /** 同类已有 ≥2 张时，该类新装置权重倍率。 */
  sameTagMul: 1.2,
  /** 同类 ≥ 这个张数才吃加成。 */
  sameTagAt: 2,
} as const;

/** 阶段。 */
export const PHASES = ['集结', '推进', '压制', '割据', '终局'] as const;

/**
 * 阶段倍率表（docs/enemies.md 第 6 节）。
 *
 * 上限 4.0，不再增长 —— demo 用 1 + t/100，到 8 分钟是 5.8 倍，后期必然变成一堵墙。
 */
export const PHASE_TABLE = [
  { name: PHASES[0], from: 0, hp: 1.0, dmg: 1.0, spd: 1.0, cap: 60 },
  { name: PHASES[1], from: 90, hp: 1.6, dmg: 1.1, spd: 1.05, cap: 90 },
  { name: PHASES[2], from: 180, hp: 2.3, dmg: 1.2, spd: 1.1, cap: 115 },
  { name: PHASES[3], from: 270, hp: 3.1, dmg: 1.3, spd: 1.15, cap: 140 },
  { name: PHASES[4], from: 360, hp: 4.0, dmg: 1.4, spd: 1.2, cap: 155 },
] as const;

/**
 * 威胁等级（docs/enemies.md 第 6 节 + docs/tank-levels.md 第 6 节）。
 *
 * 数值梯度刻意压小（总共只差 70%），难度来自兵种数与精英率。
 */
export const THREATS = [
  { id: 'normal', name: '常规', stars: 1, hp: 1.0, dmg: 1.0, need: 0, elite: 0.04, scrap: 1.0 },
  { id: 'boosted', name: '强化', stars: 2, hp: 1.2, dmg: 1.08, need: 5, elite: 0.08, scrap: 1.2 },
  { id: 'ruin', name: '毁灭', stars: 3, hp: 1.45, dmg: 1.16, need: 10, elite: 0.12, scrap: 1.5 },
  { id: 'doom', name: '终焉', stars: 4, hp: 1.7, dmg: 1.25, need: 15, elite: 0.16, scrap: 1.8 },
] as const;

export type ThreatId = (typeof THREATS)[number]['id'];

/**
 * 刷怪速率（只/秒）。上限 4.0 —— 密度交给同屏上限控制。
 */
export const SPAWN = {
  base: 1.1,
  perSecond: 0.0075,
  max: 4.0,
  /** 双人每人分到总速率 / 人数，再乘这个系数。 */
  twoPlayer: 1.35,
  /** 静默节点期间的系数。 */
  quiet: 0.35,
} as const;

/** 地图尺寸与地形构成（docs/maps.md）。 */
export const MAPS_META = {
  proving: { cols: 55, rows: 40 },
  jungle: { cols: 55, rows: 40 },
  tundra: { cols: 60, rows: 40 },
  delta: { cols: 55, rows: 45 },
  ruins: { cols: 50, rows: 40 },
} as const;

/** 相机（docs/camera.md）。 */
export const CAMERA = {
  /** 合屏缩放下限：低于此坦克在屏上小于 18px，读不出来。 */
  mergedMin: 0.66,
  mergedMax: 1.04,
  /** 滞回：进入分屏 / 退出分屏。 */
  splitEnterZoom: 0.66,
  splitExitZoom: 0.76,
  /** 分屏时每一路的缩放。 */
  splitZoom: 0.9,
  /** 状态驻留，防抖。 */
  dwell: 1.2,
  /** 转场时长。 */
  splitAnim: 0.22,
  mergeAnim: 0.18,
  /** 装下两人所需的额外留白。 */
  padding: 140,
  /** 平滑系数。 */
  follow: 8,
  /** 前瞻距离。 */
  lookAhead: 40,
  /** 被强制合屏后重新判定的等待。 */
  afterRevive: 0.6,
  /** 边缘箭头：出界多远开始提示。 */
  arrowMargin: 60,
  arrowFull: 200,
} as const;

export type MapId = keyof typeof MAPS_META;

/** 外观阶段对应的名字。 */
export const DECAL_NAMES = ['原型', '定型', '精工', '王牌'] as const;
export const SIGNATURE_NAMES = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'] as const;
