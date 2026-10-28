// One all-AI campaign, played and recorded for the balance reports. It is sampled once a
// game-minute without touching the game, so a recorded campaign plays exactly as an
// unrecorded one. Nations, tiers, unit types and buildings all come from the scenario and
// config, so new countries and content show up in the reports with no change here.
import type { BuildingType, GameState, NationId, PowerTier, ProvinceId, UnitType } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import type { Sim } from './sim';

export interface NationRecord {
  tier: PowerTier;
  /** Whether a human may play it (playable nations). */
  playable: boolean;
  /** The personality drawn for its AI. */
  personality: { aggression: number; economyBias: number; doctrine: string } | null;
  /** Line on the final score table (1 = top). */
  rank: number;
  score: number;
  vp: number;
  provinces: number;
  peakProvinces: number;
  /** Minute it was knocked out, or null if it lasted. */
  eliminatedAt: number | null;
  /** Technologies completed. */
  techs: string[];
  /** Units raised during the campaign, and units lost (destroyed or stood down), by type. */
  recruited: Partial<Record<UnitType, number>>;
  lost: Partial<Record<UnitType, number>>;
  /** Most levels of each building held at once (sampled every ten minutes). */
  buildings: Partial<Record<BuildingType, number>>;
  /** Most units fielded at once. */
  peakUnits: number;
  stats: { provincesCaptured: number; unitsLost: number; unitsDestroyed: number; retreats: number };
}

export interface GameEventRecord {
  minute: number;
  /** A war declared (actor on subject), peace signed, or a province taken (by actor from subject). */
  kind: 'war' | 'peace' | 'capture';
  actor: string;
  subject: string;
  province?: ProvinceId;
}

export interface GameRecord {
  seed: number;
  /** Game minutes played. */
  minutes: number;
  winner: NationId | null;
  reason: string | null;
  nations: Record<NationId, NationRecord>;
  /** Sampled at the end of every minute (index = minute - 1); zero once a nation is out. */
  series: Record<'vp' | 'provinces' | 'power' | 'techs', Record<NationId, number[]>>;
  events: GameEventRecord[];
  activity: {
    battles: number;
    /** Withdrawals under fire. */
    withdrawals: number;
    cityGrowth: number;
    disbands: number;
    largestArmy: number;
    /** Pairs of nations at war, summed over minutes. */
    warMinutes: number;
    /** Events that scrolled out of the game's log between samples (should stay 0). */
    eventsMissed: number;
  };
  wallMs: number;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

function unitsByOwner(state: GameState): Map<string, { owner: string; type: UnitType }> {
  const units = new Map<string, { owner: string; type: UnitType }>();
  for (const army of Object.values(state.armies)) for (const u of army.units) units.set(u.id, { owner: army.owner, type: u.type });
  return units;
}

/** Plays one campaign to its end, or for at most `maxMinutes` game-minutes (0: no cap). */
export function playGame(sim: Sim, world: World, seed: number, maxMinutes: number): GameRecord {
  const started = performance.now();
  const { api, config } = sim;
  const game = new api.Simulation(world, api.createInitialState(world, { seed, humanNation: null }));
  const state = game.state;
  const ids = world.nationIds;
  const nations: Record<NationId, NationRecord> = {};
  const series: GameRecord['series'] = { vp: {}, provinces: {}, power: {}, techs: {} };
  for (const id of ids) {
    const ai = state.nations[id].ai;
    const tier = world.nations[id].power;
    nations[id] = {
      tier,
      playable: config.POWERS[tier].playable,
      personality: ai ? { aggression: round3(ai.aggression), economyBias: round3(ai.economyBias), doctrine: ai.doctrine } : null,
      rank: 0,
      score: 0,
      vp: 0,
      provinces: 0,
      peakProvinces: 0,
      eliminatedAt: null,
      techs: [],
      recruited: {},
      lost: {},
      buildings: {},
      peakUnits: 0,
      stats: { provincesCaptured: 0, unitsLost: 0, unitsDestroyed: 0, retreats: 0 },
    };
    for (const key of ['vp', 'provinces', 'power', 'techs'] as const) series[key][id] = [];
  }
  const events: GameEventRecord[] = [];
  const activity: GameRecord['activity'] = { battles: 0, withdrawals: 0, cityGrowth: 0, disbands: 0, largestArmy: 0, warMinutes: 0, eventsMissed: 0 };
  let units = unitsByOwner(state);
  let owners = new Map(world.provinceIds.map((p) => [p, state.provinces[p].owner]));
  let lastEvent = state.nextEventId - 1;

  const sampleBuildings = () => {
    const held = new Map<string, Partial<Record<BuildingType, number>>>();
    for (const pid of world.provinceIds) {
      const p = state.provinces[pid];
      const mine = held.get(p.owner) ?? {};
      for (const [b, lvl] of Object.entries(p.buildings) as [BuildingType, number][]) mine[b] = (mine[b] ?? 0) + lvl;
      held.set(p.owner, mine);
    }
    for (const [owner, counts] of held) {
      const rec = nations[owner];
      if (!rec) continue;
      for (const [b, n] of Object.entries(counts) as [BuildingType, number][]) rec.buildings[b] = Math.max(rec.buildings[b] ?? 0, n);
    }
  };

  const lastMinute = maxMinutes > 0 ? maxMinutes : Infinity;
  for (let m = 1; m <= lastMinute && !state.outcome; m++) {
    game.run(60);
    if (state.events.length > 0 && state.events[0].id > lastEvent + 1) activity.eventsMissed += state.events[0].id - lastEvent - 1;
    for (const e of state.events) {
      if (e.id <= lastEvent) continue;
      if ((e.kind === 'war' || e.kind === 'peace') && e.actor && e.subject) {
        events.push({ minute: Math.round((e.tick / 60) * 10) / 10, kind: e.kind, actor: e.actor, subject: e.subject });
      } else if (e.kind === 'battle') activity.battles++;
      else if (e.kind === 'rout') activity.withdrawals++;
      else if (e.kind === 'city-growth') activity.cityGrowth++;
      else if (e.kind === 'disband') activity.disbands++;
    }
    lastEvent = state.nextEventId - 1;

    for (const pid of world.provinceIds) {
      const now = state.provinces[pid].owner;
      const before = owners.get(pid)!;
      if (now !== before) events.push({ minute: m, kind: 'capture', actor: now, subject: before, province: pid });
    }
    owners = new Map(world.provinceIds.map((p) => [p, state.provinces[p].owner]));

    const current = unitsByOwner(state);
    for (const [uid, u] of current) {
      if (units.has(uid) || !nations[u.owner]) continue;
      nations[u.owner].recruited[u.type] = (nations[u.owner].recruited[u.type] ?? 0) + 1;
    }
    for (const [uid, u] of units) {
      if (current.has(uid) || !nations[u.owner]) continue;
      nations[u.owner].lost[u.type] = (nations[u.owner].lost[u.type] ?? 0) + 1;
    }
    units = current;
    const fielded = new Map<string, number>();
    for (const army of Object.values(state.armies)) {
      fielded.set(army.owner, (fielded.get(army.owner) ?? 0) + army.units.length);
      activity.largestArmy = Math.max(activity.largestArmy, army.units.length);
    }

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) if (api.atWar(state, ids[i], ids[j])) activity.warMinutes++;
    }
    for (const id of ids) {
      const n = state.nations[id];
      const rec = nations[id];
      if (n.eliminated && rec.eliminatedAt === null) rec.eliminatedAt = m;
      const provinces = n.eliminated ? 0 : world.provinceIds.filter((p) => state.provinces[p].owner === id).length;
      rec.peakProvinces = Math.max(rec.peakProvinces, provinces);
      rec.peakUnits = Math.max(rec.peakUnits, fielded.get(id) ?? 0);
      series.vp[id].push(n.eliminated ? 0 : api.heldVp(state, world, id));
      series.provinces[id].push(provinces);
      series.power[id].push(n.eliminated ? 0 : Math.round(api.nationPower(state, id)));
      series.techs[id].push(n.research.completed.length);
    }
    if (m % 10 === 0) sampleBuildings();
  }
  sampleBuildings();

  const scores = state.outcome?.scores ?? api.computeScores(state, world);
  scores.forEach((line, i) => {
    const rec = nations[line.nation];
    rec.rank = i + 1;
    rec.score = line.score;
    rec.vp = line.vp;
    rec.provinces = line.provinces;
  });
  for (const id of ids) {
    nations[id].techs = [...state.nations[id].research.completed];
    nations[id].stats = { ...state.nations[id].stats };
  }
  return {
    seed,
    minutes: Math.round((state.tick / 60) * 10) / 10,
    winner: state.outcome?.winner ?? null,
    reason: state.outcome?.reason ?? null,
    nations,
    series,
    events,
    activity,
    wallMs: Math.round(performance.now() - started),
  };
}
