// Buildings. Costs and build times are per level being built.
// In a city, economy, military and civic buildings occupy a building slot (the
// number of slots grows with the city tier); infrastructure does not. Land
// without a city holds one building, infrastructure included (`landSite`).
import type { BuildingCategory, BuildingType, CityTier, PartialResources } from '../types';

export interface BuildingConfig {
  name: string;
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
  /** Only on land without a city (the land's one building). */
  landOnly?: boolean;
  /** Only in the land round a city with an oil field. */
  oilLand?: boolean;
}

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
  // Land without a city (flat output per minute, before morale and occupation).
  farmManpower: 2,
  farmMoney: 1,
  tradingPostMoney: 4,
  workshopsMaterials: 5,
  oilWellsFuel: 4,
  fieldHospitalHealing: 2,
  fieldHospitalMoraleRecovery: 1.5,
  bunkersDamage: 0.2,
  fieldStationFusion: 1,
  laboratoryFusionPerLevel: 4,
  universityFusion: 3,
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const E = BUILDING_EFFECTS;

export const BUILDINGS: Record<BuildingType, BuildingConfig> = {
  // --- Economy -------------------------------------------------------------
  industry: {
    name: 'Industrial Works',
    category: 'economy',
    description: `Each level: +${pct(E.industryMoneyPerLevel)} money and +${pct(E.industryMaterialsPerLevel)} materials here. Level 2 needs a City, level 3 a Large City.`,
    maxLevel: 3,
    levelTiers: [1, 2, 3],
    cost: (l) => ({ money: 225 * l, materials: 130 * l }),
    seconds: (l) => 75 + 45 * l,
  },
  market: {
    name: 'Commercial Exchange',
    category: 'economy',
    description: `Banks and trading houses. Each level: +${pct(E.marketMoneyPerLevel)} money here. Needs a City; level 2 a Large City.`,
    maxLevel: 2,
    levelTiers: [2, 3],
    cost: (l) => ({ money: 270 * l, materials: 65 * l }),
    seconds: (l) => 60 + 40 * l,
  },
  powerPlant: {
    name: 'Power Station',
    category: 'economy',
    description: `Electrifies industry: +${pct(E.powerPlantLocal)} money and materials here and +${pct(E.powerPlantAdjacentMaterials)} materials in every adjacent province you own.`,
    maxLevel: 1,
    levelTiers: [2],
    cost: () => ({ money: 360, materials: 240 }),
    seconds: () => 120,
    requiresBuilding: 'industry',
  },
  refinery: {
    name: 'Fuel Refinery',
    category: 'economy',
    description: `Each level: +${E.refineryOilFuelPerLevel} fuel/min on oil fields, or +${E.refinerySyntheticFuelPerLevel} fuel/min anywhere with Synthetic Fuel research.`,
    maxLevel: 2,
    cost: (l) => ({ money: 270 * l, materials: 200 * l }),
    seconds: (l) => 90 * l,
  },
  housing: {
    name: 'Housing Estates',
    category: 'economy',
    description: `Each level: +${pct(E.housingManpowerPerLevel)} manpower, +${E.housingMoralePerLevel} morale and faster city growth here. Level 3 needs a City.`,
    maxLevel: 3,
    levelTiers: [1, 1, 2],
    cost: (l) => ({ money: 160 * l, materials: 100 * l }),
    seconds: (l) => 60 * l,
  },
  university: {
    name: 'University',
    category: 'economy',
    description: `+${E.universityFusion} Fusion a minute here, and research is ${pct(E.universityResearch)} faster nationally for each university (up to ${E.universityMax}). Needs a Large City.`,
    maxLevel: 1,
    levelTiers: [3],
    cost: () => ({ money: 450, materials: 165 }),
    seconds: () => 150,
  },
  laboratory: {
    name: 'Laboratory',
    category: 'economy',
    description: `Each level: +${E.laboratoryFusionPerLevel} Fusion a minute here, the research resource. Level 2 needs a City, level 3 a Large City.`,
    maxLevel: 3,
    levelTiers: [1, 2, 3],
    cost: (l) => ({ money: 200 * l, materials: 120 * l }),
    seconds: (l) => 60 + 40 * l,
  },
  // --- Military ------------------------------------------------------------
  barracks: {
    name: 'Barracks',
    category: 'military',
    description: `Recruits infantry, mountain troops and cavalry. +${pct(E.barracksManpower)} manpower here.`,
    maxLevel: 1,
    cost: () => ({ money: 135, materials: 55 }),
    seconds: () => 45,
  },
  academy: {
    name: 'Military Academy',
    category: 'military',
    description: 'Recruits from this city start as Regulars instead of Green, and assault infantry can be raised here. Needs Barracks and a City.',
    maxLevel: 1,
    levelTiers: [2],
    cost: () => ({ money: 315, materials: 130 }),
    seconds: () => 100,
    requiresBuilding: 'barracks',
  },
  armsWorks: {
    name: 'Arms Works',
    category: 'military',
    description: `Recruits field artillery, siege guns and anti-tank guns. +${pct(E.armsWorksMaterials)} materials here.`,
    maxLevel: 1,
    cost: () => ({ money: 270, materials: 165 }),
    seconds: () => 90,
  },
  motorPool: {
    name: 'Motor Works',
    category: 'military',
    description: 'Builds lorries and armoured cars: recruits armoured cars, and motorised infantry together with Barracks.',
    maxLevel: 1,
    cost: () => ({ money: 270, materials: 175 }),
    seconds: () => 90,
  },
  tankWorks: {
    name: 'Tank Works',
    category: 'military',
    description: 'Recruits light, battle and heavy tanks and tank destroyers. Requires Arms Works.',
    maxLevel: 1,
    cost: () => ({ money: 405, materials: 275 }),
    seconds: () => 150,
    requiresBuilding: 'armsWorks',
  },
  // --- Civic ---------------------------------------------------------------
  hospital: {
    name: 'Military Hospital',
    category: 'civic',
    description: `Armies here heal ${E.hospitalHealing}× and regain morale ${E.hospitalMoraleRecovery}× as fast. +${E.hospitalMorale} morale here.`,
    maxLevel: 1,
    cost: () => ({ money: 225, materials: 110 }),
    seconds: () => 75,
  },
  propaganda: {
    name: 'Propaganda Bureau',
    category: 'civic',
    description: `+${E.propagandaLocal} morale here and +${E.propagandaNational} morale in all your core provinces (up to ${E.propagandaMax} bureaus). Needs a City.`,
    maxLevel: 1,
    levelTiers: [2],
    cost: () => ({ money: 270, materials: 90 }),
    seconds: () => 80,
  },
  garrisonHq: {
    name: 'Occupation HQ',
    category: 'civic',
    description: `Administers conquered land: +${E.garrisonHqMorale} morale in an occupied province, and enemies take ${pct(E.garrisonHqCapture - 1)} longer to capture it.`,
    maxLevel: 1,
    cost: () => ({ money: 225, materials: 130 }),
    seconds: () => 60,
    occupiedOnly: true,
  },
  // --- Land without a city (its one building) ------------------------------
  farm: {
    name: 'Farmland',
    category: 'economy',
    description: `Farms and villages: +${E.farmManpower} manpower and +${E.farmMoney} money a minute here.`,
    maxLevel: 1,
    cost: () => ({ money: 70, materials: 50 }),
    seconds: () => 45,
    landOnly: true,
  },
  tradingPost: {
    name: 'Trading Post',
    category: 'economy',
    description: `A market town: +${E.tradingPostMoney} money a minute here.`,
    maxLevel: 1,
    cost: () => ({ money: 90, materials: 60 }),
    seconds: () => 45,
    landOnly: true,
  },
  workshops: {
    name: 'Workshops',
    category: 'economy',
    description: `Mills, mines and foundries: +${E.workshopsMaterials} materials a minute here.`,
    maxLevel: 1,
    cost: () => ({ money: 60, materials: 60 }),
    seconds: () => 50,
    landOnly: true,
  },
  oilWells: {
    name: 'Oil Wells',
    category: 'economy',
    description: `Derricks on the oil field: +${E.oilWellsFuel} fuel a minute here. Only in the land round a city with an oil field.`,
    maxLevel: 1,
    cost: () => ({ money: 90, materials: 90 }),
    seconds: () => 60,
    landOnly: true,
    oilLand: true,
  },
  fieldHospital: {
    name: 'Field Hospital',
    category: 'military',
    description: `Tents and dressing stations: armies here heal ${E.fieldHospitalHealing}× and regain morale ${E.fieldHospitalMoraleRecovery}× as fast.`,
    maxLevel: 1,
    cost: () => ({ money: 70, materials: 60 }),
    seconds: () => 45,
    landOnly: true,
  },
  bunkers: {
    name: 'Bunkers',
    category: 'military',
    description: `Pillboxes and machine-gun nests: defenders here deal ${pct(E.bunkersDamage)} more damage.`,
    maxLevel: 1,
    cost: () => ({ money: 70, materials: 90 }),
    seconds: () => 50,
    landOnly: true,
  },
  fieldStation: {
    name: 'Field Station',
    category: 'civic',
    description: `Agricultural and engineering trials: +${E.fieldStationFusion} Fusion a minute here.`,
    maxLevel: 1,
    cost: () => ({ money: 100, materials: 60 }),
    seconds: () => 60,
    landOnly: true,
  },
  // --- Infrastructure (no slot in a city) ------------------------------------
  fortifications: {
    name: 'Fortifications',
    category: 'infrastructure',
    description: `Each level: defenders here take ${pct(E.fortDamageReductionPerLevel)} less damage and capture takes ${E.fortCaptureSecondsPerLevel} s longer.`,
    maxLevel: 3,
    cost: (l) => ({ money: 160 * l, materials: 155 * l }),
    seconds: (l) => 60 * l,
  },
  supplyDepot: {
    name: 'Supply Depot',
    category: 'infrastructure',
    description: 'A supply hub. Armies connected to a hub through owned territory stay supplied.',
    maxLevel: 1,
    cost: () => ({ money: 180, materials: 110 }),
    seconds: () => 60,
  },
  railway: {
    name: 'Railway Junction',
    category: 'infrastructure',
    description: `Marches to or from this province are ${pct(E.railwayLeg)} faster (${pct(E.railwayLeg * 1.75)} between two junctions). Front-line supply reaches one province further from here.`,
    maxLevel: 1,
    cost: () => ({ money: 315, materials: 220 }),
    seconds: () => 120,
  },
  coastalBattery: {
    name: 'Coastal Batteries',
    category: 'infrastructure',
    description: `Each level: defenders deal +${pct(E.coastalBatteryDamagePerLevel)} damage to armies that landed by sea and shake their morale. Only where a sea crossing lands.`,
    maxLevel: 2,
    cost: (l) => ({ money: 225 * l, materials: 220 * l }),
    seconds: (l) => 90 * l,
    coastalOnly: true,
  },
};

export const BUILDING_ORDER: BuildingType[] = [
  'industry',
  'market',
  'powerPlant',
  'refinery',
  'housing',
  'university',
  'laboratory',
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
  'farm',
  'tradingPost',
  'workshops',
  'oilWells',
  'fieldHospital',
  'bunkers',
  'fieldStation',
];

/** Can this building stand on land without a city? Infrastructure and the land buildings can. */
export function landSite(building: BuildingType): boolean {
  return BUILDINGS[building].category === 'infrastructure' || BUILDINGS[building].landOnly === true;
}

/** What a land already holds (one building; older saves may hold several pieces of infrastructure). */
export function landBuildings(buildings: Partial<Record<BuildingType, number>>): BuildingType[] {
  return (Object.keys(buildings) as BuildingType[]).filter((b) => (buildings[b] ?? 0) > 0);
}

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
