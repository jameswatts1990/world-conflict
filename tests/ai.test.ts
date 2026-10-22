import { describe, expect, it } from 'vitest';
import { AI } from '../src/sim/config/ai';
import { scaledTicks } from '../src/sim';
import { aiGame, clearArmies, place, run } from './helpers';

describe('AI military', () => {
  it('holds an occupied neutral province until the capture completes', () => {
    const state = aiGame(3);
    run(state, scaledTicks(state, AI.neutralGraceSeconds));
    clearArmies(state, 'nt-benelux');
    place(state, 'fr', 'nt-benelux', { infantry: 4 });
    for (let t = 0; t < 400 && state.provinces['nt-benelux'].owner === 'neutral'; t++) {
      run(state, 1);
      // Armies may merge or pass through, but the province is never left empty.
      const french = Object.values(state.armies).filter((a) => a.owner === 'fr' && a.province === 'nt-benelux');
      expect(french.length).toBeGreaterThan(0);
    }
    expect(state.provinces['nt-benelux'].owner).toBe('fr');
  });
});
