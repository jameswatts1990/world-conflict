import { nationIdentity } from '../../blocs';
import type { NationDef } from '../../types';
import { IDENTITIES, SPECIALITIES } from './identity';

// The modern nations. Each has a power tier (config/powers.ts) that sets its
// output, starting army and objectives, so nations of one tier start broadly
// balanced; and a bloc (blocs.ts) for its equipment, which the original six
// override with their own named designs. Great and major powers are playable;
// minor powers are computer-controlled.
const base: Omit<NationDef, 'speciality' | 'identity'>[] = [
  {
    id: 'uk', name: 'United Kingdom', article: 'the', adjective: 'British', color: '#c4553f', capital: 'uk-london', power: 'great', bloc: 'western',
    trait: 'Defensive',
    blurb: 'An island fortress. Safe behind the Channel, but every offensive starts with a slow sea crossing.',
  },
  {
    id: 'fr', name: 'France', adjective: 'French', color: '#3f6fc4', capital: 'fr-paris', power: 'great', bloc: 'western',
    trait: 'Many fronts',
    blurb: 'The continental hinge. Many provinces and many neighbours: Germany, Italy, Spain and Britain.',
  },
  {
    id: 'de', name: 'Germany', adjective: 'German', color: '#5f6b75', capital: 'de-berlin', power: 'great', bloc: 'central',
    trait: 'Encircled',
    blurb: 'Central and exposed. Borders six minor powers and two great powers.',
  },
  {
    id: 'it', name: 'Italy', adjective: 'Italian', color: '#3b9a58', capital: 'it-rome', power: 'great', bloc: 'western',
    trait: 'Mountain wall',
    blurb: 'Alpine walls to the north, a long peninsula behind. Mountains favour the defender.',
  },
  {
    id: 'es', name: 'Spain', adjective: 'Spanish', color: '#d39b1c', capital: 'es-madrid', power: 'great', bloc: 'western',
    trait: 'Secure flank',
    blurb: 'A Pyrenean bastion with France as the only great-power neighbour. Portugal is within reach.',
  },
  {
    id: 'pl', name: 'Poland', adjective: 'Polish', color: '#8d5bb4', capital: 'pl-warsaw', power: 'great', bloc: 'western',
    trait: 'Open plains',
    blurb: 'Open plains between Germany and the edge of the theatre. Czechia and Slovakia lie to the south, beyond the mountains.',
  },
  {
    id: 'hu', name: 'Hungary', adjective: 'Hungarian', color: '#b0476d', capital: 'hu-budapest', power: 'great', bloc: 'central',
    trait: 'Danube crossroads',
    blurb: 'The heart of the Danube basin. Six neighbours and none of them a great power: room to grow, and a front on every side.',
  },
  // Major powers: playable, smaller than the great powers (config/powers.ts).
  {
    id: 'ro', name: 'Romania', adjective: 'Romanian', color: '#3d78c0', capital: 'ro-bucharest', power: 'major', bloc: 'western',
    trait: 'Oil and mountains',
    blurb: "Europe's own oil field behind the arc of the Carpathians. Hungary and Serbia to the west; the Black Sea and the edge of the theatre to the east.",
  },
  {
    id: 'rs', name: 'Serbia', adjective: 'Serbian', color: '#c0703a', capital: 'rs-belgrade', power: 'major', bloc: 'western',
    trait: 'Balkan bastion',
    blurb: 'Where the Sava meets the Danube. Hungary across the plain to the north, Croatia and Romania on either flank; to the south, only the edge of the theatre.',
  },
  // Minor powers: one province each, always computer-controlled. Blocs follow who armed them: Belgium,
  // Denmark and Portugal Entente-style; the Netherlands, Switzerland, Austria and Czechia with
  // Schwarzlose guns, Škoda artillery and German-pattern kit.
  { id: 'be', name: 'Belgium & Luxembourg', adjective: 'Belgian', color: '#a39a3c', capital: 'be-brussels', power: 'minor', bloc: 'western' },
  { id: 'nl', name: 'Netherlands', article: 'the', adjective: 'Dutch', color: '#e8873a', capital: 'nl-amsterdam', power: 'minor', bloc: 'central' },
  { id: 'dk', name: 'Denmark', adjective: 'Danish', color: '#c8414b', capital: 'dk-copenhagen', power: 'minor', bloc: 'western' },
  { id: 'ch', name: 'Switzerland', adjective: 'Swiss', color: '#d97a6c', capital: 'ch-bern', power: 'minor', bloc: 'central' },
  { id: 'at', name: 'Austria', adjective: 'Austrian', color: '#4f86b8', capital: 'at-vienna', power: 'minor', bloc: 'central' },
  { id: 'cz', name: 'Czechia', adjective: 'Czech', color: '#8a6a44', capital: 'cz-prague', power: 'minor', bloc: 'central' },
  { id: 'pt', name: 'Portugal', adjective: 'Portuguese', color: '#2e8b6e', capital: 'pt-lisbon', power: 'minor', bloc: 'western' },
  // Slovakia, Slovenia and Croatia: two provinces, one and two; Austro-Hungarian heritage and Škoda kit.
  { id: 'sk', name: 'Slovakia', adjective: 'Slovak', color: '#3a9c96', capital: 'sk-bratislava', power: 'minor', bloc: 'central' },
  { id: 'si', name: 'Slovenia', adjective: 'Slovenian', color: '#d4a13a', capital: 'si-ljubljana', power: 'minor', bloc: 'central' },
  { id: 'hr', name: 'Croatia', adjective: 'Croatian', color: '#6f5aa8', capital: 'hr-zagreb', power: 'minor', bloc: 'central' },
  // Ireland: two provinces; the Free State's army was armed from British stocks.
  { id: 'ie', name: 'Ireland', adjective: 'Irish', color: '#62a84a', capital: 'ie-dublin', power: 'minor', bloc: 'western' },
];

export const NATIONS: NationDef[] = base.map((n) => ({ ...n, speciality: SPECIALITIES[n.id], identity: nationIdentity(n.bloc, IDENTITIES[n.id]) }));

export const NEUTRAL_COLOR = '#d8d1bd';
