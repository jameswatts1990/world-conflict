// Monochrome building glyphs (20x20, currentColor) and the coloured slot tiles built from them.
import { useId } from 'react';
import type { ReactElement } from 'react';
import type { ArtBuilding } from './CitySkyline';

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

const GLYPHS: Record<ArtBuilding, ReactElement> = {
  // factory with a sawtooth roof and a chimney
  industry: <path d="M2 17V9l4 2.5V9l4 2.5V9l4 2.5V4h3v13z" />,
  // classical exchange: pediment, entablature, columns, steps
  market: <path d="M10 2.2l8.2 4.6V8H1.8V6.8zM3 9h14v1.5H3zM4 11.4h2.2V16H4zM8.9 11.4h2.2V16H8.9zM13.8 11.4H16V16h-2.2zM2 16.8h16v1.6H2z" />,
  // lightning bolt
  powerPlant: <path d="M11.8 1.5L3.8 11.2h5.1L7.2 18.5l9-10.2h-5.2z" />,
  // derrick
  refinery: <path d="M9 2h2l3 15h-2.2L10 8l-1.8 9H6zM4 16.6h12v1.8H4z" />,
  // apartment block with windows
  housing: (
    <path fillRule="evenodd" d="M4 2h12v16H4zM6 4v2.2h2.4V4zm5.6 0v2.2H14V4zM6 8.1v2.2h2.4V8.1zm5.6 0v2.2H14V8.1zM6 12.2v2.2h2.4v-2.2zm5.6 0v2.2H14v-2.2zM8.8 15v3h2.4v-3z" />
  ),
  // mortarboard
  university: <path d="M10 2.8l9 4.6-9 4.6-9-4.6zM5 10.4v3.6c0 1.6 2.4 3 5 3s5-1.4 5-3v-3.6l-5 2.6zM16.4 8.3h1.2v5.6h-1.2z" />,
  barracks: <path d="M3 17V8l7-5 7 5v9h-5v-5H8v5z" />,
  // castle keep with a gate
  academy: (
    <path fillRule="evenodd" d="M3 18v-2.2h1.6V9H3V3.4h2.7v2h2.1v-2h4.4v2h2.1v-2H17V9h-1.6v6.8H17V18zM8.4 18v-3.2a1.6 1.6 0 0 1 3.2 0V18z" />
  ),
  armsWorks: <path d="M8 3h4v3l2 2v9H6V8l2-2z" />,
  // lorry with a canvas tilt
  motorPool: (
    <>
      <path d="M1 6.2a1.7 1.7 0 0 1 1.7-1.7h8.6V13H1zM1 13.6h17.6v1.4H1z" />
      <path fillRule="evenodd" d="M12.2 7.6h3.6l2.8 3.2V13h-6.4zm1.2 1.1v2.1h3.3l-1.7-2.1z" />
      <path fillRule="evenodd" d="M4.6 13.7a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2zm0 1.4a.7.7 0 1 0 0 1.4.7.7 0 0 0 0-1.4zM14.6 13.7a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2zm0 1.4a.7.7 0 1 0 0 1.4.7.7 0 0 0 0-1.4z" />
    </>
  ),
  tankWorks: <path d="M2 13h16v3H2zM4 9h10v4H4zM8 6h4v3H8zM12 7h6v1.5h-6z" />,
  // red-cross style cross
  hospital: <path d="M7.4 2.4h5.2v5h5v5.2h-5v5h-5.2v-5h-5V7.4h5z" />,
  // radio mast with broadcast arcs
  propaganda: (
    <>
      <path d="M9.1 6.6h1.8l2.8 11.6h-2L10 12l-1.7 6.2h-2zM10 2.6a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4z" />
      <path d="M6.3 1.9a3.9 3.9 0 0 0 0 5.2M13.7 1.9a3.9 3.9 0 0 1 0 5.2M3.6.6a6.5 6.5 0 0 0 0 7.8M16.4.6a6.5 6.5 0 0 1 0 7.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  // watchtower
  garrisonHq: (
    <path fillRule="evenodd" d="M4.2 5.6L10 1.4l5.8 4.2zM5.4 6.2h9.2v4.2H5.4zm1.5 1.1v1.7h6.2V7.3zM6.2 10.4h2L6.3 18.5H4.3zM11.8 10.4h2l1.9 8.1h-2zM7.3 13.4h5.4v1.4H7.3z" />
  ),
  fortifications: <path d="M2 17V8h3v2h2V8h3v2h2V8h3v2h1V8h2v9z" />,
  // stacked supply crates
  supplyDepot: (
    <path fillRule="evenodd" d="M1.5 10.6h8v8h-8zM2.9 12v5.2h5.2V12zM2.9 16.2L7.1 12h1v1l-4.2 4.2h-1zM10.5 10.6h8v8h-8zM11.9 12v5.2h5.2V12zM11.9 16.2l4.2-4.2h1v1l-4.2 4.2h-1zM6 2.4h8v8H6zM7.4 3.8V9h5.2V3.8zM7.4 8l4.2-4.2h1v1L8.4 9h-1z" />
  ),
  // steam locomotive on a rail
  railway: (
    <path fillRule="evenodd" d="M2 8.6h9.6v5.6H2zM3.4 4.8h2.2v3.8H3.4zM11.2 4.2H18v1.3h-.8v8.7h-5.6V5.5h-.4zm2.2 2.6v2.6H16V6.8zM5 13.4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM9.6 13.4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM14.6 14a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2zM1 17.8h18V19H1z" />
  ),
  // casemate gun over the waves
  coastalBattery: (
    <path d="M2 13.6l2-5.2h8.4l2 5.2zM11.4 9.4l7.4-2.6v1.9l-6.8 2.5zM1 16.4c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0V19H1z" />
  ),
};

export function BuildingGlyph({ kind, size = 16, title }: { kind: ArtBuilding; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" role="img" aria-label={title ?? kind} fill="currentColor">
      {title && <title>{title}</title>}
      {GLYPHS[kind]}
    </svg>
  );
}

interface TilePalette { top: string; bottom: string; border: string; glyph: string; pip: string }

const TILE_PALETTE: Record<BuildingCategory, TilePalette> = {
  economy: { top: '#7d5f27', bottom: '#4b3816', border: '#b88f45', glyph: '#f7dea0', pip: '#f2c862' },
  military: { top: '#5c6135', bottom: '#33371d', border: '#8f9656', glyph: '#e5eabd', pip: '#cdd68a' },
  civic: { top: '#35556f', bottom: '#1e3245', border: '#6189ad', glyph: '#d8e8f6', pip: '#9fc8ec' },
  infrastructure: { top: '#4c5158', bottom: '#2b2f34', border: '#7f8892', glyph: '#e4e7ea', pip: '#c2c8cf' },
};

/** A square slot tile: the glyph on a category-coloured plate with level pips along the bottom. */
export function BuildingTile({ kind, level, maxLevel, size = 44 }: { kind: ArtBuilding; level: number; maxLevel: number; size?: number }) {
  const gid = `bt${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const pal = TILE_PALETTE[BUILDING_CATEGORY[kind]];
  const pips = Math.max(1, Math.min(6, Math.floor(maxLevel)));
  const lvl = Math.max(0, Math.min(pips, Math.floor(level)));
  const built = lvl > 0;
  const pw = pips > 4 ? 4 : 5;
  const gap = 2;
  const total = pips * pw + (pips - 1) * gap;
  const px0 = 22 - total / 2;
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label={`${kind} ${lvl}/${pips}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={pal.top} />
          <stop offset="1" stopColor={pal.bottom} />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="42" height="42" rx="6" fill={`url(#${gid})`} stroke={pal.border} strokeWidth="1.5"
        opacity={built ? 1 : 0.55} />
      <path d="M6 2.6h32" stroke="#ffffff" strokeOpacity="0.16" strokeWidth="1" strokeLinecap="round" />
      <g transform="translate(10 5) scale(1.2)" fill={pal.glyph} color={pal.glyph} opacity={built ? 1 : 0.42}>
        {GLYPHS[kind]}
      </g>
      {Array.from({ length: pips }, (_, i) => (
        <rect key={i} x={px0 + i * (pw + gap)} y="35" width={pw} height="3.4" rx="1"
          fill={i < lvl ? pal.pip : 'none'} stroke={pal.pip} strokeWidth="0.9" strokeOpacity={i < lvl ? 1 : 0.55} />
      ))}
    </svg>
  );
}
