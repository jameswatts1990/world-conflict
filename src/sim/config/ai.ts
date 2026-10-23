// Computer opponent tuning.
import type { AiDifficulty, AiOpening, GameState, PowerTier } from '../types';

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
  /** Defenders wanted per unit of threat on a frontier province, and per unit of danger around the capital. */
  defenceFactor: number;
  /** Battles are fought to the death: pull out of a hopeless one (see AI.retreatOdds) only once morale is this low. */
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
  /**
   * Fights a war on several fronts by interior lines: concentrates its offensives and reserves on one main enemy,
   * holds the other fronts, settles the main front once it has its gains, and counts its railways when moving
   * armies between fronts.
   */
  interiorLines: boolean;
}

export const AI_LEVELS: Record<AiDifficulty, AiLevel> = {
  normal: {
    thinkIntervalSeconds: 8,
    armySize: 1,
    attackRatio: 1.15,
    maxCampaigns: 2,
    defenceFactor: 0.9,
    retreatMorale: 0.3,
    peaceGraceSeconds: 360,
    warAppetite: 1,
    maxWarsOnTarget: 2,
    targetNoise: 0.01,
    acceptPeaceRatio: 0.85,
    interiorLines: true,
  },
  // Slow to react, thin on the ground, cautious in attack, sloppy in defence,
  // late to fall back; later and rarer wars, no ganging up, quicker peace.
  easy: {
    thinkIntervalSeconds: 14,
    armySize: 0.75,
    attackRatio: 1.35,
    maxCampaigns: 1,
    defenceFactor: 0.7,
    retreatMorale: 0.2,
    peaceGraceSeconds: 720,
    warAppetite: 0.5,
    maxWarsOnTarget: 1,
    targetNoise: 0.3,
    acceptPeaceRatio: 1,
    interiorLines: false,
  },
};

export function aiLevel(state: GameState): AiLevel {
  return AI_LEVELS[state.settings.difficulty ?? 'normal'];
}

export const AI = {
  /**
   * No AI goes to war with a minor power (or invades a neutral state) before this, so a player has time to take a
   * neighbouring one first.
   */
  neutralGraceSeconds: 600,
  /** Added to the war score of a minor power for an AI that opens by expanding. */
  expandMinorBonus: 0.5,
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
  /** A winning AI settles once it holds this many of the enemy's core provinces, and the war is this old. */
  warAimProvinces: 2,
  warAimSeconds: 600,
  /** Choosing the main enemy on several fronts: weight of each of my home provinces it holds, of each of my claims it
   * holds, and how much better another enemy must look to replace the current one. */
  focusLiberate: 0.25,
  focusClaim: 0.15,
  focusStickiness: 1.25,
  /** Any power holding this many VP short of victory becomes everyone's target. */
  leaderAlarmVp: 3,
  /** Reserve kept back when spending (fraction of income per minute). */
  reserveMinutes: 0.5,
  /**
   * Army size cap: units per owned province, a flat reserve by power tier, and one unit per this much
   * money income a minute. A one-province minor power keeps a garrison of about seven behind its forts,
   * not a field army.
   */
  unitsPerProvince: 3,
  unitsFlat: { great: 8, major: 5, minor: 3 } as Record<PowerTier, number>,
  unitsPerIncome: 50,
  /** Share of money income that may go to upkeep (scaled up by aggression and war). */
  upkeepShare: 0.45,
  /** Danger to the capital from hostile armies two connections away, relative to those next door. */
  capitalDepth: 0.5,
  /** Danger to the capital from the armies of neighbouring powers still at peace (they could declare war). */
  peacetimeVigilance: 0.35,
  /** Largest army the AI forms by merging. */
  maxArmySize: 14,
  /** Armies below these do not attack; they rest first. */
  attackMorale: 0.5,
  attackStrength: 0.55,
  /** A new campaign target must beat the current one by this factor to replace it. */
  campaignStickiness: 1.25,
  /** Provinces across its land borders that each AI covets, drawn from the seed so that every campaign opens differently. */
  claims: 2,
  /** Extra value of a claimed province as a target (as much as lost core land). */
  claimValue: 14,
  /** Added to the war score of a power that holds one of my claims. */
  claimWarBonus: 0.5,
  /**
   * Openings drawn from the seed: how likely each is, and how many times the usual grace periods it waits
   * before a war of opportunity (peace) and before invading neutral states (neutrals).
   */
  openings: {
    strike: { weight: 0.35, peace: 1, neutrals: 1 },
    expand: { weight: 0.4, peace: 1.5, neutrals: 1 },
    build: { weight: 0.25, peace: 2, neutrals: 1.5 },
  } satisfies Record<AiOpening, { weight: number; peace: number; neutrals: number }>,
  /** Only pull out of a battle (and pay the withdrawal penalty) when our power there is below this share of the enemy's. */
  retreatOdds: 0.2,
  /** Fog of war: how far each think's sightings move the AI's estimate of a nation's armour share (0..1). */
  armourSightingWeight: 0.3,
};
