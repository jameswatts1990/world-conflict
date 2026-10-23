// Fog of war: what each nation can see. Every province a nation holds and every
// army it fields watch their own province and the ones next to it (an army with
// reconnaissance units sees further), seeing a land means seeing its city, and a
// nation that has researched Liaison Officers also sees everything its allies
// see. Sight is worked out from the state whenever it is asked for and never
// stored, so it cannot go stale and saves are unchanged. Computer opponents do not
// use it yet: they see the map.
import { SIGHT } from './config/rules';
import { UNITS } from './config/units';
import { atWar, techEffects } from './queries';
import { NEUTRAL, type Army, type GameState, type NationId, type OwnerId, type ProvinceId } from './types';
import { landOf, type World } from './world';

/** Two powers at peace with each other and at war with a common enemy fight as allies. */
export function areAllies(state: GameState, a: OwnerId, b: OwnerId): boolean {
  if (a === b || a === NEUTRAL || b === NEUTRAL) return false;
  const na = state.nations[a];
  const nb = state.nations[b];
  if (!na || !nb || na.eliminated || nb.eliminated || atWar(state, a, b)) return false;
  return commonEnemies(state, a, b).length > 0;
}

/** The nations two powers are both at war with, in id order. */
export function commonEnemies(state: GameState, a: NationId, b: NationId): NationId[] {
  return Object.keys(state.nations)
    .sort()
    .filter((c) => !state.nations[c].eliminated && atWar(state, a, c) && atWar(state, b, c));
}

/** A nation's allies, in scenario order. */
export function alliesOf(state: GameState, world: World, nation: NationId): NationId[] {
  return world.nationIds.filter((id) => areAllies(state, nation, id));
}

/** Does this nation see what its allies see (Liaison Officers)? */
export function sharesAlliedSight(state: GameState, nation: NationId): boolean {
  return techEffects(state, nation).some((e) => e.kind === 'alliedSight');
}

/** How many connections out an army sees. */
export function armySight(army: Army): number {
  return army.units.some((u) => UNITS[u.type].recon) ? SIGHT.recon : SIGHT.army;
}

/** Adds every province within `range` connections of `from` to `seen`. */
function watch(world: World, from: ProvinceId, range: number, seen: Set<ProvinceId>): void {
  // Each watcher walks its own rings: a province another watcher already sees still leads on.
  const reached = new Set<ProvinceId>([from]);
  let ring = [from];
  for (let r = 0; r < range && ring.length > 0; r++) {
    const next: ProvinceId[] = [];
    for (const pid of ring) {
      for (const n of world.neighbors[pid]) {
        if (reached.has(n.id)) continue;
        reached.add(n.id);
        next.push(n.id);
      }
    }
    ring = next;
  }
  for (const pid of reached) seen.add(pid);
}

/**
 * What a nation sees with its own eyes: around everything it holds and wherever its armies are. Sight is
 * reckoned over the land: a city looks out from the land round it, and whoever sees a stretch of land sees
 * into the city in its middle too.
 */
export function ownSight(state: GameState, world: World, nation: NationId): Set<ProvinceId> {
  const seen = new Set<ProvinceId>();
  for (const id of world.provinceIds) {
    if (state.provinces[id].owner !== nation) continue;
    seen.add(id);
    watch(world, landOf(world, id), SIGHT.province, seen);
  }
  // A marching army watches from the province it set out from (its range covers where it is heading).
  for (const army of Object.values(state.armies)) {
    if (army.owner !== nation) continue;
    seen.add(army.province);
    watch(world, landOf(world, army.province), armySight(army), seen);
  }
  for (const pid of [...seen]) {
    const city = world.provinces[pid].contains;
    if (city) seen.add(city);
  }
  return seen;
}

/**
 * Every province a nation can see now: its own sight and, with Liaison Officers, its
 * allies'. When the campaign is over the fog lifts.
 */
export function visibleProvinces(state: GameState, world: World, nation: NationId): Set<ProvinceId> {
  if (state.outcome) return new Set(world.provinceIds);
  const seen = ownSight(state, world, nation);
  if (sharesAlliedSight(state, nation)) {
    for (const ally of alliesOf(state, world, nation)) for (const pid of ownSight(state, world, ally)) seen.add(pid);
  }
  return seen;
}

/** Where an army can be spotted: where it stands, or the nearer end of the road it is marching. */
export function armySightedAt(army: Army): ProvinceId {
  const leg = army.move?.leg;
  if (!leg) return army.province;
  return leg.elapsed * 2 < leg.duration ? leg.from : leg.to;
}

/** Can `viewer` see this army? Always its own; any other only where `viewer` can see. */
export function isArmyVisible(army: Army, viewer: NationId, seen: ReadonlySet<ProvinceId>): boolean {
  return army.owner === viewer || seen.has(armySightedAt(army));
}
