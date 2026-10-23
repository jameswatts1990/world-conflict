import { describe, expect, it } from 'vitest';
import { AI, AI_LEVELS, aiLevel } from '../src/sim/config/ai';
import {
  applyCommand,
  armyPower,
  captureTicks,
  createInitialState,
  scaledTicks,
  setAiOrderTrace,
  type AiOpening,
  type AiOrderTrace,
  type GameState,
  type NationId,
} from '../src/sim';
import { buildContext, observeForces } from '../src/sim/ai/context';
import { attackNeed } from '../src/sim/ai/military';
import { aiGame, clearArmies, place, run, setWar, world } from './helpers';

/** A game in which only the given nation is run by the computer. */
function soloAi(nation: NationId, seed = 5): GameState {
  const state = aiGame(seed, null);
  for (const n of world.nationIds) {
    if (n === nation) continue;
    state.nations[n].controller = 'human';
    state.nations[n].ai = null;
  }
  return state;
}

const atWarWith = (state: GameState, nation: string) => world.nationIds.filter((n) => state.nations[nation].relations[n]?.status === 'war');

describe('AI army control', () => {
  it('an army taking a province holds it until it falls', () => {
    // Walking out resets the capture; the AI used to pull such armies back to
    // its frontier and then send them in again, over and over.
    const state = aiGame(3, 'fr');
    clearArmies(state);
    setWar(state, 'es', 'pt');
    // Portugal has no army left and nothing to raise one with.
    state.provinces['pt-lisbon'].recruitQueue = [];
    state.nations.pt.resources = { money: 0, materials: 0, fuel: 0, manpower: 0 };
    const army = place(state, 'es', 'pt-lisbon', { infantry: 3 });
    const orders: AiOrderTrace[] = [];
    // Only orders given before Lisbon falls: afterwards the army is free to go.
    setAiOrderTrace((t) => state.provinces['pt-lisbon'].owner !== 'es' && orders.push(t));
    try {
      run(state, captureTicks(state, world, 'pt-lisbon') + 5);
    } finally {
      setAiOrderTrace(null);
    }
    expect(orders.filter((o) => o.armyId === army.id)).toEqual([]);
    expect(state.provinces['pt-lisbon'].owner).toBe('es');
  });

  it('keeps a garrison in an interior capital while an enemy army is two provinces away', () => {
    // Paris borders no foreign land, so before this the army there was sent off to the front.
    const state = soloAi('fr');
    clearArmies(state);
    const garrison = place(state, 'fr', 'fr-paris', { infantry: 4, artillery: 1 });
    place(state, 'de', 'de-hesse', { infantry: 8, artillery: 2 });
    setWar(state, 'fr', 'de');
    run(state, 60);
    expect(state.armies[garrison.id]?.province).toBe('fr-paris');
    expect(state.armies[garrison.id]?.move).toBeNull();
  });

  it('a winner that holds enough of the enemy\'s land accepts peace', () => {
    // Spain has taken two French home provinces and is far stronger: it used to fight on to the end.
    const state = soloAi('es');
    clearArmies(state);
    place(state, 'es', 'es-madrid', { infantry: 10, artillery: 3 });
    place(state, 'fr', 'fr-paris', { infantry: 2 });
    setWar(state, 'es', 'fr');
    for (const n of ['es', 'fr'] as const) state.nations[n].relations[n === 'es' ? 'fr' : 'es'].since = -60 * 11;
    state.provinces['fr-midi'].owner = 'es';
    state.provinces['fr-aquitaine'].owner = 'es';
    expect(applyCommand(state, world, { type: 'offerPeace', nation: 'fr', target: 'es' }).ok).toBe(true);
    run(state, 20);
    expect(atWarWith(state, 'es')).toEqual([]);
  });
});

describe('AI on several fronts (interior lines)', () => {
  /** Germany at war with a strong France and a weak Poland; the French border is thinly held. */
  function twoFronts() {
    const state = soloAi('de');
    clearArmies(state);
    place(state, 'de', 'de-hesse', { infantry: 6, artillery: 1 });
    place(state, 'de', 'de-berlin', { infantry: 6, artillery: 1 });
    place(state, 'fr', 'fr-east', { infantry: 1 });
    place(state, 'fr', 'fr-paris', { infantry: 10, artillery: 2 });
    place(state, 'pl', 'pl-greater', { infantry: 1 });
    setWar(state, 'de', 'fr');
    setWar(state, 'de', 'pl');
    return state;
  }

  it('attacks only its main enemy and holds the other front', () => {
    // Without interior lines the army in Hesse takes lightly held Strasbourg.
    const state = twoFronts();
    const orders: AiOrderTrace[] = [];
    setAiOrderTrace((t) => orders.push(t));
    try {
      run(state, 90);
    } finally {
      setAiOrderTrace(null);
    }
    expect(state.nations.de.ai!.focus).toBe('pl');
    expect(orders.filter((o) => o.to.startsWith('fr-'))).toEqual([]);
    expect(state.provinces['fr-east'].owner).toBe('fr');
  });

  it('offers peace on the main front once its gains are in hand, and not on the other', () => {
    const state = twoFronts();
    for (const n of ['fr', 'pl'] as const) {
      state.nations.de.relations[n].since = -60 * 11;
      state.nations[n].relations.de.since = -60 * 11;
    }
    state.provinces['pl-greater'].owner = 'de';
    state.provinces['pl-pomerania'].owner = 'de';
    run(state, 20);
    expect(state.peaceOffers.filter((o) => o.from === 'de').map((o) => o.to)).toEqual(['pl']);
  });
});

describe('AI difficulty', () => {
  it('new games record the difficulty; saves without one play at normal', () => {
    expect(aiLevel(createInitialState(world, { seed: 1, humanNation: 'fr', difficulty: 'easy' }))).toBe(AI_LEVELS.easy);
    const state = aiGame(1, 'fr');
    expect(aiLevel(state)).toBe(AI_LEVELS.normal);
    delete state.settings.difficulty;
    expect(aiLevel(state)).toBe(AI_LEVELS.normal);
  });

  it('easy opponents start no wars before their longer grace period', () => {
    // At normal, France and Italy, and Poland and Czechia, are at war by now in this seed.
    const state = createInitialState(world, { seed: 1, humanNation: 'fr', difficulty: 'easy' });
    run(state, AI_LEVELS.easy.peaceGraceSeconds - 5);
    expect(world.nationIds.flatMap((n) => atWarWith(state, n))).toEqual([]);
  });

  it('easy opponents do not gang up on a nation already at war', () => {
    // At normal, Italy joins Germany's war on France in this seed.
    const state = createInitialState(world, { seed: 1, humanNation: 'fr', difficulty: 'easy' });
    setWar(state, 'de', 'fr');
    run(state, 1500);
    expect(atWarWith(state, 'fr')).toEqual(['de']);
  });
});

describe('AI personalities', () => {
  it('each AI claims provinces across its land borders, drawn from the seed', () => {
    const drawn = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const state = createInitialState(world, { seed, humanNation: null });
      for (const n of world.nationIds) {
        const claims = state.nations[n].ai!.claims!;
        drawn.add(`${n}:${claims.join(',')}`);
        expect(new Set(claims).size).toBe(claims.length);
        for (const pid of claims) {
          expect(state.provinces[pid].owner).not.toBe(n);
          expect(world.neighbors[pid].some((c) => c.kind !== 'strait' && state.provinces[c.id].owner === n)).toBe(true);
        }
      }
      // An island power has no land border to claim across.
      expect(state.nations.uk.ai!.claims).toEqual([]);
    }
    expect(drawn.size).toBeGreaterThan(world.nationIds.length * 3);
  });

  it('openings vary from seed to seed', () => {
    const drawn = new Set<AiOpening | undefined>();
    for (let seed = 1; seed <= 10; seed++) {
      const state = createInitialState(world, { seed, humanNation: null });
      for (const n of world.nationIds) drawn.add(state.nations[n].ai!.opening);
    }
    expect([...drawn].sort()).toEqual(['build', 'expand', 'strike']);
  });

  it('an AI that opens by building keeps the peace longer than one that strikes', () => {
    const play = (opening: AiOpening) => {
      const state = createInitialState(world, { seed: 1, humanNation: null });
      for (const n of world.nationIds) state.nations[n].ai!.opening = opening;
      run(state, 715);
      return world.nationIds.flatMap((n) => atWarWith(state, n));
    };
    expect(play('strike').length).toBeGreaterThan(0);
    expect(play('build')).toEqual([]);
  });

  it('saves without claims or an opening still play', () => {
    const state = aiGame(4, 'fr');
    for (const n of world.nationIds) {
      delete state.nations[n].ai?.claims;
      delete state.nations[n].ai?.opening;
    }
    expect(() => run(state, 900)).not.toThrow();
  });
});

describe('AI military', () => {
  it('holds an occupied enemy province until the capture completes', () => {
    const state = aiGame(3);
    run(state, scaledTicks(state, AI.neutralGraceSeconds));
    setWar(state, 'fr', 'be');
    // Belgium has no army left and nothing to raise one with.
    clearArmies(state, 'be-brussels');
    state.provinces['be-brussels'].recruitQueue = [];
    state.nations.be.resources = { money: 0, materials: 0, fuel: 0, manpower: 0 };
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

  it('sees what its co-belligerents see once it has Liaison Officers', () => {
    const state = aiGame(5);
    setWar(state, 'fr', 'de');
    setWar(state, 'it', 'de');
    expect(buildContext(state, world, 'fr').seen.has('it-naples')).toBe(false);
    state.nations.fr.research.completed.push('liaisonOfficers');
    expect(buildContext(state, world, 'fr').seen.has('it-naples')).toBe(true);
  });
});
