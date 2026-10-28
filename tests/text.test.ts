import { describe, expect, it } from 'vitest';
import { applyCommand, armyName, captureTicks, durationText, nationName, ownerName, provinceName, scaledTicks, sentence } from '../src/sim';
import { DIPLOMACY } from '../src/sim/config/rules';
import { clearArmies, place, quietGame, richen, run, setWar, world } from './helpers';

const texts = (state: ReturnType<typeof quietGame>, kind: string) => state.events.filter((e) => e.kind === kind).map((e) => e.text);

describe('names in messages', () => {
  it('uses "the" where English needs it', () => {
    expect(nationName(world, 'uk')).toBe('the United Kingdom');
    expect(sentence(nationName(world, 'uk'))).toBe('The United Kingdom');
    expect(nationName(world, 'fr')).toBe('France');
    // Each land round a city has a name of its own; the city province is named after its city.
    expect(provinceName(world, 'uk-midlands-ne')).toBe('the East Midlands');
    expect(provinceName(world, 'nl-amsterdam-ne')).toBe('Friesland');
    expect(provinceName(world, 'uk-midlands')).toBe('Birmingham');
    expect(nationName(world, 'nl')).toBe('the Netherlands');
    expect(ownerName(world, 'be', 'be-brussels')).toBe('Belgium & Luxembourg');
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
    expect(texts(state, 'capture')).toContain('Germany captured London from the United Kingdom (objective, 3 VP).');
    clearArmies(state, 'uk-london');
    place(state, 'uk', 'uk-london', { infantry: 3 });
    run(state, 60);
    expect(texts(state, 'capture')).toContain('The United Kingdom liberated London from Germany (objective, 3 VP).');
  });

  it('a land is named for itself when it falls and when it is retaken', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'nl');
    place(state, 'fr', 'nl-amsterdam-ne', { infantry: 3 });
    run(state, captureTicks(state, world, 'nl-amsterdam-ne') + 1);
    expect(texts(state, 'capture')).toEqual(['France captured Friesland from the Netherlands.']);
    place(state, 'fr', 'nl-amsterdam', { infantry: 3 });
    run(state, captureTicks(state, world, 'nl-amsterdam') + 1);
    expect(texts(state, 'capture').at(-1)).toBe('France captured Amsterdam from the Netherlands (objective, 1 VP).');
    // The Netherlands still holds Brabant & Holland, so it fights on.
    clearArmies(state, 'nl-amsterdam-ne');
    place(state, 'nl', 'nl-amsterdam-ne', { infantry: 3 });
    run(state, captureTicks(state, world, 'nl-amsterdam-ne') + 1);
    expect(texts(state, 'capture').at(-1)).toBe('The Netherlands liberated Friesland from France.');
  });

  it('battles name the attacker first, and a battle stopped by peace has no winner', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    place(state, 'de', 'be-brussels', { infantry: 3 });
    place(state, 'fr', 'be-brussels', { infantry: 3 });
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
    place(state, 'de', 'be-brussels', { infantry: 3 });
    place(state, 'fr', 'be-brussels', { infantry: 3 });
    const uk = place(state, 'uk', 'be-brussels', { infantry: 1 });
    run(state, 11);
    expect(texts(state, 'battle')).toEqual(['Battle of Brussels: Germany vs France.']);
    expect(state.battles['be-brussels'].owners).not.toContain('uk');
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

  it('losses name who suffered them, even a minor power', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'nl');
    place(state, 'nl', 'nl-amsterdam', { infantry: 1 });
    place(state, 'fr', 'nl-amsterdam', { infantry: 6, artillery: 2 });
    run(state, 200);
    // The army fights to the last man.
    const lost = state.events.find((e) => e.kind === 'army-destroyed')!;
    expect(lost.text).toBe('The Netherlands lost the 2nd Army at Amsterdam.');
    expect(lost.subject).toBe('nl');
    const captured = state.events.find((e) => e.kind === 'capture')!;
    expect(captured.subject).toBe('nl');
  });

  it('recruits are reported by the nation\'s own design name', () => {
    const state = quietGame();
    richen(state, 'fr');
    applyCommand(state, world, { type: 'recruit', nation: 'fr', province: 'fr-paris', unitType: 'infantry' });
    run(state, state.provinces['fr-paris'].recruitQueue[0].remaining);
    expect(texts(state, 'recruitment')).toEqual(['Poilus ready in Paris.']);
  });

  it('withdrawals name the army', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'de-ruhr', { infantry: 1 });
    state.nations.fr.relations.de.since = state.nations.de.relations.fr.since = -scaledTicks(state, DIPLOMACY.minWarSecondsBeforePeace);
    applyCommand(state, world, { type: 'offerPeace', nation: 'fr', target: 'de' });
    applyCommand(state, world, { type: 'respondPeace', nation: 'de', from: 'fr', accept: true });
    expect(texts(state, 'withdraw')).toEqual([`The ${armyName(world, army)} withdrew from Essen to Champagne.`]);
  });

  it('war and peace record who acted and who it concerns', () => {
    const state = quietGame();
    applyCommand(state, world, { type: 'declareWar', nation: 'de', target: 'pl' });
    const war = state.events.find((e) => e.kind === 'war')!;
    expect([war.actor, war.subject]).toEqual(['de', 'pl']);
  });

  it('the defender is named last when invading', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'uk', 'nl');
    place(state, 'nl', 'nl-amsterdam', { infantry: 1 });
    place(state, 'uk', 'nl-amsterdam', { infantry: 4 });
    run(state, 11);
    expect(texts(state, 'battle')).toEqual(['Battle of Amsterdam: the United Kingdom vs the Netherlands.']);
  });
});
