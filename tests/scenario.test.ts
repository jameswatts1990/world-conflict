import { readFileSync } from 'node:fs';
import { geoContains } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { feature, neighbors } from 'topojson-client';
import { describe, expect, it } from 'vitest';
import { BLOC_IDS, UNIT_GENS, UNIT_TYPES, isOpenRoad } from '../src/sim';
import { roadFaults } from '../scripts/map/roads';
import { UNITS } from '../src/sim/config/units';
import { POWERS, startingUnits } from '../src/sim/config/powers';
import { world } from './helpers';

describe('scenario data', () => {
  it('every nation has a core capital, a bloc and a name for every unit it can field', () => {
    expect(world.nationIds.length).toBeGreaterThanOrEqual(2);
    for (const id of world.nationIds) {
      const def = world.nations[id];
      expect(world.provinces[def.capital].core).toBe(id);
      expect(BLOC_IDS).toContain(def.bloc);
      for (const type of UNIT_TYPES) {
        expect(def.identity.formations[type]).toMatch(/\{(n|ord|fr-f|fr-m)\}/);
        for (const gen of UNIT_GENS) {
          if (UNITS[type].models[gen]) expect(def.identity.units[type]?.[gen]?.name, `${id} ${type} ${gen}`).toBeTruthy();
        }
      }
    }
  });

  it('every province has a shape and every shape has a province', () => {
    const topo = JSON.parse(readFileSync('src/assets/map/map.topo.json', 'utf8'));
    const shapeIds = new Set<string>(topo.objects.provinces.geometries.map((g: { properties: { pid: string } }) => g.properties.pid));
    expect([...shapeIds].sort()).toEqual([...world.provinceIds].sort());
  });

  it('the world underlay shares the provinces\' coasts and never lies under the theatre', () => {
    const topo = JSON.parse(readFileSync('src/assets/map/map.topo.json', 'utf8'));
    // One topology for both layers: shared coasts and borders are the very same arcs.
    expect(Object.keys(topo.objects).sort()).toEqual(['countries', 'provinces']);
    const countries = (feature(topo, topo.objects.countries) as unknown as { features: Feature<Polygon | MultiPolygon, { iso: string }>[] }).features;
    const covered: string[] = [];
    for (const id of world.provinceIds) {
      const def = world.provinces[id];
      for (const t of [...(def.city ? [def.city] : []), ...def.towns]) {
        const under = countries.find((c) => geoContains(c, t.coord));
        if (under) covered.push(`${t.name} (${under.properties.iso})`);
      }
    }
    expect(covered).toEqual([]);
  });

  it('every shared border has a land or mountain link, and every such link a shared border', () => {
    const topo = JSON.parse(readFileSync('src/assets/map/map.topo.json', 'utf8'));
    const geoms = topo.objects.provinces.geometries as { properties: { pid: string } }[];
    const key = (a: string, b: string) => [a, b].sort().join(' — ');
    const borders = new Set<string>();
    neighbors(geoms as never).forEach((list, i) => list.forEach((j) => borders.add(key(geoms[i].properties.pid, geoms[j].properties.pid))));
    const links = new Set(world.scenario.connections.filter((c) => c.kind !== 'strait').map((c) => key(c.a, c.b)));
    // scripts/map/check-borders.ts prints the same report while you work.
    expect([...borders].filter((k) => !links.has(k)), 'borders without a link').toEqual([]);
    expect([...links].filter((k) => !borders.has(k)), 'links without a border').toEqual([]);
  });

  it('every road runs from one province\'s anchor to the other\'s over those two alone, and knows where it crosses their border', () => {
    const topo = JSON.parse(readFileSync('src/assets/map/map.topo.json', 'utf8'));
    // A change to the map needs `npx vite-node scripts/map/road-routes.ts` (npm run map:build runs it), which bends
    // every road round whatever lies between its anchors: a city, another land, the sea.
    const anchors = Object.fromEntries(world.provinceIds.map((id) => [id, world.provinces[id].anchor]));
    const connections = world.scenario.connections;
    const roads = Object.fromEntries(connections.map((c) => [`${c.a}|${c.b}`, { via: c.via, border: c.border }]));
    const faults = roadFaults(topo, connections, anchors, new Set(world.cityIds), roads);
    // Where the shapes leave a road no way that keeps to its two provinces (it goes as briefly as it can through
    // what it must), and why. Any other road that strays is a map to fix or a road to route again.
    const lastResort: Record<string, string> = {
      'es-madrid-e|es-valencia-n': 'the Alcarria reaches Valencia only at the Rincón de Ademuz, its exclave beyond Aragon',
      'be-brussels-w|nl-amsterdam-se': 'Flanders meets Brabant & Holland only at Zeelandic Flanders, across the Western Scheldt',
    };
    const strays = faults.filter((f) => f.third || f.sea || f.back).map((f) => f.link);
    expect(strays.sort()).toEqual(Object.keys(lastResort).sort());
    // The crossing gameplay reads is where the drawn road crosses the border.
    for (const f of faults) if (f.border !== undefined) expect(roads[f.link].border, f.link).toBe(f.border);
    for (const id of world.provinceIds) {
      for (const n of world.neighbors[id]) {
        if (!isOpenRoad(world, id, n.id)) continue;
        expect(n.border, `${id} → ${n.id}`).toBeGreaterThanOrEqual(0.05);
        expect(n.border, `${id} → ${n.id}`).toBeLessThanOrEqual(0.95);
      }
    }
  });

  it('movement graph is connected and uses only explicit connections', () => {
    const seen = new Set([world.provinceIds[0]]);
    const queue = [world.provinceIds[0]];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const n of world.neighbors[cur]) if (!seen.has(n.id)) (seen.add(n.id), queue.push(n.id));
    }
    expect(seen.size).toBe(world.provinceIds.length);
    // Straits exist for islands (e.g. Britain) — they are explicit, not derived from shapes. They land on the
    // land round the cities, and every city is reached only through its own lands, at least two of them: no
    // land wraps round a city.
    expect(world.neighbors['uk-london-sw'].some((n) => n.id === 'fr-nord-sw' && n.kind === 'strait')).toBe(true);
    for (const id of world.cityIds) {
      const around = world.neighbors[id].map((n) => n.id);
      expect(around.filter((n) => !world.provinces[id].lands!.includes(n)), id).toEqual([]);
      expect(around.length, id).toBeGreaterThanOrEqual(2);
    }
  });

  it('every nation matches its power tier: output, starting army, objectives and size', () => {
    for (const id of world.nationIds) {
      const power = POWERS[world.nations[id].power];
      const provs = world.scenario.provinces.filter((p) => p.core === id);
      const cities = provs.filter((p) => p.city);
      expect(cities.length, `${id} cities`).toBeGreaterThanOrEqual(power.provinces[0]);
      expect(cities.length, `${id} cities`).toBeLessThanOrEqual(power.provinces[1]);
      // Every city stands among two or more lands of its own, which produce nothing yet.
      for (const c of cities) expect(c.lands!.length, c.id).toBeGreaterThanOrEqual(2);
      expect(provs.filter((p) => !p.city).map((p) => p.id).sort()).toEqual(cities.flatMap((c) => c.lands!).sort());
      for (const p of provs) if (!p.city) expect(Object.values(p.production).some((v) => v), p.id).toBe(false);
      for (const k of ['money', 'materials', 'manpower'] as const) {
        expect(provs.reduce((s, p) => s + p.production[k], 0), `${id} ${k}`).toBeCloseTo(power.output[k], -1);
      }
      const units: Record<string, number> = {};
      for (const a of world.scenario.startingArmies.filter((x) => x.owner === id)) {
        for (const [t, n] of Object.entries(a.units)) units[t] = (units[t] ?? 0) + (n ?? 0);
      }
      expect(units, `${id} starting army`).toEqual(startingUnits(world.nations[id].power));
      expect(provs.reduce((s, p) => s + (p.objectiveVp ?? 0), 0)).toBe(power.vp.capital + (power.vp.industrial ?? 0));
      if (world.nations[id].power === 'great') {
        // Same city ladder (one Metropolis, one Large City) and one oil field.
        expect(cities.filter((p) => p.tier === 4)).toHaveLength(1);
        expect(cities.filter((p) => p.tier === 3)).toHaveLength(1);
        expect(cities.filter((p) => p.oil)).toHaveLength(1);
      }
    }
  });
});
