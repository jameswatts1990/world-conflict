// Gameplay data for each playable province. Shapes live separately in
// src/assets/map/map.topo.json (keyed by the same ids).
import type { Article, CityDef, CityTier, NationId, NeutralStateDef, ProvinceDef, Resources, Terrain, TownDef } from '../../types';

type Tier = 'capital' | 'industrial' | 'major' | 'town';

/** Relative output weights per tier, per minute, before normalisation. */
const TIER_OUTPUT: Record<Tier, Omit<Resources, 'fuel'>> = {
  capital: { money: 60, materials: 22, manpower: 16 },
  industrial: { money: 45, materials: 38, manpower: 12 },
  major: { money: 38, materials: 20, manpower: 11 },
  town: { money: 26, materials: 12, manpower: 8 },
};

/** Starting city tier by economic tier (Metropolis, Large City, City, Town). */
const CITY_TIER: Record<Tier, CityTier> = { capital: 4, industrial: 3, major: 2, town: 1 };

/** Every nation's core provinces are scaled to these totals (per minute). */
export const NATION_OUTPUT_TARGET = { money: 260, materials: 140, manpower: 70 };
const BASE_FUEL = 1.5;
const OIL_FUEL = 12;

interface Row {
  id: string;
  name: string;
  article?: Article;
  core: NationId | null;
  neutral?: NeutralStateDef;
  terrain: Terrain;
  tier: Tier;
  /** Overrides the city tier implied by `tier` (neutral capitals). */
  cityTier?: CityTier;
  city: CityDef;
  /** Principal city population, thousands. */
  pop: number;
  coast?: boolean;
  towns: [string, number, number][];
  oil?: boolean;
  vp?: number;
}

const ROWS: Row[] = [
  // United Kingdom
  { id: 'uk-london', name: 'London & the South East', core: 'uk', terrain: 'urban', tier: 'capital', city: { name: 'London', coord: [-0.128, 51.507], size: 'capital' }, pop: 9000, coast: true, vp: 3,
    towns: [['Brighton', -0.137, 50.822], ['Southampton', -1.404, 50.909], ['Oxford', -1.258, 51.752], ['Dover', 1.313, 51.127]] },
  { id: 'uk-midlands', name: 'Midlands', article: 'the', core: 'uk', terrain: 'plains', tier: 'industrial', city: { name: 'Birmingham', coord: [-1.89, 52.486], size: 'major' }, pop: 2900, vp: 2,
    towns: [['Nottingham', -1.15, 52.954], ['Leicester', -1.133, 52.637], ['Coventry', -1.512, 52.407]] },
  { id: 'uk-north', name: 'Northern England', core: 'uk', terrain: 'hills', tier: 'major', city: { name: 'Manchester', coord: [-2.243, 53.481], size: 'major' }, pop: 2800, coast: true,
    towns: [['Liverpool', -2.963, 53.408], ['Leeds', -1.549, 53.801], ['Newcastle', -1.618, 54.978], ['Sheffield', -1.47, 53.381]] },
  { id: 'uk-scotland', name: 'Scotland', core: 'uk', terrain: 'hills', tier: 'town', city: { name: 'Glasgow', coord: [-4.252, 55.864], size: 'major' }, pop: 1800, coast: true, oil: true,
    towns: [['Edinburgh', -3.188, 55.953], ['Aberdeen', -2.094, 57.149], ['Dundee', -2.97, 56.462], ['Inverness', -4.224, 57.477]] },
  { id: 'uk-west', name: 'Wales & the West Country', core: 'uk', terrain: 'hills', tier: 'town', city: { name: 'Cardiff', coord: [-3.179, 51.482], size: 'town' }, pop: 480, coast: true,
    towns: [['Bristol', -2.587, 51.455], ['Plymouth', -4.123, 50.376], ['Swansea', -3.944, 51.621], ['Exeter', -3.527, 50.718]] },
  { id: 'uk-ulster', name: 'Northern Ireland', core: 'uk', terrain: 'hills', tier: 'town', city: { name: 'Belfast', coord: [-5.93, 54.597], size: 'town' }, pop: 640, coast: true,
    towns: [['Derry', -7.309, 54.997], ['Newry', -6.337, 54.176]] },

  // France
  { id: 'fr-paris', name: 'Île-de-France', core: 'fr', terrain: 'urban', tier: 'capital', city: { name: 'Paris', coord: [2.352, 48.857], size: 'capital' }, pop: 11000, vp: 3,
    towns: [['Versailles', 2.13, 48.804], ['Fontainebleau', 2.701, 48.404]] },
  { id: 'fr-nord', name: 'Nord', core: 'fr', terrain: 'plains', tier: 'industrial', city: { name: 'Lille', coord: [3.057, 50.629], size: 'major' }, pop: 1200, coast: true, vp: 2,
    towns: [['Amiens', 2.296, 49.894], ['Calais', 1.858, 50.951], ['Dunkirk', 2.377, 51.034], ['Arras', 2.781, 50.291]] },
  { id: 'fr-east', name: 'Alsace-Lorraine & Champagne', core: 'fr', terrain: 'forest', tier: 'major', city: { name: 'Strasbourg', coord: [7.752, 48.573], size: 'major' }, pop: 850,
    towns: [['Reims', 4.032, 49.258], ['Metz', 6.176, 49.12], ['Nancy', 6.184, 48.692], ['Mulhouse', 7.338, 47.75]] },
  { id: 'fr-rhone', name: 'Rhône-Alpes', core: 'fr', terrain: 'mountains', tier: 'major', city: { name: 'Lyon', coord: [4.836, 45.764], size: 'major' }, pop: 2300,
    towns: [['Grenoble', 5.724, 45.188], ['Saint-Étienne', 4.387, 45.439], ['Clermont-Ferrand', 3.087, 45.778], ['Annecy', 6.129, 45.899]] },
  { id: 'fr-midi', name: 'Midi & Provence', core: 'fr', terrain: 'hills', tier: 'major', city: { name: 'Marseille', coord: [5.37, 43.297], size: 'major' }, pop: 1900, coast: true,
    towns: [['Toulouse', 1.444, 43.605], ['Nice', 7.262, 43.71], ['Montpellier', 3.877, 43.611], ['Toulon', 5.928, 43.124]] },
  { id: 'fr-normandy', name: 'Normandy', core: 'fr', terrain: 'forest', tier: 'town', city: { name: 'Rouen', coord: [1.099, 49.443], size: 'town' }, pop: 660, coast: true,
    towns: [['Le Havre', 0.136, 49.522], ['Caen', -0.37, 49.183], ['Cherbourg', -1.622, 49.64]] },
  { id: 'fr-west', name: 'Brittany & the Loire', core: 'fr', terrain: 'plains', tier: 'town', city: { name: 'Nantes', coord: [-1.554, 47.218], size: 'town' }, pop: 980, coast: true,
    towns: [['Rennes', -1.678, 48.117], ['Brest', -4.486, 48.39], ['Angers', -0.554, 47.478], ['Le Mans', 0.199, 48.008]] },
  { id: 'fr-centre', name: 'Centre & Burgundy', core: 'fr', terrain: 'plains', tier: 'town', city: { name: 'Dijon', coord: [5.041, 47.322], size: 'town' }, pop: 390,
    towns: [['Orléans', 1.909, 47.903], ['Tours', 0.689, 47.394], ['Besançon', 6.024, 47.238], ['Bourges', 2.398, 47.081]] },
  { id: 'fr-aquitaine', name: 'Aquitaine', core: 'fr', terrain: 'forest', tier: 'town', city: { name: 'Bordeaux', coord: [-0.579, 44.838], size: 'town' }, pop: 1300, coast: true, oil: true,
    towns: [['Limoges', 1.261, 45.834], ['Poitiers', 0.34, 46.58], ['Biarritz', -1.559, 43.483], ['Pau', -0.37, 43.295]] },

  // Germany
  { id: 'de-berlin', name: 'Berlin & Brandenburg', core: 'de', terrain: 'urban', tier: 'capital', city: { name: 'Berlin', coord: [13.405, 52.52], size: 'capital' }, pop: 4700, vp: 3,
    towns: [['Potsdam', 13.064, 52.391], ['Frankfurt (Oder)', 14.55, 52.342], ['Cottbus', 14.334, 51.756]] },
  { id: 'de-ruhr', name: 'Rhineland & Ruhr', core: 'de', terrain: 'urban', tier: 'industrial', city: { name: 'Essen', coord: [7.012, 51.456], size: 'major' }, pop: 5100, vp: 2,
    towns: [['Cologne', 6.96, 50.937], ['Düsseldorf', 6.773, 51.228], ['Dortmund', 7.466, 51.514], ['Bonn', 7.098, 50.737]] },
  { id: 'de-saxony', name: 'Saxony & Thuringia', core: 'de', terrain: 'hills', tier: 'major', city: { name: 'Leipzig', coord: [12.373, 51.34], size: 'major' }, pop: 1100,
    towns: [['Dresden', 13.737, 51.05], ['Chemnitz', 12.921, 50.828], ['Erfurt', 11.03, 50.978]] },
  { id: 'de-north', name: 'Holstein & Mecklenburg', core: 'de', terrain: 'plains', tier: 'major', city: { name: 'Hamburg', coord: [9.994, 53.551], size: 'major' }, pop: 3300, coast: true,
    towns: [['Kiel', 10.122, 54.323], ['Lübeck', 10.687, 53.866], ['Rostock', 12.1, 54.092]] },
  { id: 'de-hesse', name: 'Hesse & the Palatinate', core: 'de', terrain: 'hills', tier: 'major', city: { name: 'Frankfurt', coord: [8.682, 50.111], size: 'major' }, pop: 2700,
    towns: [['Kassel', 9.48, 51.312], ['Mainz', 8.247, 49.993], ['Wiesbaden', 8.24, 50.083], ['Saarbrücken', 6.997, 49.24]] },
  { id: 'de-bavaria', name: 'Bavaria', core: 'de', terrain: 'hills', tier: 'major', city: { name: 'Munich', coord: [11.582, 48.135], size: 'major' }, pop: 2900,
    towns: [['Nuremberg', 11.077, 49.452], ['Augsburg', 10.898, 48.371], ['Regensburg', 12.102, 49.013], ['Würzburg', 9.953, 49.791]] },
  { id: 'de-lowersaxony', name: 'Lower Saxony', core: 'de', terrain: 'plains', tier: 'town', city: { name: 'Hanover', coord: [9.732, 52.376], size: 'town' }, pop: 1300, coast: true, oil: true,
    towns: [['Bremen', 8.802, 53.079], ['Brunswick', 10.527, 52.269], ['Osnabrück', 8.047, 52.279]] },
  { id: 'de-baden', name: 'Baden-Württemberg', core: 'de', terrain: 'forest', tier: 'town', city: { name: 'Stuttgart', coord: [9.183, 48.776], size: 'town' }, pop: 2800,
    towns: [['Karlsruhe', 8.404, 49.007], ['Mannheim', 8.487, 49.488], ['Freiburg', 7.842, 47.999], ['Ulm', 9.993, 48.401]] },

  // Italy
  { id: 'it-rome', name: 'Central Italy', core: 'it', terrain: 'urban', tier: 'capital', city: { name: 'Rome', coord: [12.496, 41.903], size: 'capital' }, pop: 4300, coast: true, vp: 3,
    towns: [['Perugia', 12.389, 43.112], ['Ancona', 13.505, 43.602], ['Latina', 12.903, 41.467]] },
  { id: 'it-lombardy', name: 'Lombardy', core: 'it', terrain: 'plains', tier: 'industrial', city: { name: 'Milan', coord: [9.19, 45.464], size: 'major' }, pop: 4300, vp: 2,
    towns: [['Bergamo', 9.67, 45.698], ['Brescia', 10.211, 45.541], ['Como', 9.085, 45.808], ['Pavia', 9.159, 45.185]] },
  { id: 'it-piedmont', name: 'Piedmont & Liguria', core: 'it', terrain: 'mountains', tier: 'major', city: { name: 'Turin', coord: [7.687, 45.07], size: 'major' }, pop: 2200, coast: true,
    towns: [['Genoa', 8.966, 44.405], ['Alessandria', 8.615, 44.913], ['Cuneo', 7.548, 44.384], ['Aosta', 7.315, 45.737]] },
  { id: 'it-tuscany', name: 'Emilia & Tuscany', core: 'it', terrain: 'hills', tier: 'major', city: { name: 'Florence', coord: [11.256, 43.77], size: 'major' }, pop: 1000, coast: true,
    towns: [['Bologna', 11.343, 44.494], ['Pisa', 10.402, 43.723], ['Siena', 11.331, 43.318], ['Parma', 10.328, 44.801]] },
  { id: 'it-naples', name: 'Southern Italy', core: 'it', terrain: 'hills', tier: 'major', city: { name: 'Naples', coord: [14.268, 40.852], size: 'major' }, pop: 3100, coast: true,
    towns: [['Bari', 16.872, 41.117], ['Taranto', 17.24, 40.464], ['Reggio Calabria', 15.65, 38.11], ['Salerno', 14.769, 40.683]] },
  { id: 'it-venetia', name: 'Venetia & Tyrol', core: 'it', terrain: 'mountains', tier: 'town', city: { name: 'Venice', coord: [12.316, 45.481], size: 'town' }, pop: 850, coast: true,
    towns: [['Verona', 10.993, 45.438], ['Padua', 11.877, 45.406], ['Udine', 13.234, 46.063], ['Trento', 11.121, 46.068]] },
  { id: 'it-islands', name: 'Sicily & Sardinia', core: 'it', terrain: 'hills', tier: 'town', city: { name: 'Palermo', coord: [13.362, 38.116], size: 'town' }, pop: 1200, coast: true, oil: true,
    towns: [['Catania', 15.087, 37.507], ['Cagliari', 9.11, 39.224], ['Messina', 15.554, 38.193], ['Sassari', 8.555, 40.726]] },

  // Spain
  { id: 'es-madrid', name: 'Madrid & La Mancha', core: 'es', terrain: 'urban', tier: 'capital', city: { name: 'Madrid', coord: [-3.704, 40.417], size: 'capital' }, pop: 6700, vp: 3,
    towns: [['Toledo', -4.027, 39.863], ['Guadalajara', -3.167, 40.633], ['Ciudad Real', -3.928, 38.985], ['Albacete', -1.856, 38.994]] },
  { id: 'es-catalonia', name: 'Catalonia & Aragon', core: 'es', terrain: 'hills', tier: 'industrial', city: { name: 'Barcelona', coord: [2.173, 41.385], size: 'major' }, pop: 5600, coast: true, vp: 2,
    towns: [['Zaragoza', -0.889, 41.649], ['Tarragona', 1.245, 41.119], ['Girona', 2.825, 41.979], ['Lleida', 0.62, 41.617]] },
  { id: 'es-north', name: 'Basque Country & Navarre', core: 'es', terrain: 'mountains', tier: 'major', city: { name: 'Bilbao', coord: [-2.935, 43.263], size: 'major' }, pop: 1000, coast: true,
    towns: [['San Sebastián', -1.981, 43.318], ['Pamplona', -1.645, 42.812], ['Santander', -3.81, 43.462], ['Vitoria', -2.672, 42.846]] },
  { id: 'es-valencia', name: 'Valencia & Murcia', core: 'es', terrain: 'plains', tier: 'major', city: { name: 'Valencia', coord: [-0.376, 39.47], size: 'major' }, pop: 1600, coast: true,
    towns: [['Alicante', -0.481, 38.345], ['Murcia', -1.13, 37.992], ['Cartagena', -0.986, 37.626], ['Castellón', -0.038, 39.986]] },
  { id: 'es-andalusia', name: 'Andalusia & Extremadura', core: 'es', terrain: 'hills', tier: 'major', city: { name: 'Seville', coord: [-5.985, 37.389], size: 'major' }, pop: 1500, coast: true,
    towns: [['Málaga', -4.421, 36.721], ['Córdoba', -4.779, 37.888], ['Granada', -3.599, 37.177], ['Cádiz', -6.212, 36.527], ['Badajoz', -6.97, 38.879]] },
  { id: 'es-castile', name: 'Castile & León', core: 'es', terrain: 'plains', tier: 'town', city: { name: 'Valladolid', coord: [-4.725, 41.652], size: 'town' }, pop: 420, oil: true,
    towns: [['Salamanca', -5.664, 40.97], ['Burgos', -3.697, 42.344], ['León', -5.567, 42.599]] },
  { id: 'es-galicia', name: 'Galicia & Asturias', core: 'es', terrain: 'hills', tier: 'town', city: { name: 'A Coruña', coord: [-8.412, 43.362], size: 'town' }, pop: 650, coast: true,
    towns: [['Vigo', -8.72, 42.24], ['Oviedo', -5.849, 43.362], ['Gijón', -5.662, 43.532], ['Santiago', -8.545, 42.878]] },

  // Poland
  { id: 'pl-warsaw', name: 'Masovia', core: 'pl', terrain: 'urban', tier: 'capital', city: { name: 'Warsaw', coord: [21.012, 52.23], size: 'capital' }, pop: 3100, vp: 3,
    towns: [['Łódź', 19.457, 51.759], ['Radom', 21.147, 51.403], ['Płock', 19.706, 52.547]] },
  { id: 'pl-silesia', name: 'Silesia', core: 'pl', terrain: 'plains', tier: 'industrial', city: { name: 'Wrocław', coord: [17.039, 51.108], size: 'major' }, pop: 1250, vp: 2,
    towns: [['Katowice', 19.023, 50.264], ['Opole', 17.926, 50.675], ['Legnica', 16.16, 51.207]] },
  { id: 'pl-lesser', name: 'Lesser Poland', core: 'pl', terrain: 'hills', tier: 'major', city: { name: 'Kraków', coord: [19.945, 50.065], size: 'major' }, pop: 1500, oil: true,
    towns: [['Rzeszów', 22.004, 50.041], ['Tarnów', 20.986, 50.012], ['Kielce', 20.629, 50.866]] },
  { id: 'pl-greater', name: 'Greater Poland', core: 'pl', terrain: 'plains', tier: 'major', city: { name: 'Poznań', coord: [16.925, 52.406], size: 'major' }, pop: 1000,
    towns: [['Gniezno', 17.596, 52.535], ['Kalisz', 18.091, 51.761], ['Zielona Góra', 15.506, 51.935]] },
  { id: 'pl-pomerania', name: 'Pomerania', core: 'pl', terrain: 'plains', tier: 'major', city: { name: 'Gdańsk', coord: [18.647, 54.352], size: 'major' }, pop: 1100, coast: true,
    towns: [['Szczecin', 14.553, 53.428], ['Bydgoszcz', 18.008, 53.123], ['Toruń', 18.598, 53.013], ['Koszalin', 16.172, 54.194]] },
  { id: 'pl-east', name: 'Eastern Poland', core: 'pl', terrain: 'marsh', tier: 'town', city: { name: 'Lublin', coord: [22.568, 51.247], size: 'town' }, pop: 650,
    towns: [['Białystok', 23.164, 53.133], ['Olsztyn', 20.49, 53.778], ['Zamość', 23.251, 50.723]] },

  // Neutral minor states (capturable; garrisoned; never attack)
  { id: 'nt-benelux', name: 'Belgium & Luxembourg', core: null, neutral: { name: 'Belgium & Luxembourg', adjective: 'Belgian' }, terrain: 'plains', tier: 'industrial', city: { name: 'Brussels', coord: [4.352, 50.85], size: 'capital' }, pop: 2100, coast: true, vp: 1,
    towns: [['Antwerp', 4.402, 51.219], ['Ghent', 3.725, 51.054], ['Liège', 5.58, 50.633], ['Luxembourg', 6.13, 49.611]] },
  { id: 'nt-netherlands', name: 'Netherlands', article: 'the', core: null, neutral: { name: 'Netherlands', adjective: 'Dutch', article: 'the' }, terrain: 'marsh', tier: 'major', cityTier: 3, city: { name: 'Amsterdam', coord: [4.904, 52.368], size: 'capital' }, pop: 2500, coast: true, oil: true, vp: 1,
    towns: [['Rotterdam', 4.478, 51.924], ['The Hague', 4.3, 52.07], ['Utrecht', 5.121, 52.091], ['Eindhoven', 5.47, 51.441]] },
  { id: 'nt-denmark', name: 'Denmark', core: null, neutral: { name: 'Denmark', adjective: 'Danish' }, terrain: 'plains', tier: 'town', cityTier: 3, city: { name: 'Copenhagen', coord: [12.576, 55.694], size: 'capital' }, pop: 2100, coast: true, vp: 1,
    towns: [['Aarhus', 10.204, 56.163], ['Odense', 10.388, 55.404], ['Aalborg', 9.922, 57.048]] },
  { id: 'nt-switzerland', name: 'Switzerland', core: null, neutral: { name: 'Switzerland', adjective: 'Swiss' }, terrain: 'mountains', tier: 'major', city: { name: 'Bern', coord: [7.447, 46.948], size: 'capital' }, pop: 420, vp: 1,
    towns: [['Zürich', 8.541, 47.377], ['Geneva', 6.143, 46.204], ['Basel', 7.588, 47.56], ['Lausanne', 6.633, 46.52]] },
  { id: 'nt-austria', name: 'Austria', core: null, neutral: { name: 'Austria', adjective: 'Austrian' }, terrain: 'mountains', tier: 'major', cityTier: 3, city: { name: 'Vienna', coord: [16.374, 48.208], size: 'capital' }, pop: 2900, oil: true, vp: 1,
    towns: [['Graz', 15.439, 47.071], ['Linz', 14.286, 48.306], ['Salzburg', 13.055, 47.809], ['Innsbruck', 11.404, 47.269]] },
  { id: 'nt-czechia', name: 'Czechia', core: null, neutral: { name: 'Czechia', adjective: 'Czech' }, terrain: 'hills', tier: 'industrial', city: { name: 'Prague', coord: [14.438, 50.076], size: 'capital' }, pop: 2700, vp: 1,
    towns: [['Brno', 16.607, 49.195], ['Ostrava', 18.262, 49.835], ['Plzeň', 13.378, 49.738]] },
  { id: 'nt-portugal', name: 'Portugal', core: null, neutral: { name: 'Portugal', adjective: 'Portuguese' }, terrain: 'hills', tier: 'major', cityTier: 3, city: { name: 'Lisbon', coord: [-9.139, 38.722], size: 'capital' }, pop: 2900, coast: true, vp: 1,
    towns: [['Porto', -8.611, 41.15], ['Coimbra', -8.43, 40.205], ['Faro', -7.935, 37.019]] },
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
    const towns: TownDef[] = r.towns.map(([name, lon, lat]) => ({ name, coord: [lon, lat] }));
    return {
      id: r.id,
      name: r.name,
      article: r.article,
      core: r.core,
      neutral: r.neutral,
      terrain: r.terrain,
      city: r.city,
      tier: r.cityTier ?? CITY_TIER[r.tier],
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
      objectiveVp: r.vp,
    };
  });
}

export const PROVINCES: ProvinceDef[] = buildProvinces();
