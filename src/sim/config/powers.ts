// Power tiers. A nation's tier sets everything about its start that is the
// same for every nation of that size: output, treasury, starting buildings and
// army, the objective value of its capital and heartland, and how many
// provinces it should have. Province rows only say which province is which
// (src/sim/scenario/build.ts turns them into the starting setup).
//
// Great powers are the original template, unchanged. The smaller tiers keep
// the same share of income going on army upkeep at the start (about a sixth).
import type { BuildingType, CityTier, PowerTier, Resources, UnitType } from '../types';

type Units = Partial<Record<UnitType, number>>;
type Buildings = Partial<Record<BuildingType, number>>;

export interface PowerTemplate {
  /** Shown on the nation picker and in diplomacy. */
  name: string;
  /** Whether a human may play it, and whether it can win (`isContender`); minor powers can do neither. */
  playable: boolean;
  /** The nation's core provinces are scaled to these totals per minute (Standard speed). */
  output: Omit<Resources, 'fuel' | 'fusion'>;
  startingResources: Resources;
  /** Objective victory points of the capital and of the industrial heartland. */
  vp: { capital: number; industrial?: number };
  /** Starting city tier of the capital (other provinces follow their own tier). */
  capitalCity: CityTier;
  /** Starting buildings in the capital, the industrial heartland and a second recruiting city. */
  buildings: { capital: Buildings; industrial?: Buildings; recruiting?: Buildings };
  /**
   * Starting units in the capital and the heartland, and in the field: all start in cities, the field units
   * in the cities the province rows place them (`garrison`), or spread over the border cities.
   */
  armies: { capital: Units; industrial?: Units; field: Units };
  /** How many cities (each with the land round it) a nation of this tier should have, so provinces stay a similar size. */
  provinces: [number, number];
}

export const POWERS: Record<PowerTier, PowerTemplate> = {
  great: {
    name: 'Great power',
    playable: true,
    output: { money: 260, materials: 126, manpower: 42 },
    startingResources: { money: 1200, materials: 500, fuel: 150, manpower: 250, fusion: 60 },
    vp: { capital: 3, industrial: 2 },
    capitalCity: 4,
    buildings: {
      capital: { industry: 1, barracks: 1, armsWorks: 1, supplyDepot: 1 },
      industrial: { industry: 1, barracks: 1, supplyDepot: 1 },
      recruiting: { barracks: 1 },
    },
    armies: {
      capital: { infantry: 3, artillery: 1 },
      industrial: { infantry: 2, artillery: 1 },
      field: { infantry: 5, cavalry: 1 },
    },
    provinces: [6, 9],
  },
  major: {
    name: 'Major power',
    playable: true,
    output: { money: 150, materials: 72, manpower: 24 },
    startingResources: { money: 700, materials: 290, fuel: 90, manpower: 145, fusion: 45 },
    vp: { capital: 2, industrial: 1 },
    capitalCity: 3,
    buildings: {
      capital: { industry: 1, barracks: 1, armsWorks: 1, supplyDepot: 1 },
      industrial: { industry: 1, barracks: 1, supplyDepot: 1 },
    },
    armies: {
      capital: { infantry: 2, artillery: 1 },
      industrial: { infantry: 2 },
      field: { infantry: 2, cavalry: 1 },
    },
    provinces: [3, 5],
  },
  minor: {
    name: 'Minor power',
    playable: false,
    output: { money: 70, materials: 32, manpower: 12 },
    startingResources: { money: 320, materials: 130, fuel: 40, manpower: 70, fusion: 30 },
    vp: { capital: 1 },
    capitalCity: 2,
    // A fortress rather than a rival: a fortified capital and a garrison larger than its economy alone would
    // keep, so taking one costs a real army (about twelve units, half of them lost) rather than a probe.
    buildings: {
      capital: { industry: 1, barracks: 1, supplyDepot: 1, fortifications: 2 },
    },
    armies: {
      capital: { infantry: 5 },
      field: { infantry: 1 },
    },
    provinces: [1, 2],
  },
};

/** Every unit a nation of this tier starts with. */
export function startingUnits(tier: PowerTier): Units {
  const out: Units = {};
  const { capital, industrial, field } = POWERS[tier].armies;
  for (const units of [capital, industrial ?? {}, field]) {
    for (const [type, n] of Object.entries(units) as [UnitType, number][]) out[type] = (out[type] ?? 0) + n;
  }
  return out;
}
