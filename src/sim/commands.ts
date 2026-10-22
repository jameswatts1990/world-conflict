// Explicit player/AI commands. Every state change initiated by a player goes
// through applyCommand, which validates first. The same validators are used
// by the UI to explain why an action is unavailable.
import { BUILDINGS, CITY, slotsUsed } from './config/buildings';
import { DIPLOMACY, ECONOMY } from './config/rules';
import { RESEARCH_RULES, TECH_BY_ID } from './config/research';
import { ARMY_RULES, UNITS } from './config/units';
import { pushEvent } from './events';
import { refund, spend } from './ledger';
import { armyName } from './names';
import { findPath } from './pathfinding';
import {
  atWar,
  buildingSlots,
  canAfford,
  constructionCost,
  constructionTicks,
  isArmyInTransit,
  isBuildingUnlocked,
  isRouted,
  isUnitUnlocked,
  recruitCost,
  recruitTicks,
  refineryFuel,
  researchSlots,
  scaledTicks,
} from './queries';
import { createArmy } from './state';
import { declareWar, makePeace } from './systems/diplomacy';
import { startLeg } from './systems/movement';
import { startQueuedResearch } from './systems/production';
import type { ArmyId, BuildingType, GameState, NationId, ProvinceId, TechId, UnitId, UnitType } from './types';
import { durationText, nationName, sentence } from './text';
import type { World } from './world';

export type Command =
  | { type: 'move'; nation: NationId; armyId: ArmyId; to: ProvinceId }
  | { type: 'stop'; nation: NationId; armyId: ArmyId }
  | { type: 'split'; nation: NationId; armyId: ArmyId; unitIds: UnitId[] }
  | { type: 'merge'; nation: NationId; armyIds: ArmyId[] }
  | { type: 'disband'; nation: NationId; armyId: ArmyId; unitIds?: UnitId[] }
  | { type: 'recruit'; nation: NationId; province: ProvinceId; unitType: UnitType }
  | { type: 'cancelRecruit'; nation: NationId; province: ProvinceId; index: number }
  | { type: 'build'; nation: NationId; province: ProvinceId; building: BuildingType }
  | { type: 'demolish'; nation: NationId; province: ProvinceId; building: BuildingType }
  | { type: 'cancelBuild'; nation: NationId; province: ProvinceId }
  | { type: 'research'; nation: NationId; tech: TechId }
  | { type: 'queueResearch'; nation: NationId; tech: TechId }
  | { type: 'unqueueResearch'; nation: NationId; tech: TechId }
  | { type: 'cancelResearch'; nation: NationId; tech: TechId }
  | { type: 'declareWar'; nation: NationId; target: NationId }
  | { type: 'offerPeace'; nation: NationId; target: NationId }
  | { type: 'respondPeace'; nation: NationId; from: NationId; accept: boolean };

export type CommandResult = { ok: true } | { ok: false; reason: string };

const OK: CommandResult = { ok: true };
const fail = (reason: string): CommandResult => ({ ok: false, reason });

function checkActor(state: GameState, nation: NationId): CommandResult {
  if (state.outcome) return fail('The campaign is over.');
  const n = state.nations[nation];
  if (!n) return fail('Unknown nation.');
  if (n.eliminated) return fail('This nation has been eliminated.');
  return OK;
}

function routedReason(state: GameState, routedUntil: number): string {
  return `The army is routing and cannot take orders for ${Math.ceil((routedUntil - state.tick) / state.settings.durationScale)}s.`;
}

// ---------------------------------------------------------------------------
// Validators (exported for the UI and AI)
// ---------------------------------------------------------------------------

export function checkMove(state: GameState, world: World, nation: NationId, armyId: ArmyId, to: ProvinceId): CommandResult {
  const actor = checkActor(state, nation);
  if (!actor.ok) return actor;
  const army = state.armies[armyId];
  if (!army || army.owner !== nation) return fail('Not your army.');
  if (isRouted(state, army)) return fail(routedReason(state, army.routedUntil));
  if (!world.provinces[to]) return fail('Unknown province.');
  const from = army.move?.leg ? army.move.leg.to : army.province;
  if (to === from && !army.move?.leg) return fail('The army is already there.');
  if (army.move?.leg && to === army.move.leg.from) return OK; // reversing
  const p = state.provinces[to];
  if (p.owner !== nation && !(p.owner === 'neutral' || atWar(state, nation, p.owner))) {
    return fail(`You are at peace with ${nationName(world, p.owner)}. Declare war first.`);
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
  if (!isUnitUnlocked(state, nation, unitType)) return fail(`${UNITS[unitType].name} must be researched first.`);
  const missing = UNITS[unitType].requires.filter((b) => !p.buildings[b]);
  if (missing.length > 0) {
    return fail(`Requires ${missing.map((b) => BUILDINGS[b].name).join(' and ')} in ${world.provinces[province].city.name}.`);
  }
  if (p.recruitQueue.length >= ARMY_RULES.maxRecruitQueue) return fail('Recruitment queue is full.');
  if (!canAfford(state.nations[nation].resources, recruitCost(state, nation, unitType))) return fail('Not enough resources.');
  return OK;
}

/** Everything except affordability: can this building ever be built here right now? */
export function checkBuildRules(
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
  const cfg = BUILDINGS[building];
  if (!isBuildingUnlocked(state, nation, building)) return fail(`${cfg.name} must be researched first.`);
  if (cfg.occupiedOnly && world.provinces[province].core === nation) return fail('Only in occupied provinces.');
  if (cfg.coastalOnly && !world.seaLandings.has(province)) return fail('Only where a sea crossing lands.');
  const current = p.buildings[building] ?? 0;
  const level = current + 1;
  if (level > cfg.maxLevel) return fail('Already at maximum level.');
  const needTier = cfg.levelTiers?.[level - 1] ?? 1;
  if (p.tier < needTier) return fail(`Level ${level} needs a ${CITY.tierNames[needTier]} (this is a ${CITY.tierNames[p.tier]}).`);
  if (cfg.requiresBuilding && !p.buildings[cfg.requiresBuilding]) return fail(`Requires ${BUILDINGS[cfg.requiresBuilding].name}.`);
  if (building === 'refinery' && refineryFuel(state, nation, world.provinces[province].oil === true, 1) <= 0) {
    return fail('Needs an oil field, or Synthetic Fuel research.');
  }
  if (cfg.category !== 'infrastructure' && current === 0 && slotsUsed(p.buildings, p.construction?.building ?? null) >= buildingSlots(state, province)) {
    return fail(`No free building slot (${CITY.tierNames[p.tier]}: ${buildingSlots(state, province)} slots). Grow the city or demolish something.`);
  }
  if (p.construction) return fail('Already building here.');
  return OK;
}

export function checkBuild(
  state: GameState,
  world: World,
  nation: NationId,
  province: ProvinceId,
  building: BuildingType,
): CommandResult {
  const rules = checkBuildRules(state, world, nation, province, building);
  if (!rules.ok) return rules;
  const level = (state.provinces[province].buildings[building] ?? 0) + 1;
  if (!canAfford(state.nations[nation].resources, constructionCost(state, nation, building, level))) return fail('Not enough resources.');
  return OK;
}

/** Can this technology be researched once slots and money allow (prerequisites done or on their way)? */
export function checkQueueResearch(state: GameState, nation: NationId, tech: TechId): CommandResult {
  const actor = checkActor(state, nation);
  if (!actor.ok) return actor;
  const cfg = TECH_BY_ID[tech];
  if (!cfg) return fail('Unknown technology.');
  const r = state.nations[nation].research;
  if (r.completed.includes(tech)) return fail('Already researched.');
  if (r.active.some((j) => j.tech === tech)) return fail('Already in progress.');
  if (r.queue.includes(tech)) return fail('Already queued.');
  if (r.queue.length >= RESEARCH_RULES.maxQueue) return fail(`The queue holds at most ${RESEARCH_RULES.maxQueue} projects.`);
  const planned = new Set([...r.completed, ...r.active.map((j) => j.tech), ...r.queue]);
  const missing = cfg.requires.filter((t) => !planned.has(t));
  if (missing.length > 0) return fail(`Requires ${missing.map((t) => TECH_BY_ID[t].name).join(' and ')}.`);
  return OK;
}

export function checkResearch(state: GameState, nation: NationId, tech: TechId): CommandResult {
  const actor = checkActor(state, nation);
  if (!actor.ok) return actor;
  const cfg = TECH_BY_ID[tech];
  if (!cfg) return fail('Unknown technology.');
  const r = state.nations[nation].research;
  if (r.completed.includes(tech)) return fail('Already researched.');
  if (r.active.some((j) => j.tech === tech)) return fail('Already in progress.');
  const missing = cfg.requires.filter((t) => !r.completed.includes(t));
  if (missing.length > 0) return fail(`Requires ${missing.map((t) => TECH_BY_ID[t].name).join(' and ')}.`);
  const slots = researchSlots(state, nation);
  if (r.active.length >= slots) return fail(slots === 1 ? 'Already researching (one slot).' : `All ${slots} research slots are busy.`);
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
  if (state.tick < rel.truceUntil) {
    return fail(`A truce is in force for another ${durationText((rel.truceUntil - state.tick) / state.settings.durationScale)}.`);
  }
  return OK;
}

export function checkOfferPeace(state: GameState, world: World, nation: NationId, target: NationId): CommandResult {
  const actor = checkActor(state, nation);
  if (!actor.ok) return actor;
  if (!state.nations[target] || state.nations[target].eliminated) return fail('Invalid target.');
  const rel = state.nations[nation].relations[target];
  if (rel?.status !== 'war') return fail('Not at war.');
  const minWar = scaledTicks(state, DIPLOMACY.minWarSecondsBeforePeace);
  const scale = state.settings.durationScale;
  if (state.tick - rel.since < minWar) {
    const left = (minWar - (state.tick - rel.since)) / scale;
    return fail(`Peace talks open ${durationText(DIPLOMACY.minWarSecondsBeforePeace)} into a war (${durationText(left)} to go).`);
  }
  if (state.peaceOffers.some((o) => o.from === nation && o.to === target)) return fail('Your offer is awaiting an answer.');
  if (rel.peaceOfferAfter !== undefined && state.tick < rel.peaceOfferAfter) {
    const left = (rel.peaceOfferAfter - state.tick) / scale;
    return fail(`${sentence(nationName(world, target))} turned down your last offer. Try again in ${durationText(left)}.`);
  }
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
      if (isRouted(state, army)) return fail(routedReason(state, army.routedUntil));
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
      const created = createArmy(state, cmd.nation, army.province, moving);
      created.supplied = army.supplied;
      created.arrivedVia = army.arrivedVia;
      created.routedUntil = army.routedUntil;
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
        first.routedUntil = Math.max(first.routedUntil, a.routedUntil);
        delete state.armies[a.id];
      }
      first.move = null;
      return OK;
    }
    case 'disband': {
      const actor = checkActor(state, cmd.nation);
      if (!actor.ok) return actor;
      const army = state.armies[cmd.armyId];
      if (!army || army.owner !== cmd.nation) return fail('Not your army.');
      if (isArmyInTransit(army)) return fail('Cannot disband while marching.');
      const ids = cmd.unitIds ? new Set(cmd.unitIds) : null;
      const leaving = ids ? army.units.filter((u) => ids.has(u.id)) : army.units;
      if (leaving.length === 0 || (ids && leaving.length !== ids.size)) return fail('Select units of this army to disband.');
      // Veterans go home: some of the manpower returns.
      const r = state.nations[cmd.nation].resources;
      for (const u of leaving) r.manpower += (UNITS[u.type].cost.manpower ?? 0) * ARMY_RULES.disbandManpowerRefund * u.strength;
      army.units = army.units.filter((u) => !leaving.includes(u));
      if (army.units.length === 0) delete state.armies[army.id];
      pushEvent(state, 'disband', `${leaving.length} unit${leaving.length === 1 ? '' : 's'} of the ${armyName(world, army)} stood down.`, {
        nations: [cmd.nation],
        province: army.province,
      });
      return OK;
    }
    case 'recruit': {
      const check = checkRecruit(state, world, cmd.nation, cmd.province, cmd.unitType);
      if (!check.ok) return check;
      const cost = recruitCost(state, cmd.nation, cmd.unitType);
      spend(state, cmd.nation, cost);
      const ticks = recruitTicks(state, cmd.nation, cmd.unitType);
      state.provinces[cmd.province].recruitQueue.push({ unitType: cmd.unitType, remaining: ticks, total: ticks, cost });
      return OK;
    }
    case 'cancelRecruit': {
      const actor = checkActor(state, cmd.nation);
      if (!actor.ok) return actor;
      const p = state.provinces[cmd.province];
      if (!p || p.owner !== cmd.nation) return fail('You do not control this province.');
      const job = p.recruitQueue[cmd.index];
      if (!job) return fail('No such job.');
      refund(state, cmd.nation, job.cost ?? recruitCost(state, cmd.nation, job.unitType), jobRefund(job));
      p.recruitQueue.splice(cmd.index, 1);
      return OK;
    }
    case 'build': {
      const check = checkBuild(state, world, cmd.nation, cmd.province, cmd.building);
      if (!check.ok) return check;
      const p = state.provinces[cmd.province];
      const level = (p.buildings[cmd.building] ?? 0) + 1;
      const cost = constructionCost(state, cmd.nation, cmd.building, level);
      spend(state, cmd.nation, cost);
      const ticks = constructionTicks(state, cmd.nation, cmd.building, level);
      p.construction = { building: cmd.building, targetLevel: level, remaining: ticks, total: ticks, cost };
      return OK;
    }
    case 'cancelBuild': {
      const actor = checkActor(state, cmd.nation);
      if (!actor.ok) return actor;
      const p = state.provinces[cmd.province];
      if (!p || p.owner !== cmd.nation) return fail('You do not control this province.');
      const job = p.construction;
      if (!job) return fail('Nothing is being built here.');
      refund(state, cmd.nation, job.cost ?? constructionCost(state, cmd.nation, job.building, job.targetLevel), jobRefund(job));
      p.construction = null;
      return OK;
    }
    case 'demolish': {
      const actor = checkActor(state, cmd.nation);
      if (!actor.ok) return actor;
      const p = state.provinces[cmd.province];
      if (!p || p.owner !== cmd.nation) return fail('You do not control this province.');
      if (!p.buildings[cmd.building]) return fail('Nothing to demolish.');
      if (p.construction?.building === cmd.building) return fail('Under construction.');
      const dependent = Object.keys(p.buildings).find((b) => BUILDINGS[b as BuildingType].requiresBuilding === cmd.building);
      if (dependent) return fail(`${BUILDINGS[dependent as BuildingType].name} depends on it.`);
      delete p.buildings[cmd.building];
      pushEvent(state, 'demolish', `${BUILDINGS[cmd.building].name} demolished in ${world.provinces[cmd.province].city.name}.`, {
        nations: [cmd.nation],
        province: cmd.province,
      });
      return OK;
    }
    case 'research': {
      const check = checkResearch(state, cmd.nation, cmd.tech);
      if (!check.ok) return check;
      const cfg = TECH_BY_ID[cmd.tech];
      spend(state, cmd.nation, cfg.cost);
      const ticks = scaledTicks(state, cfg.seconds);
      const r = state.nations[cmd.nation].research;
      r.active.push({ tech: cmd.tech, remaining: ticks, total: ticks });
      r.queue = r.queue.filter((t) => t !== cmd.tech);
      return OK;
    }
    case 'queueResearch': {
      const check = checkQueueResearch(state, cmd.nation, cmd.tech);
      if (!check.ok) return check;
      state.nations[cmd.nation].research.queue.push(cmd.tech);
      startQueuedResearch(state, cmd.nation);
      return OK;
    }
    case 'unqueueResearch': {
      const actor = checkActor(state, cmd.nation);
      if (!actor.ok) return actor;
      const r = state.nations[cmd.nation].research;
      if (!r.queue.includes(cmd.tech)) return fail('Not queued.');
      // Dropping a project also drops queued projects that depend on it.
      const dropped = new Set([cmd.tech]);
      for (const t of r.queue) if (TECH_BY_ID[t].requires.some((q) => dropped.has(q))) dropped.add(t);
      r.queue = r.queue.filter((t) => !dropped.has(t));
      return OK;
    }
    case 'cancelResearch': {
      const actor = checkActor(state, cmd.nation);
      if (!actor.ok) return actor;
      const r = state.nations[cmd.nation].research;
      const job = r.active.find((j) => j.tech === cmd.tech);
      if (!job) return fail('Not in progress.');
      refund(state, cmd.nation, TECH_BY_ID[cmd.tech].cost, RESEARCH_RULES.cancelRefund);
      r.active = r.active.filter((j) => j !== job);
      const dropped = new Set([cmd.tech]);
      for (const t of r.queue) if (TECH_BY_ID[t].requires.some((q) => dropped.has(q))) dropped.add(t);
      r.queue = r.queue.filter((t) => !dropped.has(t));
      return OK;
    }
    case 'declareWar': {
      const check = checkDeclareWar(state, cmd.nation, cmd.target);
      if (!check.ok) return check;
      declareWar(state, world, cmd.nation, cmd.target);
      return OK;
    }
    case 'offerPeace': {
      const check = checkOfferPeace(state, world, cmd.nation, cmd.target);
      if (!check.ok) return check;
      state.peaceOffers.push({
        from: cmd.nation,
        to: cmd.target,
        expiresAt: state.tick + scaledTicks(state, DIPLOMACY.peaceOfferExpirySeconds),
      });
      pushEvent(state, 'peace-offer', `${sentence(nationName(world, cmd.nation))} offered peace to ${nationName(world, cmd.target)}.`, {
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
        state.nations[cmd.from].relations[cmd.nation].peaceOfferAfter = state.tick + scaledTicks(state, DIPLOMACY.peaceRetrySeconds);
        pushEvent(state, 'peace-rejected', `${sentence(nationName(world, cmd.nation))} rejected peace with ${nationName(world, cmd.from)}.`, {
          nations: [cmd.nation, cmd.from],
          subject: cmd.from,
          severity: 'bad',
        });
      }
      return OK;
    }
  }
}

/** Share of a job's price returned on cancel: all of it until work has started. */
function jobRefund(job: { remaining: number; total: number }): number {
  return job.remaining < job.total ? ECONOMY.startedJobRefund : 1;
}
