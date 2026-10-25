// Unit artwork: an illustration for unit cards ('full')
// and a bold single silhouette for map counters ('icon'), coloured per nation
// and redrawn per technology generation. Imported models use baked portraits,
// with the owning nation's badge on full-size cards.
import type { JSX, ReactElement } from 'react';
import { makeCtx, type Ctx } from './context';
import { drawCavalry } from './cavalryArt';
import { drawAntiTank, drawArtillery, drawHeavyArtillery } from './gunsArt';
import { ICONS } from './iconsArt';
import { CornerBadge, drawInfantry, drawMountain, drawStormtroopers } from './infantryArt';
import { unitAssetPortrait } from './UnitAssets';
import { drawHeavyTank, drawLightTank, drawTank, drawTankDestroyer } from './tanksArt';
import { resolveArtGen, type ArtGen, type ArtNation, type ArtUnitType } from './types';
import { drawArmouredCar, drawMotorised } from './vehiclesArt';

export type { ArtGen, ArtNation, ArtUnitType, ArtVariant } from './types';
export { ART_GENS, ART_NATIONS, ART_UNIT_TYPES, NATIONAL_STYLES, UNIT_GENS, resolveArtGen } from './types';

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
  const portrait = unitAssetPortrait(type, drawGen);
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
      {portrait ? (
        <g data-unit-asset={type}>
          <image href={portrait} x={0} y={0} width={vw} height={vh} />
          {!icon && <CornerBadge ctx={ctx} />}
        </g>
      ) : (icon ? ICONS : FULL)[type](ctx)}
    </svg>
  );
}
