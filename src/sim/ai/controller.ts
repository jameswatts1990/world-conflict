// Computer opponents. The AI reads the game state and acts only by issuing the
// same validated commands a human player would. It is deterministic: all
// randomness comes from the seeded game RNG.
import { AI } from '../config/ai';
import { BUILDINGS } from '../config/buildings';
import { DIPLOMACY } from '../config/rules';
import { TECHS } from '../config/research';
import { UNITS } from '../config/units';
import { applyCommand, checkBuild, checkRecruit, checkResearch, type Command } from '../commands';
import { findPath } from '../pathfinding';
import {
  armyPower,
  atWar,
  canEnterProvince,
  fortificationReduction,
  hostileArmiesIn,
  isArmyInTransit,
  nationEconomy,
  scaledTicks,
  type NationEconomy,
} from '../queries';
import { random } from '../rng';
import {
  NEUTRAL,
  RESOURCE_KEYS,
  type Army,
  type BuildingType,
  type GameState,
  type NationId,
  type PartialResources,
  type ProvinceId,
  type UnitType,
} from '../types';
import type { World } from '../world';

interface Ctx {
  state: GameState;
  world: World;
  me: NationId;
  eco: NationEconomy;
  owned: ProvinceId[];
  ownedSet: Set<ProvinceId>;
  enemies: NationId[];
  /** Power of hostile armies adjacent to (or inside) each owned province. */
  threat: Map<ProvinceId, number>;
  /** Own stationed power per province. */
  presence: Map<ProvinceId, number>;
  aggression: number;
  economyBias: number;
  /** Resources set aside for the next research project. */
  savings: PartialResources;
}

function issue(ctx: Ctx, cmd: Command): boolean {
  return applyCommand(ctx.state, ctx.world, cmd).ok;
}

export function nationPower(state: GameState, nation: NationId): number {
  let p = 0;
  for (const a of Object.values(state.armies)) if (a.owner === nation) p += armyPower(state, a);
  return p;
}

function neighbourNations(ctx: Ctx): NationId[] {
  const set = new Set<NationId>();
  for (const pid of ctx.owned) {
    for (const n of ctx.world.neighbors[pid]) {
      const o = ctx.state.provinces[n.id].owner;
      if (o !== NEUTRAL && o !== ctx.me && !ctx.state.nations[o].eliminated) set.add(o);
    }
  }
  return [...set].sort();
}

function buildContext(state: GameState, world: World, me: NationId): Ctx {
  const owned = world.provinceIds.filter((id) => state.provinces[id].owner === me);
  const ownedSet = new Set(owned);
  const enemies = world.nationIds.filter((id) => atWar(state, me, id));
  const presence = new Map<ProvinceId, number>();
  const hostileAt = new Map<ProvinceId, number>();
  for (const a of Object.values(state.armies)) {
    const where = a.move?.leg ? a.move.leg.to : a.province;
    const pw = armyPower(state, a);
    if (a.owner === me) {
      presence.set(where, (presence.get(where) ?? 0) + pw);
    } else if (a.owner !== NEUTRAL && atWar(state, me, a.owner)) {
      hostileAt.set(where, (hostileAt.get(where) ?? 0) + pw);
    }
  }
  const threat = new Map<ProvinceId, number>();
  for (const pid of owned) {
    let t = hostileAt.get(pid) ?? 0;
    for (const n of world.neighbors[pid]) t += hostileAt.get(n.id) ?? 0;
    threat.set(pid, t);
  }
  const mem = state.nations[me].ai!;
  return {
    state,
    world,
    me,
    eco: nationEconomy(state, world, me),
    owned,
    ownedSet,
    enemies,
    threat,
    presence,
    aggression: mem.aggression,
    economyBias: mem.economyBias,
    savings: {},
  };
}

/** Spending is allowed if a reserve of income (plus research savings) remains afterwards. */
function affordableWithReserve(ctx: Ctx, cost: PartialResources): boolean {
  const r = ctx.state.nations[ctx.me].resources;
  return RESOURCE_KEYS.every((k) => {
    const reserve = k === 'money' ? Math.max(0, ctx.eco.income.money * AI.reserveMinutes) : 0;
    return r[k] - (cost[k] ?? 0) >= reserve + (ctx.savings[k] ?? 0);
  });
}

// ---------------------------------------------------------------------------
// Diplomacy
// ---------------------------------------------------------------------------

function handleDiplomacy(ctx: Ctx): void {
  const { state, world, me } = ctx;
  const myPower = nationPower(state, me);

  // Answer peace offers.
  for (const offer of state.peaceOffers.filter((o) => o.to === me)) {
    const theirPower = nationPower(state, offer.from);
    const rel = state.nations[me].relations[offer.from];
    const weary = state.tick - rel.since >= scaledTicks(state, AI.warWearinessSeconds);
    const losing = myPower < theirPower * AI.acceptPeaceRatio;
    const lostCapital = state.provinces[world.nations[me].capital].owner !== me;
    issue(ctx, { type: 'respondPeace', nation: me, from: offer.from, accept: losing || weary || lostCapital });
  }

  // Sue for peace when clearly losing, or occasionally when the war drags on.
  for (const enemy of ctx.enemies) {
    const rel = state.nations[me].relations[enemy];
    if (state.tick - rel.since < scaledTicks(state, DIPLOMACY.minWarSecondsBeforePeace)) continue;
    if (state.peaceOffers.some((o) => o.from === me && o.to === enemy)) continue;
    const theirPower = nationPower(state, enemy);
    const weary = state.tick - rel.since >= scaledTicks(state, AI.warWearinessSeconds);
    if (myPower < theirPower * 0.6 || (weary && random(state) < 0.05)) {
      issue(ctx, { type: 'offerPeace', nation: me, target: enemy });
    }
  }

  // Consider a new war against a neighbour.
  if (state.tick < scaledTicks(state, AI.peaceGraceSeconds)) return;
  const maxWars = ctx.aggression > 0.7 ? AI.maxConcurrentWars : 1;
  if (ctx.enemies.length >= maxWars) return;
  if (random(state) > 0.02 + ctx.aggression * 0.05) return;
  let best: { target: NationId; ratio: number } | null = null;
  for (const target of neighbourNations(ctx)) {
    if (atWar(state, me, target)) continue;
    if (state.tick < state.nations[me].relations[target].truceUntil) continue;
    // Avoid piling onto a nation that is already fighting two wars.
    const wars = world.nationIds.filter((x) => atWar(state, target, x)).length;
    if (wars >= 2) continue;
    const theirPower = nationPower(state, target) * (1 - 0.1 * wars) + 1;
    const ratio = myPower / theirPower;
    if (!best || ratio > best.ratio) best = { target, ratio };
  }
  const needed = AI.warStrengthRatio + (0.5 - ctx.aggression) * 0.5;
  if (best && best.ratio >= needed) issue(ctx, { type: 'declareWar', nation: me, target: best.target });
}

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------

const ECONOMY_TECHS = new Set(['industrialMobilisation', 'assemblyLine', 'syntheticFuel']);

function handleResearch(ctx: Ctx): void {
  const { state, me } = ctx;
  const research = state.nations[me].research;
  if (research.active) return;
  let best: { id: string; score: number } | null = null;
  for (const t of TECHS) {
    if (research.completed.includes(t.id) || t.requires.some((r) => !research.completed.includes(r))) continue;
    let score = 10 - t.tier * 2 + random(state) * 3;
    if (ECONOMY_TECHS.has(t.id)) score += ctx.economyBias * 6;
    if (t.tier === 3) score += 4; // WWII upgrades are the big prizes
    if (!best || score > best.score) best = { id: t.id, score };
  }
  if (!best) return;
  // Research takes priority: if it is not affordable yet, save up for it.
  if (checkResearch(state, me, best.id).ok) issue(ctx, { type: 'research', nation: me, tech: best.id });
  else ctx.savings = TECHS.find((t) => t.id === best.id)!.cost;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

function isFrontier(ctx: Ctx, pid: ProvinceId): boolean {
  return ctx.world.neighbors[pid].some((n) => ctx.state.provinces[n.id].owner !== ctx.me);
}

function handleConstruction(ctx: Ctx): void {
  const { state, world, me } = ctx;
  const candidates: { pid: ProvinceId; b: BuildingType; score: number }[] = [];
  const count = (b: BuildingType) => ctx.owned.filter((id) => (state.provinces[id].buildings[b] ?? 0) > 0).length;
  const minutes = state.tick / 60 / state.settings.durationScale;

  for (const pid of ctx.owned) {
    const p = state.provinces[pid];
    if (p.construction) continue;
    const def = world.provinces[pid];
    const core = def.core === me ? 1 : 0.5;
    const add = (b: BuildingType, score: number) => {
      if (checkBuild(state, world, me, pid, b).ok) candidates.push({ pid, b, score });
    };
    const ind = p.buildings.industry ?? 0;
    add('industry', ((def.production.money * 0.3 + def.production.materials * 0.6) * core * (1 + ctx.economyBias)) / (1 + ind * 0.6));
    if (!p.buildings.barracks && count('barracks') < 2 + Math.floor(ctx.owned.length / 4)) add('barracks', 14 + (isFrontier(ctx, pid) ? 6 : 0));
    if (!p.buildings.armsWorks && count('armsWorks') < 2) add('armsWorks', 12);
    if (!p.buildings.tankWorks && count('tankWorks') < 1 && minutes > 8 && ctx.eco.income.fuel > 4) add('tankWorks', 16);
    if (def.oil && (p.buildings.refinery ?? 0) < 2) add('refinery', 18 - (p.buildings.refinery ?? 0) * 6);
    else if (!def.oil && ctx.eco.net.fuel < 3 && count('refinery') < 3) add('refinery', 10);
    if (!p.supplied && !p.buildings.supplyDepot) add('supplyDepot', 30);
    const threat = ctx.threat.get(pid) ?? 0;
    const presence = ctx.presence.get(pid) ?? 0;
    const fort = p.buildings.fortifications ?? 0;
    if (threat > presence * 0.7 && fort < 2 && threat > 0) add('fortifications', 15 + (def.objectiveVp ?? 0) * 4);
  }
  candidates.sort((a, b) => b.score - a.score || (a.pid < b.pid ? -1 : 1));
  let builds = 0;
  for (const c of candidates) {
    if (builds >= 2) break;
    const level = (state.provinces[c.pid].buildings[c.b] ?? 0) + 1;
    if (!affordableWithReserve(ctx, BUILDINGS[c.b].cost(level))) continue;
    if (issue(ctx, { type: 'build', nation: me, province: c.pid, building: c.b })) builds++;
  }
}

// ---------------------------------------------------------------------------
// Recruitment
// ---------------------------------------------------------------------------

function handleRecruitment(ctx: Ctx): void {
  const { state, world, me } = ctx;
  const counts: Record<UnitType, number> = { infantry: 0, artillery: 0, tank: 0 };
  for (const a of Object.values(state.armies)) if (a.owner === me) for (const u of a.units) counts[u.type]++;
  let queuedUpkeep = 0;
  for (const pid of ctx.owned) {
    for (const j of state.provinces[pid].recruitQueue) {
      counts[j.unitType]++;
      queuedUpkeep += UNITS[j.unitType].upkeepPerMinute.money ?? 0;
    }
  }
  const total = counts.infantry + counts.artillery + counts.tank;
  // Army size is bounded by how much upkeep the treasury can sustain.
  const budgetShare = (0.45 + 0.3 * ctx.aggression) * (ctx.enemies.length > 0 ? 1.2 : 1);
  let upkeep = ctx.eco.upkeep.money + queuedUpkeep;
  const budget = ctx.eco.income.money * budgetShare;

  const mix: Record<UnitType, number> = { infantry: 0.55, artillery: 0.27, tank: 0.18 };
  // Prefer recruiting near the front.
  const sites = [...ctx.owned].sort((a, b) => (ctx.threat.get(b) ?? 0) - (ctx.threat.get(a) ?? 0) || (a < b ? -1 : 1));
  let recruited = 0;
  while (recruited < 3 && upkeep < budget) {
    const order = (Object.keys(mix) as UnitType[]).sort(
      (a, b) => counts[a] / (total + recruited + 1) - mix[a] - (counts[b] / (total + recruited + 1) - mix[b]),
    );
    let done = false;
    for (const type of order) {
      if (type === 'tank' && ctx.eco.net.fuel <= 1) continue;
      for (const pid of sites) {
        if (!checkRecruit(state, world, me, pid, type).ok) continue;
        if (!affordableWithReserve(ctx, UNITS[type].cost)) continue;
        if (issue(ctx, { type: 'recruit', nation: me, province: pid, unitType: type })) {
          counts[type]++;
          upkeep += UNITS[type].upkeepPerMinute.money ?? 0;
          done = true;
          break;
        }
      }
      if (done) break;
    }
    if (!done) break;
    recruited++;
  }
}

// ---------------------------------------------------------------------------
// Military
// ---------------------------------------------------------------------------

function defenderPower(ctx: Ctx, pid: ProvinceId): number {
  const { state, world } = ctx;
  let p = 0;
  for (const a of hostileArmiesIn(state, pid, ctx.me)) p += armyPower(state, a);
  const p0 = state.provinces[pid];
  const fort = p0.buildings.fortifications ?? 0;
  if (fort > 0) p /= 1 - fortificationReduction(state, p0.owner, fort);
  const terrain = world.provinces[pid].terrain;
  if (terrain === 'mountains' || terrain === 'urban') p *= 1.3;
  else if (terrain === 'hills' || terrain === 'forest') p *= 1.15;
  return p;
}

function attackNeed(ctx: Ctx, pid: ProvinceId): number {
  return defenderPower(ctx, pid) * AI.attackRatio * (1.2 - ctx.aggression * 0.4) + 4;
}

function targetValue(ctx: Ctx, pid: ProvinceId): number {
  const def = ctx.world.provinces[pid];
  const owner = ctx.state.provinces[pid].owner;
  let v = 5 + (def.objectiveVp ?? 0) * 6 + def.production.money / 10 + def.production.materials / 10;
  if (owner !== NEUTRAL && ctx.world.nations[owner]?.capital === pid) v += 6;
  if (def.core === ctx.me) v += 12; // reclaim lost core territory
  return v;
}

function neutralTargetsAllowed(ctx: Ctx): boolean {
  if (ctx.state.tick < scaledTicks(ctx.state, AI.neutralGraceSeconds)) return false;
  return ctx.enemies.length === 0 || ctx.aggression > 0.7;
}

function isTarget(ctx: Ctx, pid: ProvinceId): boolean {
  const owner = ctx.state.provinces[pid].owner;
  if (owner === ctx.me) return false;
  if (owner === NEUTRAL) return neutralTargetsAllowed(ctx);
  return atWar(ctx.state, ctx.me, owner);
}

interface Campaign {
  target: ProvinceId;
  staging: ProvinceId;
  need: number;
}

/** Picks the most attractive enemy province bordering our territory and where to mass for it. */
function chooseCampaign(ctx: Ctx): Campaign | null {
  const { state, world } = ctx;
  let best: (Campaign & { score: number }) | null = null;
  const seen = new Set<ProvinceId>();
  for (const pid of ctx.owned) {
    for (const n of world.neighbors[pid]) {
      if (seen.has(n.id) || !isTarget(ctx, n.id)) continue;
      seen.add(n.id);
      const need = attackNeed(ctx, n.id);
      const score = targetValue(ctx, n.id) / (need + 20) + random(state) * 0.02;
      if (best && score <= best.score) continue;
      // Stage from the bordering owned province where we are already strongest.
      let staging = pid;
      for (const m of world.neighbors[n.id]) {
        if (ctx.ownedSet.has(m.id) && (ctx.presence.get(m.id) ?? 0) > (ctx.presence.get(staging) ?? 0)) staging = m.id;
      }
      best = { target: n.id, staging, need, score };
    }
  }
  return best;
}

function handleMilitary(ctx: Ctx): void {
  const { state, world, me } = ctx;
  const idleArmies = () =>
    Object.keys(state.armies)
      .sort()
      .map((id) => state.armies[id])
      .filter((a) => a.owner === me && !a.move && !isArmyInTransit(a));

  // 1. Merge idle armies sharing a province.
  const byProvince = new Map<ProvinceId, Army[]>();
  for (const a of idleArmies()) byProvince.set(a.province, [...(byProvince.get(a.province) ?? []), a]);
  for (const [, list] of byProvince) {
    if (list.length >= 2) issue(ctx, { type: 'merge', nation: me, armyIds: list.map((a) => a.id) });
  }

  const campaign = chooseCampaign(ctx);
  const committed = new Map<ProvinceId, number>();

  for (const army of idleArmies()) {
    const here = army.province;
    const power = armyPower(state, army);
    const hostilesHere = hostileArmiesIn(state, here, me);

    // In battle: fight on unless hopeless, then retreat to a friendly neighbour.
    if (hostilesHere.length > 0) {
      const enemy = hostilesHere.reduce((s, a) => s + armyPower(state, a), 0);
      if (power < enemy * 0.35) {
        const refuge = world.neighbors[here].find(
          (n) => state.provinces[n.id].owner === me && hostileArmiesIn(state, n.id, me).length === 0,
        );
        if (refuge) issue(ctx, { type: 'move', nation: me, armyId: army.id, to: refuge.id });
      }
      continue;
    }

    // Starving: fall back into supply.
    if (!army.supplied) {
      const home = nearestOwned(ctx, army, (pid) => state.provinces[pid].supplied);
      if (home) issue(ctx, { type: 'move', nation: me, armyId: army.id, to: home });
      continue;
    }

    // Defence: hold a threatened province unless strong enough to strike.
    const threat = ctx.threat.get(here) ?? 0;
    const mustDefend = ctx.ownedSet.has(here) && threat > 0 && power < threat * 1.2;

    // Opportunistic strike on any adjacent target this army can take alone.
    let best: { pid: ProvinceId; score: number } | null = null;
    for (const n of world.neighbors[here]) {
      if (!isTarget(ctx, n.id) || !canEnterProvince(state, me, n.id)) continue;
      if (power + (committed.get(n.id) ?? 0) < attackNeed(ctx, n.id)) continue;
      const score = targetValue(ctx, n.id) - (n.kind === 'strait' ? 3 : 0) + random(state) * 2;
      if (!best || score > best.score) best = { pid: n.id, score };
    }
    if (best && (!mustDefend || power > threat * 2)) {
      if (issue(ctx, { type: 'move', nation: me, armyId: army.id, to: best.pid })) {
        committed.set(best.pid, (committed.get(best.pid) ?? 0) + power);
        continue;
      }
    }
    if (mustDefend) continue;
    if (!campaign) continue;

    // Mass at the staging province, then strike together.
    if (here === campaign.staging) {
      if (power >= campaign.need) issue(ctx, { type: 'move', nation: me, armyId: army.id, to: campaign.target });
      continue;
    }
    // Leave a garrison in our capital when enemies are near.
    if (here === world.nations[me].capital && threat > 0) continue;
    issue(ctx, { type: 'move', nation: me, armyId: army.id, to: campaign.staging });
  }
}

function nearestOwned(ctx: Ctx, army: Army, pred: (pid: ProvinceId) => boolean): ProvinceId | null {
  let best: { pid: ProvinceId; t: number } | null = null;
  for (const pid of ctx.owned) {
    if (!pred(pid) || pid === army.province) continue;
    const r = findPath(ctx.state, ctx.world, army, army.province, pid);
    if (r && (!best || r.ticks < best.t)) best = { pid, t: r.ticks };
  }
  return best?.pid ?? null;
}

export function runAi(state: GameState, world: World, me: NationId): void {
  const nation = state.nations[me];
  if (!nation.ai || nation.eliminated || state.outcome) return;
  if (state.tick < nation.ai.nextThinkTick) return;
  nation.ai.nextThinkTick = state.tick + scaledTicks(state, AI.thinkIntervalSeconds);

  let ctx = buildContext(state, world, me);
  handleDiplomacy(ctx);
  ctx = buildContext(state, world, me);
  handleResearch(ctx);
  handleConstruction(ctx);
  handleRecruitment(ctx);
  handleMilitary(ctx);
}
