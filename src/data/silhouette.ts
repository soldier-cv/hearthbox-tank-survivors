/**
 * 坦克剪影参数。
 *
 * **每台车有真正不同的车体形状，不是同一矩形换色换炮塔。**
 *
 * 车体形状（HullShape）：
 *   block    八角矩形（最普通的坦克底盘）
 *   wedge    前端收成楔形的破障车
 *   dart     前后都收尖的飞镖形（最快）
 *   diamond  菱形（四边都是斜的）
 *   hex      六边形（前后各一条平边）
 *   ram      矩形 + 前面一整块撞角（破门锤）
 *   cluster  中央核心 + 两侧挂舱（蜂巢感）
 *   crown    矩形 + 前缘一排铁蒺藜（铁砧的招牌）
 *
 * 这样在 28px 下，光看轮廓就能分出"哪个是尖的、哪个是方的、哪个带刺"。
 */

export type HullShape = 'block' | 'wedge' | 'dart' | 'diamond' | 'hex' | 'ram' | 'cluster' | 'crown';
export type TurretShape = 'round' | 'square' | 'hex' | 'twin' | 'dome' | 'spike';
export type BarrelShape = 'single' | 'twin' | 'long' | 'wide' | 'cannon' | 'triple';
export type SideShape = 'none' | 'block' | 'spike' | 'shield' | 'pod' | 'fin' | 'outrigger';

export interface Silhouette {
  /** 车体形状。这是第一识别特征。 */
  hull: HullShape;
  /** 总半宽 / radius（含履带）。 */
  width: number;
  /** 车体半长 / radius。 */
  length: number;
  /** 前装甲斜切 / radius。 */
  frontCut: number;
  /** 车尾斜切 / radius。 */
  rearCut: number;
  /** 炮塔形状。 */
  turret: TurretShape;
  /** 炮塔半径 / radius。 */
  turretR: number;
  /** 炮塔中心沿 x 的偏移（负 = 靠后）。 */
  turretX: number;
  /** 炮管形态。 */
  barrel: BarrelShape;
  /** 炮管末端 / radius。 */
  barrelL: number;
  /** 侧向结构。 */
  side: SideShape;
  /** 侧结构深度 / radius。 */
  sideDepth: number;
  /** 前缘铁蒺藜数量（0 = 无）。 */
  spikes: number;
  /** 履带长度系数（相对车体半长）。梯形车体要短一些。 */
  treadSpan: number;
}

/**
 * 八台坦克。每台车的"外形一句话"：
 *
 *   铁砧  方正大块 + 前缘一排铁蒺藜 + 方塔      → 撞开一切的破障车
 *   回声  细长飞镖 + 小圆塔 + 两侧尖刺          → 一支射出去的箭
 *   港湾  菱形厚甲 + 四角城垛 + 圆顶塔          → 一座会动的堡垒
 *   长矛  极窄楔形 + 超长管 + 侧向稳定支腿      → 一杆装在地面上的矛
 *   熔炉  六边形 + 加粗炮口 + 尾部烟囱          → 一台工业熔炉
 *   电弧  菱形 + 环形线圈塔 + 竖鳍              → 一个悬浮的能量核心
 *   蜂群  中央核心 + 两侧挂舱 + 双联塔          → 一个会分体的蜂巢
 *   终焉  六边形大车体 + 双联塔 + 环绕光环      → 一台要塞
 */
export const SILHOUETTES: Record<string, Silhouette> = {
  anvil: {
    hull: 'crown',
    width: 0.72,
    length: 1.16,
    frontCut: 0.2,
    rearCut: 0.12,
    turret: 'square',
    turretR: 0.3,
    turretX: -0.02,
    barrel: 'wide',
    barrelL: 1.82,
    side: 'block',
    sideDepth: 0.07,
    spikes: 5,
    treadSpan: 0.92,
  },
  echo: {
    hull: 'dart',
    width: 0.6,
    length: 1.34,
    frontCut: 0.5,
    rearCut: 0.34,
    turret: 'round',
    turretR: 0.22,
    turretX: -0.06,
    barrel: 'single',
    barrelL: 1.98,
    side: 'spike',
    sideDepth: 0.09,
    spikes: 0,
    treadSpan: 0.72,
  },
  bastion: {
    hull: 'diamond',
    width: 0.82,
    length: 1.12,
    frontCut: 0.16,
    rearCut: 0.16,
    turret: 'dome',
    turretR: 0.34,
    turretX: -0.02,
    barrel: 'cannon',
    barrelL: 1.72,
    side: 'shield',
    sideDepth: 0.1,
    spikes: 0,
    treadSpan: 0.78,
  },
  lance: {
    hull: 'wedge',
    width: 0.54,
    length: 1.4,
    frontCut: 0.55,
    rearCut: 0.1,
    turret: 'round',
    turretR: 0.2,
    turretX: -0.12,
    barrel: 'long',
    barrelL: 2.24,
    side: 'outrigger',
    sideDepth: 0.12,
    spikes: 0,
    treadSpan: 0.86,
  },
  furnace: {
    hull: 'hex',
    width: 0.78,
    length: 1.14,
    frontCut: 0.14,
    rearCut: 0.14,
    turret: 'hex',
    turretR: 0.33,
    turretX: 0,
    barrel: 'cannon',
    barrelL: 1.74,
    side: 'block',
    sideDepth: 0.08,
    spikes: 0,
    treadSpan: 0.88,
  },
  arc: {
    hull: 'diamond',
    width: 0.66,
    length: 1.22,
    frontCut: 0.2,
    rearCut: 0.2,
    turret: 'round',
    turretR: 0.3,
    turretX: 0,
    barrel: 'single',
    barrelL: 1.88,
    side: 'fin',
    sideDepth: 0.08,
    spikes: 0,
    treadSpan: 0.76,
  },
  swarm: {
    hull: 'cluster',
    width: 0.74,
    length: 1.16,
    frontCut: 0.24,
    rearCut: 0.24,
    turret: 'twin',
    turretR: 0.24,
    turretX: -0.04,
    barrel: 'twin',
    barrelL: 1.78,
    side: 'pod',
    sideDepth: 0.12,
    spikes: 0,
    treadSpan: 0.8,
  },
  mk2: {
    hull: 'hex',
    width: 0.76,
    length: 1.24,
    frontCut: 0.3,
    rearCut: 0.3,
    turret: 'spike',
    turretR: 0.36,
    turretX: 0,
    barrel: 'triple',
    barrelL: 1.9,
    side: 'fin',
    sideDepth: 0.09,
    spikes: 0,
    treadSpan: 0.84,
  },
};

export const DEFAULT_SILHOUETTE: Silhouette = {
  hull: 'block',
  width: 0.7,
  length: 1.2,
  frontCut: 0.3,
  rearCut: 0.16,
  turret: 'round',
  turretR: 0.28,
  turretX: 0,
  barrel: 'single',
  barrelL: 1.88,
  side: 'none',
  sideDepth: 0,
  spikes: 0,
  treadSpan: 0.9,
};

export function silhouetteOf(model: string): Silhouette {
  return SILHOUETTES[model] ?? DEFAULT_SILHOUETTE;
}

/**
 * 履带基准。所有车共用。
 *
 * 履带贴着车体两侧，沿车长（x 轴）延伸。画错方向会变成"翅膀"。
 */
export const TREAD = {
  /** 单条履带宽度 / radius。 */
  width: 0.19,
  /** 履带前后超出车体的量 / radius。 */
  lengthPad: 0.06,
} as const;
