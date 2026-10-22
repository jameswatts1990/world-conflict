// Save format. Saves are kept in the browser; the game is paused while closed
// (no offline progression — that belongs to the future server-backed version,
// where the server owns the clock). Older saves are upgraded on load; a save
// from a newer version is refused rather than misread.
import { SCHEMA_VERSION } from './state';
import type { GameState } from './types';

export const SAVE_FORMAT = 'world-conflict-save';

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  schemaVersion: number;
  savedAt: string;
  label: string;
  state: GameState;
}

export function serializeGame(state: GameState, label: string, now = new Date()): string {
  const file: SaveFile = { format: SAVE_FORMAT, schemaVersion: SCHEMA_VERSION, savedAt: now.toISOString(), label, state };
  return JSON.stringify(file);
}

/** Upgrades a save's state one schema version at a time: entry n turns version n into n + 1. */
const MIGRATIONS: Record<number, (state: GameState) => void> = {
  // 3: rates are derived by the UI, so nations no longer store lastRates. Job prices and
  // the peace retry delay are optional fields that older saves simply lack.
  2: (state) => {
    for (const n of Object.values(state.nations)) delete (n as unknown as Record<string, unknown>).lastRates;
  },
  // 4: armies no longer rout or surrender; the scoreboard counts ordered withdrawals instead.
  3: (state) => {
    for (const a of Object.values(state.armies)) delete (a as unknown as Record<string, unknown>).routedUntil;
    for (const n of Object.values(state.nations)) {
      const stats = n.stats as typeof n.stats & { armiesSurrendered?: number };
      delete stats.armiesSurrendered;
      stats.retreats = 0;
    }
  },
};

/**
 * Saves from before cities, morale and the research tree (schema 1, and schema 2 from builds
 * without them) hold a different game state and cannot be upgraded.
 */
function hasDepth(state: GameState): boolean {
  return Object.values(state.nations).every((n) => Array.isArray(n.research?.active));
}

export function deserializeGame(json: string, expectedScenario?: string): SaveFile {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Save data is not valid JSON.');
  }
  const file = data as SaveFile;
  if (!file || file.format !== SAVE_FORMAT) throw new Error('Not a World Conflict save.');
  const version = file.schemaVersion;
  if (!Number.isInteger(version) || version < 1) throw new Error(`Save version ${version} is not supported.`);
  if (version > SCHEMA_VERSION) {
    throw new Error(`This save comes from a newer version of the game (save version ${version}, this build reads up to ${SCHEMA_VERSION}).`);
  }
  if (!file.state || typeof file.state.tick !== 'number' || !file.state.provinces || !file.state.nations) {
    throw new Error('Save data is incomplete.');
  }
  if (expectedScenario && file.state.scenarioId !== expectedScenario) {
    throw new Error(`Save belongs to a different scenario (${file.state.scenarioId}).`);
  }
  if (version < SCHEMA_VERSION && (!MIGRATIONS[version] || !hasDepth(file.state))) {
    throw new Error('This save comes from an earlier version of the game, before cities, morale and the research tree, and cannot be loaded.');
  }
  for (let v = version; v < SCHEMA_VERSION; v++) MIGRATIONS[v](file.state);
  file.schemaVersion = file.state.schemaVersion = SCHEMA_VERSION;
  return file;
}
