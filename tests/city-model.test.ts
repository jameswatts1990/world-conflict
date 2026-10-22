import { describe, expect, it } from 'vitest';
import { BUILDINGS, BUILDING_ORDER, CITY } from '../src/sim/config/buildings';
import type { BuildingType } from '../src/sim';
import { buildCityModel, cityLayout, type CityModelProps } from '../src/ui/art/CityModel';
import { Scene } from '../src/ui/art/iso3d';

const base: CityModelProps = { seed: 'fr-nord', tier: 3, buildings: {}, terrain: 'plains', nationColor: '#3f6fc4' };

/** Buildings with a model of their own on the token; walls, rails and guns are drawn around it. */
const ON_TOKEN = BUILDING_ORDER.filter((b) => !['fortifications', 'railway', 'coastalBattery'].includes(b));

/** Small deterministic generator for picking building sets. */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('3D city models', () => {
  it('draw every building, and draw the same city the same way every time', () => {
    for (const b of BUILDING_ORDER) {
      const props = { ...base, coastal: b === 'coastalBattery' };
      const empty = buildCityModel(props).svg;
      const one = buildCityModel({ ...props, buildings: { [b]: 1 } }).svg;
      expect(one, b).not.toBe(empty);
      expect(buildCityModel({ ...props, buildings: { [b]: 1 } }).svg, b).toBe(one);
    }
  });

  it('give every building a spot of its own, so building something never moves the rest', () => {
    const r = lcg(7);
    for (const tier of [2, 3, 4, 5] as const) {
      const home = (b: BuildingType) => cityLayout({ ...base, tier, buildings: { [b]: 1 } }).buildings[b as keyof ReturnType<typeof cityLayout>['buildings']];
      const homes = new Map(ON_TOKEN.map((b) => [b, home(b)]));
      expect(new Set([...homes.values()].map(String)).size).toBe(ON_TOKEN.length);
      for (let i = 0; i < 40; i++) {
        const buildings = Object.fromEntries(ON_TOKEN.filter(() => r() < 0.4).map((b) => [b, 1]));
        const layout = cityLayout({ ...base, tier, buildings, freeSlots: CITY.slots[tier] });
        for (const b of Object.keys(buildings) as BuildingType[]) {
          expect(layout.buildings[b as keyof typeof layout.buildings], `${b} at tier ${tier}`).toEqual(homes.get(b));
        }
      }
    }
  });

  it('fit every building a town can build in the smallest town', () => {
    const townBuildings = ON_TOKEN.filter((b) => (BUILDINGS[b].levelTiers?.[0] ?? 1) <= 1);
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
