import { describe, expect, it } from 'vitest';
import { applyCommand, armiesIn, armyName, connectionBetween, hostileArmiesIn, legTicks, planMarch, roadBorder, spotOnRoad, stepState } from '../src/sim';
import { makePeace } from '../src/sim/systems/diplomacy';
import { geoContains, geoDistance, geoMercator } from 'd3-geo';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import mapJson from '../src/assets/map/map.topo.json';
import { alongRoad, buildMapGeometry, nearestOnRoad, roadLine, roadPart } from '../src/ui/map/geo';
import { aiGame, clearArmies, linkBetween, place, quietGame, run, setWar, world } from './helpers';

const mapTopo = mapJson as unknown as Topology<{ provinces: GeometryCollection<{ pid: string }> }>;

describe('halting on a road', () => {
  it('stops part of the way along a road, still in its own land, and goes on from there', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris-sw', { infantry: 2 });
    const leg = legTicks(state, world, army, 'fr-paris-sw', 'fr-nord-s');
    expect(
      applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-paris-sw', road: { toward: 'fr-nord-s', at: 0.2 } }).ok,
    ).toBe(true);
    run(state, Math.round(0.2 * leg) - 1);
    expect(army.move?.leg).toBeTruthy();
    run(state, 1);
    expect(army.move).toBeNull();
    expect(army.province).toBe('fr-paris-sw');
    expect(army.road).toEqual({ toward: 'fr-nord-s', at: 0.2 });
    // On along the road: only the rest of the leg is left.
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-nord-s' });
    expect(army.road).toBeUndefined();
    run(state, leg - Math.round(0.2 * leg));
    expect(army.province).toBe('fr-nord-s');
    expect(army.move).toBeNull();
  });

  it('reaches a spot on the far side of a border from the near end, entering that land there', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-nord-se2', { infantry: 4 });
    // 30% of the way out of the Palatinate towards Lorraine: most of the way from Lorraine.
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-hesse-w', road: { toward: 'fr-nord-se2', at: 0.3 } });
    expect(army.move?.path).toEqual(['de-hesse-w']);
    const leg = legTicks(state, world, army, 'fr-nord-se2', 'de-hesse-w');
    run(state, Math.round(0.7 * leg));
    expect(army.province).toBe('de-hesse-w');
    expect(army.road).toEqual({ toward: 'fr-nord-se2', at: 0.3 });
    expect(army.arrivedVia).toBe('land');
    // Standing in the land, it takes it.
    run(state, 400);
    expect(state.provinces['de-hesse-w'].owner).toBe('fr');
  });

  it("from a road, a march elsewhere walks back to where its land's roads meet first; back along the road it turns round", () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris-sw', { infantry: 2 });
    army.road = { toward: 'fr-nord-s', at: 0.5 };
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-paris-ssw' });
    expect(army.move?.leg).toMatchObject({ from: 'fr-nord-s', to: 'fr-paris-sw' });
    expect(army.move?.path).toEqual(['fr-paris-sw', 'fr-paris-ssw']);
    expect(army.province).toBe('fr-paris-sw');
    run(state, 2000);
    expect(army.province).toBe('fr-paris-ssw');

    const other = place(state, 'fr', 'fr-paris-sw', { infantry: 2 });
    other.road = { toward: 'fr-nord-s', at: 0.6 };
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: other.id, to: 'fr-paris-sw', road: { toward: 'fr-nord-s', at: 0.2 } });
    expect(other.move?.leg).toMatchObject({ from: 'fr-nord-s', to: 'fr-paris-sw' });
    run(state, 2000);
    expect(other.province).toBe('fr-paris-sw');
    expect(other.road).toEqual({ toward: 'fr-nord-s', at: 0.2 });
  });

  it('goes on or turns back mid-march, whichever reaches the destination sooner', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris-sw', { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-nord-s' });
    run(state, 5);
    // The Orléanais lies behind the Vexin: turning round beats going on to Picardy and back.
    const plan = planMarch(state, world, army, 'fr-paris-ssw')!;
    expect(plan.leg).toMatchObject({ from: 'fr-nord-s', to: 'fr-paris-sw', elapsed: army.move!.leg!.duration - 5 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-paris-ssw' });
    expect(army.province).toBe('fr-paris-sw');
    run(state, 5);
    expect(army.province).toBe('fr-paris-sw');
    expect(army.move?.path).toEqual(['fr-paris-ssw']);
  });

  it('an army on a road is in its land: it fights there, and stands apart from the armies at the land', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-nord-se2', { infantry: 2 });
    army.road = { toward: 'de-hesse-w', at: 0.3 };
    const enemy = place(state, 'de', 'fr-nord-se2', { infantry: 2 });
    expect(hostileArmiesIn(state, world, 'fr-nord-se2', 'de')).toContain(army);
    run(state, 30);
    expect(state.battles['fr-nord-se2']).toBeTruthy();
    expect(enemy.units.some((u) => u.strength < 1)).toBe(true);

    // Merging needs the armies side by side; a split keeps its spot.
    const there = place(state, 'fr', 'fr-paris-sw', { infantry: 2 });
    const out = place(state, 'fr', 'fr-paris-sw', { infantry: 2 });
    out.road = { toward: 'fr-nord-s', at: 0.5 };
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
    const army = place(state, 'fr', 'fr-nord-se2', { infantry: 2 });
    army.autoRetreat = true;
    // Facing Hesse, where no refuge lies: it walks back through the crossroads and out to one behind.
    army.road = { toward: 'de-hesse-w', at: 0.3 };
    for (const u of army.units) u.morale = 0.1;
    place(state, 'de', 'fr-nord-se2', { infantry: 6 });
    const routs = () => state.events.filter((e) => e.kind === 'rout').length;
    run(state, 1);
    expect(army.move?.leg).toMatchObject({ from: 'de-hesse-w', to: 'fr-nord-se2' });
    const refuge = army.move!.path[1];
    expect(state.provinces[refuge].owner).toBe('fr');
    // Walking back within its land it is still in the battle, and has not paid for leaving it yet.
    expect(hostileArmiesIn(state, world, 'fr-nord-se2', 'de')).toContain(army);
    expect(routs()).toBe(0);
    run(state, army.move!.leg!.duration - army.move!.leg!.elapsed);
    // It passes through its crossroads without stopping, out of the battle under fire.
    expect(army.move?.leg).toMatchObject({ from: 'fr-nord-se2', to: refuge });
    expect(hostileArmiesIn(state, world, 'fr-nord-se2', 'de')).not.toContain(army);
    expect(routs()).toBe(1);
  });

  it('an army walking out to a spot on a road of its land has not left it: it fights for it, and nobody takes it behind its back', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-nord-se2', { infantry: 3 });
    const at = roadBorder(world, 'fr-nord-se2', 'de-hesse-s') - 0.05;
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'fr-nord-se2', road: { toward: 'de-hesse-s', at } });
    run(state, 1);
    place(state, 'de', 'fr-nord-se2', { infantry: 2 });
    run(state, 12);
    expect(army.move?.leg).toBeTruthy();
    expect(state.battles['fr-nord-se2']).toBeTruthy();
    expect(state.provinces['fr-nord-se2'].capture).toBeFalsy();
    // Marching on past its crossroads into the next land, it leaves (and the battle with it, at a price).
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-hesse-s' });
    expect(hostileArmiesIn(state, world, 'fr-nord-se2', 'de')).toEqual([]);
    expect(armiesIn(state, world, 'fr-nord-se2')).not.toContain(army);
    expect(state.events.filter((e) => e.kind === 'rout').length).toBe(1);
  });

  it('only on roads over land between two lands, at a point between their ends, and not on patrol', () => {
    const state = quietGame();
    clearArmies(state);
    const fr = place(state, 'fr', 'fr-nord-s', { infantry: 1 });
    const move = (to: string, toward: string, at: number, mode?: 'patrol') =>
      applyCommand(state, world, { type: 'move', nation: 'fr', armyId: fr.id, to, road: { toward, at }, mode });
    expect(move('fr-nord-s', 'uk-london-sw', 0.3).ok).toBe(false);
    expect(move('fr-nord-s', 'fr-nord', 0.3).ok).toBe(false);
    expect(move('fr-nord-s', 'fr-nord-se', 0.3).ok).toBe(true);
    expect(move('fr-nord-s', 'fr-paris-sw', 0).ok).toBe(false);
    expect(move('fr-nord-s', 'fr-paris-sw', 1).ok).toBe(false);
    expect(move('fr-nord-s', 'fr-paris-sw', 0.5, 'patrol').ok).toBe(false);
    expect(move('fr-nord-s', 'de-berlin-w', 0.5).ok).toBe(false);
    // At peace with Belgium: a spot on its side is closed.
    expect(move('be-brussels-w', 'fr-nord-s', 0.5).ok).toBe(false);
  });

  it('a spot on a road lies on one side of the border or the other, as the map draws it', () => {
    const state = quietGame();
    clearArmies(state);
    const army = place(state, 'fr', 'fr-paris-sw', { infantry: 2 });
    const border = roadBorder(world, 'fr-paris-sw', 'fr-nord-s');
    expect(border).toBeGreaterThan(0.05);
    expect(border).toBeLessThan(0.95);
    expect(roadBorder(world, 'fr-nord-s', 'fr-paris-sw')).toBeCloseTo(1 - border, 3);
    const order = (to: string, toward: string, at: number) =>
      applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to, road: { toward, at } });
    expect(order('fr-paris-sw', 'fr-nord-s', border + 0.02).ok).toBe(false);
    expect(order('fr-paris-sw', 'fr-nord-s', border - 0.02).ok).toBe(true);
    expect(spotOnRoad(world, 'fr-paris-sw', 'fr-nord-s', border + 0.1)).toEqual({ province: 'fr-nord-s', road: { toward: 'fr-paris-sw', at: 1 - border - 0.1 } });
  });

  it('stopping on a road leaves the army where it is: across the border, it stands in the land beyond', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const army = place(state, 'fr', 'fr-nord-se2', { infantry: 4 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-hesse-w', mode: 'move' });
    const leg = army.move!.leg!;
    const border = roadBorder(world, 'fr-nord-se2', 'de-hesse-w');
    run(state, Math.ceil((border + 0.1) * leg.duration));
    const f = leg.elapsed / leg.duration;
    expect(applyCommand(state, world, { type: 'stop', nation: 'fr', armyId: army.id }).ok).toBe(true);
    expect(army.move).toBeNull();
    expect(army.province).toBe('de-hesse-w');
    expect(army.road?.toward).toBe('fr-nord-se2');
    expect(army.road?.at).toBeCloseTo(1 - f, 6);
    expect(army.arrivedVia).toBe('land');
    // Standing in enemy land, it takes it.
    run(state, 400);
    expect(state.provinces['de-hesse-w'].owner).toBe('fr');

    // Walking back from a road into its own land, it stops where it is too.
    const back = place(state, 'fr', 'fr-paris-sw', { infantry: 2 });
    back.road = { toward: 'fr-nord-s', at: 0.2 };
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: back.id, to: 'fr-paris-ssw' });
    run(state, 2);
    expect(applyCommand(state, world, { type: 'stop', nation: 'fr', armyId: back.id }).ok).toBe(true);
    expect(back.province).toBe('fr-paris-sw');
    expect(back.road?.toward).toBe('fr-nord-s');
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
    const coming = place(state, 'fr', 'fr-nord-s', { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: coming.id, to: 'fr-paris-sw' });
    const roadside = place(state, 'fr', 'fr-nord-s', { infantry: 1 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: roadside.id, to: 'fr-paris-sw', road: { toward: 'fr-paris-ssw', at: 0.2 } });
    run(state, 1500);
    expect(Object.keys(state.armies)).toHaveLength(3);
    expect(field.units).toHaveLength(2);
    expect(coming.province).toBe('fr-paris-sw');
    expect(roadside.road).toEqual({ toward: 'fr-paris-ssw', at: 0.2 });

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
    const b = place(state, 'de', 'de-berlin-w', { infantry: 1 });
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
    const army = place(state, 'fr', 'de-berlin-w', { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-north-sw', mode: 'move' });
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
    const army = place(state, 'fr', 'fr-nord-se2', { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: army.id, to: 'de-hesse-w' });
    run(state, 3);
    makePeace(state, world, 'fr', 'de');
    run(state, 600);
    expect(army.province).toBe('fr-nord-se2');
    expect(state.events.some((e) => e.text.includes(`${armyName(world, army)} was refused entry`))).toBe(true);
  });
});

describe('roads as the map draws them', () => {
  const geo = buildMapGeometry(world);
  const close = (p: { x: number; y: number }, q: [number, number]) => expect(Math.hypot(p.x - q[0], p.y - q[1])).toBeLessThan(1e-6);

  it("run from one province's anchor to the other's through the scenario's bends, the same road either way", () => {
    for (const c of world.scenario.connections) {
      const [there, back] = [roadLine(geo, c.a, c.b), roadLine(geo, c.b, c.a)];
      // Through every bend: a point of the drawn line lies on it.
      for (const bend of c.via ?? []) expect(Math.min(...there.pts.map((p) => geoDistance(geo.invert(p), bend))) * 6371, `${c.a}|${c.b}`).toBeLessThan(0.001);
      close(alongRoad(there, 0), geo.anchors[c.a]);
      close(alongRoad(there, 1), geo.anchors[c.b]);
      // A spot a share of the way from one end is the same spot from the other.
      for (const f of [0.2, 0.5, 0.8]) close(alongRoad(there, f), [alongRoad(back, 1 - f).x, alongRoad(back, 1 - f).y]);
    }
    // The road between the lands round Lyon goes round the city, not through it.
    expect(world.scenario.connections.find((c) => c.a === 'fr-rhone-e' && c.b === 'fr-rhone-nw')?.via?.length).toBeGreaterThan(0);
  });

  /**
   * The road generator's point a fraction `t` of the way along a road (scripts/map/roads.ts): straight lines between
   * its knots on its own Mercator, measured there. This is what a fraction means to the simulation (where a road
   * crosses its border, a spot on a road), whatever projection the map is drawn in.
   */
  const ROAD_GRID = geoMercator();
  const generatorPoint = (c: { a: string; b: string; via?: [number, number][] }, t: number): [number, number] => {
    const knots = [world.provinces[c.a].anchor, ...(c.via ?? []), world.provinces[c.b].anchor];
    const grid = knots.map((p) => ROAD_GRID(p)!);
    const lengths = grid.slice(1).map((q, i) => Math.hypot(q[0] - grid[i][0], q[1] - grid[i][1]));
    let left = t * lengths.reduce((s, x) => s + x, 0);
    for (let i = 0; i < lengths.length; i++) {
      if (left <= lengths[i] || i === lengths.length - 1) {
        const u = lengths[i] ? left / lengths[i] : 0;
        return ROAD_GRID.invert!([grid[i][0] + (grid[i + 1][0] - grid[i][0]) * u, grid[i][1] + (grid[i + 1][1] - grid[i][1]) * u]) as [number, number];
      }
      left -= lengths[i];
    }
    return knots[knots.length - 1];
  };
  const kmOf = (c: { a: string; b: string; via?: [number, number][] }) => {
    const knots = [world.provinces[c.a].anchor, ...(c.via ?? []), world.provinces[c.b].anchor];
    return knots.slice(1).reduce((s, p, i) => s + geoDistance(knots[i], p) * 6371, 0);
  };

  it('put a fraction of the way along a road on the same spot on the ground as the simulation, in any projection', () => {
    for (const c of world.scenario.connections) {
      const line = roadLine(geo, c.a, c.b);
      for (const t of [0.05, 0.2, 0.37, 0.5, 0.63, 0.8, 0.95, ...(c.border === undefined ? [] : [c.border - 0.002, c.border + 0.002])]) {
        const p = alongRoad(line, t);
        expect(geoDistance(geo.invert([p.x, p.y]), generatorPoint(c, t)) * 6371, `${c.a}|${c.b} at ${t}`).toBeLessThan(0.005);
      }
    }
  });

  it('pick the land on each side of a border where the map draws it', () => {
    const shapes = new Map((feature(mapTopo, mapTopo.objects.provinces) as FeatureCollection<Polygon | MultiPolygon, { pid: string }>).features.map((f) => [f.properties.pid, f]));
    const inLand = (id: string, p: { x: number; y: number }) => geoContains(shapes.get(id)!, geo.invert([p.x, p.y]));
    /** Where along a road its drawn line lies (`a`, `b` or elsewhere) from 2 km before its stored crossing to 2 km after. */
    const lands = (c: { a: string; b: string; via?: [number, number][]; border?: number }, line: ReturnType<typeof roadLine>) => {
      const step = 0.1 / kmOf(c);
      const out: string[] = [];
      for (let k = -20; k <= 20; k++) {
        const p = alongRoad(line, c.border! + k * step);
        const here = inLand(c.a, p) ? 'a' : inLand(c.b, p) ? 'b' : '-';
        if (out[out.length - 1] !== here) out.push(here);
      }
      return out.join('');
    };
    const winding: string[] = [];
    let clean = 0;
    for (const c of world.scenario.connections) {
      if (c.border === undefined) continue;
      const line = roadLine(geo, c.a, c.b);
      const d = 0.5 / kmOf(c);
      for (const [t, id] of [
        [c.border - d, c.a],
        [c.border + d, c.b],
      ] as [number, string][]) {
        // Pointing at the drawn road either side of its crossing finds a spot in the land on that side.
        const p = alongRoad(line, t);
        expect(spotOnRoad(world, c.a, c.b, nearestOnRoad(line, [p.x, p.y]).t).province, `${c.a}|${c.b} at ${t}`).toBe(id);
      }
      // And that is the land the point lies in, wherever the road crosses its border cleanly (once, between its two
      // lands). The few that wind back over it near the crossing, or touch a third province there (see the
      // scenario test's lastResort), are counted instead.
      if (lands(c, line) !== 'ab') {
        winding.push(`${c.a}|${c.b}`);
        continue;
      }
      clean++;
      expect(inLand(c.a, alongRoad(line, c.border - d)), `${c.a}|${c.b} before its crossing`).toBe(true);
      expect(inLand(c.b, alongRoad(line, c.border + d)), `${c.a}|${c.b} after its crossing`).toBe(true);
    }
    expect(clean).toBeGreaterThan(450);
    expect(winding.length, winding.join(', ')).toBeLessThan(15);
    // A road a projection change once misread (the drawn point in one land, picking the other).
    for (const [a, b, t] of [
      ['ro-transylvania-se', 'ro-moldavia-w', 0.5445539702271418],
    ] as [string, string, number][]) {
      const line = roadLine(geo, a, b);
      const p = alongRoad(line, t);
      const picked = spotOnRoad(world, a, b, nearestOnRoad(line, [p.x, p.y]).t).province;
      expect(picked, `${a}|${b}`).toBe(b);
      expect(inLand(picked, p), `${a}|${b}`).toBe(true);
    }
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
