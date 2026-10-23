// Research and construction for computer opponents. Research follows the
// AI's doctrine and answers what the enemy fields; construction plans each
// city's limited slots around growth, industry, recruitment and morale.
import { AI } from '../config/ai';
import { BUILDINGS, CITY, slotsUsed } from '../config/buildings';
import { TECHS, type TechConfig } from '../config/research';
import { checkBuildRules, checkResearch } from '../commands';
import { buildingSlots, constructionCost, isUnitUnlocked, researchSlots } from '../queries';
import { random } from '../rng';
import type { BuildingType, ProvinceId } from '../types';
import { alliesOf } from '../visibility';
import { affordableWithReserve, issue, type Ctx } from './context';

function techScore(ctx: Ctx, t: TechConfig): number {
  let score = 10 - t.col * 1.1 + random(ctx.state) * 2;
  score += AI.doctrineResearch[ctx.mem.doctrine][t.branch] ?? 0;
  if (t.branch === 'industry') score += ctx.mem.economyBias * 4;
  for (const e of t.effects) {
    if (e.kind === 'unitModel') score += 3;
    if (e.kind === 'researchSlot') score += 5;
    if (e.kind === 'production') score += 1.5;
    if (e.kind === 'unlockUnit') {
      if (e.unit === 'antiTank' || e.unit === 'tankDestroyer') score += ctx.enemyArmour * 12;
      if (e.unit === 'mountain' && mountainFront(ctx) > 0.3) score += 4;
      if (e.unit === 'tank' && ctx.mem.doctrine === 'armour') score += 4;
      if (e.unit === 'heavyArtillery' && ctx.mem.doctrine === 'artillery') score += 3;
    }
    if (e.kind === 'morale' && ctx.state.nations[ctx.me].morale < 55) score += 3;
    if (e.kind === 'fortification' && ctx.enemies.length > 0) score += 1;
    // Co-belligerents' sight is worth most with co-belligerents to share it.
    if (e.kind === 'alliedSight') score += alliesOf(ctx.state, ctx.world, ctx.me).length > 0 ? 3 : -1;
  }
  return score;
}

/** Share of my frontier that is mountains or hills. */
export function mountainFront(ctx: Ctx): number {
  if (ctx.frontier.size === 0) return 0;
  let rough = 0;
  for (const pid of ctx.frontier) {
    const t = ctx.world.provinces[pid].terrain;
    if (t === 'mountains' || t === 'hills') rough++;
  }
  return rough / ctx.frontier.size;
}

export function handleResearch(ctx: Ctx): void {
  const { state, me } = ctx;
  const research = state.nations[me].research;
  const free = researchSlots(state, me) - research.active.length;
  if (free <= 0) return;
  const candidates = TECHS.filter(
    (t) =>
      !research.completed.includes(t.id) && !research.active.some((j) => j.tech === t.id) && t.requires.every((r) => research.completed.includes(r)),
  )
    .map((t) => ({ t, score: techScore(ctx, t) }))
    .sort((a, b) => b.score - a.score || (a.t.id < b.t.id ? -1 : 1));
  for (const { t } of candidates.slice(0, free)) {
    // Research takes priority: if it is not affordable yet, save up for it.
    if (checkResearch(state, me, t.id).ok) issue(ctx, { type: 'research', nation: me, tech: t.id });
    else {
      ctx.savings = t.cost;
      break;
    }
  }
}

function count(ctx: Ctx, b: BuildingType): number {
  return ctx.owned.filter((id) => (ctx.state.provinces[id].buildings[b] ?? 0) > 0).length;
}

export function handleConstruction(ctx: Ctx): void {
  const { state, world, me } = ctx;
  const candidates: { pid: ProvinceId; b: BuildingType; score: number }[] = [];
  const nationMorale = state.nations[me].morale;
  const atWar = ctx.enemies.length > 0;

  for (const pid of ctx.owned) {
    const p = state.provinces[pid];
    if (p.construction) continue;
    const def = world.provinces[pid];
    const core = def.core === me;
    const outputFactor = (core ? 1 : 0.6) * (p.morale / 70);
    const freeSlots = buildingSlots(state, pid) - slotsUsed(p.buildings, null);
    const frontier = ctx.frontier.has(pid);
    const threat = ctx.threat.get(pid) ?? 0;
    const presence = ctx.presence.get(pid) ?? 0;
    const lvl = (b: BuildingType) => p.buildings[b] ?? 0;
    const add = (b: BuildingType, score: number) => {
      if (score <= 0) return;
      // The last free slot is precious: keep it for the most valuable buildings.
      if (BUILDINGS[b].category !== 'infrastructure' && lvl(b) === 0 && freeSlots <= 1 && score < 14) return;
      if (checkBuildRules(state, world, me, pid, b).ok) candidates.push({ pid, b, score });
    };

    add('industry', ((def.production.money * 0.3 + def.production.materials * 0.6) * outputFactor * (1 + ctx.mem.economyBias)) / (1 + lvl('industry') * 0.6));
    add('market', (def.production.money * 0.3 * outputFactor * (1 + ctx.mem.economyBias)) / (1 + lvl('market')));
    add('powerPlant', 9 + world.neighbors[pid].filter((n) => ctx.ownedSet.has(n.id)).length * 2);
    add('housing', p.tier < 4 ? (core ? 9 : 4) + (CITY.slots[p.tier + 1] - CITY.slots[p.tier]) * 2 - lvl('housing') * 2 : 0);
    if (count(ctx, 'university') < 3) add('university', 18 - count(ctx, 'university') * 3);
    if (count(ctx, 'barracks') < 2 + Math.floor(ctx.owned.length / 4)) add('barracks', 13 + (frontier ? 5 : 0));
    if (count(ctx, 'academy') < 1 && (isUnitUnlocked(state, me, 'stormtroopers') || ctx.mem.doctrine === 'infantry')) add('academy', 11);
    if (count(ctx, 'armsWorks') < 2) add('armsWorks', 12 + (ctx.mem.doctrine === 'artillery' ? 3 : 0));
    if (count(ctx, 'motorPool') < 1 && (isUnitUnlocked(state, me, 'motorised') || isUnitUnlocked(state, me, 'armouredCar'))) add('motorPool', 11);
    if (count(ctx, 'tankWorks') < (ctx.mem.doctrine === 'armour' ? 2 : 1) && ctx.eco.income.fuel > 4) add('tankWorks', 15);
    if (def.oil && lvl('refinery') < 2) add('refinery', 18 - lvl('refinery') * 6);
    else if (!def.oil && ctx.eco.net.fuel < 3 && count(ctx, 'refinery') < 3) add('refinery', 10);
    if (frontier && atWar) add('hospital', 8);
    if (nationMorale < 55 && count(ctx, 'propaganda') < 3) add('propaganda', 16 - count(ctx, 'propaganda') * 3);
    if (!core && p.morale < 55) add('garrisonHq', 15);
    if (!p.supplied && !p.buildings.supplyDepot) add('supplyDepot', 30);
    if (threat > presence * 0.7 && threat > 0 && lvl('fortifications') < 3) add('fortifications', 15 + (def.objectiveVp ?? 0) * 4 - lvl('fortifications') * 3);
    if (frontier && atWar) add('railway', 7);
    if (world.seaLandings.has(pid) && threat > 0) add('coastalBattery', 12 - lvl('coastalBattery') * 4);
  }
  candidates.sort((a, b) => b.score - a.score || (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : a.b < b.b ? -1 : 1));
  let builds = 0;
  const maxBuilds = state.nations[me].resources.money > 3000 ? 4 : 2;
  const used = new Set<ProvinceId>();
  for (const c of candidates) {
    if (builds >= maxBuilds) break;
    if (used.has(c.pid)) continue;
    const level = (state.provinces[c.pid].buildings[c.b] ?? 0) + 1;
    if (!affordableWithReserve(ctx, constructionCost(state, me, c.b, level))) continue;
    if (issue(ctx, { type: 'build', nation: me, province: c.pid, building: c.b })) {
      builds++;
      used.add(c.pid);
    }
  }
}
