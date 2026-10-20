// Fastest legal route for an army over the explicit connection graph.
import { canEnterProvince, captureTicks } from './queries';
import { legTicks } from './systems/movement';
import type { Army, GameState, ProvinceId } from './types';
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
  // Graph is ~50 nodes: a linear-scan priority queue is plenty and fully deterministic.
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
