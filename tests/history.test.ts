import { describe, expect, it } from 'vitest';
import { INTERVALS } from '../src/sim/config/timing';
import { computeScores, deserializeGame, scaledTicks, serializeGame } from '../src/sim';
import { quietGame, run, world } from './helpers';

describe('score history for the results screen', () => {
  it('samples every nation at the start and at each interval', () => {
    const state = quietGame();
    const every = scaledTicks(state, INTERVALS.historySample);
    run(state, every * 2 + 1);
    expect(state.history?.map((h) => h.tick)).toEqual([0, every, every * 2]);
    const first = state.history![0];
    expect(Object.keys(first.nations).sort()).toEqual([...world.nationIds].sort());
    const fr = computeScores(state, world).find((l) => l.nation === 'fr')!;
    expect(state.history!.at(-1)!.nations.fr).toEqual([fr.score, fr.vp, fr.provinces]);
  });

  it('takes a last sample when the campaign ends, once per tick', () => {
    const state = quietGame();
    state.settings.timeLimitTicks = scaledTicks(state, INTERVALS.historySample) * 2;
    run(state, state.settings.timeLimitTicks + 5);
    expect(state.outcome).not.toBeNull();
    const ticks = state.history!.map((h) => h.tick);
    expect(ticks.at(-1)).toBe(state.outcome!.tick);
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it('survives a save, and saves from before it load without one', () => {
    const state = quietGame();
    run(state, scaledTicks(state, INTERVALS.historySample) + 1);
    const loaded = deserializeGame(serializeGame(state, 'test'), world.scenario.id).state;
    expect(loaded.history).toEqual(state.history);
    delete state.history;
    expect(deserializeGame(serializeGame(state, 'old'), world.scenario.id).state.history).toBeUndefined();
  });
});
