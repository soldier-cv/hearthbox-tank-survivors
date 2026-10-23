/**
 * 游戏实体与规则（update 侧）。
 *
 * 这一层不认识 ctx.input（只收归一化动作），也不认识渲染（只暴露状态）。
 * 金手指与设置通过 tuning / 回调注入，这里读不到"哪个金手指改哪个数值"。
 */

import {
  CONFIG,
  PHASE_TABLE,
  SPAWN,
  THREATS,
  CARD_RULES,
  RARITY_WEIGHT,
  type CardTag,
} from './config';
import {
  CARDS,
  CARD_BY_ID,
  SUPPLY_CARD,
  type CardDef,
  type CardBranch,
  type Add,
  type Mul,
  type Flag,
} from './data/cards';
import {
  ENEMY_BY_ID,
  AFFIXES,
  BOSSES,
  WAVES,
  ROLLS,
  THREAT_EXTRA,
  BOSS_FIRST,
  BOSS_FINAL,
  SPAWN_STOP,
  type EnemyDef,
  type EnemyId,
  type AffixDef,
  type BossDef,
  type WaveNode,
} from './data/enemies';
import type { TerrainNode } from './data/maps';
import type { TankDef } from './data/tanks';
import { TILE, COLLAPSE } from './data/maps';
import { World } from './world';
import { scrapFor, scoreFor } from './save';
import {
  chassisOf,
  levelScale,
  weaponOf,
  signatureOf,
  FURNACE_SIG,
  ARC_SIG,
  type Chassis,
  type SignatureConfig,
  type WeaponBonus,
} from './stats';
import type { Tuning } from './tuning';
import { Fx } from './fx';
import type { RngView } from './rng';
import type { Audio } from './audio';
import type { PlayerInput } from './input';

const T = CONFIG.tile;

// ===================================================================
// 实体
// ===================================================================

export interface Bullet {
  alive: boolean;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  dmg: number;
  life: number;
  pierce: number;
  falloff: number;
  blast: number;
  puddle: number;
  wallDmg: number;
  chain: number;
  chainRatio: number;
  chainSlow: number;
  chainLoop: boolean;
  chainDmgPer: number;
  bounce: number;
  owner: number;
  crit: boolean;
  heavy: boolean;
  rail: boolean;
  radial: boolean;
  doubleBlast: boolean;
  chainBlast: number;
  /** 爆炸伤害倍率（集中装药）。 */
  blastRatio: number;
  /** 穿墙飞行（空爆手雷 / 穿墙弹）。 */
  ghost: boolean;
  /** 追踪转向速度（rad/s，0 = 不追踪）。 */
  homing: number;
  /** 抛射体：寿命结束时落地爆炸（手雷 / 燃油弹）。 */
  shell: boolean;
  /** 感电：命中后目标受到的伤害 +15%。 */
  shock: boolean;
  /** 落地火池的持续伤害与时长。 */
  puddleLife: number;
  color: string;
  size: number;
  /** 穿透时已命中的敌人，避免重复结算。 */
  hits: number[];
}

export interface Enemy {
  alive: boolean;
  id: number;
  def: EnemyDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
  shield: number;
  shieldMax: number;
  noHitT: number;
  speed: number;
  contact: number;
  dmgMul: number;
  angle: number;
  turret: number;
  fireCd: number;
  telegraph: number;
  aimX: number;
  aimY: number;
  flash: number;
  slow: number;
  slowT: number;
  mark: number;
  /** 额外受伤比例（感电 / 脆化）。 */
  vuln: number;
  vulnT: number;
  /** 定身剩余（冻结）。 */
  rootT: number;
  /** 着火剩余（凝固配方拖火痕）。 */
  burnT: number;
  elite: boolean;
  affix: AffixDef | null;
  affix2: AffixDef | null;
  boss: BossDef | null;
  phase2: boolean;
  escortDone: number;
  summonCd: number;
  strafe: number;
  wallT: number;
  wallSign: number;
  treadT: number;
  wobble: number;
  dead: boolean;
}

/** 卡牌算出来的"这一局有什么"（由 recalc 汇总，战斗逻辑只读它）。 */
export interface Kit {
  minRange: number;
  dropRate: number;
  bounce: number;
  chill: number;
  chillT: number;
  frostVuln: number;
  auraSlow: number;
  auraR: number;
  reflect: number;
  reflectPierce: number;
  reflectDmg: number;
  missiles: number;
  missileDmg: number;
  missileCd: number;
  turrets: number;
  turretCd: number;
  wells: number;
  wellCd: number;
  storm: number;
  stormCd: number;
  stormDmg: number;
  grenades: number;
  grenadeCd: number;
  grenadeR: number;
  napalm: number;
  napalmCd: number;
  napalmR: number;
  napalmDps: number;
  napalmLife: number;
  coneCd: number;
  coneR: number;
  coneDmg: number;
  heatMax: number;
  stops: number;
  stopCd: number;
  stopDur: number;
  /** 时停结束时那一炮的倍率。 */
  stopBeam: number;
  rail: boolean;
  railCd: number;
  railCharge: number;
  railDmg: number;
  railPierce: number;
  railSlow: number;
  dashMax: number;
  regenBase: number;
}

function emptyKit(): Kit {
  const C = CONFIG.cards;
  return {
    minRange: 0,
    dropRate: 0,
    bounce: 0,
    chill: 0,
    chillT: C.chill.t,
    frostVuln: 0,
    auraSlow: 0,
    auraR: C.aura.r,
    reflect: 0,
    reflectPierce: 0,
    reflectDmg: C.reflect.dmgRatio,
    missiles: 0,
    missileDmg: C.missile.dmgRatio,
    missileCd: C.missile.cd,
    turrets: 0,
    turretCd: C.turret.cd,
    wells: 0,
    wellCd: C.well.cd,
    storm: 0,
    stormCd: C.storm.cd,
    stormDmg: C.storm.dmgRatio,
    grenades: 0,
    grenadeCd: C.grenade.cd,
    grenadeR: C.grenade.r,
    napalm: 0,
    napalmCd: C.napalm.cd,
    napalmR: C.napalm.r,
    napalmDps: C.napalm.dps,
    napalmLife: C.napalm.puddleLife,
    coneCd: C.cone.cd,
    coneR: C.cone.r,
    coneDmg: C.cone.dmgRatio,
    heatMax: 0,
    stops: 0,
    stopCd: C.stop.cd,
    stopDur: C.stop.dur,
    stopBeam: C.stop.beamMul,
    rail: false,
    railCd: C.rail.cd,
    railCharge: C.rail.charge,
    railDmg: C.rail.dmgMul,
    railPierce: C.rail.pierce,
    railSlow: C.rail.slow,
    dashMax: 1,
    regenBase: 0,
  };
}

export interface Player {
  index: number;
  name: string;
  tank: TankDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  angle: number;
  turretAngle: number;
  base: Chassis;
  st: Chassis;
  hp: number;
  maxHp: number;
  fireCd: number;
  dashCd: number;
  dashTime: number;
  dashDirX: number;
  dashDirY: number;
  invuln: number;
  hurtFlash: number;
  bombs: number;
  shield: number;
  shieldCd: number;
  shieldRecharge: number;
  alive: boolean;
  downed: boolean;
  reviveT: number;
  add: Add;
  mul: Mul;
  flags: Set<Flag>;
  sig: SignatureConfig;
  weapon: WeaponBonus;
  still: number;
  lock: number;
  heavyCharge: number;
  dashBoost: number;
  decoyT: number;
  decoyX: number;
  decoyY: number;
  emergency: number;
  emergencyCharges: number;
  swarmTarget: number;
  swarmStacks: number;
  barrageCd: number;
  barrageWarn: number;
  railCd: number;
  railWarn: number;
  minesCd: number;
  teslaCd: number;
  droneCd: number;
  recoil: number;
  treadT: number;
  moving: boolean;
  speed01: number;
  desperate: boolean;
  kills: number;
  damage: number;
  level: number;

  // ---- 由 recalc() 合成、战斗与渲染只读的派生值 ----
  /** 签名 / 外观阶段（1..4）。渲染时作为 DecalStage 用。 */
  sigIndex: number;
  /** 涂装覆盖（null = 出厂）。只换 body/light，不改数值。 */
  skin: { body: string; light: string } | null;
  armorFlat: number;
  blastRadius: number;
  puddleDps: number;
  falloff: number;
  wallDmg: number;
  spreadDeg: number;
  drones: number;
  mineCd: number;
  teslaChain: number;
  shieldMax: number;
  regen: number;
  chainBlast: number;
  radial: number;
  nova: boolean;
  /** 卡牌汇总。 */
  kit: Kit;
  /** 超载核心：热量与停火。 */
  heat: number;
  overheat: number;
  /** 时停核心。 */
  stopCd: number;
  stopT: number;

  /** 轨道炮（卡）。 */
  railCdCard: number;
  railCharge: number;
  /** 副武器冷却。 */
  grenadeCd: number;
  napalmCd: number;
  coneCd: number;
  missileCd: number;
  turretCd: number;
  wellCd: number;
  stormCd: number;
  /** 冲刺充能。 */
  dashMax: number;
  dashLeft: number;
  /** 最近一次受击时间（脱战回血用）。 */
  lastHurt: number;
  /** 反应装甲窗口。 */
  reactT: number;
  /** 拾取漩涡冷却。 */
  shockT: number;
  /** 自动瞄准锁定的敌人（防炮塔来回甩）。 */
  aimId: number;
  /** 应急维修包计时。 */
  medCd: number;
}

export interface Pickup {
  alive: boolean;
  kind: 'xp' | 'repair' | 'bomb';
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  t: number;
  size: number;
  color: string;
}

export interface FloatText {
  alive: boolean;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
}

export interface Puddle {
  alive: boolean;
  x: number;
  y: number;
  r: number;
  dps: number;
  life: number;
  maxLife: number;
  tick: number;
  wob: number;
}

export interface Mine {
  alive: boolean;
  x: number;
  y: number;
  r: number;
  dmg: number;
  life: number;
  owner: number;
  /** 磁吸：靠近的敌人会被拽过来。 */
  homing: boolean;
  /** 绊索：范围内的敌人被拖向雷。 */
  tether: boolean;
  /** 跳雷：弹起后空爆。 */
  jump: boolean;
  vx: number;
  vy: number;
}

export interface Drone {
  alive: boolean;
  owner: number;
  phase: number;
  x: number;
  y: number;
  cd: number;
  /** 蜂群护盾：可挡子弹。 */
  shield: boolean;
  /** 被击落后的重生倒计时。 */
  down: number;
  /** 挂载导弹冷却。 */
  missileCd: number;
}

/** 哨戒炮台：部署后独立开火。 */
export interface Turret {
  alive: boolean;
  owner: number;
  x: number;
  y: number;
  angle: number;
  life: number;
  maxLife: number;
  cd: number;
  dmg: number;
  r: number;
  range: number;
  heavy: boolean;
  smart: boolean;
}

/** 引力井 / 电极柱。 */
export interface Well {
  alive: boolean;
  owner: number;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  r: number;
  pull: number;
  dmg: number;
  singularity: boolean;
  inert: boolean;
  /** >0 时是在放电的电极柱（不是引力井）。 */
  pillar: number;
  tick: number;
  slow: number;
}

/** 延迟爆炸（相位冲刺残影、跳雷都走这里）。 */
export interface DelayedBoom {
  alive: boolean;
  owner: number;
  x: number;
  y: number;
  r: number;
  dmg: number;
  t: number;
  slow: number;
  /** >0 时落地留火池。 */
  puddle: number;
  puddleLife: number;
}

export interface ArcFx {
  alive: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface TrackMark {
  alive: boolean;
  x: number;
  y: number;
  angle: number;
  halfW: number;
  life: number;
  maxLife: number;
}

export interface RingFx {
  alive: boolean;
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

/** 一次升级里的一张候选。改装卡的 branches 是两个可选方向。 */
export interface CardOffer {
  card: CardDef;
  /** 改装时展示的方向（新装置为空）。 */
  branches: CardBranch[];
  isUpgrade: boolean;
  /** 这张卡已有的改装方向 id。 */
  ownedBranch: string | null;
}

export type GameEvent =
  | { type: 'levelup'; offers: CardOffer[]; level: number }
  | { type: 'levelupMore'; offers: CardOffer[]; level: number }
  | { type: 'toast'; text: string }
  | { type: 'over'; data: RunSummary }
  | { type: 'win'; data: RunSummary }
  | { type: 'wave'; index: number }
  | { type: 'boss'; name: string }
  | { type: 'evolve'; tankId: string; stage: number };

export interface RunSummary {
  time: number;
  kills: number;
  level: number;
  score: number;
  scrap: number;
  win: boolean;
  bosses: number;
  perPlayer: number[];
}

export interface GameOptions {
  tuning: Tuning;
  fx: Fx;
  audio: Audio;
  rng: RngView;
  onEvent: (e: GameEvent) => void;
  cheat: (id: string) => number;
  enabled: (id: string) => boolean;
  setting: (id: string) => string | number | boolean;
  rumble: (strong: number, weak: number, ms: number) => void;
}

/** 空间网格：敌人互斥与子弹查询。比四叉树更合适（实体多、尺寸接近）。 */
class Grid {
  private map = new Map<number, Enemy[]>();
  constructor(private readonly cell: number) {}
  clear(): void {
    this.map.clear();
  }
  private key(gx: number, gy: number): number {
    return gx * 100000 + gy;
  }
  insert(e: Enemy): void {
    const gx = Math.floor(e.x / this.cell);
    const gy = Math.floor(e.y / this.cell);
    const k = this.key(gx, gy);
    let arr = this.map.get(k);
    if (!arr) {
      arr = [];
      this.map.set(k, arr);
    }
    arr.push(e);
  }
  query(x: number, y: number, r: number, out: Enemy[]): Enemy[] {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c);
    const x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c);
    const y1 = Math.floor((y + r) / c);
    for (let gy = y0; gy <= y1; gy += 1) {
      for (let gx = x0; gx <= x1; gx += 1) {
        const arr = this.map.get(this.key(gx, gy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i += 1) out.push(arr[i]);
      }
    }
    return out;
  }
}

export class Game {
  time = 0;
  players: Player[] = [];
  bullets: Bullet[] = [];
  ebullets: Bullet[] = [];
  enemies: Enemy[] = [];
  pickups: Pickup[] = [];
  texts: FloatText[] = [];
  puddles: Puddle[] = [];
  mines: Mine[] = [];
  drones: Drone[] = [];
  turrets: Turret[] = [];
  wells: Well[] = [];
  booms: DelayedBoom[] = [];
  arcs: ArcFx[] = [];
  tracks: TrackMark[] = [];
  rings: RingFx[] = [];

  level = 1;
  xp = 0;
  xpNeedNow = 0;
  kills = 0;
  score = 0;
  bosses = 0;
  /** 废料回收卡额外攒的废铁。 */
  bonusScrap = 0;

  pendingLevels = 0;
  offers: CardOffer[] = [];
  /** 已拥有的装置 → 改装方向 id（null = 只拿了基础）。 */
  owned = new Map<string, string | null>();
  /** 拿到这张卡时是第几次选择（用来让改装晚两步出现）。 */
  private ownedAt = new Map<string, number>();
  /** 连续几次升级没出金/红。 */
  private pity = 0;
  /** 本局做过几次选择（红卡时间窗用）。 */
  private picksMade = 0;
  private prototypesTaken = 0;
  rerollsLeft = CONFIG.rerollsPerRound;

  nextWave = 30;
  waveIndex = 0;
  quietUntil = 0;
  bossSpawned = [false, false];
  suppliesLeft: number[] = [];

  phase = 0;
  over = false;
  won = false;
  ended = false;
  threat = 1;

  boss: Enemy | null = null;
  finalBoss: Enemy | null = null;

  private readonly grid = new Grid(90);
  private readonly q: Enemy[] = [];
  private readonly q2: Enemy[] = [];
  private readonly scratch: number[] = [];
  private spawnAcc = 0;
  private trackAcc: number[] = [];
  private eid = 1;

  constructor(
    readonly world: World,
    private readonly o: GameOptions,
  ) {}

  // ===================================================================
  // 开局
  // ===================================================================

  start(tanks: TankDef[], levels: number[], threat: number): void {
    this.threat = clamp(threat, 1, 4);
    this.time = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNeedNow = this.o.tuning.xpNeed(1);
    this.kills = 0;
    this.score = 0;
    this.bonusScrap = 0;
    this.bosses = 0;
    this.pendingLevels = 0;
    this.offers = [];
    this.owned.clear();
    this.ownedAt.clear();
    this.pity = 0;
    this.picksMade = 0;
    this.prototypesTaken = 0;
    this.rerollsLeft = CONFIG.rerollsPerRound;
    this.nextWave = 30;
    this.waveIndex = 0;
    this.quietUntil = 0;
    this.bossSpawned = [false, false];
    this.suppliesLeft = [90, 180, 270, 360];
    this.phase = 0;
    this.over = false;
    this.won = false;
    this.ended = false;
    this.spawnAcc = 0;
    this.boss = null;
    this.finalBoss = null;

    clearPool(this.bullets);
    clearPool(this.ebullets);
    clearPool(this.enemies);
    clearPool(this.pickups);
    clearPool(this.texts);
    clearPool(this.puddles);
    clearPool(this.mines);
    clearPool(this.drones);
    clearPool(this.turrets);
    clearPool(this.wells);
    clearPool(this.booms);
    clearPool(this.arcs);
    clearPool(this.tracks);
    clearPool(this.rings);
    this.world.resetNodes();

    const cx = this.world.spawnCenter.x;
    const cy = this.world.spawnCenter.y;
    this.players = tanks.map((tank, i) => {
      const p = this.makePlayer(i, tank, levels[i] ?? 1, tanks.length === 1 ? cx : cx + (i === 0 ? -46 : 46), cy);
      return p;
    });
  }

  private makePlayer(index: number, tank: TankDef, level: number, x: number, y: number): Player {
    const base = chassisOf(tank);
    const scale = levelScale(level);
    const weapon = weaponOf(tank);
    const sig = signatureOf(tank, scale.signatureStage);

    const p: Player = {
      index,
      name: index === 0 ? 'P1' : 'P2',
      tank,
      x,
      y,
      vx: 0,
      vy: 0,
      r: CONFIG.playerRadius,
      angle: -Math.PI / 2,
      turretAngle: -Math.PI / 2,
      base,
      st: { ...base },
      hp: base.maxHp,
      maxHp: base.maxHp,
      fireCd: 0,
      dashCd: 0,
      dashTime: 0,
      dashDirX: 0,
      dashDirY: 0,
      invuln: CONFIG.combat.spawnProtect,
      hurtFlash: 0,
      bombs: CONFIG.combat.bombs,
      shield: 0,
      shieldCd: 0,
      shieldRecharge: 9.5,
      alive: true,
      downed: false,
      reviveT: 0,
      add: {},
      mul: {},
      flags: new Set<Flag>(),
      sig,
      weapon,
      still: 0,
      lock: 0,
      heavyCharge: 0,
      dashBoost: 0,
      decoyT: 0,
      decoyX: 0,
      decoyY: 0,
      emergency: 0,
      emergencyCharges: sig.emergencyCharges,
      swarmTarget: -1,
      swarmStacks: 0,
      barrageCd: sig.barrageCd,
      barrageWarn: 0,
      railCd: 5,
      railWarn: 0,
      minesCd: 0,
      teslaCd: 0,
      droneCd: 0,
      recoil: 0,
      treadT: 0,
      moving: false,
      speed01: 0,
      desperate: false,
      kills: 0,
      damage: 0,
      level,
      // ---- 派生值，先占位再由 recalc() 算出 ----
      skin: null,
      sigIndex: clamp(scale.signatureStage, 1, 4),
      armorFlat: 0,
      blastRadius: 0,
      puddleDps: 0,
      falloff: 1,
      wallDmg: 1,
      spreadDeg: 0,
      drones: 0,
      mineCd: 0,
      teslaChain: 0,
      shieldMax: 0,
      regen: 0,
      chainBlast: 0,
      radial: 0,
      nova: false,
      kit: emptyKit(),
      heat: 0,
      overheat: 0,
      stopCd: 0,
      stopT: 0,
      railCdCard: 0,
      railCharge: 0,
      grenadeCd: 0,
      napalmCd: 0,
      coneCd: 0,
      missileCd: 0,
      turretCd: 0,
      wellCd: 0,
      stormCd: 0,
      dashMax: 1,
      dashLeft: 1,
      lastHurt: -99,
      reactT: 0,
      shockT: 0,
      aimId: -1,
      medCd: 0,
    };
    this.recalc(p);
    p.hp = p.maxHp;
    return p;
  }

  /** 底盘 × 等级 × 卡加成 → 最终属性。只读表，不写字面数字。 */
  recalc(p: Player): void {
    const scale = levelScale(p.level);
    const add = p.add;
    const mul = p.mul;
    const i = clamp(p.sigIndex, 1, 4) - 1;

    // 武器形态随签名阶段变化（熔炉 / 电弧）
    const weapon = weaponOf(p.tank);
    if (p.tank.signature === 'furnace') {
      weapon.blastRadius = weapon.blastRadius > 0 ? weapon.blastRadius : 34;
      weapon.blastRadius *= FURNACE_SIG.blastMul[i];
    } else if (p.tank.signature === 'arc') {
      weapon.chain = ARC_SIG.chainAdd[i];
      weapon.chainRatio = ARC_SIG.chainRatio[i];
    }
    p.weapon = weapon;

    const blastAdd = nz(add.blastRadius);
    p.st.maxHp = p.base.maxHp * scale.hp + nz(add.maxHp);
    p.st.dmg = (p.base.dmg * scale.dmg + nz(add.dmg)) * nzp(mul.dmg);
    p.st.speed = p.base.speed * scale.speed * nzp(mul.speed) * (p.tank.signature === 'furnace' ? FURNACE_SIG.speedMul[i] : 1);
    p.st.armor = Math.min(0.15, p.base.armor + scale.armor);
    p.st.interval = (p.base.interval / scale.rof) * nzp(mul.interval);
    p.st.bulletSpeed = (p.base.bulletSpeed + nz(add.bulletSpeed)) * nzp(mul.bulletSpeed);
    p.st.range = (p.base.range + nz(add.range)) * nzp(mul.range);
    p.st.pickup = p.base.pickup + nz(add.pickup);
    p.st.crit = clamp01(p.base.crit + nz(add.critAdd));
    p.st.critMul = p.base.critMul + nz(add.critMulAdd);
    p.st.projectiles = Math.min(6, Math.max(1, p.base.projectiles + nz(add.projectiles)));
    // 长矛：签名阶段 Ⅱ 起额外穿透
    p.st.pierce = Math.min(6, p.base.pierce + weapon.pierce + nz(add.pierce) + p.sig.pierceExtra);

    // 存算好的派生量，渲染与战斗都读这些
    p.armorFlat = nz(add.armorFlat);
    p.blastRadius = Math.min(90, ((weapon.blastRadius || 0) + blastAdd) * nzp(mul.blastRadius));
    p.puddleDps = Math.min(20, nz(add.puddleDps) + (p.tank.signature === 'furnace' ? FURNACE_SIG.puddle[i] * 6 : 0));
    p.falloff = Math.min(1, (p.weapon.noFalloff ? 1 : 0.7) * nzp(mul.falloff));
    p.wallDmg = nzp(mul.wallDmg);
    // 蜂群：签名把散射收窄（swarmSpread 是角度），其它车用武器本身的散布
    const baseSpread = p.tank.signature === 'swarm' ? p.sig.swarmSpread : weapon.spread;
    p.spreadDeg = Math.max(
      0,
      (baseSpread + nz(add.spread)) * nzp(mul.spread) - (p.flags.has('noSpread') ? 999 : 0),
    );
    p.drones = Math.min(6, nz(add.drones));
    p.mineCd = add.mines ? CONFIG.cards.mine.cd * nzp(mul.mineCd) : 0;
    p.teslaChain = Math.min(6, nz(add.teslaChain));
    p.teslaCd = add.teslaChain ? CONFIG.cards.tesla.cd * nzp(mul.teslaCd) : 0;
    p.shieldMax = Math.min(3, nz(add.shieldMax));
    p.regen = nz(add.regen);
    p.chainBlast = Math.min(3, nz(add.chainBlast));
    p.radial = Math.min(12, nz(add.radial));
    p.nova = nz(add.nova) > 0;

    // ---- 卡牌汇总 ----
    const K = CONFIG.cards;
    const kit = p.kit;
    kit.minRange = nz(add.minRange);
    kit.dropRate = nz(add.dropRate);
    kit.bounce = nz(add.bounce);
    kit.chill = Math.min(0.8, nz(add.chill));
    kit.chillT = K.chill.t;
    kit.frostVuln = nz(add.frostVuln);
    kit.auraSlow = Math.min(0.6, nz(add.auraSlow));
    kit.auraR = K.aura.r * nzp(mul.auraR);
    kit.reflect = nz(add.reflect);
    kit.reflectPierce = nz(add.reflectPierce);
    kit.reflectDmg = K.reflect.dmgRatio * nzp(mul.reflectDmg);
    kit.missiles = nz(add.missiles);
    kit.missileDmg = K.missile.dmgRatio * nzp(mul.missileDmg);
    kit.missileCd = K.missile.cd * nzp(mul.missileCd);
    kit.turrets = Math.min(K.turret.max, nz(add.turrets));
    kit.turretCd = K.turret.cd;
    kit.wells = nz(add.wells);
    kit.wellCd = K.well.cd;
    kit.storm = nz(add.storm);
    kit.stormCd = K.storm.cd * nzp(mul.stormCd);
    kit.stormDmg = K.storm.dmgRatio * nzp(mul.stormDmg);
    kit.grenades = nz(add.grenades);
    kit.grenadeCd = K.grenade.cd * nzp(mul.grenadeCd);
    kit.grenadeR = K.grenade.r * nzp(mul.grenadeR);
    kit.napalm = nz(add.napalm);
    kit.napalmCd = K.napalm.cd * nzp(mul.napalmCd);
    kit.napalmR = K.napalm.r * nzp(mul.napalmR);
    kit.napalmDps = K.napalm.dps * nzp(mul.napalmDps);
    kit.napalmLife = K.napalm.puddleLife * nzp(mul.napalmLife);
    kit.coneCd = K.cone.cd * nzp(mul.coneCd);
    kit.coneR = K.cone.r * nzp(mul.coneR);
    kit.coneDmg = K.cone.dmgRatio * nzp(mul.coneDmg);
    kit.heatMax = nz(add.heatMax);
    kit.stops = nz(add.stops);
    kit.stopCd = K.stop.cd;
    kit.stopDur = K.stop.dur;
    kit.stopBeam = K.stop.beamMul;
    if (p.flags.has('stopShort')) {
      kit.stopCd = K.stop.shortCd;
      kit.stopDur = K.stop.shortDur;
      kit.stopBeam = K.stop.shortMul;
    } else if (p.flags.has('stopLong')) {
      kit.stopCd = K.stop.longCd;
      kit.stopDur = K.stop.longDur;
      kit.stopBeam = K.stop.longMul;
    }
    kit.rail = nz(add.railgun) > 0;
    kit.railCd = K.rail.cd;
    kit.railCharge = K.rail.charge;
    kit.railDmg = K.rail.dmgMul;
    kit.railPierce = K.rail.pierce;
    kit.railSlow = K.rail.slow;
    if (p.flags.has('railOverload')) {
      kit.railCharge = K.rail.overloadCharge;
      kit.railDmg = K.rail.overloadDmg;
      kit.railPierce = K.rail.overloadPierce;
    } else if (p.flags.has('railFast')) {
      kit.railCd = K.rail.fastCd;
      kit.railDmg = K.rail.fastDmg;
      kit.railPierce = K.rail.fastPierce;
    }
    kit.dashMax = 1 + nz(add.dashCharges);
    p.dashLeft = kit.dashMax;
    kit.regenBase = nz(add.regen);

    const before = p.maxHp;
    p.maxHp = p.st.maxHp;
    if (p.maxHp > before) p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - before));
    p.hp = Math.min(p.hp, p.maxHp);
  }

  // ===================================================================
  // 主更新
  // ===================================================================

  update(dt: number, inputs: PlayerInput[]): void {
    if (this.ended) return;

    let step = dt;
    if (this.o.fx.hitStop > 0) step = dt * 0.22;

    this.time += step;
    this.updatePhase();

    // 时停核心：全场敌人与敌弹静止（玩家自己也不能动，见 updatePlayer）
    const stopped = this.players.some((p) => p.alive && p.stopT > 0);
    const foeStep = stopped ? 0 : step;

    for (let i = 0; i < this.players.length; i += 1) {
      const p = this.players[i];
      const inp = inputs[i];
      if (p.alive) {
        if (inp) this.updatePlayer(p, inp, step);
      } else if (p.downed) {
        this.updateDowned(p, step);
      }
    }

    this.updateEnemies(foeStep);
    this.updateBullets(foeStep, this.bullets, false);
    this.updateBullets(foeStep, this.ebullets, true);
    this.updateTurrets(step);
    this.updateWells(step);
    this.updateBooms(step);
    this.updatePickups(foeStep);
    this.updateHazards(foeStep);
    this.updateSpawning(step, inputs);
    this.updateEvents(step);
    this.world.update(step);

    for (const t of this.texts) {
      if (!t.alive) continue;
      t.life -= step;
      t.y += t.vy * step;
      if (t.life <= 0) t.alive = false;
    }
    for (const r of this.rings) {
      if (!r.alive) continue;
      r.life -= step;
      r.r = r.maxR * (1 - r.life / r.maxLife);
      if (r.life <= 0) r.alive = false;
    }
    for (const tr of this.tracks) {
      if (!tr.alive) continue;
      tr.life -= step;
      if (tr.life <= 0) tr.alive = false;
    }

    this.checkEnd();
  }

  private updatePhase(): void {
    let i = 0;
    for (let k = 0; k < PHASE_TABLE.length; k += 1) {
      if (this.time >= PHASE_TABLE[k].from) i = k;
    }
    this.phase = i;
  }

  phaseInfo(): (typeof PHASE_TABLE)[number] {
    return PHASE_TABLE[this.phase] ?? PHASE_TABLE[0];
  }

  threatInfo(): (typeof THREATS)[number] {
    return THREATS[clamp(this.threat, 1, 4) - 1] ?? THREATS[0];
  }

  /** 同屏上限：难度阀门。 */
  get aliveCap(): number {
    const base = this.phaseInfo().cap;
    const mul = 1 + (this.threatInfo().hp - 1) * 0.3;
    return Math.min(CONFIG.caps.enemies, Math.round(base * mul));
  }

  get aliveEnemies(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive && !e.dead) n += 1;
    return n;
  }

  // ===================================================================
  // 玩家
  // ===================================================================

  private updatePlayer(p: Player, inp: PlayerInput, dt: number): void {
    if (!p.alive) return;

    const C = CONFIG.combat;
    const sig = p.sig;

    // ---- 低血状态（港湾）----
    const lowRatio = p.hp / p.maxHp;
    p.desperate = sig.lowHpAt > 0 && lowRatio < sig.lowHpAt;

    // ---- 移动 ----
    const glide = this.world.glideAt(p.x, p.y);
    const surface = this.world.speedMul(p.x, p.y);
    // 金手指「移动速度」在这里生效
    let speed = this.o.tuning.moveSpeed(p.st.speed) * surface;
    if (p.desperate) speed *= 1 + sig.lowHpSpeed;
    // 轨道炮蓄力时变慢（代价写在卡面上）
    if (p.railCharge > 0) speed *= 1 - p.kit.railSlow;
    // 超载核心红区
    if (p.flags.has('heatRedline') && p.kit.heatMax > 0 && p.heat / p.kit.heatMax > CONFIG.cards.heat.redAt) {
      speed *= 1 - CONFIG.cards.heat.redSlow;
    }
    // 时停核心：敌人停住，你仍能走位（否则就只是暂停）
    const mag = Math.hypot(inp.moveX, inp.moveY);
    p.moving = mag > 0.05;
    p.speed01 = Math.min(1, mag);

    if (p.dashTime > 0) {
      p.dashTime -= dt;
      p.vx = p.dashDirX * C.dashSpeed * sig.dashRange;
      p.vy = p.dashDirY * C.dashSpeed * sig.dashRange;
      this.o.fx.trail(p.x, p.y, p.x - p.vx * dt, p.y - p.vy * dt, p.tank.light);
      // 相位冲刺：残影留在冲刺终点，0.35s 后爆
      if (p.dashTime <= 0 && p.flags.has('phaseDash')) {
        this.booms.push({
          alive: true, owner: p.index, x: p.x, y: p.y,
          r: CONFIG.cards.phase.r,
          dmg: CONFIG.cards.phase.dmg * (p.st.dmg / Math.max(1, p.base.dmg)),
          t: CONFIG.cards.phase.delay,
          slow: p.flags.has('dashSlow') ? CONFIG.cards.phase.slow : 0,
          puddle: 0, puddleLife: 0,
        });
        this.ring(p.x, p.y, CONFIG.cards.phase.r, '#9fd8ff', 0.3, 2);
      }
    } else {
      const tx = inp.moveX * speed;
      const ty = inp.moveY * speed;
      // 冰面：加速正常但减速极慢（惯性滑行约 1.2s 停下）
      const rate = mag > 0.05 ? 16 : 16 * (1 - glide * 0.94);
      const k = 1 - Math.exp(-rate * dt);
      p.vx += (tx - p.vx) * k;
      p.vy += (ty - p.vy) * k;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    this.world.resolveCircle(p, p.r, p.tank.amphibious);

    if (mag > 0.05) {
      p.angle = Math.atan2(p.vy, p.vx);
      p.treadT += dt * (2 + p.speed01 * 8);
      this.pushTrack(p);
    }

    // ---- 瞄准 ----
    const autoOn = this.o.setting('auto-aim') !== false;
    const assist = Number(this.o.setting('aim-assist') ?? 0.6);
    // 目标锁定：新的目标必须明显更近才换，避免两个敌人之间来回甩炮塔（"摇头"）
    const target = this.aimPick(p);
    let want = p.angle;
    if (inp.aiming) want = inp.aimAngle;
    else if (autoOn && target) want = Math.atan2(target.y - p.y, target.x - p.x);
    // 转向速度按秒算，不再按帧 —— 帧率波动时炮塔不会抽一下
    const turnRate = inp.aiming ? 16 + assist * 6 : autoOn && target ? 11 : 8;
    const k = 1 - Math.exp(-turnRate * dt);
    p.turretAngle += shortAngle(want, p.turretAngle) * k;

    // ---- 签名：静止 ----
    if (!p.moving) p.still += dt;
    else {
      p.still = 0;
      p.lock = 0;
      p.heavyCharge = 0;
    }
    if (sig.lockMax > 0 && p.still >= sig.stillNeed && p.lock < sig.lockMax) p.lock += 1;
    if (sig.heavyEvery > 0 && p.still >= sig.stillNeed) {
      p.heavyCharge = Math.min(1, p.heavyCharge + dt / sig.heavyEvery);
    }

    // ---- 冲刺 ----
    p.dashCd = Math.max(0, p.dashCd - dt);
    if (p.dashCd <= 0) p.dashLeft = p.dashMax;
    if (inp.dashEdge && p.dashCd <= 0 && p.dashTime <= 0 && p.dashLeft > 0) {
      const dx = p.moving ? inp.moveX : Math.cos(p.turretAngle);
      const dy = p.moving ? inp.moveY : Math.sin(p.turretAngle);
      const m = Math.hypot(dx, dy) || 1;
      p.dashDirX = dx / m;
      p.dashDirY = dy / m;
      p.dashTime = C.dashTime;
      p.dashLeft -= 1;
      if (p.dashLeft <= 0) p.dashCd = C.dashCd * sig.dashCdMul * nzp(p.mul.dashCd);
      p.invuln = Math.max(p.invuln, C.dashTime + 0.06);
      p.dashBoost = 1;
      if (sig.decoyTime > 0) {
        p.decoyT = sig.decoyTime;
        p.decoyX = p.x;
        p.decoyY = p.y;
      }
      if (sig.dashBurst > 0) this.dashBurst(p, sig.dashBurst);
      this.o.audio.sfx('dash');
      this.o.rumble(0.3, 0.2, 60);
    }
    if (p.dashBoost > 0) p.dashBoost = Math.max(0, p.dashBoost - dt);
    if (p.decoyT > 0) p.decoyT = Math.max(0, p.decoyT - dt);

    // ---- 炸弹 ----
    const infBombs = this.o.cheat('inf-bombs') > 0;
    if (inp.bombEdge && (p.bombs > 0 || infBombs)) {
      this.bomb(p);
      if (!infBombs) p.bombs -= 1;
    }

    // ---- 开火 ----
    const rofBoost = 1 + (p.dashBoost > 0 ? sig.dashRoF : 0);
    p.fireCd -= dt * rofBoost;
    p.heat = Math.max(0, p.heat - CONFIG.cards.heat.cool * dt);
    if (p.overheat > 0) p.overheat = Math.max(0, p.overheat - dt);
    if (p.fireCd <= 0 && p.overheat <= 0 && p.stopT <= 0) {
      // 金手指「射速倍率」在这里生效
      p.fireCd = Math.max(0.05, this.o.tuning.fireInterval(p.st.interval));
      this.fire(p, target);
    }

    // ---- 要塞协议（终焉）----
    if (sig.barrageCd > 0) {
      p.barrageCd -= dt;
      p.barrageWarn = p.barrageCd <= 0.5 ? 1 - Math.max(0, p.barrageCd) / 0.5 : 0;
      if (p.barrageCd <= 0) {
        p.barrageCd = sig.barrageCd;
        p.barrageWarn = 0;
        this.barrage(p, sig);
        if (sig.barrageInvuln > 0) p.invuln = Math.max(p.invuln, sig.barrageInvuln);
      }
    }

    // ---- 轨道炮（长矛）----
    if (sig.railDmg > 0) {
      p.railCd -= dt;
      p.railWarn = p.railCd <= 0.35 ? 1 - Math.max(0, p.railCd) / 0.35 : 0;
      if (p.railCd <= 0) {
        p.railCd = 5;
        p.railWarn = 0;
        this.railshot(p, sig);
      }
    }

    // ---- 轨道炮（卡）----
    if (p.kit.rail) {
      if (p.railCharge > 0) {
        p.railCharge -= dt;
        if (p.railCharge <= 0) {
          p.railCharge = 0;
          p.railCdCard = p.kit.railCd;
          this.railshotCard(p);
        }
      } else {
        p.railCdCard = Math.max(0, p.railCdCard - dt);
        if (p.railCdCard <= 0) {
          p.railCharge = Math.max(0.01, p.kit.railCharge);
          p.railWarn = 1;
        }
      }
    }

    // ---- 时停核心 ----
    if (p.kit.stops > 0) {
      if (p.stopT > 0) {
        p.stopT = Math.max(0, p.stopT - dt);
        if (p.stopT === 0) this.stopBeam(p);
      } else {
        p.stopCd = Math.max(0, p.stopCd - dt);
        if (p.stopCd <= 0) {
          p.stopCd = p.kit.stopCd;
          p.stopT = p.kit.stopDur;
          this.o.fx.ultNova(p.x, p.y);
          this.o.audio.sfx('nova');
          this.ring(p.x, p.y, 560, '#9fd8ff', p.kit.stopDur, 3);
        }
      }
    }

    // ---- 紧急无敌（港湾 Ⅳ）----
    if (sig.emergencyCharges > 0 && p.emergencyCharges > 0 && lowRatio < sig.lowHpAt && p.emergency <= 0) {
      p.emergencyCharges -= 1;
      p.emergency = 3;
      this.clearEnemyBullets(p.x, p.y, 340);
      this.o.fx.ultNova(p.x, p.y);
      this.o.audio.sfx('nova');
    }
    if (p.emergency > 0) {
      p.emergency -= dt;
      p.invuln = Math.max(p.invuln, 0.06);
    }
    p.invuln = Math.max(0, p.invuln - dt);
    p.hurtFlash = Math.max(0, p.hurtFlash - dt);
    p.recoil = Math.max(0, p.recoil - dt * 6);

    // ---- 回复 / 护盾 ----
    if (p.regen > 0 && p.hp < p.maxHp) {
      const R = CONFIG.cards.regen;
      const outOfCombat = this.time - p.lastHurt > R.outOfCombat;
      let rate = outOfCombat ? p.regen : p.flags.has('regenCombat') ? Math.min(p.regen, R.combat) : 0;
      if (rate > 0 && p.flags.has('regenLow') && p.hp / p.maxHp < R.lowAt) rate *= R.lowMul;
      if (rate > 0) {
        const heal = Math.min(rate * dt, p.maxHp - p.hp);
        p.hp += heal;
        if (p.flags.has('regenShare')) {
          for (const q of this.players) {
            if (q === p || !q.alive) continue;
            q.hp = Math.min(q.maxHp, q.hp + heal * 0.4);
          }
        }
      }
    }
    if (p.reactT > 0) p.reactT = Math.max(0, p.reactT - dt);
    if (p.shockT > 0) p.shockT = Math.max(0, p.shockT - dt);

    // ---- 应急维修包：定时一次性回血 ----
    if (p.flags.has('medPack')) {
      p.medCd -= dt;
      if (p.medCd <= 0) {
        const M = CONFIG.cards.med;
        const fast = p.flags.has('medFast');
        const heal = fast ? M.fastHeal : M.heal;
        p.medCd = fast ? M.fastCd : M.cd;
        const got = Math.min(heal, p.maxHp - p.hp);
        if (got > 0) {
          p.hp += got;
          this.addText(p.x, p.y - p.r, `+${Math.round(got)}`, '#9ad14f', 14);
        }
        if (p.flags.has('medShare')) {
          for (const q of this.players) {
            if (q === p || !q.alive) continue;
            q.hp = Math.min(q.maxHp, q.hp + heal * M.share);
          }
        }
        this.ring(p.x, p.y, 42, '#9ad14f', 0.4, 2);
        this.o.audio.sfx('evolve', 0, 0.4);
      }
    }
    if (p.shieldMax > 0 && p.shield < p.shieldMax) {
      p.shieldCd -= dt;
      if (p.shieldCd <= 0) {
        p.shield += 1;
        p.shieldCd = p.shieldRecharge;
      }
    }

    // ---- 自动化（时停期间全部停手）----
    if (p.stopT <= 0) this.updateDrones(p, dt, target);
    if (p.stopT <= 0) {
    if (p.mineCd > 0) {
      p.minesCd -= dt;
      if (p.minesCd <= 0) {
        p.minesCd = p.mineCd;
        this.dropMine(p);
      }
    }
    if (p.teslaChain > 0) {
      p.teslaCd -= dt;
      if (p.teslaCd <= 0) {
        p.teslaCd = CONFIG.cards.tesla.cd * nzp(p.mul.teslaCd);
        this.zap(p);
      }
    }

    // ---- 卡牌副武器 ----
    if (p.stopT <= 0) this.updateSubweapons(p, dt, target);
    }

    // ---- 无敌金手指 ----
    if (this.o.cheat('god-mode') > 0) p.invuln = Math.max(p.invuln, 0.1);

    if (p.index === 0) {
      this.o.fx.vignette = lowRatio < 0.3 ? Math.min(1, (0.3 - lowRatio) / 0.3) : 0;
    }
  }

  /**
   * 自动瞄准选目标（带滞回）。
   *
   * 直接取"最近"会让炮塔在两个距离相近的敌人之间每帧来回甩，
   * 看起来就是坦克在摇头。这里让当前目标一直打到它明显更远为止。
   */
  private aimPick(p: Player): Enemy | null {
    const near = this.nearestEnemy(p.x, p.y, p.st.range, false);
    if (!near) {
      p.aimId = -1;
      return null;
    }
    if (p.aimId >= 0) {
      const cur = this.enemies.find((e) => e.id === p.aimId && e.alive && !e.dead);
      if (cur) {
        const dc = dist2(p.x, p.y, cur.x, cur.y);
        const dn = dist2(p.x, p.y, near.x, near.y);
        if (dc <= dn * 1.6) return cur;
      }
    }
    p.aimId = near.id;
    return near;
  }

  /** 最近敌人。ignoreGrass=true 时忽略草丛里的（视线挡住的）。 */
  nearestEnemy(x: number, y: number, range: number, requireSight: boolean): Enemy | null {
    let best: Enemy | null = null;
    let bestD = range * range;
    const list = this.enemies;
    for (let i = 0; i < list.length; i += 1) {
      const e = list[i];
      if (!e.alive || e.dead) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d > bestD) continue;
      if (requireSight && !this.world.hasLineOfSight(x, y, e.x, e.y)) continue;
      best = e;
      bestD = d;
    }
    return best;
  }

  /** 玩家手动瞄准方向上的敌人（蜂群集火用）。 */
  private enemiesInRadius(x: number, y: number, r: number, out: Enemy[]): Enemy[] {
    this.grid.query(x, y, r, out);
    let n = 0;
    for (let i = 0; i < out.length; i += 1) {
      const e = out[i];
      if (!e.alive || e.dead) continue;
      if (dist2(x, y, e.x, e.y) <= (r + e.r) ** 2) out[n++] = e;
    }
    out.length = n;
    return out;
  }

  // ---- 开火 ----

  private fire(p: Player, target: Enemy | null): void {
    // 长管炮：贴太近打不到 —— 改打射程外的目标，找不到才停火
    if (p.kit.minRange > 0 && target && dist2(p.x, p.y, target.x, target.y) < p.kit.minRange ** 2) {
      target = this.nearestBeyond(p.x, p.y, p.kit.minRange, p.st.range);
      if (!target) return;
    }

    const base = p.turretAngle;
    const n = Math.max(1, p.st.projectiles);
    const spread = (p.spreadDeg * Math.PI) / 180;
    const pellets = Math.max(1, p.weapon.pellets);
    const crit = this.o.rng.next() < p.st.crit;
    const sig = p.sig;
    const heavy = p.flags.has('heavyShot');

    let dmg = p.st.dmg * (crit ? p.st.critMul : 1);
    if (p.still >= sig.stillNeed && sig.stillDmg > 0) dmg *= 1 + sig.stillDmg;
    if (p.lock > 0) dmg *= 1; // 锁定必暴击在下文处理
    if (sig.lostHpDmgPer > 0) {
      const lost = 1 - p.hp / p.maxHp;
      dmg *= 1 + Math.min(sig.lostHpDmgMax, Math.floor(lost * 10) * sig.lostHpDmgPer);
    }

    // 超载核心：红区增伤
    if (p.flags.has('heatRedline') && p.kit.heatMax > 0 && p.heat / p.kit.heatMax > CONFIG.cards.heat.redAt) {
      dmg *= CONFIG.cards.heat.redMul;
    }

    // 饱和打击：静止蓄满后这一发变成全向
    if (p.radial > 0 && p.heavyCharge >= 1) {
      p.heavyCharge = 0;
      this.ultSaturation(p, dmg);
      return;
    }

    for (let s = 0; s < pellets; s += 1) {
      for (let i = 0; i < n; i += 1) {
        const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * spread;
        const pelletOff = pellets > 1 ? (s / (pellets - 1) - 0.5) * ((7 * Math.PI) / 180) : 0;
        const a = base + off + pelletOff + this.o.rng.range(-0.01, 0.01);
        const isLock = p.lock > 0 && i === 0;
        this.spawnBullet(
          p,
          a,
          dmg * (pellets > 1 ? 0.45 : 1),
          crit || isLock,
          heavy,
          false,
        );
      }
    }

    // 超载核心：积热
    if (p.kit.heatMax > 0) {
      p.heat += CONFIG.cards.heat.perShot * nzp(p.mul.heatRate);
      const H = CONFIG.cards.heat;
      if (p.heat >= p.kit.heatMax) {
        p.heat = p.kit.heatMax;
        p.overheat = p.flags.has('heatCool') ? H.restFast : H.rest;
        this.addText(p.x, p.y - p.r * 2, '过热', '#ff4d4d', 13);
      }
    }

    p.recoil = 1;
    if (p.lock > 0) p.lock -= 1;
    this.o.fx.muzzle(p.x + Math.cos(base) * p.r * 1.9, p.y + Math.sin(base) * p.r * 1.9, base, p.tank.light);
    this.o.audio.sfx(n > 2 ? 'shootHeavy' : 'shoot', this.o.rng.int(-40, 40), 0.9);
    if (target === null && !this.o.setting('auto-aim')) void 0;
  }

  /** 饱和打击：全向 12 发（静止蓄力触发）。 */
  private ultSaturation(p: Player, dmg: number): void {
    const shots = Math.max(6, p.radial);
    for (let i = 0; i < shots; i += 1) {
      const a = (Math.PI * 2 * i) / shots;
      this.spawnBullet(p, a, dmg * 0.55, false, false, true);
    }
    this.o.fx.ultRing(p.x, p.y, p.r * 2);
    this.o.audio.sfx('rail', 0, 0.8);
    void this.o.rng;
  }

  /** 轨道炮：穿墙、贯穿 4、无衰减。 */
  private railshot(p: Player, sig: SignatureConfig): void {
    const a = p.turretAngle;
    const b = this.makeBullet(p.x, p.y, a, p.st.bulletSpeed * 1.6, p.st.dmg * sig.railDmg, false);
    b.pierce = 4;
    b.falloff = 1;
    b.rail = true;
    b.wallDmg = 3;
    b.size = 6;
    b.color = p.tank.light;
    b.life = 2.4;
    this.bullets.push(b);
    this.o.fx.ultRail(p.x, p.y, a, 1400);
    this.o.audio.sfx('rail');
    this.o.fx.blast(p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30, 26);
  }

  /** 时停结束：沿炮口打出一条贯穿全场的炮击（这才是时停的收益）。 */
  private stopBeam(p: Player): void {
    const a = p.turretAngle;
    const b = this.makeBullet(p.x, p.y, a, 1500, p.st.dmg * p.kit.stopBeam, false);
    b.pierce = 99;
    b.falloff = 1;
    b.rail = true;
    b.ghost = true;
    b.size = 8;
    b.color = '#c9f5fb';
    b.life = 1.2;
    b.owner = p.index;
    this.bullets.push(b);
    this.o.fx.ultRail(p.x, p.y, a, 1600);
    this.o.fx.addShake('shakeBoss');
    this.o.audio.sfx('rail');
    this.o.rumble(0.7, 0.4, 160);
  }

  /** 轨道炮（卡）：穿墙、贯穿、无衰减。 */
  private railshotCard(p: Player): void {
    const K = CONFIG.cards.rail;
    const a = p.turretAngle;
    const b = this.makeBullet(p.x, p.y, a, p.st.bulletSpeed * K.speedMul, p.st.dmg * p.kit.railDmg, false);
    b.pierce = p.kit.railPierce;
    b.falloff = 1;
    b.rail = true;
    b.wallDmg = 3;
    b.size = 7;
    b.color = '#ff4d4d';
    b.life = 1.6;
    this.bullets.push(b);
    this.o.fx.ultRail(p.x, p.y, a, 1400);
    this.o.audio.sfx('rail');
    this.o.fx.addShake('shakeBlast');
    this.o.rumble(0.5, 0.3, 120);
  }

  /** 要塞协议：环形齐射。 */
  private barrage(p: Player, sig: SignatureConfig): void {
    const shots = Math.max(6, sig.barrageShots);
    for (let i = 0; i < shots; i += 1) {
      const a = (Math.PI * 2 * i) / shots + this.o.rng.range(-0.05, 0.05);
      this.spawnBullet(p, a, p.st.dmg * sig.barrageRatio, false, false, true);
      if (sig.markBonus > 0) this.ring(p.x, p.y, p.r * 3, p.tank.light, 0.3, 2);
    }
    this.o.fx.ultRing(p.x, p.y, p.r * 2.2);
    this.o.audio.sfx('shootHeavy');
  }

  /** 冲刺结束后的四发短程弹（回声 Ⅳ）。 */
  private dashBurst(p: Player, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const a = p.angle + Math.PI + (i / count - 0.5) * 1.2;
      const b = this.makeBullet(p.x, p.y, a, 320, p.st.dmg * 0.5, false);
      b.life = 0.35;
      b.color = p.tank.light;
      this.bullets.push(b);
    }
  }

  /** 蜂群 Ⅳ：叠满层数时对该目标放一轮突袭（范围伤害 + 视觉爆发）。 */
  private swarmStrike(p: Player, target: Enemy): void {
    const r = 70;
    const dmg = p.st.dmg * 1.6;
    const list = this.enemiesInRadius(target.x, target.y, r, this.q2);
    for (const e of list) {
      this.damageEnemy(e, dmg, p, false, 'swarm');
    }
    this.o.fx.ultSwarm(target.x, target.y, r);
    this.o.fx.blast(target.x, target.y, r * 0.8);
    this.o.audio.sfx('tesla', 0, 0.8);
  }

  private spawnBullet(p: Player, angle: number, dmg: number, crit: boolean, heavy: boolean, radial: boolean): void {
    const b = this.makeBullet(p.x + Math.cos(angle) * p.r * 1.6, p.y + Math.sin(angle) * p.r * 1.6, angle, p.st.bulletSpeed, dmg, crit);
    b.pierce = p.st.pierce;
    b.falloff = p.falloff;
    b.blast = p.blastRadius;
    b.puddle = p.puddleDps;
    b.wallDmg = p.wallDmg;
    b.chain = p.weapon.chain;
    b.chainRatio = p.weapon.chainRatio;
    b.chainSlow = ARC_SIG.slow[clamp(p.sigIndex, 1, 4) - 1];
    b.chainLoop = ARC_SIG.loop[clamp(p.sigIndex, 1, 4) - 1];
    b.chainDmgPer = ARC_SIG.chainDmgPer[clamp(p.sigIndex, 1, 4) - 1];
    b.doubleBlast = p.flags.has('doubleBlast') || FURNACE_SIG.doubleBlast[clamp(p.sigIndex, 1, 4) - 1];
    b.chainBlast = p.chainBlast;
    b.heavy = heavy;
    b.radial = radial;
    b.bounce = p.kit.bounce;
    b.homing = 0;
    b.shell = false;
    // 穿墙弹：直接穿过砖墙与残楼
    b.ghost = p.flags.has('pierceWall');
    b.blastRatio = 0.6 * nzp(p.mul.blastDmg);
    b.puddleLife = 3;
    b.owner = p.index;
    b.color = crit ? '#ffffff' : p.tank.light;
    b.size = crit ? 5 : heavy ? 6 : 4;
    b.life = p.st.range / p.st.bulletSpeed + 0.4;
    if (this.bullets.length < CONFIG.caps.bullets) this.bullets.push(b);
  }

  private makeBullet(x: number, y: number, angle: number, speed: number, dmg: number, crit: boolean): Bullet {
    return {
      alive: true,
      x, y,
      px: x, py: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      dmg,
      life: 2,
      pierce: 0,
      falloff: 0.7,
      blast: 0,
      puddle: 0,
      wallDmg: 1,
      chain: 0,
      chainRatio: 0.6,
      chainSlow: 0,
      chainLoop: false,
      chainDmgPer: 0,
      bounce: 0,
      owner: 0,
      crit,
      heavy: false,
      rail: false,
      radial: false,
      doubleBlast: false,
      chainBlast: 0,
      blastRatio: 0.6,
      ghost: false,
      homing: 0,
      shell: false,
      shock: false,
      puddleLife: 3,
      color: crit ? '#ffffff' : '#f3ecdd',
      size: 4,
      hits: [],
    };
  }

  bomb(p: Player): void {
    const r = CONFIG.combat.bombRadius;
    const dmg = CONFIG.combat.bombBase + this.level * CONFIG.combat.bombPerLevel;
    this.clearEnemyBullets(p.x, p.y, r * 1.15);
    const list = this.enemiesInRadius(p.x, p.y, r, this.q2);
    for (let i = 0; i < list.length; i += 1) this.damageEnemy(list[i], dmg, p, false, 'bomb');
    this.o.fx.blast(p.x, p.y, r * 0.8);
    this.o.fx.addShake('shakeBoss');
    this.o.audio.sfx('bomb');
    this.o.rumble(0.7, 0.5, 160);
    this.ring(p.x, p.y, r, '#ffffff', 0.4, 4);
  }

  // ===================================================================
  // 自动化单位
  // ===================================================================

  private updateDrones(p: Player, dt: number, fallback: Enemy | null): void {
    const want = p.drones;
    // 池子增删
    let have = 0;
    for (const d of this.drones) if (d.alive && d.owner === p.index) have += 1;
    while (have < want) {
      const d: Drone = {
        alive: true, owner: p.index, phase: this.o.rng.angle(), x: p.x, y: p.y, cd: 0,
        shield: false, down: 0, missileCd: 0,
      };
      this.drones.push(d);
      have += 1;
    }
    if (have > want) {
      for (let i = this.drones.length - 1; i >= 0 && have > want; i -= 1) {
        if (this.drones[i]!.owner === p.index) {
          this.drones[i]!.alive = false;
          have -= 1;
        }
      }
    }

    // 蜂群指挥：集火玩家瞄准方向上的目标
    const focus = p.flags.has('focusFire') ? (this.aimTarget(p) ?? fallback) : fallback;
    const K = CONFIG.cards.drone;

    for (const d of this.drones) {
      if (!d.alive || d.owner !== p.index) continue;
      d.shield = p.flags.has('droneShield');
      d.phase += dt * 1.6;
      if (d.down > 0) {
        d.down -= dt;
        continue;
      }
      const orbit = p.r * 2.6;
      const tx = p.x + Math.cos(d.phase) * orbit;
      const ty = p.y + Math.sin(d.phase) * orbit;
      d.x += (tx - d.x) * Math.min(1, dt * 7);
      d.y += (ty - d.y) * Math.min(1, dt * 7);

      // 挂载导弹
      if (p.flags.has('droneMissile')) {
        d.missileCd -= dt;
        if (d.missileCd <= 0) {
          const mt = focus ?? this.nearestEnemy(d.x, d.y, p.st.range, false);
          if (mt) {
            d.missileCd = K.missileCd;
            const ma = Math.atan2(mt.y - d.y, mt.x - d.x);
            const mb = this.makeBullet(d.x, d.y, ma, 420, p.st.dmg * K.missileRatio, false);
            mb.owner = p.index;
            mb.life = 1.4;
            mb.homing = 4;
            mb.blast = K.missileR * 0.6;
            mb.blastRatio = 0.6;
            mb.color = '#c9a0ff';
            mb.size = 4;
            this.bullets.push(mb);
          }
        }
      }

      d.cd -= dt;
      if (d.cd > 0) continue;
      const target = focus ?? this.nearestEnemy(d.x, d.y, p.st.range * 0.8, false);
      if (!target) continue;
      d.cd = K.cd * nzp(p.mul.droneCd);
      const a = Math.atan2(target.y - d.y, target.x - d.x);
      const b = this.makeBullet(d.x, d.y, a, K.speed, p.st.dmg * K.dmgRatio * nzp(p.mul.droneDmg), false);
      b.life = K.life;
      b.owner = p.index;
      b.color = '#c9a0ff';
      b.size = 3;
      b.pierce = 0;
      b.falloff = 1;
      this.bullets.push(b);
      if (want >= 5) this.o.fx.ultSwarm(p.x, p.y, p.r * 3);
    }
  }

  private dropMine(p: Player): void {
    if (this.mines.filter((m) => m.alive).length >= CONFIG.caps.mines) return;
    const back = p.angle + Math.PI;
    const MK = CONFIG.cards.mine;
    this.mines.push({
      alive: true,
      x: p.x + Math.cos(back) * p.r * 1.4,
      y: p.y + Math.sin(back) * p.r * 1.4,
      // 磁吸雷的触发圈更大：靠得近就被拽过去
      r: MK.trigger * (p.flags.has('mineJump') ? MK.jumpMul : 1),
      dmg: p.st.dmg * nzp(p.mul.mineDmg) * MK.dmgRatio,
      life: MK.life,
      owner: p.index,
      homing: p.flags.has('mineHoming'),
      tether: p.flags.has('mineTether'),
      jump: p.flags.has('mineJump'),
      vx: 0,
      vy: 0,
    });
  }

  private zap(p: Player): void {
    const K = CONFIG.cards.tesla;
    if (p.flags.has('teslaPillar')) {
      // 电极柱：插在脚下，持续放电
      this.wells.push({
        alive: true,
        owner: p.index,
        x: p.x,
        y: p.y,
        life: K.pillarLife,
        maxLife: K.pillarLife,
        r: K.pillarR,
        pull: 0,
        dmg: p.st.dmg * K.dmgRatio * nzp(p.mul.teslaDmg),
        singularity: false,
        inert: true,
        pillar: K.pillarCd,
        tick: 0,
        slow: 0,
      });
      this.o.fx.ultRing(p.x, p.y, K.pillarR);
      this.o.audio.sfx('tesla');
      return;
    }
    const first = this.nearestEnemy(p.x, p.y, 300, false);
    if (!first) return;
    let chain = Math.max(1, p.teslaChain);
    const hit: Enemy[] = [];
    let src = first;
    const used = new Set<number>();
    while (chain > 0) {
      if (hit.length >= CONFIG.caps.arcs) break;
      hit.push(src);
      used.add(src.id);
      const next = this.nearestExcept(src.x, src.y, K.jump, used);
      const from = src;
      this.o.fx.chain(from.x, from.y, next ? next.x : src.x, next ? next.y : src.y);
      if (next) src = next;
      chain -= 1;
      if (!next) break;
    }
    const dmg = p.st.dmg * K.dmgRatio * nzp(p.mul.teslaDmg);
    for (let i = 0; i < hit.length; i += 1) {
      const e = hit[i]!;
      this.damageEnemy(e, dmg * Math.pow(0.85, i), p, false, 'tesla');
      if (p.flags.has('teslaVuln')) {
        e.vuln = Math.max(e.vuln, 0.15);
        e.vulnT = 2;
      }
    }
    this.o.audio.sfx('tesla');
  }

  private nearestExcept(x: number, y: number, r: number, used: Set<number>): Enemy | null {
    let best: Enemy | null = null;
    let bestD = r * r;
    for (const e of this.enemies) {
      if (!e.alive || e.dead || used.has(e.id)) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** 超出最小射程的最近敌人（长管炮用）。 */
  private nearestBeyond(x: number, y: number, minR: number, maxR: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD = maxR * maxR;
    const min2 = minR * minR;
    for (const e of this.enemies) {
      if (!e.alive || e.dead) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d <= min2 || d > bestD) continue;
      bestD = d;
      best = e;
    }
    return best;
  }

  /** 玩家瞄准方向上的敌人（蜂群 / 智能炮台用）。 */
  private aimTarget(p: Player): Enemy | null {
    let best: Enemy | null = null;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > p.st.range) continue;
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      const off = Math.abs(shortAngle(a, p.turretAngle));
      if (off > 0.5) continue;
      const score = off * 300 + d;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  // ===================================================================
  // 卡牌副武器
  // ===================================================================

  /** 锥形攻击：命中扇区内所有敌人。 */
  private coneAttack(
    p: Player,
    r: number,
    arc: number,
    ratio: number,
    chill: number,
    vuln: number,
    color: string,
  ): void {
    const list = this.enemiesInRadius(p.x, p.y, r, this.q2);
    const aim = p.turretAngle;
    for (const e of list) {
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      if (Math.abs(shortAngle(a, aim)) > arc) continue;
      this.damageEnemy(e, p.st.dmg * ratio, p, false, 'cone');
      if (chill > 0) {
        e.slow = Math.max(e.slow, chill);
        e.slowT = CONFIG.cards.cone.chillT;
      }
      if (vuln > 0) {
        e.vuln = Math.max(e.vuln, vuln);
        e.vulnT = 2;
      }
    }
    for (let i = -2; i <= 2; i += 1) {
      const a = aim + (i / 2) * arc * 0.8;
      this.o.fx.trail(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, p.x, p.y, color);
    }
    this.o.audio.sfx('shoot', 0, 0.5);
  }

  /** 抛射体（手雷 / 燃油弹）：飞到落点后爆炸，落地可留火池。 */
  private throwShell(
    p: Player,
    angle: number,
    range: number,
    r: number,
    dmg: number,
    ghost: boolean,
    puddle: number,
    puddleLife: number,
    shellLife: number,
    color: string,
  ): void {
    const speedNow = range / Math.max(0.05, shellLife);
    const b = this.makeBullet(
      p.x + Math.cos(angle) * p.r * 1.2,
      p.y + Math.sin(angle) * p.r * 1.2,
      angle,
      speedNow,
      dmg,
      false,
    );
    b.life = shellLife;
    b.blast = r;
    b.blastRatio = 1;
    b.puddle = puddle;
    b.puddleLife = puddleLife;
    b.shell = true;
    b.ghost = ghost;
    b.owner = p.index;
    b.color = color;
    b.size = 5;
    b.wallDmg = 2;
    this.bullets.push(b);
  }

  private updateSubweapons(p: Player, dt: number, target: Enemy | null): void {
    const k = p.kit;
    const K = CONFIG.cards;
    const aim = target ? Math.atan2(target.y - p.y, target.x - p.x) : p.turretAngle;

    // ---- 破片手雷 ----
    if (k.grenades > 0) {
      p.grenadeCd -= dt;
      if (p.grenadeCd <= 0) {
        p.grenadeCd = k.grenadeCd;
        const n = Math.max(1, k.grenades);
        for (let i = 0; i < n; i += 1) {
          const off = n === 1 ? 0 : (i - (n - 1) / 2) * 0.16;
          this.throwShell(
            p, aim + off, K.grenade.range, k.grenadeR, K.grenade.dmg,
            p.flags.has('grenadeAir'), 0, 0, K.grenade.shellLife, '#ffb066',
          );
        }
        this.o.audio.sfx('shoot', 0, 0.6);
      }
    }

    // ---- 燃油弹 ----
    if (k.napalm > 0) {
      p.napalmCd -= dt;
      if (p.napalmCd <= 0) {
        p.napalmCd = k.napalmCd;
        if (p.flags.has('napalmJet')) {
          this.coneAttack(p, K.napalm.coneR, K.napalm.coneArc, K.napalm.coneRatio, 0, 0, '#ff6b35');
          this.addPuddle(
            p.x + Math.cos(aim) * K.napalm.coneR * 0.5,
            p.y + Math.sin(aim) * K.napalm.coneR * 0.5,
            k.napalmR, k.napalmDps, k.napalmLife,
          );
        } else {
          this.throwShell(
            p, aim, K.napalm.range, k.napalmR, 0, false,
            k.napalmDps, k.napalmLife, K.napalm.shellLife, '#ff6b35',
          );
        }
        this.o.audio.sfx('shootHeavy', 0, 0.5);
      }
    }

    // ---- 冷媒喷口 ----
    if (nz(p.add.cone) > 0) {
      p.coneCd -= dt;
      if (p.coneCd <= 0) {
        p.coneCd = k.coneCd;
        this.coneAttack(p, k.coneR, K.cone.arc, k.coneDmg, k.chill, k.frostVuln, '#9fd8ff');
      }
    }

    // ---- 导弹阵列 ----
    if (k.missiles > 0) {
      p.missileCd -= dt;
      if (p.missileCd <= 0) {
        p.missileCd = k.missileCd;
        const n = Math.max(1, k.missiles);
        const baseAngle = target ? Math.atan2(target.y - p.y, target.x - p.x) : p.turretAngle;
        for (let i = 0; i < n; i += 1) {
          const a = baseAngle + (i - (n - 1) / 2) * 0.35;
          const b = this.makeBullet(p.x, p.y, a, K.missile.speed, p.st.dmg * k.missileDmg, false);
          b.owner = p.index;
          b.homing = K.missile.turn;
          b.life = 2.4;
          b.color = '#ff9f6b';
          b.size = 3;
          b.blast = p.flags.has('missileBlast') ? K.missile.blast : 0;
          b.blastRatio = 0.6;
          this.bullets.push(b);
        }
        this.o.audio.sfx('shoot', 0, 0.5);
      }
    }

    // ---- 哨戒炮台 ----
    if (k.turrets > 0) {
      p.turretCd -= dt;
      if (p.turretCd <= 0) {
        const alive = this.turrets.filter((t) => t.alive && t.owner === p.index);
        if (alive.length >= k.turrets) {
          const oldest = alive[0];
          if (oldest) oldest.alive = false;
        }
        const heavy = p.flags.has('turretHeavy');
        this.turrets.push({
          alive: true,
          owner: p.index,
          x: p.x + Math.cos(p.angle + Math.PI) * 26,
          y: p.y + Math.sin(p.angle + Math.PI) * 26,
          angle: p.turretAngle,
          life: K.turret.life,
          maxLife: K.turret.life,
          cd: 0,
          dmg: p.st.dmg * K.turret.dmgRatio * (heavy ? K.turret.heavyMul : 1),
          r: K.turret.r,
          range: K.turret.range,
          heavy,
          smart: p.flags.has('turretSmart'),
        });
        p.turretCd = K.turret.deployCd;
        this.ring(p.x + Math.cos(p.angle + Math.PI) * 26, p.y + Math.sin(p.angle + Math.PI) * 26, 34, '#c9a0ff', 0.35, 2);
        this.o.audio.sfx('ui', 0, 0.6);
      }
    }

    // ---- 引力井 ----
    if (k.wells > 0) {
      p.wellCd -= dt;
      if (p.wellCd <= 0) {
        p.wellCd = k.wellCd;
        const tx = target ? target.x : p.x + Math.cos(p.turretAngle) * 200;
        const ty = target ? target.y : p.y + Math.sin(p.turretAngle) * 200;
        const sing = p.flags.has('wellSingularity');
        this.wells.push({
          alive: true,
          owner: p.index,
          x: tx,
          y: ty,
          life: sing ? K.well.singularityDur : K.well.dur,
          maxLife: sing ? K.well.singularityDur : K.well.dur,
          r: K.well.r,
          pull: K.well.pull,
          dmg: p.st.dmg * K.well.dmgRatio,
          singularity: sing,
          inert: p.flags.has('wellInert'),
          pillar: 0,
          tick: 0,
          slow: 0,
        });
        this.o.fx.ultRing(tx, ty, K.well.r);
        this.o.audio.sfx('tesla', 0, 0.5);
      }
    }

    // ---- 磁暴场 ----
    if (k.storm > 0) {
      p.stormCd -= dt;
      if (p.stormCd <= 0) {
        p.stormCd = k.stormCd;
        const list = this.enemiesInRadius(p.x, p.y, K.storm.r, this.q2);
        if (list.length > 0) {
          const e = list[this.o.rng.int(0, list.length - 1)]!;
          for (const o of list) {
            if (dist2(o.x, o.y, e.x, e.y) > K.storm.arcR ** 2) continue;
            this.damageEnemy(o, p.st.dmg * k.stormDmg, p, false, 'storm');
          }
          this.o.fx.chain(e.x, e.y - 160, e.x, e.y);
          this.o.fx.blast(e.x, e.y, K.storm.arcR);
          if (p.flags.has('stormArc')) {
            this.addPuddle(e.x, e.y, K.storm.arcR * 0.7, k.stormDmg * p.st.dmg / 0.35, K.storm.arcLife);
          }
          this.o.audio.sfx('tesla', 0, 0.6);
        }
      }
    }
  }

  private updateTurrets(dt: number): void {
    for (const t of this.turrets) {
      if (!t.alive) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.alive = false;
        continue;
      }
      t.cd -= dt;
      const owner = this.players[t.owner];
      const aimed = t.smart && owner ? this.aimTarget(owner) : null;
      const target = aimed ?? this.nearestEnemy(t.x, t.y, t.range, false);
      if (!target) continue;
      t.angle = Math.atan2(target.y - t.y, target.x - t.x);
      if (t.cd > 0) continue;
      t.cd = CONFIG.cards.turret.cd * (t.heavy ? CONFIG.cards.turret.heavyCd : 1);
      const b = this.makeBullet(t.x, t.y, t.angle, 560, t.dmg, false);
      b.owner = t.owner;
      b.life = t.range / 560 + 0.4;
      b.color = '#c9a0ff';
      b.size = 3;
      this.bullets.push(b);
      this.o.fx.muzzle(t.x, t.y, t.angle, '#c9a0ff');
    }
    compact(this.turrets);
  }

  private updateWells(dt: number): void {
    for (const w of this.wells) {
      if (!w.alive) continue;
      w.life -= dt;
      if (w.pillar > 0) {
        // 电极柱：周期性放电
        w.tick -= dt;
        if (w.tick <= 0) {
          w.tick = w.pillar;
          const hit = this.enemiesInRadius(w.x, w.y, w.r, this.q2);
          for (const e of hit) {
            this.damageEnemy(e, w.dmg, this.players[w.owner], false, 'pillar');
            this.o.fx.chain(w.x, w.y, e.x, e.y);
          }
          this.o.audio.sfx('tesla', 0, 0.5);
        }
      } else if (!w.inert) {
        const list = this.enemiesInRadius(w.x, w.y, w.r, this.q2);
        for (const e of list) {
          if (e.boss) continue;
          const d = Math.hypot(w.x - e.x, w.y - e.y) || 1;
          const pull = Math.min(w.pull, d * 6) * dt;
          e.x += ((w.x - e.x) / d) * pull;
          e.y += ((w.y - e.y) / d) * pull;
        }
      } else {
        const list = this.enemiesInRadius(w.x, w.y, w.r, this.q2);
        for (const e of list) {
          e.slow = Math.max(e.slow, CONFIG.cards.well.inertSlow);
          e.slowT = 0.4;
          e.vuln = Math.max(e.vuln, CONFIG.cards.well.inertVuln);
          e.vulnT = 0.4;
        }
      }
      if (w.life <= 0) {
        w.alive = false;
        if (w.singularity) {
          const hit = this.enemiesInRadius(w.x, w.y, CONFIG.cards.well.singularityR, this.q2);
          for (const e of hit) this.damageEnemy(e, w.dmg, this.players[w.owner], false, 'well');
          this.o.fx.blast(w.x, w.y, CONFIG.cards.well.singularityR);
          this.o.fx.addShake('shakeBlast');
        }
      }
    }
    compact(this.wells);
  }

  private updateBooms(dt: number): void {
    for (const b of this.booms) {
      if (!b.alive) continue;
      b.t -= dt;
      if (b.t > 0) continue;
      b.alive = false;
      const list = this.enemiesInRadius(b.x, b.y, b.r, this.q2);
      for (const e of list) {
        this.damageEnemy(e, b.dmg, this.players[b.owner], false, 'boom');
        if (b.slow > 0) {
          e.slow = Math.max(e.slow, b.slow);
          e.slowT = 1.5;
        }
      }
      if (b.puddle > 0) this.addPuddle(b.x, b.y, b.r * 0.8, b.puddle, b.puddleLife);
      this.o.fx.blast(b.x, b.y, b.r);
      this.o.audio.sfx('blast', 0, 0.7);
    }
    compact(this.booms);
  }

  // ===================================================================
  // 子弹
  // ===================================================================

  private updateBullets(dt: number, pool: Bullet[], fromEnemy: boolean): void {
    if (dt <= 0) return;
    for (const b of pool) {
      if (!b.alive) continue;
      b.px = b.x;
      b.py = b.y;

      // 追踪
      if (b.homing > 0) {
        const t = this.nearestEnemy(b.x, b.y, 520, false);
        if (t) {
          const want = Math.atan2(t.y - b.y, t.x - b.x);
          const cur = Math.atan2(b.vy, b.vx);
          const na = cur + shortAngle(want, cur) * Math.min(1, b.homing * dt);
          const sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(na) * sp;
          b.vy = Math.sin(na) * sp;
        }
      }

      // 时间膨胀：光环里的敌弹变慢
      let bdt = dt;
      if (fromEnemy) {
        for (const p of this.players) {
          if (!p.alive || p.kit.auraSlow <= 0) continue;
          if (dist2(p.x, p.y, b.x, b.y) <= p.kit.auraR ** 2) {
            bdt = dt * (1 - p.kit.auraSlow);
            break;
          }
        }
      }

      b.x += b.vx * bdt;
      b.y += b.vy * bdt;
      b.life -= dt;
      if (b.life <= 0) {
        b.alive = false;
        if (b.shell) this.detonateShell(b);
        continue;
      }

      // 拖尾
      if (Math.hypot(b.vx, b.vy) > 200 && this.o.rng.chance(0.6)) {
        this.o.fx.trail(b.x, b.y, b.px, b.py, b.color);
      }

      // 撞墙
      const tx = Math.floor(b.x / T);
      const ty = Math.floor(b.y / T);
      if (!this.world.inBounds(tx, ty) || (this.world.blocksBullet(tx, ty) && !b.rail && !b.ghost)) {
        const wallDmg = b.dmg * b.wallDmg;
        const res = this.world.damage(tx, ty, wallDmg);
        if (res === 'none' && this.world.blocksBullet(tx, ty)) {
          this.o.fx.hit(b.x, b.y, '#9a9aa8', false);
          this.o.audio.sfx('brick');
        } else if (res === 'steel') {
          this.o.fx.hit(b.x, b.y, '#c9f5fb', false);
        } else if (res === 'destroyed') {
          this.onTileDestroyed(tx, ty, b);
        } else {
          this.o.fx.hit(b.x, b.y, '#9a9aa8', false);
        }
        // 跳弹：反弹一次继续飞
        if (b.bounce > 0 && this.world.inBounds(tx, ty)) {
          b.bounce -= 1;
          const cx = tx * T + T / 2;
          const cy = ty * T + T / 2;
          if (Math.abs(b.x - cx) > Math.abs(b.y - cy)) b.vx = -b.vx;
          else b.vy = -b.vy;
          b.life = Math.max(b.life, 0.4);
          this.o.fx.pierce(b.x, b.y, Math.atan2(b.vy, b.vx));
          const owner = this.players[b.owner];
          if (owner && owner.flags.has('bounceFrag')) this.splitFrag(b);
          continue;
        }
        if (b.blast > 0) this.explode(b, b.x, b.y);
        b.alive = false;
        continue;
      }

      if (fromEnemy) {
        const hit = this.playerHitBy(b);
        if (hit) {
          this.hurtPlayer(hit, b.dmg, b.x, b.y, true);
          if (b.blast > 0) this.explode(b, b.x, b.y);
          b.alive = false;
          continue;
        }
        // 蜂群护盾：无人机挡子弹
        let blocked = false;
        for (const d of this.drones) {
          if (!d.alive || !d.shield || d.down > 0) continue;
          if (dist2(d.x, d.y, b.x, b.y) <= (b.size + 10) ** 2) {
            d.down = CONFIG.cards.drone.shieldRegen;
            this.o.fx.shieldBreak(d.x, d.y, 14);
            this.o.audio.sfx('shieldHit');
            blocked = true;
            break;
          }
        }
        if (blocked) {
          b.alive = false;
          continue;
        }
        continue;
      }

      // 抛射体不撞敌人：飞到落点再炸
      if (b.shell) continue;

      // 打玩家子弹？没有——敌方弹走 ebullets
      this.grid.query(b.x, b.y, b.size + 30, this.q);
      let consumed = false;
      for (const e of this.q) {
        if (!e.alive || e.dead) continue;
        if (b.hits.includes(e.id)) continue;
        if (dist2(b.x, b.y, e.x, e.y) > (e.r + b.size) ** 2) continue;

        b.hits.push(e.id);
        const owner = this.players[b.owner];
        const front = e.boss ? false : this.isFrontal(e, b);
        let dmg = front ? b.dmg * (1 - (e.def.frontalReduction ?? 0)) : b.dmg;

        // 破甲：正面减伤无效，打护盾 ×2
        if (owner && owner.flags.has('pierceArmor')) {
          if (front) dmg = b.dmg;
          if (e.shield > 0) dmg *= 2;
        }

        // 长矛·贯穿校射：每多穿透一个目标，这一发伤害累加
        if (owner && owner.tank.signature === 'lance' && owner.sig.pierceBonus > 0) {
          const extra = Math.min(owner.sig.pierceBonusMax, (b.hits.length - 1) * owner.sig.pierceBonus);
          dmg *= 1 + extra;
        }

        // 蜂群·蜂群协议：连续命中同一目标叠加增伤（换目标清零）
        if (owner && owner.tank.signature === 'swarm' && owner.sig.swarmStackCap > 0) {
          if (owner.swarmTarget === e.id) {
            owner.swarmStacks = Math.min(owner.sig.swarmStackCap, owner.swarmStacks + 2);
          } else {
            owner.swarmTarget = e.id;
            owner.swarmStacks = 2;
          }
          dmg *= 1 + owner.swarmStacks / 100;
          // 阶段 Ⅳ：叠到阈值触发蜂群突袭
          if (owner.sig.strikeAt > 0 && owner.swarmStacks >= owner.sig.strikeAt * 2) {
            owner.swarmStacks = 0;
            this.swarmStrike(owner, e);
          }
        }

        // 感电（电弧反制）
        if (b.shock) {
          e.vuln = Math.max(e.vuln, 0.15);
          e.vulnT = 2;
        }

        // 冰霜 / 冷媒：减速 + 脆化
        if (owner && owner.kit.chill > 0) {
          e.slow = Math.max(e.slow, owner.kit.chill);
          e.slowT = owner.kit.chillT;
          if (owner.flags.has('freezeRoot') && !e.boss) {
            e.rootT = Math.max(e.rootT, CONFIG.cards.chill.root);
          }
        }
        if (owner && owner.kit.frostVuln > 0 && (e.slow > 0 || e.rootT > 0)) {
          e.vuln = Math.max(e.vuln, owner.kit.frostVuln);
          e.vulnT = 2;
        }

        this.damageEnemy(e, dmg, owner, b.crit, 'shot');

        // 重锤弹：击退
        if (b.heavy) {
          const ka = Math.atan2(b.vy, b.vx);
          e.x += Math.cos(ka) * 8;
          e.y += Math.sin(ka) * 8;
        }

        // 终焉·要塞协议 Ⅲ：齐射命中后标记，后续受伤 +8%
        if (owner && owner.sig.markBonus > 0 && b.radial) e.mark = Math.max(e.mark, 2.5);

        this.o.fx.hit(b.x, b.y, b.crit ? '#ffe6b0' : e.def.color, b.crit);
        if (b.chain > 0) this.doChain(b, e, dmg);
        if (b.puddle > 0 && this.o.rng.chance(0.22)) this.addPuddle(e.x, e.y, 22, b.puddle, b.puddleLife);
        if (b.blast > 0) this.explode(b, b.x, b.y);

        // 跳弹：命中后反弹
        if (b.bounce > 0) {
          b.bounce -= 1;
          const vx0 = b.vx;
          b.vx = -b.vy;
          b.vy = -vx0;
          b.life = Math.max(b.life, 0.4);
          if (owner && owner.flags.has('bounceFrag')) this.splitFrag(b);
          break;
        }

        if (b.rail) {
          // 轨道炮：穿墙、贯穿、无衰减
          if (b.hits.length >= b.pierce) { b.alive = false; consumed = true; }
          break;
        }
        if (b.pierce > 0) {
          b.pierce -= 1;
          b.dmg *= b.falloff;
          this.o.fx.pierce(b.x, b.y, Math.atan2(b.vy, b.vx));
          if (e.alive && b.pierce > 0) continue;
          if (b.pierce <= 0) { b.alive = false; consumed = true; }
          break;
        }
        b.alive = false;
        consumed = true;
        break;
      }
      if (consumed) continue;
    }

    // 回收
    compact(pool);
  }

  /** 破片跳弹：反弹时分裂两发。 */
  private splitFrag(b: Bullet): void {
    for (let k = 0; k < 2; k += 1) {
      const fa = Math.atan2(b.vy, b.vx) + (k === 0 ? 0.5 : -0.5);
      const frag = this.makeBullet(b.x, b.y, fa, Math.hypot(b.vx, b.vy), b.dmg * 0.5, false);
      frag.owner = b.owner;
      frag.color = b.color;
      frag.size = 3;
      frag.life = 0.5;
      this.bullets.push(frag);
    }
  }

  /** 抛射体落地：先铺火池，再爆炸。 */
  private detonateShell(b: Bullet): void {
    if (b.puddle > 0) {
      this.addPuddle(b.x, b.y, b.blast * 0.85, b.puddle, b.puddleLife);
      this.o.fx.ultChain(b.x, b.y - 6, b.x, b.y, b.blast);
    }
    if (b.blast > 0) this.explode(b, b.x, b.y);
  }

  private isFrontal(e: Enemy, b: Bullet): boolean {
    if (!e.def.frontalReduction) return false;
    const bulletAngle = Math.atan2(b.vy, b.vx);
    const d = Math.abs(shortAngle(bulletAngle, e.angle + Math.PI));
    return d < Math.PI / 3;
  }

  private doChain(b: Bullet, from: Enemy, dmg: number): void {
    let left = Math.max(1, b.chain);
    const ratio = b.chainRatio;
    let src = from;
    const used = new Set<number>([from.id]);
    let mult = 1;
    while (left > 0) {
      const next = this.nearestExcept(src.x, src.y, 90, used);
      if (!next) break;
      this.o.fx.chain(src.x, src.y, next.x, next.y);
      this.damageEnemy(next, dmg * ratio * mult, this.players[b.owner] ?? this.players[0], false, 'chain');
      if (b.chainSlow > 0) {
        next.slow = Math.max(next.slow, b.chainSlow);
        next.slowT = 1.5;
      }
      used.add(next.id);
      mult *= 1 + b.chainDmgPer;
      src = next;
      left -= 1;
      if (!b.chainLoop && used.size > 3) break;
    }
  }

  private explode(b: Bullet, x: number, y: number): void {
    const r = Math.min(90, b.blast);
    const list = this.enemiesInRadius(x, y, r, this.q2);
    const dmg = b.dmg * b.blastRatio;
    const killed: Enemy[] = [];
    const by = this.players[b.owner] ?? this.players[0];
    for (const e of list) {
      // 直接被这一发命中的目标已经在 b.hits 里，不重复吃爆炸伤害
      if (b.hits.includes(e.id)) continue;
      this.damageEnemy(e, dmg, by, false, 'blast');
      if (e.dead) killed.push(e);
    }
    this.o.fx.blast(x, y, r);
    // 普通子弹的爆炸不震屏 —— 否则高爆/燃油地雷一起上时画面会一直在抖
    if (r >= CONFIG.fx.bigBlast) this.o.fx.addShake('shakeBlast');
    this.world.splash(x, y, r, dmg * b.wallDmg * 1.4, this.scratch);
    if (b.doubleBlast) this.pushDelayedBlast(x, y, r * 0.6, dmg);
    if (b.chainBlast > 0 && killed.length > 0) {
      this.chainExplode(killed, b, 0);
    }
    this.o.audio.sfx('blast');
  }

  /** 连锁反应：最多 3 层、逐层 ×0.6、精英不连锁。 */
  private chainExplode(source: Enemy[], b: Bullet, depth: number): void {
    if (depth >= Math.max(1, b.chainBlast)) return;
    const ratio = Math.pow(0.6, depth + 1);
    const next: Enemy[] = [];
    for (const s of source) {
      if (s.elite) continue; // 精英不连锁
      const r = Math.min(90, b.blast * 0.8);
      const list = this.enemiesInRadius(s.x, s.y, r, this.q2);
      for (const e of list) {
        if (e.dead || e === s) continue;
        this.damageEnemy(e, b.dmg * 0.6 * ratio, this.players[b.owner] ?? this.players[0], false, 'chain-blast');
        if (e.dead) next.push(e);
        this.o.fx.ultChain(s.x, s.y, e.x, e.y, r);
      }
      this.o.fx.blast(s.x, s.y, r);
    }
    if (next.length > 0) this.chainExplode(next, b, depth + 1);
  }

  private pushDelayedBlast(x: number, y: number, r: number, dmg: number): void {
    this.o.fx.blast(x, y, r);
    const list = this.enemiesInRadius(x, y, r, this.q2);
    for (const e of list) this.damageEnemy(e, dmg * 0.5, this.players[0], false, 'blast2');
    this.world.splash(x, y, r, dmg * 0.4, this.scratch);
  }

  // ===================================================================
  // 敌人
  // ===================================================================

  spawnEnemy(type: EnemyId | null, x: number, y: number, affixes: number): Enemy | null {
    if (this.aliveEnemies >= this.aliveCap + 35) return null;
    const resolved = type ?? this.rollType();
    const def = ENEMY_BY_ID[resolved];
    if (!def) return null;

    const ph = this.phaseInfo();
    const th = this.threatInfo();
    const hpMul = ph.hp * th.hp;
    const dmgMul = ph.dmg * th.dmg;
    const spdMul = ph.spd;

    let affix: AffixDef | null = null;
    let affix2: AffixDef | null = null;
    if (affixes > 0) {
      affix = this.o.rng.pick(AFFIXES) ?? null;
      if (affixes > 1) {
        let guard = 0;
        while (guard++ < 10) {
          const c = this.o.rng.pick(AFFIXES);
          if (c && c !== affix) { affix2 = c; break; }
        }
      }
    }

    const baseHp = def.hp * hpMul * (affix?.hp ?? 1) * (affix2?.hp ?? 1);
    const e: Enemy = {
      alive: true,
      id: this.eid++,
      def,
      x, y,
      vx: 0, vy: 0,
      r: def.r * (affix ? 1.12 : 1),
      hp: baseHp,
      maxHp: baseHp,
      shield: 0,
      shieldMax: affix?.id === 'shielded' || affix2?.id === 'shielded' ? baseHp * 0.5 : 0,
      noHitT: 0,
      speed: def.speed * spdMul * (affix?.speed ?? 1) * (affix2?.speed ?? 1),
      contact: def.contact * dmgMul,
      dmgMul,
      angle: this.o.rng.angle(),
      turret: this.o.rng.angle(),
      fireCd: this.o.rng.range(0.6, def.cooldown || 2),
      telegraph: 0,
      aimX: x,
      aimY: y,
      flash: 0,
      slow: 0,
      slowT: 0,
      mark: 0,
      vuln: 0,
      vulnT: 0,
      rootT: 0,
      burnT: 0,
      elite: affix !== null,
      affix,
      affix2,
      boss: null,
      phase2: false,
      escortDone: 0,
      summonCd: def.cooldown || 6,
      strafe: this.o.rng.sign(),
      wallT: 0,
      wallSign: 1,
      treadT: this.o.rng.next() * 10,
      wobble: this.o.rng.next() * 6,
      dead: false,
    };
    e.shield = e.shieldMax;
    this.enemies.push(e);
    return e;
  }

  private rollType(): EnemyId {
    const th = this.threatInfo();
    let table: [EnemyId, number][] = ROLLS[0];
    for (const key of Object.keys(ROLLS)) {
      const k = Number(key);
      if (this.time >= k) table = ROLLS[k]!;
    }
    const extra = THREAT_EXTRA[th.id ? Number(th.id) : 1] ?? (THREAT_EXTRA as Record<string, never>)[`${this.threat}`];
    const list = [...table];
    const ex = (THREAT_EXTRA as Record<number, Partial<Record<EnemyId, number>> | undefined>)[this.threat];
    if (ex) {
      for (const [id, w] of Object.entries(ex)) {
        if (!ENEMY_BY_ID[id as EnemyId]) continue;
        list.push([id as EnemyId, w ?? 0]);
      }
    }
    void extra;
    // 过滤掉未到时间与未到威胁等级的兵种
    const valid = list.filter(([id]) => this.time >= ENEMY_BY_ID[id].fromTime && this.threat >= ENEMY_BY_ID[id].fromThreat);
    const pool = valid.length > 0 ? valid : list;
    let total = 0;
    for (const [, w] of pool) total += w;
    let roll = this.o.rng.next() * total;
    for (const [id, w] of pool) {
      roll -= w;
      if (roll <= 0) return id;
    }
    return 'grunt';
  }

  spawnBoss(final: boolean): Enemy | null {
    const def = BOSSES[final ? 1 : 0]!;
    const cam = { x: this.players[0]?.x ?? this.world.w / 2, y: this.players[0]?.y ?? this.world.h / 2 };
    const pos = this.world.findSpawn(cam.x, cam.y, 480, 640, 60, false) ?? { x: this.world.w / 2, y: this.world.h / 2 };
    const th = this.threatInfo();
    const hp = def.hp * th.hp;
    const e: Enemy = {
      alive: true,
      id: this.eid++,
      def: ENEMY_BY_ID.grunt,
      x: pos.x,
      y: pos.y,
      vx: 0, vy: 0,
      r: def.r,
      hp,
      maxHp: hp,
      shield: 0,
      shieldMax: 0,
      noHitT: 0,
      speed: def.speed,
      contact: def.contact * th.dmg,
      dmgMul: th.dmg,
      angle: 0,
      turret: 0,
      fireCd: def.cooldown,
      telegraph: 0,
      aimX: pos.x,
      aimY: pos.y,
      flash: 0,
      slow: 0,
      slowT: 0,
      mark: 0,
      vuln: 0,
      vulnT: 0,
      rootT: 0,
      burnT: 0,
      elite: true,
      affix: null,
      affix2: null,
      boss: def,
      phase2: false,
      escortDone: 0,
      summonCd: def.summonEvery ?? 999,
      strafe: 1,
      wallT: 0,
      wallSign: 1,
      treadT: 0,
      wobble: 0,
      dead: false,
    };
    this.enemies.push(e);
    if (final) this.finalBoss = e;
    else this.boss = e;
    return e;
  }

  private updateEnemies(dt: number): void {
    if (dt <= 0) return;
    this.grid.clear();
    for (const e of this.enemies) {
      if (!e.alive || e.dead) continue;
      this.grid.insert(e);
    }

    for (const e of this.enemies) {
      if (!e.alive || e.dead) continue;

      e.flash = Math.max(0, e.flash - dt);
      e.slowT = Math.max(0, e.slowT - dt);
      if (e.slowT <= 0) e.slow = 0;
      e.vulnT = Math.max(0, e.vulnT - dt);
      if (e.vulnT <= 0) e.vuln = 0;
      e.rootT = Math.max(0, e.rootT - dt);
      if (e.burnT > 0) {
        e.burnT -= dt;
        if (Math.hypot(e.vx, e.vy) > 10 && this.o.rng.chance(0.25)) {
          this.addPuddle(e.x, e.y, 20, 6, 1.4);
        }
      }
      e.noHitT += dt;
      if (e.shieldMax > 0 && e.noHitT > 5 && e.shield < e.shieldMax) e.shield = Math.min(e.shieldMax, e.shield + e.shieldMax * dt * 0.4);

      const target = this.nearestAlivePlayer(e.x, e.y);
      const decoy = this.decoyFor(e);
      const aim = decoy ?? target;
      if (!aim) continue;

      const dx = aim.x - e.x;
      const dy = aim.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;

      // 光环与"指挥官"词缀都只影响接触伤害：护卫者光环 + 指挥官光环叠乘。
      let auraMul = 1;
      if (e.def.auraRadius) {
        for (const other of this.enemies) {
          if (other === e || !other.alive || other.dead || !other.def.auraRadius) continue;
          if (dist2(e.x, e.y, other.x, other.y) <= other.def.auraRadius ** 2) auraMul *= 1 + other.def.auraBonus!;
        }
      }
      const commander = this.commanderBonusNear(e);
      if (commander > 0) auraMul *= 1 + commander;
      if (e.mark > 0) e.mark = Math.max(0, e.mark - dt);

      // 时间膨胀光环：靠近的敌人变慢
      for (const p of this.players) {
        if (!p.alive || p.kit.auraSlow <= 0) continue;
        if (dist2(p.x, p.y, e.x, e.y) <= p.kit.auraR ** 2) {
          e.slow = Math.max(e.slow, p.kit.auraSlow);
          e.slowT = Math.max(e.slowT, 0.2);
          break;
        }
      }

      // ---- 行为 ----
      if (e.boss) {
        this.updateBoss(e, dt, aim, ux, uy, d);
      } else if (e.def.attack === 'none') {
        // 冲撞型：直接压上去（throttle 必须是 1，传 0 会让速度恒为 0）
        this.seek(e, dt, ux, uy, 1);
      } else if (e.def.standoff && d < e.def.standoff) {
        // 保持距离
        this.seek(e, dt, -ux, -uy, 0.6);
      } else {
        this.seek(e, dt, ux, uy, 1);
      }

      //  turret 朝向
      e.turret += shortAngle(Math.atan2(dy, dx), e.turret) * Math.min(1, dt * 5);

      // ---- 攻击 ----
      e.fireCd -= dt;
      if (e.telegraph > 0) {
        e.telegraph -= dt;
        if (e.telegraph <= 0) this.enemyAttack(e, aim);
      } else if (e.fireCd <= 0 && e.def.attack !== 'none' && !e.boss) {
        const range = e.def.range || 9999;
        if (d <= range) {
          const tele = e.def.telegraph;
          if (tele > 0) {
            e.telegraph = tele;
            e.aimX = aim.x;
            e.aimY = aim.y;
            if (e.def.attack === 'charge') this.o.audio.sfx('ui', 400, 0.4);
          } else {
            e.fireCd = (e.def.cooldown || 2) * this.o.rng.range(0.85, 1.15);
            this.enemyAttack(e, aim);
          }
        }
      }

      // 布雷
      if (e.def.attack === 'mine') {
        e.summonCd -= dt;
        if (e.summonCd <= 0) {
          e.summonCd = e.def.cooldown;
          this.mines.push({
            alive: true, x: e.x, y: e.y, r: e.def.radius, dmg: e.def.dmg * e.dmgMul,
            life: 20, owner: -1 - e.id,
            homing: false, tether: false, jump: false, vx: 0, vy: 0,
          });
        }
      }

      // 召唤
      if (e.def.summons) {
        e.summonCd -= dt;
        if (e.summonCd <= 0) {
          e.summonCd = e.def.cooldown || 6;
          for (let i = 0; i < e.def.summons.count; i += 1) {
            const pos = this.world.findSpawn(e.x, e.y, 40, 90, 20, e.def.amphibious);
            if (pos) this.spawnEnemy(e.def.summons.id, pos.x, pos.y, 0);
          }
          this.o.fx.bossPhase(e.x, e.y, e.r);
          this.emit({ type: 'toast', text: '召唤器放出了装甲' });
        }
      }

      // ---- 接触伤害：只有真人才会掉血，残影（decoy）不挡刀 ----
      if (target && dist2(e.x, e.y, target.x, target.y) <= (e.r + target.r + 2) ** 2) {
        this.hurtPlayer(target, e.contact * auraMul, e.x, e.y, false);
      }
    }

    compact(this.enemies);
  }

  private updateBoss(e: Enemy, dt: number, aim: { x: number; y: number }, ux: number, uy: number, d: number): void {
    const b = e.boss!;
    const ratio = e.hp / e.maxHp;
    if (!e.phase2 && ratio <= b.phase2At) {
      e.phase2 = true;
      if (b.phase2Speed) e.speed = b.phase2Speed;
      this.o.fx.bossPhase(e.x, e.y, e.r);
      this.o.audio.sfx('bossPhase');
      this.emit({ type: 'toast', text: `${b.name} 进入二阶段` });
    }

    if (b.escortAt) {
      for (let i = 0; i < b.escortAt.length; i += 1) {
        if (ratio <= b.escortAt[i]! && e.escortDone <= i) {
          e.escortDone = i + 1;
          for (let k = 0; k < 6; k += 1) {
            const pos = this.world.findSpawn(e.x, e.y, 60, 120, 20, false);
            if (pos) this.spawnEnemy('brute', pos.x, pos.y, 0);
          }
          this.emit({ type: 'toast', text: '铁壁召唤了护卫' });
        }
      }
    }

    this.seek(e, dt, ux, uy, d > 240 ? 1 : 0.2);

    e.fireCd -= dt;
    if (e.fireCd <= 0) {
      e.fireCd = b.cooldown * (e.phase2 ? 0.72 : 1);
      const a0 = Math.atan2(aim.y - e.y, aim.x - e.x);
      const shots = b.shots;
      if (b.pattern === 'fan') {
        for (let i = 0; i < shots; i += 1) {
          const off = shots === 1 ? 0 : (i / (shots - 1) - 0.5) * b.spread;
          this.enemyBullet(e, a0 + off, b.bulletSpeed, b.dmg * e.dmgMul);
        }
      } else {
        for (let i = 0; i < shots; i += 1) {
          const a = (Math.PI * 2 * i) / shots + a0 * 0.2;
          this.enemyBullet(e, a, b.bulletSpeed, b.dmg * e.dmgMul);
        }
        this.o.fx.ultRing(e.x, e.y, e.r * 1.4);
      }
      this.o.audio.sfx('shootHeavy', 0, 0.7);
    }

    if (e.phase2 && b.summonEvery) {
      e.summonCd -= dt;
      if (e.summonCd <= 0) {
        e.summonCd = b.summonEvery;
        for (let i = 0; i < (b.summonCount ?? 4); i += 1) {
          const pos = this.world.findSpawn(e.x, e.y, 60, 140, 20, true);
          if (pos) this.spawnEnemy(b.summons ?? 'bomber', pos.x, pos.y, 0);
        }
      }
    }
  }

  private enemyBullet(e: Enemy, angle: number, speed: number, dmg: number): void {
    const b = this.makeBullet(e.x + Math.cos(angle) * e.r, e.y + Math.sin(angle) * e.r, angle, speed, dmg, false);
    b.owner = -1;
    b.life = 3;
    b.color = '#ff9c6a';
    b.size = 4;
    b.falloff = 1;
    b.dmg = Math.min(dmg, e.mark > 0 ? dmg * 1.08 : dmg);
    if (this.ebullets.length < CONFIG.caps.ebullets) this.ebullets.push(b);
  }

  private seek(e: Enemy, dt: number, ux: number, uy: number, throttle: number): void {
    if (e.rootT > 0) {
      e.vx *= 0.85;
      e.vy *= 0.85;
      return;
    }
    const speed = e.speed * (1 - e.slow) * throttle;
    const targetVx = ux * speed;
    const targetVy = uy * speed;
    const k = 1 - Math.exp(-7 * dt);
    e.vx += (targetVx - e.vx) * k;
    e.vy += (targetVy - e.vy) * k;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.treadT += dt * (1 + Math.hypot(e.vx, e.vy) / 60);
    if (Math.hypot(e.vx, e.vy) > 4) e.angle = Math.atan2(e.vy, e.vx);

    const blocked = this.world.resolveCircle(e, e.r, e.def.amphibious);
    if (blocked) {
      // 被墙挡住：重装与 BOSS 啃墙，其它绕行
      const tx = Math.floor(e.x / T);
      const ty = Math.floor(e.y / T);
      const t = this.world.typeAt(tx, ty);
      if (t !== TILE.empty && t !== TILE.grass && this.world.ruleAt(tx, ty).destructible) {
        e.wallT += dt;
        if (e.wallT > 0.18) {
          e.wallT = 0;
          const res = this.world.damage(tx, ty, e.def.r > 20 ? 40 : 12);
          if (res === 'destroyed') this.onTileDestroyed(tx, ty, null);
          else this.o.fx.hit(tx * T + T / 2, ty * T + T / 2, '#8a5c3a', false);
          this.o.audio.sfx('brick');
        }
      } else {
        // 绕行
        e.wallT += dt;
        if (e.wallT > 0.6) {
          e.wallSign = this.o.rng.sign();
          e.wallT = 0;
        }
        const px = -uy * e.wallSign;
        const py = ux * e.wallSign;
        e.x += px * e.speed * 0.5 * dt;
        e.y += py * e.speed * 0.5 * dt;
      }
    } else {
      e.wallT = 0;
    }
  }

  private enemyAttack(e: Enemy, aim: { x: number; y: number }): void {
    const def = e.def;
    e.fireCd = (def.cooldown || 2) * this.o.rng.range(0.85, 1.15);
    const a = Math.atan2(aim.y - e.y, aim.x - e.x);

    switch (def.attack) {
      case 'direct':
        this.enemyBullet(e, a, 420, def.dmg * e.dmgMul);
        this.o.fx.muzzle(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, a, def.color);
        this.o.audio.sfx('shoot', -120, 0.7);
        break;

      case 'charge': {
        // 狙击：蓄力穿透
        const b = this.makeBullet(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, a, 900, def.dmg * e.dmgMul, false);
        b.owner = -1;
        b.pierce = 1;
        b.falloff = 1;
        b.color = '#fff3b0';
        b.size = 5;
        b.life = 1.2;
        this.ebullets.push(b);
        this.o.audio.sfx('crit', 0, 0.7);
        break;
      }

      case 'lob': {
        // 迫击：落点 AoE，落点是预警时玩家所在的位置
        const tx = e.aimX;
        const ty = e.aimY;
        this.o.rng.chance(1);
        const list = this.enemiesInRadius(tx, ty, def.radius, this.q2);
        void list;
        for (const p of this.players) {
          if (!p.alive) continue;
          if (dist2(p.x, p.y, tx, ty) <= (def.radius + p.r) ** 2) this.hurtPlayer(p, def.dmg * e.dmgMul, tx, ty, true);
        }
        this.o.fx.blast(tx, ty, def.radius);
        this.ring(tx, ty, def.radius, '#ff6b35', 0.35, 3);
        this.world.splash(tx, ty, def.radius * 0.6, 10, this.scratch);
        this.o.audio.sfx('blast', 0, 0.7);
        break;
      }

      case 'explode': {
        // 自爆：死亡或贴脸引爆
        this.detonate(e);
        break;
      }

      default:
        break;
    }
  }

  private detonate(e: Enemy): void {
    const r = e.def.radius || 90;
    const dmg = (e.def.explodeOnDeath ?? e.def.dmg) * e.dmgMul;
    for (const p of this.players) {
      if (!p.alive) continue;
      if (dist2(p.x, p.y, e.x, e.y) <= (r + p.r) ** 2) this.hurtPlayer(p, dmg, e.x, e.y, true);
    }
    this.o.fx.blast(e.x, e.y, r);
    this.o.audio.sfx('mine');
    this.killEnemy(e, null, false);
  }

  // ===================================================================
  // 伤害与死亡
  // ===================================================================

  damageEnemy(e: Enemy, dmg: number, by: Player | null | undefined, crit: boolean, source: string): void {
    if (!e.alive || e.dead) return;
    let d = dmg;
    if (e.mark > 0) d *= 1.08;
    if (e.vuln > 0) d *= 1 + e.vuln;
    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, d);
      e.shield -= absorbed;
      d -= absorbed;
      this.o.fx.shieldHit(e.x, e.y, e.r * 1.3);
      this.o.audio.sfx('shieldHit');
      if (e.shield <= 0) {
        this.o.fx.shieldBreak(e.x, e.y, e.r * 1.4);
        this.o.audio.sfx('shieldBreak');
      }
      e.noHitT = 0;
      if (d <= 0) return;
    }
    e.hp -= d;
    e.noHitT = 0;
    e.flash = 0.08;
    if (by) by.damage += d;

    if (source === 'shot') {
      this.addText(e.x, e.y - e.r, `${Math.round(d)}`, crit ? '#ffe6b0' : '#f3ecdd', crit ? 16 : 12);
      if (crit) this.o.audio.sfx('crit');
      else this.o.audio.sfx('hit', this.o.rng.int(-60, 60), 0.5);
    }

    if (e.hp <= 0) this.killEnemy(e, by ?? null, crit);
  }

  private killEnemy(e: Enemy, by: Player | null, crit: boolean): void {
    if (e.dead) return;
    e.dead = true;
    e.alive = false;
    this.kills += 1;
    if (by) by.kills += 1;

    const isBoss = !!e.boss;
    if (isBoss) {
      this.bosses += 1;
      this.o.fx.kill(e.x, e.y, e.r * 2, e.boss!.color);
      this.o.fx.blast(e.x, e.y, 200);
      this.o.fx.addShake('shakeBoss');
      this.o.audio.sfx('bossDie');
      this.o.fx.stop(0.06);
      this.o.fx.ultRing(e.x, e.y, e.r * 3);
      // BOSS 掉落
      for (let i = 0; i < 12; i += 1) {
        const a = this.o.rng.angle();
        this.pickups.push({
          alive: true, kind: 'xp', x: e.x + Math.cos(a) * 40, y: e.y + Math.sin(a) * 40,
          vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, value: 3, t: 0, size: 5, color: '#9ad14f',
        });
      }
      this.dropSupply(e.x, e.y, 'bomb');
      if (e === this.finalBoss) {
        this.won = true;
        this.end(true);
      } else {
        this.emit({ type: 'boss', name: e.boss!.name });
      }
    } else {
      this.o.fx.kill(e.x, e.y, e.r, e.def.color);
      this.o.audio.sfx('enemyDie', this.o.rng.int(-80, 80), 0.8);
      // 自爆车死亡即炸
      if (e.def.explodeOnDeath) {
        const r = e.def.radius || 90;
        this.o.fx.blast(e.x, e.y, r);
        for (const p of this.players) {
          if (p.alive && dist2(p.x, p.y, e.x, e.y) <= (r + p.r) ** 2) this.hurtPlayer(p, e.def.explodeOnDeath * e.dmgMul, e.x, e.y, true);
        }
        const list = this.enemiesInRadius(e.x, e.y, r, this.q2);
        for (const o of list) if (o !== e) this.damageEnemy(o, e.def.explodeOnDeath * 0.5, by, false, 'blast');
      }
      if (e.elite && e.affix?.id === 'volatile') {
        this.o.fx.blast(e.x, e.y, 80);
        const list = this.enemiesInRadius(e.x, e.y, 80, this.q2);
        for (const o of list) if (o !== e) this.damageEnemy(o, 30 * e.dmgMul, by, false, 'blast');
      }
      this.pickups.push({
        alive: true, kind: 'xp', x: e.x, y: e.y,
        vx: this.o.rng.range(-30, 30), vy: this.o.rng.range(-30, 30),
        value: e.def.xp * (e.elite ? 5 : 1), t: 0,
        size: 3 + e.def.xp, color: '#9ad14f',
      });
      const gained = e.def.score * (e.elite ? 5 : 1);
      this.score += gained;

      // 磁力拾荒：掉落率
      if (by && by.kit.dropRate > 0 && this.o.rng.chance(by.kit.dropRate * CONFIG.cards.drops.base)) {
        this.dropSupply(e.x, e.y, this.o.rng.chance(0.5) ? 'repair' : 'bomb');
      }
    }
    void crit;
  }

  hurtPlayer(p: Player, dmg: number, x: number, y: number, charged: boolean): void {
    if (!p.alive || p.invuln > 0) return;
    if (this.o.cheat('god-mode') > 0) return;
    p.lastHurt = this.time;

    let d = dmg;
    const th = this.threatInfo();
    d *= 1; // 伤害倍率已在敌人构造时乘过
    d -= p.armorFlat;
    d *= 1 - Math.min(0.15, p.st.armor);
    if (p.desperate) d *= 1 - (p.sig.lowHpReduction ?? 0);
    // 反应装甲：受击后 0.6s 内的下一击减半
    if (p.reactT > 0) d *= CONFIG.cards.react.mul;
    if (p.flags.has('reactArmor')) p.reactT = CONFIG.cards.react.t;
    if (p.shield > 0) {
      p.shield -= 1;
      p.shieldCd = p.shieldRecharge;
      this.o.fx.shieldBreak(p.x, p.y, p.r * 1.5);
      this.o.audio.sfx('shieldBreak');
      this.reflectBurst(p);
      if (p.nova && p.shield === 0) {
        this.o.fx.ultNova(p.x, p.y);
        this.o.audio.sfx('nova');
        const list = this.enemiesInRadius(p.x, p.y, 320, this.q2);
        for (const e of list) this.damageEnemy(e, 120, p, false, 'nova');
        this.clearEnemyBullets(p.x, p.y, 320);
      }
      return;
    }

    // 单次受击上限：满血不被一击秒
    const cap = p.maxHp * (charged ? CONFIG.combat.maxChargedHitRatio : CONFIG.combat.maxHitRatio);
    d = Math.min(cap, d);
    if (d <= 0) return;

    p.hp -= d;
    p.invuln = CONFIG.combat.invuln;
    p.hurtFlash = 0.1;
    this.addText(p.x, p.y - p.r, `-${Math.round(d)}`, '#ff6b35', 14);
    this.o.fx.hit(p.x, p.y, '#ff6b35', false);
    this.o.fx.addShake('shakeHit');
    this.o.audio.sfx('hurt');
    this.o.rumble(0.5, 0.3, 100);
    this.reflectBurst(p);
    void th;
    void x;
    void y;

    if (p.hp <= 0) {
      p.hp = 0;
      this.downPlayer(p, false);
    }
  }

  /** 反射装甲：受伤时向四周弹片。 */
  private reflectBurst(p: Player): void {
    const n = p.kit.reflect;
    if (n <= 0) return;
    const arc = p.flags.has('reflectArc');
    for (let i = 0; i < n; i += 1) {
      const a = (Math.PI * 2 * i) / n;
      const b = this.makeBullet(p.x, p.y, a, CONFIG.cards.reflect.speed, p.st.dmg * p.kit.reflectDmg, false);
      b.owner = p.index;
      b.life = CONFIG.cards.reflect.life;
      b.pierce = p.kit.reflectPierce;
      b.color = arc ? '#9fd8ff' : '#f3ecdd';
      b.size = 3;
      b.shock = arc;
      if (arc) b.chain = 1;
      this.bullets.push(b);
    }
    this.o.fx.nova(p.x, p.y, p.r * 2.5);
    this.o.audio.sfx('shootHeavy', 0, 0.5);
  }

  private downPlayer(p: Player, revived: boolean): void {
    const others = this.players.filter((q) => q !== p);
    const mateAlive = others.some((q) => q.alive);
    if (others.length > 0 && mateAlive && !revived) {
      p.alive = false;
      p.downed = true;
      p.reviveT = CONFIG.combat.reviveTime;
      this.emit({ type: 'toast', text: `${p.name} 倒下 · 靠近救援` });
      return;
    }
    p.alive = false;
    p.downed = false;
    this.end(false);
  }

  /**
   * 倒地玩家。design（docs/levels.md 第 6 节）：队友贴近 48px 持续救援，
   * reviveT 从满值倒计时到 0 即救起；离开范围则缓慢回涨，逼玩家"守着他救"。
   * 不会流血死亡 —— 倒地的人在整局里都能被救回。
   */
  private updateDowned(p: Player, dt: number): void {
    const mate = this.players.find((q) => q !== p && q.alive);
    const inRange = !!mate && dist2(mate.x, mate.y, p.x, p.y) <= CONFIG.combat.reviveRadius ** 2;
    if (inRange) {
      p.reviveT -= dt;
      if (p.reviveT <= 0) {
        p.reviveT = 0;
        this.revive(p);
      }
    } else {
      p.reviveT = Math.min(CONFIG.combat.reviveTime, p.reviveT + dt * 0.6);
    }
  }

  /** 队友救援。 */
  tryRevive(): void {
    for (const p of this.players) {
      if (!p.downed || p.reviveT <= 0) continue;
      const mate = this.players.find((q) => q !== p && q.alive);
      if (!mate) continue;
      if (dist2(mate.x, mate.y, p.x, p.y) > CONFIG.combat.reviveRadius ** 2) continue;
      this.revive(p);
    }
  }

  private revive(p: Player): void {
    p.downed = false;
    p.alive = true;
    p.hp = Math.round(p.maxHp * CONFIG.combat.reviveHpRatio);
    p.invuln = 1;
    p.emergencyCharges = p.sig.emergencyCharges;
    this.justRevivedAt = this.time;
    this.emit({ type: 'toast', text: `${p.name} 被救起` });
    this.o.audio.sfx('evolve');
  }

  /** 最近一次救起的时间，供相机 afterRevive 用（main 读取）。 */
  justRevivedAt = -1;

  // ===================================================================
  // 拾取与危险区
  // ===================================================================

  private updatePickups(dt: number): void {
    for (const k of this.pickups) {
      if (!k.alive) continue;
      k.t += dt;
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      k.vx *= 1 - Math.min(1, dt * 3);
      k.vy *= 1 - Math.min(1, dt * 3);

      let nearest: Player | null = null;
      let bestD = Infinity;
      for (const p of this.players) {
        if (!p.alive) continue;
        const d = dist2(p.x, p.y, k.x, k.y);
        if (d < bestD) { bestD = d; nearest = p; }
      }
      if (!nearest) continue;
      const pull = nearest.st.pickup;
      if (bestD < pull * pull) {
        const a = Math.atan2(nearest.y - k.y, nearest.x - k.x);
        k.x += Math.cos(a) * 300 * dt;
        k.y += Math.sin(a) * 300 * dt;
      }
      if (bestD <= (nearest.r + k.size) ** 2) {
        k.alive = false;
        if (k.kind === 'xp') {
          this.addXp(k.value * (1 + nz(nearest.add.xpGain)) * (this.o.cheat('xp-rate') || 1));
          this.o.fx.pickup(k.x, k.y, nearest.x, nearest.y);
          this.o.audio.sfx('pickup', this.o.rng.int(-100, 100), 0.6);
        } else if (k.kind === 'repair') {
          nearest.hp = Math.min(nearest.maxHp, nearest.hp + k.value);
          this.addText(nearest.x, nearest.y - nearest.r, `+${Math.round(k.value)}`, '#9ad14f', 14);
          this.o.audio.sfx('evolve', 0, 0.5);
        } else {
          nearest.bombs = Math.min(CONFIG.combat.bombsMax, nearest.bombs + 1);
          this.o.audio.sfx('ui');
        }
        // 涡流吸附：拾取时震开周围敌人
        if (nearest.flags.has('pickupShock') && nearest.shockT <= 0) {
          nearest.shockT = 0.4;
          const list = this.enemiesInRadius(k.x, k.y, CONFIG.cards.pickupShock.r, this.q2);
          for (const e of list) this.damageEnemy(e, CONFIG.cards.pickupShock.dmg, nearest, false, 'shock');
          this.o.fx.nova(k.x, k.y, CONFIG.cards.pickupShock.r);
        }
        // 废料回收：掉落物变废铁
        if (nearest.flags.has('scrapDrop') && this.o.rng.chance(CONFIG.cards.scrapDrop.chance)) {
          this.bonusScrap += CONFIG.cards.scrapDrop.scrap;
          this.addText(k.x, k.y - 8, '+废铁', '#f2b13c', 11);
        }
      }
    }
    compact(this.pickups);
  }

  private updateHazards(dt: number): void {
    for (const pd of this.puddles) {
      if (!pd.alive) continue;
      pd.life -= dt;
      pd.tick -= dt;
      if (pd.life <= 0) { pd.alive = false; continue; }
      if (pd.tick > 0) continue;
      pd.tick = 0.35;
      const list = this.enemiesInRadius(pd.x, pd.y, pd.r, this.q2);
      for (const e of list) {
        this.damageEnemy(e, pd.dps * 0.35, undefined, false, 'fire');
        // 凝固配方：着火的敌人移动时拖火痕
        if (this.players.some((q) => q.flags.has('napalmTrail'))) e.burnT = 2;
      }
      this.world.burnAt(pd.x, pd.y, pd.r);
    }
    compact(this.puddles);

    for (const m of this.mines) {
      if (!m.alive) continue;
      m.life -= dt;
      if (m.life <= 0) { m.alive = false; continue; }
      const MK = CONFIG.cards.mine;

      // 磁吸：把附近的敌人拽过来
      if (m.homing) {
        const near = this.nearestEnemy(m.x, m.y, MK.trigger, false);
        if (near && !near.boss) {
          const d = Math.hypot(near.x - m.x, near.y - m.y) || 1;
          near.x += ((m.x - near.x) / d) * Math.min(d, 240 * dt);
          near.y += ((m.y - near.y) / d) * Math.min(d, 240 * dt);
        }
      }
      // 绊索：范围内的敌人被拖向雷并减速
      if (m.tether) {
        const near = this.enemiesInRadius(m.x, m.y, MK.tetherRange, this.q2);
        for (const e of near) {
          if (e.boss) continue;
          e.slow = Math.max(e.slow, MK.tetherSlow);
          e.slowT = 0.3;
          const d = Math.hypot(e.x - m.x, e.y - m.y) || 1;
          e.x += ((m.x - e.x) / d) * Math.min(d, 60 * dt);
          e.y += ((m.y - e.y) / d) * Math.min(d, 60 * dt);
        }
      }

      const list = this.enemiesInRadius(m.x, m.y, m.r, this.q2);
      if (list.length === 0) continue;
      const by = this.players[m.owner] ?? this.players[0];
      if (m.jump) {
        // 跳雷：弹起后再空爆
        m.alive = false;
        this.booms.push({
          alive: true, owner: m.owner, x: m.x, y: m.y,
          r: m.r, dmg: m.dmg, t: 0.28, slow: 0, puddle: 0, puddleLife: 0,
        });
        this.o.fx.nova(m.x, m.y, m.r);
        continue;
      }
      m.alive = false;
      for (const e of list) this.damageEnemy(e, m.dmg, by, false, 'mine');
      this.world.splash(m.x, m.y, m.r, m.dmg * 0.6, this.scratch);
      this.o.fx.blast(m.x, m.y, m.r);
      this.o.audio.sfx('mine');
    }
    compact(this.mines);

    for (const a of this.arcs) {
      if (!a.alive) continue;
      a.life -= dt;
      if (a.life <= 0) a.alive = false;
    }
    compact(this.arcs);
  }

  private addPuddle(x: number, y: number, r: number, dps: number, life: number): void {
    if (this.puddles.filter((p) => p.alive).length >= CONFIG.caps.puddles) return;
    this.puddles.push({ alive: true, x, y, r, dps, life, maxLife: life, tick: 0, wob: this.o.rng.next() * 6 });
  }

  private addText(x: number, y: number, text: string, color: string, size: number): void {
    if (this.o.setting('damage-numbers') === false) return;
    if (this.texts.filter((t) => t.alive).length >= CONFIG.caps.texts) this.texts.shift();
    this.texts.push({
      alive: true,
      x: x + this.o.rng.range(-6, 6),
      y,
      vy: -34,
      life: 0.75,
      maxLife: 0.75,
      text,
      color,
      size,
    });
  }

  private ring(x: number, y: number, r: number, color: string, life: number, width: number): void {
    if (this.rings.filter((r2) => r2.alive).length >= CONFIG.caps.rings) return;
    this.rings.push({ alive: true, x, y, r: 0, maxR: r, life, maxLife: life, color, width });
  }

  private clearEnemyBullets(x: number, y: number, r: number): void {
    for (const b of this.ebullets) {
      if (b.alive && dist2(b.x, b.y, x, y) <= r * r) b.alive = false;
    }
  }

  private pushTrack(p: Player): void {
    this.trackAcc[0] = (this.trackAcc[0] ?? 0) + Math.hypot(p.vx, p.vy) * 0.016;
    if ((this.trackAcc[0] ?? 0) < 9) return;
    this.trackAcc[0] = 0;
    if (this.tracks.filter((t) => t.alive).length >= CONFIG.caps.decals) return;
    this.tracks.push({
      alive: true, x: p.x, y: p.y, angle: p.angle,
      halfW: p.r * 0.62, life: 2.4, maxLife: 2.4,
    });
  }

  private onTileDestroyed(tx: number, ty: number, b: Bullet | null): void {
    const cx = tx * T + T / 2;
    const cy = ty * T + T / 2;
    this.o.fx.kill(cx, cy, 10, '#8a5c3a');
    this.o.audio.sfx('brick');
    const t = this.world.typeAt(tx, ty);
    if (t === TILE.building) {
      // 残楼倒塌：预警 0.6s 后砸下来（对双方都造成伤害）
      this.world.collapseWarn(this.world.idx(tx, ty), COLLAPSE.warn);
      this.ring(cx, cy, COLLAPSE.radius, '#ff6b35', COLLAPSE.warn, 2);
    }
    void b;
  }

  // ===================================================================
  // 刷怪
  // ===================================================================

  private updateSpawning(dt: number, inputs: PlayerInput[]): void {
    if (this.time > SPAWN_STOP) return;
    const quiet = this.time < this.quietUntil;
    const ph = this.phaseInfo();
    let rate = Math.min(SPAWN.max, SPAWN.base + this.time * SPAWN.perSecond);
    if (this.players.length > 1) rate *= SPAWN.twoPlayer / Math.max(1, this.players.length);
    if (quiet) rate *= SPAWN.quiet;
    rate = this.o.tuning.spawnRate(rate);
    void ph;

    this.spawnAcc += rate * dt;
    if (this.aliveEnemies >= this.aliveCap) {
      this.spawnAcc = Math.min(this.spawnAcc, 1);
      return;
    }

    let guard = 0;
    while (this.spawnAcc >= 1 && guard++ < 12) {
      this.spawnAcc -= 1;
      for (let i = 0; i < this.players.length; i += 1) {
        const p = this.players[i];
        if (!p) continue;
        const inp = inputs[i];
        const pos = this.spawnRingFor(p, inp);
        if (!pos) continue;
        const th = this.threatInfo();
        const elite = this.time > 70 && this.o.rng.chance(Math.min(0.2, th.elite));
        this.spawnEnemy(null, pos.x, pos.y, elite ? (this.threat >= 4 ? 2 : 1) : 0);
      }
    }
  }

  /** 按玩家分别刷环：分屏时绕中点刷会让两人都看不到敌人。 */
  private spawnRingFor(p: Player, inp: PlayerInput | undefined): { x: number; y: number } | null {
    const view = 900;
    const minR = view * 0.55 + 60;
    const maxR = minR + 180;
    const pos = this.world.findSpawn(p.x, p.y, minR, maxR, 26, p.tank.amphibious);
    if (!pos) return null;
    for (const q of this.players) {
      if (!q.alive) continue;
      if (dist2(pos.x, pos.y, q.x, q.y) < 280 ** 2) return null;
    }
    void inp;
    return pos;
  }

  // ===================================================================
  // 事件：波次、BOSS、补给、地形节点
  // ===================================================================

  private updateEvents(dt: number): void {
    // 波次
    if (this.time >= this.nextWave && this.time < BOSS_FINAL - 10) {
      this.nextWave += 30;
      this.waveIndex += 1;
      const node = this.waveNode(this.waveIndex);
      if (node) this.runWave(node);
      else {
        const label = ['装甲纵队', '炮手分队', '混合编队', '重装推进', '焦土攻势'][Math.min(4, Math.floor(this.waveIndex / 3))]!;
        this.emit({ type: 'toast', text: `第 ${this.waveIndex} 波 · ${label}` });
        const pack = Math.min(24, 6 + this.waveIndex * 2);
        this.dropPack(pack, null);
      }
      this.emit({ type: 'wave', index: this.waveIndex });
    }

    // BOSS
    if (!this.bossSpawned[0] && this.time >= BOSS_FIRST) {
      this.bossSpawned[0] = true;
      this.spawnBoss(false);
      this.emit({ type: 'toast', text: 'BOSS · 铁壁' });
      this.o.audio.sfx('bossPhase');
    }
    if (!this.bossSpawned[1] && this.time >= BOSS_FINAL) {
      this.bossSpawned[1] = true;
      this.spawnBoss(true);
      this.emit({ type: 'toast', text: 'FINAL · 终焉要塞 MK-II' });
      this.o.audio.sfx('bossPhase');
    }

    // 补给
    if (this.suppliesLeft.length > 0 && this.time >= (this.suppliesLeft[0] ?? Infinity)) {
      this.suppliesLeft.shift();
      const p = this.players[0]!;
      const pos = this.world.randomFreePoint(p.x, p.y, 160, p.tank.amphibious);
      this.dropSupply(pos.x, pos.y, 'repair');
      const pos2 = this.world.randomFreePoint(pos.x, pos.y, 120, p.tank.amphibious);
      this.dropSupply(pos2.x, pos2.y, 'bomb');
      this.emit({ type: 'toast', text: '补给已投放 · 白十字回血 / 黄点加炸弹' });
    }

    // 地形节点
    const node = this.world.dueNode(this.time);
    if (node) this.runTerrainNode(node);

    void dt;
  }

  private waveNode(index: number): WaveNode | null {
    const at = index * 30;
    for (const w of WAVES) if (w.at === at) return w;
    return null;
  }

  private runWave(node: WaveNode): void {
    this.emit({ type: 'toast', text: `第 ${this.waveIndex} 波 · ${node.name}` });
    if (node.formation === 'quiet') {
      this.quietUntil = this.time + (node.quietFor ?? 20);
      this.emit({ type: 'toast', text: '静默 · 捡经验补炸弹' });
      return;
    }
    const elite = node.eliteFrom !== undefined && this.threat >= node.eliteFrom;
    this.dropPack(node.count, elite && node.eliteSet ? node.eliteSet : node.set ?? null, elite);
  }

  private dropPack(count: number, set: Partial<Record<EnemyId, number>> | null, eliteChance = false): void {
    const p = this.players[0] ?? this.players[0];
    for (let i = 0; i < count; i += 1) {
      const pos = this.spawnRingFor(p, undefined) ?? this.world.randomFreePoint(p.x, p.y, 300, false);
      let type: EnemyId | null = null;
      if (set) {
        let total = 0;
        for (const w of Object.values(set)) total += w ?? 0;
        let roll = this.o.rng.next() * total;
        for (const [id, w] of Object.entries(set)) {
          roll -= w ?? 0;
          if (roll <= 0) { type = id as EnemyId; break; }
        }
      }
      this.spawnEnemy(type, pos.x, pos.y, eliteChance && this.o.rng.chance(0.4) ? 1 : 0);
    }
  }

  private runTerrainNode(node: TerrainNode): void {
    this.emit({ type: 'toast', text: `${node.name} · ${node.telegraph}` });
    const p = this.players[0]!;
    switch (node.kind) {
      case 'grassAmbush': {
        for (let i = 0; i < node.count; i += 1) {
          const spots = this.findGrassSpots(p.x, p.y, 200, 460, 6);
          const s = spots[i % spots.length] ?? this.world.findSpawn(p.x, p.y, 260, 420, 20, false);
          if (s) this.spawnEnemy('grunt', s.x, s.y, 0);
        }
        break;
      }
      case 'scorchedPush': {
        this.dropPack(node.count, null, false);
        for (let i = 0; i < 10; i += 1) {
          const a = this.o.rng.angle();
          this.world.burnAt(p.x + Math.cos(a) * 300, p.y + Math.sin(a) * 300, 80);
          this.addPuddle(p.x + Math.cos(a) * 300, p.y + Math.sin(a) * 300, 40, 6, 3);
        }
        break;
      }
      case 'iceRush': {
        for (let i = 0; i < node.count; i += 1) {
          const pos = this.world.findSpawn(p.x, p.y, 500, 700, 24, true);
          if (pos) {
            const e = this.spawnEnemy('scout', pos.x, pos.y, 0);
            if (e) e.speed *= 1.4;
          }
        }
        break;
      }
      case 'riverFlank': {
        for (let i = 0; i < node.count; i += 1) {
          const bank = this.world.riverBankPoint();
          const pos = bank ?? this.world.findSpawn(p.x, p.y, 400, 600, 24, true);
          if (pos) this.spawnEnemy(i < 6 ? 'scout' : 'bomber', pos.x, pos.y, 0);
        }
        break;
      }
      case 'bridgeCollapse': {
        for (const i of this.world.bridges) {
          const tx = i % this.world.cols;
          const ty = Math.floor(i / this.world.cols);
          if (this.world.typeAt(tx, ty) === TILE.bridge) this.world.damage(tx, ty, 99999);
          this.o.fx.blast(tx * T + T / 2, ty * T + T / 2, 50);
        }
        this.o.audio.sfx('bomb');
        this.dropPack(8, { grunt: 1 }, false);
        break;
      }
      case 'buildingFall': {
        const list = this.world.buildings.slice(0, 12);
        for (const i of list) {
          const tx = i % this.world.cols;
          const ty = Math.floor(i / this.world.cols);
          if (this.world.typeAt(tx, ty) !== TILE.building) continue;
          this.world.damage(tx, ty, 99999);
          this.collapseAt(tx, ty);
        }
        break;
      }
      default:
        break;
    }
  }

  /** 残楼倒塌：范围伤害对双方都算。 */
  private collapseAt(tx: number, ty: number): void {
    const cx = tx * T + T / 2;
    const cy = ty * T + T / 2;
    const r = COLLAPSE.radius;
    for (const p of this.players) {
      if (p.alive && dist2(p.x, p.y, cx, cy) <= (r + p.r) ** 2) this.hurtPlayer(p, COLLAPSE.dmg, cx, cy, true);
    }
    const list = this.enemiesInRadius(cx, cy, r, this.q2);
    for (const e of list) this.damageEnemy(e, COLLAPSE.dmg, undefined, false, 'collapse');
    this.o.fx.blast(cx, cy, r);
    this.o.fx.addShake('shakeBoss');
    this.o.audio.sfx('bomb', 0, 0.8);
    // 连锁：砸中相邻残楼
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]] as const) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (!this.world.inBounds(nx, ny)) continue;
      if (this.world.typeAt(nx, ny) !== TILE.building) continue;
      const i = this.world.idx(nx, ny);
      this.world.hp[i] -= COLLAPSE.chainHpLoss;
      if (this.world.hp[i] <= 0) {
        this.world.damage(nx, ny, 99999);
        this.collapseAt(nx, ny);
      }
    }
  }

  private findGrassSpots(x: number, y: number, minR: number, maxR: number, want: number): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    let guard = 0;
    while (out.length < want && guard++ < 200) {
      const a = this.o.rng.angle();
      const rr = this.o.rng.range(minR, maxR);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (px < 60 || py < 60 || px > this.world.w - 60 || py > this.world.h - 60) continue;
      if (!this.world.inGrass(px, py)) continue;
      out.push({ x: px, y: py });
    }
    return out;
  }

  private dropSupply(x: number, y: number, kind: 'repair' | 'bomb'): void {
    this.pickups.push({
      alive: true, kind, x, y, vx: 0, vy: 0,
      value: kind === 'repair' ? 30 : 1, t: 0, size: 9,
      color: kind === 'repair' ? '#9ad14f' : '#f2b13c',
    });
  }

  // ===================================================================
  // 成长与卡池
  // ===================================================================

  addXp(amount: number): void {
    this.xp += amount;
    let guard = 0;
    while (this.xp >= this.xpNeedNow && guard++ < 10) {
      this.xp -= this.xpNeedNow;
      this.level += 1;
      this.xpNeedNow = this.o.tuning.xpNeed(this.level);
      this.pendingLevels += 1;
    }
    if (this.pendingLevels > 0 && this.offers.length === 0) this.openLevelup();
  }

  private openLevelup(): void {
    if (this.picksMade > 0) this.pity += 1;
    this.offers = this.rollOffers();
    this.pendingLevels -= 1;
    this.o.fx.levelup(this.players[0]?.x ?? 0, this.players[0]?.y ?? 0);
    this.o.audio.sfx('levelup');
    this.emit({ type: 'levelup', offers: this.offers, level: this.level });
  }

  /** 可以拿的新装置（没拥有过的）。 */
  private newPool(): CardDef[] {
    const canProto = this.time >= CARD_RULES.prototypeAfter && this.prototypesTaken < CARD_RULES.maxPrototypes;
    return CARDS.filter((c) => {
      if (this.owned.has(c.id)) return false;
      if (c.rarity === 'prototype' && !canProto) return false;
      return true;
    });
  }

  /** 可以改装的卡：拥有、没选过方向，且拿到之后至少又选过 2 次卡。 */
  private upgradePool(): CardDef[] {
    const out: CardDef[] = [];
    for (const [id, branchId] of this.owned) {
      if (branchId) continue;
      const card = CARD_BY_ID.get(id);
      if (!card || card.branches.length === 0) continue;
      // 先拿到、用一会儿，再谈改装
      if (this.picksMade - (this.ownedAt.get(id) ?? 0) < 2) continue;
      out.push(card);
    }
    return out;
  }

  private makeNewOffer(card: CardDef): CardOffer {
    return { card, branches: [], isUpgrade: false, ownedBranch: null };
  }

  private makeUpgradeOffer(card: CardDef): CardOffer {
    const pool = card.branches.slice();
    // 3 个方向里随机展示 2 个（白卡本来就只有 2 个）
    const shown: CardBranch[] = [];
    while (shown.length < CARD_RULES.shownBranches && pool.length > 0) {
      const i = this.o.rng.int(0, pool.length - 1);
      shown.push(pool.splice(i, 1)[0]!);
    }
    return { card, branches: shown, isUpgrade: true, ownedBranch: this.owned.get(card.id) ?? null };
  }

  /** 抽 3 张：至少 1 张新装置 + 至少 1 张改装，其余按稀有度权重。 */
  private rollOffers(): CardOffer[] {
    const news = this.newPool();
    const ups = this.upgradePool();
    const supply: CardOffer = { card: SUPPLY_CARD, branches: [], isUpgrade: false, ownedBranch: null };
    if (news.length === 0 && ups.length === 0) return [supply];

    const tagCount = new Map<CardTag, number>();
    for (const [id] of this.owned) {
      const c = CARD_BY_ID.get(id);
      if (c) tagCount.set(c.tag, (tagCount.get(c.tag) ?? 0) + 1);
    }
    const weightOf = (c: CardDef): number => {
      let w = RARITY_WEIGHT[c.rarity];
      if ((tagCount.get(c.tag) ?? 0) >= CARD_RULES.sameTagAt) w *= CARD_RULES.sameTagMul;
      return w * this.o.tuning.offerQuality(1);
    };

    const picks: CardOffer[] = [];
    const used = new Set<string>();

    const takeNew = (only?: (c: CardDef) => boolean): CardOffer | null => {
      let total = 0;
      for (const c of news) {
        if (used.has(c.id) || (only && !only(c))) continue;
        total += weightOf(c);
      }
      if (total <= 0) return null;
      let roll = this.o.rng.next() * total;
      for (const c of news) {
        if (used.has(c.id) || (only && !only(c))) continue;
        roll -= weightOf(c);
        if (roll <= 0) {
          used.add(c.id);
          return this.makeNewOffer(c);
        }
      }
      return null;
    };

    const takeUp = (): CardOffer | null => {
      const avail = ups.filter((c) => !used.has(c.id));
      if (avail.length === 0) return null;
      const c = avail[this.o.rng.int(0, avail.length - 1)]!;
      used.add(c.id);
      return this.makeUpgradeOffer(c);
    };

    // 保底：连续 N 次没见金/红 → 这一次必给一张
    if (this.pity > CARD_RULES.pityEvery) {
      const forced = takeNew((c) => c.rarity === 'rare' || c.rarity === 'prototype');
      if (forced) picks.push(forced);
    }

    // 保证两类各有一张
    if (!picks.some((o) => !o.isUpgrade) && news.length > 0) {
      const o = takeNew();
      if (o) picks.push(o);
    }
    if (!picks.some((o) => o.isUpgrade) && ups.length > 0) {
      const o = takeUp();
      if (o) picks.push(o);
    }

    // 补满
    let guard = 0;
    while (picks.length < CONFIG.offers && guard++ < 20) {
      const both = news.length > 0 && ups.length > 0;
      const wantNew = !both || this.o.rng.next() < 0.6;
      const o = wantNew ? takeNew() ?? takeUp() : takeUp() ?? takeNew();
      if (!o) break;
      picks.push(o);
    }

    // 至少两个不同类别
    if (picks.length > 1 && new Set(picks.map((o) => o.card.tag)).size < 2) {
      const first = picks[0]!.card.tag;
      const alt = news.find((c) => !used.has(c.id) && c.tag !== first);
      if (alt) {
        used.add(alt.id);
        picks[picks.length - 1] = this.makeNewOffer(alt);
      }
    }

    // 见到金/红就重置保底
    if (picks.some((o) => o.card.rarity === 'rare' || o.card.rarity === 'prototype')) this.pity = 0;

    return picks.length > 0 ? picks : [supply];
  }

  /** 选一张卡（改装时带方向 id）。返回 'more'（还有待选）或 'resume'。 */
  choose(cardId: string, branchId?: string): 'more' | 'resume' | 'ignore' {
    if (this.offers.length === 0) return 'ignore';
    const offer = this.offers.find((c) => c.card.id === cardId);
    if (!offer) return 'ignore';

    let branch: CardBranch | null = null;
    if (offer.isUpgrade) {
      branch = offer.branches.find((b) => b.id === branchId) ?? offer.branches[0] ?? null;
      if (!branch) return 'ignore';
    }
    this.applyOffer(offer, branch);

    this.offers = [];
    if (this.pendingLevels > 0) {
      this.openLevelup();
      return 'more';
    }
    return 'resume';
  }

  private applyOffer(offer: CardOffer, branch: CardBranch | null): void {
    const card = offer.card;
    this.picksMade += 1;

    if (card.id === SUPPLY_CARD.id) {
      for (const p of this.players) {
        p.hp = Math.min(p.maxHp, p.hp + 25);
        p.bombs = Math.min(CONFIG.combat.bombsMax, p.bombs + 1);
      }
      return;
    }

    if (!offer.isUpgrade) {
      this.owned.set(card.id, null);
      this.ownedAt.set(card.id, this.picksMade);
      if (card.rarity === 'prototype') {
        this.prototypesTaken += 1;
        this.o.fx.ultRing(this.players[0]?.x ?? 0, this.players[0]?.y ?? 0, 90);
        this.o.audio.sfx('evolve');
        this.emit({ type: 'toast', text: `原型 · ${card.name}` });
      }
    } else if (branch) {
      this.owned.set(card.id, branch.id);
      this.emit({ type: 'toast', text: `${card.name} · ${branch.name}` });
    }

    const src = branch ?? card;
    for (const p of this.players) {
      mergeAdd(p.add, src.add);
      mergeMul(p.mul, src.mul);
      if (src.flags) for (const f of src.flags) p.flags.add(f);
      this.recalc(p);
    }
  }

  reroll(): boolean {
    if (this.rerollsLeft <= 0 || this.offers.length === 0) return false;
    this.rerollsLeft -= 1;
    this.offers = this.rollOffers();
    this.emit({ type: 'levelupMore', offers: this.offers, level: this.level });
    this.o.audio.sfx('ui');
    return true;
  }

  /** 换坦克等级后刷新签名阶段（机库 → 开局时调用）。 */
  setSigIndex(p: Player, idx: number): void {
    p.sigIndex = clamp(idx, 1, 4);
    p.sig = signatureOf(p.tank, p.sigIndex);
    this.recalc(p);
  }

  // ===================================================================
  // 结束
  // ===================================================================

  private checkEnd(): void {
    if (this.ended) return;
    const anyAlive = this.players.some((p) => p.alive);
    const anyDown = this.players.some((p) => p.downed);
    if (!anyAlive && !anyDown) this.end(false);
  }

  private end(win: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.over = !win;
    this.won = win;
    this.o.audio.sfx(win ? 'win' : 'lose');
    this.emit({ type: win ? 'win' : 'over', data: this.summary() });
  }

  summary(): RunSummary {
    const scrap =
      scrapFor(this.kills, this.time, this.bosses, this.won, this.threat, false) + this.bonusScrap;
    return {
      time: this.time,
      kills: this.kills,
      level: this.level,
      score: scoreFor(this.time, this.level, this.kills, this.won),
      scrap,
      win: this.won,
      bosses: this.bosses,
      perPlayer: this.players.map((p) => p.kills),
    };
  }

  private nearestAlivePlayer(x: number, y: number): Player | null {
    let best: Player | null = null;
    let bd = Infinity;
    for (const p of this.players) {
      if (!p.alive) continue;
      const d = dist2(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /** 残影优先于玩家（回声 Ⅲ 的伪嘲讽）。 */
  private decoyFor(e: Enemy): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (const p of this.players) {
      if (p.decoyT <= 0) continue;
      const d = dist2(e.x, e.y, p.decoyX, p.decoyY);
      if (d < bd && d < 320 ** 2) { bd = d; best = { x: p.decoyX, y: p.decoyY }; }
    }
    return best;
  }

  /** 敌方子弹打到了哪个玩家。 */
  private playerHitBy(b: Bullet): Player | null {
    for (const p of this.players) {
      if (!p.alive) continue;
      if (dist2(p.x, p.y, b.x, b.y) <= (p.r + b.size) ** 2) return p;
    }
    return null;
  }

  /** "指挥官"词缀：附近有活着的指挥官时得到的增伤比例。 */
  private commanderBonusNear(e: Enemy): number {
    let best = 0;
    for (const c of this.enemies) {
      if (c === e || !c.alive || c.dead) continue;
      const isCmd = c.affix?.id === 'commander' || c.affix2?.id === 'commander';
      if (!isCmd) continue;
      if (dist2(e.x, e.y, c.x, c.y) <= 240 ** 2) {
        best = Math.max(best, c.affix?.id === 'commander' ? (c.affix?.aura ?? 0) : (c.affix2?.aura ?? 0));
      }
    }
    return best;
  }

  private emit(e: GameEvent): void {
    this.o.onEvent(e);
  }

  /** 调试：按类别发 n 张（?debug 与自动化测试用）。 */
  debugGive(tag: CardTag, n: number): void {
    const cards = CARDS.filter((c) => c.tag === tag).slice(0, n);
    for (const c of cards) this.applyOffer(this.makeNewOffer(c), null);
  }
}

// ===================================================================
// 小工具
// ===================================================================

function mergeAdd(target: Add, src: Add | undefined): void {
  if (!src) return;
  for (const k of Object.keys(src) as (keyof Add)[]) {
    (target[k] as number) = (target[k] ?? 0) + (src[k] ?? 0);
  }
}

function mergeMul(target: Mul, src: Mul | undefined): void {
  if (!src) return;
  for (const k of Object.keys(src) as (keyof Mul)[]) {
    (target[k] as number) = (target[k] ?? 1) * (src[k] ?? 1);
  }
}

function compact<T extends { alive: boolean }>(arr: T[]): void {
  let n = 0;
  for (let i = 0; i < arr.length; i += 1) {
    const it = arr[i]!;
    if (it.alive) arr[n++] = it;
  }
  arr.length = n;
}

function clearPool<T extends { alive: boolean }>(arr: T[]): void {
  for (const it of arr) it.alive = false;
  arr.length = 0;
}

function dist2(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy;
}

function shortAngle(to: number, from: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function nz(v: number | undefined): number {
  return v ?? 0;
}

function nzp(v: number | undefined): number {
  return v ?? 1;
}
