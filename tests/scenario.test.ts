import { readFileSync } from 'node:fs';
import { geoContains } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { feature, neighbors } from 'topojson-client';
import { describe, expect, it } from 'vitest';
import { BLOC_IDS, UNIT_GENS, UNIT_TYPES, isOpenRoad } from '../src/sim';
import { roadFaults } from '../scripts/map/roads';
import { UNITS } from '../src/sim/config/units';
import { POWERS, startingUnits } from '../src/sim/config/powers';
import { ECONOMY } from '../src/sim/config/rules';
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

  it('folds Kosovo into Serbia without a separate country outline or label', () => {
    const topo = JSON.parse(readFileSync('src/assets/map/map.topo.json', 'utf8'));
    const shapes = topo.objects.provinces.geometries;
    const south = shapes.filter((g: { properties: { pid: string } }) => g.properties.pid === 'rs-south' || g.properties.pid.startsWith('rs-south-'));
    expect(south.length).toBeGreaterThan(1);
    expect(south.every((g: { properties: { iso: string } }) => g.properties.iso === 'SRB')).toBe(true);
    expect(topo.objects.countries.geometries.some((g: { properties: { iso: string } }) => g.properties.iso === 'KOS')).toBe(false);
    const provinces = feature(topo, topo.objects.provinces) as unknown as { features: Feature<Polygon | MultiPolygon, { pid: string; iso: string }>[] };
    const pristina = provinces.features.find((p) => geoContains(p, [21.163, 42.663]));
    expect(pristina?.properties.pid).toMatch(/^rs-south-/);
    expect(world.nationIds).not.toContain('kos');
  });

  it('keeps Crimea Ukrainian and Russia outside the playable East', () => {
    const topo = JSON.parse(readFileSync('src/assets/map/map.topo.json', 'utf8'));
    const provinces = (feature(topo, topo.objects.provinces) as unknown as { features: Feature<Polygon | MultiPolygon, { pid: string; iso: string }>[] }).features;
    const countries = (feature(topo, topo.objects.countries) as unknown as { features: Feature<Polygon | MultiPolygon, { iso: string }>[] }).features;
    for (const coord of [[34.103, 44.952], [33.535, 44.605], [32.617, 46.636]] as [number, number][]) {
      const home = provinces.find((p) => geoContains(p, coord));
      expect(home?.properties.pid).toMatch(/^ua-odesa(?:-|$)/);
      expect(home?.properties.iso).toBe('UKR');
      expect(countries.some((p) => geoContains(p, coord))).toBe(false);
    }
    // Kaliningrad and mainland Russia remain context, never a playable bridge.
    for (const coord of [[20.51, 54.71], [37.62, 55.75]] as [number, number][]) {
      expect(countries.find((p) => geoContains(p, coord))?.properties.iso).toBe('RUS');
      expect(provinces.some((p) => geoContains(p, coord))).toBe(false);
    }
    expect(world.neighbors['ua-odesa-se']).toContainEqual(expect.objectContaining({ id: 'ua-odesa-e', kind: 'land' })); // Crimea reaches the Taurida steppe over Perekop.
    expect(world.nations.ua.power).toBe('major');
    expect(world.cityIds.filter((id) => world.provinces[id].core === 'ua').sort()).toEqual(['ua-dnipro', 'ua-galicia', 'ua-kharkiv', 'ua-kyiv', 'ua-odesa']);
    expect(world.nations.by.power).toBe('major');
    for (const id of ['ua', 'by', 'md']) expect(world.nations[id].bloc).toBe('eastern');
    for (const id of ['md', 'lt', 'lv', 'ee']) expect(world.nations[id].power).toBe('minor');
    for (const id of ['lt', 'lv', 'ee']) expect(world.nations[id].bloc).toBe('western');
    expect(world.nations.lt.capital).toBe('lt-vilnius');
    expect(provinces.find((p) => geoContains(p, [29.643, 46.848]))?.properties.pid).toMatch(/^md-chisinau-/);
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
      'me-podgorica-n|hr-dalmatia-e': 'the Dubrovnik coast is cut off from the rest of Dalmatia by Bosnia at Neum; the coastal road crosses that short gap',
      'be-brussels-w|nl-amsterdam-se': 'Flanders meets Brabant & Holland only at Zeelandic Flanders, across the Western Scheldt',
      'se-norrland-nw2|no-narvik-ssw': 'Jämtland meets Nordland only at a point in the Børgefjell fells, where Västerbotten comes in between',
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

  it('every border within a region is jagged like the natural ones: no smooth ring round a city, no long straight cut', () => {
    const topo = JSON.parse(readFileSync('src/assets/map/map.topo.json', 'utf8'));
    const { scale, translate } = topo.transform;
    const arcs: [number, number][][] = topo.arcs.map((arc: [number, number][]) => {
      let [x, y] = [0, 0];
      return arc.map(([dx, dy]): [number, number] => [(x += dx) * scale[0] + translate[0], (y += dy) * scale[1] + translate[1]]);
    });
    const users = new Map<number, Set<string>>();
    for (const g of topo.objects.provinces.geometries) {
      const walk = (a: unknown): void => {
        if (typeof a === 'number') users.set(a < 0 ? ~a : a, (users.get(a < 0 ? ~a : a) ?? new Set()).add(g.properties.pid));
        else if (Array.isArray(a)) a.forEach(walk);
      };
      walk(g.arcs);
    }
    // The longest stretch (km) over which a line turns less than 10 degrees from leg to leg. Natural borders run so
    // for 20 km or so, 45 at the very most; a city's smooth ring or a straight cut through the units, for far longer.
    const smooth = (pts: [number, number][]) => {
      const km = ([x1, y1]: [number, number], [x2, y2]: [number, number]): [number, number] => [(x2 - x1) * 111.32 * Math.cos((y1 * Math.PI) / 180), (y2 - y1) * 110.57];
      let [best, run] = [0, 0];
      for (let k = 0; k + 1 < pts.length; k++) {
        const [dx, dy] = km(pts[k], pts[k + 1]);
        const leg = Math.hypot(dx, dy);
        const [px, py] = k ? km(pts[k - 1], pts[k]) : [dx, dy];
        const turn = Math.abs(Math.atan2(px * dy - py * dx, px * dx + py * dy));
        run = k && turn < (10 * Math.PI) / 180 ? run + leg : leg;
        best = Math.max(best, run);
      }
      return best;
    };
    const long: string[] = [];
    for (const [arc, pids] of users) {
      const [a, b] = [...pids];
      if (pids.size === 2 && world.regionOf[a] === world.regionOf[b] && smooth(arcs[arc]) > 45) long.push(`${a}|${b}`);
    }
    // A change to the map needs `npx vite-node scripts/map/city-provinces.ts` (npm run map:build runs it), which breaks them up.
    expect(long).toEqual([]);
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
      for (const p of provs) if (!p.city) expect(p.production, p.id).toEqual(ECONOMY.landOutput);
      for (const k of ['money', 'materials', 'manpower'] as const) {
        const cityOutput = provs.filter((p) => p.city).reduce((s, p) => s + p.production[k], 0);
        expect(cityOutput, `${id} ${k}`).toBeCloseTo(power.output[k], -1);
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
