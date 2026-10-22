import { describe, expect, it } from 'vitest';
import { MORALE } from '../src/sim/config/rules';
import { INTERVALS } from '../src/sim/config/timing';
import { armyCombatMultiplier, combatSystem } from '../src/sim/systems/combat';
import {
  applyCommand,
  armyMorale,
  hashState,
  isArmyInTransit,
  type GameState,
  type ProvinceId,
  type UnitType,
} from '../src/sim';
import { clearArmies, place, quietGame, run, setWar, world } from './helpers';

type Units = Partial<Record<UnitType, number>>;

interface BattleOptions {
  seed?: number;
  /** Leave the attacker without a friendly neighbour to retreat to. */
  encircled?: boolean;
  tweak?: (s: GameState) => void;
  xp?: { attacker?: number; defender?: number };
  /** Stop after this many rounds even if both sides still stand. */
  maxRounds?: number;
}

/**
 * France attacks a German-owned province until one side is no longer standing
 * on it. A neighbouring province is French so the attacker has somewhere to
 * withdraw to if ordered.
 */
function battle(province: ProvinceId, attacker: Units, defender: Units, opts: BattleOptions = {}) {
  const state = quietGame(opts.seed ?? 1);
  clearArmies(state);
  setWar(state, 'fr', 'de');
  for (const id of world.provinceIds) if (state.provinces[id].owner === 'fr') state.provinces[id].owner = 'uk';
  state.provinces[province].owner = 'de';
  state.provinces[province].buildings = {};
  const retreat = world.neighbors[province][0].id;
  if (!opts.encircled) state.provinces[retreat].owner = 'fr';
  const att = place(state, 'fr', province, attacker, opts.xp?.attacker);
  const def = place(state, 'de', province, defender, opts.xp?.defender);
  opts.tweak?.(state);
  const standing = (id: string) => !!state.armies[id] && !isArmyInTransit(state.armies[id]) && state.armies[id].province === province;
  let rounds = 0;
  while (standing(att.id) && standing(def.id) && rounds < (opts.maxRounds ?? 300)) {
    combatSystem(state, world);
    rounds++;
  }
  const strength = (id: string) => state.armies[id]?.units.reduce((s, u) => s + u.strength, 0) ?? 0;
  return {
    state,
    rounds,
    att,
    def,
    retreat,
    attackerLeft: strength(att.id),
    defenderLeft: strength(def.id),
    attackerWon: standing(att.id) && !standing(def.id),
  };
}

function wins(n: number, fn: (seed: number) => boolean): number {
  let w = 0;
  for (let seed = 1; seed <= n; seed++) if (fn(seed)) w++;
  return w;
}

describe('combat resolution', () => {
  it('is deterministic for a given seed', () => {
    const a = battle('de-hesse', { infantry: 3, artillery: 1 }, { infantry: 3 }, { seed: 9 });
    const b = battle('de-hesse', { infantry: 3, artillery: 1 }, { infantry: 3 }, { seed: 9 });
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.rounds).toBe(b.rounds);
  });

  it('a much larger force wins', () => {
    expect(wins(5, (seed) => battle('de-north', { infantry: 6, artillery: 2 }, { infantry: 2 }, { seed }).attackerWon)).toBe(5);
  });

  it('dug-in defenders win even fights, and a small edge is no sure thing', () => {
    expect(wins(10, (seed) => !battle('de-north', { infantry: 3 }, { infantry: 3 }, { seed }).attackerWon)).toBeGreaterThanOrEqual(9);
    // With no rout, a larger force grinds on until it wins; ground and nerve still cost it.
    expect(wins(10, (seed) => !battle('de-north', { infantry: 4 }, { infantry: 3 }, { seed }).attackerWon)).toBeGreaterThanOrEqual(1);
  });

  it('artillery breaks defences that infantry alone cannot', () => {
    const infOnly = wins(10, (seed) => battle('de-north', { infantry: 4 }, { infantry: 3 }, { seed }).attackerWon);
    const withArt = wins(10, (seed) => battle('de-north', { infantry: 2, artillery: 2 }, { infantry: 3 }, { seed }).attackerWon);
    expect(withArt).toBeGreaterThan(infOnly);
    expect(withArt).toBeGreaterThanOrEqual(8);
  });

  it('tanks are strong on open ground and weak in mountains', () => {
    const plains = wins(10, (seed) => battle('de-north', { tank: 3 }, { infantry: 5 }, { seed }).attackerWon);
    const mountains = wins(10, (seed) =>
      battle('it-piedmont', { tank: 3 }, { infantry: 5 }, { seed, tweak: (s) => (s.provinces['it-piedmont'].owner = 'de') }).attackerWon,
    );
    expect(plains).toBeGreaterThanOrEqual(8);
    expect(mountains).toBeLessThanOrEqual(2);
  });

  it('anti-tank guns stop armour that brushes infantry aside', () => {
    const vsInfantry = wins(10, (seed) => battle('de-north', { tank: 3 }, { infantry: 5 }, { seed }).attackerWon);
    const vsGuns = wins(10, (seed) => battle('de-north', { tank: 3 }, { infantry: 3, antiTank: 2 }, { seed }).attackerWon);
    expect(vsGuns).toBeLessThan(vsInfantry);
    expect(vsGuns).toBeLessThanOrEqual(5);
  });

  it('armour hardness: rifles barely scratch tanks', () => {
    const r = battle('de-north', { tank: 1 }, { infantry: 1 }, { seed: 3 });
    const tank = r.state.armies[r.att.id]?.units[0]?.strength ?? 0;
    const rifles = r.state.armies[r.def.id]?.units[0]?.strength ?? 0;
    expect(tank).toBeGreaterThan(0.8);
    expect(tank).toBeGreaterThan(rifles);
  });

  it('support units fight from the second line while infantry screens them', () => {
    let infLoss = 0;
    let artLoss = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const r = battle('de-north', { infantry: 4 }, { infantry: 2, artillery: 2 }, { seed, maxRounds: 15 });
      const units = r.state.armies[r.def.id]?.units ?? [];
      for (const u of units) {
        if (u.type === 'infantry') infLoss += 1 - u.strength;
        else artLoss += 1 - u.strength;
      }
    }
    expect(artLoss).toBeLessThan(infLoss * 0.6);
  });

  it('siege guns and assault troops cut through fortifications', () => {
    const fort = (s: GameState) => (s.provinces['de-north'].buildings.fortifications = 3);
    const field = wins(10, (seed) => battle('de-north', { infantry: 3, artillery: 2 }, { infantry: 4 }, { seed, tweak: fort }).attackerWon);
    const siege = wins(10, (seed) => battle('de-north', { infantry: 3, heavyArtillery: 2 }, { infantry: 4 }, { seed, tweak: fort }).attackerWon);
    expect(siege).toBeGreaterThan(field);
  });

  it('veterans beat green troops of the same size', () => {
    const green = wins(10, (seed) => battle('de-north', { infantry: 2, artillery: 1 }, { infantry: 3 }, { seed, xp: { attacker: 0, defender: 3 } }).attackerWon);
    const elite = wins(10, (seed) => battle('de-north', { infantry: 2, artillery: 1 }, { infantry: 3 }, { seed, xp: { attacker: 6, defender: 0 } }).attackerWon);
    expect(elite).toBeGreaterThan(green);
  });

  it('fortifications and supply change the outcome', () => {
    const open = battle('de-north', { infantry: 5, artillery: 1 }, { infantry: 3 }, { seed: 3 });
    const fortified = battle('de-north', { infantry: 5, artillery: 1 }, { infantry: 3 }, {
      seed: 3,
      tweak: (s) => (s.provinces['de-north'].buildings.fortifications = 3),
    });
    expect(fortified.attackerLeft).toBeLessThan(open.attackerLeft);
    expect(fortified.rounds).toBeGreaterThan(open.rounds);

    const state = quietGame();
    const army = place(state, 'fr', 'fr-paris', { infantry: 1 });
    const supplied = armyCombatMultiplier(state, army);
    army.supplied = false;
    expect(armyCombatMultiplier(state, army)).toBeLessThan(supplied);
  });

  it('armies landing by sea fight at a penalty, except the British; coastal batteries punish landings', () => {
    const state = quietGame();
    setWar(state, 'fr', 'uk');
    const fr = place(state, 'fr', 'uk-london', { infantry: 1 });
    const uk = place(state, 'uk', 'fr-nord', { infantry: 1 });
    const base = armyCombatMultiplier(state, fr, 'uk-london');
    fr.arrivedVia = 'strait';
    uk.arrivedVia = 'strait';
    expect(armyCombatMultiplier(state, fr, 'uk-london')).toBeLessThan(base);
    expect(armyCombatMultiplier(state, uk, 'fr-nord')).toBe(armyCombatMultiplier(state, { ...uk, arrivedVia: null }, 'fr-nord'));

    const land = (battery: number) =>
      battle('de-north', { infantry: 4, artillery: 1 }, { infantry: 3 }, {
        seed: 4,
        tweak: (s) => {
          s.provinces['de-north'].buildings.coastalBattery = battery;
          for (const a of Object.values(s.armies)) if (a.owner === 'fr') a.arrivedVia = 'strait';
        },
      });
    expect(land(2).attackerLeft).toBeLessThan(land(0).attackerLeft);
  });

  it('isolated armies suffer attrition; supplied ones do not', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    // A French army deep in German land with no French territory nearby.
    for (const id of world.provinceIds) if (state.provinces[id].owner === 'fr') state.provinces[id].owner = 'de';
    state.provinces['fr-west'].owner = 'fr';
    const cut = place(state, 'fr', 'de-bavaria', { infantry: 2 });
    state.provinces['de-bavaria'].owner = 'fr'; // captured, but isolated from French hubs (no depot)
    run(state, 400);
    expect(state.armies[cut.id].supplied).toBe(false);
    expect(state.armies[cut.id].units[0].strength).toBeLessThan(1);
  });

  it('winning a battle leads to capture of the province', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const att = place(state, 'fr', 'fr-east', { infantry: 6, artillery: 2 });
    place(state, 'de', 'de-baden', { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: att.id, to: 'de-baden' });
    run(state, 600);
    expect(state.provinces['de-baden'].owner).toBe('fr');
    expect(Object.values(state.armies).some((a) => a.owner === 'de' && a.province === 'de-baden')).toBe(false);
    expect(state.events.some((e) => e.kind === 'capture' && e.province === 'de-baden')).toBe(true);
    expect(INTERVALS.combatRound).toBeGreaterThan(0);
  });
});

describe('morale in battle', () => {
  it('a losing army fights to the death instead of breaking', () => {
    const r = battle('de-north', { infantry: 3 }, { infantry: 3, artillery: 2 }, { seed: 2 });
    expect(r.attackerWon).toBe(false);
    expect(r.state.armies[r.att.id]).toBeUndefined();
    expect(r.state.events.some((e) => e.kind === 'army-destroyed' && e.subject === 'fr')).toBe(true);
    expect(r.state.events.some((e) => e.kind === 'rout' || e.kind === 'surrender')).toBe(false);
  });

  it('an army ordered out of a battle pays a set price in strength and leaves its weakest behind', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'de-baden', { infantry: 3 });
    place(state, 'de', 'de-baden', { infantry: 3 });
    army.units[0].strength = 0.1;
    combatSystem(state, world);
    const before = army.units.map((u) => [u.id, u.strength] as const);
    const order = applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-east' });
    expect(order.ok).toBe(true);
    expect(isArmyInTransit(army)).toBe(true);
    expect(army.units.length).toBe(before.length - 1);
    for (const u of army.units) {
      const was = before.find(([id]) => id === u.id)![1];
      expect(u.strength).toBeCloseTo(was - MORALE.retreatLoss, 9);
    }
    expect(state.nations.fr.stats.retreats).toBe(1);
    expect(state.nations.de.stats.unitsDestroyed).toBeGreaterThanOrEqual(1);
    expect(state.events.some((e) => e.kind === 'rout' && e.subject === 'fr')).toBe(true);
  });

  it('marching on outside a battle costs nothing', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-east', { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-paris' });
    for (const u of army.units) expect(u.strength).toBe(1);
    expect(state.nations.fr.stats.retreats).toBe(0);
  });

  it('withdrawn armies recover their morale out of combat', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'de-baden', { infantry: 3 });
    place(state, 'de', 'de-baden', { infantry: 3, artillery: 2 });
    for (let i = 0; i < 6; i++) combatSystem(state, world);
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-east' });
    const before = armyMorale(army);
    run(state, 200);
    expect(armyMorale(state.armies[army.id])).toBeGreaterThan(before + 0.2);
  });

  it('reconnaissance speeds up captures', () => {
    const capture = (units: Units) => {
      const state = quietGame();
      clearArmies(state);
      setWar(state, 'fr', 'de');
      place(state, 'fr', 'de-baden', units);
      let t = 0;
      while (state.provinces['de-baden'].owner !== 'fr' && t < 500) {
        run(state, 1);
        t++;
      }
      return t;
    };
    expect(capture({ infantry: 2, cavalry: 1 })).toBeLessThan(capture({ infantry: 3 }));
  });
});
