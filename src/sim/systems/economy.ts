// Resource income, upkeep and shortages. Runs every tick.
import { ECONOMY } from '../config/rules';
import { pushEvent } from '../events';
import { nationEconomies, perTick } from '../queries';
import { RESOURCE_KEYS, type GameState } from '../types';
import type { World } from '../world';

export function economySystem(state: GameState, world: World): void {
  const economies = nationEconomies(state, world);
  for (const id of world.nationIds) {
    const nation = state.nations[id];
    if (nation.eliminated) continue;
    const eco = economies.get(id)!;
    for (const k of RESOURCE_KEYS) nation.resources[k] += perTick(eco.net[k], state);

    const moneyShort = nation.resources.money < 0;
    const fuelShort = nation.resources.fuel < 0;
    for (const k of RESOURCE_KEYS) if (nation.resources[k] < 0) nation.resources[k] = 0;

    if (moneyShort && !nation.shortages.money) {
      pushEvent(state, 'shortage', `Treasury empty: unpaid troops fight at ${Math.round(ECONOMY.unpaidCombatMult * 100)}%.`, {
        nations: [id],
        severity: 'bad',
      });
    }
    if (fuelShort && !nation.shortages.fuel) {
      pushEvent(state, 'shortage', `Out of fuel: tanks and motor vehicles move and fight at ${Math.round(ECONOMY.noFuelVehicleMult * 100)}%.`, {
        nations: [id],
        severity: 'bad',
      });
    }
    // Shortage clears once the stockpile recovers above zero.
    nation.shortages.money = moneyShort || (nation.shortages.money && nation.resources.money <= 0);
    nation.shortages.fuel = fuelShort || (nation.shortages.fuel && nation.resources.fuel <= 0);
  }
}
