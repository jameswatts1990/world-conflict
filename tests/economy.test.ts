import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/sim/config/buildings';
import { ECONOMY, MORALE } from '../src/sim/config/rules';
import { UNITS } from '../src/sim/config/units';
import { applyCommand, constructionTicks, nationEconomy, provinceOutput, recruitTicks } from '../src/sim';
import { clearArmies, place, quietGame, run, world } from './helpers';

describe('resource accounting', () => {
  it('income minus upkeep accrues exactly per tick', () => {
    const state = quietGame();
    const before = { ...state.nations.fr.resources };
    const eco = nationEconomy(state, world, 'fr');
    run(state, 60);
    const after = state.nations.fr.resources;
    expect(after.money - before.money).toBeCloseTo(eco.net.money, 6);
    expect(after.materials - before.materials).toBeCloseTo(eco.net.materials, 6);
    expect(after.fuel - before.fuel).toBeCloseTo(eco.net.fuel, 6);
    expect(after.manpower - before.manpower).toBeCloseTo(eco.net.manpower, 6);
    // Upkeep matches the configured per-unit costs.
    const units = Object.values(state.armies).filter((a) => a.owner === 'fr').flatMap((a) => a.units);
    const expected = units.reduce((s, u) => s + (UNITS[u.type].upkeepPerMinute.money ?? 0), 0);
    expect(eco.upkeep.money).toBeCloseTo(expected, 9);
  });

  it('building deducts its cost and improves production when complete', () => {
    const state = quietGame();
    const pid = 'fr-rhone';
    const cost = BUILDINGS.industry.cost(1);
    const r0 = { ...state.nations.fr.resources };
    const out0 = provinceOutput(state, world, pid);
    expect(applyCommand(state, world, { type: 'build', nation: 'fr', province: pid, building: 'industry' })).toEqual({ ok: true });
    expect(state.nations.fr.resources.money).toBeCloseTo(r0.money - cost.money!, 9);
    expect(state.nations.fr.resources.materials).toBeCloseTo(r0.materials - cost.materials!, 9);

    const ticks = constructionTicks(state, 'fr', 'industry', 1);
    run(state, ticks - 1);
    expect(state.provinces[pid].buildings.industry).toBeUndefined();
    run(state, 1);
    expect(state.provinces[pid].buildings.industry).toBe(1);
    const out1 = provinceOutput(state, world, pid);
    expect(out1.money).toBeCloseTo(out0.money * 1.3, 6);
    expect(out1.materials).toBeCloseTo(out0.materials * 1.6, 6);
  });

  it('rejects unaffordable or invalid construction without charging', () => {
    const state = quietGame();
    state.nations.fr.resources.money = 10;
    const r0 = { ...state.nations.fr.resources };
    const res = applyCommand(state, world, { type: 'build', nation: 'fr', province: 'fr-rhone', building: 'industry' });
    expect(res.ok).toBe(false);
    expect(state.nations.fr.resources).toEqual(r0);
    // Cannot build in someone else's province.
    expect(applyCommand(state, world, { type: 'build', nation: 'fr', province: 'de-berlin', building: 'barracks' }).ok).toBe(false);
    // Tank Works must be researched, then requires Arms Works.
    state.nations.fr.resources.money = 1e5;
    state.nations.fr.resources.materials = 1e5;
    expect(applyCommand(state, world, { type: 'build', nation: 'fr', province: 'fr-paris', building: 'tankWorks' }).ok).toBe(false);
    state.nations.fr.research.completed.push('landships');
    expect(applyCommand(state, world, { type: 'build', nation: 'fr', province: 'fr-nord', building: 'tankWorks' }).ok).toBe(false);
    expect(applyCommand(state, world, { type: 'build', nation: 'fr', province: 'fr-paris', building: 'tankWorks' }).ok).toBe(true);
  });

  it('recruitment requires the right building, charges the cost and spawns after the timer', () => {
    const state = quietGame();
    clearArmies(state, 'fr-paris');
    expect(applyCommand(state, world, { type: 'recruit', nation: 'fr', province: 'fr-centre', unitType: 'infantry' }).ok).toBe(false);
    expect(applyCommand(state, world, { type: 'recruit', nation: 'fr', province: 'fr-paris', unitType: 'tank' }).ok).toBe(false);
    const m0 = state.nations.fr.resources.manpower;
    expect(applyCommand(state, world, { type: 'recruit', nation: 'fr', province: 'fr-paris', unitType: 'artillery' }).ok).toBe(true);
    expect(state.nations.fr.resources.manpower).toBeCloseTo(m0 - UNITS.artillery.cost.manpower!, 9);
    const ticks = recruitTicks(state, 'fr', 'artillery');
    run(state, ticks);
    const here = Object.values(state.armies).filter((a) => a.owner === 'fr' && a.province === 'fr-paris');
    expect(here).toHaveLength(1);
    expect(here[0].units.map((u) => u.type)).toEqual(['artillery']);
  });

  it('output follows province morale; occupied land also yields few recruits', () => {
    const state = quietGame();
    const core = provinceOutput(state, world, 'de-ruhr');
    expect(state.provinces['de-ruhr'].morale).toBe(MORALE.outputPivot);
    state.provinces['de-ruhr'].owner = 'fr';
    state.provinces['de-ruhr'].morale = MORALE.capturedOccupied;
    const occupied = provinceOutput(state, world, 'de-ruhr');
    const f = MORALE.outputFloor + ((1 - MORALE.outputFloor) * MORALE.capturedOccupied) / MORALE.outputPivot;
    expect(occupied.money).toBeCloseTo(core.money * f, 9);
    expect(occupied.manpower).toBeCloseTo(core.manpower * f * ECONOMY.occupiedManpower, 9);
  });

  it('an empty treasury clamps at zero and flags a shortage', () => {
    const state = quietGame();
    for (const id of world.provinceIds) if (state.provinces[id].owner === 'fr') state.provinces[id].owner = 'de';
    state.provinces['fr-paris'].owner = 'fr';
    place(state, 'fr', 'fr-paris', { infantry: 30 }); // upkeep now exceeds Paris' income
    state.nations.fr.resources.money = 1;
    run(state, 120);
    expect(state.nations.fr.resources.money).toBe(0);
    expect(state.nations.fr.shortages.money).toBe(true);
  });
});
