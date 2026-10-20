// City buildings. Costs and build times are per level being built.
import type { BuildingType, PartialResources } from '../types';

export interface BuildingConfig {
  name: string;
  short: string;
  description: string;
  maxLevel: number;
  /** Cost to build the given level (1-based). */
  cost: (level: number) => PartialResources;
  /** Build time in seconds for the given level. */
  seconds: (level: number) => number;
  /** Another building required in the same province. */
  requiresBuilding?: BuildingType;
}

export const BUILDINGS: Record<BuildingType, BuildingConfig> = {
  industry: {
    name: 'Industrial Works',
    short: 'IND',
    description: 'Each level: +30% money and +60% materials from this province.',
    maxLevel: 3,
    cost: (l) => ({ money: 250 * l, materials: 120 * l }),
    seconds: (l) => 75 + 45 * l,
  },
  barracks: {
    name: 'Barracks',
    short: 'BRK',
    description: 'Enables infantry recruitment here. +25% manpower from this province.',
    maxLevel: 1,
    cost: () => ({ money: 150, materials: 50 }),
    seconds: () => 45,
  },
  armsWorks: {
    name: 'Arms Works',
    short: 'ARM',
    description: 'Enables artillery recruitment here. +10% materials from this province.',
    maxLevel: 1,
    cost: () => ({ money: 300, materials: 150 }),
    seconds: () => 90,
  },
  tankWorks: {
    name: 'Tank Works',
    short: 'TNK',
    description: 'Enables tank recruitment here. Requires Arms Works.',
    maxLevel: 1,
    cost: () => ({ money: 450, materials: 250 }),
    seconds: () => 150,
    requiresBuilding: 'armsWorks',
  },
  refinery: {
    name: 'Fuel Refinery',
    short: 'REF',
    description: 'Each level: +12 fuel/min on oil fields, or +6 fuel/min anywhere with Synthetic Fuel research.',
    maxLevel: 2,
    cost: (l) => ({ money: 300 * l, materials: 180 * l }),
    seconds: (l) => 90 * l,
  },
  fortifications: {
    name: 'Fortifications',
    short: 'FRT',
    description: 'Each level: defenders here take 12% less damage and capture takes 10 s longer.',
    maxLevel: 3,
    cost: (l) => ({ money: 180 * l, materials: 140 * l }),
    seconds: (l) => 60 * l,
  },
  supplyDepot: {
    name: 'Supply Depot',
    short: 'DEP',
    description: 'A supply hub. Armies connected to a hub through owned territory stay supplied.',
    maxLevel: 1,
    cost: () => ({ money: 200, materials: 100 }),
    seconds: () => 60,
  },
};

export const BUILDING_EFFECTS = {
  industryMoneyPerLevel: 0.3,
  industryMaterialsPerLevel: 0.6,
  barracksManpower: 0.25,
  armsWorksMaterials: 0.1,
  refineryOilFuelPerLevel: 12,
  refinerySyntheticFuelPerLevel: 6,
  fortDamageReductionPerLevel: 0.12,
  fortCaptureSecondsPerLevel: 10,
};

export const BUILDING_ORDER: BuildingType[] = [
  'industry',
  'barracks',
  'armsWorks',
  'tankWorks',
  'refinery',
  'fortifications',
  'supplyDepot',
];
