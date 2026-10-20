import { describe, expect, it } from 'vitest';
import { VICTORY } from '../src/sim/config/rules';
import { computeScores, heldVp, scaledTicks, vpToWin } from '../src/sim';
import { aiGame, quietGame, run, world } from './helpers';

function giveObjectives(state: ReturnType<typeof quietGame>, nation: string, vp: number) {
  let held = heldVp(state, world, nation);
  for (const id of world.objectiveIds) {
    if (held >= vp) break;
    if (state.provinces[id].owner === nation) continue;
    state.provinces[id].owner = nation;
    held += world.provinces[id].objectiveVp!;
  }
}

describe('victory conditions', () => {
  it('objective victory requires holding the threshold for the hold period', () => {
    const state = quietGame();
    giveObjectives(state, 'fr', vpToWin(world));
    run(state, 10);
    expect(state.victory.leader).toBe('fr');
    expect(state.outcome).toBeNull();
    run(state, scaledTicks(state, VICTORY.holdSeconds) + 10);
    expect(state.outcome?.winner).toBe('fr');
    expect(state.outcome?.reason).toBe('objectives');
  });

  it('losing an objective during the hold period averts victory', () => {
    const state = quietGame();
    giveObjectives(state, 'fr', vpToWin(world));
    run(state, 10);
    const lost = world.objectiveIds.find((id) => state.provinces[id].owner === 'fr' && world.provinces[id].core !== 'fr')!;
    state.provinces[lost].owner = world.provinces[lost].core ?? 'neutral';
    run(state, scaledTicks(state, VICTORY.holdSeconds) + 10);
    expect(state.outcome).toBeNull();
    expect(state.victory.leader).toBeNull();
  });

  it('the time limit ends the campaign with the top score as winner', () => {
    const state = quietGame();
    state.provinces['de-ruhr'].owner = 'fr';
    state.settings.timeLimitTicks = 120;
    run(state, 119);
    expect(state.outcome).toBeNull();
    run(state, 1);
    expect(state.outcome?.reason).toBe('timeLimit');
    expect(state.outcome?.winner).toBe('fr');
    expect(state.outcome?.scores[0].nation).toBe('fr');
    const s = computeScores(state, world)[0];
    expect(s.score).toBe(s.vp * VICTORY.score.perVp + s.provinces * VICTORY.score.perProvince + s.techs * VICTORY.score.perTech);
  });

  it('eliminating the player ends the game as a loss', () => {
    const state = quietGame();
    for (const id of world.provinceIds) if (state.provinces[id].owner === 'fr') state.provinces[id].owner = 'de';
    run(state, 10);
    expect(state.nations.fr.eliminated).toBe(true);
    expect(state.outcome?.reason).toBe('humanEliminated');
    expect(state.outcome?.winner).not.toBe('fr');
  });

  it('the last nation standing wins', () => {
    const state = quietGame();
    state.settings.humanNation = null;
    for (const id of world.provinceIds) if (state.provinces[id].owner !== 'neutral') state.provinces[id].owner = 'it';
    run(state, 10);
    expect(state.outcome?.reason).toBe('lastStanding');
    expect(state.outcome?.winner).toBe('it');
  });

  it('an all-AI campaign always reaches an outcome within the time limit', () => {
    const state = aiGame(11);
    run(state, state.settings.timeLimitTicks + 5);
    expect(state.outcome).not.toBeNull();
    expect(state.outcome!.tick).toBeLessThanOrEqual(state.settings.timeLimitTicks);
    // The AI actually played: wars, captures and research happened.
    expect(state.events.length).toBeGreaterThan(0);
    expect(world.nationIds.some((id) => state.nations[id].stats.provincesCaptured > 0)).toBe(true);
    expect(world.nationIds.every((id) => state.nations[id].research.completed.length > 0 || state.nations[id].eliminated)).toBe(true);
  });
});
