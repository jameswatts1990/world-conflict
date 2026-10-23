import { describe, expect, it } from 'vitest';
import { applyCommand, findPath, greatCircleKm, legTicks } from '../src/sim';
import { clearArmies, place, quietGame, run, setWar, world } from './helpers';

describe('movement legality', () => {
  it('cannot enter a nation at peace, can after declaring war', () => {
    const state = quietGame();
    const army = Object.values(state.armies).find((a) => a.owner === 'fr' && a.province === 'fr-east-land')!;
    const blocked = applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-hesse-land' });
    expect(blocked.ok).toBe(false);
    expect(applyCommand(state, world, { type: 'declareWar', nation: 'fr', target: 'de' }).ok).toBe(true);
    expect(applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-hesse-land' }).ok).toBe(true);
  });

  it('a minor power is a nation like any other: entering it takes a declaration of war', () => {
    const state = quietGame();
    const army = Object.values(state.armies).find((a) => a.owner === 'fr' && a.province === 'fr-nord')!;
    expect(applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'be-brussels' }).ok).toBe(false);
    expect(applyCommand(state, world, { type: 'declareWar', nation: 'fr', target: 'be' }).ok).toBe(true);
    expect(applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'be-brussels' }).ok).toBe(true);
  });

  it('routes only through explicit connections and permitted territory', () => {
    const state = quietGame();
    const army = place(state, 'es', 'es-madrid', { infantry: 1 });
    // Spain -> Germany requires crossing France (peace) or neutral Switzerland... which is not adjacent to Spain.
    setWar(state, 'es', 'de');
    expect(findPath(state, world, army, 'es-madrid', 'de-berlin')).toBeNull();
    expect(applyCommand(state, world, { type: 'move', nation: 'es', armyId: army.id, to: 'de-berlin' }).ok).toBe(false);
    // Moves cannot target your own other armies' provinces? They can: own territory is always fine.
    expect(applyCommand(state, world, { type: 'move', nation: 'es', armyId: army.id, to: 'es-catalonia' }).ok).toBe(true);
    // Another nation's army cannot be ordered.
    expect(applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'es-castile' }).ok).toBe(false);
  });

  it('arrives exactly after the computed leg duration', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris-land', { infantry: 2 });
    const ticks = legTicks(state, world, army, 'fr-paris-land', 'fr-nord-land');
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-nord-land' });
    run(state, ticks - 1);
    expect(state.armies[army.id].province).toBe('fr-paris-land');
    expect(state.armies[army.id].move?.leg).not.toBeNull();
    run(state, 1);
    expect(state.armies[army.id].province).toBe('fr-nord-land');
    expect(state.armies[army.id].move).toBeNull();
  });

  it('a city is reached only through the land round it, a short march from it', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris', { infantry: 2 });
    expect(legTicks(state, world, army, 'fr-paris', 'fr-nord')).toBe(Infinity);
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-nord' });
    expect(state.armies[army.id].move!.path).toEqual(['fr-paris-land', 'fr-nord-land', 'fr-nord']);
    // Stepping out of a city takes far less than a march between lands, timed from city to city.
    const gate = legTicks(state, world, army, 'fr-paris', 'fr-paris-land');
    const road = legTicks(state, world, army, 'fr-paris-land', 'fr-nord-land');
    expect(gate).toBeLessThan(road / 3);
    const cityToCity = Math.round(greatCircleKm(world.provinces['fr-paris'].anchor, world.provinces['fr-nord'].anchor));
    expect(world.neighbors['fr-paris-land'].find((n) => n.id === 'fr-nord-land')!.distanceKm).toBe(cityToCity);
  });

  it('slowest unit sets the pace; straits and mountains are slower than open ground', () => {
    const state = quietGame();
    const inf = place(state, 'fr', 'fr-paris-land', { infantry: 1 });
    const mixed = place(state, 'fr', 'fr-paris-land', { infantry: 1, artillery: 1 });
    expect(legTicks(state, world, mixed, 'fr-paris-land', 'fr-nord-land')).toBeGreaterThan(legTicks(state, world, inf, 'fr-paris-land', 'fr-nord-land'));
    const uk = place(state, 'uk', 'uk-london-land', { infantry: 1 });
    const strait = world.neighbors['uk-london-land'].find((n) => n.id === 'fr-nord-land')!;
    const land = world.neighbors['uk-london-land'].find((n) => n.id === 'uk-midlands-land')!;
    const perKmStrait = legTicks(state, world, uk, 'uk-london-land', 'fr-nord-land') / strait.distanceKm;
    const perKmLand = legTicks(state, world, uk, 'uk-london-land', 'uk-midlands-land') / land.distanceKm;
    expect(perKmStrait).toBeGreaterThan(perKmLand * 1.5);
  });

  it('stop finishes the current leg; reversing returns to the origin', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris-land', { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-west-land' }); // via Normandy or Centre
    run(state, 5);
    const firstHop = state.armies[army.id].move!.leg!.to;
    applyCommand(state, world, { type: 'stop', nation: 'fr', armyId: army.id });
    run(state, 600);
    expect(state.armies[army.id].province).toBe(firstHop);

    const back = place(state, 'fr', 'fr-paris-land', { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: back.id, to: 'fr-nord-land' });
    run(state, 10);
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: back.id, to: 'fr-paris-land' });
    run(state, 11);
    expect(state.armies[back.id].province).toBe('fr-paris-land');
    expect(state.armies[back.id].move).toBeNull();
  });

  it('a multi-hop order through enemy land pauses to capture each province', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-east', { infantry: 4 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-saxony' });
    run(state, 2000);
    expect(state.provinces['de-hesse-land'].owner).toBe('fr');
    expect(state.provinces['de-saxony-land'].owner).toBe('fr');
    expect(state.provinces['de-saxony'].owner).toBe('fr');
    // Only the lands on the way and the city it marched for: the cities it passed by stay German.
    expect(state.provinces['de-hesse'].owner).toBe('de');
    expect(state.armies[army.id].province).toBe('de-saxony');
  });

  it('a move order marches through enemy land, taking only the destination', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-east', { infantry: 4 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-saxony', mode: 'move' });
    const route = state.armies[army.id].move!.path;
    expect(route.length).toBeGreaterThan(1);
    // Not much longer: with the land behind it still German, the army is cut off from supply.
    run(state, 300);
    expect(state.armies[army.id].province).toBe('de-saxony');
    expect(state.provinces['de-saxony'].owner).toBe('fr');
    for (const pid of route.slice(0, -1).filter((p) => world.provinces[p].core === 'de')) expect(state.provinces[pid].owner).toBe('de');
  });

  it('a patrol marches back and forth until stopped', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris', { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-east', mode: 'patrol' });
    const visits: string[] = [];
    for (let t = 0; t < 3000; t++) {
      run(state, 1);
      const a = state.armies[army.id];
      if (!a.move?.leg && visits.at(-1) !== a.province && (a.province === 'fr-paris' || a.province === 'fr-east')) visits.push(a.province);
    }
    expect(visits.slice(0, 3)).toEqual(['fr-east', 'fr-paris', 'fr-east']);
    expect(state.armies[army.id].move?.mode).toBe('patrol');
    applyCommand(state, world, { type: 'stop', nation: 'fr', armyId: army.id });
    run(state, 600);
    expect(state.armies[army.id].move).toBeNull();
  });

  it('hold position halts a march after the current leg and stays until a new order', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris-land', { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-east-land', mode: 'patrol' });
    run(state, 5);
    const next = army.move!.leg!.to;
    expect(applyCommand(state, world, { type: 'hold', nation: 'fr', armyId: army.id, hold: true }).ok).toBe(true);
    run(state, 1500);
    expect(army.province).toBe(next);
    expect(army.move).toBeNull();
    expect(army.holding).toBe(true);
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-paris-land', mode: 'move' });
    expect(army.holding).toBe(false);
  });
});
