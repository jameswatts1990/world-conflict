// Static, derived lookup tables for a scenario (adjacency, distances, objectives).
import type { ConnectionKind, Effect, NationDef, NationId, ProvinceDef, ProvinceId, ScenarioDef } from './types';

export interface Neighbor {
  id: ProvinceId;
  kind: ConnectionKind;
  /** Road distance in whole kilometres: great-circle between the two provinces' anchors, where their armies stand. */
  distanceKm: number;
  label?: string;
  /** For a sea crossing: how wide the sea is, coast to coast, in km. */
  seaKm?: number;
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
    neighbors[c.a].push({ id: c.b, kind: c.kind, distanceKm, label: c.label, ...sea });
    neighbors[c.b].push({ id: c.a, kind: c.kind, distanceKm, label: c.label, ...sea });
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

export function connectionBetween(world: World, a: ProvinceId, b: ProvinceId): Neighbor | undefined {
  return world.neighbors[a]?.find((n) => n.id === b);
}
