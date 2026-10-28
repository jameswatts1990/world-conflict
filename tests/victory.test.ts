import { describe, expect, it } from 'vitest';
import { VICTORY } from '../src/sim/config/rules';
import { computeScores, heldVp, landShare, scaledTicks, vpToWin } from '../src/sim';
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
    const held = world.provinceIds.filter((id) => state.provinces[id].owner === s.nation);
    const cities = held.filter((id) => world.provinces[id].city).length;
    // The land round a city scores as one province, shared between its lands.
    const land = held.filter((id) => !world.provinces[id].city).reduce((t, id) => t + landShare(world, id), 0);
    expect(s.provinces).toBe(held.length);
    expect(s.score).toBeCloseTo(s.vp * VICTORY.score.perVp + cities * VICTORY.score.perCity + land * VICTORY.score.perLand + s.techs * VICTORY.score.perTech);
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

  it('a minor power never wins: not on objectives, on score or as the last power standing', () => {
    const objectives = quietGame();
    giveObjectives(objectives, 'be', vpToWin(world));
    run(objectives, scaledTicks(objectives, VICTORY.holdSeconds) + 10);
    expect(objectives.outcome).toBeNull();
    expect(objectives.victory.leader).toBeNull();

    const score = quietGame();
    for (const id of world.provinceIds) if (world.provinces[id].core !== 'fr') score.provinces[id].owner = 'be';
    score.settings.timeLimitTicks = 60;
    run(score, 60);
    expect(score.outcome?.scores[0].nation).toBe('be');
    expect(score.outcome?.winner).toBe('fr');

    // The last playable nation wins, though minor powers survive it.
    const standing = quietGame();
    standing.settings.humanNation = null;
    for (const id of world.provinceIds) standing.provinces[id].owner = id === 'it-rome' ? 'it' : 'nl';
    standing.provinces['be-brussels'].owner = 'be';
    run(standing, 10);
    expect(standing.outcome?.reason).toBe('lastStanding');
    expect(standing.outcome?.winner).toBe('it');
    expect(standing.nations.be.eliminated).toBe(false);
  });

  // A full 150-minute campaign: on CI it now takes over a minute, past the default 60 s test timeout.
  it('an all-AI campaign always reaches an outcome within the time limit', () => {
    const state = aiGame(11);
    run(state, state.settings.timeLimitTicks + 5);
    expect(state.outcome).not.toBeNull();
    expect(state.outcome!.tick).toBeLessThanOrEqual(state.settings.timeLimitTicks);
    // The AI actually played: wars, captures and research happened.
    expect(state.events.length).toBeGreaterThan(0);
    expect(world.nationIds.some((id) => state.nations[id].stats.provincesCaptured > 0)).toBe(true);
    expect(world.nationIds.every((id) => state.nations[id].research.completed.length > 0 || state.nations[id].eliminated)).toBe(true);
  }, 180000);
});
