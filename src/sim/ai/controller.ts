// Computer opponents. The AI reads the game state and acts only by issuing the
// same validated commands a human player would. It is deterministic: all
// randomness comes from the seeded game RNG.
import { AI } from '../config/ai';
import { scaledTicks } from '../queries';
import type { GameState, NationId } from '../types';
import type { World } from '../world';
import { buildContext, observeForces } from './context';
import { handleDiplomacy } from './diplomacy';
import { handleConstruction, handleResearch } from './economy';
import { handleMilitary } from './military';
import { handleRecruitment } from './recruitment';

export { nationPower } from './context';

export function runAi(state: GameState, world: World, me: NationId): void {
  const nation = state.nations[me];
  if (!nation.ai || nation.eliminated || state.outcome) return;
  if (state.tick < nation.ai.nextThinkTick) return;
  nation.ai.nextThinkTick = state.tick + scaledTicks(state, AI.thinkIntervalSeconds);

  observeForces(state, world, me);
  handleDiplomacy(buildContext(state, world, me));
  const ctx = buildContext(state, world, me);
  handleResearch(ctx);
  handleConstruction(ctx);
  handleRecruitment(ctx);
  handleMilitary(buildContext(state, world, me));
}
