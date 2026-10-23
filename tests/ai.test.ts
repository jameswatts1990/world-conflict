import { describe, expect, it } from 'vitest';
import { aiGame, clearArmies, place, run, setWar } from './helpers';

describe('AI military', () => {
  it('holds an occupied enemy province until the capture completes', () => {
    const state = aiGame(3);
    // Belgium stands still (no AI, nothing in training) so only France moves.
    state.nations.be.controller = 'human';
    state.nations.be.ai = null;
    state.provinces['be-brussels'].recruitQueue = [];
    setWar(state, 'fr', 'be');
    clearArmies(state, 'be-brussels');
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
