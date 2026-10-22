// Computer opponent tuning.
import type { AiDifficulty, GameState } from '../types';

/** What changes with difficulty. Easier opponents get no fewer resources; they play worse. */
export interface AiLevel {
  /** Seconds between decisions: slower opponents react late. */
  thinkIntervalSeconds: number;
  /** Scales the army size the treasury and territory would support. */
  armySize: number;
  /** Required local strength ratio before attacking a province (scaled down by aggression). */
  attackRatio: number;
  /** Most offensives run at once. */
  maxCampaigns: number;
  /** Defenders wanted per unit of threat on a frontier province. */
  defenceFactor: number;
  /** In battle, pull back before routing when morale is this low and the enemy is not weaker. */
  retreatMorale: number;
  /** No war of opportunity before this many seconds have passed. */
  peaceGraceSeconds: number;
  /** Scales the chance per think of looking for a war of opportunity. */
  warAppetite: number;
  /** A nation already fighting this many wars is not attacked as well (the runaway leader aside). */
  maxWarsOnTarget: number;
  /** Random weight in choosing offensive targets: higher picks worse targets more often. */
  targetNoise: number;
  /** Accept peace when own strength falls below this fraction of the enemy's. */
  acceptPeaceRatio: number;
}

export const AI_LEVELS: Record<AiDifficulty, AiLevel> = {
  normal: {
    thinkIntervalSeconds: 8,
    armySize: 1,
    attackRatio: 1.15,
    maxCampaigns: 2,
    defenceFactor: 0.9,
    retreatMorale: 0.33,
    peaceGraceSeconds: 360,
    warAppetite: 1,
    maxWarsOnTarget: 2,
    targetNoise: 0.01,
    acceptPeaceRatio: 0.85,
  },
  // Slow to react, thin on the ground, cautious in attack, sloppy in defence,
  // late to fall back; later and rarer wars, no ganging up, quicker peace.
  easy: {
    thinkIntervalSeconds: 14,
    armySize: 0.75,
    attackRatio: 1.35,
    maxCampaigns: 1,
    defenceFactor: 0.7,
    retreatMorale: 0.22,
    peaceGraceSeconds: 720,
    warAppetite: 0.5,
    maxWarsOnTarget: 1,
    targetNoise: 0.3,
    acceptPeaceRatio: 1,
  },
};

export function aiLevel(state: GameState): AiLevel {
  return AI_LEVELS[state.settings.difficulty ?? 'normal'];
}

export const AI = {
  /** No AI invades neutral states before this, so a player has time to take a neighbouring one first. */
  neutralGraceSeconds: 600,
  maxConcurrentWars: 2,
  /** Required national strength ratio before declaring war. */
  warStrengthRatio: 1.1,
  /** Accept peace when national morale falls below this. */
  acceptPeaceMorale: 40,
  /** Sue for peace when national morale falls below this. */
  offerPeaceMorale: 32,
  /** Offer peace when own strength falls below this fraction of the enemy's. */
  offerPeaceRatio: 0.6,
  /** Chance per think that a war-weary AI offers peace anyway. */
  wearyPeaceChance: 0.05,
  /** Accept peace after this long at war regardless (war weariness). */
  warWearinessSeconds: 1500,
  /** Any power holding this many VP short of victory becomes everyone's target. */
  leaderAlarmVp: 3,
  /** Reserve kept back when spending (fraction of income per minute). */
  reserveMinutes: 0.5,
  /** Army size cap: units per owned province, a flat reserve, and one unit per this much money income a minute. */
  unitsPerProvince: 3,
  unitsFlat: 8,
  unitsPerIncome: 50,
  /** Share of money income that may go to upkeep (scaled up by aggression and war). */
  upkeepShare: 0.45,
  /** Largest army the AI forms by merging. */
  maxArmySize: 14,
  /** Armies below these do not attack; they rest first. */
  attackMorale: 0.5,
  attackStrength: 0.55,
  /** A new campaign target must beat the current one by this factor to replace it. */
  campaignStickiness: 1.25,
};
