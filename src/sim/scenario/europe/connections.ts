// Explicit movement connections between rows. Land links were seeded from shared
// borders in the map data and then curated by hand; straits are sea crossings for
// land units (no naval combat in this milestone). scripts/map/city-provinces.ts
// turns them into links between provinces (land.ts, generated): a land or mountain
// connection joins every pair of the two rows' lands that share a border, a strait
// the two lands with the nearest coasts, and every city is joined only to the lands
// round it. Every shared border between rows needs a land or mountain connection
// here, and every such connection a shared border. The map shapes are never
// consulted for adjacency at runtime.
import type { ConnectionDef } from '../../types';

const land = (a: string, b: string): ConnectionDef => ({ a, b, kind: 'land' });
const mountain = (a: string, b: string, label?: string): ConnectionDef => ({ a, b, kind: 'mountain', label });
const strait = (a: string, b: string, label: string): ConnectionDef => ({ a, b, kind: 'strait', label });

export const CONNECTIONS: ConnectionDef[] = [
  // United Kingdom
  land('uk-london', 'uk-midlands'),
  land('uk-midlands', 'uk-north'),
  land('uk-north', 'uk-scotland'),
  strait('uk-scotland', 'uk-ulster', 'North Channel'),
  strait('uk-london', 'fr-nord', 'Strait of Dover'),
  strait('uk-london', 'fr-paris', 'English Channel'),
  strait('uk-london', 'be-brussels', 'North Sea crossing'),
  strait('uk-north', 'nl-amsterdam', 'North Sea crossing'),
  strait('uk-north', 'de-north', 'North Sea crossing'),
  strait('uk-midlands', 'es-north', 'Bay of Biscay crossing'),

  // France
  land('fr-paris', 'fr-nord'),
  land('fr-paris', 'fr-rhone'),
  land('fr-paris', 'fr-aquitaine'),
  land('fr-aquitaine', 'fr-rhone'),
  land('fr-rhone', 'fr-nord'),
  land('fr-aquitaine', 'fr-midi'),
  land('fr-rhone', 'fr-midi'),
  land('fr-nord', 'be-brussels'),
  land('fr-nord', 'ch-bern'),
  land('fr-rhone', 'ch-bern'),
  land('fr-nord', 'de-hesse'),
  mountain('fr-rhone', 'it-piedmont', 'Alpine passes'),
  mountain('fr-midi', 'it-piedmont', 'Maritime Alps'),
  mountain('fr-midi', 'es-catalonia', 'Eastern Pyrenees'),
  mountain('fr-aquitaine', 'es-catalonia', 'Central Pyrenees'),
  land('fr-aquitaine', 'es-north'),
  strait('fr-midi', 'it-naples', 'Strait of Bonifacio'),
  strait('es-catalonia', 'it-naples', 'Western Mediterranean crossing'),

  // Germany
  land('de-berlin', 'de-north'),
  land('de-north', 'de-ruhr'),
  land('de-north', 'de-hesse'),
  land('de-ruhr', 'de-hesse'),
  land('de-hesse', 'de-berlin'),
  land('de-hesse', 'de-bavaria'),
  land('de-bavaria', 'de-berlin'),
  land('de-north', 'dk-copenhagen'),
  land('de-north', 'nl-amsterdam'),
  land('de-ruhr', 'nl-amsterdam'),
  land('de-ruhr', 'be-brussels'),
  land('de-hesse', 'be-brussels'),
  land('de-hesse', 'ch-bern'),
  land('de-hesse', 'at-vienna'),
  land('de-bavaria', 'at-vienna'),
  land('de-bavaria', 'cz-prague'),
  mountain('de-berlin', 'cz-prague', 'Ore Mountains'),
  land('de-berlin', 'pl-greater'),
  land('de-berlin', 'pl-pomerania'),
  land('de-north', 'pl-pomerania'),
  land('de-berlin', 'pl-silesia'),

  // Italy
  land('it-piedmont', 'it-lombardy'),
  land('it-piedmont', 'it-tuscany'),
  land('it-lombardy', 'it-tuscany'),
  land('it-tuscany', 'it-rome'),
  land('it-rome', 'it-naples'),
  mountain('it-piedmont', 'ch-bern', 'Great St Bernard'),
  mountain('it-lombardy', 'ch-bern', 'Gotthard'),
  mountain('it-lombardy', 'at-vienna', 'Brenner Pass'),

  // Spain
  land('es-madrid', 'es-castile'),
  land('es-madrid', 'es-catalonia'),
  land('es-madrid', 'es-andalusia'),
  land('es-castile', 'es-north'),
  land('es-castile', 'es-catalonia'),
  land('es-castile', 'es-andalusia'),
  land('es-north', 'es-catalonia'),
  land('es-catalonia', 'es-andalusia'),
  land('es-north', 'pt-lisbon'),
  land('es-castile', 'pt-lisbon'),
  land('es-andalusia', 'pt-lisbon'),

  // Poland
  land('pl-warsaw', 'pl-pomerania'),
  land('pl-warsaw', 'pl-greater'),
  land('pl-warsaw', 'pl-silesia'),
  land('pl-warsaw', 'pl-lesser'),
  land('pl-pomerania', 'pl-greater'),
  land('pl-greater', 'pl-silesia'),
  land('pl-silesia', 'pl-lesser'),
  mountain('pl-silesia', 'cz-prague', 'Sudetes'),

  // Hungary
  land('hu-budapest', 'hu-north'),
  land('hu-budapest', 'hu-east'),
  land('hu-budapest', 'hu-south'),
  land('hu-budapest', 'hu-west'),
  land('hu-north', 'hu-east'),
  land('hu-east', 'hu-south'),
  land('hu-south', 'hu-west'),
  land('hu-west', 'at-vienna'),

  // Romania
  land('ro-bucharest', 'ro-banat'),
  land('ro-bucharest', 'ro-dobruja'),
  mountain('ro-bucharest', 'ro-transylvania', 'Predeal Pass'),
  land('ro-banat', 'ro-transylvania'),
  land('ro-dobruja', 'ro-moldavia'),
  mountain('ro-dobruja', 'ro-transylvania', 'Buzău Pass'),
  mountain('ro-moldavia', 'ro-transylvania', 'Eastern Carpathians'),
  land('ro-transylvania', 'hu-east'),
  land('ro-transylvania', 'hu-south'),
  land('ro-banat', 'hu-south'),
  land('ro-banat', 'rs-belgrade'),

  // Serbia
  land('rs-belgrade', 'hu-south'),
  land('rs-belgrade', 'hr-zagreb'),

  // Bulgaria: Danube crossings are land until rivers have their own defensive rules.
  mountain('bg-sofia', 'bg-plovdiv', 'Gate of Trajan'),
  mountain('bg-sofia', 'bg-pleven', 'Iskar Gorge'),
  mountain('bg-plovdiv', 'bg-pleven', 'Shipka Pass'),
  land('bg-plovdiv', 'bg-burgas'),
  mountain('bg-pleven', 'bg-burgas', 'Kotel Pass'),
  land('bg-pleven', 'bg-varna'),
  mountain('bg-varna', 'bg-burgas', 'Eastern Balkan passes'),
  land('bg-sofia', 'ro-banat'),
  land('bg-pleven', 'ro-banat'),
  land('bg-pleven', 'ro-bucharest'),
  land('bg-varna', 'ro-bucharest'),
  land('bg-varna', 'ro-dobruja'),
  land('bg-sofia', 'rs-belgrade'), // Timok valley and Pirot–Dragoman corridor
  mountain('bg-sofia', 'mk-skopje', 'Osogovo passes'),
  mountain('bg-sofia', 'gr-thessaloniki', 'Rupel Pass'),
  mountain('bg-plovdiv', 'gr-thessaloniki', 'Rhodope passes'),

  strait('it-naples', 'al-tirana', 'Strait of Otranto'),
  strait('it-naples', 'gr-patras', 'Ionian crossing'),

  // Greece: the Vardar–Axios corridor is open; the western approaches cross the Pindus.
  land('gr-athens', 'gr-larissa'),
  land('gr-athens', 'gr-patras'),
  strait('gr-larissa', 'gr-patras', 'Gulf of Patras'),
  land('gr-larissa', 'gr-thessaloniki'),
  strait('gr-athens', 'gr-crete', 'Cretan Sea crossing'),
  land('gr-thessaloniki', 'mk-skopje'),
  land('gr-larissa', 'mk-skopje'), // Monastir Gap: the Florina–Bitola lowland corridor
  mountain('gr-larissa', 'al-tirana', 'Kakavia Pass'),

  // Western Balkans: lowland Sava and Drina approaches, mountain walls towards the coast.
  land('ba-sarajevo', 'hr-zagreb'),
  land('ba-sarajevo', 'rs-belgrade'),
  mountain('ba-sarajevo', 'me-podgorica', 'Tara canyon'),
  land('me-podgorica', 'hr-zagreb'), // Konavle coast
  mountain('me-podgorica', 'rs-belgrade', 'Sandžak passes'),
  land('me-podgorica', 'al-tirana'), // Shkodër corridor
  mountain('al-tirana', 'rs-belgrade', 'Drin valley'),
  mountain('al-tirana', 'mk-skopje', 'Ohrid and Debar passes'),
  land('mk-skopje', 'rs-belgrade'), // Preševo: Morava–Vardar corridor

  // Croatia
  land('hr-zagreb', 'si-ljubljana'),
  land('hr-zagreb', 'hu-west'),
  land('hr-zagreb', 'hu-south'),
  strait('hr-zagreb', 'it-rome', 'Adriatic crossing'),

  // Slovenia
  mountain('si-ljubljana', 'it-lombardy', 'Isonzo'),
  land('si-ljubljana', 'at-vienna'),
  land('si-ljubljana', 'hu-west'),

  // Slovakia
  land('sk-bratislava', 'at-vienna'),
  land('sk-bratislava', 'cz-prague'),
  land('sk-bratislava', 'hu-west'),
  land('sk-bratislava', 'hu-budapest'),
  land('sk-bratislava', 'hu-north'),
  mountain('sk-bratislava', 'pl-silesia', 'Beskids'),
  mountain('sk-bratislava', 'pl-lesser', 'Tatras'),

  // Ireland
  land('ie-dublin', 'uk-ulster'),
  strait('ie-dublin', 'uk-midlands', 'Irish Sea crossing'),

  // The East: lowland corridors and river borders (rivers have no separate link type).
  land('by-brest', 'ua-galicia'),
  land('by-gomel', 'ua-galicia'),
  land('by-gomel', 'ua-kyiv'),
  land('hu-east', 'ua-galicia'),
  land('hu-north', 'ua-galicia'),
  land('md-chisinau', 'ua-galicia'),
  land('md-chisinau', 'ua-odesa'),
  land('pl-warsaw', 'ua-galicia'),
  land('pl-lesser', 'ua-galicia'),
  land('ro-dobruja', 'ua-odesa'),
  land('ro-moldavia', 'ua-galicia'),
  land('ro-transylvania', 'ua-galicia'),
  land('sk-bratislava', 'ua-galicia'),
  land('ua-dnipro', 'ua-galicia'),
  land('ua-dnipro', 'ua-kharkiv'),
  land('ua-dnipro', 'ua-kyiv'),
  land('ua-dnipro', 'ua-odesa'),
  land('ua-galicia', 'ua-kyiv'),
  land('ua-galicia', 'ua-odesa'),
  land('ua-kharkiv', 'ua-kyiv'),
  land('by-minsk', 'by-brest'),
  land('by-minsk', 'by-vitebsk'),
  land('by-minsk', 'by-gomel'),
  land('by-minsk', 'by-mogilev'),
  land('by-mogilev', 'by-gomel'),
  land('by-mogilev', 'by-vitebsk'),
  land('by-brest', 'by-gomel'),
  land('by-brest', 'by-vitebsk'),
  land('pl-warsaw', 'by-brest'),
  land('pl-warsaw', 'lt-vilnius'),
  land('ro-moldavia', 'md-chisinau'),
  land('ro-dobruja', 'md-chisinau'),
  land('by-brest', 'lt-vilnius'),
  land('by-vitebsk', 'lt-vilnius'),
  land('by-vitebsk', 'lv-riga'),
  land('lt-vilnius', 'lv-riga'),
  land('lv-riga', 'ee-tallinn'),

  // Between the minor powers
  land('be-brussels', 'nl-amsterdam'),
  land('at-vienna', 'cz-prague'),
  mountain('at-vienna', 'ch-bern', 'Arlberg'),
];

/** Names of the crossings that join a region's island land to the rest of it (the generator adds them). */
export const CROSSINGS: Record<string, string> = {
  'fr-midi': 'Ligurian crossing',
  'it-naples': 'Tyrrhenian crossing',
  'dk-copenhagen': 'Little Belt',
};
