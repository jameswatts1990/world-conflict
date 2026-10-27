import { describe, expect, it } from 'vitest';
import { BUILDING_ORDER } from '../src/sim/config/buildings';
import { ARMY_RULES } from '../src/sim/config/units';
import { TECHS } from '../src/sim/config/research';
import { UNIT_TYPES, applyCommand, stepState, type Command, type GameState, type NationId } from '../src/sim';
import { aiGame, world } from './helpers';

/** Every rule the simulation must keep, whatever commands arrive. */
function violations(state: GameState): string[] {
  const out: string[] = [];
  for (const n of Object.values(state.nations)) {
    for (const [k, v] of Object.entries(n.resources)) if (!Number.isFinite(v) || v < 0) out.push(`${n.id} ${k} = ${v}`);
  }
  for (const a of Object.values(state.armies)) {
    if (a.units.length === 0) out.push(`empty army ${a.id}`);
    if (a.owner !== 'neutral' && state.nations[a.owner].eliminated) out.push(`army ${a.id} of eliminated ${a.owner}`);
    for (const u of a.units) if (!(u.strength > 0 && u.strength <= 1)) out.push(`unit ${u.id} strength ${u.strength}`);
    if (a.move) {
      const leg = a.move.leg;
      // On the way, an army belongs to one end of its road (it set out from it, or is walking back to it).
      if (leg && ((leg.from !== a.province && leg.to !== a.province) || a.move.path[0] !== leg.to)) out.push(`army ${a.id} leg out of step`);
      // Stopped on a road short of the land it was making for, its march goes on from the road's far end (as in startLeg).
      let at = leg ? leg.from : a.road && a.move.path[0] === a.province ? a.road.toward : a.province;
      for (const next of a.move.path) {
        if (!world.neighbors[at].some((n) => n.id === next)) out.push(`army ${a.id} path jumps ${at} -> ${next}`);
        at = next;
      }
      const halt = a.move.halt;
      if (halt && !world.neighbors[halt.province].some((n) => n.id === halt.toward && n.kind !== 'strait')) out.push(`army ${a.id} halts off the roads`);
    }
    if (a.road) {
      if (a.move?.leg) out.push(`army ${a.id} marching and standing on a road`);
      if (!world.neighbors[a.province].some((n) => n.id === a.road!.toward && n.kind !== 'strait')) out.push(`army ${a.id} on a road that is not there`);
      if (!(a.road.at > 0 && a.road.at < 1)) out.push(`army ${a.id} off the end of its road (${a.road.at})`);
    }
  }
  for (const p of Object.values(state.provinces)) {
    if (p.capture && p.capture.progress > p.capture.required) out.push(`capture overrun in ${p.id}`);
    if (p.recruitQueue.length > ARMY_RULES.maxRecruitQueue) out.push(`queue overflow in ${p.id}`);
  }
  return out;
}

/** A clumsy player: random orders, many of them invalid, at random moments. */
function randomCommand(state: GameState, me: NationId, rnd: () => number): Command | null {
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)];
  const armies = Object.values(state.armies).filter((a) => a.owner === me);
  const provinces = world.provinceIds.filter((p) => state.provinces[p].owner === me);
  // Mix local targets with whole-map targets: keep valid orders frequent as the map
  // grows, while still exercising distant marches and diplomacy with strangers.
  const neighbours = new Set(provinces.flatMap((p) => world.neighbors[p].map((n) => n.id)));
  const targets = [...new Set([...provinces, ...neighbours])];
  const nations = [...new Set([me, ...targets.map((p) => state.provinces[p].owner).filter((id) => id !== 'neutral')])];
  const army = armies.length ? pick(armies) : null;
  const province = provinces.length ? pick(provinces) : null;
  // Recruits are raised in cities: aim most such orders at one (the rest try the land, and fail).
  const cities = provinces.filter((p) => world.provinces[p].city);
  const city = cities.length && rnd() < 0.8 ? pick(cities) : province;
  switch (Math.floor(rnd() * 12)) {
    case 0: {
      if (!army) return null;
      // Half the time a spot on a road nearby (sea crossings included, which are refused).
      const nearby = rnd() < 0.5;
      const to = nearby ? pick([army.province, ...world.neighbors[army.province].map((n) => n.id)]) : rnd() < 0.25 ? pick(world.provinceIds) : pick(targets);
      const road = nearby ? { toward: pick(world.neighbors[to]).id, at: rnd() } : undefined;
      return { type: 'move', nation: me, armyId: army.id, to, road, mode: pick(['move', 'attack', 'patrol'] as const) };
    }
    case 1:
      return army ? { type: 'stop', nation: me, armyId: army.id } : null;
    case 2:
      return army && army.units.length > 1 ? { type: 'split', nation: me, armyId: army.id, unitIds: [army.units[0].id] } : null;
    case 3:
      return armies.length > 1 ? { type: 'merge', nation: me, armyIds: [pick(armies).id, pick(armies).id] } : null;
    case 4:
      return city ? { type: 'recruit', nation: me, province: city, unitType: pick(UNIT_TYPES) } : null;
    case 5:
      return province ? { type: 'cancelRecruit', nation: me, province, index: Math.floor(rnd() * 3) } : null;
    case 6:
      return province ? { type: 'build', nation: me, province, building: pick(BUILDING_ORDER) } : null;
    case 7:
      return province ? { type: 'cancelBuild', nation: me, province } : null;
    case 8:
      return { type: 'research', nation: me, tech: pick(TECHS).id };
    case 9:
      return rnd() < 0.1 ? { type: 'declareWar', nation: me, target: rnd() < 0.25 ? pick(world.nationIds) : pick(nations) } : null;
    case 10:
      return { type: 'offerPeace', nation: me, target: rnd() < 0.25 ? pick(world.nationIds) : pick(nations) };
    default: {
      const offer = state.peaceOffers.find((o) => o.to === me);
      return offer ? { type: 'respondPeace', nation: me, from: offer.from, accept: rnd() < 0.5 } : null;
    }
  }
}

describe('simulation invariants', () => {
  it.each([3, 21])('hold through a campaign of random player orders (seed %i)', (seed) => {
    let x = seed;
    const rnd = () => (x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 4294967296;
    // Keep the stress-test player stable when new countries join the roster.
    // These seeds originally exercised Italy, whose resources support many valid orders.
    const me: NationId = 'it';
    const state = aiGame(seed, me);
    let accepted = 0;
    for (let t = 0; t < 40 * 60 && !state.outcome; t++) {
      if (rnd() < 0.1) {
        const cmd = randomCommand(state, me, rnd);
        if (cmd && applyCommand(state, world, cmd).ok) accepted++;
      }
      stepState(state, world);
      if (t % 30 === 0) expect(violations(state)).toEqual([]);
    }
    expect(violations(state)).toEqual([]);
    expect(accepted).toBeGreaterThan(20);
  });
});
