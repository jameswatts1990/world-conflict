// Turns a theatre's province rows into scenario data. A row says what a
// province is (owner, terrain, city, role); the owner's power tier (see
// config/powers.ts) decides the rest: output, objective value, the capital's
// city size, and the starting buildings and army. Shapes live separately in
// src/assets/map/map.topo.json, keyed by the same ids.
import { POWERS } from '../config/powers';
import {
  NEUTRAL,
  UNIT_TYPES,
  type Article,
  type BuildingType,
  type CityDef,
  type CityTier,
  type ConnectionDef,
  type NationDef,
  type NationId,
  type NeutralStateDef,
  type ProvinceDef,
  type Resources,
  type ScenarioDef,
  type Terrain,
  type TownDef,
  type UnitType,
} from '../types';

/** A province's economic role. Exactly one capital per nation; great and major powers also need one heartland. */
export type ProvinceRole = 'capital' | 'industrial' | 'city' | 'town';

export interface ProvinceRow {
  id: string;
  name: string;
  article?: Article;
  core: NationId | null;
  neutral?: NeutralStateDef;
  terrain: Terrain;
  tier: ProvinceRole;
  /** Overrides the city tier implied by the role (neutral capitals, unusual cities). */
  cityTier?: CityTier;
  city: CityDef;
  /** Principal city population, thousands. */
  pop: number;
  coast?: boolean;
  towns: [string, number, number][];
  oil?: boolean;
  /** Objective value; set by the owner's tier for capitals and heartlands, by hand for neutral capitals. */
  vp?: number;
  /** A second recruiting city: gets the tier's `recruiting` buildings. */
  recruiting?: boolean;
  /**
   * Starting units placed here by hand: a neutral state's garrison, or a nation's field units. A nation
   * that places none has its tier's field units spread over its border provinces.
   */
  garrison?: Partial<Record<UnitType, number>>;
  /** Extra starting buildings (neutral border fortifications). */
  buildings?: Partial<Record<BuildingType, number>>;
}

/** Relative output weights per role, per minute, before each nation is scaled to its tier's totals. */
const ROLE_OUTPUT: Record<ProvinceRole, Omit<Resources, 'fuel'>> = {
  capital: { money: 60, materials: 22, manpower: 16 },
  industrial: { money: 45, materials: 38, manpower: 12 },
  city: { money: 38, materials: 20, manpower: 11 },
  town: { money: 26, materials: 12, manpower: 8 },
};

/** Starting city tier by role (Large City, City, Town); a capital's comes from its tier. */
const ROLE_CITY: Record<Exclude<ProvinceRole, 'capital'>, CityTier> = { industrial: 3, city: 2, town: 1 };
/** Neutral capitals without an override, and anything without an owner's tier. */
const UNOWNED_CAPITAL_CITY: CityTier = 4;

const BASE_FUEL = 1.5;
const OIL_FUEL = 12;

type Nations = Pick<NationDef, 'id' | 'power'>[];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function powerOf(nations: Nations, id: NationId) {
  const n = nations.find((x) => x.id === id);
  if (!n) throw new Error(`Province row names unknown nation ${id}`);
  return POWERS[n.power];
}

export function buildProvinces(rows: ProvinceRow[], nations: Nations): ProvinceDef[] {
  // Per-nation normalisation factors so each nation starts with its tier's output.
  const totals = new Map<string, Omit<Resources, 'fuel'>>();
  for (const r of rows) {
    if (!r.core) continue;
    const t = totals.get(r.core) ?? { money: 0, materials: 0, manpower: 0 };
    const o = ROLE_OUTPUT[r.tier];
    t.money += o.money;
    t.materials += o.materials;
    t.manpower += o.manpower;
    totals.set(r.core, t);
  }
  return rows.map((r) => {
    const o = ROLE_OUTPUT[r.tier];
    const power = r.core ? powerOf(nations, r.core) : null;
    const t = r.core ? totals.get(r.core)! : null;
    const scale = (k: 'money' | 'materials' | 'manpower') => (t && power ? round1((o[k] * power.output[k]) / t[k]) : o[k]);
    const towns: TownDef[] = r.towns.map(([name, lon, lat]) => ({ name, coord: [lon, lat] }));
    const roleVp = power ? (r.tier === 'capital' ? power.vp.capital : r.tier === 'industrial' ? power.vp.industrial : undefined) : undefined;
    const roleCity = r.tier === 'capital' ? (power?.capitalCity ?? UNOWNED_CAPITAL_CITY) : ROLE_CITY[r.tier];
    return {
      id: r.id,
      name: r.name,
      article: r.article,
      core: r.core,
      neutral: r.neutral,
      terrain: r.terrain,
      city: r.city,
      tier: r.cityTier ?? roleCity,
      population: r.pop,
      towns,
      coastal: r.coast === true,
      production: {
        money: scale('money'),
        materials: scale('materials'),
        manpower: scale('manpower'),
        fuel: r.oil ? OIL_FUEL : BASE_FUEL,
      },
      oil: r.oil,
      objectiveVp: r.vp ?? roleVp,
    };
  });
}

type Units = Partial<Record<UnitType, number>>;

function addUnits(into: Map<string, Units>, province: string, units: Units | undefined): void {
  if (!units) return;
  const u = into.get(province) ?? {};
  for (const [type, n] of Object.entries(units) as [UnitType, number][]) u[type] = (u[type] ?? 0) + n;
  into.set(province, u);
}

/**
 * Starting buildings and armies for every nation from its tier, plus the neutral
 * garrisons and fortifications the rows set by hand. A nation's field units go
 * where its rows place them; otherwise they are dealt out one at a time over its
 * border provinces first, then its other provinces, then its capital.
 */
export function buildStartingSetup(
  rows: ProvinceRow[],
  nations: Nations,
  connections: ConnectionDef[],
): Pick<ScenarioDef, 'startingBuildings' | 'startingArmies'> {
  const coreOf = new Map(rows.map((r) => [r.id, r.core]));
  const borders = new Set<string>();
  for (const c of connections) {
    if (coreOf.get(c.a) !== coreOf.get(c.b)) {
      borders.add(c.a);
      borders.add(c.b);
    }
  }
  const startingBuildings: ScenarioDef['startingBuildings'] = [];
  const startingArmies: ScenarioDef['startingArmies'] = [];

  for (const nation of nations) {
    const power = POWERS[nation.power];
    const own = rows.filter((r) => r.core === nation.id);
    const capital = own.find((r) => r.tier === 'capital');
    if (!capital) throw new Error(`${nation.id} has no capital province`);
    const industrial = own.find((r) => r.tier === 'industrial');
    if (power.armies.industrial && !industrial) throw new Error(`${nation.id} is a ${nation.power} power and needs an industrial province`);

    const units = new Map<string, Units>();
    addUnits(units, capital.id, power.armies.capital);
    if (industrial) addUnits(units, industrial.id, power.armies.industrial);
    const placed = own.filter((r) => r.garrison);
    if (placed.length) {
      for (const r of placed) addUnits(units, r.id, r.garrison);
    } else {
      const others = own.filter((r) => r !== capital && r !== industrial);
      const order = [...others.filter((r) => borders.has(r.id)), ...others.filter((r) => !borders.has(r.id))];
      const slots = order.length ? order : [capital];
      let i = 0;
      for (const type of UNIT_TYPES) {
        for (let k = 0; k < (power.armies.field[type] ?? 0); k++) addUnits(units, slots[i++ % slots.length].id, { [type]: 1 });
      }
    }
    for (const r of [capital, ...own.filter((x) => x !== capital)]) {
      const u = units.get(r.id);
      if (u) startingArmies.push({ owner: nation.id, province: r.id, units: u });
    }

    for (const r of own) {
      const role =
        r === capital ? power.buildings.capital : r === industrial ? power.buildings.industrial : r.recruiting ? power.buildings.recruiting : undefined;
      const buildings = { ...role, ...r.buildings };
      if (Object.keys(buildings).length) startingBuildings.push({ province: r.id, buildings });
    }
  }

  for (const r of rows) {
    if (r.core) continue;
    if (r.buildings) startingBuildings.push({ province: r.id, buildings: { ...r.buildings } });
    if (r.garrison) startingArmies.push({ owner: NEUTRAL, province: r.id, units: { ...r.garrison } });
  }
  return { startingBuildings, startingArmies };
}
