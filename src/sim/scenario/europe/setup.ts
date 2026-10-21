// Starting forces and infrastructure. Each nation gets the same template:
// capital 3 INF + 1 ART, industrial heartland 2 INF + 1 ART, plus 5 INF and
// 1 cavalry spread over border provinces.
import type { Resources, ScenarioDef } from '../../types';

export const STARTING_RESOURCES: Resources = { money: 1200, materials: 500, fuel: 150, manpower: 250 };

export const STARTING_BUILDINGS: ScenarioDef['startingBuildings'] = [
  // Capitals
  ...['uk-london', 'fr-paris', 'de-berlin', 'it-rome', 'es-madrid', 'pl-warsaw'].map((province) => ({
    province,
    buildings: { industry: 1, barracks: 1, armsWorks: 1, supplyDepot: 1 },
  })),
  // Industrial heartlands
  ...['uk-midlands', 'fr-nord', 'de-ruhr', 'it-lombardy', 'es-catalonia', 'pl-silesia'].map((province) => ({
    province,
    buildings: { industry: 1, barracks: 1, supplyDepot: 1 },
  })),
  // A second recruiting city
  ...['uk-north', 'fr-rhone', 'de-saxony', 'it-piedmont', 'es-north', 'pl-greater'].map((province) => ({
    province,
    buildings: { barracks: 1 },
  })),
  // Neutral border defences
  { province: 'nt-benelux', buildings: { fortifications: 1 } },
  { province: 'nt-switzerland', buildings: { fortifications: 2 } },
  { province: 'nt-czechia', buildings: { fortifications: 1 } },
];

export const STARTING_ARMIES: ScenarioDef['startingArmies'] = [
  // United Kingdom
  { owner: 'uk', province: 'uk-london', units: { infantry: 3, artillery: 1 } },
  { owner: 'uk', province: 'uk-midlands', units: { infantry: 2, artillery: 1 } },
  { owner: 'uk', province: 'uk-north', units: { infantry: 1, cavalry: 1 } },
  { owner: 'uk', province: 'uk-west', units: { infantry: 2 } },
  { owner: 'uk', province: 'uk-scotland', units: { infantry: 1 } },
  { owner: 'uk', province: 'uk-ulster', units: { infantry: 1 } },
  // France
  { owner: 'fr', province: 'fr-paris', units: { infantry: 3, artillery: 1 } },
  { owner: 'fr', province: 'fr-nord', units: { infantry: 2, artillery: 1 } },
  { owner: 'fr', province: 'fr-east', units: { infantry: 2 } },
  { owner: 'fr', province: 'fr-rhone', units: { infantry: 1, cavalry: 1 } },
  { owner: 'fr', province: 'fr-midi', units: { infantry: 1 } },
  { owner: 'fr', province: 'fr-aquitaine', units: { infantry: 1 } },
  // Germany
  { owner: 'de', province: 'de-berlin', units: { infantry: 3, artillery: 1 } },
  { owner: 'de', province: 'de-ruhr', units: { infantry: 2, artillery: 1 } },
  { owner: 'de', province: 'de-hesse', units: { infantry: 2 } },
  { owner: 'de', province: 'de-saxony', units: { infantry: 1, cavalry: 1 } },
  { owner: 'de', province: 'de-baden', units: { infantry: 1 } },
  { owner: 'de', province: 'de-north', units: { infantry: 1 } },
  // Italy
  { owner: 'it', province: 'it-rome', units: { infantry: 3, artillery: 1 } },
  { owner: 'it', province: 'it-lombardy', units: { infantry: 2, artillery: 1 } },
  { owner: 'it', province: 'it-piedmont', units: { infantry: 1, cavalry: 1 } },
  { owner: 'it', province: 'it-venetia', units: { infantry: 2 } },
  { owner: 'it', province: 'it-naples', units: { infantry: 1 } },
  { owner: 'it', province: 'it-tuscany', units: { infantry: 1 } },
  // Spain
  { owner: 'es', province: 'es-madrid', units: { infantry: 3, artillery: 1 } },
  { owner: 'es', province: 'es-catalonia', units: { infantry: 2, artillery: 1 } },
  { owner: 'es', province: 'es-north', units: { infantry: 2 } },
  { owner: 'es', province: 'es-castile', units: { infantry: 1, cavalry: 1 } },
  { owner: 'es', province: 'es-andalusia', units: { infantry: 1 } },
  { owner: 'es', province: 'es-valencia', units: { infantry: 1 } },
  // Poland
  { owner: 'pl', province: 'pl-warsaw', units: { infantry: 3, artillery: 1 } },
  { owner: 'pl', province: 'pl-silesia', units: { infantry: 2, artillery: 1 } },
  { owner: 'pl', province: 'pl-greater', units: { infantry: 1, cavalry: 1 } },
  { owner: 'pl', province: 'pl-pomerania', units: { infantry: 2 } },
  { owner: 'pl', province: 'pl-lesser', units: { infantry: 1 } },
  { owner: 'pl', province: 'pl-east', units: { infantry: 1 } },
  // Neutral garrisons (never move or attack; must be defeated to capture)
  { owner: 'neutral', province: 'nt-benelux', units: { infantry: 4 } },
  { owner: 'neutral', province: 'nt-netherlands', units: { infantry: 3 } },
  { owner: 'neutral', province: 'nt-switzerland', units: { infantry: 4 } },
  { owner: 'neutral', province: 'nt-austria', units: { infantry: 3 } },
  { owner: 'neutral', province: 'nt-czechia', units: { infantry: 4, artillery: 1 } },
  { owner: 'neutral', province: 'nt-denmark', units: { infantry: 2 } },
  { owner: 'neutral', province: 'nt-portugal', units: { infantry: 3 } },
];
