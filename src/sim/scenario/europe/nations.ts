import type { NationDef } from '../../types';
import { IDENTITIES, SPECIALITIES } from './identity';

// Six playable modern nations. Starting capabilities are broadly balanced:
// see provinces.ts, where each nation's output is normalised to the same totals.
// Each has one small national speciality and its own named equipment.
const base = [
  { id: 'uk', name: 'United Kingdom', adjective: 'British', color: '#c4553f', capital: 'uk-london' },
  { id: 'fr', name: 'France', adjective: 'French', color: '#3f6fc4', capital: 'fr-paris' },
  { id: 'de', name: 'Germany', adjective: 'German', color: '#5f6b75', capital: 'de-berlin' },
  { id: 'it', name: 'Italy', adjective: 'Italian', color: '#3b9a58', capital: 'it-rome' },
  { id: 'es', name: 'Spain', adjective: 'Spanish', color: '#d39b1c', capital: 'es-madrid' },
  { id: 'pl', name: 'Poland', adjective: 'Polish', color: '#8d5bb4', capital: 'pl-warsaw' },
];

export const NATIONS: NationDef[] = base.map((n) => ({ ...n, speciality: SPECIALITIES[n.id], identity: IDENTITIES[n.id] }));

export const NEUTRAL_COLOR = '#d8d1bd';
