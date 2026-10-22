import { describe, expect, it } from 'vitest';
import { BUILDING_UNLOCKED_BY, RESEARCH_RULES, TECHS, TECH_BY_ID, UNIT_UNLOCKED_BY } from '../src/sim/config/research';
import { UNITS } from '../src/sim/config/units';
import {
  UNIT_TYPES,
  applyCommand,
  checkRecruit,
  currentModel,
  formationName,
  armyName,
  nationEra,
  productionMultiplier,
  researchSlots,
  researchSpeed,
  scaledTicks,
  unitStats,
} from '../src/sim';
import { place, quietGame, richen, run, world } from './helpers';

describe('research tree', () => {
  it('is a well-formed tree: prerequisites exist, lie in earlier columns, and every node has its own cell', () => {
    const ids = new Set(TECHS.map((t) => t.id));
    expect(ids.size).toBe(TECHS.length);
    expect(TECHS.length).toBeGreaterThanOrEqual(50);
    const cells = new Set<string>();
    for (const t of TECHS) {
      for (const r of t.requires) {
        expect(ids.has(r), `${t.id} requires unknown ${r}`).toBe(true);
        expect(TECH_BY_ID[r].col, `${t.id} requires later ${r}`).toBeLessThan(t.col);
      }
      const cell = `${t.branch}:${t.col}:${t.row}`;
      expect(cells.has(cell), `two techs share ${cell}`).toBe(false);
      cells.add(cell);
      expect(t.col).toBeGreaterThanOrEqual(0);
      expect(t.col).toBeLessThanOrEqual(7);
    }
  });

  it('unlocks every unit type that is not available from the start, and only generations that exist', () => {
    const fromStart = UNIT_TYPES.filter((t) => !UNIT_UNLOCKED_BY[t]);
    expect(fromStart.sort()).toEqual(['artillery', 'cavalry', 'infantry']);
    for (const t of TECHS) {
      for (const e of t.effects) {
        if (e.kind !== 'unitModel') continue;
        for (const u of e.units) expect(UNITS[u].models[e.gen], `${t.id}: ${u} has no ${e.gen} model`).toBeDefined();
      }
    }
    expect(BUILDING_UNLOCKED_BY.tankWorks).toBe('landships');
  });

  it('enforces prerequisites', () => {
    const state = quietGame();
    richen(state, 'fr');
    const res = applyCommand(state, world, { type: 'research', nation: 'fr', tech: 'ww2Tanks' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/Requires/);
    expect(state.nations.fr.research.active).toEqual([]);
  });

  it('charges cost, completes after its duration, and limits parallel projects to the research slots', () => {
    const state = quietGame();
    const cfg = TECH_BY_ID.lightMachineGuns;
    const money0 = state.nations.fr.resources.money;
    expect(applyCommand(state, world, { type: 'research', nation: 'fr', tech: 'lightMachineGuns' }).ok).toBe(true);
    expect(state.nations.fr.resources.money).toBeCloseTo(money0 - cfg.cost.money!, 9);
    expect(researchSlots(state, 'fr')).toBe(RESEARCH_RULES.baseSlots);
    expect(applyCommand(state, world, { type: 'research', nation: 'fr', tech: 'motorTransport' }).ok).toBe(false);
    const before = unitStats(state, 'fr', 'infantry');
    run(state, scaledTicks(state, cfg.seconds) - 1);
    expect(state.nations.fr.research.completed).not.toContain('lightMachineGuns');
    run(state, 1);
    expect(state.nations.fr.research.completed).toContain('lightMachineGuns');
    expect(unitStats(state, 'fr', 'infantry').defence.soft).toBeCloseTo(before.defence.soft * 1.15, 9);
  });

  it('extra research slots allow parallel projects', () => {
    const state = quietGame();
    richen(state, 'fr');
    state.nations.fr.research.completed = ['industrialMobilisation', 'electrification', 'researchInstitutes'];
    expect(researchSlots(state, 'fr')).toBe(2);
    expect(applyCommand(state, world, { type: 'research', nation: 'fr', tech: 'lightMachineGuns' }).ok).toBe(true);
    expect(applyCommand(state, world, { type: 'research', nation: 'fr', tech: 'motorTransport' }).ok).toBe(true);
    expect(applyCommand(state, world, { type: 'research', nation: 'fr', tech: 'indirectFire' }).ok).toBe(false);
  });

  it('the queue starts projects in order as soon as prerequisites, slots and funds allow', () => {
    const state = quietGame();
    richen(state, 'fr');
    for (const tech of ['landships', 'lightTanks', 'indirectFire']) {
      expect(applyCommand(state, world, { type: 'queueResearch', nation: 'fr', tech }).ok).toBe(true);
    }
    // Landships starts at once; Light Tanks waits for it; Indirect Fire waits for a slot.
    expect(state.nations.fr.research.active.map((j) => j.tech)).toEqual(['landships']);
    expect(state.nations.fr.research.queue).toEqual(['lightTanks', 'indirectFire']);
    run(state, scaledTicks(state, TECH_BY_ID.landships.seconds));
    expect(state.nations.fr.research.active.map((j) => j.tech)).toEqual(['lightTanks']);
    // Cannot queue something whose prerequisites are neither done nor planned.
    expect(applyCommand(state, world, { type: 'queueResearch', nation: 'fr', tech: 'ww2Tanks' }).ok).toBe(false);
    // Dropping a queued project drops what depends on it.
    expect(applyCommand(state, world, { type: 'queueResearch', nation: 'fr', tech: 'interwarTanks' }).ok).toBe(true);
    applyCommand(state, world, { type: 'cancelResearch', nation: 'fr', tech: 'lightTanks' });
    expect(state.nations.fr.research.queue).toEqual(['indirectFire']);
  });

  it('universities speed up research', () => {
    const state = quietGame();
    const base = researchSpeed(state, 'fr');
    state.provinces['fr-paris'].buildings.university = 1;
    state.provinces['fr-nord'].buildings.university = 1;
    expect(researchSpeed(state, 'fr')).toBeCloseTo(base * 1.2, 9);
  });

  it('research unlocks units and upgrades existing ones in place to new generations', () => {
    const state = quietGame();
    richen(state, 'fr');
    state.provinces['fr-paris'].buildings.tankWorks = 1;
    expect(checkRecruit(state, world, 'fr', 'fr-paris', 'tank').ok).toBe(false);
    state.nations.fr.research.completed = ['landships'];
    expect(checkRecruit(state, world, 'fr', 'fr-paris', 'tank').ok).toBe(true);
    expect(currentModel(state, world, 'fr', 'tank').name).toBe('Schneider CA1');

    expect(unitStats(state, 'de', 'tank').gen).toBe('ww1');
    expect(nationEra(state, 'de')).toBe('WWI');
    state.nations.de.research.completed = ['landships', 'lightTanks', 'interwarTanks', 'motorTransport', 'fieldRadio', 'ww2Tanks'];
    const tank = unitStats(state, 'de', 'tank');
    expect(tank.gen).toBe('ww2');
    expect(currentModel(state, world, 'de', 'tank').name).toBe('Panzer III');
    expect(currentModel(state, world, 'de', 'lightTank').name).toBe('Panzer II');
    state.nations.de.research.completed.push('industrialMobilisation');
    expect(productionMultiplier(state, 'de', 'materials')).toBeCloseTo(1.2, 9);
    state.nations.de.research.completed.push('lightMachineGuns', 'interwarInfantry', 'semiAutoRifles', 'ww2Infantry');
    expect(nationEra(state, 'de')).toBe('Interwar');
    state.nations.de.research.completed.push('indirectFire', 'creepingBarrage', 'interwarArtillery', 'soundRanging', 'ww2Artillery');
    expect(nationEra(state, 'de')).toBe('WWII');
    // Other nations are unaffected.
    expect(unitStats(state, 'fr', 'tank').gen).toBe('ww1');
  });
});

describe('national identity', () => {
  it('numbers formations and armies in each nation’s own style', () => {
    const state = quietGame();
    const fr = place(state, 'fr', 'fr-paris', { infantry: 1 });
    const de = place(state, 'de', 'de-berlin', { tank: 1 });
    const uk = place(state, 'uk', 'uk-london', { infantry: 1 });
    expect(formationName(world, 'fr', fr.units[0])).toMatch(/^\d+e Division d'Infanterie$/);
    expect(formationName(world, 'de', de.units[0])).toBe('1. Panzer-Regiment');
    expect(formationName(world, 'uk', uk.units[0])).toMatch(/^\d+(st|nd|rd|th) Infantry Division$/);
    expect(armyName(world, de)).toMatch(/^\d+\. Armee$/);
    expect(currentModel(state, world, 'pl', 'cavalry').name).toBe('Ułani');
    expect(currentModel(state, world, 'it', 'mountain').name).toBe('Alpini');
  });

  it('national specialities apply only to their nation', () => {
    const state = quietGame();
    expect(unitStats(state, 'pl', 'cavalry').attack.soft).toBeCloseTo(unitStats(state, 'fr', 'cavalry').attack.soft * 1.25, 9);
    expect(unitStats(state, 'it', 'mountain').defence.soft).toBeGreaterThan(unitStats(state, 'de', 'mountain').defence.soft);
  });
});
