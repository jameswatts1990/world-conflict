import { nationIdentity } from '../../blocs';
import type { NationDef } from '../../types';
import { IDENTITIES, SPECIALITIES } from './identity';

// The modern nations. Each is either playable (five cities) or a one-city state (config/powers.ts) and that sets its
// output, starting army and objectives, so nations of one kind start broadly
// balanced; and a bloc (blocs.ts) for its equipment, which the original six
// override with their own named designs. Playable nations are the ones a human may choose;
// states are computer-controlled.
const base: Omit<NationDef, 'speciality' | 'identity'>[] = [
  {
    id: 'uk', name: 'United Kingdom', article: 'the', adjective: 'British', color: '#c4553f', capital: 'uk-london', power: 'playable', bloc: 'western',
    trait: 'Defensive',
    blurb: 'An island fortress with one land border, in Ulster. Safe behind the Channel, but every offensive on the Continent starts with a slow sea crossing.',
  },
  {
    id: 'fr', name: 'France', adjective: 'French', color: '#3f6fc4', capital: 'fr-paris', power: 'playable', bloc: 'western',
    trait: 'Many fronts',
    blurb: 'The continental hinge. Many provinces and many neighbours: Germany, Italy, Spain and Britain.',
  },
  {
    id: 'de', name: 'Germany', adjective: 'German', color: '#5f6b75', capital: 'de-berlin', power: 'playable', bloc: 'central',
    trait: 'Encircled',
    blurb: 'Central and exposed. Borders six one-city states and two playable neighbours.',
  },
  {
    id: 'it', name: 'Italy', adjective: 'Italian', color: '#3b9a58', capital: 'it-rome', power: 'playable', bloc: 'western',
    trait: 'Mountain wall',
    blurb: 'Alpine walls to the north, a long peninsula behind. Mountains favour the defender.',
  },
  {
    id: 'es', name: 'Spain', adjective: 'Spanish', color: '#d39b1c', capital: 'es-madrid', power: 'playable', bloc: 'western',
    trait: 'Secure flank',
    blurb: 'A Pyrenean bastion with France as the only playable neighbour. Portugal is within reach.',
  },
  {
    id: 'pl', name: 'Poland', adjective: 'Polish', color: '#8d5bb4', capital: 'pl-warsaw', power: 'playable', bloc: 'western',
    trait: 'Open plains',
    blurb: 'Open plains between Germany and Ukraine, with Belarus beyond the Bug and Lithuania across the Suwałki gap. Czechia and Slovakia lie to the south, beyond the mountains.',
  },
  {
    id: 'hu', name: 'Hungary', adjective: 'Hungarian', color: '#b0476d', capital: 'hu-budapest', power: 'playable', bloc: 'central',
    trait: 'Danube crossroads',
    blurb: 'The heart of the Danube basin. Seven neighbours, with Ukraine beyond the Upper Tisza: room to grow, and a front on every side.',
  },
  // The south-east: playable like the rest, with five cities each (config/powers.ts).
  {
    id: 'ro', name: 'Romania', adjective: 'Romanian', color: '#3d78c0', capital: 'ro-bucharest', power: 'playable', bloc: 'western',
    trait: 'Oil and mountains',
    blurb: "Europe's own oil field behind the arc of the Carpathians. Hungary and Serbia to the west, Bulgaria across the Danube; Ukraine and Moldova to the north and east.",
  },
  { id: 'rs', name: 'Serbia', adjective: 'Serbian', color: '#c0703a', capital: 'rs-belgrade', power: 'state', bloc: 'western' },
  {
    id: 'bg', name: 'Bulgaria', adjective: 'Bulgarian', color: '#759444', capital: 'bg-sofia', power: 'playable', bloc: 'central',
    trait: 'Balkan passes',
    blurb: 'The Danube plain and the Thracian heartland, divided by the Balkan range. Romania across the river, Serbia to the west and Greece beyond the southern passes.',
  },
  {
    id: 'gr', name: 'Greece', adjective: 'Greek', color: '#38a6b5', capital: 'gr-athens', power: 'playable', bloc: 'western',
    trait: 'Mountain shield',
    blurb: 'A peninsula behind the Pindus and the Rhodopes. Macedonia guards the road north; Crete and the Aegean islands stretch the homeland across the sea.',
  },
  { id: 'ba', name: 'Bosnia & Herzegovina', adjective: 'Bosnian', color: '#c6a24d', capital: 'ba-sarajevo', power: 'state', bloc: 'central' },
  { id: 'me', name: 'Montenegro', adjective: 'Montenegrin', color: '#963e59', capital: 'me-podgorica', power: 'state', bloc: 'western' },
  { id: 'al', name: 'Albania', adjective: 'Albanian', color: '#a178b5', capital: 'al-tirana', power: 'state', bloc: 'western' },
  { id: 'mk', name: 'North Macedonia', adjective: 'Macedonian', color: '#d3b977', capital: 'mk-skopje', power: 'state', bloc: 'western' },
  // States: one city each, always computer-controlled. Blocs follow who armed them: Belgium,
  // Denmark and Portugal Entente-style; the Netherlands, Switzerland, Austria and Czechia with
  // Schwarzlose guns, Škoda artillery and German-pattern kit.
  { id: 'be', name: 'Belgium & Luxembourg', adjective: 'Belgian', color: '#a39a3c', capital: 'be-brussels', power: 'state', bloc: 'western' },
  { id: 'nl', name: 'Netherlands', article: 'the', adjective: 'Dutch', color: '#e8873a', capital: 'nl-amsterdam', power: 'state', bloc: 'central' },
  { id: 'dk', name: 'Denmark', adjective: 'Danish', color: '#c8414b', capital: 'dk-copenhagen', power: 'state', bloc: 'western' },
  { id: 'ch', name: 'Switzerland', adjective: 'Swiss', color: '#d97a6c', capital: 'ch-bern', power: 'state', bloc: 'central' },
  { id: 'at', name: 'Austria', adjective: 'Austrian', color: '#4f86b8', capital: 'at-vienna', power: 'state', bloc: 'central' },
  { id: 'cz', name: 'Czechia', adjective: 'Czech', color: '#8a6a44', capital: 'cz-prague', power: 'state', bloc: 'central' },
  { id: 'pt', name: 'Portugal', adjective: 'Portuguese', color: '#2e8b6e', capital: 'pt-lisbon', power: 'state', bloc: 'western' },
  // Slovakia, Slovenia and Croatia: two provinces, one and two; Austro-Hungarian heritage and Škoda kit.
  { id: 'sk', name: 'Slovakia', adjective: 'Slovak', color: '#3a9c96', capital: 'sk-bratislava', power: 'state', bloc: 'central' },
  { id: 'si', name: 'Slovenia', adjective: 'Slovenian', color: '#d4a13a', capital: 'si-ljubljana', power: 'state', bloc: 'central' },
  { id: 'hr', name: 'Croatia', adjective: 'Croatian', color: '#6f5aa8', capital: 'hr-zagreb', power: 'state', bloc: 'central' },
  // Ireland: two provinces; the Free State's army was armed from British stocks.
  { id: 'ie', name: 'Ireland', adjective: 'Irish', color: '#62a84a', capital: 'ie-dublin', power: 'state', bloc: 'western' },
  {
    id: 'ua', name: 'Ukraine', adjective: 'Ukrainian', color: '#d9df58', capital: 'ua-kyiv', power: 'playable', bloc: 'eastern',
    trait: 'Black-earth steppe',
    blurb: 'The Dnieper links the northern forests to the Black Sea. Industry in its great bend, open steppe to the east and a crowded frontier beyond the Carpathians.',
  },
  {
    id: 'by', name: 'Belarus', adjective: 'Belarusian', color: '#4b927b', capital: 'by-minsk', power: 'playable', bloc: 'eastern',
    trait: 'Forest and marsh',
    blurb: 'Between Poland and Ukraine, the forests and Pripet marshes guard the approaches to Minsk. The Baltic states offer room to expand, but Poland watches the western frontier and Ukraine lies beyond the marshes.',
  },
  { id: 'md', name: 'Moldova', adjective: 'Moldovan', color: '#af5663', capital: 'md-chisinau', power: 'state', bloc: 'eastern' },
  { id: 'lt', name: 'Lithuania', adjective: 'Lithuanian', color: '#b98542', capital: 'lt-vilnius', power: 'state', bloc: 'western' },
  { id: 'lv', name: 'Latvia', adjective: 'Latvian', color: '#a85277', capital: 'lv-riga', power: 'state', bloc: 'western' },
  { id: 'ee', name: 'Estonia', adjective: 'Estonian', color: '#568da7', capital: 'ee-tallinn', power: 'state', bloc: 'western' },

];

export const NATIONS: NationDef[] = base.map((n) => ({ ...n, speciality: SPECIALITIES[n.id], identity: nationIdentity(n.bloc, IDENTITIES[n.id]) }));

export const NEUTRAL_COLOR = '#d8d1bd';
