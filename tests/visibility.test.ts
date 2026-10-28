import { describe, expect, it } from 'vitest';
import { TECH_BY_ID } from '../src/sim/config/research';
import { SIGHT } from '../src/sim/config/rules';
import { UNITS } from '../src/sim/config/units';
import {
  alliesOf,
  applyCommand,
  areAllies,
  armyDetect,
  armySight,
  blipSize,
  detectedProvinces,
  findPath,
  isArmyVisible,
  legTicks,
  radarBlips,
  unitSight,
  visibleProvinces,
  type GameState,
  type NationId,
  type UnitType,
} from '../src/sim';
import { clearArmies, landOf, landsOf, place, quietGame, run, setWar, world } from './helpers';

function research(state: GameState, nation: NationId, tech: string) {
  state.nations[nation].research.completed.push(tech);
}

describe('fog of war', () => {
  it('a nation sees its own land and one province beyond its borders', () => {
    const state = quietGame();
    clearArmies(state);
    const seen = visibleProvinces(state, world, 'fr');
    for (const id of world.provinceIds) if (state.provinces[id].owner === 'fr') expect(seen.has(id)).toBe(true);
    // Across the Rhine, the Alps and the Strait of Dover...
    for (const id of ['de-baden', 'de-hesse', 'it-piedmont', 'uk-london', 'be-brussels']) expect(seen.has(id)).toBe(true);
    // ...but not deeper.
    for (const id of ['de-bavaria', 'de-berlin', 'it-rome', 'pl-warsaw', 'es-madrid']) expect(seen.has(id)).toBe(false);
  });

  it('sight is reckoned over the land: seeing a land next to a city shows the city, and a city looks out from its lands', () => {
    const state = quietGame();
    clearArmies(state);
    // Belgium holds only Brussels and the lands round it: from there it sees the lands next door and the
    // cities they lie round, but no further.
    const seen = visibleProvinces(state, world, 'be');
    for (const id of [landOf('fr-nord', 'be-brussels'), 'fr-nord', landOf('de-ruhr', 'be-brussels'), 'de-ruhr', 'nl-amsterdam']) expect(seen.has(id)).toBe(true);
    expect(seen.has('fr-paris')).toBe(false);
    // A city cut off inside enemy land still looks out over the lands next to its own.
    for (const land of landsOf('be-brussels')) state.provinces[land].owner = 'fr';
    expect(visibleProvinces(state, world, 'be').has('fr-nord')).toBe(true);
  });

  it('sight is a property of each unit type: most see only where their army stands, scouts further', () => {
    for (const type of Object.keys(UNITS) as UnitType[]) {
      expect(unitSight(type)).toBe(UNITS[type].recon ? 1 : SIGHT.unit);
    }
    expect(SIGHT.unit).toBe(0);
    const state = quietGame();
    clearArmies(state);
    // An army sees as far as its best-sighted unit.
    expect(armySight(place(state, 'fr', 'fr-paris', { infantry: 3 }))).toBe(0);
    expect(armySight(place(state, 'fr', 'fr-paris', { infantry: 3, cavalry: 1 }))).toBe(1);
    expect(armyDetect(place(state, 'fr', 'fr-paris', { infantry: 3 }))).toBe(1);
    expect(armyDetect(place(state, 'fr', 'fr-paris', { armouredCar: 1 }))).toBe(2);
  });

  it('an army sees only where it stands: in a city, the city and its lands; reconnaissance a step further', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const before = visibleProvinces(state, world, 'fr');
    expect(before.has('de-saxony')).toBe(false);
    place(state, 'fr', 'de-saxony', { infantry: 2 });
    let seen = visibleProvinces(state, world, 'fr');
    const added = [...seen].filter((id) => !before.has(id)).sort();
    expect(added).toEqual(['de-saxony', ...landsOf('de-saxony')].sort());
    for (const id of ['de-berlin', landOf('de-berlin', 'de-saxony'), 'cz-prague']) expect(seen.has(id)).toBe(false);

    // On a land, its own land and the city it lies round, not the lands beside it.
    clearArmies(state);
    const land = landOf('de-saxony', 'de-berlin');
    place(state, 'fr', land, { infantry: 2 });
    seen = visibleProvinces(state, world, 'fr');
    expect([...seen].filter((id) => !before.has(id)).sort()).toEqual([land, 'de-saxony'].sort());

    // Cavalry sees the region and one step beyond it, over open land.
    clearArmies(state);
    place(state, 'fr', 'de-saxony', { infantry: 1, cavalry: 1 });
    seen = visibleProvinces(state, world, 'fr');
    for (const id of ['de-saxony', ...landsOf('de-saxony'), landOf('de-berlin', 'de-saxony'), 'de-berlin', 'cz-prague']) expect(seen.has(id)).toBe(true);
    expect(seen.has('pl-warsaw')).toBe(false);
  });

  it('beyond sight, the radar shows unknown armies as blips of a rough size and nothing more', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    place(state, 'fr', 'de-saxony', { infantry: 2 });
    const seen = visibleProvinces(state, world, 'fr');
    const detected = detectedProvinces(state, world, 'fr');
    for (const id of seen) expect(detected.has(id)).toBe(true);
    // The army's radar reaches a step further than held land's sight: Berlin, next door, but not Warsaw.
    expect(seen.has('de-berlin')).toBe(false);
    expect(detected.has('de-berlin')).toBe(true);
    expect(detected.has(landOf('de-berlin', 'de-saxony'))).toBe(true);
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
    place(other, 'fr', 'de-saxony', { infantry: 2 });
    place(other, 'pl', 'de-berlin', { cavalry: 9 });
    expect(radarBlips(other, world, 'fr')).toEqual(radarBlips(state, world, 'fr'));
    expect([blipSize(1), blipSize(SIGHT.blipUnits.medium - 1), blipSize(SIGHT.blipUnits.medium), blipSize(SIGHT.blipUnits.large)]).toEqual([
      'small',
      'small',
      'medium',
      'large',
    ]);
    // Armies in sight are seen, not blips, and nobody picks up their own armies.
    place(state, 'de', 'de-saxony', { infantry: 1 });
    expect(radarBlips(state, world, 'fr').map((b) => b.province)).toEqual(['de-berlin']);
    expect(radarBlips(state, world, 'de')).toEqual([]);
  });

  it('held land picks up blips two steps out; without an army the radar ends there', () => {
    const state = quietGame();
    clearArmies(state);
    const seen = visibleProvinces(state, world, 'fr');
    const detected = detectedProvinces(state, world, 'fr');
    // Over the Rhine France sees Hesse; one step beyond, it only detects.
    expect(seen.has('de-hesse')).toBe(true);
    expect(seen.has('de-saxony')).toBe(false);
    expect(detected.has('de-saxony')).toBe(true);
    expect(detected.has('de-berlin')).toBe(false);
    place(state, 'de', 'de-saxony', { infantry: 5 });
    place(state, 'de', 'de-berlin', { infantry: 5 });
    expect(radarBlips(state, world, 'fr')).toEqual([{ province: 'de-saxony', size: 'medium' }]);
  });

  it('mountains and narrow seas are seen across, not beyond; wide seas hide everything', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'it', 'fr');
    place(state, 'it', 'it-piedmont', { infantry: 1, cavalry: 1 });
    let seen = visibleProvinces(state, world, 'it');
    // Scouts in Piedmont see over the Alps into the Rhône valley and Provence...
    for (const id of ['fr-rhone', 'fr-midi', 'ch-bern']) expect(seen.has(id)).toBe(true);
    // ...but no further, while over open land they would see two provinces out.
    for (const id of ['fr-centre', 'fr-aquitaine', 'fr-east', 'de-baden']) expect(seen.has(id)).toBe(false);
    // Sardinia does not watch Barcelona across 1,000 km of sea, nor Rome Split across the Adriatic.
    for (const id of ['es-catalonia', 'hr-dalmatia']) expect(seen.has(id)).toBe(false);
    // The Channel is narrow enough: London sees the French coast, not what lies behind it.
    seen = visibleProvinces(state, world, 'uk');
    expect(seen.has('fr-normandy')).toBe(true);
    expect(seen.has('fr-paris')).toBe(false);
  });

  it('a marching army comes into sight at the nearer end of its road', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    place(state, 'fr', 'de-hesse', { infantry: 1 });
    const seen = () => visibleProvinces(state, world, 'fr');
    // A road from German land out of sight into German land in sight, between two regions (so not
    // the way through a city).
    const now = seen();
    const road = world.scenario.connections.find(
      (c) =>
        c.kind === 'land' &&
        world.regionOf[c.a] !== world.regionOf[c.b] &&
        world.provinces[c.a].core === 'de' &&
        world.provinces[c.b].core === 'de' &&
        now.has(c.a) !== now.has(c.b),
    )!;
    const [from, to] = now.has(road.a) ? [road.b, road.a] : [road.a, road.b];
    const german = place(state, 'de', from, { infantry: 1 });
    expect(findPath(state, world, german, from, to)!.path).toEqual([to]);
    expect(isArmyVisible(german, 'fr', seen())).toBe(false);
    const ticks = legTicks(state, world, german, from, to);
    expect(applyCommand(state, world, { type: 'move', nation: 'de', armyId: german.id, to }).ok).toBe(true);
    run(state, Math.floor(ticks / 2) - 1);
    expect(isArmyVisible(german, 'fr', seen())).toBe(false);
    run(state, 2);
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
