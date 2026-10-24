// Turns a theatre's province rows into scenario data. A row describes a city and
// the land round it (owner, terrain, city, role) and becomes two provinces: the
// city, keyed by the row's id, and its land, keyed `<id>-land`. The owner's power
// tier (see config/powers.ts) decides the rest: output, objective value, the
// capital's city size, and the starting buildings and army. Shapes live
// separately in src/assets/map/map.topo.json, keyed by the same ids.
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

/** Suffix of the id of the province round a row's city (the city keeps the row's id). */
export const LAND_SUFFIX = '-land';

/** A province's economic role. Exactly one capital per nation; great and major powers also need one heartland. */
export type ProvinceRole = 'capital' | 'industrial' | 'city' | 'town';

export interface ProvinceRow {
  /** The city province's id; its land is `<id>-land`. */
  id: string;
  /** The land's name ("Bavaria"); the city province takes the city's. */
  name: string;
  article?: Article;
  /** Where the land round the city needs another name or terrain than the row's ("Brandenburg" round Berlin). */
  land?: { name?: string; article?: Article; terrain?: Terrain };
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
  /** Objective value of the city; set by the owner's tier for capitals and heartlands, by hand for neutral capitals. */
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

/** What the map says about each row (generated from the shapes into the theatre's land.ts). */
export type LandData = Record<string, { anchor: [number, number]; coast: boolean }>;

/** The id of the land round a row's city. */
export const landId = (row: string): string => row + LAND_SUFFIX;

/** Land is never urban: round a capital it is the countryside the city stands in. */
function landTerrain(r: ProvinceRow): Terrain {
  return r.land?.terrain ?? (r.terrain === 'urban' ? 'plains' : r.terrain);
}

export function buildProvinces(rows: ProvinceRow[], nations: Nations, land: LandData): ProvinceDef[] {
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
  return rows.flatMap((r): ProvinceDef[] => {
    const o = ROLE_OUTPUT[r.tier];
    const power = r.core ? powerOf(nations, r.core) : null;
    const t = r.core ? totals.get(r.core)! : null;
    const scale = (k: 'money' | 'materials' | 'manpower') => (t && power ? round1((o[k] * power.output[k]) / t[k]) : o[k]);
    const towns: TownDef[] = r.towns.map(([name, lon, lat]) => ({ name, coord: [lon, lat] }));
    const roleVp = power ? (r.tier === 'capital' ? power.vp.capital : r.tier === 'industrial' ? power.vp.industrial : undefined) : undefined;
    const roleCity = r.tier === 'capital' ? (power?.capitalCity ?? UNOWNED_CAPITAL_CITY) : ROLE_CITY[r.tier];
    const map = land[r.id];
    if (!map) throw new Error(`No map data for ${r.id}: run scripts/map/city-provinces.ts`);
    return [
      {
        id: r.id,
        name: r.city.name,
        core: r.core,
        neutral: r.neutral,
        terrain: r.terrain,
        city: r.city,
        anchor: r.city.coord,
        within: landId(r.id),
        tier: r.cityTier ?? roleCity,
        population: r.pop,
        towns: [],
        coastal: map.coast,
        production: {
          money: scale('money'),
          materials: scale('materials'),
          manpower: scale('manpower'),
          fuel: r.oil ? OIL_FUEL : BASE_FUEL,
        },
        oil: r.oil,
        objectiveVp: r.vp ?? roleVp,
      },
      {
        id: landId(r.id),
        name: r.land?.name ?? r.name,
        article: r.land?.name ? r.land.article : r.article,
        core: r.core,
        neutral: r.neutral,
        terrain: landTerrain(r),
        anchor: map.anchor,
        contains: r.id,
        tier: 1,
        population: 0,
        towns,
        coastal: r.coast === true,
        production: { money: 0, materials: 0, manpower: 0, fuel: 0 },
      },
    ];
  });
}

/**
 * The movement graph from connections written between rows: each one joins the two rows' lands (same kind,
 * same label, and over land where it crosses their border, from `borders` keyed 'a|b'), and every city is
 * joined to its own land, its only way in or out.
 */
export function buildConnections(rows: ProvinceRow[], connections: ConnectionDef[], borders: Record<string, number> = {}): ConnectionDef[] {
  return [
    ...rows.map((r): ConnectionDef => ({ a: r.id, b: landId(r.id), kind: 'land' })),
    ...connections.map((c) => {
      const border = c.kind === 'strait' ? undefined : borders[`${c.a}|${c.b}`];
      return { ...c, a: landId(c.a), b: landId(c.b), ...(border === undefined ? {} : { border }) };
    }),
  ];
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
 * garrisons and fortifications the rows set by hand. Buildings stand in the cities,
 * and so do the capital's and the heartland's garrisons. A nation's field units take
 * the field, on the land round the cities: where its rows place them, or else dealt
 * out one at a time over its border rows first, then its other rows, then its capital.
 * `connections` are the rows' own (before buildConnections).
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
      for (const r of placed) addUnits(units, landId(r.id), r.garrison);
    } else {
      const others = own.filter((r) => r !== capital && r !== industrial);
      const order = [...others.filter((r) => borders.has(r.id)), ...others.filter((r) => !borders.has(r.id))];
      const slots = order.length ? order : [capital];
      let i = 0;
      for (const type of UNIT_TYPES) {
        for (let k = 0; k < (power.armies.field[type] ?? 0); k++) addUnits(units, landId(slots[i++ % slots.length].id), { [type]: 1 });
      }
    }
    for (const r of [capital, ...own.filter((x) => x !== capital)]) {
      for (const pid of [r.id, landId(r.id)]) {
        const u = units.get(pid);
        if (u) startingArmies.push({ owner: nation.id, province: pid, units: u });
      }
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
