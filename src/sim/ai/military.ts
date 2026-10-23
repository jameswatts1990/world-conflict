// Army control for computer opponents. Each think:
//   1. armies fight to the death, pulling out only of a hopeless battle (a
//      withdrawal under fire costs every unit strength);
//   2. starving or worn-out armies go home to recover;
//   3. threatened provinces are covered first, nearest armies moving in;
//   4. up to two offensives mass at a staging province and strike together,
//      preferring targets whose defenders would be cut off;
//   5. anything left moves up to the front.
import { AI } from '../config/ai';
import { MORALE } from '../config/rules';
import { areHostile, armyMorale, armyPower, canEnterProvince, fortificationReduction, hostileArmiesIn } from '../queries';
import { random } from '../rng';
import { retreatTarget } from '../systems/combat';
import { NEUTRAL, type Army, type ArmyId, type ProvinceId } from '../types';
import { battleReady, graceOver, idleArmies, issue, type Ctx } from './context';

function mergeIdle(ctx: Ctx): void {
  const byProvince = new Map<ProvinceId, Army[]>();
  for (const a of idleArmies(ctx)) byProvince.set(a.province, [...(byProvince.get(a.province) ?? []), a]);
  for (const [, list] of byProvince) {
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

/** Shortest road distance (km) from `from` to every province, through territory the AI may cross. */
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
      const nd = dist.get(cur)! + n.distanceKm * (n.kind === 'strait' ? 2.2 : n.kind === 'mountain' ? 1.6 : 1);
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
  return ctx.seen.has(pid) ? hostileArmiesIn(ctx.state, pid, ctx.me) : [];
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
      if (!ctx.seen.has(n.id)) p += guess * AI.reinforcementShare;
      for (const a of hostilesInSight(ctx, n.id)) if (a.owner === owner) p += armyPower(state, a) * AI.reinforcementShare;
    }
  }
  // Forts are buildings: hidden under the fog of war too.
  const fort = ctx.seen.has(pid) ? (state.provinces[pid].buildings.fortifications ?? 0) : 0;
  if (fort > 0) p /= 1 - fortificationReduction(state, owner, fort) * 0.7;
  return p * AI.terrainDefence[world.provinces[pid].terrain] * MORALE.defenderResilience;
}

export function attackNeed(ctx: Ctx, pid: ProvinceId): number {
  return defenderPower(ctx, pid) * AI.attackRatio * (AI.attackCaution - ctx.mem.aggression * AI.attackAggression) + AI.attackMargin;
}

function neutralTargetsAllowed(ctx: Ctx): boolean {
  if (!graceOver(ctx, AI.neutralGraceSeconds)) return false;
  return ctx.enemies.length === 0 || ctx.mem.aggression > AI.secondWarAggression;
}

function isTarget(ctx: Ctx, pid: ProvinceId): boolean {
  const owner = ctx.state.provinces[pid].owner;
  if (owner === ctx.me) return false;
  if (owner === NEUTRAL) return neutralTargetsAllowed(ctx);
  return ctx.enemies.includes(owner);
}

function targetValue(ctx: Ctx, pid: ProvinceId): number {
  const { state, world } = ctx;
  const def = world.provinces[pid];
  const owner = state.provinces[pid].owner;
  const tv = AI.targetValue;
  let v = tv.base + (def.objectiveVp ?? 0) * tv.perVp + def.production.money / tv.outputPer + def.production.materials / tv.outputPer + state.provinces[pid].tier;
  if (owner !== NEUTRAL && world.nations[owner]?.capital === pid) v += tv.capital;
  if (def.core === ctx.me) v += tv.reclaimCore; // reclaim lost core territory
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
      score += random(state) * 0.01;
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
    if (chosen.length >= AI.maxCampaigns) break;
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
    if (mine < enemy * AI.retreatOdds && armyMorale(army) < AI.retreatMorale) {
      const refuge = retreatTarget(state, world, army, army.province);
      if (refuge) issue(ctx, { type: 'move', nation: me, armyId: army.id, to: refuge });
    }
  }

  // 2. Starving or worn-out armies go home to recover.
  for (const army of idleArmies(ctx)) {
    if (committed.has(army.id)) continue;
    const home = state.provinces[army.province].owner === me;
    if (!army.supplied) {
      const dest = nearestOwned(ctx, army, (pid) => state.provinces[pid].supplied);
      if (dest) issue(ctx, { type: 'move', nation: me, armyId: army.id, to: dest });
      committed.add(army.id);
    } else if (!battleReady(army)) {
      if (!home) {
        const dest = nearestOwned(ctx, army, (pid) => state.provinces[pid].supplied && (ctx.threat.get(pid) ?? 0) === 0);
        if (dest) issue(ctx, { type: 'move', nation: me, armyId: army.id, to: dest });
      }
      // Resting at home still counts as a garrison where it stands.
      committed.add(army.id);
    }
  }

  // Armies occupying hostile land stay until the capture completes; otherwise
  // the steps below pull them away long before the province falls.
  for (const army of idleArmies(ctx)) {
    if (committed.has(army.id)) continue;
    const owner = state.provinces[army.province].owner;
    if (owner !== me && areHostile(state, me, owner)) committed.add(army.id);
  }

  // 3. Offence first: the best defence against the army next door is often to
  //    hit it. Frontier armies may attack, leaving a rear guard only for the
  //    threat that remains once the target's defenders are engaged.
  const ready = () => idleArmies(ctx).filter((a) => !committed.has(a.id) && battleReady(a));
  const available = ready().reduce((s, a) => s + power(a), 0);
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
      const residual = Math.max(0, (ctx.threat.get(src) ?? 0) - (ctx.hostile.get(c.target) ?? 0)) * AI.defenceFactor;
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
      for (const a of attackers) if (issue(ctx, { type: 'move', nation: me, armyId: a.id, to: c.target })) committed.add(a.id);
      continue;
    }
    // Not enough yet: hold the attackers where they are and bring up reinforcements.
    for (const a of attackers) committed.add(a.id);
    let gathered = attackPower + incoming(ctx, c.staging);
    const dist = distancesFrom(ctx, c.staging, true);
    const donors = ready()
      .filter((a) => dist.has(a.province) && (ctx.threat.get(a.province) ?? 0) === 0)
      .sort((a, b) => dist.get(a.province)! - dist.get(b.province)! || (a.id < b.id ? -1 : 1));
    for (const a of donors) {
      if (gathered >= c.need * AI.massingMargin) break;
      if (issue(ctx, { type: 'move', nation: me, armyId: a.id, to: c.staging })) {
        committed.add(a.id);
        gathered += power(a);
      }
    }
  }

  // 4. Defence: cover threatened provinces, nearest free armies first.
  const capital = world.nations[me].capital;
  const needs = ctx.owned
    .map((pid) => {
      const threat = ctx.threat.get(pid) ?? 0;
      const fort = state.provinces[pid].buildings.fortifications ?? 0;
      const terrain = AI.terrainDefence[world.provinces[pid].terrain];
      const need = (threat * AI.defenceFactor * (1 - fortificationReduction(state, me, fort) * 0.5)) / terrain;
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
      if (issue(ctx, { type: 'move', nation: me, armyId: a.id, to: n.pid })) {
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
    if (best && !guarding && issue(ctx, { type: 'move', nation: me, armyId: army.id, to: best.pid })) committed.add(army.id);
  }

  // 5. Anything left in the rear moves up to the most threatened frontier province.
  const fronts = [...ctx.frontier].sort((a, b) => (ctx.threat.get(b) ?? 0) - (ctx.threat.get(a) ?? 0) || (a < b ? -1 : 1));
  if (fronts.length === 0) return;
  for (const army of free()) {
    if (ctx.frontier.has(army.province)) continue;
    const dist = distancesFrom(ctx, army.province, true);
    const dest = fronts.slice(0, 4).sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity))[0];
    if (dest && dist.has(dest)) issue(ctx, { type: 'move', nation: me, armyId: army.id, to: dest });
  }
}

/** My power already marching towards a province. */
function incoming(ctx: Ctx, pid: ProvinceId): number {
  let p = 0;
  for (const a of ctx.armies) {
    if (!a.move) continue;
    const dest = a.move.path[a.move.path.length - 1];
    if (dest === pid) p += armyPower(ctx.state, a);
  }
  return p;
}
