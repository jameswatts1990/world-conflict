// Creates the initial GameState for a scenario.
import { AI } from './config/ai';
import { SPEED_PRESETS, TICKS_PER_MINUTE } from './config/timing';
import { pushEvent } from './events';
import { random, seedToState } from './rng';
import {
  NEUTRAL,
  UNIT_TYPES,
  type Army,
  type GameState,
  type NationId,
  type NationState,
  type OwnerId,
  type ProvinceId,
  type ProvinceState,
  type Unit,
  type UnitType,
} from './types';
import type { World } from './world';

export const SCHEMA_VERSION = 1;

export interface NewGameOptions {
  seed: number;
  humanNation: NationId | null;
  speed?: 'standard' | 'slow';
}

export function newId(state: GameState, prefix: string): string {
  return `${prefix}${state.nextId++}`;
}

export function createUnit(state: GameState, type: UnitType, strength = 1): Unit {
  return { id: newId(state, 'u'), type, strength };
}

export function createArmy(state: GameState, owner: OwnerId, province: ProvinceId, units: Unit[]): Army {
  const army: Army = {
    id: newId(state, 'a'),
    owner,
    province,
    units,
    move: null,
    supplied: true,
    unsuppliedTicks: 0,
  };
  state.armies[army.id] = army;
  return army;
}

export function createInitialState(world: World, opts: NewGameOptions): GameState {
  const preset = SPEED_PRESETS[opts.speed ?? 'standard'];
  const scenario = world.scenario;
  const state: GameState = {
    schemaVersion: SCHEMA_VERSION,
    scenarioId: scenario.id,
    seed: opts.seed,
    rng: seedToState(opts.seed),
    tick: 0,
    settings: {
      speed: opts.speed ?? 'standard',
      durationScale: preset.durationScale,
      timeLimitTicks: preset.timeLimitMinutes * TICKS_PER_MINUTE * preset.durationScale,
      humanNation: opts.humanNation,
    },
    nations: {},
    provinces: {},
    armies: {},
    nextId: 1,
    peaceOffers: [],
    battles: {},
    events: [],
    nextEventId: 1,
    victory: { leader: null, holdSince: null },
    outcome: null,
  };

  for (const p of scenario.provinces) {
    const ps: ProvinceState = {
      id: p.id,
      owner: p.core ?? NEUTRAL,
      buildings: {},
      construction: null,
      recruitQueue: [],
      capture: null,
      supplied: true,
      ownerSince: 0,
    };
    state.provinces[p.id] = ps;
  }
  for (const sb of scenario.startingBuildings) {
    Object.assign(state.provinces[sb.province].buildings, sb.buildings);
  }

  for (const n of scenario.nations) {
    const relations: NationState['relations'] = {};
    for (const other of scenario.nations) {
      if (other.id !== n.id) relations[other.id] = { status: 'peace', since: 0, truceUntil: 0 };
    }
    const isHuman = n.id === opts.humanNation;
    state.nations[n.id] = {
      id: n.id,
      controller: isHuman ? 'human' : 'ai',
      resources: { ...scenario.startingResources },
      lastRates: { money: 0, materials: 0, fuel: 0, manpower: 0 },
      research: { completed: [], active: null },
      relations,
      eliminated: false,
      shortages: { money: false, fuel: false },
      // Personalities are drawn from the seeded RNG so each seed plays differently.
      ai: isHuman
        ? null
        : {
            aggression: 0.35 + random(state) * 0.6,
            economyBias: 0.3 + random(state) * 0.5,
            nextThinkTick: Math.floor(random(state) * AI.thinkIntervalSeconds),
          },
      stats: { provincesCaptured: 0, unitsLost: 0, unitsDestroyed: 0 },
    };
  }

  for (const sa of scenario.startingArmies) {
    const units: Unit[] = [];
    for (const t of UNIT_TYPES) for (let i = 0; i < (sa.units[t] ?? 0); i++) units.push(createUnit(state, t));
    createArmy(state, sa.owner, sa.province, units);
  }

  pushEvent(
    state,
    'start',
    'The campaign begins. Six powers hold modern borders with Great War arsenals. Neutral states stand between them.',
    { severity: 'system' },
  );
  return state;
}
