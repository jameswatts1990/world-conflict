// Small colour helpers for nation-tinted UI and map graphics.
import { NEUTRAL_COLOR } from '../sim/scenario/europe/nations';
import type { World } from '../sim';

function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear blend of two hex colours (t = 0 gives a, t = 1 gives b). */
export function mix(a: string, b: string, t: number): string {
  const ca = parse(a);
  const cb = parse(b);
  const out = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export const lighten = (c: string, t: number) => mix(c, '#ffffff', t);
export const darken = (c: string, t: number) => mix(c, '#000000', t);

/**
 * The same hue made bright and rich (HSL lightness set, saturation raised), where mixing
 * with white would wash it out: for lighting up the player's own land.
 */
export function vivid(hex: string, lightness: number, saturation = 1.3): string {
  const [r, g, b] = parse(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l0 = (max + min) / 2;
  const s0 = d === 0 ? 0 : d / (1 - Math.abs(2 * l0 - 1));
  let h = 0;
  if (d !== 0) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const s = Math.min(1, s0 * saturation);
  const c = (1 - Math.abs(2 * lightness - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const [r1, g1, b1] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const m = lightness - c / 2;
  return `#${[r1, g1, b1].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

export function ownerColor(world: World, owner: string): string {
  return owner === 'neutral' ? NEUTRAL_COLOR : (world.nations[owner]?.color ?? '#999999');
}

/** Health bar colour: green, amber, red. */
export function strengthColor(s: number): string {
  if (s > 0.66) return '#6fd160';
  if (s > 0.33) return '#e9b53b';
  return '#e5533d';
}
