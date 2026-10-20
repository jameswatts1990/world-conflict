// Coherent placeholder iconography: NATO-style unit symbols, simple resource
// and building glyphs. All inline SVG, no external assets.
import type { ReactElement } from 'react';
import type { BuildingType, ResourceKey, UnitType } from '../sim';

interface IconProps {
  size?: number;
  className?: string;
  title?: string;
}

/** NATO APP-6 style frames: infantry ✕, artillery ●, armour ⬭. */
export function UnitGlyph({ type, size = 18, color = 'currentColor' }: { type: UnitType; size?: number; color?: string }) {
  const w = size;
  const h = size * 0.7;
  return (
    <svg width={w} height={h} viewBox="0 0 20 14" aria-label={type} role="img">
      <rect x="1" y="1" width="18" height="12" fill="none" stroke={color} strokeWidth="1.6" />
      {type === 'infantry' && <path d="M1 1 L19 13 M19 1 L1 13" stroke={color} strokeWidth="1.4" />}
      {type === 'artillery' && <circle cx="10" cy="7" r="2.6" fill={color} />}
      {type === 'tank' && <rect x="4.5" y="4" width="11" height="6" rx="3" fill="none" stroke={color} strokeWidth="1.4" />}
    </svg>
  );
}

const RESOURCE_PATHS: Record<ResourceKey, ReactElement> = {
  money: (
    <>
      <circle cx="10" cy="10" r="7.5" fill="#d6b25e" stroke="#8a6b22" strokeWidth="1.2" />
      <path d="M12.6 6.6c-.6-.7-1.6-1-2.6-1-1.7 0-2.6.9-2.6 2 0 2.6 5.4 1.4 5.4 4.2 0 1.1-1 2-2.8 2-1.1 0-2.1-.4-2.8-1.1M10 4v12" stroke="#5c4613" strokeWidth="1.3" fill="none" />
    </>
  ),
  materials: (
    <>
      <path d="M3 8h14v8H3z" fill="#9aa4ad" stroke="#4d565e" strokeWidth="1.2" />
      <path d="M5 4h10v4H5z" fill="#b8c1c9" stroke="#4d565e" strokeWidth="1.2" />
      <path d="M7 12h6" stroke="#4d565e" strokeWidth="1.2" />
    </>
  ),
  fuel: (
    <path d="M10 2.5c3 4 5.5 6.8 5.5 9.7A5.5 5.5 0 0 1 4.5 12.2C4.5 9.3 7 6.5 10 2.5z" fill="#3a3a3a" stroke="#111" strokeWidth="1.1" />
  ),
  manpower: (
    <>
      <circle cx="10" cy="6" r="3.2" fill="#c9a27e" stroke="#5e4630" strokeWidth="1.1" />
      <path d="M4 17c.5-4 3-6 6-6s5.5 2 6 6z" fill="#6f7f5a" stroke="#38412c" strokeWidth="1.1" />
    </>
  ),
};

export function ResourceIcon({ kind, size = 16, title }: IconProps & { kind: ResourceKey }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" role="img" aria-label={title ?? kind}>
      {title && <title>{title}</title>}
      {RESOURCE_PATHS[kind]}
    </svg>
  );
}

const BUILDING_PATHS: Record<BuildingType, ReactElement> = {
  industry: <path d="M2 17V9l4 2.5V9l4 2.5V9l4 2.5V4h3v13z" />,
  barracks: <path d="M3 17V8l7-5 7 5v9h-5v-5H8v5z" />,
  armsWorks: <path d="M8 3h4v3l2 2v9H6V8l2-2z" />,
  tankWorks: <path d="M2 13h16v3H2zM4 9h10v4H4zM8 6h4v3H8zM12 7h6v1.5h-6z" />,
  refinery: <path d="M9 2h2l3 15h-2.2L10 8l-1.8 9H6zM5 17h10" />,
  fortifications: <path d="M2 17V8h3v2h2V8h3v2h2V8h3v2h1V8h2v9z" />,
  supplyDepot: <path d="M3 7l7-4 7 4v10H3zM7 11h6v6H7z" />,
};

export function BuildingIcon({ kind, size = 16, title }: IconProps & { kind: BuildingType }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" role="img" aria-label={title ?? kind} fill="currentColor">
      {title && <title>{title}</title>}
      {BUILDING_PATHS[kind]}
    </svg>
  );
}

export const RESOURCE_LABEL: Record<ResourceKey, string> = {
  money: 'Money',
  materials: 'Industrial materials',
  fuel: 'Fuel',
  manpower: 'Manpower',
};
