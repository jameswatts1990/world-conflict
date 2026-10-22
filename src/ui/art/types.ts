// Shared type vocabulary for the artwork. Unit types are re-exported from UnitArt.tsx, building and
// terrain types from CitySkyline.tsx and BuildingIcons.tsx.

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

/**
 * Art style: the six powers' own looks, one per bloc (worn by every nation of that bloc
 * that has no look of its own), and the neutral garrisons'.
 */
export type ArtNation = 'uk' | 'fr' | 'de' | 'it' | 'es' | 'pl' | 'western' | 'central' | 'eastern' | 'neutral';

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

export const ART_NATIONS: readonly ArtNation[] = ['uk', 'fr', 'de', 'it', 'es', 'pl', 'western', 'central', 'eastern', 'neutral'];

/** Nations drawn in a look of their own; every other nation wears its bloc's. */
export const NATIONAL_STYLES: readonly ArtNation[] = ['uk', 'fr', 'de', 'it', 'es', 'pl'];

export type ArtBuilding = 'industry' | 'market' | 'powerPlant' | 'refinery' | 'housing' | 'university' | 'barracks'
  | 'academy' | 'armsWorks' | 'motorPool' | 'tankWorks' | 'hospital' | 'propaganda' | 'garrisonHq'
  | 'fortifications' | 'supplyDepot' | 'railway' | 'coastalBattery';
export type ArtTerrain = 'plains' | 'forest' | 'hills' | 'mountains' | 'urban' | 'marsh';

export type BuildingCategory = 'economy' | 'military' | 'civic' | 'infrastructure';

export const BUILDING_CATEGORY: Record<ArtBuilding, BuildingCategory> = {
  industry: 'economy',
  market: 'economy',
  powerPlant: 'economy',
  refinery: 'economy',
  housing: 'economy',
  university: 'economy',
  barracks: 'military',
  academy: 'military',
  armsWorks: 'military',
  motorPool: 'military',
  tankWorks: 'military',
  hospital: 'civic',
  propaganda: 'civic',
  garrisonHq: 'civic',
  fortifications: 'infrastructure',
  supplyDepot: 'infrastructure',
  railway: 'infrastructure',
  coastalBattery: 'infrastructure',
};
