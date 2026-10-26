// Computer opponent tuning. The numbers the AI weighs when it decides live here,
// so balance runs can try other values (`npm run balance -- --set AI_LEVELS.normal.attackRatio=1.3`)
// and the tuner can search them (scripts/balance/space.ts; see docs/BALANCE.md).
import type { AiDifficulty, AiMemory, AiOpening, GameState, PowerTier, ResourceKey, TechBranch, Terrain, UnitType } from '../types';

type Doctrine = AiMemory['doctrine'];

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
  /**
   * Uses forward positions on the roads: an offensive masses on the roads into its target, just short of the
   * border, and the armies guarding a front stand forward on the road towards the most dangerous enemy land.
   */
  forwardPositions: boolean;
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
    forwardPositions: true,
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
    forwardPositions: false,
  },
};

export function aiLevel(state: GameState): AiLevel {
  return AI_LEVELS[state.settings.difficulty ?? 'normal'];
}

export const AI = {
  /** Each computer opponent's personality is drawn from the seed: a minimum plus a random share of a span. */
  personality: {
    aggression: { min: 0.35, span: 0.6 },
    economyBias: { min: 0.3, span: 0.5 },
    /** Drawn with equal chances; list a doctrine twice to make it commoner. */
    doctrines: ['armour', 'infantry', 'artillery'] as Doctrine[],
  },
  /**
   * No AI goes to war with a minor power (or invades a neutral state) before this, so a player has time to take a
   * neighbouring one first.
   */
  neutralGraceSeconds: 600,
  /** Added to the war score of a minor power for an AI that opens by expanding. */
  expandMinorBonus: 0.5,
  maxConcurrentWars: 2,
  /** Only an AI more aggressive than this opens a second war, or invades neutral states while at war. */
  secondWarAggression: 0.7,
  /** Chance per think of looking for a war of opportunity: a base plus this much per point of aggression (times the level's appetite). */
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
  /** Each war a target is already fighting discounts its strength by this share. */
  distractedDiscount: 0.2,
  /** A war target's appeal is my strength ratio over it, plus this much per objective VP of its on my border... */
  prizePerVp: 0.08,
  /** ...plus this much when it is close to an objective victory. */
  leaderBonus: 0.5,
  /** Minor powers' appeal as war targets is their strength ratio times this (below 1 spares them; 1 treats them like anyone). */
  minorTargetWeight: 1,
  /** An AI weaker than its enemy (below the level's acceptPeaceRatio) accepts peace once it has lost ground, or with national morale below this. */
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
  /**
   * A winning AI settles once it holds this many of the enemy's home cities, and the war is this old; the home land
   * round a city, without the city, counts as `warAimLandShare` of it there, and as `landShare` wherever the AI
   * weighs who is winning a war (shared between the lands round the city).
   */
  warAimProvinces: 2,
  warAimLandShare: 0,
  landShare: 0.5,
  warAimSeconds: 600,
  /** Choosing the main enemy on several fronts: weight of each of my home provinces it holds, of each of my claims it
   * holds, and how much better another enemy must look to replace the current one. */
  focusLiberate: 0.25,
  focusClaim: 0.15,
  focusStickiness: 1.25,
  /** Any power holding this many VP short of victory becomes everyone's target. */
  leaderAlarmVp: 3,
  /** Its neighbours declare war on it with at least this share of its strength... */
  leaderWarRatio: 0.35,
  /** ...and do not sue it for peace while they keep this share. */
  leaderHoldRatio: 0.5,
  /** Reserve kept back when spending (fraction of income per minute). */
  reserveMinutes: 0.5,
  /**
   * Army size cap: units per owned city, a flat reserve by power tier, and one unit per this much
   * money income a minute. A one-city minor power keeps a garrison of about seven behind its forts,
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
  /** Share of each other resource's income that may go to upkeep (times `warUpkeep` at war): a unit is not raised past it. */
  upkeepShares: { materials: 0.6, fuel: 0.85, manpower: 0.6 } as Record<Exclude<ResourceKey, 'money'>, number>,
  /** Upkeep above this share of a resource's income makes the AI stand units down, until it is back to `standDownTo`. */
  standDownAt: 1.05,
  standDownTo: 0.9,
  /**
   * A materials stockpile worth more than `from` minutes of materials income tilts the army mix towards guns and armour,
   * up to `max` (their shares × (1 + max)) at `full` minutes: a nation rich in materials fields a heavier army.
   */
  materialsLean: { from: 6, full: 18, max: 1 },
  /**
   * Building on land without a city (its one building). Base scores of the economy buildings, plus `need` times how short
   * the resource it makes is (upkeep near its income, or under `storeMinutes` of it in store); defensive works and field hospitals at war; a land's building is replaced only by a
   * military or infrastructure need scoring at least `replaceScore`, and only if it is an economy or civic one.
   */
  /**
   * Laboratories (the Fusion research is paid in): a base score, plus `fusionNeed` times how short of Fusion it runs,
   * times (1 + economy bias), divided by (1 + `perLevel` × the level already built).
   */
  research: { laboratory: 10, fusionNeed: 10, perLevel: 0.6 },
  land: {
    farm: 8,
    tradingPost: 7,
    workshops: 5,
    oilWells: 20,
    fieldStation: 5,
    need: 8,
    /** A resource with less than this many minutes of its income in store counts as short. */
    storeMinutes: 5,
    bunkers: 13,
    fieldHospital: 9,
    fieldHospitals: 3,
    replaceScore: 12,
    /** Each farm, trading post or workshop already held divides the score of another by (1 + this). */
    spread: 0.15,
  },
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
  /**
   * Strength needed to attack a province: the defenders' estimated power times the level's attack ratio, times
   * (attackCaution - aggression × attackAggression), plus a flat margin.
   */
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
   * with no (or one) way out. Land is also worth this share of what the city in its middle is worth.
   */
  targetValue: { base: 5, perVp: 7, outputPer: 10, capital: 8, reclaimCore: 14, trapped: 10, oneEscape: 3, cityBehind: 0.5 },
  /** Massing for an offensive stops once this multiple of the strength needed is on its way. */
  massingMargin: 1.15,
  /**
   * Forward positions stand this share of the way from a land's crossroads to the border along the road (at 0.75,
   * offensives struck so much sooner that the weakest powers fell more often).
   */
  forwardDepth: 0.5,
  /**
   * A forward screen turns to face another enemy land only when the danger there is this many times the danger it
   * faces, and than its own strength.
   */
  screenSwitch: 1.5,
  /**
   * Seconds an army at a forward position (a screen, or an offensive massing on a road) keeps the facing it took,
   * march included, before it may turn to another road.
   */
  forwardHold: 300,
  /** The danger down a road counts the enemy land at its end and its city in full, and the lands behind it at this share. */
  screenBeyond: 0.5,
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
