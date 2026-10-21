// Display names: national equipment designs, numbered formations and armies
// in each nation's own style ("12e Division d'Infanterie", "3. Armee").
import { GENERIC_FORMATIONS, GEN_YEAR, UNITS, VETERANCY } from './config/units';
import { unitGen, veterancyRank } from './queries';
import { NEUTRAL, type Army, type GameState, type OwnerId, type ProvinceId, type Unit, type UnitGen, type UnitType } from './types';
import type { World } from './world';

export function englishOrdinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
}

export function fillTemplate(template: string, n: number): string {
  return template
    .replace('{ord}', englishOrdinal(n))
    .replace('{fr-f}', n === 1 ? '1re' : `${n}e`)
    .replace('{fr-m}', n === 1 ? '1er' : `${n}e`)
    .replace('{n}', String(n));
}

export interface ModelName {
  /** National design or formation name, e.g. "Renault FT". */
  name: string;
  /** Equipment line, e.g. "The first rotating turret". */
  detail: string;
  gen: UnitGen;
  year: string;
}

/** The named design a nation fields for a unit type at a given generation. */
export function modelName(world: World, owner: OwnerId, type: UnitType, gen: UnitGen): ModelName {
  const named = owner === NEUTRAL ? undefined : world.nations[owner]?.identity.units[type]?.[gen];
  return {
    name: named?.name ?? UNITS[type].name,
    detail: named?.detail ?? `${UNITS[type].name}, ${GEN_YEAR[gen]} pattern`,
    gen,
    year: GEN_YEAR[gen],
  };
}

/** The named design a unit currently fields (research upgrades it in place). */
export function currentModel(state: GameState, world: World, owner: OwnerId, type: UnitType): ModelName {
  return modelName(world, owner, type, unitGen(state, owner, type));
}

export function formationName(world: World, owner: OwnerId, unit: Unit): string {
  const template = owner === NEUTRAL ? GENERIC_FORMATIONS[unit.type] : world.nations[owner].identity.formations[unit.type];
  return fillTemplate(template, unit.serial);
}

export function armyName(world: World, army: Army, province?: ProvinceId): string {
  if (army.owner === NEUTRAL) {
    const state = world.provinces[province ?? army.province]?.neutralState;
    return state ? `${state} garrison` : 'Neutral garrison';
  }
  return fillTemplate(world.nations[army.owner].identity.army, army.serial);
}

export function rankName(xp: number): string {
  return VETERANCY.names[veterancyRank(xp)];
}
