// What the tuner (tune.ts) may change, and within what range. Settings that differ by difficulty
// live in AI_LEVELS; the spaces tune Normal, the reference AI. Each space is a set of config
// values ("knobs"), searched between their bounds; log-scaled knobs are searched by ratio
// (as useful at 0.01 as at 0.05). Add a space here, or pass --knob PATH=MIN..MAX for a one-off.
//
// The bounds hold the design, not just what runs: the AI attacks only when it has the edge
// (attackRatio ≥ 1), and maxWarsOnTarget stays out of the search because ganging up on a power
// about to win is wanted behaviour (CLAUDE.md). A first full run pushed both to their floors.
import type { Override } from './overrides';

export interface Knob {
  path: string;
  min: number;
  max: number;
  /** Rounded to a whole number when applied. */
  integer?: boolean;
  /** Searched on a log scale. */
  log?: boolean;
}

export const SPACES: Record<string, { description: string; knobs: Knob[] }> = {
  ai: {
    description: "The AI's appetite for war and peace, and how much strength it wants before attacking",
    knobs: [
      { path: 'AI.warChance', min: 0.005, max: 0.06, log: true },
      { path: 'AI.warStrengthRatio', min: 0.8, max: 1.8 },
      { path: 'AI.secondWarRatio', min: 0.2, max: 1.2 },
      { path: 'AI.minorTargetWeight', min: 0.2, max: 1.5 },
      { path: 'AI_LEVELS.normal.peaceGraceSeconds', min: 180, max: 900, log: true },
      { path: 'AI_LEVELS.normal.acceptPeaceRatio', min: 0.6, max: 1.1 },
      { path: 'AI.acceptPeaceMorale', min: 25, max: 55 },
      { path: 'AI.warWearinessSeconds', min: 600, max: 3000, log: true },
      { path: 'AI_LEVELS.normal.attackRatio', min: 1, max: 1.6 },
    ],
  },
  diplomacy: {
    description: 'When the AI goes to war and makes peace',
    knobs: [
      { path: 'AI.warChance', min: 0.005, max: 0.06, log: true },
      { path: 'AI.warChancePerAggression', min: 0.01, max: 0.12, log: true },
      { path: 'AI.warStrengthRatio', min: 0.8, max: 1.8 },
      { path: 'AI.minorTargetWeight', min: 0.2, max: 1.5 },
      { path: 'AI.leaderAlarmVp', min: 1, max: 6, integer: true },
      { path: 'AI_LEVELS.normal.acceptPeaceRatio', min: 0.6, max: 1.1 },
      { path: 'AI.offerPeaceRatio', min: 0.4, max: 0.8 },
      { path: 'AI.warWearinessSeconds', min: 600, max: 3000, log: true },
    ],
  },
  military: {
    description: 'How the AI sizes attacks, garrisons and its army',
    knobs: [
      { path: 'AI_LEVELS.normal.attackRatio', min: 1, max: 1.6 },
      { path: 'AI.attackMargin', min: 0, max: 15 },
      { path: 'AI_LEVELS.normal.defenceFactor', min: 0.6, max: 1.3 },
      { path: 'AI.upkeepShare', min: 0.3, max: 0.65 },
      { path: 'AI.unitsPerProvince', min: 2, max: 4.5 },
      { path: 'AI_LEVELS.normal.maxCampaigns', min: 1, max: 3, integer: true },
      { path: 'AI.massingMargin', min: 1, max: 1.5 },
    ],
  },
};

/** "AI_LEVELS.normal.attackRatio=1..1.6": a knob for one tuning run. Whole-number bounds on a whole-number value make an integer knob; a wide range of positive values is searched by ratio. */
export function parseKnob(text: string, current: (path: string) => unknown): Knob {
  const m = /^\s*([\w.]+)\s*=\s*(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)\s*$/.exec(text);
  if (!m) throw new Error(`--knob "${text}" should look like AI_LEVELS.normal.attackRatio=1..1.6`);
  const [path, min, max] = [m[1], Number(m[2]), Number(m[3])];
  if (!(min < max)) throw new Error(`--knob ${path}: the minimum should be below the maximum`);
  const now = current(path);
  if (typeof now !== 'number') throw new Error(`--knob ${path} is not a number in the config`);
  return { path, min, max, integer: Number.isInteger(now) && Number.isInteger(min) && Number.isInteger(max), log: min > 0 && max / min >= 4 };
}

/** Knob value for a position 0..1 along its range. */
export function knobValue(k: Knob, x: number): number {
  const t = Math.min(1, Math.max(0, x));
  const v = k.log ? Math.exp(Math.log(k.min) + t * (Math.log(k.max) - Math.log(k.min))) : k.min + t * (k.max - k.min);
  return k.integer ? Math.round(v) : Number(v.toPrecision(4));
}

/** Position 0..1 of a value along a knob's range. */
export function knobPosition(k: Knob, v: number): number {
  const t = k.log ? (Math.log(Math.max(k.min, v)) - Math.log(k.min)) / (Math.log(k.max) - Math.log(k.min)) : (v - k.min) / (k.max - k.min);
  return Math.min(1, Math.max(0, t));
}

export function knobOverrides(knobs: readonly Knob[], xs: readonly number[]): Override[] {
  return knobs.map((k, i) => ({ path: k.path, value: knobValue(k, xs[i]) }));
}
