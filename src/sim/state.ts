// Creates the initial GameState for a scenario.
import { AI } from './config/ai';
import { POWERS } from './config/powers';
import { MORALE } from './config/rules';
import { SPEED_PRESETS, TICKS_PER_MINUTE } from './config/timing';
import { VETERANCY } from './config/units';
import { pushEvent } from './events';
import { unitMoraleCap } from './queries';
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

export const SCHEMA_VERSION = 5;

export interface NewGameOptions {
  seed: number;
  humanNation: NationId | null;
  speed?: 'standard' | 'slow';
}

export function newId(state: GameState, prefix: string): string {
  return `${prefix}${state.nextId++}`;
}

/** Next formation number for an owner's unit type (or 'army'). */
export function nextSerial(state: GameState, owner: OwnerId, kind: UnitType | 'army'): number {
  const key = `${owner}:${kind}`;
  state.serials[key] = (state.serials[key] ?? 0) + 1;
  return state.serials[key];
}

export interface NewUnitOptions {
  strength?: number;
  xp?: number;
  /** Defaults to the owner's current unit morale cap. */
  morale?: number;
}

export function createUnit(state: GameState, owner: OwnerId, type: UnitType, opts: NewUnitOptions = {}): Unit {
  return {
    id: newId(state, 'u'),
    type,
    strength: opts.strength ?? 1,
    morale: opts.morale ?? unitMoraleCap(state, owner),
    xp: opts.xp ?? 0,
    serial: nextSerial(state, owner, type),
  };
}

export function createArmy(state: GameState, owner: OwnerId, province: ProvinceId, units: Unit[]): Army {
  const army: Army = {
    id: newId(state, 'a'),
    owner,
    serial: nextSerial(state, owner, 'army'),
    province,
    units,
    move: null,
    supplied: true,
    unsuppliedTicks: 0,
    arrivedVia: null,
    autoRetreat: false,
    holding: false,
  };
  state.armies[army.id] = army;
  return army;
}

export function createInitialState(world: World, opts: NewGameOptions): GameState {
  if (opts.humanNation !== null) {
    const human = world.nations[opts.humanNation];
    if (!human) throw new Error(`Unknown nation ${opts.humanNation}`);
    if (!POWERS[human.power].playable) throw new Error(`${human.name} is a ${POWERS[human.power].name.toLowerCase()} and is always computer-controlled`);
  }
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
    serials: {},
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
      morale: MORALE.start,
      tier: p.tier,
      growth: 0,
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
      resources: { ...POWERS[n.power].startingResources },
      research: { completed: [...scenario.startingTechs], active: [], queue: [] },
      relations,
      eliminated: false,
      shortages: { money: false, fuel: false },
      morale: MORALE.start,
      // Personalities are drawn from the seeded RNG so each seed plays differently.
      ai: isHuman
        ? null
        : {
            aggression: AI.personality.aggression.min + random(state) * AI.personality.aggression.span,
            economyBias: AI.personality.economyBias.min + random(state) * AI.personality.economyBias.span,
            doctrine: AI.personality.doctrines[Math.floor(random(state) * AI.personality.doctrines.length)],
            nextThinkTick: Math.floor(random(state) * AI.thinkIntervalSeconds),
            campaigns: [],
          },
      stats: { provincesCaptured: 0, unitsLost: 0, unitsDestroyed: 0, retreats: 0 },
    };
  }

  for (const sa of scenario.startingArmies) {
    const units: Unit[] = [];
    for (const t of UNIT_TYPES) {
      for (let i = 0; i < (sa.units[t] ?? 0); i++) units.push(createUnit(state, sa.owner, t, { xp: VETERANCY.startingXp }));
    }
    createArmy(state, sa.owner, sa.province, units);
  }

  pushEvent(
    state,
    'start',
    'The campaign begins. The powers hold modern borders with Great War arsenals.',
    { severity: 'system' },
  );
  return state;
}
