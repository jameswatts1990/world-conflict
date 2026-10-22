import type { ScenarioDef } from '../../types';
import { CONNECTIONS } from './connections';
import { NATIONS } from './nations';
import { PROVINCES } from './provinces';
import { STARTING_ARMIES, STARTING_BUILDINGS, STARTING_RESOURCES } from './setup';

export const EUROPE_SCENARIO: ScenarioDef = {
  id: 'europe-modern-borders',
  name: 'European Theatre — Modern Borders, 1914 Technology',
  nations: NATIONS,
  provinces: PROVINCES,
  connections: CONNECTIONS,
  startingBuildings: STARTING_BUILDINGS,
  startingArmies: STARTING_ARMIES,
  startingResources: STARTING_RESOURCES,
  startingTechs: [],
};
