/**
 * 相机与分屏状态机（docs/camera.md）。
 *
 * 判定用"能不能装下"而不是"离多远"：屏幕是 960×540，横向和纵向比例不同，
 * 直接用距离会在纵向上过早分屏。
 *
 *   needW = |dx| + 2×留白
 *   needH = |dy| + 2×留白
 *   fitZoom = min(W/needW, H/needH)     ← 装下两人所需的最小缩放
 *
 * 合 → 分：fitZoom < splitEnterZoom
 * 分 → 合：fitZoom > splitExitZoom（滞回）+ 驻留 dwell
 */

import { CAMERA, CONFIG } from './config';

export type CamMode = 'merged' | 'split';
export type SplitSetting = 'auto' | 'never' | 'always';

/** 一路视口。 */
export interface Viewport {
  x: number;
  y: number;
  w: number;
  h: number;
  camX: number;
  camY: number;
  zoom: number;
}

interface Target {
  x: number;
  y: number;
}

export class CameraRig {
  mode: CamMode = 'merged';
  /** 转场进度 0（合）→ 1（分）。 */
  split = 0;

  /** 合屏相机。 */
  readonly merged: Viewport = { x: 0, y: 0, w: CONFIG.width, h: CONFIG.height, camX: 0, camY: 0, zoom: 1 };
  /** 分屏两路。 */
  readonly left: Viewport = { x: 0, y: 0, w: CONFIG.width / 2, h: CONFIG.height, camX: 0, camY: 0, zoom: 0.9 };
  readonly right: Viewport = { x: CONFIG.width / 2, y: 0, w: CONFIG.width / 2, h: CONFIG.height, camX: 0, camY: 0, zoom: 0.9 };

  /** 供 UI 显示的诊断值。 */
  fitZoom = 1;
  needW = 0;
  needH = 0;

  private dwell = 0;
  private forceUntil = 0;
  private time = 0;

  /** 前瞻量，平滑避免抖动。 */
  private lookT = 0;

  constructor(
    private readonly worldW: number,
    private readonly worldH: number,
    private twoPlayer: boolean,
  ) {}

  setTwoPlayer(on: boolean): void {
    this.twoPlayer = on;
    if (!on) {
      this.mode = 'merged';
      this.split = 0;
    }
  }

  /** 强制合屏一段时间（倒地、暂停、选卡、结算都用它）。 */
  forceMerge(seconds: number): void {
    this.forceUntil = this.time + seconds;
  }

  /** 倒地后的重新判定延迟。 */
  afterRevive(): void {
    this.forceMerge(-CAMERA.afterRevive);
    this.dwell = 0;
  }

  /**
   * 每帧更新。
   *
   * @param p1     玩家一位置
   * @param p2     玩家二位置（单人为 null）
   * @param aimAngle 主瞄准方向（前瞻用）
   * @param setting 设置项 split-mode
   * @param downed 是否有一人倒地（强制合屏）
   */
  update(
    dt: number,
    p1: Target,
    p2: Target | null,
    aimAngle: number,
    setting: SplitSetting,
    downed: boolean,
  ): void {
    this.time += dt;
    const W = CONFIG.width;
    const H = CONFIG.height;

    // ---- 判定 ----
    let want: CamMode = 'merged';
    if (p2 && this.twoPlayer && setting !== 'never') {
      const needW = Math.abs(p2.x - p1.x) + CAMERA.padding * 2;
      const needH = Math.abs(p2.y - p1.y) + CAMERA.padding * 2;
      this.needW = needW;
      this.needH = needH;
      this.fitZoom = Math.min(W / needW, H / needH);

      if (setting === 'always') {
        want = 'split';
      } else if (downed || this.time < this.forceUntil) {
        want = 'merged';
      } else if (this.mode === 'merged') {
        want = this.fitZoom < CAMERA.splitEnterZoom ? 'split' : 'merged';
      } else {
        want = this.fitZoom > CAMERA.splitExitZoom ? 'merged' : 'split';
      }
    } else if (downed || this.time < this.forceUntil) {
      want = 'merged';
    }

    if (want !== this.mode) {
      this.dwell += dt;
      if (this.dwell >= CAMERA.dwell) {
        this.mode = want;
        this.dwell = 0;
      }
    } else {
      this.dwell = 0;
    }

    // ---- 转场进度 ----
    const targetSplit = this.mode === 'split' && this.twoPlayer && p2 ? 1 : 0;
    const speed = targetSplit > this.split ? 1 / CAMERA.splitAnim : 1 / CAMERA.mergeAnim;
    if (this.split < targetSplit) this.split = Math.min(targetSplit, this.split + speed * dt);
    else if (this.split > targetSplit) this.split = Math.max(targetSplit, this.split - speed * dt);

    // ---- 前瞻：朝瞄准方向偏一点，让炮口前方多些视野 ----
    const wantLook = p2 ? 0.35 : 1;
    this.lookT += (wantLook - this.lookT) * (1 - Math.exp(-3 * dt));
    const la = CAMERA.lookAhead * this.lookT;
    const lx = Math.cos(aimAngle) * la;
    const ly = Math.sin(aimAngle) * la;

    // ---- 合屏相机 ----
    const midX = p2 ? (p1.x + p2.x) / 2 : p1.x;
    const midY = p2 ? (p1.y + p2.y) / 2 : p1.y;
    const fit = p2 ? Math.min(CAMERA.mergedMax, Math.max(CAMERA.mergedMin, this.fitZoom)) : CAMERA.mergedMax;
    const mergedZoom = lerp(this.merged.zoom, p2 ? fit : CAMERA.mergedMax, 1 - Math.exp(-6 * dt));
    this.merged.zoom = mergedZoom;
    this.followTo(this.merged, midX + lx, midY + ly, mergedZoom, dt);

    // ---- 分屏两路 ----
    const sz = CAMERA.splitZoom;
    this.followTo(this.left, p1.x + lx, p1.y + ly, sz, dt);
    if (p2) this.followTo(this.right, p2.x + lx, p2.y + ly, sz, dt);
    else this.followTo(this.right, p1.x + lx, p1.y + ly, sz, dt);
    this.left.zoom = sz;
    this.right.zoom = sz;
  }

  /** 平滑跟随 + 边界钳制。 */
  private followTo(v: Viewport, tx: number, ty: number, zoom: number, dt: number): void {
    const k = 1 - Math.exp(-CAMERA.follow * dt);
    v.camX += (tx - v.camX) * k;
    v.camY += (ty - v.camY) * k;

    const halfW = v.w / zoom / 2;
    const halfH = v.h / zoom / 2;
    if (this.worldW <= halfW * 2) v.camX = this.worldW / 2;
    else v.camX = Math.min(this.worldW - halfW, Math.max(halfW, v.camX));
    if (this.worldH <= halfH * 2) v.camY = this.worldH / 2;
    else v.camY = Math.min(this.worldH - halfH, Math.max(halfH, v.camY));
  }

  /**
   * 当前应该渲染几路视口。
   *
   * 转场开始时两路都停在中点相机，随后各自 lerp —— 所以 t 在 (0,1) 之间
   * 两路都要画，B 的宽度从 0 长到一半。
   */
  viewports(): Viewport[] {
    if (this.split <= 0.001) return [this.merged];
    if (this.split >= 0.999) return [this.left, this.right];

    // 转场中：dividerX 从右边缘扫到中线
    const dividerX = CONFIG.width - (CONFIG.width / 2) * this.split;
    const a: Viewport = { ...this.left, x: 0, y: 0, w: dividerX, h: CONFIG.height };
    const b: Viewport = { ...this.right, x: dividerX, y: 0, w: CONFIG.width - dividerX, h: CONFIG.height };
    // 两路的相机从合屏中点插值到自己的目标
    const t = this.split;
    a.camX = lerp(this.merged.camX, this.left.camX, t);
    a.camY = lerp(this.merged.camY, this.left.camY, t);
    b.camX = lerp(this.merged.camX, this.right.camX, t);
    b.camY = lerp(this.merged.camY, this.right.camY, t);
    a.zoom = lerp(this.merged.zoom, this.left.zoom, t);
    b.zoom = lerp(this.merged.zoom, this.right.zoom, t);
    // 宽度为 0 的那一路不画，否则会 clip 出空矩形
    return a.w > 1 && b.w > 1 ? [a, b] : [a.w > 1 ? a : b];
  }

  /**
   * 玩家是否在某个视口外（用于边缘箭头）。
   *
   * 合屏时两人理论上都在画面内，但转场动画期间和冲刺瞬间会出界。
   */
  outsideViewport(x: number, y: number): Viewport | null {
    for (const v of this.viewports()) {
      const halfW = v.w / v.zoom / 2;
      const halfH = v.h / v.zoom / 2;
      if (
        x >= v.camX - halfW + CAMERA.arrowMargin &&
        x <= v.camX + halfW - CAMERA.arrowMargin &&
        y >= v.camY - halfH + CAMERA.arrowMargin &&
        y <= v.camY + halfH - CAMERA.arrowMargin
      ) {
        return null;
      }
    }
    return this.merged;
  }

  /** 屏幕对角线的世界长度（用于判断"地图两端"）。 */
  worldSpan(): number {
    return Math.hypot(this.worldW, this.worldH);
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
