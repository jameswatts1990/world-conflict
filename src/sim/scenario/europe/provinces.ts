// Gameplay data for each playable province. Shapes live separately in
// src/assets/map/theatre.topo.json (keyed by the same ids).
import type { CityDef, NationId, ProvinceDef, Resources, Terrain } from '../../types';

type Tier = 'capital' | 'industrial' | 'major' | 'town';

/** Relative output weights per tier, per minute, before normalisation. */
const TIER_OUTPUT: Record<Tier, Omit<Resources, 'fuel'>> = {
  capital: { money: 60, materials: 22, manpower: 16 },
  industrial: { money: 45, materials: 38, manpower: 12 },
  major: { money: 38, materials: 20, manpower: 11 },
  town: { money: 26, materials: 12, manpower: 8 },
};

/** Every nation's core provinces are scaled to these totals (per minute). */
export const NATION_OUTPUT_TARGET = { money: 260, materials: 140, manpower: 70 };
const BASE_FUEL = 1.5;
const OIL_FUEL = 12;

interface Row {
  id: string;
  name: string;
  core: NationId | null;
  neutralState?: string;
  terrain: Terrain;
  tier: Tier;
  city: CityDef;
  oil?: boolean;
  vp?: number;
}

const ROWS: Row[] = [
  // United Kingdom
  { id: 'uk-london', name: 'London & the South East', core: 'uk', terrain: 'urban', tier: 'capital', city: { name: 'London', coord: [-0.128, 51.507], size: 'capital' }, vp: 3 },
  { id: 'uk-midlands', name: 'The Midlands', core: 'uk', terrain: 'plains', tier: 'industrial', city: { name: 'Birmingham', coord: [-1.89, 52.486], size: 'major' }, vp: 2 },
  { id: 'uk-north', name: 'Northern England', core: 'uk', terrain: 'hills', tier: 'major', city: { name: 'Manchester', coord: [-2.243, 53.481], size: 'major' } },
  { id: 'uk-scotland', name: 'Scotland', core: 'uk', terrain: 'hills', tier: 'town', city: { name: 'Glasgow', coord: [-4.252, 55.864], size: 'major' }, oil: true },
  { id: 'uk-west', name: 'Wales & the West Country', core: 'uk', terrain: 'hills', tier: 'town', city: { name: 'Cardiff', coord: [-3.179, 51.482], size: 'town' } },
  { id: 'uk-ulster', name: 'Northern Ireland', core: 'uk', terrain: 'hills', tier: 'town', city: { name: 'Belfast', coord: [-5.93, 54.597], size: 'town' } },

  // France
  { id: 'fr-paris', name: 'Île-de-France', core: 'fr', terrain: 'urban', tier: 'capital', city: { name: 'Paris', coord: [2.352, 48.857], size: 'capital' }, vp: 3 },
  { id: 'fr-nord', name: 'Nord', core: 'fr', terrain: 'plains', tier: 'industrial', city: { name: 'Lille', coord: [3.057, 50.629], size: 'major' }, vp: 2 },
  { id: 'fr-east', name: 'Alsace-Lorraine & Champagne', core: 'fr', terrain: 'forest', tier: 'major', city: { name: 'Strasbourg', coord: [7.752, 48.573], size: 'major' } },
  { id: 'fr-rhone', name: 'Rhône-Alpes', core: 'fr', terrain: 'mountains', tier: 'major', city: { name: 'Lyon', coord: [4.836, 45.764], size: 'major' } },
  { id: 'fr-midi', name: 'Midi & Provence', core: 'fr', terrain: 'hills', tier: 'major', city: { name: 'Marseille', coord: [5.37, 43.297], size: 'major' } },
  { id: 'fr-normandy', name: 'Normandy', core: 'fr', terrain: 'forest', tier: 'town', city: { name: 'Rouen', coord: [1.099, 49.443], size: 'town' } },
  { id: 'fr-west', name: 'Brittany & the Loire', core: 'fr', terrain: 'plains', tier: 'town', city: { name: 'Nantes', coord: [-1.554, 47.218], size: 'town' } },
  { id: 'fr-centre', name: 'Centre & Burgundy', core: 'fr', terrain: 'plains', tier: 'town', city: { name: 'Dijon', coord: [5.041, 47.322], size: 'town' } },
  { id: 'fr-aquitaine', name: 'Aquitaine', core: 'fr', terrain: 'forest', tier: 'town', city: { name: 'Bordeaux', coord: [-0.579, 44.838], size: 'town' }, oil: true },

  // Germany
  { id: 'de-berlin', name: 'Berlin & Brandenburg', core: 'de', terrain: 'urban', tier: 'capital', city: { name: 'Berlin', coord: [13.405, 52.52], size: 'capital' }, vp: 3 },
  { id: 'de-ruhr', name: 'Rhineland & Ruhr', core: 'de', terrain: 'urban', tier: 'industrial', city: { name: 'Essen', coord: [7.012, 51.456], size: 'major' }, vp: 2 },
  { id: 'de-saxony', name: 'Saxony & Thuringia', core: 'de', terrain: 'hills', tier: 'major', city: { name: 'Leipzig', coord: [12.373, 51.34], size: 'major' } },
  { id: 'de-north', name: 'Holstein & Mecklenburg', core: 'de', terrain: 'plains', tier: 'major', city: { name: 'Hamburg', coord: [9.994, 53.551], size: 'major' } },
  { id: 'de-hesse', name: 'Hesse & the Palatinate', core: 'de', terrain: 'hills', tier: 'major', city: { name: 'Frankfurt', coord: [8.682, 50.111], size: 'major' } },
  { id: 'de-bavaria', name: 'Bavaria', core: 'de', terrain: 'hills', tier: 'major', city: { name: 'Munich', coord: [11.582, 48.135], size: 'major' } },
  { id: 'de-lowersaxony', name: 'Lower Saxony', core: 'de', terrain: 'plains', tier: 'town', city: { name: 'Hanover', coord: [9.732, 52.376], size: 'town' }, oil: true },
  { id: 'de-baden', name: 'Baden-Württemberg', core: 'de', terrain: 'forest', tier: 'town', city: { name: 'Stuttgart', coord: [9.183, 48.776], size: 'town' } },

  // Italy
  { id: 'it-rome', name: 'Central Italy', core: 'it', terrain: 'urban', tier: 'capital', city: { name: 'Rome', coord: [12.496, 41.903], size: 'capital' }, vp: 3 },
  { id: 'it-lombardy', name: 'Lombardy', core: 'it', terrain: 'plains', tier: 'industrial', city: { name: 'Milan', coord: [9.19, 45.464], size: 'major' }, vp: 2 },
  { id: 'it-piedmont', name: 'Piedmont & Liguria', core: 'it', terrain: 'mountains', tier: 'major', city: { name: 'Turin', coord: [7.687, 45.07], size: 'major' } },
  { id: 'it-tuscany', name: 'Emilia & Tuscany', core: 'it', terrain: 'hills', tier: 'major', city: { name: 'Florence', coord: [11.256, 43.77], size: 'major' } },
  { id: 'it-naples', name: 'Southern Italy', core: 'it', terrain: 'hills', tier: 'major', city: { name: 'Naples', coord: [14.268, 40.852], size: 'major' } },
  { id: 'it-venetia', name: 'Venetia & Tyrol', core: 'it', terrain: 'mountains', tier: 'town', city: { name: 'Venice', coord: [12.316, 45.441], size: 'town' } },
  { id: 'it-islands', name: 'Sicily & Sardinia', core: 'it', terrain: 'hills', tier: 'town', city: { name: 'Palermo', coord: [13.362, 38.116], size: 'town' }, oil: true },

  // Spain
  { id: 'es-madrid', name: 'Madrid & La Mancha', core: 'es', terrain: 'urban', tier: 'capital', city: { name: 'Madrid', coord: [-3.704, 40.417], size: 'capital' }, vp: 3 },
  { id: 'es-catalonia', name: 'Catalonia & Aragon', core: 'es', terrain: 'hills', tier: 'industrial', city: { name: 'Barcelona', coord: [2.173, 41.385], size: 'major' }, vp: 2 },
  { id: 'es-north', name: 'Basque Country & Navarre', core: 'es', terrain: 'mountains', tier: 'major', city: { name: 'Bilbao', coord: [-2.935, 43.263], size: 'major' } },
  { id: 'es-valencia', name: 'Valencia & Murcia', core: 'es', terrain: 'plains', tier: 'major', city: { name: 'Valencia', coord: [-0.376, 39.47], size: 'major' } },
  { id: 'es-andalusia', name: 'Andalusia & Extremadura', core: 'es', terrain: 'hills', tier: 'major', city: { name: 'Seville', coord: [-5.985, 37.389], size: 'major' } },
  { id: 'es-castile', name: 'Castile & León', core: 'es', terrain: 'plains', tier: 'town', city: { name: 'Valladolid', coord: [-4.725, 41.652], size: 'town' }, oil: true },
  { id: 'es-galicia', name: 'Galicia & Asturias', core: 'es', terrain: 'hills', tier: 'town', city: { name: 'A Coruña', coord: [-8.412, 43.362], size: 'town' } },

  // Poland
  { id: 'pl-warsaw', name: 'Masovia', core: 'pl', terrain: 'urban', tier: 'capital', city: { name: 'Warsaw', coord: [21.012, 52.23], size: 'capital' }, vp: 3 },
  { id: 'pl-silesia', name: 'Silesia', core: 'pl', terrain: 'plains', tier: 'industrial', city: { name: 'Wrocław', coord: [17.039, 51.108], size: 'major' }, vp: 2 },
  { id: 'pl-lesser', name: 'Lesser Poland', core: 'pl', terrain: 'hills', tier: 'major', city: { name: 'Kraków', coord: [19.945, 50.065], size: 'major' }, oil: true },
  { id: 'pl-greater', name: 'Greater Poland', core: 'pl', terrain: 'plains', tier: 'major', city: { name: 'Poznań', coord: [16.925, 52.406], size: 'major' } },
  { id: 'pl-pomerania', name: 'Pomerania', core: 'pl', terrain: 'plains', tier: 'major', city: { name: 'Gdańsk', coord: [18.647, 54.352], size: 'major' } },
  { id: 'pl-east', name: 'Eastern Poland', core: 'pl', terrain: 'marsh', tier: 'town', city: { name: 'Lublin', coord: [22.568, 51.247], size: 'town' } },

  // Neutral minor states (capturable; garrisoned; never attack)
  { id: 'nt-benelux', name: 'Belgium & Luxembourg', core: null, neutralState: 'Belgium & Luxembourg', terrain: 'plains', tier: 'industrial', city: { name: 'Brussels', coord: [4.352, 50.85], size: 'capital' }, vp: 1 },
  { id: 'nt-netherlands', name: 'Netherlands', core: null, neutralState: 'Netherlands', terrain: 'marsh', tier: 'major', city: { name: 'Amsterdam', coord: [4.904, 52.368], size: 'capital' }, oil: true, vp: 1 },
  { id: 'nt-denmark', name: 'Denmark', core: null, neutralState: 'Denmark', terrain: 'plains', tier: 'town', city: { name: 'Copenhagen', coord: [12.568, 55.676], size: 'capital' }, vp: 1 },
  { id: 'nt-switzerland', name: 'Switzerland', core: null, neutralState: 'Switzerland', terrain: 'mountains', tier: 'major', city: { name: 'Bern', coord: [7.447, 46.948], size: 'capital' }, vp: 1 },
  { id: 'nt-austria', name: 'Austria', core: null, neutralState: 'Austria', terrain: 'mountains', tier: 'major', city: { name: 'Vienna', coord: [16.374, 48.208], size: 'capital' }, oil: true, vp: 1 },
  { id: 'nt-czechia', name: 'Czechia', core: null, neutralState: 'Czechia', terrain: 'hills', tier: 'industrial', city: { name: 'Prague', coord: [14.438, 50.076], size: 'capital' }, vp: 1 },
  { id: 'nt-portugal', name: 'Portugal', core: null, neutralState: 'Portugal', terrain: 'hills', tier: 'major', city: { name: 'Lisbon', coord: [-9.139, 38.722], size: 'capital' }, vp: 1 },
];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function buildProvinces(): ProvinceDef[] {
  // Per-nation normalisation factors so each nation starts with equal output.
  const totals = new Map<string, Omit<Resources, 'fuel'>>();
  for (const r of ROWS) {
    if (!r.core) continue;
    const t = totals.get(r.core) ?? { money: 0, materials: 0, manpower: 0 };
    const o = TIER_OUTPUT[r.tier];
    t.money += o.money;
    t.materials += o.materials;
    t.manpower += o.manpower;
    totals.set(r.core, t);
  }
  return ROWS.map((r) => {
    const o = TIER_OUTPUT[r.tier];
    const t = r.core ? totals.get(r.core)! : null;
    const scale = (k: 'money' | 'materials' | 'manpower') =>
      t ? round1((o[k] * NATION_OUTPUT_TARGET[k]) / t[k]) : o[k];
    return {
      id: r.id,
      name: r.name,
      core: r.core,
      neutralState: r.neutralState,
      terrain: r.terrain,
      city: r.city,
      production: {
        money: scale('money'),
        materials: scale('materials'),
        manpower: scale('manpower'),
        fuel: r.oil ? OIL_FUEL : BASE_FUEL,
      },
      oil: r.oil,
      objectiveVp: r.vp,
    };
  });
}

export const PROVINCES: ProvinceDef[] = buildProvinces();
