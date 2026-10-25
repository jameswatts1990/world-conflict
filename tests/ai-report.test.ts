import { describe, expect, it } from 'vitest';
import type { GameState, World } from '../src/sim';
import { isInterior } from '../scripts/dev/interior';
import { quietGame, world } from './helpers';

describe('AI report: idle in the interior', () => {
  it('counts a city as on the border wherever one of its lands is', () => {
    const state = quietGame();
    // Paris and both its lands border only French provinces at the start.
    expect(isInterior(world, state, 'fr-paris', 'fr')).toBe(true);
    // A foreign land next to one of Paris's lands, though not next to the city itself, puts the city on the border.
    const outside = world.neighbors['fr-paris-se'].find((n) => !n.id.startsWith('fr-paris'))!.id;
    expect(world.neighbors['fr-paris'].some((n) => n.id === outside)).toBe(false);
    state.provinces[outside].owner = 'de';
    expect(isInterior(world, state, 'fr-paris', 'fr')).toBe(false);
  });

  it("counts a land as on the border when another land of its city borders a foreign province", () => {
    const state = quietGame();
    // uk-north-n and everything next to it are British, but its city's other land faces Germany and the Netherlands.
    expect(world.neighbors['uk-north-n'].every((n) => state.provinces[n.id].owner === 'uk')).toBe(true);
    expect(world.neighbors['uk-north-ne'].some((n) => state.provinces[n.id].owner !== 'uk')).toBe(true);
    expect(isInterior(world, state, 'uk-north-n', 'uk')).toBe(false);
    expect(isInterior(world, state, 'uk-north', 'uk')).toBe(false);
  });

  it('judges land with no city on its own', () => {
    // A three-province strip (this map has no land without a city): a - b - c.
    const lone = (id: string) => ({ id, name: id });
    const tiny = {
      provinces: { a: lone('a'), b: lone('b'), c: lone('c') },
      neighbors: { a: [{ id: 'b' }], b: [{ id: 'a' }, { id: 'c' }], c: [{ id: 'b' }] },
    } as unknown as World;
    const owners = (c: string) => ({ provinces: { a: { owner: 'fr' }, b: { owner: 'fr' }, c: { owner: c } } }) as unknown as GameState;
    expect(isInterior(tiny, owners('fr'), 'a', 'fr')).toBe(true);
    expect(isInterior(tiny, owners('de'), 'a', 'fr')).toBe(true);
    expect(isInterior(tiny, owners('de'), 'b', 'fr')).toBe(false);
  });
});
