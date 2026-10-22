/**
 * 可复现随机数（game-sdk：用 ctx.random，不用 Math.random）。
 *
 * 逻辑层与特效层都从这里取随机数，因此同一个 seed 能重放出完全一致的一局 ——
 * 包括敌人位置、卡池顺序和粒子轨迹。这是排查"第 N 帧才出现的 bug"的前提。
 *
 * ctx.random 已提供 next / int / float / pick；这里只是包一层给内部用，
 * 并保留一个独立的确定性 PRNG 供 fx 使用（它按 slot 消耗，与逻辑流独立）。
 */

import type { Random } from '@hearthbox/sdk';

/** 平台 Random 的轻封装：调用点更短，且集中一处，方便审计"哪里在用随机"。 */
export class RngView {
  constructor(private readonly r: Random) {}

  next(): number {
    return this.r.next();
  }

  range(min: number, max: number): number {
    return this.r.float(min, max);
  }

  int(min: number, max: number): number {
    return this.r.int(min, max);
  }

  chance(p: number): boolean {
    return this.r.next() < p;
  }

  sign(): number {
    return this.r.next() < 0.5 ? -1 : 1;
  }

  pick<T>(items: readonly T[]): T | undefined {
    return this.r.pick(items);
  }

  /** 单位圆上的随机角度。 */
  angle(): number {
    return this.r.next() * Math.PI * 2;
  }

  get seed(): number {
    return this.r.seed;
  }
}

/**
 * mulberry32：小、快、纯整数运算无分配。
 *
 * 只有特效流用它。逻辑随机一律走 RngView（即 ctx.random），
 * 这样 ?seed 复现出来的局不受特效数量波动影响。
 */
export class FxRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  reseed(seed: number): void {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }

  angle(): number {
    return this.next() * Math.PI * 2;
  }
}

/**
 * 与 FxRng 同接口，但用于地形与刷怪等逻辑生成。
 *
 * 之所以不复用同一个类，是为了让代码里一眼看出这条随机流归谁：
 *   logic → 影响 gameplay，必须走 ctx.random
 *   fx    → 只影响观感，独立流，不影响可复现性
 */
export type { Random };
