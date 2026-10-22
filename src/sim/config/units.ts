// Unit roster. Attack values are used by the side that entered the province,
// defence values by the side that owns it. "soft" applies against unarmoured
// targets and "hard" against armoured ones; a target's hardness blends the two.
// Each type has up to three equipment generations (1914, interwar, 1940);
// research unlocks types and upgrades existing units in place.
import type { BuildingType, ConnectionKind, PartialResources, Terrain, UnitClass, UnitGen, UnitType } from '../types';

export interface CombatValues {
  soft: number;
  hard: number;
}

export interface UnitModel {
  hp: number;
  attack: CombatValues;
  defence: CombatValues;
  /** Kilometres travelled per tick (game-second) on open ground. */
  speedKmPerTick: number;
  /** Overrides the type's hardness for this generation (e.g. half-tracks). */
  hardness?: number;
}

export interface TerrainModifier {
  attack?: number;
  defence?: number;
}

export interface UnitConfig {
  /** Generic English name; nations field their own named designs. */
  name: string;
  short: string;
  class: UnitClass;
  /** One-line role summary. */
  role: string;
  description: string;
  /** 0 = soft target, 1 = fully armoured. Damage taken blends soft and hard attack values. */
  hardness: number;
  models: Partial<Record<UnitGen, UnitModel>>;
  cost: PartialResources;
  recruitSeconds: number;
  upkeepPerMinute: PartialResources;
  /** Every listed building must stand in the recruiting province. */
  requires: BuildingType[];
  terrain: Partial<Record<Terrain, TerrainModifier>>;
  /** Movement time multipliers that replace the defaults for this unit. */
  movement?: { connection?: Partial<Record<ConnectionKind, number>>; terrain?: Partial<Record<Terrain, number>> };
  /** Relative chance of being shot at. Support units fight from the second line. */
  targetWeight: number;
  /** Above 1 loses morale more slowly. */
  resilience: number;
  /** Multiplies the morale damage this unit inflicts. */
  shock: number;
  /** Share of a defender's fortification bonus that this unit's army ignores. */
  fortIgnore?: number;
  /** Reconnaissance: +10% army damage, faster capture, cheaper retreats. */
  recon?: boolean;
}

/** Wheeled and tracked vehicles bog down off-road. */
const VEHICLE_MOVE = { connection: { mountain: 1.9 }, terrain: { mountains: 1.7, marsh: 1.6, forest: 1.25, hills: 1.2 } };
const TANK_TERRAIN: UnitConfig['terrain'] = {
  plains: { attack: 1.15, defence: 1.1 },
  forest: { attack: 0.7, defence: 0.8 },
  hills: { attack: 0.85 },
  mountains: { attack: 0.4, defence: 0.6 },
  urban: { attack: 0.6, defence: 0.8 },
  marsh: { attack: 0.5, defence: 0.6 },
};

export const UNITS: Record<UnitType, UnitConfig> = {
  infantry: {
    name: 'Line Infantry',
    short: 'INF',
    class: 'infantry',
    role: 'Holds the line',
    description: 'Cheap and sturdy. Strong defenders, especially in rough or urban terrain. Little punch against armour.',
    hardness: 0,
    models: {
      ww1: { hp: 100, attack: { soft: 6, hard: 1.5 }, defence: { soft: 10, hard: 4 }, speedKmPerTick: 4.0 },
      interwar: { hp: 110, attack: { soft: 7.5, hard: 2.5 }, defence: { soft: 12, hard: 5 }, speedKmPerTick: 4.2 },
      ww2: { hp: 120, attack: { soft: 9, hard: 3.5 }, defence: { soft: 14, hard: 6 }, speedKmPerTick: 4.4 },
    },
    cost: { money: 120, materials: 30, manpower: 30 },
    recruitSeconds: 60,
    upkeepPerMinute: { money: 3 },
    requires: ['barracks'],
    terrain: {
      forest: { defence: 1.2 },
      hills: { defence: 1.2 },
      mountains: { defence: 1.4, attack: 1.1 },
      urban: { defence: 1.35 },
      marsh: { defence: 1.1 },
    },
    targetWeight: 1,
    resilience: 1,
    shock: 1,
  },
  stormtroopers: {
    name: 'Assault Infantry',
    short: 'AST',
    class: 'infantry',
    role: 'Breaks fortified lines',
    description:
      'Elite infiltration troops. Hit hard, ignore part of a fortification bonus, keep their nerve and shake the enemy. Need a Military Academy.',
    hardness: 0,
    models: {
      ww1: { hp: 90, attack: { soft: 9, hard: 2.5 }, defence: { soft: 8, hard: 3 }, speedKmPerTick: 4.0 },
      interwar: { hp: 100, attack: { soft: 11, hard: 3.5 }, defence: { soft: 9, hard: 4 }, speedKmPerTick: 4.2 },
      ww2: { hp: 110, attack: { soft: 13, hard: 5 }, defence: { soft: 11, hard: 5 }, speedKmPerTick: 4.4 },
    },
    cost: { money: 170, materials: 40, manpower: 35 },
    recruitSeconds: 80,
    upkeepPerMinute: { money: 4.5 },
    requires: ['barracks', 'academy'],
    terrain: {
      urban: { attack: 1.25, defence: 1.2 },
      forest: { attack: 1.15, defence: 1.1 },
      hills: { defence: 1.1 },
      mountains: { defence: 1.2 },
    },
    targetWeight: 1,
    resilience: 1.3,
    shock: 1.4,
    fortIgnore: 0.35,
  },
  mountain: {
    name: 'Mountain Troops',
    short: 'MTN',
    class: 'infantry',
    role: 'Masters of the high passes',
    description: 'Trained climbers. Formidable in mountains and hills and fast over mountain passes; ordinary on open ground.',
    hardness: 0,
    models: {
      ww1: { hp: 100, attack: { soft: 6, hard: 1.5 }, defence: { soft: 10, hard: 4 }, speedKmPerTick: 3.8 },
      interwar: { hp: 110, attack: { soft: 7.5, hard: 2.5 }, defence: { soft: 12, hard: 5 }, speedKmPerTick: 4.0 },
      ww2: { hp: 120, attack: { soft: 9, hard: 3.5 }, defence: { soft: 14, hard: 6 }, speedKmPerTick: 4.2 },
    },
    cost: { money: 150, materials: 35, manpower: 30 },
    recruitSeconds: 75,
    upkeepPerMinute: { money: 3.5 },
    requires: ['barracks'],
    terrain: {
      mountains: { attack: 1.7, defence: 1.6 },
      hills: { attack: 1.3, defence: 1.35 },
      forest: { defence: 1.2 },
      urban: { defence: 1.2 },
      plains: { attack: 0.9 },
    },
    movement: { connection: { mountain: 1.1 }, terrain: { mountains: 1.05, hills: 1, forest: 1 } },
    targetWeight: 1,
    resilience: 1.15,
    shock: 1,
  },
  motorised: {
    name: 'Motorised Infantry',
    short: 'MOT',
    class: 'infantry',
    role: 'Infantry that keeps up with tanks',
    description: 'Lorried, later half-tracked infantry. Fast on roads and open ground, slowed by mountains and marsh. Burns fuel.',
    hardness: 0.1,
    models: {
      interwar: { hp: 110, attack: { soft: 8, hard: 2.5 }, defence: { soft: 11, hard: 4.5 }, speedKmPerTick: 7.0 },
      ww2: { hp: 130, attack: { soft: 10, hard: 5 }, defence: { soft: 13, hard: 7 }, speedKmPerTick: 8.0, hardness: 0.35 },
    },
    cost: { money: 190, materials: 70, fuel: 10, manpower: 30 },
    recruitSeconds: 80,
    upkeepPerMinute: { money: 4, fuel: 1 },
    requires: ['barracks', 'motorPool'],
    terrain: {
      plains: { attack: 1.1 },
      forest: { attack: 0.9 },
      mountains: { attack: 0.75, defence: 0.9 },
      marsh: { attack: 0.75, defence: 0.9 },
      urban: { defence: 1.2 },
    },
    movement: VEHICLE_MOVE,
    targetWeight: 1,
    resilience: 1,
    shock: 1.1,
  },
  cavalry: {
    name: 'Cavalry',
    short: 'CAV',
    class: 'mobile',
    role: 'Scouts and raiders',
    description: 'Fast horsemen. Reconnaissance for the whole army and quick captures, but fragile against machine guns and helpless against armour.',
    hardness: 0,
    models: {
      ww1: { hp: 80, attack: { soft: 7, hard: 1 }, defence: { soft: 6, hard: 1.5 }, speedKmPerTick: 6.5 },
      interwar: { hp: 85, attack: { soft: 7.5, hard: 1.5 }, defence: { soft: 6.5, hard: 2 }, speedKmPerTick: 6.8 },
      ww2: { hp: 90, attack: { soft: 8, hard: 2 }, defence: { soft: 7, hard: 2.5 }, speedKmPerTick: 7.0 },
    },
    cost: { money: 130, materials: 20, manpower: 25 },
    recruitSeconds: 60,
    upkeepPerMinute: { money: 3 },
    requires: ['barracks'],
    terrain: {
      plains: { attack: 1.25 },
      forest: { attack: 0.8 },
      hills: { attack: 0.9 },
      mountains: { attack: 0.6, defence: 0.8 },
      urban: { attack: 0.6 },
      marsh: { attack: 0.7 },
    },
    movement: { terrain: { forest: 1.2, marsh: 1.4, mountains: 1.5 } },
    targetWeight: 0.9,
    resilience: 0.9,
    shock: 1.2,
    recon: true,
  },
  armouredCar: {
    name: 'Armoured Cars',
    short: 'ARC',
    class: 'mobile',
    role: 'Fast armoured reconnaissance',
    description: 'Wheeled, lightly armoured scouts. Reconnaissance for the army, very fast on open ground, poor off-road. Burn fuel.',
    hardness: 0.55,
    models: {
      interwar: { hp: 90, attack: { soft: 8, hard: 3 }, defence: { soft: 6, hard: 3 }, speedKmPerTick: 8.5 },
      ww2: { hp: 105, attack: { soft: 10, hard: 5 }, defence: { soft: 8, hard: 5 }, speedKmPerTick: 9.5, hardness: 0.6 },
    },
    cost: { money: 190, materials: 80, fuel: 15, manpower: 15 },
    recruitSeconds: 75,
    upkeepPerMinute: { money: 4, fuel: 1.5 },
    requires: ['motorPool'],
    terrain: {
      plains: { attack: 1.15, defence: 1.05 },
      forest: { attack: 0.7, defence: 0.8 },
      mountains: { attack: 0.5, defence: 0.6 },
      urban: { attack: 0.6, defence: 0.8 },
      marsh: { attack: 0.5, defence: 0.6 },
    },
    movement: VEHICLE_MOVE,
    targetWeight: 0.9,
    resilience: 0.9,
    shock: 1,
    recon: true,
  },
  artillery: {
    name: 'Field Artillery',
    short: 'ART',
    class: 'support',
    role: 'Firepower from the second line',
    description: 'Heavy soft firepower that shakes defenders. Fights from behind the line, so it is rarely hit while infantry screens it.',
    hardness: 0,
    models: {
      ww1: { hp: 70, attack: { soft: 14, hard: 4 }, defence: { soft: 5, hard: 2 }, speedKmPerTick: 3.2 },
      interwar: { hp: 75, attack: { soft: 16.5, hard: 5.5 }, defence: { soft: 6, hard: 2.5 }, speedKmPerTick: 3.7 },
      ww2: { hp: 80, attack: { soft: 19, hard: 7 }, defence: { soft: 7, hard: 3 }, speedKmPerTick: 4.2 },
    },
    cost: { money: 200, materials: 90, manpower: 25 },
    recruitSeconds: 90,
    upkeepPerMinute: { money: 5 },
    requires: ['armsWorks'],
    terrain: {
      hills: { attack: 1.15 },
      mountains: { attack: 0.8 },
      forest: { attack: 0.9 },
    },
    targetWeight: 0.35,
    resilience: 0.9,
    shock: 1.25,
  },
  heavyArtillery: {
    name: 'Heavy Siege Artillery',
    short: 'HVY',
    class: 'support',
    role: 'Smashes fortresses',
    description: 'Huge howitzers and mortars. Halve the enemy fortification bonus and devastate defenders, but crawl along and cannot defend themselves.',
    hardness: 0,
    models: {
      ww1: { hp: 75, attack: { soft: 20, hard: 6 }, defence: { soft: 3, hard: 1 }, speedKmPerTick: 2.2 },
      interwar: { hp: 80, attack: { soft: 23, hard: 8 }, defence: { soft: 3.5, hard: 1.5 }, speedKmPerTick: 2.7 },
      ww2: { hp: 90, attack: { soft: 27, hard: 10 }, defence: { soft: 4, hard: 2 }, speedKmPerTick: 3.4 },
    },
    cost: { money: 300, materials: 160, manpower: 30 },
    recruitSeconds: 120,
    upkeepPerMinute: { money: 7 },
    requires: ['armsWorks'],
    terrain: {
      hills: { attack: 1.1 },
      mountains: { attack: 0.7 },
      forest: { attack: 0.85 },
      urban: { attack: 1.15 },
    },
    movement: { connection: { mountain: 1.9 } },
    targetWeight: 0.3,
    resilience: 0.85,
    shock: 1.4,
    fortIgnore: 0.5,
  },
  antiTank: {
    name: 'Anti-Tank Guns',
    short: 'AT',
    class: 'support',
    role: 'Stops armour cold',
    description: 'Cheap, low-slung guns. Devastating against armour, especially when defending in forests and towns. Little use against infantry.',
    hardness: 0,
    models: {
      interwar: { hp: 60, attack: { soft: 3, hard: 12 }, defence: { soft: 4, hard: 16 }, speedKmPerTick: 3.6 },
      ww2: { hp: 70, attack: { soft: 4, hard: 18 }, defence: { soft: 5, hard: 24 }, speedKmPerTick: 4.2 },
    },
    cost: { money: 150, materials: 70, manpower: 20 },
    recruitSeconds: 60,
    upkeepPerMinute: { money: 3 },
    requires: ['armsWorks'],
    terrain: {
      forest: { defence: 1.25 },
      urban: { defence: 1.25 },
      hills: { defence: 1.1 },
      plains: { defence: 1.05 },
    },
    targetWeight: 0.5,
    resilience: 1,
    shock: 1,
  },
  lightTank: {
    name: 'Light Tanks',
    short: 'LTK',
    class: 'armour',
    role: 'Cheap, fast armour',
    description: 'Small tanks. Faster and cheaper than battle tanks, still armoured against rifles, but outgunned by real armour and anti-tank guns.',
    hardness: 0.8,
    models: {
      ww1: { hp: 90, attack: { soft: 9, hard: 4 }, defence: { soft: 6, hard: 4 }, speedKmPerTick: 3.6 },
      interwar: { hp: 110, attack: { soft: 11, hard: 6 }, defence: { soft: 7, hard: 6 }, speedKmPerTick: 6.5 },
      ww2: { hp: 130, attack: { soft: 13, hard: 9 }, defence: { soft: 9, hard: 8 }, speedKmPerTick: 7.5, hardness: 0.85 },
    },
    cost: { money: 220, materials: 100, fuel: 25, manpower: 15 },
    recruitSeconds: 90,
    upkeepPerMinute: { money: 4, fuel: 2 },
    requires: ['tankWorks'],
    terrain: { ...TANK_TERRAIN, forest: { attack: 0.75, defence: 0.85 } },
    movement: { connection: { mountain: 1.8 }, terrain: { marsh: 1.5, mountains: 1.6, forest: 1.15 } },
    targetWeight: 1,
    resilience: 1.05,
    shock: 1.2,
  },
  tank: {
    name: 'Battle Tanks',
    short: 'TNK',
    class: 'armour',
    role: 'Armoured breakthrough',
    description: 'The main armoured fist. Shrugs off rifle fire on open ground and breaks morale, but struggles in forests, mountains, cities and marsh. Burns fuel.',
    hardness: 0.9,
    models: {
      ww1: { hp: 130, attack: { soft: 12, hard: 7 }, defence: { soft: 7, hard: 6 }, speedKmPerTick: 3.0 },
      interwar: { hp: 150, attack: { soft: 15, hard: 11 }, defence: { soft: 9, hard: 9 }, speedKmPerTick: 5.0 },
      ww2: { hp: 170, attack: { soft: 18, hard: 15 }, defence: { soft: 11, hard: 12 }, speedKmPerTick: 6.5 },
    },
    cost: { money: 320, materials: 150, fuel: 40, manpower: 20 },
    recruitSeconds: 120,
    upkeepPerMinute: { money: 6, fuel: 3 },
    requires: ['tankWorks'],
    terrain: TANK_TERRAIN,
    movement: { connection: { mountain: 1.8 }, terrain: { marsh: 1.5, mountains: 1.6, forest: 1.2 } },
    targetWeight: 1,
    resilience: 1.1,
    shock: 1.4,
  },
  heavyTank: {
    name: 'Heavy Tanks',
    short: 'HTK',
    class: 'armour',
    role: 'Unstoppable, unhurried',
    description: 'Land battleships. Thick armour, huge guns and unshakeable crews, but slow, thirsty and expensive.',
    hardness: 0.95,
    models: {
      interwar: { hp: 230, attack: { soft: 16, hard: 12 }, defence: { soft: 13, hard: 13 }, speedKmPerTick: 2.8 },
      ww2: { hp: 260, attack: { soft: 22, hard: 20 }, defence: { soft: 16, hard: 18 }, speedKmPerTick: 4.2 },
    },
    cost: { money: 480, materials: 260, fuel: 60, manpower: 25 },
    recruitSeconds: 180,
    upkeepPerMinute: { money: 9, fuel: 5 },
    requires: ['tankWorks'],
    terrain: {
      plains: { attack: 1.1, defence: 1.15 },
      forest: { attack: 0.7, defence: 0.85 },
      hills: { attack: 0.85, defence: 1.05 },
      mountains: { attack: 0.35, defence: 0.6 },
      urban: { attack: 0.7, defence: 0.9 },
      marsh: { attack: 0.4, defence: 0.5 },
    },
    movement: { connection: { mountain: 2.0 }, terrain: { marsh: 1.8, mountains: 1.8, forest: 1.25, hills: 1.15 } },
    targetWeight: 1,
    resilience: 1.5,
    shock: 1.6,
  },
  tankDestroyer: {
    name: 'Tank Destroyers',
    short: 'TD',
    class: 'armour',
    role: 'Armoured anti-tank hunters',
    description: 'Turretless armoured guns. Superb at killing tanks, especially from defensive positions; ordinary against infantry.',
    hardness: 0.85,
    models: {
      ww2: { hp: 150, attack: { soft: 10, hard: 22 }, defence: { soft: 9, hard: 26 }, speedKmPerTick: 5.5 },
    },
    cost: { money: 300, materials: 160, fuel: 30, manpower: 15 },
    recruitSeconds: 110,
    upkeepPerMinute: { money: 5, fuel: 2 },
    requires: ['tankWorks'],
    terrain: {
      plains: { attack: 1.1, defence: 1.15 },
      forest: { attack: 0.8, defence: 1.1 },
      hills: { defence: 1.1 },
      mountains: { attack: 0.45, defence: 0.7 },
      urban: { attack: 0.6, defence: 0.9 },
      marsh: { attack: 0.5, defence: 0.6 },
    },
    movement: { connection: { mountain: 1.8 }, terrain: { marsh: 1.5, mountains: 1.6, forest: 1.2 } },
    targetWeight: 1,
    resilience: 1.15,
    shock: 1.1,
  },
};

export const UNITS_BY_CLASS: Record<UnitClass, UnitType[]> = {
  infantry: ['infantry', 'stormtroopers', 'mountain', 'motorised'],
  mobile: ['cavalry', 'armouredCar'],
  support: ['artillery', 'heavyArtillery', 'antiTank'],
  armour: ['lightTank', 'tank', 'heavyTank', 'tankDestroyer'],
};

/** Year each equipment generation stands for. */
export const GEN_YEAR: Record<UnitGen, string> = { ww1: '1914', interwar: '1928', ww2: '1940' };

/** First generation in which a type exists. */
export function baseGen(type: UnitType): UnitGen {
  const m = UNITS[type].models;
  return m.ww1 ? 'ww1' : m.interwar ? 'interwar' : 'ww2';
}

/** Units whose upkeep includes fuel slow down and fight worse in a fuel shortage. */
export function usesFuel(type: UnitType): boolean {
  return (UNITS[type].upkeepPerMinute.fuel ?? 0) > 0;
}

/** Generic English formation names, used for neutral garrisons. */
export const GENERIC_FORMATIONS: Record<UnitType, string> = {
  infantry: '{ord} Infantry Brigade',
  stormtroopers: '{ord} Assault Battalion',
  mountain: '{ord} Mountain Battalion',
  motorised: '{ord} Motorised Battalion',
  cavalry: '{ord} Cavalry Squadron',
  armouredCar: '{ord} Armoured Car Squadron',
  artillery: '{ord} Artillery Regiment',
  heavyArtillery: '{ord} Fortress Artillery',
  antiTank: '{ord} Anti-Tank Company',
  lightTank: '{ord} Light Tank Company',
  tank: '{ord} Tank Company',
  heavyTank: '{ord} Heavy Tank Company',
  tankDestroyer: '{ord} Tank Destroyer Company',
};

export const VETERANCY = {
  /** Minimum XP for Green, Regular, Veteran, Elite. */
  thresholds: [0, 1, 3, 6] as const,
  names: ['Green', 'Regular', 'Veteran', 'Elite'] as const,
  damage: [0.9, 1, 1.1, 1.2] as const,
  resilience: [0.9, 1, 1.1, 1.25] as const,
  maxXp: 8,
  /** XP for each combat round fought. */
  perRound: 0.08,
  /** XP for every survivor of a won battle. */
  perVictory: 0.4,
  /** Starting armies and neutral garrisons are trained regulars. */
  startingXp: 1,
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
  /** Army damage bonus when it contains a reconnaissance unit. */
  reconDamage: 1.1,
  /** Capture time multiplier with a reconnaissance unit present. */
  reconCapture: 0.7,
  /** Share of its damage an army loses fighting straight off a sea crossing (before tech). */
  amphibiousPenalty: 0.25,
  /** Manpower refunded when a unit is disbanded (fraction of its cost). */
  disbandManpowerRefund: 0.5,
};
