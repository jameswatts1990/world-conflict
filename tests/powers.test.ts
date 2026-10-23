import { describe, expect, it } from 'vitest';
import { POWERS, startingUnits } from '../src/sim/config/powers';
import { buildConnections, buildProvinces, buildStartingSetup, type LandData, type ProvinceRow } from '../src/sim/scenario/build';
import {
  applyCommand,
  armyName,
  buildWorld,
  createInitialState,
  nationIdentity,
  stepState,
  type BlocId,
  type ConnectionDef,
  type NationDef,
  type PowerTier,
  type ScenarioDef,
} from '../src/sim';

// A small theatre: a great power, a major power, a one-province minor power and a neutral state in a row.
const nation = (id: string, power: PowerTier, bloc: BlocId): NationDef => ({
  id,
  name: id.toUpperCase(),
  adjective: id,
  color: '#888888',
  capital: `${id}-cap`,
  power,
  bloc,
  identity: nationIdentity(bloc),
});
const NATIONS = [nation('aa', 'great', 'western'), nation('bb', 'major', 'central'), nation('mm', 'minor', 'eastern')];

let lon = 0;
const row = (id: string, core: string | null, tier: ProvinceRow['tier'], extra: Partial<ProvinceRow> = {}): ProvinceRow => ({
  id,
  name: id,
  core,
  terrain: 'plains',
  tier,
  city: { name: id, coord: [(lon += 1.5), 48], size: tier === 'capital' ? 'capital' : 'town' },
  pop: 100,
  towns: [],
  ...extra,
});

function rows(extra: Partial<Record<string, Partial<ProvinceRow>>> = {}): ProvinceRow[] {
  lon = 0;
  return [
    row('aa-cap', 'aa', 'capital', extra['aa-cap']),
    row('aa-ind', 'aa', 'industrial', extra['aa-ind']),
    row('aa-a', 'aa', 'city', extra['aa-a']),
    row('aa-b', 'aa', 'town', extra['aa-b']),
    row('bb-cap', 'bb', 'capital', extra['bb-cap']),
    row('bb-ind', 'bb', 'industrial', extra['bb-ind']),
    row('bb-a', 'bb', 'town', extra['bb-a']),
    row('mm-cap', 'mm', 'capital', extra['mm-cap']),
    row('nt-x', null, 'town', { neutral: { name: 'X', adjective: 'X' }, vp: 1, garrison: { infantry: 2 }, buildings: { fortifications: 1 } }),
  ];
}

const land = (a: string, b: string): ConnectionDef => ({ a, b, kind: 'land' });
const CONNECTIONS = [
  land('aa-cap', 'aa-ind'),
  land('aa-cap', 'aa-a'),
  land('aa-ind', 'aa-b'),
  land('aa-a', 'aa-b'),
  land('aa-b', 'bb-cap'),
  land('bb-cap', 'bb-ind'),
  land('bb-ind', 'bb-a'),
  land('bb-a', 'mm-cap'),
  land('mm-cap', 'nt-x'),
];

/** Each city's land is anchored a little north of it. */
const landData = (r: ProvinceRow[]): LandData =>
  Object.fromEntries(r.map((x) => [x.id, { anchor: [x.city.coord[0], x.city.coord[1] + 0.5] as [number, number], coast: false }]));

function scenario(r = rows()): ScenarioDef {
  return {
    id: 'powers-test',
    name: 'Powers test',
    nations: NATIONS,
    provinces: buildProvinces(r, NATIONS, landData(r)),
    connections: buildConnections(r, CONNECTIONS),
    ...buildStartingSetup(r, NATIONS, CONNECTIONS),
    startingTechs: [],
  };
}

describe('power tiers', () => {
  it('scale each nation to its tier: output, objectives and the capital', () => {
    const s = scenario();
    for (const n of NATIONS) {
      const power = POWERS[n.power];
      const provs = s.provinces.filter((p) => p.core === n.id);
      expect(provs.reduce((t, p) => t + p.production.money, 0)).toBeCloseTo(power.output.money, -1);
      expect(provs.reduce((t, p) => t + (p.objectiveVp ?? 0), 0)).toBe(power.vp.capital + (power.vp.industrial ?? 0));
      expect(s.provinces.find((p) => p.id === n.capital)!.tier).toBe(power.capitalCity);
    }
    expect(s.provinces.find((p) => p.id === 'nt-x')!.objectiveVp).toBe(1);
  });

  it('deal field units over border provinces first, and to the capital when there is nothing else', () => {
    const units = (province: string) => scenario().startingArmies.find((a) => a.province === province)?.units;
    // Garrisons in the cities; field units out on the land.
    expect(units('aa-cap')).toEqual(POWERS.great.armies.capital);
    expect(units('aa-b-land')).toEqual({ infantry: 3 }); // borders the major power
    expect(units('aa-a-land')).toEqual({ infantry: 2, cavalry: 1 });
    expect(units('aa-a')).toBeUndefined();
    expect(units('bb-a-land')).toEqual(POWERS.major.armies.field);
    expect(units('mm-cap')).toEqual(POWERS.minor.armies.capital);
    expect(units('mm-cap-land')).toEqual(POWERS.minor.armies.field);
    expect(units('nt-x')).toEqual({ infantry: 2 });
    for (const n of NATIONS) {
      const total: Record<string, number> = {};
      for (const a of scenario().startingArmies.filter((x) => x.owner === n.id)) {
        for (const [t, k] of Object.entries(a.units)) total[t] = (total[t] ?? 0) + (k ?? 0);
      }
      expect(total).toEqual(startingUnits(n.power));
    }
  });

  it('use hand-placed field units and the recruiting city when the rows give them', () => {
    const s = scenario(rows({ 'aa-a': { recruiting: true, garrison: { infantry: 5, cavalry: 1 } } }));
    expect(s.startingArmies.find((a) => a.province === 'aa-a-land')!.units).toEqual({ infantry: 5, cavalry: 1 });
    expect(s.startingArmies.some((a) => a.province === 'aa-b-land')).toBe(false);
    expect(s.startingBuildings.find((b) => b.province === 'aa-a')!.buildings).toEqual(POWERS.great.buildings.recruiting);
    expect(s.startingBuildings.find((b) => b.province === 'nt-x')!.buildings).toEqual({ fortifications: 1 });
  });

  it('refuse a nation that lacks a province its tier needs', () => {
    expect(() => buildStartingSetup(rows({ 'aa-ind': { tier: 'city' } }), NATIONS, CONNECTIONS)).toThrow(/needs an industrial province/);
    expect(() => buildStartingSetup(rows({ 'mm-cap': { tier: 'town' } }), NATIONS, CONNECTIONS)).toThrow(/no capital/);
  });

  it('leave neutral states open to invasion without war, defended by their own garrison', () => {
    const world = buildWorld(scenario());
    const state = createInitialState(world, { seed: 1, humanNation: 'bb' });
    const army = Object.values(state.armies).find((a) => a.owner === 'mm')!;
    expect(applyCommand(state, world, { type: 'move', nation: 'mm', armyId: army.id, to: 'nt-x' }).ok).toBe(true);
    const garrison = Object.values(state.armies).find((a) => a.owner === 'neutral')!;
    expect(armyName(world, garrison)).toBe('X garrison');
  });

  it('keep minor powers computer-controlled, and let them play', () => {
    const world = buildWorld(scenario());
    expect(() => createInitialState(world, { seed: 1, humanNation: 'mm' })).toThrow(/always computer-controlled/);
    expect(() => createInitialState(world, { seed: 1, humanNation: 'zz' })).toThrow(/Unknown nation/);
    const state = createInitialState(world, { seed: 1, humanNation: 'bb' });
    expect(state.nations.bb.controller).toBe('human');
    expect(state.nations.mm.controller).toBe('ai');
    expect(state.nations.mm.resources).toEqual(POWERS.minor.startingResources);
    for (let i = 0; i < 1800; i++) stepState(state, world);
    const mm = state.nations.mm;
    for (const v of Object.values(mm.resources)) expect(Number.isFinite(v) && v >= 0).toBe(true);
    expect(mm.research.completed.length + mm.research.active.length).toBeGreaterThan(0);
  });
});
