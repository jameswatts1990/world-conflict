import { describe, expect, it } from 'vitest';
import { captureTicks, createInitialState, setAiOrderTrace, type AiOpening, type AiOrderTrace, type GameState } from '../src/sim';
import { AI_LEVELS, aiLevel } from '../src/sim/config/ai';
import { aiGame, clearArmies, place, run, setWar, world } from './helpers';

const atWarWith = (state: GameState, nation: string) => world.nationIds.filter((n) => state.nations[nation].relations[n]?.status === 'war');

describe('AI army control', () => {
  it('an army taking a province holds it until it falls', () => {
    // Walking out resets the capture; the AI used to pull such armies back to
    // its frontier and then send them in again, over and over.
    const state = aiGame(3, 'fr');
    clearArmies(state);
    const army = place(state, 'es', 'nt-portugal', { infantry: 3 });
    const orders: AiOrderTrace[] = [];
    setAiOrderTrace((t) => orders.push(t));
    try {
      run(state, captureTicks(state, world, 'nt-portugal') + 5);
    } finally {
      setAiOrderTrace(null);
    }
    expect(orders.filter((o) => o.armyId === army.id)).toEqual([]);
    expect(state.provinces['nt-portugal'].owner).toBe('es');
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
    // At normal, Germany and Poland are at war by now in this seed.
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
