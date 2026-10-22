// Computer opponent tuning.
export const AI = {
  thinkIntervalSeconds: 8,
  /** No AI declares war on a nation before this many seconds have passed. */
  peaceGraceSeconds: 360,
  /** No AI invades neutral states before this. */
  neutralGraceSeconds: 120,
  maxConcurrentWars: 2,
  /** Required local strength ratio before attacking a province (scaled down by aggression). */
  attackRatio: 1.15,
  /** Required national strength ratio before declaring war. */
  warStrengthRatio: 1.1,
  /** Accept peace when own strength falls below this fraction of the enemy's. */
  acceptPeaceRatio: 0.85,
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
  /** In battle, pull back before routing when morale is this low and the enemy is not weaker. */
  retreatMorale: 0.33,
  /** Defenders wanted per unit of threat on a frontier province. */
  defenceFactor: 0.9,
  /** Most offensives run at once. */
  maxCampaigns: 2,
  /** A new campaign target must beat the current one by this factor to replace it. */
  campaignStickiness: 1.25,
};
