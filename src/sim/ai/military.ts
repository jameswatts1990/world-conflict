// Army control for computer opponents. Each think:
//   1. armies fight to the death, pulling out only of a hopeless battle (a
//      withdrawal under fire costs every unit strength);
//   2. armies taking a province hold it until it falls (leaving resets the
//      capture, and an army pulled out only to be sent back in wastes both trips);
//   3. starving or worn-out armies go home to recover;
//   4. the capital keeps a garrison sized to the danger around it, set aside
//      before any offensive (an interior capital would otherwise be emptied);
//   5. up to two offensives mass at a staging province and strike together,
//      preferring targets whose defenders would be cut off;
//   6. threatened provinces are covered, nearest armies moving in, and free
//      armies take any neighbouring target they can manage alone;
//   7. anything left moves up to the front;
//   8. armies guarding a land at the front stand forward on the road towards the
//      most dangerous enemy land next door, a screen just short of the border.
// On several fronts (interior lines) it attacks only its main enemy, holds the
// other fronts with the armies already there, and sends its reserves to the
// main front, counting its railways when it reckons distances. An offensive
// masses on the roads into its target, just short of the border, where the
// build-up shows and the strike has least ground to cover (forward positions:
// Normal only).
import { AI } from '../config/ai';
import { BUILDING_EFFECTS } from '../config/buildings';
import { MORALE, SUPPLY } from '../config/rules';
import {
  areHostile,
  armyMorale,
  armyPower,
  canEnterProvince,
  captureTicks,
  fortificationReduction,
  homeSoilMult,
  hostileArmiesIn,
  placeShare,
  scaledTicks,
} from '../queries';
import { random } from '../rng';
import { retreatTarget } from '../systems/combat';
import { NEUTRAL, type Army, type ArmyId, type ProvinceId, type RoadSpot } from '../types';
import { areAllies } from '../visibility';
import { cityOf, isCity, isCityGate, isOpenRoad, roadBorder } from '../world';
import { battleReady, graceOver, idleArmies, issue, mainEnemy, type Ctx } from './context';

/** Where an army stands: its province, or its spot on a road out of it. */
const spotOf = (a: Army) => (a.road ? `${a.province}>${a.road.toward}@${a.road.at}` : a.province);

/** A forward position on the road from a land towards a neighbour, just short of the border (null where there is no such road). */
function forwardSpot(ctx: Ctx, from: ProvinceId, toward: ProvinceId): RoadSpot | null {
  if (!isOpenRoad(ctx.world, from, toward)) return null;
  return { toward, at: Math.round(roadBorder(ctx.world, from, toward) * AI.forwardDepth * 1000) / 1000 };
}

/** Sends an army to a forward position in the land it stands in, unless it is there already. */
function goForward(ctx: Ctx, army: Army, spot: RoadSpot, reason: 'stage' | 'screen'): boolean {
  if (army.road?.toward === spot.toward && army.road.at === spot.at) return false;
  return issue(ctx, { type: 'move', nation: ctx.me, armyId: army.id, to: army.province, road: spot, mode: 'move' }, reason);
}

function mergeIdle(ctx: Ctx): void {
  // Only armies standing together merge: in one province, or at one spot on a road.
  const bySpot = new Map<string, Army[]>();
  for (const a of idleArmies(ctx)) bySpot.set(spotOf(a), [...(bySpot.get(spotOf(a)) ?? []), a]);
  for (const [, list] of bySpot) {
    if (list.length < 2) continue;
    list.sort((a, b) => b.units.length - a.units.length || (a.id < b.id ? -1 : 1));
    let group: Army[] = [];
    let size = 0;
    for (const a of list) {
      if (size + a.units.length > AI.maxArmySize && group.length > 0) {
        if (group.length >= 2) issue(ctx, { type: 'merge', nation: ctx.me, armyIds: group.map((g) => g.id) });
        group = [];
        size = 0;
      }
      group.push(a);
      size += a.units.length;
    }
    if (group.length >= 2) issue(ctx, { type: 'merge', nation: ctx.me, armyIds: group.map((g) => g.id) });
  }
}

/** How much faster my railways make a leg between two provinces (as movement reckons it). */
function railFactor(ctx: Ctx, a: ProvinceId, b: ProvinceId): number {
  if (!ctx.level.interiorLines) return 1;
  let rail = 0;
  for (const end of [a, b]) if (ctx.ownedSet.has(end) && (ctx.state.provinces[end].buildings.railway ?? 0) > 0) rail++;
  return rail === 0 ? 1 : rail === 1 ? 1 - BUILDING_EFFECTS.railwayLeg : 1 - BUILDING_EFFECTS.railwayLeg * 1.75;
}

/** Shortest road distance (km, shortened by my railways) from `from` to every province the AI may cross. */
function distancesFrom(ctx: Ctx, from: ProvinceId, ownOnly: boolean): Map<ProvinceId, number> {
  const dist = new Map<ProvinceId, number>([[from, 0]]);
  const open: ProvinceId[] = [from];
  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist.get(open[i])! < dist.get(open[bi])!) bi = i;
    const cur = open.splice(bi, 1)[0];
    for (const n of ctx.world.neighbors[cur]) {
      const passable = ownOnly ? ctx.ownedSet.has(n.id) : canEnterProvince(ctx.state, ctx.me, n.id);
      if (!passable) continue;
      const nd = dist.get(cur)! + n.distanceKm * (n.kind === 'strait' ? 2.2 : n.kind === 'mountain' ? 1.6 : 1) * railFactor(ctx, cur, n.id);
      if (nd < (dist.get(n.id) ?? Infinity)) {
        if (!dist.has(n.id)) open.push(n.id);
        dist.set(n.id, nd);
      }
    }
  }
  return dist;
}

/** Hostile armies standing in a province, if I can see it (the fog of war hides the rest). */
function hostilesInSight(ctx: Ctx, pid: ProvinceId): Army[] {
  return ctx.seen.has(pid) ? hostileArmiesIn(ctx.state, ctx.world, pid, ctx.me) : [];
}

/**
 * Defending power at a province, adjusted for terrain, forts, morale and nearby reinforcements.
 * Where the fog of war hides a province, its owner's estimated strength there stands in.
 */
function defenderPower(ctx: Ctx, pid: ProvinceId): number {
  const { state, world } = ctx;
  const owner = state.provinces[pid].owner;
  const guess = owner === NEUTRAL ? 0 : (ctx.unseen.get(owner) ?? 0);
  let p = ctx.seen.has(pid) ? 0 : guess;
  for (const a of hostilesInSight(ctx, pid)) p += armyPower(state, a);
  // Enemy armies next door can join the fight.
  if (owner !== NEUTRAL) {
    for (const n of world.neighbors[pid]) {
      if (state.provinces[n.id].owner !== owner) continue;
      if (!ctx.seen.has(n.id)) p += guess * placeShare(world, n.id) * AI.reinforcementShare;
      for (const a of hostilesInSight(ctx, n.id)) if (a.owner === owner) p += armyPower(state, a) * AI.reinforcementShare;
    }
  }
  // Forts are buildings: hidden under the fog of war too.
  const fort = ctx.seen.has(pid) ? (state.provinces[pid].buildings.fortifications ?? 0) : 0;
  if (fort > 0) p /= 1 - fortificationReduction(state, owner, fort) * 0.7;
  // Home soil helps both their firepower and their nerve.
  return p * AI.terrainDefence[world.provinces[pid].terrain] * MORALE.defenderResilience * homeSoilMult(state, world, owner, pid) ** 2;
}

/** Defenders wanted in a province against a given threat, allowing for its forts and terrain. */
function garrisonNeed(ctx: Ctx, pid: ProvinceId, threat: number): number {
  const fort = ctx.state.provinces[pid].buildings.fortifications ?? 0;
  const terrain = AI.terrainDefence[ctx.world.provinces[pid].terrain];
  return (threat * ctx.level.defenceFactor * (1 - fortificationReduction(ctx.state, ctx.me, fort) * 0.5)) / terrain;
}

export function attackNeed(ctx: Ctx, pid: ProvinceId): number {
  // Liberating my own home soil, my armies fight harder too.
  const liberation = homeSoilMult(ctx.state, ctx.world, ctx.me, pid) ** 2;
  return (defenderPower(ctx, pid) * ctx.level.attackRatio * (AI.attackCaution - ctx.mem.aggression * AI.attackAggression)) / liberation + AI.attackMargin;
}

function neutralTargetsAllowed(ctx: Ctx): boolean {
  if (!graceOver(ctx, AI.neutralGraceSeconds * AI.openings[ctx.mem.opening ?? 'strike'].neutrals)) return false;
  return ctx.enemies.length === 0 || ctx.mem.aggression > AI.secondWarAggression;
}

function isTarget(ctx: Ctx, pid: ProvinceId): boolean {
  const owner = ctx.state.provinces[pid].owner;
  if (owner === ctx.me) return false;
  // Leave a co-belligerent's uncontested capture to it: arriving stronger would take the lead and start it again.
  const by = ctx.state.provinces[pid].capture?.by;
  if (by && by !== ctx.me && ctx.seen.has(pid) && areAllies(ctx.state, ctx.me, by) && hostileArmiesIn(ctx.state, ctx.world, pid, by).length === 0) return false;
  // Leave an uncontested capture to its occupiers only if they can hold against the danger we can see or estimate.
  // Count armies actually standing there, not support still marching in; existing marches keep their orders.
  if (ctx.seen.has(pid) && ctx.state.provinces[pid].capture?.by === ctx.me && hostilesInSight(ctx, pid).length === 0) {
    const held = idleArmies(ctx).filter((a) => a.province === pid).reduce((sum, a) => sum + armyPower(ctx.state, a), 0);
    if (held >= attackNeed(ctx, pid)) return false;
  }
  if (owner === NEUTRAL) return neutralTargetsAllowed(ctx);
  // On several fronts, only the main enemy is attacked; the other fronts are held.
  const main = mainEnemy(ctx);
  return ctx.enemies.includes(owner) && (main === null || owner === main);
}

/** What a province is worth in itself: its objectives, output and city, and whether it is a capital, lost land or coveted. */
function placeValue(ctx: Ctx, pid: ProvinceId): number {
  const { state, world } = ctx;
  const def = world.provinces[pid];
  const owner = state.provinces[pid].owner;
  const tv = AI.targetValue;
  let v = tv.base + (def.objectiveVp ?? 0) * tv.perVp + def.production.money / tv.outputPer + def.production.materials / tv.outputPer + state.provinces[pid].tier;
  if (owner !== NEUTRAL && world.nations[owner]?.capital === pid) v += tv.capital;
  if (def.core === ctx.me) v += tv.reclaimCore; // reclaim lost core territory
  if (ctx.mem.claims?.includes(pid)) v += AI.claimValue; // a province this AI covets
  return v;
}

function targetValue(ctx: Ctx, pid: ProvinceId): number {
  const { state, world } = ctx;
  const owner = state.provinces[pid].owner;
  const tv = AI.targetValue;
  let v = placeValue(ctx, pid);
  // Land next to a city is worth part of it: taking it is the way in, and all of them cut the city off.
  const city = world.provinces[pid].around;
  if (city && state.provinces[city].owner !== ctx.me && isCityGate(world, pid, city)) v += placeValue(ctx, city) * tv.cityBehind;
  // Defenders with nowhere to withdraw to must fight to the end: a bigger prize.
  const defenders = hostilesInSight(ctx, pid).filter((a) => a.owner !== NEUTRAL);
  if (defenders.length > 0) {
    const escape = world.neighbors[pid].filter((n) => state.provinces[n.id].owner === owner && (ctx.presence.get(n.id) ?? 0) === 0).length;
    if (escape === 0) v += tv.trapped;
    else if (escape === 1) v += tv.oneEscape;
  }
  return v;
}

interface Campaign {
  target: ProvinceId;
  staging: ProvinceId;
  need: number;
  score: number;
}

export function chooseCampaigns(ctx: Ctx, available: number): Campaign[] {
  const { state, world } = ctx;
  const options: Campaign[] = [];
  const seen = new Set<ProvinceId>();
  for (const pid of ctx.owned) {
    for (const n of world.neighbors[pid]) {
      if (seen.has(n.id) || !isTarget(ctx, n.id) || !canEnterProvince(state, ctx.me, n.id)) continue;
      seen.add(n.id);
      const need = attackNeed(ctx, n.id);
      if (need > available * 1.1) continue;
      const kind = n.kind;
      let score = targetValue(ctx, n.id) / (need + 25) - (kind === 'strait' ? 0.05 : 0);
      if (ctx.mem.campaigns.includes(n.id)) score *= AI.campaignStickiness;
      score += random(state) * ctx.level.targetNoise;
      // Stage from the bordering owned province where we are already strongest (land routes preferred).
      let staging: ProvinceId | null = null;
      let best = -Infinity;
      for (const m of world.neighbors[n.id]) {
        if (!ctx.ownedSet.has(m.id)) continue;
        const s = (ctx.presence.get(m.id) ?? 0) - (m.kind === 'strait' ? 40 : 0) + (state.provinces[m.id].supplied ? 5 : 0);
        if (s > best) {
          best = s;
          staging = m.id;
        }
      }
      if (staging) options.push({ target: n.id, staging, need, score });
    }
  }
  options.sort((a, b) => b.score - a.score || (a.target < b.target ? -1 : 1));
  const chosen: Campaign[] = [];
  let budget = available;
  for (const c of options) {
    if (chosen.length >= ctx.level.maxCampaigns) break;
    if (c.need > budget) continue;
    chosen.push(c);
    budget -= c.need * 1.1;
  }
  return chosen;
}

function nearestOwned(ctx: Ctx, army: Army, pred: (pid: ProvinceId) => boolean): ProvinceId | null {
  const dist = distancesFrom(ctx, army.province, false);
  let best: { pid: ProvinceId; d: number } | null = null;
  for (const pid of ctx.owned) {
    if (pid === army.province || !pred(pid)) continue;
    const d = dist.get(pid);
    if (d !== undefined && (!best || d < best.d)) best = { pid, d };
  }
  return best?.pid ?? null;
}

export function handleMilitary(ctx: Ctx): void {
  const { state, world, me } = ctx;
  mergeIdle(ctx);
  const committed = new Set<ArmyId>();
  const power = (a: Army) => armyPower(state, a);

  // 1. Battles: fight on unless the battle is hopeless, the army is spent and there is somewhere to go.
  for (const army of idleArmies(ctx)) {
    const hostiles = hostilesInSight(ctx, army.province);
    if (hostiles.length === 0) continue;
    committed.add(army.id);
    const enemy = hostiles.reduce((s, a) => s + power(a), 0);
    const mine = Object.values(state.armies)
      .filter((a) => a.owner === me && a.province === army.province && !a.move)
      .reduce((s, a) => s + power(a), 0);
    if (mine < enemy * AI.retreatOdds && armyMorale(army) < ctx.level.retreatMorale) {
      const refuge = retreatTarget(state, world, army, army.province);
      if (refuge) issue(ctx, { type: 'move', nation: me, armyId: army.id, to: refuge }, 'retreat');
    }
  }

  // 2. Armies capturing a province stay until it falls, unless they would
  //    starve first: walking out resets the capture.
  for (const army of idleArmies(ctx)) {
    if (committed.has(army.id)) continue;
    const owner = state.provinces[army.province].owner;
    if (owner === me || !areHostile(state, me, owner)) continue;
    const capture = state.provinces[army.province].capture;
    const remaining = capture?.by === me ? capture.required - capture.progress : captureTicks(state, world, army.province);
    if (army.supplied || remaining <= scaledTicks(state, SUPPLY.attritionGraceSeconds) - army.unsuppliedTicks) committed.add(army.id);
  }

  // 3. Starving or worn-out armies go home to recover.
  for (const army of idleArmies(ctx)) {
    if (committed.has(army.id)) continue;
    const home = state.provinces[army.province].owner === me;
    if (!army.supplied) {
      const dest = nearestOwned(ctx, army, (pid) => state.provinces[pid].supplied);
      if (dest) issue(ctx, { type: 'move', nation: me, armyId: army.id, to: dest }, 'resupply');
      committed.add(army.id);
    } else if (!battleReady(army)) {
      if (!home) {
        const dest = nearestOwned(ctx, army, (pid) => state.provinces[pid].supplied && (ctx.threat.get(pid) ?? 0) === 0);
        if (dest) issue(ctx, { type: 'move', nation: me, armyId: army.id, to: dest }, 'recover');
      }
      // Resting at home still counts as a garrison where it stands.
      committed.add(army.id);
    }
  }

  // 4. The capital's garrison stays, whatever the offensives want.
  const capital = world.nations[me].capital;
  const capitalNeed = ctx.ownedSet.has(capital) ? garrisonNeed(ctx, capital, ctx.capitalDanger) : 0;
  let capitalHeld = 0;
  for (const a of idleArmies(ctx)) {
    if (a.province !== capital) continue;
    if (committed.has(a.id)) capitalHeld += power(a);
    else if (capitalHeld < capitalNeed) {
      committed.add(a.id);
      capitalHeld += power(a);
    }
  }

  // 5. Offence first: the best defence against the army next door is often to
  //    hit it. Frontier armies may attack, leaving a rear guard only for the
  //    threat that remains once the target's defenders are engaged.
  const ready = () => idleArmies(ctx).filter((a) => !committed.has(a.id) && battleReady(a));
  const available = ready().reduce((s, a) => s + power(a), 0);
  /** Attackers waiting for an offensive to gather: they keep their place on the road into its target. */
  const staged = new Set<ArmyId>();
  // Armies at forward positions keep the facing they took for a while (forward positions: Normal only).
  const holds = ctx.level.forwardPositions ? forwardHolds(ctx) : null;
  const campaigns = ctx.enemies.length > 0 || neutralTargetsAllowed(ctx) ? chooseCampaigns(ctx, available) : [];
  ctx.mem.campaigns = campaigns.map((c) => c.target);
  for (const c of campaigns) {
    const sources = new Set<ProvinceId>([c.staging, ...world.neighbors[c.target].filter((n) => ctx.ownedSet.has(n.id)).map((n) => n.id)]);
    const attackers: Army[] = [];
    let attackPower = 0;
    for (const src of sources) {
      const here = ready().filter((a) => a.province === src).sort((a, b) => power(b) - power(a) || (a.id < b.id ? -1 : 1));
      if (here.length === 0) continue;
      // What would still threaten this province with the target's defenders tied down.
      const residual = Math.max(0, (ctx.threat.get(src) ?? 0) - (ctx.hostile.get(c.target) ?? 0)) * ctx.level.defenceFactor;
      let guard = 0;
      // Keep the weakest stacks as the rear guard; the strongest go forward.
      for (const a of [...here].reverse()) {
        if (guard >= residual) break;
        guard += power(a);
        committed.add(a.id);
      }
      for (const a of here) {
        if (committed.has(a.id)) continue;
        attackers.push(a);
        attackPower += power(a);
      }
    }
    if (attackPower >= c.need) {
      for (const a of attackers) if (issue(ctx, { type: 'move', nation: me, armyId: a.id, to: c.target }, 'attack')) committed.add(a.id);
      continue;
    }
    // Not enough yet: hold the attackers where they are (with forward positions, on the road into the target,
    // just short of the border) and bring up reinforcements.
    const forward = ctx.level.forwardPositions;
    for (const a of attackers) {
      committed.add(a.id);
      staged.add(a.id);
      // One already forward on another road into enemy land keeps it for a while, rather than shuffling from
      // road to road as the target moves between the lands next door.
      if (!holds || keepsFacing(ctx, a, holds)) continue;
      const spot = forwardSpot(ctx, a.province, c.target);
      if (spot && goForward(ctx, a, spot, 'stage')) holds[a.id] = state.tick;
    }
    let gathered = attackPower + incoming(ctx, c.staging) + movingUp(ctx, c.target, c.staging);
    const stagingSpot = forward ? forwardSpot(ctx, c.staging, c.target) : null;
    const dist = distancesFrom(ctx, c.staging, true);
    const donors = ready()
      .filter((a) => dist.has(a.province) && (ctx.threat.get(a.province) ?? 0) === 0)
      .sort((a, b) => dist.get(a.province)! - dist.get(b.province)! || (a.id < b.id ? -1 : 1));
    for (const a of donors) {
      if (gathered >= c.need * AI.massingMargin) break;
      if (issue(ctx, { type: 'move', nation: me, armyId: a.id, to: c.staging, ...(stagingSpot ? { road: stagingSpot } : {}) }, 'stage')) {
        committed.add(a.id);
        gathered += power(a);
      }
    }
  }

  // 6. Defence: cover threatened provinces (the capital against the wider danger), nearest free armies first.
  const needs = ctx.owned
    .map((pid) => {
      const threat = ctx.threat.get(pid) ?? 0;
      const need = garrisonNeed(ctx, pid, pid === capital ? Math.max(threat, ctx.capitalDanger) : threat);
      const importance = 1 + (world.provinces[pid].objectiveVp ?? 0) * 0.5 + (pid === capital ? 1 : 0);
      return { pid, need, importance };
    })
    .filter((n) => n.need > 0);
  const reserved = new Map<ProvinceId, number>();
  for (const n of needs) {
    // Armies already standing guard (or held back as a rear guard) stay.
    let have = 0;
    for (const a of idleArmies(ctx)) {
      if (a.province !== n.pid) continue;
      if (committed.has(a.id)) {
        if (!a.move) have += power(a);
        continue;
      }
      if (have >= n.need) continue;
      committed.add(a.id);
      have += power(a);
    }
    reserved.set(n.pid, have);
  }
  needs.sort((a, b) => b.importance * (b.need - (reserved.get(b.pid) ?? 0)) - a.importance * (a.need - (reserved.get(a.pid) ?? 0)) || (a.pid < b.pid ? -1 : 1));
  for (const n of needs) {
    let have = (reserved.get(n.pid) ?? 0) + incoming(ctx, n.pid);
    if (have >= n.need) continue;
    const dist = distancesFrom(ctx, n.pid, true);
    const donors = idleArmies(ctx)
      .filter((a) => !committed.has(a.id) && dist.has(a.province) && (ctx.threat.get(a.province) ?? 0) === 0)
      .sort((a, b) => dist.get(a.province)! - dist.get(b.province)! || (a.id < b.id ? -1 : 1));
    for (const a of donors) {
      if (have >= n.need) break;
      if (issue(ctx, { type: 'move', nation: me, armyId: a.id, to: n.pid }, 'defend')) {
        committed.add(a.id);
        have += power(a);
      }
    }
  }
  const free = () => idleArmies(ctx).filter((a) => !committed.has(a.id) && battleReady(a));

  // Opportunistic strikes: any free army that can take an adjacent target alone.
  for (const army of free()) {
    let best: { pid: ProvinceId; score: number } | null = null;
    for (const n of world.neighbors[army.province]) {
      if (!isTarget(ctx, n.id) || !canEnterProvince(state, me, n.id)) continue;
      const need = attackNeed(ctx, n.id);
      if (power(army) < need) continue;
      const score = targetValue(ctx, n.id) - (n.kind === 'strait' ? 4 : 0) + random(state);
      if (!best || score > best.score) best = { pid: n.id, score };
    }
    const guarding = (ctx.threat.get(army.province) ?? 0) > power(army) * 0.5;
    if (best && !guarding && issue(ctx, { type: 'move', nation: me, armyId: army.id, to: best.pid }, 'strike')) committed.add(army.id);
  }

  // 7. Anything left in the rear moves up to the most threatened frontier province; on several fronts, to the main
  //    front. Armies already on another front stay as its garrison.
  const main = mainEnemy(ctx);
  const mainFront = new Set(main ? ctx.owned.filter((pid) => world.neighbors[pid].some((n) => state.provinces[n.id].owner === main)) : []);
  const front = mainFront.size > 0 ? mainFront : ctx.frontier;
  const fronts = [...front].sort((a, b) => (ctx.threat.get(b) ?? 0) - (ctx.threat.get(a) ?? 0) || (a < b ? -1 : 1));
  if (fronts.length > 0) {
    for (const army of free()) {
      if (front.has(army.province) || ctx.frontier.has(army.province)) continue;
      const dist = distancesFrom(ctx, army.province, true);
      const dest = fronts.slice(0, 4).sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity))[0];
      if (dest && dist.has(dest)) issue(ctx, { type: 'move', nation: me, armyId: army.id, to: dest }, 'advance');
    }
  }

  if (holds) {
    screens(ctx, staged, holds);
    if (Object.keys(holds).length > 0) ctx.mem.forwardHolds = holds;
    else delete ctx.mem.forwardHolds;
  }
}

/** Armies at forward positions still holding the facing they took (those whose hold is over, or which are gone, dropped). */
function forwardHolds(ctx: Ctx): Record<ArmyId, number> {
  const holds = ctx.mem.forwardHolds ?? {};
  for (const id of Object.keys(holds)) if (!ctx.state.armies[id] || ctx.state.tick - holds[id] >= AI.forwardHold) delete holds[id];
  return holds;
}

/** Does the army stand forward on a road into enemy land, still holding the facing it took? */
function keepsFacing(ctx: Ctx, army: Army, holds: Record<ArmyId, number>): boolean {
  return holds[army.id] !== undefined && !!army.road && ctx.enemies.includes(ctx.state.provinces[army.road.toward].owner);
}

/**
 * 8. Forward screens. An army guarding a land of mine at war's edge (not fighting, not waiting for an offensive)
 * stands on the road towards the most dangerous enemy land next door, just short of the border, rather than at
 * the land's crossroads: the front shows on the map, and a counter-stroke has least ground to cover. A screen
 * keeps its facing for a while, and then turns to face another land only for a danger clearly greater than the
 * one it faces and than itself, so it does not shuffle about after every enemy march.
 */
function screens(ctx: Ctx, staged: Set<ArmyId>, holds: Record<ArmyId, number>): void {
  const { state, world, me } = ctx;
  const enemyHeld = (pid: ProvinceId) => ctx.enemies.includes(state.provinces[pid].owner);
  // Hostile power in a province, as far as I can see or guess.
  const held = (pid: ProvinceId): number => {
    if (!enemyHeld(pid)) return 0;
    return ctx.seen.has(pid) ? (ctx.hostile.get(pid) ?? 0) : (ctx.unseen.get(state.provinces[pid].owner) ?? 0);
  };
  // What an enemy land next door could send down the road: the land and its city, and part of the lands behind
  // it (not those beside it, next to mine as well, which a screen weighs on their own roads).
  const danger = (land: ProvinceId, from: ProvinceId): number => {
    if (!enemyHeld(land)) return 0;
    const city = cityOf(world, land);
    let d = held(land) + (city && city !== land ? held(city) : 0);
    for (const n of world.neighbors[land]) {
      if (n.id === from || isCity(world, n.id) || world.neighbors[from].some((m) => m.id === n.id)) continue;
      d += held(n.id) * AI.screenBeyond;
    }
    return d;
  };
  for (const army of idleArmies(ctx)) {
    const pid = army.province;
    if (staged.has(army.id) || isCity(world, pid) || state.provinces[pid].owner !== me || !battleReady(army)) continue;
    if (hostilesInSight(ctx, pid).length > 0) continue;
    let best: { id: ProvinceId; danger: number } | null = null;
    for (const n of world.neighbors[pid]) {
      if (!isOpenRoad(world, pid, n.id)) continue;
      const d = danger(n.id, pid);
      if (d > 0 && (!best || d > best.danger)) best = { id: n.id, danger: d };
    }
    if (!best || army.road?.toward === best.id) continue;
    // Facing an enemy land, it holds for a while, and then unless the new danger could overwhelm both what it
    // faces and itself.
    const toward = army.road?.toward;
    const facing = toward && enemyHeld(toward) ? Math.max(danger(toward, pid), armyPower(state, army)) : 0;
    if (facing > 0 && (keepsFacing(ctx, army, holds) || best.danger < facing * AI.screenSwitch)) continue;
    const spot = forwardSpot(ctx, pid, best.id);
    if (spot && goForward(ctx, army, spot, 'screen')) holds[army.id] = state.tick;
  }
}

/** My power marching to forward positions on the roads into a target, from lands other than the staging one. */
function movingUp(ctx: Ctx, target: ProvinceId, staging: ProvinceId): number {
  let p = 0;
  for (const a of ctx.armies) {
    const halt = a.move?.halt;
    if (halt && halt.toward === target && halt.province !== staging) p += armyPower(ctx.state, a);
  }
  return p;
}

/** My power already marching towards a province. */
function incoming(ctx: Ctx, pid: ProvinceId): number {
  let p = 0;
  for (const a of ctx.armies) {
    if (!a.move) continue;
    // A march to a spot on a road ends in the province whose part of the road it is.
    const dest = a.move.halt?.province ?? a.move.path[a.move.path.length - 1];
    if (dest === pid) p += armyPower(ctx.state, a);
  }
  return p;
}
