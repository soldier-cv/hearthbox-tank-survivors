/**
 * 数据层统一出口。
 */

export { TANKS, SKINS, SKIN_BY_ID, TANK_BY_ID, FREE_TANKS } from './tanks';
export type { TankDef, StatPoint, WeaponId, SignatureId, SkinDef } from './tanks';

export { CARDS, CARD_BY_ID, SUPPLY_CARD, schoolCards, schoolUltimate } from './cards';
export type { CardDef, Add, Mul, Flag } from './cards';

export {
  ENEMIES, ENEMY_BY_ID, AFFIXES, AFFIX_BY_ID, BOSSES, WAVES, ROLLS,
  THREAT_EXTRA, SUPPLY_TIMES, BOSS_FIRST, BOSS_FINAL, SPAWN_STOP,
} from './enemies';
export type { EnemyDef, EnemyId, AttackKind, AffixDef, AffixId, BossDef, WaveNode } from './enemies';

export {
  TILE, TILE_RULES, MAPS, MAP_BY_ID, TERRAIN_NODES, ICE, COLLAPSE,
} from './maps';
export type { TileType, TileRule, MapDef, TerrainNode } from './maps';
