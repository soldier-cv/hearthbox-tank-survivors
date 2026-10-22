/**
 * 常量层。
 *
 * 规则：这里的东西运行中永远不变。会被金手指、设置、难度改的数值放 tuning.ts。
 * 代码里不允许出现裸数字 —— 要么从 CONFIG 来，要么从 tuning 来。
 */

export const CONFIG = {
  /** 逻辑分辨率，必须与 game.json 的 display 一致。 */
  width: 960,
  height: 540,
  /** 战斗网格。40px 是"坦克直径 28 还能在两格间穿行"的尺寸。 */
  tile: 40,
} as const;

/**
 * 色板：核心 21 色。
 * 地形与涂装另有 14 色扩展档，见 docs/art.md —— 那些不进这里，
 * 因为它们分属 maps.ts 与 tanks.ts。
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

export type ColorKey = keyof typeof COLORS;
