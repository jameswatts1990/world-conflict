import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NATION_OUTPUT_TARGET } from '../src/sim/scenario/europe/provinces';
import { world } from './helpers';

describe('scenario data', () => {
  it('has six nations and 30–50 playable provinces', () => {
    expect(world.nationIds).toHaveLength(6);
    expect(world.provinceIds.length).toBeGreaterThanOrEqual(30);
    expect(world.provinceIds.length).toBeLessThanOrEqual(50);
  });

  it('every province has a shape and every shape has a province', () => {
    const topo = JSON.parse(readFileSync('src/assets/map/theatre.topo.json', 'utf8'));
    const shapeIds = new Set<string>(topo.objects.provinces.geometries.map((g: { properties: { pid: string } }) => g.properties.pid));
    expect([...shapeIds].sort()).toEqual([...world.provinceIds].sort());
  });

  it('movement graph is connected and uses only explicit connections', () => {
    const seen = new Set([world.provinceIds[0]]);
    const queue = [world.provinceIds[0]];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const n of world.neighbors[cur]) if (!seen.has(n.id)) (seen.add(n.id), queue.push(n.id));
    }
    expect(seen.size).toBe(world.provinceIds.length);
    // Straits exist for islands (e.g. Britain) — they are explicit, not derived from shapes.
    expect(world.neighbors['uk-london'].some((n) => n.id === 'fr-nord' && n.kind === 'strait')).toBe(true);
  });

  it('nations start with balanced output and the same army template', () => {
    for (const id of world.nationIds) {
      const provs = world.scenario.provinces.filter((p) => p.core === id);
      const money = provs.reduce((s, p) => s + p.production.money, 0);
      const materials = provs.reduce((s, p) => s + p.production.materials, 0);
      expect(money).toBeCloseTo(NATION_OUTPUT_TARGET.money, -1);
      expect(materials).toBeCloseTo(NATION_OUTPUT_TARGET.materials, -1);
      const units = world.scenario.startingArmies
        .filter((a) => a.owner === id)
        .reduce((s, a) => s + (a.units.infantry ?? 0) + (a.units.artillery ?? 0) + (a.units.tank ?? 0), 0);
      expect(units).toBe(13);
      expect(provs.filter((p) => p.oil)).toHaveLength(1);
      expect(provs.reduce((s, p) => s + (p.objectiveVp ?? 0), 0)).toBe(5);
    }
  });
});
