// Research tree: WWI baseline -> Interwar -> WWII upgrades.
// Effects are declarative so the UI can describe them and the sim can apply them.
import type { PartialResources, ResourceKey, TechId, UnitType } from '../types';

export type TechEffect =
  | { kind: 'production'; resource: ResourceKey; mult: number }
  | { kind: 'unitStat'; unit: UnitType | 'all'; stat: 'attack' | 'defence' | 'speed'; mult: number }
  | { kind: 'unitModel'; unit: UnitType; model: 'ww2' }
  | { kind: 'recruitTime'; mult: number }
  | { kind: 'recruitCost'; resource: ResourceKey; mult: number }
  | { kind: 'constructionTime'; mult: number }
  | { kind: 'fortification'; mult: number }
  | { kind: 'syntheticFuel' }
  | { kind: 'combinedArms'; mult: number };

export interface TechConfig {
  id: TechId;
  name: string;
  tier: 1 | 2 | 3;
  description: string;
  requires: TechId[];
  cost: PartialResources;
  seconds: number;
  effects: TechEffect[];
}

export const TECHS: TechConfig[] = [
  // Tier 1 — Great War refinements
  {
    id: 'industrialMobilisation',
    name: 'Industrial Mobilisation',
    tier: 1,
    description: 'Total-war economy: +10% money, +20% materials.',
    requires: [],
    cost: { money: 500, materials: 150 },
    seconds: 180,
    effects: [
      { kind: 'production', resource: 'money', mult: 1.1 },
      { kind: 'production', resource: 'materials', mult: 1.2 },
    ],
  },
  {
    id: 'lightMachineGuns',
    name: 'Light Machine Guns',
    tier: 1,
    description: 'Squad automatic weapons: infantry +15% attack and defence.',
    requires: [],
    cost: { money: 400, materials: 120 },
    seconds: 150,
    effects: [
      { kind: 'unitStat', unit: 'infantry', stat: 'attack', mult: 1.15 },
      { kind: 'unitStat', unit: 'infantry', stat: 'defence', mult: 1.15 },
    ],
  },
  {
    id: 'indirectFire',
    name: 'Indirect Fire Doctrine',
    tier: 1,
    description: 'Map-predicted barrages: artillery +20% attack.',
    requires: [],
    cost: { money: 400, materials: 150 },
    seconds: 150,
    effects: [{ kind: 'unitStat', unit: 'artillery', stat: 'attack', mult: 1.2 }],
  },
  {
    id: 'motorTransport',
    name: 'Motor Transport',
    tier: 1,
    description: 'Lorries replace horses: all units move 15% faster.',
    requires: [],
    cost: { money: 450, materials: 150, fuel: 30 },
    seconds: 180,
    effects: [{ kind: 'unitStat', unit: 'all', stat: 'speed', mult: 1.15 }],
  },
  // Tier 2 — Interwar developments
  {
    id: 'syntheticFuel',
    name: 'Synthetic Fuel',
    tier: 2,
    description: 'Coal liquefaction: refineries work without oil fields; +15% fuel.',
    requires: ['industrialMobilisation'],
    cost: { money: 700, materials: 300 },
    seconds: 240,
    effects: [{ kind: 'syntheticFuel' }, { kind: 'production', resource: 'fuel', mult: 1.15 }],
  },
  {
    id: 'assemblyLine',
    name: 'Assembly Line',
    tier: 2,
    description: 'Mass production: recruitment 25% faster, units cost 15% fewer materials.',
    requires: ['industrialMobilisation'],
    cost: { money: 700, materials: 300 },
    seconds: 240,
    effects: [
      { kind: 'recruitTime', mult: 0.75 },
      { kind: 'recruitCost', resource: 'materials', mult: 0.85 },
    ],
  },
  {
    id: 'fieldRadio',
    name: 'Field Radio',
    tier: 2,
    description: 'Coordinated formations: all units +10% attack.',
    requires: ['motorTransport'],
    cost: { money: 650, materials: 250 },
    seconds: 240,
    effects: [{ kind: 'unitStat', unit: 'all', stat: 'attack', mult: 1.1 }],
  },
  {
    id: 'motorisedInfantry',
    name: 'Motorised Infantry',
    tier: 2,
    description: 'Infantry ride trucks: infantry +30% speed.',
    requires: ['motorTransport', 'lightMachineGuns'],
    cost: { money: 600, materials: 250, fuel: 40 },
    seconds: 210,
    effects: [{ kind: 'unitStat', unit: 'infantry', stat: 'speed', mult: 1.3 }],
  },
  {
    id: 'fortificationEngineering',
    name: 'Fortification Engineering',
    tier: 2,
    description: 'Concrete bunker lines: fortifications 50% more effective; construction 20% faster.',
    requires: ['lightMachineGuns'],
    cost: { money: 550, materials: 300 },
    seconds: 210,
    effects: [
      { kind: 'fortification', mult: 1.5 },
      { kind: 'constructionTime', mult: 0.8 },
    ],
  },
  // Tier 3 — WWII upgrades
  {
    id: 'ww2Infantry',
    name: 'Modern Infantry Kit',
    tier: 3,
    description: 'Semi-automatic rifles and SMGs: infantry upgrade to the 1940 model.',
    requires: ['lightMachineGuns', 'assemblyLine'],
    cost: { money: 1000, materials: 450 },
    seconds: 300,
    effects: [{ kind: 'unitModel', unit: 'infantry', model: 'ww2' }],
  },
  {
    id: 'ww2Artillery',
    name: 'Motorised Howitzers',
    tier: 3,
    description: 'Truck-towed howitzers: artillery upgrade to the 1940 model.',
    requires: ['indirectFire', 'motorTransport'],
    cost: { money: 1000, materials: 500 },
    seconds: 300,
    effects: [{ kind: 'unitModel', unit: 'artillery', model: 'ww2' }],
  },
  {
    id: 'ww2Tanks',
    name: 'Medium Tanks',
    tier: 3,
    description: 'Fast, radio-equipped medium tanks: tanks upgrade to the 1940 model.',
    requires: ['fieldRadio', 'industrialMobilisation'],
    cost: { money: 1200, materials: 600, fuel: 80 },
    seconds: 360,
    effects: [{ kind: 'unitModel', unit: 'tank', model: 'ww2' }],
  },
  {
    id: 'combinedArms',
    name: 'Combined Arms Doctrine',
    tier: 3,
    description: 'Armies containing infantry, artillery and tanks gain +20% attack.',
    requires: ['ww2Tanks', 'motorisedInfantry'],
    cost: { money: 1200, materials: 500 },
    seconds: 360,
    effects: [{ kind: 'combinedArms', mult: 1.2 }],
  },
];

export const TECH_BY_ID: Record<TechId, TechConfig> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

/** Era thresholds shown in the UI and used in scoring. */
export const ERA_RULES = {
  interwarTier2Count: 3,
  ww2Techs: ['ww2Infantry', 'ww2Artillery', 'ww2Tanks'] as TechId[],
};
