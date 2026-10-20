import type { EventSeverity, GameState, NationId, ProvinceId } from './types';

export const MAX_EVENTS = 300;

export function pushEvent(
  state: GameState,
  kind: string,
  text: string,
  opts: { nations?: NationId[]; province?: ProvinceId; severity?: EventSeverity } = {},
): void {
  state.events.push({
    id: state.nextEventId++,
    tick: state.tick,
    kind,
    text,
    nations: opts.nations ?? [],
    province: opts.province,
    severity: opts.severity ?? 'info',
  });
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
}

/** Events a given nation can see (its own plus global announcements). */
export function eventsFor(state: GameState, nation: NationId | null) {
  return state.events.filter((e) => e.nations.length === 0 || (nation !== null && e.nations.includes(nation)));
}
