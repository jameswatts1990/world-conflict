// Shared vocabulary for the artwork: unit, generation, nation, building and terrain types, the
// generations each unit type is drawn in, and camouflage specs. Plain TypeScript (no JSX), so the
// 3D models and the tests can use it. Unit types are re-exported from UnitArt.tsx, building and
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

const GEN_ORDER: ArtGen[] = ['ww1', 'interwar', 'ww2'];

/** Generations in which each unit type exists. */
export const UNIT_GENS: Record<ArtUnitType, readonly ArtGen[]> = {
  infantry: GEN_ORDER,
  stormtroopers: GEN_ORDER,
  mountain: GEN_ORDER,
  motorised: ['interwar', 'ww2'],
  cavalry: GEN_ORDER,
  armouredCar: ['interwar', 'ww2'],
  artillery: GEN_ORDER,
  heavyArtillery: GEN_ORDER,
  antiTank: ['interwar', 'ww2'],
  lightTank: GEN_ORDER,
  tank: GEN_ORDER,
  heavyTank: ['interwar', 'ww2'],
  tankDestroyer: ['ww2'],
};

/** The generation actually drawn: the requested one, or the nearest that exists. */
export function resolveArtGen(type: ArtUnitType, gen: ArtGen): ArtGen {
  const have = UNIT_GENS[type];
  if (have.includes(gen)) return gen;
  const want = GEN_ORDER.indexOf(gen);
  let best = have[0];
  for (const g of have) {
    if (Math.abs(GEN_ORDER.indexOf(g) - want) < Math.abs(GEN_ORDER.indexOf(best) - want)) best = g;
  }
  return best;
}

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

/** Camouflage for a drawn vehicle or gun shield. */
export interface CamoSpec {
  colors: string[];
  /** Approximate patch spacing in drawing units. */
  cell: number;
  /** Draw thin dark borders between colour fields (German 1918 style). */
  lines?: boolean;
  seed?: number;
  /** Area to cover when a shape's extent cannot be worked out (the view box). */
  frame?: Box;
}

export type Box = [number, number, number, number];
