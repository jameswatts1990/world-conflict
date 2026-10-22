// Per-render drawing context: which nation and generation is being drawn and
// the derived colours, headgear and camouflage every unit drawing needs.
import { BOOT, NATION_PALETTES, camoHasLines, shade, type NationPalette } from './palettes';
import type { ArtGen, ArtNation, CamoSpec } from './types';

export type Headgear =
  | 'brodie'
  | 'adrian'
  | 'pickelhaube'
  | 'stahlhelm16'
  | 'stahlhelm35'
  | 'm33'
  | 'kepi'
  | 'trubia'
  | 'm26'
  | 'maciejowka'
  | 'wz31'
  | 'plain'
  | 'alpini'
  | 'beret'
  | 'bergmutze'
  | 'fez'
  | 'cuirassier'
  | 'czapka';

/** How a soldier is dressed: colours plus headgear. */
export interface Kit {
  uniform: string;
  uniformDark: string;
  headgear: Headgear;
  /** Colour of the helmet or cap. */
  hat: string;
  boots: string;
  /** Knee-high marching boots (German) rather than ankle boots and puttees. */
  jackboots: boolean;
  /** Collar/badge flash colour (Arditi black flames, etc.); optional. */
  flash?: string;
}

export interface Ctx {
  nation: ArtNation;
  gen: ArtGen;
  pal: NationPalette;
  kit: Kit;
  /** Camouflage for vehicles and gun shields, if this nation/generation uses it. */
  camo?: CamoSpec;
  /** Outline width for this variant. */
  ow: number;
}

export function standardHeadgear(nation: ArtNation, gen: ArtGen): Headgear {
  switch (nation) {
    case 'uk':
      return 'brodie';
    case 'fr':
      return 'adrian';
    case 'de':
      return gen === 'ww1' ? 'pickelhaube' : gen === 'interwar' ? 'stahlhelm16' : 'stahlhelm35';
    case 'it':
      return gen === 'ww2' ? 'm33' : 'adrian';
    case 'es':
      return gen === 'ww1' ? 'kepi' : gen === 'interwar' ? 'trubia' : 'm26';
    case 'pl':
      return gen === 'ww1' ? 'maciejowka' : gen === 'interwar' ? 'adrian' : 'wz31';
    default:
      return 'plain';
  }
}

/** Default colour for a headgear kind, given the wearer's uniform. */
export function hatColour(headgear: Headgear, nation: ArtNation, gen: ArtGen, uniform: string): string {
  switch (headgear) {
    case 'pickelhaube':
    case 'fez':
      return '#26262b';
    case 'beret':
      return '#2a3556';
    case 'cuirassier':
      return '#aeb4bb';
    case 'brodie':
      return '#6c6a45';
    case 'adrian':
      if (nation === 'fr' && gen === 'ww1') return '#6c829e';
      return shade(uniform, -0.14);
    case 'stahlhelm16':
    case 'stahlhelm35':
      return gen === 'ww2' ? '#565d50' : '#5f6655';
    case 'kepi':
      return shade(uniform, -0.05);
    case 'maciejowka':
    case 'czapka':
    case 'bergmutze':
    case 'alpini':
      return shade(uniform, -0.08);
    default:
      return shade(uniform, -0.16);
  }
}

export function makeKit(nation: ArtNation, gen: ArtGen, headgear?: Headgear): Kit {
  const pal = NATION_PALETTES[nation][gen];
  const hg = headgear ?? standardHeadgear(nation, gen);
  return {
    uniform: pal.uniform,
    uniformDark: pal.uniformDark,
    headgear: hg,
    hat: hatColour(hg, nation, gen, pal.uniform),
    boots: BOOT,
    jackboots: nation === 'de',
  };
}

/** Same kit with another headgear (and its matching colour). */
export function withHeadgear(ctx: Ctx, headgear: Headgear, hat?: string): Kit {
  return { ...ctx.kit, headgear, hat: hat ?? hatColour(headgear, ctx.nation, ctx.gen, ctx.kit.uniform) };
}

/** Darker copy of a kit, for figures standing further back. */
export function dimKit(kit: Kit, amt: number): Kit {
  return {
    ...kit,
    uniform: shade(kit.uniform, -amt),
    uniformDark: shade(kit.uniformDark, -amt),
    hat: shade(kit.hat, -amt),
  };
}

export function makeCtx(nation: ArtNation, gen: ArtGen, icon: boolean): Ctx {
  const pal = NATION_PALETTES[nation][gen];
  return {
    nation,
    gen,
    pal,
    kit: makeKit(nation, gen),
    camo: pal.camo
      ? { colors: pal.camo, cell: icon ? 6 : 11, lines: camoHasLines(nation, gen), seed: 11, frame: icon ? [0, 0, 40, 24] : [0, 0, 96, 60] }
      : undefined,
    ow: icon ? 1.25 : 1.15,
  };
}
