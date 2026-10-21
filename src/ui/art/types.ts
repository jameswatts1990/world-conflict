// Shared type vocabulary for the unit artwork. Re-exported from UnitArt.tsx.

export type ArtUnitType =
  | 'infantry'
  | 'stormtroopers'
  | 'mountain'
  | 'motorised'
  | 'cavalry'
  | 'armouredCar'
  | 'artillery'
  | 'heavyArtillery'
  | 'antiTank'
  | 'lightTank'
  | 'tank'
  | 'heavyTank'
  | 'tankDestroyer';

export type ArtGen = 'ww1' | 'interwar' | 'ww2';

export type ArtNation = 'uk' | 'fr' | 'de' | 'it' | 'es' | 'pl' | 'neutral';

export type ArtVariant = 'full' | 'icon';

export const ART_UNIT_TYPES: readonly ArtUnitType[] = [
  'infantry',
  'stormtroopers',
  'mountain',
  'motorised',
  'cavalry',
  'armouredCar',
  'artillery',
  'heavyArtillery',
  'antiTank',
  'lightTank',
  'tank',
  'heavyTank',
  'tankDestroyer',
];

export const ART_GENS: readonly ArtGen[] = ['ww1', 'interwar', 'ww2'];

export const ART_NATIONS: readonly ArtNation[] = ['uk', 'fr', 'de', 'it', 'es', 'pl', 'neutral'];
