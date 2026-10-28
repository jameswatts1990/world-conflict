import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { EUROPE_SCENARIO, Simulation, buildWorld, createInitialState, heldVp, UNIT_TYPES } from '../src/sim';
import { compareTests, renderComparison } from '../scripts/balance/compare';
import { armyAround, labGrounds, REFERENCE, runLabCell, techLevels } from '../scripts/balance/lab';
import { parseWeight, reweigh, type FunReport } from '../scripts/balance/goals';
import { applyOverrides, parseOverride } from '../scripts/balance/overrides';
import { playGame, type GameRecord } from '../scripts/balance/record';
import { renderReport } from '../scripts/balance/report';
import { balanceWorld, catalogue, loadSim, type Sim } from '../scripts/balance/sim';
import { knobPosition, knobValue, type Knob } from '../scripts/balance/space';
import { meanDiffP, median, meanOf, qValues, quantile, rateDiffP, wilsonHalfWidth } from '../scripts/balance/stats';
import { describeSeeds, summarise, type Summary } from '../scripts/balance/summary';
import { grantTech, runTechSeed, testSeat } from '../scripts/balance/techlab';
import { mergeRuns, renderTechs, techRows, type TechRun } from '../scripts/balance/techreport';

describe('balance statistics', () => {
  it('gives rates an honest margin of error', () => {
    expect(wilsonHalfWidth({ k: 50, n: 100 })).toBeCloseTo(0.096, 2);
    expect(wilsonHalfWidth({ k: 25, n: 400 })).toBeLessThan(0.03);
  });

  it('tells a real difference from chance', () => {
    expect(rateDiffP({ k: 20, n: 100 }, { k: 20, n: 100 })).toBeCloseTo(1, 5);
    expect(rateDiffP({ k: 10, n: 200 }, { k: 40, n: 200 })).toBeLessThan(0.001);
    expect(meanDiffP(meanOf([1, 2, 3, 4, 5]), meanOf([1, 2, 3, 4, 5]))).toBeCloseTo(1, 5);
    expect(meanDiffP(meanOf(Array.from({ length: 50 }, (_, i) => i % 5)), meanOf(Array.from({ length: 50 }, (_, i) => 3 + (i % 5))))).toBeLessThan(0.001);
  });

  it('corrects p-values for testing many numbers at once', () => {
    const q = qValues([0.01, 0.04, 0.03, 0.5]);
    expect(q[0]).toBeCloseTo(0.04, 5);
    expect(q[3]).toBeCloseTo(0.5, 5);
    for (let i = 0; i < q.length; i++) expect(q[i]).toBeGreaterThanOrEqual([0.01, 0.04, 0.03, 0.5][i]);
  });

  it('takes quantiles and describes seed ranges', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
    expect(describeSeeds([3, 1, 2])).toBe('1–3');
    expect(describeSeeds([1, 5])).toBe('1, 5');
  });
});

describe('balance config overrides', () => {
  const config = () => ({ AI: { attackRatio: 1.15, unitsFlat: { playable: 8, state: 0 }, doctrines: ['armour'] }, UNITS: { tank: { cost: { money: 320 } } } });

  it('reads PATH=VALUE as JSON, or a bare word as a string', () => {
    expect(parseOverride('AI.attackRatio=1.3')).toEqual({ path: 'AI.attackRatio', value: 1.3 });
    expect(parseOverride('AI.doctrines=["infantry"]')).toEqual({ path: 'AI.doctrines', value: ['infantry'] });
    expect(parseOverride('X.name=infantry')).toEqual({ path: 'X.name', value: 'infantry' });
    expect(() => parseOverride('AI.attackRatio')).toThrow(/PATH=VALUE/);
  });

  it('sets nested values in place', () => {
    const c = config();
    applyOverrides(c, [parseOverride('AI.unitsFlat.state=3'), parseOverride('UNITS.tank.cost.money=280')]);
    expect(c.AI.unitsFlat.state).toBe(3);
    expect(c.UNITS.tank.cost.money).toBe(280);
  });

  it('refuses typos and values of the wrong kind', () => {
    expect(() => applyOverrides(config(), [parseOverride('AI.atackRatio=1.3')])).toThrow(/Unknown config path/);
    expect(() => applyOverrides(config(), [parseOverride('Ai.attackRatio=1.3')])).toThrow(/should start with one of AI, UNITS/);
    expect(() => applyOverrides(config(), [parseOverride('AI.attackRatio=high')])).toThrow(/cannot be set/);
    expect(() => applyOverrides(config(), [parseOverride('AI.doctrines=3')])).toThrow(/cannot be set/);
  });
});

describe('balance tuning knobs', () => {
  it('maps positions to values and back, by ratio for log knobs', () => {
    const linear: Knob = { path: 'AI.attackRatio', min: 1, max: 2 };
    const ratio: Knob = { path: 'AI.warChance', min: 0.01, max: 0.04, log: true };
    const whole: Knob = { path: 'AI.pileOnWars', min: 1, max: 3, integer: true };
    expect(knobValue(linear, 0.5)).toBeCloseTo(1.5);
    expect(knobPosition(linear, 1.5)).toBeCloseTo(0.5);
    expect(knobValue(ratio, 0.5)).toBeCloseTo(0.02);
    expect(knobPosition(ratio, 0.02)).toBeCloseTo(0.5);
    expect(knobValue(whole, 0.6)).toBe(2);
    expect(knobValue(linear, 2)).toBe(2);
  });

  it('reweighs goals for a run, and refuses goals that do not exist', () => {
    const fun: FunReport = {
      total: 2,
      terms: [
        { id: 'decisive', label: '', goal: '', unit: 'percent', weight: 0.5, value: 0.1, penalty: 2 },
        { id: 'doctrines', label: '', goal: '', unit: 'ratio', weight: 1, value: 2, penalty: 1 },
      ],
    };
    expect(reweigh(fun, {})).toBe(2);
    expect(reweigh(fun, { [parseWeight('doctrines=0').id]: 0, decisive: parseWeight('decisive=1.5').weight })).toBe(3);
    expect(() => parseWeight('doctrine=0')).toThrow(/no goal/);
    expect(() => parseWeight('decisive')).toThrow(/should look like/);
  });
});

describe('balance runs', () => {
  let sim: Sim;
  let records: GameRecord[];
  let summary: Summary;

  beforeAll(async () => {
    sim = await loadSim(resolve('src/sim'), []);
    const world = balanceWorld(sim);
    records = [3, 4].map((seed) => playGame(sim, world, seed, 8));
    const meta = {
      label: 'test',
      commit: 'test',
      overrides: [],
      seeds: describeSeeds([3, 4]),
      maxMinutes: 8,
      startedAt: new Date(0).toISOString(),
      wallSeconds: 1,
      workers: 1,
      catalogue: catalogue(sim, world),
    };
    summary = summarise(records, meta);
  });

  it('records a campaign without changing it', () => {
    const world = buildWorld(EUROPE_SCENARIO);
    const plain = new Simulation(world, createInitialState(world, { seed: 3, humanNation: null }));
    plain.run(8 * 60);
    const rec = records[0];
    expect(rec.minutes).toBe(8);
    for (const id of world.nationIds) {
      expect(rec.series.vp[id]).toHaveLength(8);
      expect(rec.series.vp[id][7]).toBe(plain.state.nations[id].eliminated ? 0 : heldVp(plain.state, world, id));
      expect(rec.series.provinces[id][7]).toBe(world.provinceIds.filter((p) => plain.state.provinces[p].owner === id).length);
    }
    expect(rec.activity.eventsMissed).toBe(0);
  });

  it('plays the same campaign the same way every time', () => {
    const again = playGame(sim, balanceWorld(sim), 3, 8);
    expect({ ...again, wallMs: 0 }).toEqual({ ...records[0], wallMs: 0 });
  });

  it('summarises every nation and unit type the scenario defines', () => {
    expect(summary.nations.map((n) => n.id)).toEqual(sim.api.EUROPE_SCENARIO.nations.map((n) => n.id));
    expect(summary.units.map((u) => u.id)).toEqual([...UNIT_TYPES]);
    expect(summary.flags.map((f) => f.id)).toEqual(expect.arrayContaining(['run:small', 'run:capped']));
    expect(Number.isFinite(summary.fun.total)).toBe(true);
    expect(renderReport(summary)).toContain('## Nations');
  });

  it('compares a run with itself without finding changes', () => {
    expect(compareTests(summary, summary).every((t) => t.p > 0.99)).toBe(true);
    expect(renderComparison(summary, summary)).toContain('None: nothing moved');
  });

  it('stages unit-lab battles at every technology level', () => {
    const levels = techLevels(sim);
    expect(levels.map((l) => l.id)).toEqual(['ww1', 'interwar', 'ww2']);
    expect(levels[0].units).not.toContain('antiTank');
    expect(levels[2].units).toEqual([...UNIT_TYPES]);
    expect(labGrounds(balanceWorld(sim))).toContain('fortified');
    const settings = { budget: 8, seeds: 2, upkeepMinutes: 30 };
    const cell = { kind: 'index' as const, level: 'ww1', unit: REFERENCE, ground: 'plains', role: 'attack' as const };
    const result = runLabCell(sim, cell, settings);
    expect(result.armyCost).toBe(8);
    expect(result.value).toBeGreaterThan(1);
    expect(runLabCell(sim, cell, settings)).toEqual(result);
    expect(armyAround({ infantry: 1 }, REFERENCE, 8)).toEqual([[REFERENCE, 8]]);
    expect(armyAround({ infantry: 1, tank: 3 }, 'tank', 12)).toEqual([
      ['tank', 2],
      ['infantry', 6],
    ]);
  });

  it('hands a technology over as if its research had just finished', () => {
    const state = createInitialState(balanceWorld(sim), { seed: 9, humanNation: null });
    const r = state.nations.fr.research;
    r.queue = ['staffCollege'];
    expect(grantTech(state, 'fr', 'staffCollege')).toBe(true);
    expect(r.completed).toContain('staffCollege');
    expect(r.queue).not.toContain('staffCollege');
    expect(grantTech(state, 'fr', 'staffCollege')).toBe(false);
  });

  it('tests a different playable nation on each seed, skipping the knocked out', () => {
    const state = createInitialState(balanceWorld(sim), { seed: 9, humanNation: null });
    expect(testSeat(state, ['uk', 'fr', 'de'], 1)).toBe('fr');
    state.nations.fr.eliminated = true;
    expect(testSeat(state, ['uk', 'fr', 'de'], 1)).toBe('de');
  });

  it('measures a technology on paired campaigns and joins runs split over runners', () => {
    const world = balanceWorld(sim);
    const settings = { at: 2, minutes: 5 };
    const result = runTechSeed(sim, world, 5, ['staffCollege', 'landships'], settings)!;
    expect(result.control.place).toBeGreaterThan(0);
    expect(Object.keys(result.granted)).toEqual(['staffCollege', 'landships']);
    expect(runTechSeed(sim, world, 5, ['staffCollege'], settings)!.granted.staffCollege).toEqual(result.granted.staffCollege);
    const run = (techs: string[]): TechRun => ({
      label: 'test',
      commit: 'test',
      overrides: [],
      settings,
      seeds: '5',
      techs: techs.map((id) => ({ id, name: id, branch: 'x', col: 0, cost: '' })),
      results: [{ ...result, granted: Object.fromEntries(techs.map((t) => [t, result.granted[t]])) }],
    });
    const merged = mergeRuns([run(['staffCollege']), run(['landships'])]);
    expect(techRows(merged).map((r) => r.id).sort()).toEqual(['landships', 'staffCollege']);
    expect(renderTechs(merged)).toContain('## Technologies, most valuable first');
  });
});
