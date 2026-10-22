/**
 * 存档与元进度（docs/tanks.md 第 6 节、docs/tank-levels.md 第 11 节）。
 *
 * 全部走 ctx.storage（按 game id 隔离、跨设备、卸载默认保留）。
 * 关键进度立刻写：Android 可能直接杀进程，dispose 不保证执行。
 */

import { CONFIG } from './config';
import type { MapId } from './config';
import { levelCost, levelCostTo } from './stats';
import { MAPS, SKINS, TANKS, FREE_TANKS } from './data/exports';

export interface TankProgress {
  level: number;
  skin: string;
}

export interface Progress {
  /** 废铁余额。 */
  scrap: number;
  /** 每台坦克的等级与涂装（所有车都在，level 1 表示没练过）。 */
  tanks: Record<string, TankProgress>;
  /** 已拥有的坦克 id（T0 免费三台 + 花钱/通关解锁的）。 */
  owned: string[];
  /** 已解锁的地图 id。 */
  maps: string[];
  /** 已购买的涂装 id。 */
  skins: string[];
  /** 当前出战配置。 */
  selected: { p1: string; p2: string; map: MapId; threat: number };
  /** 最佳战绩。 */
  bestTime: number;
  bestScore: number;
  bestKills: number;
  bestLevel: number;
  clears: number;
  /** 累计。 */
  totalKills: number;
  totalTime: number;
  bossKills: number;
  runs: number;
  /** 用过金手指标记：排查问题时能知道这局数值不是原版。 */
  cheated: boolean;
  /** 已看过的进化阶段，避免重复弹预览。 */
  seenEvolution: Record<string, number>;
  /** 存档版本。 */
  v: number;
}

export interface RunResult {
  time: number;
  kills: number;
  level: number;
  score: number;
  scrap: number;
  win: boolean;
  bossKilled: number;
  threat: number;
  cheated: boolean;
  /** 双人各自的击毁。 */
  perPlayer: number[];
}

export const SAVE_KEY = 'progress';
const SAVE_VERSION = 1;

export function defaultProgress(): Progress {
  const tanks: Record<string, TankProgress> = {};
  for (const t of TANKS) tanks[t.id] = { level: 1, skin: 'factory' };
  return {
    scrap: 0,
    tanks,
    owned: [...FREE_TANKS],
    maps: ['proving'],
    skins: ['factory'],
    selected: { p1: 'anvil', p2: 'echo', map: 'proving', threat: 1 },
    bestTime: 0,
    bestScore: 0,
    bestKills: 0,
    bestLevel: 1,
    clears: 0,
    totalKills: 0,
    totalTime: 0,
    bossKills: 0,
    runs: 0,
    cheated: false,
    seenEvolution: {},
    v: SAVE_VERSION,
  };
}

function numberOr(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

function stringIn<T extends { id: string }>(list: readonly T[], v: unknown): boolean {
  return typeof v === 'string' && list.some((x) => x.id === v);
}

/**
 * 把磁盘上的存档补齐成当前形状。
 *
 * 新增字段不破坏老档；越界值一律夹回，坏数据退回默认。
 */
export function normalizeProgress(raw: unknown): Progress {
  const base = defaultProgress();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const out: Progress = { ...base };

  out.scrap = Math.max(0, numberOr(r.scrap, 0));
  if (Array.isArray(r.maps) && r.maps.length) {
    out.maps = [...new Set(['proving', ...r.maps.filter((m): m is string => stringIn(MAPS, m))])];
  }
  if (Array.isArray(r.skins) && r.skins.length) {
    out.skins = [...new Set(['factory', ...r.skins.filter((m): m is string => stringIn(SKINS, m))])];
  }
  if (Array.isArray(r.owned) && r.owned.length) {
    const valid = r.owned.filter((m): m is string => stringIn(TANKS, m));
    out.owned = [...new Set([...FREE_TANKS, ...valid])];
  }
  // 旧档没记录 owned：用曾经练过/涂过来推断，至少不把人拥有的车吞掉。
  if (out.owned.length === FREE_TANKS.length && r.tanks && typeof r.tanks === 'object') {
    const t = r.tanks as Record<string, TankProgress>;
    for (const def of TANKS) {
      const saved = t[def.id];
      if (saved && (numberOr(saved.level, 1) > 1 || (typeof saved.skin === 'string' && saved.skin !== 'factory'))) {
        if (!out.owned.includes(def.id)) out.owned.push(def.id);
      }
    }
  }

  const nums: (keyof Progress)[] = [
    'bestTime', 'bestScore', 'bestKills', 'bestLevel', 'clears',
    'totalKills', 'totalTime', 'bossKills', 'runs',
  ];
  for (const k of nums) (out as unknown as Record<string, number>)[k] = Math.max(0, numberOr(r[k], 0));
  out.bestLevel = clamp(out.bestLevel, 1, 40);
  out.cheated = r.cheated === true;

  if (r.selected && typeof r.selected === 'object') {
    const s = r.selected as Record<string, unknown>;
    if (stringIn(TANKS, s.p1) && out.owned.includes(s.p1 as string)) out.selected.p1 = s.p1 as string;
    if (stringIn(TANKS, s.p2) && out.owned.includes(s.p2 as string)) out.selected.p2 = s.p2 as string;
    if (stringIn(MAPS, s.map) && out.maps.includes(s.map as string)) out.selected.map = s.map as MapId;
    if (typeof s.threat === 'number') out.selected.threat = clamp(Math.round(s.threat), 1, 4);
  }

  if (r.tanks && typeof r.tanks === 'object') {
    const src = r.tanks as Record<string, TankProgress>;
    for (const def of TANKS) {
      const saved = src[def.id];
      if (!saved) continue;
      out.tanks[def.id] = {
        level: clamp(Math.round(numberOr(saved.level, 1)), 1, CONFIG.tankMaxLevel),
        skin: stringIn(SKINS, saved.skin) && out.skins.includes(saved.skin) ? saved.skin : 'factory',
      };
    }
  }

  if (r.seenEvolution && typeof r.seenEvolution === 'object') {
    const src = r.seenEvolution as Record<string, unknown>;
    for (const [k, v] of Object.entries(src)) {
      if (typeof v === 'number') out.seenEvolution[k] = clamp(Math.round(v), 1, 4);
    }
  }

  out.v = SAVE_VERSION;
  return out;
}

// =====================================================================
// 元进度查询与操作
// =====================================================================

export function levelOf(p: Progress, id: string): number {
  return p.tanks[id]?.level ?? 1;
}

export function isOwned(p: Progress, id: string): boolean {
  return p.owned.includes(id);
}

export function isMapUnlocked(p: Progress, id: string): boolean {
  return p.maps.includes(id);
}

export function isSkinOwned(p: Progress, id: string): boolean {
  return p.skins.includes(id);
}

export function tankUnlockPrice(id: string): number | 'clear' {
  const def = TANKS.find((t) => t.id === id);
  return def ? def.unlock : 0;
}

export function upgradePrice(p: Progress, id: string): number {
  const lvl = levelOf(p, id);
  if (lvl >= CONFIG.tankMaxLevel) return 0;
  return levelCost(lvl);
}

/** 花费类操作统一走这里：余额不足返回 false，成功则原地改 p。 */
function spend(p: Progress, amount: number): boolean {
  if (p.scrap < amount) return false;
  p.scrap -= amount;
  return true;
}

export interface BuyResult {
  ok: boolean;
  reason?: 'owned' | 'maxed' | 'scrap' | 'needClear' | 'unknown';
  /** 差多少废铁（reason === 'scrap' 时有效）。 */
  short?: number;
}

export function buyTank(p: Progress, id: string): BuyResult {
  const def = TANKS.find((t) => t.id === id);
  if (!def) return { ok: false, reason: 'unknown' };
  if (isOwned(p, id)) return { ok: false, reason: 'owned' };
  if (def.unlock === 'clear') {
    // 通关奖励：达成条件即自动拥有，不花废铁。
    if (p.clears > 0) {
      p.owned.push(id);
      return { ok: true };
    }
    return { ok: false, reason: 'needClear' };
  }
  if (p.scrap < def.unlock) return { ok: false, reason: 'scrap', short: def.unlock - p.scrap };
  spend(p, def.unlock);
  p.owned.push(id);
  return { ok: true };
}

export function buyMap(p: Progress, id: string): BuyResult {
  const def = MAPS.find((m) => m.id === id);
  if (!def) return { ok: false, reason: 'unknown' };
  if (isMapUnlocked(p, id)) return { ok: false, reason: 'owned' };
  if (p.scrap < def.price) return { ok: false, reason: 'scrap', short: def.price - p.scrap };
  spend(p, def.price);
  p.maps.push(id);
  return { ok: true };
}

export function buySkin(p: Progress, id: string): BuyResult {
  const def = SKINS.find((s) => s.id === id);
  if (!def) return { ok: false, reason: 'unknown' };
  if (isSkinOwned(p, id)) return { ok: false, reason: 'owned' };
  if (p.scrap < def.price) return { ok: false, reason: 'scrap', short: def.price - p.scrap };
  spend(p, def.price);
  p.skins.push(id);
  return { ok: true };
}

export function upgradeTank(p: Progress, id: string): BuyResult {
  const lvl = levelOf(p, id);
  if (lvl >= CONFIG.tankMaxLevel) return { ok: false, reason: 'maxed' };
  const price = levelCost(lvl);
  if (p.scrap < price) return { ok: false, reason: 'scrap', short: price - p.scrap };
  spend(p, price);
  p.tanks[id] = { level: lvl + 1, skin: p.tanks[id]?.skin ?? 'factory' };
  return { ok: true };
}

/** 威胁等级需要对应坦克等级才能开（双人取两人中较低的那台）。 */
export function threatLocked(p: Progress, threat: number, tankIds: string[]): number {
  const need = [0, 0, 5, 10, 15][clamp(threat, 1, 4)] ?? 0;
  if (need === 0) return 0;
  let lowest = Infinity;
  for (const id of tankIds) lowest = Math.min(lowest, levelOf(p, id));
  return Math.max(0, need - lowest);
}

// =====================================================================
// 结算
// =====================================================================

/** 废铁结算（docs/tanks.md 第 6 节 + 威胁倍率）。失败也给。 */
export function scrapFor(
  kills: number,
  seconds: number,
  bosses: number,
  win: boolean,
  threat: number,
  firstClear: boolean,
): number {
  const S = CONFIG.scrap;
  const mul = [1, 1, 1.2, 1.5, 1.8][clamp(threat, 1, 4)] ?? 1;
  let sum = kills * S.perKill + seconds * S.perSecond + bosses * S.perBoss;
  if (win) sum += S.clear;
  if (win && firstClear) sum += S.firstClear;
  return Math.round(sum * mul);
}

/** 得分（docs/levels.md 第 7 节）。 */
export function scoreFor(time: number, level: number, kills: number, win: boolean): number {
  const K = CONFIG.score;
  return Math.floor(
    time * K.perSecond + level * K.perLevel + kills * K.perKill + (win ? K.clearBonus : 0),
  );
}

/** 把一局结果并进存档。调用方负责立刻写盘。 */
export function applyResult(p: Progress, r: RunResult): void {
  p.scrap += r.scrap;
  p.runs += 1;
  p.totalKills += r.kills;
  p.totalTime += Math.floor(r.time);
  p.bossKills += r.bossKilled;
  if (r.cheated) p.cheated = true;

  p.bestTime = Math.max(p.bestTime, Math.floor(r.time));
  p.bestScore = Math.max(p.bestScore, r.score);
  p.bestKills = Math.max(p.bestKills, r.kills);
  p.bestLevel = Math.max(p.bestLevel, r.level);
  if (r.win) p.clears += 1;

  // 通关解锁 MK-II 这类"达成即拥有"的奖励。
  for (const def of TANKS) {
    if (def.unlock === 'clear' && !isOwned(p, def.id) && p.clears > 0) p.owned.push(def.id);
  }
}

/** 是否有新的进化要提示（返回阶段，没有则 0）。 */
export function pendingEvolution(p: Progress, id: string): number {
  const stage = stageOfLevel(levelOf(p, id));
  const seen = p.seenEvolution[id] ?? 1;
  return stage > seen ? stage : 0;
}

export function markEvolutionSeen(p: Progress, id: string): void {
  p.seenEvolution[id] = stageOfLevel(levelOf(p, id));
}

function stageOfLevel(level: number): number {
  let stage = 1;
  for (let i = 0; i < CONFIG.decalLevels.length; i += 1) {
    if (level >= CONFIG.decalLevels[i]) stage = i + 1;
  }
  return stage;
}

export { levelCost, levelCostTo };
