import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/sim/config/buildings';
import { ECONOMY } from '../src/sim/config/rules';
import { UNITS } from '../src/sim/config/units';
import { applyCommand, constructionTicks, nationEconomy, provinceOutput, recruitCost, recruitTicks } from '../src/sim';
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
    // Tank Works requires Arms Works.
    state.nations.fr.resources.money = 1e5;
    state.nations.fr.resources.materials = 1e5;
    expect(applyCommand(state, world, { type: 'build', nation: 'fr', province: 'fr-nord', building: 'tankWorks' }).ok).toBe(false);
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

  it('cancelling refunds the price paid: all of it before work starts, half after', () => {
    const state = quietGame();
    const fr = state.nations.fr;
    const paid = recruitCost(state, 'fr', 'infantry');
    const recruit = () => applyCommand(state, world, { type: 'recruit', nation: 'fr', province: 'fr-paris', unitType: 'infantry' });
    const cancel = (index: number) => applyCommand(state, world, { type: 'cancelRecruit', nation: 'fr', province: 'fr-paris', index });

    // A misclick while paused costs nothing, even for the job at the front of the queue.
    const r0 = { ...fr.resources };
    recruit();
    expect(cancel(0).ok).toBe(true);
    expect(fr.resources).toEqual(r0);

    // Once training has started, half comes back; queued jobs behind it are refunded in full.
    recruit();
    recruit();
    run(state, 1);
    const r1 = { ...fr.resources };
    cancel(1);
    expect(fr.resources.money - r1.money).toBeCloseTo(paid.money!, 6);
    cancel(0);
    expect(fr.resources.money - r1.money).toBeCloseTo(paid.money! * (1 + ECONOMY.startedJobRefund), 6);

    // The refund is what was paid, not today's (researched, cheaper) price.
    recruit();
    recruit();
    fr.research.completed.push('assemblyLine');
    expect(recruitCost(state, 'fr', 'infantry').materials).toBeLessThan(paid.materials!);
    const r2 = { ...fr.resources };
    cancel(1);
    expect(fr.resources.materials - r2.materials).toBeCloseTo(paid.materials!, 6);
  });

  it('construction can be cancelled with the same refund rules', () => {
    const state = quietGame();
    const cost = BUILDINGS.fortifications.cost(1);
    const r0 = { ...state.nations.fr.resources };
    const build = () => applyCommand(state, world, { type: 'build', nation: 'fr', province: 'fr-east', building: 'fortifications' });
    const cancel = () => applyCommand(state, world, { type: 'cancelBuild', nation: 'fr', province: 'fr-east' });
    expect(cancel().ok).toBe(false);
    build();
    expect(cancel().ok).toBe(true);
    expect(state.provinces['fr-east'].construction).toBeNull();
    expect(state.nations.fr.resources).toEqual(r0);
    build();
    run(state, 5);
    const before = state.nations.fr.resources.money;
    cancel();
    expect(state.nations.fr.resources.money - before).toBeCloseTo(cost.money! * ECONOMY.startedJobRefund, 6);
    expect(state.provinces['fr-east'].buildings.fortifications).toBeUndefined();
    // Only the owner can cancel.
    build();
    expect(applyCommand(state, world, { type: 'cancelBuild', nation: 'de', province: 'fr-east' }).ok).toBe(false);
  });

  it('occupied non-core provinces produce at the configured reduced rate', () => {
    const state = quietGame();
    const core = provinceOutput(state, world, 'de-ruhr');
    state.provinces['de-ruhr'].owner = 'fr';
    const occupied = provinceOutput(state, world, 'de-ruhr');
    expect(occupied.money).toBeCloseTo(core.money * ECONOMY.nonCoreOutput, 9);
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
