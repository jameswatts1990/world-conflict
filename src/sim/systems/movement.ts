// Timed army movement along explicit connections. Runs every tick.
import { BUILDING_EFFECTS } from '../config/buildings';
import { MOVEMENT } from '../config/rules';
import { UNITS } from '../config/units';
import { pushEvent } from '../events';
import { armyName } from '../names';
import { findPath } from '../pathfinding';
import { areHostile, canEnterProvince, hostileArmiesIn, isArmyAway, scaledTicks, unitSpeedKmPerTick } from '../queries';
import { NEUTRAL, type Army, type GameState, type MoveLeg, type NationId, type OwnerId, type ProvinceId, type RoadHalt, type RoadSpot, type UnitType } from '../types';
import { provinceName } from '../text';
import { isArmyVisible, visibleProvinces } from '../visibility';
import { connectionBetween, isCity, isCityGate, isOpenRoad, spotOnRoad, type World } from '../world';
import { withdrawArmy as withdrawUnderFire } from './combat';
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
  return Math.max(scaledTicks(state, isCityGate(world, from, to) ? MOVEMENT.minGateSeconds : MOVEMENT.minLegSeconds), Math.ceil(worst * railMult));
}

/**
 * An army waiting at a node holds position while it is fighting or, unless it
 * is only moving, while it is capturing the hostile province it stands in; it
 * then continues its path.
 */
export function mustHold(state: GameState, world: World, army: Army): boolean {
  if (hostileArmiesIn(state, world, army.province, army.owner).length > 0) return true;
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
  const roads = new RoadWatch(state, world, ids);
  for (const id of ids) {
    const army = state.armies[id];
    if (!army?.move) continue;
    if (!army.move.leg) {
      if (army.move.path.length === 0 && !turnPatrol(state, world, army)) {
        army.move = null;
        continue;
      }
      if (mustHold(state, world, army)) continue;
      if (!startLeg(state, world, army)) continue;
      roads.add(army);
    }
    const leg = army.move.leg!;
    const was = leg.elapsed;
    leg.elapsed += 1;
    const halt = army.move.halt;
    const stop = halt && army.move.path.length === 1 ? haltOn(leg, halt) : null;
    if (intercept(state, world, roads, army, leg, was, stop)) continue;
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
    const walkedBack = leg.to === army.province;
    if (!walkedBack) army.arrivedVia = connectionBetween(world, leg.from, leg.to)?.kind ?? null;
    army.province = leg.to;
    army.move.path.shift();
    if (army.move.path.length === 0 && !army.move.patrol) {
      army.move = null;
      mergeOnArrival(state, world, army);
    } else if (walkedBack) {
      // Back at its own land's crossroads on its way on, it passes through: it never left the land, so it does not
      // stop to take it again, and if it leaves a battle there, that is its withdrawal under fire.
      if (startLeg(state, world, army)) {
        roads.add(army);
        if (isArmyAway(world, army)) withdrawUnderFire(state, world, army, army.province);
      }
    }
  }
}

/** The key of the road between two provinces, the same either way. */
const roadKey = (a: ProvinceId, b: ProvinceId) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Who is out on each road this tick: marching along it or standing on it. Built once a tick and
 * added to as armies set out; whoever has left since is skipped when read.
 */
class RoadWatch {
  private on = new Map<string, Army[]>();
  private sight = new Map<NationId, Set<ProvinceId>>();

  constructor(
    private state: GameState,
    private world: World,
    ids: string[],
  ) {
    for (const id of ids) this.add(state.armies[id]);
  }

  add(army: Army): void {
    const leg = army.move?.leg;
    const ends = leg ? [leg.from, leg.to] : army.road ? [army.province, army.road.toward] : null;
    if (!ends || !isOpenRoad(this.world, ends[0], ends[1])) return;
    const key = roadKey(ends[0], ends[1]);
    const list = this.on.get(key);
    if (list) list.push(army);
    else this.on.set(key, [army]);
  }

  armiesOn(a: ProvinceId, b: ProvinceId): Army[] {
    return this.on.get(roadKey(a, b)) ?? [];
  }

  /** Can `viewer` see this army now? Each nation's sight is worked out once a tick, when first needed. */
  sees(viewer: OwnerId, army: Army): boolean {
    if (viewer === NEUTRAL) return false;
    let seen = this.sight.get(viewer);
    if (!seen) {
      seen = visibleProvinces(this.state, this.world, viewer);
      this.sight.set(viewer, seen);
    }
    return isArmyVisible(army, viewer, seen);
  }
}

/** How far along the road from `a` to `b` (0..1) an army is, or null when it is not on that road now. */
function placeOnRoad(army: Army, a: ProvinceId, b: ProvinceId): number | null {
  const leg = army.move?.leg;
  if (leg) {
    if (leg.from === a && leg.to === b) return Math.min(1, leg.elapsed / leg.duration);
    if (leg.from === b && leg.to === a) return Math.max(0, 1 - leg.elapsed / leg.duration);
    return null;
  }
  const road = army.road;
  if (!road) return null;
  if (army.province === a && road.toward === b) return road.at;
  if (army.province === b && road.toward === a) return 1 - road.at;
  return null;
}

/**
 * Armies at war meet on the roads between lands. An army whose march along a road brings it level with an enemy
 * army on it (standing there, coming the other way, or caught up with) is stopped there if the enemy sees it
 * coming; two marching armies both stop if either sees the other. They stand on the road at the meeting point, in
 * the land whose stretch of road it is, keep their orders and fight a normal battle there; whoever is left goes on.
 * Sea crossings and a city's gates are not roads, and an army pulling out of a battle under fire is let go.
 * Positions change one army at a time, so the step that brings the two level is the one that finds it.
 * True when `army` was stopped.
 */
function intercept(state: GameState, world: World, roads: RoadWatch, army: Army, leg: MoveLeg, was: number, stop: number | null): boolean {
  if (leg.withdrawing || !isOpenRoad(world, leg.from, leg.to)) return false;
  const from = was / leg.duration;
  // A march that ends on this road stops at its spot first if that comes sooner.
  const to = Math.min(1, leg.elapsed / leg.duration, stop ?? 1);
  let met: { other: Army; at: number } | null = null;
  for (const other of roads.armiesOn(leg.from, leg.to)) {
    if (other === army || state.armies[other.id] !== other || other.move?.leg?.withdrawing) continue;
    if (!areHostile(state, army.owner, other.owner)) continue;
    const at = placeOnRoad(other, leg.from, leg.to);
    if (at === null || at <= from || at > to || at >= 1) continue;
    if (met && (at > met.at || (at === met.at && other.id > met.other.id))) continue;
    const marching = !!other.move?.leg;
    if (!roads.sees(other.owner, army) && !(marching && roads.sees(army.owner, other))) continue;
    met = { other, at };
  }
  if (!met) return false;
  const { other, at } = met;
  const marching = !!other.move?.leg;
  // It stops at the very spot where an enemy stands; two marching armies, where they meet.
  const spot = marching || !other.road ? spotOnRoad(world, leg.from, leg.to, at) : { province: other.province, road: { ...other.road } };
  const may = (a: Army) => a.province === spot.province || canEnterProvince(state, a.owner, spot.province);
  if (!may(army) || (marching && !may(other))) return false;
  standOnRoad(world, army, spot);
  if (marching) standOnRoad(world, other, spot);
  const place = provinceName(world, spot.province);
  const text = marching
    ? `The ${armyName(world, army)} and the ${armyName(world, other)} ran into each other on the road near ${place}.`
    : `The ${armyName(world, army)} was intercepted by the ${armyName(world, other)} on the road near ${place}.`;
  pushEvent(state, 'intercept', text, {
    nations: [army.owner, other.owner].filter((o): o is NationId => o !== NEUTRAL),
    province: spot.province,
    subject: army.owner,
    severity: 'combat',
  });
  return true;
}

/** Stops a marching army at a spot on the road it is on, keeping its order to carry on from there. */
function standOnRoad(world: World, army: Army, spot: { province: ProvinceId; road: RoadSpot }): void {
  const leg = army.move!.leg!;
  if (spot.province !== army.province) {
    army.arrivedVia = connectionBetween(world, leg.from, leg.to)?.kind ?? null;
    army.province = spot.province;
  }
  army.road = { ...spot.road };
  army.move!.leg = null;
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
