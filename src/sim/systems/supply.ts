// Supply network and army condition (healing, attrition, morale recovery).
//
// A province is supplied when it is connected through its owner's territory to
// a supply hub (the capital or any Supply Depot). Armies are supplied in such
// provinces, or within front-line range of one (railway junctions reach further).
import { BUILDING_EFFECTS } from '../config/buildings';
import { MORALE, SUPPLY } from '../config/rules';
import { INTERVALS } from '../config/timing';
import { pushEvent } from '../events';
import { armyName } from '../names';
import { hostileArmiesIn, isArmyInTransit, scaledTicks, techEffects, unitMoraleCap } from '../queries';
import { NEUTRAL, type GameState, type NationId, type OwnerId, type ProvinceId } from '../types';
import { provinceName } from '../text';
import type { World } from '../world';

export function suppliedProvinces(state: GameState, world: World, nation: NationId): Set<ProvinceId> {
  const capital = world.nations[nation].capital;
  const queue: ProvinceId[] = [];
  const seen = new Set<ProvinceId>();
  for (const id of world.provinceIds) {
    const p = state.provinces[id];
    if (p.owner !== nation) continue;
    if (id === capital || (p.buildings.supplyDepot ?? 0) > 0) {
      seen.add(id);
      queue.push(id);
    }
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const n of world.neighbors[cur]) {
      if (seen.has(n.id) || state.provinces[n.id].owner !== nation) continue;
      seen.add(n.id);
      queue.push(n.id);
    }
  }
  return seen;
}

/** Connections beyond supplied territory that front-line supply reaches. */
export function frontlineRange(state: GameState, nation: OwnerId): number {
  let r = SUPPLY.frontlineRange;
  for (const e of techEffects(state, nation)) if (e.kind === 'supplyRange') r += e.amount;
  return r;
}

/** Is a province within front-line supply range of a nation's supplied network? */
export function inSupplyRange(state: GameState, world: World, nation: NationId, net: Set<ProvinceId>, province: ProvinceId): boolean {
  if (net.has(province)) return true;
  const range = frontlineRange(state, nation);
  const maxRange = range + SUPPLY.railwayRange;
  const dist = new Map<ProvinceId, number>([[province, 0]]);
  const queue: ProvinceId[] = [province];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = dist.get(cur)!;
    if (d >= maxRange) continue;
    for (const n of world.neighbors[cur]) {
      if (dist.has(n.id)) continue;
      dist.set(n.id, d + 1);
      if (net.has(n.id)) {
        const rail = (state.provinces[n.id].buildings.railway ?? 0) > 0;
        if (d + 1 <= range || rail) return true;
      }
      queue.push(n.id);
    }
  }
  return false;
}

export function supplySystem(state: GameState, world: World): void {
  const interval = scaledTicks(state, INTERVALS.supplyUpdate);
  const networks = new Map<NationId, Set<ProvinceId>>();
  for (const id of world.nationIds) networks.set(id, suppliedProvinces(state, world, id));

  for (const id of world.provinceIds) {
    const p = state.provinces[id];
    p.supplied = p.owner === NEUTRAL ? true : networks.get(p.owner)!.has(id);
  }

  for (const aid of Object.keys(state.armies).sort()) {
    const army = state.armies[aid];
    if (army.owner === NEUTRAL) {
      army.supplied = true;
      continue;
    }
    const supplied = inSupplyRange(state, world, army.owner, networks.get(army.owner)!, army.province);
    if (!supplied && army.supplied) {
      pushEvent(state, 'supply', `The ${armyName(world, army)} in ${provinceName(world, army.province)} is cut off from supply.`, {
        nations: [army.owner],
        province: army.province,
        severity: 'bad',
      });
    }
    army.supplied = supplied;
    army.unsuppliedTicks = supplied ? 0 : army.unsuppliedTicks + interval;
  }
}

function attritionGrace(state: GameState, owner: OwnerId): number {
  let s = SUPPLY.attritionGraceSeconds;
  for (const e of techEffects(state, owner)) if (e.kind === 'attritionGrace') s += e.seconds;
  return scaledTicks(state, s);
}

function healingMult(state: GameState, owner: OwnerId): number {
  let m = 1;
  for (const e of techEffects(state, owner)) if (e.kind === 'healing') m *= e.mult;
  return m;
}

/** Healing and morale recovery out of combat; attrition when starved. */
export function armyConditionSystem(state: GameState, world: World): void {
  for (const aid of Object.keys(state.armies).sort()) {
    const army = state.armies[aid];
    if (isArmyInTransit(army)) {
      // Marching armies slowly steady themselves.
      const cap = unitMoraleCap(state, army.owner);
      const rate = army.supplied ? MORALE.recoverPerStep * MORALE.marchingRecovery : 0;
      for (const u of army.units) u.morale = u.morale > cap ? Math.max(cap, u.morale - MORALE.starvingDrain) : Math.min(cap, u.morale + rate);
      continue;
    }
    const inBattle = hostileArmiesIn(state, army.province, army.owner).length > 0;
    if (army.unsuppliedTicks >= attritionGrace(state, army.owner)) {
      for (const u of army.units) {
        u.strength -= SUPPLY.attritionPerStep;
        u.morale = Math.max(0, u.morale - MORALE.starvingDrain);
      }
      const before = army.units.length;
      army.units = army.units.filter((u) => u.strength > 0.001);
      if (army.owner !== NEUTRAL) state.nations[army.owner].stats.unitsLost += before - army.units.length;
      if (army.units.length === 0) {
        delete state.armies[aid];
        pushEvent(state, 'attrition', `Cut off from supply, the ${armyName(world, army)} disintegrated in ${provinceName(world, army.province)}.`, {
          nations: army.owner === NEUTRAL ? [] : [army.owner],
          province: army.province,
          severity: 'bad',
        });
      }
      continue;
    }
    if (inBattle) continue;
    const p = state.provinces[army.province];
    const home = p.owner === army.owner;
    const hospital = home && (p.buildings.hospital ?? 0) > 0;
    if (home && army.supplied) {
      const heal = SUPPLY.healPerStep * healingMult(state, army.owner) * (hospital ? BUILDING_EFFECTS.hospitalHealing : 1);
      for (const u of army.units) u.strength = Math.min(1, u.strength + heal);
    }
    const cap = unitMoraleCap(state, army.owner);
    let rate = army.supplied ? MORALE.recoverPerStep : 0;
    if (home && army.supplied) rate *= MORALE.homeRecovery;
    if (army.move) rate *= MORALE.marchingRecovery;
    if (hospital) rate *= BUILDING_EFFECTS.hospitalMoraleRecovery;
    for (const u of army.units) {
      u.morale = u.morale > cap ? Math.max(cap, u.morale - MORALE.starvingDrain) : Math.min(cap, u.morale + rate);
    }
  }
}
