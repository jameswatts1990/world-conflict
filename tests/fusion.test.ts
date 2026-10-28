import { describe, expect, it } from 'vitest';
import { BUILDING_EFFECTS } from '../src/sim/config/buildings';
import { POWERS } from '../src/sim/config/powers';
import { MORALE } from '../src/sim/config/rules';
import { TECHS } from '../src/sim/config/research';
import { applyCommand, checkResearch, deserializeGame, provinceOutput, serializeGame } from '../src/sim';
import { aiGame, quietGame, run, world } from './helpers';

const E = BUILDING_EFFECTS;

describe('Fusion, the research resource', () => {
  it('comes only from laboratories and universities in cities', () => {
    const state = quietGame();
    const p = state.provinces['fr-paris'];
    p.morale = MORALE.outputPivot;
    p.buildings = {};
    expect(provinceOutput(state, world, 'fr-paris').fusion).toBe(0);
    p.buildings = { laboratory: 2 };
    expect(provinceOutput(state, world, 'fr-paris').fusion).toBeCloseTo(2 * E.laboratoryFusionPerLevel, 9);
    p.buildings = { laboratory: 1, university: 1 };
    expect(provinceOutput(state, world, 'fr-paris').fusion).toBeCloseTo(E.laboratoryFusionPerLevel + E.universityFusion, 9);
  });

  it('pays for research with money, never materials; vehicle research keeps its fuel', () => {
    for (const t of TECHS) {
      expect(t.cost.fusion, t.id).toBeGreaterThan(0);
      expect(t.cost.money, t.id).toBeGreaterThan(0);
      expect(t.cost.materials ?? 0, t.id).toBe(0);
    }
    expect(TECHS.some((t) => (t.cost.fuel ?? 0) > 0)).toBe(true);
  });

  it('research waits for Fusion', () => {
    const state = quietGame();
    const fr = state.nations.fr;
    fr.resources.money = 100000;
    fr.resources.fusion = 0;
    const tech = TECHS.find((t) => t.requires.length === 0)!;
    expect(checkResearch(state, 'fr', tech.id).ok).toBe(false);
    fr.resources.fusion = tech.cost.fusion!;
    expect(applyCommand(state, world, { type: 'research', nation: 'fr', tech: tech.id }).ok).toBe(true);
    expect(fr.resources.fusion).toBe(0);
  });

  it('every nation starts with Fusion; saves from before Fusion get a stock to research with', () => {
    const state = aiGame(4, 'fr');
    expect(state.nations.fr.resources.fusion).toBe(POWERS.playable.startingResources.fusion);
    run(state, 120);
    const old = JSON.parse(serializeGame(state, 'v7'));
    old.schemaVersion = old.state.schemaVersion = 7;
    for (const n of Object.values(old.state.nations) as { resources: Record<string, number> }[]) delete n.resources.fusion;
    const loaded = deserializeGame(JSON.stringify(old), state.scenarioId).state;
    for (const n of Object.values(loaded.nations)) expect(n.resources.fusion).toBeGreaterThan(0);
  });
});
