// Inline SVG iconography: resource and building glyphs and a line-icon set for
// the HUD. All original artwork, no external assets.
// Detailed unit, building and branch artwork lives in src/ui/art.
import type { ReactElement } from 'react';
import type { BuildingType, ResourceKey, Terrain } from '../sim';
import { BuildingGlyphArt } from './art/adapters';

interface IconProps {
  size?: number;
  className?: string;
  title?: string;
}

// ---------------------------------------------------------------------------
// Resources (20 × 20, full colour)
// ---------------------------------------------------------------------------

const RESOURCE_PATHS: Record<ResourceKey, ReactElement> = {
  money: (
    <>
      <circle cx="10" cy="10" r="8.2" fill="#e2b54c" stroke="#7c5d18" strokeWidth="1.2" />
      <circle cx="10" cy="10" r="6" fill="none" stroke="#a78128" strokeWidth="0.9" />
      <path d="M12.3 7.2c-.5-.6-1.3-.9-2.3-.9-1.4 0-2.2.7-2.2 1.6 0 2.2 4.6 1.2 4.6 3.6 0 .9-.9 1.7-2.4 1.7-1 0-1.8-.3-2.4-.9M10 4.9v10.2" stroke="#5c4410" strokeWidth="1.3" fill="none" />
    </>
  ),
  materials: (
    <>
      <path d="M1 16.5L2.6 12.4H8.6L10.2 16.5Z" fill="#9fb0bf" stroke="#3d4955" strokeWidth="0.9" />
      <path d="M9.8 16.5L11.4 12.4H17.4L19 16.5Z" fill="#9fb0bf" stroke="#3d4955" strokeWidth="0.9" />
      <path d="M5.4 12L7 7.9H13L14.6 12Z" fill="#c3cfda" stroke="#3d4955" strokeWidth="0.9" />
      <path d="M3.2 13.4H8M12 13.4H16.8M7.6 8.9H12.4" stroke="#eef3f7" strokeWidth="0.8" />
    </>
  ),
  fuel: (
    <>
      <path d="M10 2.2c3.2 4.3 5.9 7.4 5.9 10.5a5.9 5.9 0 0 1-11.8 0c0-3.1 2.7-6.2 5.9-10.5z" fill="#1d1f22" stroke="#e39a35" strokeWidth="1.3" />
      <path d="M7.4 12.6a2.8 2.8 0 0 0 2 2.7" stroke="#f6d39a" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    </>
  ),
  manpower: (
    <>
      <path d="M5 12.4c0-3.9 2.2-6.8 5-6.8s5 2.9 5 6.8z" fill="#86965a" stroke="#3a4322" strokeWidth="1" />
      <path d="M2.2 13.3c0-1 3.5-1.8 7.8-1.8s7.8.8 7.8 1.8-3.5 1.7-7.8 1.7-7.8-.7-7.8-1.7z" fill="#6f7d48" stroke="#3a4322" strokeWidth="1" />
      <path d="M7 8.6c.8-1.2 1.8-1.8 3-1.8" stroke="#c4d29a" strokeWidth="0.9" fill="none" strokeLinecap="round" />
    </>
  ),
};

export function ResourceIcon({ kind, size = 16, title }: IconProps & { kind: ResourceKey }) {
  return (
    <svg className="res-icon" width={size} height={size} viewBox="0 0 20 20" role="img" aria-label={title ?? kind}>
      {title && <title>{title}</title>}
      {RESOURCE_PATHS[kind]}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Buildings (single colour, drawn in src/ui/art)
// ---------------------------------------------------------------------------

export function BuildingIcon({ kind, size = 16, title }: IconProps & { kind: BuildingType }) {
  return <BuildingGlyphArt kind={kind} size={size} title={title} />;
}

// ---------------------------------------------------------------------------
// HUD line icons (24 × 24, stroked)
// ---------------------------------------------------------------------------

const LINE = {
  research: 'M9 3h6M10 3v6.5L4.8 18.6A1.6 1.6 0 0 0 6.2 21h11.6a1.6 1.6 0 0 0 1.4-2.4L14 9.5V3M7.4 15h9.2',
  diplomacy: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM3 12h18M12 3c2.6 2.5 3.8 5.6 3.8 9s-1.2 6.5-3.8 9M12 3c-2.6 2.5-3.8 5.6-3.8 9s1.2 6.5 3.8 9',
  news: 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 12.5h7M7 16h4',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  load: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 11h18',
  help: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.3-2.5 4M12 17.2v.3',
  exit: 'M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M14.5 5.5L8 12l6.5 6.5',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 11v6M12 7.6v.4',
  move: 'M4 12h14M13 6.5l5.5 5.5-5.5 5.5',
  stop: 'M7 7h10v10H7z',
  patrol: 'M4 9h14M14.5 5.5L18 9l-3.5 3.5M20 15H6M9.5 11.5L6 15l3.5 3.5',
  split: 'M12 21v-7M12 14L6.5 6M12 14l5.5-8M4 6h5M15 6h5',
  merge: 'M6 3v4l6 6M18 3v4l-6 6M12 13v8M9 18l3 3 3-3',
  pause: 'M8.5 5v14M15.5 5v14',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  legend: 'M5 5h14v14H5zM8 9h8M8 12h8M8 15h5',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3.2 2',
  swords: 'M4 4l11 11M13 17l4-4M15 15l4.5 4.5M20 4L9 15M11 17l-4-4M9 15l-4.5 4.5',
  supply: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  warning: 'M12 4l9 16H3zM12 10v4.5M12 17.3v.2',
  anchor: 'M12 3.5a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM12 7.5V20M8 11h8M5 14a7 7 0 0 0 14 0',
  road: 'M8 4L5 20M16 4l3 16M12 5v2.5M12 10.5v3M12 16.5V19',
  city: 'M4 20V10l4-2v12M8 20V5h7v15M15 20v-8h5v8M3 20h18M10.5 8.5h2M10.5 12h2M10.5 15.5h2',
  flag: 'M6 21V4M6 4h11l-2.5 4 2.5 4H6',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  truck: 'M2 6.5h11V15H2zM13 9.5h4.2l2.8 3.2V15h-7M8.5 17a2 2 0 1 1-4 0a2 2 0 1 1 4 0M18.5 17a2 2 0 1 1-4 0a2 2 0 1 1 4 0',
  dice: 'M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zM9.4 8.5a.9.9 0 1 1-1.8 0a.9.9 0 1 1 1.8 0M16.4 8.5a.9.9 0 1 1-1.8 0a.9.9 0 1 1 1.8 0M12.9 12a.9.9 0 1 1-1.8 0a.9.9 0 1 1 1.8 0M9.4 15.5a.9.9 0 1 1-1.8 0a.9.9 0 1 1 1.8 0M16.4 15.5a.9.9 0 1 1-1.8 0a.9.9 0 1 1 1.8 0',
  radio: 'M4 10h16v10H4zM8 10L5.5 3M17.4 15a2.4 2.4 0 1 1-4.8 0a2.4 2.4 0 1 1 4.8 0M7 13.5h3.5M7 16.5h3.5',
  target: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
  factory: 'M3 20V10l5 3v-3l5 3v-3l5 3V4h3v16zM3 20h18',
  gear: 'M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z',
  morale: 'M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z',
  oil: 'M12 3.5c3.2 4.3 5.8 7.4 5.8 10.6a5.8 5.8 0 0 1-11.6 0c0-3.2 2.6-6.3 5.8-10.6z',
  plains: 'M3 19h18M7 19l-1.5-4M7 19l1.5-4.5M12 19l-1.5-5M12 19l1.5-6M17 19l-1.5-4M17 19l1.5-4.5',
  forest: 'M12 3l5 7h-3l4 6H6l4-6H7zM12 16v5',
  hills: 'M2 19c3-5 6-7 9-7s6 2 11 7M8 13c1.5-3 3.5-5 6-5s4 1.5 6 4.5',
  mountains: 'M2 20L9 7l4 7 2-3 7 9zM7.6 9.6L9 7l1.8 3.3',
  urban: 'M4 20V10l4-2v12M8 20V5h7v15M15 20v-8h5v8M3 20h18M10.5 8.5h2M10.5 12h2M10.5 15.5h2',
  marsh: 'M4 15c2-1.3 4-1.3 6 0s4 1.3 6 0 2-1 4 0M4 19c2-1.3 4-1.3 6 0s4 1.3 6 0 2-1 4 0M9 12V6M13 12V4M17 12V7',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
  fog: 'M3 9.5h11M6 13h14M3 16.5h9M15.5 16.5H21M8 6h8',
  sound: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8',
  muted: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9.5l5 5M20.5 9.5l-5 5',
  skip: 'M5 6.5l8 5.5-8 5.5zM13 6.5l6 5.5-6 5.5zM20 6v12',
} satisfies Record<string, string>;

const FILLED = {
  play: 'M8 5l11 7-11 7z',
  star: 'M12 2.8l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.1 6.4 20l1.1-6.2L3 9.4l6.2-.9z',
  more: 'M5 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM19 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4z',
} satisfies Record<string, string>;

export type IconName = keyof typeof LINE | keyof typeof FILLED;

export function Icon({ name, size = 18, className, title }: IconProps & { name: IconName | Terrain }) {
  const filled = (FILLED as Record<string, string>)[name];
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {filled ? (
        <path d={filled} fill="currentColor" />
      ) : (
        <path d={(LINE as Record<string, string>)[name]} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/** Chief-of-staff portrait for briefings (64 × 64). */
export function AdvisorPortrait({ size = 64 }: { size?: number }) {
  return (
    <svg className="advisor" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="adv-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f4253" />
          <stop offset="1" stopColor="#111a22" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="8" fill="url(#adv-bg)" />
      <path d="M6 64c1-12 11-18 26-18s25 6 26 18z" fill="#3e4b33" />
      <path d="M22 46l10 9 10-9-3-2-7 6-7-6z" fill="#2c3624" />
      <rect x="16" y="52" width="7" height="3" rx="1" fill="#b8372b" />
      <rect x="41" y="52" width="7" height="3" rx="1" fill="#b8372b" />
      <path d="M26 38h12v8l-6 4-6-4z" fill="#b48c6a" />
      <ellipse cx="32" cy="30" rx="9.5" ry="11" fill="#c89e78" />
      <path d="M17 22c0-6 7-10 15-10s15 4 15 10l3 2H14z" fill="#4a5a3b" />
      <path d="M19 24h26l-3.5 4.4H22.5z" fill="#1c2216" />
      <rect x="16" y="22" width="32" height="2.6" rx="1" fill="#b8372b" />
      <circle cx="32" cy="17.5" r="2.4" fill="#e2b54c" />
      <path d="M27 36c3 1.6 7 1.6 10 0" stroke="#7a5a40" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M25 33.5h5M34 33.5h5" stroke="#5a4130" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export const RESOURCE_LABEL: Record<ResourceKey, string> = {
  money: 'Money',
  materials: 'Industrial materials',
  fuel: 'Fuel',
  manpower: 'Manpower',
};
