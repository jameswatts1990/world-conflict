import { describe, expect, it } from 'vitest';
import {
  GameLoop,
  SCHEMA_VERSION,
  Simulation,
  applyCommand,
  deserializeGame,
  hashState,
  joinNewcomers,
  replay,
  serializeGame,
  stepState,
  type Command,
} from '../src/sim';
import { aiGame, run, world } from './helpers';

/** A scripted player (France) issuing orders at fixed ticks, plus five AIs. */
const SCRIPT: { tick: number; command: Command }[] = [
  { tick: 3, command: { type: 'build', nation: 'fr', province: 'fr-nord', building: 'industry' } },
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
  });

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
