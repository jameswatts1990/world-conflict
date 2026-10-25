// Divides every region of the map into its city and the provinces of land round it.
//
//   npm run map:build   # runs build-map.mjs, then this script
//   npx vite-node scripts/map/city-provinces.ts [--hints]   # this step alone (no raw data needed)
//
// A city's border is drawn tight round it: an irregular ring (wider for bigger cities, shaped by
// the city's own seed) that keeps clear of every land border of its region and follows the coast
// where it reaches the sea. The rest of the region becomes provinces of land all round the city,
// about one per 20,000 km² (two at least): a centroidal Voronoi division of the land the city stands
// on, so the lands come out compact and of much the same size, and where one of them would wrap round
// the city, it is cut in two along a line through the city, so every city has at least two lands
// meeting at it and none surrounds it. The road to a neighbour crosses the land on that side. The lands
// follow the borders of the region's admin-1 units (departments, counties, provinces) where the units are
// small enough, and cut straight through bigger ones and through the units round the city. An island big
// enough is a land of its own; islets join the nearest land. A land is keyed `<row id>-<compass point>`
// (`be-brussels-w`). Once the division is made, the borders it drew itself (each city's ring, and the straight
// cuts through the units) are broken up like the natural borders, keeping their ends (`roughen`): every province
// looks like one, and nothing gameplay reads moves.
//
// It reads the uncut regions and their units from scripts/map/base.topo.json, so running it twice
// changes nothing, and writes src/assets/map/map.topo.json and src/sim/scenario/europe/land.ts: whether
// each city reaches the sea, each land's anchor (its armies stand and its label sits there), coast and
// towns, and the links between all provinces: every shared border (land or mountain, as the rows'
// connection says), each sea crossing between the nearest coasts, and a crossing to any land of a row
// that its other lands cannot reach on foot. Gameplay reads those, never the shapes. With --hints it
// also prints what each land holds (units, towns, neighbours), to name it in provinces.ts.
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import mapshaper from 'mapshaper';
import { feature, mesh, neighbors } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { CONNECTIONS, CROSSINGS } from '../../src/sim/scenario/europe/connections';
import { ROWS } from '../../src/sim/scenario/europe/provinces';
import type { ConnectionDef } from '../../src/sim/types';

const root = process.cwd();
/** The regions before any city is cut out (build-map.mjs writes it; committed so this step runs without the raw data). */
const baseFile = join(root, 'scripts', 'map', 'base.topo.json');
const mapFile = join(root, 'src', 'assets', 'map', 'map.topo.json');
const landFile = join(root, 'src', 'sim', 'scenario', 'europe', 'land.ts');

/** A city's radius before its outline is shaped, in km, by size. */
const RADIUS_KM = { capital: 30, major: 23, town: 17 } as const;
/** How close a city's border may come to a land border of its region, in km. */
const MARGIN_KM = 5;
/** Points round each city's outline. */
const SPOKES = 72;
/** Same grid as build-map.mjs, so shared coasts and borders stay the same arcs. */
const QUANTIZATION = 100000;
/** Land per province of land, in km²: how many lands the part of a region round its city is divided into (two to five, then one more if the city's land is cut in two). */
const LAND_KM2 = 20000;
const MIN_LANDS = 2;
const MAX_LANDS = 5;
/** No land smaller than this share of its region's average: a smaller one joins the land it borders most. */
const MIN_LAND_SHARE = 0.15;
/** Units smaller than this go whole to one land, so that the borders between lands follow theirs (except round the city). */
const WHOLE_UNIT_KM2 = 9000;
/** Spacing of the points that weigh the lands, in km. */
const SAMPLE_KM = 3;
/**
 * A land wraps round its city when it holds more than this share of the city's rim: the land just outside its
 * border with the land round it (not its coast), in plain sight of it...
 */
const WRAP_SHARE = 0.7;
/** ...within this many km of it. Such a land is cut in two at the city. */
const RIM_KM = 8;
/** A cut is weighed by how far a half falls short of holding this much under half of the land, or of its rim... */
const CUT_SLACK = 0.22;
const RIM_SLACK = 0.32;
/** ...how far it sprawls: how far its land lies from its middle, for its size, beyond this (a disc: 1/2π)... */
const SPREAD = 0.25;
/** ...and whether it is in pieces: its largest stretch must hold this share of it, and of its rim. */
const CUT_WHOLE = 0.95;
/** The cuts tried: two borders from the city's middle, CUT_STEP degrees apart and at least MIN_SPAN between them... */
const CUT_STEP = 4;
const MIN_SPAN = 60;
/** ...and straight ones across its border with the land, this many km apart. */
const OFFSET_KM = 2;
/** What each land more than a region's share costs, against how poorly its city's land is cut (see `cutOf`). */
const EXTRA_LAND = 3;
/** Another part of a region (an island) at least this big, in km², is a land of its own; smaller ones join the nearest land. */
const OWN_LAND_KM2 = 4000;
/**
 * The borders this script draws (a city's outline, the cuts between lands where they run straight through the
 * units) are broken up like the natural ones, which the map keeps as legs of 5 to 15 km turning 30 to 70 degrees:
 * the middle of each stretch is pushed aside by up to JAG of its length (of JAG_SPAN_KM at most, so a long cut
 * wanders but keeps its course), then the middle of each half, until the legs are shorter than JAG_KM. A city's
 * outline first gets corners every RING_SIDE_KM or so, each up to CORNER_REACH nearer the city or farther out.
 */
const JAG = 0.25;
const JAG_SPAN_KM = 16;
const JAG_KM = 8;
const RING_SIDE_KM = 10;
const CORNER_REACH = 0.15;
/**
 * A border broken up keeps at least this far (km) from every other, but near its own ends, where others meet it, and
 * from the region's towns and anchors (or as far as it was), so that each stays on its own side.
 */
const ROUGH_CLEAR_KM = 1.5;
const PLACE_CLEAR_KM = 2.5;
/** A stretch of border whose middle lies this close (km) to a unit's border follows it (the map rounds its points)... */
const ON_UNIT_KM = 0.3;
/** ...and one that cuts through them runs straight while it turns less than this (radians). */
const STRAIGHT = 0.08;

type Pt = [number, number];
/** A half-plane, n · p ≤ c. */
type Plane = { n: Pt; c: number };
/** A cut of a land in two at its city (one half where all its planes hold), and how well it cuts (lower is better). */
type Cut = { planes: Plane[]; broken: boolean; short: number; sprawl: number; cost: number };
type Props = { pid: string; iso: string };
type UnitProps = Props & { name: string };
type Row = (typeof ROWS)[number];
type Base = Topology<{ provinces: GeometryCollection<Props>; units: GeometryCollection<UnitProps>; countries: GeometryCollection }>;

/** Local flat projection round a point: km east and north. */
function local([lon0, lat0]: Pt) {
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110.57;
  return {
    to: ([lon, lat]: Position): Pt => [(lon - lon0) * kx, (lat - lat0) * ky],
    from: ([x, y]: Pt): Pt => [lon0 + x / kx, lat0 + y / ky],
  };
}

/** Deterministic pseudo-random numbers from a string (FNV-1a then xorshift). */
function rngOf(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

/** Distance along a ray from the origin to the first crossing of any segment (Infinity if none). */
function firstHit(segments: [Pt, Pt][], dx: number, dy: number): number {
  let best = Infinity;
  for (const [[x1, y1], [x2, y2]] of segments) {
    const [ex, ey] = [x2 - x1, y2 - y1];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (x1 * ey - y1 * ex) / den;
    const u = (x1 * dy - y1 * dx) / den;
    if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}

function segmentsOf(lines: Position[][], to: (p: Position) => Pt): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (const line of lines) for (let i = 0; i + 1 < line.length; i++) out.push([to(line[i]), to(line[i + 1])]);
  return out;
}

function ringsOf(g: Polygon | MultiPolygon): Position[][][] {
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}

function inRing(ring: Pt[], [x, y]: Pt): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(rings: Pt[][], p: Pt): boolean {
  return inRing(rings[0], p) && !rings.slice(1).some((h) => inRing(h, p));
}

function distToSegment([px, py]: Pt, [x1, y1]: Pt, [x2, y2]: Pt): number {
  const [ex, ey] = [x2 - x1, y2 - y1];
  const t = Math.max(0, Math.min(1, ((px - x1) * ex + (py - y1) * ey) / (ex * ex + ey * ey || 1)));
  return Math.hypot(px - (x1 + ex * t), py - (y1 + ey * t));
}

/** The point of any of the segments nearest p (null if there are none). */
function nearestOn(segments: [Pt, Pt][], [px, py]: Pt): Pt | null {
  let best: Pt | null = null;
  let bd = Infinity;
  for (const [[x1, y1], [x2, y2]] of segments) {
    const [ex, ey] = [x2 - x1, y2 - y1];
    const t = Math.max(0, Math.min(1, ((px - x1) * ex + (py - y1) * ey) / (ex * ex + ey * ey || 1)));
    const q: Pt = [x1 + ex * t, y1 + ey * t];
    const d = Math.hypot(px - q[0], py - q[1]);
    if (d < bd) [bd, best] = [d, q];
  }
  return best;
}

/**
 * The points between p and q of a border that would run straight between them, broken up the way the natural
 * borders are (see JAG), each with how far along from p to q it stands for (0..1): its middle pushed aside, then
 * each half's, while the legs are long enough. Aside is square to the stretch, or for an outline round the origin
 * (`round`), straight out from it or in towards it, so the outline still goes round the origin once.
 */
function jagged(p: Pt, q: Pt, rand: () => number, round: boolean, from = 0, to = 1): { p: Pt; f: number }[] {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (len < JAG_KM) return [];
  const off = (rand() * 2 - 1) * JAG * Math.min(len, JAG_SPAN_KM);
  const mid: Pt = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const away = Math.hypot(mid[0], mid[1]) || 1;
  const [ux, uy] = round ? [mid[0] / away, mid[1] / away] : [-(q[1] - p[1]) / len, (q[0] - p[0]) / len];
  const m: Pt = [mid[0] + ux * off, mid[1] + uy * off];
  const f = (from + to) / 2;
  return [...jagged(p, m, rand, round, from, f), { p: m, f }, ...jagged(m, q, rand, round, f, to)];
}

/** Whether segments pq and ab cross (touching at an end does not count). */
function crosses(p: Pt, q: Pt, a: Pt, b: Pt): boolean {
  const [rx, ry] = [q[0] - p[0], q[1] - p[1]];
  const [sx, sy] = [b[0] - a[0], b[1] - a[1]];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((a[0] - p[0]) * sy - (a[1] - p[1]) * sx) / den;
  const u = ((a[0] - p[0]) * ry - (a[1] - p[1]) * rx) / den;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
}

/** Signed distance from a point to a polygon's outline (positive inside). */
function edgeDistance(rings: Pt[][], p: Pt): number {
  let d = Infinity;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) d = Math.min(d, distToSegment(p, ring[j], ring[i]));
  return inPolygon(rings, p) ? d : -d;
}

/**
 * The point inside a polygon farthest from its outline and holes (the "pole of inaccessibility",
 * found by refining a grid of cells, as in Mapbox's polylabel), in the same flat units.
 */
function poleOf(rings: Pt[][], precision = 1): Pt {
  const xs = rings[0].map((p) => p[0]);
  const ys = rings[0].map((p) => p[1]);
  const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const size = Math.min(x1 - x0, y1 - y0);
  type Cell = { x: number; y: number; h: number; d: number; max: number };
  const cell = (x: number, y: number, h: number): Cell => {
    const d = edgeDistance(rings, [x, y]);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };
  const queue: Cell[] = [];
  for (let x = x0; x < x1; x += size) for (let y = y0; y < y1; y += size) queue.push(cell(x + size / 2, y + size / 2, size / 2));
  let best = cell((x0 + x1) / 2, (y0 + y1) / 2, 0);
  while (queue.length) {
    queue.sort((a, b) => a.max - b.max);
    const c = queue.pop()!;
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    const h = c.h / 2;
    queue.push(cell(c.x - h, c.y - h, h), cell(c.x + h, c.y - h, h), cell(c.x - h, c.y + h, h), cell(c.x + h, c.y + h, h));
  }
  return [best.x, best.y];
}

/** Area of a polygon (outer ring less holes) in flat units². */
function areaOf(rings: Pt[][]): number {
  const ring = (r: Pt[]) => Math.abs(r.reduce((s, [x, y], i) => s + x * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * y, 0)) / 2;
  return ring(rings[0]) - rings.slice(1).reduce((s, h) => s + ring(h), 0);
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const TAU = Math.PI * 2;
const keyOf = (p: Position) => `${p[0]},${p[1]}`;

/**
 * A closed ring without zero-width spikes (out to a point and straight back), which clipping leaves where
 * a city's outline grazes the point where its coast meets a land border: they would touch the next province.
 */
function withoutSpikes(ring: Position[]): Position[] {
  const same = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];
  const pts = ring.slice(0, -1);
  for (let changed = true; changed && pts.length > 3; ) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      if (same(prev, next) || same(prev, pts[i])) {
        pts.splice(i, same(prev, next) ? 2 : 1);
        changed = true;
        break;
      }
    }
  }
  return [...pts, pts[0]];
}

/** The part of a convex polygon where n · p ≤ c. */
function clipHalfPlane(poly: Pt[], [nx, ny]: Pt, c: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = nx * p[0] + ny * p[1] - c;
    const dq = nx * q[0] + ny * q[1] - c;
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** The cells with every corner of one that lies on another's edge added to that edge, so they meet corner to corner. */
function joined(cells: Pt[][]): Pt[][] {
  const corners = cells.flat();
  return cells.map((ring) => {
    const out: Pt[] = [];
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length];
      out.push(p);
      const [ex, ey] = [q[0] - p[0], q[1] - p[1]];
      const len2 = ex * ex + ey * ey;
      const on = corners
        .map((c) => ({ c, t: ((c[0] - p[0]) * ex + (c[1] - p[1]) * ey) / (len2 || 1) }))
        .filter(({ c, t }) => t > 1e-9 && t < 1 - 1e-9 && distToSegment(c, p, q) < 1e-7)
        .sort((a, b) => a.t - b.t);
      for (const { c } of on) if (!out.some((o) => o[0] === c[0] && o[1] === c[1])) out.push(c);
    });
    return out;
  });
}

/** The Voronoi cells of the seeds within a box: one convex polygon per seed. */
function voronoi(seeds: Pt[], [x0, y0, x1, y1]: [number, number, number, number]): Pt[][] {
  return seeds.map((p) => {
    let cell: Pt[] = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
    for (const q of seeds) {
      if (q === p || !cell.length) continue;
      cell = clipHalfPlane(cell, [q[0] - p[0], q[1] - p[1]], (q[0] * q[0] + q[1] * q[1] - p[0] * p[0] - p[1] * p[1]) / 2);
    }
    return cell;
  });
}

function nearestSeed([x, y]: Pt, seeds: Pt[]): number {
  let best = 0;
  let bd = Infinity;
  seeds.forEach(([sx, sy], i) => {
    const d = (x - sx) ** 2 + (y - sy) ** 2;
    if (d < bd) [bd, best] = [d, i];
  });
  return best;
}

/**
 * k seeds over the land sampled by `pts` (the city at the origin), as a centroidal Voronoi division
 * (Lloyd's algorithm), so the lands come out compact and of much the same size. It starts from the
 * middles of k slices of equal area round the city, beginning at the widest gap (so a city on the coast
 * fans out over the land only), which keeps it deterministic.
 */
function seedsOver(pts: Pt[], k: number): Pt[] {
  const order = pts.map((p, i) => [Math.atan2(p[1], p[0]), i] as const).sort((a, b) => a[0] - b[0]);
  let start = 0;
  let gap = -1;
  for (let i = 0; i < order.length; i++) {
    const next = i + 1 < order.length ? order[i + 1][0] : order[0][0] + Math.PI * 2;
    if (next - order[i][0] > gap) [gap, start] = [next - order[i][0], i + 1];
  }
  const turned = [...order.slice(start), ...order.slice(0, start)];
  let seeds: Pt[] = Array.from({ length: k }, (_, s) => {
    const part = turned.slice(Math.floor((s * turned.length) / k), Math.floor(((s + 1) * turned.length) / k));
    return [part.reduce((a, [, i]) => a + pts[i][0], 0) / part.length, part.reduce((a, [, i]) => a + pts[i][1], 0) / part.length];
  });
  for (let iter = 0; iter < 60; iter++) {
    const acc = seeds.map(() => [0, 0, 0]);
    for (const p of pts) {
      const s = nearestSeed(p, seeds);
      acc[s][0] += p[0];
      acc[s][1] += p[1];
      acc[s][2]++;
    }
    seeds = seeds.map((t, s) => (acc[s][2] ? [acc[s][0] / acc[s][2], acc[s][1] / acc[s][2]] : t));
  }
  return seeds;
}

const COMPASS = ['e', 'ene', 'ne', 'nne', 'n', 'nnw', 'nw', 'wnw', 'w', 'wsw', 'sw', 'ssw', 's', 'sse', 'se', 'ese'];

/**
 * Keys for the lands round a city from where their anchors lie: the compass point (of eight) towards each,
 * or of sixteen for lands that share one with a nearer land, numbered after that if they still share it.
 */
function compassKeys(anchors: Pt[]): string[] {
  const point = (a: number, n: number) => Math.round(((a / (Math.PI * 2)) * n + n) % n) % n;
  const bearing = anchors.map(([x, y]) => Math.atan2(y, x));
  const far = anchors.map(([x, y]) => Math.hypot(x, y));
  const eight = bearing.map((a) => COMPASS[point(a, 8) * 2]);
  const keys = eight.map((k, i) => (eight.some((o, j) => o === k && (far[j] < far[i] || (far[j] === far[i] && j < i))) ? COMPASS[point(bearing[i], 16)] : k));
  return keys.map((k, i) => {
    const before = keys.filter((o, j) => o === k && (far[j] < far[i] || (far[j] === far[i] && j < i))).length;
    return before ? `${k}${before + 1}` : k;
  });
}

/** For each arc of a TopoJSON object, the geometries (by index) that use it. */
function arcUsers(geoms: { type: string | null; arcs?: unknown }[]): Map<number, number[]> {
  const users = new Map<number, number[]>();
  const add = (arc: number, g: number) => {
    const i = arc < 0 ? ~arc : arc;
    const list = users.get(i) ?? [];
    if (!list.includes(g)) list.push(g);
    users.set(i, list);
  };
  geoms.forEach((g, gi) => {
    const walk = (a: unknown): void => {
      if (typeof a === 'number') add(a, gi);
      else if (Array.isArray(a)) a.forEach(walk);
    };
    walk(g.arcs);
  });
  return users;
}

/** Decoded arcs of a TopoJSON topology (delta-decoded and untransformed). */
function decodeArcs(topo: Topology): Position[][] {
  const t = topo.transform;
  return topo.arcs.map((arc) => {
    if (!t) return arc as Position[];
    let [x, y] = [0, 0];
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]];
    });
  });
}

/** A coast or border that turns back on itself more sharply than this (degrees) is a spike. */
const SPIKE_DEG = 6;

/**
 * Drops the points where a line turns straight back on itself, and repeated points: a fjord narrower than the
 * simplification collapses to a zero-width spike, which the map draws as a stray stub of border inside the land.
 * Works on the shared arcs, so every shape that uses one stays in step with its neighbours; an arc's ends (where
 * shapes meet) never move. Returns how many points it dropped.
 */
function withoutArcSpikes(topo: Topology): number {
  const t = topo.transform!;
  let dropped = 0;
  topo.arcs = topo.arcs.map((arc) => {
    let [x, y] = [0, 0];
    const pts = arc.map(([dx, dy]) => [(x += dx), (y += dy)]);
    const closed = pts.length > 1 && pts[0][0] === pts.at(-1)![0] && pts[0][1] === pts.at(-1)![1];
    for (let again = true; again; ) {
      again = false;
      for (let i = 1; i < pts.length - 1 && pts.length > (closed ? 4 : 2); i++) {
        const [p, q, r] = [pts[i - 1], pts[i], pts[i + 1]];
        const k = Math.cos(((t.translate[1] + q[1] * t.scale[1]) * Math.PI) / 180);
        const [ax, ay] = [(p[0] - q[0]) * t.scale[0] * k, (p[1] - q[1]) * t.scale[1]];
        const [bx, by] = [(r[0] - q[0]) * t.scale[0] * k, (r[1] - q[1]) * t.scale[1]];
        const [la, lb] = [Math.hypot(ax, ay), Math.hypot(bx, by)];
        if (la && lb && Math.acos(Math.min(1, (ax * bx + ay * by) / (la * lb))) > (SPIKE_DEG * Math.PI) / 180) continue;
        pts.splice(i--, 1);
        dropped++;
        again = true;
      }
    }
    return pts.map((p, i) => (i ? [p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]] : p)) as Topology['arcs'][number];
  });
  return dropped;
}

const lengthKm = (line: Position[], to: (p: Position) => Pt) => {
  let s = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const [a, b] = [to(line[i]), to(line[i + 1])];
    s += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return s;
};

interface Land {
  key: string;
  label: number;
  feature: Feature<Polygon | MultiPolygon, Props>;
  anchor: Pt;
  km2: number;
  units: Map<string, number>;
}

/** A region divided: its city's shape and its lands. */
interface Division {
  city: Feature<Polygon, Props>;
  lands: Land[];
}

/** A border broken up: each point as it is drawn (`rough`), and the point of the border as the division drew it that it stands for (`plain`). */
interface Rough {
  rough: Pt[];
  plain: Pt[];
}

/**
 * The borders this script drew itself, broken up like the natural ones (see JAG): each city's outline where it
 * meets the lands round it, and the cuts between those lands where they run straight through the units. Only the
 * drawing changes: every border keeps its ends, and keeps clear of every other border (ROUGH_CLEAR_KM) and of the
 * region's towns and anchors (PLACE_CLEAR_KM), or as clear as it was; where it would not, it is broken up less
 * there (its points drawn back towards where they were), so the provinces meet as they did and nothing gameplay
 * reads moves. Works on the finished map, in place: a border is an arc of it, shared by the provinces either side.
 */
function roughen(
  topo: Topology<{ provinces: GeometryCollection<Props> }>,
  done: Map<string, Division>,
  rowOf: Map<string, Row>,
  units: FeatureCollection<Polygon | MultiPolygon, UnitProps>,
): { broken: number; left: string[] } {
  const geoms = topo.objects.provinces.geometries;
  const ids = geoms.map((g) => (g.properties as Props).pid);
  const rowIdOf = (pid: string) => (rowOf.has(pid) ? pid : pid.slice(0, pid.lastIndexOf('-')));
  const arcs = decodeArcs(topo);
  const users = arcUsers(geoms as never);
  // Every border round and within each region: what a border broken up keeps clear of.
  const around = new Map<string, number[]>();
  for (const [arc, list] of users) for (const row of new Set(list.map((g) => rowIdOf(ids[g])))) around.set(row, [...(around.get(row) ?? []), arc]);
  // The borders of each region's units, which its lands follow where they do not cut through them.
  const unitEdges = new Map<string, [Pt, Pt][]>();
  const unitEdgesOf = (row: string, flat: ReturnType<typeof local>) => {
    if (!unitEdges.has(row))
      unitEdges.set(
        row,
        units.features
          .filter((f) => f.properties.pid === row)
          .flatMap((f) => ringsOf(f.geometry).flatMap((poly) => poly.flatMap((ring) => ring.slice(1).map((p, i) => [flat.to(ring[i]), flat.to(p)] as [Pt, Pt])))),
      );
    return unitEdges.get(row)!;
  };
  const changed: number[] = [];
  const left: string[] = [];
  for (const [arc, list] of [...users].sort((a, b) => a[0] - b[0])) {
    if (list.length !== 2) continue;
    const [a, b] = list.map((g) => ids[g]);
    const row = rowIdOf(a);
    if (rowIdOf(b) !== row) continue;
    const r = rowOf.get(row)!;
    const flat = local(r.city.coord);
    const pts = arcs[arc].map(flat.to);
    const rand = rngOf(`${row}|${keyOf(arcs[arc][0])}|${keyOf(arcs[arc][arcs[arc].length - 1])}`);
    const shape = a === row || b === row ? roughRing(pts, rand) : roughCuts(pts, unitEdgesOf(row, flat), rand);
    if (!shape) continue;
    const { rough, plain } = shape;
    const others = around
      .get(row)!
      .filter((o) => o !== arc)
      .flatMap((o) => {
        const line = arcs[o].map(flat.to);
        return line.slice(1).map((p, i) => [line[i], p] as [Pt, Pt]);
      });
    const gap = (x: Pt, segs: [Pt, Pt][]) => Math.min(...segs.map(([u, v]) => distToSegment(x, u, v)));
    const plainLegs = plain.slice(1).map((p, i) => [plain[i], p] as [Pt, Pt]);
    const places = [r.city.coord, ...r.towns.map(([, lon, lat]) => [lon, lat] as Pt), ...done.get(row)!.lands.map((l) => l.anchor)].map((c) => {
      const x = flat.to(c);
      return { x, keep: Math.min(PLACE_CLEAR_KM, gap(x, plainLegs) * 0.9) };
    });
    const plainClear = plain.map((p) => gap(p, others));
    const ends = [pts[0], pts[pts.length - 1]];
    // The points of a line that come too near another border or a place, or whose legs cross another border.
    const faults = (line: Pt[]) => {
      const bad = new Set<number>();
      for (let i = 0; i + 1 < line.length; i++) {
        const [p, q] = [line[i], line[i + 1]];
        if (others.some(([u, v]) => crosses(p, q, u, v)) || places.some(({ x, keep }) => distToSegment(x, p, q) < keep)) bad.add(i).add(i + 1);
      }
      for (let i = 1; i < line.length - 1; i++) {
        const near = Math.min(...ends.map((e) => Math.hypot(e[0] - line[i][0], e[1] - line[i][1])));
        if (gap(line[i], others) < Math.min(ROUGH_CLEAR_KM, near * 0.4, plainClear[i] * 0.9)) bad.add(i);
      }
      return bad;
    };
    // Each point drawn back halfway towards where it was, with its neighbours, wherever the line is at fault.
    const t = rough.map(() => 1);
    const drawn = () => rough.map((p, i): Pt => [plain[i][0] + (p[0] - plain[i][0]) * t[i], plain[i][1] + (p[1] - plain[i][1]) * t[i]]);
    let line = drawn();
    for (let pass = 0; pass < 8; pass++) {
      const bad = faults(line);
      if (!bad.size) break;
      const near = new Set([...bad].flatMap((i) => [i - 1, i, i + 1]).filter((i) => i > 0 && i < t.length - 1));
      for (const i of near) t[i] = pass < 6 ? t[i] / 2 : 0;
      line = drawn();
    }
    if (faults(line).size) {
      left.push(`${a}|${b}`);
      continue;
    }
    arcs[arc] = [arcs[arc][0], ...line.slice(1, -1).map((p) => flat.from(p)), arcs[arc][arcs[arc].length - 1]];
    changed.push(arc);
  }
  // Back into the map's integer grid, each point as a step from the one before; points that fall together, once.
  const { scale, translate } = topo.transform!;
  for (const arc of changed) {
    const grid = arcs[arc].map(([x, y]) => [Math.round((x - translate[0]) / scale[0]), Math.round((y - translate[1]) / scale[1])]);
    const kept = grid.filter((p, i) => i === 0 || p[0] !== grid[i - 1][0] || p[1] !== grid[i - 1][1]);
    topo.arcs[arc] = kept.map((p, i) => (i ? [p[0] - kept[i - 1][0], p[1] - kept[i - 1][1]] : p)) as Topology['arcs'][number];
  }
  return { broken: changed.length, left };
}

/**
 * A stretch of a city's outline (its points in km round the city, as the division drew it smooth) given corners
 * every RING_SIDE_KM or so, each pushed out from the city or in towards it by up to CORNER_REACH of its distance,
 * and the legs between them broken up. Its ends stay put. Null for a stretch too short to break up.
 */
function roughRing(pts: Pt[], rand: () => number): Rough | null {
  const steps = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const length = steps.reduce((s, x) => s + x, 0);
  const n = Math.round(length / RING_SIDE_KM);
  if (n < 1 || length < JAG_KM) return null;
  // The point `d` km along the stretch.
  const along = (d: number): Pt => {
    for (let i = 0; i < steps.length; i++) {
      if (d <= steps[i] || i === steps.length - 1) {
        const t = steps[i] ? Math.min(1, d / steps[i]) : 0;
        return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
      }
      d -= steps[i];
    }
    return pts[pts.length - 1];
  };
  const at = (k: number) => (k <= 0 ? pts[0] : k >= n ? pts[pts.length - 1] : along((k / n) * length));
  const corners = Array.from({ length: n + 1 }, (_, k): Pt => {
    const [x, y] = at(k);
    const f = k === 0 || k === n ? 1 : 1 + (rand() * 2 - 1) * CORNER_REACH;
    return [x * f, y * f];
  });
  const out: Rough = { rough: [], plain: [] };
  corners.forEach((c, k) => {
    out.rough.push(c);
    out.plain.push(at(k));
    if (k === n) return;
    for (const { p, f } of jagged(c, corners[k + 1], rand, true)) {
      out.rough.push(p);
      out.plain.push(at(k + f));
    }
  });
  return out;
}

/**
 * A border between two lands (its points in km round their city) with every straight stretch of it that cuts
 * through the units broken up; the rest, which follows the units' own borders (`unitEdges`), stays as it is.
 * Null where no stretch cuts through for long enough.
 */
function roughCuts(pts: Pt[], unitEdges: [Pt, Pt][], rand: () => number): Rough | null {
  const cuts = (i: number) => {
    const mid: Pt = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
    return unitEdges.every(([u, v]) => distToSegment(mid, u, v) >= ON_UNIT_KM);
  };
  const heading = (i: number) => Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
  const turn = (i: number, j: number) => Math.abs((((heading(j) - heading(i)) % TAU) + TAU + Math.PI) % TAU - Math.PI);
  const out: Rough = { rough: [pts[0]], plain: [pts[0]] };
  let changed = false;
  for (let i = 0; i < pts.length - 1; ) {
    // The longest run of legs from point i that cut through in a straight line, or that follow the units.
    const cutting = cuts(i);
    let j = i + 1;
    while (j < pts.length - 1 && cuts(j) === cutting && (!cutting || turn(i, j) < STRAIGHT)) j++;
    const breaks = cutting ? jagged(pts[i], pts[j], rand, false) : [];
    if (breaks.length) changed = true;
    for (const { p, f } of breaks) {
      out.rough.push(p);
      out.plain.push([pts[i][0] + (pts[j][0] - pts[i][0]) * f, pts[i][1] + (pts[j][1] - pts[i][1]) * f]);
    }
    for (const p of [...(breaks.length ? [] : pts.slice(i + 1, j)), pts[j]]) {
      out.rough.push(p);
      out.plain.push(p);
    }
    i = j;
  }
  return changed ? out : null;
}

async function main() {
  const hints = process.argv.includes('--hints');
  // 1. The whole regions and their units, as build-map.mjs drew them.
  const base = JSON.parse(readFileSync(baseFile, 'utf8')) as Base;
  const regions = feature(base, base.objects.provinces) as FeatureCollection<Polygon | MultiPolygon, Props>;
  const unitFc = feature(base, base.objects.units) as FeatureCollection<Polygon | MultiPolygon, UnitProps>;
  const countries = feature(base, base.objects.countries) as FeatureCollection<Polygon | MultiPolygon>;
  const everything = { type: 'GeometryCollection', geometries: [...base.objects.provinces.geometries, ...base.objects.countries.geometries] } as GeometryCollection;
  const byId = new Map(regions.features.map((f) => [f.properties.pid, f]));
  const rowOf = new Map<string, Row>(ROWS.map((r) => [r.id, r]));
  const seaward = new Map<string, boolean>();

  /** A region's land borders: arcs it shares with another region or country. The rest of its outline is coast. */
  const bordersOf = (id: string) =>
    mesh(base, everything, (a, b) => a !== b && ((a.properties as Props | undefined)?.pid === id || (b.properties as Props | undefined)?.pid === id));

  /** A city's outline at `scale` times its usual size: an irregular ring, pulled in short of any land border. */
  const outline = (row: Row, scale: number): Feature<Polygon, Props> => {
    const region = byId.get(row.id);
    if (!region) throw new Error(`No shape for ${row.id}`);
    const flat = local(row.city.coord);
    const borderSegs = segmentsOf(bordersOf(row.id).coordinates, flat.to);
    const coast = mesh(base, everything, (a, b) => a === b && (a.properties as Props | undefined)?.pid === row.id);
    const coastSegs = segmentsOf(coast.coordinates, flat.to);
    // A few gentle lobes from the city's seed.
    const rand = rngOf(row.id);
    const lobes = [2, 3, 5].map((k, i) => ({ k, a: [0.12, 0.08, 0.05][i] * (0.6 + rand() * 0.8), phase: rand() * Math.PI * 2 }));
    const r0 = RADIUS_KM[row.city.size] * scale;
    let sea = false;
    const ring: Pt[] = [];
    for (let i = 0; i < SPOKES; i++) {
      const a = (i / SPOKES) * Math.PI * 2;
      const [dx, dy] = [Math.cos(a), Math.sin(a)];
      const shape = r0 * (1 + lobes.reduce((s, l) => s + l.a * Math.sin(l.k * a + l.phase), 0));
      const border = firstHit(borderSegs, dx, dy);
      let r = Math.min(shape, Math.max(border - MARGIN_KM, border * 0.5));
      // Keep clear of borders off to the side of the spoke as well (where a coast meets a border, say).
      const clearance = Math.min(MARGIN_KM, border * 0.5);
      while (r > 0.5 && borderSegs.some(([p, q]) => distToSegment([dx * r, dy * r], p, q) < clearance)) r *= 0.9;
      if (firstHit(coastSegs, dx, dy) < r) sea = true;
      ring.push(flat.from([dx * r, dy * r]));
    }
    ring.push(ring[0]);
    seaward.set(row.id, sea);
    return { type: 'Feature', properties: { pid: row.id, iso: region.properties.iso }, geometry: { type: 'Polygon', coordinates: [ring] } };
  };

  /** A city clipped to its own region (so it follows the coast), keeping the piece the city stands in. */
  const clip = async (city: Feature<Polygon, Props>): Promise<Feature<Polygon, Props>> => {
    const out = await mapshaper.applyCommands('-i city.json -clip region.json -o city.json format=geojson', {
      'city.json': { type: 'FeatureCollection', features: [city] },
      'region.json': { type: 'FeatureCollection', features: [byId.get(city.properties.pid)!] },
    });
    const f = (JSON.parse(out['city.json']) as FeatureCollection<Polygon | MultiPolygon>).features[0];
    const row = rowOf.get(city.properties.pid)!;
    const flat = local(row.city.coord);
    const piece = ringsOf(f.geometry).find((poly) => inPolygon(poly.map((r) => r.map(flat.to)), [0, 0]));
    if (!piece) throw new Error(`${row.id}: the city lies outside its own region`);
    return { type: 'Feature', properties: city.properties, geometry: { type: 'Polygon', coordinates: piece.map(withoutSpikes) } };
  };

  /**
   * The region round a city divided into lands: about one per LAND_KM2 over the part the city stands on, the
   * land holding the city cut in two along a line through it if it would wrap round it, one more for each
   * other part big enough (an island), and the islets joined to the land nearest them. Returns the city's
   * shape (with every point where a land border meets it) and the lands.
   */
  const divide = async (row: Row, city: Feature<Polygon, Props>): Promise<Division> => {
    const flat = local(row.city.coord);
    const region = byId.get(row.id)!;
    const R = ringsOf(region.geometry).map((p) => p.map((r) => r.map(flat.to)));
    const C = ringsOf(city.geometry).map((p) => p.map((r) => r.map(flat.to)));
    const xs = R.flatMap((p) => p[0].map((q) => q[0]));
    const ys = R.flatMap((p) => p[0].map((q) => q[1]));
    const box: [number, number, number, number] = [Math.min(...xs) - 60, Math.min(...ys) - 60, Math.max(...xs) + 60, Math.max(...ys) + 60];
    const partArea = R.map(areaOf);
    const nearestPart = (p: Pt) => {
      const inside = R.findIndex((poly) => inPolygon(poly, p));
      return inside >= 0 ? inside : R.map((poly) => -edgeDistance(poly, p)).reduce((b, d, i, a) => (d < a[b] ? i : b), 0);
    };
    const home = nearestPart([0, 0]);
    // Weigh the land the city stands on with a grid of points, and note the rim: those just outside the city's
    // border with the land round it (not its coast), in plain sight of it (not across an estuary).
    const edges = (polys: Pt[][][]) => polys.flatMap((poly) => poly.flatMap((ring) => ring.slice(1).map((p, i) => [ring[i], p] as [Pt, Pt])));
    const outlineEdges = edges(R);
    const landward = edges(C).filter(([p, q]) => outlineEdges.every(([a, b]) => distToSegment([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], a, b) > 0.05));
    const pts: Pt[] = [];
    const rim: Pt[] = [];
    for (let x = box[0] + 60 + SAMPLE_KM / 2; x < box[2] - 60; x += SAMPLE_KM)
      for (let y = box[1] + 60 + SAMPLE_KM / 2; y < box[3] - 60; y += SAMPLE_KM) {
        const p: Pt = [x, y];
        if (!inPolygon(R[home], p) || C.some((poly) => inPolygon(poly, p))) continue;
        pts.push(p);
        const q = nearestOn(landward, p);
        if (q && Math.hypot(q[0] - p[0], q[1] - p[1]) < RIM_KM && !outlineEdges.some(([a, b]) => crosses(p, q, a, b))) rim.push(p);
      }
    const k = Math.max(MIN_LANDS, Math.min(MAX_LANDS, Math.round((pts.length * SAMPLE_KM * SAMPLE_KM) / LAND_KM2)));
    const shares = (seeds: Pt[]) => seeds.map((_, s) => rim.filter((p) => nearestSeed(p, seeds) === s).length / Math.max(1, rim.length));
    // The roads out of the city, to the cities next door: a cut keeps as far from them as it can, so each road
    // leaves through one of the halves.
    const roads = CONNECTIONS.filter((c) => c.a === row.id || c.b === row.id).map((c) => {
      const [x, y] = flat.to(rowOf.get(c.a === row.id ? c.b : c.a)!.city.coord);
      return Math.atan2(y, x);
    });
    /** How far apart two bearings are (0 to π). */
    const apart = (a: number, b: number) => Math.abs((((a - b) % TAU) + TAU + Math.PI) % TAU - Math.PI);
    /**
     * The best cut of the land of seed `wrap` in two at the city: two borders running out from its middle (in
     * line, or bent there), or one straight across its border with the land anywhere (the middle of a city on a
     * headland can be well off that border). Neither half may be lopsided, in the land or in its rim, nor sprawl
     * (round a bay, say), nor be in pieces (across an estuary, which would lose the piece by the city); among the
     * cuts that manage that, the one farthest from every road wins.
     */
    const cutOf = (seeds: Pt[], wrap: number): Cut => {
      const mine = pts.filter((p) => nearestSeed(p, seeds) === wrap);
      const mineRim = rim.filter((p) => nearestSeed(p, seeds) === wrap);
      const keyAt = (p: Pt) => `${Math.round(p[0] / SAMPLE_KM)},${Math.round(p[1] / SAMPLE_KM)}`;
      const at = new Map(mine.map((p, i) => [keyAt(p), i]));
      const rimAt = new Set(mineRim.map(keyAt));
      // Whether a half is in one piece on the grid of points: its largest stretch holds nearly all of it, and
      // nearly all of its rim (a stray piece by the city would be given away, and the half would not reach it).
      const whole = (inHalf: boolean[]) => {
        const seen = new Array(mine.length).fill(false);
        let largest = { size: 0, rim: 0 };
        let total = 0;
        let rimTotal = 0;
        mine.forEach((_, i) => {
          if (!inHalf[i]) return;
          total++;
          if (seen[i]) return;
          const part = { size: 0, rim: 0 };
          const stack = [i];
          seen[i] = true;
          while (stack.length) {
            const j = stack.pop()!;
            const [gx, gy] = [Math.round(mine[j][0] / SAMPLE_KM), Math.round(mine[j][1] / SAMPLE_KM)];
            part.size++;
            if (rimAt.has(`${gx},${gy}`)) part.rim++;
            for (const [dx, dy] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ]) {
              const o = at.get(`${gx + dx},${gy + dy}`);
              if (o !== undefined && inHalf[o] && !seen[o]) {
                seen[o] = true;
                stack.push(o);
              }
            }
          }
          rimTotal += part.rim;
          if (part.size > largest.size) largest = part;
        });
        return !total || (largest.size >= CUT_WHOLE * total && largest.rim >= CUT_WHOLE * rimTotal);
      };
      // How far each half's land lies from its middle, for its size (a disc has 1/2π): a half sprawls when it is
      // spread wider than SPREAD, or than the whole land (a strip of coast is cut into shorter strips, not widened).
      const spread = (n: number, x: number, y: number, q: number) => (n ? (q / n - (x / n) ** 2 - (y / n) ** 2) / (n * SAMPLE_KM * SAMPLE_KM) : 0);
      const most = Math.max(
        SPREAD,
        spread(
          mine.length,
          mine.reduce((a, p) => a + p[0], 0),
          mine.reduce((a, p) => a + p[1], 0),
          mine.reduce((a, p) => a + p[0] * p[0] + p[1] * p[1], 0),
        ),
      );
      const cuts: Cut[] = [];
      // Half A is where every plane of the cut holds (n · p ≤ c), half B the rest.
      const consider = (planes: Plane[], rays: number[], offset: number) => {
        const inA = (p: Pt) => planes.every(({ n, c }) => n[0] * p[0] + n[1] * p[1] <= c);
        const m = [0, 0, 0, 0, 0, 0, 0, 0];
        for (const p of mine) {
          const o = inA(p) ? 0 : 4;
          m[o]++;
          m[o + 1] += p[0];
          m[o + 2] += p[1];
          m[o + 3] += p[0] * p[0] + p[1] * p[1];
        }
        const land = m[0] / Math.max(1, mine.length);
        const edge = mineRim.filter(inA).length / Math.max(1, mineRim.length);
        const sprawl = Math.max(0, spread(m[0], m[1], m[2], m[3]) - most) + Math.max(0, spread(m[4], m[5], m[6], m[7]) - most);
        const clear = roads.length ? Math.min(Math.PI / 2, ...roads.map((r) => Math.min(...rays.map((a) => apart(r, a))))) : 0;
        // How far a half falls short, the land counting double: a sliver of land is worse than a short stretch at the city.
        const short = Math.max(0, Math.abs(land - 0.5) - CUT_SLACK) * 2 + Math.max(0, Math.abs(edge - 0.5) - RIM_SLACK);
        const cost = short * 20 + sprawl * 40 + (Math.abs(land - 0.5) + Math.abs(edge - 0.5)) * 0.5 - clear + offset * 0.01;
        cuts.push({ planes, short, sprawl, cost, broken: false });
      };
      for (let from = 0; from < 360; from += CUT_STEP)
        for (let span = MIN_SPAN; span <= 180; span += CUT_STEP) {
          const [a, b] = [(from * Math.PI) / 180, ((from + span) * Math.PI) / 180];
          consider(
            [
              { n: [Math.sin(a), -Math.cos(a)], c: 0 },
              { n: [-Math.sin(b), Math.cos(b)], c: 0 },
            ],
            [a, b],
            0,
          );
        }
      const border = landward.flat();
      for (let deg = 0; deg < 180; deg += CUT_STEP) {
        const a = (deg * Math.PI) / 180;
        const n: Pt = [-Math.sin(a), Math.cos(a)];
        const across = border.map(([x, y]) => n[0] * x + n[1] * y);
        for (let c = Math.ceil(Math.min(...across) / OFFSET_KM) * OFFSET_KM; c <= Math.max(...across); c += OFFSET_KM)
          if (c !== 0) consider([{ n, c }], [a, a + Math.PI], Math.abs(c));
      }
      // Cheapest first; a cut that leaves a half in pieces costs more, so look only as far as that could matter.
      cuts.sort((x, y) => x.cost - y.cost);
      let best: Cut | null = null;
      for (const c of cuts) {
        if (best && c.cost >= best.cost) break;
        const inA = mine.map((p) => c.planes.every(({ n, c: k }) => n[0] * p[0] + n[1] * p[1] <= k));
        const broken = !whole(inA) || !whole(inA.map((x) => !x));
        const cost = c.cost + (broken ? 5 : 0);
        if (!best || cost < best.cost) best = { ...c, broken, cost };
      }
      return best ?? { planes: [{ n: [0, 1], c: 0 }], short: Infinity, sprawl: Infinity, cost: Infinity, broken: true };
    };
    // Where one land would wrap round the city, the division is made with one land fewer and the land the city
    // stands in is cut in two at the city (with two lands, that is the region halved there). The full division
    // with that cut, and one with a land more (cut too if it still wraps), are weighed against it: each land more
    // costs EXTRA_LAND, so they win only where the cut with one land fewer is poor (in pieces, say, or sprawling).
    const wrapOf = (s: Pt[]) => {
      const share = shares(s);
      const top = share.indexOf(Math.max(...share));
      return { top, wraps: share[top] > WRAP_SHARE };
    };
    let seeds = seedsOver(pts, k);
    let line: Cut | null = null;
    if (wrapOf(seeds).wraps) {
      let best = { seeds, line: null as Cut | null, cost: Infinity };
      for (const m of [k - 1, k, k + 1]) {
        const s = m === k ? seeds : seedsOver(pts, m);
        const { top, wraps } = wrapOf(s);
        const cut = m <= k || wraps ? cutOf(s, top) : null;
        const cost = (cut?.cost ?? 0) + EXTRA_LAND * (m + (cut ? 1 : 0) - k);
        if (cost < best.cost) best = { seeds: s, line: cut, cost };
      }
      ({ seeds, line } = best);
    }
    const wrap = wrapOf(seeds).top;
    const cells = voronoi(seeds, box).map((ring, label) => ({ label, ring }));
    if (line) {
      // Half A is where every plane of the cut holds, half B where any does not.
      const cell = cells[wrap].ring;
      cells[wrap].ring = line.planes.reduce((ring, { n, c }) => clipHalfPlane(ring, n, c), cell);
      for (const { n, c } of line.planes) cells.push({ label: seeds.length, ring: clipHalfPlane(cell, [-n[0], -n[1]], -c) });
    }
    const rings = joined(cells.map((c) => c.ring));
    cells.forEach((c, i) => (c.ring = rings[i]));
    const count = seeds.length + 1;
    const toLonLat = (ring: Pt[]) => [...ring, ring[0]].map((p) => flat.from(p));
    const units = unitFc.features.filter((f) => f.properties.pid === row.id);
    // The units less the city, cut along the cells; each piece knows its unit and its cell.
    const out = await mapshaper.applyCommands(
      [
        '-i units.json city.json cells.json combine-files',
        '-erase city target=units',
        '-explode target=units',
        '-each "atom = this.id" target=units',
        // Rebuilt as one topology first: a cut cell's corners lie on the next cell's edge.
        '-dissolve label target=cells',
        '-union target=units,cells name=pieces',
        '-filter "atom !== null && atom !== undefined" target=pieces',
        '-o target=pieces,city pieces.json format=topojson no-quantization',
      ].join(' '),
      {
        'units.json': { type: 'FeatureCollection', features: units },
        'city.json': { type: 'FeatureCollection', features: [city] },
        'cells.json': {
          type: 'FeatureCollection',
          features: cells
            .filter((c) => c.ring.length >= 3)
            .map((c) => ({ type: 'Feature', properties: { label: c.label }, geometry: { type: 'Polygon', coordinates: [toLonLat(c.ring)] } })),
        },
      },
    );
    const topo = JSON.parse(out['pieces.json']) as Topology<{ pieces: GeometryCollection<{ atom: number; label: number; name: string }>; city: GeometryCollection }>;
    const geoms = topo.objects.pieces.geometries.filter((g) => g.type);
    const pieceFc = feature(topo, { type: 'GeometryCollection', geometries: geoms } as GeometryCollection) as FeatureCollection<
      Polygon | MultiPolygon,
      { atom: number; label: number; name: string }
    >;
    const arcs = decodeArcs(topo);
    const users = arcUsers(geoms as never);
    const cityArcs = new Set<number>();
    (function walk(a: unknown): void {
      if (typeof a === 'number') cityArcs.add(a < 0 ? ~a : a);
      else if (Array.isArray(a)) a.forEach(walk);
    })((topo.objects.city.geometries[0] as { arcs?: unknown }).arcs);
    const n = pieceFc.features.length;
    const flatPolys = pieceFc.features.map((f) => ringsOf(f.geometry).map((poly) => poly.map((r) => r.map(flat.to))));
    const km2 = flatPolys.map((polys) => polys.reduce((s, poly) => s + areaOf(poly), 0));
    const atom = pieceFc.features.map((f) => f.properties.atom);
    const label = pieceFc.features.map((f) => f.properties.label);
    // Which part of the region each piece lies on: the city's, an island of its own, or an islet.
    const part = flatPolys.map((polys) => nearestPart(poleOf(polys.reduce((a, b) => (areaOf(b) > areaOf(a) ? b : a)), 0.5)));
    const own = R.map((_, i) => i !== home && partArea[i] >= OWN_LAND_KM2);
    const islet = part.map((pi) => pi !== home && !own[pi]);
    part.forEach((pi, i) => {
      if (own[pi]) label[i] = count + pi;
    });
    // Shared border lengths between pieces, and which pieces touch the city.
    const shared = new Map<string, number>();
    const touchesCity = new Array(n).fill(false);
    for (const [arc, list] of users) {
      if (cityArcs.has(arc)) for (const g of list) touchesCity[g] = true;
      if (list.length !== 2) continue;
      const key = list[0] < list[1] ? `${list[0]}|${list[1]}` : `${list[1]}|${list[0]}`;
      shared.set(key, (shared.get(key) ?? 0) + lengthKm(arcs[arc], flat.to));
    }
    const adj: Map<number, number>[] = Array.from({ length: n }, () => new Map());
    for (const [key, len] of shared) {
      const [a, b] = key.split('|').map(Number);
      adj[a].set(b, len);
      adj[b].set(a, len);
    }
    // Units small enough go whole to the land that takes most of them.
    const halves = line ? [wrap, seeds.length] : [];
    const atoms = new Map<number, number[]>();
    atom.forEach((a, i) => {
      if (part[i] === home) atoms.set(a, [...(atoms.get(a) ?? []), i]);
    });
    for (const members of atoms.values()) {
      const total = members.reduce((s, i) => s + km2[i], 0);
      const share = new Map<number, number>();
      for (const i of members) share.set(label[i], (share.get(label[i]) ?? 0) + km2[i]);
      const [top] = [...share.entries()].reduce((a, b) => (b[1] > a[1] ? b : a));
      // Round the city, and across a cut through it, the lands follow the cut, so that two of them always meet
      // at the city and neither half dwindles.
      const nearCity = members.some((i) => touchesCity[i]);
      const onCut = halves.every((h) => members.some((i) => label[i] === h));
      if (total < WHOLE_UNIT_KM2 && !nearCity && !onCut) for (const i of members) label[i] = top;
    }
    // Each land in one piece: a stray part goes to the land it borders most.
    for (let pass = 0; pass < 12; pass++) {
      let changed = false;
      const seen = new Array(n).fill(false);
      const groups: { label: number; members: number[]; km2: number }[] = [];
      for (let i = 0; i < n; i++) {
        if (seen[i] || part[i] !== home) continue;
        const members = [i];
        seen[i] = true;
        for (let j = 0; j < members.length; j++)
          for (const m of adj[members[j]].keys())
            if (!seen[m] && label[m] === label[i]) {
              seen[m] = true;
              members.push(m);
            }
        groups.push({ label: label[i], members, km2: members.reduce((s, m) => s + km2[m], 0) });
      }
      for (const g of groups) {
        const biggest = Math.max(...groups.filter((x) => x.label === g.label).map((x) => x.km2));
        if (g.km2 === biggest) continue;
        const border = new Map<number, number>();
        for (const m of g.members) for (const [o, len] of adj[m]) if (label[o] !== g.label) border.set(label[o], (border.get(label[o]) ?? 0) + len);
        if (!border.size) continue;
        const to = [...border.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
        for (const m of g.members) label[m] = to;
        changed = true;
      }
      if (!changed) break;
    }
    // A land too small to stand alone joins the land it borders most (the halves of a cut land, which share
    // one land's worth, are left: they are what keeps the land round the city from wrapping round it).
    const area = (l: number) => label.reduce((s, x, i) => s + (x === l && part[i] === home ? km2[i] : 0), 0);
    const homeKm2 = km2.reduce((s, a, i) => s + (part[i] === home ? a : 0), 0);
    for (;;) {
      const homeLabels = [...new Set(label.filter((_, i) => part[i] === home))];
      const small = homeLabels.filter((l) => !halves.includes(l) && area(l) < (MIN_LAND_SHARE * homeKm2) / homeLabels.length);
      if (!small.length || homeLabels.length <= MIN_LANDS) break;
      const l = small.reduce((a, b) => (area(b) < area(a) ? b : a));
      const border = new Map<number, number>();
      label.forEach((x, i) => {
        if (x === l) for (const [o, len] of adj[i]) if (label[o] !== l && part[o] === home) border.set(label[o], (border.get(label[o]) ?? 0) + len);
      });
      if (!border.size) break;
      const to = [...border.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      label.forEach((x, i) => {
        if (x === l) label[i] = to;
      });
    }
    // Islets join the land nearest them.
    for (let i = 0; i < n; i++) {
      if (!islet[i]) continue;
      const at = poleOf(flatPolys[i].reduce((a, b) => (areaOf(b) > areaOf(a) ? b : a)), 0.5);
      let best = -1;
      let bd = Infinity;
      for (let j = 0; j < n; j++) {
        if (islet[j]) continue;
        const d = Math.min(...flatPolys[j].map((poly) => Math.abs(edgeDistance(poly, at))));
        if (d < bd) [bd, best] = [d, j];
      }
      label[i] = label[best];
    }

    // Join each land's pieces.
    const dissolved = await mapshaper.applyCommands('-i pieces.json -dissolve label -o lands.json format=geojson', {
      'pieces.json': {
        type: 'FeatureCollection',
        features: pieceFc.features.map((f, i) => ({ ...f, properties: { label: label[i] } })),
      },
    });
    const landFc = JSON.parse(dissolved['lands.json']) as FeatureCollection<Polygon | MultiPolygon, { label: number }>;
    // The lands must cover the region less the city: overlay operations can go wrong on bad input.
    const regionKm2 = R.reduce((a, poly) => a + areaOf(poly), 0) - C.reduce((a, poly) => a + areaOf(poly), 0);
    const landKm2 = landFc.features.reduce((a, f) => a + (f.geometry ? ringsOf(f.geometry).reduce((b, poly) => b + areaOf(poly.map((r) => r.map(flat.to))), 0) : 0), 0);
    if (Math.abs(landKm2 - regionKm2) > 0.01 * regionKm2 || landFc.features.some((f) => !f.geometry))
      throw new Error(`${row.id}: the lands cover ${Math.round(landKm2)} km² of the ${Math.round(regionKm2)} round the city`);
    const lands = landFc.features.map((f) => {
      const polys = ringsOf(f.geometry).map((p) => p.map((r) => r.map(flat.to)));
      const largest = polys.reduce((a, b) => (areaOf(b) > areaOf(a) ? b : a));
      const anchor = poleOf(largest);
      const unitsHeld = new Map<string, number>();
      label.forEach((l, i) => {
        if (l === f.properties.label) unitsHeld.set(pieceFc.features[i].properties.name, (unitsHeld.get(pieceFc.features[i].properties.name) ?? 0) + km2[i]);
      });
      return { label: f.properties.label, f, anchor, km2: polys.reduce((s, p) => s + areaOf(p), 0), units: unitsHeld };
    });
    const keys = compassKeys(lands.map((l) => l.anchor));
    const cityOut = feature(topo, topo.objects.city) as FeatureCollection<Polygon, Props>;
    // Largest first: the first land is where an old save's land and its armies go.
    const order = lands.map((_, i) => i).sort((a, b) => lands[b].km2 - lands[a].km2);
    return {
      city: { type: 'Feature', properties: city.properties, geometry: cityOut.features[0].geometry },
      lands: order.map((i) => {
        const l = lands[i];
        const [lon, lat] = flat.from(l.anchor);
        return {
          key: keys[i],
          label: l.label,
          feature: { type: 'Feature', properties: { pid: `${row.id}-${keys[i]}`, iso: region.properties.iso }, geometry: l.f.geometry },
          anchor: [round3(lon), round3(lat)],
          km2: l.km2,
          units: l.units,
        };
      }),
    };
  };

  /**
   * Where a border between two lands meets the region's land border off its own vertices, moves that
   * point onto the nearest vertex of the border, so the province next door, which has no such point,
   * shares the border arc for arc.
   */
  const snapToBorders = (row: Row, lands: Land[]) => {
    const flat = local(row.city.coord);
    const lines = bordersOf(row.id).coordinates;
    const own = new Set(lines.flat().map(keyOf));
    const segs: [Position, Position][] = lines.flatMap((line) => line.slice(1).map((p, i) => [line[i], p] as [Position, Position]));
    const snap = (p: Position): Position => {
      if (own.has(keyOf(p))) return p;
      const q = flat.to(p);
      for (const [a, b] of segs) {
        if (distToSegment(q, flat.to(a), flat.to(b)) > 0.001) continue;
        const [da, db] = [Math.hypot(...(flat.to(a).map((v, i) => v - q[i]) as Pt)), Math.hypot(...(flat.to(b).map((v, i) => v - q[i]) as Pt))];
        return da <= db ? a : b;
      }
      return p;
    };
    for (const land of lands) {
      const g = land.feature.geometry;
      const fix = (ring: Position[]) => {
        const pts = ring.map(snap).filter((p, i, a) => i === 0 || keyOf(p) !== keyOf(a[i - 1]));
        if (keyOf(pts[0]) !== keyOf(pts[pts.length - 1])) pts.push(pts[0]);
        return pts;
      };
      if (g.type === 'Polygon') g.coordinates = g.coordinates.map(fix);
      else g.coordinates = g.coordinates.map((poly) => poly.map(fix));
    }
  };

  // 2. Each city drawn tight round itself, then the land round it divided. Where a city touches another
  //    region's land (clipping can leave a hair along a coast that meets a border), it is drawn a little
  //    smaller and divided again.
  const scale = new Map(ROWS.map((r) => [r.id, 1]));
  const done = new Map<string, Division>();
  let out: Topology<{ provinces: GeometryCollection<Props>; countries: GeometryCollection }> | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    for (const row of ROWS) {
      if (done.has(row.id)) continue;
      const city = await clip(outline(row, scale.get(row.id)!));
      const result = await divide(row, city);
      snapToBorders(row, result.lands);
      done.set(row.id, result);
    }
    const all = [...done.values()];
    const cut = await mapshaper.applyCommands(
      [
        '-i cities.json lands.json countries.json combine-files',
        '-merge-layers target=cities,lands name=provinces force',
        '-filter-fields target=provinces pid,iso',
        `-o target=provinces,countries map.topo.json format=topojson quantization=${QUANTIZATION}`,
      ].join(' '),
      {
        'cities.json': { type: 'FeatureCollection', features: all.map((d) => d.city) },
        'lands.json': { type: 'FeatureCollection', features: all.flatMap((d) => d.lands.map((l) => l.feature)) },
        'countries.json': countries,
      },
    );
    out = JSON.parse(cut['map.topo.json']) as Topology<{ provinces: GeometryCollection<Props>; countries: GeometryCollection }>;
    for (const o of Object.values(out.objects)) o.geometries = o.geometries.filter((g) => g.type);
    const geoms = out.objects.provinces.geometries;
    const ids = geoms.map((g) => (g.properties as Props).pid);
    const touching = new Set<string>();
    neighbors(geoms as never).forEach((list, i) => {
      for (const j of list) if (rowOf.has(ids[i]) && !ids[j].startsWith(`${ids[i]}-`)) touching.add(ids[i]);
    });
    if (!touching.size) break;
    if (attempt === 7) throw new Error(`Cities still touching another region: ${[...touching].join(', ')}`);
    for (const id of touching) {
      scale.set(id, scale.get(id)! * 0.85);
      done.delete(id);
    }
  }
  if (!out) throw new Error('No map');
  // The borders the division drew itself broken up like the natural ones, leaving everything else as it is.
  const rough = roughen(out, done, rowOf, unitFc);
  const spikes = withoutArcSpikes(out);

  // 3. The links: every shared border (as the rows' connection says), the sea crossings between the
  //    nearest coasts, and a crossing to any land its row's other provinces cannot reach on foot.
  const geoms = out.objects.provinces.geometries;
  const ids = geoms.map((g) => (g.properties as Props).pid);
  const rowIdOf = (pid: string) => (rowOf.has(pid) ? pid : pid.slice(0, pid.lastIndexOf('-')));
  const between = (a: string, b: string) => CONNECTIONS.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
  const links: ConnectionDef[] = [];
  const linked = new Set<string>();
  const missing: string[] = [];
  const add = (c: ConnectionDef) => {
    const key = [c.a, c.b].sort().join('|');
    if (linked.has(key)) return;
    linked.add(key);
    links.push(c);
  };
  neighbors(geoms as never).forEach((list, i) => {
    for (const j of list) {
      if (j < i) continue;
      const [a, b] = [ids[i], ids[j]];
      const [ra, rb] = [rowIdOf(a), rowIdOf(b)];
      if (ra === rb) {
        add({ a, b, kind: 'land' });
        continue;
      }
      const c = between(ra, rb);
      if (!c || c.kind === 'strait') {
        missing.push(`${ra} — ${rb}`);
        continue;
      }
      add({ a, b, kind: c.kind, ...(c.label ? { label: c.label } : {}) });
    }
  });
  const touchingRows = new Set(links.map((c) => [rowIdOf(c.a), rowIdOf(c.b)].sort().join('|')));
  const detached = CONNECTIONS.filter((c) => c.kind !== 'strait' && !touchingRows.has([c.a, c.b].sort().join('|')));
  if (missing.length || detached.length) {
    throw new Error(
      [
        ...[...new Set(missing)].map((m) => `Shared border without a land or mountain connection: ${m}`),
        ...detached.map((c) => `Connection between regions that share no border: ${c.a} — ${c.b}`),
      ].join('\n'),
    );
  }
  // Coasts: the outline a land shares with nothing.
  const finalAll = { type: 'GeometryCollection', geometries: [...out.objects.provinces.geometries, ...out.objects.countries.geometries] } as GeometryCollection;
  const coastOf = (pid: string) => mesh(out!, finalAll, (a, b) => a === b && (a.properties as Props | undefined)?.pid === pid).coordinates;
  const coasts = new Map(ids.map((pid) => [pid, coastOf(pid)]));
  /** The two lands, one of each list, whose coasts come nearest, and how near (km). */
  const nearest = (as: string[], bs: string[], at: Pt): [string, string, number] | null => {
    const flat = local(at);
    let best: [string, string, number] | null = null;
    const pointsOf = (pid: string) => coasts.get(pid)!.flat().filter((_, i, a) => a.length < 400 || i % 3 === 0).map(flat.to);
    for (const a of as) {
      const pa = pointsOf(a);
      if (!pa.length) continue;
      for (const b of bs) {
        const pb = pointsOf(b);
        for (const p of pa) for (const q of pb) {
          const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
          if (!best || d < best[2]) best = [a, b, d];
        }
      }
    }
    return best;
  };
  const landsOf = (rowId: string) => done.get(rowId)!.lands.map((l) => l.feature.properties.pid);
  for (const c of CONNECTIONS.filter((x) => x.kind === 'strait')) {
    const [ra, rb] = [rowOf.get(c.a)!, rowOf.get(c.b)!];
    const mid: Pt = [(ra.city.coord[0] + rb.city.coord[0]) / 2, (ra.city.coord[1] + rb.city.coord[1]) / 2];
    const pair = nearest(landsOf(c.a), landsOf(c.b), mid);
    if (!pair) throw new Error(`No coasts for the ${c.label} between ${c.a} and ${c.b}`);
    add({ a: pair[0], b: pair[1], kind: 'strait', label: c.label, seaKm: Math.round(pair[2]) });
  }
  for (const row of ROWS) {
    // Lands its city cannot reach on foot (an island of the region) get a crossing from the nearest coast.
    for (;;) {
      const reach = new Set([row.id]);
      const queue = [row.id];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const c of links) {
          const other = c.a === cur ? c.b : c.b === cur ? c.a : null;
          if (other && rowIdOf(other) === row.id && !reach.has(other)) {
            reach.add(other);
            queue.push(other);
          }
        }
      }
      const cutOff = landsOf(row.id).filter((pid) => !reach.has(pid));
      if (!cutOff.length) break;
      const pair = nearest([...reach].filter((p) => p !== row.id), cutOff, row.city.coord);
      if (!pair) throw new Error(`${row.id}: no coast to reach ${cutOff.join(', ')}`);
      if (!CROSSINGS[row.id]) throw new Error(`${row.id}: name the crossing to ${cutOff.join(', ')} in CROSSINGS (connections.ts)`);
      add({ a: pair[0], b: pair[1], kind: 'strait', label: CROSSINGS[row.id], seaKm: Math.round(pair[2]) });
    }
  }

  // 4. What gameplay needs of each row: whether its city reaches the sea, and each land's anchor, coast and towns.
  // The lands as the map draws them, their borders broken up: where the towns lie.
  const drawn = new Map(
    (feature(out, out.objects.provinces) as FeatureCollection<Polygon | MultiPolygon, Props>).features.map((f) => [f.properties.pid, f.geometry]),
  );
  const landData = ROWS.map((row) => {
    const { lands } = done.get(row.id)!;
    const towns = new Map<string, string[]>(lands.map((l) => [l.key, []]));
    const flat = local(row.city.coord);
    const polysOf = (l: Land) => ringsOf(drawn.get(l.feature.properties.pid)!).map((poly) => poly.map((r) => r.map(flat.to)));
    for (const [name, lon, lat] of row.towns) {
      const p = flat.to([lon, lat]);
      // A town inside the city's own ring goes with the land nearest it.
      const gap = (l: Land) => Math.min(...polysOf(l).map((poly) => Math.abs(edgeDistance(poly, p))));
      const home = lands.find((l) => polysOf(l).some((poly) => inPolygon(poly, p))) ?? lands.reduce((a, b) => (gap(b) < gap(a) ? b : a));
      towns.get(home.key)!.push(name);
    }
    return { row, lands, towns };
  });

  if (hints) {
    for (const { row, lands, towns } of landData) {
      console.log(`\n${row.id} (${row.city.name}, ${row.name})`);
      for (const l of lands) {
        const pid = l.feature.properties.pid;
        const next = links
          .filter((c) => c.a === pid || c.b === pid)
          .map((c) => (c.a === pid ? c.b : c.a))
          .filter((o) => rowIdOf(o) !== row.id)
          .map((o) => `${o}${links.find((c) => (c.a === pid && c.b === o) || (c.b === pid && c.a === o))!.kind === 'strait' ? '~' : ''}`);
        const units = [...l.units.entries()].sort((a, b) => b[1] - a[1]).map(([u, a]) => `${u} ${Math.round(a)}`);
        console.log(`  ${l.key.padEnd(4)} ${String(Math.round(l.km2)).padStart(6)} km²  towns: ${towns.get(l.key)!.join(', ') || '—'}`);
        console.log(`        units: ${units.join(', ')}`);
        console.log(`        next: ${next.join(', ') || '—'}`);
      }
    }
  }

  writeFileSync(mapFile, JSON.stringify(out));
  const coastal = (pid: string) => coasts.get(pid)!.some((line) => line.length > 1);
  const lines = landData.map(({ row, lands, towns }) => {
    const entries = lands.map(
      (l) => `{ key: '${l.key}', anchor: [${l.anchor.join(', ')}], coastal: ${coastal(l.feature.properties.pid)}, towns: [${towns.get(l.key)!.map((t) => `'${t.replace(/'/g, "\\'")}'`).join(', ')}] }`,
    );
    return `  '${row.id}': {\n    coast: ${seaward.get(row.id)},\n    lands: [\n      ${entries.join(',\n      ')},\n    ],\n  },`;
  });
  const linkLines = links.map(
    (c) => `  { a: '${c.a}', b: '${c.b}', kind: '${c.kind}'${c.label ? `, label: '${c.label.replace(/'/g, "\\'")}'` : ''}${c.seaKm !== undefined ? `, seaKm: ${c.seaKm}` : ''} },`,
  );
  writeFileSync(
    landFile,
    [
      '// Generated by scripts/map/city-provinces.ts from the map shapes: do not edit by hand.',
      '// For each row: whether its city reaches the sea, and the lands round it (keyed by compass point',
      '// from the city: the land is `<row id>-<key>`), each with its anchor (its armies stand there), its',
      "// coast and the row's towns that lie in it. Then every link between provinces: shared borders (land",
      "// or mountain, as the rows' connection says), sea crossings between the nearest coasts, and crossings",
      "// to a row's lands its city cannot reach on foot.",
      "import type { ConnectionDef } from '../../types';",
      "import type { LandData } from '../build';",
      '',
      'export const LAND: LandData = {',
      ...lines,
      '};',
      '',
      'export const LINKS: ConnectionDef[] = [',
      ...linkLines,
      '];',
      '',
    ].join('\n'),
  );
  const count = landData.reduce((s, d) => s + d.lands.length, 0);
  console.log(
    `divided ${ROWS.length} regions into their cities and ${count} lands (${links.length} links), broke up ${rough.broken} borders, dropped ${spikes} spike or repeated points; wrote map.topo.json (${(JSON.stringify(out).length / 1024).toFixed(0)} KB) and land.ts`,
  );
  if (rough.left.length) console.log(`left as drawn (too near another border, a town or an anchor): ${rough.left.join(', ')}`);
}

await main();
