// What a computer opponent knows when it thinks: its territory and fronts,
// where friendly and hostile power stands, and what the enemy fields.
import { AI } from '../config/ai';
import { UNITS } from '../config/units';
import { applyCommand, type Command } from '../commands';
import {
  areHostile,
  armyMorale,
  armyPower,
  atWar,
  isArmyInTransit,
  nationEconomy,
  scaledTicks,
  type NationEconomy,
} from '../queries';
import { NEUTRAL, RESOURCE_KEYS, type AiMemory, type Army, type GameState, type NationId, type PartialResources, type ProvinceId } from '../types';
import type { World } from '../world';

export interface Ctx {
  state: GameState;
  world: World;
  me: NationId;
  mem: AiMemory;
  eco: NationEconomy;
  minutes: number;
  owned: ProvinceId[];
  ownedSet: Set<ProvinceId>;
  enemies: NationId[];
  /** My armies (all, including marching ones). */
  armies: Army[];
  /** My power standing in or marching to each province. */
  presence: Map<ProvinceId, number>;
  /** Power of armies at war with me (stationed or arriving) per province; neutral garrisons included. */
  hostile: Map<ProvinceId, number>;
  /** Hostile power that could strike each owned province next (in it or one connection away; neutrals never attack). */
  threat: Map<ProvinceId, number>;
  /** Owned provinces touching enemy or neutral territory. */
  frontier: Set<ProvinceId>;
  /** Share of armoured units among my enemies' armies (0..1). */
  enemyArmour: number;
  /** Resources set aside for research. */
  savings: PartialResources;
}

export function issue(ctx: Ctx, cmd: Command): boolean {
  return applyCommand(ctx.state, ctx.world, cmd).ok;
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
  const presence = new Map<ProvinceId, number>();
  const hostile = new Map<ProvinceId, number>();
  const striking = new Map<ProvinceId, number>();
  const armies: Army[] = [];
  let enemyUnits = 0;
  let enemyArmour = 0;
  for (const id of Object.keys(state.armies).sort()) {
    const a = state.armies[id];
    const where = armyLocation(a);
    const pw = armyPower(state, a);
    if (a.owner === me) {
      armies.push(a);
      presence.set(where, (presence.get(where) ?? 0) + pw);
    } else if (areHostile(state, me, a.owner)) {
      hostile.set(where, (hostile.get(where) ?? 0) + pw);
      if (a.owner !== NEUTRAL) {
        striking.set(where, (striking.get(where) ?? 0) + pw);
        for (const u of a.units) {
          enemyUnits++;
          if (UNITS[u.type].class === 'armour') enemyArmour++;
        }
      }
    }
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
    mem: state.nations[me].ai!,
    eco: nationEconomy(state, world, me),
    minutes: state.tick / 60 / state.settings.durationScale,
    owned,
    ownedSet,
    enemies,
    armies,
    presence,
    hostile,
    threat,
    frontier,
    enemyArmour: enemyUnits > 0 ? enemyArmour / enemyUnits : 0,
    savings: {},
  };
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

export function graceOver(ctx: Ctx, seconds: number): boolean {
  return ctx.state.tick >= scaledTicks(ctx.state, seconds);
}
