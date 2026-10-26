import { seedToState } from '../src/sim/rng';
import {
  EUROPE_SCENARIO,
  buildWorld,
  createArmy,
  createInitialState,
  createUnit,
  stepState,
  type Army,
  type GameState,
  type NationId,
  type OwnerId,
  type ProvinceId,
  type UnitType,
} from '../src/sim';

export const world = buildWorld(EUROPE_SCENARIO);

/**
 * New game with every nation under "human" control, i.e. no AI interference. The
 * random stream restarts after setup, so battles in tests roll the same dice however
 * many nations the scenario has (each AI personality drawn at setup would shift them).
 */
export function quietGame(seed = 42): GameState {
  const state = createInitialState(world, { seed, humanNation: 'fr' });
  for (const id of world.nationIds) {
    state.nations[id].controller = 'human';
    state.nations[id].ai = null;
  }
  state.rng = seedToState(seed);
  return state;
}

export function aiGame(seed = 7, human: NationId | null = null): GameState {
  return createInitialState(world, { seed, humanNation: human });
}

export function run(state: GameState, ticks: number): void {
  for (let i = 0; i < ticks; i++) stepState(state, world);
}

export function clearArmies(state: GameState, province?: ProvinceId): void {
  for (const id of Object.keys(state.armies)) {
    if (!province || state.armies[id].province === province) delete state.armies[id];
  }
}

/** Places a fresh army of trained regulars (or the given experience). */
export function place(state: GameState, owner: OwnerId, province: ProvinceId, units: Partial<Record<UnitType, number>>, xp = 1): Army {
  const list = [];
  for (const [type, n] of Object.entries(units) as [UnitType, number][]) {
    for (let i = 0; i < n; i++) list.push(createUnit(state, owner, type, { xp }));
  }
  return createArmy(state, owner, province, list);
}

export function setWar(state: GameState, a: NationId, b: NationId): void {
  state.nations[a].relations[b] = { status: 'war', since: state.tick, truceUntil: 0 };
  state.nations[b].relations[a] = { status: 'war', since: state.tick, truceUntil: 0 };
}

export function richen(state: GameState, nation: NationId): void {
  state.nations[nation].resources = { money: 100000, materials: 100000, fuel: 100000, manpower: 100000, fusion: 100000 };
}

/** The lands round a city, largest first. */
export function landsOf(city: ProvinceId): ProvinceId[] {
  return world.provinces[city].lands!;
}

/** Two linked lands, one round each city (the first such link in the scenario). */
export function linkBetween(a: ProvinceId, b: ProvinceId): [ProvinceId, ProvinceId] {
  for (const c of world.scenario.connections) {
    const [ra, rb] = [world.provinces[c.a].around, world.provinces[c.b].around];
    if (ra === a && rb === b) return [c.a, c.b];
    if (ra === b && rb === a) return [c.b, c.a];
  }
  throw new Error(`No link between the lands of ${a} and ${b}`);
}

/** A land round `city`: the one linked to a land round `toward`, or else its largest. */
export function landOf(city: ProvinceId, toward?: ProvinceId): ProvinceId {
  return toward ? linkBetween(city, toward)[0] : landsOf(city)[0];
}
