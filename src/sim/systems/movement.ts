// Timed army movement along explicit connections. Runs every tick.
import { MOVEMENT } from '../config/rules';
import { pushEvent } from '../events';
import { areHostile, armySpeedKmPerTick, canEnterProvince, hostileArmiesIn, scaledTicks } from '../queries';
import { provinceName } from '../text';
import type { Army, GameState, ProvinceId } from '../types';
import { connectionBetween, type World } from '../world';

const MIN_LEG_SECONDS = 15;

/** Ticks needed for this army to travel one connection. */
export function legTicks(state: GameState, world: World, army: Army, from: ProvinceId, to: ProvinceId): number {
  const conn = connectionBetween(world, from, to);
  if (!conn) return Infinity;
  const km = conn.distanceKm * MOVEMENT.routeFactor;
  const terrain = world.provinces[to].terrain;
  const raw = (km / armySpeedKmPerTick(state, army)) * MOVEMENT.connection[conn.kind] * MOVEMENT.terrain[terrain];
  return Math.max(scaledTicks(state, MIN_LEG_SECONDS), Math.ceil(raw));
}

/**
 * An army waiting at a node holds position while it is fighting or while it
 * is capturing the hostile province it stands in; it then continues its path.
 */
export function mustHold(state: GameState, army: Army): boolean {
  if (hostileArmiesIn(state, army.province, army.owner).length > 0) return true;
  const owner = state.provinces[army.province].owner;
  return owner !== army.owner && areHostile(state, army.owner, owner);
}

/** Begins the next leg of the army's path. Returns false (and clears the order) if it is no longer legal. */
export function startLeg(state: GameState, world: World, army: Army): boolean {
  const move = army.move;
  if (!move || move.path.length === 0) {
    army.move = null;
    return false;
  }
  const next = move.path[0];
  if (!connectionBetween(world, army.province, next) || !canEnterProvince(state, army.owner, next)) {
    army.move = null;
    pushEvent(state, 'move', `An army halted: the route to ${provinceName(world, next)} is closed.`, {
      nations: army.owner === 'neutral' ? [] : [army.owner],
      province: army.province,
    });
    return false;
  }
  move.leg = { from: army.province, to: next, elapsed: 0, duration: legTicks(state, world, army, army.province, next) };
  return true;
}

export function movementSystem(state: GameState, world: World): void {
  const ids = Object.keys(state.armies).sort();
  for (const id of ids) {
    const army = state.armies[id];
    if (!army?.move) continue;
    if (!army.move.leg) {
      if (army.move.path.length === 0) {
        army.move = null;
        continue;
      }
      if (mustHold(state, army)) continue;
      if (!startLeg(state, world, army)) continue;
    }
    const leg = army.move.leg!;
    leg.elapsed += 1;
    if (leg.elapsed < leg.duration) continue;

    // Arrival
    army.move.leg = null;
    if (!canEnterProvince(state, army.owner, leg.to)) {
      // Diplomacy changed mid-march (e.g. peace signed): turn back.
      army.move = null;
      pushEvent(state, 'move', `An army was refused entry to ${provinceName(world, leg.to)} and turned back.`, {
        nations: army.owner === 'neutral' ? [] : [army.owner],
        province: leg.from,
      });
      continue;
    }
    army.province = leg.to;
    army.move.path.shift();
    if (army.move.path.length === 0) army.move = null;
  }
}
