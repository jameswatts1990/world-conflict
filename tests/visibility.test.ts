import { describe, expect, it } from 'vitest';
import { TECH_BY_ID } from '../src/sim/config/research';
import { SIGHT } from '../src/sim/config/rules';
import { alliesOf, applyCommand, areAllies, armySight, isArmyVisible, legTicks, visibleProvinces, type GameState, type NationId } from '../src/sim';
import { clearArmies, place, quietGame, run, setWar, world } from './helpers';

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

  it('sight is reckoned over the land: seeing a land shows its city, and a city looks out from its land', () => {
    const state = quietGame();
    clearArmies(state);
    // Belgium holds only Brussels and the land round it: from there it sees the French lands next door and
    // the cities inside them, but no further.
    const seen = visibleProvinces(state, world, 'be');
    for (const id of ['fr-nord-land', 'fr-nord', 'de-ruhr-land', 'de-ruhr', 'nl-amsterdam']) expect(seen.has(id)).toBe(true);
    expect(seen.has('fr-paris')).toBe(false);
    // A city cut off inside enemy land still looks out over the lands next to its own.
    state.provinces['be-brussels-land'].owner = 'fr';
    expect(visibleProvinces(state, world, 'be').has('fr-nord')).toBe(true);
  });

  it('armies see around them; reconnaissance units see further', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    const infantry = place(state, 'fr', 'de-hesse', { infantry: 2 });
    expect(armySight(infantry)).toBe(SIGHT.army);
    let seen = visibleProvinces(state, world, 'fr');
    expect(seen.has('de-saxony')).toBe(true);
    expect(seen.has('de-berlin')).toBe(false);

    const scouts = place(state, 'fr', 'de-hesse', { infantry: 1, cavalry: 1 });
    expect(armySight(scouts)).toBe(SIGHT.recon);
    seen = visibleProvinces(state, world, 'fr');
    expect(seen.has('de-berlin')).toBe(true); // Hesse, Saxony, Berlin
    expect(seen.has('pl-warsaw')).toBe(false); // one step too far
  });

  it('a marching army comes into sight at the nearer end of its road', () => {
    const state = quietGame();
    clearArmies(state);
    setWar(state, 'fr', 'de');
    place(state, 'fr', 'de-hesse', { infantry: 1 });
    const german = place(state, 'de', 'de-berlin-land', { infantry: 1 });
    const seen = () => visibleProvinces(state, world, 'fr');
    expect(isArmyVisible(german, 'fr', seen())).toBe(false);
    const ticks = legTicks(state, world, german, 'de-berlin-land', 'de-saxony-land');
    expect(applyCommand(state, world, { type: 'move', nation: 'de', armyId: german.id, to: 'de-saxony-land' }).ok).toBe(true);
    run(state, Math.floor(ticks / 2) - 1);
    expect(isArmyVisible(german, 'fr', seen())).toBe(false);
    run(state, 2);
    expect(isArmyVisible(german, 'fr', seen())).toBe(true);
    // Its owner always sees it.
    expect(isArmyVisible(german, 'de', new Set())).toBe(true);
  });

  it('allies are powers at peace with each other fighting a common enemy', () => {
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

  it('Liaison Officers show what allies see', () => {
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
    // Not from powers that are not allies.
    expect(visibleProvinces(state, world, 'fr').has('es-andalusia')).toBe(false);
    // Peace with the common enemy ends the alliance, and the shared sight with it.
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
