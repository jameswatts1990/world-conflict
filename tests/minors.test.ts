import { describe, expect, it } from 'vitest';
import { aiGame, place, quietGame, run, setWar, world } from './helpers';

const minors = world.nationIds.filter((id) => world.nations[id].power === 'state');

/** France strikes Brussels with the given army; returns whether it fell within 15 minutes and the strength France lost. */
function strike(units: { infantry: number; artillery?: number }) {
  const state = quietGame(9);
  // Belgium's garrison as the scenario starts it: six divisions behind its forts.
  setWar(state, 'fr', 'be');
  const army = place(state, 'fr', 'be-brussels', units);
  const full = army.units.length;
  for (let t = 0; t < 15 * 60 && state.provinces['be-brussels'].owner === 'be'; t++) run(state, 1);
  const left = Object.values(state.armies).filter((a) => a.owner === 'fr' && a.province === 'be-brussels').flatMap((a) => a.units);
  return { fell: state.provinces['be-brussels'].owner === 'fr', lost: 1 - left.reduce((s, u) => s + u.strength, 0) / full };
}

describe('minor powers', () => {
  it('hold a fortified capital against a probe, and make a real army pay to take it', () => {
    // The starting garrison alone; in play the minor's AI adds one or two more, and the price rises to about 40%.
    const probe = strike({ infantry: 8 });
    expect(probe.fell).toBe(false);
    const army = strike({ infantry: 12, artillery: 2 });
    expect(army.fell).toBe(true);
    expect(army.lost).toBeGreaterThan(0.2);
  });

  it('defend themselves but never start a war', () => {
    const state = aiGame(1);
    const declared = new Set<string>();
    // The event log is capped, so collect declarations as they happen.
    for (let m = 0; m < 15; m++) {
      run(state, 60);
      for (const e of state.events) if (e.kind === 'war') declared.add(e.actor!);
    }
    expect(declared.size).toBeGreaterThan(0);
    expect([...declared].filter((n) => minors.includes(n))).toEqual([]);
  });
});
