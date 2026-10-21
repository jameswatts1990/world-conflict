// Resource spending and refunds (the only places stockpiles are debited by orders).
import { RESOURCE_KEYS, type GameState, type NationId, type PartialResources } from './types';

export function spend(state: GameState, nation: NationId, cost: PartialResources): void {
  const r = state.nations[nation].resources;
  for (const k of RESOURCE_KEYS) r[k] -= cost[k] ?? 0;
}

export function refund(state: GameState, nation: NationId, cost: PartialResources, fraction: number): void {
  const r = state.nations[nation].resources;
  for (const k of RESOURCE_KEYS) r[k] += (cost[k] ?? 0) * fraction;
}
