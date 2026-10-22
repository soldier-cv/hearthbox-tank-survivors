/**
 * 战场：地形生成、通行判定、可破坏、视线遮挡（docs/maps.md）。
 *
 * 五套生成器都是纯函数，只依赖 FxRng 之外的逻辑随机流（由调用方传入），
 * 因此同一 seed 生成同一张图。
 *
 * 三条硬规矩（docs/maps.md 第 11 节）：
 *   1. 地形只改变"怎么走"，不改数值
 *   2. 第一次遇到不能觉得不公平 → 全部有预警或破绽
 *   3. 任何地形都必须有第二条路
 */

import { CONFIG } from './config';
import {
  TILE,
  TILE_RULES,
  type TileType,
  type MapDef,
  type TerrainNode,
  TERRAIN_NODES,
} from './data/maps';
import type { RngView } from './rng';

const T = CONFIG.tile;

/** 每局重生成，但中心永远留一块空地。 */
const SAFE_R = 205;

export interface TileHit {
  type: TileType;
  tx: number;
  ty: number;
}

export class World {
  readonly cols: number;
  readonly rows: number;
  readonly w: number;
  readonly h: number;

  readonly grid: Uint8Array;
  readonly hp: Float32Array;
  /** 草丛燃烧剩余时间（秒），0 = 未燃烧。 */
  readonly burn: Float32Array;
  /** 桥 / 残楼倒塌预警剩余时间。 */
  readonly warn: Float32Array;

  spawnCenter = { x: 0, y: 0 };
  /** 水网：河道的 y 范围；其他图为 null。 */
  river: { fromCol: number; toCol: number; yTop: number; yBottom: number } | null = null;
  /** 可倒塌残楼的坐标列表（废墟）。 */
  buildings: number[] = [];
  /** 桥格（打塌后两边不通）。 */
  bridges: number[] = [];
  /** 地形节点触发记录。 */
  private firedNodes = new Set<number>();

  constructor(
    readonly map: MapDef,
    private readonly rng: RngView,
  ) {
    this.cols = map.cols;
    this.rows = map.rows;
    this.w = this.cols * T;
    this.h = this.rows * T;
    this.grid = new Uint8Array(this.cols * this.rows);
    this.hp = new Float32Array(this.cols * this.rows);
    this.burn = new Float32Array(this.cols * this.rows);
    this.warn = new Float32Array(this.cols * this.rows);
    this.generate();
  }

  idx(tx: number, ty: number): number {
    return ty * this.cols + tx;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.cols && ty < this.rows;
  }

  typeAt(tx: number, ty: number): TileType {
    if (!this.inBounds(tx, ty)) return TILE.steel;
    return this.grid[this.idx(tx, ty)] as TileType;
  }

  ruleAt(tx: number, ty: number) {
    return TILE_RULES[this.typeAt(tx, ty)];
  }

  /** 该格是否阻挡移动。amphibious 决定深水能否通过。 */
  blocked(tx: number, ty: number, amphibious: boolean): boolean {
    const r = this.ruleAt(tx, ty);
    if (r.solid) {
      if (r.type === TILE.deep) return !amphibious;
      return true;
    }
    return false;
  }

  /** 炮弹是否被挡（草丛不挡弹）。 */
  blocksBullet(tx: number, ty: number): boolean {
    const r = this.ruleAt(tx, ty);
    if (r.type === TILE.grass) return false;
    return r.solid && r.blocksBullet;
  }

  /** 视线是否被挡（草丛双向遮挡）。 */
  blocksSight(tx: number, ty: number): boolean {
    const t = this.typeAt(tx, ty);
    if (t === TILE.grass) return this.burn[this.idx(tx, ty)] <= 0;
    return this.ruleAt(tx, ty).blocksSight;
  }

  /** 移速系数（浅滩、瓦砾、冰面、草地各不同）。 */
  speedMul(x: number, y: number): number {
    return this.ruleAt(Math.floor(x / T), Math.floor(y / T)).speedMul;
  }

  /** 冰面惯性系数（0..1，越大越滑）。 */
  glideAt(x: number, y: number): number {
    return this.ruleAt(Math.floor(x / T), Math.floor(y / T)).glide;
  }

  /** 该点是否在草丛里（用于遮挡绘制与"摇草"提示）。 */
  inGrass(x: number, y: number): boolean {
    return this.typeAt(Math.floor(x / T), Math.floor(y / T)) === TILE.grass;
  }

  /** 视线检查：两点之间是否有阻挡格。 Bresenham 采样，够快。 */
  hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    let tx = Math.floor(x1 / T);
    let ty = Math.floor(y1 / T);
    const ex = Math.floor(x2 / T);
    const ey = Math.floor(y2 / T);
    const dx = Math.abs(ex - tx);
    const dy = Math.abs(ey - ty);
    const sx = tx < ex ? 1 : -1;
    const sy = ty < ey ? 1 : -1;
    let err = dx - dy;
    let guard = 0;
    while (guard++ < 400) {
      if (tx === ex && ty === ey) return true;
      if (this.blocksSight(tx, ty)) return false;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        tx += sx;
      }
      if (e2 < dx) {
        err += dx;
        ty += sy;
      }
    }
    return true;
  }

  // ===================================================================
  // 生成
  // ===================================================================

  private setTile(tx: number, ty: number, type: TileType): void {
    if (!this.inBounds(tx, ty)) return;
    const i = this.idx(tx, ty);
    this.grid[i] = type;
    const rule = TILE_RULES[type];
    this.hp[i] = rule.destructible ? rule.hp : 0;
  }

  private overlapsSafe(tx: number, ty: number, tw: number, th: number): boolean {
    const cx = this.w / 2;
    const cy = this.h / 2;
    const x0 = tx * T;
    const y0 = ty * T;
    const x1 = (tx + tw) * T;
    const y1 = (ty + th) * T;
    const nx = Math.max(x0, Math.min(cx, x1));
    const ny = Math.max(y0, Math.min(cy, y1));
    return Math.hypot(nx - cx, ny - cy) < SAFE_R;
  }

  /** 只填空地的填充（不覆盖已有地形）。 */
  private fillIfEmpty(type: TileType, tx: number, ty: number, tw: number, th: number): boolean {
    let any = false;
    for (let j = 0; j < th; j += 1) {
      for (let i = 0; i < tw; i += 1) {
        const tx2 = tx + i;
        const ty2 = ty + j;
        if (!this.inBounds(tx2, ty2)) continue;
        if (this.typeAt(tx2, ty2) !== TILE.empty) continue;
        this.setTile(tx2, ty2, type);
        any = true;
      }
    }
    return any;
  }

  private walls(): void {
    for (let x = 0; x < this.cols; x += 1) {
      this.setTile(x, 0, TILE.steel);
      this.setTile(x, this.rows - 1, TILE.steel);
    }
    for (let y = 0; y < this.rows; y += 1) {
      this.setTile(0, y, TILE.steel);
      this.setTile(this.cols - 1, y, TILE.steel);
    }
  }

  /** 砖墙群 + 出生外环掩体，所有图共用的基础结构。 */
  private brickClusters(count: number, steelCount: number): void {
    let placed = 0;
    let tries = 0;
    while (placed < count && tries++ < 900) {
      const tw = this.rng.int(1, 5);
      const th = this.rng.int(1, 3);
      const tx = this.rng.int(2, this.cols - 3 - tw);
      const ty = this.rng.int(2, this.rows - 3 - th);
      if (this.overlapsSafe(tx, ty, tw, th)) continue;
      if (this.rng.chance(0.16)) {
        // 偶尔一段长墙，制造通道感
        const lw = this.rng.int(5, 8);
        if (this.fillIfEmpty(TILE.brick, tx, ty, lw, 1)) placed += 1;
        continue;
      }
      if (this.fillIfEmpty(TILE.brick, tx, ty, tw, th)) placed += 1;
    }

    let steel = 0;
    tries = 0;
    while (steel < steelCount && tries++ < 400) {
      const sw = this.rng.int(1, 2);
      const sh = this.rng.int(1, 2);
      const sx = this.rng.int(4, this.cols - 5 - sw);
      const sy = this.rng.int(4, this.rows - 5 - sh);
      if (this.overlapsSafe(sx, sy, sw, sh)) continue;
      if (this.fillIfEmpty(TILE.steel, sx, sy, sw, sh)) steel += 1;
    }

    // 出生点外圈矮墙
    for (let a = 0; a < 12; a += 1) {
      if (this.rng.chance(0.22)) continue;
      const ang = (a / 12) * Math.PI * 2 + this.rng.range(-0.08, 0.08);
      const rad = this.rng.range(300, 470);
      const bx = Math.floor((this.w / 2 + Math.cos(ang) * rad) / T);
      const by = Math.floor((this.h / 2 + Math.sin(ang) * rad) / T);
      const bw = this.rng.int(1, 2);
      const bh = this.rng.int(1, 2);
      this.fillIfEmpty(TILE.brick, bx, by, bw, bh);
    }
  }

  private generate(): void {
    this.walls();
    const cx = this.w / 2;
    const cy = this.h / 2;
    this.spawnCenter = { x: cx, y: cy };

    switch (this.map.generator) {
      case 'proving':
        this.brickClusters(this.map.bricks, this.map.steel);
        break;
      case 'jungle':
        this.jungle();
        break;
      case 'tundra':
        this.tundra();
        break;
      case 'delta':
        this.delta();
        break;
      case 'ruins':
        this.ruins();
        break;
      default:
        this.brickClusters(this.map.bricks, this.map.steel);
        break;
    }

    // 保证中心可通行：清出安全区
    this.clearSafeCenter();
    // 保证出生点周围有路（外环掩体不能把中心封死）
    this.ensureReachable();
  }

  /** 试验场之外的地形都用这个清中心。 */
  private clearSafeCenter(): void {
    const r = Math.ceil(SAFE_R / T);
    const ctx = Math.floor(this.w / 2 / T);
    const cty = Math.floor(this.h / 2 / T);
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.hypot(dx, dy) > r) continue;
        const tx = ctx + dx;
        const ty = cty + dy;
        if (!this.inBounds(tx, ty)) continue;
        if (this.typeAt(tx, ty) !== TILE.empty && this.typeAt(tx, ty) !== TILE.steel) {
          this.setTile(tx, ty, TILE.empty);
        }
      }
    }
  }

  /**
   * 洪水填充检查：出生空地能到达足够多的格子。
   *
   * 这是"任何地形都不能是唯一解法"的兜底。若可达面积过小，把阻挡格清成空地。
   */
  private ensureReachable(): void {
    const startTx = Math.floor(this.spawnCenter.x / T);
    const startTy = Math.floor(this.spawnCenter.y / T);
    const seen = new Uint8Array(this.cols * this.rows);
    const queue: number[] = [this.idx(startTx, startTy)];
    seen[queue[0]] = 1;
    let count = 0;

    while (queue.length > 0) {
      const i = queue.pop() as number;
      count += 1;
      const tx = i % this.cols;
      const ty = (i - tx) / this.cols;
      const nb = [
        [tx + 1, ty],
        [tx - 1, ty],
        [tx, ty + 1],
        [tx, ty - 1],
      ];
      for (const [nx, ny] of nb) {
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (seen[ni]) continue;
        // 以"不能渡水的坦克"为准做保守检查
        if (this.blocked(nx, ny, false)) continue;
        seen[ni] = 1;
        queue.push(ni);
      }
    }

    const need = this.cols * this.rows * 0.34;
    if (count >= need) return;

    // 不够：把深水与砖墙各清一些，直到可达面积达标
    let guard = 0;
    while (count < need && guard++ < 6000) {
      const tx = this.rng.int(2, this.cols - 2);
      const ty = this.rng.int(2, this.rows - 2);
      const t = this.typeAt(tx, ty);
      if (t === TILE.steel || t === TILE.empty) continue;
      this.setTile(tx, ty, t === TILE.deep ? TILE.shallow : TILE.empty);
      count += 1;
    }
  }

  // ---- 丛林：草丛成片 + 枯木 + 浅溪 ----
  private jungle(): void {
    this.brickClusters(this.map.bricks, this.map.steel);

    // 草丛：12–16 片，每片 3–8 格
    const clumps = this.rng.int(12, 17);
    for (let c = 0; c < clumps; c += 1) {
      let placed = 0;
      let tries = 0;
      while (placed < this.rng.int(3, 9) && tries++ < 30) {
        const tw = this.rng.int(2, 4);
        const th = this.rng.int(2, 4);
        const tx = this.rng.int(2, this.cols - 3 - tw);
        const ty = this.rng.int(2, this.rows - 3 - th);
        if (this.overlapsSafe(tx, ty, tw, th)) continue;
        if (this.fillIfEmpty(TILE.grass, tx, ty, tw, th)) placed += 1;
      }
    }

    // 浅溪：一条 2 格宽的折线，横穿地图（移速降低但所有坦克可过）
    let y = Math.floor(this.rows * this.rng.range(0.25, 0.75));
    for (let x = 1; x < this.cols - 1; x += 1) {
      if (this.rng.chance(0.25)) y += this.rng.sign();
      y = Math.max(2, Math.min(this.rows - 3, y));
      for (const dy of [0, 1]) {
        if (this.typeAt(x, y + dy) === TILE.empty) this.setTile(x, y + dy, TILE.brick);
        // 溪流压在砖上时把砖冲掉
        if (this.typeAt(x, y + dy) === TILE.brick && this.rng.chance(0.7)) {
          this.setTile(x, y + dy, TILE.empty);
        }
      }
    }
    // 枯木：单格可摧毁障碍
    for (let i = 0; i < 30; i += 1) {
      const tx = this.rng.int(2, this.cols - 2);
      const ty = this.rng.int(2, this.rows - 2);
      if (this.typeAt(tx, ty) !== TILE.empty) continue;
      if (this.overlapsSafe(tx, ty, 1, 1)) continue;
      this.setTile(tx, ty, TILE.brick);
      this.hp[this.idx(tx, ty)] = 8;
    }
  }

  // ---- 冰原：冰面大片 + 雪地 + 冰裂缝 ----
  private tundra(): void {
    // 雪地打底
    for (let ty = 1; ty < this.rows - 1; ty += 1) {
      for (let tx = 1; tx < this.cols - 1; tx += 1) {
        this.grid[this.idx(tx, ty)] = TILE.snow;
        this.hp[this.idx(tx, ty)] = 0;
      }
    }

    // 冰面：5–8 个大湖
    const lakes = this.rng.int(5, 9);
    for (let l = 0; l < lakes; l += 1) {
      const lx = this.rng.int(6, this.cols - 12);
      const ly = this.rng.int(6, this.rows - 12);
      const rw = this.rng.int(5, 11);
      const rh = this.rng.int(4, 8);
      for (let dy = -rh; dy <= rh; dy += 1) {
        for (let dx = -rw; dx <= rw; dx += 1) {
          const f = (dx / rw) ** 2 + (dy / rh) ** 2;
          if (f > 1) continue;
          const tx = lx + dx;
          const ty = ly + dy;
          if (!this.inBounds(tx, ty)) continue;
          if (this.overlapsSafe(tx, ty, 1, 1)) continue;
          this.setTile(tx, ty, TILE.ice);
        }
      }
    }

    this.brickClusters(this.map.bricks, this.map.steel);

    // 冰裂缝：不可通过但炮弹能飞的窄沟
    const cracks = this.rng.int(4, 7);
    for (let c = 0; c < cracks; c += 1) {
      const vertical = this.rng.chance(0.5);
      let tx = this.rng.int(5, this.cols - 6);
      let ty = this.rng.int(5, this.rows - 6);
      const len = this.rng.int(5, 12);
      for (let i = 0; i < len; i += 1) {
        if (this.overlapsSafe(tx, ty, 1, 1)) {
          if (vertical) ty += 1;
          else tx += 1;
          continue;
        }
        this.setTile(tx, ty, TILE.steel);
        if (vertical) ty += 1;
        else tx += 1;
        if (!this.inBounds(tx, ty)) break;
      }
    }
  }

  // ---- 水网：横贯河道 + 桥 + 浅滩 ----
  private delta(): void {
    // 先铺砖与钢
    this.brickClusters(this.map.bricks, this.map.steel);

    // 主河：横向，宽 4–5 格
    const riverTop = Math.floor(this.rows * this.rng.range(0.4, 0.6));
    const width = this.rng.int(4, 6);
    let y = riverTop;
    for (let x = 1; x < this.cols - 1; x += 1) {
      if (this.rng.chance(0.3)) y += this.rng.sign();
      y = Math.max(3, Math.min(this.rows - 4 - width, y));
      for (let d = 0; d < width; d += 1) {
        this.setTile(x, y + d, TILE.deep);
      }
      // 两岸浅滩
      if (this.typeAt(x, y - 1) !== TILE.deep) this.setTile(x, y - 1, TILE.shallow);
      if (this.typeAt(x, y + width) !== TILE.deep) this.setTile(x, y + width, TILE.shallow);
    }
    this.river = {
      fromCol: 1,
      toCol: this.cols - 2,
      yTop: y * T,
      yBottom: (riverTop + width) * T,
    };

    // 桥：3 座，纵向跨过整条河
    const bridgeCols = [
      Math.floor(this.cols * 0.22),
      Math.floor(this.cols * 0.5),
      Math.floor(this.cols * 0.78),
    ];
    for (const bx of bridgeCols) {
      for (let ty = riverTop - 1; ty < riverTop + width + 2; ty += 1) {
        if (!this.inBounds(bx, ty)) continue;
        this.setTile(bx, ty, TILE.bridge);
        this.bridges.push(this.idx(bx, ty));
      }
    }

    // 支汊：两条窄河，增加包抄路线
    for (let k = 0; k < 2; k += 1) {
      const sx = this.rng.int(6, this.cols - 7);
      let ty = k === 0 ? 2 : this.rows - 3;
      const step = k === 0 ? 1 : -1;
      for (let i = 0; i < this.rng.int(8, 16); i += 1) {
        for (let w = 0; w < 2; w += 1) {
          if (this.inBounds(sx + w, ty)) this.setTile(sx + w, ty, TILE.deep);
        }
        ty += step;
        if (!this.inBounds(sx, ty)) break;
      }
    }
  }

  // ---- 废墟：高墙 + 残楼 + 瓦砾 + 弹坑 ----
  private ruins(): void {
    // 高墙：3–6 格长的不可摧毁段
    const walls = this.rng.int(10, 15);
    for (let w = 0; w < walls; w += 1) {
      const vertical = this.rng.chance(0.45);
      const len = this.rng.int(3, 7);
      let tx = this.rng.int(3, this.cols - 4);
      let ty = this.rng.int(3, this.rows - 4);
      for (let i = 0; i < len; i += 1) {
        if (!this.inBounds(tx, ty)) break;
        if (this.overlapsSafe(tx, ty, 1, 1)) {
          if (vertical) ty += 1;
          else tx += 1;
          continue;
        }
        this.setTile(tx, ty, TILE.steel);
        if (vertical) ty += 1;
        else tx += 1;
      }
    }

    // 残楼：2×2，可摧毁并倒塌
    const buildings = this.rng.int(8, 12);
    for (let b = 0; b < buildings; b += 1) {
      const tx = this.rng.int(4, this.cols - 6);
      const ty = this.rng.int(4, this.rows - 6);
      if (this.overlapsSafe(tx, ty, 2, 2)) continue;
      if (this.fillIfEmpty(TILE.building, tx, ty, 2, 2)) {
        this.buildings.push(this.idx(tx, ty), this.idx(tx + 1, ty), this.idx(tx + 1, ty + 1), this.idx(tx, ty + 1));
        for (const i of [
          this.idx(tx, ty),
          this.idx(tx + 1, ty),
          this.idx(tx + 1, ty + 1),
          this.idx(tx, ty + 1),
        ]) {
          this.hp[i] = TILE_RULES[TILE.building].hp;
        }
      }
    }

    // 瓦砾
    for (let i = 0; i < 40; i += 1) {
      const tx = this.rng.int(2, this.cols - 2);
      const ty = this.rng.int(2, this.rows - 2);
      if (this.typeAt(tx, ty) !== TILE.empty) continue;
      if (this.overlapsSafe(tx, ty, 1, 1)) continue;
      this.setTile(tx, ty, TILE.rubble);
    }

    // 弹坑（不影响移动，只是视觉凹陷）
    for (let i = 0; i < 16; i += 1) {
      const tx = this.rng.int(3, this.cols - 3);
      const ty = this.rng.int(3, this.rows - 3);
      if (this.typeAt(tx, ty) !== TILE.empty) continue;
      this.setTile(tx, ty, TILE.crater);
    }

    this.brickClusters(18, 0);
  }

  // ===================================================================
  // 运行时改变
  // ===================================================================

  /**
   * 伤害一格。返回 'destroyed' 时调用方负责处理后续（倒塌、成浅滩、燃烧）。
   */
  damage(tx: number, ty: number, dmg: number): 'none' | 'damaged' | 'steel' | 'destroyed' {
    if (!this.inBounds(tx, ty)) return 'none';
    const i = this.idx(tx, ty);
    const t = this.grid[i] as TileType;
    const rule = TILE_RULES[t];
    if (!rule.destructible) return t === TILE.steel ? 'steel' : 'none';
    this.hp[i] -= dmg;
    if (this.hp[i] > 0) return 'damaged';

    // 摧毁后的落地形态
    if (t === TILE.building) {
      this.grid[i] = TILE.rubble;
      this.hp[i] = TILE_RULES[TILE.rubble].hp;
      this.warn[i] = 0;
      return 'destroyed';
    }
    if (t === TILE.bridge) {
      // 桥塌了变成深水：两边都过不去，但敌人会从水路来
      this.grid[i] = TILE.deep;
      this.hp[i] = 0;
      return 'destroyed';
    }
    if (t === TILE.grass) {
      this.grid[i] = TILE.empty;
      this.hp[i] = 0;
      this.burn[i] = 30;
      return 'destroyed';
    }
    this.grid[i] = TILE.empty;
    this.hp[i] = 0;
    return 'destroyed';
  }

  /** 对爆炸范围内的格子造成伤害，并把草点燃。 */
  splash(cx: number, cy: number, radius: number, dmg: number, out: number[]): void {
    out.length = 0;
    const t0x = Math.max(1, Math.floor((cx - radius) / T));
    const t1x = Math.min(this.cols - 2, Math.floor((cx + radius) / T));
    const t0y = Math.max(1, Math.floor((cy - radius) / T));
    const t1y = Math.min(this.rows - 2, Math.floor((cy + radius) / T));
    for (let ty = t0y; ty <= t1y; ty += 1) {
      for (let tx = t0x; tx <= t1x; tx += 1) {
        const px = tx * T + T / 2;
        const py = ty * T + T / 2;
        if (Math.hypot(px - cx, py - cy) > radius + T * 0.5) continue;
        const i = this.idx(tx, ty);
        const t = this.grid[i] as TileType;
        if (t === TILE.grass) {
          this.burn[i] = 30;
          this.damage(tx, ty, dmg);
        } else if (TILE_RULES[t].destructible) {
          this.damage(tx, ty, dmg);
        }
        out.push(i);
      }
    }
  }

  /** 草烧过后 30 秒消失，恢复成可通行的地面。 */
  update(dt: number): void {
    for (let i = 0; i < this.burn.length; i += 1) {
      if (this.burn[i] <= 0) continue;
      this.burn[i] -= dt;
      if (this.burn[i] <= 0) {
        this.burn[i] = 0;
        if (this.grid[i] === TILE.empty) continue;
      }
    }
  }

  /** 某残楼是否进入倒塌预警。 */
  collapseWarn(i: number, seconds: number): void {
    if (this.warn[i] <= 0) this.warn[i] = seconds;
  }

  /** 烧一片草（火池蔓延用）。 */
  burnAt(x: number, y: number, radius: number): void {
    const t0x = Math.max(1, Math.floor((x - radius) / T));
    const t1x = Math.min(this.cols - 2, Math.floor((x + radius) / T));
    const t0y = Math.max(1, Math.floor((y - radius) / T));
    const t1y = Math.min(this.rows - 2, Math.floor((y + radius) / T));
    for (let ty = t0y; ty <= t1y; ty += 1) {
      for (let tx = t0x; tx <= t1x; tx += 1) {
        if (this.typeAt(tx, ty) !== TILE.grass) continue;
        const i = this.idx(tx, ty);
        this.burn[i] = 30;
      }
    }
  }

  // ===================================================================
  // 出生点选择
  // ===================================================================

  /** 以 (x,y) 为圆心、[minR,maxR] 的环上找一个可通行格。 */
  findSpawn(x: number, y: number, minR: number, maxR: number, clearance = 22, amphibious = false): { x: number; y: number } | null {
    for (let i = 0; i < 28; i += 1) {
      const a = this.rng.angle();
      const rr = this.rng.range(minR, maxR);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (px < 60 || py < 60 || px > this.w - 60 || py > this.h - 60) continue;
      if (!this.areaFree(px, py, clearance, amphibious)) continue;
      return { x: px, y: py };
    }
    return null;
  }

  areaFree(x: number, y: number, r: number, amphibious = false): boolean {
    const t0x = Math.floor((x - r) / T);
    const t1x = Math.floor((x + r) / T);
    const t0y = Math.floor((y - r) / T);
    const t1y = Math.floor((y + r) / T);
    for (let ty = t0y; ty <= t1y; ty += 1) {
      for (let tx = t0x; tx <= t1x; tx += 1) {
        if (!this.inBounds(tx, ty)) continue;
        if (this.blocked(tx, ty, amphibious)) return false;
      }
    }
    return true;
  }

  /** 圆形推出墙体；返回是否发生碰撞。 */
  resolveCircle(e: { x: number; y: number }, radius: number, amphibious = false): boolean {
    let hit = false;
    for (let pass = 0; pass < 2; pass += 1) {
      const t0x = Math.floor((e.x - radius) / T);
      const t1x = Math.floor((e.x + radius) / T);
      const t0y = Math.floor((e.y - radius) / T);
      const t1y = Math.floor((e.y + radius) / T);
      for (let ty = t0y; ty <= t1y; ty += 1) {
        for (let tx = t0x; tx <= t1x; tx += 1) {
          if (!this.inBounds(tx, ty)) continue;
          if (!this.blocked(tx, ty, amphibious)) continue;
          const c = circleRect(e.x, e.y, radius, tx * T, ty * T, T, T);
          if (!c) continue;
          e.x += c.x * c.depth;
          e.y += c.y * c.depth;
          hit = true;
        }
      }
    }
    if (e.x < radius) { e.x = radius; hit = true; }
    if (e.y < radius) { e.y = radius; hit = true; }
    if (e.x > this.w - radius) { e.x = this.w - radius; hit = true; }
    if (e.y > this.h - radius) { e.y = this.h - radius; hit = true; }
    return hit;
  }

  // ===================================================================
  // 地形专属节点
  // ===================================================================

  nodesFor(): TerrainNode[] {
    return TERRAIN_NODES[this.map.id] ?? [];
  }

  /** 节点到点则返回并记录（只触发一次）。 */
  dueNode(time: number): TerrainNode | null {
    for (const n of this.nodesFor()) {
      if (time >= n.at && !this.firedNodes.has(n.at)) {
        this.firedNodes.add(n.at);
        return n;
      }
    }
    return null;
  }

  resetNodes(): void {
    this.firedNodes.clear();
  }

  /** 水网：从河对岸找包抄点。 */
  riverBankPoint(): { x: number; y: number } | null {
    if (!this.river) return null;
    const tx = this.rng.int(2, this.cols - 3);
    const ty = Math.floor(this.rng.range(this.river.yTop, this.river.yBottom) / T);
    if (!this.inBounds(tx, ty)) return null;
    return { x: tx * T + T / 2, y: ty * T + T / 2 };
  }

  /** 随机空地（补给、掉落用）。 */
  randomFreePoint(avoidX: number, avoidY: number, avoidR: number, amphibious = false): { x: number; y: number } {
    for (let i = 0; i < 80; i += 1) {
      const x = this.rng.range(80, this.w - 80);
      const y = this.rng.range(80, this.h - 80);
      if (avoidX >= 0 && Math.hypot(x - avoidX, y - avoidY) < avoidR) continue;
      if (!this.areaFree(x, y, 30, amphibious)) continue;
      // 补给不刷在深水里
      if (this.typeAt(Math.floor(x / T), Math.floor(y / T)) === TILE.deep) continue;
      return { x, y };
    }
    return { x: this.w / 2, y: this.h / 2 };
  }

  /** 草丛里某个点的"摇动"相位：供渲染层提示草里有敌人。 */
  grassSway(x: number, y: number, time: number): number {
    const tx = Math.floor(x / T);
    const ty = Math.floor(y / T);
    const h = (Math.imul(tx | 0, 73856093) ^ Math.imul(ty | 0, 19349663)) >>> 0;
    return Math.sin(time * 2.5 + (h % 628) / 100) * 0.5 + 0.5;
  }

  /** 烧焦的草还剩多久（渲染层据此画焦土）。 */
  burnLeft(i: number): number {
    return this.burn[i];
  }
}

export function circleRect(
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): { x: number; y: number; depth: number } | null {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx;
  const dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  const d = Math.sqrt(d2);
  if (d < 0.0001) {
    // 圆心在矩形内：沿最近的边推出
    const left = cx - rx;
    const right = rx + rw - cx;
    const top = cy - ry;
    const bottom = ry + rh - cy;
    const m = Math.min(left, right, top, bottom);
    if (m === left) return { x: -1, y: 0, depth: left + r };
    if (m === right) return { x: 1, y: 0, depth: right + r };
    if (m === top) return { x: 0, y: -1, depth: top + r };
    return { x: 0, y: 1, depth: bottom + r };
  }
  const depth = r - d;
  return { x: dx / d, y: dy / d, depth };
}

export const TILE_SIZE = T;
export const SAFE_RADIUS = SAFE_R;
