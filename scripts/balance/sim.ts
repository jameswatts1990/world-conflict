// A copy of the simulation loaded for a balance run: the working tree's, or another commit's
// (checked out by `--vs <ref>`, see git.ts). Overrides are set on the config modules before the
// rest of the simulation is imported, so values read once at import time (the scenario's
// starting setup, for instance) see them too. Each worker process loads one Sim with one set of
// overrides. Nothing here imports the simulation statically: the balance scripts must be able to
// drive an older or newer copy of it.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type * as SimApi from '../../src/sim/index';
import type { AI } from '../../src/sim/config/ai';
import type { BUILDINGS } from '../../src/sim/config/buildings';
import type { POWERS } from '../../src/sim/config/powers';
import type { BUILDING_UNLOCKED_BY, TECHS, UNIT_UNLOCKED_BY } from '../../src/sim/config/research';
import type { GEN_YEAR, UNITS, VETERANCY } from '../../src/sim/config/units';
import type { seedToState } from '../../src/sim/rng';
import type { combatSystem } from '../../src/sim/systems/combat';
import type { World } from '../../src/sim/world';
import { applyOverrides, type Override } from './overrides';

export interface SimConfig {
  AI: typeof AI;
  BUILDINGS: typeof BUILDINGS;
  BUILDING_UNLOCKED_BY: typeof BUILDING_UNLOCKED_BY;
  GEN_YEAR: typeof GEN_YEAR;
  POWERS: typeof POWERS;
  TECHS: typeof TECHS;
  UNITS: typeof UNITS;
  UNIT_UNLOCKED_BY: typeof UNIT_UNLOCKED_BY;
  VETERANCY: typeof VETERANCY;
  [name: string]: unknown;
}

export interface Sim {
  /** Directory of the simulation sources (…/src/sim). */
  root: string;
  api: typeof SimApi;
  /** Every export of src/sim/config/*.ts, by name. */
  config: SimConfig;
  seedToState: typeof seedToState;
  combatSystem: typeof combatSystem;
}

export async function loadSim(root: string, overrides: readonly Override[]): Promise<Sim> {
  const config: Record<string, unknown> = {};
  const files = readdirSync(join(root, 'config'))
    .filter((f) => f.endsWith('.ts'))
    .sort();
  for (const file of files) Object.assign(config, await import(/* @vite-ignore */ join(root, 'config', file)));
  applyOverrides(config, overrides);
  const api = (await import(/* @vite-ignore */ join(root, 'index.ts'))) as typeof SimApi;
  const rng = (await import(/* @vite-ignore */ join(root, 'rng.ts'))) as { seedToState: typeof seedToState };
  const combat = (await import(/* @vite-ignore */ join(root, 'systems', 'combat.ts'))) as { combatSystem: typeof combatSystem };
  return { root, api, config: config as SimConfig, seedToState: rng.seedToState, combatSystem: combat.combatSystem };
}

/** The theatre balance runs are played in. */
export function balanceWorld(sim: Sim): World {
  return sim.api.buildWorld(sim.api.EUROPE_SCENARIO);
}

/** What a run's content is: nations, unit types, buildings and research, as the simulation it ran defines them. */
export interface Catalogue {
  scenario: string;
  nations: { id: string; name: string; tier: string; playable: boolean }[];
  /** Unit types, with the research and buildings a nation needs to raise one. */
  units: { id: string; name: string; short: string; unlockedBy: string | null; requires: string[]; firstGen: string }[];
  buildings: { id: string; name: string; unlockedBy: string | null }[];
  techs: { id: string; name: string; col: number }[];
}

export function catalogue(sim: Sim, world: World): Catalogue {
  const { config, api } = sim;
  return {
    scenario: world.scenario.id,
    nations: world.nationIds.map((id) => {
      const n = world.nations[id];
      return { id, name: n.name, tier: n.power, playable: config.POWERS[n.power].playable };
    }),
    units: api.UNIT_TYPES.map((id) => {
      const u = config.UNITS[id];
      const firstGen = u.models.ww1 ? 'ww1' : u.models.interwar ? 'interwar' : 'ww2';
      return { id, name: u.name, short: u.short, unlockedBy: config.UNIT_UNLOCKED_BY[id] ?? null, requires: [...u.requires], firstGen };
    }),
    buildings: Object.keys(config.BUILDINGS).map((id) => ({
      id,
      name: config.BUILDINGS[id as keyof typeof config.BUILDINGS].name,
      unlockedBy: config.BUILDING_UNLOCKED_BY[id] ?? null,
    })),
    techs: config.TECHS.map((t) => ({ id: t.id, name: t.name, col: t.col })),
  };
}
