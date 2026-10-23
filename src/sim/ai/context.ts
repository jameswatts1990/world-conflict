// What a computer opponent knows when it thinks: its territory and fronts,
// where friendly and hostile power stands, and what the enemy fields. It plays
// by the fog of war: it knows what a human in its place could, the map, the
// military power figures every Diplomacy window shows, and the armies it (and,
// with Liaison Officers, its co-belligerents) can see. Other nations' armies are read
// only through this context, never straight from the state.
import { AI, aiLevel, type AiLevel } from '../config/ai';
import { UNITS } from '../config/units';
import { applyCommand, type Command } from '../commands';
import {
  areHostile,
  armyMorale,
  armyPower,
  atWar,
  isArmyInTransit,
  isContender,
  nationEconomy,
  scaledTicks,
  type NationEconomy,
} from '../queries';
import { NEUTRAL, RESOURCE_KEYS, type AiMemory, type Army, type GameState, type NationId, type PartialResources, type ProvinceId } from '../types';
import { isArmyVisible, visibleProvinces } from '../visibility';
import type { World } from '../world';

export interface Ctx {
  state: GameState;
  world: World;
  me: NationId;
  mem: AiMemory;
  /** How well this game's computer opponents play. */
  level: AiLevel;
  eco: NationEconomy;
  minutes: number;
  owned: ProvinceId[];
  ownedSet: Set<ProvinceId>;
  /** How many cities I hold (sizes the army). */
  ownedCities: number;
  enemies: NationId[];
  /** My armies (all, including marching ones). */
  armies: Army[];
  /** My power standing in or marching to each province. */
  presence: Map<ProvinceId, number>;
  /** Provinces in sight (fog of war): the only places where other nations' armies are known. */
  seen: ReadonlySet<ProvinceId>;
  /**
   * For a province out of sight, a guess at the strength there of the nation holding it: the part
   * of its army that is out of sight (its total is public), spread evenly over its unseen provinces.
   */
  unseen: Map<NationId, number>;
  /** Power of armies at war with me (stationed or arriving) per province, as far as I can see; neutral garrisons included. */
  hostile: Map<ProvinceId, number>;
  /** Hostile power that could strike each owned province next (in it or one connection away; neutrals never attack). */
  threat: Map<ProvinceId, number>;
  /** Owned provinces touching enemy or neutral territory. */
  frontier: Set<ProvinceId>;
  /**
   * Danger to my capital, as far as I can see or estimate: hostile power in it, in its region or the regions next
   * door, half of what stands in the regions beyond, and a share of the armies of great and major powers at peace,
   * who could declare war. A capital in the interior is still in danger once an enemy is one region away.
   */
  capitalDanger: number;
  /** Share of armoured units among my enemies' armies, as far as I have seen them (0..1). */
  enemyArmour: number;
  /** Resources set aside for research. */
  savings: PartialResources;
}

/** Which step of the AI's army handling gave an order (for tracing). */
export type AiOrderReason = 'retreat' | 'resupply' | 'recover' | 'attack' | 'stage' | 'defend' | 'strike' | 'advance';

export interface AiOrderTrace {
  tick: number;
  nation: NationId;
  armyId: string;
  from: ProvinceId;
  to: ProvinceId;
  reason: AiOrderReason;
}

// Development aid: a sink that sees every AI move order with its reason. It
// only observes, so turning it on never changes what the simulation computes.
let traceSink: ((t: AiOrderTrace) => void) | null = null;

export function setAiOrderTrace(sink: ((t: AiOrderTrace) => void) | null): void {
  traceSink = sink;
}

export function issue(ctx: Ctx, cmd: Command, reason?: AiOrderReason): boolean {
  const army = traceSink && cmd.type === 'move' ? ctx.state.armies[cmd.armyId] : undefined;
  const from = army ? armyLocation(army) : null;
  const ok = applyCommand(ctx.state, ctx.world, cmd).ok;
  if (ok && traceSink && cmd.type === 'move' && from && reason) {
    traceSink({ tick: ctx.state.tick, nation: ctx.me, armyId: cmd.armyId, from, to: cmd.to, reason });
  }
  return ok;
}

export function nationPower(state: GameState, nation: NationId): number {
  let p = 0;
  for (const a of Object.values(state.armies)) if (a.owner === nation) p += armyPower(state, a);
  return p;
}

/** Where an army is, or will be at the end of its current leg. */
export function armyLocation(army: Army): ProvinceId {
  return army.move?.leg ? army.move.leg.to : army.province;
}

export function buildContext(state: GameState, world: World, me: NationId): Ctx {
  const owned = world.provinceIds.filter((id) => state.provinces[id].owner === me);
  const ownedSet = new Set(owned);
  const enemies = world.nationIds.filter((id) => atWar(state, me, id));
  const mem = state.nations[me].ai!;
  const seen = visibleProvinces(state, world, me);
  const presence = new Map<ProvinceId, number>();
  const hostile = new Map<ProvinceId, number>();
  const striking = new Map<ProvinceId, number>();
  const armies: Army[] = [];
  // Every nation's total military power is public; what is out of sight is estimated from it.
  const total = new Map<NationId, number>();
  const inSight = new Map<NationId, number>();
  const capital = world.nations[me].capital;
  // Danger is reckoned by region (a city with the lands round it): the capital's own region and the regions next
  // to it, then the regions beyond.
  const ring1 = new Set(world.vicinity[capital]);
  const ring2 = new Set([...ring1].flatMap((id) => world.vicinity[id]).filter((id) => id !== capital && !ring1.has(id)));
  const reach = (pid: ProvinceId) => (pid === capital || ring1.has(pid) ? 1 : ring2.has(pid) ? AI.capitalDepth : 0);
  // Enemies count in full; powers at peace could declare war, except minor powers, which never start one.
  const menace = (owner: NationId) => (areHostile(state, me, owner) ? 1 : isContender(world, owner) ? AI.peacetimeVigilance : 0);
  const guardCapital = ownedSet.has(capital);
  let capitalDanger = 0;
  for (const id of Object.keys(state.armies).sort()) {
    const a = state.armies[id];
    const where = armyLocation(a);
    const pw = armyPower(state, a);
    if (a.owner === me) {
      armies.push(a);
      presence.set(where, (presence.get(where) ?? 0) + pw);
      continue;
    }
    if (a.owner !== NEUTRAL) total.set(a.owner, (total.get(a.owner) ?? 0) + pw);
    if (!isArmyVisible(a, me, seen)) continue;
    if (a.owner !== NEUTRAL) inSight.set(a.owner, (inSight.get(a.owner) ?? 0) + pw);
    if (guardCapital && a.owner !== NEUTRAL) capitalDanger += pw * reach(where) * menace(a.owner);
    if (areHostile(state, me, a.owner)) {
      hostile.set(where, (hostile.get(where) ?? 0) + pw);
      if (a.owner !== NEUTRAL) striking.set(where, (striking.get(where) ?? 0) + pw);
    }
  }
  const unseen = new Map<NationId, number>();
  for (const n of world.nationIds) {
    if (n === me) continue;
    const dark = world.provinceIds.filter((pid) => state.provinces[pid].owner === n && !seen.has(pid)).length;
    if (dark > 0) unseen.set(n, Math.max(0, (total.get(n) ?? 0) - (inSight.get(n) ?? 0)) / dark);
  }
  // Out of sight near the capital, a nation's estimated strength in each hidden province stands in.
  if (guardCapital) {
    for (const pid of [...ring1, ...ring2]) {
      const o = state.provinces[pid].owner;
      if (seen.has(pid) || o === me || o === NEUTRAL) continue;
      capitalDanger += (unseen.get(o) ?? 0) * reach(pid) * menace(o);
    }
  }
  // What the enemy fields: each enemy's armour share as last seen, weighted by its strength.
  let weight = 0;
  let armour = 0;
  for (const e of enemies) {
    const w = total.get(e) ?? 0;
    weight += w;
    armour += w * (mem.armourSeen?.[e] ?? 0);
  }
  // An enemy army can only strike one province at a time: count the biggest
  // stack next door in full and the rest only partly, so a single army does
  // not tie down the whole frontier.
  const threat = new Map<ProvinceId, number>();
  const frontier = new Set<ProvinceId>();
  for (const pid of owned) {
    let biggest = 0;
    let rest = 0;
    for (const n of world.neighbors[pid]) {
      const s = striking.get(n.id) ?? 0;
      if (s > biggest) {
        rest += biggest;
        biggest = s;
      } else rest += s;
      const o = state.provinces[n.id].owner;
      if (o !== me && (o === NEUTRAL || atWar(state, me, o))) frontier.add(pid);
    }
    threat.set(pid, (striking.get(pid) ?? 0) + biggest + rest * 0.25);
  }
  return {
    state,
    world,
    me,
    mem,
    level: aiLevel(state),
    eco: nationEconomy(state, world, me),
    minutes: state.tick / 60 / state.settings.durationScale,
    owned,
    ownedSet,
    ownedCities: owned.filter((id) => world.provinces[id].city).length,
    enemies,
    armies,
    presence,
    seen,
    unseen,
    hostile,
    threat,
    frontier,
    capitalDanger,
    enemyArmour: weight > 0 ? armour / weight : 0,
    savings: {},
  };
}

/**
 * Notes what this AI can see of other nations' armies this think: each nation's share of armour
 * among its units in sight moves the running estimate in memory (AI.armourSightingWeight).
 * Runs once per think, before the context is built.
 */
export function observeForces(state: GameState, world: World, me: NationId): void {
  const mem = state.nations[me].ai!;
  const seen = visibleProvinces(state, world, me);
  const units = new Map<NationId, number>();
  const armour = new Map<NationId, number>();
  for (const id of Object.keys(state.armies).sort()) {
    const a = state.armies[id];
    if (a.owner === me || a.owner === NEUTRAL || !isArmyVisible(a, me, seen)) continue;
    for (const u of a.units) {
      units.set(a.owner, (units.get(a.owner) ?? 0) + 1);
      if (UNITS[u.type].class === 'armour') armour.set(a.owner, (armour.get(a.owner) ?? 0) + 1);
    }
  }
  if (units.size === 0) return;
  const tally = (mem.armourSeen ??= {});
  const w = AI.armourSightingWeight;
  for (const [n, count] of units) {
    const share = (armour.get(n) ?? 0) / count;
    const before = tally[n];
    tally[n] = before === undefined ? share : before * (1 - w) + share * w;
  }
}

/** Spending is allowed if a reserve of income (plus research savings) remains afterwards. */
export function affordableWithReserve(ctx: Ctx, cost: PartialResources): boolean {
  const r = ctx.state.nations[ctx.me].resources;
  return RESOURCE_KEYS.every((k) => {
    const reserve = k === 'money' ? Math.max(0, ctx.eco.income.money * AI.reserveMinutes) : 0;
    return r[k] - (cost[k] ?? 0) >= reserve + (ctx.savings[k] ?? 0);
  });
}

/** Armies free to receive orders: stationary and not marching. */
export function idleArmies(ctx: Ctx): Army[] {
  return Object.keys(ctx.state.armies)
    .sort()
    .map((id) => ctx.state.armies[id])
    .filter((a) => a.owner === ctx.me && !a.move && !isArmyInTransit(a));
}

export function avgStrength(army: Army): number {
  return army.units.reduce((s, u) => s + u.strength, 0) / Math.max(1, army.units.length);
}

/** Is the army fit to attack (rested and in good spirits)? */
export function battleReady(army: Army): boolean {
  return armyMorale(army) >= AI.attackMorale && avgStrength(army) >= AI.attackStrength;
}

/** On several fronts, the enemy this AI concentrates on (null on one front, or if its level does not plan so). */
export function mainEnemy(ctx: Ctx): NationId | null {
  const focus = ctx.mem.focus;
  if (!ctx.level.interiorLines || ctx.enemies.length < 2 || !focus || !ctx.enemies.includes(focus)) return null;
  return focus;
}

export function graceOver(ctx: Ctx, seconds: number): boolean {
  return ctx.state.tick >= scaledTicks(ctx.state, seconds);
}
