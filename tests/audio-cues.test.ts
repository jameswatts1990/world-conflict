import { describe, expect, it } from 'vitest';
import { applyCommand, pushEvent } from '../src/sim';
import { battleIntensity, cuesForEvents, eventCue, freshEvents } from '../src/audio/cues';
import { quietGame, world } from './helpers';

const latest = (state: ReturnType<typeof quietGame>) => state.events[state.events.length - 1];

describe('sound cues for game events', () => {
  it('war sounds the call to arms for the player and a report for other powers', () => {
    const state = quietGame();
    applyCommand(state, world, { type: 'declareWar', nation: 'de', target: 'fr' });
    expect(eventCue(latest(state), state, world, 'fr')).toBe('war');
    expect(eventCue(latest(state), state, world, 'de')).toBe('war');
    expect(eventCue(latest(state), state, world, 'uk')).toBe('report');
  });

  it('captures are good news for the new owner and bad news for the old one', () => {
    const state = quietGame();
    state.provinces['fr-east'].owner = 'de';
    pushEvent(state, 'capture', 'Germany captured Strasbourg.', { nations: ['de', 'fr'], province: 'fr-east', subject: 'fr' });
    expect(eventCue(latest(state), state, world, 'de')).toBe('capture.won');
    expect(eventCue(latest(state), state, world, 'fr')).toBe('capture.lost');
  });

  it('only the player hears their own research, construction and recruits', () => {
    const state = quietGame();
    pushEvent(state, 'research', 'Research complete.', { nations: ['it'] });
    expect(eventCue(latest(state), state, world, 'it')).toBe('research');
    expect(eventCue(latest(state), state, world, 'fr')).toBeNull();
  });

  it('the end of the campaign is a victory or a defeat depending on the winner', () => {
    const state = quietGame();
    state.outcome = { winner: 'pl', reason: 'timeLimit', tick: state.tick, scores: [] };
    pushEvent(state, 'outcome', 'Poland wins.', { severity: 'system' });
    expect(eventCue(latest(state), state, world, 'pl')).toBe('victory');
    expect(eventCue(latest(state), state, world, 'fr')).toBe('defeat');
  });

  it('a burst of events plays at most two sounds, most important first, and one musical call', () => {
    const state = quietGame();
    const from = state.nextEventId - 1;
    applyCommand(state, world, { type: 'declareWar', nation: 'de', target: 'fr' });
    pushEvent(state, 'research', 'Research complete.', { nations: ['fr'] });
    pushEvent(state, 'research', 'Research complete.', { nations: ['fr'] });
    state.provinces['de-baden'].owner = 'fr';
    pushEvent(state, 'capture', 'France captured Stuttgart.', { nations: ['fr', 'de'], province: 'de-baden', subject: 'de' });
    const cues = cuesForEvents(freshEvents(state, 'fr', from), state, world, 'fr');
    expect(cues).toEqual(['war', 'research']);
  });

  it('the distant fighting grows with the number of the player’s battles', () => {
    const state = quietGame();
    expect(battleIntensity(state, 'fr')).toBe(0);
    state.battles['fr-east'] = { province: 'fr-east', startedAt: 0, owners: ['fr', 'de'] };
    const one = battleIntensity(state, 'fr');
    state.battles['fr-nord'] = { province: 'fr-nord', startedAt: 0, owners: ['fr', 'uk'] };
    expect(battleIntensity(state, 'fr')).toBeGreaterThan(one);
    expect(battleIntensity(state, 'it')).toBe(0);
  });
});
