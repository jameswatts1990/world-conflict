// War and peace for computer opponents. They answer and offer peace from
// relative strength, home-front morale and war weariness; they pick wars of
// opportunity against weaker or distracted neighbours, avoid opening a second
// front, and gang up on any power that is close to an objective victory.
import { AI } from '../config/ai';
import { DIPLOMACY } from '../config/rules';
import { atWar, heldVp, isContender, scaledTicks, vpToWin } from '../queries';
import { random } from '../rng';
import { NEUTRAL, type NationId } from '../types';
import { graceOver, issue, nationPower, type Ctx } from './context';

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

/** A power within reach of an objective victory, if any (not me). */
export function runawayLeader(ctx: Ctx): NationId | null {
  const { state, world } = ctx;
  const need = vpToWin(world);
  let best: { id: NationId; vp: number } | null = null;
  for (const id of world.nationIds) {
    if (id === ctx.me || state.nations[id].eliminated || !isContender(world, id)) continue;
    const vp = heldVp(state, world, id);
    if (vp >= need - AI.leaderAlarmVp && (!best || vp > best.vp)) best = { id, vp };
  }
  if (state.victory.leader && state.victory.leader !== ctx.me) return state.victory.leader;
  return best?.id ?? null;
}

/** Enemy's core provinces I hold, a rough measure of who is winning a war. */
function occupiedCores(ctx: Ctx, holder: NationId, victim: NationId): number {
  return ctx.world.provinceIds.filter((id) => ctx.world.provinces[id].core === victim && ctx.state.provinces[id].owner === holder).length;
}

export function handleDiplomacy(ctx: Ctx): void {
  const { state, world, me } = ctx;
  const myPower = nationPower(state, me);
  const morale = state.nations[me].morale;
  const leader = runawayLeader(ctx);

  // Answer peace offers: accept when actually losing (ground, capital or nerve), or weary of a war going nowhere.
  for (const offer of state.peaceOffers.filter((o) => o.to === me)) {
    const theirPower = nationPower(state, offer.from);
    const rel = state.nations[me].relations[offer.from];
    const weary = state.tick - rel.since >= scaledTicks(state, AI.warWearinessSeconds);
    const lostGround = occupiedCores(ctx, offer.from, me) > occupiedCores(ctx, me, offer.from);
    const losing = myPower < theirPower * AI.acceptPeaceRatio && (lostGround || morale < AI.losingMorale);
    const lostCapital = state.provinces[world.nations[me].capital].owner !== me;
    const winning = occupiedCores(ctx, me, offer.from) > occupiedCores(ctx, offer.from, me) && myPower > theirPower;
    const stopTheLeader = offer.from === leader;
    const accept = !stopTheLeader && (losing || lostCapital || morale < AI.acceptPeaceMorale || (weary && !winning));
    issue(ctx, { type: 'respondPeace', nation: me, from: offer.from, accept });
  }

  // Sue for peace when beaten or demoralised, or when a long war has stalled.
  for (const enemy of ctx.enemies) {
    const rel = state.nations[me].relations[enemy];
    if (state.tick - rel.since < scaledTicks(state, DIPLOMACY.minWarSecondsBeforePeace)) continue;
    if (state.peaceOffers.some((o) => o.from === me && o.to === enemy)) continue;
    if (rel.peaceOfferAfter !== undefined && state.tick < rel.peaceOfferAfter) continue;
    if (enemy === leader && myPower > nationPower(state, enemy) * AI.leaderHoldRatio) continue;
    const theirPower = nationPower(state, enemy);
    const weary = state.tick - rel.since >= scaledTicks(state, AI.warWearinessSeconds);
    const beaten = myPower < theirPower * AI.offerPeaceRatio && occupiedCores(ctx, enemy, me) > 0;
    const winning = occupiedCores(ctx, me, enemy) > occupiedCores(ctx, enemy, me);
    // On two fronts, close the one that is going worse.
    const worstFront = ctx.enemies.length >= 2 && theirPower >= Math.max(...ctx.enemies.map((e) => nationPower(state, e))) && !winning;
    if (beaten || morale < AI.offerPeaceMorale || (weary && !winning && random(state) < AI.wearyPeaceChance) || (worstFront && weary && random(state) < AI.worstFrontPeaceChance)) {
      issue(ctx, { type: 'offerPeace', nation: me, target: enemy });
    }
  }

  // Minor powers defend themselves and make peace, but never start a war.
  if (!isContender(world, me)) return;
  if (!graceOver(ctx, AI.peaceGraceSeconds)) return;

  // A power about to win becomes everyone's target.
  if (leader && !atWar(state, me, leader) && state.tick >= state.nations[me].relations[leader].truceUntil) {
    const borders = neighbourNations(ctx).includes(leader);
    if (borders && ctx.enemies.length < AI.maxConcurrentWars && myPower > nationPower(state, leader) * AI.leaderWarRatio) {
      issue(ctx, { type: 'declareWar', nation: me, target: leader });
      return;
    }
  }

  // Consider a new war of opportunity against a neighbour.
  const maxWars = ctx.mem.aggression > AI.secondWarAggression ? AI.maxConcurrentWars : 1;
  if (ctx.enemies.length >= maxWars) return;
  if (morale < AI.warMorale) return;
  if (random(state) > AI.warChance + ctx.mem.aggression * AI.warChancePerAggression) return;
  let best: { target: NationId; score: number; ratio: number } | null = null;
  for (const target of neighbourNations(ctx)) {
    if (atWar(state, me, target)) continue;
    if (state.tick < state.nations[me].relations[target].truceUntil) continue;
    // A nation already fighting is distracted; one fighting two wars is fair game but not a pile-on.
    const wars = world.nationIds.filter((x) => atWar(state, target, x)).length;
    if (wars >= AI.pileOnWars) continue;
    const theirPower = nationPower(state, target) * (1 - AI.distractedDiscount * wars) + 1;
    const ratio = myPower / theirPower;
    // Prize: their objectives that border my land.
    let prize = 0;
    for (const pid of world.objectiveIds) {
      if (state.provinces[pid].owner !== target) continue;
      if (world.neighbors[pid].some((n) => ctx.ownedSet.has(n.id))) prize += world.provinces[pid].objectiveVp ?? 0;
    }
    const appeal = world.nations[target].power === 'minor' ? ratio * AI.minorTargetWeight : ratio;
    const score = appeal + prize * AI.prizePerVp + (target === leader ? AI.leaderBonus : 0);
    if (!best || score > best.score) best = { target, score, ratio };
  }
  const needed = AI.warStrengthRatio + (0.5 - ctx.mem.aggression) * AI.warRatioPerAggression + (ctx.enemies.length > 0 ? AI.secondWarRatio : 0);
  if (best && best.ratio >= needed) issue(ctx, { type: 'declareWar', nation: me, target: best.target });
}
