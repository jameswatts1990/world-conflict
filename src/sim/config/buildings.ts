// City buildings. Costs and build times are per level being built.
import type { BuildingType, PartialResources } from '../types';

export interface BuildingConfig {
  name: string;
  description: string;
  maxLevel: number;
  /** Cost to build the given level (1-based). */
  cost: (level: number) => PartialResources;
  /** Build time in seconds for the given level. */
  seconds: (level: number) => number;
  /** Another building required in the same province. */
  requiresBuilding?: BuildingType;
}

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

const pct = (x: number) => `${Math.round(x * 100)}%`;
const E = BUILDING_EFFECTS;

export const BUILDINGS: Record<BuildingType, BuildingConfig> = {
  industry: {
    name: 'Industrial Works',
    description: `Each level: +${pct(E.industryMoneyPerLevel)} money and +${pct(E.industryMaterialsPerLevel)} materials from this province.`,
    maxLevel: 3,
    cost: (l) => ({ money: 250 * l, materials: 120 * l }),
    seconds: (l) => 75 + 45 * l,
  },
  barracks: {
    name: 'Barracks',
    description: `Enables infantry recruitment here. +${pct(E.barracksManpower)} manpower from this province.`,
    maxLevel: 1,
    cost: () => ({ money: 150, materials: 50 }),
    seconds: () => 45,
  },
  armsWorks: {
    name: 'Arms Works',
    description: `Enables artillery recruitment here. +${pct(E.armsWorksMaterials)} materials from this province.`,
    maxLevel: 1,
    cost: () => ({ money: 300, materials: 150 }),
    seconds: () => 90,
  },
  tankWorks: {
    name: 'Tank Works',
    description: 'Enables tank recruitment here. Requires Arms Works.',
    maxLevel: 1,
    cost: () => ({ money: 450, materials: 250 }),
    seconds: () => 150,
    requiresBuilding: 'armsWorks',
  },
  refinery: {
    name: 'Fuel Refinery',
    description: `Each level: +${E.refineryOilFuelPerLevel} fuel/min on oil fields, or +${E.refinerySyntheticFuelPerLevel} fuel/min anywhere with Synthetic Fuel research.`,
    maxLevel: 2,
    cost: (l) => ({ money: 300 * l, materials: 180 * l }),
    seconds: (l) => 90 * l,
  },
  fortifications: {
    name: 'Fortifications',
    description: `Each level: defenders here take ${pct(E.fortDamageReductionPerLevel)} less damage and capture takes ${E.fortCaptureSecondsPerLevel} s longer.`,
    maxLevel: 3,
    cost: (l) => ({ money: 180 * l, materials: 140 * l }),
    seconds: (l) => 60 * l,
  },
  supplyDepot: {
    name: 'Supply Depot',
    description: 'A supply hub. Armies connected to a hub through owned territory stay supplied.',
    maxLevel: 1,
    cost: () => ({ money: 200, materials: 100 }),
    seconds: () => 60,
  },
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
