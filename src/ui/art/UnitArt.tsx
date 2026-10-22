// Hand-drawn unit artwork: a side-view illustration for unit cards ('full')
// and a bold single silhouette for map counters ('icon'), coloured per nation
// and redrawn per technology generation.
import type { JSX, ReactElement } from 'react';
import { makeCtx, type Ctx } from './context';
import { drawCavalry } from './cavalryArt';
import { drawAntiTank, drawArtillery, drawHeavyArtillery } from './gunsArt';
import { ICONS } from './iconsArt';
import { drawInfantry, drawMountain, drawStormtroopers } from './infantryArt';
import { drawHeavyTank, drawLightTank, drawTank, drawTankDestroyer } from './tanksArt';
import type { ArtGen, ArtNation, ArtUnitType } from './types';
import { drawArmouredCar, drawMotorised } from './vehiclesArt';

export type { ArtGen, ArtNation, ArtUnitType, ArtVariant } from './types';
export { ART_GENS, ART_NATIONS, ART_UNIT_TYPES, NATIONAL_STYLES } from './types';

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

type Draw = (ctx: Ctx) => ReactElement;

/** Card illustrations; the map icons live in iconsArt.tsx. */
const FULL: Record<ArtUnitType, Draw> = {
  infantry: drawInfantry,
  stormtroopers: drawStormtroopers,
  mountain: drawMountain,
  motorised: drawMotorised,
  cavalry: drawCavalry,
  armouredCar: drawArmouredCar,
  artillery: drawArtillery,
  heavyArtillery: drawHeavyArtillery,
  antiTank: drawAntiTank,
  lightTank: drawLightTank,
  tank: drawTank,
  heavyTank: drawHeavyTank,
  tankDestroyer: drawTankDestroyer,
};

export interface UnitArtProps {
  type: ArtUnitType;
  gen: ArtGen;
  nation: ArtNation;
  /** Insignia colour for the bloc styles (the owning nation's colour). */
  accent?: string;
  width?: number;
  variant?: 'full' | 'icon';
  className?: string;
  title?: string;
}

export function UnitArt({ type, gen, nation, accent, width, variant = 'full', className, title }: UnitArtProps): JSX.Element {
  const icon = variant === 'icon';
  const drawGen = resolveArtGen(type, gen);
  const ctx = makeCtx(nation, drawGen, icon, accent);
  const vw = icon ? 40 : 96;
  const vh = icon ? 24 : 60;
  const w = width ?? vw;
  const h = (w * vh) / vw;
  return (
    <svg
      width={w}
      height={Math.round(h * 100) / 100}
      viewBox={`0 0 ${vw} ${vh}`}
      className={className}
      role="img"
      aria-label={title ?? `${nation} ${type} (${drawGen})`}
    >
      {title && <title>{title}</title>}
      {(icon ? ICONS : FULL)[type](ctx)}
    </svg>
  );
}
