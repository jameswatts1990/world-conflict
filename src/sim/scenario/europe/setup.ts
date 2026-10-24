// Starting buildings and armies, generated from each nation's power tier and
// the province rows (see src/sim/scenario/build.ts). Every great power gets the
// same template: capital 3 INF + 1 ART, industrial heartland 2 INF + 1 ART, plus
// 5 INF and 1 cavalry in the field. The original six place their field units by
// hand on the rows; Hungary's are dealt out over its border provinces.
import { buildStartingSetup } from '../build';
import { CONNECTIONS } from './connections';
import { LAND, LINKS } from './land';
import { NATIONS } from './nations';
import { ROWS } from './provinces';

export const { startingBuildings: STARTING_BUILDINGS, startingArmies: STARTING_ARMIES } = buildStartingSetup(ROWS, NATIONS, CONNECTIONS, LAND, LINKS);
