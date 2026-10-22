// War and peace between nations.
import { DIPLOMACY, MORALE } from '../config/rules';
import { pushEvent } from '../events';
import { isArmyInTransit, scaledTicks } from '../queries';
import { nationName, sentence } from '../text';
import type { GameState, NationId } from '../types';
import type { World } from '../world';
import { shockNation } from './civic';
import { withdrawArmy } from './territory';

/** `a` declares war on `b`: the aggressor's people grumble, the victim's rally. */
export function declareWar(state: GameState, world: World, a: NationId, b: NationId): void {
  state.nations[a].relations[b] = { status: 'war', since: state.tick, truceUntil: 0 };
  state.nations[b].relations[a] = { status: 'war', since: state.tick, truceUntil: 0 };
  shockNation(state, world, a, MORALE.declareWarShock);
  shockNation(state, world, b, MORALE.rallyShock);
  state.peaceOffers = state.peaceOffers.filter((o) => !((o.from === a && o.to === b) || (o.from === b && o.to === a)));
  pushEvent(state, 'war', `${sentence(nationName(world, a))} declared war on ${nationName(world, b)}!`, { severity: 'bad' });
}

export function makePeace(state: GameState, world: World, a: NationId, b: NationId): void {
  const truceUntil = state.tick + scaledTicks(state, DIPLOMACY.truceSeconds);
  state.nations[a].relations[b] = { status: 'peace', since: state.tick, truceUntil };
  state.nations[b].relations[a] = { status: 'peace', since: state.tick, truceUntil };
  state.peaceOffers = state.peaceOffers.filter((o) => !((o.from === a && o.to === b) || (o.from === b && o.to === a)));
  pushEvent(state, 'peace', `${sentence(nationName(world, a))} and ${nationName(world, b)} signed a peace treaty. Current borders stand.`, {
    severity: 'good',
  });
  // Armies standing in the other side's territory withdraw home.
  for (const id of Object.keys(state.armies).sort()) {
    const army = state.armies[id];
    if (isArmyInTransit(army)) continue;
    const owner = state.provinces[army.province].owner;
    if ((army.owner === a && owner === b) || (army.owner === b && owner === a)) withdrawArmy(state, world, army);
  }
  // Interrupted captures are reset.
  for (const id of world.provinceIds) {
    const p = state.provinces[id];
    if (p.capture && ((p.capture.by === a && p.owner === b) || (p.capture.by === b && p.owner === a))) p.capture = null;
  }
}

export function diplomacySystem(state: GameState, world: World): void {
  state.peaceOffers = state.peaceOffers.filter((o) => {
    const alive = !state.nations[o.from].eliminated && !state.nations[o.to].eliminated;
    if (alive && o.expiresAt > state.tick) return true;
    if (alive) {
      // An unanswered offer counts as a refusal: the offering side waits before asking again.
      state.nations[o.from].relations[o.to].peaceOfferAfter = state.tick + scaledTicks(state, DIPLOMACY.peaceRetrySeconds);
      pushEvent(state, 'peace-expired', `${sentence(nationName(world, o.from))}'s peace offer to ${nationName(world, o.to)} expired.`, {
        nations: [o.from, o.to],
      });
    }
    return false;
  });
}
