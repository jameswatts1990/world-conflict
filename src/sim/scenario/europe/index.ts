import type { ScenarioDef } from '../../types';
import { buildProvinces, withRoads } from '../build';
import { LAND, LINKS } from './land';
import { NATIONS } from './nations';
import { ROWS } from './provinces';
import { ROADS } from './roads';
import { STARTING_ARMIES, STARTING_BUILDINGS } from './setup';

export const EUROPE_SCENARIO: ScenarioDef = {
  id: 'europe-modern-borders',
  name: 'European Theatre — Modern Borders, 1914 Technology',
  nations: NATIONS,
  provinces: buildProvinces(ROWS, NATIONS, LAND),
  connections: withRoads(LINKS, ROADS),
  startingBuildings: STARTING_BUILDINGS,
  startingArmies: STARTING_ARMIES,
  startingTechs: [],
};
