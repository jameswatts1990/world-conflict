import { describe, expect, it } from 'vitest';
import { applyCommand, findPath, legTicks } from '../src/sim';
import { clearArmies, place, quietGame, run, setWar, world } from './helpers';

describe('movement legality', () => {
  it('cannot enter a nation at peace, can after declaring war', () => {
    const state = quietGame();
    const army = Object.values(state.armies).find((a) => a.owner === 'fr' && a.province === 'fr-east')!;
    const blocked = applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-hesse' });
    expect(blocked.ok).toBe(false);
    expect(applyCommand(state, world, { type: 'declareWar', nation: 'fr', target: 'de' }).ok).toBe(true);
    expect(applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-hesse' }).ok).toBe(true);
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
    const army = place(state, 'fr', 'fr-paris', { infantry: 2 });
    const ticks = legTicks(state, world, army, 'fr-paris', 'fr-nord');
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-nord' });
    run(state, ticks - 1);
    expect(state.armies[army.id].province).toBe('fr-paris');
    expect(state.armies[army.id].move?.leg).not.toBeNull();
    run(state, 1);
    expect(state.armies[army.id].province).toBe('fr-nord');
    expect(state.armies[army.id].move).toBeNull();
  });

  it('slowest unit sets the pace; straits and mountains are slower than open ground', () => {
    const state = quietGame();
    const inf = place(state, 'fr', 'fr-paris', { infantry: 1 });
    const mixed = place(state, 'fr', 'fr-paris', { infantry: 1, artillery: 1 });
    expect(legTicks(state, world, mixed, 'fr-paris', 'fr-nord')).toBeGreaterThan(legTicks(state, world, inf, 'fr-paris', 'fr-nord'));
    const uk = place(state, 'uk', 'uk-london', { infantry: 1 });
    const strait = world.neighbors['uk-london'].find((n) => n.id === 'fr-nord')!;
    const land = world.neighbors['uk-london'].find((n) => n.id === 'uk-midlands')!;
    const perKmStrait = legTicks(state, world, uk, 'uk-london', 'fr-nord') / strait.distanceKm;
    const perKmLand = legTicks(state, world, uk, 'uk-london', 'uk-midlands') / land.distanceKm;
    expect(perKmStrait).toBeGreaterThan(perKmLand * 1.5);
  });

  it('stop finishes the current leg; reversing returns to the origin', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris', { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-west' }); // via Normandy or Centre
    run(state, 5);
    const firstHop = state.armies[army.id].move!.leg!.to;
    applyCommand(state, world, { type: 'stop', nation: 'fr', armyId: army.id });
    run(state, 600);
    expect(state.armies[army.id].province).toBe(firstHop);

    const back = place(state, 'fr', 'fr-paris', { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: back.id, to: 'fr-nord' });
    run(state, 10);
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: back.id, to: 'fr-paris' });
    run(state, 11);
    expect(state.armies[back.id].province).toBe('fr-paris');
    expect(state.armies[back.id].move).toBeNull();
  });

  it('a multi-hop order through enemy land pauses to capture each province', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-east', { infantry: 4 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-saxony' });
    run(state, 2000);
    expect(state.provinces['de-hesse'].owner).toBe('fr');
    expect(state.provinces['de-saxony'].owner).toBe('fr');
    expect(state.armies[army.id].province).toBe('de-saxony');
  });
});
