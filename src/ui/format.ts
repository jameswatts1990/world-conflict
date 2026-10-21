import { RESOURCE_KEYS, type GameState, type PartialResources } from '../sim';

/** Game ticks -> "h:mm:ss" (Standard speed: one tick is one second). */
export function formatClock(ticks: number, state?: GameState): string {
  const seconds = Math.floor(ticks / (state?.settings.durationScale ?? 1));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(ticks: number, state?: GameState): string {
  const seconds = Math.ceil(ticks / (state?.settings.durationScale ?? 1));
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function fmt(n: number): string {
  if (Math.abs(n) >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toLocaleString('en-GB');
}

export function fmtRate(n: number): string {
  const r = Math.round(n * 10) / 10;
  return `${r >= 0 ? '+' : ''}${Math.abs(r) >= 100 ? Math.round(r) : r.toFixed(1)}`;
}

export const SHORT: Record<string, string> = { money: '$', materials: 'mat', fuel: 'fuel', manpower: 'men' };

export function costParts(cost: PartialResources): { key: (typeof RESOURCE_KEYS)[number]; amount: number }[] {
  return RESOURCE_KEYS.filter((k) => (cost[k] ?? 0) > 0).map((k) => ({ key: k, amount: cost[k]! }));
}

/** Population in thousands -> "9.0 M" / "650 k". */
export function fmtPopulation(thousands: number): string {
  return thousands >= 1000 ? `${(thousands / 1000).toFixed(1)} M` : `${Math.round(thousands)} k`;
}
