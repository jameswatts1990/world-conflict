import { describe, expect, it } from 'vitest';
import { MORALE } from '../src/sim/config/rules';
import { INTERVALS } from '../src/sim/config/timing';
import { armyConditionSystem } from '../src/sim/systems/supply';
import { transferProvince } from '../src/sim/systems/territory';
import { applyCommand, provinceMoraleTarget, unitMoraleCap, type GameState } from '../src/sim';
import { clearArmies, place, quietGame, run, setWar, world } from './helpers';

const transferProvinceForTest = (state: GameState, pid: string, to: string) => transferProvince(state, world, pid, to);

describe('province and national morale', () => {
  it('provinces drift towards their target, a little each update', () => {
    const state = quietGame();
    const pid = 'fr-rhone';
    state.provinces[pid].morale = 20;
    const { target } = provinceMoraleTarget(state, world, pid);
    expect(target).toBeGreaterThan(60);
    run(state, INTERVALS.civicUpdate); // one update, at tick 0
    expect(state.provinces[pid].morale).toBeCloseTo(20 + MORALE.driftPerStep, 6);
    run(state, 3000);
    expect(state.provinces[pid].morale).toBeCloseTo(target, 0);
  });

  it('war, enemies at the border and battles weigh on civilians', () => {
    const state = quietGame();
    const peace = provinceMoraleTarget(state, world, 'fr-aquitaine').target;
    setWar(state, 'fr', 'de');
    const war = provinceMoraleTarget(state, world, 'fr-aquitaine').target;
    expect(war).toBe(peace + MORALE.perWar);
    clearArmies(state);
    place(state, 'de', 'de-hesse', { infantry: 1 });
    const border = provinceMoraleTarget(state, world, 'fr-nord');
    expect(border.factors.some((f) => f.label === 'Enemy at the border')).toBe(true);
    place(state, 'de', 'fr-nord', { infantry: 1 });
    place(state, 'fr', 'fr-nord', { infantry: 1 });
    expect(provinceMoraleTarget(state, world, 'fr-nord').factors.some((f) => f.label === 'Battle raging')).toBe(true);
  });

  it('declaring war costs the aggressor morale and rallies the victim', () => {
    const state = quietGame();
    const fr0 = state.provinces['fr-paris'].morale;
    const de0 = state.provinces['de-berlin'].morale;
    expect(applyCommand(state, world, { type: 'declareWar', nation: 'fr', target: 'de' }).ok).toBe(true);
    expect(state.provinces['fr-paris'].morale).toBe(fr0 + MORALE.declareWarShock);
    expect(state.provinces['de-berlin'].morale).toBe(de0 + MORALE.rallyShock);
  });

  it('occupied provinces start resentful and integrate over time, faster with a garrison', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    transferProvinceForTest(state, 'de-hesse', 'fr');
    expect(state.provinces['de-hesse'].morale).toBe(MORALE.capturedOccupied);
    const empty = provinceMoraleTarget(state, world, 'de-hesse').target;
    place(state, 'fr', 'de-hesse', { infantry: 1 });
    const garrisoned = provinceMoraleTarget(state, world, 'de-hesse').target;
    expect(garrisoned).toBe(empty + MORALE.garrison);
    state.tick += 60 * 30;
    expect(provinceMoraleTarget(state, world, 'de-hesse').target).toBeGreaterThan(garrisoned);
  });

  it('losing the capital shakes the whole nation', () => {
    const state = quietGame();
    setWar(state, 'fr', 'de');
    const before = state.provinces['de-ruhr'].morale;
    transferProvinceForTest(state, 'de-berlin', 'fr');
    expect(state.provinces['de-ruhr'].morale).toBe(before + MORALE.capitalLostShock);
    expect(provinceMoraleTarget(state, world, 'de-ruhr').factors.some((f) => f.label === 'Capital occupied')).toBe(true);
  });

  it('national morale caps how high unit morale can climb', () => {
    const state = quietGame();
    for (const id of world.provinceIds) if (state.provinces[id].owner === 'fr') state.provinces[id].morale = 20;
    run(state, 1);
    expect(state.nations.fr.morale).toBeLessThan(25);
    const cap = unitMoraleCap(state, 'fr');
    expect(cap).toBeLessThan(0.7);
    const army = place(state, 'fr', 'fr-paris', { infantry: 2 });
    for (const u of army.units) u.morale = 1;
    for (let i = 0; i < 30; i++) armyConditionSystem(state, world);
    for (const u of state.armies[army.id].units) expect(u.morale).toBeCloseTo(cap, 9);
  });
});
