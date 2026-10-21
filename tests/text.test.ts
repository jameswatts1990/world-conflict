import { describe, expect, it } from 'vitest';
import { applyCommand, durationText, nationName, ownerName, provinceName, scaledTicks, sentence } from '../src/sim';
import { DIPLOMACY } from '../src/sim/config/rules';
import { clearArmies, place, quietGame, run, setWar, world } from './helpers';

const texts = (state: ReturnType<typeof quietGame>, kind: string) => state.events.filter((e) => e.kind === kind).map((e) => e.text);

describe('names in messages', () => {
  it('uses "the" where English needs it', () => {
    expect(nationName(world, 'uk')).toBe('the United Kingdom');
    expect(sentence(nationName(world, 'uk'))).toBe('The United Kingdom');
    expect(nationName(world, 'fr')).toBe('France');
    expect(provinceName(world, 'uk-midlands')).toBe('the Midlands');
    expect(provinceName(world, 'nt-netherlands')).toBe('the Netherlands');
    expect(ownerName(world, 'neutral', 'nt-netherlands')).toBe('the Netherlands');
    expect(ownerName(world, 'neutral', 'nt-benelux')).toBe('Belgium & Luxembourg');
  });

  it('formats durations', () => {
    expect(durationText(45)).toBe('45s');
    expect(durationText(120)).toBe('2m');
    expect(durationText(150.2)).toBe('2m 31s');
  });
});

describe('event wording', () => {
  it('war, capture and liberation read naturally', () => {
    const state = quietGame();
    clearArmies(state);
    applyCommand(state, world, { type: 'declareWar', nation: 'de', target: 'uk' });
    expect(texts(state, 'war')).toContain('Germany declared war on the United Kingdom!');
    place(state, 'de', 'uk-london', { infantry: 3 });
    run(state, 60);
    expect(texts(state, 'capture')).toContain('Germany captured London & the South East from the United Kingdom (objective, 3 VP).');
    clearArmies(state, 'uk-london');
    place(state, 'uk', 'uk-london', { infantry: 3 });
    run(state, 60);
    expect(texts(state, 'capture')).toContain('The United Kingdom liberated London & the South East from Germany (objective, 3 VP).');
  });

  it('occupying a neutral state names it once', () => {
    const state = quietGame();
    clearArmies(state);
    place(state, 'fr', 'nt-netherlands', { infantry: 3 });
    run(state, 40);
    expect(texts(state, 'capture')).toEqual(['France occupied the Netherlands (objective, 1 VP).']);
  });

  it('battles name the attacker first, and a battle stopped by peace has no winner', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    place(state, 'de', 'nt-benelux', { infantry: 3 });
    place(state, 'fr', 'nt-benelux', { infantry: 3 });
    run(state, 11);
    expect(texts(state, 'battle')).toEqual(['Battle of Brussels: Germany vs France.']);
    // Skip ahead to when peace talks may open, without fighting all that time.
    state.nations.fr.relations.de.since = state.nations.de.relations.fr.since = -scaledTicks(state, DIPLOMACY.minWarSecondsBeforePeace);
    applyCommand(state, world, { type: 'offerPeace', nation: 'fr', target: 'de' });
    applyCommand(state, world, { type: 'respondPeace', nation: 'de', from: 'fr', accept: true });
    run(state, 11);
    expect(texts(state, 'battle-end')).toEqual(['The Battle of Brussels ended.']);
  });

  it('a bystander at peace with both sides is not part of the battle', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    place(state, 'de', 'nt-benelux', { infantry: 3 });
    place(state, 'fr', 'nt-benelux', { infantry: 3 });
    const uk = place(state, 'uk', 'nt-benelux', { infantry: 1 });
    run(state, 11);
    expect(texts(state, 'battle')).toEqual(['Battle of Brussels: Germany vs France.']);
    expect(state.battles['nt-benelux'].owners).not.toContain('uk');
    delete state.armies[uk.id];
    state.nations.fr.relations.de.since = state.nations.de.relations.fr.since = -scaledTicks(state, DIPLOMACY.minWarSecondsBeforePeace);
    applyCommand(state, world, { type: 'offerPeace', nation: 'fr', target: 'de' });
    applyCommand(state, world, { type: 'respondPeace', nation: 'de', from: 'fr', accept: true });
    run(state, 11);
    expect(texts(state, 'battle-end')).toEqual(['The Battle of Brussels ended.']);
  });

  it('peace that sends the attacker home ends a battle without a victor', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    place(state, 'de', 'de-ruhr', { infantry: 3 });
    place(state, 'fr', 'de-ruhr', { infantry: 3 });
    run(state, 11);
    state.nations.fr.relations.de.since = state.nations.de.relations.fr.since = -scaledTicks(state, DIPLOMACY.minWarSecondsBeforePeace);
    applyCommand(state, world, { type: 'offerPeace', nation: 'fr', target: 'de' });
    applyCommand(state, world, { type: 'respondPeace', nation: 'de', from: 'fr', accept: true });
    run(state, 11);
    expect(texts(state, 'battle-end')).toEqual(['The Battle of Essen ended.']);
  });

  it('losses name who suffered them, even a neutral garrison', () => {
    const state = quietGame();
    clearArmies(state);
    place(state, 'neutral', 'nt-netherlands', { infantry: 1 });
    place(state, 'fr', 'nt-netherlands', { infantry: 6, artillery: 2 });
    run(state, 200);
    const lost = state.events.find((e) => e.kind === 'army-destroyed')!;
    expect(lost.text).toBe('The Netherlands lost an army at Amsterdam.');
    expect(lost.subject).toBe('neutral');
    const captured = state.events.find((e) => e.kind === 'capture')!;
    expect(captured.subject).toBe('neutral');
  });

  it('the defender is named last when invading', () => {
    const state = quietGame();
    clearArmies(state);
    place(state, 'neutral', 'nt-netherlands', { infantry: 1 });
    place(state, 'uk', 'nt-netherlands', { infantry: 4 });
    run(state, 11);
    expect(texts(state, 'battle')).toEqual(['Battle of Amsterdam: the United Kingdom vs the Netherlands.']);
  });
});
