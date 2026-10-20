// War and peace between nations.
import { DIPLOMACY } from '../config/rules';
import { pushEvent } from '../events';
import { isArmyInTransit, scaledTicks } from '../queries';
import type { GameState, NationId } from '../types';
import type { World } from '../world';
import { withdrawArmy } from './territory';

export function declareWar(state: GameState, world: World, a: NationId, b: NationId): void {
  state.nations[a].relations[b] = { status: 'war', since: state.tick, truceUntil: 0 };
  state.nations[b].relations[a] = { status: 'war', since: state.tick, truceUntil: 0 };
  state.peaceOffers = state.peaceOffers.filter((o) => !((o.from === a && o.to === b) || (o.from === b && o.to === a)));
  pushEvent(state, 'war', `${world.nations[a].name} declared war on ${world.nations[b].name}!`, { severity: 'bad' });
}

export function makePeace(state: GameState, world: World, a: NationId, b: NationId): void {
  const truceUntil = state.tick + scaledTicks(state, DIPLOMACY.truceSeconds);
  state.nations[a].relations[b] = { status: 'peace', since: state.tick, truceUntil };
  state.nations[b].relations[a] = { status: 'peace', since: state.tick, truceUntil };
  state.peaceOffers = state.peaceOffers.filter((o) => !((o.from === a && o.to === b) || (o.from === b && o.to === a)));
  pushEvent(state, 'peace', `${world.nations[a].name} and ${world.nations[b].name} signed a peace treaty. Current borders stand.`, {
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
      pushEvent(state, 'peace-expired', `${world.nations[o.from].name}'s peace offer to ${world.nations[o.to].name} expired.`, {
        nations: [o.from, o.to],
      });
    }
    return false;
  });
}
