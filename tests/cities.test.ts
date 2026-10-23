import { readFileSync } from 'node:fs';
import { geoContains } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { BUILDINGS, CITY } from '../src/sim/config/buildings';
import { MORALE } from '../src/sim/config/rules';
import { applyCommand, buildingSlots, checkBuild, checkBuildRules, provinceOutput, type BuildingType } from '../src/sim';
import { quietGame, richen, run, world } from './helpers';

const build = (state: ReturnType<typeof quietGame>, province: string, building: BuildingType) =>
  applyCommand(state, world, { type: 'build', nation: 'fr', province, building });

function finish(state: ReturnType<typeof quietGame>, province: string) {
  const job = state.provinces[province].construction;
  if (job) run(state, job.remaining);
}

describe('cities', () => {
  it('city tiers set the number of building slots; infrastructure does not use one', () => {
    const state = quietGame();
    richen(state, 'fr');
    const town = 'fr-centre';
    expect(state.provinces[town].tier).toBe(1);
    expect(buildingSlots(state, world, town)).toBe(CITY.slots[1]);
    for (const b of ['barracks', 'armsWorks', 'housing'] as BuildingType[]) {
      expect(build(state, town, b).ok).toBe(true);
      finish(state, town);
    }
    const full = checkBuild(state, world, 'fr', town, 'industry');
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.reason).toMatch(/slot/);
    // Upgrading an existing building and building infrastructure still work.
    expect(build(state, town, 'housing').ok).toBe(true);
    finish(state, town);
    expect(build(state, town, 'fortifications').ok).toBe(true);
    finish(state, town);
    // Demolishing frees a slot.
    expect(applyCommand(state, world, { type: 'demolish', nation: 'fr', province: town, building: 'armsWorks' }).ok).toBe(true);
    expect(checkBuild(state, world, 'fr', town, 'barracks').ok).toBe(false); // already built
    expect(build(state, town, 'market').ok).toBe(false); // markets need a City
  });

  it('a building cannot be demolished while something that needs it is being built', () => {
    const state = quietGame();
    richen(state, 'fr');
    expect(build(state, 'fr-paris', 'academy').ok).toBe(true);
    const demolish = applyCommand(state, world, { type: 'demolish', nation: 'fr', province: 'fr-paris', building: 'barracks' });
    expect(demolish.ok).toBe(false);
    if (!demolish.ok) expect(demolish.reason).toBe('Military Academy, under construction, depends on it.');
    finish(state, 'fr-paris');
    expect(applyCommand(state, world, { type: 'demolish', nation: 'fr', province: 'fr-paris', building: 'barracks' }).ok).toBe(false);
  });

  it('one construction at a time: the rules still pass while the city is busy', () => {
    const state = quietGame();
    richen(state, 'fr');
    expect(build(state, 'fr-paris', 'university').ok).toBe(true);
    expect(checkBuildRules(state, world, 'fr', 'fr-paris', 'market').ok).toBe(true);
    const busy = checkBuild(state, world, 'fr', 'fr-paris', 'market');
    expect(busy.ok).toBe(false);
    if (!busy.ok) expect(busy.reason).toMatch(/one project at a time/);
  });

  it('higher building levels and some buildings need a bigger city', () => {
    const state = quietGame();
    richen(state, 'fr');
    expect(build(state, 'fr-centre', 'industry').ok).toBe(true);
    finish(state, 'fr-centre');
    const l2 = checkBuild(state, world, 'fr', 'fr-centre', 'industry');
    expect(l2.ok).toBe(false);
    if (!l2.ok) expect(l2.reason).toMatch(/City/);
    expect(checkBuild(state, world, 'fr', 'fr-centre', 'university').ok).toBe(false);
    expect(checkBuild(state, world, 'fr', 'fr-paris', 'university').ok).toBe(true);
  });

  it('cities grow with housing and good morale, and gain a tier', () => {
    const state = quietGame();
    const town = 'fr-centre';
    state.provinces[town].buildings.housing = 3;
    const need = CITY.growthToNext[1];
    run(state, 60 * 20);
    expect(state.provinces[town].tier).toBe(2);
    expect(state.events.some((e) => e.kind === 'city-growth' && e.province === town)).toBe(true);
    expect(buildingSlots(state, world, town)).toBe(CITY.slots[2]);
    expect(need).toBeGreaterThan(0);
  });

  it('special buildings respect their placement rules', () => {
    const state = quietGame();
    richen(state, 'fr');
    state.nations.fr.research.completed.push('fieldRailways', 'fortificationEngineering', 'coastalDefences', 'propagandaMinistry', 'radioBroadcasting', 'occupationPolicy');
    // Coastal batteries only where a sea crossing lands.
    expect(checkBuild(state, world, 'fr', 'fr-nord-sw', 'coastalBattery').ok).toBe(true);
    expect(checkBuild(state, world, 'fr', 'fr-nord-se', 'coastalBattery').ok).toBe(false);
    expect(checkBuild(state, world, 'fr', 'fr-paris', 'coastalBattery').ok).toBe(false);
    // The land between cities takes infrastructure but nothing that needs a city's slots.
    expect(checkBuild(state, world, 'fr', 'fr-east-w', 'fortifications').ok).toBe(true);
    expect(checkBuild(state, world, 'fr', 'fr-east-w', 'railway').ok).toBe(true);
    const barracks = checkBuild(state, world, 'fr', 'fr-east-w', 'barracks');
    expect(barracks.ok ? '' : barracks.reason).toMatch(/Needs a city/);
    expect(buildingSlots(state, world, 'fr-east-w')).toBe(0);
    // Occupation HQs only in occupied land.
    expect(checkBuild(state, world, 'fr', 'fr-paris', 'garrisonHq').ok).toBe(false);
    state.provinces['de-baden'].owner = 'fr';
    expect(checkBuild(state, world, 'fr', 'de-baden', 'garrisonHq').ok).toBe(true);
    // Locked until researched.
    expect(checkBuild(state, world, 'fr', 'fr-paris', 'powerPlant').ok).toBe(false);
  });

  it('economic buildings raise output; power stations also help their neighbours', () => {
    const state = quietGame();
    const before = provinceOutput(state, world, 'fr-paris');
    state.provinces['fr-paris'].buildings.market = 1;
    expect(provinceOutput(state, world, 'fr-paris').money).toBeGreaterThan(before.money);
    const nordBefore = provinceOutput(state, world, 'fr-nord').materials;
    state.provinces['fr-paris'].buildings.powerPlant = 1;
    expect(provinceOutput(state, world, 'fr-nord').materials).toBeGreaterThan(nordBefore);
    expect(MORALE.outputPivot).toBeGreaterThan(0);
  });

  it('every building has a description, a cost and a category', () => {
    for (const [id, b] of Object.entries(BUILDINGS)) {
      expect(b.description.length, id).toBeGreaterThan(10);
      expect(b.cost(1).money, id).toBeGreaterThan(0);
      expect(['economy', 'military', 'civic', 'infrastructure']).toContain(b.category);
    }
  });
});

describe('map towns', () => {
  it('every city lies inside its own shape and every secondary town in its land', () => {
    const topo = JSON.parse(readFileSync('src/assets/map/map.topo.json', 'utf8')) as Topology<{
      provinces: GeometryCollection<{ pid: string }>;
    }>;
    const fc = feature(topo, topo.objects.provinces) as unknown as { features: Feature<Polygon | MultiPolygon, { pid: string }>[] };
    const shapes = new Map(fc.features.map((f) => [f.properties.pid, f]));
    const outside: string[] = [];
    for (const id of world.provinceIds) {
      const def = world.provinces[id];
      // A city lies in its own small province; each town in one of the lands round it (or in its city's edge).
      if (def.city && !geoContains(shapes.get(id)!, def.city.coord)) outside.push(`${def.city.name} (${id})`);
      for (const t of def.towns) {
        if (!geoContains(shapes.get(id)!, t.coord) && !(def.around && geoContains(shapes.get(def.around)!, t.coord))) outside.push(`${t.name} (${id})`);
      }
    }
    expect(outside).toEqual([]);
  });
});
