import { describe, expect, it } from 'vitest';
import { captureTicks, setAiOrderTrace, type AiOrderTrace } from '../src/sim';
import { aiGame, clearArmies, place, run, world } from './helpers';

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
