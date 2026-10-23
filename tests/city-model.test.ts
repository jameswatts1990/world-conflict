import { describe, expect, it } from 'vitest';
import { BUILDINGS, BUILDING_ORDER, CITY } from '../src/sim/config/buildings';
import type { BuildingType } from '../src/sim';
import { REACH_DIRECTIONS, buildCityModel, buildPortModel, cityLayout, type CityModel, type CityModelProps } from '../src/ui/art/CityModel';
import { Scene } from '../src/ui/art/iso3d';
import { buildMapGeometry } from '../src/ui/map/geo';
import { world } from './helpers';

const base: CityModelProps = { seed: 'fr-nord', tier: 3, buildings: {}, terrain: 'plains', nationColor: '#3f6fc4' };

/** Buildings with a model of their own round the old town; walls, rails and coastal guns are drawn otherwise. */
const WITH_MODEL = BUILDING_ORDER.filter((b) => !['fortifications', 'railway', 'coastalBattery'].includes(b));

/** Half a building pad's width and depth on screen (model units). */
const PAD_HALF: [number, number] = [3.8, 1.9];

const look = (m: CityModel) => m.ground.svg + m.structures.svg;

/** Small deterministic generator for picking building sets. */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** A straight coast `y` model units below the anchor, the sea beyond it. */
function coastBelow(y: number): number[] {
  return Array.from({ length: REACH_DIRECTIONS }, (_, i) => {
    const s = Math.sin((i / REACH_DIRECTIONS) * Math.PI * 2);
    return s > 0.05 ? Math.min(99, y / s) : 99;
  });
}

describe('3D city models', () => {
  it('draw every building, and draw the same city the same way every time', () => {
    for (const b of BUILDING_ORDER) {
      if (b === 'coastalBattery') continue;
      const empty = look(buildCityModel(base));
      const one = look(buildCityModel({ ...base, buildings: { [b]: 1 } }));
      expect(one, b).not.toBe(empty);
      expect(look(buildCityModel({ ...base, buildings: { [b]: 1 } })), b).toBe(one);
    }
  });

  it('draw coastal batteries in the port, on the coast', () => {
    const port = (batteries: number) => buildPortModel({ seed: 'fr-midi', facing: 2.4, batteries }).svg;
    expect(port(1)).not.toBe(port(0));
    expect(port(2)).not.toBe(port(1));
    expect(port(2)).toBe(port(2));
  });

  it('give every building a spot of its own, so building something never moves the rest', () => {
    const r = lcg(7);
    for (const props of [base, { ...base, seed: 'fr-midi', reach: coastBelow(3) }])
      for (const tier of [2, 3, 4, 5] as const) {
        const home = (b: BuildingType) => cityLayout({ ...props, tier, buildings: { [b]: 1 } }).buildings[b as keyof ReturnType<typeof cityLayout>['buildings']];
        const homes = new Map(WITH_MODEL.map((b) => [b, home(b)]));
        expect(new Set([...homes.values()].map(String)).size).toBe(WITH_MODEL.length);
        for (let i = 0; i < 40; i++) {
          const buildings = Object.fromEntries([...WITH_MODEL, 'railway', 'fortifications'].filter(() => r() < 0.4).map((b) => [b, 1]));
          const layout = cityLayout({ ...props, tier, buildings, freeSlots: CITY.slots[tier] });
          for (const b of Object.keys(buildings).filter((k) => WITH_MODEL.includes(k as BuildingType)) as BuildingType[]) {
            expect(layout.buildings[b as keyof typeof layout.buildings], `${b} at tier ${tier}`).toEqual(homes.get(b));
          }
        }
      }
  });

  it('fit every building a town can build in the smallest town', () => {
    const townBuildings = WITH_MODEL.filter((b) => (BUILDINGS[b].levelTiers?.[0] ?? 1) <= 1);
    const alone = (b: BuildingType) => cityLayout({ ...base, tier: 1, buildings: { [b]: 1 } }).buildings;
    const together = cityLayout({ ...base, tier: 1, buildings: Object.fromEntries(townBuildings.map((b) => [b, 1])) }).buildings;
    for (const b of townBuildings) {
      const key = b as keyof typeof together;
      expect(together[key], b).toEqual(alone(b)[key]);
    }
  });

  it('show one empty plot per free building slot', () => {
    for (const tier of [1, 2, 3, 4, 5] as const) {
      expect(cityLayout({ ...base, tier, freeSlots: CITY.slots[tier] }).plots).toHaveLength(CITY.slots[tier]);
    }
  });

  it('keep a seaside city on land: buildings and plots stand clear of the coast', () => {
    for (const tier of [1, 3, 5] as const) {
      const buildings = Object.fromEntries(WITH_MODEL.slice(0, 6).map((b) => [b, 1]));
      const layout = cityLayout({ ...base, seed: 'fr-midi', tier, buildings, freeSlots: CITY.slots[tier], reach: coastBelow(2) });
      expect(layout.buildings.landmark![1], `old town at tier ${tier}`).toBeLessThan(0);
      for (const [b, at] of Object.entries(layout.buildings)) {
        if (b !== 'landmark') expect(at![1] + PAD_HALF[1], `${b} at tier ${tier}`).toBeLessThanOrEqual(2);
      }
      for (const at of layout.plots) expect(at[1] + PAD_HALF[1], `plot at tier ${tier}`).toBeLessThanOrEqual(2);
    }
  });

  it('report the extent of the built-up area round the anchor', () => {
    const m = buildCityModel({ ...base, tier: 4, buildings: { industry: 1, barracks: 1 }, freeSlots: 2 });
    expect(m.rx).toBeGreaterThan(10);
    expect(m.back).toBeGreaterThan(4);
    expect(m.front).toBeGreaterThan(4);
    // The streets run on past the buildings, out of town.
    expect(m.ground.width).toBeGreaterThan(2 * m.rx);
  });
});

describe('cities on the map', () => {
  const geo = buildMapGeometry(world);

  it('lead roads out of town towards the neighbours over land', () => {
    for (const id of world.provinceIds) {
      const overLand = world.neighbors[id].filter((n) => n.kind !== 'strait');
      expect(geo.roads[id], id).toHaveLength(overLand.length);
    }
  });

  it('give every coastal city a port near it, and only those', () => {
    for (const id of world.provinceIds) {
      const port = geo.ports[id];
      if (!world.provinces[id].coastal) {
        expect(port, id).toBeNull();
        continue;
      }
      expect(port, id).not.toBeNull();
      const [ax, ay] = geo.anchors[id];
      expect(Math.hypot(port!.x - ax, port!.y - ay), id).toBeLessThan(45);
    }
  });

  it('know where the land ends round seaside cities', () => {
    expect(geo.reach['fr-paris']).toBeNull();
    const marseille = geo.reach['fr-midi']!;
    // Marseille: the sea to the south and west (screen directions), land to the north and east.
    const at = (deg: number) => marseille[Math.round((deg / 360) * REACH_DIRECTIONS) % REACH_DIRECTIONS];
    expect(at(135)).toBeLessThan(5);
    expect(at(-60 + 360)).toBeGreaterThan(20);
  });
});

describe('isometric renderer', () => {
  it('draws farther solids before nearer ones, whatever order they were added in', () => {
    const s = new Scene();
    s.box(1.5, 1.5, 2.5, 2.5, 0, 1, '#ff0000');
    s.box(0, 0, 1, 1, 0, 4, '#0000ff');
    const fills = [...s.render().markup.matchAll(/fill="#([0-9a-f]{6})"/g)].map((m) => m[1]);
    const red = (hex: string) => parseInt(hex.slice(0, 2), 16) > parseInt(hex.slice(4, 6), 16);
    // The tall blue box stands behind the red one (smaller x and y), so all of its faces come first.
    const firstRed = fills.findIndex(red);
    expect(firstRed).toBeGreaterThan(0);
    expect(fills.slice(firstRed).every(red)).toBe(true);
  });
});
