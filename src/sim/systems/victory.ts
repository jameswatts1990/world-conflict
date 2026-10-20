// Elimination, objective victory and the campaign time limit.
import { VICTORY } from '../config/rules';
import { pushEvent } from '../events';
import { computeScores, heldVp, provincesOwnedBy, scaledTicks, vpToWin } from '../queries';
import type { GameState, NationId, OutcomeReason } from '../types';
import type { World } from '../world';

function finish(state: GameState, world: World, winner: NationId | null, reason: OutcomeReason): void {
  const scores = computeScores(state, world);
  state.outcome = { winner, reason, tick: state.tick, scores };
  const name = winner ? world.nations[winner].name : 'Nobody';
  const why: Record<OutcomeReason, string> = {
    objectives: 'by controlling the strategic objectives',
    timeLimit: 'on score when the campaign time limit was reached',
    lastStanding: 'as the last power standing',
    humanEliminated: 'after the player nation was eliminated',
  };
  pushEvent(state, 'outcome', `${name} wins ${why[reason]}.`, { severity: 'system' });
}

export function victorySystem(state: GameState, world: World): void {
  if (state.outcome) return;

  for (const id of world.nationIds) {
    const n = state.nations[id];
    if (n.eliminated) continue;
    if (provincesOwnedBy(state, world, id).length > 0) continue;
    n.eliminated = true;
    n.research.active = null;
    for (const aid of Object.keys(state.armies)) if (state.armies[aid].owner === id) delete state.armies[aid];
    for (const other of world.nationIds) {
      if (other === id) continue;
      state.nations[other].relations[id] = { status: 'peace', since: state.tick, truceUntil: Number.MAX_SAFE_INTEGER };
    }
    pushEvent(state, 'eliminated', `${world.nations[id].name} has been eliminated.`, { severity: 'bad' });
  }

  const human = state.settings.humanNation;
  if (human && state.nations[human].eliminated) {
    finish(state, world, computeScores(state, world)[0]?.nation ?? null, 'humanEliminated');
    return;
  }
  const alive = world.nationIds.filter((id) => !state.nations[id].eliminated);
  if (alive.length === 1) {
    finish(state, world, alive[0], 'lastStanding');
    return;
  }

  // Objective victory: hold the threshold continuously for the hold period.
  const need = vpToWin(world);
  let leader: NationId | null = null;
  let best = 0;
  for (const id of alive) {
    const vp = heldVp(state, world, id);
    if (vp > best) {
      best = vp;
      leader = id;
    }
  }
  if (leader && best >= need) {
    if (state.victory.leader !== leader) {
      state.victory = { leader, holdSince: state.tick };
      const secs = VICTORY.holdSeconds;
      pushEvent(
        state,
        'victory-warning',
        `${world.nations[leader].name} controls ${best} of ${world.totalVp} objective VP. Victory in ${secs}s unless an objective is retaken!`,
        { severity: 'system' },
      );
    } else if (state.tick - (state.victory.holdSince ?? state.tick) >= scaledTicks(state, VICTORY.holdSeconds)) {
      finish(state, world, leader, 'objectives');
      return;
    }
  } else if (state.victory.leader) {
    pushEvent(state, 'victory-averted', `${world.nations[state.victory.leader].name} no longer holds enough objectives.`, {
      severity: 'system',
    });
    state.victory = { leader: null, holdSince: null };
  }

  if (state.tick >= state.settings.timeLimitTicks) {
    finish(state, world, computeScores(state, world)[0]?.nation ?? null, 'timeLimit');
  }
}
