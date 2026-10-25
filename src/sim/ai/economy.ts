// Research and construction for computer opponents. Research follows the
// AI's doctrine and answers what the enemy fields; construction plans each
// city's limited slots around growth, industry, recruitment and morale, and
// gives each land its one building: economy behind the lines, defence and
// field hospitals at the front.
import { AI } from '../config/ai';
import { BUILDINGS, BUILDING_EFFECTS, CITY, landBuildings, slotsUsed } from '../config/buildings';
import { TECHS, type TechConfig } from '../config/research';
import { checkBuildRules, checkResearch } from '../commands';
import { buildingSlots, constructionCost, isUnitUnlocked, researchSlots } from '../queries';
import { random } from '../rng';
import type { BuildingType, ProvinceId, ResourceKey } from '../types';
import { landsOf } from '../world';
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
  // How many of each building it has, counted once: nothing is built until every candidate is in.
  const counts = new Map<BuildingType, number>();
  const held = (b: BuildingType) => counts.get(b) ?? counts.set(b, count(ctx, b)).get(b)!;
  const nationMorale = state.nations[me].morale;
  const atWar = ctx.enemies.length > 0;
  // How short each resource runs (0..1): upkeep eating most of its income, or little of it in store (the AI spends
  // what it has, so the resource it keeps running out of is the one in demand).
  const need = (k: ResourceKey) => {
    const income = Math.max(1, ctx.eco.income[k]);
    const upkeep = (0.3 - ctx.eco.net[k] / income) / 0.3;
    const store = (L.storeMinutes - state.nations[me].resources[k] / income) / L.storeMinutes;
    return Math.max(0, Math.min(1, Math.max(upkeep, store)));
  };
  const L = AI.land;

  for (const pid of ctx.owned) {
    const p = state.provinces[pid];
    if (p.construction) continue;
    const def = world.provinces[pid];
    const core = def.core === me;
    const outputFactor = (core ? 1 : 0.6) * (p.morale / 70);
    const freeSlots = buildingSlots(state, world, pid) - slotsUsed(p.buildings, null);
    const frontier = ctx.frontier.has(pid);
    // A city whose land meets the enemy is on the front too.
    const front = frontier || landsOf(world, pid).some((land) => ctx.frontier.has(land));
    const threat = ctx.threat.get(pid) ?? 0;
    const presence = ctx.presence.get(pid) ?? 0;
    const lvl = (b: BuildingType) => p.buildings[b] ?? 0;
    // Land holds one building: replace it only for a pressing military or supply need, and only an economy or civic one.
    const standing = def.city ? [] : landBuildings(p.buildings);
    const add = (b: BuildingType, score: number) => {
      if (score <= 0) return;
      // The last free slot is precious: keep it for the most valuable buildings.
      if (def.city && BUILDINGS[b].category !== 'infrastructure' && lvl(b) === 0 && freeSlots <= 1 && score < 14) return;
      const others = standing.filter((x) => x !== b);
      if (others.length > 0) {
        const pressing = (BUILDINGS[b].category === 'military' || BUILDINGS[b].category === 'infrastructure') && score >= L.replaceScore;
        if (!pressing || others.some((x) => BUILDINGS[x].category !== 'economy' && BUILDINGS[x].category !== 'civic')) return;
      }
      if (checkBuildRules(state, world, me, pid, b).ok) candidates.push({ pid, b, score });
    };

    add('industry', ((def.production.money * 0.3 + def.production.materials * 0.6) * outputFactor * (1 + ctx.mem.economyBias)) / (1 + lvl('industry') * 0.6));
    add('market', (def.production.money * 0.3 * outputFactor * (1 + ctx.mem.economyBias)) / (1 + lvl('market')));
    add('powerPlant', 9 + world.nearbyCities[pid].filter((c) => ctx.ownedSet.has(c)).length * 2);
    add('housing', p.tier < 4 ? (core ? 9 : 4) + (CITY.slots[p.tier + 1] - CITY.slots[p.tier]) * 2 - lvl('housing') * 2 : 0);
    if (held('university') < 3) add('university', 18 - held('university') * 3);
    if (held('barracks') < 2 + Math.floor(ctx.ownedCities / 4)) add('barracks', 13 + (front ? 5 : 0));
    if (held('academy') < 1 && (isUnitUnlocked(state, me, 'stormtroopers') || ctx.mem.doctrine === 'infantry')) add('academy', 11);
    if (held('armsWorks') < 2) add('armsWorks', 12 + (ctx.mem.doctrine === 'artillery' ? 3 : 0));
    if (held('motorPool') < 1 && (isUnitUnlocked(state, me, 'motorised') || isUnitUnlocked(state, me, 'armouredCar'))) add('motorPool', 11);
    if (held('tankWorks') < (ctx.mem.doctrine === 'armour' ? 2 : 1) && ctx.eco.income.fuel > 4) add('tankWorks', 15);
    if (def.oil && lvl('refinery') < 2) add('refinery', 18 - lvl('refinery') * 6);
    else if (!def.oil && ctx.eco.net.fuel < 3 && held('refinery') < 3) add('refinery', 10);
    if (front && atWar) add('hospital', 8);
    if (nationMorale < 55 && held('propaganda') < 3) add('propaganda', 16 - held('propaganda') * 3);
    if (!core && p.morale < 55) add('garrisonHq', 15);
    if (!p.supplied && !p.buildings.supplyDepot) add('supplyDepot', 30);
    if (threat > presence * 0.7 && threat > 0 && lvl('fortifications') < 3) add('fortifications', 15 + (def.objectiveVp ?? 0) * 4 - lvl('fortifications') * 3);
    if (frontier && atWar) add('railway', 7);
    if (world.seaLandings.has(pid) && threat > 0) add('coastalBattery', 12 - lvl('coastalBattery') * 4);
    if (!def.city) {
      // Behind the lines, land earns: whichever economy building eases the shortest resource.
      if (!frontier && threat === 0) {
        const bias = 1 + ctx.mem.economyBias;
        add('farm', (L.farm + need('manpower') * L.need) * outputFactor);
        add('tradingPost', (L.tradingPost + need('money') * L.need) * outputFactor * bias);
        add('workshops', (L.workshops + need('materials') * L.need) * outputFactor);
        add('oilWells', (L.oilWells + need('fuel') * L.need) * outputFactor);
        if (held('fieldStation') < BUILDING_EFFECTS.fieldStationMax) add('fieldStation', L.fieldStation * bias);
      }
      // At the front, defensive works where the enemy stands next door; field hospitals just behind the line.
      if (frontier && atWar && threat > 0 && !lvl('fortifications')) add('bunkers', L.bunkers + (threat > presence ? 2 : 0));
      const behindFront = !frontier && world.neighbors[pid].some((n) => ctx.frontier.has(n.id));
      if (atWar && behindFront && held('fieldHospital') < L.fieldHospitals) add('fieldHospital', L.fieldHospital);
    }
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
