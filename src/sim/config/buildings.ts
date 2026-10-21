// City buildings. Costs and build times are per level being built.
// Economy, military and civic buildings occupy a city building slot (the
// number of slots grows with the city tier); infrastructure does not.
import type { BuildingCategory, BuildingType, CityTier, PartialResources } from '../types';

export interface BuildingConfig {
  name: string;
  short: string;
  category: BuildingCategory;
  description: string;
  maxLevel: number;
  /** Minimum city tier for each level (index 0 = level 1). Defaults to tier 1. */
  levelTiers?: CityTier[];
  /** Cost to build the given level (1-based). */
  cost: (level: number) => PartialResources;
  /** Build time in seconds for the given level. */
  seconds: (level: number) => number;
  /** Another building required in the same province. */
  requiresBuilding?: BuildingType;
  /** Only where a sea crossing lands. */
  coastalOnly?: boolean;
  /** Only in provinces that are not the owner's core territory. */
  occupiedOnly?: boolean;
}

export const BUILDINGS: Record<BuildingType, BuildingConfig> = {
  // --- Economy -------------------------------------------------------------
  industry: {
    name: 'Industrial Works',
    short: 'IND',
    category: 'economy',
    description: 'Each level: +30% money and +60% materials here. Level 2 needs a City, level 3 a Large City.',
    maxLevel: 3,
    levelTiers: [1, 2, 3],
    cost: (l) => ({ money: 250 * l, materials: 120 * l }),
    seconds: (l) => 75 + 45 * l,
  },
  market: {
    name: 'Commercial Exchange',
    short: 'MKT',
    category: 'economy',
    description: 'Banks and trading houses. Each level: +35% money here. Needs a City; level 2 a Large City.',
    maxLevel: 2,
    levelTiers: [2, 3],
    cost: (l) => ({ money: 300 * l, materials: 60 * l }),
    seconds: (l) => 60 + 40 * l,
  },
  powerPlant: {
    name: 'Power Station',
    short: 'PWR',
    category: 'economy',
    description: 'Electrifies industry: +20% money and materials here and +10% materials in every adjacent province you own.',
    maxLevel: 1,
    levelTiers: [2],
    cost: () => ({ money: 400, materials: 220 }),
    seconds: () => 120,
    requiresBuilding: 'industry',
  },
  refinery: {
    name: 'Fuel Refinery',
    short: 'REF',
    category: 'economy',
    description: 'Each level: +12 fuel/min on oil fields, or +6 fuel/min anywhere with Synthetic Fuel research.',
    maxLevel: 2,
    cost: (l) => ({ money: 300 * l, materials: 180 * l }),
    seconds: (l) => 90 * l,
  },
  housing: {
    name: 'Housing Estates',
    short: 'HSG',
    category: 'economy',
    description: 'Each level: +12% manpower, +3 morale and faster city growth here. Level 3 needs a City.',
    maxLevel: 3,
    levelTiers: [1, 1, 2],
    cost: (l) => ({ money: 180 * l, materials: 90 * l }),
    seconds: (l) => 60 * l,
  },
  university: {
    name: 'University',
    short: 'UNI',
    category: 'economy',
    description: 'Research is 10% faster nationally for each university (up to three). Needs a Large City.',
    maxLevel: 1,
    levelTiers: [3],
    cost: () => ({ money: 500, materials: 150 }),
    seconds: () => 150,
  },
  // --- Military ------------------------------------------------------------
  barracks: {
    name: 'Barracks',
    short: 'BRK',
    category: 'military',
    description: 'Recruits infantry, mountain troops and cavalry. +25% manpower here.',
    maxLevel: 1,
    cost: () => ({ money: 150, materials: 50 }),
    seconds: () => 45,
  },
  academy: {
    name: 'Military Academy',
    short: 'ACA',
    category: 'military',
    description: 'Recruits from this city start as Regulars instead of Green, and assault infantry can be raised here. Needs Barracks and a City.',
    maxLevel: 1,
    levelTiers: [2],
    cost: () => ({ money: 350, materials: 120 }),
    seconds: () => 100,
    requiresBuilding: 'barracks',
  },
  armsWorks: {
    name: 'Arms Works',
    short: 'ARM',
    category: 'military',
    description: 'Recruits field artillery, siege guns and anti-tank guns. +10% materials here.',
    maxLevel: 1,
    cost: () => ({ money: 300, materials: 150 }),
    seconds: () => 90,
  },
  motorPool: {
    name: 'Motor Works',
    short: 'MOT',
    category: 'military',
    description: 'Builds lorries and armoured cars: recruits armoured cars, and motorised infantry together with Barracks.',
    maxLevel: 1,
    cost: () => ({ money: 300, materials: 160 }),
    seconds: () => 90,
  },
  tankWorks: {
    name: 'Tank Works',
    short: 'TNK',
    category: 'military',
    description: 'Recruits light, battle and heavy tanks and tank destroyers. Requires Arms Works.',
    maxLevel: 1,
    cost: () => ({ money: 450, materials: 250 }),
    seconds: () => 150,
    requiresBuilding: 'armsWorks',
  },
  // --- Civic ---------------------------------------------------------------
  hospital: {
    name: 'Military Hospital',
    short: 'HOS',
    category: 'civic',
    description: 'Armies here heal 2.5× and regain morale twice as fast. +3 morale here.',
    maxLevel: 1,
    cost: () => ({ money: 250, materials: 100 }),
    seconds: () => 75,
  },
  propaganda: {
    name: 'Propaganda Bureau',
    short: 'PRO',
    category: 'civic',
    description: '+10 morale here and +2 morale in all your core provinces (up to three bureaus). Needs a City.',
    maxLevel: 1,
    levelTiers: [2],
    cost: () => ({ money: 300, materials: 80 }),
    seconds: () => 80,
  },
  garrisonHq: {
    name: 'Occupation HQ',
    short: 'OHQ',
    category: 'civic',
    description: 'Administers conquered land: +20 morale in an occupied province, and enemies take 50% longer to capture it.',
    maxLevel: 1,
    cost: () => ({ money: 250, materials: 120 }),
    seconds: () => 60,
    occupiedOnly: true,
  },
  // --- Infrastructure (no slot) ---------------------------------------------
  fortifications: {
    name: 'Fortifications',
    short: 'FRT',
    category: 'infrastructure',
    description: 'Each level: defenders here take 12% less damage and capture takes 10 s longer.',
    maxLevel: 3,
    cost: (l) => ({ money: 180 * l, materials: 140 * l }),
    seconds: (l) => 60 * l,
  },
  supplyDepot: {
    name: 'Supply Depot',
    short: 'DEP',
    category: 'infrastructure',
    description: 'A supply hub. Armies connected to a hub through owned territory stay supplied.',
    maxLevel: 1,
    cost: () => ({ money: 200, materials: 100 }),
    seconds: () => 60,
  },
  railway: {
    name: 'Railway Junction',
    short: 'RLY',
    category: 'infrastructure',
    description: 'Marches to or from this province are 20% faster (35% between two junctions). Front-line supply reaches one province further from here.',
    maxLevel: 1,
    cost: () => ({ money: 350, materials: 200 }),
    seconds: () => 120,
  },
  coastalBattery: {
    name: 'Coastal Batteries',
    short: 'CST',
    category: 'infrastructure',
    description: 'Each level: defenders deal +30% damage to armies that landed by sea and shake their morale. Only where a sea crossing lands.',
    maxLevel: 2,
    cost: (l) => ({ money: 250 * l, materials: 200 * l }),
    seconds: (l) => 90 * l,
    coastalOnly: true,
  },
};

export const BUILDING_EFFECTS = {
  industryMoneyPerLevel: 0.3,
  industryMaterialsPerLevel: 0.6,
  marketMoneyPerLevel: 0.35,
  powerPlantLocal: 0.2,
  powerPlantAdjacentMaterials: 0.1,
  housingManpowerPerLevel: 0.12,
  housingMoralePerLevel: 3,
  housingGrowthPerLevel: 0.4,
  universityResearch: 0.1,
  universityMax: 3,
  barracksManpower: 0.25,
  armsWorksMaterials: 0.1,
  refineryOilFuelPerLevel: 12,
  refinerySyntheticFuelPerLevel: 6,
  hospitalHealing: 2.5,
  hospitalMoraleRecovery: 2,
  hospitalMorale: 3,
  propagandaLocal: 10,
  propagandaNational: 2,
  propagandaMax: 3,
  garrisonHqMorale: 20,
  garrisonHqCapture: 1.5,
  fortDamageReductionPerLevel: 0.12,
  fortCaptureSecondsPerLevel: 10,
  railwayLeg: 0.2,
  coastalBatteryDamagePerLevel: 0.3,
};

export const BUILDING_ORDER: BuildingType[] = [
  'industry',
  'market',
  'powerPlant',
  'refinery',
  'housing',
  'university',
  'barracks',
  'academy',
  'armsWorks',
  'motorPool',
  'tankWorks',
  'hospital',
  'propaganda',
  'garrisonHq',
  'fortifications',
  'supplyDepot',
  'railway',
  'coastalBattery',
];

export const CITY = {
  tierNames: ['', 'Town', 'City', 'Large City', 'Metropolis', 'World City'] as const,
  /** City building slots per tier. */
  slots: [0, 3, 4, 5, 7, 8] as const,
  /** Growth points needed to reach the next tier (index = current tier). */
  growthToNext: [0, 25, 40, 60, 90, Infinity] as const,
  /** Population multiplier per tier, relative to tier 1. */
  populationScale: [0, 1, 1.6, 2.6, 4, 6] as const,
  /** Money and manpower bonus per tier above the starting tier. */
  outputPerTier: 0.1,
  /** Growth points per minute from high (≥ 60) or low (< 35) morale. */
  moraleGrowth: 0.25,
  /** Growth points per minute while a battle rages in the province. */
  battleGrowth: -2,
  /** Growth points lost when the province is captured. */
  captureGrowthLoss: 10,
  /** Each tier above Town makes capture this much slower (urban warfare). */
  captureTimePerTier: 0.08,
};

export function slotsUsed(buildings: Partial<Record<BuildingType, number>>, construction: BuildingType | null): number {
  let used = 0;
  for (const [b, lvl] of Object.entries(buildings) as [BuildingType, number][]) {
    if ((lvl ?? 0) > 0 && BUILDINGS[b].category !== 'infrastructure') used++;
  }
  if (construction && BUILDINGS[construction].category !== 'infrastructure' && !(buildings[construction] ?? 0)) used++;
  return used;
}
