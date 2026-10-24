import { describe, expect, it } from 'vitest';
import { applyCommand, armiesIn, armyName, connectionBetween, hostileArmiesIn, legTicks, planMarch, roadBorder, spotOnRoad, stepState } from '../src/sim';
import { makePeace } from '../src/sim/systems/diplomacy';
import { alongRoad, buildMapGeometry, nearestOnRoad, roadLine, roadPart } from '../src/ui/map/geo';
import { aiGame, clearArmies, linkBetween, place, quietGame, run, setWar, world } from './helpers';

describe('halting on a road', () => {
  it('stops part of the way along a road, still in its own land, and goes on from there', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris-sw', { infantry: 2 });
    const leg = legTicks(state, world, army, 'fr-paris-sw', 'fr-nord-sw');
    expect(
      applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-paris-sw', road: { toward: 'fr-nord-sw', at: 0.2 } }).ok,
    ).toBe(true);
    run(state, Math.round(0.2 * leg) - 1);
    expect(army.move?.leg).toBeTruthy();
    run(state, 1);
    expect(army.move).toBeNull();
    expect(army.province).toBe('fr-paris-sw');
    expect(army.road).toEqual({ toward: 'fr-nord-sw', at: 0.2 });
    // On along the road: only the rest of the leg is left.
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-nord-sw' });
    expect(army.road).toBeUndefined();
    run(state, leg - Math.round(0.2 * leg));
    expect(army.province).toBe('fr-nord-sw');
    expect(army.move).toBeNull();
  });

  it('reaches a spot on the far side of a border from the near end, entering that land there', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-east-w', { infantry: 4 });
    // 30% of the way out of the Palatinate towards Lorraine: most of the way from Lorraine.
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-hesse-w', road: { toward: 'fr-east-w', at: 0.3 } });
    expect(army.move?.path).toEqual(['de-hesse-w']);
    const leg = legTicks(state, world, army, 'fr-east-w', 'de-hesse-w');
    run(state, Math.round(0.7 * leg));
    expect(army.province).toBe('de-hesse-w');
    expect(army.road).toEqual({ toward: 'fr-east-w', at: 0.3 });
    expect(army.arrivedVia).toBe('land');
    // Standing in the land, it takes it.
    run(state, 400);
    expect(state.provinces['de-hesse-w'].owner).toBe('fr');
  });

  it("from a road, a march elsewhere walks back to where its land's roads meet first; back along the road it turns round", () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris-sw', { infantry: 2 });
    army.road = { toward: 'fr-nord-sw', at: 0.5 };
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-centre-wnw' });
    expect(army.move?.leg).toMatchObject({ from: 'fr-nord-sw', to: 'fr-paris-sw' });
    expect(army.move?.path).toEqual(['fr-paris-sw', 'fr-centre-wnw']);
    expect(army.province).toBe('fr-paris-sw');
    run(state, 2000);
    expect(army.province).toBe('fr-centre-wnw');

    const other = place(state, 'fr', 'fr-paris-sw', { infantry: 2 });
    other.road = { toward: 'fr-nord-sw', at: 0.6 };
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: other.id, to: 'fr-paris-sw', road: { toward: 'fr-nord-sw', at: 0.2 } });
    expect(other.move?.leg).toMatchObject({ from: 'fr-nord-sw', to: 'fr-paris-sw' });
    run(state, 2000);
    expect(other.province).toBe('fr-paris-sw');
    expect(other.road).toEqual({ toward: 'fr-nord-sw', at: 0.2 });
  });

  it('goes on or turns back mid-march, whichever reaches the destination sooner', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris-sw', { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-nord-sw' });
    run(state, 5);
    // The Orléanais lies behind the Vexin: turning round beats going on to Picardy and back.
    const plan = planMarch(state, world, army, 'fr-centre-wnw')!;
    expect(plan.leg).toMatchObject({ from: 'fr-nord-sw', to: 'fr-paris-sw', elapsed: army.move!.leg!.duration - 5 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-centre-wnw' });
    expect(army.province).toBe('fr-paris-sw');
    run(state, 5);
    expect(army.province).toBe('fr-paris-sw');
    expect(army.move?.path).toEqual(['fr-centre-wnw']);
  });

  it('an army on a road is in its land: it fights there, and stands apart from the armies at the land', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-east-w', { infantry: 2 });
    army.road = { toward: 'de-hesse-w', at: 0.3 };
    const enemy = place(state, 'de', 'fr-east-w', { infantry: 2 });
    expect(hostileArmiesIn(state, world, 'fr-east-w', 'de')).toContain(army);
    run(state, 30);
    expect(state.battles['fr-east-w']).toBeTruthy();
    expect(enemy.units.some((u) => u.strength < 1)).toBe(true);

    // Merging needs the armies side by side; a split keeps its spot.
    const there = place(state, 'fr', 'fr-paris-sw', { infantry: 2 });
    const out = place(state, 'fr', 'fr-paris-sw', { infantry: 2 });
    out.road = { toward: 'fr-nord-sw', at: 0.5 };
    expect(applyCommand(state, world, { type: 'merge', nation: 'fr', armyIds: [there.id, out.id] }).ok).toBe(false);
    expect(applyCommand(state, world, { type: 'split', nation: 'fr', armyId: out.id, unitIds: [out.units[0].id] }).ok).toBe(true);
    const half = Object.values(state.armies).find((a) => a.owner === 'fr' && a.province === 'fr-paris-sw' && a !== there && a !== out)!;
    expect(half.road).toEqual(out.road);
    expect(applyCommand(state, world, { type: 'merge', nation: 'fr', armyIds: [out.id, half.id] }).ok).toBe(true);
  });

  it("a broken army on a road falls back through its own land's crossroads, and pays for leaving the battle there", () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-east-w', { infantry: 2 });
    army.autoRetreat = true;
    // Facing Hesse, where no refuge lies: it walks back through the crossroads and out to one behind.
    army.road = { toward: 'de-hesse-w', at: 0.3 };
    for (const u of army.units) u.morale = 0.1;
    place(state, 'de', 'fr-east-w', { infantry: 6 });
    const routs = () => state.events.filter((e) => e.kind === 'rout').length;
    run(state, 1);
    expect(army.move?.leg).toMatchObject({ from: 'de-hesse-w', to: 'fr-east-w' });
    const refuge = army.move!.path[1];
    expect(state.provinces[refuge].owner).toBe('fr');
    // Walking back within its land it is still in the battle, and has not paid for leaving it yet.
    expect(hostileArmiesIn(state, world, 'fr-east-w', 'de')).toContain(army);
    expect(routs()).toBe(0);
    run(state, army.move!.leg!.duration - army.move!.leg!.elapsed);
    // It passes through its crossroads without stopping, out of the battle under fire.
    expect(army.move?.leg).toMatchObject({ from: 'fr-east-w', to: refuge });
    expect(hostileArmiesIn(state, world, 'fr-east-w', 'de')).not.toContain(army);
    expect(routs()).toBe(1);
  });

  it('an army walking out to a spot on a road of its land has not left it: it fights for it, and nobody takes it behind its back', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-east-w', { infantry: 3 });
    const at = roadBorder(world, 'fr-east-w', 'de-baden-sw') - 0.05;
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-east-w', road: { toward: 'de-baden-sw', at } });
    run(state, 1);
    place(state, 'de', 'fr-east-w', { infantry: 2 });
    run(state, 12);
    expect(army.move?.leg).toBeTruthy();
    expect(state.battles['fr-east-w']).toBeTruthy();
    expect(state.provinces['fr-east-w'].capture).toBeFalsy();
    // Marching on past its crossroads into the next land, it leaves (and the battle with it, at a price).
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-baden-sw' });
    expect(hostileArmiesIn(state, world, 'fr-east-w', 'de')).toEqual([]);
    expect(armiesIn(state, world, 'fr-east-w')).not.toContain(army);
    expect(state.events.filter((e) => e.kind === 'rout').length).toBe(1);
  });

  it('only on roads over land between two lands, at a point between their ends, and not on patrol', () => {
    const state = quietGame();
    clearArmies(state);
    const fr = place(state, 'fr', 'fr-nord-sw', { infantry: 1 });
    const move = (to: string, toward: string, at: number, mode?: 'patrol') =>
      applyCommand(state, world, { type: 'move', nation: 'fr', armyId: fr.id, to, road: { toward, at }, mode });
    expect(move('fr-nord-sw', 'uk-london-sw', 0.3).ok).toBe(false);
    expect(move('fr-nord-sw', 'fr-nord', 0.3).ok).toBe(false);
    expect(move('fr-nord-sw', 'fr-nord-se', 0.3).ok).toBe(true);
    expect(move('fr-nord-sw', 'fr-paris-sw', 0).ok).toBe(false);
    expect(move('fr-nord-sw', 'fr-paris-sw', 1).ok).toBe(false);
    expect(move('fr-nord-sw', 'fr-paris-sw', 0.5, 'patrol').ok).toBe(false);
    expect(move('fr-nord-sw', 'de-berlin-nw', 0.5).ok).toBe(false);
    // At peace with Belgium: a spot on its side is closed.
    expect(move('be-brussels-w', 'fr-nord-sw', 0.5).ok).toBe(false);
  });

  it('a spot on a road lies on one side of the border or the other, as the map draws it', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris-sw', { infantry: 2 });
    const border = roadBorder(world, 'fr-paris-sw', 'fr-nord-sw');
    expect(border).toBeGreaterThan(0.05);
    expect(border).toBeLessThan(0.95);
    expect(roadBorder(world, 'fr-nord-sw', 'fr-paris-sw')).toBeCloseTo(1 - border, 3);
    const order = (to: string, toward: string, at: number) =>
      applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to, road: { toward, at } });
    expect(order('fr-paris-sw', 'fr-nord-sw', border + 0.02).ok).toBe(false);
    expect(order('fr-paris-sw', 'fr-nord-sw', border - 0.02).ok).toBe(true);
    expect(spotOnRoad(world, 'fr-paris-sw', 'fr-nord-sw', border + 0.1)).toEqual({ province: 'fr-nord-sw', road: { toward: 'fr-paris-sw', at: 1 - border - 0.1 } });
  });

  it('stopping on a road leaves the army where it is: across the border, it stands in the land beyond', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-east-w', { infantry: 4 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-hesse-w', mode: 'move' });
    const leg = army.move!.leg!;
    const border = roadBorder(world, 'fr-east-w', 'de-hesse-w');
    run(state, Math.ceil((border + 0.1) * leg.duration));
    const f = leg.elapsed / leg.duration;
    expect(applyCommand(state, world, { type: 'stop', nation: 'fr', armyId: army.id }).ok).toBe(true);
    expect(army.move).toBeNull();
    expect(army.province).toBe('de-hesse-w');
    expect(army.road?.toward).toBe('fr-east-w');
    expect(army.road?.at).toBeCloseTo(1 - f, 6);
    expect(army.arrivedVia).toBe('land');
    // Standing in enemy land, it takes it.
    run(state, 400);
    expect(state.provinces['de-hesse-w'].owner).toBe('fr');

    // Walking back from a road into its own land, it stops where it is too.
    const back = place(state, 'fr', 'fr-paris-sw', { infantry: 2 });
    back.road = { toward: 'fr-nord-sw', at: 0.2 };
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: back.id, to: 'fr-centre-wnw' });
    run(state, 2);
    expect(applyCommand(state, world, { type: 'stop', nation: 'fr', armyId: back.id }).ok).toBe(true);
    expect(back.province).toBe('fr-paris-sw');
    expect(back.road?.toward).toBe('fr-nord-sw');
    expect(back.road!.at).toBeLessThan(0.2);
  });

  it('at sea there is nowhere to stand: stopping turns a crossing back', () => {
    const state = quietGame();
    clearArmies(state);
    const [kent, artois] = linkBetween('uk-london', 'fr-nord');
    expect(connectionBetween(world, kent, artois)?.kind).toBe('strait');
    const army = place(state, 'uk', kent, { infantry: 2 });
    setWar(state, 'uk', 'fr');
    applyCommand(state, world, { type: 'move', nation: 'uk', armyId: army.id, to: artois });
    run(state, 10);
    expect(army.move?.leg).toMatchObject({ from: kent, to: artois });
    expect(applyCommand(state, world, { type: 'stop', nation: 'uk', armyId: army.id }).ok).toBe(true);
    expect(army.move?.leg?.to).toBe(kent);
    expect(army.move?.halting).toBe(true);
  });
});

describe('merging on arrival', () => {
  it("a player's army ending its march in a city where another stands idle joins it, under the senior name", () => {
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

  it('only in cities: not out on the land, not halting on a road, not holding', () => {
    const state = quietGame();
    clearArmies(state);
    const field = place(state, 'fr', 'fr-paris-sw', { infantry: 2 });
    const coming = place(state, 'fr', 'fr-nord-sw', { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: coming.id, to: 'fr-paris-sw' });
    const roadside = place(state, 'fr', 'fr-nord-sw', { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: roadside.id, to: 'fr-paris-sw', road: { toward: 'fr-centre-wnw', at: 0.2 } });
    run(state, 1500);
    expect(Object.keys(state.armies)).toHaveLength(3);
    expect(field.units).toHaveLength(2);
    expect(coming.province).toBe('fr-paris-sw');
    expect(roadside.road).toEqual({ toward: 'fr-centre-wnw', at: 0.2 });

    const garrison = place(state, 'fr', 'fr-paris', { infantry: 2 });
    const holding = place(state, 'fr', 'fr-paris-sw', { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: holding.id, to: 'fr-paris' });
    // Held on its way in (Hold turns a march round, so set it directly): it keeps to itself on arrival.
    holding.holding = true;
    run(state, 600);
    expect(holding.province).toBe('fr-paris');
    expect(state.armies[holding.id]).toBeDefined();
    expect(garrison.units).toHaveLength(2);
  });

  it('computer opponents gather their own armies: arrivals are not merged for them', () => {
    const state = aiGame();
    clearArmies(state);
    const a = place(state, 'de', 'de-berlin', { infantry: 1 });
    const b = place(state, 'de', 'de-berlin-nw', { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'de', armyId: b.id, to: 'de-berlin' });
    // Arrival alone does not merge; only the AI's own think does.
    for (let t = 0; t < 600 && b.move; t++) {
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
    const army = place(state, 'fr', 'de-berlin-nw', { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-lowersaxony-ne', mode: 'move' });
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
    const army = place(state, 'fr', 'fr-east-w', { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-hesse-w' });
    run(state, 3);
    makePeace(state, world, 'fr', 'de');
    run(state, 600);
    expect(army.province).toBe('fr-east-w');
    expect(state.events.some((e) => e.text.includes(`${armyName(world, army)} was refused entry`))).toBe(true);
  });
});

describe('roads as the map draws them', () => {
  const geo = buildMapGeometry(world);
  const close = (p: { x: number; y: number }, q: [number, number]) => expect(Math.hypot(p.x - q[0], p.y - q[1])).toBeLessThan(1e-6);

  it("run from one province's anchor to the other's through the scenario's bends, the same road either way", () => {
    for (const c of world.scenario.connections) {
      const [there, back] = [roadLine(geo, c.a, c.b), roadLine(geo, c.b, c.a)];
      expect(there.pts, `${c.a}|${c.b}`).toHaveLength(2 + (c.via?.length ?? 0));
      close(alongRoad(there, 0), geo.anchors[c.a]);
      close(alongRoad(there, 1), geo.anchors[c.b]);
      // A spot a share of the way from one end is the same spot from the other.
      for (const f of [0.2, 0.5, 0.8]) close(alongRoad(there, f), [alongRoad(back, 1 - f).x, alongRoad(back, 1 - f).y]);
    }
    // The road between the lands round Rouen goes round the city, not through it.
    expect(world.scenario.connections.find((c) => c.a === 'fr-normandy-sw' && c.b === 'fr-normandy-ne')?.via?.length).toBeGreaterThan(0);
  });

  it('measure a share of the way along the road as drawn, round its bends', () => {
    const bent = world.scenario.connections.filter((c) => c.via && c.kind !== 'strait');
    expect(bent.length).toBeGreaterThan(50);
    for (const c of bent) {
      const line = roadLine(geo, c.a, c.b);
      for (const f of [0.1, 0.35, 0.6, 0.9]) {
        const p = alongRoad(line, f);
        // Pointing at a spot finds that spot again; a stretch of the road starts and ends at its two spots.
        expect(nearestOnRoad(line, [p.x, p.y]).t, `${c.a}|${c.b} at ${f}`).toBeCloseTo(f, 6);
        const part = roadPart(line, f, 1);
        close(p, part[0]);
        close(alongRoad(line, 1), part[part.length - 1]);
        expect(part.length).toBe(2 + line.at.filter((t) => t > f && t < 1).length);
      }
    }
  });
});
