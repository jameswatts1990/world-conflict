// Fog of war: what each nation can see. It sees in full its own territory (the provinces it holds, not over the
// border) and the province each of its armies stands in. Round each army, circles measured in km on the map: within
// its sight (as far as its best-sighted unit sees) enemy armies are seen in full, wherever they stand, and further
// out, within its blip range, they show as radar blips: unknown armies, with a rough size and nothing else. Held
// land picks up blips a little way round each province it holds, so the border is not blind. A nation that has
// researched Liaison Officers also sees (and detects) everything its co-belligerents do. Sight and blips are
// worked out from the state whenever they are asked for and never stored, so they cannot go stale and saves are
// unchanged. Computer opponents see through the same rules (`ai/context.ts`).
import { SIGHT } from './config/rules';
import { UNITS } from './config/units';
import { atWar, techEffects } from './queries';
import { NEUTRAL, type Army, type GameState, type NationId, type OwnerId, type ProvinceId, type UnitType } from './types';
import { provincesAround, provincesNear, spotOnRoadLine, withinKm, type Spot, type World } from './world';

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

/** How far a unit of this type sees, in km on the map: enemy armies within it are seen in full. */
export function unitSightKm(type: UnitType): number {
  return UNITS[type].sightKm ?? SIGHT.unitKm;
}

/** How far a unit of this type picks up radar blips, in km on the map (never short of its sight). */
export function unitBlipKm(type: UnitType): number {
  return Math.max(UNITS[type].blipKm ?? SIGHT.unitBlipKm, unitSightKm(type));
}

/** How far an army sees: as far as its best-sighted unit. */
export function armySightKm(army: Army): number {
  let best = SIGHT.unitKm;
  for (const u of army.units) best = Math.max(best, unitSightKm(u.type));
  return best;
}

/** How far an army picks up radar blips: as far as its best unit. */
export function armyBlipKm(army: Army): number {
  let best = Math.max(SIGHT.unitBlipKm, SIGHT.unitKm);
  for (const u of army.units) best = Math.max(best, unitBlipKm(u.type));
  return best;
}

/** Where an army is on the ground: its province's anchor, or its spot on the road it is marching or halted on. */
export function armySpot(world: World, army: Army): Spot {
  const leg = army.move?.leg;
  if (leg) return spotOnRoadLine(world, leg.from, leg.to, Math.min(1, leg.elapsed / leg.duration));
  if (army.road) return spotOnRoadLine(world, army.province, army.road.toward, army.road.at);
  return world.spots[army.province];
}

/** A circle a nation watches: round one of its armies, `km` from its middle. */
interface Eye {
  at: Spot;
  km: number;
}

/** Is `spot` within the circle? Exact, as `withinKm`; most spots are ruled out by one axis first. */
function inEye(e: Eye, spot: Spot): boolean {
  const r = Math.round(e.km * 1000);
  if (Math.abs(spot[1] - e.at[1]) > r || Math.abs(spot[2] - e.at[2]) > r) return false;
  return withinKm(e.at, spot, e.km);
}

/**
 * What a nation watches: the provinces it sees whole (the set, which the map draws clear of the fog), and the
 * circles round its armies (and, for blips, round its land) within which it makes out armies wherever they stand,
 * on a road as much as at an anchor (`reaches`).
 */
export class Watch extends Set<ProvinceId> {
  readonly world: World;
  private readonly eyes: readonly Eye[];
  /** Held land, and how far round each held province's anchor it watches (0: only the province itself). */
  private readonly land: ReadonlySet<ProvinceId>;
  private readonly landKm: number;

  constructor(world: World, eyes: readonly Eye[] = [], land: ReadonlySet<ProvinceId> = new Set(), landKm = 0) {
    super();
    this.world = world;
    this.eyes = eyes;
    this.land = land;
    this.landKm = landKm;
  }

  /** Is this spot within one of the circles? */
  reaches(spot: Spot): boolean {
    for (const e of this.eyes) if (inEye(e, spot)) return true;
    if (this.landKm > 0 && this.land.size > 0) {
      for (const pid of provincesNear(this.world, spot, this.landKm)) if (this.land.has(pid)) return true;
    }
    return false;
  }
}

/**
 * What `nations` watch together with their own eyes (`far` false) or radar (`far` true): everything they hold, the
 * province each of their armies stands in (marching, the nearer end of its road, never the far one), and round
 * each army a circle as far as it sees or picks up blips, centred where it is (on a road, its spot on it); for
 * radar, a circle round each held province's anchor too. Every province whose anchor lies in a circle is watched
 * whole.
 */
function ownWatch(state: GameState, world: World, nations: readonly NationId[], far: boolean): Watch {
  const mine = new Set<OwnerId>(nations);
  const held = new Set<ProvinceId>();
  for (const id of world.provinceIds) if (mine.has(state.provinces[id].owner)) held.add(id);
  const eyes: Eye[] = [];
  const stands: ProvinceId[] = [];
  for (const army of Object.values(state.armies)) {
    if (!mine.has(army.owner)) continue;
    eyes.push({ at: armySpot(world, army), km: far ? armyBlipKm(army) : armySightKm(army) });
    stands.push(armySightedAt(army));
  }
  const watch = new Watch(world, eyes, held, far ? SIGHT.landBlipKm : 0);
  for (const pid of held) watch.add(pid);
  for (const pid of stands) watch.add(pid);
  for (const e of eyes) for (const pid of provincesNear(world, e.at, e.km)) watch.add(pid);
  if (far) for (const h of held) for (const pid of provincesAround(world, h, SIGHT.landBlipKm)) watch.add(pid);
  return watch;
}

/** Who a nation watches with: itself and, with Liaison Officers, its co-belligerents. */
function watchers(state: GameState, world: World, nation: NationId): NationId[] {
  return sharesAlliedSight(state, nation) ? [nation, ...alliesOf(state, world, nation)] : [nation];
}

/** Every province, watched whole: the fog lifts when the campaign is over. */
function everything(world: World): Watch {
  const all = new Watch(world);
  for (const pid of world.provinceIds) all.add(pid);
  return all;
}

/**
 * What a nation sees with its own eyes: its own territory, the province each of its armies stands in, and within
 * each army's sight (km on the map) every army and every province whose anchor lies there.
 */
export function ownSight(state: GameState, world: World, nation: NationId): Watch {
  return ownWatch(state, world, [nation], false);
}

/**
 * What a nation can see now: its own sight and, with Liaison Officers, its co-belligerents'. The set holds the
 * provinces seen whole; pass it to `isArmyVisible`, which also sees armies on roads within sight. When the
 * campaign is over the fog lifts.
 */
export function visibleProvinces(state: GameState, world: World, nation: NationId): Watch {
  if (state.outcome) return everything(world);
  return ownWatch(state, world, watchers(state, world, nation), false);
}

/**
 * What a nation's radar covers (its sight included): its armies' blip ranges and a little way round its held land
 * (`SIGHT.landBlipKm`), and with Liaison Officers its co-belligerents' too. Hidden armies in it show as blips
 * (`radarBlips`).
 */
export function detectedProvinces(state: GameState, world: World, nation: NationId): Watch {
  if (state.outcome) return everything(world);
  return ownWatch(state, world, watchers(state, world, nation), true);
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
 * The radar blips `viewer` picks up, in the map's province order: other nations' armies it cannot see but its radar
 * covers (their province in `detected`, or their spot within its circles), one blip for each province they stand
 * in (where `armySightedAt` puts them). Pass the sight and radar when already worked out.
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
    if (army.owner === viewer || army.units.length === 0 || isArmyVisible(army, viewer, seen)) continue;
    const at = armySightedAt(army);
    if (!detected.has(at) && !(onRoad(army) && detected instanceof Watch && detected.reaches(armySpot(world, army)))) continue;
    units.set(at, (units.get(at) ?? 0) + army.units.length);
  }
  if (units.size === 0) return [];
  return world.provinceIds.filter((pid) => units.has(pid)).map((province) => ({ province, size: blipSize(units.get(province)!) }));
}

/**
 * Is this army out on a road (marching, or halted on one), rather than at its province's anchor? Only then can a
 * circle reach it without reaching its province: a `Watch` holds every province whose anchor lies in its circles.
 */
function onRoad(army: Army): boolean {
  return !!army.move?.leg || !!army.road;
}

/** The province an army is seen in: where it stands, or the nearer end of the road it is marching. */
export function armySightedAt(army: Army): ProvinceId {
  const leg = army.move?.leg;
  if (!leg) return army.province;
  return leg.elapsed * 2 < leg.duration ? leg.from : leg.to;
}

/**
 * Can `viewer` see this army? Always its own; any other in a province it sees whole, or (with `seen` from
 * `visibleProvinces`) wherever it stands within an army's sight, on a road too.
 */
export function isArmyVisible(army: Army, viewer: NationId, seen: ReadonlySet<ProvinceId>): boolean {
  if (army.owner === viewer || seen.has(armySightedAt(army))) return true;
  return onRoad(army) && seen instanceof Watch && seen.reaches(armySpot(seen.world, army));
}
