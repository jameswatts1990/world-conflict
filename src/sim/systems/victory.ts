// Elimination, objective victory and the campaign time limit.
import { VICTORY } from '../config/rules';
import { pushEvent } from '../events';
import { historySystem } from './history';
import { computeScores, heldVp, isContender, provincesOwnedBy, scaledTicks, vpToWin } from '../queries';
import { durationText, nationName, sentence } from '../text';
import type { GameState, NationId, OutcomeReason } from '../types';
import type { World } from '../world';

function finish(state: GameState, world: World, winner: NationId | null, reason: OutcomeReason): void {
  const scores = computeScores(state, world);
  state.outcome = { winner, reason, tick: state.tick, scores };
  historySystem(state, world);
  const name = winner ? sentence(nationName(world, winner)) : 'Nobody';
  const human = state.settings.humanNation;
  const why: Record<OutcomeReason, string> = {
    objectives: 'by holding the strategic objectives',
    timeLimit: 'on score as the campaign time limit runs out',
    lastStanding: 'as the last power standing',
    humanEliminated: human ? `the campaign: ${nationName(world, human)} has fallen` : 'the campaign',
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
    n.research.active = [];
    n.research.queue = [];
    for (const aid of Object.keys(state.armies)) if (state.armies[aid].owner === id) delete state.armies[aid];
    for (const other of world.nationIds) {
      if (other === id) continue;
      state.nations[other].relations[id] = { status: 'peace', since: state.tick, truceUntil: Number.MAX_SAFE_INTEGER };
    }
    pushEvent(state, 'eliminated', `${sentence(nationName(world, id))} has been eliminated.`, { severity: 'bad' });
  }

  // Only great and major powers can win: minor powers are there to be conquered.
  const contenders = world.nationIds.filter((id) => !state.nations[id].eliminated && isContender(world, id));
  const topScorer = () => computeScores(state, world).find((s) => contenders.includes(s.nation))?.nation ?? null;
  const human = state.settings.humanNation;
  if (human && state.nations[human].eliminated) {
    finish(state, world, topScorer(), 'humanEliminated');
    return;
  }
  if (contenders.length <= 1) {
    finish(state, world, contenders[0] ?? null, 'lastStanding');
    return;
  }

  // Objective victory: hold the threshold continuously for the hold period.
  const need = vpToWin(world);
  let leader: NationId | null = null;
  let best = 0;
  for (const id of contenders) {
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
        `${sentence(nationName(world, leader))} holds ${best} of ${world.totalVp} objective VP: victory in ${durationText(secs)} unless an objective is retaken!`,
        { severity: 'system' },
      );
    } else if (state.tick - (state.victory.holdSince ?? state.tick) >= scaledTicks(state, VICTORY.holdSeconds)) {
      finish(state, world, leader, 'objectives');
      return;
    }
  } else if (state.victory.leader) {
    pushEvent(state, 'victory-averted', `${sentence(nationName(world, state.victory.leader))} no longer holds enough objectives. Victory averted.`, {
      severity: 'system',
    });
    state.victory = { leader: null, holdSince: null };
  }

  if (state.tick >= state.settings.timeLimitTicks) {
    finish(state, world, topScorer(), 'timeLimit');
  }
}
