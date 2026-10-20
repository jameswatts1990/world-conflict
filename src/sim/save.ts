// Save format. The local prototype stores saves in the browser; the game is
// paused while closed (no offline progression — that belongs to the future
// server-backed version, where the server owns the clock).
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

export function deserializeGame(json: string, expectedScenario?: string): SaveFile {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Save data is not valid JSON.');
  }
  const file = data as SaveFile;
  if (!file || file.format !== SAVE_FORMAT) throw new Error('Not a World Conflict save.');
  if (file.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Save version ${file.schemaVersion} is not supported (expected ${SCHEMA_VERSION}).`);
  }
  if (!file.state || typeof file.state.tick !== 'number' || !file.state.provinces || !file.state.nations) {
    throw new Error('Save data is incomplete.');
  }
  if (expectedScenario && file.state.scenarioId !== expectedScenario) {
    throw new Error(`Save belongs to a different scenario (${file.state.scenarioId}).`);
  }
  return file;
}
