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

export function ownerColor(world: World, owner: string): string {
  return owner === 'neutral' ? NEUTRAL_COLOR : (world.nations[owner]?.color ?? '#999999');
}

/** Health bar colour: green, amber, red. */
export function strengthColor(s: number): string {
  if (s > 0.66) return '#6fd160';
  if (s > 0.33) return '#e9b53b';
  return '#e5533d';
}
