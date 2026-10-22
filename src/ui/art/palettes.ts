// Colour vocabulary for the unit artwork: per-nation uniform and vehicle
// paint for each generation, plus the shared material colours.
import type { ArtGen, ArtNation } from './types';

export type { ArtGen, ArtNation } from './types';

export interface NationPalette {
  uniform: string;
  uniformDark: string;
  vehicle: string;
  vehicleDark: string;
  /** Camouflage colours. The first entry is the base coat (equal to `vehicle`). */
  camo?: string[];
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('');
}

/** Lighten (amt > 0, toward white) or darken (amt < 0, toward black) a #rrggbb colour. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = parseHex(hex);
  if (amt >= 0) return toHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  return toHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
}

function pal(uniform: string, vehicle: string, camo?: string[]): NationPalette {
  return {
    uniform,
    uniformDark: shade(uniform, -0.3),
    vehicle,
    vehicleDark: shade(vehicle, -0.32),
    ...(camo ? { camo } : {}),
  };
}

const FR_CAMO = ['#a8915a', '#5a6a3b', '#6f5034'];
const DE_WW1_CAMO = ['#8f8460', '#55603f', '#78573a'];
const PL_CAMO = ['#857b51', '#634a33', '#4d5c38'];

export const NATION_PALETTES: Record<ArtNation, Record<ArtGen, NationPalette>> = {
  uk: {
    ww1: pal('#8a7a4f', '#7d6b45'),
    interwar: pal('#8a7a4f', '#6f6f45'),
    ww2: pal('#8a7a4f', '#6b6a42'),
  },
  fr: {
    ww1: pal('#7d93ad', FR_CAMO[0], FR_CAMO),
    interwar: pal('#9a8a55', FR_CAMO[0], FR_CAMO),
    ww2: pal('#9a8a55', FR_CAMO[0], FR_CAMO),
  },
  de: {
    ww1: pal('#6f7462', DE_WW1_CAMO[0], DE_WW1_CAMO),
    interwar: pal('#6f7462', '#626a58'),
    ww2: pal('#5f6656', '#4b5157'),
  },
  it: {
    ww1: pal('#7b7f63', '#7b7f63'),
    interwar: pal('#7b7f63', '#b19c6b'),
    ww2: pal('#7b7f63', '#b19c6b'),
  },
  es: {
    ww1: pal('#a8966a', '#7d7f78'),
    interwar: pal('#7f7a52', '#5e6b45'),
    ww2: pal('#7f7a52', '#5e6b45'),
  },
  pl: {
    ww1: pal('#7a7f86', '#7d6b45'),
    interwar: pal('#7d7a55', PL_CAMO[0], PL_CAMO),
    ww2: pal('#7d7a55', PL_CAMO[0], PL_CAMO),
  },
  neutral: {
    ww1: pal('#8a8a82', '#7c7f7a'),
    interwar: pal('#8a8a82', '#7c7f7a'),
    ww2: pal('#8a8a82', '#7c7f7a'),
  },
};

/** German 1918 camouflage separated its colour fields with thin black lines. */
export function camoHasLines(nation: ArtNation, gen: ArtGen): boolean {
  return nation === 'de' && gen === 'ww1';
}

// Shared materials.
export const OUTLINE = '#1d1f24';
export const SKIN = '#e2b58e';
export const SKIN_DARK = '#c08e68';
export const BOOT = '#2f2823';
export const LEATHER = '#5e4129';
export const LEATHER_LIGHT = '#7d5a3a';
export const WOOD = '#8a6239';
export const WOOD_DARK = '#5f4127';
export const STEEL = '#4e535a';
export const STEEL_LIGHT = '#8c939b';
export const BLADE = '#d3d7dc';
export const BRASS = '#c9a043';
export const BRASS_DARK = '#8f6f25';
export const TYRE = '#2b2c2f';
export const TRACK = '#3a3935';
export const TRACK_LIGHT = '#5d5b55';
export const ROCK = '#8b8579';
export const ROCK_DARK = '#615c53';
export const SNOW = '#eef1f4';
export const FLAME = '#f39a2b';
export const FLAME_CORE = '#ffe17a';

/** Horse coat per nation (bay, chestnut, black-brown ...) and its mane colour. */
export const HORSE_COATS: Record<ArtNation, { coat: string; mane: string }> = {
  uk: { coat: '#7a4a2a', mane: '#2b1d15' },
  fr: { coat: '#8d5630', mane: '#4a2a16' },
  de: { coat: '#3f2f25', mane: '#1c1511' },
  it: { coat: '#9a6b3e', mane: '#3a2817' },
  es: { coat: '#a78150', mane: '#3f2c19' },
  pl: { coat: '#7e4626', mane: '#2e1a10' },
  neutral: { coat: '#6e5a48', mane: '#2e251d' },
};

/** Two-colour pennant flown from lances and staffs. */
export const PENNANTS: Record<ArtNation, [string, string]> = {
  uk: ['#c8102e', '#ffffff'],
  fr: ['#1f4fa8', '#c8102e'],
  de: ['#ffffff', '#1d1f24'],
  it: ['#1f7a3a', '#c8102e'],
  es: ['#c8102e', '#f1bf00'],
  pl: ['#ffffff', '#d4213d'],
  neutral: ['#9a9c9f', '#d9dadc'],
};
