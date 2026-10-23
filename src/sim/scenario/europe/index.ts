import type { ScenarioDef } from '../../types';
import { buildConnections } from '../build';
import { CONNECTIONS } from './connections';
import { NATIONS } from './nations';
import { PROVINCES, ROWS } from './provinces';
import { STARTING_ARMIES, STARTING_BUILDINGS } from './setup';

export const EUROPE_SCENARIO: ScenarioDef = {
  id: 'europe-modern-borders',
  name: 'European Theatre — Modern Borders, 1914 Technology',
  nations: NATIONS,
  provinces: PROVINCES,
  connections: buildConnections(ROWS, CONNECTIONS),
  startingBuildings: STARTING_BUILDINGS,
  startingArmies: STARTING_ARMIES,
  startingTechs: [],
};
