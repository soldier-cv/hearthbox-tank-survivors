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
    /** 火箭（装置卡）：打向敌人最密处。 */
    rocketCd: 6,
    rocketSpeed: 320,
    rocketDmg: 1.8,
    rocketRadius: 80,
    rocketSeek: 90,
    /** 导弹（装置卡）。 */
    missileCd: 4,
    missileSpeed: 340,
    missileDmg: 0.55,
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

/** 流派。每个流派有自己的强调色，用于卡片与 HUD。 */
export const SCHOOLS = ['fire', 'pierce', 'blast', 'auto', 'survive'] as const;
export type School = (typeof SCHOOLS)[number];

export const SCHOOL_COLORS: Record<School, string> = {
  fire: COLORS.p1,
  pierce: COLORS.p2,
  blast: COLORS.blast,
  auto: COLORS.drone,
  survive: COLORS.heal,
};

export const SCHOOL_NAMES: Record<School, string> = {
  fire: '火力',
  pierce: '穿透',
  blast: '爆破',
  auto: '自动化',
  survive: '生存',
};

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
