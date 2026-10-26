import { describe, expect, it } from 'vitest';
import { BUILDING_EFFECTS } from '../src/sim/config/buildings';
import { ECONOMY, MORALE, SUPPLY } from '../src/sim/config/rules';
import { applyCommand, checkBuild, moraleOutputMult, provinceOutput } from '../src/sim';
import { transferProvince } from '../src/sim/systems/territory';
import { clearArmies, place, quietGame, richen, run, world } from './helpers';

const E = BUILDING_EFFECTS;
/** A core French land round a city without an oil field, and one round Bordeaux, which has one. */
const LAND = 'fr-east-w';
const OIL_LAND = world.provinces['fr-aquitaine'].lands![0];

function build(state: ReturnType<typeof quietGame>, province: string, building: Parameters<typeof checkBuild>[4]) {
  const r = applyCommand(state, world, { type: 'build', nation: 'fr', province, building });
  expect(r.ok ? '' : r.reason).toBe('');
  state.provinces[province].construction!.remaining = 1;
  run(state, 1);
}

describe('land without a city', () => {
  it('earns a little money and manpower, scaled by morale and occupation as a city is', () => {
    const state = quietGame();
    const p = state.provinces[LAND];
    p.morale = MORALE.outputPivot;
    const core = provinceOutput(state, world, LAND);
    expect(core.money).toBeCloseTo(ECONOMY.landOutput.money, 9);
    expect(core.manpower).toBeCloseTo(ECONOMY.landOutput.manpower, 9);
    expect(core.materials).toBe(0);
    p.owner = 'de';
    p.morale = MORALE.capturedOccupied;
    const occupied = provinceOutput(state, world, LAND);
    expect(occupied.money).toBeCloseTo(ECONOMY.landOutput.money * moraleOutputMult(p.morale), 9);
    expect(occupied.manpower).toBeCloseTo(ECONOMY.landOutput.manpower * moraleOutputMult(p.morale) * ECONOMY.occupiedManpower, 9);
  });

  it('takes land buildings and infrastructure, never a city building; land buildings never stand in a city', () => {
    const state = quietGame();
    richen(state, 'fr');
    for (const b of ['farm', 'tradingPost', 'workshops', 'fieldHospital', 'bunkers', 'fieldStation', 'fortifications', 'supplyDepot'] as const) {
      expect(checkBuild(state, world, 'fr', LAND, b).ok, b).toBe(true);
    }
    const barracks = checkBuild(state, world, 'fr', LAND, 'barracks');
    expect(barracks.ok ? '' : barracks.reason).toMatch(/Needs a city/);
    const farm = checkBuild(state, world, 'fr', 'fr-paris', 'farm');
    expect(farm.ok ? '' : farm.reason).toMatch(/Only on land/);
    // Oil wells only round a city with an oil field.
    expect(checkBuild(state, world, 'fr', OIL_LAND, 'oilWells').ok).toBe(true);
    expect(checkBuild(state, world, 'fr', LAND, 'oilWells').ok).toBe(false);
  });

  it('holds one building: a new one replaces it when finished, infrastructure included', () => {
    const state = quietGame();
    richen(state, 'fr');
    build(state, LAND, 'fortifications');
    build(state, LAND, 'fortifications');
    expect(state.provinces[LAND].buildings).toEqual({ fortifications: 2 });
    // The fort stands while the farm is built, and goes when it is finished.
    applyCommand(state, world, { type: 'build', nation: 'fr', province: LAND, building: 'farm' });
    expect(state.provinces[LAND].buildings.fortifications).toBe(2);
    state.provinces[LAND].construction!.remaining = 1;
    run(state, 1);
    expect(state.provinces[LAND].buildings).toEqual({ farm: 1 });
    // Older saves may hold several pieces of infrastructure: a new building clears them all.
    state.provinces[LAND].buildings = { supplyDepot: 1, railway: 1 };
    build(state, LAND, 'workshops');
    expect(state.provinces[LAND].buildings).toEqual({ workshops: 1 });
  });

  it('loses its building when captured; a city keeps its buildings', () => {
    const state = quietGame();
    state.provinces[LAND].buildings = { fortifications: 3 };
    state.provinces['fr-east'].buildings.industry = 1;
    transferProvince(state, world, LAND, 'de');
    transferProvince(state, world, 'fr-east', 'de');
    expect(state.provinces[LAND].buildings).toEqual({});
    expect(state.provinces['fr-east'].buildings.industry).toBe(1);
  });

  it('economy buildings add to the land output', () => {
    const state = quietGame();
    const p = state.provinces[LAND];
    p.morale = MORALE.outputPivot;
    const base = provinceOutput(state, world, LAND);
    p.buildings = { farm: 1 };
    expect(provinceOutput(state, world, LAND).manpower - base.manpower).toBeCloseTo(E.farmManpower, 9);
    expect(provinceOutput(state, world, LAND).money - base.money).toBeCloseTo(E.farmMoney, 9);
    p.buildings = { tradingPost: 1 };
    expect(provinceOutput(state, world, LAND).money - base.money).toBeCloseTo(E.tradingPostMoney, 9);
    p.buildings = { workshops: 1 };
    expect(provinceOutput(state, world, LAND).materials - base.materials).toBeCloseTo(E.workshopsMaterials, 9);
    state.provinces[OIL_LAND].morale = MORALE.outputPivot;
    state.provinces[OIL_LAND].buildings = { oilWells: 1 };
    expect(provinceOutput(state, world, OIL_LAND).fuel).toBeCloseTo(E.oilWellsFuel, 9);
  });

  it('field stations make a little Fusion', () => {
    const state = quietGame();
    state.provinces[LAND].morale = MORALE.outputPivot;
    expect(provinceOutput(state, world, LAND).fusion).toBe(0);
    state.provinces[LAND].buildings = { fieldStation: 1 };
    expect(provinceOutput(state, world, LAND).fusion).toBeCloseTo(E.fieldStationFusion, 9);
  });

  it('field hospitals heal armies faster', () => {
    const heal = (hospital: boolean) => {
      const state = quietGame();
      clearArmies(state);
      if (hospital) state.provinces[LAND].buildings = { fieldHospital: 1 };
      const army = place(state, 'fr', LAND, { infantry: 1 });
      army.units[0].strength = 0.5;
      run(state, 60);
      return state.armies[army.id].units[0].strength - 0.5;
    };
    expect(heal(false)).toBeGreaterThan(0);
    expect(heal(true) / heal(false)).toBeCloseTo(E.fieldHospitalHealing, 1);
    expect(SUPPLY.healPerStep).toBeGreaterThan(0);
  });
});
