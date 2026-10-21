import { RESOURCE_KEYS, durationText, type GameState, type PartialResources } from '../sim';

/** Game ticks -> "h:mm:ss" (Standard speed: one tick is one second). */
export function formatClock(ticks: number, state?: GameState): string {
  const seconds = Math.floor(ticks / (state?.settings.durationScale ?? 1));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Game ticks -> "45s", "2m 30s". */
export function formatDuration(ticks: number, state?: GameState): string {
  return durationText(ticks / (state?.settings.durationScale ?? 1));
}

/** Whole seconds in running prose: "90 seconds", "1 minute", "4 minutes". */
export function proseDuration(seconds: number): string {
  if (seconds % 60 !== 0) return `${seconds} seconds`;
  const m = seconds / 60;
  return `${m} minute${m === 1 ? '' : 's'}`;
}

/** A campaign length as an adjective: "2½-hour", "3-hour", "100-minute". */
export function hoursText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  if (minutes % 60 === 0) return `${h}-hour`;
  if (minutes % 60 === 30) return `${h}½-hour`;
  return `${minutes}-minute`;
}

export function fmt(n: number): string {
  if (Math.abs(n) >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toLocaleString('en-GB');
}

export function fmtRate(n: number): string {
  const r = Math.round(n * 10) / 10;
  return `${r >= 0 ? '+' : ''}${Math.abs(r) >= 100 ? Math.round(r) : r.toFixed(1)}`;
}

export function costParts(cost: PartialResources): { key: (typeof RESOURCE_KEYS)[number]; amount: number }[] {
  return RESOURCE_KEYS.filter((k) => (cost[k] ?? 0) > 0).map((k) => ({ key: k, amount: cost[k]! }));
}
