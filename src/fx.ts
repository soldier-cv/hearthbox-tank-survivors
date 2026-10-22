/**
 * 特效总线（docs/fx.md）。
 *
 * 规则：逻辑层只喊"发生了什么"，渲染层决定"画成什么样"。
 * 所有粒子走对象池，热路径不 new、不 push 到无界数组，不逐帧排序。
 *
 * 终极卡的专属特效不受并发上限约束（视觉预算不封顶），但各自硬上限 1。
 */

import { COLORS } from './config';
import type { FxRng } from './rng';

/** 特效 id。 */
export type FxId =
  | 'muzzle'
  | 'trail'
  | 'hit'
  | 'crit'
  | 'blast'
  | 'chain'
  | 'pierce'
  | 'kill'
  | 'shieldBreak'
  | 'shieldHit'
  | 'pickup'
  | 'nova'
  | 'bossPhase'
  | 'levelup'
  | 'ultRing'
  | 'ultRail'
  | 'ultChain'
  | 'ultSwarm'
  | 'ultNova';

/** 震动 id（走设置项，可关）。 */
export type ShakeId = 'shakeHit' | 'shakeBlast' | 'shakeBoss' | 'shakeNova';

const SHAKE: Record<ShakeId, { amp: number; time: number }> = {
  shakeHit: { amp: 3, time: 0.08 },
  shakeBlast: { amp: 6, time: 0.12 },
  shakeBoss: { amp: 10, time: 0.18 },
  shakeNova: { amp: 14, time: 0.22 },
};

/** 绘制层：只按层画，不排序。 */
export type Layer = 0 | 1 | 2 | 3;
export const LAYER = { ground: 0, underEntity: 1, overEntity: 2, overlay: 3 } as const;

/** 粒子画法。每种 kind 对应 render 里一条分支，不用 flag 复用来编码语义。 */
const DOT = 0;      // 小圆点
const SHARD = 1;    // 旋转方形碎块
const RING = 2;     // 外扩圆环
const SEG = 3;      // 两点之间的线段
const STAR = 4;     // 从中心向外的射线束
const MESH = 5;     // 六边形 / 五边形网格（可碎裂外扩）
const ZIGZAG = 6;   // 电弧折线（源 → 目标）
const WAVE = 7;     // 波浪传导线

export interface Particle {
  alive: boolean;
  kind: number;
  layer: Layer;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  drag: number;
  color: string;
  /** 线段 / 折线的终点。 */
  x2: number;
  y2: number;
  /** RING: 外扩进度；MESH: 是否碎裂外扩；STAR: 射线根数。 */
  grow: number;
  alpha: number;
  glow: boolean;
  rot: number;
  spin: number;
  /** 归属的特效 id，回收时减计数。 */
  owner: FxId | null;
}

/** 每种特效的并发上限（docs/fx.md 第 3 节）。 */
const LIMITS: Partial<Record<FxId, number>> = {
  muzzle: 12,
  trail: 400,
  hit: 60,
  crit: 20,
  blast: 24,
  chain: 16,
  pierce: 30,
  kill: 90,
  shieldBreak: 2,
  shieldHit: 8,
  pickup: 40,
  nova: 1,
  bossPhase: 1,
  levelup: 1,
  ultRing: 1,
  ultRail: 1,
  ultChain: 1,
  ultSwarm: 1,
  ultNova: 1,
};

export class Fx {
  private readonly pool: Particle[] = [];
  private cursor = 0;
  private readonly live = new Map<FxId, number>();

  shakeX = 0;
  shakeY = 0;
  private shakeTime = 0;
  private shakeAmp = 0;
  private shakePhase = 0;
  /** 震动强度系数：来自设置项（强 1 / 弱 0.4 / 关 0）。 */
  shakeScale = 1;

  /** 白闪（终极齐射）。 */
  flash = 0;
  /** 屏幕下压（壁垒形态）。 */
  press = 0;
  /** 低血量暗角 0..1。 */
  vignette = 0;
  /** 命中定格：逻辑层读它决定是否缩 dt。 */
  hitStop = 0;

  constructor(capacity: number, private readonly rng: FxRng) {
    for (let i = 0; i < capacity; i += 1) {
      this.pool.push({
        alive: false, kind: DOT, layer: LAYER.overEntity,
        x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, drag: 3,
        color: COLORS.textBright, x2: 0, y2: 0, grow: 0, alpha: 1, glow: false,
        rot: 0, spin: 0, owner: null,
      });
    }
  }

  /** 环形查找空闲槽位；全满则放弃本次新增（帧预算优先）。 */
  private alloc(owner: FxId): Particle | null {
    const n = this.pool.length;
    for (let i = 0; i < n; i += 1) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % n;
      if (!p.alive) {
        p.owner = owner;
        return p;
      }
    }
    return null;
  }

  /** 拿一个槽位，失败时把计数还回去。 */
  private take(id: FxId): Particle | null {
    const limit = LIMITS[id];
    if (limit !== undefined) {
      const cur = this.live.get(id) ?? 0;
      if (cur >= limit) return null;
      this.live.set(id, cur + 1);
    }
    const p = this.alloc(id);
    if (!p) {
      if (limit !== undefined) this.countDown(id);
      return null;
    }
    return p;
  }

  private countDown(id: FxId): void {
    const cur = this.live.get(id) ?? 0;
    if (cur <= 1) this.live.delete(id);
    else this.live.set(id, cur - 1);
  }

  // ===================================================================
  // 触发接口：逻辑层只调这些
  // ===================================================================

  /** 炮口：三条短射线 + 一个亮点。 */
  muzzle(x: number, y: number, angle: number, color: string): void {
    const p = this.take('muzzle');
    if (!p) return;
    reset(p, STAR, LAYER.overEntity, x, y, 0.08, color, 10, 1, true);
    p.grow = 3;
    p.rot = angle;
    const d = this.take('muzzle');
    if (d) {
      reset(d, DOT, LAYER.overEntity, x + Math.cos(angle) * 6, y + Math.sin(angle) * 6, 0.08, COLORS.p1Light, 3, 1, true);
    }
  }

  /** 子弹拖尾：沿弹道的离散分段。 */
  trail(x: number, y: number, px: number, py: number, color: string): void {
    const p = this.take('trail');
    if (!p) return;
    reset(p, SEG, LAYER.underEntity, x, y, 0.12, color, 3, 1, true);
    p.x2 = px;
    p.y2 = py;
  }

  /** 命中：星形细射线 + 中心亮点。 */
  hit(x: number, y: number, color: string, crit: boolean): void {
    const id = crit ? 'crit' : 'hit';
    const p = this.take(id);
    if (!p) return;
    reset(p, STAR, LAYER.overEntity, x, y, crit ? 0.18 : 0.14, color, crit ? 16 : 9, 1, true);
    p.grow = crit ? 8 : 6;
    const c = this.take(id);
    if (c) {
      reset(c, RING, LAYER.overEntity, x, y, 0.16, color, 7, 1, true);
      c.grow = 1;
    }
  }

  /** 爆炸：双层同心环 + 12 条径向射线。 */
  blast(x: number, y: number, radius: number): void {
    const ring = this.take('blast');
    if (ring) {
      reset(ring, RING, LAYER.overEntity, x, y, 0.3, COLORS.blast, radius, 1, true);
      ring.grow = 1;
    }
    const inner = this.take('blast');
    if (inner) {
      reset(inner, RING, LAYER.overEntity, x, y, 0.2, COLORS.p1Light, radius * 0.55, 1, true);
      inner.grow = 1;
    }
    const rays = this.take('blast');
    if (rays) {
      reset(rays, STAR, LAYER.overEntity, x, y, 0.24, COLORS.blast, radius * 0.95, 1, true);
      rays.grow = 12;
    }
  }

  /** 电弧连锁：源到目标的折线。 */
  chain(x1: number, y1: number, x2: number, y2: number): void {
    const p = this.take('chain');
    if (!p) return;
    reset(p, ZIGZAG, LAYER.overEntity, x1, y1, 0.16, COLORS.spark, 3, 1, true);
    p.x2 = x2;
    p.y2 = y2;
  }

  /** 穿透：穿透点留下一条垂直于弹道的短线。 */
  pierce(x: number, y: number, angle: number): void {
    const p = this.take('pierce');
    if (!p) return;
    const nx = Math.cos(angle + Math.PI / 2) * 10;
    const ny = Math.sin(angle + Math.PI / 2) * 10;
    reset(p, SEG, LAYER.overEntity, x - nx, y - ny, 0.2, COLORS.p2Light, 3, 1, true);
    p.x2 = x + nx;
    p.y2 = y + ny;
  }

  /** 敌人死亡：方形碎块飞散 + 地面淡痕。 */
  kill(x: number, y: number, size: number, color: string): void {
    const n = Math.max(6, Math.min(22, Math.round(size * 0.9)));
    let made = 0;
    for (let i = 0; i < n; i += 1) {
      const p = this.take('kill');
      if (!p) break;
      const a = this.rng.next() * Math.PI * 2;
      const sp = 60 + this.rng.next() * 160;
      reset(p, SHARD, LAYER.overEntity, x, y, 0.4 + this.rng.next() * 0.2, color, 2 + this.rng.next() * 3, 2.6, false);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.rot = this.rng.next() * Math.PI;
      p.spin = (this.rng.next() - 0.5) * 8;
      made += 1;
    }
    if (made === 0) return;

    const d = this.take('kill');
    if (d) {
      reset(d, RING, LAYER.ground, x, y, 0.6, COLORS.void, size * 1.1, 0.2, false);
      d.grow = 0;
      d.alpha = 0.35;
    }
  }

  /** 护盾破碎：六边形网格向外碎裂。 */
  shieldBreak(x: number, y: number, r: number): void {
    const p = this.take('shieldBreak');
    if (!p) return;
    reset(p, MESH, LAYER.overEntity, x, y, 0.22, COLORS.p2, r, 1, true);
    p.grow = 1;
  }

  shieldHit(x: number, y: number, r: number): void {
    const p = this.take('shieldHit');
    if (!p) return;
    reset(p, MESH, LAYER.overEntity, x, y, 0.12, COLORS.p2Light, r, 1, true);
    p.grow = 0;
  }

  /** 经验球飞向 HUD。 */
  pickup(x: number, y: number, tx: number, ty: number): void {
    const p = this.take('pickup');
    if (!p) return;
    reset(p, DOT, LAYER.overEntity, x, y, 0.25, COLORS.heal, 3, 0.5, true);
    p.vx = (tx - x) * 4;
    p.vy = (ty - y) * 4;
  }

  levelup(x: number, y: number): void {
    const ring = this.take('levelup');
    if (!ring) return;
    reset(ring, RING, LAYER.overEntity, x, y, 0.5, COLORS.p1Light, 60, 1, true);
    ring.grow = 1;
    for (let i = 0; i < 12; i += 1) {
      const p = this.take('levelup');
      if (!p) break;
      const a = (Math.PI * 2 * i) / 12;
      reset(p, SHARD, LAYER.overEntity, x + Math.cos(a) * 12, y + Math.sin(a) * 12, 0.6, COLORS.p1, 3, 0.6, true);
      p.vy = -70 - this.rng.next() * 40;
      p.vx = Math.cos(a) * 30;
      p.spin = 3;
    }
  }

  bossPhase(x: number, y: number, r: number): void {
    const p = this.take('bossPhase');
    if (!p) return;
    reset(p, RING, LAYER.overEntity, x, y, 0.5, COLORS.blast, r * 1.6, 1, true);
    p.grow = 1;
  }

  nova(x: number, y: number, r: number): void {
    const p = this.take('nova');
    if (!p) return;
    reset(p, RING, LAYER.overlay, x, y, 0.45, COLORS.p2Light, r, 1, true);
    p.alpha = 0.8;
    this.addShake('shakeNova');
  }

  // ---- 终极卡：视觉预算不封顶 ----

  /** 饱和打击：12 蓄能点同时射出 + 白闪。 */
  ultRing(x: number, y: number, r: number): void {
    const gate = this.take('ultRing');
    if (!gate) return;
    reset(gate, RING, LAYER.overlay, x, y, 0.6, COLORS.p1Light, r * 3, 1, true);
    gate.grow = 1;
    gate.alpha = 0.6;
    for (let i = 0; i < 12; i += 1) {
      const a = (Math.PI * 2 * i) / 12;
      const p = this.poolFind();
      if (!p) break;
      reset(p, DOT, LAYER.overEntity, x + Math.cos(a) * r, y + Math.sin(a) * r, 0.3, COLORS.p1Light, 4, 0.5, true);
      p.vx = Math.cos(a) * 260;
      p.vy = Math.sin(a) * 260;
    }
    this.flash = Math.max(this.flash, 0.12);
    this.addShake('shakeBoss');
  }

  /** 轨道炮：6px 白色直线贯穿全屏 + 两侧各三条速度线。 */
  ultRail(x: number, y: number, angle: number, length: number): void {
    const main = this.take('ultRail');
    if (!main) return;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    reset(main, SEG, LAYER.overlay, x, y, 0.5, COLORS.textBright, 6, 1, true);
    main.x2 = x + dx * length;
    main.y2 = y + dy * length;
    main.grow = 1;

    const nx = -dy;
    const ny = dx;
    for (const side of [1, -1]) {
      for (let i = 0; i < 3; i += 1) {
        const p = this.poolFind();
        if (!p) continue;
        const off = (i + 1) * 4 * side;
        const along = 0.2 + i * 0.25;
        const bx = x + dx * length * along + nx * off;
        const by = y + dy * length * along + ny * off;
        reset(p, SEG, LAYER.overlay, bx, by, 0.28, COLORS.p2Light, 3, 1, true);
        p.x2 = bx - dx * 30;
        p.y2 = by - dy * 30;
      }
    }
    this.addShake('shakeBlast');
  }

  /** 连锁反应：新爆点小环 + 层间波浪传导线。 */
  ultChain(x1: number, y1: number, x2: number, y2: number, r: number): void {
    const ring = this.take('ultChain');
    if (!ring) return;
    reset(ring, RING, LAYER.overEntity, x2, y2, 0.34, COLORS.blast, r, 1, true);
    ring.grow = 1;
    const link = this.poolFind();
    if (link) {
      reset(link, WAVE, LAYER.overEntity, x1, y1, 0.28, COLORS.blast, 1, 1, true);
      link.x2 = x2;
      link.y2 = y2;
    }
  }

  /** 蜂群指挥：五架无人机连成五边形网格。 */
  ultSwarm(x: number, y: number, r: number): void {
    const p = this.take('ultSwarm');
    if (!p) return;
    reset(p, MESH, LAYER.overEntity, x, y, 0.4, COLORS.drone, r, 1, true);
    p.grow = 0;
    p.size = 5;
    p.alpha = 0.4;
  }

  /** 壁垒形态：六边形网格碎裂 + 380px 冲击波 + 下压 + 漂浮碎片。 */
  ultNova(x: number, y: number): void {
    const ring = this.take('ultNova');
    if (!ring) return;
    reset(ring, RING, LAYER.overlay, x, y, 0.45, COLORS.p2Light, 380, 1, true);
    ring.grow = 1;
    ring.alpha = 0.8;

    const net = this.poolFind();
    if (net) {
      reset(net, MESH, LAYER.overEntity, x, y, 0.3, COLORS.p2, 120, 1, true);
      net.grow = 1;
    }
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i;
      const p = this.poolFind();
      if (!p) break;
      reset(p, MESH, LAYER.overEntity, x + Math.cos(a) * 100, y + Math.sin(a) * 100, 0.9, COLORS.p2, 10, 0.8, true);
      p.vx = Math.cos(a) * 40;
      p.vy = Math.sin(a) * 40;
      p.grow = 0;
      p.alpha = 0.5;
      p.spin = 1.5;
    }
    this.press = 0.08;
    this.addShake('shakeNova');
  }

  // ===================================================================
  // 更新与绘制
  // ===================================================================

  /** 找一个任意空槽（用于"不计入上限的附属碎片"）。 */
  private poolFind(): Particle | null {
    const n = this.pool.length;
    for (let i = 0; i < n; i += 1) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % n;
      if (!p.alive) {
        p.owner = null;
        return p;
      }
    }
    return null;
  }

  addShake(id: ShakeId): void {
    if (this.shakeScale <= 0) return;
    const s = SHAKE[id];
    if (s.time > this.shakeTime) this.shakeTime = s.time;
    if (s.amp > this.shakeAmp) this.shakeAmp = s.amp;
  }

  stop(seconds: number): void {
    this.hitStop = Math.max(this.hitStop, seconds);
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        if (p.owner !== null) this.countDown(p.owner);
        continue;
      }
      const drag = Math.max(0, 1 - p.drag * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.kind === RING && p.grow > 0) {
        p.grow = Math.min(1.4, p.grow + dt * 2.6);
      } else if (p.kind === MESH && p.grow > 0) {
        p.grow = Math.min(1.6, p.grow + dt * 2.2);
      }
    }

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      // 用相位正弦而不是随机数：保持 ?seed 可复现，且不会有单帧突变
      this.shakePhase += dt * 60;
      const k = Math.max(0, this.shakeTime) * this.shakeAmp * this.shakeScale * 4;
      this.shakeX = Math.sin(this.shakePhase * 1.7) * k;
      this.shakeY = Math.sin(this.shakePhase * 2.3 + 1.1) * k;
      if (this.shakeTime <= 0) {
        this.shakeTime = 0;
        this.shakeAmp = 0;
        this.shakeX = 0;
        this.shakeY = 0;
      }
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    if (this.press > 0) this.press = Math.max(0, this.press - dt);
    if (this.hitStop > 0) this.hitStop = Math.max(0, this.hitStop - dt);
  }

  /** 渲染层按 layer 分别调用一次；g 已变换到世界坐标。 */
  render(g: CanvasRenderingContext2D, layer: Layer): void {
    for (const p of this.pool) {
      if (!p.alive || p.layer !== layer) continue;
      const t = p.life / p.maxLife;
      const a = t * p.alpha;
      if (a <= 0.01) continue;

      if (p.glow) g.globalCompositeOperation = 'lighter';
      g.globalAlpha = a;
      g.strokeStyle = p.color;
      g.fillStyle = p.color;

      switch (p.kind) {
        case DOT:
          g.beginPath();
          g.arc(p.x, p.y, Math.max(0.5, p.size * t), 0, Math.PI * 2);
          g.fill();
          break;

        case SHARD: {
          const s = Math.max(0.6, p.size * t);
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillRect(-s / 2, -s / 2, s, s);
          g.restore();
          break;
        }

        case RING:
          g.lineWidth = Math.max(1, 3 * t);
          g.beginPath();
          g.arc(p.x, p.y, Math.max(0.5, p.size * p.grow), 0, Math.PI * 2);
          g.stroke();
          break;

        case SEG:
          g.lineWidth = Math.max(1, (p.grow > 0 ? p.size : 3) * t);
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x2, p.y2);
          g.stroke();
          break;

        case STAR: {
          const rays = Math.max(3, Math.round(p.grow));
          g.lineWidth = Math.max(1, 1.6 * t);
          g.beginPath();
          for (let i = 0; i < rays; i += 1) {
            const a = (Math.PI * 2 * i) / rays + p.rot;
            const len = p.size * (0.4 + t * 0.8);
            g.moveTo(p.x, p.y);
            g.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len);
          }
          g.stroke();
          break;
        }

        case MESH: {
          const sides = Math.max(5, Math.min(6, Math.round(p.size) === 5 ? 5 : 6));
          const r = p.size * (p.grow > 0 ? p.grow : 1);
          g.lineWidth = Math.max(1, 1.6 * t);
          g.beginPath();
          for (let i = 0; i <= sides; i += 1) {
            const a = (Math.PI * 2 * i) / sides + p.rot;
            // 碎裂：偶数顶点内缩，形成锯齿边缘
            const jag = p.grow > 0 && i % 2 === 0 ? 0.78 : 1;
            const px = p.x + Math.cos(a) * r * jag;
            const py = p.y + Math.sin(a) * r * jag;
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.closePath();
          g.stroke();
          break;
        }

        case ZIGZAG:
          drawZigzag(g, p, t);
          break;

        case WAVE:
          drawWave(g, p, t);
          break;

        default:
          break;
      }

      if (p.glow) g.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = 1;
  }

  clear(): void {
    for (const p of this.pool) {
      p.alive = false;
      p.owner = null;
    }
    this.live.clear();
    this.shakeTime = 0;
    this.shakeAmp = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flash = 0;
    this.press = 0;
    this.hitStop = 0;
  }

  /** 当前活跃特效数（性能排查用）。 */
  get active(): number {
    let n = 0;
    for (const p of this.pool) if (p.alive) n += 1;
    return n;
  }
}

/** 电弧折线：源到目标，中间三个锯齿点。 */
function drawZigzag(g: CanvasRenderingContext2D, p: Particle, t: number): void {
  g.lineWidth = Math.max(1, 1.8 * t);
  g.beginPath();
  g.moveTo(p.x, p.y);
  const dx = p.x2 - p.x;
  const dy = p.y2 - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const segs = 4;
  for (let i = 1; i < segs; i += 1) {
    const f = i / segs;
    const off = (i % 2 === 0 ? 1 : -1) * 7 * t;
    g.lineTo(p.x + dx * f + nx * off, p.y + dy * f + ny * off);
  }
  g.lineTo(p.x2, p.y2);
  g.stroke();
}

/** 连锁传导：波浪折线。 */
function drawWave(g: CanvasRenderingContext2D, p: Particle, t: number): void {
  g.lineWidth = Math.max(1, 1.6 * t);
  const dx = p.x2 - p.x;
  const dy = p.y2 - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const steps = 8;
  g.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps;
    const wave = Math.sin(f * Math.PI * 3) * 6 * t;
    const px = p.x + ux * len * f + nx * wave;
    const py = p.y + uy * len * f + ny * wave;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.stroke();
}

function reset(
  p: Particle,
  kind: number,
  layer: Layer,
  x: number,
  y: number,
  life: number,
  color: string,
  size: number,
  drag: number,
  glow: boolean,
): void {
  p.alive = true;
  p.kind = kind;
  p.layer = layer;
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  p.life = life;
  p.maxLife = life;
  p.size = size;
  p.drag = drag;
  p.color = color;
  p.x2 = x;
  p.y2 = y;
  p.grow = 0;
  p.alpha = 1;
  p.glow = glow;
  p.rot = 0;
  p.spin = 0;
}
