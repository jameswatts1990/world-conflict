// The unit lab: staged battles between armies of equal cost, to see what each unit type is
// worth for its price, by technology level, ground and role. Both sides are two great powers
// with their national specialities removed, the same technologies and Regular troops, in a
// province held by the defender: one per terrain without forts, plus open ground behind forts.
//
// An army "built around" a unit type spends half its budget on that type and the rest on line
// infantry, the way armies are actually raised (support units need a screen). Its value index
// is how much line infantry it can face evenly, per unit of its own cost, relative to an army of
// line infantry alone: 1.0 is priced like line infantry, 1.3 gives 30% more for the money.
// Costs are priced in minutes of an average great power's base output (scenario data, which
// `--output` can replace), with upkeep counted for a number of minutes, so fuel is dear.
import type { GameState, NationId, ResourceKey, UnitType } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import type { Sim } from './sim';

/** The unit every army is measured in. */
export const REFERENCE: UnitType = 'infantry';
/** The ground name for open ground behind forts of this level. */
export const FORTIFIED = 'fortified';
const FORT_LEVEL = 2;

export interface LabSettings {
  /** Army size, in line infantry's worth. */
  budget: number;
  /** Battles per data point (each with its own dice). */
  seeds: number;
  /** Minutes of upkeep counted in a unit's price. */
  upkeepMinutes: number;
  /** A great power's output per minute to price resources by, replacing the scenario's base output. */
  output?: Partial<Record<ResourceKey, number>>;
}

export type Role = 'attack' | 'defence';

/** Where a battle is fought: a terrain, or FORTIFIED. */
export type Ground = string;

export type LabCell =
  | { kind: 'index'; level: string; unit: UnitType; ground: Ground; role: Role }
  | { kind: 'matchup'; level: string; unit: UnitType; versus: UnitType; ground: Ground };

export interface LabResult {
  cell: LabCell;
  /** Price of the unit type under test, in line infantry. */
  price: number;
  /** index: line infantry (in units) the army can face evenly; matchup: the attacker's mean outcome (-1..1). */
  value: number;
  /** Cost of the army under test, in line infantry. */
  armyCost: number;
  /** "4 TNK + 6 INF". */
  army: string;
  battles: number;
}

export interface TechLevel {
  /** Equipment generation it fields (ww1, interwar, ww2). */
  id: string;
  /** Last research column included. */
  maxCol: number;
  /** Unit types with equipment at this level. */
  units: UnitType[];
}

/**
 * One level per equipment generation: all research up to the column before the next generation's
 * first equipment, so each level fields one generation (read from the research tree, not hard-coded).
 */
export function techLevels(sim: Sim): TechLevel[] {
  const { TECHS, UNITS } = sim.config;
  const gens = sim.api.UNIT_GENS;
  const maxCol = Math.max(...TECHS.map((t) => t.col));
  return gens.map((gen, i) => {
    const next = gens[i + 1];
    const firstNext = next
      ? Math.min(...TECHS.filter((t) => t.effects.some((e) => e.kind === 'unitModel' && e.gen === next)).map((t) => t.col))
      : Infinity;
    const units = sim.api.UNIT_TYPES.filter((type) => gens.slice(0, i + 1).some((g) => UNITS[type].models[g]));
    return { id: gen, maxCol: Number.isFinite(firstNext) ? firstNext - 1 : maxCol, units };
  });
}

/** Every terrain in the theatre, then open ground behind forts. */
export function labGrounds(world: World): Ground[] {
  return [...[...new Set(world.provinceIds.map((p) => world.provinces[p].terrain))].sort(), FORTIFIED];
}

interface Lab {
  world: World;
  state: GameState;
  attacker: NationId;
  defender: NationId;
  province: Record<Ground, string>;
  /** Price of each unit type, in line infantry. */
  price: Partial<Record<UnitType, number>>;
}

const labs = new Map<string, Lab>();

function setUp(sim: Sim, level: TechLevel, settings: LabSettings): Lab {
  const { api, config } = sim;
  const base = api.EUROPE_SCENARIO;
  const scenario = { ...base, id: `${base.id}-unit-lab`, nations: base.nations.map((n) => ({ ...n, speciality: undefined })) };
  const world = api.buildWorld(scenario);
  const state = api.createInitialState(world, { seed: 1, humanNation: null });
  const great = world.nationIds.filter((id) => world.nations[id].power === 'great');
  const [attacker, defender] = great;
  const techs = config.TECHS.filter((t) => t.col <= level.maxCol).map((t) => t.id);
  for (const id of world.nationIds) {
    state.nations[id].ai = null;
    state.nations[id].controller = 'human';
    state.nations[id].research.completed = [...techs];
  }
  const war = { status: 'war' as const, since: 0, truceUntil: 0 };
  state.nations[attacker].relations[defender] = { ...war };
  state.nations[defender].relations[attacker] = { ...war };
  const province: Lab['province'] = {};
  for (const ground of labGrounds(world)) {
    const terrain = ground === FORTIFIED ? 'plains' : ground;
    const used = new Set(Object.values(province));
    const pid = world.provinceIds.find((p) => world.provinces[p].terrain === terrain && !used.has(p)) ?? world.provinceIds.find((p) => !used.has(p))!;
    province[ground] = pid;
    const buildings = ground === FORTIFIED ? { fortifications: FORT_LEVEL } : {};
    Object.assign(state.provinces[pid], { owner: defender, buildings, construction: null, recruitQueue: [], capture: null });
  }
  // Prices in minutes of an average great power's base output.
  const output = { money: 0, materials: 0, fuel: 0, manpower: 0 };
  for (const pid of world.provinceIds) {
    const core = world.provinces[pid].core;
    if (!core || !great.includes(core)) continue;
    for (const k of api.RESOURCE_KEYS) output[k] += world.provinces[pid].production[k] / great.length;
  }
  Object.assign(output, settings.output);
  const minutes = (type: UnitType) => {
    const cost = api.recruitCost(state, attacker, type);
    const upkeep = config.UNITS[type].upkeepPerMinute;
    return api.RESOURCE_KEYS.reduce((s, k) => s + ((cost[k] ?? 0) + (upkeep[k] ?? 0) * settings.upkeepMinutes) / Math.max(1e-9, output[k]), 0);
  };
  const price: Lab['price'] = {};
  for (const type of api.UNIT_TYPES) price[type] = minutes(type) / minutes(REFERENCE);
  return { world, state, attacker, defender, province, price };
}

function labFor(sim: Sim, level: string, settings: LabSettings): Lab {
  const key = `${level}:${settings.upkeepMinutes}:${JSON.stringify(settings.output ?? {})}`;
  let lab = labs.get(key);
  if (!lab) {
    const def = techLevels(sim).find((l) => l.id === level);
    if (!def) throw new Error(`Unknown technology level ${level}`);
    lab = setUp(sim, def, settings);
    labs.set(key, lab);
  }
  return lab;
}

type Army = [UnitType, number][];

/** An army of about `budget` line infantry's worth: half on `unit`, the rest line infantry. */
export function armyAround(price: Lab['price'], unit: UnitType, budget: number): Army {
  if (unit === REFERENCE) return [[REFERENCE, budget]];
  const p = price[unit]!;
  const n = Math.max(1, Math.round(budget / 2 / p));
  const infantry = Math.max(0, Math.round(budget - n * p));
  return infantry > 0 ? [[unit, n], [REFERENCE, infantry]] : [[unit, n]];
}

function armyCost(price: Lab['price'], army: Army): number {
  return army.reduce((s, [t, n]) => s + price[t]! * n, 0);
}

const MAX_ROUNDS = 500;

/** One battle to the death; the attacker's share of its army's value left, minus the defender's. */
function battle(sim: Sim, lab: Lab, attack: Army, defend: Army, ground: Ground, seed: number): number {
  const { api, config } = sim;
  const { state, world } = lab;
  for (const id of Object.keys(state.armies)) delete state.armies[id];
  state.battles = {};
  state.events = [];
  state.rng = sim.seedToState(seed);
  const pid = lab.province[ground];
  const raise = (owner: NationId, army: Army) =>
    api.createArmy(
      state,
      owner,
      pid,
      army.flatMap(([type, n]) => Array.from({ length: n }, () => api.createUnit(state, owner, type, { xp: config.VETERANCY.startingXp }))),
    );
  const a = raise(lab.attacker, attack);
  const d = raise(lab.defender, defend);
  for (let round = 0; round < MAX_ROUNDS && state.armies[a.id] && state.armies[d.id]; round++) sim.combatSystem(state, world);
  const left = (army: typeof a, plan: Army) =>
    state.armies[army.id] ? army.units.reduce((s, u) => s + lab.price[u.type]! * Math.max(0, u.strength), 0) / armyCost(lab.price, plan) : 0;
  return left(a, attack) - left(d, defend);
}

function meanOutcome(sim: Sim, lab: Lab, attack: Army, defend: Army, ground: Ground, settings: LabSettings, salt: number): number {
  let sum = 0;
  for (let s = 0; s < settings.seeds; s++) sum += battle(sim, lab, attack, defend, ground, salt * 1000 + s + 1);
  return sum / settings.seeds;
}

function cellSalt(cell: LabCell): number {
  const text = JSON.stringify(cell);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) % 1_000_000;
}

export function runLabCell(sim: Sim, cell: LabCell, settings: LabSettings): LabResult {
  const lab = labFor(sim, cell.level, settings);
  const salt = cellSalt(cell);
  const army = armyAround(lab.price, cell.unit, settings.budget);
  const cost = armyCost(lab.price, army);
  const label = army.map(([t, n]) => `${n} ${sim.config.UNITS[t].short}`).join(' + ');
  if (cell.kind === 'matchup') {
    const enemy = armyAround(lab.price, cell.versus, settings.budget);
    const value = meanOutcome(sim, lab, army, enemy, cell.ground, settings, salt);
    return { cell, price: lab.price[cell.unit]!, value, armyCost: cost, army: label, battles: settings.seeds };
  }
  // Index: find how much line infantry this army fights to a draw. The outcome falls as the
  // infantry grows; search for the sign change, then interpolate between the two counts. Every
  // count is fought with the same dice, so the outcome changes only with the count.
  const outcome = new Map<number, number>();
  const at = (k: number) => {
    if (!outcome.has(k)) {
      const infantry: Army = [[REFERENCE, k]];
      const v = cell.role === 'attack' ? meanOutcome(sim, lab, army, infantry, cell.ground, settings, salt) : -meanOutcome(sim, lab, infantry, army, cell.ground, settings, salt);
      outcome.set(k, v);
    }
    return outcome.get(k)!;
  };
  const maxK = Math.ceil(settings.budget * 8);
  let lo = 0; // largest count it beats (0: none tried)
  let hi = 0; // smallest count that beats it (0: none tried)
  let k = Math.max(1, Math.round(cost * (cell.role === 'attack' ? 0.6 : 1.6)));
  for (let step = 0; step < 16; step++) {
    if (at(k) > 0) lo = k;
    else hi = k;
    if (hi && lo && hi - lo <= 1) break;
    if (!hi) {
      if (k >= maxK) break;
      k = Math.min(maxK, Math.ceil(k * 1.5));
    } else if (!lo) {
      if (k <= 1) break;
      k = Math.max(1, Math.floor(k / 1.5));
    } else k = Math.floor((lo + hi) / 2);
  }
  let value: number;
  if (lo && hi) {
    const a = at(lo);
    const b = at(hi);
    value = lo + (hi - lo) * (a / (a - b));
  } else value = lo ? maxK : 0.5;
  return { cell, price: lab.price[cell.unit]!, value, armyCost: cost, army: label, battles: outcome.size * settings.seeds };
}
