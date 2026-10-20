// Explicit player/AI commands. Every state change initiated by a player goes
// through applyCommand, which validates first. The same validators are used
// by the UI to explain why an action is unavailable.
import { BUILDINGS } from './config/buildings';
import { DIPLOMACY } from './config/rules';
import { TECH_BY_ID } from './config/research';
import { ARMY_RULES, UNITS } from './config/units';
import { pushEvent } from './events';
import { findPath } from './pathfinding';
import {
  atWar,
  canAfford,
  constructionTicks,
  isArmyInTransit,
  recruitCost,
  recruitTicks,
  refineryFuel,
  scaledTicks,
  techEffects,
} from './queries';
import { createArmy } from './state';
import { declareWar, makePeace } from './systems/diplomacy';
import { startLeg } from './systems/movement';
import {
  RESOURCE_KEYS,
  type ArmyId,
  type BuildingType,
  type GameState,
  type NationId,
  type PartialResources,
  type ProvinceId,
  type TechId,
  type UnitId,
  type UnitType,
} from './types';
import type { World } from './world';

export type Command =
  | { type: 'move'; nation: NationId; armyId: ArmyId; to: ProvinceId }
  | { type: 'stop'; nation: NationId; armyId: ArmyId }
  | { type: 'split'; nation: NationId; armyId: ArmyId; unitIds: UnitId[] }
  | { type: 'merge'; nation: NationId; armyIds: ArmyId[] }
  | { type: 'recruit'; nation: NationId; province: ProvinceId; unitType: UnitType }
  | { type: 'cancelRecruit'; nation: NationId; province: ProvinceId; index: number }
  | { type: 'build'; nation: NationId; province: ProvinceId; building: BuildingType }
  | { type: 'research'; nation: NationId; tech: TechId }
  | { type: 'declareWar'; nation: NationId; target: NationId }
  | { type: 'offerPeace'; nation: NationId; target: NationId }
  | { type: 'respondPeace'; nation: NationId; from: NationId; accept: boolean };

export type CommandResult = { ok: true } | { ok: false; reason: string };

const OK: CommandResult = { ok: true };
const fail = (reason: string): CommandResult => ({ ok: false, reason });

function spend(state: GameState, nation: NationId, cost: PartialResources): void {
  const r = state.nations[nation].resources;
  for (const k of RESOURCE_KEYS) r[k] -= cost[k] ?? 0;
}

function refund(state: GameState, nation: NationId, cost: PartialResources, fraction: number): void {
  const r = state.nations[nation].resources;
  for (const k of RESOURCE_KEYS) r[k] += (cost[k] ?? 0) * fraction;
}

function checkActor(state: GameState, nation: NationId): CommandResult {
  if (state.outcome) return fail('The campaign is over.');
  const n = state.nations[nation];
  if (!n) return fail('Unknown nation.');
  if (n.eliminated) return fail('This nation has been eliminated.');
  return OK;
}

// ---------------------------------------------------------------------------
// Validators (exported for the UI and AI)
// ---------------------------------------------------------------------------

export function checkMove(state: GameState, world: World, nation: NationId, armyId: ArmyId, to: ProvinceId): CommandResult {
  const actor = checkActor(state, nation);
  if (!actor.ok) return actor;
  const army = state.armies[armyId];
  if (!army || army.owner !== nation) return fail('Not your army.');
  if (!world.provinces[to]) return fail('Unknown province.');
  const from = army.move?.leg ? army.move.leg.to : army.province;
  if (to === from && !army.move?.leg) return fail('The army is already there.');
  if (army.move?.leg && to === army.move.leg.from) return OK; // reversing
  const p = state.provinces[to];
  if (p.owner !== nation && !(p.owner === 'neutral' || atWar(state, nation, p.owner))) {
    return fail(`You are at peace with ${world.nations[p.owner]?.name ?? p.owner}. Declare war first.`);
  }
  if (to !== from && !findPath(state, world, army, from, to)) return fail('No route: blocked by territory you may not enter.');
  return OK;
}

export function checkRecruit(
  state: GameState,
  world: World,
  nation: NationId,
  province: ProvinceId,
  unitType: UnitType,
): CommandResult {
  const actor = checkActor(state, nation);
  if (!actor.ok) return actor;
  const p = state.provinces[province];
  if (!p || p.owner !== nation) return fail('You do not control this province.');
  const req = UNITS[unitType].requires;
  if (!p.buildings[req]) return fail(`Requires ${BUILDINGS[req].name} in ${world.provinces[province].city.name}.`);
  if (p.recruitQueue.length >= ARMY_RULES.maxRecruitQueue) return fail('Recruitment queue is full.');
  if (!canAfford(state.nations[nation].resources, recruitCost(state, nation, unitType))) return fail('Not enough resources.');
  return OK;
}

export function checkBuild(
  state: GameState,
  world: World,
  nation: NationId,
  province: ProvinceId,
  building: BuildingType,
): CommandResult {
  const actor = checkActor(state, nation);
  if (!actor.ok) return actor;
  const p = state.provinces[province];
  if (!p || p.owner !== nation) return fail('You do not control this province.');
  if (p.construction) return fail('Already building here.');
  const cfg = BUILDINGS[building];
  const level = (p.buildings[building] ?? 0) + 1;
  if (level > cfg.maxLevel) return fail('Already at maximum level.');
  if (cfg.requiresBuilding && !p.buildings[cfg.requiresBuilding]) {
    return fail(`Requires ${BUILDINGS[cfg.requiresBuilding].name}.`);
  }
  if (building === 'refinery' && refineryFuel(state, nation, world.provinces[province].oil === true, 1) <= 0) {
    return fail('Needs an oil field, or Synthetic Fuel research.');
  }
  if (!canAfford(state.nations[nation].resources, cfg.cost(level))) return fail('Not enough resources.');
  return OK;
}

export function checkResearch(state: GameState, nation: NationId, tech: TechId): CommandResult {
  const actor = checkActor(state, nation);
  if (!actor.ok) return actor;
  const cfg = TECH_BY_ID[tech];
  if (!cfg) return fail('Unknown technology.');
  const r = state.nations[nation].research;
  if (r.completed.includes(tech)) return fail('Already researched.');
  if (r.active) return fail('Already researching.');
  const missing = cfg.requires.filter((t) => !r.completed.includes(t));
  if (missing.length > 0) return fail(`Requires ${missing.map((t) => TECH_BY_ID[t].name).join(' and ')}.`);
  if (!canAfford(state.nations[nation].resources, cfg.cost)) return fail('Not enough resources.');
  return OK;
}

export function checkDeclareWar(state: GameState, nation: NationId, target: NationId): CommandResult {
  const actor = checkActor(state, nation);
  if (!actor.ok) return actor;
  const t = state.nations[target];
  if (!t || target === nation) return fail('Invalid target.');
  if (t.eliminated) return fail('That nation has been eliminated.');
  const rel = state.nations[nation].relations[target];
  if (rel.status === 'war') return fail('Already at war.');
  if (state.tick < rel.truceUntil) return fail(`Truce in force for ${Math.ceil((rel.truceUntil - state.tick) / state.settings.durationScale)}s.`);
  return OK;
}

export function checkOfferPeace(state: GameState, nation: NationId, target: NationId): CommandResult {
  const actor = checkActor(state, nation);
  if (!actor.ok) return actor;
  if (!state.nations[target] || state.nations[target].eliminated) return fail('Invalid target.');
  const rel = state.nations[nation].relations[target];
  if (rel?.status !== 'war') return fail('Not at war.');
  const minWar = scaledTicks(state, DIPLOMACY.minWarSecondsBeforePeace);
  if (state.tick - rel.since < minWar) return fail(`Too soon: wars must last ${DIPLOMACY.minWarSecondsBeforePeace}s before peace talks.`);
  if (state.peaceOffers.some((o) => o.from === nation && o.to === target)) return fail('Offer already pending.');
  return OK;
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export function applyCommand(state: GameState, world: World, cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'move': {
      const check = checkMove(state, world, cmd.nation, cmd.armyId, cmd.to);
      if (!check.ok) return check;
      const army = state.armies[cmd.armyId];
      const leg = army.move?.leg;
      if (leg) {
        if (cmd.to === leg.from) {
          // Turn around mid-march.
          army.province = leg.to;
          army.move = { path: [leg.from], leg: { from: leg.to, to: leg.from, elapsed: leg.duration - leg.elapsed, duration: leg.duration } };
          return OK;
        }
        const rest = cmd.to === leg.to ? [] : findPath(state, world, army, leg.to, cmd.to)!.path;
        army.move = { path: [leg.to, ...rest], leg };
        return OK;
      }
      const route = findPath(state, world, army, army.province, cmd.to)!;
      army.move = { path: route.path, leg: null };
      // An explicit order departs immediately, even from a battle (retreat).
      startLeg(state, world, army);
      return OK;
    }
    case 'stop': {
      const actor = checkActor(state, cmd.nation);
      if (!actor.ok) return actor;
      const army = state.armies[cmd.armyId];
      if (!army || army.owner !== cmd.nation) return fail('Not your army.');
      if (!army.move) return fail('The army is not moving.');
      army.move = army.move.leg ? { path: [army.move.leg.to], leg: army.move.leg } : null;
      return OK;
    }
    case 'split': {
      const actor = checkActor(state, cmd.nation);
      if (!actor.ok) return actor;
      const army = state.armies[cmd.armyId];
      if (!army || army.owner !== cmd.nation) return fail('Not your army.');
      if (isArmyInTransit(army)) return fail('Cannot reorganise while marching.');
      const ids = new Set(cmd.unitIds);
      const moving = army.units.filter((u) => ids.has(u.id));
      if (moving.length === 0 || moving.length === army.units.length || moving.length !== ids.size) {
        return fail('Select some, but not all, units of the army.');
      }
      army.units = army.units.filter((u) => !ids.has(u.id));
      createArmy(state, cmd.nation, army.province, moving);
      return OK;
    }
    case 'merge': {
      const actor = checkActor(state, cmd.nation);
      if (!actor.ok) return actor;
      const armies = cmd.armyIds.map((id) => state.armies[id]);
      if (armies.length < 2 || armies.some((a) => !a || a.owner !== cmd.nation)) return fail('Select at least two of your armies.');
      if (new Set(cmd.armyIds).size !== cmd.armyIds.length) return fail('Duplicate army.');
      if (armies.some((a) => isArmyInTransit(a) || a.province !== armies[0].province)) {
        return fail('Armies must be stationed in the same province.');
      }
      const [first, ...rest] = armies;
      for (const a of rest) {
        first.units.push(...a.units);
        delete state.armies[a.id];
      }
      first.move = null;
      return OK;
    }
    case 'recruit': {
      const check = checkRecruit(state, world, cmd.nation, cmd.province, cmd.unitType);
      if (!check.ok) return check;
      spend(state, cmd.nation, recruitCost(state, cmd.nation, cmd.unitType));
      const ticks = recruitTicks(state, cmd.nation, cmd.unitType);
      state.provinces[cmd.province].recruitQueue.push({ unitType: cmd.unitType, remaining: ticks, total: ticks });
      return OK;
    }
    case 'cancelRecruit': {
      const actor = checkActor(state, cmd.nation);
      if (!actor.ok) return actor;
      const p = state.provinces[cmd.province];
      if (!p || p.owner !== cmd.nation) return fail('You do not control this province.');
      const job = p.recruitQueue[cmd.index];
      if (!job) return fail('No such job.');
      // Full refund if not started, half if already in training.
      refund(state, cmd.nation, recruitCost(state, cmd.nation, job.unitType), cmd.index === 0 ? 0.5 : 1);
      p.recruitQueue.splice(cmd.index, 1);
      return OK;
    }
    case 'build': {
      const check = checkBuild(state, world, cmd.nation, cmd.province, cmd.building);
      if (!check.ok) return check;
      const p = state.provinces[cmd.province];
      const level = (p.buildings[cmd.building] ?? 0) + 1;
      spend(state, cmd.nation, BUILDINGS[cmd.building].cost(level));
      const ticks = constructionTicks(state, cmd.nation, cmd.building, level);
      p.construction = { building: cmd.building, targetLevel: level, remaining: ticks, total: ticks };
      return OK;
    }
    case 'research': {
      const check = checkResearch(state, cmd.nation, cmd.tech);
      if (!check.ok) return check;
      const cfg = TECH_BY_ID[cmd.tech];
      spend(state, cmd.nation, cfg.cost);
      const ticks = scaledTicks(state, cfg.seconds);
      state.nations[cmd.nation].research.active = { tech: cmd.tech, remaining: ticks, total: ticks };
      return OK;
    }
    case 'declareWar': {
      const check = checkDeclareWar(state, cmd.nation, cmd.target);
      if (!check.ok) return check;
      declareWar(state, world, cmd.nation, cmd.target);
      return OK;
    }
    case 'offerPeace': {
      const check = checkOfferPeace(state, cmd.nation, cmd.target);
      if (!check.ok) return check;
      state.peaceOffers.push({
        from: cmd.nation,
        to: cmd.target,
        expiresAt: state.tick + scaledTicks(state, DIPLOMACY.peaceOfferExpirySeconds),
      });
      pushEvent(state, 'peace-offer', `${world.nations[cmd.nation].name} offered peace to ${world.nations[cmd.target].name}.`, {
        nations: [cmd.nation, cmd.target],
      });
      return OK;
    }
    case 'respondPeace': {
      const actor = checkActor(state, cmd.nation);
      if (!actor.ok) return actor;
      const idx = state.peaceOffers.findIndex((o) => o.from === cmd.from && o.to === cmd.nation);
      if (idx < 0) return fail('No such peace offer.');
      state.peaceOffers.splice(idx, 1);
      if (cmd.accept) makePeace(state, world, cmd.from, cmd.nation);
      else {
        pushEvent(state, 'peace-rejected', `${world.nations[cmd.nation].name} rejected peace with ${world.nations[cmd.from].name}.`, {
          nations: [cmd.nation, cmd.from],
          severity: 'bad',
        });
      }
      return OK;
    }
  }
}

/** True if the nation has the Synthetic Fuel effect (UI helper). */
export function hasSyntheticFuel(state: GameState, nation: NationId): boolean {
  return techEffects(state, nation).some((e) => e.kind === 'syntheticFuel');
}
