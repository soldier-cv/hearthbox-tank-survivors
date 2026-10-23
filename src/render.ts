/**
 * 渲染层。
 *
 * 只做绘制，不含规则。双视口（合屏 / 分屏）由 viewports() 提供，
 * 每一路各自 save → clip → setTransform → 画世界 → restore。
 *
 * 每帧开头统一重置 ctx2d 状态：平台可能在上一局改过 lineWidth / font。
 */

import { CONFIG, COLORS } from './config';
import { TILE, TILE_RULES } from './data/maps';
import type { Enemy, Game, Player, Bullet } from './game';
import { LAYER, type Fx } from './fx';
import { drawTank, type DecalStage, type TankPaint } from './draw/tank';
import type { CameraRig, Viewport } from './camera';

const T = CONFIG.tile;

export interface RenderCtx {
  g: CanvasRenderingContext2D;
  fx: Fx;
  time: number;
  shakeX: number;
  shakeY: number;
  vignette: number;
  flash: number;
  press: number;
}

export class Renderer {
  constructor(
    private readonly game: Game,
    private readonly rig: CameraRig,
  ) {}

  /** 画整个画面（不含 UI，UI 由 ui.ts 叠在上面）。 */
  render(g: CanvasRenderingContext2D, fx: Fx, viewScale: number): void {
    const W = CONFIG.width;
    const H = CONFIG.height;
    const time = this.game.time;

    // 平台可能在上一局改过这些
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.lineWidth = 1;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.imageSmoothingEnabled = true;

    g.fillStyle = COLORS.void;
    g.fillRect(0, 0, W, H);

    const viewports = this.rig.viewports();
    for (const v of viewports) {
      this.drawViewport(g, v, fx, time, viewScale);
    }

    // 分屏线
    if (viewports.length > 1) {
      g.save();
      g.strokeStyle = COLORS.void;
      g.globalAlpha = 0.85;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(W / 2, 0);
      g.lineTo(W / 2, H);
      g.stroke();
      g.restore();
    }

    // 覆盖层特效（白闪 / 下压 / 暗角）在屏幕空间
    this.drawOverlay(g, fx, time);
  }

  private drawViewport(
    g: CanvasRenderingContext2D,
    v: Viewport,
    fx: Fx,
    time: number,
    viewScale: number,
  ): void {
    if (v.w <= 1 || v.h <= 1) return;
    const halfW = v.w / v.zoom / 2;
    const halfH = v.h / v.zoom / 2;
    const shakeX = fx.shakeX / viewScale;
    const shakeY = fx.shakeY / viewScale;
    const camX = v.camX + shakeX;
    const camY = v.camY + shakeY;

    g.save();
    g.beginPath();
    g.rect(v.x, v.y, v.w, v.h);
    g.clip();
    g.translate(v.x + v.w / 2, v.y + v.h / 2);
    g.scale(v.zoom, v.zoom);
    g.translate(-camX, -camY);

    const left = camX - halfW - T;
    const right = camX + halfW + T;
    const top = camY - halfH - T;
    const bottom = camY + halfH + T;

    this.drawTerrain(g, time, left, right, top, bottom);
    fx.render(g, LAYER.ground);
    this.drawTracks(g);
    this.drawHazards(g, left, right, top, bottom);
    fx.render(g, LAYER.underEntity);
    this.drawPickups(g, left, right, top, bottom);
    this.drawEnemies(g, time, left, right, top, bottom);
    this.drawBullets(g, this.game.ebullets, left, right, top, bottom);
    this.drawBullets(g, this.game.bullets, left, right, top, bottom);
    this.drawPlayers(g, time);
    this.drawTurrets(g, left, right, top, bottom);
    this.drawDrones(g, left, right, top, bottom);
    fx.render(g, LAYER.overEntity);
    this.drawRings(g);
    this.drawTexts(g);

    g.restore();
  }

  // ===================================================================
  // 地形
  // ===================================================================

  private drawTerrain(
    g: CanvasRenderingContext2D,
    time: number,
    left: number,
    right: number,
    top: number,
    bottom: number,
  ): void {
    const w = this.game.world;
    const x0 = Math.max(0, Math.floor(left / T));
    const x1 = Math.min(w.cols - 1, Math.floor(right / T));
    const y0 = Math.max(0, Math.floor(top / T));
    const y1 = Math.min(w.rows - 1, Math.floor(bottom / T));

    // 地面底色（整张图一次画完，避免逐格 fillRect 的开销）
    g.fillStyle = w.map.tint;
    g.globalAlpha = 1;
    g.fillRect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
    g.fillStyle = COLORS.ground;
    g.globalAlpha = 1 - w.map.tintAlpha;
    g.fillRect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
    g.globalAlpha = 1;

    // 地面网格（只画一次，低对比）
    g.strokeStyle = COLORS.grid;
    g.globalAlpha = 0.3;
    g.lineWidth = 1;
    g.beginPath();
    for (let tx = x0; tx <= x1; tx += 1) {
      g.moveTo(tx * T + 0.5, y0 * T);
      g.lineTo(tx * T + 0.5, (y1 + 1) * T);
    }
    for (let ty = y0; ty <= y1; ty += 1) {
      g.moveTo(x0 * T, ty * T + 0.5);
      g.lineTo((x1 + 1) * T, ty * T + 0.5);
    }
    g.stroke();
    g.globalAlpha = 1;

    for (let ty = y0; ty <= y1; ty += 1) {
      for (let tx = x0; tx <= x1; tx += 1) {
        const i = w.idx(tx, ty);
        const t = w.grid[i] as number;
        const x = tx * T;
        const y = ty * T;
        switch (t) {
          case TILE.brick:
            this.drawBrick(g, x, y, w.hp[i]);
            break;
          case TILE.steel:
            this.drawSteel(g, x, y);
            break;
          case TILE.grass:
            this.drawGrass(g, x, y, tx, ty, time, w.burn[i]);
            break;
          case TILE.ice:
            this.drawIce(g, x, y, tx, ty);
            break;
          case TILE.snow:
            break;
          case TILE.deep:
            this.drawWater(g, x, y, time, false);
            break;
          case TILE.shallow:
            this.drawWater(g, x, y, time, true);
            break;
          case TILE.bridge:
            this.drawBridge(g, x, y);
            break;
          case TILE.rubble:
            this.drawRubble(g, x, y, w.hp[i]);
            break;
          case TILE.building:
            this.drawBuilding(g, x, y, w.hp[i]);
            break;
          case TILE.crater:
            g.fillStyle = COLORS.groundDark;
            g.beginPath();
            g.ellipse(x + T / 2, y + T / 2, T * 0.4, T * 0.32, 0, 0, Math.PI * 2);
            g.fill();
            break;
          default:
            void i;
            break;
        }
      }
    }
  }

  private drawBrick(g: CanvasRenderingContext2D, x: number, y: number, hp: number): void {
    const rule = TILE_RULES[TILE.brick];
    g.fillStyle = rule.color;
    g.fillRect(x, y, T, T);
    // 砖缝
    g.strokeStyle = COLORS.void;
    g.globalAlpha = 0.4;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y + T * 0.33);
    g.lineTo(x + T, y + T * 0.33);
    g.moveTo(x, y + T * 0.66);
    g.lineTo(x + T, y + T * 0.66);
    g.moveTo(x + T * 0.5, y);
    g.lineTo(x + T * 0.5, y + T * 0.33);
    g.moveTo(x + T * 0.25, y + T * 0.33);
    g.lineTo(x + T * 0.25, y + T * 0.66);
    g.moveTo(x + T * 0.75, y + T * 0.33);
    g.lineTo(x + T * 0.75, y + T * 0.66);
    g.stroke();
    // 受损：右上开始缺一块
    const ratio = Math.max(0, Math.min(1, hp / TILE_RULES[TILE.brick].hp));
    if (ratio < 0.9) {
      g.globalAlpha = (1 - ratio) * 0.8;
      g.fillStyle = COLORS.groundDark;
      g.fillRect(x + T * ratio, y, T * (1 - ratio), T);
    }
    g.globalAlpha = 1;
    g.strokeStyle = COLORS.void;
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
  }

  private drawSteel(g: CanvasRenderingContext2D, x: number, y: number): void {
    g.fillStyle = TILE_RULES[TILE.steel].color;
    g.fillRect(x, y, T, T);
    g.strokeStyle = COLORS.void;
    g.lineWidth = 1.5;
    g.strokeRect(x + 3, y + 3, T - 6, T - 6);
    g.fillStyle = '#7a848f';
    for (const [dx, dy] of [[6, 6], [T - 6, 6], [6, T - 6], [T - 6, T - 6]] as const) {
      g.beginPath();
      g.arc(x + dx, y + dy, 2, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 0.3;
    g.fillStyle = COLORS.p2Light;
    g.fillRect(x + 3, y + 3, T - 6, 2);
    g.globalAlpha = 1;
  }

  private drawGrass(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    tx: number,
    ty: number,
    time: number,
    burn: number,
  ): void {
    if (burn > 0) {
      // 焦土
      g.fillStyle = '#2a1f16';
      g.fillRect(x, y, T, T);
      g.globalAlpha = Math.max(0, Math.min(0.5, burn / 30));
      g.fillStyle = COLORS.blast;
      for (let i = 0; i < 3; i += 1) {
        const hx = ((tx * 7 + ty * 13 + i * 5) % 5) / 5;
        const hy = ((tx * 11 + ty * 3 + i * 7) % 5) / 5;
        g.fillRect(x + hx * T, y + hy * T, 2, 2);
      }
      g.globalAlpha = 1;
      return;
    }
    const w = this.game.world;
    const sway = w.grassSway(x + T / 2, y + T / 2, time) * 2 - 1;
    g.strokeStyle = TILE_RULES[TILE.grass].edge;
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const bx = x + 4 + i * 8;
      g.moveTo(bx, y + T - 2);
      g.lineTo(bx + sway * 2, y + T * 0.35);
    }
    g.stroke();
    g.strokeStyle = TILE_RULES[TILE.grass].color;
    g.lineWidth = 3;
    g.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const bx = x + 6 + i * 7;
      g.moveTo(bx, y + T - 3);
      g.lineTo(bx + sway * 2.6, y + T * 0.15);
    }
    g.stroke();
  }

  private drawIce(g: CanvasRenderingContext2D, x: number, y: number, tx: number, ty: number): void {
    g.fillStyle = TILE_RULES[TILE.ice].color;
    g.fillRect(x, y, T, T);
    // 反光条纹（位置由格 hash 决定，所以不会每帧闪）
    const h = ((tx * 73 + ty * 131) % 7) / 7;
    g.globalAlpha = 0.35;
    g.strokeStyle = EXT_SNOW;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x + 4, y + T * (0.25 + h * 0.4));
    g.lineTo(x + T - 4, y + T * (0.2 + h * 0.4));
    g.stroke();
    g.globalAlpha = 1;
  }

  private drawWater(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    time: number,
    shallow: boolean,
  ): void {
    const rule = shallow ? TILE_RULES[TILE.shallow] : TILE_RULES[TILE.deep];
    g.fillStyle = rule.color;
    g.fillRect(x, y, T, T);
    if (shallow) {
      g.globalAlpha = 0.22;
      g.fillStyle = COLORS.p2Light;
      g.fillRect(x, y, T, T);
    }
    // 波纹：两条缓慢横移的亮线，周期约 4s
    const phase = (time * 10) % T;
    g.globalAlpha = shallow ? 0.2 : 0.16;
    g.strokeStyle = rule.edge;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y + ((T / 3 + phase) % T));
    g.lineTo(x + T, y + ((T / 3 + phase) % T));
    g.moveTo(x, y + ((T * 0.7 - phase + T * 2) % T));
    g.lineTo(x + T, y + ((T * 0.7 - phase + T * 2) % T));
    g.stroke();
    g.globalAlpha = 1;
  }

  private drawBridge(g: CanvasRenderingContext2D, x: number, y: number): void {
    g.fillStyle = TILE_RULES[TILE.bridge].color;
    g.fillRect(x, y, T, T);
    g.strokeStyle = COLORS.void;
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < 4; i += 1) {
      g.moveTo(x, y + (T * i) / 4);
      g.lineTo(x + T, y + (T * i) / 4);
    }
    g.stroke();
    g.globalAlpha = 0.5;
    g.fillStyle = EXT_STONE;
    g.fillRect(x, y, 3, T);
    g.fillRect(x + T - 3, y, 3, T);
    g.globalAlpha = 1;
  }

  private drawRubble(g: CanvasRenderingContext2D, x: number, y: number, hp: number): void {
    const max = TILE_RULES[TILE.rubble].hp;
    const ratio = Math.max(0, Math.min(1, hp / max));
    g.fillStyle = TILE_RULES[TILE.rubble].color;
    const n = Math.round(3 + ratio * 4);
    for (let i = 0; i < n; i += 1) {
      const h = (i * 97) % 5;
      const k = (i * 53) % 5;
      g.fillRect(x + 4 + h * 6, y + 4 + k * 6, 7, 6);
    }
    g.globalAlpha = 0.4;
    g.strokeStyle = EXT_STONE;
    g.lineWidth = 1;
    for (let i = 0; i < n; i += 1) {
      const h = (i * 97) % 5;
      const k = (i * 53) % 5;
      g.strokeRect(x + 4 + h * 6, y + 4 + k * 6, 7, 6);
    }
    g.globalAlpha = 1;
  }

  private drawBuilding(g: CanvasRenderingContext2D, x: number, y: number, hp: number): void {
    const max = TILE_RULES[TILE.building].hp;
    const ratio = Math.max(0, Math.min(1, hp / max));
    // 三层，受损逐层消失
    g.fillStyle = EXT_STONE;
    g.fillRect(x, y, T, T);
    const layers = Math.max(1, Math.ceil(ratio * 3));
    for (let l = 0; l < layers; l += 1) {
      g.fillStyle = l === 0 ? '#5a6472' : l === 1 ? '#4a5260' : '#3a4150';
      g.fillRect(x + 2 + l * 3, y + 2 + l * 3, T - 4 - l * 6, T - 4 - l * 6);
    }
    g.strokeStyle = COLORS.void;
    g.lineWidth = 1.5;
    g.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
    // 预警：抖动由调用方加 translate，这里只画裂痕
    if (ratio < 0.7) {
      g.globalAlpha = 0.7;
      g.strokeStyle = COLORS.void;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x + T * 0.2, y + T * 0.15);
      g.lineTo(x + T * 0.45, y + T * 0.6);
      g.lineTo(x + T * 0.3, y + T * 0.9);
      g.stroke();
      g.globalAlpha = 1;
    }
  }

  // ===================================================================
  // 实体
  // ===================================================================

  private drawTracks(g: CanvasRenderingContext2D): void {
    for (const tr of this.game.tracks) {
      if (!tr.alive) continue;
      const t = tr.life / tr.maxLife;
      g.save();
      g.globalAlpha = t * 0.35;
      g.fillStyle = '#05070a';
      g.translate(tr.x, tr.y);
      g.rotate(tr.angle);
      for (const sign of [-1, 1]) {
        g.fillRect(-6, sign * tr.halfW - 2, 12, 4);
      }
      g.restore();
    }
    g.globalAlpha = 1;
  }

  private drawHazards(
    g: CanvasRenderingContext2D,
    left: number,
    right: number,
    top: number,
    bottom: number,
  ): void {
    // 火池
    for (const p of this.game.puddles) {
      if (!p.alive) continue;
      if (!this.inBoundsBox(p.x, p.y, left, right, top, bottom, p.r)) continue;
      const t = p.life / p.maxLife;
      g.save();
      g.globalAlpha = 0.35 * t;
      g.fillStyle = COLORS.blast;
      g.beginPath();
      g.ellipse(p.x, p.y, p.r, p.r * 0.72, p.wob, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.6 * t;
      g.strokeStyle = '#ffd166';
      g.lineWidth = 1.5;
      g.stroke();
      g.restore();
    }

    // 引力井 / 电极柱
    for (const w of this.game.wells) {
      if (!w.alive) continue;
      if (!this.inBoundsBox(w.x, w.y, left, right, top, bottom, w.r)) continue;
      const t = Math.max(0, w.life / w.maxLife);
      g.save();
      if (w.pillar > 0) {
        g.globalAlpha = 0.18 + t * 0.2;
        g.fillStyle = '#58c8d8';
        g.beginPath();
        g.arc(w.x, w.y, w.r, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 0.8;
        g.strokeStyle = '#c9f5fb';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(w.x, w.y, 6 + (1 - t) * 4, 0, Math.PI * 2);
        g.stroke();
      } else {
        g.globalAlpha = 0.22 + t * 0.25;
        g.fillStyle = w.inert ? '#9ad14f' : '#c9a0ff';
        g.beginPath();
        g.arc(w.x, w.y, w.r * (1 - t * 0.25), 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 0.9;
        g.strokeStyle = w.inert ? '#9ad14f' : '#e6d7ff';
        g.lineWidth = 2;
        for (let i = 0; i < 3; i += 1) {
          const rr = w.r * (0.35 + i * 0.25) * (1.1 - t * 0.3);
          g.beginPath();
          g.arc(w.x, w.y, rr, 0, Math.PI * 2);
          g.stroke();
        }
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(w.x, w.y, 5, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }

    // 延迟爆炸（相位冲刺残影 / 跳雷）
    for (const b of this.game.booms) {
      if (!b.alive) continue;
      if (!this.inBoundsBox(b.x, b.y, left, right, top, bottom, b.r)) continue;
      const t = Math.max(0, b.t / 0.35);
      g.save();
      g.globalAlpha = 0.35 + (1 - t) * 0.4;
      g.strokeStyle = '#9fd8ff';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(b.x, b.y, b.r * (0.4 + (1 - t) * 0.6), 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }

    // 地雷：地面蓝三角，始终可见（不能"看不见就踩上"）
    for (const m of this.game.mines) {
      if (!m.alive) continue;
      if (!this.inBoundsBox(m.x, m.y, left, right, top, bottom, 20)) continue;
      const blink = m.life < 3 ? (Math.sin(m.life * 18) + 1) * 0.5 : 0.5;
      g.save();
      g.globalAlpha = 0.5 + blink * 0.5;
      g.fillStyle = m.owner < 0 ? COLORS.bomber : COLORS.spark;
      g.beginPath();
      g.moveTo(m.x, m.y - 5);
      g.lineTo(m.x + 5, m.y + 4);
      g.lineTo(m.x - 5, m.y + 4);
      g.closePath();
      g.fill();
      g.globalAlpha = 0.25;
      g.strokeStyle = m.owner < 0 ? COLORS.bomber : COLORS.spark;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
  }

  private drawPickups(
    g: CanvasRenderingContext2D,
    left: number,
    right: number,
    top: number,
    bottom: number,
  ): void {
    for (const k of this.game.pickups) {
      if (!k.alive) continue;
      if (!this.inBoundsBox(k.x, k.y, left, right, top, bottom, 20)) continue;
      const bob = Math.sin(k.t * 4 + k.x * 0.05) * 1.5;
      if (k.kind === 'xp') {
        g.fillStyle = k.color;
        g.beginPath();
        g.arc(k.x, k.y + bob, k.size, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 0.5;
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(k.x - k.size * 0.3, k.y + bob - k.size * 0.3, k.size * 0.3, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      } else {
        // 维修箱 / 炸弹补给：带描边方块 + 符号
        g.fillStyle = COLORS.void;
        g.globalAlpha = 0.35;
        g.fillRect(k.x - 11, k.y - 9, 22, 18);
        g.globalAlpha = 1;
        g.fillStyle = k.color;
        g.fillRect(k.x - 9, k.y - 7, 18, 14);
        g.strokeStyle = COLORS.void;
        g.lineWidth = 1.5;
        g.strokeRect(k.x - 9, k.y - 7, 18, 14);
        // 刚投放的 4 秒：扩散脉冲，避免"掉在地上没人看见"
        if (k.t < 4) {
          const p = (k.t % 1) / 1;
          g.globalAlpha = (1 - p) * 0.6;
          g.strokeStyle = k.color;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(k.x, k.y, 12 + p * 18, 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
        }
        g.fillStyle = COLORS.void;
        if (k.kind === 'repair') {
          g.fillRect(k.x - 5, k.y - 1.5, 10, 3);
          g.fillRect(k.x - 1.5, k.y - 5, 3, 10);
        } else {
          g.beginPath();
          g.arc(k.x, k.y, 3.5, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }

  private drawEnemies(
    g: CanvasRenderingContext2D,
    time: number,
    left: number,
    right: number,
    top: number,
    bottom: number,
  ): void {
    for (const e of this.game.enemies) {
      if (!e.alive) continue;
      if (!this.inBoundsBox(e.x, e.y, left, right, top, bottom, e.r + 40)) continue;

      const hidden = this.game.world.inGrass(e.x, e.y) && this.game.world.burn[this.game.world.idx(Math.floor(e.x / T), Math.floor(e.y / T))] <= 0;
      const paint: TankPaint = {
        body: e.def.color,
        light: e.boss ? e.boss.color : lighten(e.def.color),
        tread: e.def.tread,
        glow: e.boss ? '#ffe6b0' : e.def.color,
      };

      g.save();
      if (hidden) g.globalAlpha = 0.35;
      if (e.affix) {
        g.strokeStyle = e.affix.color;
        g.globalAlpha = 0.5;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(e.x, e.y, e.r + 5, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = hidden ? 0.35 : 1;
      }
      if (e.flash > 0) {
        paint.body = '#ffffff';
        paint.light = '#ffffff';
      }
      if (e.slow > 0) paint.glow = COLORS.spark;

      drawTank(
        g,
        e.x,
        e.y,
        e.angle,
        e.r,
        paint,
        e.boss ? 4 : e.elite ? 3 : 1,
        e.def.model,
        { t: time, moving: true, speed: Math.min(1, Math.hypot(e.vx, e.vy) / 90) },
      );

      // 冻结：脚下一圈冰晶（减速只是变色，定身要有更硬的提示）
      if (e.rootT > 0) {
        g.globalAlpha = 0.55;
        g.strokeStyle = '#c9f5fb';
        g.lineWidth = 1.5;
        for (let k = 0; k < 6; k += 1) {
          const a = (Math.PI * 2 * k) / 6 + time * 0.4;
          g.beginPath();
          g.moveTo(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r);
          g.lineTo(e.x + Math.cos(a) * (e.r + 7), e.y + Math.sin(a) * (e.r + 7));
          g.stroke();
        }
      }
      g.restore();

      // 护盾：六边形
      if (e.shield > 0) {
        g.save();
        g.globalAlpha = 0.45;
        g.strokeStyle = COLORS.p2;
        g.lineWidth = 1.5;
        g.beginPath();
        for (let i = 0; i <= 6; i += 1) {
          const a = (Math.PI / 3) * i;
          const px = e.x + Math.cos(a) * (e.r + 7);
          const py = e.y + Math.sin(a) * (e.r + 7);
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.stroke();
        g.restore();
      }

      // 血条（受伤才显示）
      if (e.hp < e.maxHp && !e.boss) {
        const w = e.r * 2;
        const ratio = Math.max(0, e.hp / e.maxHp);
        g.fillStyle = COLORS.void;
        g.globalAlpha = 0.6;
        g.fillRect(e.x - w / 2, e.y - e.r - 9, w, 3);
        g.globalAlpha = 1;
        g.fillStyle = ratio > 0.5 ? COLORS.heal : ratio > 0.25 ? COLORS.scout : COLORS.bomber;
        g.fillRect(e.x - w / 2, e.y - e.r - 9, w * ratio, 3);
      }

      // 攻击预警
      this.drawTelegraph(g, e, time);
    }
  }

  private drawTelegraph(g: CanvasRenderingContext2D, e: Enemy, time: number): void {
    if (e.telegraph <= 0) return;
    const t = 1 - e.telegraph / Math.max(0.001, e.def.telegraph);
    const def = e.def;

    if (def.attack === 'charge') {
      // 狙击：从敌人到玩家的红线，逐渐变亮
      g.save();
      g.globalAlpha = 0.3 + t * 0.6;
      g.strokeStyle = COLORS.bomber;
      g.lineWidth = 1 + t * 1.5;
      g.beginPath();
      g.moveTo(e.x, e.y);
      g.lineTo(e.aimX, e.aimY);
      g.stroke();
      g.restore();
    } else if (def.attack === 'lob') {
      // 迫击：落点圈从大到小收缩
      g.save();
      g.globalAlpha = 0.35 + t * 0.4;
      g.strokeStyle = COLORS.blast;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(e.aimX, e.aimY, def.radius * (1.2 - t * 0.2), 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 0.25;
      g.fillStyle = COLORS.blast;
      g.beginPath();
      g.arc(e.aimX, e.aimY, def.radius * 0.25, 0, Math.PI * 2);
      g.fill();
      g.restore();
    } else if (def.attack === 'explode') {
      // 自爆：车体闪红（≤3Hz，避免光敏问题）
      const blink = (Math.sin(time * 16) + 1) * 0.5;
      g.save();
      g.globalAlpha = 0.25 + blink * 0.45;
      g.strokeStyle = COLORS.bomber;
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(e.x, e.y, e.r + 6, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    } else {
      // 直射：炮口瞄准线 + 亮点
      g.save();
      g.globalAlpha = 0.45;
      g.strokeStyle = COLORS.p1Light;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(e.x + Math.cos(e.turret) * e.r, e.y + Math.sin(e.turret) * e.r);
      g.lineTo(e.aimX, e.aimY);
      g.stroke();
      g.restore();
    }
  }

  private drawBullets(
    g: CanvasRenderingContext2D,
    pool: Bullet[],
    left: number,
    right: number,
    top: number,
    bottom: number,
  ): void {
    for (const b of pool) {
      if (!b.alive) continue;
      if (!this.inBoundsBox(b.x, b.y, left, right, top, bottom, 30)) continue;
      const a = Math.atan2(b.vy, b.vx);
      // 拖尾
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.4;
      g.strokeStyle = b.color;
      g.lineWidth = b.size * 0.8;
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.lineTo(b.x - Math.cos(a) * (b.rail ? 60 : 12), b.y - Math.sin(a) * (b.rail ? 60 : 12));
      g.stroke();
      g.restore();

      g.fillStyle = b.color;
      g.beginPath();
      if (b.rail) {
        g.save();
        g.translate(b.x, b.y);
        g.rotate(a);
        g.fillRect(-b.size * 3, -b.size / 2, b.size * 6, b.size);
        g.restore();
      } else {
        g.arc(b.x, b.y, b.size, 0, Math.PI * 2);
        g.fill();
      }
      if (b.blast > 0) {
        g.strokeStyle = COLORS.blast;
        g.globalAlpha = 0.6;
        g.lineWidth = 1.2;
        g.beginPath();
        g.arc(b.x, b.y, b.size + 2, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
    }
  }

  private drawPlayers(g: CanvasRenderingContext2D, time: number): void {
    for (const p of this.game.players) {
      if (!p.alive) {
        if (p.downed) this.drawDowned(g, p);
        continue;
      }
      const paint: TankPaint = {
        body: p.skin?.body || p.tank.body,
        light: p.skin?.light || p.tank.light,
        tread: COLORS.tread,
        glow: p.tank.glow,
      };

      // 无敌闪烁
      if (p.invuln > 0 && Math.floor(time * 12) % 2 === 0) g.globalAlpha = 0.55;

      // 残影
      if (p.decoyT > 0) {
        g.save();
        g.globalAlpha = 0.28 * (p.decoyT / 1.2);
        drawTank(g, p.decoyX, p.decoyY, p.angle, p.r, paint, p.sigIndex as DecalStage, p.tank.id, {
          t: time, moving: false, speed: 0,
        });
        g.restore();
      }

      drawTank(g, p.x, p.y, p.angle, p.r, paint, p.sigIndex as DecalStage, p.tank.id, {
        t: time,
        moving: p.moving,
        speed: p.speed01,
      });
      g.globalAlpha = 1;

      // 护盾环
      if (p.shield > 0) {
        g.save();
        for (let i = 0; i < p.shield; i += 1) {
          g.globalAlpha = 0.4;
          g.strokeStyle = COLORS.p2;
          g.lineWidth = 1.6;
          g.beginPath();
          g.arc(p.x, p.y, p.r + 8 + i * 4, 0, Math.PI * 2);
          g.stroke();
        }
        g.restore();
      }

      // 过载核心：热量进红区时车体泛红（代价要看得见）
      if (p.kit.heatMax > 0 && p.heat / p.kit.heatMax > CONFIG.cards.heat.redAt) {
        g.save();
        g.globalAlpha = 0.35 + Math.sin(time * 10) * 0.12;
        g.strokeStyle = COLORS.bomber;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(p.x, p.y, p.r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (p.heat / p.kit.heatMax));
        g.stroke();
        g.restore();
      }

      // 时停：沿炮口画一条瞄准线，告诉你这一炮会打向哪
      if (p.stopT > 0) {
        g.save();
        g.globalAlpha = 0.35 + Math.sin(time * 14) * 0.12;
        g.strokeStyle = '#c9f5fb';
        g.lineWidth = 2;
        g.setLineDash([14, 10]);
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x + Math.cos(p.turretAngle) * 900, p.y + Math.sin(p.turretAngle) * 900);
        g.stroke();
        g.setLineDash([]);
        g.globalAlpha = 0.55;
        g.beginPath();
        g.arc(p.x, p.y, p.r + 16, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }

      // 静止蓄力导轨（铁砧）/ 要塞齐射预警
      if (p.heavyCharge > 0 && p.sig.heavyEvery > 0) {
        g.save();
        g.globalAlpha = 0.4 + p.heavyCharge * 0.5;
        g.strokeStyle = p.tank.glow;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(p.x, p.y, p.r + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.heavyCharge);
        g.stroke();
        g.restore();
      }
      if (p.barrageWarn > 0 || p.railWarn > 0) {
        const w = Math.max(p.barrageWarn, p.railWarn);
        g.save();
        g.globalAlpha = w * 0.7;
        g.fillStyle = p.tank.glow;
        const n = 8;
        for (let i = 0; i < n; i += 1) {
          const a = (Math.PI * 2 * i) / n;
          g.beginPath();
          g.arc(p.x + Math.cos(a) * (p.r + 14), p.y + Math.sin(a) * (p.r + 14), 2 + w * 2, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
      }
    }
  }

  private drawDowned(g: CanvasRenderingContext2D, p: Player): void {
    const ratio = Math.max(0, Math.min(1, 1 - p.reviveT / CONFIG.combat.reviveTime));
    g.save();
    g.translate(p.x, p.y);
    g.rotate(Math.PI * 0.02);
    g.globalAlpha = 0.85;
    // 残骸：歪斜的深色车体
    drawTank(g, 0, 0, 0, p.r, {
      body: '#4a4148',
      light: '#6a5f66',
      tread: '#241d20',
    }, 1, p.tank.id, { t: 0, moving: false, speed: 0 });
    g.restore();

    // 救援进度环
    const mate = this.game.players.find((q) => q !== p && q.alive);
    if (mate) {
      g.save();
      g.strokeStyle = ratio > 0 ? COLORS.heal : COLORS.textDim;
      g.globalAlpha = 0.9;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(p.x, p.y, p.r + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      g.stroke();
      g.restore();
    }
    g.save();
    g.fillStyle = COLORS.bomber;
    g.font = '12px monospace';
    g.fillText('!', p.x, p.y - p.r - 14);
    g.restore();
  }

  private drawDrones(
    g: CanvasRenderingContext2D,
    left: number,
    right: number,
    top: number,
    bottom: number,
  ): void {
    for (const d of this.game.drones) {
      if (!d.alive) continue;
      if (!this.inBoundsBox(d.x, d.y, left, right, top, bottom, 20)) continue;
      if (d.down > 0) {
        // 被击落：半透明残影 + 重生倒计时
        g.save();
        g.globalAlpha = 0.2;
        g.fillStyle = COLORS.drone;
        g.fillRect(d.x - 3, d.y - 3, 6, 6);
        g.restore();
        continue;
      }
      const p = this.game.players[d.owner];
      g.fillStyle = p?.tank.glow ?? COLORS.drone;
      g.save();
      g.translate(d.x, d.y);
      g.rotate(d.phase);
      g.fillRect(-4, -3, 8, 6);
      g.globalAlpha = 0.5;
      g.fillStyle = '#ffffff';
      g.fillRect(-1.5, -1.5, 3, 3);
      g.restore();
      if (d.shield) {
        g.save();
        g.globalAlpha = 0.35;
        g.strokeStyle = '#9fd8ff';
        g.lineWidth = 1;
        g.beginPath();
        g.arc(d.x, d.y, 8, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
    }
  }

  /** 哨戒炮台：方形底座 + 炮管，剩余时间长时更亮。 */
  private drawTurrets(
    g: CanvasRenderingContext2D,
    left: number,
    right: number,
    top: number,
    bottom: number,
  ): void {
    for (const t of this.game.turrets) {
      if (!t.alive) continue;
      if (!this.inBoundsBox(t.x, t.y, left, right, top, bottom, 24)) continue;
      const k = Math.max(0.25, t.life / t.maxLife);
      g.save();
      g.translate(t.x, t.y);
      g.globalAlpha = 0.35 + k * 0.65;
      g.fillStyle = '#242f36';
      g.fillRect(-t.r * 0.8, -t.r * 0.8, t.r * 1.6, t.r * 1.6);
      g.strokeStyle = t.heavy ? COLORS.p1 : COLORS.drone;
      g.lineWidth = 2;
      g.strokeRect(-t.r * 0.8, -t.r * 0.8, t.r * 1.6, t.r * 1.6);
      g.rotate(t.angle);
      g.fillStyle = t.heavy ? COLORS.p1 : COLORS.drone;
      g.fillRect(0, -2, t.r * 1.4, 4);
      g.restore();
    }
  }

  private drawRings(g: CanvasRenderingContext2D): void {
    for (const r of this.game.rings) {
      if (!r.alive) continue;
      const t = r.life / r.maxLife;
      g.save();
      g.globalAlpha = t * 0.8;
      g.strokeStyle = r.color;
      g.lineWidth = r.width * t;
      g.beginPath();
      g.arc(r.x, r.y, Math.max(1, r.r), 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
  }

  private drawTexts(g: CanvasRenderingContext2D): void {
    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const t of this.game.texts) {
      if (!t.alive) continue;
      const k = t.life / t.maxLife;
      g.globalAlpha = Math.min(1, k * 1.6);
      g.fillStyle = t.color;
      g.font = `${t.size}px monospace`;
      g.fillText(t.text, t.x, t.y);
    }
    g.restore();
    g.globalAlpha = 1;
  }

  // ===================================================================
  // 覆盖层
  // ===================================================================

  private drawOverlay(g: CanvasRenderingContext2D, fx: Fx, time: number): void {
    const W = CONFIG.width;
    const H = CONFIG.height;

    if (fx.flash > 0) {
      g.save();
      g.globalAlpha = Math.min(0.35, fx.flash * 2.5);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, W, H);
      g.restore();
    }

    // 低血量暗角（信息反馈，不随震动开关关闭）
    if (fx.vignette > 0) {
      const pulse = 0.6 + Math.sin(time * 4) * 0.4;
      g.save();
      const grad = g.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
      grad.addColorStop(0, 'rgba(217,69,43,0)');
      grad.addColorStop(1, `rgba(217,69,43,${(0.34 * fx.vignette * pulse).toFixed(3)})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      g.restore();
    }

    fx.render(g, LAYER.overlay);

    // 屏幕外玩家指示箭头（分屏转场 / 冲刺出界时）
    this.drawEdgeArrows(g);
  }

  private drawEdgeArrows(g: CanvasRenderingContext2D): void {
    const W = CONFIG.width;
    const H = CONFIG.height;
    const vs = this.rig.viewports();
    for (const p of this.game.players) {
      if (p.index === 0) continue;
      let inside = false;
      for (const v of vs) {
        const halfW = v.w / v.zoom / 2;
        const halfH = v.h / v.zoom / 2;
        if (
          Math.abs(p.x - v.camX) <= halfW &&
          Math.abs(p.y - v.camY) <= halfH
        ) {
          inside = true;
          break;
        }
      }
      if (inside) continue;
      const v = vs[0]!;
      const dx = p.x - v.camX;
      const dy = p.y - v.camY;
      const a = Math.atan2(dy, dx);
      const ex = W / 2 + Math.cos(a) * (W / 2 - 26);
      const ey = H / 2 + Math.sin(a) * (H / 2 - 26);
      const dist = Math.hypot(dx * v.zoom, dy * v.zoom);
      g.save();
      g.globalAlpha = Math.min(1, 0.35 + dist / 900);
      g.translate(ex, ey);
      g.rotate(a);
      g.fillStyle = p.tank.body;
      g.beginPath();
      g.moveTo(10, 0);
      g.lineTo(-8, -8);
      g.lineTo(-8, 8);
      g.closePath();
      g.fill();
      g.restore();
    }
  }

  private inBoundsBox(
    x: number,
    y: number,
    left: number,
    right: number,
    top: number,
    bottom: number,
    pad: number,
  ): boolean {
    return x >= left - pad && x <= right + pad && y >= top - pad && y <= bottom + pad;
  }
}

/** 派生色：把敌人主色提亮做高光。 */
function lighten(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number): number => Math.round(c + (255 - c) * 0.45);
  return `#${((mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).padStart(6, '0')}`;
}

const EXT_SNOW = '#e6f2f7';
const EXT_STONE = '#43435a';
