// Economy, supply, combat, capture, diplomacy and victory rules.
import type { ConnectionKind, Terrain } from '../types';

export const ECONOMY = {
  /** Output factor for provinces that are not the owner's core territory. */
  nonCoreOutput: 0.5,
  /** Combat multiplier while the treasury cannot pay upkeep. */
  unpaidCombatMult: 0.8,
  /** Tank combat and speed multiplier while out of fuel. */
  noFuelTankMult: 0.5,
  /** Share of the price refunded when a construction or recruitment that has started is cancelled (unstarted: all). */
  startedJobRefund: 0.5,
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
};

export const MOVEMENT = {
  /** Extra time multiplier by connection type. */
  connection: { land: 1, mountain: 1.6, strait: 2.2 } satisfies Record<ConnectionKind, number>,
  /** Extra time multiplier by destination terrain. */
  terrain: { plains: 1, forest: 1.1, hills: 1.15, mountains: 1.35, urban: 1, marsh: 1.25 } satisfies Record<Terrain, number>,
  /** Road distance is longer than the great-circle distance. */
  routeFactor: 1.15,
};

export const CAPTURE = {
  baseSeconds: 20,
  capitalMult: 1.5,
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
  score: { perVp: 10, perProvince: 3, perTech: 2 },
};
