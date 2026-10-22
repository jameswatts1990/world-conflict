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
    blurb: 'Central and exposed. Borders six neutral states and two great powers.',
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
    blurb: 'Open plains between Germany and the edge of the theatre. Czechia lies to the south.',
  },
  {
    id: 'hu', name: 'Hungary', adjective: 'Hungarian', color: '#b0476d', capital: 'hu-budapest', power: 'great', bloc: 'central',
    trait: 'One gateway',
    blurb: 'Landlocked behind Austria. The only road out runs through Vienna, and it is the only road in.',
  },
];

export const NATIONS: NationDef[] = base.map((n) => ({ ...n, speciality: SPECIALITIES[n.id], identity: nationIdentity(n.bloc, IDENTITIES[n.id]) }));

export const NEUTRAL_COLOR = '#d8d1bd';
