// The tech lab: what each technology is worth, measured by experiment rather than by who
// happens to research it. Each seed's campaign is played to a set minute and snapshotted. From
// the snapshot, a control campaign plays on to the end, and so does one campaign per technology
// in which a test seat (a playable nation, rotating with the seed) is handed that technology on
// the spot. The difference in the test seat's result between the two, on the same seed, is
// what the technology was worth to it. Prerequisites are not handed over: this measures the
// technology's own effect. A seat that already has it at that minute is counted, not tested.
import type { GameState, NationId } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import type { Sim } from './sim';

export interface TechSettings {
  /** Game minute at which the technology is handed over. */
  at: number;
  /** Stop campaigns here if nothing has ended them first (0: play to the end). */
  minutes: number;
}

/** How the test seat ended a campaign. */
export interface SeatResult {
  /** Place among the playable nations (1 = top). */
  place: number;
  won: boolean;
  survived: boolean;
  provinces: number;
}

export interface TechSeedResult {
  seed: number;
  seat: NationId;
  control: SeatResult;
  /** Per technology: the seat's result with it handed over, or null if the seat already had it. */
  granted: Record<string, SeatResult | null>;
  /** Campaigns played (for progress). */
  played: number;
}

/** The playable nation tested on this seed: the nations take turns, skipping any already knocked out. */
export function testSeat(state: GameState, playable: NationId[], seed: number): NationId | null {
  for (let i = 0; i < playable.length; i++) {
    const id = playable[(seed + i) % playable.length];
    if (!state.nations[id].eliminated) return id;
  }
  return null;
}

/** Hands a technology to a nation as if its research had just finished (dropping it from its jobs and queue). */
export function grantTech(state: GameState, nation: NationId, tech: string): boolean {
  const r = state.nations[nation].research;
  if (r.completed.includes(tech)) return false;
  r.active = r.active.filter((j) => j.tech !== tech);
  r.queue = r.queue.filter((t) => t !== tech);
  r.completed.push(tech);
  return true;
}

function seatResult(sim: Sim, world: World, state: GameState, seat: NationId, playable: NationId[]): SeatResult {
  const scores = state.outcome?.scores ?? sim.api.computeScores(state, world);
  const order = scores.map((l) => l.nation).filter((id) => playable.includes(id));
  return {
    place: order.indexOf(seat) + 1,
    won: state.outcome?.winner === seat,
    survived: !state.nations[seat].eliminated,
    provinces: world.provinceIds.filter((p) => state.provinces[p].owner === seat).length,
  };
}

function finish(sim: Sim, world: World, snapshot: GameState, settings: TechSettings, change?: (state: GameState) => void): GameState {
  const game = new sim.api.Simulation(world, structuredClone(snapshot));
  change?.(game.state);
  const end = settings.minutes > 0 ? settings.minutes * 60 : Infinity;
  while (!game.state.outcome && game.state.tick < end) game.run(60);
  return game.state;
}

/** One seed: the shared opening, the control campaign, and one campaign per technology. */
export function runTechSeed(sim: Sim, world: World, seed: number, techs: string[], settings: TechSettings): TechSeedResult | null {
  const playable = world.nationIds.filter((id) => sim.config.POWERS[world.nations[id].power].playable);
  const opening = new sim.api.Simulation(world, sim.api.createInitialState(world, { seed, humanNation: null }));
  opening.run(settings.at * 60);
  const snapshot = opening.state;
  if (snapshot.outcome) return null;
  const seat = testSeat(snapshot, playable, seed);
  if (!seat) return null;
  const control = seatResult(sim, world, finish(sim, world, snapshot, settings), seat, playable);
  const granted: TechSeedResult['granted'] = {};
  let played = 1;
  for (const tech of techs) {
    if (snapshot.nations[seat].research.completed.includes(tech)) {
      granted[tech] = null;
      continue;
    }
    granted[tech] = seatResult(sim, world, finish(sim, world, snapshot, settings, (s) => grantTech(s, seat, tech)), seat, playable);
    played++;
  }
  return { seed, seat, control, granted, played };
}
