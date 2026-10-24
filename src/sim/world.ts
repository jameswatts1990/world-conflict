// Static, derived lookup tables for a scenario (adjacency, distances, objectives).
import { MOVEMENT } from './config/rules';
import type { ConnectionKind, Effect, NationDef, NationId, ProvinceDef, ProvinceId, RoadSpot, ScenarioDef } from './types';

export interface Neighbor {
  id: ProvinceId;
  kind: ConnectionKind;
  /**
   * Road distance in whole kilometres: great-circle between the two provinces' hubs (see `hub`), or the
   * short march between a city and the land round it.
   */
  distanceKm: number;
  label?: string;
  /** On a road between two lands: how far towards the neighbour (0..1) the road crosses into it. */
  border?: number;
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
   * For each province, the cities next door: those whose land borders (or is a crossing from) the land this
   * province lies in. Cities are never neighbours themselves; this is how near they are.
   */
  nearbyCities: Record<ProvinceId, ProvinceId[]>;
  /**
   * For each province, everywhere next door as civilians reckon it: its own land and city, the lands that land
   * borders (or is a crossing from) and the cities in them.
   */
  vicinity: Record<ProvinceId, ProvinceId[]>;
  totalVp: number;
  /** Provinces where a sea crossing lands (coastal batteries allowed). */
  seaLandings: Set<ProvinceId>;
}

// National specialities are static scenario data that effect lookups need
// without a World in hand; buildWorld registers them by scenario id.
const specialities = new Map<string, Record<NationId, Effect[]>>();

export function specialityEffects(scenarioId: string, nation: NationId): Effect[] {
  return specialities.get(scenarioId)?.[nation] ?? [];
}

const EARTH_RADIUS_KM = 6371;

/** Where a province's roads meet: its city, or the city in its middle; land without a city, its anchor. */
function hub(provinces: Record<ProvinceId, ProvinceDef>, pid: ProvinceId): [number, number] {
  const p = provinces[pid];
  return p.city?.coord ?? (p.contains ? provinces[p.contains].anchor : p.anchor);
}

export function greatCircleKm(a: [number, number], b: [number, number]): number {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
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
    // lands' cities, as they did before cities were split out; a city and its own land are a short march apart.
    const gate = provinces[c.a].within === c.b || provinces[c.b].within === c.a;
    const distanceKm = gate ? MOVEMENT.cityGateKm : Math.round(greatCircleKm(hub(provinces, c.a), hub(provinces, c.b)));
    const [there, back] = c.border === undefined ? [{}, {}] : [{ border: c.border }, { border: Math.round((1 - c.border) * 1000) / 1000 }];
    neighbors[c.a].push({ id: c.b, kind: c.kind, distanceKm, label: c.label, ...there });
    neighbors[c.b].push({ id: c.a, kind: c.kind, distanceKm, label: c.label, ...back });
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
  const nearbyCities: Record<ProvinceId, ProvinceId[]> = {};
  const vicinity: Record<ProvinceId, ProvinceId[]> = {};
  for (const p of scenario.provinces) {
    const land = p.within ?? p.id;
    const own = provinces[land].contains;
    const lands = neighbors[land].map((n) => n.id).filter((id) => !provinces[id].city);
    nearbyCities[p.id] = lands.map((id) => provinces[id].contains).filter((c): c is ProvinceId => !!c);
    vicinity[p.id] = [land, ...(own ? [own] : []), ...lands.flatMap((id) => [id, ...(provinces[id].contains ? [provinces[id].contains!] : [])])].filter(
      (id) => id !== p.id,
    );
  }

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
    totalVp,
    seaLandings,
  };
}

/** Whether any province starts unowned: neutral states, garrisoned, that anyone may invade. */
export function hasNeutrals(world: World): boolean {
  return world.provinceIds.some((id) => !world.provinces[id].core);
}

/** Is this province a city (rather than the land between cities)? */
export function isCity(world: World, pid: ProvinceId): boolean {
  return world.provinces[pid].city !== undefined;
}

/** The land a province lies in: the land round a city, or the land itself. */
export function landOf(world: World, pid: ProvinceId): ProvinceId {
  return world.provinces[pid].within ?? pid;
}

/** The city of a province: a city itself, or the city inside a land (none for land without one). */
export function cityOf(world: World, pid: ProvinceId): ProvinceId | undefined {
  return world.provinces[pid].city ? pid : world.provinces[pid].contains;
}

/** Is a road over land, between two lands (rather than a sea crossing, or a city's gate to the land round it)? */
export function isOpenRoad(world: World, a: ProvinceId, b: ProvinceId): boolean {
  const conn = connectionBetween(world, a, b);
  return !!conn && conn.kind !== 'strait' && world.provinces[a].within !== b && world.provinces[b].within !== a;
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
