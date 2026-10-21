// Timing settings. One simulation tick is one game-second. At Standard speed
// and 1x client speed, one game-second passes per real second.

export const TICKS_PER_MINUTE = 60;

export interface SpeedPreset {
  label: string;
  /** Multiplies every duration (movement, construction, research, combat rounds). */
  durationScale: number;
  /** Campaign time limit in game-minutes, before durationScale is applied. */
  timeLimitMinutes: number;
  available: boolean;
}

export const SPEED_PRESETS: Record<'standard' | 'slow', SpeedPreset> = {
  // Target: a full campaign in roughly 2–3 hours of real time.
  standard: { label: 'Standard (~2.5 h)', durationScale: 1, timeLimitMinutes: 150, available: true },
  // Target: roughly one week. Needs the server-backed version (offline progression).
  slow: { label: 'Slow (~1 week)', durationScale: 67, timeLimitMinutes: 150, available: false },
};

/** How often (in ticks, before durationScale) periodic systems run. */
export const INTERVALS = {
  combatRound: 10,
  supplyUpdate: 5,
  victoryCheck: 5,
  /** Healing / attrition / unit morale step for armies. */
  armyUpkeepStep: 10,
  /** Province morale, national morale and city growth. */
  civicUpdate: 10,
};

/**
 * Client-side simulation speed multipliers. 1x is the real campaign pace;
 * everything above it is a development/testing aid and is labelled as such in the UI.
 */
export const CLIENT_SPEEDS = [
  { multiplier: 1, label: '1x', dev: false },
  { multiplier: 2, label: '2x', dev: false },
  { multiplier: 5, label: 'DEV 5x', dev: true },
  { multiplier: 20, label: 'DEV 20x', dev: true },
  { multiplier: 60, label: 'DEV 60x', dev: true },
  { multiplier: 200, label: 'DEV 200x', dev: true },
] as const;

/** Max ticks the client loop will simulate per animation frame (prevents spiral of death). */
export const MAX_TICKS_PER_FRAME = 240;
