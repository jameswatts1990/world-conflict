// Local save slots in browser storage. The prototype is paused while closed:
// loading resumes exactly where the save was made.
import { deserializeGame, serializeGame, type GameState, type SaveFile } from '../../sim';

export const SLOTS = ['autosave', 'slot-1', 'slot-2', 'slot-3'] as const;
export type SlotId = (typeof SLOTS)[number];

const KEY_PREFIX = 'world-conflict:save:';

export interface SlotInfo {
  slot: SlotId;
  file: SaveFile | null;
  error?: string;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function slotLabel(slot: SlotId): string {
  return slot === 'autosave' ? 'Autosave' : `Slot ${slot.split('-')[1]}`;
}

export function listSlots(scenarioId: string): SlotInfo[] {
  const ls = storage();
  return SLOTS.map((slot) => {
    const raw = ls?.getItem(KEY_PREFIX + slot);
    if (!raw) return { slot, file: null };
    try {
      return { slot, file: deserializeGame(raw, scenarioId) };
    } catch (e) {
      return { slot, file: null, error: (e as Error).message };
    }
  });
}

export function saveToSlot(slot: SlotId, state: GameState, label: string): void {
  const ls = storage();
  if (!ls) throw new Error('Browser storage is unavailable.');
  ls.setItem(KEY_PREFIX + slot, serializeGame(state, label));
}

export function loadFromSlot(slot: SlotId, scenarioId: string): SaveFile {
  const raw = storage()?.getItem(KEY_PREFIX + slot);
  if (!raw) throw new Error('That slot is empty.');
  return deserializeGame(raw, scenarioId);
}

export function downloadSave(state: GameState, label: string): void {
  const blob = new Blob([serializeGame(state, label)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `world-conflict-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
