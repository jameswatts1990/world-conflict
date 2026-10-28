// Economy, supply, combat, capture, diplomacy and victory rules.
import type { ConnectionKind, Terrain } from '../types';

export const ECONOMY = {
  /** Base output per minute of every province of land without a city (Standard speed), before morale and occupation. */
  landOutput: { money: 3, materials: 0, manpower: 1, fuel: 0, fusion: 0 },
  /** Occupied populations rarely enlist: manpower factor on top of the morale effect. */
  occupiedManpower: 0.4,
  /** Combat multiplier while the treasury cannot pay upkeep. */
  unpaidCombatMult: 0.8,
  /** Combat and speed multiplier for fuel-burning units while out of fuel. */
  noFuelVehicleMult: 0.5,
  /** Combat multipliers while out of materials (no shells or spares): guns and armour, and every other unit. */
  noMaterialsHeavyMult: 0.6,
  noMaterialsMult: 0.9,
  /** Out of manpower (no replacements): units regain no strength, and morale recovers this much as fast. */
  noManpowerMoraleRecovery: 0.5,
  /** Share of the price refunded when a construction or recruitment that has started is cancelled (unstarted: all). */
  startedJobRefund: 0.5,
};

// Morale works on three levels. Units have morale (0..1) that breaks before
// they are destroyed; provinces have civilian morale (0..100) that drives
// output; national morale is the home-front average.
export const MORALE = {
  // --- Units ---
  /** Morale lost per unit of hp-fraction damage, before shock and resilience. */
  hitFactor: 1.3,
  /** Defenders on their own ground hold their nerve better. */
  defenderResilience: 1.3,
  /**
   * Armies fighting on their own nation's home soil, defending or liberating it, hit harder and hold firmer: by up
   * to this much, scaled by national morale from nothing at `homeSoilFrom` to all of it at `homeSoilFull`.
   */
  homeSoil: 0.2,
  homeSoilFrom: 30,
  homeSoilFull: 90,
  /** Base morale drain per combat round, scaled by how outnumbered the army is. */
  roundDrain: 0.012,
  /** Morale lost by the rest of an army each time one of its units is destroyed. */
  lossShock: 0.03,
  /** Firepower at zero morale (scales linearly to 1 at full morale). Armies never break: they fight to the death. */
  firepowerFloor: 0.5,
  /** Strength (absolute) lost by every unit of an army ordered out of a battle (halved with recon); units it kills are left behind. */
  retreatLoss: 0.15,
  /** Morale lost by every unit of an army withdrawing under fire. */
  retreatMoraleShock: 0.1,
  /** An army set to fall back withdraws on its own when its strength-weighted morale drops below this. */
  autoRetreatAt: 0.25,
  /** Neutral garrisons defend their homeland stubbornly. */
  neutralResilience: 1.4,
  /** Morale regained per army upkeep step out of combat. */
  recoverPerStep: 0.05,
  /** Recovery multiplier in supplied home territory. */
  homeRecovery: 1.5,
  /** Recovery multiplier while marching. */
  marchingRecovery: 0.5,
  /** Morale lost per step when starving. */
  starvingDrain: 0.02,
  /** Unit morale cap = clamp(capBase + capPerNationalMorale * national morale, capMin, 1). */
  capBase: 0.45,
  capPerNationalMorale: 0.0085,
  capMin: 0.5,
  /** New recruits start at this share of the cap. */
  recruitShare: 0.85,

  // --- Provinces (0..100) ---
  start: 70,
  coreBase: 70,
  occupiedBase: 25,
  /** Own army stationed in an occupied province. */
  garrison: 12,
  /** Integration of occupied land: per minute owned, up to the max. */
  integrationPerMinute: 0.5,
  integrationMax: 15,
  perWar: -4,
  /** War weariness starts after this many minutes of the longest current war. */
  wearinessAfterMinutes: 10,
  wearinessPerMinute: -0.25,
  wearinessMax: -15,
  enemyAdjacent: -10,
  battle: -20,
  unsupplied: -10,
  capitalLost: -20,
  moneyShortage: -8,
  /** Morale moves towards its target by up to this much per update step. */
  driftPerStep: 1,
  /** Output multiplier = clamp(outputFloor + (1 - outputFloor) * morale / outputPivot, outputFloor, outputCap). */
  outputFloor: 0.35,
  outputPivot: 70,
  outputCap: 1.2,

  // --- Immediate shocks ---
  capturedOccupied: 25,
  capturedLiberated: 45,
  captureNeighbourShock: -8,
  capitalLostShock: -15,
  declareWarShock: -3,
  rallyShock: 2,
};

export const SUPPLY = {
  /** Armies this many connections away from supplied territory still count as supplied. */
  frontlineRange: 1,
  unsuppliedCombatMult: 0.75,
  /** Seconds out of supply before attrition starts. */
  attritionGraceSeconds: 120,
  /** Strength lost per army upkeep step while starving. */
  attritionPerStep: 0.015,
  /** Strength regained per army upkeep step while resting in supplied home territory. */
  healPerStep: 0.012,
  /** Railway junctions extend front-line supply by this many connections. */
  railwayRange: 1,
};

export const MOVEMENT = {
  /** Extra time multiplier by connection type. */
  connection: { land: 1, mountain: 1.6, strait: 2.2 } satisfies Record<ConnectionKind, number>,
  /** Extra time multiplier by destination terrain. */
  terrain: { plains: 1, forest: 1.1, hills: 1.15, mountains: 1.35, urban: 1, marsh: 1.25 } satisfies Record<Terrain, number>,
  /** Road distance is longer than the great-circle distance. */
  routeFactor: 1.15,
  /** A leg never takes less than this many seconds... */
  minLegSeconds: 15,
  /** ...except out of a city into a land round it, or back: at least this long. */
  minGateSeconds: 5,
};

export const CAPTURE = {
  baseSeconds: 20,
  capitalMult: 1.5,
  /** Open land, with no city to fight through, falls this much faster (forts still count in full). */
  landMult: 0.5,
};

/** Fog of war: how far, in connections, a nation's provinces and armies see. */
export const SIGHT = {
  /**
   * Every province a nation holds sees its own region (a city and the lands round it count as one step) and the
   * provinces just over its border.
   */
  province: 1,
  /** ...and picks up radar blips this many steps out: unknown armies, their rough size and nothing else. */
  provinceDetect: 2,
  /**
   * How far a unit sees when its type sets no `sight` (`UNITS`): 0, the province its army stands in (in a city the
   * lands round it too, on a land the city it lies round). An army sees as far as its best-sighted unit.
   */
  unit: 0,
  /** How many steps further than it sees a unit picks up radar blips, when its type sets no `detect`. */
  detectBeyond: 1,
  /** A radar blip is medium from this many units (all the hidden armies in the province together), large from the next. */
  blipUnits: { medium: 4, large: 8 },
  /** Sea crossings up to this wide (coast to coast) are watched like a mountain border: the far shore, nothing beyond. Wider seas hide everything. */
  seaKm: 110,
};

export const DIPLOMACY = {
  /** A war must last this long before peace can be offered. */
  minWarSecondsBeforePeace: 180,
  /** After peace, neither side can declare war for this long. */
  truceSeconds: 300,
  peaceOfferExpirySeconds: 90,
  /** After an offer is rejected or expires, the offering side waits this long before proposing again. */
  peaceRetrySeconds: 240,
};

export const VICTORY = {
  /** Share of all objective victory points needed for an objective victory. */
  objectiveShare: 0.4,
  /** Objective threshold must be held continuously this long. */
  holdSeconds: 90,
  /** A city and the land round it together score what one province did before cities were split out (each of its lands a share of perLand). */
  score: { perVp: 10, perCity: 2, perLand: 1, perTech: 2 },
};
