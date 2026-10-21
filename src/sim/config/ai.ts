// Computer opponent tuning.
export const AI = {
  thinkIntervalSeconds: 8,
  /** No AI declares war on a nation before this many seconds have passed. */
  peaceGraceSeconds: 360,
  /** No AI invades neutral states before this. */
  neutralGraceSeconds: 120,
  maxConcurrentWars: 2,
  /** Required local strength ratio before attacking a province. */
  attackRatio: 1.35,
  /** Required national strength ratio before declaring war. */
  warStrengthRatio: 1.1,
  /** Accept peace when own strength falls below this fraction of the enemy's. */
  acceptPeaceRatio: 0.85,
  /** Offer peace when own strength falls below this fraction of the enemy's. */
  offerPeaceRatio: 0.6,
  /** Chance per think that a war-weary AI offers peace anyway. */
  wearyPeaceChance: 0.05,
  /** Accept peace after this long at war regardless (war weariness). */
  warWearinessSeconds: 1500,
  /** Reserve kept back when spending (fraction of income per minute). */
  reserveMinutes: 0.5,
};
