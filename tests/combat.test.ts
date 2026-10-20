import { describe, expect, it } from 'vitest';
import { INTERVALS } from '../src/sim/config/timing';
import { armyCombatMultiplier, combatSystem } from '../src/sim/systems/combat';
import { applyCommand, hashState, type GameState, type ProvinceId, type UnitType } from '../src/sim';
import { clearArmies, place, quietGame, run, setWar, world } from './helpers';

type Units = Partial<Record<UnitType, number>>;

/** Places an attacker (France) and a defender (Germany, owning the province) and fights to the end. */
function battle(province: ProvinceId, attacker: Units, defender: Units, seed = 1, tweak?: (s: GameState) => void) {
  const state = quietGame(seed);
  clearArmies(state);
  setWar(state, 'fr', 'de');
  state.provinces[province].owner = 'de';
  state.provinces[province].buildings = {};
  const att = place(state, 'fr', province, attacker);
  const def = place(state, 'de', province, defender);
  tweak?.(state);
  let rounds = 0;
  while (state.armies[att.id] && state.armies[def.id] && rounds < 500) {
    combatSystem(state, world);
    rounds++;
  }
  const strength = (id: string) => state.armies[id]?.units.reduce((s, u) => s + u.strength, 0) ?? 0;
  return { state, rounds, attackerLeft: strength(att.id), defenderLeft: strength(def.id), attackerWon: !!state.armies[att.id] };
}

describe('combat resolution', () => {
  it('is deterministic for a given seed', () => {
    const a = battle('de-hesse', { infantry: 3, artillery: 1 }, { infantry: 3 }, 9);
    const b = battle('de-hesse', { infantry: 3, artillery: 1 }, { infantry: 3 }, 9);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.rounds).toBe(b.rounds);
  });

  it('a much larger force wins', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(battle('de-north', { infantry: 6, artillery: 2 }, { infantry: 2 }, seed).attackerWon).toBe(true);
    }
  });

  it('defenders have the advantage in equal infantry fights', () => {
    let defenderWins = 0;
    for (let seed = 1; seed <= 10; seed++) if (!battle('de-north', { infantry: 3 }, { infantry: 3 }, seed).attackerWon) defenderWins++;
    expect(defenderWins).toBeGreaterThanOrEqual(9);
  });

  it('artillery breaks defences that infantry alone cannot', () => {
    let infOnly = 0;
    let withArt = 0;
    for (let seed = 1; seed <= 10; seed++) {
      if (battle('de-north', { infantry: 4 }, { infantry: 3 }, seed).attackerWon) infOnly++;
      if (battle('de-north', { infantry: 2, artillery: 2 }, { infantry: 3 }, seed).attackerWon) withArt++;
    }
    expect(withArt).toBeGreaterThan(infOnly);
  });

  it('tanks are strong on open ground and weak in mountains', () => {
    let plains = 0;
    let mountains = 0;
    for (let seed = 1; seed <= 10; seed++) {
      if (battle('de-north', { tank: 3 }, { infantry: 5 }, seed).attackerWon) plains++; // plains
      if (battle('it-piedmont', { tank: 3 }, { infantry: 5 }, seed).attackerWon) mountains++; // mountains
    }
    expect(plains).toBeGreaterThanOrEqual(8);
    expect(mountains).toBeLessThanOrEqual(2);
  });

  it('fortifications and supply change the outcome', () => {
    const open = battle('de-north', { infantry: 5, artillery: 1 }, { infantry: 3 }, 3);
    const fortified = battle('de-north', { infantry: 5, artillery: 1 }, { infantry: 3 }, 3, (s) => {
      s.provinces['de-north'].buildings.fortifications = 3;
    });
    expect(fortified.attackerLeft).toBeLessThan(open.attackerLeft);
    expect(fortified.rounds).toBeGreaterThan(open.rounds);

    const state = quietGame();
    const army = place(state, 'fr', 'fr-paris', { infantry: 1 });
    const supplied = armyCombatMultiplier(state, army);
    army.supplied = false;
    expect(armyCombatMultiplier(state, army)).toBeLessThan(supplied);
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
