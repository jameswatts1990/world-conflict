// Static, derived lookup tables for a scenario (adjacency, distances, objectives).
import type { ConnectionKind, Effect, NationDef, NationId, ProvinceDef, ProvinceId, RoadSpot, ScenarioDef } from './types';

export interface Neighbor {
  id: ProvinceId;
  kind: ConnectionKind;
  /** Road distance in whole kilometres: great-circle between the two provinces' anchors, where their armies stand. */
  distanceKm: number;
  label?: string;
  /** For a sea crossing: how wide the sea is, coast to coast, in km. */
  seaKm?: number;
  /** On a road between two lands: how far towards the neighbour (0..1) the road crosses into it. */
  border?: number;
  /** Where a road that bends runs, towards the neighbour (absent: straight between the anchors). */
  line?: RoadTrace;
}

/**
 * A point on the ground, for sight: metres from the earth's centre (x, y, z), in whole numbers. Distances between
 * spots are worked out as the straight line through the earth (under 0.1 km short of the way over the ground at a
 * few hundred km) and compared squared, in whole square metres, so whether an army is inside a circle never
 * depends on floating-point details.
 */
export type Spot = readonly [number, number, number];

/** A road as sight follows it: its knots (anchors and bends) and how far along the road (0..1) each lies. */
export interface RoadTrace {
  pts: Spot[];
  at: number[];
}

export interface World {
  scenario: ScenarioDef;
  provinceIds: ProvinceId[];
  provinces: Record<ProvinceId, ProvinceDef>;
  neighbors: Record<ProvinceId, Neighbor[]>;
  nationIds: NationId[];
  nations: Record<NationId, NationDef>;
  objectiveIds: ProvinceId[];
  /** Provinces that are cities, in scenario order. */
  cityIds: ProvinceId[];
  /**
   * For each province, the cities next door: those whose lands border (or are a crossing from) the lands of
   * the region this province lies in. Cities are never neighbours themselves; this is how near they are.
   */
  nearbyCities: Record<ProvinceId, ProvinceId[]>;
  /**
   * For each province, everywhere next door as civilians reckon it: its own region (its city and the lands
   * round it) and the regions next to it.
   */
  vicinity: Record<ProvinceId, ProvinceId[]>;
  /** For each province, the region it lies in, named by its city (or, for land without one, itself). */
  regionOf: Record<ProvinceId, ProvinceId>;
  totalVp: number;
  /** Provinces where a sea crossing lands (coastal batteries allowed). */
  seaLandings: Set<ProvinceId>;
  /** Each province's anchor (where its armies stand) as a spot on the ground, for sight. */
  spots: Record<ProvinceId, Spot>;
  /** Every province, west to east by its spot (`provincesNear` searches it). */
  byEast: ProvinceId[];
}

// National specialities are static scenario data that effect lookups need
// without a World in hand; buildWorld registers them by scenario id.
const specialities = new Map<string, Record<NationId, Effect[]>>();

export function specialityEffects(scenarioId: string, nation: NationId): Effect[] {
  return specialities.get(scenarioId)?.[nation] ?? [];
}

const EARTH_RADIUS_KM = 6371;

/** Is this the short way between a city and one of the lands round it? */
function isGate(provinces: Record<ProvinceId, ProvinceDef>, a: ProvinceId, b: ProvinceId): boolean {
  return provinces[a].around === b || provinces[b].around === a;
}

export function greatCircleKm(a: [number, number], b: [number, number]): number {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

const EARTH_RADIUS_M = EARTH_RADIUS_KM * 1000;

/** A [longitude, latitude] as a spot on the ground. Rounded to whole metres, so nothing later depends on float trig. */
export function spotOf([lon, lat]: [number, number]): Spot {
  const toRad = Math.PI / 180;
  const [l, p] = [lon * toRad, lat * toRad];
  return [
    Math.round(EARTH_RADIUS_M * Math.cos(p) * Math.cos(l)),
    Math.round(EARTH_RADIUS_M * Math.cos(p) * Math.sin(l)),
    Math.round(EARTH_RADIUS_M * Math.sin(p)),
  ];
}

/** The square of the distance between two spots, in square metres (a whole number). */
export function distanceSq(a: Spot, b: Spot): number {
  const [dx, dy, dz] = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  return dx * dx + dy * dy + dz * dz;
}

/** Is `b` within `km` of `a`? Exact: whole metres, compared squared. */
export function withinKm(a: Spot, b: Spot, km: number): boolean {
  const r = Math.round(km * 1000);
  return distanceSq(a, b) <= r * r;
}

/**
 * A road through its knots ([longitude, latitude]) with each knot's fraction of the way, measured as the map
 * measures it (straight lines on Mercator between the knots, `roadThrough` in ui/map/geo.ts), so a fraction is
 * the same spot in the simulation's sight as on the map. Fractions rounded to a millionth.
 */
function traceRoad(knots: [number, number][]): RoadTrace {
  const toRad = Math.PI / 180;
  const grid = knots.map(([lon, lat]) => [lon * toRad, Math.log(Math.tan(Math.PI / 4 + (lat * toRad) / 2))]);
  const lengths = grid.slice(1).map((q, i) => Math.hypot(q[0] - grid[i][0], q[1] - grid[i][1]));
  const total = lengths.reduce((s, x) => s + x, 0) || 1;
  let gone = 0;
  const at = [0];
  for (const l of lengths) {
    gone += l;
    at.push(Math.round((gone / total) * 1e6) / 1e6);
  }
  at[at.length - 1] = 1;
  return { pts: knots.map(spotOf), at };
}

export function buildWorld(scenario: ScenarioDef): World {
  const provinces: Record<ProvinceId, ProvinceDef> = {};
  for (const p of scenario.provinces) {
    if (provinces[p.id]) throw new Error(`Duplicate province id ${p.id}`);
    provinces[p.id] = p;
  }
  const neighbors: Record<ProvinceId, Neighbor[]> = {};
  for (const p of scenario.provinces) neighbors[p.id] = [];
  const seen = new Set<string>();
  for (const c of scenario.connections) {
    if (!provinces[c.a] || !provinces[c.b]) throw new Error(`Connection references unknown province: ${c.a} - ${c.b}`);
    if (c.a === c.b) throw new Error(`Self connection: ${c.a}`);
    const key = [c.a, c.b].sort().join('|');
    if (seen.has(key)) throw new Error(`Duplicate connection ${key}`);
    seen.add(key);
    // Rounded to whole km so movement timing never depends on float trig details. Roads run between the
    // provinces' anchors, where their armies stand, so going round a city is never slower than through it.
    const distanceKm = Math.round(greatCircleKm(provinces[c.a].anchor, provinces[c.b].anchor));
    const sea = c.seaKm !== undefined ? { seaKm: c.seaKm } : {};
    const [there, back] = c.border === undefined ? [{}, {}] : [{ border: c.border }, { border: Math.round((1 - c.border) * 1000) / 1000 }];
    const line = c.via?.length ? traceRoad([provinces[c.a].anchor, ...c.via, provinces[c.b].anchor]) : undefined;
    const [ahead, behind] = line ? [{ line }, { line: { pts: [...line.pts].reverse(), at: line.at.map((t) => Math.round((1 - t) * 1e6) / 1e6).reverse() } }] : [{}, {}];
    neighbors[c.a].push({ id: c.b, kind: c.kind, distanceKm, label: c.label, ...sea, ...there, ...ahead });
    neighbors[c.b].push({ id: c.a, kind: c.kind, distanceKm, label: c.label, ...sea, ...back, ...behind });
  }
  for (const id of Object.keys(neighbors)) neighbors[id].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));

  const nations: Record<NationId, NationDef> = {};
  for (const n of scenario.nations) nations[n.id] = n;
  const objectiveIds = scenario.provinces.filter((p) => p.objectiveVp).map((p) => p.id);
  const totalVp = scenario.provinces.reduce((s, p) => s + (p.objectiveVp ?? 0), 0);
  const seaLandings = new Set<ProvinceId>();
  for (const c of scenario.connections) {
    if (c.kind === 'strait') {
      seaLandings.add(c.a);
      seaLandings.add(c.b);
    }
  }
  specialities.set(scenario.id, Object.fromEntries(scenario.nations.map((n) => [n.id, n.speciality?.effects ?? []])));
  const cityIds = scenario.provinces.filter((p) => p.city).map((p) => p.id);
  // Regions: a city and the lands round it. Two regions are next door where any of their provinces are.
  const regionOf: Record<ProvinceId, ProvinceId> = {};
  const members = new Map<ProvinceId, ProvinceId[]>();
  for (const p of scenario.provinces) {
    const region = p.around ?? p.id;
    regionOf[p.id] = region;
    members.set(region, [...(members.get(region) ?? []), p.id]);
  }
  const nextRegions = new Map<ProvinceId, ProvinceId[]>();
  for (const [region, list] of members) {
    const next = new Set<ProvinceId>();
    for (const pid of list) for (const n of neighbors[pid]) if (regionOf[n.id] !== region) next.add(regionOf[n.id]);
    nextRegions.set(region, [...next].sort((a, b) => scenario.provinces.indexOf(provinces[a]) - scenario.provinces.indexOf(provinces[b])));
  }
  const nearbyCities: Record<ProvinceId, ProvinceId[]> = {};
  const vicinity: Record<ProvinceId, ProvinceId[]> = {};
  for (const p of scenario.provinces) {
    const region = regionOf[p.id];
    const next = nextRegions.get(region)!;
    nearbyCities[p.id] = next.filter((r) => provinces[r].city);
    vicinity[p.id] = [region, ...next].flatMap((r) => members.get(r)!).filter((id) => id !== p.id);
  }

  const spots: Record<ProvinceId, Spot> = {};
  for (const p of scenario.provinces) spots[p.id] = spotOf(p.anchor);
  // West to east by the spot's y (the axis through 90°E, about east through Europe); ties by id, so the order is fixed.
  const byEast = scenario.provinces.map((p) => p.id).sort((a, b) => spots[a][1] - spots[b][1] || (a < b ? -1 : a > b ? 1 : 0));

  return {
    scenario,
    provinceIds: scenario.provinces.map((p) => p.id),
    provinces,
    neighbors,
    nationIds: scenario.nations.map((n) => n.id),
    nations,
    objectiveIds,
    cityIds,
    nearbyCities,
    vicinity,
    regionOf,
    totalVp,
    seaLandings,
    spots,
    byEast,
  };
}

/**
 * The spot `t` (0..1) of the way along the road from `a`'s anchor to `b`'s (straight between them, should they
 * not be neighbours).
 */
export function spotOnRoadLine(world: World, a: ProvinceId, b: ProvinceId, t: number): Spot {
  const line = connectionBetween(world, a, b)?.line;
  const pts = line?.pts ?? [world.spots[a], world.spots[b]];
  const at = line?.at ?? [0, 1];
  if (t <= 0) return pts[0];
  if (t >= 1) return pts[pts.length - 1];
  let i = 1;
  while (i < pts.length - 1 && at[i] < t) i++;
  const [p, q] = [pts[i - 1], pts[i]];
  const f = (t - at[i - 1]) / (at[i] - at[i - 1] || 1);
  return [Math.round(p[0] + (q[0] - p[0]) * f), Math.round(p[1] + (q[1] - p[1]) * f), Math.round(p[2] + (q[2] - p[2]) * f)];
}

const aroundCache = new WeakMap<World, Map<number, Record<ProvinceId, ProvinceId[]>>>();

/** Every province whose anchor lies within `km` of `pid`'s (itself included), worked out once per world and distance. */
export function provincesAround(world: World, pid: ProvinceId, km: number): ProvinceId[] {
  let byKm = aroundCache.get(world);
  if (!byKm) aroundCache.set(world, (byKm = new Map()));
  let lists = byKm.get(km);
  if (!lists) byKm.set(km, (lists = {}));
  return (lists[pid] ??= provincesNear(world, world.spots[pid], km));
}

/** Every province whose anchor lies within `km` of `spot` (exactly, as `withinKm`), west to east. */
export function provincesNear(world: World, spot: Spot, km: number): ProvinceId[] {
  const r = Math.round(km * 1000);
  const { byEast, spots } = world;
  // Binary search for the first province not west of the circle, then walk east until past it.
  let lo = 0;
  let hi = byEast.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (spots[byEast[mid]][1] < spot[1] - r) lo = mid + 1;
    else hi = mid;
  }
  const out: ProvinceId[] = [];
  const r2 = r * r;
  for (let i = lo; i < byEast.length; i++) {
    const s = spots[byEast[i]];
    if (s[1] > spot[1] + r) break;
    if (distanceSq(s, spot) <= r2) out.push(byEast[i]);
  }
  return out;
}

/** Whether any province starts unowned: neutral states, garrisoned, that anyone may invade. */
export function hasNeutrals(world: World): boolean {
  return world.provinceIds.some((id) => !world.provinces[id].core);
}

/** Is this province a city (rather than the land between cities)? */
export function isCity(world: World, pid: ProvinceId): boolean {
  return world.provinces[pid].city !== undefined;
}

/** The land of a province: a city's lands round it, or the land itself. */
export function landsOf(world: World, pid: ProvinceId): ProvinceId[] {
  return world.provinces[pid].lands ?? [pid];
}

/** The city of a province: a city itself, or the city a land lies round (none for land without one). */
export function cityOf(world: World, pid: ProvinceId): ProvinceId | undefined {
  return world.provinces[pid].city ? pid : world.provinces[pid].around;
}

/** Is the way between these two provinces the short one between a city and a land round it? */
export function isCityGate(world: World, a: ProvinceId, b: ProvinceId): boolean {
  return isGate(world.provinces, a, b);
}

/** Is a road over land, between two lands (rather than a sea crossing, or a city's gate to the land round it)? */
export function isOpenRoad(world: World, a: ProvinceId, b: ProvinceId): boolean {
  const conn = connectionBetween(world, a, b);
  return !!conn && conn.kind !== 'strait' && !isCityGate(world, a, b);
}

/** How far from `a` towards `b` (0..1) the road between them crosses into `b`. */
export function roadBorder(world: World, a: ProvinceId, b: ProvinceId): number {
  return connectionBetween(world, a, b)?.border ?? 0.5;
}

/** A point `f` (0..1) of the way from `a` to `b` along the road between them: which land it lies in, and where on the road out of it. */
export function spotOnRoad(world: World, a: ProvinceId, b: ProvinceId, f: number): { province: ProvinceId; road: RoadSpot } {
  return f < roadBorder(world, a, b) ? { province: a, road: { toward: b, at: f } } : { province: b, road: { toward: a, at: 1 - f } };
}

export function connectionBetween(world: World, a: ProvinceId, b: ProvinceId): Neighbor | undefined {
  return world.neighbors[a]?.find((n) => n.id === b);
}
