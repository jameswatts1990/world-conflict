// The race over time: every nation's score, objective VP and provinces held, sampled
// every few minutes (and once more at the end) for the results screen's chart.
import { computeScores } from '../queries';
import type { GameState, HistorySample } from '../types';
import type { World } from '../world';

export function historySystem(state: GameState, world: World): void {
  const nations = {} as HistorySample['nations'];
  for (const l of computeScores(state, world)) nations[l.nation] = [l.score, l.vp, l.provinces];
  const history = (state.history ??= []);
  // The final sample can fall on a regular one's tick: keep one per tick.
  if (history.at(-1)?.tick === state.tick) history.pop();
  history.push({ tick: state.tick, nations });
}
