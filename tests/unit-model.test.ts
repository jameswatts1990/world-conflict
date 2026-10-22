import { describe, expect, it } from 'vitest';
import { UNITS } from '../src/sim/config/units';
import { UNIT_GENS, type UnitType } from '../src/sim';
import { ART_NATIONS, resolveArtGen } from '../src/ui/art/types';
import { UNIT_HEADINGS, buildUnitModel, headingFor, headingVector } from '../src/ui/art/UnitModel';
import { citySpots, roadEnds } from '../src/ui/map/armyLayout';

const TYPES = Object.keys(UNITS) as UnitType[];

describe('3D unit models', () => {
  it('draw every unit type in every generation and nation, the same way every time', () => {
    for (const type of TYPES)
      for (const gen of UNIT_GENS)
        for (const nation of ART_NATIONS) {
          const m = buildUnitModel({ type, gen, nation, heading: 4 });
          expect(m.svg, `${type} ${gen} ${nation}`).toMatch(/^<svg .*<path /);
          expect(m.width).toBeGreaterThan(1);
          expect(m.height).toBeGreaterThan(1);
          // The ground point lies inside the drawing.
          expect(m.cx).toBeGreaterThan(0);
          expect(m.cx).toBeLessThan(m.width);
          expect(m.cy).toBeGreaterThan(0);
          expect(m.cy).toBeLessThan(m.height);
          expect(buildUnitModel({ type, gen, nation, heading: 4 }).svg).toBe(m.svg);
        }
  });

  it('redraw each generation a type has, and fall back to the nearest one it lacks', () => {
    for (const type of TYPES) {
      const drawn = new Set(UNIT_GENS.map((gen) => buildUnitModel({ type, gen, nation: 'de', heading: 4 }).svg));
      const gens = new Set(UNIT_GENS.map((gen) => resolveArtGen(type, gen)));
      expect(drawn.size, type).toBe(gens.size);
    }
  });

  it('give each nation its own colours', () => {
    for (const type of ['infantry', 'tank'] as const) {
      const looks = new Set(ART_NATIONS.map((nation) => buildUnitModel({ type, gen: 'ww2', nation, heading: 4 }).svg));
      expect(looks.size, type).toBe(ART_NATIONS.length);
    }
  });

  it('turn to sixteen different headings, and wrap round', () => {
    const looks = new Set(Array.from({ length: UNIT_HEADINGS }, (_, h) => buildUnitModel({ type: 'tank', gen: 'ww2', nation: 'fr', heading: h }).svg));
    expect(looks.size).toBe(UNIT_HEADINGS);
    const at = (heading: number) => buildUnitModel({ type: 'transport', gen: 'ww1', nation: 'uk', heading }).svg;
    expect(at(UNIT_HEADINGS)).toBe(at(0));
    expect(at(-1)).toBe(at(UNIT_HEADINGS - 1));
  });

  it('pick the heading that faces along a direction on screen', () => {
    for (let h = 0; h < UNIT_HEADINGS; h++) {
      const [dx, dy] = headingVector(h);
      expect(headingFor(dx, dy)).toBe(h);
      expect(headingFor(dx * 40, dy * 40)).toBe(h);
    }
    // Screen right, down, left and up.
    expect(headingVector(headingFor(1, 0))[1]).toBeCloseTo(0);
    expect(headingVector(headingFor(0, 1))[0]).toBeCloseTo(0);
    expect(headingVector(headingFor(-1, 0))[0]).toBeLessThan(0);
    expect(headingVector(headingFor(0, -1))[1]).toBeLessThan(0);
  });
});

describe('3D army layout', () => {
  const cases = [
    [14, 8],
    [30, 14],
    [55, 22],
    [90, 29],
  ] as const;

  it('stands every army around its city, clear of the city, the name plate and each other', () => {
    for (const [half, room] of cases) {
      const spots = citySpots(half, room, 16);
      expect(spots).toHaveLength(16);
      spots.forEach(([x, y], i) => {
        // Outside the token's ground ellipse, with room to stand.
        expect(Math.hypot(x / (half + room), y / (half / 2 + room * 0.7)), `spot ${i} of ${half}/${room}`).toBeGreaterThanOrEqual(0.999);
        // Not on the name plate under the city.
        if (y > 0) expect(Math.abs(x), `spot ${i} of ${half}/${room}`).toBeGreaterThan(half * 0.5);
        for (const [sx, sy] of spots.slice(0, i)) {
          expect(Math.hypot((x - sx) / (2.1 * room), (y - sy) / (1.5 * room)), `spots ${i} of ${half}/${room}`).toBeGreaterThanOrEqual(0.999);
        }
      });
    }
  });

  it('keeps every army in its spot when another arrives', () => {
    for (const [half, room] of cases) {
      for (let n = 1; n < 20; n++) expect(citySpots(half, room, n + 1).slice(0, n)).toEqual(citySpots(half, room, n));
    }
  });

  it('marches from the edge of one city to the edge of the next, never backwards', () => {
    for (const [half, room] of cases)
      for (const length of [20, 60, 150, 400])
        for (let a = 0; a < 16; a++) {
          const [dx, dy] = [Math.cos((a * Math.PI) / 8), Math.sin((a * Math.PI) / 8)];
          const [[sx, sy], [ex, ey]] = roadEnds(dx, dy, half, half * 0.8, room, length);
          // The march covers (end + road) - start, which must still point along the road.
          const along = (dx * length + ex - sx) * dx + (dy * length + ey - sy) * dy;
          expect(along, `${half}/${room} ${length}px at ${a}`).toBeGreaterThan(0);
          // It leaves towards the next city and arrives from the previous one.
          expect(sx * dx + sy * dy).toBeGreaterThan(0);
          expect(ex * dx + ey * dy).toBeLessThan(0);
        }
  });
});
