// Pure read-only helpers shared by systems, commands, the AI and the UI.
import { BUILDINGS, BUILDING_EFFECTS } from './config/buildings';
import { ERA_RULES, TECH_BY_ID, type TechEffect } from './config/research';
import { CAPTURE, ECONOMY, VICTORY } from './config/rules';
import { TICKS_PER_MINUTE } from './config/timing';
import { ARMY_RULES, UNITS, type CombatValues } from './config/units';
import {
  NEUTRAL,
  RESOURCE_KEYS,
  type Army,
  type BuildingType,
  type Era,
  type GameState,
  type NationId,
  type OwnerId,
  type PartialResources,
  type ProvinceId,
  type ResourceKey,
  type Resources,
  type ScoreLine,
  type UnitType,
} from './types';
import type { World } from './world';

export function emptyResources(): Resources {
  return { money: 0, materials: 0, fuel: 0, manpower: 0 };
}

export function scaledTicks(state: GameState, seconds: number): number {
  return Math.max(1, Math.round(seconds * state.settings.durationScale));
}

export function canAfford(have: Resources, cost: PartialResources): boolean {
  return RESOURCE_KEYS.every((k) => have[k] + 1e-9 >= (cost[k] ?? 0));
}

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------

export function techEffects(state: GameState, nation: OwnerId): TechEffect[] {
  if (nation === NEUTRAL) return [];
  const n = state.nations[nation];
  if (!n) return [];
  const out: TechEffect[] = [];
  for (const id of n.research.completed) out.push(...(TECH_BY_ID[id]?.effects ?? []));
  return out;
}

export function nationEra(state: GameState, nation: NationId): Era {
  const done = state.nations[nation].research.completed;
  if (ERA_RULES.ww2Techs.every((t) => done.includes(t))) return 'WWII';
  const tier2 = done.filter((t) => TECH_BY_ID[t]?.tier === 2).length;
  return tier2 >= ERA_RULES.interwarTier2Count ? 'Interwar' : 'WWI';
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export interface EffectiveUnitStats {
  type: UnitType;
  name: string;
  model: 'ww1' | 'ww2';
  maxHp: number;
  attack: CombatValues;
  defence: CombatValues;
  speedKmPerTick: number;
  armoured: boolean;
}

export function unitStats(state: GameState, owner: OwnerId, type: UnitType): EffectiveUnitStats {
  const cfg = UNITS[type];
  const effects = techEffects(state, owner);
  const model = effects.some((e) => e.kind === 'unitModel' && e.unit === type) ? 'ww2' : 'ww1';
  const base = cfg.models[model];
  let atk = 1;
  let def = 1;
  let spd = 1;
  for (const e of effects) {
    if (e.kind !== 'unitStat' || (e.unit !== type && e.unit !== 'all')) continue;
    if (e.stat === 'attack') atk *= e.mult;
    if (e.stat === 'defence') def *= e.mult;
    if (e.stat === 'speed') spd *= e.mult;
  }
  return {
    type,
    name: base.name,
    model,
    maxHp: base.hp,
    attack: { soft: base.attack.soft * atk, hard: base.attack.hard * atk },
    defence: { soft: base.defence.soft * def, hard: base.defence.hard * def },
    speedKmPerTick: base.speedKmPerTick * spd,
    armoured: cfg.armoured,
  };
}

export function recruitCost(state: GameState, nation: NationId, type: UnitType): PartialResources {
  const cost: PartialResources = { ...UNITS[type].cost };
  for (const e of techEffects(state, nation)) {
    if (e.kind === 'recruitCost' && cost[e.resource] !== undefined) {
      cost[e.resource] = Math.round(cost[e.resource]! * e.mult);
    }
  }
  return cost;
}

export function recruitTicks(state: GameState, nation: NationId, type: UnitType): number {
  let mult = 1;
  for (const e of techEffects(state, nation)) if (e.kind === 'recruitTime') mult *= e.mult;
  return scaledTicks(state, UNITS[type].recruitSeconds * mult);
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

/** Total military power of an army (used by the AI and the UI). */
export function armyPower(state: GameState, army: Army): number {
  let p = 0;
  for (const u of army.units) {
    const s = unitStats(state, army.owner, u.type);
    const avg = (s.attack.soft + s.defence.soft + (s.attack.hard + s.defence.hard) * 0.5) / 2;
    p += avg * (s.maxHp / 100) * (ARMY_RULES.strengthFloor + (1 - ARMY_RULES.strengthFloor) * u.strength);
  }
  return p;
}

export function armySpeedKmPerTick(state: GameState, army: Army): number {
  let speed = Infinity;
  const nation = army.owner === NEUTRAL ? null : state.nations[army.owner];
  for (const u of army.units) {
    let s = unitStats(state, army.owner, u.type).speedKmPerTick;
    if (u.type === 'tank' && nation?.shortages.fuel) s *= ECONOMY.noFuelTankMult;
    speed = Math.min(speed, s);
  }
  return speed === Infinity ? 1 : speed / state.settings.durationScale;
}

export function isArmyInTransit(army: Army): boolean {
  return army.move?.leg != null;
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

export function captureTicks(state: GameState, world: World, province: ProvinceId): number {
  const def = world.provinces[province];
  const fort = state.provinces[province].buildings.fortifications ?? 0;
  let seconds = CAPTURE.baseSeconds + fort * BUILDING_EFFECTS.fortCaptureSecondsPerLevel;
  if (def.city.size === 'capital') seconds *= CAPTURE.capitalMult;
  return scaledTicks(state, seconds);
}

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------

export function productionMultiplier(state: GameState, nation: OwnerId, resource: ResourceKey): number {
  let m = 1;
  for (const e of techEffects(state, nation)) if (e.kind === 'production' && e.resource === resource) m *= e.mult;
  return m;
}

/** Gross output per minute of one province for its current owner. */
export function provinceOutput(state: GameState, world: World, province: ProvinceId): Resources {
  const def = world.provinces[province];
  const ps = state.provinces[province];
  const out = emptyResources();
  if (ps.owner === NEUTRAL) return out;
  const b = ps.buildings;
  const industry = b.industry ?? 0;
  out.money = def.production.money * (1 + industry * BUILDING_EFFECTS.industryMoneyPerLevel);
  out.materials =
    def.production.materials *
    (1 + industry * BUILDING_EFFECTS.industryMaterialsPerLevel + (b.armsWorks ? BUILDING_EFFECTS.armsWorksMaterials : 0));
  out.manpower = def.production.manpower * (1 + (b.barracks ? BUILDING_EFFECTS.barracksManpower : 0));
  out.fuel = def.production.fuel + refineryFuel(state, ps.owner, def.oil === true, b.refinery ?? 0);
  const coreFactor = def.core === ps.owner ? 1 : ECONOMY.nonCoreOutput;
  for (const k of RESOURCE_KEYS) out[k] *= coreFactor * productionMultiplier(state, ps.owner, k);
  return out;
}

export function refineryFuel(state: GameState, owner: OwnerId, oil: boolean, level: number): number {
  if (level <= 0) return 0;
  if (oil) return level * BUILDING_EFFECTS.refineryOilFuelPerLevel;
  if (techEffects(state, owner).some((e) => e.kind === 'syntheticFuel')) {
    return level * BUILDING_EFFECTS.refinerySyntheticFuelPerLevel;
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
