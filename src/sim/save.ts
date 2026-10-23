// Save format. Saves are kept in the browser; the game is paused while closed
// (no offline progression — that belongs to the future server-backed version,
// where the server owns the clock). Older saves are upgraded on load; a save
// from a newer version is refused rather than misread.
import { pushEvent } from './events';
import { SCHEMA_VERSION, createInitialState, newId, nextSerial } from './state';
import { nationName, sentence } from './text';
import type { GameState, NationId, UnitType } from './types';
import type { World } from './world';

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

/**
 * Brings a save up to date with a scenario that has grown since it was made:
 * nations and provinces added since then join as they would start a new
 * campaign (their starting forces, buildings and treasury, under computer
 * control, at peace with everyone). The save's own random stream is untouched.
 * Returns the nations that joined. A save from a map that was redrawn rather
 * than added to (provinces gone, or a newcomer's homeland already in the save)
 * cannot be reconciled and is refused.
 */
export function joinNewcomers(state: GameState, world: World): NationId[] {
  const newProvinces = new Set(world.provinceIds.filter((id) => !state.provinces[id]));
  const newNations = world.nationIds.filter((id) => !state.nations[id]);
  if (!newProvinces.size && !newNations.length) return [];
  // Provinces that vanished, or a newcomer whose homeland the save already holds
  // (a redrawn country rather than an added one), cannot be reconciled.
  const redrawn =
    Object.keys(state.provinces).some((id) => !world.provinces[id]) ||
    newNations.some((n) => !world.provinceIds.some((id) => newProvinces.has(id) && world.provinces[id].core === n));
  if (redrawn) throw new Error('This save comes from an earlier map that this version no longer has, and cannot be loaded.');
  const joining = new Set<string>(newNations);
  // A fresh campaign on the same seed supplies the newcomers' starting state.
  const fresh = createInitialState(world, { seed: state.seed, humanNation: null, speed: state.settings.speed });
  for (const id of newProvinces) state.provinces[id] = fresh.provinces[id];
  for (const id of newNations) {
    const nation = fresh.nations[id];
    for (const rel of Object.values(nation.relations)) rel.since = state.tick;
    if (nation.ai) nation.ai.nextThinkTick += state.tick;
    for (const [other, existing] of Object.entries(state.nations)) {
      if (joining.has(other)) continue;
      nation.relations[other] = { status: 'peace', since: state.tick, truceUntil: 0 };
      existing.relations[id] = { status: 'peace', since: state.tick, truceUntil: 0 };
    }
    state.nations[id] = nation;
  }
  for (const [key, serial] of Object.entries(fresh.serials)) if (joining.has(key.split(':')[0])) state.serials[key] = serial;
  // The newcomers' armies and the garrisons of new provinces, renumbered so they cannot collide.
  for (const army of Object.values(fresh.armies)) {
    if (!joining.has(army.owner) && !newProvinces.has(army.province)) continue;
    army.id = newId(state, 'a');
    for (const unit of army.units) unit.id = newId(state, 'u');
    if (!joining.has(army.owner)) {
      army.serial = nextSerial(state, army.owner, 'army');
      for (const unit of army.units) unit.serial = nextSerial(state, army.owner, unit.type as UnitType);
    }
    state.armies[army.id] = army;
  }
  if (newNations.length) {
    const names = newNations.map((id) => nationName(world, id));
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
    pushEvent(state, 'join', sentence(`${list} ${names.length === 1 ? 'joins' : 'join'} the campaign, fresh from 1914.`), { severity: 'system' });
  }
  return newNations;
}
