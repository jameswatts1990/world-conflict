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
  /** Whether a human may play it; minor powers are always computer-controlled. */
  playable: boolean;
  /** The nation's core provinces are scaled to these totals per minute (Standard speed). */
  output: Omit<Resources, 'fuel'>;
  startingResources: Resources;
  /** Objective victory points of the capital and of the industrial heartland. */
  vp: { capital: number; industrial?: number };
  /** Starting city tier of the capital (other provinces follow their own tier). */
  capitalCity: CityTier;
  /** Starting buildings in the capital, the industrial heartland and a second recruiting city. */
  buildings: { capital: Buildings; industrial?: Buildings; recruiting?: Buildings };
  /**
   * Starting units in the capital and the heartland, and in the field: field units go where the
   * province rows place them (`garrison`), or are spread over the border provinces.
   */
  armies: { capital: Units; industrial?: Units; field: Units };
  /** How many provinces a nation of this tier should have, so provinces stay a similar size. */
  provinces: [number, number];
}

export const POWERS: Record<PowerTier, PowerTemplate> = {
  great: {
    name: 'Great power',
    playable: true,
    output: { money: 260, materials: 140, manpower: 70 },
    startingResources: { money: 1200, materials: 500, fuel: 150, manpower: 250 },
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
    output: { money: 150, materials: 80, manpower: 40 },
    startingResources: { money: 700, materials: 290, fuel: 90, manpower: 145 },
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
    output: { money: 70, materials: 35, manpower: 20 },
    startingResources: { money: 320, materials: 130, fuel: 40, manpower: 70 },
    vp: { capital: 1 },
    capitalCity: 2,
    buildings: {
      capital: { industry: 1, barracks: 1, supplyDepot: 1 },
    },
    armies: {
      capital: { infantry: 3 },
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
