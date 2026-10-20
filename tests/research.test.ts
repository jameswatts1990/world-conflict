import { describe, expect, it } from 'vitest';
import { TECHS, TECH_BY_ID } from '../src/sim/config/research';
import { applyCommand, checkResearch, nationEra, productionMultiplier, scaledTicks, unitStats } from '../src/sim';
import { quietGame, richen, run, world } from './helpers';

describe('research', () => {
  it('every prerequisite exists and the tree has no cycles', () => {
    const ids = new Set(TECHS.map((t) => t.id));
    for (const t of TECHS) for (const r of t.requires) expect(ids.has(r)).toBe(true);
    for (const t of TECHS) for (const r of t.requires) expect(TECH_BY_ID[r].tier).toBeLessThanOrEqual(t.tier);
  });

  it('enforces prerequisites', () => {
    const state = quietGame();
    richen(state, 'fr');
    const res = checkResearch(state, 'fr', 'ww2Tanks');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/Requires/);
    expect(applyCommand(state, world, { type: 'research', nation: 'fr', tech: 'ww2Tanks' }).ok).toBe(false);
    expect(state.nations.fr.research.active).toBeNull();
  });

  it('charges cost, completes after its duration, and allows only one project at a time', () => {
    const state = quietGame();
    const cfg = TECH_BY_ID.lightMachineGuns;
    const money0 = state.nations.fr.resources.money;
    expect(applyCommand(state, world, { type: 'research', nation: 'fr', tech: 'lightMachineGuns' }).ok).toBe(true);
    expect(state.nations.fr.resources.money).toBeCloseTo(money0 - cfg.cost.money!, 9);
    expect(applyCommand(state, world, { type: 'research', nation: 'fr', tech: 'motorTransport' }).ok).toBe(false);
    const before = unitStats(state, 'fr', 'infantry');
    run(state, scaledTicks(state, cfg.seconds) - 1);
    expect(state.nations.fr.research.completed).not.toContain('lightMachineGuns');
    run(state, 1);
    expect(state.nations.fr.research.completed).toContain('lightMachineGuns');
    expect(unitStats(state, 'fr', 'infantry').defence.soft).toBeCloseTo(before.defence.soft * 1.15, 9);
  });

  it('WWII upgrades replace unit models and advance the era', () => {
    const state = quietGame();
    expect(unitStats(state, 'de', 'tank').model).toBe('ww1');
    expect(nationEra(state, 'de')).toBe('WWI');
    state.nations.de.research.completed = ['motorTransport', 'fieldRadio', 'industrialMobilisation', 'ww2Tanks'];
    const tank = unitStats(state, 'de', 'tank');
    expect(tank.model).toBe('ww2');
    expect(tank.name).toMatch(/1940/);
    expect(productionMultiplier(state, 'de', 'materials')).toBeCloseTo(1.2, 9);
    state.nations.de.research.completed.push('lightMachineGuns', 'indirectFire', 'assemblyLine', 'ww2Infantry', 'ww2Artillery');
    expect(nationEra(state, 'de')).toBe('WWII');
    // Other nations are unaffected.
    expect(unitStats(state, 'fr', 'tank').model).toBe('ww1');
  });
});
