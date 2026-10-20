// Supply network and army condition (healing / attrition).
//
// A province is supplied when it is connected through its owner's territory to
// a supply hub (the capital or any Supply Depot). Armies are supplied in such
// provinces, or within SUPPLY.frontlineRange connections of one.
import { SUPPLY } from '../config/rules';
import { INTERVALS } from '../config/timing';
import { pushEvent } from '../events';
import { hostileArmiesIn, isArmyInTransit, scaledTicks } from '../queries';
import { NEUTRAL, type GameState, type NationId, type ProvinceId } from '../types';
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
    const net = networks.get(army.owner)!;
    let supplied = net.has(army.province);
    if (!supplied && SUPPLY.frontlineRange > 0) {
      supplied = world.neighbors[army.province].some((n) => net.has(n.id));
    }
    if (!supplied && army.supplied) {
      pushEvent(state, 'supply', `An army in ${world.provinces[army.province].name} is cut off from supply.`, {
        nations: [army.owner],
        province: army.province,
        severity: 'bad',
      });
    }
    army.supplied = supplied;
    army.unsuppliedTicks = supplied ? 0 : army.unsuppliedTicks + interval;
  }
}

/** Healing in friendly supplied territory; attrition when starved. */
export function armyConditionSystem(state: GameState, world: World): void {
  const grace = scaledTicks(state, SUPPLY.attritionGraceSeconds);
  for (const aid of Object.keys(state.armies).sort()) {
    const army = state.armies[aid];
    if (isArmyInTransit(army)) continue;
    const inBattle = hostileArmiesIn(state, army.province, army.owner).length > 0;
    if (army.unsuppliedTicks >= grace) {
      for (const u of army.units) u.strength -= SUPPLY.attritionPerStep;
      army.units = army.units.filter((u) => u.strength > 0.001);
      if (army.units.length === 0) {
        delete state.armies[aid];
        pushEvent(state, 'attrition', `A starving army in ${world.provinces[army.province].name} disintegrated.`, {
          nations: army.owner === NEUTRAL ? [] : [army.owner],
          province: army.province,
          severity: 'bad',
        });
      }
      continue;
    }
    const home = state.provinces[army.province].owner === army.owner;
    if (!inBattle && home && army.supplied) {
      for (const u of army.units) u.strength = Math.min(1, u.strength + SUPPLY.healPerStep);
    }
  }
}
