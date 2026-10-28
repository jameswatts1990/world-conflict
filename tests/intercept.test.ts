import { describe, expect, it, vi } from 'vitest';
import { applyCommand, type Army, type GameState } from '../src/sim';
import { clearArmies, linkBetween, place, quietGame, run, setWar, world } from './helpers';

// The fog of war decides who reacts; a switch here hides every foreign army from everyone.
const fog = vi.hoisted(() => ({ blind: false }));
vi.mock('../src/sim/visibility', async (load) => {
  const real = await load<typeof import('../src/sim/visibility')>();
  return { ...real, isArmyVisible: (...args: Parameters<typeof real.isArmyVisible>) => !fog.blind && real.isArmyVisible(...args) };
});

const [paris, nord] = linkBetween('fr-paris', 'fr-nord');

function intercepts(state: GameState) {
  return state.events.filter((e) => e.kind === 'intercept');
}

/** Runs until the army stops marching (or the ticks run out). */
function runWhileMarching(state: GameState, army: Army, ticks: number): void {
  for (let t = 0; t < ticks && state.armies[army.id]?.move?.leg; t++) run(state, 1);
}

describe('armies meeting on the road', () => {
  it('two armies at war marching at each other along a road stop where they meet and fight there', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const fr = place(state, 'fr', paris, { infantry: 4 });
    const de = place(state, 'de', nord, { infantry: 1 });
    expect(applyCommand(state, world, { type: 'move', nation: 'fr', armyId: fr.id, to: nord, mode: 'move' }).ok).toBe(true);
    expect(applyCommand(state, world, { type: 'move', nation: 'de', armyId: de.id, to: paris, mode: 'move' }).ok).toBe(true);
    runWhileMarching(state, fr, 2000);
    // Both halted on the road, side by side in the same land, with their orders kept.
    expect(fr.move?.leg).toBeNull();
    expect(de.move?.leg).toBeNull();
    expect(fr.road).toBeDefined();
    expect(fr.province).toBe(de.province);
    expect(fr.road).toEqual(de.road);
    expect(fr.move?.path.at(-1)).toBe(nord);
    expect(intercepts(state)).toHaveLength(1);
    expect(intercepts(state)[0].text).toMatch(/ran into each other on the road near/);
    run(state, 20);
    expect(state.events.some((e) => e.kind === 'battle')).toBe(true);
    // The stronger army wins and goes on to where it was going.
    run(state, 3000);
    expect(state.armies[de.id]).toBeUndefined();
    expect(state.armies[fr.id].province).toBe(nord);
    expect(state.armies[fr.id].move).toBeNull();
  });

  it('an army marching past an enemy standing on the road is stopped at its spot, if the enemy sees it', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const de = place(state, 'de', nord, { infantry: 2 });
    de.road = { toward: paris, at: 0.2 };
    const fr = place(state, 'fr', paris, { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: fr.id, to: nord, mode: 'move' });
    runWhileMarching(state, fr, 2000);
    expect(fr.province).toBe(nord);
    expect(fr.road).toEqual({ toward: paris, at: 0.2 });
    expect(de.road).toEqual({ toward: paris, at: 0.2 });
    expect(intercepts(state)[0].text).toMatch(/was intercepted by the .* on the road near/);
    run(state, 20);
    expect(state.battles[nord]).toBeDefined();
  });

  it('an army the enemy cannot see slips past', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const de = place(state, 'de', nord, { infantry: 2 });
    de.road = { toward: paris, at: 0.2 };
    const fr = place(state, 'fr', paris, { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: fr.id, to: nord, mode: 'move' });
    fog.blind = true;
    try {
      runWhileMarching(state, fr, 2000);
    } finally {
      fog.blind = false;
    }
    expect(intercepts(state)).toHaveLength(0);
    // It reached the land's crossroads; the enemy is in that land, so they fight there as before.
    expect(fr.province).toBe(nord);
    expect(fr.road).toBeUndefined();
  });

  it('armies at peace pass each other', () => {
    const state = quietGame();
    clearArmies(state);
    const it_ = place(state, 'it', nord, { infantry: 2 });
    it_.road = { toward: paris, at: 0.2 };
    const fr = place(state, 'fr', paris, { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: fr.id, to: nord, mode: 'move' });
    runWhileMarching(state, fr, 2000);
    expect(intercepts(state)).toHaveLength(0);
    expect(fr.province).toBe(nord);
    expect(fr.road).toBeUndefined();
  });

  it('an army withdrawing from a battle under fire is not stopped again on its way out', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const fr = place(state, 'fr', paris, { infantry: 3 });
    place(state, 'de', paris, { infantry: 3 });
    const screen = place(state, 'de', paris, { infantry: 1 });
    screen.road = { toward: nord, at: 0.3 };
    run(state, 20);
    expect(state.battles[paris]).toBeDefined();
    expect(applyCommand(state, world, { type: 'move', nation: 'fr', armyId: fr.id, to: nord, mode: 'move' }).ok).toBe(true);
    expect(fr.move?.leg?.withdrawing).toBe(true);
    runWhileMarching(state, fr, 2000);
    expect(intercepts(state)).toHaveLength(0);
    expect(state.armies[fr.id].province).toBe(nord);
  });

  it('armies crossing the sea are not stopped at sea', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'uk', 'fr');
    const [kent, artois] = linkBetween('uk-london', 'fr-nord');
    const uk = place(state, 'uk', kent, { infantry: 2 });
    const fr = place(state, 'fr', artois, { infantry: 2 });
    applyCommand(state, world, { type: 'move', nation: 'uk', armyId: uk.id, to: artois, mode: 'move' });
    applyCommand(state, world, { type: 'move', nation: 'fr', armyId: fr.id, to: kent, mode: 'move' });
    runWhileMarching(state, uk, 3000);
    expect(intercepts(state)).toHaveLength(0);
    expect(uk.province).toBe(artois);
  });
});
