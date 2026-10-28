// Which sound each game event makes for the player. Pure (no audio, no DOM), so the
// mapping can be tested; the recordings for each cue are listed in ./assets.
import { eventsFor, ownersBorder, type GameEvent, type GameState, type NationId, type OwnerId, type World } from '../sim';

export type CueId =
  | 'ui.click'
  | 'ui.tab'
  | 'ui.open'
  | 'ui.error'
  | 'army.select'
  | 'army.order'
  | 'report'
  | 'report.bad'
  | 'war'
  | 'peace'
  | 'research'
  | 'construction'
  | 'recruitment'
  | 'capture.won'
  | 'capture.lost'
  | 'battle'
  | 'rout'
  | 'campaign.start'
  | 'victory'
  | 'defeat';

export interface CueSpec {
  /** Gain before the effects volume, 0–1. */
  volume: number;
  /** Shortest gap between two plays of this cue, ms (keeps fast speeds from turning into noise). */
  cooldown: number;
  /** Random pitch spread, ± fraction, so repeats do not sound mechanical. */
  detune: number;
  /** When several events arrive together, the highest plays first. */
  priority: number;
  /** A musical call (bugle, fanfare): the music dips under it, and only one plays at a time. */
  stinger?: boolean;
}

export const CUES: Record<CueId, CueSpec> = {
  'ui.click': { volume: 0.45, cooldown: 40, detune: 0.04, priority: 0 },
  'ui.tab': { volume: 0.35, cooldown: 40, detune: 0.04, priority: 0 },
  'ui.open': { volume: 0.4, cooldown: 150, detune: 0.05, priority: 0 },
  'ui.error': { volume: 0.5, cooldown: 250, detune: 0, priority: 1 },
  'army.select': { volume: 0.5, cooldown: 80, detune: 0.06, priority: 1 },
  'army.order': { volume: 0.55, cooldown: 150, detune: 0.05, priority: 1 },
  report: { volume: 0.4, cooldown: 1500, detune: 0.03, priority: 2 },
  'report.bad': { volume: 0.6, cooldown: 1500, detune: 0.03, priority: 4 },
  recruitment: { volume: 0.5, cooldown: 1200, detune: 0.05, priority: 3 },
  construction: { volume: 0.55, cooldown: 1200, detune: 0.05, priority: 3 },
  research: { volume: 0.55, cooldown: 1500, detune: 0, priority: 5 },
  rout: { volume: 0.55, cooldown: 2500, detune: 0.04, priority: 5 },
  battle: { volume: 0.65, cooldown: 2500, detune: 0.08, priority: 6 },
  'capture.lost': { volume: 0.7, cooldown: 2500, detune: 0.03, priority: 7 },
  'capture.won': { volume: 0.6, cooldown: 2500, detune: 0, priority: 7, stinger: true },
  peace: { volume: 0.6, cooldown: 4000, detune: 0, priority: 8, stinger: true },
  war: { volume: 0.7, cooldown: 4000, detune: 0, priority: 9, stinger: true },
  'campaign.start': { volume: 0.6, cooldown: 4000, detune: 0, priority: 10, stinger: true },
  defeat: { volume: 0.75, cooldown: 10000, detune: 0, priority: 11, stinger: true },
  victory: { volume: 0.75, cooldown: 10000, detune: 0, priority: 11, stinger: true },
};

/** At most this many sounds per update, so a burst of reports stays legible. */
const MAX_PER_BATCH = 2;

/**
 * Whether another power's war or peace is news to the player (an alert, a sound): when one side borders
 * them, or both sides are great powers. Anything else stays in the field reports.
 */
export function concernsPlayer(state: GameState, world: World, human: NationId, e: GameEvent): boolean {
  const sides = [e.actor, e.subject].filter((n): n is OwnerId => !!n && !!world.nations[n as NationId]);
  if (sides.some((n) => ownersBorder(state, world, n, human))) return true;
  return sides.length === 2 && sides.every((n) => world.nations[n as NationId].power === 'great');
}

/** The sound one event makes for the human player, if any. */
export function eventCue(e: GameEvent, state: GameState, world: World, human: NationId): CueId | null {
  const ours = e.subject === human;
  switch (e.kind) {
    case 'war':
      return ours || e.actor === human ? 'war' : concernsPlayer(state, world, human, e) ? 'report' : null;
    case 'peace':
      return ours || e.actor === human ? 'peace' : concernsPlayer(state, world, human, e) ? 'report' : null;
    case 'peace-offer':
      return e.nations[0] !== human && e.nations.includes(human) ? 'report' : null;
    case 'peace-rejected':
      return ours ? 'report' : null;
    case 'research':
      return e.nations.includes(human) ? 'research' : null;
    case 'construction':
      return e.nations.includes(human) ? 'construction' : null;
    case 'recruitment':
      return e.nations.includes(human) ? 'recruitment' : null;
    case 'capture': {
      if (!e.province) return null;
      if (state.provinces[e.province].owner === human) return 'capture.won';
      if (ours) return 'capture.lost';
      return world.provinces[e.province].objectiveVp ? 'report' : null;
    }
    case 'battle':
    case 'intercept':
      return e.nations.includes(human) ? 'battle' : null;
    case 'rout':
      return e.nations.includes(human) ? 'rout' : null;
    case 'army-destroyed':
      return ours ? 'capture.lost' : null;
    case 'shortage':
      return e.nations.includes(human) ? 'report.bad' : null;
    case 'eliminated':
      return 'report.bad';
    case 'victory-warning':
      return state.victory.leader === human ? 'report' : 'report.bad';
    case 'victory-averted':
      return 'report';
    case 'outcome':
      return state.outcome?.winner === human ? 'victory' : 'defeat';
    default:
      return null;
  }
}

/** Sounds for a batch of new events, most important first: each cue once, one musical call at most. */
export function cuesForEvents(events: GameEvent[], state: GameState, world: World, human: NationId): CueId[] {
  const cues = new Set<CueId>();
  for (const e of events) {
    const cue = eventCue(e, state, world, human);
    if (cue) cues.add(cue);
  }
  const ranked = [...cues].sort((a, b) => CUES[b].priority - CUES[a].priority);
  const out: CueId[] = [];
  for (const cue of ranked) {
    if (CUES[cue].stinger && out.some((c) => CUES[c].stinger)) continue;
    out.push(cue);
    if (out.length === MAX_PER_BATCH) break;
  }
  return out;
}

/** New events the player can see since `afterId`. */
export function freshEvents(state: GameState, human: NationId, afterId: number): GameEvent[] {
  return eventsFor(state, human).filter((e) => e.id > afterId);
}

/** How loud the distant-battle ambience should be (0–1): louder with more of the player's battles. */
export function battleIntensity(state: GameState, human: NationId): number {
  let n = 0;
  for (const b of Object.values(state.battles)) if (b.owners.includes(human)) n++;
  return n === 0 ? 0 : Math.min(1, 0.45 + 0.2 * (n - 1));
}
