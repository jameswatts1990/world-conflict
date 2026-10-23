// Display labels shared by the map, panels and hover card.
import { UNITS } from '../sim/config/units';
import type { Army, MoveMode, OwnerId, ProvinceId, Terrain, UnitType, World } from '../sim';

/** March orders: button label, map hint and keyboard shortcut. */
export const ORDER: Record<MoveMode, { label: string; hint: string; key: string; title: string }> = {
  move: { label: 'Move', hint: 'Move to', key: 'M', title: 'March straight there, stopping only where enemy armies bar the way; takes the destination' },
  attack: { label: 'Attack', hint: 'Attack', key: 'A', title: 'March there, halting to capture every hostile province on the way' },
  patrol: { label: 'Patrol', hint: 'Patrol to', key: 'P', title: 'March back and forth between here and the destination until stopped, fighting whatever turns up' },
};

export const TERRAIN_LABEL: Record<Terrain, string> = {
  plains: 'Plains',
  forest: 'Forest',
  hills: 'Hills',
  mountains: 'Mountains',
  urban: 'Urban',
  marsh: 'Marsh',
};

export const TERRAIN_NOTE: Record<Terrain, string> = {
  plains: 'Open ground: tanks and cavalry excel.',
  forest: 'Forest: defenders and anti-tank guns gain, armour struggles.',
  hills: 'Hills: infantry defends well, artillery gains.',
  mountains: 'Mountains: strong defence, slow going; mountain troops shine, tanks crippled.',
  urban: 'Urban: infantry and assault troops strong, tanks struggle.',
  marsh: 'Marsh: slow going, vehicles bog down.',
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

export interface Composition {
  /** Unit types present with their counts, most numerous first. */
  types: [UnitType, number][];
  /** Number of formations. */
  count: number;
  /** Average strength, 0..1. */
  strength: number;
}

/** Unit counts by type and average strength, for compact army summaries. */
export function composition(armies: Army | Army[]): Composition {
  const counts = new Map<UnitType, number>();
  let strength = 0;
  let n = 0;
  for (const a of Array.isArray(armies) ? armies : [armies]) {
    for (const u of a.units) {
      counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
      strength += u.strength;
      n++;
    }
  }
  return { types: [...counts].sort((a, b) => b[1] - a[1]), count: n, strength: n ? strength / n : 0 };
}

const CLASS_PRIORITY = { armour: 4, support: 3, mobile: 2, infantry: 1 } as const;

/** The type that represents an army on its counter: its most numerous type, heavier classes breaking ties. */
export function mainUnitType(c: Composition): UnitType {
  let best: UnitType = c.types[0]?.[0] ?? 'infantry';
  let bestScore = -1;
  for (const [t, n] of c.types) {
    const score = n * 10 + CLASS_PRIORITY[UNITS[t].class] + (UNITS[t].class === 'armour' ? 15 : 0);
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}
