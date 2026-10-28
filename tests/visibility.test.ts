import { describe, expect, it } from 'vitest';
import { TECH_BY_ID } from '../src/sim/config/research';
import { SIGHT } from '../src/sim/config/rules';
import { UNITS } from '../src/sim/config/units';
import {
  alliesOf,
  applyCommand,
  areAllies,
  armyBlipKm,
  armySightKm,
  armySpot,
  blipSize,
  detectedProvinces,
  distanceSq,
  findPath,
  isArmyVisible,
  legTicks,
  radarBlips,
  roadBorder,
  unitBlipKm,
  unitSightKm,
  visibleProvinces,
  withinKm,
  type GameState,
  type NationId,
  type ProvinceId,
  type UnitType,
} from '../src/sim';
import { clearArmies, place, quietGame, run, setWar, world } from './helpers';

function research(state: GameState, nation: NationId, tech: string) {
  state.nations[nation].research.completed.push(tech);
}

/** How far apart two provinces' anchors are, in km. */
const km = (a: ProvinceId, b: ProvinceId) => Math.sqrt(distanceSq(world.spots[a], world.spots[b])) / 1000;

/** A road over open land between two regions, long enough that its far end lies beyond a line army's sight. */
const longRoad = (ok: (a: ProvinceId, b: ProvinceId) => boolean = () => true) =>
  world.scenario.connections.find(
    (c) => c.kind === 'land' && world.regionOf[c.a] !== world.regionOf[c.b] && km(c.a, c.b) > 140 && km(c.a, c.b) < 200 && ok(c.a, c.b),
  )!;

describe('fog of war', () => {
  it('a nation sees its own territory whole, and nothing over the border without an army there', () => {
    const state = quietGame();
    clearArmies(state);
    const seen = visibleProvinces(state, world, 'fr');
    const held = world.provinceIds.filter((id) => state.provinces[id].owner === 'fr');
    expect([...seen].sort()).toEqual([...held].sort());
    for (const id of ['de-hesse-s', 'be-brussels', 'uk-london', 'it-piedmont']) expect(seen.has(id)).toBe(false);
  });

  it('sight is a property of each unit type, in km on the map: most see 100 km, scouts further', () => {
    for (const type of Object.keys(UNITS) as UnitType[]) {
      expect(unitSightKm(type)).toBe(UNITS[type].recon ? 170 : SIGHT.unitKm);
      expect(unitBlipKm(type)).toBe(UNITS[type].recon ? 350 : SIGHT.unitBlipKm);
      expect(unitBlipKm(type)).toBeGreaterThan(unitSightKm(type));
    }
    expect([SIGHT.unitKm, SIGHT.unitBlipKm, SIGHT.landBlipKm]).toEqual([100, 225, 120]);
    const state = quietGame();
    clearArmies(state);
    // An army sees as far as its best-sighted unit.
    expect(armySightKm(place(state, 'fr', 'fr-paris', { infantry: 3 }))).toBe(100);
    expect(armySightKm(place(state, 'fr', 'fr-paris', { infantry: 3, cavalry: 1 }))).toBe(170);
    expect(armyBlipKm(place(state, 'fr', 'fr-paris', { infantry: 3 }))).toBe(225);
    expect(armyBlipKm(place(state, 'fr', 'fr-paris', { armouredCar: 1 }))).toBe(350);
  });

  it('calibration: Belarusian cavalry at Brest sees the Polish border lands, and Warsaw and the lands round it only as blips', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'by', 'pl');
    const scouts = place(state, 'by', 'by-brest', { infantry: 2, cavalry: 1 });
    // Polish armies, from the nearest to the farthest (km from Brest on the map).
    const at: Record<ProvinceId, number> = {
      'pl-warsaw-e': 103, // Biała Podlaska
      'pl-warsaw-se': 117, // Lublin
      'pl-warsaw': 183, // Warsaw
      'pl-warsaw-ne': 195, // Podlachia
      'pl-warsaw-sw': 274, // Łódź
      'pl-warsaw-n': 275, // Masuria
      'pl-lesser': 345, // Kraków
      'pl-pomerania-s': 371,
      'pl-silesia-se': 392,
    };
    const polish: Record<ProvinceId, ReturnType<typeof place>> = {};
    for (const [pid, d] of Object.entries(at)) {
      expect(Math.round(km('by-brest', pid))).toBe(d);
      polish[pid] = place(state, 'pl', pid, { infantry: 2 });
    }
    const inSight = () => {
      const seen = visibleProvinces(state, world, 'by');
      return Object.keys(at).filter((pid) => isArmyVisible(polish[pid], 'by', seen));
    };
    const blips = () => radarBlips(state, world, 'by').map((b) => b.province).sort();
    expect(inSight()).toEqual(['pl-warsaw-e', 'pl-warsaw-se']);
    expect(blips()).toEqual(['pl-warsaw', 'pl-warsaw-ne', 'pl-warsaw-sw', 'pl-warsaw-n', 'pl-lesser'].sort());
    // A blip says only where and how big.
    expect(radarBlips(state, world, 'by').every((b) => b.size === 'small')).toBe(true);

    // Without the cavalry, line infantry sees 100 km and picks up blips to 225 km: Biała Podlaska, Lublin, Warsaw and
    // Podlachia are blips, Łódź and beyond hidden.
    scouts.units = scouts.units.filter((u) => u.type !== 'cavalry');
    expect(inSight()).toEqual([]);
    expect(blips()).toEqual(['pl-warsaw-e', 'pl-warsaw-se', 'pl-warsaw', 'pl-warsaw-ne'].sort());
  });

  it('an army sees the province it stands in, and every province whose centre lies within its sight', () => {
    const state = quietGame();
    clearArmies(state);
    const before = visibleProvinces(state, world, 'fr');
    place(state, 'fr', 'de-berlin-ssw', { infantry: 2 });
    const seen = visibleProvinces(state, world, 'fr');
    const added = [...seen].filter((id) => !before.has(id)).sort();
    const within = world.provinceIds.filter((id) => !before.has(id) && withinKm(world.spots['de-berlin-ssw'], world.spots[id], 100));
    expect(within).toContain('de-berlin-ssw');
    expect(added).toEqual(within.sort());
    expect(seen.has('de-berlin')).toBe(false); // about 150 km off
  });

  it('beyond sight, the radar shows unknown armies as blips of a rough size and nothing more', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    place(state, 'fr', 'de-berlin-ssw', { infantry: 2 });
    const seen = visibleProvinces(state, world, 'fr');
    const detected = detectedProvinces(state, world, 'fr');
    for (const id of seen) expect(detected.has(id)).toBe(true);
    // Berlin, about 150 km away, is on the radar but out of sight; Warsaw is beyond both.
    expect(seen.has('de-berlin')).toBe(false);
    expect(detected.has('de-berlin')).toBe(true);
    expect(detected.has('pl-warsaw')).toBe(false);

    const small = place(state, 'de', 'de-berlin', { infantry: 2 });
    place(state, 'de', 'pl-warsaw', { infantry: 12 });
    expect(isArmyVisible(small, 'fr', seen)).toBe(false);
    expect(radarBlips(state, world, 'fr')).toEqual([{ province: 'de-berlin', size: 'small' }]);
    // Every hidden army in a province makes one blip, sized by all their units together.
    place(state, 'de', 'de-berlin', { tank: 1, artillery: 2 });
    expect(radarBlips(state, world, 'fr')).toEqual([{ province: 'de-berlin', size: 'medium' }]);
    place(state, 'it', 'de-berlin', { infantry: 4 });
    expect(radarBlips(state, world, 'fr')).toEqual([{ province: 'de-berlin', size: 'large' }]);
    // A blip says only where and how big: the same for anyone's armies and any units.
    const other = quietGame();
    clearArmies(other);
    setWar(other, 'fr', 'de');
    place(other, 'fr', 'de-berlin-ssw', { infantry: 2 });
    place(other, 'pl', 'de-berlin', { cavalry: 9 });
    expect(radarBlips(other, world, 'fr')).toEqual(radarBlips(state, world, 'fr'));
    expect([blipSize(1), blipSize(SIGHT.blipUnits.medium - 1), blipSize(SIGHT.blipUnits.medium), blipSize(SIGHT.blipUnits.large)]).toEqual([
      'small',
      'small',
      'medium',
      'large',
    ]);
    // Armies in sight are seen, not blips, and nobody picks up their own armies.
    place(state, 'de', 'de-berlin', { infantry: 1 });
    expect(radarBlips(state, world, 'fr').map((b) => b.province)).toEqual(['de-berlin']);
    expect(radarBlips(state, world, 'de')).toEqual([]);
  });

  it('held land picks up blips a little way over the border; without an army the radar ends there', () => {
    const state = quietGame();
    clearArmies(state);
    const seen = visibleProvinces(state, world, 'fr');
    const detected = detectedProvinces(state, world, 'fr');
    // Belgium's west land and its city are on the radar of France's northern border lands, Hesse is not.
    for (const id of ['be-brussels-w', 'be-brussels']) expect([seen.has(id), detected.has(id)]).toEqual([false, true]);
    expect(detected.has('de-hesse')).toBe(false);
    place(state, 'de', 'be-brussels-w', { infantry: 5 });
    place(state, 'de', 'de-hesse', { infantry: 5 });
    expect(radarBlips(state, world, 'fr')).toEqual([{ province: 'be-brussels-w', size: 'medium' }]);
  });

  it('a marching army watches from where it is, never from the far end of its road', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const german = (pid: ProvinceId) => state.provinces[pid].owner === 'de';
    const road = longRoad((a, b) => german(a) && german(b));
    const french = place(state, 'fr', road.a, { infantry: 1 });
    const enemy = place(state, 'de', road.b, { infantry: 1 });
    expect(isArmyVisible(enemy, 'fr', visibleProvinces(state, world, 'fr'))).toBe(false);
    expect(findPath(state, world, french, road.a, road.b)!.path).toEqual([road.b]);
    const ticks = legTicks(state, world, french, road.a, road.b);
    expect(applyCommand(state, world, { type: 'move', nation: 'fr', armyId: french.id, to: road.b }).ok).toBe(true);
    run(state, 1);
    // Just set out: the German army at the far end is still a blip, not in plain sight.
    expect(french.move?.leg).toBeTruthy();
    expect(isArmyVisible(enemy, 'fr', visibleProvinces(state, world, 'fr'))).toBe(false);
    expect(radarBlips(state, world, 'fr').map((b) => b.province)).toEqual([road.b]);
    // Closer, within 100 km of it, the French see it.
    run(state, ticks - 3);
    expect(withinKm(armySpot(world, french), world.spots[road.b], 100)).toBe(true);
    expect(isArmyVisible(enemy, 'fr', visibleProvinces(state, world, 'fr'))).toBe(true);
  });

  it('an army on a road is seen where it stands on the road, though its province is out of sight', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    // One whose border lies near enough the French end that a German halted by it is within 100 km of them.
    const halt = (a: ProvinceId, b: ProvinceId) => Math.round(roadBorder(world, b, a) * 950) / 1000;
    const road = longRoad((a, b) => state.provinces[a].owner === 'fr' && state.provinces[b].owner === 'de' && km(a, b) * (1 - halt(a, b)) < 80);
    place(state, 'fr', road.a, { infantry: 1 });
    const german = place(state, 'de', road.b, { infantry: 1 });
    const seen = () => visibleProvinces(state, world, 'fr');
    expect(isArmyVisible(german, 'fr', seen())).toBe(false);
    // Halted on the road towards the French, near the border: still in its own land, but within sight.
    german.road = { toward: road.a, at: halt(road.a, road.b) };
    expect(seen().has(road.b)).toBe(false);
    expect(withinKm(armySpot(world, german), world.spots[road.a], 100)).toBe(true);
    expect(isArmyVisible(german, 'fr', seen())).toBe(true);
    // Its owner always sees it.
    expect(isArmyVisible(german, 'de', new Set())).toBe(true);
  });

  it('co-belligerents are powers at peace with each other fighting a common enemy', () => {
    const state = quietGame();
    expect(areAllies(state, 'fr', 'it')).toBe(false);
    setWar(state, 'fr', 'de');
    setWar(state, 'it', 'de');
    expect(areAllies(state, 'fr', 'it')).toBe(true);
    expect(areAllies(state, 'it', 'fr')).toBe(true);
    expect(areAllies(state, 'fr', 'de')).toBe(false);
    expect(areAllies(state, 'fr', 'es')).toBe(false);
    expect(areAllies(state, 'fr', 'neutral')).toBe(false);
    expect(alliesOf(state, world, 'fr')).toEqual(['it']);
    // Fighting each other as well ends it, and so does the common enemy's elimination.
    setWar(state, 'fr', 'it');
    expect(areAllies(state, 'fr', 'it')).toBe(false);
    state.nations.fr.relations.it.status = 'peace';
    state.nations.it.relations.fr.status = 'peace';
    state.nations.de.eliminated = true;
    expect(areAllies(state, 'fr', 'it')).toBe(false);
  });

  it('Liaison Officers show what co-belligerents see', () => {
    const tech = TECH_BY_ID.liaisonOfficers;
    expect(tech.effects).toEqual([{ kind: 'alliedSight' }]);
    expect(tech.requires.every((r) => TECH_BY_ID[r])).toBe(true);

    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    setWar(state, 'it', 'de');
    expect(visibleProvinces(state, world, 'fr').has('it-naples')).toBe(false);
    research(state, 'fr', 'liaisonOfficers');
    expect(visibleProvinces(state, world, 'fr').has('it-naples')).toBe(true);
    // Only for the nation that researched it.
    expect(visibleProvinces(state, world, 'it').has('fr-aquitaine')).toBe(false);
    research(state, 'it', 'liaisonOfficers');
    expect(visibleProvinces(state, world, 'it').has('fr-aquitaine')).toBe(true);
    // Not from powers that are not co-belligerents.
    expect(visibleProvinces(state, world, 'fr').has('es-andalusia')).toBe(false);
    // Peace with the common enemy ends the co-belligerence, and the shared sight with it.
    state.nations.fr.relations.de.status = 'peace';
    state.nations.de.relations.fr.status = 'peace';
    expect(visibleProvinces(state, world, 'fr').has('it-naples')).toBe(false);
  });

  it('the fog lifts when the campaign is over', () => {
    const state = quietGame();
    state.outcome = { winner: 'fr', reason: 'objectives', tick: state.tick, scores: [] };
    expect(visibleProvinces(state, world, 'es').size).toBe(world.provinceIds.length);
  });
});
