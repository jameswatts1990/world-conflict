// Resource income, upkeep and shortages. Runs every tick.
import { ECONOMY } from '../config/rules';
import { pushEvent } from '../events';
import { nationEconomies, perTick } from '../queries';
import { RESOURCE_KEYS, UPKEEP_KEYS, type GameState, type NationState, type UpkeepKey } from '../types';
import type { World } from '../world';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** What running out of each resource does, as the event that announces it says. */
export const SHORTAGE_TEXT: Record<UpkeepKey, string> = {
  money: `Treasury empty: unpaid troops fight at ${pct(ECONOMY.unpaidCombatMult)}.`,
  fuel: `Out of fuel: tanks and motor vehicles move and fight at ${pct(ECONOMY.noFuelVehicleMult)}.`,
  materials: `Out of materials: with no shells or spares, guns and armour fight at ${pct(ECONOMY.noMaterialsHeavyMult)} and other troops at ${pct(ECONOMY.noMaterialsMult)}.`,
  manpower: `Out of manpower: no replacements, so units regain no strength and their morale recovers at ${pct(ECONOMY.noManpowerMoraleRecovery)} speed.`,
};

export function isShort(nation: NationState, k: UpkeepKey): boolean {
  return nation.shortages[k] === true;
}

export function economySystem(state: GameState, world: World): void {
  const economies = nationEconomies(state, world);
  for (const id of world.nationIds) {
    const nation = state.nations[id];
    if (nation.eliminated) continue;
    const eco = economies.get(id)!;
    for (const k of RESOURCE_KEYS) nation.resources[k] += perTick(eco.net[k], state);

    // Fusion has no upkeep and never runs short: research waits for it instead.
    if (nation.resources.fusion < 0) nation.resources.fusion = 0;
    for (const k of UPKEEP_KEYS) {
      const ranOut = nation.resources[k] < 0;
      if (ranOut) nation.resources[k] = 0;
      if (ranOut && !isShort(nation, k)) pushEvent(state, 'shortage', SHORTAGE_TEXT[k], { nations: [id], severity: 'bad' });
      // A shortage clears once the stockpile recovers above zero.
      const short = ranOut || (isShort(nation, k) && nation.resources[k] <= 0);
      if (k === 'money' || k === 'fuel') nation.shortages[k] = short;
      // Materials and manpower are absent from older saves: absent is not short, so clear them with delete.
      else if (short) nation.shortages[k] = true;
      else delete nation.shortages[k];
    }
  }
}
