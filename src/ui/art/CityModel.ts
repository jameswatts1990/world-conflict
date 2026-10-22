// Low-poly 3D model of a city for the strategy map: a round token whose rim
// carries the owner's colour, with a recognisable model for every building the
// city has, generic housing that grows with the tier, empty plots for unused
// building slots and the capital's landmark. Deterministic per seed, and every
// building keeps a fixed spot in its own district (industry to the right,
// military to the left, civic at the front, landmark at the back), so building
// something new never reshuffles the rest.
import { Scene, mixColor, shadeColor, type V2, type V3 } from './iso3d';
import { BUILDING_CATEGORY, type ArtBuilding, type ArtTerrain, type BuildingCategory } from './types';

export interface CityModelProps {
  /** Province id, e.g. 'uk-north': picks the regional architecture and drives variety. */
  seed: string;
  tier: 1 | 2 | 3 | 4 | 5;
  /** A capital: gets a landmark (a national one for the powers' capitals). */
  capital?: boolean;
  /** Building -> level (0 or absent = not built). */
  buildings: Partial<Record<ArtBuilding, number>>;
  /** Building under construction: scaffolding and a crane. */
  construction?: ArtBuilding | null;
  /** Unused building slots, drawn as empty plots. */
  freeSlots?: number;
  terrain: ArtTerrain;
  coastal?: boolean;
  /** Owner's colour for the rim and flags; neutral if absent. */
  nationColor?: string;
  battle?: boolean;
}

export interface CityModel {
  /** Standalone SVG document. */
  svg: string;
  /** Size of the drawing in model units. */
  width: number;
  height: number;
  /** Where the middle of the city's ground sits in the drawing. */
  cx: number;
  cy: number;
  /** Half-width of the token's ground ellipse (its half-height is half this). */
  rx: number;
}

// ------------------------------------------------------------------ randomness

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An independent random stream per (seed, key): one feature never disturbs another. */
const rngOf = (seed: string, key: string) => mulberry32(hash32(`${seed}#${key}`));
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length];

// ------------------------------------------------------------------ palette

const K = {
  street: '#a39a85',
  avenue: '#c4b99f',
  plaza: '#d3c8ae',
  lawn: '#7f8a5e',
  yard: '#968a72',
  sand: '#c2b088',
  dirt: '#8c6f4f',
  plot: '#e9dcb4',
  stone: '#cdbf9f',
  white: '#ebe6d8',
  concrete: '#9a978c',
  brick: '#97553f',
  darkBrick: '#7a4636',
  iron: '#4b4d54',
  slate: '#5b626b',
  copper: '#6f9d88',
  glass: '#9cb7c0',
  gold: '#d8b25a',
  olive: '#626a43',
  canvas: '#8f8a62',
  wood: '#a57d4d',
  rail: '#5c4f46',
  ballast: '#857d72',
  red: '#c8322b',
  smoke: '#d9d5cd',
  darkSmoke: '#5a5452',
  fire: '#ff8a33',
  crane: '#e0b040',
  scaffold: '#c9a56a',
  tree: '#56713f',
  treeDark: '#46603a',
  water: '#4f86a6',
  hull: '#4a4f57',
  neutralRim: '#b9ad8c',
  neutralFlag: '#e6dcbf',
};

/** Ground under each building, in the colours of the city panel's building tiles. */
export const PLINTH_COLORS: Record<BuildingCategory, string> = {
  economy: '#b88f45',
  military: '#8f9656',
  civic: '#6189ad',
  infrastructure: '#7f8892',
};

/** Buildings that matter stand on a plinth in their category's colour, and are drawn this much taller. */
const PLINTH = 0.32;
const STRETCH = 1.3;

/** Generic housing is muted towards these, so the buildings that matter stand out. */
const MUTE_WALL = '#a39b8b';
const MUTE_ROOF = '#6b635d';

interface Region {
  walls: string[];
  roofs: string[];
}

const REGIONS: Record<string, Region> = {
  uk: { walls: ['#b0705a', '#a25f4b', '#c99a7a', '#d8c6a6'], roofs: ['#59606a', '#4e555e', '#6b5a52'] },
  fr: { walls: ['#e2d6bb', '#d4c6a6', '#cdbb98', '#e8dfca'], roofs: ['#6c7b88', '#5d6974', '#7c6e66'] },
  de: { walls: ['#e3dac6', '#d3c09c', '#c9a988', '#d9cbb0'], roofs: ['#a9493a', '#934034', '#7a4a3e'] },
  it: { walls: ['#dfb47e', '#d39a6a', '#e6cfa6', '#c9805c'], roofs: ['#b8613f', '#a8573a', '#c06d48'] },
  es: { walls: ['#e9dcc0', '#dcc49a', '#d1a674', '#e4d2ae'], roofs: ['#b5633f', '#a45a3c'] },
  pl: { walls: ['#dcc89e', '#cdb185', '#e0d4b8', '#c79f7c'], roofs: ['#9e4a37', '#6a5f58', '#8a4434'] },
  nl: { walls: ['#9c5c46', '#8c5040', '#b7826a', '#a96a50'], roofs: ['#4f4f52', '#6a4b40'] },
  dk: { walls: ['#d9b46a', '#e3cfa0', '#c98d5c'], roofs: ['#a64a38', '#5d6168'] },
  alpine: { walls: ['#ece6d6', '#e0d5bd', '#d4c3a1'], roofs: ['#5e4a3e', '#6d5a4c', '#545a62'] },
};

const NEUTRAL_REGION: Record<string, string> = {
  'nt-netherlands': 'nl',
  'nt-benelux': 'fr',
  'nt-denmark': 'dk',
  'nt-switzerland': 'alpine',
  'nt-austria': 'alpine',
  'nt-czechia': 'de',
  'nt-portugal': 'es',
};

function regionOf(seed: string): Region {
  return REGIONS[NEUTRAL_REGION[seed] ?? seed.slice(0, 2)] ?? REGIONS.de;
}

const GROUND: Record<ArtTerrain, string> = {
  plains: '#8e9468',
  forest: '#76855a',
  hills: '#989170',
  mountains: '#958f84',
  urban: '#9a9384',
  marsh: '#84927a',
};

// ------------------------------------------------------------------ layout

/** Token radius per tier: the city spreads as it grows. */
const RADIUS = [0, 11, 12.6, 14.2, 15.8, 18];
const RIM = 1.5;
/** Blocks are 3.2 wide with 0.8 streets; the two avenues through the middle are 2 wide. */
const HALF = 1.6;
const cellCentre = (a: number) => Math.sign(a) * (2.6 + (Math.abs(a) - 1) * 4);

interface Cell {
  a: number;
  b: number;
  x: number;
  y: number;
  /** 1 next to the centre, growing outwards. */
  ring: number;
}

function cellsWithin(r: number): Cell[] {
  const out: Cell[] = [];
  const idx = [-4, -3, -2, -1, 1, 2, 3, 4];
  for (const a of idx)
    for (const b of idx) {
      const x = cellCentre(a);
      const y = cellCentre(b);
      if (Math.hypot(Math.abs(x) + HALF, Math.abs(y) + HALF) <= r - 0.9) out.push({ a, b, x, y, ring: Math.max(Math.abs(a), Math.abs(b)) });
    }
  return out;
}

/** Buildings with a model of their own on the token (infrastructure other than the depot is drawn elsewhere). */
type Placed = Exclude<ArtBuilding, 'fortifications' | 'railway' | 'coastalBattery'>;

/**
 * Every building's home cell, each district on its own side of town: industry to
 * the right, military to the left, civic at the front, the landmark at the back.
 * Homes are unique and inside the smallest town, except the four corners, which
 * go to buildings that need at least a City. So a new building never moves another.
 */
const HOME: Record<Placed | 'landmark', [number, number]> = {
  landmark: [-1, -1],
  industry: [1, -1],
  refinery: [1, -2],
  housing: [2, -1],
  powerPlant: [2, -2],
  barracks: [-1, 1],
  armsWorks: [-1, 2],
  motorPool: [-2, 1],
  tankWorks: [-2, -1],
  academy: [-2, 2],
  market: [1, 1],
  hospital: [2, 1],
  garrisonHq: [1, 2],
  propaganda: [2, 2],
  university: [-2, -2],
  supplyDepot: [-1, -2],
};

/** The order in which buildings take cells: matters only when a home lies outside a small town. */
const CLAIM_ORDER: Placed[] = [
  'industry', 'market', 'powerPlant', 'refinery', 'housing', 'university', 'barracks', 'academy', 'armsWorks',
  'motorPool', 'tankWorks', 'hospital', 'propaganda', 'garrisonHq', 'supplyDepot',
];

/** Where empty plots go: near the middle, towards the front. */
const PLOT_PREFS: [number, number][] = [[1, 1], [2, 1], [1, 2], [-1, 1], [1, -1], [2, 2], [-2, 1], [2, -1], [-1, 2], [1, -2], [-2, -1], [-1, -2]];

/** Takes the first free preferred cell, else the free cell nearest the first preference. */
function claim(cells: Cell[], free: Set<string>, prefs: [number, number][]): Cell | null {
  const key = (a: number, b: number) => `${a},${b}`;
  for (const [a, b] of prefs) {
    if (free.has(key(a, b))) {
      free.delete(key(a, b));
      return cells.find((c) => c.a === a && c.b === b)!;
    }
  }
  const [pa, pb] = prefs[0];
  let best: Cell | null = null;
  for (const c of cells) {
    if (!free.has(key(c.a, c.b))) continue;
    if (!best || Math.hypot(c.a - pa, c.b - pb) < Math.hypot(best.a - pa, best.b - pb)) best = c;
  }
  if (best) free.delete(key(best.a, best.b));
  return best;
}

export interface CityLayout {
  /** Cell (column, row) of the landmark and of each building drawn on the token. */
  buildings: Partial<Record<Placed | 'landmark', [number, number]>>;
  /** Cells of the empty plots. */
  plots: [number, number][];
}

interface Layout {
  cells: Cell[];
  free: Set<string>;
  landmark: Cell;
  buildings: Map<Placed, Cell>;
  plots: Cell[];
}

function layout(props: CityModelProps, R: number): Layout {
  const cells = cellsWithin(R);
  const free = new Set(cells.map((c) => `${c.a},${c.b}`));
  const landmark = claim(cells, free, [HOME.landmark])!;
  const buildings = new Map<Placed, Cell>();
  for (const b of CLAIM_ORDER) {
    if ((props.buildings[b] ?? 0) <= 0 && props.construction !== b) continue;
    const cell = claim(cells, free, [HOME[b]]);
    if (cell) buildings.set(b, cell);
  }
  const plots: Cell[] = [];
  for (let i = 0; i < (props.freeSlots ?? 0); i++) {
    const cell = claim(cells, free, PLOT_PREFS);
    if (!cell) break;
    plots.push(cell);
  }
  return { cells, free, landmark, buildings, plots };
}

/** Which cell each building of a city takes (for tests and tools). */
export function cityLayout(props: CityModelProps): CityLayout {
  const l = layout(props, RADIUS[clampTier(props.tier)]);
  const at = (c: Cell): [number, number] => [c.a, c.b];
  return {
    buildings: { landmark: at(l.landmark), ...Object.fromEntries([...l.buildings].map(([b, c]) => [b, at(c)])) },
    plots: l.plots.map(at),
  };
}

const clampTier = (t: number) => Math.max(1, Math.min(5, Math.round(t) || 1)) as CityModelProps['tier'];

// ------------------------------------------------------------------ helpers

type Rand = () => number;

/**
 * Model-building context for one cell, in coordinates local to the cell's middle.
 * A lot can stand on a plinth (`base`) and stretch its models upwards (`stretch`).
 */
class Lot {
  constructor(
    readonly s: Scene,
    readonly x: number,
    readonly y: number,
    readonly base = 0,
    readonly stretch = 1,
  ) {}
  /** Height in the scene. Solids start a hair above the ground or plinth, so they always sort in front of it. */
  private z(z: number): number {
    return this.base + (this.base ? 0.002 : 0) + z * this.stretch;
  }
  private at = ([u, v, z]: V3): V3 => [this.x + u, this.y + v, this.z(z)];
  solid(faces: { pts: V3[]; color: string }[]) {
    this.s.solid(faces.map((f) => ({ ...f, pts: f.pts.map(this.at) })));
  }
  box(u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, color: string, top: string | null = color) {
    this.s.box(this.x + u0, this.y + v0, this.x + u1, this.y + v1, this.z(z0), this.z(z1), color, top);
  }
  gable(u0: number, v0: number, u1: number, v1: number, z: number, h: number, color: string, along: 'x' | 'y', ends: string) {
    this.s.gable(this.x + u0, this.y + v0, this.x + u1, this.y + v1, this.z(z), h * this.stretch, color, along, ends);
  }
  hip(u0: number, v0: number, u1: number, v1: number, z: number, h: number, color: string) {
    this.s.hip(this.x + u0, this.y + v0, this.x + u1, this.y + v1, this.z(z), h * this.stretch, color);
  }
  frustum(u: number, v: number, z0: number, z1: number, r0: number, r1: number, sides: number, color: string, top: string | null = color, turn = 0) {
    this.s.frustum(this.x + u, this.y + v, this.z(z0), this.z(z1), r0, r1, sides, color, top, turn);
  }
  dome(u: number, v: number, z0: number, r: number, h: number, color: string) {
    this.s.dome(this.x + u, this.y + v, this.z(z0), r, h * this.stretch, color);
  }
  /** Ground markings; on a plinth they are flat panels on its top, sorted behind whatever stands there. */
  decal(foot: V2[], color: string) {
    if (!this.base) this.s.decal(foot.map(([u, v]) => [this.x + u, this.y + v] as V2), color);
    else this.s.panel(foot.map(([u, v]) => [this.x + u, this.y + v, this.base] as V3), color, { unlit: true });
  }
  rect(u0: number, v0: number, u1: number, v1: number, color: string) {
    this.decal([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], color);
  }
  line(pts: V3[], color: string, width: number) {
    this.s.line(pts.map(this.at), color, width);
  }
  panel(pts: V3[], color: string, unlit = false) {
    this.s.panel(pts.map(this.at), color, { unlit });
  }
  puff(u: number, v: number, z: number, r: number, color: string, opacity: number) {
    this.s.puff([this.x + u, this.y + v, this.z(z)], r, color, opacity);
  }
  /** Flag on a pole, flying towards the viewer's right. */
  flag(u: number, v: number, z0: number, pole: number, color: string, size = 1) {
    const top = z0 + pole;
    this.line([[u, v, z0], [u, v, top]], '#3a3533', 0.22);
    this.panel([[u, v, top], [u + 1.1 * size, v - 0.25 * size, top - 0.05], [u + 1.1 * size, v - 0.25 * size, top - 0.75 * size], [u, v, top - 0.7 * size]], color, true);
  }
  /** Rising smoke from a chimney top. */
  smoke(u: number, v: number, z: number, color = K.smoke, n = 3) {
    for (let i = 0; i < n; i++) this.puff(u + 0.35 * i, v - 0.45 * i, z + 0.6 + i * 0.95, 0.42 + i * 0.2, color, 0.62 - i * 0.12);
  }
}

// ------------------------------------------------------------------ generic housing

function houses(l: Lot, cell: Cell, tier: number, region: Region, r: Rand): void {
  const wall = () => mixColor(pick(r, region.walls), MUTE_WALL, 0.3);
  const roof = () => mixColor(pick(r, region.roofs), MUTE_ROOF, 0.25);
  // Denser and taller towards the middle of bigger cities; kept low so the buildings that matter stand out.
  const density = tier + 0.4 - cell.ring * 0.95 + (r() - 0.5) * 0.9;
  if (density < 1.4) {
    // Cottages in their gardens.
    for (const [u, v] of [[-0.75, -0.65], [0.7, 0.6]] as V2[]) {
      const h = 0.7 + r() * 0.3;
      const w = wall();
      const along = r() < 0.5 ? 'x' : 'y';
      l.box(u - 0.5, v - 0.45, u + 0.5, v + 0.45, 0, h, w, null);
      l.gable(u - 0.56, v - 0.51, u + 0.56, v + 0.51, h, 0.5, roof(), along, w);
    }
    // A garden tree in one of the empty corners.
    if (r() < 0.6) {
      const [u, v] = r() < 0.5 ? [0.8, -0.8] : [-0.8, 0.8];
      l.frustum(u, v, 0, 0.3, 0.1, 0.1, 4, K.wood);
      l.frustum(u, v, 0.3, 1.5 + r() * 0.5, 0.5, 0, 6, pick(r, [K.tree, K.treeDark]), null, r());
    }
  } else if (density < 2.8) {
    // Terraced rows with pitched roofs.
    const h = 0.9 + density * 0.22 + r() * 0.35;
    const along = r() < 0.5 ? 'x' : 'y';
    const rows: [number, number, number, number][] =
      along === 'x'
        ? [[-1.4, -1.4, 1.4, -0.35], [-1.4, 0.35, 1.4, 1.4]]
        : [[-1.4, -1.4, -0.35, 1.4], [0.35, -1.4, 1.4, 1.4]];
    for (const [u0, v0, u1, v1] of rows) {
      const w = wall();
      const hh = h + (r() - 0.5) * 0.5;
      l.box(u0, v0, u1, v1, 0, hh, w, null);
      l.gable(u0 - 0.05, v0 - 0.05, u1 + 0.05, v1 + 0.05, hh, 0.55, roof(), along, w);
    }
  } else if (density < 4.1 || tier < 4) {
    // Apartment block with a hipped (mansard-like) roof.
    const h = 1.5 + density * 0.35 + r() * 0.5;
    const w = wall();
    l.box(-1.3, -1.3, 1.3, 1.3, 0, h, w, null);
    l.hip(-1.35, -1.35, 1.35, 1.35, h, 0.65, roof());
  } else {
    // Office tower with a set-back crown.
    const h = 2.8 + density * 0.5 + r() * 1.0;
    const w = mixColor(pick(r, [...region.walls, K.stone, K.white]), MUTE_WALL, 0.3);
    l.box(-1.2, -1.2, 1.2, 1.2, 0, h, w);
    l.box(-0.7, -0.7, 0.7, 0.7, h, h + 0.8 + r() * 0.6, shadeColor(w, 0.95));
  }
}

function trees(l: Lot, r: Rand, n: number, spread = 1.3): void {
  for (let i = 0; i < n; i++) {
    const u = (r() * 2 - 1) * spread;
    const v = (r() * 2 - 1) * spread;
    const h = 1.4 + r() * 0.9;
    l.frustum(u, v, 0, 0.35, 0.12, 0.12, 4, K.wood);
    l.frustum(u, v, 0.35, 0.35 + h, 0.55 + r() * 0.15, 0, 6, pick(r, [K.tree, K.treeDark]), null, r());
  }
}

function emptyPlot(l: Lot): void {
  l.rect(-1.45, -1.45, 1.45, 1.45, K.dirt);
  // A pale outline and a surveyor's stake: room to build here.
  l.s.groundLine(
    ([[-1.3, -1.3], [1.3, -1.3], [1.3, 1.3], [-1.3, 1.3], [-1.3, -1.3]] as V2[]).map(([u, v]) => [l.x + u, l.y + v] as V2),
    K.plot,
    0.32,
  );
  l.line([[0, 0, 0], [0, 0, 1.3]], K.plot, 0.3);
  l.panel([[0, 0, 1.3], [0.7, -0.15, 1.25], [0.7, -0.15, 0.85], [0, 0, 0.9]], K.plot, true);
}

// ------------------------------------------------------------------ buildings

type Builder = (l: Lot, level: number, ctx: Ctx) => void;

interface Ctx {
  region: Region;
  flag: string;
  r: Rand;
}

const MODELS: Record<Placed, Builder> = {
  industry: (l, level) => {
    // Shed with a sawtooth roof, bigger at each level.
    const v0 = level >= 3 ? -1.0 : -0.5;
    const h = 1.5 + level * 0.25;
    l.box(-1.5, v0, 1.5, 1.5, 0, h, K.brick, null);
    const teeth = 3;
    const w = 3 / teeth;
    for (let i = 0; i < teeth; i++) {
      const u0 = -1.5 + i * w;
      const u1 = u0 + w;
      l.solid([
        { pts: [[u0, v0, h], [u0, 1.5, h], [u1, 1.5, h], [u1, v0, h]], color: K.iron },
        { pts: [[u0, v0, h], [u0, 1.5, h], [u0, 1.5, h + 0.7], [u0, v0, h + 0.7]], color: K.glass },
        { pts: [[u0, v0, h + 0.7], [u0, 1.5, h + 0.7], [u1, 1.5, h], [u1, v0, h]], color: K.iron },
        { pts: [[u0, v0, h], [u1, v0, h], [u0, v0, h + 0.7]], color: K.brick },
        { pts: [[u0, 1.5, h], [u1, 1.5, h], [u0, 1.5, h + 0.7]], color: K.brick },
      ]);
    }
    // One tall chimney per level, behind the shed.
    const stacks: V2[] = [[-1.05, v0 - 0.55], [0.05, v0 - 0.55], [1.1, v0 - 0.55]];
    for (let i = 0; i < Math.min(level, 3); i++) {
      const [u, v] = stacks[i];
      const top = 5.2 + level * 0.5 - i * 0.6;
      l.frustum(u, v, 0, top, 0.42, 0.3, 8, K.darkBrick, K.iron);
      l.smoke(u, v, top);
    }
  },
  market: (l, level) => {
    // A classical exchange: plinth, columns and a pediment facing the front.
    l.box(-1.5, -1.4, 1.5, 1.5, 0, 0.35, K.stone);
    l.box(-1.3, -1.3, 1.3, 0.6, 0.35, 2.4, K.white, null);
    for (let i = 0; i < 5; i++) {
      const u = -1.15 + i * 0.575;
      l.box(u - 0.1, 1.05, u + 0.1, 1.25, 0.35, 2.2, K.white);
    }
    l.box(-1.35, 0.6, 1.35, 1.4, 2.2, 2.55, K.white, null);
    l.box(-1.35, -1.35, 1.35, 0.6, 2.4, 2.55, K.white, null);
    l.gable(-1.4, -1.4, 1.4, 1.45, 2.55, 0.8, K.copper, 'y', K.white);
    if (level >= 2) l.dome(0, -0.4, 3.0, 0.7, 1.0, K.gold);
  },
  powerPlant: (l) => {
    // Monumental brick hall with two tall pale chimneys.
    l.box(-1.5, -0.9, 1.1, 1.5, 0, 2.8, '#8e5a46', '#6d4b40');
    l.box(-1.5, -0.9, 1.1, -0.6, 2.8, 3.1, '#8e5a46');
    for (const u of [-1.1, 0.7]) l.frustum(u, -1.25, 0, 7.2, 0.36, 0.3, 8, '#e3dccb', '#5b5450');
    l.smoke(-1.1, -1.25, 7.2, K.smoke, 2);
    // Transformer yard and a pylon.
    l.box(1.25, 0.4, 1.55, 1.4, 0, 0.6, K.concrete);
    const p: V3 = [1.4, -1.0, 0];
    l.line([[p[0] - 0.3, p[1], 0], [p[0], p[1], 3.6], [p[0] + 0.3, p[1], 0]], '#3e3d40', 0.14);
    l.line([[p[0] - 0.55, p[1], 3.1], [p[0] + 0.55, p[1], 3.1]], '#3e3d40', 0.14);
    l.box(-0.2, 1.5, 0.3, 1.58, 1.0, 1.9, K.gold);
  },
  refinery: (l, level) => {
    const tanks: [number, number, number][] = level >= 2 ? [[-0.85, 0.75, 0.7], [0.75, 0.85, 0.65], [0.85, -0.75, 0.6]] : [[-0.75, 0.75, 0.75], [0.8, 0.8, 0.6]];
    for (const [u, v, r] of tanks) l.frustum(u, v, 0, 1.3, r, r, 12, '#d8d5cb', '#a7a49b');
    // Distillation column with a flare.
    l.frustum(-0.9, -0.9, 0, 5.4, 0.32, 0.28, 8, '#8f969a', '#6b7175');
    l.frustum(0.2, -1.1, 0, 3.6, 0.22, 0.2, 8, '#a9aeb0', '#6b7175');
    l.line([[-0.9, -0.9, 2.2], [0.2, -1.1, 2.2], [0.75, 0.85, 1.3]], '#5d6265', 0.16);
    l.line([[0.2, -1.1, 3.6], [0.2, -1.1, 4.4]], '#5d6265', 0.12);
    l.puff(0.2, -1.1, 4.7, 0.32, K.fire, 0.9);
  },
  housing: (l, level) => {
    // Modern slab blocks in rows, one per level.
    const rows = [-1.0, 0.1, 1.15].slice(0, Math.max(1, level));
    for (const v of rows) {
      l.box(-1.45, v - 0.42, 1.45, v + 0.42, 0, 3.4, '#e6decc', '#c9c2b2');
      l.box(-1.45, v - 0.42, 1.45, v + 0.42, 3.4, 3.55, '#bdb6a6');
    }
  },
  university: (l) => {
    // Collegiate hall with a clock tower and spire.
    l.box(-1.5, -1.3, 1.5, 1.4, 0, 2.0, '#cbb894', null);
    l.hip(-1.55, -1.35, 1.55, 1.45, 2.0, 0.9, K.slate);
    l.box(-0.45, -0.45, 0.45, 0.45, 2.0, 4.6, '#d6c49f');
    l.panel([[0.46, -0.25, 4.1], [0.46, 0.25, 4.1], [0.46, 0.25, 3.6], [0.46, -0.25, 3.6]], '#f2ead2', true);
    l.panel([[-0.25, 0.46, 4.1], [0.25, 0.46, 4.1], [0.25, 0.46, 3.6], [-0.25, 0.46, 3.6]], '#f2ead2', true);
    l.hip(-0.5, -0.5, 0.5, 0.5, 4.6, 1.8, K.slate);
  },
  barracks: (l, _level, { flag, r }) => {
    // Two long blocks around a parade ground.
    l.rect(-0.6, -0.6, 1.55, 1.55, K.sand);
    const wall = '#aaa274';
    const roof = '#56603d';
    l.box(-1.5, -1.5, 1.5, -0.65, 0, 1.15, wall, null);
    l.gable(-1.55, -1.55, 1.55, -0.6, 1.15, 0.6, roof, 'x', wall);
    l.box(-1.5, -0.65, -0.65, 1.5, 0, 1.15, wall, null);
    l.gable(-1.55, -0.65, -0.6, 1.55, 1.15, 0.6, roof, 'y', wall);
    // Troops drilling.
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const u = -0.15 + i * 0.45 + (r() - 0.5) * 0.04;
        const v = -0.15 + j * 0.45;
        l.box(u - 0.1, v - 0.1, u + 0.1, v + 0.1, 0, 0.42, K.olive);
      }
    l.flag(1.25, 1.25, 0, 3.2, flag);
  },
  academy: (l, _level, { flag }) => {
    // A small castle: keep with battlements and two round towers.
    const stone = '#a99d89';
    l.box(-1.1, -1.1, 1.1, 1.1, 0, 2.6, stone);
    for (let i = 0; i < 4; i++) {
      const u = -0.95 + i * 0.63;
      l.box(u - 0.14, 0.96, u + 0.14, 1.1, 2.6, 2.95, stone);
      l.box(0.96, u - 0.14, 1.1, u + 0.14, 2.6, 2.95, stone);
    }
    for (const [u, v] of [[-1.1, 1.1], [1.1, -1.1]] as V2[]) {
      l.frustum(u, v, 0, 3.3, 0.5, 0.5, 10, '#b4a892');
      l.frustum(u, v, 3.3, 4.6, 0.6, 0, 10, K.slate);
    }
    l.flag(0, 0, 2.6, 2.0, flag, 0.8);
  },
  armsWorks: (l) => {
    // Gun shop: red-brick hall, a gantry crane and stacked shells.
    l.box(-1.5, -1.5, 0.4, 1.5, 0, 2.0, K.darkBrick, null);
    l.gable(-1.55, -1.55, 0.45, 1.55, 2.0, 0.8, K.iron, 'y', K.darkBrick);
    l.line([[0.6, -1.4, 0], [0.6, -1.4, 2.7], [0.6, 1.4, 2.7], [0.6, 1.4, 0]], '#c9772f', 0.2);
    l.line([[1.5, -1.4, 0], [1.5, -1.4, 2.7], [1.5, 1.4, 2.7], [1.5, 1.4, 0]], '#c9772f', 0.2);
    l.line([[0.6, 0.2, 2.7], [1.5, 0.2, 2.7]], '#c9772f', 0.2);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 2; j++) l.frustum(0.85 + j * 0.42, 0.7 + i * 0.28 - 0.3, 0, 0.55, 0.13, 0.13, 6, '#c9a14a', '#9c7a33');
    // A finished field gun.
    l.box(0.75, -1.1, 1.35, -0.6, 0, 0.35, K.olive);
    l.line([[1.05, -0.85, 0.35], [1.05, -2.0, 0.85]], '#3b3d33', 0.22);
  },
  motorPool: (l) => {
    // Garage with doors, and lorries parked in front.
    l.box(-1.5, -1.5, 1.5, -0.35, 0, 1.4, '#9a9670', '#5f6346');
    for (let i = 0; i < 3; i++) {
      const u = -1.15 + i * 1.0;
      l.panel([[u, -0.34, 0], [u + 0.7, -0.34, 0], [u + 0.7, -0.34, 1.0], [u, -0.34, 1.0]], '#3d3934', true);
    }
    for (let i = 0; i < 3; i++) {
      const u = -1.05 + i * 1.05;
      l.box(u - 0.28, 0.0, u + 0.28, 0.42, 0, 0.55, K.olive);
      l.box(u - 0.3, 0.42, u + 0.3, 1.4, 0, 0.4, '#4f5537', null);
      l.gable(u - 0.3, 0.42, u + 0.3, 1.4, 0.4, 0.4, K.canvas, 'y', K.canvas);
    }
  },
  tankWorks: (l) => {
    // Assembly hall with a tank rolling out.
    l.box(-1.5, -1.5, 1.5, 0.1, 0, 2.3, '#5f6655', null);
    l.gable(-1.55, -1.55, 1.55, 0.15, 2.3, 0.6, K.iron, 'x', '#5f6655');
    l.panel([[-0.6, 0.11, 0], [0.6, 0.11, 0], [0.6, 0.11, 1.6], [-0.6, 0.11, 1.6]], '#2f312c', true);
    const hull = '#5d6440';
    l.box(-0.7, 0.55, 0.7, 1.4, 0, 0.42, '#3f4232');
    l.box(-0.65, 0.6, 0.65, 1.35, 0.42, 0.62, hull);
    l.box(-0.3, 0.75, 0.3, 1.2, 0.62, 0.92, hull);
    l.line([[0, 0.98, 0.78], [1.25, 0.98, 0.82]], '#2f312c', 0.16);
  },
  hospital: (l) => {
    // White wards with a red cross on the roof.
    l.box(-1.45, -1.2, 1.45, 1.2, 0, 2.1, '#efede6', '#dedbd2');
    l.box(-0.55, 1.2, 0.55, 1.55, 0, 1.2, '#efede6', '#dedbd2');
    const z = 2.12;
    l.panel([[-0.25, -0.85, z], [0.25, -0.85, z], [0.25, 0.85, z], [-0.25, 0.85, z]], K.red, true);
    l.panel([[-0.85, -0.25, z], [0.85, -0.25, z], [0.85, 0.25, z], [-0.85, 0.25, z]], K.red, true);
  },
  propaganda: (l, _level, { flag }) => {
    // Broadcasting house with a giant poster, and a radio mast.
    l.box(-1.4, -0.2, 1.0, 1.4, 0, 1.9, '#d9cdb5', '#b9ae98');
    l.panel([[-1.2, 1.41, 0.35], [0.8, 1.41, 0.35], [0.8, 1.41, 1.7], [-1.2, 1.41, 1.7]], flag, true);
    l.panel([[-0.7, 1.42, 0.65], [0.3, 1.42, 0.65], [0.3, 1.42, 1.4], [-0.7, 1.42, 1.4]], '#f1e7cf', true);
    const [mu, mv] = [0.6, -0.9];
    const top = 8.2;
    l.line([[mu - 0.55, mv, 0], [mu, mv, top], [mu + 0.55, mv, 0]], '#7c2f2a', 0.16);
    l.line([[mu, mv - 0.55, 0], [mu, mv, top], [mu, mv + 0.55, 0]], '#7c2f2a', 0.16);
    for (const z of [1.8, 3.6, 5.4]) {
      const w = 0.55 * (1 - z / top);
      l.line([[mu - w, mv, z], [mu + w, mv, z]], '#7c2f2a', 0.12);
    }
    l.puff(mu, mv, top + 0.2, 0.22, '#ff5a45', 1);
  },
  garrisonHq: (l, _level, { flag }) => {
    // Requisitioned headquarters behind sandbags, under a large flag.
    l.box(-1.3, -1.3, 1.1, 0.6, 0, 2.2, '#8d8f86', '#6f716a');
    l.box(-1.5, 1.0, 1.5, 1.35, 0, 0.45, '#a08a63');
    l.box(1.15, -1.5, 1.5, 1.0, 0, 0.45, '#a08a63');
    l.flag(0.6, 0.85, 0, 4.4, flag, 1.4);
  },
  supplyDepot: (l, _level, { r }) => {
    // Warehouse with crates and fuel drums stacked outside.
    l.box(-1.5, -1.5, 1.5, -0.3, 0, 1.4, '#a69479', null);
    l.gable(-1.55, -1.55, 1.55, -0.25, 1.4, 0.55, '#6b6a60', 'x', '#a69479');
    for (let i = 0; i < 4; i++) {
      const u = -1.2 + i * 0.62;
      const h = 0.45 * (1 + Math.floor(r() * 3));
      l.box(u - 0.25, 0.05, u + 0.25, 0.55, 0, h, K.wood, '#c49a63');
    }
    for (let i = 0; i < 3; i++) l.frustum(-1.0 + i * 0.5, 1.15, 0, 0.55, 0.2, 0.2, 7, '#4f5a3a', '#3d4530');
    l.box(0.55, 0.85, 1.45, 1.45, 0, 0.5, K.wood, '#c49a63');
  },
};

function construction(l: Lot): void {
  l.rect(-1.6, -1.6, 1.6, 1.6, K.dirt);
  // Half-built walls inside scaffolding, and a tower crane.
  l.box(-1.1, -1.1, 1.1, 1.1, 0, 1.2, K.concrete, '#7d7a72');
  const h = 2.4;
  const c: V2[] = [[-1.25, -1.25], [1.25, -1.25], [1.25, 1.25], [-1.25, 1.25]];
  for (const [u, v] of c) l.line([[u, v, 0], [u, v, h]], K.scaffold, 0.13);
  for (const z of [0.8, 1.6, h]) l.line([...c, c[0]].map(([u, v]) => [u, v, z] as V3), K.scaffold, 0.12);
  const [cu, cv] = [-1.35, 1.35];
  l.line([[cu, cv, 0], [cu, cv, 5.4]], K.crane, 0.24);
  l.line([[cu - 0.9, cv - 0.9, 5.4], [cu + 2.6, cv - 0.9 + 0.0, 5.4]], K.crane, 0.2);
  l.line([[cu + 2.0, cv - 0.9, 5.4], [cu + 2.0, cv - 0.9, 3.0]], '#4a4542', 0.08);
  l.box(cu - 1.0, cv - 1.05, cu - 0.6, cv - 0.75, 5.0, 5.4, K.concrete);
}

/** A tower crane standing at a point: work in progress beside a building or at the town edge. */
function crane(s: Scene, x: number, y: number): void {
  s.line([[x, y, 0], [x, y, 5.6]], K.crane, 0.24);
  s.line([[x + 0.8, y, 5.6], [x - 3.0, y, 5.6]], K.crane, 0.2);
  s.line([[x - 2.2, y, 5.6], [x - 2.2, y, 3.6]], '#4a4542', 0.08);
}

// ------------------------------------------------------------------ landmarks

type LandmarkKind = 'church' | 'cathedral' | 'dome' | 'clocktower' | 'eiffel' | 'reichstag' | 'palace' | 'castle';

const NATIONAL_LANDMARKS: Record<string, LandmarkKind> = {
  'uk-london': 'clocktower',
  'fr-paris': 'eiffel',
  'de-berlin': 'reichstag',
  'it-rome': 'dome',
  'es-madrid': 'palace',
  'pl-warsaw': 'castle',
  // A domed parliament on the river, like Berlin's.
  'hu-budapest': 'reichstag',
};

function landmark(l: Lot, kind: LandmarkKind, ctx: Ctx): void {
  const { region } = ctx;
  l.rect(-1.6, -1.6, 1.6, 1.6, K.plaza);
  switch (kind) {
    case 'church': {
      const w = pick(ctx.r, region.walls);
      l.box(-1.3, -0.65, 0.6, 0.65, 0, 1.6, w, null);
      l.gable(-1.35, -0.7, 0.6, 0.7, 1.6, 0.9, pick(ctx.r, region.roofs), 'x', w);
      l.box(0.6, -0.5, 1.5, 0.5, 0, 3.2, w);
      l.frustum(1.05, 0, 3.2, 5.6, 0.62, 0, 4, K.copper, null, Math.PI / 4);
      break;
    }
    case 'cathedral': {
      const w = K.stone;
      l.box(-1.5, -0.7, 0.4, 0.7, 0, 2.3, w, null);
      l.gable(-1.55, -0.75, 0.4, 0.75, 2.3, 1.2, K.slate, 'x', w);
      for (const v of [-0.75, 0.75]) {
        l.box(0.4, v - 0.55, 1.5, v + 0.55, 0, 4.4, w);
        l.frustum(0.95, v, 4.4, 7.4, 0.62, 0, 4, K.slate, null, Math.PI / 4);
      }
      break;
    }
    case 'dome': {
      l.box(-1.55, -1.55, 1.55, 1.55, 0, 2.0, '#e1d6bd');
      for (let i = 0; i < 4; i++) {
        const u = -1.2 + i * 0.8;
        l.box(u - 0.12, 1.55, u + 0.12, 1.75, 0, 1.8, '#ece4d0');
      }
      l.box(-1.55, 1.55, 1.55, 1.8, 1.8, 2.15, '#e1d6bd');
      l.frustum(0, 0, 2.0, 3.0, 1.15, 1.1, 12, '#ddd1b6');
      l.dome(0, 0, 3.0, 1.15, 1.9, '#8a9aa4');
      l.frustum(0, 0, 4.9, 5.6, 0.28, 0.22, 8, '#e8e0cc');
      l.frustum(0, 0, 5.6, 6.2, 0.26, 0, 8, K.gold);
      break;
    }
    case 'clocktower': {
      // Parliament with its clock tower.
      const w = '#cdb98e';
      l.box(-1.5, -0.9, 0.5, 0.9, 0, 2.0, w, null);
      l.gable(-1.55, -0.95, 0.55, 0.95, 2.0, 0.9, K.slate, 'x', w);
      for (const u of [-1.4, -0.5, 0.4]) l.frustum(u, 0.95, 2.0, 3.2, 0.12, 0, 4, '#b9a57c');
      l.box(0.7, -0.5, 1.5, 0.3, 0, 7.6, w);
      for (const z of [6.2]) {
        l.panel([[1.51, -0.4, z + 0.75], [1.51, 0.2, z + 0.75], [1.51, 0.2, z], [1.51, -0.4, z]], '#f3ead0', true);
        l.panel([[0.8, 0.31, z + 0.75], [1.4, 0.31, z + 0.75], [1.4, 0.31, z], [0.8, 0.31, z]], '#f3ead0', true);
      }
      l.frustum(1.1, -0.1, 7.6, 10.2, 0.6, 0, 4, '#4f5559', null, Math.PI / 4);
      l.line([[1.1, -0.1, 10.2], [1.1, -0.1, 10.8]], K.gold, 0.14);
      break;
    }
    case 'eiffel': {
      // Iron lattice tower over a small park.
      l.rect(-1.6, -1.6, 1.6, 1.6, K.lawn);
      const col = '#6e5136';
      const leg = (sx: number, sy: number): V3[] => [
        [sx * 1.4, sy * 1.4, 0],
        [sx * 0.95, sy * 0.95, 2.0],
        [sx * 0.55, sy * 0.55, 4.6],
        [sx * 0.28, sy * 0.28, 8.0],
        [sx * 0.12, sy * 0.12, 10.6],
      ];
      const legs = [leg(-1, -1), leg(1, -1), leg(1, 1), leg(-1, 1)];
      for (const lg of legs) l.line(lg, col, 0.26);
      for (const k of [1, 2, 3]) l.line([...legs.map((lg) => lg[k]), legs[0][k]], col, k === 1 ? 0.34 : 0.22);
      // Arches between the legs on the near sides.
      l.line([[1.4, -1.4, 0], [1.25, 0, 1.15], [1.4, 1.4, 0]], col, 0.18);
      l.line([[-1.4, 1.4, 0], [0, 1.25, 1.15], [1.4, 1.4, 0]], col, 0.18);
      l.line([[0, 0, 10.6], [0, 0, 12.4]], col, 0.18);
      break;
    }
    case 'reichstag': {
      const w = '#cbbf9f';
      l.box(-1.45, -1.2, 1.45, 1.2, 0, 2.2, w, '#a29880');
      for (const [u, v] of [[-1.45, -1.2], [1.45, -1.2], [1.45, 1.2], [-1.45, 1.2]] as V2[]) l.box(u - 0.4, v - 0.4, u + 0.4, v + 0.4, 0, 2.9, w);
      for (let i = 0; i < 4; i++) {
        const u = -0.75 + i * 0.5;
        l.box(u - 0.1, 1.2, u + 0.1, 1.4, 0, 2.0, '#d8ceb2');
      }
      l.gable(-1.0, 1.15, 1.0, 1.55, 2.2, 0.5, w, 'y', w);
      l.frustum(0, 0, 2.2, 2.7, 0.9, 0.9, 10, '#8b8f86');
      l.dome(0, 0, 2.7, 0.9, 1.3, '#8fa6a6');
      l.flag(0, 0, 4.0, 1.4, ctx.flag, 0.8);
      break;
    }
    case 'palace': {
      const w = '#ece6d5';
      l.box(-1.55, -1.55, 1.55, 1.55, 0, 2.3, w, '#d8d0bb');
      for (const [u, v] of [[-1.55, -1.55], [1.55, -1.55], [1.55, 1.55], [-1.55, 1.55]] as V2[]) {
        l.box(u - 0.35, v - 0.35, u + 0.35, v + 0.35, 0, 2.7, w, null);
        l.hip(u - 0.38, v - 0.38, u + 0.38, v + 0.38, 2.7, 0.6, K.slate);
      }
      l.frustum(0, 0, 2.3, 3.0, 0.55, 0.55, 8, w);
      l.dome(0, 0, 3.0, 0.55, 0.9, K.slate);
      l.flag(0.9, 0.9, 2.3, 1.5, ctx.flag, 0.7);
      break;
    }
    case 'castle': {
      const w = '#c98e74';
      l.box(-1.5, -1.5, 1.5, 0.2, 0, 2.2, w, null);
      l.hip(-1.55, -1.55, 1.55, 0.25, 2.2, 0.8, '#9c4a36');
      l.box(-1.5, 0.2, -0.2, 1.5, 0, 2.2, w, null);
      l.hip(-1.55, 0.2, -0.15, 1.55, 2.2, 0.8, '#9c4a36');
      l.box(0.3, 0.4, 1.1, 1.2, 0, 5.2, w);
      l.frustum(0.7, 0.8, 5.2, 6.0, 0.48, 0.3, 8, K.copper);
      l.frustum(0.7, 0.8, 6.0, 8.0, 0.3, 0, 8, K.copper);
      break;
    }
  }
}

// ------------------------------------------------------------------ infrastructure

function ring(r: number, sides: number, turn = 0): V2[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = turn + (i / sides) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r] as V2;
  });
}

/** Town walls around the token's edge, with gates on the avenues; taller and towered at higher levels. */
function walls(s: Scene, R: number, level: number): void {
  const r0 = R - 0.95;
  const r1 = R - 0.25;
  const h = [0, 0.75, 1.15, 1.45][level];
  const color = level === 1 ? '#8c7b55' : '#a99f8b';
  const segs = 32;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    // Leave gates where the avenues leave town.
    const mid = (a0 + a1) / 2;
    if (Math.abs(Math.sin(mid * 2)) < 0.12) continue;
    s.prism(
      [
        [Math.cos(a0) * r0, Math.sin(a0) * r0],
        [Math.cos(a0) * r1, Math.sin(a0) * r1],
        [Math.cos(a1) * r1, Math.sin(a1) * r1],
        [Math.cos(a1) * r0, Math.sin(a1) * r0],
      ],
      0,
      h,
      color,
    );
  }
  if (level >= 2) {
    const towers = level >= 3 ? 8 : 4;
    for (let i = 0; i < towers; i++) {
      const a = Math.PI / 4 + (i / towers) * Math.PI * 2;
      const [x, y] = [Math.cos(a) * (R - 0.6), Math.sin(a) * (R - 0.6)];
      s.frustum(x, y, 0, h + 0.9, 0.85, 0.75, 8, '#b4ab96', '#8f887a');
    }
  }
}

/** Tracks along the cross avenue and a train pulling in. */
function railway(s: Scene, R: number): void {
  const L = Math.sqrt(R * R - 1) - 0.1;
  s.decal([[-L, -0.75], [L, -0.75], [L, 0.75], [-L, 0.75]], K.ballast);
  for (let x = -L + 0.4; x < L - 0.2; x += 0.7) s.groundLine([[x, -0.55], [x, 0.55]], '#6e5a48', 0.22);
  for (const y of [-0.32, 0.32]) s.groundLine([[-L, y], [L, y]], K.rail, 0.16);
  // Locomotive and wagons.
  const x0 = 3.2;
  s.box(x0, -0.42, x0 + 1.9, 0.42, 0.15, 0.95, '#2f3033');
  s.box(x0 - 0.1, -0.5, x0 + 0.6, 0.5, 0.15, 1.45, '#3a3b3f', '#7a2e27');
  s.frustum(x0 + 1.55, 0, 0.95, 1.5, 0.16, 0.2, 6, '#2b2b2e');
  s.puff([x0 + 1.75, -0.3, 1.9], 0.4, '#efece6', 0.7);
  s.puff([x0 + 2.05, -0.8, 2.5], 0.55, '#efece6', 0.5);
  const wagons = ['#7d4b37', '#6d6a5c', '#7d4b37'];
  wagons.forEach((c, i) => {
    const wx = x0 - 1.7 - i * 1.55;
    s.box(wx, -0.45, wx + 1.4, 0.45, 0.15, 1.0, c, shadeColor(c, 0.85));
  });
}

/** A steamer in a basin off the town's seaward (upper right) edge, and gun pits on the avenue that leads to it. */
function harbour(s: Scene, R: number, batteries: number): void {
  const sx = 2.4;
  const sy = -R - 2.1;
  s.decal(ring(3.1, 14).map(([x, y]) => [sx + x * 1.25, sy + y * 0.75] as V2), K.water);
  s.box(-0.9, sy + 0.6, 0.9, -R - 0.2, -0.2, 0.2, '#8f8a80');
  s.prism([[sx - 2.2, sy - 0.6], [sx + 1.6, sy - 0.6], [sx + 2.4, sy], [sx + 1.6, sy + 0.6], [sx - 2.2, sy + 0.6]], -0.3, 0.55, K.hull, '#8f7a5a');
  s.box(sx - 1.1, sy - 0.45, sx + 0.5, sy + 0.45, 0.55, 1.25, '#e2dccb');
  s.frustum(sx - 0.3, sy, 1.25, 2.3, 0.28, 0.26, 8, '#b84a35', '#2f2f31');
  for (let i = 0; i < batteries; i++) {
    const y = -(R - 1.0 - i * 1.7);
    s.frustum(0, y, 0, 0.45, 0.8, 0.72, 10, '#8d8c84', '#77766f');
    s.box(-0.3, y - 0.3, 0.3, y + 0.3, 0.45, 0.8, '#5c6150');
    s.line([[0, y, 0.65], [0.4, y - 2.0, 1.0]], '#2f312c', 0.24);
  }
}

// ------------------------------------------------------------------ assembly

export function buildCityModel(props: CityModelProps): CityModel {
  const tier = clampTier(props.tier);
  const R = RADIUS[tier];
  const s = new Scene();
  const region = regionOf(props.seed);
  const flag = props.nationColor ?? K.neutralFlag;
  const ctxFor = (key: string): Ctx => ({ region, flag, r: rngOf(props.seed, key) });

  // The token: owner-coloured rim, ground on top, avenues and a square.
  const rim = props.nationColor ? mixColor(props.nationColor, '#2a2622', 0.18) : K.neutralRim;
  const ground = GROUND[props.terrain] ?? GROUND.plains;
  s.frustum(0, 0, -RIM, -0.02, R, R, 36, rim, null);
  s.decal(ring(R, 36), mixColor(ground, K.street, 0.55), 0);
  const L = Math.sqrt(R * R - 1) - 0.1;
  s.decal([[-1, -L], [1, -L], [1, L], [-1, L]], K.avenue);
  if (!props.buildings.railway) s.decal([[-L, -1], [L, -1], [L, 1], [-L, 1]], K.avenue);
  s.decal(ring(1.7, 16), K.plaza);

  const { cells, free, landmark: lmCell, buildings: cellOf, plots } = layout(props, R);
  const placed: { cell: Cell; build: (l: Lot) => void }[] = [];

  // The landmark: the capital's, or a parish church.
  const lmKind: LandmarkKind = props.capital ? (NATIONAL_LANDMARKS[props.seed] ?? 'cathedral') : 'church';
  placed.push({ cell: lmCell, build: (l) => landmark(l, lmKind, ctxFor('landmark')) });

  const level = (b: ArtBuilding) => props.buildings[b] ?? 0;
  for (const [b, cell] of cellOf) {
    const lv = level(b);
    const building = lv === 0;
    const model = MODELS[b];
    const pad = PLINTH_COLORS[BUILDING_CATEGORY[b]];
    placed.push({
      cell,
      build: (l) => {
        s.box(l.x - 1.9, l.y - 1.9, l.x + 1.9, l.y + 1.9, 0, PLINTH, pad);
        const raised = new Lot(s, l.x, l.y, PLINTH, STRETCH);
        if (building) construction(raised);
        else model(raised, lv, ctxFor(b));
      },
    });
  }
  // Work in progress elsewhere: a crane beside an upgrade, or at the town gate for walls, rails and guns.
  const job = props.construction;
  const upgrading = job && job in HOME ? cellOf.get(job as Placed) : undefined;
  if (job && upgrading && level(job) > 0) crane(s, upgrading.x + 1.85, upgrading.y + 1.85);
  else if (job && !upgrading) crane(s, 1.6, R - 1.6);

  for (const cell of plots) placed.push({ cell, build: emptyPlot });

  // Everything else is town: houses, with parks on the outskirts.
  const parkChance = props.terrain === 'forest' ? 0.3 : props.terrain === 'marsh' || props.terrain === 'plains' ? 0.14 : 0.08;
  for (const cell of cells) {
    if (!free.has(`${cell.a},${cell.b}`)) continue;
    const r = rngOf(props.seed, `cell ${cell.a},${cell.b}`);
    const park = cell.ring >= 2 && r() < parkChance;
    placed.push({
      cell,
      build: (l) => {
        if (park) {
          l.rect(-1.6, -1.6, 1.6, 1.6, K.lawn);
          trees(l, r, 3 + Math.floor(r() * 2));
        } else {
          l.rect(-1.6, -1.6, 1.6, 1.6, mixColor(ground, K.yard, 0.5));
          houses(l, cell, tier, region, r);
        }
      },
    });
  }
  for (const p of placed) p.build(new Lot(s, p.cell.x, p.cell.y));

  if (level('fortifications') > 0) walls(s, R, Math.min(3, level('fortifications')));
  if (level('railway') > 0) railway(s, R);
  if (props.coastal || level('coastalBattery') > 0) harbour(s, R, Math.min(2, level('coastalBattery')));

  // Trees around the edge in wooded country.
  if (props.terrain === 'forest' || props.terrain === 'hills') {
    const r = rngOf(props.seed, 'edge trees');
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.1 + i * 0.27) + r() * 0.15;
      const l = new Lot(s, Math.cos(a) * (R - 1.4), Math.sin(a) * (R - 1.4));
      trees(l, r, 1, 0.1);
    }
  }

  if (props.battle) {
    const r = rngOf(props.seed, 'battle');
    for (let i = 0; i < 3; i++) {
      const c = cells[Math.floor(r() * cells.length)];
      s.puff([c.x, c.y, 2.2], 0.6, K.fire, 0.85);
      for (let k = 0; k < 3; k++) s.puff([c.x + k * 0.5, c.y - k * 0.6, 3 + k * 1.3], 0.8 + k * 0.35, K.darkSmoke, 0.7 - k * 0.15);
    }
  }

  const { markup, bounds } = s.render();
  const [x0, y0, x1, y1] = bounds;
  const w = x1 - x0;
  const h = y1 - y0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}">${markup}</svg>`;
  return { svg, width: w, height: h, cx: -x0, cy: -y0, rx: R * Math.SQRT2 };
}
