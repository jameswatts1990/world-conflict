import { describe, expect, it } from 'vitest';
import { AI } from '../src/sim/config/ai';
import { scaledTicks } from '../src/sim';
import { aiGame, clearArmies, place, run, setWar } from './helpers';

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
