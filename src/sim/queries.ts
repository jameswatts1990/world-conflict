// Pure read-only helpers shared by systems, commands, the AI and the UI.
import { BUILDINGS, BUILDING_EFFECTS, CITY } from './config/buildings';
import { BUILDING_UNLOCKED_BY, ERA_RULES, RESEARCH_RULES, TECH_BY_ID, UNIT_UNLOCKED_BY } from './config/research';
import { CAPTURE, ECONOMY, MORALE, VICTORY } from './config/rules';
import { TICKS_PER_MINUTE } from './config/timing';
import { ARMY_RULES, UNITS, VETERANCY, baseGen, usesFuel, type CombatValues } from './config/units';
import {
  NEUTRAL,
  RESOURCE_KEYS,
  UNIT_GENS,
  type Army,
  type BuildingType,
  type CityTier,
  type Effect,
  type Era,
  type GameState,
  type NationId,
  type OwnerId,
  type PartialResources,
  type ProvinceId,
  type ResourceKey,
  type Resources,
  type ScoreLine,
  type TechId,
  type UnitClass,
  type UnitGen,
  type UnitSelector,
  type UnitType,
} from './types';
import { specialityEffects, type World } from './world';

export function emptyResources(): Resources {
  return { money: 0, materials: 0, fuel: 0, manpower: 0 };
}

export function scaledTicks(state: GameState, seconds: number): number {
  return Math.max(1, Math.round(seconds * state.settings.durationScale));
}

export function canAfford(have: Resources, cost: PartialResources): boolean {
  return RESOURCE_KEYS.every((k) => have[k] + 1e-9 >= (cost[k] ?? 0));
}

export function formatCost(cost: PartialResources): string {
  return RESOURCE_KEYS.filter((k) => (cost[k] ?? 0) > 0)
    .map((k) => `${Math.round(cost[k]!)} ${k}`)
    .join(', ');
}

function selects(sel: UnitSelector | undefined, type: UnitType): boolean {
  return sel === undefined || sel === 'all' || sel.includes(type);
}

// ---------------------------------------------------------------------------
// Research and national effects
// ---------------------------------------------------------------------------

export function hasTech(state: GameState, nation: OwnerId, tech: TechId): boolean {
  if (nation === NEUTRAL) return false;
  return state.nations[nation]?.research.completed.includes(tech) ?? false;
}

interface EffectCache {
  len: number;
  scenario: string;
  effects: Effect[];
  stats: Partial<Record<UnitType, EffectiveUnitStats>>;
}
// Keyed by the nation's `completed` array: research only appends to it, so its
// length tells us when to recompute. Effects are read in hot combat loops.
const effectCache = new WeakMap<TechId[], EffectCache>();

function cacheFor(state: GameState, nation: OwnerId): EffectCache | null {
  if (nation === NEUTRAL) return null;
  const n = state.nations[nation];
  if (!n) return null;
  const completed = n.research.completed;
  let c = effectCache.get(completed);
  if (!c || c.len !== completed.length || c.scenario !== state.scenarioId) {
    const effects: Effect[] = [...specialityEffects(state.scenarioId, nation)];
    for (const id of completed) effects.push(...(TECH_BY_ID[id]?.effects ?? []));
    c = { len: completed.length, scenario: state.scenarioId, effects, stats: {} };
    effectCache.set(completed, c);
  }
  return c;
}

/** Every active modifier of a nation: completed research plus its national speciality. */
export function techEffects(state: GameState, nation: OwnerId): Effect[] {
  return cacheFor(state, nation)?.effects ?? [];
}

export function nationEra(state: GameState, nation: NationId): Era {
  const done = state.nations[nation].research.completed;
  const from = (col: number) => done.filter((t) => (TECH_BY_ID[t]?.col ?? -1) >= col).length;
  if (from(ERA_RULES.ww2.fromCol) >= ERA_RULES.ww2.count) return 'WWII';
  return from(ERA_RULES.interwar.fromCol) >= ERA_RULES.interwar.count ? 'Interwar' : 'WWI';
}

export function researchSlots(state: GameState, nation: NationId): number {
  return RESEARCH_RULES.baseSlots + techEffects(state, nation).filter((e) => e.kind === 'researchSlot').length;
}

/** Research progress per tick (1 = nominal). Universities and research add speed. */
export function researchSpeed(state: GameState, nation: NationId): number {
  let universities = 0;
  for (const id of Object.keys(state.provinces)) {
    const p = state.provinces[id];
    if (p.owner === nation && (p.buildings.university ?? 0) > 0) universities++;
  }
  let speed = 1 + Math.min(BUILDING_EFFECTS.universityMax, universities) * BUILDING_EFFECTS.universityResearch;
  for (const e of techEffects(state, nation)) if (e.kind === 'researchSpeed') speed *= e.mult;
  return speed;
}

export function isUnitUnlocked(state: GameState, nation: OwnerId, type: UnitType): boolean {
  const tech = UNIT_UNLOCKED_BY[type];
  return !tech || hasTech(state, nation, tech);
}

export function isBuildingUnlocked(state: GameState, nation: OwnerId, building: BuildingType): boolean {
  const tech = BUILDING_UNLOCKED_BY[building];
  return !tech || hasTech(state, nation, tech);
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export interface EffectiveUnitStats {
  type: UnitType;
  class: UnitClass;
  gen: UnitGen;
  maxHp: number;
  attack: CombatValues;
  defence: CombatValues;
  speedKmPerTick: number;
  hardness: number;
  resilience: number;
  shock: number;
}

/** Current equipment generation of a type for its owner. */
export function unitGen(state: GameState, owner: OwnerId, type: UnitType): UnitGen {
  const models = UNITS[type].models;
  let best = UNIT_GENS.indexOf(baseGen(type));
  for (const e of techEffects(state, owner)) {
    if (e.kind === 'unitModel' && e.units.includes(type)) best = Math.max(best, UNIT_GENS.indexOf(e.gen));
  }
  // Fall back to the newest generation that exists for this type.
  for (let i = best; i >= 0; i--) if (models[UNIT_GENS[i]]) return UNIT_GENS[i];
  return baseGen(type);
}

export function unitStats(state: GameState, owner: OwnerId, type: UnitType): EffectiveUnitStats {
  const cache = cacheFor(state, owner);
  const cached = cache?.stats[type];
  if (cached) return cached;
  const cfg = UNITS[type];
  const gen = unitGen(state, owner, type);
  const base = cfg.models[gen]!;
  let atk = 1;
  let def = 1;
  let spd = 1;
  let res = owner === NEUTRAL ? MORALE.neutralResilience : 1;
  let shock = 1;
  for (const e of cache?.effects ?? []) {
    if (e.kind === 'movement') spd *= e.mult;
    if (e.kind !== 'unitStat' || !selects(e.units, type)) continue;
    if (e.stat === 'attack') atk *= e.mult;
    if (e.stat === 'defence') def *= e.mult;
    if (e.stat === 'speed') spd *= e.mult;
    if (e.stat === 'resilience') res *= e.mult;
    if (e.stat === 'shock') shock *= e.mult;
  }
  const stats: EffectiveUnitStats = {
    type,
    class: cfg.class,
    gen,
    maxHp: base.hp,
    attack: { soft: base.attack.soft * atk, hard: base.attack.hard * atk },
    defence: { soft: base.defence.soft * def, hard: base.defence.hard * def },
    speedKmPerTick: base.speedKmPerTick * spd,
    hardness: base.hardness ?? cfg.hardness,
    resilience: cfg.resilience * res,
    shock: cfg.shock * shock,
  };
  if (cache) cache.stats[type] = stats;
  return stats;
}

export function veterancyRank(xp: number): 0 | 1 | 2 | 3 {
  const t = VETERANCY.thresholds;
  return xp >= t[3] ? 3 : xp >= t[2] ? 2 : xp >= t[1] ? 1 : 0;
}

export function recruitCost(state: GameState, nation: NationId, type: UnitType): PartialResources {
  const cost: PartialResources = { ...UNITS[type].cost };
  for (const e of techEffects(state, nation)) {
    if (e.kind === 'recruitCost' && cost[e.resource] !== undefined && selects(e.units, type)) {
      cost[e.resource] = Math.round(cost[e.resource]! * e.mult);
    }
  }
  return cost;
}

export function recruitTicks(state: GameState, nation: NationId, type: UnitType): number {
  let mult = 1;
  for (const e of techEffects(state, nation)) if (e.kind === 'recruitTime' && selects(e.units, type)) mult *= e.mult;
  return scaledTicks(state, UNITS[type].recruitSeconds * mult);
}

/** Experience a new recruit starts with in this province. */
export function recruitXp(state: GameState, nation: NationId, province: ProvinceId, type: UnitType): number {
  let xp = (state.provinces[province]?.buildings.academy ?? 0) > 0 ? VETERANCY.thresholds[1] : 0;
  for (const e of techEffects(state, nation)) if (e.kind === 'startXp' && selects(e.units, type)) xp += e.xp;
  return Math.min(VETERANCY.maxXp, xp);
}

export function constructionCost(state: GameState, nation: NationId, building: BuildingType, level: number): PartialResources {
  const cost: PartialResources = { ...BUILDINGS[building].cost(level) };
  let mult = 1;
  for (const e of techEffects(state, nation)) {
    if (e.kind === 'constructionCost' && (!e.building || e.building === building)) mult *= e.mult;
  }
  if (mult !== 1) for (const k of RESOURCE_KEYS) if (cost[k] !== undefined) cost[k] = Math.round(cost[k]! * mult);
  return cost;
}

export function constructionTicks(state: GameState, nation: NationId, building: BuildingType, level: number): number {
  let mult = 1;
  for (const e of techEffects(state, nation)) if (e.kind === 'constructionTime') mult *= e.mult;
  return scaledTicks(state, BUILDINGS[building].seconds(level) * mult);
}

export function fortificationReduction(state: GameState, owner: OwnerId, level: number): number {
  let mult = 1;
  for (const e of techEffects(state, owner)) if (e.kind === 'fortification') mult *= e.mult;
  return Math.min(0.75, level * BUILDING_EFFECTS.fortDamageReductionPerLevel * mult);
}

/** Strength-weighted average morale of an army (0..1). */
export function armyMorale(army: Army): number {
  let w = 0;
  let m = 0;
  for (const u of army.units) {
    w += u.strength;
    m += u.strength * u.morale;
  }
  return w > 0 ? m / w : 0;
}

/** Fighting power of one unit for its owner, used by the AI and the UI. */
export function unitPower(state: GameState, owner: OwnerId, u: Army['units'][number]): number {
  const s = unitStats(state, owner, u.type);
  const avg = (s.attack.soft + s.defence.soft + (s.attack.hard + s.defence.hard) * 0.5) / 2;
  const strength = ARMY_RULES.strengthFloor + (1 - ARMY_RULES.strengthFloor) * u.strength;
  const morale = MORALE.firepowerFloor + (1 - MORALE.firepowerFloor) * u.morale;
  const toughness = (s.maxHp / 100) * (1 + s.hardness * 0.5);
  return avg * toughness * strength * morale * VETERANCY.damage[veterancyRank(u.xp)];
}

/** Total military power of an army (used by the AI and the UI). */
export function armyPower(state: GameState, army: Army): number {
  let p = 0;
  for (const u of army.units) p += unitPower(state, army.owner, u);
  return p;
}

/** A unit's march speed right now (fuel shortages slow vehicles). */
export function unitSpeedKmPerTick(state: GameState, owner: OwnerId, type: UnitType): number {
  let s = unitStats(state, owner, type).speedKmPerTick;
  if (owner !== NEUTRAL && usesFuel(type) && state.nations[owner]?.shortages.fuel) s *= ECONOMY.noFuelVehicleMult;
  return s / state.settings.durationScale;
}

/** Open-ground speed of the slowest unit (UI summary; legs account for terrain per unit). */
export function armySpeedKmPerTick(state: GameState, army: Army): number {
  let speed = Infinity;
  for (const u of army.units) speed = Math.min(speed, unitSpeedKmPerTick(state, army.owner, u.type));
  return speed === Infinity ? 1 / state.settings.durationScale : speed;
}

export function isArmyInTransit(army: Army): boolean {
  return army.move?.leg != null;
}

export function isRouted(state: GameState, army: Army): boolean {
  return army.routedUntil > state.tick;
}

// ---------------------------------------------------------------------------
// Diplomacy & movement legality
// ---------------------------------------------------------------------------

export function areHostile(state: GameState, a: OwnerId, b: OwnerId): boolean {
  if (a === b) return false;
  if (a === NEUTRAL || b === NEUTRAL) return true;
  return state.nations[a]?.relations[b]?.status === 'war';
}

export function atWar(state: GameState, a: NationId, b: NationId): boolean {
  return a !== b && state.nations[a]?.relations[b]?.status === 'war';
}

/** May an army of `owner` enter this province? Own, enemy (at war) and neutral territory are allowed. */
export function canEnterProvince(state: GameState, owner: OwnerId, province: ProvinceId): boolean {
  const p = state.provinces[province];
  if (!p) return false;
  if (owner === NEUTRAL) return false;
  return p.owner === owner || areHostile(state, owner, p.owner);
}

export function hostileArmiesIn(state: GameState, province: ProvinceId, owner: OwnerId): Army[] {
  const out: Army[] = [];
  for (const a of Object.values(state.armies)) {
    if (a.province === province && !isArmyInTransit(a) && areHostile(state, owner, a.owner)) out.push(a);
  }
  return out;
}

export function armiesIn(state: GameState, province: ProvinceId): Army[] {
  return Object.values(state.armies).filter((a) => a.province === province && !isArmyInTransit(a));
}

/** Ticks to capture a province (before the capturer's reconnaissance bonus). */
export function captureTicks(state: GameState, world: World, province: ProvinceId): number {
  const def = world.provinces[province];
  const p = state.provinces[province];
  const fort = p.buildings.fortifications ?? 0;
  let seconds = CAPTURE.baseSeconds + fort * BUILDING_EFFECTS.fortCaptureSecondsPerLevel;
  seconds *= 1 + (p.tier - 1) * CITY.captureTimePerTier;
  if (def.city.size === 'capital') seconds *= CAPTURE.capitalMult;
  if ((p.buildings.garrisonHq ?? 0) > 0) seconds *= BUILDING_EFFECTS.garrisonHqCapture;
  return scaledTicks(state, seconds);
}

// ---------------------------------------------------------------------------
// Cities
// ---------------------------------------------------------------------------

export function buildingSlots(state: GameState, province: ProvinceId): number {
  const p = state.provinces[province];
  let slots: number = CITY.slots[p.tier];
  if (p.owner !== NEUTRAL) for (const e of techEffects(state, p.owner)) if (e.kind === 'buildingSlots') slots += e.amount;
  return slots;
}

/** Display population in thousands, growing with tier and growth progress. */
export function cityPopulation(state: GameState, world: World, province: ProvinceId): number {
  const def = world.provinces[province];
  const p = state.provinces[province];
  const scale = CITY.populationScale[p.tier] / CITY.populationScale[def.tier];
  const next = CITY.growthToNext[p.tier];
  const progress = Number.isFinite(next) ? p.growth / next : 0;
  return def.population * scale * (1 + 0.15 * progress);
}

export function cityTierName(tier: CityTier): string {
  return CITY.tierNames[tier];
}

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------

export function productionMultiplier(state: GameState, nation: OwnerId, resource: ResourceKey): number {
  let m = 1;
  for (const e of techEffects(state, nation)) if (e.kind === 'production' && e.resource === resource) m *= e.mult;
  return m;
}

/** Output multiplier from a province's civilian morale. */
export function moraleOutputMult(morale: number): number {
  const f = MORALE.outputFloor;
  return Math.max(f, Math.min(MORALE.outputCap, f + ((1 - f) * morale) / MORALE.outputPivot));
}

/** Gross output per minute of one province for its current owner. */
export function provinceOutput(state: GameState, world: World, province: ProvinceId): Resources {
  const def = world.provinces[province];
  const ps = state.provinces[province];
  const out = emptyResources();
  if (ps.owner === NEUTRAL) return out;
  const b = ps.buildings;
  const E = BUILDING_EFFECTS;
  const industry = b.industry ?? 0;
  const power = (b.powerPlant ?? 0) > 0 ? E.powerPlantLocal : 0;
  let adjacentPower = 0;
  for (const n of world.neighbors[province]) {
    const np = state.provinces[n.id];
    if (np.owner === ps.owner && (np.buildings.powerPlant ?? 0) > 0) adjacentPower += E.powerPlantAdjacentMaterials;
  }
  const tierBonus = 1 + (ps.tier - def.tier) * CITY.outputPerTier;
  out.money = def.production.money * (1 + industry * E.industryMoneyPerLevel + (b.market ?? 0) * E.marketMoneyPerLevel + power) * tierBonus;
  out.materials =
    def.production.materials *
    (1 + industry * E.industryMaterialsPerLevel + (b.armsWorks ? E.armsWorksMaterials : 0) + power + adjacentPower);
  out.manpower =
    def.production.manpower * (1 + (b.barracks ? E.barracksManpower : 0) + (b.housing ?? 0) * E.housingManpowerPerLevel) * tierBonus;
  out.fuel = def.production.fuel + refineryFuel(state, ps.owner, def.oil === true, b.refinery ?? 0);
  const moraleFactor = moraleOutputMult(ps.morale);
  for (const k of RESOURCE_KEYS) out[k] *= moraleFactor * productionMultiplier(state, ps.owner, k);
  if (def.core !== ps.owner) out.manpower *= ECONOMY.occupiedManpower;
  return out;
}

export function refineryFuel(state: GameState, owner: OwnerId, oil: boolean, level: number): number {
  if (level <= 0) return 0;
  let mult = 1;
  for (const e of techEffects(state, owner)) if (e.kind === 'refinery') mult *= e.mult;
  if (oil) return level * BUILDING_EFFECTS.refineryOilFuelPerLevel * mult;
  if (techEffects(state, owner).some((e) => e.kind === 'syntheticFuel')) {
    return level * BUILDING_EFFECTS.refinerySyntheticFuelPerLevel * mult;
  }
  return 0;
}

export interface NationEconomy {
  income: Resources;
  upkeep: Resources;
  net: Resources;
}

/** Per-minute income, upkeep and net change for a nation. */
export function nationEconomy(state: GameState, world: World, nation: NationId): NationEconomy {
  const income = emptyResources();
  for (const id of world.provinceIds) {
    if (state.provinces[id].owner !== nation) continue;
    const o = provinceOutput(state, world, id);
    for (const k of RESOURCE_KEYS) income[k] += o[k];
  }
  const upkeep = emptyResources();
  for (const a of Object.values(state.armies)) {
    if (a.owner !== nation) continue;
    for (const u of a.units) {
      const up = UNITS[u.type].upkeepPerMinute;
      for (const k of RESOURCE_KEYS) upkeep[k] += up[k] ?? 0;
    }
  }
  const net = emptyResources();
  for (const k of RESOURCE_KEYS) net[k] = income[k] - upkeep[k];
  return { income, upkeep, net };
}

export function perTick(perMinute: number, state: GameState): number {
  return perMinute / TICKS_PER_MINUTE / state.settings.durationScale;
}

// ---------------------------------------------------------------------------
// Morale
// ---------------------------------------------------------------------------

/** Highest morale a nation's units can reach, set by home-front morale. */
export function unitMoraleCap(state: GameState, owner: OwnerId): number {
  if (owner === NEUTRAL) return 1;
  const nm = state.nations[owner]?.morale ?? MORALE.start;
  return Math.max(MORALE.capMin, Math.min(1, MORALE.capBase + MORALE.capPerNationalMorale * nm));
}

// ---------------------------------------------------------------------------
// Victory & score
// ---------------------------------------------------------------------------

export function heldVp(state: GameState, world: World, nation: NationId): number {
  let vp = 0;
  for (const id of world.objectiveIds) if (state.provinces[id].owner === nation) vp += world.provinces[id].objectiveVp ?? 0;
  return vp;
}

export function vpToWin(world: World): number {
  return Math.ceil(world.totalVp * VICTORY.objectiveShare);
}

export function computeScores(state: GameState, world: World): ScoreLine[] {
  const lines: ScoreLine[] = world.nationIds.map((nation) => {
    const vp = heldVp(state, world, nation);
    const provinces = world.provinceIds.filter((id) => state.provinces[id].owner === nation).length;
    const techs = state.nations[nation].research.completed.length;
    const s = VICTORY.score;
    return { nation, vp, provinces, techs, score: vp * s.perVp + provinces * s.perProvince + techs * s.perTech };
  });
  // Stable ranking: score, then VP, then provinces, then scenario order.
  return lines
    .map((l, i) => ({ l, i }))
    .sort((x, y) => y.l.score - x.l.score || y.l.vp - x.l.vp || y.l.provinces - x.l.provinces || x.i - y.i)
    .map((x) => x.l);
}

export function provincesOwnedBy(state: GameState, world: World, owner: OwnerId): ProvinceId[] {
  return world.provinceIds.filter((id) => state.provinces[id].owner === owner);
}
