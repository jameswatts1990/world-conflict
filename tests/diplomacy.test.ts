import { describe, expect, it } from 'vitest';
import { DIPLOMACY } from '../src/sim/config/rules';
import { applyCommand, checkOfferPeace, scaledTicks } from '../src/sim';
import { aiGame, quietGame, run, setWar, world } from './helpers';

function atWarForAWhile() {
  const state = quietGame();
  setWar(state, 'fr', 'de');
  run(state, scaledTicks(state, DIPLOMACY.minWarSecondsBeforePeace));
  return state;
}

describe('peace talks', () => {
  it('cannot open before the war has lasted the minimum time, and says how long is left', () => {
    const state = quietGame();
    setWar(state, 'fr', 'de');
    const r = checkOfferPeace(state, world, 'fr', 'de');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/to go/);
  });

  it('a rejected offer cannot be repeated until the retry delay has passed', () => {
    const state = atWarForAWhile();
    expect(applyCommand(state, world, { type: 'offerPeace', nation: 'fr', target: 'de' }).ok).toBe(true);
    expect(applyCommand(state, world, { type: 'respondPeace', nation: 'de', from: 'fr', accept: false }).ok).toBe(true);
    const again = checkOfferPeace(state, world, 'fr', 'de');
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toMatch(/Germany turned down your last offer/);
    // The other side may still propose.
    expect(checkOfferPeace(state, world, 'de', 'fr').ok).toBe(true);
    run(state, scaledTicks(state, DIPLOMACY.peaceRetrySeconds));
    expect(checkOfferPeace(state, world, 'fr', 'de').ok).toBe(true);
  });

  it('an ignored offer expires and counts as a refusal', () => {
    const state = atWarForAWhile();
    applyCommand(state, world, { type: 'offerPeace', nation: 'fr', target: 'de' });
    run(state, scaledTicks(state, DIPLOMACY.peaceOfferExpirySeconds) + 1);
    expect(state.peaceOffers).toHaveLength(0);
    expect(state.events.some((e) => e.kind === 'peace-expired')).toBe(true);
    expect(checkOfferPeace(state, world, 'fr', 'de').ok).toBe(false);
  });

  it('accepting makes peace and starts a truce', () => {
    const state = atWarForAWhile();
    applyCommand(state, world, { type: 'offerPeace', nation: 'de', target: 'fr' });
    applyCommand(state, world, { type: 'respondPeace', nation: 'fr', from: 'de', accept: true });
    expect(state.nations.fr.relations.de.status).toBe('peace');
    const war = applyCommand(state, world, { type: 'declareWar', nation: 'fr', target: 'de' });
    expect(war.ok).toBe(false);
    if (!war.ok) expect(war.reason).toMatch(/truce/i);
  });

  it('computer opponents do not flood an unresponsive player with offers', () => {
    // A passive human at war with every AI: offers expire unanswered.
    const state = aiGame(5, 'fr');
    for (const id of world.nationIds) if (id !== 'fr') applyCommand(state, world, { type: 'declareWar', nation: 'fr', target: id });
    run(state, 60 * 60);
    const offers = state.events.filter((e) => e.kind === 'peace-offer' && e.nations.includes('fr'));
    const perNation = new Map<string, number[]>();
    for (const e of offers) perNation.set(e.nations[0], [...(perNation.get(e.nations[0]) ?? []), e.tick]);
    const minGap = scaledTicks(state, DIPLOMACY.peaceOfferExpirySeconds + DIPLOMACY.peaceRetrySeconds);
    for (const ticks of perNation.values()) {
      for (let i = 1; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1]).toBeGreaterThanOrEqual(minGap);
    }
  });
});
