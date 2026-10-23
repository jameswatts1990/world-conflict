// Timed army movement along explicit connections. Runs every tick.
import { BUILDING_EFFECTS } from '../config/buildings';
import { MOVEMENT } from '../config/rules';
import { UNITS } from '../config/units';
import { pushEvent } from '../events';
import { armyName } from '../names';
import { findPath } from '../pathfinding';
import { areHostile, canEnterProvince, hostileArmiesIn, scaledTicks, unitSpeedKmPerTick } from '../queries';
import type { Army, GameState, ProvinceId, UnitType } from '../types';
import { provinceName } from '../text';
import { connectionBetween, type World } from '../world';

/**
 * Ticks needed for this army to travel one connection. Every unit type has
 * its own speed and its own feel for passes and terrain (mountain troops climb,
 * lorries bog down); the slowest decides. Owned railway junctions at either
 * end speed the leg up.
 */
export function legTicks(state: GameState, world: World, army: Army, from: ProvinceId, to: ProvinceId): number {
  const conn = connectionBetween(world, from, to);
  if (!conn) return Infinity;
  const km = conn.distanceKm * MOVEMENT.routeFactor;
  const terrain = world.provinces[to].terrain;
  let worst = 0;
  const seen = new Set<UnitType>();
  for (const u of army.units) {
    if (seen.has(u.type)) continue;
    seen.add(u.type);
    const mv = UNITS[u.type].movement;
    const connFactor = mv?.connection?.[conn.kind] ?? MOVEMENT.connection[conn.kind];
    const terrainFactor = mv?.terrain?.[terrain] ?? MOVEMENT.terrain[terrain];
    worst = Math.max(worst, (km / unitSpeedKmPerTick(state, army.owner, u.type)) * connFactor * terrainFactor);
  }
  if (seen.size === 0) worst = km * state.settings.durationScale;
  let rail = 0;
  for (const end of [from, to]) {
    const p = state.provinces[end];
    if (p.owner === army.owner && (p.buildings.railway ?? 0) > 0) rail++;
  }
  const railMult = rail === 0 ? 1 : rail === 1 ? 1 - BUILDING_EFFECTS.railwayLeg : 1 - BUILDING_EFFECTS.railwayLeg * 1.75;
  const gate = world.provinces[from].within === to || world.provinces[to].within === from;
  return Math.max(scaledTicks(state, gate ? MOVEMENT.minGateSeconds : MOVEMENT.minLegSeconds), Math.ceil(worst * railMult));
}

/**
 * An army waiting at a node holds position while it is fighting or, unless it
 * is only moving, while it is capturing the hostile province it stands in; it
 * then continues its path.
 */
export function mustHold(state: GameState, army: Army): boolean {
  if (hostileArmiesIn(state, army.province, army.owner).length > 0) return true;
  if (army.move?.mode === 'move') return false;
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
    pushEvent(state, 'move', `The ${armyName(world, army)} halted: the route to ${provinceName(world, next)} is closed.`, {
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
      if (army.move.path.length === 0 && !turnPatrol(state, world, army)) {
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
      pushEvent(state, 'move', `The ${armyName(world, army)} was refused entry to ${provinceName(world, leg.to)} and turned back.`, {
        nations: army.owner === 'neutral' ? [] : [army.owner],
        province: leg.from,
      });
      continue;
    }
    army.arrivedVia = connectionBetween(world, leg.from, leg.to)?.kind ?? null;
    army.province = leg.to;
    army.move.path.shift();
    if (army.move.path.length === 0 && !army.move.patrol) army.move = null;
  }
}

/** A patrol at the end of its beat turns for the other end; false once no route is left. */
function turnPatrol(state: GameState, world: World, army: Army): boolean {
  const ends = army.move?.patrol;
  if (!ends) return false;
  const next = army.province === ends[1] ? ends[0] : ends[1];
  const route = next === army.province ? null : findPath(state, world, army, army.province, next);
  if (!route) return false;
  army.move!.path = route.path;
  return true;
}
