// Fixed-timestep simulation driver. `stepState` advances exactly one tick
// (one game-second). Rendering frame rate never affects outcomes: clients
// decide *how many* ticks to run, never *how long* a tick is.
import { runAi } from './ai/controller';
import { applyCommand, type Command, type CommandResult } from './commands';
import { INTERVALS } from './config/timing';
import { scaledTicks } from './queries';
import { civicSystem } from './systems/civic';
import { combatSystem } from './systems/combat';
import { economySystem } from './systems/economy';
import { diplomacySystem } from './systems/diplomacy';
import { movementSystem } from './systems/movement';
import { constructionSystem, recruitmentSystem, researchSystem } from './systems/production';
import { armyConditionSystem, supplySystem } from './systems/supply';
import { captureSystem } from './systems/territory';
import { victorySystem } from './systems/victory';
import type { GameState } from './types';
import type { World } from './world';

export function stepState(state: GameState, world: World): void {
  if (state.outcome) return;
  const t = state.tick;
  const every = (seconds: number) => t % scaledTicks(state, seconds) === 0;

  economySystem(state, world);
  constructionSystem(state, world);
  recruitmentSystem(state, world);
  researchSystem(state, world);
  movementSystem(state, world);
  if (every(INTERVALS.supplyUpdate)) supplySystem(state, world);
  if (every(INTERVALS.combatRound)) combatSystem(state, world);
  captureSystem(state, world);
  if (every(INTERVALS.armyUpkeepStep)) armyConditionSystem(state, world);
  if (every(INTERVALS.civicUpdate)) civicSystem(state, world);
  diplomacySystem(state, world);
  for (const id of world.nationIds) {
    if (state.nations[id].controller === 'ai') runAi(state, world, id);
  }
  // `tick` counts completed ticks, so the time limit is reached once it hits the limit.
  state.tick = t + 1;
  if (every(INTERVALS.victoryCheck) || state.tick >= state.settings.timeLimitTicks) victorySystem(state, world);
}

export interface LoggedCommand {
  tick: number;
  command: Command;
}

/** Owns a game state, applies commands between ticks and records them for replay. */
export class Simulation {
  readonly log: LoggedCommand[] = [];

  constructor(
    readonly world: World,
    public state: GameState,
  ) {}

  /** Applies a command at the current tick boundary. */
  submit(command: Command): CommandResult {
    const result = applyCommand(this.state, this.world, command);
    if (result.ok) this.log.push({ tick: this.state.tick, command });
    return result;
  }

  step(): void {
    stepState(this.state, this.world);
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks && !this.state.outcome; i++) this.step();
  }
}

/** Re-runs a command log from an initial state (used to verify determinism). */
export function replay(world: World, initial: GameState, log: LoggedCommand[], ticks: number): GameState {
  const state = structuredClone(initial);
  let i = 0;
  for (let t = 0; t < ticks && !state.outcome; t++) {
    while (i < log.length && log[i].tick === state.tick) applyCommand(state, world, log[i++].command);
    stepState(state, world);
  }
  return state;
}
