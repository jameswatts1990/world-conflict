import { describe, expect, it } from 'vitest';
import {
  GameLoop,
  SCHEMA_VERSION,
  Simulation,
  applyCommand,
  deserializeGame,
  hashState,
  joinNewcomers,
  settleRoads,
  replay,
  serializeGame,
  stepState,
  type Command,
} from '../src/sim';
import { aiGame, landsOf, run, world } from './helpers';

/** A scripted player (France) issuing orders at fixed ticks, plus five AIs. */
const SCRIPT: { tick: number; command: Command }[] = [
  { tick: 3, command: { type: 'build', nation: 'fr', province: 'fr-aquitaine', building: 'industry' } },
  { tick: 5, command: { type: 'research', nation: 'fr', tech: 'industrialMobilisation' } },
  { tick: 10, command: { type: 'recruit', nation: 'fr', province: 'fr-paris', unitType: 'artillery' } },
  { tick: 200, command: { type: 'declareWar', nation: 'fr', target: 'de' } },
];

function scriptedGame() {
  const state = aiGame(1234, 'fr');
  return state;
}

function applyScript(state: ReturnType<typeof aiGame>) {
  for (const s of SCRIPT) if (s.tick === state.tick) applyCommand(state, world, s.command);
}

describe('determinism', () => {
  it('same seed and commands produce identical states', () => {
    const a = scriptedGame();
    const b = scriptedGame();
    for (let i = 0; i < 1500; i++) {
      applyScript(a);
      applyScript(b);
      stepState(a, world);
      stepState(b, world);
    }
    expect(hashState(a)).toBe(hashState(b));
  });

  it('different seeds diverge', () => {
    const a = aiGame(1);
    const b = aiGame(2);
    run(a, 900);
    run(b, 900);
    expect(hashState(a)).not.toBe(hashState(b));
  });

  // Four campaigns of 50 minutes each: more than the usual time limit allows on a slow machine.
  it('rendering frame rate does not change simulation outcomes', () => {
    const targetTicks = 3000; // 50 game-minutes
    const frameProfiles: Record<string, () => number> = {
      '144 fps': () => 1000 / 144,
      '60 fps': () => 1000 / 60,
      '20 fps': () => 50,
      'jittery 5–70 ms': (() => {
        let x = 7;
        return () => {
          x = (Math.imul(x, 1103515245) + 12345) >>> 0;
          return 5 + (x / 4294967296) * 65;
        };
      })(),
    };
    const hashes: Record<string, string> = {};
    for (const [name, nextFrame] of Object.entries(frameProfiles)) {
      const state = scriptedGame();
      const loop = new GameLoop(() => {
        applyScript(state);
        stepState(state, world);
        return !state.outcome;
      });
      loop.paused = false;
      loop.speed = 5; // dev speed exercises multi-tick frames
      let elapsed = 0;
      const realMs = (targetTicks * 1000) / loop.speed - 1000;
      while (elapsed < realMs && !state.outcome) {
        const dt = nextFrame();
        loop.advance(dt);
        elapsed += dt;
      }
      // Real time drove the clock to within a few ticks of the target (or the campaign ended first).
      expect(state.outcome !== null || state.tick > targetTicks - 100).toBe(true);
      // Drain to an exact tick count so every profile is compared at the same game time.
      while (state.tick < targetTicks && !state.outcome) {
        applyScript(state);
        stepState(state, world);
      }
      hashes[name] = hashState(state);
    }
    expect(new Set(Object.values(hashes)).size).toBe(1);
  }, 120000);

  it('a recorded command log replays to the same state', () => {
    const sim = new Simulation(world, scriptedGame());
    const initial = structuredClone(sim.state);
    for (let i = 0; i < 1200; i++) {
      for (const s of SCRIPT) if (s.tick === sim.state.tick) sim.submit(s.command);
      sim.step();
    }
    expect(sim.log.length).toBe(SCRIPT.length);
    expect(hashState(replay(world, initial, sim.log, 1200))).toBe(hashState(sim.state));
  });
});

describe('save / load', () => {
  it('round-trips the full state exactly', () => {
    const state = aiGame(77);
    run(state, 1500);
    const loaded = deserializeGame(serializeGame(state, 'test'), state.scenarioId).state;
    expect(hashState(loaded)).toBe(hashState(state));
  });

  it('a loaded game continues identically to the original', () => {
    const original = aiGame(78);
    run(original, 1200);
    const copy = deserializeGame(serializeGame(original, 'mid-game')).state;
    run(original, 1800);
    run(copy, 1800);
    expect(hashState(copy)).toBe(hashState(original));
    expect(copy.rng).toBe(original.rng);
  });

  it('upgrades saves from the previous schema version', () => {
    const state = aiGame(5);
    run(state, 120);
    const old = JSON.parse(serializeGame(state, 'v2'));
    old.schemaVersion = old.state.schemaVersion = 2;
    for (const n of Object.values(old.state.nations) as Record<string, unknown>[]) n.lastRates = { money: 1, materials: 2, fuel: 3, manpower: 4 };
    const loaded = deserializeGame(JSON.stringify(old), state.scenarioId);
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(hashState(loaded.state)).toBe(hashState(state));
  });

  it('gives armies in older saves a march mode and the new army options', () => {
    const state = aiGame(5, 'fr');
    run(state, 120);
    const old = JSON.parse(serializeGame(state, 'v4'));
    old.schemaVersion = old.state.schemaVersion = 4;
    for (const a of Object.values(old.state.armies) as Record<string, any>[]) {
      delete a.autoRetreat;
      delete a.holding;
      if (a.move) delete a.move.mode;
    }
    const loaded = deserializeGame(JSON.stringify(old), state.scenarioId).state;
    expect(hashState(loaded)).toBe(hashState(state));
  });

  it('splits the cities of a save from before cities were provinces of their own', () => {
    const state = aiGame(9, 'fr');
    run(state, 600);
    // As a schema 5 save had it: no land round the cities, every army in a city, Paris lost to Germany.
    const old = JSON.parse(serializeGame(state, 'v5'));
    old.schemaVersion = old.state.schemaVersion = 5;
    for (const id of Object.keys(old.state.provinces)) if (!world.provinces[id].city) delete old.state.provinces[id];
    for (const a of Object.values(old.state.armies) as Record<string, any>[]) {
      a.province = world.provinces[a.province].around ?? a.province;
      if (a.move) a.move = { ...a.move, path: [], leg: null };
    }
    old.state.battles = {};
    old.state.provinces['fr-paris'].owner = 'de';
    const loaded = deserializeGame(JSON.stringify(old), state.scenarioId).state;
    expect(Object.keys(loaded.provinces).sort()).toEqual([...world.provinceIds].sort());
    for (const land of landsOf('fr-paris')) expect(loaded.provinces[land].owner).toBe('de');
    for (const land of landsOf('fr-nord')) expect(loaded.provinces[land].owner).toBe('fr');
    expect(Object.values(loaded.armies).every((a) => a.move === null)).toBe(true);
    // And it plays on.
    run(loaded, 600);
    expect(loaded.outcome).toBeNull();
  });

  it('divides the land round each city of a save from before it was several provinces', () => {
    const state = aiGame(9, 'fr');
    run(state, 600);
    // As a schema 6 save had it: one province of land round each city, holding the armies of all its lands.
    const old = JSON.parse(serializeGame(state, 'v6'));
    old.schemaVersion = old.state.schemaVersion = 6;
    const land = (pid: string) => (world.provinces[pid].around ? `${world.provinces[pid].around}-land` : pid);
    for (const city of world.cityIds) {
      const [first, ...rest] = landsOf(city);
      old.state.provinces[`${city}-land`] = { ...old.state.provinces[first], id: `${city}-land` };
      for (const id of [first, ...rest]) delete old.state.provinces[id];
    }
    for (const a of Object.values(old.state.armies) as Record<string, any>[]) {
      a.province = land(a.province);
      if (a.move) a.move = { ...a.move, path: [], leg: null };
    }
    old.state.battles = {};
    old.state.provinces['fr-nord-land'].owner = 'de';
    old.state.provinces['fr-nord-land'].buildings = { fortifications: 2 };
    const army = Object.values(old.state.armies as Record<string, any>).find((a) => a.owner === 'fr')!;
    army.province = 'fr-nord-land';
    const loaded = deserializeGame(JSON.stringify(old), state.scenarioId).state;
    expect(Object.keys(loaded.provinces).sort()).toEqual([...world.provinceIds].sort());
    // Each new land takes the old one's owner; its works and its armies go to the largest.
    for (const id of landsOf('fr-nord')) expect(loaded.provinces[id].owner).toBe('de');
    expect(loaded.provinces[landsOf('fr-nord')[0]].buildings).toEqual({ fortifications: 2 });
    for (const id of landsOf('fr-nord').slice(1)) expect(loaded.provinces[id].buildings).toEqual({});
    expect(loaded.armies[army.id].province).toBe(landsOf('fr-nord')[0]);
    expect(Object.values(loaded.armies).every((a) => a.move === null && world.provinces[a.province])).toBe(true);
    // And it plays on.
    run(loaded, 600);
    expect(loaded.outcome).toBeNull();
  });

  it('a save from before a country joined the scenario takes it in and plays on', () => {
    const state = aiGame(31, 'fr');
    run(state, 900);
    // Strip Hungary out, as in a save made before it was added.
    const hu = world.provinceIds.filter((id) => world.provinces[id].core === 'hu');
    delete state.nations.hu;
    for (const n of Object.values(state.nations)) delete n.relations.hu;
    for (const id of hu) delete state.provinces[id];
    for (const [id, a] of Object.entries(state.armies)) if (a.owner === 'hu' || hu.includes(a.province)) delete state.armies[id];
    for (const key of Object.keys(state.serials)) if (key.startsWith('hu:')) delete state.serials[key];
    const old = deserializeGame(serializeGame(state, 'before Hungary'), state.scenarioId).state;
    const rng = old.rng;

    expect(joinNewcomers(old, world)).toEqual(['hu']);
    expect(old.rng).toBe(rng);
    expect(old.nations.hu.controller).toBe('ai');
    expect(old.nations.fr.relations.hu.status).toBe('peace');
    expect(Object.keys(old.nations.hu.relations).sort()).toEqual(world.nationIds.filter((id) => id !== 'hu').sort());
    for (const id of hu) expect(old.provinces[id].owner).toBe('hu');
    const huArmies = Object.values(old.armies).filter((a) => a.owner === 'hu');
    expect(huArmies.reduce((s, a) => s + a.units.length, 0)).toBe(13);
    const ids = Object.values(old.armies).flatMap((a) => [a.id, ...a.units.map((u) => u.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(old.events.at(-1)!.text).toBe('Hungary joins the campaign, fresh from 1914.');
    expect(joinNewcomers(old, world)).toEqual([]);

    run(old, 1200);
    expect(old.nations.hu.research.completed.length + old.nations.hu.research.active.length).toBeGreaterThan(0);
  });

  it('an army halted on a road past where its border now lies stands at the border, on its own side', () => {
    const state = aiGame(34);
    const road = world.scenario.connections.find((c) => c.border !== undefined && c.border < 0.9)!;
    const army = Object.values(state.armies)[0];
    army.province = road.a;
    army.move = null;
    army.road = { toward: road.b, at: road.border! + 0.05 };
    const hash = hashState(state);
    expect(settleRoads(state, world)).toBe(1);
    expect(army.road).toEqual({ toward: road.b, at: road.border });
    expect(hashState(state)).not.toBe(hash);
    // A save made on today's map has nothing to settle.
    expect(settleRoads(state, world)).toBe(0);
    expect(settleRoads(aiGame(35), world)).toBe(0);
  });

  it.each(['halted', 'mid-leg', 'planned', 'later-leg', 'halt-target'] as const)(
    'settles a saved army using a removed Polish road (%s)',
    (position) => {
      const state = aiGame(36, 'pl');
      const army = Object.values(state.armies).find((a) => a.owner === 'pl')!;
      const from = 'pl-warsaw-ne';
      const to = 'pl-lesser-e';
      // These provinces survive the East expansion, but their old link does not.
      expect(world.provinces[from]).toBeDefined();
      expect(world.provinces[to]).toBeDefined();
      expect(world.neighbors[from].some((n) => n.id === to)).toBe(false);
      army.province = from;
      army.move = null;
      army.arrivedVia = 'land';
      if (position === 'halted') army.road = { toward: to, at: 0.2 };
      else if (position === 'later-leg') {
        const previous = world.neighbors[from][0].id;
        army.province = previous;
        army.move = { mode: 'move', path: [from, to], leg: { from: previous, to: from, elapsed: 5, duration: 100 } };
      } else if (position === 'halt-target') {
        army.move = { mode: 'move', path: [], leg: null, halt: { province: from, toward: to, at: 0.2 } };
      } else {
        army.move = { mode: 'move', path: [to], leg: position === 'mid-leg' ? { from, to, elapsed: 5, duration: 100 } : null };
      }
      const loaded = deserializeGame(serializeGame(state, 'pre-East Polish road')).state;
      const before = loaded.armies[army.id].province;
      expect(settleRoads(loaded, world)).toBe(1);
      expect(loaded.armies[army.id].province).toBe(before);
      expect(loaded.armies[army.id].road).toBeUndefined();
      expect(loaded.armies[army.id].move).toBeNull();
      expect(loaded.armies[army.id].arrivedVia).toBeNull();
      expect(settleRoads(loaded, world)).toBe(0);
    },
  );

  it.each([false, true])('keeps a valid saved march back from a road (mid-leg %s)', (midLeg) => {
    const state = aiGame(37);
    const road = world.scenario.connections.find((c) => c.border !== undefined && !world.provinces[c.a].city && !world.provinces[c.b].city)!;
    const army = Object.values(state.armies)[0];
    army.province = road.a;
    army.move = { mode: 'move', path: [road.a], leg: null };
    if (midLeg) army.move.leg = { from: road.b, to: road.a, elapsed: 90, duration: 100 };
    else army.road = { toward: road.b, at: Math.min(0.1, road.border! / 2) };
    const hash = hashState(state);
    expect(settleRoads(state, world)).toBe(0);
    expect(hashState(state)).toBe(hash);
  });

  it('refuses a save from a redrawn map', () => {
    const vanished = aiGame(32);
    vanished.provinces['xx-atlantis'] = { ...vanished.provinces['fr-paris'], id: 'xx-atlantis' };
    delete vanished.provinces['hu-west'];
    expect(() => joinNewcomers(vanished, world)).toThrow(/earlier map/);
    // Hungary missing, but its provinces present: a country carved out of existing land, not added.
    const carved = aiGame(33);
    delete carved.nations.hu;
    expect(() => joinNewcomers(carved, world)).toThrow(/earlier map/);
  });

  it('rejects foreign or incompatible saves', () => {
    expect(() => deserializeGame('not json')).toThrow();
    expect(() => deserializeGame(JSON.stringify({ format: 'other' }))).toThrow(/Not a World Conflict save/);
    const state = aiGame(1);
    const bad = JSON.parse(serializeGame(state, 'x'));
    bad.schemaVersion = 999;
    expect(() => deserializeGame(JSON.stringify(bad))).toThrow(/version/);
    expect(() => deserializeGame(serializeGame(state, 'x'), 'another-scenario')).toThrow(/different scenario/);
    // Saves from before cities, morale and the research tree hold a different state.
    const early = JSON.parse(serializeGame(state, 'x'));
    early.schemaVersion = early.state.schemaVersion = 2;
    for (const n of Object.values(early.state.nations) as { research: { active: unknown } }[]) n.research.active = null;
    expect(() => deserializeGame(JSON.stringify(early))).toThrow(/earlier version/);
    early.schemaVersion = 1;
    expect(() => deserializeGame(JSON.stringify(early))).toThrow(/earlier version/);
  });
});
