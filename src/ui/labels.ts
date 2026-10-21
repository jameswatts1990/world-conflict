// Display labels shared by the map, panels and hover card.
import { UNIT_TYPES, type Army, type OwnerId, type ProvinceId, type Terrain, type UnitType, type World } from '../sim';

export const TERRAIN_LABEL: Record<Terrain, string> = {
  plains: 'Plains',
  forest: 'Forest',
  hills: 'Hills',
  mountains: 'Mountains',
  urban: 'Urban',
  marsh: 'Marsh',
};

export const TERRAIN_NOTE: Record<Terrain, string> = {
  plains: 'Open ground: tanks excel.',
  forest: 'Forest: defenders gain, tanks struggle.',
  hills: 'Hills: infantry defends well, artillery gains.',
  mountains: 'Mountains: strong defence, slow going, tanks crippled.',
  urban: 'Urban: infantry defends very well, tanks struggle.',
  marsh: 'Marsh: slow going, tanks crippled.',
};

/** "France", or the neutral state a province belongs to ("Netherlands"). */
export function ownerShortName(world: World, owner: OwnerId, province: ProvinceId): string {
  return owner === 'neutral' ? (world.provinces[province].neutral?.name ?? 'Neutral') : world.nations[owner].name;
}

/** "France", or "Netherlands · neutral" for a neutral state's province. */
export function ownerLabel(world: World, owner: OwnerId, province: ProvinceId): string {
  const name = ownerShortName(world, owner, province);
  return owner === 'neutral' ? `${name} · neutral` : name;
}

/** "French army", "Dutch garrison". */
export function armyName(world: World, army: Army): string {
  if (army.owner !== 'neutral') return `${world.nations[army.owner].adjective} army`;
  return `${world.provinces[army.province].neutral?.adjective ?? 'Neutral'} garrison`;
}

export interface Composition extends Record<UnitType, number> {
  /** Average strength, 0..1. */
  strength: number;
}

/** Unit counts by type and average strength, for compact army summaries. */
export function composition(armies: Army | Army[]): Composition {
  const c: Composition = { infantry: 0, artillery: 0, tank: 0, strength: 0 };
  let n = 0;
  for (const a of Array.isArray(armies) ? armies : [armies]) {
    for (const u of a.units) {
      c[u.type]++;
      c.strength += u.strength;
      n++;
    }
  }
  c.strength = n ? c.strength / n : 0;
  return c;
}

/** The type that best represents an army on its counter. */
export function mainUnitType(c: Composition): UnitType {
  return c.tank > 0 ? 'tank' : c.artillery > c.infantry ? 'artillery' : 'infantry';
}

export function unitCount(c: Composition): number {
  return UNIT_TYPES.reduce((s, t) => s + c[t], 0);
}
