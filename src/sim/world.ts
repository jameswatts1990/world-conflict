// Static, derived lookup tables for a scenario (adjacency, distances, objectives).
import type { ConnectionKind, Effect, NationDef, NationId, ProvinceDef, ProvinceId, ScenarioDef } from './types';

export interface Neighbor {
  id: ProvinceId;
  kind: ConnectionKind;
  /** Great-circle distance between the two city anchors, whole kilometres. */
  distanceKm: number;
  label?: string;
}

export interface World {
  scenario: ScenarioDef;
  provinceIds: ProvinceId[];
  provinces: Record<ProvinceId, ProvinceDef>;
  neighbors: Record<ProvinceId, Neighbor[]>;
  nationIds: NationId[];
  nations: Record<NationId, NationDef>;
  objectiveIds: ProvinceId[];
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
    // Rounded to whole km so movement timing never depends on float trig details.
    const distanceKm = Math.round(greatCircleKm(provinces[c.a].city.coord, provinces[c.b].city.coord));
    neighbors[c.a].push({ id: c.b, kind: c.kind, distanceKm, label: c.label });
    neighbors[c.b].push({ id: c.a, kind: c.kind, distanceKm, label: c.label });
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

  return {
    scenario,
    provinceIds: scenario.provinces.map((p) => p.id),
    provinces,
    neighbors,
    nationIds: scenario.nations.map((n) => n.id),
    nations,
    objectiveIds,
    totalVp,
    seaLandings,
  };
}

export function connectionBetween(world: World, a: ProvinceId, b: ProvinceId): Neighbor | undefined {
  return world.neighbors[a]?.find((n) => n.id === b);
}
