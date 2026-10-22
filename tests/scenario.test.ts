import { readFileSync } from 'node:fs';
import { geoContains } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { feature } from 'topojson-client';
import { describe, expect, it } from 'vitest';
import { BLOC_IDS, UNIT_GENS, UNIT_TYPES } from '../src/sim';
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
      for (const t of [def.city, ...def.towns]) {
        const under = countries.find((c) => geoContains(c, t.coord));
        if (under) covered.push(`${t.name} (${under.properties.iso})`);
      }
    }
    expect(covered).toEqual([]);
  });

  it('movement graph is connected and uses only explicit connections', () => {
    const seen = new Set([world.provinceIds[0]]);
    const queue = [world.provinceIds[0]];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const n of world.neighbors[cur]) if (!seen.has(n.id)) (seen.add(n.id), queue.push(n.id));
    }
    expect(seen.size).toBe(world.provinceIds.length);
    // Straits exist for islands (e.g. Britain) — they are explicit, not derived from shapes.
    expect(world.neighbors['uk-london'].some((n) => n.id === 'fr-nord' && n.kind === 'strait')).toBe(true);
  });

  it('every nation matches its power tier: output, starting army, objectives and size', () => {
    for (const id of world.nationIds) {
      const power = POWERS[world.nations[id].power];
      const provs = world.scenario.provinces.filter((p) => p.core === id);
      expect(provs.length, `${id} provinces`).toBeGreaterThanOrEqual(power.provinces[0]);
      expect(provs.length, `${id} provinces`).toBeLessThanOrEqual(power.provinces[1]);
      for (const k of ['money', 'materials', 'manpower'] as const) {
        expect(provs.reduce((s, p) => s + p.production[k], 0), `${id} ${k}`).toBeCloseTo(power.output[k], -1);
      }
      const units: Record<string, number> = {};
      for (const a of world.scenario.startingArmies.filter((x) => x.owner === id)) {
        for (const [t, n] of Object.entries(a.units)) units[t] = (units[t] ?? 0) + (n ?? 0);
      }
      expect(units, `${id} starting army`).toEqual(startingUnits(world.nations[id].power));
      expect(provs.reduce((s, p) => s + (p.objectiveVp ?? 0), 0)).toBe(power.vp.capital + (power.vp.industrial ?? 0));
      expect(provs.filter((p) => p.tier === power.capitalCity && p.id === world.nations[id].capital)).toHaveLength(1);
      if (world.nations[id].power === 'great') {
        // Same city ladder (one Metropolis, one Large City) and one oil field.
        expect(provs.filter((p) => p.tier === 4)).toHaveLength(1);
        expect(provs.filter((p) => p.tier === 3)).toHaveLength(1);
        expect(provs.filter((p) => p.oil)).toHaveLength(1);
      }
    }
  });
});
