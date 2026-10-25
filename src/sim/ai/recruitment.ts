// Recruitment for computer opponents: an army sized to what the treasury, the
// other resources and the territory can carry, with a mix that follows doctrine
// and answers the enemy (anti-tank guns against armour, mountain troops on
// alpine fronts, siege guns against forts) and leans on a materials stockpile.
// AIs whose upkeep outruns a resource stand down the units that draw on it.
import { AI } from '../config/ai';
import { UNITS, usesShells } from '../config/units';
import { checkRecruit } from '../commands';
import { isUnitUnlocked, recruitCost, unitPower } from '../queries';
import { RESOURCE_KEYS, UNIT_TYPES, type ProvinceId, type ResourceKey, type Resources, type UnitType } from '../types';
import { landsOf } from '../world';
import { affordableWithReserve, issue, type Ctx } from './context';
import { mountainFront } from './economy';

/** How far the materials stockpile has piled up (0..1): minutes of materials income in store, between `from` and `full`. */
function materialsLean(ctx: Ctx): number {
  const { from, full } = AI.materialsLean;
  const minutes = ctx.state.nations[ctx.me].resources.materials / Math.max(1, ctx.eco.income.materials);
  return Math.max(0, Math.min(1, (minutes - from) / (full - from)));
}

/** Upkeep a unit type draws, per resource. */
function upkeepOf(type: UnitType): Resources {
  const up = UNITS[type].upkeepPerMinute;
  return { money: up.money ?? 0, materials: up.materials ?? 0, fuel: up.fuel ?? 0, manpower: up.manpower ?? 0 };
}

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
      for (const site of [n.id, ctx.world.provinces[n.id].around]) {
        if (site && (ctx.state.provinces[site].buildings.fortifications ?? 0) >= 2 && !ctx.ownedSet.has(site)) forts++;
      }
    }
  }
  if (forts > 0) bump('heavyArtillery', 0.06);
  // A materials stockpile turns into guns and armour.
  const lean = materialsLean(ctx);
  if (lean > 0) for (const t of UNIT_TYPES) if (usesShells(t) && base[t]) base[t]! *= 1 + lean * AI.materialsLean.max;
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
    const lands = landsOf(ctx.world, pid);
    const threat = Math.max(0, ...lands.map((land) => ctx.threat.get(land) ?? 0));
    return (ctx.threat.get(pid) ?? 0) + threat + (ctx.frontier.has(pid) || lands.some((land) => ctx.frontier.has(land)) ? 50 : 0);
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
  // Upkeep of the standing army and of the recruits queued, per resource.
  const upkeep: Resources = { ...ctx.eco.upkeep };
  for (const pid of ctx.owned) {
    for (const j of state.provinces[pid].recruitQueue) {
      counts.set(j.unitType, (counts.get(j.unitType) ?? 0) + 1);
      units++;
      const up = upkeepOf(j.unitType);
      for (const k of RESOURCE_KEYS) upkeep[k] += up[k];
    }
  }
  // Army size is bounded by what the treasury, the other resources and the territory can sustain.
  const war = ctx.enemies.length > 0 ? AI.warUpkeep : 1;
  const share = (AI.upkeepShare + AI.upkeepPerAggression * ctx.mem.aggression) * war * ctx.level.armySize;
  const budget: Resources = { money: ctx.eco.income.money * share, materials: 0, fuel: 0, manpower: 0 };
  for (const k of ['materials', 'fuel', 'manpower'] as const) budget[k] = ctx.eco.income[k] * AI.upkeepShares[k] * war;
  const cap =
    (ctx.ownedCities * AI.unitsPerProvince + AI.unitsFlat[world.nations[me].power] + ctx.eco.income.money / AI.unitsPerIncome) *
    ctx.level.armySize;
  const rich = state.nations[me].resources.money > 3000;

  const over = overdrawn(ctx, upkeep);
  if (over) standDown(ctx, over);

  // A unit is raised only if every resource it draws on can carry it.
  const fits = (type: UnitType) => {
    const up = upkeepOf(type);
    return RESOURCE_KEYS.every((k) => up[k] <= 0 || upkeep[k] + up[k] <= budget[k]);
  };
  const mix = desiredMix(ctx);
  const sites = recruitSites(ctx);
  let recruited = 0;
  while (recruited < (rich ? 5 : 3) && upkeep.money < budget.money && units < cap) {
    const total = units + 1;
    const order = [...mix.keys()].sort((a, b) => (counts.get(a) ?? 0) / total - mix.get(a)! - ((counts.get(b) ?? 0) / total - mix.get(b)!) || (a < b ? -1 : 1));
    let done = false;
    for (const type of order) {
      if (!fits(type)) continue;
      if (!affordableWithReserve(ctx, recruitCost(state, me, type))) continue;
      for (const pid of sites) {
        if (!checkRecruit(state, world, me, pid, type).ok) continue;
        if (issue(ctx, { type: 'recruit', nation: me, province: pid, unitType: type })) {
          counts.set(type, (counts.get(type) ?? 0) + 1);
          units++;
          const up = upkeepOf(type);
          for (const k of RESOURCE_KEYS) upkeep[k] += up[k];
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

/** The resource the army overdraws most (short, or upkeep above income), if any. */
function overdrawn(ctx: Ctx, upkeep: Resources): ResourceKey | null {
  const shortages = ctx.state.nations[ctx.me].shortages;
  let worst: ResourceKey | null = null;
  let worstRatio = AI.standDownAt;
  for (const k of RESOURCE_KEYS) {
    if (upkeep[k] <= 0) continue;
    const ratio = shortages[k] ? Infinity : upkeep[k] / Math.max(1e-9, ctx.eco.income[k]);
    if (ratio > worstRatio) (worst = k), (worstRatio = ratio);
  }
  return worst;
}

/**
 * Disband units far from any threat until upkeep of the overdrawn resource fits its income again: first those
 * giving least fighting power for what they draw on it.
 */
function standDown(ctx: Ctx, k: ResourceKey): void {
  const { state, me } = ctx;
  const target = ctx.eco.income[k] * AI.standDownTo;
  let upkeep = ctx.eco.upkeep[k];
  const candidates: { armyId: string; unitId: string; score: number; cost: number }[] = [];
  for (const a of ctx.armies) {
    if (a.move) continue;
    // Only armies at home in quiet provinces; occupiers abroad are never "rear".
    const rear = ctx.ownedSet.has(a.province) && !ctx.frontier.has(a.province) && (ctx.threat.get(a.province) ?? 0) === 0;
    if (!rear) continue;
    for (const u of a.units) {
      const cost = upkeepOf(u.type)[k];
      if (cost > 0) candidates.push({ armyId: a.id, unitId: u.id, score: unitPower(state, me, u) / cost, cost });
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
