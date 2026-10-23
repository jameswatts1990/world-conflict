import { describe, expect, it } from 'vitest';
import { applyCommand, armyName, hostileArmiesIn, legTicks, planMarch, stepState } from '../src/sim';
import { makePeace } from '../src/sim/systems/diplomacy';
import { spawnUnit } from '../src/sim/systems/production';
import { aiGame, clearArmies, place, quietGame, run, setWar, world } from './helpers';

describe('halting on a road', () => {
  it('stops part of the way along a road, still in its own province, and goes on from there', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris', { infantry: 2 });
    const leg = legTicks(state, world, army, 'fr-paris', 'fr-nord');
    expect(applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-paris', road: { toward: 'fr-nord', at: 0.4 } }).ok).toBe(true);
    run(state, Math.round(0.4 * leg) - 1);
    expect(army.move?.leg).toBeTruthy();
    run(state, 1);
    expect(army.move).toBeNull();
    expect(army.province).toBe('fr-paris');
    expect(army.road).toEqual({ toward: 'fr-nord', at: 0.4 });
    // On along the road: only the rest of the leg is left.
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-nord' });
    expect(army.road).toBeUndefined();
    run(state, leg - Math.round(0.4 * leg));
    expect(army.province).toBe('fr-nord');
    expect(army.move).toBeNull();
  });

  it('reaches a spot on the far side of a border from the near end, entering that province there', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-east', { infantry: 4 });
    // 30% of the way out of Frankfurt towards Strasbourg: most of the way from Strasbourg.
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-hesse', road: { toward: 'fr-east', at: 0.3 } });
    expect(army.move?.path).toEqual(['de-hesse']);
    const leg = legTicks(state, world, army, 'fr-east', 'de-hesse');
    run(state, Math.round(0.7 * leg));
    expect(army.province).toBe('de-hesse');
    expect(army.road).toEqual({ toward: 'fr-east', at: 0.3 });
    expect(army.arrivedVia).toBe('land');
    // Standing in the province, it takes it.
    run(state, 400);
    expect(state.provinces['de-hesse'].owner).toBe('fr');
  });

  it('from a road, a march elsewhere walks back to its own city first; back along the road it turns round', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris', { infantry: 2 });
    army.road = { toward: 'fr-nord', at: 0.5 };
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-normandy' });
    expect(army.move?.leg).toMatchObject({ from: 'fr-nord', to: 'fr-paris' });
    expect(army.move?.path).toEqual(['fr-paris', 'fr-normandy']);
    expect(army.province).toBe('fr-paris');
    run(state, 2000);
    expect(army.province).toBe('fr-normandy');

    const other = place(state, 'fr', 'fr-paris', { infantry: 2 });
    other.road = { toward: 'fr-nord', at: 0.6 };
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: other.id, to: 'fr-paris', road: { toward: 'fr-nord', at: 0.2 } });
    expect(other.move?.leg).toMatchObject({ from: 'fr-nord', to: 'fr-paris' });
    run(state, 2000);
    expect(other.province).toBe('fr-paris');
    expect(other.road).toEqual({ toward: 'fr-nord', at: 0.2 });
  });

  it('goes on or turns back mid-march, whichever reaches the destination sooner', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris', { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-nord' });
    run(state, 5);
    // Normandy lies behind Paris: turning round beats going on to Lille and back.
    const plan = planMarch(state, world, army, 'fr-normandy')!;
    expect(plan.leg).toMatchObject({ from: 'fr-nord', to: 'fr-paris', elapsed: army.move!.leg!.duration - 5 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-normandy' });
    expect(army.province).toBe('fr-paris');
    run(state, 5);
    expect(army.province).toBe('fr-paris');
    expect(army.move?.path).toEqual(['fr-normandy']);
  });

  it('an army on a road is in its province: it fights there and stands apart from the city', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-east', { infantry: 2 });
    army.road = { toward: 'de-hesse', at: 0.3 };
    const enemy = place(state, 'de', 'fr-east', { infantry: 2 });
    expect(hostileArmiesIn(state, 'fr-east', 'de')).toContain(army);
    run(state, 30);
    expect(state.battles['fr-east']).toBeTruthy();
    expect(enemy.units.some((u) => u.strength < 1)).toBe(true);

    // Recruits gather in the city, not out on the road; merging needs the armies side by side.
    const city = place(state, 'fr', 'fr-paris', { infantry: 1 });
    const out = place(state, 'fr', 'fr-paris', { infantry: 1 });
    out.road = { toward: 'fr-nord', at: 0.5 };
    spawnUnit(state, 'fr', 'fr-paris', 'infantry');
    expect(city.units).toHaveLength(2);
    expect(out.units).toHaveLength(1);
    expect(applyCommand(state, world, { type: 'merge', nation: 'fr', armyIds: [city.id, out.id] }).ok).toBe(false);
    const split = applyCommand(state, world, { type: 'split', nation: 'fr', armyId: city.id, unitIds: [city.units[0].id] });
    expect(split.ok).toBe(true);
    const created = Object.values(state.armies).find((a) => a.owner === 'fr' && a.province === 'fr-paris' && a !== city && a !== out)!;
    expect(created.road).toBeUndefined();
  });

  it('a broken army on a road falls back only along it', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-east', { infantry: 1 });
    army.autoRetreat = true;
    army.road = { toward: 'fr-nord', at: 0.5 };
    for (const u of army.units) u.morale = 0.1;
    place(state, 'de', 'fr-east', { infantry: 6 });
    run(state, 10);
    expect(army.move?.leg).toMatchObject({ from: 'fr-east', to: 'fr-nord' });
  });

  it('only land and mountain roads, at a point between the cities, and not on patrol', () => {
    const state = quietGame();
    clearArmies(state);
    const fr = place(state, 'fr', 'fr-nord', { infantry: 1 });
    const move = (to: string, toward: string, at: number, mode?: 'patrol') =>
      applyCommand(state, world, { type: 'move', nation: 'fr', armyId: fr.id, to, road: { toward, at }, mode });
    expect(move('fr-nord', 'uk-london', 0.3).ok).toBe(false);
    expect(move('fr-nord', 'fr-east', 0.3).ok).toBe(true);
    expect(move('fr-nord', 'fr-paris', 0).ok).toBe(false);
    expect(move('fr-nord', 'fr-paris', 1).ok).toBe(false);
    expect(move('fr-nord', 'fr-paris', 0.5, 'patrol').ok).toBe(false);
    expect(move('fr-nord', 'de-berlin', 0.5).ok).toBe(false);
    // At peace with Belgium: a spot on its side is closed.
    expect(move('be-brussels', 'fr-nord', 0.5).ok).toBe(false);
  });

  it('stopping keeps a halt on the leg it is on', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris', { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-paris', road: { toward: 'fr-nord', at: 0.5 } });
    run(state, 3);
    applyCommand(state, world, { type: 'stop', nation: 'fr', armyId: army.id });
    run(state, 2000);
    expect(army.province).toBe('fr-paris');
    expect(army.road).toEqual({ toward: 'fr-nord', at: 0.5 });
  });
});

describe('merging on arrival', () => {
  it("a player's army ending its march where another stands idle joins it, under the senior name", () => {
    const state = quietGame();
    clearArmies(state);
    const garrison = place(state, 'fr', 'fr-paris', { infantry: 2 });
    const coming = place(state, 'fr', 'fr-nord', { infantry: 3 });
    garrison.serial = 7;
    coming.serial = 3;
    garrison.autoRetreat = true;
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: coming.id, to: 'fr-paris' });
    run(state, 1000);
    expect(state.armies[coming.id]).toBeUndefined();
    expect(garrison.units).toHaveLength(5);
    expect(garrison.serial).toBe(3);
    expect(garrison.autoRetreat).toBe(true);
    expect(state.events.some((e) => e.kind === 'merge' && e.province === 'fr-paris')).toBe(true);
  });

  it('passing through, holding, halting on a road or marching on does not merge', () => {
    const state = quietGame();
    clearArmies(state);
    const garrison = place(state, 'fr', 'fr-paris', { infantry: 2 });
    const through = place(state, 'fr', 'fr-nord', { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: through.id, to: 'fr-centre' });
    expect(through.move?.path[0]).toBe('fr-paris');
    const roadside = place(state, 'fr', 'fr-nord', { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: roadside.id, to: 'fr-paris', road: { toward: 'fr-centre', at: 0.2 } });
    run(state, 1500);
    expect(Object.keys(state.armies)).toHaveLength(3);
    expect(garrison.units).toHaveLength(2);
    expect(through.province).toBe('fr-centre');
    expect(roadside.road).toEqual({ toward: 'fr-centre', at: 0.2 });

    const holding = place(state, 'fr', 'fr-nord', { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: holding.id, to: 'fr-paris' });
    run(state, 2);
    applyCommand(state, world, { type: 'hold', nation: 'fr', armyId: holding.id, hold: true });
    run(state, 1500);
    expect(holding.province).toBe('fr-paris');
    expect(state.armies[holding.id]).toBeDefined();
  });

  it('computer opponents gather their own armies: arrivals are not merged for them', () => {
    const state = aiGame();
    clearArmies(state);
    const a = place(state, 'de', 'de-berlin', { infantry: 1 });
    const b = place(state, 'de', 'de-saxony', { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'de', armyId: b.id, to: 'de-berlin' });
    // Arrival alone does not merge; only the AI's own think does.
    const arrive = b.move!.leg!.duration;
    for (let t = 0; t < arrive; t++) {
      state.nations.de.ai!.nextThinkTick = state.tick + 10_000;
      stepState(state, world);
    }
    expect(b.province).toBe('de-berlin');
    expect(state.armies[a.id]).toBeDefined();
    expect(state.armies[b.id]).toBeDefined();
  });
});

describe('peace while marching', () => {
  it('an army marching through land that has just made peace goes home rather than standing in it', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'de-berlin', { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-lowersaxony', mode: 'move' });
    run(state, 3);
    makePeace(state, world, 'fr', 'de');
    run(state, 600);
    expect(state.provinces[army.province].owner).toBe('fr');
    expect(army.move).toBeNull();
  });

  it('an army setting out from home is turned back at the border', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-east', { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-hesse' });
    run(state, 3);
    makePeace(state, world, 'fr', 'de');
    run(state, 600);
    expect(army.province).toBe('fr-east');
    expect(state.events.some((e) => e.text.includes(`${armyName(world, army)} was refused entry`))).toBe(true);
  });
});
