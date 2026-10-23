/**
 * 坦克绘制。
 *
 * 全部参数化：没有贴图、没有 sprite sheet。
 *
 * **八台坦克的轮廓真正不同**，不是同一矩形换色换炮塔：
 *   车体形状  八角 / 楔形 / 飞镖 / 菱形 / 六边 / 撞角 / 挂舱 / 带蒺藜
 *   炮塔形状  圆 / 方 / 六边 / 双联 / 圆顶 / 尖刺
 *   炮管形态  单 / 双联 / 超长 / 粗 / 加粗炮口 / 三联
 *   侧向结构  方块 / 尖刺 / 盾牌 / 弹舱 / 竖鳍 / 支腿
 *
 * 分层顺序（避免简笔画感）：
 *   投影 → 履带 → 侧结构 → 车体暗部 → 车体 → 顶板 → 前装甲
 *   → 细节 → 蒺藜 → 炮管 → 炮塔 → 发光描边 → 王牌动效
 */

import { COLORS } from '../config';
import {
  silhouetteOf,
  TREAD,
  type BarrelShape,
  type HullShape,
  type Silhouette,
  type TurretShape,
} from '../data/silhouette';
import { shade } from './color';

export interface TankPaint {
  body: string;
  light: string;
  tread: string;
  glow?: string;
}

/** 外观阶段：1 原型 / 2 定型 / 3 精工 / 4 王牌。 */
export type DecalStage = 1 | 2 | 3 | 4;

export interface TankAnim {
  t: number;
  moving: boolean;
  /** 移动速度 0..1。 */
  speed: number;
}

const IDLE: TankAnim = { t: 0, moving: false, speed: 0 };

// =====================================================================
// 路径工具
// =====================================================================

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}

/**
 * 车体路径。八种形状，这是第一识别特征。
 *
 * 所有形状都在 [-halfL, halfL] × [-halfW, halfW] 内，+x 是车头。
 */
function hullPath(
  g: CanvasRenderingContext2D,
  shape: HullShape,
  halfL: number,
  halfW: number,
  fc: number,
  rc: number,
): void {
  g.beginPath();

  switch (shape) {
    // 八角矩形：最常见的坦克底盘
    case 'block': {
      g.moveTo(halfL - fc, -halfW);
      g.lineTo(halfL, -halfW + fc);
      g.lineTo(halfL, halfW - fc);
      g.lineTo(halfL - fc, halfW);
      g.lineTo(-halfL + rc, halfW);
      g.lineTo(-halfL, halfW - rc);
      g.lineTo(-halfL, -halfW + rc);
      g.lineTo(-halfL + rc, -halfW);
      g.closePath();
      break;
    }

    // 楔形：前端收成一个尖，破障车
    case 'wedge': {
      g.moveTo(halfL, 0);
      g.lineTo(halfL - fc, -halfW * 0.62);
      g.lineTo(halfL - fc * 1.5, -halfW);
      g.lineTo(-halfL + rc, -halfW);
      g.lineTo(-halfL, -halfW + rc);
      g.lineTo(-halfL, halfW - rc);
      g.lineTo(-halfL + rc, halfW);
      g.lineTo(halfL - fc * 1.5, halfW);
      g.lineTo(halfL - fc, halfW * 0.62);
      g.closePath();
      break;
    }

    // 飞镖：前后都收尖
    case 'dart': {
      g.moveTo(halfL, 0);
      g.lineTo(halfL * 0.3, -halfW);
      g.lineTo(-halfL * 0.62, -halfW);
      g.lineTo(-halfL, -halfW * 0.36);
      g.lineTo(-halfL, halfW * 0.36);
      g.lineTo(-halfL * 0.62, halfW);
      g.lineTo(halfL * 0.3, halfW);
      g.closePath();
      break;
    }

    // 菱形：四边全斜
    case 'diamond': {
      g.moveTo(halfL, -halfW * 0.34);
      g.lineTo(halfL * 0.62, -halfW);
      g.lineTo(-halfL * 0.62, -halfW);
      g.lineTo(-halfL, -halfW * 0.34);
      g.lineTo(-halfL, halfW * 0.34);
      g.lineTo(-halfL * 0.62, halfW);
      g.lineTo(halfL * 0.62, halfW);
      g.lineTo(halfL, halfW * 0.34);
      g.closePath();
      break;
    }

    // 六边形：前后各一条平边
    case 'hex': {
      g.moveTo(halfL * 0.72, -halfW);
      g.lineTo(halfL, -halfW * 0.42);
      g.lineTo(halfL, halfW * 0.42);
      g.lineTo(halfL * 0.72, halfW);
      g.lineTo(-halfL * 0.72, halfW);
      g.lineTo(-halfL, halfW * 0.42);
      g.lineTo(-halfL, -halfW * 0.42);
      g.lineTo(-halfL * 0.72, -halfW);
      g.closePath();
      break;
    }

    // 撞角：矩形 + 前方一整块梯形撞锤
    case 'ram': {
      g.moveTo(halfL + fc, -halfW * 0.5);
      g.lineTo(halfL + fc, halfW * 0.5);
      g.lineTo(halfL, halfW * 0.86);
      g.lineTo(-halfL + rc, halfW);
      g.lineTo(-halfL, halfW - rc);
      g.lineTo(-halfL, -halfW + rc);
      g.lineTo(-halfL + rc, -halfW);
      g.lineTo(halfL, -halfW * 0.86);
      g.closePath();
      break;
    }

    // 挂舱：中央窄核心 + 两侧外凸的挂舱
    case 'cluster': {
      const coreW = halfW * 0.54;
      const podW = halfW * 0.46;
      // 左侧外凸
      g.moveTo(halfL * 0.86, -coreW);
      g.lineTo(halfL, -coreW);
      g.lineTo(halfL, coreW);
      g.lineTo(halfL * 0.86, coreW);
      // 右侧挂舱
      g.lineTo(halfL * 0.7, halfW);
      g.lineTo(-halfL * 0.7, halfW);
      g.lineTo(-halfL * 0.86, coreW);
      g.lineTo(-halfL, coreW);
      g.lineTo(-halfL, -coreW);
      g.lineTo(-halfL * 0.86, -coreW);
      g.lineTo(-halfL * 0.7, -halfW);
      g.lineTo(halfL * 0.7, -halfW);
      g.closePath();
      // podW 用于后续装饰，这里只是让类型不报错
      void podW;
      break;
    }

    // 带蒺藜：矩形，前缘会另外画刺（这里只画主体）
    case 'crown': {
      g.moveTo(halfL - fc, -halfW);
      g.lineTo(halfL, -halfW + fc);
      g.lineTo(halfL, halfW - fc);
      g.lineTo(halfL - fc, halfW);
      g.lineTo(-halfL + rc, halfW);
      g.lineTo(-halfL, halfW - rc);
      g.lineTo(-halfL, -halfW + rc);
      g.lineTo(-halfL + rc, -halfW);
      g.closePath();
      break;
    }

    default:
      break;
  }
}

function polygonPath(g: CanvasRenderingContext2D, r: number, n: number, rot: number): void {
  g.beginPath();
  for (let i = 0; i <= n; i += 1) {
    const a = (Math.PI * 2 * i) / n + rot;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

// =====================================================================
// 主函数
// =====================================================================

export function drawTank(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  radius: number,
  paint: TankPaint,
  stage: DecalStage = 1,
  model = '',
  anim: TankAnim = IDLE,
): void {
  const s = silhouetteOf(model);
  const dark = shade(paint.body, -0.48);
  const mid = paint.body;
  const top = shade(paint.body, 0.15);
  const edge = paint.light;
  const glow = paint.glow ?? paint.light;

  // ---- 几何 ----
  const totalHalfW = radius * s.width;
  const treadW = radius * TREAD.width;
  const treadCenterY = totalHalfW - treadW * 0.5;
  const hullHalfW = treadCenterY - treadW * 0.5;
  const hullHalfL = radius * s.length;
  const frontCut = radius * s.frontCut;
  const rearCut = radius * s.rearCut;
  const treadHalfL = hullHalfL * s.treadSpan + radius * TREAD.lengthPad;

  const turretR = radius * s.turretR;
  const turretX = radius * s.turretX;
  const barrelEnd = radius * s.barrelL;
  const barrelW = barrelWidthOf(s.barrel, radius);

  g.save();
  g.translate(x, y);
  g.rotate(angle);

  // ---- 1. 投影 ----
  g.save();
  g.globalAlpha = 0.28;
  g.fillStyle = COLORS.void;
  g.translate(radius * 0.08, radius * 0.12);
  hullPath(g, s.hull, hullHalfL, hullHalfW, frontCut, rearCut);
  g.fill();
  g.restore();

  // ---- 2. 履带 ----
  drawTreads(g, treadCenterY, treadW, treadHalfL, paint, stage, anim);

  // ---- 3. 侧向结构（侧裙板盖住履带；尖刺与支腿向外突出）----
  drawSideStructure(
    g,
    s,
    radius,
    hullHalfL,
    hullHalfW,
    treadCenterY + treadW * 0.5,
    mid,
    edge,
    glow,
    anim,
  );

  // ---- 4. 车体暗部 ----
  g.save();
  g.translate(0, radius * 0.05);
  hullPath(g, s.hull, hullHalfL, hullHalfW, frontCut, rearCut);
  g.fillStyle = dark;
  g.fill();
  g.restore();

  // ---- 5. 车体 ----
  hullPath(g, s.hull, hullHalfL, hullHalfW, frontCut, rearCut);
  g.fillStyle = mid;
  g.fill();
  g.strokeStyle = COLORS.void;
  g.lineWidth = 2;
  g.stroke();

  // ---- 6. 顶板（内缩提亮，形成装甲叠层）----
  g.save();
  const inset = radius * 0.08;
  hullPath(g, s.hull, hullHalfL - inset, hullHalfW - inset, frontCut * 0.8, rearCut * 0.8);
  g.fillStyle = top;
  g.fill();
  g.globalAlpha = 0.42;
  g.strokeStyle = shade(paint.body, 0.3);
  g.lineWidth = 1;
  g.stroke();
  g.restore();

  // ---- 7. 前装甲斜面 ----
  g.save();
  g.globalAlpha = 0.55;
  g.fillStyle = edge;
  g.beginPath();
  g.moveTo(hullHalfL * 0.44, -hullHalfW * 0.86);
  g.lineTo(hullHalfL - frontCut * 0.4, -hullHalfW * 0.44);
  g.lineTo(hullHalfL - frontCut * 0.4, hullHalfW * 0.44);
  g.lineTo(hullHalfL * 0.44, hullHalfW * 0.86);
  g.closePath();
  g.fill();
  g.restore();

  // ---- 8. 细节 ----
  if (stage >= 2) drawPanelLines(g, s.hull, hullHalfL, hullHalfW);
  if (stage >= 3) drawRivets(g, hullHalfL, hullHalfW, radius, edge);
  if (stage >= 3) drawEngineDeck(g, hullHalfL, hullHalfW, radius, dark, edge);
  if (stage >= 3) drawHeadlights(g, hullHalfL, hullHalfW, radius, glow);

  // ---- 9. 前缘铁蒺藜（铁砧的招牌）----
  if (s.spikes > 0) {
    drawSpikes(g, s.spikes, hullHalfL, hullHalfW, radius, mid, edge, stage);
  }

  // ---- 10. 炮管 ----
  drawBarrel(g, s.barrel, turretX, turretR, barrelEnd, barrelW, radius, mid, dark, edge, stage);

  // ---- 11. 炮塔 ----
  drawTurret(g, s.turret, turretR, turretX, radius, mid, dark, top, edge, glow, stage);

  // ---- 12. 阶段 Ⅳ：发光描边 ----
  if (stage >= 4) {
    g.save();
    hullPath(g, s.hull, hullHalfL, hullHalfW, frontCut, rearCut);
    g.strokeStyle = glow;
    g.globalAlpha = 0.6;
    g.lineWidth = 1.8;
    g.stroke();
    g.globalAlpha = 0.13;
    g.lineWidth = 6;
    g.stroke();
    g.restore();
  }

  // ---- 13. 阶段 Ⅳ：王牌特征 ----
  if (stage >= 4) {
    drawAceFeature(g, model, radius, turretX, turretR, barrelEnd, hullHalfW, hullHalfL, glow, anim);
  }

  g.restore();
}

// =====================================================================
// 部件
// =====================================================================

function barrelWidthOf(kind: BarrelShape, radius: number): number {
  switch (kind) {
    case 'wide':
      return Math.max(6, radius * 0.2);
    case 'cannon':
      return Math.max(7, radius * 0.23);
    case 'twin':
      return Math.max(3.5, radius * 0.1);
    case 'triple':
      return Math.max(3, radius * 0.085);
    case 'long':
      return Math.max(3.5, radius * 0.12);
    case 'single':
    default:
      return Math.max(4.5, radius * 0.15);
  }
}

/** 前缘铁蒺藜：一排向前伸出的锥形刺。 */
function drawSpikes(
  g: CanvasRenderingContext2D,
  count: number,
  halfL: number,
  halfW: number,
  radius: number,
  mid: string,
  edge: string,
  stage: DecalStage,
): void {
  const spikeLen = radius * (stage >= 3 ? 0.3 : 0.22);
  const spikeW = radius * 0.1;

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const y = (t - 0.5) * halfW * 1.72;
    const baseX = halfL - radius * 0.06;

    // 锥形刺
    g.fillStyle = mid;
    g.beginPath();
    g.moveTo(baseX, y - spikeW / 2);
    g.lineTo(baseX + spikeLen, y);
    g.lineTo(baseX, y + spikeW / 2);
    g.closePath();
    g.fill();
    g.strokeStyle = COLORS.void;
    g.lineWidth = 1.2;
    g.stroke();

    // 尖端高光
    g.save();
    g.globalAlpha = 0.8;
    g.strokeStyle = edge;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(baseX + spikeLen * 0.35, y);
    g.lineTo(baseX + spikeLen * 0.92, y);
    g.stroke();
    g.restore();
  }
}

function drawTreads(
  g: CanvasRenderingContext2D,
  centerY: number,
  treadW: number,
  halfL: number,
  paint: TankPaint,
  stage: DecalStage,
  anim: TankAnim,
): void {
  const phase = anim.moving ? (anim.t * 105) % 12 : 0;
  const cleats = 12;
  const span = halfL * 2;

  for (const sign of [-1, 1]) {
    const cy = sign * centerY;
    const y0 = cy - treadW / 2;

    g.fillStyle = paint.tread;
    roundRect(g, -halfL, y0, span, treadW, treadW * 0.3);
    g.fill();
    g.strokeStyle = COLORS.void;
    g.lineWidth = 1.6;
    g.stroke();

    // 靠车体一侧的阴影
    g.save();
    g.globalAlpha = 0.35;
    g.fillStyle = COLORS.void;
    const innerY = sign < 0 ? y0 + treadW * 0.6 : y0 + treadW * 0.12;
    g.fillRect(-halfL + 2, innerY, span - 4, treadW * 0.28);
    g.restore();

    // 链节
    g.save();
    g.globalAlpha = 0.45;
    g.strokeStyle = COLORS.void;
    g.lineWidth = 1;
    g.beginPath();
    const step = span / cleats;
    for (let i = 0; i < cleats; i += 1) {
      const cx = -halfL + i * step + phase;
      if (cx > halfL - 2) continue;
      g.moveTo(cx, y0 + treadW * 0.18);
      g.lineTo(cx, y0 + treadW * 0.82);
    }
    g.stroke();
    g.restore();

    // 外侧亮边
    g.save();
    g.globalAlpha = 0.32;
    g.strokeStyle = paint.light;
    g.lineWidth = 1.1;
    const oy = sign < 0 ? y0 + 0.7 : y0 + treadW - 0.7;
    g.beginPath();
    g.moveTo(-halfL + treadW * 0.4, oy);
    g.lineTo(halfL - treadW * 0.4, oy);
    g.stroke();
    g.restore();

    // 前后驱动轮
    g.save();
    g.fillStyle = shade(paint.tread, -0.4);
    for (const endSign of [-1, 1]) {
      g.beginPath();
      g.arc(endSign * halfL, cy, treadW * 0.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = COLORS.void;
      g.lineWidth = 1.3;
      g.stroke();
    }
    g.restore();

    // 阶段 Ⅲ 起：负重轮
    if (stage >= 3) {
      g.save();
      g.globalAlpha = 0.4;
      g.fillStyle = shade(paint.tread, 0.36);
      for (let i = 0; i < 5; i += 1) {
        const cx = -halfL * 0.62 + (halfL * 1.24 * i) / 4;
        g.beginPath();
        g.arc(cx, cy, treadW * 0.16, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
  }
}

/**
 * 侧向结构：盖在履带外侧（真实坦克的侧裙板），或从车身向外的突出件。
 *
 * 关键修正：block / shield / fin 做成**盖住履带的侧裙板**（从车体边缘一直延伸到
 * 履带外缘），而不是在履带外面再挂一根条 —— 那看起来像翅膀。
 * spike / outrigger 是真正向外突出的结构，保持突出。
 */
function drawSideStructure(
  g: CanvasRenderingContext2D,
  s: Silhouette,
  radius: number,
  hullHalfL: number,
  hullHalfW: number,
  treadOuter: number,
  mid: string,
  edge: string,
  glow: string,
  anim: TankAnim,
): void {
  if (s.side === 'none') return;
  const depth = radius * s.sideDepth;

  for (const sign of [-1, 1]) {
    const yHull = sign * hullHalfW;
    const yTread = sign * treadOuter;

    switch (s.side) {
      // 侧裙板：盖住履带，从车体边缘延伸到履带外缘
      case 'block': {
        const h = hullHalfL * 1.04;
        const yTop = Math.min(yHull, yTread);
        const yBottom = Math.max(yHull, yTread);
        g.fillStyle = mid;
        roundRect(g, -h * 0.55, yTop, h, yBottom - yTop, radius * 0.03);
        g.fill();
        g.strokeStyle = COLORS.void;
        g.lineWidth = 1.5;
        g.stroke();

        // 裙板接缝（三道竖线）
        g.save();
        g.globalAlpha = 0.4;
        g.strokeStyle = COLORS.void;
        g.lineWidth = 1;
        g.beginPath();
        for (let i = 1; i < 3; i += 1) {
          const px = -h * 0.55 + (h * i) / 3;
          g.moveTo(px, yTop + 2);
          g.lineTo(px, yBottom - 2);
        }
        g.stroke();
        g.restore();

        // 外缘亮边
        g.save();
        g.globalAlpha = 0.4;
        g.fillStyle = edge;
        const hy = sign < 0 ? yTop : yBottom - radius * 0.04;
        g.fillRect(-h * 0.55, hy, h, radius * 0.04);
        g.restore();
        break;
      }

      // 尖刺：真正向外突出的楔形（不是裙板）
      case 'spike': {
        const lx = hullHalfL * 0.42;
        const tipY = yTread + sign * depth;
        g.fillStyle = mid;
        g.beginPath();
        g.moveTo(-lx, yTread);
        g.lineTo(-lx * 0.2, tipY);
        g.lineTo(lx * 0.2, tipY);
        g.lineTo(lx, yTread);
        g.closePath();
        g.fill();
        g.strokeStyle = COLORS.void;
        g.lineWidth = 1.5;
        g.stroke();

        g.save();
        g.globalAlpha = 0.65;
        g.strokeStyle = edge;
        g.lineWidth = 1.1;
        g.beginPath();
        g.moveTo(-lx * 0.16, tipY - sign * 1.2);
        g.lineTo(lx * 0.16, tipY - sign * 1.2);
        g.stroke();
        g.restore();
        break;
      }

      // 盾牌：最厚最长的侧裙，外缘做成斜角
      case 'shield': {
        const h = hullHalfL * 1.16;
        const yTop = Math.min(yHull, yTread);
        const yBottom = Math.max(yHull, yTread);
        const yOuter = yTread + sign * depth * 0.5;
        g.beginPath();
        g.moveTo(-h * 0.5, yHull);
        g.lineTo(-h * 0.34, yOuter);
        g.lineTo(h * 0.34, yOuter);
        g.lineTo(h * 0.5, yHull);
        g.closePath();
        g.fillStyle = mid;
        g.fill();
        g.strokeStyle = COLORS.void;
        g.lineWidth = 1.7;
        g.stroke();

        // 面板分缝
        g.save();
        g.globalAlpha = 0.38;
        g.strokeStyle = COLORS.void;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(-h * 0.18, Math.min(yHull, yOuter));
        g.lineTo(-h * 0.18, Math.max(yHull, yOuter) - (sign < 0 ? 0 : 0));
        g.moveTo(h * 0.18, Math.min(yHull, yOuter));
        g.lineTo(h * 0.18, Math.max(yHull, yOuter));
        g.stroke();
        g.restore();

        g.save();
        g.globalAlpha = 0.42;
        g.strokeStyle = edge;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(-h * 0.34, yOuter - sign * 0.9);
        g.lineTo(h * 0.34, yOuter - sign * 0.9);
        g.stroke();
        g.restore();
        void yTop;
        void yBottom;
        break;
      }

      // 弹舱：盖住履带的一段，带发光舱口
      case 'pod': {
        for (let i = 0; i < 2; i += 1) {
          const cx = -hullHalfL * 0.36 + hullHalfL * 0.5 * i;
          const w = hullHalfL * 0.38;
          const yTop = Math.min(yHull, yTread);
          const yBottom = Math.max(yHull, yTread);
          g.fillStyle = shade(mid, -0.32);
          roundRect(g, cx - w / 2, yTop, w, yBottom - yTop, radius * 0.03);
          g.fill();
          g.strokeStyle = COLORS.void;
          g.lineWidth = 1.3;
          g.stroke();

          g.save();
          g.globalAlpha = 0.42 + Math.sin(anim.t * 3 + i) * 0.16;
          g.fillStyle = glow;
          const gy = sign < 0 ? yTread - radius * 0.05 : yTread + radius * 0.015;
          g.fillRect(cx - w * 0.26, gy, w * 0.52, radius * 0.04);
          g.restore();
        }
        break;
      }

      // 竖鳍：盖住履带、外缘带发光线
      case 'fin': {
        const h = hullHalfL * 1.04;
        const yTop = Math.min(yHull, yTread);
        const yBottom = Math.max(yHull, yTread);
        g.beginPath();
        g.moveTo(-h * 0.5, yHull);
        g.lineTo(-h * 0.4, yTread);
        g.lineTo(h * 0.4, yTread);
        g.lineTo(h * 0.5, yHull);
        g.closePath();
        g.fillStyle = mid;
        g.fill();
        g.strokeStyle = COLORS.void;
        g.lineWidth = 1.4;
        g.stroke();

        g.save();
        g.globalAlpha = 0.42 + Math.sin(anim.t * 2.4) * 0.2;
        g.strokeStyle = glow;
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(-h * 0.36, yTread - sign * 0.7);
        g.lineTo(h * 0.36, yTread - sign * 0.7);
        g.stroke();
        g.restore();
        void yTop;
        void yBottom;
        break;
      }

      // 支腿：长矛专属
      case 'outrigger': {
        const lx = hullHalfL * 0.46;
        const legY = yTread + sign * depth * 1.4;
        g.lineCap = 'round';
        g.strokeStyle = COLORS.void;
        g.lineWidth = radius * 0.09;
        g.beginPath();
        g.moveTo(-lx, yTread);
        g.lineTo(-lx * 0.5, legY);
        g.moveTo(lx, yTread);
        g.lineTo(lx * 0.5, legY);
        g.stroke();

        g.strokeStyle = mid;
        g.lineWidth = radius * 0.052;
        g.beginPath();
        g.moveTo(-lx, yTread);
        g.lineTo(-lx * 0.5, legY);
        g.moveTo(lx, yTread);
        g.lineTo(lx * 0.5, legY);
        g.stroke();
        g.lineCap = 'butt';

        g.fillStyle = mid;
        for (const px of [-lx * 0.5, lx * 0.5]) {
          roundRect(
            g,
            px - radius * 0.07,
            legY - radius * 0.045,
            radius * 0.14,
            radius * 0.09,
            1,
          );
          g.fill();
          g.strokeStyle = COLORS.void;
          g.lineWidth = 1.1;
          g.stroke();
        }
        break;
      }

      default:
        break;
    }
  }
}

function drawPanelLines(
  g: CanvasRenderingContext2D,
  shape: HullShape,
  halfL: number,
  halfW: number,
): void {
  g.save();
  g.globalAlpha = 0.26;
  g.strokeStyle = COLORS.void;
  g.lineWidth = 1;
  g.beginPath();

  // 只有方正的形状适合画直线缝；尖形车体画了会很乱
  if (shape === 'block' || shape === 'crown' || shape === 'hex') {
    g.moveTo(-halfL * 0.05, -halfW * 0.8);
    g.lineTo(-halfL * 0.05, halfW * 0.8);
    g.moveTo(-halfL * 0.78, -halfW * 0.34);
    g.lineTo(halfL * 0.3, -halfW * 0.34);
    g.moveTo(-halfL * 0.78, halfW * 0.34);
    g.lineTo(halfL * 0.3, halfW * 0.34);
  } else if (shape === 'cluster') {
    // 挂舱上的分缝
    for (const sign of [-1, 1]) {
      g.moveTo(-halfL * 0.5, sign * halfW * 0.66);
      g.lineTo(halfL * 0.5, sign * halfW * 0.66);
    }
  }
  g.stroke();
  g.restore();
}

function drawRivets(
  g: CanvasRenderingContext2D,
  halfL: number,
  halfW: number,
  radius: number,
  edge: string,
): void {
  g.save();
  g.fillStyle = edge;
  g.globalAlpha = 0.5;
  const r = Math.max(0.9, radius * 0.026);
  for (let i = 1; i < 5; i += 1) {
    const px = -halfL + (halfL * 2 * i) / 5;
    for (const sign of [-1, 1]) {
      g.beginPath();
      g.arc(px, sign * halfW * 0.74, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

function drawEngineDeck(
  g: CanvasRenderingContext2D,
  halfL: number,
  halfW: number,
  radius: number,
  dark: string,
  edge: string,
): void {
  g.save();
  g.globalAlpha = 0.42;
  g.strokeStyle = COLORS.void;
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < 4; i += 1) {
    const gx = -halfL * 0.68 + i * radius * 0.085;
    g.moveTo(gx, -halfW * 0.4);
    g.lineTo(gx, halfW * 0.4);
  }
  g.stroke();
  g.restore();

  g.save();
  g.fillStyle = dark;
  for (const sign of [-1, 1]) {
    roundRect(
      g,
      -halfL - radius * 0.05,
      sign * halfW * 0.3 - radius * 0.05,
      radius * 0.09,
      radius * 0.1,
      1,
    );
    g.fill();
  }
  g.globalAlpha = 0.24;
  g.fillStyle = edge;
  for (const sign of [-1, 1]) {
    g.fillRect(-halfL - radius * 0.04, sign * halfW * 0.3 - radius * 0.02, radius * 0.07, radius * 0.035);
  }
  g.restore();
}

function drawHeadlights(
  g: CanvasRenderingContext2D,
  halfL: number,
  halfW: number,
  radius: number,
  glow: string,
): void {
  g.save();
  for (const sign of [-1, 1]) {
    const lx = halfL - radius * 0.16;
    const ly = sign * halfW * 0.52;
    g.beginPath();
    g.arc(lx, ly, radius * 0.065, 0, Math.PI * 2);
    g.fillStyle = COLORS.void;
    g.fill();
    g.beginPath();
    g.arc(lx, ly, radius * 0.042, 0, Math.PI * 2);
    g.fillStyle = glow;
    g.globalAlpha = 0.85;
    g.fill();
    g.globalAlpha = 1;
  }
  g.restore();
}

function drawBarrel(
  g: CanvasRenderingContext2D,
  kind: BarrelShape,
  turretX: number,
  turretR: number,
  end: number,
  w: number,
  radius: number,
  mid: string,
  dark: string,
  edge: string,
  stage: DecalStage,
): void {
  const start = turretX - turretR * 0.2;

  const one = (offsetY: number, width: number): void => {
    g.fillStyle = dark;
    g.fillRect(start, offsetY - width / 2 + radius * 0.028, end - start, width);
    g.fillStyle = mid;
    g.fillRect(start, offsetY - width / 2, end - start, width * 0.84);
    g.save();
    g.globalAlpha = 0.5;
    g.fillStyle = edge;
    g.fillRect(start, offsetY - width / 2, end - start, Math.max(1, width * 0.26));
    g.restore();
    g.strokeStyle = COLORS.void;
    g.lineWidth = 1.4;
    g.strokeRect(start, offsetY - width / 2, end - start, width);
  };

  switch (kind) {
    case 'twin': {
      const gap = w * 2.3;
      one(-gap / 2, w);
      one(gap / 2, w);
      break;
    }

    case 'triple': {
      const gap = w * 2.1;
      one(-gap, w);
      one(0, w);
      one(gap, w);
      break;
    }

    case 'long': {
      one(0, w);
      g.save();
      g.fillStyle = edge;
      g.globalAlpha = 0.7;
      const span = end - start;
      g.fillRect(start + span * 0.42, -w * 0.68, 2, w * 1.36);
      g.fillRect(start + span * 0.7, -w * 0.68, 2, w * 1.36);
      g.restore();

      g.save();
      g.strokeStyle = edge;
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(end - radius * 0.08, -radius * 0.1);
      g.lineTo(end + radius * 0.22, 0);
      g.lineTo(end - radius * 0.08, radius * 0.1);
      g.stroke();
      g.restore();
      break;
    }

    case 'wide':
    case 'cannon': {
      one(0, w);
      const mult = kind === 'cannon' ? 1.9 : 1.55;
      const mLen = w * 1.2;
      const mW = w * mult;
      g.fillStyle = mid;
      g.fillRect(end - mLen, -mW / 2, mLen, mW);
      g.strokeStyle = COLORS.void;
      g.lineWidth = 1.4;
      g.strokeRect(end - mLen, -mW / 2, mLen, mW);
      g.save();
      g.fillStyle = edge;
      g.globalAlpha = 0.58;
      g.fillRect(end - mLen, -mW / 2, mLen, 1.1);
      g.restore();
      break;
    }

    case 'single':
    default: {
      one(0, w);
      if (stage >= 2) {
        const mLen = w * 1.05;
        const mW = w * 1.5;
        g.fillStyle = mid;
        g.fillRect(end - mLen, -mW / 2, mLen, mW);
        g.strokeStyle = COLORS.void;
        g.lineWidth = 1.3;
        g.strokeRect(end - mLen, -mW / 2, mLen, mW);
      }
      if (stage >= 3) {
        g.save();
        g.fillStyle = edge;
        g.globalAlpha = 0.65;
        g.fillRect(start + (end - start) * 0.56, -w * 0.62, 2, w * 1.24);
        g.restore();
      }
      break;
    }
  }
}

/**
 * 炮塔：六种形状。第一识别点。
 */
function drawTurret(
  g: CanvasRenderingContext2D,
  shape: TurretShape,
  r: number,
  turretX: number,
  radius: number,
  mid: string,
  dark: string,
  top: string,
  edge: string,
  glow: string,
  stage: DecalStage,
): void {
  g.save();
  g.translate(turretX, 0);

  // 投影
  g.save();
  g.globalAlpha = 0.2;
  g.fillStyle = COLORS.void;
  g.translate(radius * 0.04, radius * 0.06);
  if (shape === 'twin') {
    for (const sign of [-1, 1]) {
      g.beginPath();
      g.arc(sign * r * 0.5, 0, r * 0.58, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    turretPath(g, shape, r);
    g.fill();
  }
  g.restore();

  // 阶段 Ⅲ 起：座圈
  if (stage >= 3 && shape !== 'twin') {
    g.beginPath();
    g.arc(0, 0, r * 1.05, 0, Math.PI * 2);
    g.fillStyle = dark;
    g.fill();
    g.strokeStyle = COLORS.void;
    g.lineWidth = 1.2;
    g.stroke();
  }

  if (shape === 'twin') {
    for (const sign of [-1, 1]) {
      g.beginPath();
      g.arc(sign * r * 0.5, 0, r * 0.58, 0, Math.PI * 2);
      g.fillStyle = mid;
      g.fill();
      g.strokeStyle = COLORS.void;
      g.lineWidth = 1.7;
      g.stroke();
    }
    g.save();
    g.fillStyle = dark;
    g.fillRect(-r * 0.5, -r * 0.2, r * 1.0, r * 0.4);
    g.restore();
    g.save();
    g.globalAlpha = 0.42;
    g.fillStyle = top;
    for (const sign of [-1, 1]) {
      g.beginPath();
      g.arc(sign * r * 0.5, -r * 0.14, r * 0.24, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.restore();
    return;
  }

  turretPath(g, shape, r);
  g.fillStyle = mid;
  g.fill();
  g.strokeStyle = COLORS.void;
  g.lineWidth = 2;
  g.stroke();

  // 顶部提亮
  g.save();
  g.globalAlpha = 0.45;
  g.fillStyle = top;
  if (shape === 'round' || shape === 'dome') {
    g.beginPath();
    g.arc(0, 0, r * 0.82, Math.PI * 1.02, Math.PI * 1.5);
    g.arc(0, 0, r * 0.3, Math.PI * 1.5, Math.PI * 1.02, true);
    g.closePath();
    g.fill();
  } else if (shape === 'square') {
    polygonPath(g, r * 0.64, 4, Math.PI / 4);
    g.fill();
  } else if (shape === 'hex') {
    polygonPath(g, r * 0.58, 6, 0);
    g.fill();
  } else if (shape === 'spike') {
    // 尖刺塔：中央圆 + 四周六根突出短刺，只画圆的部分
    g.beginPath();
    g.arc(0, 0, r * 0.66, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();

  // 圆顶塔：额外的穹顶弧
  if (shape === 'dome') {
    g.save();
    g.globalAlpha = 0.6;
    g.strokeStyle = edge;
    g.lineWidth = 1.3;
    g.beginPath();
    g.arc(0, 0, r * 0.58, Math.PI * 1.05, Math.PI * 1.45);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, r * 0.3, Math.PI * 1.05, Math.PI * 1.45);
    g.stroke();
    g.restore();
  }

  // 尖刺塔：炮塔四周六根短刺（终焉专属）
  if (shape === 'spike') {
    g.save();
    g.fillStyle = mid;
    g.strokeStyle = COLORS.void;
    g.lineWidth = 1.2;
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const bx = Math.cos(a) * r * 0.95;
      const by = Math.sin(a) * r * 0.95;
      const tx = Math.cos(a) * r * 1.42;
      const ty = Math.sin(a) * r * 1.42;
      const perpX = Math.cos(a + Math.PI / 2) * r * 0.16;
      const perpY = Math.sin(a + Math.PI / 2) * r * 0.16;
      g.beginPath();
      g.moveTo(bx + perpX, by + perpY);
      g.lineTo(tx, ty);
      g.lineTo(bx - perpX, by - perpY);
      g.closePath();
      g.fill();
      g.stroke();
    }
    g.restore();
  }

  // 阶段 Ⅱ 起：舱盖
  if (stage >= 2) {
    const capR = r * 0.26;
    const capX = -r * 0.18;
    const capY = -r * 0.24;
    g.beginPath();
    g.arc(capX, capY, capR, 0, Math.PI * 2);
    g.fillStyle = dark;
    g.fill();
    g.strokeStyle = COLORS.void;
    g.lineWidth = 1.1;
    g.stroke();

    g.save();
    g.strokeStyle = edge;
    g.globalAlpha = 0.5;
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(capX - capR * 0.4, capY);
    g.lineTo(capX + capR * 0.4, capY);
    g.stroke();
    g.restore();
  }

  // 阶段 Ⅲ 起：观察窗
  if (stage >= 3) {
    g.save();
    g.fillStyle = glow;
    g.globalAlpha = 0.75;
    for (const sign of [-1, 1]) {
      g.beginPath();
      g.arc(r * 0.42, sign * r * 0.24, Math.max(0.85, radius * 0.028), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  g.restore();
}

function turretPath(g: CanvasRenderingContext2D, shape: TurretShape, r: number): void {
  if (shape === 'square') polygonPath(g, r * 1.0, 4, Math.PI / 4);
  else if (shape === 'hex') polygonPath(g, r, 6, 0);
  else if (shape === 'spike' || shape === 'dome' || shape === 'round') {
    g.arc(0, 0, r, 0, Math.PI * 2);
  } else g.arc(0, 0, r, 0, Math.PI * 2);
}

// =====================================================================
// 王牌特征与动效
// =====================================================================

function drawAceFeature(
  g: CanvasRenderingContext2D,
  model: string,
  radius: number,
  turretX: number,
  turretR: number,
  barrelEnd: number,
  hullHalfW: number,
  hullHalfL: number,
  glow: string,
  anim: TankAnim,
): void {
  const t = anim.t;

  switch (model) {
    case 'anvil': {
      const pulse = 0.4 + Math.sin(t * 2.2) * 0.2;
      g.save();
      g.globalAlpha = pulse;
      g.strokeStyle = glow;
      g.lineWidth = 1.8;
      for (const sign of [-1, 1]) {
        g.beginPath();
        g.moveTo(-hullHalfL * 0.4, sign * hullHalfW * 0.68);
        g.lineTo(hullHalfL * 0.2, sign * hullHalfW * 0.68);
        g.stroke();
      }
      g.restore();
      break;
    }

    case 'echo': {
      const spin = t * 3.4;
      g.save();
      g.translate(turretX, 0);
      g.strokeStyle = glow;
      g.globalAlpha = 0.72;
      g.lineWidth = 1.7;
      for (let i = 0; i < 3; i += 1) {
        const a = spin + (Math.PI * 2 * i) / 3;
        g.beginPath();
        g.arc(0, 0, turretR * 0.68, a, a + 0.7);
        g.stroke();
      }
      g.restore();

      if (anim.moving) {
        g.save();
        g.globalAlpha = 0.18 + anim.speed * 0.26;
        g.strokeStyle = glow;
        g.lineWidth = 1.4;
        g.beginPath();
        g.arc(-hullHalfL * 0.1, 0, radius * 0.66, Math.PI * 0.6, Math.PI * 1.4);
        g.stroke();
        g.restore();
      }
      break;
    }

    case 'bastion': {
      const pulse = 0.26 + Math.sin(t * 1.6) * 0.12;
      g.save();
      g.globalAlpha = pulse;
      g.strokeStyle = glow;
      g.lineWidth = 1.3;
      const R = radius * 0.98;
      g.beginPath();
      for (let i = 0; i <= 6; i += 1) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = Math.cos(a) * R;
        const py = Math.sin(a) * R;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
      g.restore();
      break;
    }

    case 'lance': {
      const flow = (t * 1.8) % 1;
      g.save();
      g.globalAlpha = 0.55;
      g.strokeStyle = glow;
      g.lineWidth = 1.2;
      for (const sign of [-1, 1]) {
        g.beginPath();
        g.moveTo(turretX + turretR * 1.1, sign * radius * 0.12);
        g.lineTo(barrelEnd - radius * 0.12, sign * radius * 0.12);
        g.stroke();
      }
      g.restore();

      g.save();
      g.fillStyle = glow;
      g.globalAlpha = 0.88;
      const from = turretX + turretR * 1.1;
      const px = from + (barrelEnd - radius * 0.12 - from) * flow;
      g.beginPath();
      g.arc(px, 0, radius * 0.045, 0, Math.PI * 2);
      g.fill();
      g.restore();
      break;
    }

    case 'furnace': {
      const flicker = 0.5 + Math.sin(t * 11) * 0.2 + Math.sin(t * 17.3) * 0.1;
      g.save();
      g.globalAlpha = flicker;
      g.fillStyle = COLORS.blast;
      const fx = -hullHalfL - radius * 0.04;
      for (let i = 0; i < 3; i += 1) {
        const phase = t * 9 + i * 2.1;
        const h = radius * (0.15 + Math.sin(phase) * 0.05);
        const w = radius * 0.08;
        const ox = fx - i * radius * 0.075;
        const oy = (i - 1) * hullHalfW * 0.42;
        g.beginPath();
        g.moveTo(ox, oy - w / 2);
        g.lineTo(ox - h, oy);
        g.lineTo(ox, oy + w / 2);
        g.closePath();
        g.fill();
      }
      g.restore();

      g.save();
      g.globalAlpha = 0.15 + Math.sin(t * 5) * 0.06;
      g.strokeStyle = COLORS.blast;
      g.lineWidth = 1.2;
      roundRect(g, -hullHalfL * 0.6, -hullHalfW * 0.56, hullHalfL * 0.5, hullHalfW * 1.12, 2);
      g.stroke();
      g.restore();
      break;
    }

    case 'arc': {
      g.save();
      g.translate(turretX, 0);
      g.strokeStyle = glow;
      g.globalAlpha = 0.75;
      g.lineWidth = 1.8;
      g.beginPath();
      g.arc(0, 0, turretR * 1.14, 0, Math.PI * 2);
      g.stroke();
      g.restore();

      const seg = Math.floor(t / 0.18);
      g.save();
      g.translate(turretX, 0);
      g.strokeStyle = glow;
      g.lineWidth = 1.4;
      g.globalAlpha = 0.85;
      for (let arcI = 0; arcI < 3; arcI += 1) {
        const seed = seg * 7 + arcI * 31;
        const rnd = (n: number): number => {
          const v = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
          return v - Math.floor(v);
        };
        const a0 = rnd(1) * Math.PI * 2;
        const a1 = a0 + 0.9 + rnd(2) * 1.2;
        const r0 = turretR * 0.95;
        const r1 = turretR * (1.5 + rnd(3) * 0.4);
        const midR = (r0 + r1) / 2;
        const midA = (a0 + a1) / 2 + (rnd(4) - 0.5) * 0.6;

        g.beginPath();
        g.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
        g.lineTo(Math.cos(midA) * midR, Math.sin(midA) * midR);
        g.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
        g.stroke();
      }
      g.restore();
      break;
    }

    case 'swarm': {
      g.save();
      g.fillStyle = glow;
      g.globalAlpha = 0.85;
      for (let i = 0; i < 4; i += 1) {
        const a = t * 2.2 + (Math.PI * 2 * i) / 4;
        const r = radius * 0.94;
        g.beginPath();
        g.arc(Math.cos(a) * r, Math.sin(a) * r, radius * 0.042, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      break;
    }

    case 'mk2': {
      const spin = t * 0.9;
      g.save();
      g.translate(turretX, 0);
      g.strokeStyle = glow;
      g.globalAlpha = 0.55;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, turretR * 1.62, spin, spin + Math.PI * 1.25);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, turretR * 1.62, spin + Math.PI, spin + Math.PI * 2.25);
      g.stroke();
      g.restore();

      g.save();
      g.translate(turretX, 0);
      g.fillStyle = glow;
      for (let i = 0; i < 8; i += 1) {
        const a = (Math.PI * 2 * i) / 8 + spin * 0.5;
        const phase = (t * 1.6 + i * 0.25) % 2;
        const bright = phase < 1 ? phase : 2 - phase;
        g.globalAlpha = 0.24 + bright * 0.56;
        g.beginPath();
        g.arc(
          Math.cos(a) * turretR * 1.62,
          Math.sin(a) * turretR * 1.62,
          radius * (0.032 + bright * 0.03),
          0,
          Math.PI * 2,
        );
        g.fill();
      }
      g.restore();
      break;
    }

    default:
      break;
  }
}

export { shade };
