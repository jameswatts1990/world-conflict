// Civilian life: province morale (drives output), national morale (the
// home-front average that caps unit morale) and city growth through tiers.
// Runs every INTERVALS.civicUpdate ticks.
import { BUILDING_EFFECTS, CITY } from '../config/buildings';
import { MORALE } from '../config/rules';
import { INTERVALS } from '../config/timing';
import { pushEvent } from '../events';
import { areHostile, atWar, isArmyInTransit, techEffects } from '../queries';
import { NEUTRAL, type Army, type GameState, type NationId, type ProvinceId } from '../types';
import { provinceName } from '../text';
import type { World } from '../world';

export interface MoraleFactor {
  label: string;
  value: number;
}

interface NationMoraleContext {
  wars: number;
  longestWarMinutes: number;
  capitalLost: boolean;
  propaganda: number;
  propagandaMult: number;
  core: number;
  occupied: number;
  moneyShort: boolean;
}

export interface MoraleContext {
  stationed: Map<ProvinceId, Army[]>;
  nations: Map<NationId, NationMoraleContext>;
}

export function buildMoraleContext(state: GameState, world: World): MoraleContext {
  const stationed = new Map<ProvinceId, Army[]>();
  for (const id of Object.keys(state.armies).sort()) {
    const a = state.armies[id];
    if (isArmyInTransit(a)) continue;
    const list = stationed.get(a.province) ?? [];
    list.push(a);
    stationed.set(a.province, list);
  }
  const nations = new Map<NationId, NationMoraleContext>();
  for (const id of world.nationIds) {
    const n = state.nations[id];
    let wars = 0;
    let longest = 0;
    for (const other of world.nationIds) {
      if (!atWar(state, id, other)) continue;
      wars++;
      longest = Math.max(longest, (state.tick - n.relations[other].since) / 60 / state.settings.durationScale);
    }
    let propaganda = 0;
    for (const pid of world.provinceIds) {
      const p = state.provinces[pid];
      if (p.owner === id && (p.buildings.propaganda ?? 0) > 0) propaganda++;
    }
    let core = 0;
    let occupied = 0;
    let propagandaMult = 1;
    for (const e of techEffects(state, id)) {
      if (e.kind === 'morale') core += e.amount;
      if (e.kind === 'occupationMorale') occupied += e.amount;
      if (e.kind === 'propaganda') propagandaMult *= e.mult;
    }
    nations.set(id, {
      wars,
      longestWarMinutes: longest,
      capitalLost: state.provinces[world.nations[id].capital].owner !== id,
      propaganda: Math.min(BUILDING_EFFECTS.propagandaMax, propaganda),
      propagandaMult,
      core,
      occupied,
      moneyShort: n.shortages.money,
    });
  }
  return { stationed, nations };
}

/** The morale a province is drifting towards, with every contributing factor. */
export function provinceMoraleTarget(
  state: GameState,
  world: World,
  pid: ProvinceId,
  ctx: MoraleContext = buildMoraleContext(state, world),
): { target: number; factors: MoraleFactor[] } {
  const p = state.provinces[pid];
  const def = world.provinces[pid];
  const owner = p.owner;
  if (owner === NEUTRAL) return { target: p.morale, factors: [] };
  const nc = ctx.nations.get(owner)!;
  const core = def.core === owner;
  const factors: MoraleFactor[] = [];
  const add = (label: string, value: number) => {
    if (value !== 0) factors.push({ label, value: Math.round(value * 10) / 10 });
  };
  const b = p.buildings;
  const here = ctx.stationed.get(pid) ?? [];

  if (core) {
    add('Home province', MORALE.coreBase);
    add('Research and national spirit', nc.core);
    add('National propaganda', nc.propaganda * BUILDING_EFFECTS.propagandaNational * nc.propagandaMult);
    if (nc.capitalLost) add('Capital occupied', MORALE.capitalLost);
  } else {
    add('Occupied territory', MORALE.occupiedBase);
    if (here.some((a) => a.owner === owner)) add('Garrison present', MORALE.garrison);
    const minutes = (state.tick - p.ownerSince) / 60 / state.settings.durationScale;
    add('Integration', Math.min(MORALE.integrationMax, minutes * MORALE.integrationPerMinute));
    if ((b.garrisonHq ?? 0) > 0) add('Occupation HQ', BUILDING_EFFECTS.garrisonHqMorale);
    add('Occupation policy', nc.occupied);
  }
  add('Housing', (b.housing ?? 0) * BUILDING_EFFECTS.housingMoralePerLevel);
  if ((b.hospital ?? 0) > 0) add('Hospital', BUILDING_EFFECTS.hospitalMorale);
  if ((b.propaganda ?? 0) > 0) add('Propaganda bureau', BUILDING_EFFECTS.propagandaLocal * nc.propagandaMult);
  if (nc.wars > 0) add(`At war (${nc.wars})`, nc.wars * MORALE.perWar);
  if (nc.longestWarMinutes > MORALE.wearinessAfterMinutes) {
    add('War weariness', Math.max(MORALE.wearinessMax, (nc.longestWarMinutes - MORALE.wearinessAfterMinutes) * MORALE.wearinessPerMinute));
  }
  if (nc.moneyShort) add('Treasury empty', MORALE.moneyShortage);
  if (here.some((a) => a.owner !== NEUTRAL && areHostile(state, a.owner, owner))) add('Battle raging', MORALE.battle);
  else if (
    world.vicinity[pid].some((id) => (ctx.stationed.get(id) ?? []).some((a) => a.owner !== NEUTRAL && atWar(state, a.owner, owner)))
  ) {
    add('Enemy at the border', MORALE.enemyAdjacent);
  }
  if (!p.supplied) add('Cut off from supply', MORALE.unsupplied);
  const total = factors.reduce((s, f) => s + f.value, 0);
  return { target: Math.max(5, Math.min(100, total)), factors };
}

/** Immediate morale change in every province a nation owns (core provinces only if `coreOnly`). */
export function shockNation(state: GameState, world: World, nation: NationId, delta: number, coreOnly = false): void {
  for (const pid of world.provinceIds) {
    const p = state.provinces[pid];
    if (p.owner !== nation || (coreOnly && world.provinces[pid].core !== nation)) continue;
    p.morale = Math.max(0, Math.min(100, p.morale + delta));
  }
}

/** Population-weighted morale of a nation's core provinces (all owned if no core is left). */
export function nationalMorale(state: GameState, world: World, nation: NationId): number {
  let w = 0;
  let m = 0;
  let wAll = 0;
  let mAll = 0;
  for (const pid of world.provinceIds) {
    const p = state.provinces[pid];
    if (p.owner !== nation) continue;
    const pop = world.provinces[pid].population;
    wAll += pop;
    mAll += pop * p.morale;
    if (world.provinces[pid].core === nation) {
      w += pop;
      m += pop * p.morale;
    }
  }
  if (w > 0) return m / w;
  return wAll > 0 ? mAll / wAll : state.nations[nation].morale;
}

/** Growth points per minute for a province (positive growth is boosted by research). */
export function cityGrowthPerMinute(state: GameState, pid: ProvinceId, battle: boolean): number {
  const p = state.provinces[pid];
  if (p.owner === NEUTRAL) return 0;
  let g = (p.buildings.housing ?? 0) * BUILDING_EFFECTS.housingGrowthPerLevel;
  if (p.morale >= 60) g += CITY.moraleGrowth;
  else if (p.morale < 35) g -= CITY.moraleGrowth;
  if (g > 0) for (const e of techEffects(state, p.owner)) if (e.kind === 'cityGrowth') g *= e.mult;
  if (battle) g += CITY.battleGrowth;
  return g;
}

export function civicSystem(state: GameState, world: World): void {
  const ctx = buildMoraleContext(state, world);
  const minutes = INTERVALS.civicUpdate / 60;
  for (const pid of world.provinceIds) {
    const p = state.provinces[pid];
    if (p.owner === NEUTRAL) continue;
    const { target } = provinceMoraleTarget(state, world, pid, ctx);
    const diff = target - p.morale;
    p.morale += Math.max(-MORALE.driftPerStep, Math.min(MORALE.driftPerStep, diff));

    // Only cities grow: the land round them has no city to grow.
    if (!world.provinces[pid].city) continue;
    const battle = !!state.battles[pid];
    p.growth = Math.max(0, p.growth + cityGrowthPerMinute(state, pid, battle) * minutes);
    const need = CITY.growthToNext[p.tier];
    if (p.tier < 5 && p.growth >= need) {
      p.tier = (p.tier + 1) as typeof p.tier;
      p.growth = 0;
      pushEvent(state, 'city-growth', `${provinceName(world, pid)} has grown into a ${CITY.tierNames[p.tier]}.`, {
        nations: [p.owner],
        province: pid,
        severity: 'good',
      });
    }
  }
  for (const id of world.nationIds) {
    const n = state.nations[id];
    if (!n.eliminated) n.morale = nationalMorale(state, world, id);
  }
}
