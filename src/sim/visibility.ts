// Fog of war: what each nation can see. Every province a nation holds watches its own region (a city and the
// lands round it) and the provinces just over its border; an army sees only where it stands, unless its units see
// further (reconnaissance units one step, over open land: mountains and narrow seas are seen across but not
// beyond, wide seas not at all). Beyond its sight, within a further detection range, a nation picks up radar
// blips: unknown armies, with a rough size and nothing else. A nation that has researched Liaison Officers also
// sees (and detects) everything its co-belligerents do. Sight and blips are worked out from the state whenever
// they are asked for and never stored, so they cannot go stale and saves are unchanged. Computer opponents see
// through the same rules (`ai/context.ts`).
import { SIGHT } from './config/rules';
import { UNITS } from './config/units';
import { atWar, techEffects } from './queries';
import { NEUTRAL, type Army, type GameState, type NationId, type OwnerId, type ProvinceId, type UnitType } from './types';
import type { World } from './world';

/**
 * Two powers at peace with each other and at war with a common enemy are co-belligerents
 * (the player sees them called so). It is not an alliance: there are no treaties, nobody
 * agrees to it, and all it changes is what Liaison Officers share.
 */
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

/** A nation's co-belligerents, in scenario order. */
export function alliesOf(state: GameState, world: World, nation: NationId): NationId[] {
  return world.nationIds.filter((id) => areAllies(state, nation, id));
}

/** Does this nation see what its co-belligerents see (Liaison Officers)? */
export function sharesAlliedSight(state: GameState, nation: NationId): boolean {
  return techEffects(state, nation).some((e) => e.kind === 'alliedSight');
}

/** How many steps out a unit of this type sees (0: only the province its army stands in). */
export function unitSight(type: UnitType): number {
  return UNITS[type].sight ?? SIGHT.unit;
}

/** How many steps out a unit of this type picks up radar blips. */
export function unitDetect(type: UnitType): number {
  return UNITS[type].detect ?? unitSight(type) + SIGHT.detectBeyond;
}

/** How many steps out an army sees: as far as its best-sighted unit. */
export function armySight(army: Army): number {
  let best = SIGHT.unit;
  for (const u of army.units) best = Math.max(best, unitSight(u.type));
  return best;
}

/** How many steps out an army picks up radar blips: as far as its best unit. */
export function armyDetect(army: Army): number {
  let best = SIGHT.unit + SIGHT.detectBeyond;
  for (const u of army.units) best = Math.max(best, unitDetect(u.type));
  return best;
}

/**
 * Adds every province within reach of the watchers to `seen`: each watcher a province and how many steps out it
 * sees, a region (a city and the lands round it) counting as one step, so sight carries on round a city for free.
 * It carries on over land; across a mountain border or a narrow sea it reaches the far side and stops, and it
 * never crosses a sea wider than `SIGHT.seaKm`. With no steps at all a watcher sees its own province, and from a
 * city the lands round it (the city's outskirts); whoever sees a land next to a city sees into the city too.
 */
function watch(world: World, watchers: Map<ProvinceId, number>, seen: Set<ProvinceId>): void {
  // How much further sight carries from each province reached: the most any watcher's has left there
  // (whatever one watcher sees from a province, another with more sight left there sees too).
  const left = new Map(watchers);
  const queue = [...watchers.keys()];
  for (const [pid, r] of watchers) {
    if (r > 0) continue;
    for (const land of world.provinces[pid].lands ?? []) if (!left.has(land)) left.set(land, 0);
  }
  for (let i = 0; i < queue.length; i++) {
    const pid = queue[i];
    const r = left.get(pid)!;
    if (r <= 0) continue;
    for (const n of world.neighbors[pid]) {
      if (n.kind === 'strait' && (n.seaKm ?? n.distanceKm) > SIGHT.seaKm) continue;
      const next = n.kind !== 'land' ? 0 : world.regionOf[n.id] === world.regionOf[pid] ? r : r - 1;
      if ((left.get(n.id) ?? -1) >= next) continue;
      left.set(n.id, next);
      queue.push(n.id);
    }
  }
  for (const pid of left.keys()) seen.add(pid);
  for (const pid of [...seen]) {
    const city = world.provinces[pid].around;
    if (city && world.neighbors[pid].some((n) => n.id === city)) seen.add(city);
  }
}

/**
 * What a nation reaches with its own eyes (`far` false) or its own radar (`far` true): around everything it holds
 * and wherever its armies are. A marching army watches from both ends of the road it is on.
 */
function ownReach(state: GameState, world: World, nation: NationId, far: boolean): Set<ProvinceId> {
  const watchers = new Map<ProvinceId, number>();
  const post = (pid: ProvinceId, range: number) => {
    if ((watchers.get(pid) ?? -1) < range) watchers.set(pid, range);
  };
  const held = far ? SIGHT.provinceDetect : SIGHT.province;
  for (const id of world.provinceIds) if (state.provinces[id].owner === nation) post(id, held);
  for (const army of Object.values(state.armies)) {
    if (army.owner !== nation) continue;
    const range = far ? armyDetect(army) : armySight(army);
    post(army.province, range);
    const leg = army.move?.leg;
    if (leg) {
      post(leg.from, range);
      post(leg.to, range);
    }
  }
  const seen = new Set<ProvinceId>();
  watch(world, watchers, seen);
  return seen;
}

/**
 * What a nation sees with its own eyes: its own region and the provinces just over the border round everything it
 * holds, and wherever its armies are (further with reconnaissance units). Sight is reckoned over the land: a city
 * looks out from the lands round it, and whoever sees a land next to a city sees into the city too.
 */
export function ownSight(state: GameState, world: World, nation: NationId): Set<ProvinceId> {
  return ownReach(state, world, nation, false);
}

/**
 * Every province a nation can see now: its own sight and, with Liaison Officers, its
 * co-belligerents'. When the campaign is over the fog lifts.
 */
export function visibleProvinces(state: GameState, world: World, nation: NationId): Set<ProvinceId> {
  if (state.outcome) return new Set(world.provinceIds);
  const seen = ownSight(state, world, nation);
  if (sharesAlliedSight(state, nation)) {
    for (const ally of alliesOf(state, world, nation)) for (const pid of ownSight(state, world, ally)) seen.add(pid);
  }
  return seen;
}

/**
 * Every province a nation's radar covers (its sight included): further out than it sees, by its held land's and
 * armies' detection ranges, and with Liaison Officers its co-belligerents' too. Hidden armies in it show as blips.
 */
export function detectedProvinces(state: GameState, world: World, nation: NationId): Set<ProvinceId> {
  if (state.outcome) return new Set(world.provinceIds);
  const found = ownReach(state, world, nation, true);
  if (sharesAlliedSight(state, nation)) {
    for (const ally of alliesOf(state, world, nation)) for (const pid of ownReach(state, world, ally, true)) found.add(pid);
  }
  for (const pid of visibleProvinces(state, world, nation)) found.add(pid);
  return found;
}

/** How big a radar blip looks: by how many units are hidden there (`SIGHT.blipUnits`). */
export type BlipSize = 'small' | 'medium' | 'large';

/**
 * An unknown army on the radar: in a province out of sight but within detection range. It gives where (the
 * province) and a rough size, nothing else: not whose, not what, not how many armies (all those hidden in one
 * province make one blip).
 */
export interface Blip {
  province: ProvinceId;
  size: BlipSize;
}

export function blipSize(units: number): BlipSize {
  return units >= SIGHT.blipUnits.large ? 'large' : units >= SIGHT.blipUnits.medium ? 'medium' : 'small';
}

/**
 * The radar blips `viewer` picks up, in the map's province order: every province in `detected` but not in `seen`
 * where other nations' armies stand (where `armySightedAt` puts them). Pass the sets when already worked out.
 */
export function radarBlips(
  state: GameState,
  world: World,
  viewer: NationId,
  seen: ReadonlySet<ProvinceId> = visibleProvinces(state, world, viewer),
  detected: ReadonlySet<ProvinceId> = detectedProvinces(state, world, viewer),
): Blip[] {
  const units = new Map<ProvinceId, number>();
  for (const army of Object.values(state.armies)) {
    if (army.owner === viewer || army.units.length === 0) continue;
    const at = armySightedAt(army);
    if (seen.has(at) || !detected.has(at)) continue;
    units.set(at, (units.get(at) ?? 0) + army.units.length);
  }
  if (units.size === 0) return [];
  return world.provinceIds.filter((pid) => units.has(pid)).map((province) => ({ province, size: blipSize(units.get(province)!) }));
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
