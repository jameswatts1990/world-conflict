import { describe, expect, it } from 'vitest';
import { AI } from '../src/sim/config/ai';
import { armyPower, scaledTicks } from '../src/sim';
import { buildContext, observeForces } from '../src/sim/ai/context';
import { attackNeed } from '../src/sim/ai/military';
import { aiGame, clearArmies, place, run, setWar, world } from './helpers';

describe('AI military', () => {
  it('holds an occupied province until the capture completes', () => {
    const state = aiGame(3);
    run(state, scaledTicks(state, AI.neutralGraceSeconds));
    // Belgium, a one-province minor power, with its garrison gone and no means to raise another.
    setWar(state, 'fr', 'be');
    clearArmies(state, 'be-brussels');
    state.nations.be.resources = { money: 0, materials: 0, fuel: 0, manpower: 0 };
    state.provinces['be-brussels'].recruitQueue = [];
    place(state, 'fr', 'be-brussels', { infantry: 4 });
    for (let t = 0; t < 400 && state.provinces['be-brussels'].owner === 'be'; t++) {
      run(state, 1);
      // Armies may merge or pass through, but the province is never left empty.
      const french = Object.values(state.armies).filter((a) => a.owner === 'fr' && a.province === 'be-brussels');
      expect(french.length).toBeGreaterThan(0);
    }
    expect(state.provinces['be-brussels'].owner).toBe('fr');
  });
});

describe('AI under the fog of war', () => {
  it('knows only the armies it can see, and guesses at the rest from public totals', () => {
    const state = aiGame(5);
    clearArmies(state);
    setWar(state, 'fr', 'de');
    // A German tank army deep in Germany, out of France's sight.
    const tanks = place(state, 'de', 'de-berlin', { tank: 6 });
    observeForces(state, world, 'fr');
    let ctx = buildContext(state, world, 'fr');
    expect(ctx.seen.has('de-berlin')).toBe(false);
    expect(ctx.hostile.has('de-berlin')).toBe(false);
    expect(ctx.enemyArmour).toBe(0);
    // Germany's military power is public, so France spreads it over the German provinces it cannot see.
    const dark = world.provinceIds.filter((p) => state.provinces[p].owner === 'de' && !ctx.seen.has(p)).length;
    expect(ctx.unseen.get('de')).toBeCloseTo(armyPower(state, tanks) / dark);

    // A French cavalry scout two provinces away finds it.
    const scout = place(state, 'fr', 'de-hesse', { cavalry: 1 });
    observeForces(state, world, 'fr');
    ctx = buildContext(state, world, 'fr');
    expect(ctx.hostile.get('de-berlin')).toBeCloseTo(armyPower(state, tanks));
    expect(ctx.unseen.get('de') ?? 0).toBeCloseTo(0);
    expect(ctx.enemyArmour).toBe(1);

    // Out of sight again, the tanks are not forgotten.
    delete state.armies[scout.id];
    observeForces(state, world, 'fr');
    ctx = buildContext(state, world, 'fr');
    expect(ctx.hostile.has('de-berlin')).toBe(false);
    expect(ctx.enemyArmour).toBe(1);
  });

  it('sizes an attack by what it can see, not by where a hidden army stands', () => {
    const state = aiGame(5);
    clearArmies(state);
    setWar(state, 'fr', 'de');
    // Baden borders France and is in sight; Bavaria, behind it, and Berlin are not.
    const army = place(state, 'de', 'de-bavaria', { infantry: 10 });
    const need = () => attackNeed(buildContext(state, world, 'fr'), 'de-baden');
    const hidden = need();
    army.province = 'de-berlin';
    expect(need()).toBeCloseTo(hidden);
    // In plain sight next door, the same army raises the bar.
    army.province = 'de-hesse';
    expect(need()).toBeGreaterThan(hidden);
  });

  it('sees what its allies see once it has Liaison Officers', () => {
    const state = aiGame(5);
    setWar(state, 'fr', 'de');
    setWar(state, 'it', 'de');
    expect(buildContext(state, world, 'fr').seen.has('it-naples')).toBe(false);
    state.nations.fr.research.completed.push('liaisonOfficers');
    expect(buildContext(state, world, 'fr').seen.has('it-naples')).toBe(true);
  });
});
