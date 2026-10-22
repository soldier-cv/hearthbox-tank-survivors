/**
 * 地图（docs/maps.md）。
 *
 * 地图是战术选择，不是难度阶梯：不给奖励倍率、不设准入门槛。
 * 每张图改变的是"怎么走、能看见什么、怎么打 BOSS"。
 */

import { EXT_COLORS, COLORS, MAPS_META, type MapId } from '../config';

/** 格子类型。 */
export const TILE = {
  empty: 0,
  brick: 1,
  steel: 2,
  grass: 3,
  ice: 4,
  snow: 5,
  deep: 6,
  shallow: 7,
  bridge: 8,
  rubble: 9,
  building: 10,
  crater: 11,
} as const;

export type TileType = (typeof TILE)[keyof typeof TILE];

/** 每种地形一个格子的行为定义。 */
export interface TileRule {
  type: TileType;
  name: string;
  /** 是否阻挡移动。 */
  solid: boolean;
  /** 是否阻挡炮弹（false = 炮弹直接飞过）。 */
  blocksBullet: boolean;
  /** 是否阻挡视线（狙击手不会蓄力、玩家看不见里面的敌人）。 */
  blocksSight: boolean;
  /** 能否被摧毁。 */
  destructible: boolean;
  hp: number;
  /** 渡水坦克能否通过。 */
  amphibiousPass: boolean;
  /** 移速系数。 */
  speedMul: number;
  /** 惯性系数：0 = 正常，>0 = 松开后继续滑行（冰面）。 */
  glide: number;
  /** 主色 / 描边。 */
  color: string;
  edge: string;
}

export const TILE_RULES: Record<TileType, TileRule> = {
  [TILE.empty]: {
    type: TILE.empty, name: '空地', solid: false, blocksBullet: false, blocksSight: false,
    destructible: false, hp: 0, amphibiousPass: true, speedMul: 1, glide: 0,
    color: COLORS.ground, edge: COLORS.grid,
  },
  [TILE.brick]: {
    type: TILE.brick, name: '砖墙', solid: true, blocksBullet: true, blocksSight: true,
    destructible: true, hp: 24, amphibiousPass: false, speedMul: 1, glide: 0,
    color: '#8a5c3a', edge: COLORS.void,
  },
  [TILE.steel]: {
    type: TILE.steel, name: '钢柱', solid: true, blocksBullet: true, blocksSight: true,
    destructible: false, hp: Infinity, amphibiousPass: false, speedMul: 1, glide: 0,
    color: '#5a6672', edge: COLORS.void,
  },
  [TILE.grass]: {
    type: TILE.grass, name: '草丛', solid: false, blocksBullet: false, blocksSight: true,
    destructible: true, hp: 12, amphibiousPass: true, speedMul: 0.94, glide: 0,
    color: EXT_COLORS.grassMid, edge: EXT_COLORS.grassDark,
  },
  [TILE.ice]: {
    type: TILE.ice, name: '冰面', solid: false, blocksBullet: false, blocksSight: false,
    destructible: false, hp: 0, amphibiousPass: true, speedMul: 0.92, glide: 0.82,
    color: '#1b3040', edge: EXT_COLORS.snow,
  },
  [TILE.snow]: {
    type: TILE.snow, name: '雪地', solid: false, blocksBullet: false, blocksSight: false,
    destructible: false, hp: 0, amphibiousPass: true, speedMul: 0.85, glide: 0,
    color: '#2b3d48', edge: EXT_COLORS.snow,
  },
  [TILE.deep]: {
    type: TILE.deep, name: '深水', solid: true, blocksBullet: false, blocksSight: false,
    destructible: false, hp: Infinity, amphibiousPass: true, speedMul: 0.8, glide: 0,
    color: EXT_COLORS.deepWater, edge: '#0f2c38',
  },
  [TILE.shallow]: {
    type: TILE.shallow, name: '浅滩', solid: false, blocksBullet: false, blocksSight: false,
    destructible: false, hp: 0, amphibiousPass: true, speedMul: 0.6, glide: 0,
    color: '#25606f', edge: COLORS.p2Light,
  },
  [TILE.bridge]: {
    type: TILE.bridge, name: '桥', solid: false, blocksBullet: false, blocksSight: false,
    destructible: true, hp: 120, amphibiousPass: true, speedMul: 1, glide: 0,
    color: EXT_COLORS.wood, edge: COLORS.void,
  },
  [TILE.rubble]: {
    type: TILE.rubble, name: '瓦砾', solid: false, blocksBullet: false, blocksSight: false,
    destructible: true, hp: 60, amphibiousPass: true, speedMul: 0.7, glide: 0,
    color: '#3a3f4a', edge: EXT_COLORS.stone,
  },
  [TILE.building]: {
    type: TILE.building, name: '残楼', solid: true, blocksBullet: true, blocksSight: true,
    destructible: true, hp: 200, amphibiousPass: false, speedMul: 1, glide: 0,
    color: EXT_COLORS.stone, edge: COLORS.void,
  },
  [TILE.crater]: {
    type: TILE.crater, name: '弹坑', solid: false, blocksBullet: false, blocksSight: false,
    destructible: false, hp: 0, amphibiousPass: true, speedMul: 0.9, glide: 0,
    color: COLORS.groundDark, edge: COLORS.grid,
  },
};

/** 高墙：不可摧毁但比钢柱长的结构，用 brick/steel 之外的独立类型表达太碎，这里用 steel 的变体标记。 */
export const TALL_WALL_HP = Infinity;

export interface MapDef {
  id: MapId;
  name: string;
  /** 1–3，给玩家的提示，不影响奖励。 */
  danger: 1 | 2 | 3;
  price: number;
  summary: string;
  /** 一句话战术含义。 */
  tactic: string;
  cols: number;
  rows: number;
  bricks: number;
  steel: number;
  /** 专属生成器 id。 */
  generator: MapId;
  /** 每张图的地形色调（叠加在地面上）。 */
  tint: string;
  tintAlpha: number;
}

export const MAPS: MapDef[] = [
  {
    id: 'proving', name: '试验场', danger: 1, price: 0, generator: 'proving',
    summary: '基准图，只有砖墙和钢柱', tactic: '学习图。学会边退边打、拆墙开路。',
    cols: MAPS_META.proving.cols, rows: MAPS_META.proving.rows,
    bricks: 62, steel: 15, tint: COLORS.ground, tintAlpha: 0,
  },
  {
    id: 'jungle', name: '丛林', danger: 2, price: 1200, generator: 'jungle',
    summary: '草丛双向遮挡视线，能烧掉', tactic: '视野受限。进草前先开火惊草。',
    cols: MAPS_META.jungle.cols, rows: MAPS_META.jungle.rows,
    bricks: 48, steel: 12, tint: EXT_COLORS.grassDark, tintAlpha: 0.08,
  },
  {
    id: 'tundra', name: '冰原', danger: 2, price: 1200, generator: 'tundra',
    summary: '冰面惯性滑行，冲刺是唯一急停', tactic: '操控受限。提前预判停车点。',
    cols: MAPS_META.tundra.cols, rows: MAPS_META.tundra.rows,
    bricks: 40, steel: 14, tint: '#1b3040', tintAlpha: 0.14,
  },
  {
    id: 'delta', name: '水网', danger: 3, price: 1800, generator: 'delta',
    summary: '深水只有渡水坦克能过，桥能被打塌', tactic: '通路易断。守住桥，或打塌桥等敌人从水路来。',
    cols: MAPS_META.delta.cols, rows: MAPS_META.delta.rows,
    bricks: 42, steel: 10, tint: '#123544', tintAlpha: 0.1,
  },
  {
    id: 'ruins', name: '废墟', danger: 3, price: 1800, generator: 'ruins',
    summary: '高墙挡炮线，残楼倒塌对双方都造成伤害', tactic: '把敌人引到楼下再打塌。',
    cols: MAPS_META.ruins.cols, rows: MAPS_META.ruins.rows,
    bricks: 36, steel: 8, tint: '#20242e', tintAlpha: 0.12,
  },
];

export const MAP_BY_ID: Record<MapId, MapDef> = Object.fromEntries(
  MAPS.map((m) => [m.id, m]),
) as Record<MapId, MapDef>;

/**
 * 地形专属节点（docs/levels.md 第 2.5 节）。
 *
 * 每张图只出现一次，只改变投放形态，不改变基础刷怪。
 */
export interface TerrainNode {
  at: number;
  name: string;
  kind: 'grassAmbush' | 'scorchedPush' | 'iceRush' | 'riverFlank' | 'bridgeCollapse' | 'buildingFall';
  count: number;
  /** 涉及的兵种。 */
  set?: Partial<Record<string, number>>;
  /** 预警说明（玩家看得见的提示）。 */
  telegraph: string;
}

export const TERRAIN_NODES: Record<MapId, TerrainNode[]> = {
  proving: [],
  jungle: [
    { at: 135, name: '草中伏击', kind: 'grassAmbush', count: 8, set: { grunt: 1 }, telegraph: '草叶摇动' },
    { at: 315, name: '焦土推进', kind: 'scorchedPush', count: 12, telegraph: '火势沿路蔓延' },
  ],
  tundra: [
    { at: 200, name: '冰面冲锋', kind: 'iceRush', count: 10, set: { scout: 1 }, telegraph: '冰面划痕飞近' },
  ],
  delta: [
    { at: 160, name: '渡河包抄', kind: 'riverFlank', count: 10, set: { scout: 0.6, bomber: 0.4 }, telegraph: '水面波纹' },
    { at: 340, name: '断桥', kind: 'bridgeCollapse', count: 0, telegraph: '桥体开裂' },
  ],
  ruins: [
    { at: 190, name: '塌楼', kind: 'buildingFall', count: 0, telegraph: '楼体抖动 0.6s' },
  ],
};

/** 冰面滑行参数（docs/maps.md 第 5 节）。 */
export const ICE = {
  /** 松开后约 1.2s 停下：v *= (1 - drag*dt) 的等效系数。 */
  drag: 0.85,
  /** 转向力矩降低比例。 */
  steer: 0.7,
  /** 进入冰面时的提示时长。 */
  hintTime: 0.3,
} as const;

/** 残楼倒塌（docs/maps.md 第 7 节）。 */
export const COLLAPSE = {
  warn: 0.6,
  dmg: 40,
  radius: 90,
  /** 砸中另一栋残楼时加速其倒塌的比例。 */
  chainHpLoss: 100,
  leaves: TILE.rubble,
} as const;
