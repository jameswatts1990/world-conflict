// What the AI behaviour report (ai-report.ts) counts as the interior, on its own so tests can check it.
import { cityOf, landsOf, type GameState, type OwnerId, type ProvinceId, type World } from '../../src/sim';

/**
 * In the interior: the province and every land of its region (the city's lands, for a city or a land round one;
 * land with no city stands alone) are the owner's, and none of them has a foreign neighbour. A city's only
 * neighbours are its own lands, so without the region a city on the front line would never count as on the border.
 */
export function isInterior(world: World, state: GameState, pid: ProvinceId, owner: OwnerId): boolean {
  return [pid, ...landsOf(world, cityOf(world, pid) ?? pid)].every(
    (p) => state.provinces[p].owner === owner && world.neighbors[p].every((n) => state.provinces[n.id].owner === owner),
  );
}
