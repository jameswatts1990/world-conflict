import { describe, expect, it } from 'vitest';
import { applyCommand, findPath, greatCircleKm, legTicks } from '../src/sim';
import { clearArmies, landOf, linkBetween, place, quietGame, run, setWar, world } from './helpers';

describe('movement legality', () => {
  it('cannot enter a nation at peace, can after declaring war', () => {
    const state = quietGame();
    const army = Object.values(state.armies).find((a) => a.owner === 'fr' && world.provinces[a.province].around === 'fr-nord')!;
    const hesse = landOf('de-hesse', 'fr-nord');
    const blocked = applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: hesse });
    expect(blocked.ok).toBe(false);
    expect(applyCommand(state, world, { type: 'declareWar', nation: 'fr', target: 'de' }).ok).toBe(true);
    expect(applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: hesse }).ok).toBe(true);
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
    const [from, to] = linkBetween('fr-paris', 'fr-nord');
    const army = place(state, 'fr', from, { infantry: 2 });
    const ticks = legTicks(state, world, army, from, to);
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to });
    run(state, ticks - 1);
    expect(state.armies[army.id].province).toBe(from);
    expect(state.armies[army.id].move?.leg).not.toBeNull();
    run(state, 1);
    expect(state.armies[army.id].province).toBe(to);
    expect(state.armies[army.id].move).toBeNull();
  });

  it('a city is reached only through the lands round it, a short march from it', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris', { infantry: 2 });
    expect(legTicks(state, world, army, 'fr-paris', 'fr-nord')).toBe(Infinity);
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-nord' });
    const [out, into, city] = state.armies[army.id].move!.path;
    expect(state.armies[army.id].move!.path).toHaveLength(3);
    expect([world.provinces[out].around, world.provinces[into].around, city]).toEqual(['fr-paris', 'fr-nord', 'fr-nord']);
    // Stepping out of a city takes far less than a march between lands, timed from where their armies stand.
    const gate = legTicks(state, world, army, 'fr-paris', out);
    const road = legTicks(state, world, army, out, into);
    expect(gate).toBeLessThan(road / 2);
    const apart = Math.round(greatCircleKm(world.provinces[out].anchor, world.provinces[into].anchor));
    expect(world.neighbors[out].find((n) => n.id === into)!.distanceKm).toBe(apart);
  });

  it('slowest unit sets the pace; straits and mountains are slower than open ground', () => {
    const state = quietGame();
    const [from, to] = linkBetween('fr-paris', 'fr-nord');
    const inf = place(state, 'fr', from, { infantry: 1 });
    const mixed = place(state, 'fr', from, { infantry: 1, artillery: 1 });
    expect(legTicks(state, world, mixed, from, to)).toBeGreaterThan(legTicks(state, world, inf, from, to));
    const [kent, artois] = linkBetween('uk-london', 'fr-nord');
    const [shires, midlands] = linkBetween('uk-london', 'uk-midlands');
    const uk = place(state, 'uk', kent, { infantry: 1 });
    const strait = world.neighbors[kent].find((n) => n.id === artois)!;
    const land = world.neighbors[shires].find((n) => n.id === midlands)!;
    expect(strait.kind).toBe('strait');
    const perKmStrait = legTicks(state, world, uk, kent, artois) / strait.distanceKm;
    const perKmLand = legTicks(state, world, uk, shires, midlands) / land.distanceKm;
    expect(perKmStrait).toBeGreaterThan(perKmLand * 1.5);
  });

  it('stop halts a marching army where it stands on the road; at a city gate it turns back; reversing returns to the origin', () => {
    const state = quietGame();
    clearArmies(state);
    const [paris, nord] = linkBetween('fr-paris', 'fr-nord');
    const army = place(state, 'fr', paris, { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: nord }); // one leg
    run(state, 5);
    const at = army.move!.leg!.elapsed / army.move!.leg!.duration;
    expect(applyCommand(state, world, { type: 'stop', nation: 'fr', armyId: army.id }).ok).toBe(true);
    expect(army.move).toBeNull();
    expect(army.province).toBe(paris);
    expect(army.road).toEqual({ toward: nord, at });
    // Nothing left to stop.
    expect(applyCommand(state, world, { type: 'stop', nation: 'fr', armyId: army.id }).ok).toBe(false);
    delete army.road;

    // Between a city and its land there is no road to stand on: it turns back, and stopping again does not turn it round once more.
    const gate = place(state, 'fr', 'fr-paris', { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: gate.id, to: paris });
    run(state, 2);
    expect(applyCommand(state, world, { type: 'stop', nation: 'fr', armyId: gate.id }).ok).toBe(true);
    expect(gate.move!.leg!.to).toBe('fr-paris');
    expect(applyCommand(state, world, { type: 'stop', nation: 'fr', armyId: gate.id }).ok).toBe(false);
    run(state, 5);
    expect(gate.province).toBe('fr-paris');
    expect(gate.move).toBeNull();

    // Stopped as it sets off, it never leaves.
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: landOf('fr-aquitaine') });
    applyCommand(state, world, { type: 'stop', nation: 'fr', armyId: army.id });
    expect(army.province).toBe(paris);
    expect(army.move).toBeNull();

    const back = place(state, 'fr', paris, { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: back.id, to: nord });
    run(state, 10);
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: back.id, to: paris });
    run(state, 11);
    expect(state.armies[back.id].province).toBe(paris);
    expect(state.armies[back.id].move).toBeNull();
  });

  it('a multi-hop order through enemy land pauses to capture each province', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-nord', { infantry: 4 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-berlin' });
    const route = state.armies[army.id].move!.path;
    const german = route.filter((pid) => world.provinces[pid].core === 'de');
    expect(german.some((pid) => world.provinces[pid].around === 'de-hesse')).toBe(true);
    run(state, 2000);
    for (const pid of german) expect(state.provinces[pid].owner).toBe('fr');
    // Only the lands on the way and the city it marched for: the cities it passed by stay German.
    expect(state.provinces['de-hesse'].owner).toBe('de');
    expect(state.armies[army.id].province).toBe('de-berlin');
  });

  it('a move order marches through enemy land, taking only the destination', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-nord', { infantry: 4 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-berlin', mode: 'move' });
    const route = state.armies[army.id].move!.path;
    expect(route.length).toBeGreaterThan(1);
    // Not much longer: with the land behind it still German, the army is cut off from supply.
    run(state, 600);
    expect(state.armies[army.id].province).toBe('de-berlin');
    expect(state.provinces['de-berlin'].owner).toBe('fr');
    for (const pid of route.slice(0, -1).filter((p) => world.provinces[p].core === 'de')) expect(state.provinces[pid].owner).toBe('de');
  });

  it('a patrol marches back and forth until stopped', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris', { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-nord', mode: 'patrol' });
    const visits: string[] = [];
    for (let t = 0; t < 3000; t++) {
      run(state, 1);
      const a = state.armies[army.id];
      if (!a.move?.leg && visits.at(-1) !== a.province && (a.province === 'fr-paris' || a.province === 'fr-nord')) visits.push(a.province);
    }
    expect(visits.slice(0, 3)).toEqual(['fr-nord', 'fr-paris', 'fr-nord']);
    expect(state.armies[army.id].move?.mode).toBe('patrol');
    applyCommand(state, world, { type: 'stop', nation: 'fr', armyId: army.id });
    run(state, 600);
    expect(state.armies[army.id].move).toBeNull();
  });

  it('hold position halts a march at once, where it stands on the road, and stays until a new order', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', landOf('fr-paris'), { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: landOf('fr-nord'), mode: 'patrol' });
    run(state, 5);
    const next = army.move!.leg!.to;
    expect(applyCommand(state, world, { type: 'hold', nation: 'fr', armyId: army.id, hold: true }).ok).toBe(true);
    run(state, 1500);
    expect(army.province).toBe(landOf('fr-paris'));
    expect(army.road?.toward).toBe(next);
    expect(army.move).toBeNull();
    expect(army.holding).toBe(true);
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: landOf('fr-nord'), mode: 'move' });
    expect(army.holding).toBe(false);
  });
});
