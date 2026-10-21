// Unit balance. Attack values are used by the side that entered the province,
// defence values by the side that owns it. "soft" applies against unarmoured
// targets, "hard" against armoured ones (tanks).
import type { BuildingType, PartialResources, Terrain, UnitType } from '../types';

export interface CombatValues {
  soft: number;
  hard: number;
}

export interface UnitModel {
  name: string;
  hp: number;
  attack: CombatValues;
  defence: CombatValues;
  /** Kilometres travelled per tick (game-second) on open ground. */
  speedKmPerTick: number;
}

export interface TerrainModifier {
  attack?: number;
  defence?: number;
}

export interface UnitConfig {
  name: string;
  description: string;
  armoured: boolean;
  /** Models by era; research upgrades a nation's units from ww1 to ww2. */
  models: { ww1: UnitModel; ww2: UnitModel };
  cost: PartialResources;
  recruitSeconds: number;
  upkeepPerMinute: PartialResources;
  requires: BuildingType;
  terrain: Partial<Record<Terrain, TerrainModifier>>;
}

export const UNITS: Record<UnitType, UnitConfig> = {
  infantry: {
    name: 'Infantry',
    description: 'Cheap and sturdy. Strong defenders, especially in rough or urban terrain. Weak against armour.',
    armoured: false,
    models: {
      ww1: {
        name: 'Rifle Infantry (1914)',
        hp: 100,
        attack: { soft: 6, hard: 1.5 },
        defence: { soft: 10, hard: 4 },
        speedKmPerTick: 4.0,
      },
      ww2: {
        name: 'Infantry Division (1940)',
        hp: 120,
        attack: { soft: 9, hard: 3.5 },
        defence: { soft: 14, hard: 6 },
        speedKmPerTick: 4.4,
      },
    },
    cost: { money: 120, materials: 30, manpower: 30 },
    recruitSeconds: 60,
    upkeepPerMinute: { money: 3 },
    requires: 'barracks',
    terrain: {
      forest: { defence: 1.2 },
      hills: { defence: 1.2 },
      mountains: { defence: 1.4, attack: 1.1 },
      urban: { defence: 1.35 },
      marsh: { defence: 1.1 },
    },
  },
  artillery: {
    name: 'Artillery',
    description: 'Heavy firepower for breaking defences. Fragile when attacked and slow to move.',
    armoured: false,
    models: {
      ww1: {
        name: 'Field Guns (1914)',
        hp: 70,
        attack: { soft: 14, hard: 4 },
        defence: { soft: 5, hard: 2 },
        speedKmPerTick: 3.2,
      },
      ww2: {
        name: 'Motorised Howitzers (1940)',
        hp: 80,
        attack: { soft: 19, hard: 7 },
        defence: { soft: 7, hard: 3 },
        speedKmPerTick: 4.2,
      },
    },
    cost: { money: 200, materials: 90, manpower: 25 },
    recruitSeconds: 90,
    upkeepPerMinute: { money: 5 },
    requires: 'armsWorks',
    terrain: {
      hills: { attack: 1.15 },
      mountains: { attack: 0.8 },
      forest: { attack: 0.9 },
    },
  },
  tank: {
    name: 'Tanks',
    description: 'Armoured breakthrough units. Shrug off infantry fire on open ground but struggle in forests, mountains, cities and marshes. Burn fuel.',
    armoured: true,
    models: {
      ww1: {
        name: 'Rhomboid Tanks (1917)',
        hp: 130,
        attack: { soft: 12, hard: 7 },
        defence: { soft: 7, hard: 6 },
        speedKmPerTick: 3.0,
      },
      ww2: {
        name: 'Medium Tanks (1940)',
        hp: 170,
        attack: { soft: 18, hard: 15 },
        defence: { soft: 10, hard: 11 },
        speedKmPerTick: 6.5,
      },
    },
    cost: { money: 320, materials: 150, fuel: 40, manpower: 20 },
    recruitSeconds: 120,
    upkeepPerMinute: { money: 6, fuel: 3 },
    requires: 'tankWorks',
    terrain: {
      plains: { attack: 1.15, defence: 1.1 },
      forest: { attack: 0.7, defence: 0.8 },
      hills: { attack: 0.85 },
      mountains: { attack: 0.4, defence: 0.6 },
      urban: { attack: 0.6, defence: 0.8 },
      marsh: { attack: 0.5, defence: 0.6 },
    },
  },
};

export const ARMY_RULES = {
  /** Firepower scales with strength: (base + (1 - base) * strength). */
  strengthFloor: 0.4,
  /** Random damage spread per shot (± fraction). */
  damageVariance: 0.2,
  /** Global damage multiplier for tuning battle length. */
  damageScale: 1.0,
  /** Max recruitment jobs queued per province. */
  maxRecruitQueue: 5,
  /** New recruits stop joining an army once it reaches this size. */
  maxUnitsPerArmy: 12,
};
