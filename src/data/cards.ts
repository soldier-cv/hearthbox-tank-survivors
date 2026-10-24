/** 卡池 v3（docs/v3/03-cards.md）。 */

/** 卡的四层：主炮 / 弹药 / 装置 / 底盘，另加原型（红卡）。 */
export const CARD_KINDS = ['cannon', 'ammo', 'device', 'chassis', 'prototype'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export const KIND_NAMES: Record<CardKind, string> = {
  cannon: '主炮',
  ammo: '弹药',
  device: '装置',
  chassis: '底盘',
  prototype: '原型',
};

export const KIND_COLORS: Record<CardKind, string> = {
  cannon: '#f2b13c',
  ammo: '#58c8d8',
  device: '#c9a0ff',
  chassis: '#9ad14f',
  prototype: '#ff4d4d',
};

/** 稀有度只决定出现频率与角色。 */
export const RARITIES = ['common', 'refined', 'military', 'prototype'] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_NAMES: Record<Rarity, string> = {
  common: '常规',
  refined: '精制',
  military: '军用',
  prototype: '原型',
};

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#d8dde6',
  refined: '#6fcf7a',
  military: '#4aa3ff',
  prototype: '#ff4d4d',
};

export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 52,
  refined: 28,
  military: 17,
  prototype: 3,
};

/** 元素：同一时间只能带一种。 */
export const ELEMENT_NONE = 0;
export const ELEMENT_FIRE = 1;
export const ELEMENT_ELEC = 2;
export const ELEMENT_ICE = 3;
export const ELEMENT_ACID = 4;

export const ELEMENT_COLORS: Record<number, string> = {
  0: '#ffffff',
  1: '#ff6b35',
  2: '#7bd6ff',
  3: '#c9f5fb',
  4: '#b6e04a',
};

export const ELEMENT_NAMES: Record<number, string> = {
  0: '无',
  1: '燃烧',
  2: '电弧',
  3: '冰霜',
  4: '酸蚀',
};

/** 加性修饰。 */
export interface Add {
  dmg?: number;
  projectiles?: number;
  pierce?: number;
  bulletSpeed?: number;
  range?: number;
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
  xpGain?: number;
  spread?: number;
  railgun?: number;
  radial?: number;
  nova?: number;
  chainBlast?: number;
  /** 弹跳次数。 */
  bounce?: number;
  /** 追踪转向速度。 */
  homing?: number;
  /** 导弹数量。 */
  missiles?: number;
  /** 时停核心。 */
  stops?: number;
  /** 掉落率（0..1）。 */
  dropRate?: number;
  /** 火箭。 */
  rockets?: number;
}

/** 乘性修饰。 */
export interface Mul {
  interval?: number;
  speed?: number;
  dmg?: number;
  range?: number;
  bulletSpeed?: number;
  spread?: number;
  dashCd?: number;
  shieldRecharge?: number;
  mineCd?: number;
  teslaCd?: number;
  droneCd?: number;
  falloff?: number;
  blastRadius?: number;
  /** 爆炸伤害倍率（相对直击伤害）。 */
  blastDmg?: number;
  wallDmg?: number;
  chainDmg?: number;
  droneDmg?: number;
  mineDmg?: number;
  teslaDmg?: number;
  missileCd?: number;
  missileDmg?: number;
  rocketCd?: number;
  rocketDmg?: number;
  rocketR?: number;
  stopCd?: number;
  stopDur?: number;
}

/** 标记：改变行为而不只是数值。 */
export type Flag =
  | 'noSpread'
  | 'heavyShot'
  | 'doubleBlast'
  | 'focusFire'
  | 'wallPass'
  | 'fireSpread'
  | 'fireTrail'
  | 'shockVuln'
  | 'arcLinger'
  | 'freezeRoot'
  | 'brittle'
  | 'acidSplash'
  | 'acidStack'
  | 'droneFocus'
  | 'droneShield'
  | 'mineJump'
  | 'mineMagnet'
  | 'shieldNova'
  | 'shieldSpikes'
  | 'medCombat'
  | 'medLow'
  | 'railOverload'
  | 'railFast'
  | 'stopShort'
  | 'stopLong'
  | 'rocketCluster'
  | 'rocketFire';

/** 一级效果。 */
export interface CardStep {
  desc: string;
  add?: Add;
  mul?: Mul;
  flags?: Flag[];
}

/** 满级质变的一个方向。 */
export interface CardEvol {
  id: string;
  name: string;
  desc: string;
  add?: Add;
  mul?: Mul;
  flags?: Flag[];
}

export interface CardDef {
  id: string;
  name: string;
  kind: CardKind;
  rarity: Rarity;
  /** 这一发子弹带的元素（只有弹药卡有，0 = 无）。 */
  elem?: number;
  /** 每一级的效果：长度就是满级数。 */
  steps: CardStep[];
  /** 满级那一次二选一。 */
  evolves?: CardEvol[];
}

export const CARDS: CardDef[] = [
  // ---------------------------------------------------------------- 主炮
  {
    id: 'gun-cal',
    name: '主炮校准',
    kind: 'cannon',
    rarity: 'common',
    steps: [
      { desc: '伤害 +4，射速 +8%。', add: { dmg: 4 }, mul: { interval: 1 / 1.08 } },
      { desc: '伤害 +4，射速 +8%。', add: { dmg: 4 }, mul: { interval: 1 / 1.08 } },
      { desc: '伤害 +6，射速 +10%。', add: { dmg: 6 }, mul: { interval: 1 / 1.1 } },
    ],
    evolves: [
      { id: 'twin', name: '双发', desc: '一次开火两发（±3°）。', add: { projectiles: 1, spread: 3 } },
      { id: 'heavy', name: '重炮', desc: '伤害 ×1.3，射速 −15%。', mul: { dmg: 1.3, interval: 1.15 } },
    ],
  },
  {
    id: 'twin-gun',
    name: '双联装',
    kind: 'cannon',
    rarity: 'refined',
    steps: [
      { desc: '并联 +1 发，散布 ±4°。', add: { projectiles: 1, spread: 4 } },
      { desc: '并联 +1 发，散布再 +4°。', add: { projectiles: 1, spread: 4 } },
    ],
  },
  {
    id: 'long-gun',
    name: '长管',
    kind: 'cannon',
    rarity: 'common',
    steps: [
      { desc: '射程 +15%，弹速 +20%。', mul: { range: 1.15, bulletSpeed: 1.2 } },
      { desc: '射程 +15%，弹速 +20%。', mul: { range: 1.15, bulletSpeed: 1.2 } },
    ],
  },

  // ---------------------------------------------------------------- 弹药
  {
    id: 'ap',
    name: '穿甲弹',
    kind: 'ammo',
    rarity: 'refined',
    steps: [
      { desc: '穿透 +1，弹速 +40，伤害 +2。', add: { pierce: 1, bulletSpeed: 40, dmg: 2 } },
      { desc: '穿透 +1，弹速 +40，伤害 +2。', add: { pierce: 1, bulletSpeed: 40, dmg: 2 } },
      { desc: '穿透 +1，弹速 +40，伤害 +3。', add: { pierce: 1, bulletSpeed: 40, dmg: 3 } },
    ],
    evolves: [
      { id: 'no-falloff', name: '不衰减', desc: '穿透后伤害不递减。', mul: { falloff: 1.45 } },
      { id: 'wall-pass', name: '穿墙', desc: '子弹穿过砖墙，穿透 −1。', add: { pierce: -1 }, flags: ['wallPass'] },
    ],
  },
  {
    id: 'he',
    name: '高爆弹',
    kind: 'ammo',
    rarity: 'refined',
    steps: [
      { desc: '命中爆炸，半径 34，波及 55%。', add: { blastRadius: 34 } },
      { desc: '爆炸半径 +18。', add: { blastRadius: 18 } },
      { desc: '爆炸半径 +18。', add: { blastRadius: 18 } },
    ],
    evolves: [
      { id: 'wide', name: '广域', desc: '半径 ×1.5。', mul: { blastRadius: 1.5 } },
      { id: 'focus', name: '集中', desc: '半径 −30%，爆炸伤害 90%。', mul: { blastRadius: 0.7, blastDmg: 1.5 } },
    ],
  },
  {
    id: 'bounce',
    name: '跳弹',
    kind: 'ammo',
    rarity: 'refined',
    steps: [
      { desc: '撞墙或命中后反弹 1 次。', add: { bounce: 1 } },
      { desc: '再反弹 1 次。', add: { bounce: 1 } },
    ],
  },
  {
    id: 'homing',
    name: '追踪弹',
    kind: 'ammo',
    rarity: 'military',
    steps: [
      { desc: '子弹缓慢转向最近的敌人。', add: { homing: 3 } },
      { desc: '转向更快，伤害 +10%。', add: { homing: 2 }, mul: { dmg: 1.1 } },
    ],
  },
  {
    id: 'fire',
    name: '燃烧弹',
    kind: 'ammo',
    rarity: 'refined',
    elem: ELEMENT_FIRE,
    steps: [
      { desc: '命中点燃：3 秒内每秒 8 伤害。' },
      { desc: '燃烧伤害提升到每秒 12。' },
      { desc: '燃烧伤害提升到每秒 16。' },
    ],
    evolves: [
      { id: 'spread', name: '蔓延', desc: '火会沿草丛扩散。', flags: ['fireSpread'] },
      { id: 'trail', name: '拖火痕', desc: '着火的敌人边走边烧。', flags: ['fireTrail'] },
    ],
  },
  {
    id: 'elec',
    name: '电弧弹',
    kind: 'ammo',
    rarity: 'refined',
    elem: ELEMENT_ELEC,
    steps: [
      { desc: '命中电击最近 1 个敌人（60px）。' },
      { desc: '电弧可以再跳 1 个目标。' },
      { desc: '电弧可以再跳 1 个目标，伤害提升。' },
    ],
    evolves: [
      { id: 'vuln', name: '感电', desc: '被电目标受到的伤害 +15%。', flags: ['shockVuln'] },
      { id: 'linger', name: '留弧', desc: '电击点留 2 秒电弧。', flags: ['arcLinger'] },
    ],
  },
  {
    id: 'ice',
    name: '冰霜弹',
    kind: 'ammo',
    rarity: 'military',
    elem: ELEMENT_ICE,
    steps: [
      { desc: '命中减速 25%。' },
      { desc: '减速提升到 35%。' },
      { desc: '减速提升到 45%。' },
    ],
    evolves: [
      { id: 'root', name: '定身', desc: '减速满 2 秒后定身 1 秒。', flags: ['freezeRoot'] },
      { id: 'brittle', name: '脆化', desc: '被减速目标受到的伤害 +25%。', flags: ['brittle'] },
    ],
  },
  {
    id: 'acid',
    name: '酸蚀弹',
    kind: 'ammo',
    rarity: 'military',
    elem: ELEMENT_ACID,
    steps: [
      { desc: '命中破甲：受到伤害 +10%，可叠 3 层。' },
      { desc: '每层提升到 +15%。' },
      { desc: '每层提升到 +20%。' },
    ],
    evolves: [
      { id: 'splash', name: '溶解', desc: '被酸蚀的敌人死亡时溅射酸液。', flags: ['acidSplash'] },
      { id: 'stack', name: '腐蚀', desc: '破甲上限 +2 层。', flags: ['acidStack'] },
    ],
  },

  // ---------------------------------------------------------------- 装置
  {
    id: 'wingman',
    name: '僚机',
    kind: 'device',
    rarity: 'refined',
    steps: [
      { desc: '环绕无人机 +1（主炮 0.5×）。', add: { drones: 1 } },
      { desc: '环绕无人机 +1。', add: { drones: 1 } },
      { desc: '环绕无人机 +1。', add: { drones: 1 } },
    ],
    evolves: [
      { id: 'focus', name: '集火', desc: '无人机打你瞄准的目标。', flags: ['droneFocus'] },
      { id: 'shield', name: '护盾', desc: '无人机可挡子弹。', flags: ['droneShield'] },
    ],
  },
  {
    id: 'mines',
    name: '布雷',
    kind: 'device',
    rarity: 'refined',
    steps: [
      { desc: '每 3 秒在车尾布一颗雷。', add: { mines: 1 } },
      { desc: '雷的伤害 +40%，布设更快。', mul: { mineCd: 0.85, mineDmg: 1.4 } },
      { desc: '雷的伤害 +40%，布设更快。', mul: { mineCd: 0.85, mineDmg: 1.4 } },
    ],
    evolves: [
      { id: 'jump', name: '跳雷', desc: '弹起后空爆，半径更大。', flags: ['mineJump'] },
      { id: 'magnet', name: '磁吸', desc: '把附近敌人拽向雷。', flags: ['mineMagnet'] },
    ],
  },
  {
    id: 'tesla',
    name: '电磁链',
    kind: 'device',
    rarity: 'refined',
    steps: [
      { desc: '每 2.8 秒电击最近敌人，连锁 2 个。', add: { teslaChain: 2 } },
      { desc: '连锁 +1，冷却 −10%。', add: { teslaChain: 1 }, mul: { teslaCd: 0.9 } },
      { desc: '连锁 +1，冷却 −10%。', add: { teslaChain: 1 }, mul: { teslaCd: 0.9 } },
    ],
    evolves: [
      { id: 'vuln', name: '感电', desc: '被电目标受到伤害 +15%。', flags: ['shockVuln'] },
      { id: 'pillar', name: '电极柱', desc: '改为在脚下插一根放电柱。', flags: ['arcLinger'] },
    ],
  },
  {
    id: 'missiles',
    name: '导弹',
    kind: 'device',
    rarity: 'military',
    steps: [
      { desc: '每 4 秒齐射 2 发追踪导弹。', add: { missiles: 2 } },
      { desc: '再 +2 发。', add: { missiles: 2 } },
    ],
  },
  {
    id: 'rocket',
    name: '火箭',
    kind: 'device',
    rarity: 'military',
    steps: [
      { desc: '每 6 秒向敌人最密的地方打一发火箭（半径 80，伤害 1.8×）。', add: { rockets: 1 } },
      { desc: '伤害 +30%，半径 +18。', mul: { rocketDmg: 1.3, rocketR: 1.18 } },
      { desc: '冷却 −20%，伤害 +30%。', mul: { rocketCd: 0.8, rocketDmg: 1.3 } },
    ],
    evolves: [
      { id: 'cluster', name: '集束弹头', desc: '爆炸后再散落 3 个爆点。', flags: ['rocketCluster'] },
      { id: 'napalm', name: '燃烧弹头', desc: '落点留下 4 秒火池。', flags: ['rocketFire'] },
    ],
  },
  {
    id: 'shield',
    name: '力场护盾',
    kind: 'device',
    rarity: 'military',
    steps: [
      { desc: '护盾 +1 层，9.5 秒自充。', add: { shieldMax: 1 } },
      { desc: '护盾 +1 层。', add: { shieldMax: 1 } },
      { desc: '护盾 +1 层。', add: { shieldMax: 1 } },
    ],
    evolves: [
      { id: 'nova', name: '冲击波', desc: '护盾破碎时释放 320px 冲击波。', flags: ['shieldNova'] },
      { id: 'spikes', name: '反伤', desc: '护盾破碎时向四周发射弹片。', flags: ['shieldSpikes'] },
    ],
  },

  // ---------------------------------------------------------------- 底盘
  {
    id: 'armor',
    name: '复合装甲',
    kind: 'chassis',
    rarity: 'common',
    steps: [
      { desc: '生命 +16，受伤 −1。', add: { maxHp: 16, armorFlat: 1 } },
      { desc: '生命 +16，受伤 −1。', add: { maxHp: 16, armorFlat: 1 } },
      { desc: '生命 +20，受伤 −1.5。', add: { maxHp: 20, armorFlat: 1.5 } },
    ],
  },
  {
    id: 'repair',
    name: '维修组',
    kind: 'chassis',
    rarity: 'common',
    steps: [
      { desc: '脱战 2 秒后每秒回 0.8。', add: { regen: 0.8 } },
      { desc: '每秒回 0.8。', add: { regen: 0.8 } },
      { desc: '每秒回 1.0。', add: { regen: 1.0 } },
    ],
    evolves: [
      { id: 'combat', name: '战地维修', desc: '战斗中也能回 0.4/秒。', flags: ['medCombat'] },
      { id: 'low', name: '应急协议', desc: '血量 <30% 时回复 ×3。', flags: ['medLow'] },
    ],
  },
  {
    id: 'engine',
    name: '强化引擎',
    kind: 'chassis',
    rarity: 'common',
    steps: [
      { desc: '移速 +8%，冲刺冷却 −10%。', mul: { speed: 1.08, dashCd: 0.9 } },
      { desc: '移速 +8%，冲刺冷却 −10%。', mul: { speed: 1.08, dashCd: 0.9 } },
    ],
  },
  {
    id: 'ammo-rack',
    name: '弹药架',
    kind: 'chassis',
    rarity: 'common',
    steps: [
      { desc: '射速 +10%。', mul: { interval: 1 / 1.1 } },
      { desc: '射速 +10%。', mul: { interval: 1 / 1.1 } },
      { desc: '射速 +10%。', mul: { interval: 1 / 1.1 } },
    ],
  },
  {
    id: 'magnet',
    name: '磁力回收',
    kind: 'chassis',
    rarity: 'common',
    steps: [
      { desc: '拾取范围 +50，掉落 +8%。', add: { pickup: 50, dropRate: 0.08 } },
      { desc: '拾取范围 +50，掉落 +8%。', add: { pickup: 50, dropRate: 0.08 } },
    ],
  },

  // ---------------------------------------------------------------- 原型
  {
    id: 'rail',
    name: '轨道炮',
    kind: 'prototype',
    rarity: 'prototype',
    steps: [
      {
        desc: '每 5 秒蓄力 0.35 秒：穿墙、贯穿 4 个、×3。蓄力时移速 −40%。',
        add: { railgun: 1 },
      },
    ],
    evolves: [
      { id: 'overload', name: '过载线圈', desc: '蓄力 0.7 秒，贯穿无限，×4。', flags: ['railOverload'] },
      { id: 'fast', name: '快循环', desc: '2.5 秒一发，贯穿 2 个，×2。', flags: ['railFast'] },
    ],
  },
  {
    id: 'stop',
    name: '时停核心',
    kind: 'prototype',
    rarity: 'prototype',
    steps: [
      {
        desc: '每 45 秒停住世界 1.2 秒：你能走位瞄准但不能开火；结束时沿炮口打出一条贯穿全场的炮击（×6）。',
        add: { stops: 1 },
      },
    ],
    evolves: [
      { id: 'short', name: '短频', desc: '20 秒一次，停 0.8 秒，炮击 ×4。', flags: ['stopShort'] },
      { id: 'long', name: '长时', desc: '60 秒一次，停 2.4 秒，炮击 ×10。', flags: ['stopLong'] },
    ],
  },
];

export const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));

/** 空卡（候选耗尽时的兜底）。 */
export const SUPPLY_CARD: CardDef = {
  id: 'supply',
  name: '补给卡',
  kind: 'chassis',
  rarity: 'common',
  steps: [{ desc: '回 25 血 + 1 颗炸弹。' }],
};
