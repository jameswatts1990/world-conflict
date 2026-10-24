// Fastest legal route for an army over the explicit connection graph.
import { canEnterProvince, captureTicks } from './queries';
import { legTicks } from './systems/movement';
import type { Army, GameState, MoveLeg, ProvinceId, RoadHalt, RoadSpot } from './types';
import type { World } from './world';

export interface PathResult {
  path: ProvinceId[];
  ticks: number;
}

/** Dijkstra from `from` to `to`. Returned path excludes the start node. */
export function findPath(
  state: GameState,
  world: World,
  army: Army,
  from: ProvinceId,
  to: ProvinceId,
): PathResult | null {
  if (from === to) return { path: [], ticks: 0 };
  if (!canEnterProvince(state, army.owner, to)) return null;
  const dist = new Map<ProvinceId, number>([[from, 0]]);
  const prev = new Map<ProvinceId, ProvinceId>();
  const done = new Set<ProvinceId>();
  // Graph is a few hundred nodes: a linear-scan priority queue is plenty and fully deterministic.
  const open: ProvinceId[] = [from];
  while (open.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      const di = dist.get(open[i])!;
      const db = dist.get(open[bestIdx])!;
      if (di < db || (di === db && open[i] < open[bestIdx])) bestIdx = i;
    }
    const cur = open.splice(bestIdx, 1)[0];
    if (cur === to) break;
    if (done.has(cur)) continue;
    done.add(cur);
    for (const n of world.neighbors[cur]) {
      if (done.has(n.id) || !canEnterProvince(state, army.owner, n.id)) continue;
      // A city is the way between the lands round it only for whoever holds it: anyone else goes round, or
      // makes it the destination.
      if (n.id !== to && world.provinces[n.id].city && state.provinces[n.id].owner !== army.owner) continue;
      // Hostile provinces on the way must be captured before the army moves on.
      const hold = state.provinces[n.id].owner !== army.owner ? captureTicks(state, world, n.id) : 0;
      const nd = dist.get(cur)! + legTicks(state, world, army, cur, n.id) + hold;
      if (nd < (dist.get(n.id) ?? Infinity)) {
        dist.set(n.id, nd);
        prev.set(n.id, cur);
        if (!open.includes(n.id)) open.push(n.id);
      }
    }
  }
  if (!dist.has(to)) return null;
  const path: ProvinceId[] = [];
  let cur: ProvinceId | undefined = to;
  while (cur && cur !== from) {
    path.unshift(cur);
    cur = prev.get(cur);
  }
  return { path, ticks: dist.get(to)! };
}

/** A march from wherever the army is now: in a province, halted on a road, or on the way. */
export interface MarchPlan {
  /** The province it reaches first (where it stands, or an end of the road it is on). */
  start: ProvinceId;
  /** The leg it is on or sets out on from a road (null: it sets out from where it stands along `path`). */
  leg: MoveLeg | null;
  /** Provinces still to reach; path[0] is the leg's target. */
  path: ProvinceId[];
  ticks: number;
  /** Where the march stops short of the last province in `path`, on the road leading to it. */
  halt?: RoadHalt;
}

/** A leg from one city to the next, `done` (0..1) of the way along already. */
function legFrom(state: GameState, world: World, army: Army, from: ProvinceId, to: ProvinceId, done: number): MoveLeg {
  const duration = legTicks(state, world, army, from, to);
  return { from, to, elapsed: Math.round(done * duration), duration };
}

/** The army's place on a road, as a fraction of the way from `a` to `b`, or null when it is not on that road. */
function placeOn(army: Army, a: ProvinceId, b: ProvinceId): number | null {
  const leg = army.move?.leg;
  if (leg) {
    if (leg.from === a && leg.to === b) return leg.elapsed / leg.duration;
    if (leg.from === b && leg.to === a) return 1 - leg.elapsed / leg.duration;
    return null;
  }
  const road = army.road;
  if (!road) return null;
  if (army.province === a && road.toward === b) return road.at;
  if (army.province === b && road.toward === a) return 1 - road.at;
  return null;
}

/**
 * The fastest march to a province, or with `road` to a spot on the road out of it. From a
 * road (or mid-march) the army may go on to the province ahead or turn back to the one
 * behind, whichever is quicker; a spot on a road is reached from either of its ends, or
 * straight along the road when the army is already on it. Null when there is no route.
 */
export function planMarch(state: GameState, world: World, army: Army, to: ProvinceId, road?: RoadSpot | null): MarchPlan | null {
  const halt: RoadHalt | undefined = road ? { province: to, toward: road.toward, at: road.at } : undefined;
  // Along the road it is already on.
  if (halt) {
    const here = placeOn(army, to, halt.toward);
    if (here !== null) {
      const leg = army.move?.leg;
      const ahead = halt.at >= here;
      const [from, next] = ahead ? [to, halt.toward] : [halt.toward, to];
      const kept = leg && leg.from === from ? leg : null;
      const reversed = leg && !kept ? { from: leg.to, to: leg.from, elapsed: leg.duration - leg.elapsed, duration: leg.duration } : null;
      const out = kept ?? reversed ?? legFrom(state, world, army, from, next, ahead ? here : 1 - here);
      const stop = Math.round((ahead ? halt.at : 1 - halt.at) * out.duration);
      return { start: next, leg: out, path: [next], ticks: Math.max(0, stop - out.elapsed), halt };
    }
  }
  // The provinces it can make for first, and what reaching them costs.
  const starts: { node: ProvinceId; leg: MoveLeg | null; cost: number }[] = [];
  const leg = army.move?.leg;
  if (leg) {
    starts.push({ node: leg.to, leg, cost: leg.duration - leg.elapsed });
    starts.push({ node: leg.from, leg: { from: leg.to, to: leg.from, elapsed: leg.duration - leg.elapsed, duration: leg.duration }, cost: leg.elapsed });
  } else if (army.road) {
    const on = legFrom(state, world, army, army.province, army.road.toward, army.road.at);
    const back = legFrom(state, world, army, army.road.toward, army.province, 1 - army.road.at);
    starts.push({ node: on.to, leg: on, cost: on.duration - on.elapsed });
    starts.push({ node: back.to, leg: back, cost: back.duration - back.elapsed });
  } else {
    starts.push({ node: army.province, leg: null, cost: 0 });
  }
  // The provinces it can make for last, and the stretch of road from there to the spot.
  const ends: { node: ProvinceId; next: ProvinceId | null; cost: number }[] = [];
  if (halt) {
    const out = legTicks(state, world, army, to, halt.toward);
    const back = legTicks(state, world, army, halt.toward, to);
    ends.push({ node: to, next: halt.toward, cost: Math.round(halt.at * out) });
    ends.push({ node: halt.toward, next: to, cost: Math.round((1 - halt.at) * back) });
  } else {
    ends.push({ node: to, next: null, cost: 0 });
  }
  let best: MarchPlan | null = null;
  for (const s of starts) {
    // Back to where it stands is always open; anywhere else must be enterable.
    if (s.node !== army.province && !canEnterProvince(state, army.owner, s.node)) continue;
    for (const e of ends) {
      const route = findPath(state, world, army, s.node, e.node);
      if (!route) continue;
      const ticks = s.cost + route.ticks + e.cost;
      if (best && ticks >= best.ticks) continue;
      const path = [...(s.leg ? [s.node] : []), ...route.path, ...(e.next ? [e.next] : [])];
      best = { start: s.node, leg: s.leg, path, ticks, ...(halt ? { halt } : {}) };
    }
  }
  return best;
}

/** Ticks until the army's current march ends (0 when it is not marching). */
export function marchTicksLeft(state: GameState, world: World, army: Army): number {
  const move = army.move;
  if (!move || move.path.length === 0) return 0;
  const leg = move.leg;
  const dest = move.path[move.path.length - 1];
  const from = leg ? leg.to : army.province;
  const legLeft = leg ? leg.duration - leg.elapsed : 0;
  const via = (a: ProvinceId, b: ProvinceId) => (a === b ? 0 : (findPath(state, world, army, a, b)?.ticks ?? 0));
  const halt = move.halt;
  if (!halt) return legLeft + via(from, dest);
  // It stops on the road into the last province, short of it.
  const last = move.path.length >= 2 ? move.path[move.path.length - 2] : leg ? leg.from : army.province;
  const into = last === halt.province ? halt.at : 1 - halt.at;
  if (leg && move.path.length === 1) return Math.max(0, Math.round(into * leg.duration) - leg.elapsed);
  return legLeft + via(from, last) + Math.round(into * legTicks(state, world, army, last, dest));
}
