// Low-poly 3D model of a city for the strategy map, drawn as part of the map
// rather than standing on a token. On the ground, a lace of streets, densest in
// the old town and fraying into the countryside, with main roads that run on
// towards the neighbouring cities. On it, the old town's houses packed round the
// landmark and the owner's flag, and around them, each on a pad in its
// category's colour, a recognisable model of every building the city has, with
// empty plots for unused building slots. Near the sea everything stays on land
// (the port is drawn on the real coast: buildPortModel). Deterministic per seed,
// and every building has a home of its own in its district (industry to the
// right, the military to the left, civic buildings at the front), so building
// something never moves the rest.
//
// A model comes in two layers: the flat streets, which the map clips to the
// land, and everything standing on them.
import { drawStreets, Envelope, streetPlan, type RailLine } from './cityGround';
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
  /** Screen directions (radians: 0 right, π/2 down) of the roads out of town, towards the neighbouring cities. Made up from the seed if absent. */
  exits?: number[];
  /**
   * For a city near the sea or the edge of the map: how far the land reaches from
   * its anchor, in model units, in evenly spaced directions clockwise from the right
   * (REACH_DIRECTIONS of them, say). Buildings stay on land. Absent: land all round.
   */
  reach?: number[];
  /** Owner's colour for the flags; neutral if absent. */
  nationColor?: string;
  battle?: boolean;
}

/** How many directions the map samples for `reach`. */
export const REACH_DIRECTIONS = 16;

/** One drawing of a model. */
export interface ModelLayer {
  /** Standalone SVG document. */
  svg: string;
  /** Size of the drawing in model units. */
  width: number;
  height: number;
  /** Where the city's map anchor (for a port, its spot on the coast) sits in the drawing. */
  cx: number;
  cy: number;
}

export interface CityModel {
  /** Streets and the railway, flat on the map. */
  ground: ModelLayer;
  /** Everything standing on them. */
  structures: ModelLayer;
  /** The built-up area, from the anchor in model units: its middle across the screen, half its width, and how far it reaches up and down. */
  mid: number;
  rx: number;
  back: number;
  front: number;
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
  plaza: '#d3c8ae',
  lawn: '#7f8a5e',
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
  red: '#c8322b',
  smoke: '#d9d5cd',
  darkSmoke: '#5a5452',
  fire: '#ff8a33',
  crane: '#e0b040',
  scaffold: '#c9a56a',
  tree: '#56713f',
  treeDark: '#46603a',
  hull: '#4a4f57',
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

/** Countries that build like a neighbour, by the province id's country prefix. */
const REGION_ALIAS: Record<string, string> = {
  be: 'fr',
  ch: 'alpine',
  at: 'alpine',
  cz: 'de',
  pt: 'es',
  sk: 'de',
  si: 'alpine',
  hr: 'it',
  rs: 'it',
  ro: 'de',
  ie: 'uk',
};

function regionOf(seed: string): Region {
  const country = seed.slice(0, 2);
  return REGIONS[REGION_ALIAS[country] ?? country] ?? REGIONS.de;
}

// ------------------------------------------------------------------ layout
//
// Positions are worked out on the screen's ground plane (x right, y down, the map
// anchor at the origin), like the streets; solids stand at the world point under
// them.

type Rand = () => number;

const TAU = Math.PI * 2;

/** The world point under a point of the screen's ground plane: the isometric projection undone at z = 0. */
const toWorld = ([u, v]: V2): V2 => [v + u / 2, v - u / 2];

/** Depth over width of a city on screen. */
const ASPECT = 0.66;
/** Half-width of the old town round the landmark, per tier (screen units). */
const OLD_TOWN = [0, 6.6, 7.6, 8.6, 9.8, 11];
/** Half-width of the lace of streets, per tier. */
const SPREAD = [0, 15, 17.5, 20, 23, 26];
/** An old-town block, its streets included (world units). */
const BLOCK = 2.2;
/** Half the side of a building's pad (world units); on screen a diamond twice as wide as it is deep. */
const PAD = 1.9;
/** Depth over width of the rings the buildings take round the old town. */
const HOME_SQUASH = 0.62;

type Poly = V2[];

const diamond = ([u, v]: V2, h: number): Poly => [[u + 2 * h, v], [u, v + h], [u - 2 * h, v], [u, v - h]];

function ellipse([u, v]: V2, a: number, b: number, n = 24): Poly {
  return Array.from({ length: n }, (_, i) => [u + Math.cos((i / n) * TAU) * a, v + Math.sin((i / n) * TAU) * b] as V2);
}

/** Rectangle of half-length `l` along screen direction `angle` and half-width `w` across it. */
function strip([u, v]: V2, angle: number, l: number, w: number): Poly {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return [
    [u + c * l - s * w, v + s * l + c * w],
    [u - c * l - s * w, v - s * l + c * w],
    [u - c * l + s * w, v - s * l - c * w],
    [u + c * l + s * w, v + s * l - c * w],
  ];
}

function boxOf(poly: Poly): [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of poly) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  return [x0, y0, x1, y1];
}

/** Do two convex polygons come within `gap` of each other? (Separating axes.) */
function overlaps(a: Poly, b: Poly, gap = 0): boolean {
  const [ax0, ay0, ax1, ay1] = boxOf(a);
  const [bx0, by0, bx1, by1] = boxOf(b);
  if (ax1 + gap <= bx0 || bx1 + gap <= ax0 || ay1 + gap <= by0 || by1 + gap <= ay0) return false;
  const apart = (poly: Poly) => {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const nx = (q[1] - p[1]) / len;
      const ny = (p[0] - q[0]) / len;
      let amin = Infinity;
      let amax = -Infinity;
      let bmin = Infinity;
      let bmax = -Infinity;
      for (const v of a) {
        const d = v[0] * nx + v[1] * ny;
        if (d < amin) amin = d;
        if (d > amax) amax = d;
      }
      for (const v of b) {
        const d = v[0] * nx + v[1] * ny;
        if (d < bmin) bmin = d;
        if (d > bmax) bmax = d;
      }
      if (amax + gap <= bmin || bmax + gap <= amin) return true;
    }
    return false;
  };
  return !apart(a) && !apart(b);
}

/** Convex hull (Andrew's monotone chain): anticlockwise in x-right, y-up terms. */
function convexHull(points: V2[]): Poly {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: V2[]) => {
    const out: V2[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(pts), ...half([...pts].reverse())];
}

/** A convex hull pushed out by `d` (mitred, bevelled at sharp corners). */
function inflate(poly: Poly, d: number): Poly {
  const n = poly.length;
  const normal = (a: V2, b: V2): V2 => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[1] - a[1]) / l, (a[0] - b[0]) / l];
  };
  const out: Poly = [];
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const n1 = normal(poly[(i - 1 + n) % n], p);
    const n2 = normal(p, poly[(i + 1) % n]);
    const c = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    if (c > 0.6) out.push([p[0] + (d * (n1[0] + n2[0])) / c, p[1] + (d * (n1[1] + n2[1])) / c]);
    else out.push([p[0] + d * n1[0], p[1] + d * n1[1]], [p[0] + d * n2[0], p[1] + d * n2[1]]);
  }
  return out;
}

/** Minkowski sum of two convex polygons: where a copy of `b` overlaps `a` when its middle is. */
const minkowski = (a: Poly, b: Poly): Poly => convexHull(a.flatMap(([x, y]) => b.map(([u, v]) => [x + u, y + v] as V2)));

/** How far along the ray from `c` in direction `d` it leaves a convex polygon that holds `c`. */
function exitAlong(poly: Poly, c: V2, d: V2): number {
  let far = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const [ex, ey] = [q[0] - p[0], q[1] - p[1]];
    const den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((p[0] - c[0]) * ey - (p[1] - c[1]) * ex) / den;
    const u = ((p[0] - c[0]) * d[1] - (p[1] - c[1]) * d[0]) / den;
    if (u >= 0 && u <= 1 && t > far) far = t;
  }
  return far;
}

/** Where line ab meets line cd. */
function meet(a: V2, b: V2, c: V2, d: V2): V2 | null {
  const [rx, ry, sx, sy] = [b[0] - a[0], b[1] - a[1], d[0] - c[0], d[1] - c[1]];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  return [a[0] + rx * t, a[1] + ry * t];
}

/**
 * A convex polygon with fewer, longer sides: the shortest side goes and its
 * neighbours run on until they meet, so the polygon only ever grows, as long as
 * the new corner stays within `reach` of the side it replaces.
 */
function coarsen(poly: Poly, sides: number, reach: number): Poly {
  const p = [...poly];
  while (p.length > sides) {
    let best = -1;
    let shortest = Infinity;
    let corner: V2 | null = null;
    for (let i = 0; i < p.length; i++) {
      const [a, b, c, d] = [p[(i - 1 + p.length) % p.length], p[i], p[(i + 1) % p.length], p[(i + 2) % p.length]];
      const len = Math.hypot(c[0] - b[0], c[1] - b[1]);
      if (len >= shortest) continue;
      const q = meet(a, b, c, d);
      if (!q || (q[0] - b[0]) * (b[0] - a[0]) + (q[1] - b[1]) * (b[1] - a[1]) < 0) continue;
      if (Math.hypot(q[0] - (b[0] + c[0]) / 2, q[1] - (b[1] + c[1]) / 2) > reach) continue;
      [best, shortest, corner] = [i, len, q];
    }
    if (best < 0) break;
    if (best < p.length - 1) p.splice(best, 2, corner!);
    else {
      p.splice(best, 1, corner!);
      p.splice(0, 1);
    }
  }
  return p;
}

/** Is a pad at `at` at least `gap` clear of the railway's line? */
function clearOfRail(rail: RailLine, [u, v]: V2, gap: number): boolean {
  const [nx, ny] = [-Math.sin(rail.angle), Math.cos(rail.angle)];
  // The pad's diamond reaches 2·PAD across the screen and PAD up it.
  return Math.abs((u - rail.x) * nx + (v - rail.y) * ny) >= Math.max(2 * PAD * Math.abs(nx), PAD * Math.abs(ny)) + gap;
}

/** How far a polygon reaches from `c` in direction `n`. */
const support = (poly: Poly, [cx, cy]: V2, [nx, ny]: V2) => Math.max(...poly.map(([x, y]) => (x - cx) * nx + (y - cy) * ny));

const angleGap = (a: number, b: number) => {
  const d = (((a - b) % TAU) + TAU) % TAU;
  return Math.min(d, TAU - d);
};

/** How far a point lies out to sea: below 0 on land (by how much it is clear of the sea). */
function offshore(reach: number[] | undefined, [u, v]: V2): number {
  if (!reach) return -Infinity;
  const n = reach.length;
  const a = ((Math.atan2(v, u) / TAU) * n + n) % n;
  const i = Math.floor(a) % n;
  const t = a - Math.floor(a);
  // Between two rays, interpolate the inverse: true to a straight coast, where 1/r is a sinusoid.
  const inverse = (1 - t) / Math.max(0.05, reach[i]) + t / Math.max(0.05, reach[(i + 1) % n]);
  return Math.hypot(u, v) - 1 / inverse;
}

/** Is a point on land, `margin` clear of the sea? */
const onLand = (reach: number[] | undefined, p: V2, margin = 0) => offshore(reach, p) <= -margin;

/** A polygon is on land when its corners and the middles of its sides are. */
function polyOnLand(reach: number[] | undefined, poly: Poly, margin = 0.4): boolean {
  return poly.every((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return onLand(reach, p, margin) && onLand(reach, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], margin);
  });
}

/** Buildings with a model of their own (walls, rails and coastal guns are drawn elsewhere). */
type Placed = Exclude<ArtBuilding, 'fortifications' | 'railway' | 'coastalBattery'>;

/**
 * Where each building would like to stand: a screen direction from the old town
 * in degrees (0 right, 90 towards the viewer). Industry to the right, the military
 * to the left, civic buildings at the front, the tall ones at the back.
 */
const HOME_ANGLE: Record<Placed, number> = {
  industry: 340,
  powerPlant: 305,
  refinery: 15,
  housing: 40,
  market: 65,
  university: 270,
  barracks: 195,
  academy: 235,
  armsWorks: 160,
  motorPool: 130,
  tankWorks: 215,
  hospital: 100,
  propaganda: 45,
  garrisonHq: 115,
  supplyDepot: 250,
};

/** The order buildings choose their homes in, the commonest first, so they get the places nearest the old town. */
const CLAIM_ORDER: Placed[] = [
  'barracks', 'industry', 'supplyDepot', 'armsWorks', 'housing', 'market', 'refinery', 'hospital', 'motorPool',
  'powerPlant', 'academy', 'university', 'tankWorks', 'propaganda', 'garrisonHq',
];

/**
 * Places a building may take round the old town, best first: near, and in the
 * direction it wants (turns in radians either side, all the way round for a city
 * hemmed in by the sea).
 */
const CANDIDATES = (() => {
  const turns = [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6, -0.6, 0.8, -0.8, 1.05, -1.05, 1.35, -1.35, 1.7, -1.7, 2.1, -2.1, 2.5, -2.5, 2.9, -2.9, Math.PI];
  const out: { rad: number; turn: number; price: number }[] = [];
  for (let rad = 5; rad <= 44; rad += 0.5) for (const turn of turns) out.push({ rad, turn, price: rad + Math.abs(turn) * 9 });
  return out.sort((p, q) => p.price - q.price);
})();

interface Block {
  /** Middle on screen, and how far out in the old town it lies (0 middle, 1 edge). */
  at: V2;
  ring: number;
  i: number;
  j: number;
}

export interface CityLayout {
  /** Screen position (model units from the anchor) of the landmark and of each building drawn. */
  buildings: Partial<Record<Placed | 'landmark', [number, number]>>;
  /** Screen positions of the empty plots. */
  plots: [number, number][];
}

interface Layout {
  tier: CityModelProps['tier'];
  reach: number[] | undefined;
  /** Middle of the old town: the anchor, or inland of it by the sea. */
  centre: V2;
  /** The old town's blocks of houses round the landmark's square. */
  blocks: Block[];
  /** Where town walls run: straight curtains round the old town, towers at the corners. */
  trace: Poly;
  /** Round the old town and its walls: the other buildings keep clear of it. */
  hull: Poly;
  /** Every building's home, built or not. */
  homes: Map<Placed, V2>;
  /** Those built or being built. */
  shown: Map<Placed, V2>;
  plots: V2[];
  exits: number[];
  /** The line a railway takes past the old town, and its station. */
  rail: RailLine;
  station: Poly;
  /** Outline of the lace of streets. */
  streets: Envelope;
}

const clampTier = (t: number) => Math.max(1, Math.min(5, Math.round(t) || 1)) as CityModelProps['tier'];

/**
 * The old town's middle and size: the anchor, or the nearest point inland where
 * the old town is clear of the sea. On a narrow strip of land the old town is
 * smaller, and failing that sits where most of it is on land.
 */
function centreOf(reach: number[] | undefined, a: number): { centre: V2; size: number } {
  if (!reach) return { centre: [0, 0], size: a };
  let best: V2 = [0, 0];
  let most = -1;
  for (const size of [a, a * 0.8, a * 0.62])
    for (let d = 0; d <= 14; d++)
      for (let k = 0; k < (d ? 24 : 1); k++) {
        const c: V2 = [Math.cos((k / 24) * TAU) * d, Math.sin((k / 24) * TAU) * d];
        if (!onLand(reach, c, 2)) continue;
        const edge = ellipse(c, size + 1.5, (size + 1.5) * ASPECT, 16);
        const dry = edge.filter((p) => onLand(reach, p, 0.3)).length;
        if (dry === edge.length) return { centre: c, size };
        if (size === a && dry > most) [best, most] = [c, dry];
      }
  return { centre: best, size: a * 0.62 };
}

/** The roads out of town: towards the neighbours, else three to five made up from the seed. */
function exitsOf(given: number[] | undefined, tier: number, r: Rand): number[] {
  const out: number[] = [];
  for (const a of given ?? []) if (Number.isFinite(a) && out.every((b) => angleGap(a, b) > 0.4)) out.push(a);
  if (out.length >= 2) return out;
  const n = 3 + Math.floor(r() * 2) + (tier >= 4 ? 1 : 0);
  const turn = r() * TAU;
  for (let i = 0; i < n; i++) {
    const a = turn + (i / n) * TAU + (r() - 0.5) * 0.6;
    if (out.every((b) => angleGap(a, b) > 0.7)) out.push(a);
  }
  return out;
}

/**
 * The old town's blocks round the landmark's square: an irregular patch, its
 * edge thinning out into gardens and the lace of streets.
 */
function blocksOf(seed: string, c: V2, a: number, reach: number[] | undefined, r: Rand): Block[] {
  const [p2, p3, p5] = [r() * TAU, r() * TAU, r() * TAU];
  // 0.8 to 1 of the plain ellipse, varying round it.
  const shape = (t: number) => 0.9 + 0.1 * ((0.6 * Math.sin(2 * t + p2) + 0.4 * Math.sin(3 * t + p3) + 0.25 * Math.sin(5 * t + p5)) / 1.25);
  const out: Block[] = [];
  const n = Math.ceil(a / BLOCK) + 1;
  for (let i = -n; i < n; i++)
    for (let j = -n; j < n; j++) {
      if (i >= -1 && i <= 0 && j >= -1 && j <= 0) continue;
      const at: V2 = [c[0] + BLOCK * (i - j), c[1] + (BLOCK * (i + j + 1)) / 2];
      const inside = diamond(at, 0.85).every(([u, v]) => {
        const [x, y] = [(u - c[0]) / (a + 0.5), (v - c[1]) / (a * ASPECT + 0.4)];
        return Math.hypot(x, y) <= shape(Math.atan2(y, x));
      });
      if (!inside || !polyOnLand(reach, diamond(at, BLOCK / 2), 0.2)) continue;
      const [x, y] = [(at[0] - c[0]) / a, (at[1] - c[1]) / (a * ASPECT)];
      const ring = Math.hypot(x, y) / shape(Math.atan2(y, x));
      if (rngOf(seed, `gap ${i},${j}`)() < 0.55 * Math.max(0, Math.min(1, (ring - 0.62) / 0.38))) continue;
      out.push({ at, ring, i, j });
    }
  return out;
}

/**
 * The line a railway takes: along the straightest pair of roads out of town,
 * passing the old town on one side, with the station beyond the tracks. Kept
 * clear whether or not the railway is built, so building it moves nothing.
 */
function railOf(exits: number[], c: V2, hull: Poly, reach: number[] | undefined, r: Rand): { rail: RailLine; station: Poly } {
  let angle = exits[0] ?? 0;
  let straightest = 0.9;
  for (let i = 0; i < exits.length; i++)
    for (let j = i + 1; j < exits.length; j++) {
      const bend = angleGap(exits[i], exits[j] + Math.PI);
      if (bend >= straightest) continue;
      straightest = bend;
      angle = Math.atan2(Math.sin(exits[i]) - Math.sin(exits[j]), Math.cos(exits[i]) - Math.cos(exits[j]));
    }
  const sides = r() < 0.5 ? [1, -1] : [-1, 1];
  let first: { rail: RailLine; station: Poly } | null = null;
  for (const side of sides) {
    const n: V2 = [-Math.sin(angle) * side, Math.cos(angle) * side];
    const d = support(hull, c, n) + 0.9;
    const [x, y] = [c[0] + n[0] * d, c[1] + n[1] * d];
    const option = { rail: { x, y, angle }, station: strip([x + n[0] * 1.55, y + n[1] * 1.55], angle, 2.6, 0.7) };
    first ??= option;
    if (polyOnLand(reach, option.station)) return option;
  }
  return first!;
}

/**
 * Every building's home: nearest the old town in the direction it wants, clear of
 * the others, the railway and the sea. A city hemmed in by the sea packs its pads
 * closer, then lets them stand on the shore; only on a scrap of an island do they
 * go wherever there is room. Returns the homes and which of them are wholly on land.
 */
function homesOf(c: V2, hull: Poly, rail: RailLine, station: Poly, reach: number[] | undefined): { homes: Map<Placed, V2>; dry: Set<Placed> } {
  const homes = new Map<Placed, V2>();
  const dry = new Set<Placed>();
  const at = (t: number, rad: number): V2 => [c[0] + Math.cos(t) * rad, c[1] + Math.sin(t) * rad * HOME_SQUASH];
  // How far out a pad must stand in each direction to clear the old town: a pad
  // overlaps the hull just when its middle is inside the hull grown by the pad and the
  // gap, so it is clear once the ray leaves that.
  const keepOut = inflate(minkowski(hull, diamond([0, 0], PAD)), 0.4);
  const outside = new Map<number, number>();
  const clearOfTown = (t: number) => {
    const key = Math.round(t * 1000);
    let rad = outside.get(key);
    if (rad === undefined) {
      rad = exitAlong(keepOut, c, [Math.cos(t), Math.sin(t) * HOME_SQUASH]);
      outside.set(key, rad);
    }
    return rad;
  };
  const clear = (t: number, rad: number, gap: number, land: 'pad' | 'middle' | 'any') => {
    if (rad < clearOfTown(t)) return false;
    const p = at(t, rad);
    // Pads keep a street's width apart: |du| + 2|dv| is the diamonds' own distance.
    for (const o of homes.values()) if (Math.abs(p[0] - o[0]) + 2 * Math.abs(p[1] - o[1]) < 4 * PAD + gap) return false;
    if (land !== 'any' && !onLand(reach, p, 0.5)) return false;
    const foot = diamond(p, PAD);
    if (land === 'pad' && !polyOnLand(reach, foot)) return false;
    return clearOfRail(rail, p, 1.1) && !overlaps(foot, station, 0.5);
  };
  for (const b of CLAIM_ORDER) {
    const want = (HOME_ANGLE[b] * Math.PI) / 180;
    const spot = (gap: number, land: 'pad' | 'middle' | 'any'): V2 | null => {
      for (const { rad, turn } of CANDIDATES) if (clear(want + turn, rad, gap, land)) return at(want + turn, rad);
      return null;
    };
    // Hemmed in: the place least far out to sea, so the pad hugs the shore.
    const shore = (): V2 | null => {
      let best: V2 | null = null;
      let cost = Infinity;
      for (const { rad, turn, price } of CANDIDATES) {
        const total = price + 25 * Math.max(0, offshore(reach, at(want + turn, rad)) + 0.5);
        if (total < cost && clear(want + turn, rad, 0.8, 'any')) [best, cost] = [at(want + turn, rad), total];
      }
      return best;
    };
    const onLandAt = spot(2.5, 'pad') ?? (reach ? spot(0.8, 'pad') : null);
    const home = onLandAt ?? spot(0.8, 'middle') ?? (reach ? shore() : spot(2.5, 'any'));
    if (!home) continue;
    homes.set(b, home);
    if (onLandAt) dry.add(b);
  }
  return { homes, dry };
}

function layout(props: CityModelProps): Layout {
  const tier = clampTier(props.tier);
  const reach = (props.reach?.length ?? 0) >= 4 ? props.reach : undefined;
  const r = rngOf(props.seed, 'layout');
  const { centre, size } = centreOf(reach, OLD_TOWN[tier]);
  const exits = exitsOf(props.exits, tier, r);
  const blocks = blocksOf(props.seed, centre, size, reach, r);
  // Walls hug the houses: their hull, pushed out and simplified into a few long curtains.
  const old = convexHull([...diamond(centre, BLOCK - 0.3), ...blocks.flatMap((b) => diamond(b.at, 0.85))]);
  const trace = coarsen(inflate(old, 0.8), tier >= 4 ? 9 : 7, 3);
  const hull = inflate(trace, 1.3);
  const { rail, station } = railOf(exits, centre, hull, reach, r);
  const { homes, dry } = homesOf(centre, hull, rail, station, reach);
  const shown = new Map<Placed, V2>();
  for (const [b, at] of homes) if ((props.buildings[b] ?? 0) > 0 || props.construction === b) shown.set(b, at);
  // Empty plots take the free homes on land nearest the old town, the front ones first.
  const rank = ([u, v]: V2) => Math.hypot(u - centre[0], (v - centre[1]) / HOME_SQUASH) - (v > centre[1] ? 2 : 0);
  const plots = [...homes]
    .filter(([b]) => !shown.has(b) && dry.has(b))
    .map(([, at]) => at)
    .sort((p, q) => rank(p) - rank(q))
    .slice(0, Math.max(0, props.freeSlots ?? 0));
  const wobble = [0.1, 0.07, 0.04].map((amp) => [amp * (0.6 + r() * 0.8), r() * TAU] as [number, number]);
  const streets = new Envelope(centre[0], centre[1], SPREAD[tier], ASPECT, wobble);
  return { tier, reach, centre, blocks, trace, hull, homes, shown, plots, exits, rail, station, streets };
}

/** Where the landmark and each building of a city stand, and its empty plots (for tests and tools). */
export function cityLayout(props: CityModelProps): CityLayout {
  const l = layout(props);
  return { buildings: { landmark: l.centre, ...Object.fromEntries(l.shown) }, plots: l.plots };
}

// ------------------------------------------------------------------ helpers

/**
 * Model-building context for one lot, in world coordinates local to its middle.
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

// ------------------------------------------------------------------ the old town

/** Houses on one old-town block (±1.1 round its middle): denser and taller towards the middle of bigger cities. */
function houses(l: Lot, ring: number, tier: number, region: Region, r: Rand): void {
  const wall = () => mixColor(pick(r, region.walls), MUTE_WALL, 0.3);
  const roof = () => mixColor(pick(r, region.roofs), MUTE_ROOF, 0.25);
  const density = tier + 0.6 - ring * 2.5 + (r() - 0.5) * 0.9;
  if (density < 1.4) {
    // Cottages.
    for (const [u, v] of [[-0.42, -0.36], [0.4, 0.38]] as V2[]) {
      if (r() < 0.2) continue;
      const h = 0.5 + r() * 0.25;
      const w = wall();
      l.box(u - 0.34, v - 0.3, u + 0.34, v + 0.3, 0, h, w, null);
      l.gable(u - 0.38, v - 0.34, u + 0.38, v + 0.34, h, 0.34, roof(), r() < 0.5 ? 'x' : 'y', w);
    }
  } else if (density < 2.7) {
    // A terrace with a pitched roof.
    const h = 0.75 + density * 0.18 + r() * 0.25;
    const along = r() < 0.5 ? 'x' : 'y';
    const [u0, v0, u1, v1] = along === 'x' ? [-0.8, -0.42, 0.8, 0.42] : [-0.42, -0.8, 0.42, 0.8];
    const w = wall();
    l.box(u0, v0, u1, v1, 0, h, w, null);
    l.gable(u0 - 0.04, v0 - 0.04, u1 + 0.04, v1 + 0.04, h, 0.4, roof(), along, w);
  } else if (density < 3.9 || tier < 4) {
    // Apartment block with a hipped roof.
    const h = 1.1 + density * 0.28 + r() * 0.35;
    const w = wall();
    l.box(-0.78, -0.78, 0.78, 0.78, 0, h, w, null);
    l.hip(-0.82, -0.82, 0.82, 0.82, h, 0.45, roof());
  } else {
    // Office tower with a set-back crown.
    const h = 2.2 + density * 0.42 + r() * 0.9;
    const w = mixColor(pick(r, [...region.walls, K.stone, K.white]), MUTE_WALL, 0.3);
    l.box(-0.7, -0.7, 0.7, 0.7, 0, h, w);
    l.box(-0.42, -0.42, 0.42, 0.42, h, h + 0.5 + r() * 0.4, shadeColor(w, 0.95));
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

/** A free building slot: a staked-out plot with a surveyor's pennant. */
function emptyPlot(s: Scene, at: V2): void {
  const [x, y] = toWorld(at);
  const h = PAD - 0.25;
  const corners: V2[] = [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]];
  s.decal(corners, K.plot, 0, 0.1);
  s.groundLine([...corners, corners[0]], K.plot, 0.22);
  const l = new Lot(s, x, y);
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
  // The Kalemegdan fortress over the confluence; the Athenaeum's dome.
  'rs-belgrade': 'castle',
  'ro-bucharest': 'dome',
  // The Custom House's dome on the Liffey.
  'ie-dublin': 'dome',
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

/** World square of half-side `h` round (x, y). */
const square = (x: number, y: number, h: number): V2[] => [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]];

/** Pitched roof over a quadrilateral footprint (world), the ridge running from the middle of side 3–0 to the middle of side 1–2. */
function ridgeRoof(s: Scene, foot: V2[], z: number, h: number, color: string, ends: string): void {
  const [a, b, c, d] = foot.map(([x, y]) => [x, y, z] as V3);
  const ridge = (p: V3, q: V3): V3 => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, z + h];
  const [r0, r1] = [ridge(d, a), ridge(b, c)];
  s.solid([
    { pts: [a, b, r1, r0], color },
    { pts: [c, d, r0, r1], color },
    { pts: [b, c, r1], color: ends },
    { pts: [d, a, r0], color: ends },
    { pts: [a, b, c, d], color },
  ]);
}

/** Town walls along the trace: straight curtains in short runs, gates where the roads leave town, towers at the corners from level 2. */
function walls(s: Scene, lay: Layout, level: number): void {
  const [cx, cy] = lay.centre;
  const h = [0, 0.7, 1.05, 1.35][level];
  const color = level === 1 ? '#8c7b55' : '#a99f8b';
  const gate = ([u, v]: V2) =>
    lay.exits.some((e) => {
      const [du, dv] = [u - cx, v - cy];
      return du * Math.cos(e) + dv * Math.sin(e) > 0 && Math.abs(dv * Math.cos(e) - du * Math.sin(e)) < 1.5;
    });
  const { trace } = lay;
  trace.forEach((p, corner) => {
    const q = trace[(corner + 1) % trace.length];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const [nx, ny] = [(q[1] - p[1]) / len, (p[0] - q[0]) / len];
    // A point `t` of the way along this curtain, `out` across it.
    const at = (t: number, out: number): V2 => [p[0] + (q[0] - p[0]) * t + nx * out, p[1] + (q[1] - p[1]) * t + ny * out];
    const runs = Math.max(1, Math.round(len / 1.6));
    for (let i = 0; i < runs; i++) {
      const mid = at((i + 0.5) / runs, 0);
      if (gate(mid) || !onLand(lay.reach, mid, 0.3)) continue;
      s.prism([at(i / runs, -0.25), at((i + 1) / runs, -0.25), at((i + 1) / runs, 0.25), at(i / runs, 0.25)].map(toWorld), 0, h, color);
    }
  });
  if (level < 2) return;
  for (const p of trace) {
    if (gate(p) || !onLand(lay.reach, p, 0.3)) continue;
    const [x, y] = toWorld(p);
    s.frustum(x, y, 0, h + 0.8, 0.66, 0.58, 8, '#b4ab96', '#8f887a');
    if (level >= 3) s.frustum(x, y, h + 0.8, h + 1.25, 0.6, 0, 8, K.slate);
  }
}

/** The station beside the tracks, and a train pulling in. */
function railwayStation(s: Scene, lay: Layout): void {
  const { rail } = lay;
  const hall = lay.station.map(toWorld);
  s.prism(hall, 0, 1.15, '#bfae8f', null);
  ridgeRoof(s, hall, 1.15, 0.6, '#6a6764', '#bfae8f');
  const along = (t: number): V2 => [rail.x + Math.cos(rail.angle) * t, rail.y + Math.sin(rail.angle) * t];
  const car = (t: number, len: number, z1: number, color: string, top = shadeColor(color, 0.85)) =>
    s.prism(strip(along(t), rail.angle, len, 0.42).map(toWorld), 0.12, z1, color, top);
  car(-3.1, 0.75, 0.82, '#2f3033');
  car(-2.05, 0.3, 1.3, '#3a3b3f', '#7a2e27');
  const [fx, fy] = toWorld(along(-3.55));
  s.frustum(fx, fy, 0.82, 1.35, 0.16, 0.2, 6, '#2b2b2e');
  s.puff([fx + 0.2, fy - 0.3, 1.8], 0.4, '#efece6', 0.7);
  s.puff([fx + 0.5, fy - 0.8, 2.4], 0.55, '#efece6', 0.5);
  ['#7d4b37', '#6d6a5c', '#7d4b37'].forEach((c, i) => car(-0.7 + i * 2.0, 0.85, 0.98, c));
}

/** A few copses round the edge of town, more in wooded country; never where a building may stand. */
function copses(s: Scene, lay: Layout, terrain: ArtTerrain, r: Rand): void {
  const count = { forest: 6, hills: 3, marsh: 2, plains: 2, mountains: 3, urban: 0 }[terrain] ?? 2;
  const blocked: Poly[] = [lay.hull, lay.station, ...[...lay.homes.values()].map((h) => diamond(h, PAD + 0.2))];
  const planted: V2[] = [];
  for (let tries = 0; planted.length < count && tries < count * 12; tries++) {
    const at = lay.streets.at(r() * TAU, 0.6 + r() * 0.65);
    const n = 2 + Math.floor(r() * (terrain === 'forest' ? 4 : 3));
    if (!polyOnLand(lay.reach, diamond(at, 1.2), 0.3) || planted.some(([u, v]) => Math.abs(u - at[0]) + 2 * Math.abs(v - at[1]) < 7)) continue;
    if (!clearOfRail(lay.rail, at, 0) || blocked.some((o) => overlaps(diamond(at, 1.1), o, 0.2))) continue;
    planted.push(at);
    const [x, y] = toWorld(at);
    trees(new Lot(s, x, y), r, n, 0.75);
  }
}

// ------------------------------------------------------------------ assembly

function layerOf(markup: string, [bx0, by0, bx1, by1]: [number, number, number, number]): ModelLayer {
  if (!Number.isFinite(bx0)) [bx0, by0, bx1, by1] = [-1, -1, 1, 1];
  // Whole tenths, so the two layers of a city line up exactly.
  const x0 = Math.floor(bx0 * 10) / 10;
  const y0 = Math.floor(by0 * 10) / 10;
  const w = Math.ceil((bx1 - x0) * 10) / 10;
  const h = Math.ceil((by1 - y0) * 10) / 10;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x0} ${y0} ${w} ${h}">${markup}</svg>`,
    width: w,
    height: h,
    cx: -x0,
    cy: -y0,
  };
}

export function buildCityModel(props: CityModelProps): CityModel {
  const lay = layout(props);
  const { tier, centre } = lay;
  const s = new Scene();
  const region = regionOf(props.seed);
  const flag = props.nationColor ?? K.neutralFlag;
  const ctxFor = (key: string): Ctx => ({ region, flag, r: rngOf(props.seed, key) });
  const level = (b: ArtBuilding) => props.buildings[b] ?? 0;
  /** Footprints of everything drawn: the extent of the built-up area. */
  const drawn: Poly[] = [diamond(centre, BLOCK)];

  // The landmark on its square, with the owner's flag: the capital's, or a parish church.
  const [lx, ly] = toWorld(centre);
  s.decal(square(lx, ly, BLOCK - 0.3), K.plaza);
  const lmKind: LandmarkKind = props.capital ? (NATIONAL_LANDMARKS[props.seed] ?? 'cathedral') : 'church';
  const lm = new Lot(s, lx, ly);
  landmark(lm, lmKind, ctxFor('landmark'));
  if (lmKind !== 'reichstag' && lmKind !== 'palace') lm.flag(1.75, -1.75, 0, 3.4, flag);

  // The old town: blocks of houses, with the odd small park.
  const parkChance = props.terrain === 'forest' ? 0.16 : 0.07;
  for (const blk of lay.blocks) {
    const r = rngOf(props.seed, `block ${blk.i},${blk.j}`);
    const [x, y] = toWorld(blk.at);
    const l = new Lot(s, x, y);
    if (blk.ring > 0.55 && r() < parkChance) {
      s.decal(square(x, y, 0.95), K.lawn, 0, 0.85);
      trees(l, r, 2, 0.5);
    } else {
      houses(l, blk.ring, tier, region, r);
    }
    drawn.push(diamond(blk.at, BLOCK / 2));
  }

  // Every building on a pad in its category's colour (scaffolding while it is first built), seated by a soft shadow.
  for (const [b, at] of lay.shown) {
    const [x, y] = toWorld(at);
    s.decal(square(x + 0.65, y - 0.15, PAD + 0.1), '#1d1a16', 0, 0.2);
    s.box(x - PAD, y - PAD, x + PAD, y + PAD, 0, PLINTH, PLINTH_COLORS[BUILDING_CATEGORY[b]]);
    const raised = new Lot(s, x, y, PLINTH, STRETCH);
    if (level(b) === 0) construction(raised);
    else MODELS[b](raised, level(b), ctxFor(b));
    drawn.push(diamond(at, PAD));
  }
  // Empty plots are flat ground: armies may camp on them, so they do not count towards the built-up area.
  for (const at of lay.plots) emptyPlot(s, at);

  // Work in progress elsewhere: a crane beside an upgrade, at the station site or by the walls.
  const job = props.construction;
  const upgrading = job ? lay.shown.get(job as Placed) : undefined;
  if (job && upgrading && level(job) > 0) {
    const [x, y] = toWorld(upgrading);
    crane(s, x + PAD - 0.05, y + PAD - 0.05);
  } else if (job === 'railway' || job === 'fortifications') {
    const [a, , c] = lay.station;
    const east = lay.trace.reduce((m, p) => (p[0] > m[0] ? p : m));
    const site: V2 = job === 'railway' ? [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2] : east;
    const [x, y] = toWorld(site);
    crane(s, x, y);
  }

  if (level('fortifications') > 0) {
    walls(s, lay, Math.min(3, level('fortifications')));
    drawn.push(inflate(lay.trace, 0.7));
  }
  if (level('railway') > 0) {
    railwayStation(s, lay);
    drawn.push(lay.station);
  }
  copses(s, lay, props.terrain, rngOf(props.seed, 'trees'));

  if (props.battle) {
    const r = rngOf(props.seed, 'battle');
    const spots = [...lay.blocks.map((b) => b.at), ...lay.shown.values()];
    for (let i = 0; i < 3 && spots.length; i++) {
      const [x, y] = toWorld(spots[Math.floor(r() * spots.length)]);
      s.puff([x, y, 2.2], 0.6, K.fire, 0.85);
      for (let k = 0; k < 3; k++) s.puff([x + k * 0.5, y - k * 0.6, 3 + k * 1.3], 0.8 + k * 0.35, K.darkSmoke, 0.7 - k * 0.15);
    }
  }

  const plan = streetPlan(lay.streets, tier, OLD_TOWN[tier] / SPREAD[tier], lay.exits, level('railway') > 0 ? lay.rail : null, rngOf(props.seed, 'streets'));
  const ground = drawStreets(lay.streets, plan, tier);
  const built = s.render();
  const [left, top, right, bottom] = boxOf(drawn.flat());
  return {
    ground: layerOf(ground.markup, ground.bounds),
    structures: layerOf(built.markup, built.bounds),
    mid: (left + right) / 2,
    rx: (right - left) / 2,
    back: -top,
    front: bottom,
  };
}

// ------------------------------------------------------------------ the port

export interface PortModelProps {
  /** Province id: drives variety. */
  seed: string;
  /** Screen direction from the shore out to sea (radians: 0 right, π/2 down). */
  facing: number;
  /** Coastal battery level, 0 to 2. */
  batteries: number;
  /** Batteries being built: a crane on the shore. */
  building?: boolean;
  /** Owner's colour for the flag; neutral if absent. */
  nationColor?: string;
}

/**
 * A city's port, drawn on the real coast nearest the city: a quay running out to
 * sea with a steamer alongside and a harbour crane, a warehouse on the shore, and
 * the coastal batteries' gun pits. The coast point is the drawing's anchor.
 */
export function buildPortModel(p: PortModelProps): ModelLayer {
  const s = new Scene();
  const r = rngOf(p.seed, 'port');
  const [oc, os] = [Math.cos(p.facing), Math.sin(p.facing)];
  /** `t` out to sea, `k` along the shore. */
  const at = (t: number, k: number): V2 => [oc * t - os * k, os * t + oc * k];
  const side = r() < 0.5 ? 1 : -1;

  // The quay and the warehouse at its root.
  s.prism(strip(at(2.4, 0), p.facing, 2.9, 0.5).map(toWorld), -0.2, 0.32, '#a59d8d');
  const shed = strip(at(-1.0, -side * 0.9), p.facing + Math.PI / 2, 1.2, 0.75).map(toWorld);
  s.prism(shed, 0, 0.95, '#9c6f55', null);
  ridgeRoof(s, shed, 0.95, 0.5, '#5d5550', '#9c6f55');
  const [qx, qy] = toWorld(at(0.5, side * -0.4));
  new Lot(s, qx, qy).flag(0, 0, 0.32, 2.2, p.nationColor ?? K.neutralFlag, 0.7);

  // A steamer moored alongside, and a crane over it.
  const k0 = side * 1.45;
  const hull: V2[] = [at(0.5, k0 - 0.5), at(4.2, k0 - 0.5), at(5.0, k0), at(4.2, k0 + 0.5), at(0.5, k0 + 0.5)];
  s.prism(hull.map(toWorld), -0.3, 0.45, K.hull, '#8f7a5a');
  s.prism(strip(at(2.2, k0), p.facing, 0.85, 0.36).map(toWorld), 0.45, 1.1, '#e2dccb');
  const [fx, fy] = toWorld(at(2.5, k0));
  s.frustum(fx, fy, 1.1, 2.1, 0.24, 0.22, 8, '#b84a35', '#2f2f31');
  s.puff([fx + 0.2, fy - 0.3, 2.5], 0.42, K.smoke, 0.6);
  s.puff([fx + 0.5, fy - 0.8, 3.2], 0.58, K.smoke, 0.45);
  const [cx, cy] = toWorld(at(3.7, 0));
  const [jx, jy] = toWorld(at(3.7, k0 * 1.05));
  s.line([[cx, cy, 0.32], [cx, cy, 3.0]], '#5c5a58', 0.2);
  s.line([[cx, cy, 3.0], [jx, jy, 2.6]], '#5c5a58', 0.16);
  s.line([[jx, jy, 2.6], [jx, jy, 1.4]], '#3a3836', 0.06);

  // Gun pits on the shore either side, guns trained out to sea.
  const pits = [-side * 2.9, side * 2.7];
  for (let i = 0; i < Math.min(2, p.batteries); i++) {
    const [gx, gy] = toWorld(at(-1.2, pits[i]));
    s.frustum(gx, gy, 0, 0.45, 0.8, 0.72, 10, '#8d8c84', '#77766f');
    s.box(gx - 0.3, gy - 0.3, gx + 0.3, gy + 0.3, 0.45, 0.8, '#5c6150');
    const [mx, my] = toWorld(at(0.9, pits[i]));
    s.line([[gx, gy, 0.65], [mx, my, 1.0]], '#2f312c', 0.24);
  }
  if (p.building) {
    const [bx, by] = toWorld(at(-1.6, pits[Math.min(1, p.batteries)]));
    crane(s, bx, by);
  }
  const { markup, bounds } = s.render();
  return layerOf(markup, bounds);
}
