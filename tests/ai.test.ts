import { describe, expect, it } from 'vitest';
import { AI, AI_LEVELS, aiLevel } from '../src/sim/config/ai';
import {
  applyCommand,
  armyPower,
  captureTicks,
  createInitialState,
  placeShare,
  roadBorder,
  scaledTicks,
  setAiOrderTrace,
  type AiOpening,
  type AiOrderTrace,
  type GameState,
  type NationId,
} from '../src/sim';
import { buildContext, observeForces } from '../src/sim/ai/context';
import { attackNeed, handleMilitary } from '../src/sim/ai/military';
import { aiGame, clearArmies, landOf, landsOf, place, run, setWar, world } from './helpers';

/** A game in which only the given nation is run by the computer. */
function soloAi(nation: NationId, seed = 5): GameState {
  const state = aiGame(seed, null);
  for (const n of world.nationIds) {
    if (n === nation) continue;
    state.nations[n].controller = 'human';
    state.nations[n].ai = null;
  }
  return state;
}

const atWarWith = (state: GameState, nation: string) => world.nationIds.filter((n) => state.nations[nation].relations[n]?.status === 'war');

describe('AI army control', () => {
  it('an army taking a province holds it until it falls', () => {
    // Walking out resets the capture; the AI used to pull such armies back to
    // its frontier and then send them in again, over and over.
    const state = aiGame(3, 'fr');
    clearArmies(state);
    setWar(state, 'es', 'pt');
    // Portugal has no army left and nothing to raise one with.
    state.provinces['pt-lisbon'].recruitQueue = [];
    state.nations.pt.resources = { money: 0, materials: 0, fuel: 0, manpower: 0, fusion: 0 };
    const army = place(state, 'es', 'pt-lisbon', { infantry: 3 });
    const orders: AiOrderTrace[] = [];
    // Only orders given before Lisbon falls: afterwards the army is free to go.
    setAiOrderTrace((t) => state.provinces['pt-lisbon'].owner !== 'es' && orders.push(t));
    try {
      run(state, captureTicks(state, world, 'pt-lisbon') + 5);
    } finally {
      setAiOrderTrace(null);
    }
    expect(orders.filter((o) => o.armyId === army.id)).toEqual([]);
    expect(state.provinces['pt-lisbon'].owner).toBe('es');
  });

  it('keeps a garrison in an interior capital while an enemy army is two provinces away', () => {
    // Paris borders no foreign land, so before this the army there was sent off to the front.
    const state = soloAi('fr');
    clearArmies(state);
    const garrison = place(state, 'fr', 'fr-paris', { infantry: 4, artillery: 1 });
    place(state, 'de', 'de-hesse', { infantry: 8, artillery: 2 });
    setWar(state, 'fr', 'de');
    run(state, 60);
    expect(state.armies[garrison.id]?.province).toBe('fr-paris');
    expect(state.armies[garrison.id]?.move).toBeNull();
  });

  it('a winner that holds enough of the enemy\'s land accepts peace', () => {
    // Spain has taken two French home provinces and is far stronger: it used to fight on to the end.
    const state = soloAi('es');
    clearArmies(state);
    place(state, 'es', 'es-madrid', { infantry: 10, artillery: 3 });
    place(state, 'fr', 'fr-paris', { infantry: 2 });
    setWar(state, 'es', 'fr');
    for (const n of ['es', 'fr'] as const) state.nations[n].relations[n === 'es' ? 'fr' : 'es'].since = -60 * 11;
    state.provinces['fr-midi'].owner = 'es';
    state.provinces['fr-aquitaine'].owner = 'es';
    expect(applyCommand(state, world, { type: 'offerPeace', nation: 'fr', target: 'es' }).ok).toBe(true);
    run(state, 20);
    expect(atWarWith(state, 'es')).toEqual([]);
  });
});

describe.each(['normal', 'easy'] as const)('AI capture targets (%s)', (difficulty) => {
  function captureFront(reserveInfantry = 10) {
    const state = soloAi('es');
    state.settings.difficulty = difficulty;
    // Spain's personality is drawn from the seed and shifts whenever a nation joins the roster: fix it here.
    Object.assign(state.nations.es.ai!, { aggression: 0.7, economyBias: 0.35, doctrine: 'artillery', claims: [], opening: 'build' });
    clearArmies(state);
    setWar(state, 'es', 'pt');
    // Lisbon is the only Portuguese target left; Spain already holds its approaches.
    for (const pid of landsOf('pt-lisbon')) state.provinces[pid].owner = 'es';
    state.nations.pt.resources = { money: 0, materials: 0, fuel: 0, manpower: 0, fusion: 0 };
    state.provinces['pt-lisbon'].recruitQueue = [];
    const capturer = place(state, 'es', 'pt-lisbon', { infantry: 3 });
    const approach = world.neighbors['pt-lisbon'].find((n) => state.provinces[n.id].owner === 'es')!.id;
    const reserve = place(state, 'es', approach, { infantry: reserveInfantry, artillery: 3 });
    state.provinces['pt-lisbon'].capture = { by: 'es', progress: 1, required: captureTicks(state, world, 'pt-lisbon') };
    return { state, capturer, reserve };
  }

  it('keeps a further free army out of an uncontested capture until it falls', () => {
    const { state, capturer, reserve } = captureFront();
    const orders: AiOrderTrace[] = [];
    setAiOrderTrace((t) => state.provinces['pt-lisbon'].owner !== 'es' && orders.push(t));
    try {
      handleMilitary(buildContext(state, world, 'es'));
      run(state, captureTicks(state, world, 'pt-lisbon') + 5);
    } finally {
      setAiOrderTrace(null);
    }
    // Cover both planned attacks and opportunistic strikes, not just the report's attack counter.
    expect(orders.filter((o) => o.armyId === reserve.id && o.to === 'pt-lisbon')).toEqual([]);
    expect(orders.filter((o) => o.armyId === capturer.id)).toEqual([]);
    expect(state.provinces['pt-lisbon'].owner).toBe('es');
  });

  it('still reinforces a capture contested by a visible enemy', () => {
    const { state, reserve } = captureFront();
    place(state, 'pt', 'pt-lisbon', { infantry: 1 });
    const orders: AiOrderTrace[] = [];
    setAiOrderTrace((t) => orders.push(t));
    try {
      handleMilitary(buildContext(state, world, 'es'));
    } finally {
      setAiOrderTrace(null);
    }
    expect(orders.some((o) => o.armyId === reserve.id && o.to === 'pt-lisbon' && o.reason === 'attack')).toBe(true);
  });

  function threatenedCapture(strong: boolean) {
    const front = captureFront(11);
    const { state, capturer, reserve } = front;
    state.nations.es.ai!.campaigns = ['pt-lisbon'];
    const neighbour = world.neighbors['pt-lisbon'].find((n) => n.id !== reserve.province)!.id;
    state.provinces[neighbour].owner = 'pt';
    const enemy = place(state, 'pt', neighbour, { infantry: 12 });
    // A separate rear guard lets the reserve leave without exposing its starting province.
    place(state, 'es', reserve.province, { infantry: 12 });
    if (strong) {
      const extra = place(state, 'es', capturer.province, { infantry: 8, artillery: 3 });
      capturer.units.push(...extra.units);
      delete state.armies[extra.id];
    }
    const ctx = buildContext(state, world, 'es');
    expect(ctx.seen.has(neighbour)).toBe(true);
    expect(armyPower(state, capturer) >= attackNeed(ctx, capturer.province)).toBe(strong);
    return { ...front, enemy };
  }

  it('reinforces a weak capture against a strong visible enemy next door', () => {
    const { state, capturer, reserve, enemy } = threatenedCapture(false);
    const orders: AiOrderTrace[] = [];
    setAiOrderTrace((t) => orders.push(t));
    try {
      handleMilitary(buildContext(state, world, 'es'));
    } finally {
      setAiOrderTrace(null);
    }
    expect(orders).toEqual(expect.arrayContaining([
      expect.objectContaining({ armyId: reserve.id, to: capturer.province, reason: expect.stringMatching(/^(attack|strike)$/) }),
    ]));
    expect(orders.filter((o) => o.armyId === capturer.id)).toEqual([]);
    // Future regression guard: handleMilitary currently only orders idle armies, so it cannot recall this march.
    // Keep that behaviour if eligibility changes as the visible danger moves.
    const march = structuredClone(reserve.move);
    expect(march).not.toBeNull();
    const neighbour = enemy.province;
    enemy.province = 'de-berlin';
    handleMilitary(buildContext(state, world, 'es'));
    expect(reserve.move).toEqual(march);
    enemy.province = neighbour;
    handleMilitary(buildContext(state, world, 'es'));
    expect(reserve.move).toEqual(march);
  });

  it('does not count support still marching towards a weak capture as holding it', () => {
    const { state, capturer, reserve } = threatenedCapture(false);
    const furtherReserve = place(state, 'es', reserve.province, { infantry: 11, artillery: 3 });
    expect(applyCommand(state, world, {
      type: 'move', nation: 'es', armyId: reserve.id, to: capturer.province,
    }).ok).toBe(true);
    expect(reserve.move).not.toBeNull();
    const ctx = buildContext(state, world, 'es');
    const need = attackNeed(ctx, capturer.province);
    expect(armyPower(state, capturer)).toBeLessThan(need);
    expect(armyPower(state, capturer) + armyPower(state, reserve)).toBeGreaterThanOrEqual(need);
    const orders: AiOrderTrace[] = [];
    setAiOrderTrace((t) => orders.push(t));
    try {
      handleMilitary(ctx);
    } finally {
      setAiOrderTrace(null);
    }
    // Incoming support is strong enough, but has not arrived: the capture remains an eligible target.
    expect(orders).toEqual(expect.arrayContaining([
      expect.objectContaining({ armyId: furtherReserve.id, to: capturer.province, reason: expect.stringMatching(/^(attack|strike)$/) }),
    ]));
  });

  it('tops up a weak capture with only what its occupiers lack', () => {
    // The occupiers hold part of what Lisbon needs; a smaller force next door makes up the rest, and goes now
    // rather than waiting to gather a full-sized second army.
    const { state, capturer, reserve } = threatenedCapture(false);
    for (const a of Object.values(state.armies)) if (a.owner === 'es' && a.province === reserve.province && a.id !== reserve.id) delete state.armies[a.id];
    const need = attackNeed(buildContext(state, world, 'es'), capturer.province);
    const held = armyPower(state, capturer);
    const topUp = place(state, 'es', reserve.province, { infantry: 1 });
    const infantry = Math.ceil((need - held) / armyPower(state, topUp));
    delete state.armies[topUp.id];
    reserve.units = place(state, 'es', 'es-madrid', { infantry }).units;
    for (const a of Object.values(state.armies)) if (a.province === 'es-madrid') delete state.armies[a.id];
    // Two rear guards, each weaker than the top-up and both needed, stay behind against the enemy next door. They
    // stand apart on a road so nothing merges.
    const ctx = buildContext(state, world, 'es');
    const guard = Math.ceil(((ctx.threat.get(reserve.province) ?? 0) * ctx.level.defenceFactor) / 2 / armyPower(state, topUp));
    expect(guard).toBeLessThan(infantry);
    for (const at of [0.1, 0.2]) place(state, 'es', reserve.province, { infantry: guard }).road = { toward: 'pt-lisbon-nne', at };
    expect(held).toBeLessThan(need);
    expect(armyPower(state, reserve)).toBeLessThan(need);
    expect(held + armyPower(state, reserve)).toBeGreaterThanOrEqual(need);
    const orders: AiOrderTrace[] = [];
    setAiOrderTrace((t) => orders.push(t));
    try {
      handleMilitary(buildContext(state, world, 'es'));
    } finally {
      setAiOrderTrace(null);
    }
    expect(orders).toEqual(expect.arrayContaining([
      expect.objectContaining({ armyId: reserve.id, to: capturer.province, reason: expect.stringMatching(/^(attack|strike)$/) }),
    ]));
    expect(orders.filter((o) => o.armyId === capturer.id)).toEqual([]);
  });

  it('leaves an adequately held capture alone despite a visible enemy next door', () => {
    const { state, capturer, reserve } = threatenedCapture(true);
    const orders: AiOrderTrace[] = [];
    setAiOrderTrace((t) => orders.push(t));
    try {
      handleMilitary(buildContext(state, world, 'es'));
    } finally {
      setAiOrderTrace(null);
    }
    expect(orders.filter((o) => o.armyId === reserve.id && o.to === capturer.province)).toEqual([]);
    expect(orders.filter((o) => o.armyId === capturer.id)).toEqual([]);
  });
});

describe.each(['normal', 'easy'] as const)("AI and a co-belligerent's capture (%s)", (difficulty) => {
  /** France is taking Lisbon uncontested; Spain, its co-belligerent against Portugal, has a strong army next door. */
  function alliedCapture() {
    const state = soloAi('es');
    state.settings.difficulty = difficulty;
    Object.assign(state.nations.es.ai!, { aggression: 0.7, economyBias: 0.35, doctrine: 'artillery', claims: [], opening: 'build' });
    clearArmies(state);
    setWar(state, 'es', 'pt');
    setWar(state, 'fr', 'pt');
    // Lisbon is the only Portuguese target left; Spain already holds its approaches.
    for (const pid of landsOf('pt-lisbon')) state.provinces[pid].owner = 'es';
    state.nations.pt.resources = { money: 0, materials: 0, fuel: 0, manpower: 0, fusion: 0 };
    state.provinces['pt-lisbon'].recruitQueue = [];
    const capturer = place(state, 'fr', 'pt-lisbon', { infantry: 2 });
    state.provinces['pt-lisbon'].capture = { by: 'fr', progress: 1, required: captureTicks(state, world, 'pt-lisbon') };
    const approach = world.neighbors['pt-lisbon'].find((n) => state.provinces[n.id].owner === 'es')!.id;
    const army = place(state, 'es', approach, { infantry: 10, artillery: 3 });
    const ctx = buildContext(state, world, 'es');
    expect(ctx.seen.has('pt-lisbon')).toBe(true);
    // Spain's army alone could take Lisbon, and would arrive stronger than France's occupiers.
    expect(armyPower(state, army)).toBeGreaterThan(Math.max(attackNeed(ctx, 'pt-lisbon'), armyPower(state, capturer)));
    return { state, army };
  }

  const ordersOf = (state: GameState) => {
    const orders: AiOrderTrace[] = [];
    setAiOrderTrace((t) => orders.push(t));
    try {
      handleMilitary(buildContext(state, world, 'es'));
    } finally {
      setAiOrderTrace(null);
    }
    return orders;
  };

  it('leaves it to the co-belligerent rather than taking the lead and restarting it', () => {
    const { state } = alliedCapture();
    expect(ordersOf(state).filter((o) => o.to === 'pt-lisbon')).toEqual([]);
  });

  it('still attacks once an enemy stands in the province', () => {
    const { state, army } = alliedCapture();
    place(state, 'pt', 'pt-lisbon', { infantry: 1 });
    expect(ordersOf(state)).toEqual(expect.arrayContaining([
      expect.objectContaining({ armyId: army.id, to: 'pt-lisbon', reason: expect.stringMatching(/^(attack|strike)$/) }),
    ]));
  });
});

describe('AI on several fronts (interior lines)', () => {
  /** Germany at war with a strong France and a weak Poland; the French border is thinly held. */
  function twoFronts() {
    const state = soloAi('de');
    clearArmies(state);
    place(state, 'de', 'de-hesse', { infantry: 6, artillery: 1 });
    place(state, 'de', 'de-berlin', { infantry: 6, artillery: 1 });
    place(state, 'fr', 'fr-east', { infantry: 1 });
    place(state, 'fr', 'fr-paris', { infantry: 10, artillery: 2 });
    place(state, 'pl', 'pl-greater', { infantry: 1 });
    setWar(state, 'de', 'fr');
    setWar(state, 'de', 'pl');
    return state;
  }

  it('attacks only its main enemy and holds the other front', () => {
    // Without interior lines the army in Hesse takes lightly held Strasbourg.
    const state = twoFronts();
    const orders: AiOrderTrace[] = [];
    setAiOrderTrace((t) => orders.push(t));
    try {
      run(state, 90);
    } finally {
      setAiOrderTrace(null);
    }
    expect(state.nations.de.ai!.focus).toBe('pl');
    expect(orders.filter((o) => o.to.startsWith('fr-'))).toEqual([]);
    expect(state.provinces['fr-east'].owner).toBe('fr');
  });

  it('offers peace on the main front once its gains are in hand, and not on the other', () => {
    const state = twoFronts();
    for (const n of ['fr', 'pl'] as const) {
      state.nations.de.relations[n].since = -60 * 11;
      state.nations[n].relations.de.since = -60 * 11;
    }
    state.provinces['pl-greater'].owner = 'de';
    state.provinces['pl-pomerania'].owner = 'de';
    run(state, 20);
    expect(state.peaceOffers.filter((o) => o.from === 'de').map((o) => o.to)).toEqual(['pl']);
  });
});

describe('AI difficulty', () => {
  it('new games record the difficulty; saves without one play at normal', () => {
    expect(aiLevel(createInitialState(world, { seed: 1, humanNation: 'fr', difficulty: 'easy' }))).toBe(AI_LEVELS.easy);
    const state = aiGame(1, 'fr');
    expect(aiLevel(state)).toBe(AI_LEVELS.normal);
    delete state.settings.difficulty;
    expect(aiLevel(state)).toBe(AI_LEVELS.normal);
  });

  it('easy opponents start no wars before their longer grace period', () => {
    // At normal, France and Italy, and Poland and Czechia, are at war by now in this seed.
    const state = createInitialState(world, { seed: 1, humanNation: 'fr', difficulty: 'easy' });
    run(state, AI_LEVELS.easy.peaceGraceSeconds - 5);
    expect(world.nationIds.flatMap((n) => atWarWith(state, n))).toEqual([]);
  });

  it('easy opponents do not gang up on a nation already at war', () => {
    // At normal, Italy joins Germany's war on France in this seed.
    const state = createInitialState(world, { seed: 1, humanNation: 'fr', difficulty: 'easy' });
    setWar(state, 'de', 'fr');
    run(state, 1500);
    expect(atWarWith(state, 'fr')).toEqual(['de']);
  });
});

describe('AI personalities', () => {
  it('each AI claims cities across its land borders, drawn from the seed', () => {
    const drawn = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const state = createInitialState(world, { seed, humanNation: null });
      for (const n of world.nationIds) {
        const claims = state.nations[n].ai!.claims!;
        drawn.add(`${n}:${claims.join(',')}`);
        expect(new Set(claims).size).toBe(claims.length);
        for (const pid of claims) {
          // A city one of whose lands borders the AI's own.
          expect(world.provinces[pid].city).toBeDefined();
          expect(state.provinces[pid].owner).not.toBe(n);
          expect(landsOf(pid).some((land) => world.neighbors[land].some((c) => c.kind !== 'strait' && state.provinces[c.id].owner === n))).toBe(true);
        }
      }
      // Britain's only land border is Ireland's, in Ulster: Dublin is all it can claim (never across the sea).
      expect(state.nations.uk.ai!.claims).toEqual(['ie-dublin']);
    }
    expect(drawn.size).toBeGreaterThan(world.nationIds.length * 3);
  });

  it('openings vary from seed to seed', () => {
    const drawn = new Set<AiOpening | undefined>();
    for (let seed = 1; seed <= 10; seed++) {
      const state = createInitialState(world, { seed, humanNation: null });
      for (const n of world.nationIds) drawn.add(state.nations[n].ai!.opening);
    }
    expect([...drawn].sort()).toEqual(['build', 'expand', 'strike']);
  });

  it('an AI that opens by building keeps the peace longer than one that strikes', () => {
    const play = (opening: AiOpening) => {
      const state = createInitialState(world, { seed: 1, humanNation: null });
      for (const n of world.nationIds) state.nations[n].ai!.opening = opening;
      run(state, 715);
      return world.nationIds.flatMap((n) => atWarWith(state, n));
    };
    expect(play('strike').length).toBeGreaterThan(0);
    expect(play('build')).toEqual([]);
  });

  it('saves without claims or an opening still play', () => {
    const state = aiGame(4, 'fr');
    for (const n of world.nationIds) {
      delete state.nations[n].ai?.claims;
      delete state.nations[n].ai?.opening;
    }
    expect(() => run(state, 900)).not.toThrow();
  });
});

describe('AI military', () => {
  it('holds an occupied enemy province until the capture completes', () => {
    const state = aiGame(3);
    run(state, scaledTicks(state, AI.neutralGraceSeconds));
    setWar(state, 'fr', 'be');
    // Belgium has no army left and nothing to raise one with.
    clearArmies(state, 'be-brussels');
    state.provinces['be-brussels'].recruitQueue = [];
    state.nations.be.resources = { money: 0, materials: 0, fuel: 0, manpower: 0, fusion: 0 };
    place(state, 'fr', 'be-brussels', { infantry: 4 });
    for (let t = 0; t < 400 && state.provinces['be-brussels'].owner === 'be'; t++) {
      run(state, 1);
      // Armies may merge or pass through, but the province is never left empty.
      const french = Object.values(state.armies).filter((a) => a.owner === 'fr' && a.province === 'be-brussels');
      expect(french.length).toBeGreaterThan(0);
    }
    expect(state.provinces['be-brussels'].owner).toBe('fr');
  });
});

describe('AI under the fog of war', () => {
  it('knows only the armies it can see, and guesses at the rest from public totals', () => {
    const state = aiGame(5);
    clearArmies(state);
    setWar(state, 'fr', 'de');
    // A German tank army deep in Germany, out of France's sight.
    const tanks = place(state, 'de', 'de-berlin', { tank: 6 });
    observeForces(state, world, 'fr');
    let ctx = buildContext(state, world, 'fr');
    expect(ctx.seen.has('de-berlin')).toBe(false);
    expect(ctx.hostile.has('de-berlin')).toBe(false);
    expect(ctx.enemyArmour).toBe(0);
    // Germany's military power is public, so France spreads it over the German places it cannot see: each city one,
    // and the land round it one more, shared between its lands.
    const dark = world.provinceIds.filter((p) => state.provinces[p].owner === 'de' && !ctx.seen.has(p)).reduce((t, p) => t + placeShare(world, p), 0);
    expect(ctx.unseen.get('de')).toBeCloseTo(armyPower(state, tanks) / dark);

    // A French cavalry scout two provinces away finds it.
    const scout = place(state, 'fr', 'de-hesse', { cavalry: 1 });
    observeForces(state, world, 'fr');
    ctx = buildContext(state, world, 'fr');
    expect(ctx.hostile.get('de-berlin')).toBeCloseTo(armyPower(state, tanks));
    expect(ctx.unseen.get('de') ?? 0).toBeCloseTo(0);
    expect(ctx.enemyArmour).toBe(1);

    // Out of sight again, the tanks are not forgotten.
    delete state.armies[scout.id];
    observeForces(state, world, 'fr');
    ctx = buildContext(state, world, 'fr');
    expect(ctx.hostile.has('de-berlin')).toBe(false);
    expect(ctx.enemyArmour).toBe(1);
  });

  it('sizes an attack by what it can see, not by where a hidden army stands', () => {
    const state = aiGame(5);
    clearArmies(state);
    setWar(state, 'fr', 'de');
    // Baden, by the Rhine, borders France and is in sight; Swabia, behind it, and Berlin are not.
    const army = place(state, 'de', 'de-bavaria-w', { infantry: 10 });
    const need = () => attackNeed(buildContext(state, world, 'fr'), 'de-baden-sw');
    const hidden = need();
    army.province = 'de-berlin';
    expect(need()).toBeCloseTo(hidden);
    // In plain sight next door, the same army raises the bar.
    army.province = 'de-hesse-w';
    expect(need()).toBeGreaterThan(hidden);
  });

  it('sees what its co-belligerents see once it has Liaison Officers', () => {
    const state = aiGame(5);
    setWar(state, 'fr', 'de');
    setWar(state, 'it', 'de');
    expect(buildContext(state, world, 'fr').seen.has('it-naples')).toBe(false);
    state.nations.fr.research.completed.push('liaisonOfficers');
    expect(buildContext(state, world, 'fr').seen.has('it-naples')).toBe(true);
  });
});

describe('AI forward positions', () => {
  /** France at war with Germany, which masses in Hesse; Paris is garrisoned, Alsace-Lorraine thinly held. */
  function front(difficulty?: 'easy') {
    const state = soloAi('fr');
    if (difficulty) state.settings.difficulty = difficulty;
    clearArmies(state);
    place(state, 'fr', 'fr-paris', { infantry: 6, artillery: 2 });
    const guard = place(state, 'fr', 'fr-east-w', { infantry: 3 });
    place(state, 'de', 'de-hesse-w', { infantry: 8, artillery: 2 });
    setWar(state, 'fr', 'de');
    return { state, guard };
  }

  it('an army guarding a land at the front stands forward on the road towards the danger, short of the border', () => {
    const { state, guard } = front();
    const orders: AiOrderTrace[] = [];
    setAiOrderTrace((t) => orders.push(t));
    try {
      run(state, 60);
    } finally {
      setAiOrderTrace(null);
    }
    const army = state.armies[guard.id];
    expect(army.province).toBe('fr-east-w');
    expect(army.move).toBeNull();
    expect(army.road?.toward).toBe('de-hesse-w');
    expect(army.road!.at).toBeLessThan(roadBorder(world, 'fr-east-w', 'de-hesse-w'));
    expect(army.road!.at).toBeCloseTo(roadBorder(world, 'fr-east-w', 'de-hesse-w') * AI.forwardDepth, 2);
    // One order to go forward, and then it stays put.
    expect(orders.filter((o) => o.armyId === guard.id).map((o) => o.reason)).toEqual(['screen']);
  });

  it('a screen keeps its facing for a while, then turns to face a new danger only when it is clearly greater', () => {
    // A little more in Baden than in Hesse: not enough to turn round, however long it waits.
    const little = front();
    run(little.state, 60);
    place(little.state, 'de', 'de-baden-sw', { infantry: 9 });
    run(little.state, AI.forwardHold + 60);
    expect(little.state.armies[little.guard.id].road?.toward).toBe('de-hesse-w');
    // A great deal more: it holds its facing for a while, then turns to face it.
    const { state, guard } = front();
    run(state, 60);
    place(state, 'de', 'de-baden-sw', { infantry: 24, artillery: 6 });
    run(state, 60);
    expect(state.armies[guard.id].road?.toward).toBe('de-hesse-w');
    run(state, AI.forwardHold);
    expect(state.armies[guard.id].road?.toward).toBe('de-baden-sw');
    expect(state.nations.fr.ai!.forwardHolds?.[guard.id]).toBeDefined();
  });

  it('easy opponents keep to the crossroads', () => {
    const { state, guard } = front('easy');
    run(state, 90);
    expect(state.armies[guard.id].road).toBeUndefined();
  });

  it('an offensive masses on the road into its target, just short of the border, then strikes from there', () => {
    // Spain against Portugal: a small army at the border and a larger one behind it, together enough.
    const state = soloAi('es');
    clearArmies(state);
    state.nations.es.ai!.aggression = 0.9;
    const portugal = new Set(landsOf('pt-lisbon'));
    place(state, 'es', landOf('es-castile', 'pt-lisbon'), { infantry: 4 });
    place(state, 'es', landOf('es-madrid'), { infantry: 8, artillery: 3 });
    place(state, 'es', 'es-madrid', { infantry: 4 });
    place(state, 'pt', landOf('pt-lisbon', 'es-castile'), { infantry: 3 });
    setWar(state, 'es', 'pt');
    const orders: AiOrderTrace[] = [];
    const spots: string[] = [];
    const taken = () => [...portugal].some((pid) => state.provinces[pid].owner === 'es');
    setAiOrderTrace((t) => orders.push(t));
    try {
      for (let t = 0; t < 300 && !taken(); t++) {
        run(state, 1);
        for (const a of Object.values(state.armies)) if (a.owner === 'es' && a.road && portugal.has(a.road.toward)) spots.push(a.id);
      }
    } finally {
      setAiOrderTrace(null);
    }
    // The build-up stood on the road into Portugal, and the attack went in from there.
    expect(spots.length).toBeGreaterThan(0);
    expect(orders.some((o) => o.reason === 'stage')).toBe(true);
    expect(orders.some((o) => o.reason === 'attack' && portugal.has(o.to))).toBe(true);
  });
});
