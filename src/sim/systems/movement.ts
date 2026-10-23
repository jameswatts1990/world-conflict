// Timed army movement along explicit connections. Runs every tick.
import { BUILDING_EFFECTS } from '../config/buildings';
import { MOVEMENT } from '../config/rules';
import { UNITS } from '../config/units';
import { pushEvent } from '../events';
import { armyName } from '../names';
import { findPath } from '../pathfinding';
import { areHostile, canEnterProvince, hostileArmiesIn, scaledTicks, unitSpeedKmPerTick } from '../queries';
import { NEUTRAL, type Army, type GameState, type MoveLeg, type ProvinceId, type RoadHalt, type UnitType } from '../types';
import { provinceName } from '../text';
import { connectionBetween, isCity, type World } from '../world';
import { withdrawArmy } from './territory';

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

/**
 * Begins the next leg of the army's path. From a spot on a road it carries on along the road
 * or walks back first to where its land's roads meet. Returns false (and clears the order) if it is no longer legal.
 */
export function startLeg(state: GameState, world: World, army: Army): boolean {
  const move = army.move;
  if (!move || move.path.length === 0) {
    army.move = null;
    return false;
  }
  const road = army.road;
  if (road && move.path[0] !== road.toward && move.path[0] !== army.province) move.path.unshift(army.province);
  const next = move.path[0];
  const from = road && next === army.province ? road.toward : army.province;
  if (!connectionBetween(world, from, next) || !canEnterProvince(state, army.owner, next)) {
    army.move = null;
    pushEvent(state, 'move', `The ${armyName(world, army)} halted: the route to ${provinceName(world, next)} is closed.`, {
      nations: army.owner === 'neutral' ? [] : [army.owner],
      province: army.province,
    });
    return false;
  }
  const duration = legTicks(state, world, army, from, next);
  const done = road ? (next === road.toward ? road.at : 1 - road.at) : 0;
  move.leg = { from, to: next, elapsed: Math.round(done * duration), duration };
  delete army.road;
  return true;
}

/** How far along a leg the march's halt lies (0..1), or null when the leg does not run along its road. */
function haltOn(leg: MoveLeg, halt: RoadHalt): number | null {
  if (leg.from === halt.province && leg.to === halt.toward) return halt.at;
  if (leg.from === halt.toward && leg.to === halt.province) return 1 - halt.at;
  return null;
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
    const halt = army.move.halt;
    const stop = halt && army.move.path.length === 1 ? haltOn(leg, halt) : null;
    if (halt && stop !== null && leg.elapsed >= Math.round(stop * leg.duration)) {
      haltOnRoad(state, world, army, leg, halt);
      continue;
    }
    if (leg.elapsed < leg.duration) continue;

    // Arrival
    army.move.leg = null;
    if (!canEnterProvince(state, army.owner, leg.to)) {
      refuseEntry(state, world, army, leg.to);
      continue;
    }
    // Walking back within its own province, an army keeps the way it came (a landing stays a landing).
    if (leg.to !== army.province) army.arrivedVia = connectionBetween(world, leg.from, leg.to)?.kind ?? null;
    army.province = leg.to;
    army.move.path.shift();
    if (army.move.path.length === 0 && !army.move.patrol) {
      army.move = null;
      mergeOnArrival(state, world, army);
    }
  }
}

/** The march ends on a road: the army stands there, in the province whose part of the road it is. */
function haltOnRoad(state: GameState, world: World, army: Army, leg: MoveLeg, halt: RoadHalt): void {
  army.move = null;
  if (halt.province !== army.province) {
    if (!canEnterProvince(state, army.owner, halt.province)) {
      refuseEntry(state, world, army, halt.province);
      return;
    }
    army.arrivedVia = connectionBetween(world, leg.from, leg.to)?.kind ?? null;
    army.province = halt.province;
  }
  army.road = { toward: halt.toward, at: halt.at };
}

/**
 * Diplomacy changed mid-march (peace signed): the army turns back to the province it set out from,
 * or, standing in land it may no longer be in, withdraws home.
 */
function refuseEntry(state: GameState, world: World, army: Army, to: ProvinceId): void {
  army.move = null;
  pushEvent(state, 'move', `The ${armyName(world, army)} was refused entry to ${provinceName(world, to)} and turned back.`, {
    nations: army.owner === 'neutral' ? [] : [army.owner],
    province: army.province,
  });
  if (!canEnterProvince(state, army.owner, army.province)) withdrawArmy(state, world, army);
}

/**
 * A player's army that ends its march in a city where another of their armies stands idle joins
 * it: the army standing there keeps its orders and options, the merged army the senior name.
 * Computer opponents gather their armies with their own merge orders when they think.
 */
function mergeOnArrival(state: GameState, world: World, army: Army): void {
  if (!isCity(world, army.province) || army.owner === NEUTRAL || state.nations[army.owner].controller !== 'human' || army.holding) return;
  let host: Army | null = null;
  for (const id of Object.keys(state.armies).sort()) {
    const a = state.armies[id];
    if (a === army || a.owner !== army.owner || a.province !== army.province || a.move || a.road) continue;
    if (!host || a.serial < host.serial) host = a;
  }
  if (!host) return;
  pushEvent(state, 'merge', `The ${armyName(world, army)} joined the ${armyName(world, host)} in ${provinceName(world, army.province)}.`, {
    nations: [army.owner],
    province: army.province,
  });
  host.serial = Math.min(host.serial, army.serial);
  host.units.push(...army.units);
  delete state.armies[army.id];
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
