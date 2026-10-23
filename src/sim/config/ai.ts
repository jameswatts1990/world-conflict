// Computer opponent tuning. The numbers the AI weighs when it decides live here,
// so balance runs can try other values (`npm run balance -- --set AI.attackRatio=1.3`)
// and the tuner can search them (scripts/balance/space.ts; see docs/BALANCE.md).
import type { AiMemory, PowerTier, TechBranch, Terrain, UnitType } from '../types';

type Doctrine = AiMemory['doctrine'];

export const AI = {
  thinkIntervalSeconds: 8,
  /** Each computer opponent's personality is drawn from the seed: a minimum plus a random share of a span. */
  personality: {
    aggression: { min: 0.35, span: 0.6 },
    economyBias: { min: 0.3, span: 0.5 },
    /** Drawn with equal chances; list a doctrine twice to make it commoner. */
    doctrines: ['armour', 'infantry', 'artillery'] as Doctrine[],
  },
  /** No AI declares war on a nation before this many seconds have passed. */
  peaceGraceSeconds: 360,
  /** No AI invades neutral states before this. */
  neutralGraceSeconds: 120,
  maxConcurrentWars: 2,
  /** Only an AI more aggressive than this opens a second war, or invades neutral states while at war. */
  secondWarAggression: 0.7,
  /** Chance per think of looking for a war of opportunity: a base plus this much per point of aggression. */
  warChance: 0.02,
  warChancePerAggression: 0.05,
  /** No new war of opportunity while national morale is below this. */
  warMorale: 50,
  /** Required national strength ratio before declaring war. */
  warStrengthRatio: 1.1,
  /** ...moved by this much per point of aggression away from 0.5 (the bold need less)... */
  warRatioPerAggression: 0.5,
  /** ...and raised by this much while already at war. */
  secondWarRatio: 0.6,
  /** A nation already fighting this many wars is left alone: no pile-ons. */
  pileOnWars: 2,
  /** Each war a target is already fighting discounts its strength by this share. */
  distractedDiscount: 0.2,
  /** A war target's appeal is my strength ratio over it, plus this much per objective VP of its on my border... */
  prizePerVp: 0.08,
  /** ...plus this much when it is close to an objective victory. */
  leaderBonus: 0.5,
  /** Minor powers' appeal as war targets is their strength ratio times this (below 1 spares them; 1 treats them like anyone). */
  minorTargetWeight: 1,
  /** Any power holding this many VP short of victory becomes everyone's target. */
  leaderAlarmVp: 3,
  /** Its neighbours declare war on it with at least this share of its strength... */
  leaderWarRatio: 0.35,
  /** ...and do not sue it for peace while they keep this share. */
  leaderHoldRatio: 0.5,
  /** Accept peace when own strength falls below this fraction of the enemy's... */
  acceptPeaceRatio: 0.85,
  /** ...having lost ground, or with national morale below this. */
  losingMorale: 55,
  /** Accept peace when national morale falls below this. */
  acceptPeaceMorale: 40,
  /** Sue for peace when national morale falls below this. */
  offerPeaceMorale: 32,
  /** Offer peace when own strength falls below this fraction of the enemy's. */
  offerPeaceRatio: 0.6,
  /** Chance per think that a war-weary AI offers peace anyway. */
  wearyPeaceChance: 0.05,
  /** Chance per think that a war-weary AI fighting on two fronts offers peace on the worse one. */
  worstFrontPeaceChance: 0.1,
  /** Accept peace after this long at war regardless (war weariness). */
  warWearinessSeconds: 1500,
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
  /** Share of money income that may go to upkeep, plus this much per point of aggression... */
  upkeepShare: 0.45,
  upkeepPerAggression: 0.3,
  /** ...times this while at war. */
  warUpkeep: 1.25,
  /** Largest army the AI forms by merging. */
  maxArmySize: 14,
  /** Armies below these do not attack; they rest first. */
  attackMorale: 0.5,
  attackStrength: 0.55,
  /**
   * Strength needed to attack a province: the defenders' estimated power times this ratio, times
   * (attackCaution - aggression × attackAggression), plus a flat margin.
   */
  attackRatio: 1.15,
  attackCaution: 1.2,
  attackAggression: 0.4,
  attackMargin: 6,
  /** How much the AI expects each terrain to favour the defender when it sizes an attack or a garrison. */
  terrainDefence: { plains: 1, forest: 1.15, hills: 1.15, marsh: 1.1, mountains: 1.35, urban: 1.3 } as Record<Terrain, number>,
  /** Share of an enemy army next door that the AI expects to join the defence of a province it attacks. */
  reinforcementShare: 0.35,
  /**
   * What a province is worth as a target: a base, points per objective VP, one point per this much money and
   * materials output a minute, its city tier, and bonuses for a capital, a lost core province, and defenders
   * with no (or one) way out.
   */
  targetValue: { base: 5, perVp: 7, outputPer: 10, capital: 8, reclaimCore: 14, trapped: 10, oneEscape: 3 },
  /** Massing for an offensive stops once this multiple of the strength needed is on its way. */
  massingMargin: 1.15,
  /** Only pull out of a battle (and pay the withdrawal penalty) when our power there is below this share of the enemy's. */
  retreatOdds: 0.2,
  /** ...and only once the army's morale has sunk this low. */
  retreatMorale: 0.3,
  /** Defenders wanted per unit of threat on a frontier province. */
  defenceFactor: 0.9,
  /** Most offensives run at once. */
  maxCampaigns: 2,
  /** A new campaign target must beat the current one by this factor to replace it. */
  campaignStickiness: 1.25,
  /** Fog of war: how far each think's sightings move the AI's estimate of a nation's armour share (0..1). */
  armourSightingWeight: 0.3,
  /** Research priority each doctrine adds to the tech branches. */
  doctrineResearch: {
    armour: { armour: 4, logistics: 1.5, industry: 1 },
    infantry: { infantry: 4, society: 1.5, logistics: 1 },
    artillery: { artillery: 4, logistics: 1.5, infantry: 1 },
  } as Record<Doctrine, Partial<Record<TechBranch, number>>>,
  /** The army each doctrine aims for, as shares; types not yet researched fold into line infantry. */
  doctrineMix: {
    armour: { infantry: 0.3, motorised: 0.1, cavalry: 0.04, armouredCar: 0.05, artillery: 0.14, antiTank: 0.05, lightTank: 0.1, tank: 0.16, heavyTank: 0.03, tankDestroyer: 0.03 },
    infantry: { infantry: 0.42, stormtroopers: 0.1, mountain: 0.03, cavalry: 0.05, artillery: 0.18, antiTank: 0.07, tank: 0.1, lightTank: 0.03, motorised: 0.02 },
    artillery: { infantry: 0.4, stormtroopers: 0.04, cavalry: 0.04, artillery: 0.22, heavyArtillery: 0.1, antiTank: 0.08, tank: 0.08, tankDestroyer: 0.04 },
  } as Record<Doctrine, Partial<Record<UnitType, number>>>,
};
