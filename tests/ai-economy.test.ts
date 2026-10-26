import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/sim/config/buildings';
import { buildContext } from '../src/sim/ai/context';
import { handleRecruitment } from '../src/sim/ai/recruitment';
import { aiGame, clearArmies, place, run, world } from './helpers';

describe('AI economy', () => {
  it('gives its land buildings behind the lines', () => {
    const state = aiGame(3);
    run(state, 10 * 60);
    const built = world.provinceIds.filter((id) => {
      const p = state.provinces[id];
      return !world.provinces[id].city && p.owner !== 'neutral' && Object.keys(p.buildings).some((b) => BUILDINGS[b as keyof typeof BUILDINGS].landOnly);
    });
    expect(built.length).toBeGreaterThan(10);
  });

  it('short of materials, stands down the units that draw most on them first', () => {
    const state = aiGame(3);
    clearArmies(state);
    // A quiet rear province: Germany's capital, with nobody at war.
    // More guns than German industry can keep in shells.
    const army = place(state, 'de', 'de-berlin', { infantry: 3, artillery: 120 });
    state.nations.de.shortages.materials = true;
    handleRecruitment(buildContext(state, world, 'de'));
    const left = state.armies[army.id]?.units.map((u) => u.type) ?? [];
    expect(left.filter((t) => t === 'artillery').length).toBeLessThan(120);
    expect(left.filter((t) => t === 'infantry').length).toBe(3);
  });
});
