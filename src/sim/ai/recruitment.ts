// Recruitment for computer opponents: an army sized to what the treasury and
// territory can carry, with a mix that follows doctrine and answers the
// enemy (anti-tank guns against armour, mountain troops on alpine fronts,
// siege guns against forts). Bankrupt AIs stand down their weakest units.
import { AI } from '../config/ai';
import { UNITS } from '../config/units';
import { checkRecruit } from '../commands';
import { isUnitUnlocked, recruitCost, unitPower } from '../queries';
import { UNIT_TYPES, type ProvinceId, type UnitType } from '../types';
import { landOf } from '../world';
import { affordableWithReserve, issue, type Ctx } from './context';
import { mountainFront } from './economy';

function desiredMix(ctx: Ctx): Map<UnitType, number> {
  const base = { ...AI.doctrineMix[ctx.mem.doctrine] };
  const bump = (t: UnitType, v: number) => (base[t] = (base[t] ?? 0) + v);
  bump('antiTank', ctx.enemyArmour * 0.25);
  bump('tankDestroyer', ctx.enemyArmour * 0.1);
  bump('mountain', mountainFront(ctx) * 0.2);
  // Forts across the front, in the land or in the city behind it.
  let forts = 0;
  for (const pid of ctx.frontier) {
    for (const n of ctx.world.neighbors[pid]) {
      for (const site of [n.id, ctx.world.provinces[n.id].contains]) {
        if (site && (ctx.state.provinces[site].buildings.fortifications ?? 0) >= 2 && !ctx.ownedSet.has(site)) forts++;
      }
    }
  }
  if (forts > 0) bump('heavyArtillery', 0.06);
  // Only what can be raised; fold the rest back into line infantry.
  const mix = new Map<UnitType, number>();
  let total = 0;
  for (const t of UNIT_TYPES) {
    const v = base[t] ?? 0;
    if (v <= 0) continue;
    const target = isUnitUnlocked(ctx.state, ctx.me, t) ? t : UNITS[t].class === 'armour' || UNITS[t].class === 'support' ? null : 'infantry';
    if (!target) continue;
    mix.set(target, (mix.get(target) ?? 0) + v);
    total += v;
  }
  for (const [t, v] of mix) mix.set(t, v / total);
  return mix;
}

/** Cities ordered by usefulness: threatened ones and those whose land meets the enemy first. */
function recruitSites(ctx: Ctx): ProvinceId[] {
  const urgency = (pid: ProvinceId) => {
    const land = landOf(ctx.world, pid);
    return (ctx.threat.get(pid) ?? 0) + (ctx.threat.get(land) ?? 0) + (ctx.frontier.has(pid) || ctx.frontier.has(land) ? 50 : 0);
  };
  return ctx.owned
    .filter((pid) => ctx.world.provinces[pid].city)
    .map((pid) => ({ pid, u: urgency(pid) }))
    .sort((a, b) => b.u - a.u || (a.pid < b.pid ? -1 : 1))
    .map((s) => s.pid);
}

export function handleRecruitment(ctx: Ctx): void {
  const { state, world, me } = ctx;
  const counts = new Map<UnitType, number>();
  let units = 0;
  for (const a of ctx.armies) for (const u of a.units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1), units++;
  let queuedUpkeep = 0;
  for (const pid of ctx.owned) {
    for (const j of state.provinces[pid].recruitQueue) {
      counts.set(j.unitType, (counts.get(j.unitType) ?? 0) + 1);
      units++;
      queuedUpkeep += UNITS[j.unitType].upkeepPerMinute.money ?? 0;
    }
  }
  // Army size is bounded by what the treasury and the territory can sustain.
  const share = (AI.upkeepShare + AI.upkeepPerAggression * ctx.mem.aggression) * (ctx.enemies.length > 0 ? AI.warUpkeep : 1) * ctx.level.armySize;
  const budget = ctx.eco.income.money * share;
  const cap =
    (ctx.ownedCities * AI.unitsPerProvince + AI.unitsFlat[world.nations[me].power] + ctx.eco.income.money / AI.unitsPerIncome) *
    ctx.level.armySize;
  const rich = state.nations[me].resources.money > 3000;
  let upkeep = ctx.eco.upkeep.money + queuedUpkeep;

  if (state.nations[me].shortages.money || upkeep > ctx.eco.income.money * 1.05) standDown(ctx);

  const mix = desiredMix(ctx);
  const sites = recruitSites(ctx);
  let recruited = 0;
  while (recruited < (rich ? 5 : 3) && upkeep < budget && units < cap) {
    const total = units + 1;
    const order = [...mix.keys()].sort((a, b) => (counts.get(a) ?? 0) / total - mix.get(a)! - ((counts.get(b) ?? 0) / total - mix.get(b)!) || (a < b ? -1 : 1));
    let done = false;
    for (const type of order) {
      const fuel = UNITS[type].upkeepPerMinute.fuel ?? 0;
      if (fuel > 0 && ctx.eco.net.fuel <= 1 + fuel) continue;
      if (!affordableWithReserve(ctx, recruitCost(state, me, type))) continue;
      for (const pid of sites) {
        if (!checkRecruit(state, world, me, pid, type).ok) continue;
        if (issue(ctx, { type: 'recruit', nation: me, province: pid, unitType: type })) {
          counts.set(type, (counts.get(type) ?? 0) + 1);
          units++;
          upkeep += UNITS[type].upkeepPerMinute.money ?? 0;
          ctx.eco.net.fuel -= fuel;
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

/** Disband the weakest units far from any threat until upkeep fits income again. */
function standDown(ctx: Ctx): void {
  const { state, me } = ctx;
  const target = ctx.eco.income.money * 0.9;
  let upkeep = ctx.eco.upkeep.money;
  const candidates: { armyId: string; unitId: string; score: number; cost: number }[] = [];
  for (const a of ctx.armies) {
    if (a.move) continue;
    // Only armies at home in quiet provinces; occupiers abroad are never "rear".
    const rear = ctx.ownedSet.has(a.province) && !ctx.frontier.has(a.province) && (ctx.threat.get(a.province) ?? 0) === 0;
    if (!rear) continue;
    for (const u of a.units) {
      candidates.push({ armyId: a.id, unitId: u.id, score: unitPower(state, me, u), cost: UNITS[u.type].upkeepPerMinute.money ?? 0 });
    }
  }
  candidates.sort((x, y) => x.score - y.score || (x.unitId < y.unitId ? -1 : 1));
  for (const c of candidates) {
    if (upkeep <= target) break;
    const army = state.armies[c.armyId];
    if (!army || !army.units.some((u) => u.id === c.unitId)) continue;
    if (issue(ctx, { type: 'disband', nation: me, armyId: c.armyId, unitIds: [c.unitId] })) upkeep -= c.cost;
  }
}
