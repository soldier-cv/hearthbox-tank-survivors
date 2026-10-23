/**
 * 技能卡 v2（docs/cards-v2.md）。
 *
 * 结构变了：不再是"5 流派 × 4 级 + 终极"，而是 **装置 + 互斥改装方向**。
 * 一张卡最多拿两次：基础一次，改装一次（从 2–3 个方向里选 1，永久互斥）。
 *
 * 稀有度只决定出现频率与构筑角色，**不是强度阶梯**（见 docs/cards-v2.md 第 3 节）。
 */

import type { CardAxis, CardTag, Rarity } from '../config';

/** 加性修饰（伤害、数量、半径…累加）。 */
export interface Add {
  dmg?: number;
  projectiles?: number;
  pierce?: number;
  bulletSpeed?: number;
  range?: number;
  /** 最小射程：贴太近打不到（长管炮）。 */
  minRange?: number;
  blastRadius?: number;
  puddleDps?: number;
  chainTargets?: number;
  drones?: number;
  teslaChain?: number;
  mines?: number;
  maxHp?: number;
  armorFlat?: number;
  regen?: number;
  shieldMax?: number;
  critAdd?: number;
  critMulAdd?: number;
  pickup?: number;
  /** 掉落率加成（0..1）。 */
  dropRate?: number;
  xpGain?: number;
  spread?: number;
  railgun?: number;
  radial?: number;
  nova?: number;
  chainBlast?: number;
  /** 反射装甲弹片数。 */
  reflect?: number;
  /** 反射弹片穿透。 */
  reflectPierce?: number;
  /** 引力井。 */
  wells?: number;
  /** 哨戒炮台。 */
  turrets?: number;
  /** 导弹齐射数量。 */
  missiles?: number;
  /** 时停核心。 */
  stops?: number;
  /** 热量上限（超载核心）。 */
  heatMax?: number;
  /** 减速比例（冷媒 / 冰霜）。 */
  chill?: number;
  /** 锥形喷射（冷媒喷口）。 */
  cone?: number;
  /** 被减速目标受到的额外伤害比例。 */
  frostVuln?: number;
  /** 周围减速光环比例（时间膨胀）。 */
  auraSlow?: number;
  /** 磁暴场。 */
  storm?: number;
  /** 弹跳次数。 */
  bounce?: number;
  /** 破片手雷数量。 */
  grenades?: number;
  /** 燃油弹。 */
  napalm?: number;
  /** 冲刺充能次数。 */
  dashCharges?: number;
}

/** 乘性修饰（间隔、速度…相乘）。 */
export interface Mul {
  interval?: number;
  speed?: number;
  dmg?: number;
  range?: number;
  spread?: number;
  bulletSpeed?: number;
  dashCd?: number;
  shieldRecharge?: number;
  mineCd?: number;
  teslaCd?: number;
  droneCd?: number;
  falloff?: number;
  blastRadius?: number;
  blastDmg?: number;
  wallDmg?: number;
  chainDmg?: number;
  droneDmg?: number;
  mineDmg?: number;
  teslaDmg?: number;
  napalmCd?: number;
  napalmR?: number;
  napalmDps?: number;
  napalmLife?: number;
  grenadeCd?: number;
  grenadeR?: number;
  missileCd?: number;
  missileDmg?: number;
  turretCd?: number;
  stormCd?: number;
  stormDmg?: number;
  stopCd?: number;
  stopDur?: number;
  auraR?: number;
  heatRate?: number;
  reflectDmg?: number;
  coneCd?: number;
  coneR?: number;
  coneDmg?: number;
}

/** 标记：改变行为，不只是数值。 */
export type Flag =
  | 'noSpread'
  | 'lockCrit'
  | 'heavyShot'
  | 'decoy'
  | 'dashBurst'
  | 'slowChain'
  | 'markBonus'
  | 'swarmStrike'
  | 'focusFire'
  | 'doubleBlast'
  | 'chainEliteImmune'
  | 'railWall'
  // ---- v2 ----
  /** 穿墙。 */
  | 'pierceWall'
  /** 无视护甲。 */
  | 'pierceArmor'
  /** 跳弹后分裂。 */
  | 'bounceFrag'
  /** 着火敌人拖火痕。 */
  | 'napalmTrail'
  /** 燃油弹改短距直喷。 */
  | 'napalmJet'
  /** 电磁链改电极柱。 */
  | 'teslaPillar'
  /** 电击附带感电。 */
  | 'teslaVuln'
  /** 地雷吸附。 */
  | 'mineHoming'
  | 'mineJump'
  | 'mineTether'
  /** 冲刺带残影伤害。 */
  | 'phaseDash'
  | 'dashSlow'
  /** 战斗中也能回血。 */
  | 'regenCombat'
  | 'regenLow'
  /** 反应装甲：受击后短时间减伤。 */
  | 'reactArmor'
  | 'regenShare'
  /** 应急维修包：定时回血。 */
  | 'medPack'
  | 'medFast'
  | 'medShare'
  | 'reflectArc'
  /** 冻结定身。 */
  | 'freezeRoot'
  | 'wellSingularity'
  | 'wellInert'
  | 'stormArc'
  | 'droneShield'
  | 'droneMissile'
  | 'missileBlast'
  | 'turretHeavy'
  | 'turretSmart'
  | 'railCard'
  | 'railOverload'
  | 'railFast'
  | 'heatCool'
  | 'heatRedline'
  | 'stopShort'
  | 'stopLong'
  | 'grenadeAir'
  | 'pickupShock'
  | 'scrapDrop';

/** 一个改装方向。 */
export interface CardBranch {
  id: string;
  name: string;
  /** 卡面上显示的一行变化（必须写出代价）。 */
  desc: string;
  add?: Add;
  mul?: Mul;
  flags?: Flag[];
}

export interface CardDef {
  id: string;
  name: string;
  rarity: Rarity;
  tag: CardTag;
  axis: CardAxis;
  /** 基础效果。 */
  desc: string;
  add?: Add;
  mul?: Mul;
  flags?: Flag[];
  /** 改装方向：白卡 2 个，其余 3 个。 */
  branches: CardBranch[];
}

export const CARDS: CardDef[] = [
  // ===================================================================
  // 白 · 常规（8）
  // ===================================================================
  {
    id: 'gun-cal',
    name: '主炮校准',
    rarity: 'common',
    tag: 'direct',
    axis: 'mid',
    desc: '伤害 +5，射速 +9%。',
    add: { dmg: 5 },
    mul: { interval: 1 / 1.09 },
    branches: [
      {
        id: 'gun-cal-steady',
        name: '稳压装填',
        desc: '射速再 +12%，散布 −30%。',
        mul: { interval: 1 / 1.12, spread: 0.7 },
      },
      {
        id: 'gun-cal-hammer',
        name: '重锤弹',
        desc: '伤害再 +6，弹速 −10%，命中击退。',
        add: { dmg: 6 },
        mul: { bulletSpeed: 0.9 },
        flags: ['heavyShot'],
      },
    ],
  },
  {
    id: 'twin-gun',
    name: '双联炮',
    rarity: 'common',
    tag: 'direct',
    axis: 'mid',
    desc: '并联 +1 发，散布 ±4°。',
    add: { projectiles: 1, spread: 4 },
    branches: [
      {
        id: 'twin-gun-four',
        name: '四联',
        desc: '并联再 +2（总 4），散布 ±9°。',
        add: { projectiles: 2, spread: 5 },
      },
      {
        id: 'twin-gun-focus',
        name: '收束',
        desc: '并联 −1，单发伤害 ×1.6，散布归零。',
        add: { projectiles: -1 },
        mul: { dmg: 1.6 },
        flags: ['noSpread'],
      },
    ],
  },
  {
    id: 'he-charge',
    name: '高爆装药',
    rarity: 'common',
    tag: 'area',
    axis: 'mid',
    desc: '命中爆炸，半径 34，波及 60% 伤害。',
    add: { blastRadius: 34 },
    branches: [
      {
        id: 'he-frag',
        name: '破片衬层',
        desc: '爆炸半径 +20，对砖墙 ×1.4。',
        add: { blastRadius: 20 },
        mul: { wallDmg: 1.4 },
      },
      {
        id: 'he-conc',
        name: '集中装药',
        desc: '半径 −30%，爆炸伤害 ×1.55。',
        mul: { blastRadius: 0.7, blastDmg: 1.55 },
      },
    ],
  },
  {
    id: 'frag-grenade',
    name: '破片手雷',
    rarity: 'common',
    tag: 'area',
    axis: 'mid',
    desc: '每 6s 向前抛一颗：落点 220，半径 70，80 伤。',
    add: { grenades: 1 },
    branches: [
      {
        id: 'frag-air',
        name: '空爆',
        desc: '改成空中起爆：无视地形阻挡，半径 +20%。',
        mul: { grenadeR: 1.2 },
        flags: ['grenadeAir'],
      },
      {
        id: 'frag-twin',
        name: '双联投掷',
        desc: '每次抛 2 颗（±40px），冷却 +15%。',
        add: { grenades: 1 },
        mul: { grenadeCd: 1.15 },
      },
    ],
  },
  {
    id: 'coolant-jet',
    name: '冷媒喷口',
    rarity: 'common',
    tag: 'control',
    axis: 'near',
    desc: '近距扇形 135px：减速 30%，伤害 0.45×。',
    add: { cone: 1, chill: 0.3 },
    branches: [
      {
        id: 'coolant-deep',
        name: '深冷',
        desc: '减速提到 50%，持续 2s。',
        add: { chill: 0.2 },
      },
      {
        id: 'coolant-high',
        name: '高压',
        desc: '范围 +50%，伤害 ×1.35，冷却 +20%。',
        mul: { coneR: 1.5, coneDmg: 1.35, coneCd: 1.2 },
      },
    ],
  },
  {
    id: 'composite-armor',
    name: '复合装甲',
    rarity: 'common',
    tag: 'survive',
    axis: 'self',
    desc: '血上限 +18，受到的所有伤害 −1.5。',
    add: { maxHp: 18, armorFlat: 1.5 },
    branches: [
      {
        id: 'armor-layer',
        name: '夹层结构',
        desc: '血上限再 +18，移速 −3%。',
        add: { maxHp: 18 },
        mul: { speed: 0.97 },
      },
      {
        id: 'armor-react',
        name: '反应装甲',
        desc: '受击后 0.6s 内下一击 −50%。',
        flags: ['reactArmor'],
      },
    ],
  },
  {
    id: 'repair-kit',
    name: '应急维修包',
    rarity: 'common',
    tag: 'survive',
    axis: 'self',
    desc: '每 30s 自动回 15 血（战斗中也会回）。',
    flags: ['medPack'],
    branches: [
      {
        id: 'repair-fast',
        name: '快速投放',
        desc: '改成 20s 一次，回 12。',
        flags: ['medFast'],
      },
      {
        id: 'repair-share',
        name: '战地共享',
        desc: '双人时同伴也回 66%。',
        flags: ['medShare'],
      },
    ],
  },
  {
    id: 'scavenger',
    name: '磁力拾荒',
    rarity: 'common',
    tag: 'economy',
    axis: 'self',
    desc: '拾取范围 +60%，掉落率 +10%。',
    add: { pickup: 60, dropRate: 0.1 },
    branches: [
      {
        id: 'scav-vortex',
        name: '涡流吸附',
        desc: '拾取范围再 +80%，拾取时震开 100px 内敌人。',
        add: { pickup: 80 },
        flags: ['pickupShock'],
      },
      {
        id: 'scav-scrap',
        name: '废料回收',
        desc: '掉落物 12% 变废铁（局外资源）。',
        add: { dropRate: 0.12 },
        flags: ['scrapDrop'],
      },
    ],
  },

  // ===================================================================
  // 绿 · 精制（8）
  // ===================================================================
  {
    id: 'ap-round',
    name: '穿甲弹',
    rarity: 'refined',
    tag: 'direct',
    axis: 'mid',
    desc: '穿透 +1，弹速 +70，伤害 +2。',
    add: { pierce: 1, bulletSpeed: 70, dmg: 2 },
    branches: [
      {
        id: 'ap-through',
        name: '贯穿',
        desc: '穿透 +2，穿透衰减 0.85。',
        add: { pierce: 2 },
        mul: { falloff: 0.85 / 0.7 },
      },
      {
        id: 'ap-wall',
        name: '穿墙',
        desc: '子弹穿过砖墙与残楼，穿透 −1。',
        add: { pierce: -1 },
        flags: ['pierceWall'],
      },
      {
        id: 'ap-armor',
        name: '破甲',
        desc: '穿透 +1，无视正面减伤，对护盾伤害 ×2。',
        add: { pierce: 1 },
        flags: ['pierceArmor'],
      },
    ],
  },
  {
    id: 'bounce-round',
    name: '弹跳弹',
    rarity: 'refined',
    tag: 'direct',
    axis: 'mid',
    desc: '命中或撞墙后反弹 1 次，不掉伤害。',
    add: { bounce: 1 },
    branches: [
      {
        id: 'bounce-master',
        name: '跳弹专精',
        desc: '反弹 2 次，反弹后伤害仍不衰减。',
        add: { bounce: 1 },
      },
      {
        id: 'bounce-frag',
        name: '破片跳弹',
        desc: '反弹时分裂 2 发（50% 伤害）。',
        flags: ['bounceFrag'],
      },
    ],
  },
  {
    id: 'napalm',
    name: '燃油弹',
    rarity: 'refined',
    tag: 'area',
    axis: 'mid',
    desc: '每 4.5s 抛射：落点延迟 0.45s，留 3s 火池（8dps）。',
    add: { napalm: 1 },
    branches: [
      {
        id: 'napalm-wide',
        name: '广域焦土',
        desc: '火池半径 +60%，DPS −25%。',
        mul: { napalmR: 1.6, napalmDps: 0.75 },
      },
      {
        id: 'napalm-sticky',
        name: '凝固配方',
        desc: '持续 6s；着火敌人移动时拖火痕。',
        mul: { napalmLife: 2 },
        flags: ['napalmTrail'],
      },
      {
        id: 'napalm-jet',
        name: '高压喷流',
        desc: '改为 220px 短距直喷，无飞行延迟，冷却 −30%。',
        mul: { napalmCd: 0.7 },
        flags: ['napalmJet'],
      },
    ],
  },
  {
    id: 'tesla',
    name: '电磁链',
    rarity: 'refined',
    tag: 'control',
    axis: 'mid',
    desc: '每 2.8s 电击最近敌人，连锁 3 个。',
    add: { teslaChain: 3 },
    branches: [
      {
        id: 'tesla-more',
        name: '增链',
        desc: '连锁 5 个，每跳 −10% 伤害。',
        add: { teslaChain: 2 },
        mul: { teslaDmg: 1.1 },
      },
      {
        id: 'tesla-vuln',
        name: '感电',
        desc: '被电目标受到的所有伤害 +15%（2s）。',
        flags: ['teslaVuln'],
      },
      {
        id: 'tesla-pillar',
        name: '电极柱',
        desc: '改为脚下插柱 8s，范围内每 1.5s 放电。',
        flags: ['teslaPillar'],
      },
    ],
  },
  {
    id: 'wingman',
    name: '僚机',
    rarity: 'refined',
    tag: 'auto',
    axis: 'self',
    desc: '+1 架环绕无人机（主炮 0.55×）。',
    add: { drones: 1 },
    branches: [
      {
        id: 'wingman-flight',
        name: '编队',
        desc: '再 +1 架，开火间隔 −15%。',
        add: { drones: 1 },
        mul: { droneCd: 0.85 },
      },
      {
        id: 'wingman-missile',
        name: '挂载',
        desc: '每 3s 补一发小导弹（半径 50）。',
        flags: ['droneMissile'],
      },
    ],
  },
  {
    id: 'magnet-mine',
    name: '磁吸雷',
    rarity: 'refined',
    tag: 'auto',
    axis: 'deploy',
    desc: '每 2.4s 布雷：80px 内的敌人会被拽向雷，走进中心即引爆。',
    add: { mines: 1 },
    flags: ['mineHoming'],
    branches: [
      {
        id: 'mine-jump',
        name: '跳雷',
        desc: '弹起后空爆，半径 +40%。',
        mul: { mineCd: 1.1 },
        flags: ['mineJump'],
      },
      {
        id: 'mine-tether',
        name: '绊索',
        desc: '雷与雷连线：穿过的敌人减速 40% 并被拉向雷。',
        flags: ['mineTether'],
      },
    ],
  },
  {
    id: 'phase-dash',
    name: '相位冲刺',
    rarity: 'refined',
    tag: 'survive',
    axis: 'self',
    desc: '冲刺穿过敌人，留残影（0.35s 后爆 90 伤）。',
    flags: ['phaseDash'],
    branches: [
      {
        id: 'dash-double',
        name: '二段',
        desc: '连续冲 2 次，冷却 +30%。',
        add: { dashCharges: 1 },
        mul: { dashCd: 1.3 },
      },
      {
        id: 'dash-slow',
        name: '残影连锁',
        desc: '残影爆炸减速 45%。',
        flags: ['dashSlow'],
      },
    ],
  },
  {
    id: 'nano-repair',
    name: '纳米修复',
    rarity: 'refined',
    tag: 'survive',
    axis: 'self',
    desc: '脱战 2.5s 后每秒回 4，受击中断。',
    add: { regen: 4 },
    branches: [
      {
        id: 'nano-combat',
        name: '战地修复',
        desc: '战斗中也能回 1.2/s。',
        flags: ['regenCombat'],
      },
      {
        id: 'nano-low',
        name: '应急协议',
        desc: '血量 <30% 时回复 ×3。',
        flags: ['regenLow'],
      },
    ],
  },

  // ===================================================================
  // 蓝 · 军用（6）
  // ===================================================================
  {
    id: 'long-gun',
    name: '长管炮',
    rarity: 'military',
    tag: 'direct',
    axis: 'far',
    desc: '射程 ×1.4，伤害 ×1.8，但最小射程 120。',
    mul: { range: 1.4, dmg: 1.8 },
    add: { minRange: 120 },
    branches: [
      {
        id: 'long-at',
        name: '反器材',
        desc: '伤害 ×1.6、无视护甲，射速 −25%。',
        mul: { dmg: 1.6, interval: 1.25 },
        flags: ['pierceArmor'],
      },
      {
        id: 'long-rail',
        name: '磁轨加速',
        desc: '贯穿 3 个目标，无衰减。',
        add: { pierce: 3 },
        mul: { falloff: 1.45 },
      },
    ],
  },
  {
    id: 'frost-round',
    name: '冰霜弹',
    rarity: 'military',
    tag: 'control',
    axis: 'mid',
    desc: '命中减速 35%（1.5s）。',
    add: { chill: 0.35 },
    branches: [
      {
        id: 'frost-brittle',
        name: '脆化',
        desc: '被减速目标受到的伤害 +25%。',
        add: { frostVuln: 0.25 },
      },
      {
        id: 'frost-deep',
        name: '冻结',
        desc: '减速 60%，1s 后定身 0.5s（BOSS 无效）。',
        add: { chill: 0.2 },
        flags: ['freezeRoot'],
      },
    ],
  },
  {
    id: 'missile-array',
    name: '导弹阵列',
    rarity: 'military',
    tag: 'auto',
    axis: 'self',
    desc: '每 3s 齐射 4 发追踪导弹（0.5×）。',
    add: { missiles: 4 },
    branches: [
      {
        id: 'missile-cluster',
        name: '集束',
        desc: '再 +4 发，单发 0.6×。',
        add: { missiles: 4 },
        mul: { missileDmg: 0.6 },
      },
      {
        id: 'missile-heavy',
        name: '重型',
        desc: '改成 2 发，单发 ×2.2，命中爆炸。',
        add: { missiles: -2 },
        mul: { missileDmg: 2.2 },
        flags: ['missileBlast'],
      },
    ],
  },
  {
    id: 'sentry',
    name: '哨戒炮台',
    rarity: 'military',
    tag: 'auto',
    axis: 'deploy',
    desc: '部署炮台 15s（0.6×，最多 2 座），你走开它还在打。',
    add: { turrets: 1 },
    branches: [
      {
        id: 'sentry-heavy',
        name: '重炮台',
        desc: '1 座，伤害 ×1.4，但冷却 +30%。',
        flags: ['turretHeavy'],
      },
      {
        id: 'sentry-smart',
        name: '智能炮台',
        desc: '优先打你瞄准的目标。',
        flags: ['turretSmart'],
      },
    ],
  },
  {
    id: 'force-shield',
    name: '力场护盾',
    rarity: 'military',
    tag: 'survive',
    axis: 'self',
    desc: '+1 层护盾，9.5s 自充。',
    add: { shieldMax: 1 },
    branches: [
      {
        id: 'shield-double',
        name: '双层',
        desc: '再 +1 层，但充能慢 26%。',
        add: { shieldMax: 1 },
        mul: { shieldRecharge: 1.26 },
      },
      {
        id: 'shield-burst',
        name: '反冲',
        desc: '护盾破碎时 320px 冲击波，120 伤害。',
        add: { nova: 1 },
      },
    ],
  },
  {
    id: 'time-dilation',
    name: '时间膨胀',
    rarity: 'military',
    tag: 'control',
    axis: 'self',
    desc: '周围 260px 敌人与敌弹速度 −25%。',
    add: { auraSlow: 0.25 },
    branches: [
      {
        id: 'time-deep',
        name: '深陷',
        desc: '减速 40%，范围 −23%。',
        add: { auraSlow: 0.15 },
        mul: { auraR: 0.77 },
      },
      {
        id: 'time-wide',
        name: '广域',
        desc: '范围 +60%，减速回到 15%。',
        add: { auraSlow: -0.1 },
        mul: { auraR: 1.6 },
      },
    ],
  },

  // ===================================================================
  // 金 · 稀有（4）
  // ===================================================================
  {
    id: 'gravity-well',
    name: '引力井',
    rarity: 'rare',
    tag: 'control',
    axis: 'deploy',
    desc: '投出奇点：1.2s 内把 180px 内敌人拉向中心。',
    add: { wells: 1 },
    branches: [
      {
        id: 'well-singularity',
        name: '奇点',
        desc: '拉 2s，结束时爆一次（半径 120）。',
        flags: ['wellSingularity'],
      },
      {
        id: 'well-inert',
        name: '惰性场',
        desc: '不强拉：场内减速 45%，受到伤害 +20%。',
        flags: ['wellInert'],
      },
    ],
  },
  {
    id: 'magnetic-storm',
    name: '磁暴场',
    rarity: 'rare',
    tag: 'area',
    axis: 'self',
    desc: '360px 内每 1.2s 落雷一次（0.6×），区域跟随你。',
    add: { storm: 1 },
    branches: [
      {
        id: 'storm-overload',
        name: '过载',
        desc: '每 0.8s 落雷，单次伤害 0.4×。',
        mul: { stormCd: 0.67, stormDmg: 0.67 },
      },
      {
        id: 'storm-core',
        name: '雷暴核心',
        desc: '落雷点留 2s 电弧，持续伤害。',
        flags: ['stormArc'],
      },
    ],
  },
  {
    id: 'swarm-command',
    name: '蜂群指挥',
    rarity: 'rare',
    tag: 'auto',
    axis: 'self',
    desc: '无人机共 5 架，集火你手动瞄准的目标。',
    add: { drones: 5 },
    flags: ['focusFire'],
    branches: [
      {
        id: 'swarm-shield',
        name: '蜂群护盾',
        desc: '无人机可挡子弹，被击落 6s 重生。',
        flags: ['droneShield'],
      },
      {
        id: 'swarm-overload',
        name: '蜂群过载',
        desc: '每架伤害 +25%，总数 −1。',
        add: { drones: -1 },
        mul: { droneDmg: 1.25 },
      },
    ],
  },
  {
    id: 'reflect-armor',
    name: '反射装甲',
    rarity: 'rare',
    tag: 'survive',
    axis: 'self',
    desc: '受到伤害时向四周弹片（12 发，0.8×）。',
    add: { reflect: 12 },
    branches: [
      {
        id: 'reflect-spike',
        name: '尖刺',
        desc: '弹片穿透 2 个目标。',
        add: { reflectPierce: 2 },
      },
      {
        id: 'reflect-arc',
        name: '电弧反制',
        desc: '弹片改为电击并感电。',
        flags: ['reflectArc'],
      },
    ],
  },

  // ===================================================================
  // 红 · 原型（3）—— 天生红，必须带代价
  // ===================================================================
  {
    id: 'rail-cannon',
    name: '轨道炮',
    rarity: 'prototype',
    tag: 'direct',
    axis: 'far',
    desc: '每 5s 蓄力 0.35s：穿墙、贯穿 4、无衰减、×3。代价：蓄力时移速 −40%。',
    add: { railgun: 1 },
    branches: [
      {
        id: 'rail-overload',
        name: '过载线圈',
        desc: '蓄力 0.7s，贯穿无限，×4。',
        flags: ['railOverload'],
      },
      {
        id: 'rail-fast',
        name: '快循环',
        desc: '2.5s 一发，贯穿 2，×2。',
        flags: ['railFast'],
      },
    ],
  },
  {
    id: 'overload-core',
    name: '超载核心',
    rarity: 'prototype',
    tag: 'direct',
    axis: 'mid',
    desc: '主炮伤害 +35%。代价：每次射击积热，热量满停火 1.5s。',
    mul: { dmg: 1.35 },
    add: { heatMax: 100 },
    branches: [
      {
        id: 'heat-liquid',
        name: '液态冷却',
        desc: '热量上限 +60%，停火缩到 0.8s。',
        add: { heatMax: 60 },
        flags: ['heatCool'],
      },
      {
        id: 'heat-red',
        name: '红区',
        desc: '热量 >70% 时伤害再 +25%，移速 −10%。',
        flags: ['heatRedline'],
      },
    ],
  },
  {
    id: 'time-stop',
    name: '时停核心',
    rarity: 'prototype',
    tag: 'control',
    axis: 'self',
    desc: '每 45s 停住世界 1.2s：敌人与敌弹静止，你能走位瞄准且不能开火；结束时沿炮口打出一条贯穿全场的炮击（×6）。',
    add: { stops: 1 },
    branches: [
      {
        id: 'stop-short',
        name: '短频',
        desc: '20s 一次，停 0.8s，炮击 ×4。',
        flags: ['stopShort'],
      },
      {
        id: 'stop-long',
        name: '长时',
        desc: '60s 一次，停 2.4s，炮击 ×10。',
        flags: ['stopLong'],
      },
    ],
  },
];

export const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));

export const BRANCH_BY_ID = new Map<string, { card: CardDef; branch: CardBranch }>();
for (const card of CARDS) {
  for (const branch of card.branches) BRANCH_BY_ID.set(branch.id, { card, branch });
}

/** 空卡（新装置与改装都不可用时的兜底）。 */
export const SUPPLY_CARD: CardDef = {
  id: 'supply',
  name: '补给卡',
  rarity: 'common',
  tag: 'survive',
  axis: 'self',
  desc: '回 25 血 + 1 颗炸弹。',
  branches: [],
};

export function cardsOfTag(tag: CardTag): CardDef[] {
  return CARDS.filter((c) => c.tag === tag);
}

export function branchOf(cardId: string, branchId: string | null): CardBranch | null {
  if (!branchId) return null;
  const card = CARD_BY_ID.get(cardId);
  return card?.branches.find((b) => b.id === branchId) ?? null;
}
