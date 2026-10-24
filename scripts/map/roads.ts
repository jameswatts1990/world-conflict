// Where each road between two provinces runs on the map, and where it crosses from one into the other.
// The map draws the roads from src/sim/scenario/europe/roads.ts (which road-routes.ts writes), and gameplay
// reads the crossings there to know which land a spot on a road lies in; the simulation never consults the shapes.
//
// Every road runs from the anchor of one province (its centre: its armies stand there, and every road out
// of it starts there) to the anchor of the other, over those two provinces alone: it crosses their shared
// border once and never runs through a third province (the city between two lands, a land next door) or
// over the sea. Where the straight line between the anchors would, or would come within KEEP_KM of anything
// else, the road bends instead: the shortest way over the two provinces that keeps about MARGIN_KM clear of
// everything else, found on a grid and then pulled taut, crossing the border well inside it rather than by a
// corner where a third province meets it. A sea crossing runs over each province's own land to its coast and
// over the open sea between, clear of other coasts. Only where the shapes leave no other way (a province that
// reaches the other only through an exclave, or across an estuary) does a road go over water or through a
// third province, as briefly as it can; `roadFaults` reports every such stretch.
import { geoMercator } from 'd3-geo';
import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { ConnectionDef } from '../../src/sim/types';

type Pt = [number, number];
type Box = [number, number, number, number];
type Edge = [number, number, number, number];
type Props = { pid?: string; iso?: string };
export type MapTopology = Topology<{ provinces: GeometryCollection<Props>; countries: GeometryCollection<Props> }>;

/** Where a road runs between its two anchors (its bends, [longitude, latitude]), and for a road between two lands, where it crosses into the second. */
export interface RoadRoute {
  via?: [number, number][];
  border?: number;
}

/** A straight road at least this clear (km) of everything but its two provinces stays straight... */
const KEEP_KM = 3;
/** ...and so does one that bending would leave less than this much clearer. */
const BEND_GAIN_KM = 2;
/** The clearance a bent road seeks from everything else (km), and what a km with none costs over a km with all of it. */
const MARGIN_KM = 10;
const CROWDING = 3;
/** What a km costs over the sea on a road over land, and through a third province: a last resort either way. */
const SEA_COST = 15;
const THIRD_COST = 1000;
/** The grid a bent road is found on: cells at least this wide (km), and no more of them than this. */
const CELL_KM = 1;
const MAX_CELLS = 60000;
/** A road may wind back over the border it has crossed for this long (km) in all: borders meander, and leave exclaves. */
const MEANDER_KM = 2;
/** How finely (km) a road is checked against the shapes. */
const CHECK_KM = 0.1;
/** Never closer than this to either anchor: every land keeps a stretch of every road out of it. */
const LIMIT = 0.05;
/** Bends are kept to this many decimals of a degree (about 10 m). */
const DECIMALS = 4;

const project = geoMercator();
/** Km per unit of the projection at the equator; elsewhere, times the cosine of the latitude. */
const KM_PER_UNIT = 6371 / project.scale();
const at = (p: Position): Pt => project(p as Pt) as Pt;

/** An outline in the projection's units, its edges also filed by the bands of latitude (BAND high) they span. */
interface Shape {
  id: string;
  rings: Pt[][];
  box: Box;
  bands: Map<number, Edge[]>;
}

/** Bands of latitude to file a shape's edges in, so a point is placed by the few edges of its own band (about 1.5 km). */
const BAND = 0.05;

const edgesOf = (s: Pick<Shape, 'rings'>): Edge[] => s.rings.flatMap((r) => r.map((p, i) => [...r[(i + r.length - 1) % r.length], ...p] as Edge));

function shapesOf(topo: MapTopology, object: GeometryCollection<Props>, id: (p: Props) => string): Shape[] {
  const fc = feature(topo, object) as FeatureCollection<Polygon | MultiPolygon, Props>;
  return fc.features
    .filter((f) => f.geometry)
    .map((f) => {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const rings = polys.flatMap((poly) => poly.map((ring) => ring.map(at)));
      const xs = rings.flatMap((r) => r.map((p) => p[0]));
      const ys = rings.flatMap((r) => r.map((p) => p[1]));
      const shape: Shape = { id: id(f.properties), rings, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], bands: new Map() };
      for (const e of edgesOf(shape))
        for (let b = Math.floor(Math.min(e[1], e[3]) / BAND); b <= Math.floor(Math.max(e[1], e[3]) / BAND); b++) {
          if (!shape.bands.has(b)) shape.bands.set(b, []);
          shape.bands.get(b)!.push(e);
        }
      return shape;
    });
}

const overlaps = (a: Box, b: Box) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

function inside(s: Shape, [x, y]: Pt): boolean {
  if (x < s.box[0] || x > s.box[2] || y < s.box[1] || y > s.box[3]) return false;
  let odd = false;
  for (const [x1, y1, x2, y2] of s.bands.get(Math.floor(y / BAND)) ?? []) if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) odd = !odd;
  return odd;
}

const edgeKey = ([x1, y1, x2, y2]: Edge) => (x1 < x2 || (x1 === x2 && y1 < y2) ? `${x1},${y1},${x2},${y2}` : `${x2},${y2},${x1},${y1}`);

/** Distance from point (x, y) to segment ab. */
function toSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const [ex, ey] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
  return Math.hypot(x - (ax + ex * t), y - (ay + ey * t));
}

/** Distance between segment pq and an edge (0 where they cross). */
function segmentGap([px, py]: Pt, [qx, qy]: Pt, [x1, y1, x2, y2]: Edge): number {
  const side = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  if (side(px, py, qx, qy, x1, y1) * side(px, py, qx, qy, x2, y2) < 0 && side(x1, y1, x2, y2, px, py) * side(x1, y1, x2, y2, qx, qy) < 0) return 0;
  return Math.min(toSegment(px, py, x1, y1, x2, y2), toSegment(qx, qy, x1, y1, x2, y2), toSegment(x1, y1, px, py, qx, qy), toSegment(x2, y2, px, py, qx, qy));
}

/** Where along ray (x, y) + t (dx, dy) it crosses the edges, nearest first. */
function crossings(edges: Edge[], x: number, y: number, dx: number, dy: number): number[] {
  const out: number[] = [];
  for (const [x1, y1, x2, y2] of edges) {
    const [ex, ey] = [x2 - x1, y2 - y1];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-15) continue;
    const t = ((x1 - x) * ey - (y1 - y) * ex) / den;
    const u = ((x1 - x) * dy - (y1 - y) * dx) / den;
    if (t > 0 && u >= 0 && u < 1) out.push(t);
  }
  return out.sort((a, b) => a - b);
}

/** One link and what lies round it: its two shapes, every other shape near, and the edges its road keeps clear of. */
interface Setting {
  a: Shape;
  b: Shape;
  sea: boolean;
  box: Box;
  others: Shape[];
  /** The edges a road over land keeps clear of: the two provinces' outlines but for the border between them. */
  foreign: Edge[];
  /** The edges a sea crossing keeps clear of: other land. */
  coasts: Edge[];
  /** Km per projected unit here. */
  km: number;
}

/** Where a point lies, for a link: 1 in its first province, 2 in its second, 3 in another (or a country beyond), 0 at sea. */
const placeOf = (s: Setting, p: Pt) => (inside(s.a, p) ? 1 : inside(s.b, p) ? 2 : s.others.some((o) => inside(o, p)) ? 3 : 0);

/** How a line keeps to its link's provinces, in km: through others, over the sea, and back in the first after reaching the second. */
interface Course {
  third: number;
  sea: number;
  back: number;
}

function courseOf(s: Setting, line: Pt[], reached = false): Course {
  const out = { third: 0, sea: 0, back: 0 };
  for (let k = 0; k + 1 < line.length; k++) {
    const [p, q] = [line[k], line[k + 1]];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]) * s.km;
    const n = Math.max(1, Math.ceil(len / CHECK_KM));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const w = placeOf(s, [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      if (w === 3) out.third += len / n;
      else if (w === 0) out.sea += len / n;
      else if (w === 2) reached = true;
      else if (reached) out.back += len / n;
    }
  }
  return out;
}

/** Whether a line keeps to its two provinces as a road must: over the sea only on a crossing, back over the border only where it meanders. */
const keeps = (s: Setting, c: Course) => c.third === 0 && (s.sea || c.sea === 0) && c.back <= MEANDER_KM;

/** The least distance (km) from a line to what its road keeps clear of. */
function clearanceOf(s: Setting, line: Pt[]): number {
  const edges = s.sea ? s.coasts : s.foreign;
  let least = Infinity;
  for (let k = 0; k + 1 < line.length; k++) {
    const [p, q] = [line[k], line[k + 1]];
    const reach = least / s.km;
    const box: Box = [Math.min(p[0], q[0]) - reach, Math.min(p[1], q[1]) - reach, Math.max(p[0], q[0]) + reach, Math.max(p[1], q[1]) + reach];
    for (const e of edges) {
      if (Math.max(e[0], e[2]) < box[0] || Math.min(e[0], e[2]) > box[2] || Math.max(e[1], e[3]) < box[1] || Math.min(e[1], e[3]) > box[3]) continue;
      least = Math.min(least, segmentGap(p, q, e) * s.km);
    }
  }
  return least;
}

/** Even-odd fill of the rings onto the grid: every cell whose middle lies inside takes the label, unless it has one. */
function fill(rings: Pt[][], g: Grid, label: number): void {
  const rows: number[][] = Array.from({ length: g.ny }, () => []);
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xa, ya] = ring[j];
      const [xb, yb] = ring[i];
      if (ya === yb) continue;
      const r0 = Math.max(0, Math.ceil((Math.min(ya, yb) - g.y0) / g.h - 0.5));
      const r1 = Math.min(g.ny - 1, Math.ceil((Math.max(ya, yb) - g.y0) / g.h - 0.5));
      for (let r = r0; r <= r1; r++) {
        const y = g.y0 + (r + 0.5) * g.h;
        if (ya <= y !== yb <= y) rows[r].push(xa + ((y - ya) * (xb - xa)) / (yb - ya));
      }
    }
  rows.forEach((xs, r) => {
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - g.x0) / g.h - 0.5));
      const c1 = Math.min(g.nx - 1, Math.floor((xs[k + 1] - g.x0) / g.h - 0.5));
      for (let c = c0; c <= c1; c++) if (!g.label[r * g.nx + c]) g.label[r * g.nx + c] = label;
    }
  });
}

/** Distance (in cells) from every cell to the nearest source cell: the exact Euclidean transform of Felzenszwalb and Huttenlocher. */
function distances(source: Uint8Array, nx: number, ny: number): Float64Array {
  const INF = 1e20;
  const g = Float64Array.from(source, (s) => (s ? 0 : INF));
  const n = Math.max(nx, ny);
  const [f, d, z] = [new Float64Array(n), new Float64Array(n), new Float64Array(n + 1)];
  const v = new Int32Array(n);
  const pass = (len: number) => {
    let k = 0;
    [v[0], z[0], z[1]] = [0, -INF, INF];
    for (let q = 1; q < len; q++) {
      let s: number;
      while ((s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])) <= z[k]) k--;
      k++;
      [v[k], z[k], z[k + 1]] = [q, s, INF];
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) ** 2 + f[v[k]];
    }
  };
  for (let c = 0; c < nx; c++) {
    for (let r = 0; r < ny; r++) f[r] = g[r * nx + c];
    pass(ny);
    for (let r = 0; r < ny; r++) g[r * nx + c] = d[r];
  }
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) f[c] = g[r * nx + c];
    pass(nx);
    for (let c = 0; c < nx; c++) g[r * nx + c] = Math.sqrt(d[c]);
  }
  return g;
}

/** A binary heap of node numbers by cost. */
class Queue {
  private costs: number[] = [];
  private nodes: number[] = [];
  get size() {
    return this.nodes.length;
  }
  push(cost: number, node: number) {
    let i = this.nodes.length;
    this.costs.push(cost);
    this.nodes.push(node);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (this.costs[up] <= cost) break;
      [this.costs[i], this.nodes[i]] = [this.costs[up], this.nodes[up]];
      i = up;
    }
    [this.costs[i], this.nodes[i]] = [cost, node];
  }
  pop(): [number, number] {
    const top: [number, number] = [this.costs[0], this.nodes[0]];
    const cost = this.costs.pop()!;
    const node = this.nodes.pop()!;
    if (this.nodes.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= this.nodes.length) break;
        const c = l + 1 < this.nodes.length && this.costs[l + 1] < this.costs[l] ? l + 1 : l;
        if (this.costs[c] >= cost) break;
        [this.costs[i], this.nodes[i]] = [this.costs[c], this.nodes[c]];
        i = c;
      }
      [this.costs[i], this.nodes[i]] = [cost, node];
    }
    return top;
  }
}

/** The cells a bent road is found on: what lies at each one's middle (as `placeOf`), and how clear it is of what the road avoids (km). */
interface Grid {
  x0: number;
  y0: number;
  /** Cell width, in the projection's units and in km. */
  h: number;
  hKm: number;
  nx: number;
  ny: number;
  label: Uint8Array;
  clear: Float64Array;
  /** Cells beside a cell of another label: a point in one is placed exactly, not by its cell. */
  edge: Uint8Array;
}

function gridOf(s: Setting): Grid {
  const [x0, y0, x1, y1] = s.box;
  const hKm = Math.max(CELL_KM, Math.sqrt(((x1 - x0) * (y1 - y0) * s.km * s.km) / MAX_CELLS));
  const h = hKm / s.km;
  const nx = Math.ceil((x1 - x0) / h) + 6;
  const ny = Math.ceil((y1 - y0) / h) + 6;
  const g: Grid = { x0: x0 - 3 * h, y0: y0 - 3 * h, h, hKm, nx, ny, label: new Uint8Array(nx * ny), clear: new Float64Array(0), edge: new Uint8Array(nx * ny) };
  fill(s.a.rings, g, 1);
  fill(s.b.rings, g, 2);
  for (const o of s.others) fill(o.rings, g, 3);
  // A road over land keeps clear of the sea and of other provinces; a crossing, of other land.
  const avoid = g.label.map((l) => (l === 3 || (!s.sea && l === 0) ? 1 : 0));
  g.clear = distances(avoid, nx, ny).map((d) => Math.max(0, (d - 0.5) * hKm));
  for (let r = 0; r < ny; r++)
    for (let c = 0; c < nx; c++) {
      const i = r * nx + c;
      for (let k = 0; k < 9 && !g.edge[i]; k++) {
        const [r2, c2] = [r + Math.floor(k / 3) - 1, c + (k % 3) - 1];
        if (r2 >= 0 && c2 >= 0 && r2 < ny && c2 < nx && g.label[r2 * nx + c2] !== g.label[i]) g.edge[i] = 1;
      }
    }
  return g;
}

const cellAt = (g: Grid, [x, y]: Pt) =>
  Math.min(g.ny - 1, Math.max(0, Math.floor((y - g.y0) / g.h))) * g.nx + Math.min(g.nx - 1, Math.max(0, Math.floor((x - g.x0) / g.h)));
const middle = (g: Grid, i: number): Pt => [g.x0 + ((i % g.nx) + 0.5) * g.h, g.y0 + (Math.floor(i / g.nx) + 0.5) * g.h];

/** The cell labelled `want` nearest a point (its own, if it is). */
function nearestCell(g: Grid, p: Pt, want: number): number {
  const home = cellAt(g, p);
  const [c0, r0] = [home % g.nx, Math.floor(home / g.nx)];
  let best = -1;
  let gap = Infinity;
  for (let ring = 0; best < 0 && ring < Math.max(g.nx, g.ny); ring++)
    for (let r = r0 - ring; r <= r0 + ring; r++)
      for (let c = c0 - ring; c <= c0 + ring; c++) {
        if (r < 0 || c < 0 || r >= g.ny || c >= g.nx || g.label[r * g.nx + c] !== want) continue;
        const [x, y] = middle(g, r * g.nx + c);
        const d = Math.hypot(x - p[0], y - p[1]);
        if (d < gap) [gap, best] = [d, r * g.nx + c];
      }
  return best;
}

const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * The cheapest way over the grid from cell `from` (in the first province) to cell `to` (in the second): first
 * through the first province, then, once over into the second, through the second alone. A km costs more the
 * nearer it runs to what the road keeps clear of; the sea and third provinces are a last resort. Returns the
 * cells passed, each with whether it is over the border yet.
 */
function cheapest(s: Setting, g: Grid, from: number, to: number): { cell: number; over: boolean }[] {
  const n = g.nx * g.ny;
  const cost = (i: number) => {
    const l = g.label[i];
    if (l === 3) return THIRD_COST;
    if (l === 0 && !s.sea) return SEA_COST;
    const crowd = Math.max(0, 1 - g.clear[i] / MARGIN_KM);
    return 1 + CROWDING * crowd * crowd;
  };
  const best = new Float64Array(2 * n).fill(Infinity);
  const prev = new Int32Array(2 * n).fill(-1);
  const queue = new Queue();
  best[from] = 0;
  queue.push(0, from);
  while (queue.size) {
    const [c, u] = queue.pop();
    if (c > best[u]) continue;
    if (u === n + to) break;
    const over = u >= n;
    const cell = over ? u - n : u;
    const [x, y] = [cell % g.nx, Math.floor(cell / g.nx)];
    for (const [dx, dy] of STEPS) {
      const [x2, y2] = [x + dx, y + dy];
      if (x2 < 0 || y2 < 0 || x2 >= g.nx || y2 >= g.ny) continue;
      const v = y2 * g.nx + x2;
      // Back into the first province once over the border: never.
      if (over && g.label[v] === 1) continue;
      // Not diagonally between two cells of a third province.
      if (dx && dy && (g.label[y * g.nx + x2] === 3 || g.label[y2 * g.nx + x] === 3) && g.label[v] !== 3) continue;
      const next = (over || g.label[v] === 2 ? n : 0) + v;
      const w = c + (Math.hypot(dx, dy) * g.hKm * (cost(cell) + cost(v))) / 2;
      if (w < best[next]) {
        best[next] = w;
        prev[next] = u;
        queue.push(w, next);
      }
    }
  }
  const out: { cell: number; over: boolean }[] = [];
  for (let u = n + to; u >= 0; u = prev[u]) out.push({ cell: u % n, over: u >= n });
  return out.reverse();
}

/**
 * The road bent round whatever the straight line between the anchors runs into: the cheapest way over the
 * grid, pulled taut (each point on to the farthest point of the way it can see as clear as the way between),
 * then straightened (each bend dropped, or slid towards the line between its neighbours, while that stays as
 * clear). The grid can miss a sliver narrower than its cells, so every leg is also checked against the shapes
 * themselves: no more of a third province or the sea than its stretch of the way, and never back over the border.
 */
function bent(s: Setting, A: Pt, B: Pt): Pt[] {
  const g = gridOf(s);
  const way = cheapest(s, g, nearestCell(g, A, 1), nearestCell(g, B, 2));
  if (way.length < 2) return [A, B];
  const pts = way.map(({ cell }) => middle(g, cell));
  [pts[0], pts[pts.length - 1]] = [A, B];
  const label = way.map(({ cell }) => g.label[cell]);
  const clear = way.map(({ cell }) => g.clear[cell]);
  const step = Math.min(g.h / 3, (CHECK_KM * 3) / s.km);
  const placeAt = (p: Pt) => {
    const i = cellAt(g, p);
    return g.edge[i] ? placeOf(s, p) : g.label[i];
  };
  // On the grid, from way point i (at p) to way point j (at q): as clear as the way between them (up to half the
  // margin), and no longer at sea or in a third province than it was; once over the border, never back.
  const sees = (p: Pt, q: Pt, i: number, j: number) => {
    let need = MARGIN_KM / 2;
    const allow = [0, 0, 0, 0];
    for (let k = i + 1; k < j; k++) {
      need = Math.min(need, clear[k]);
      allow[label[k]] += g.hKm * 1.5;
    }
    need -= g.hKm * 0.75;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const n = Math.max(2, Math.ceil(len / step));
    let over = way[i].over;
    const spent = [0, 0, 0, 0];
    for (let k = 1; k < n; k++) {
      const x: Pt = [p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n];
      const w = placeAt(x);
      const open = w === 1 || w === 2 || (w === 0 && s.sea);
      if (!open) {
        spent[w] += (len / n) * s.km;
        if (spent[w] > allow[w]) return false;
      } else if (w === 2) over = true;
      else if (w === 1 && over) return false;
      if (open && g.clear[cellAt(g, x)] < need) return false;
    }
    return way[j].over || !over;
  };
  // Against the shapes: what the leg runs through, beside what the way's own steps between i and j do.
  const steps = pts.slice(1).map((p, k) => courseOf(s, [pts[k], p], way[k].over));
  const fits = (p: Pt, q: Pt, i: number, j: number) => {
    const c = courseOf(s, [p, q], way[i].over);
    const r = steps.slice(i, j).reduce((x, y) => ({ third: x.third + y.third, sea: x.sea + y.sea, back: x.back + y.back }));
    return c.third <= r.third + CHECK_KM && (s.sea || c.sea <= r.sea + CHECK_KM * 5) && c.back <= r.back + CHECK_KM;
  };
  const ok = (p: Pt, q: Pt, i: number, j: number) => sees(p, q, i, j) && fits(p, q, i, j);
  const idx = [0];
  for (let i = 0; i < pts.length - 1; ) {
    const seen: number[] = [];
    for (let j = i + 2; j < pts.length; j++) if (sees(pts[i], pts[j], i, j)) seen.push(j);
    const far = seen.reverse().find((j) => fits(pts[i], pts[j], i, j)) ?? i + 1;
    idx.push(far);
    i = far;
  }
  const line = idx.map((i) => pts[i]);
  for (let round = 0, moved = true; moved && round < 8; round++) {
    moved = false;
    for (let k = 1; k < line.length - 1; k++) {
      if (ok(line[k - 1], line[k + 1], idx[k - 1], idx[k + 1])) {
        line.splice(k, 1);
        idx.splice(k, 1);
        k--;
        moved = true;
        continue;
      }
      const mid: Pt = [(line[k - 1][0] + line[k + 1][0]) / 2, (line[k - 1][1] + line[k + 1][1]) / 2];
      for (const t of [0.5, 0.25, 0.1]) {
        const p: Pt = [line[k][0] + (mid[0] - line[k][0]) * t, line[k][1] + (mid[1] - line[k][1]) * t];
        if (ok(line[k - 1], p, idx[k - 1], idx[k]) && ok(p, line[k + 1], idx[k], idx[k + 1])) {
          line[k] = p;
          moved = true;
          break;
        }
      }
    }
  }
  return line;
}

/** The road's points, its bends rounded as they are kept. */
const rounded = (line: Pt[]): Pt[] =>
  line.map((p, i) => {
    if (i === 0 || i === line.length - 1) return p;
    const [lon, lat] = project.invert!(p)!;
    const f = 10 ** DECIMALS;
    return at([Math.round(lon * f) / f, Math.round(lat * f) / f]);
  });

/**
 * How far along the road (0..1) from a's anchor it passes from a into b: halfway between where it leaves a and
 * where it last enters b (the same point when it runs straight over their border; it can wind over a meander).
 */
function borderOf(s: Setting, line: Pt[]): number {
  const lengths = line.slice(1).map((p, i) => Math.hypot(p[0] - line[i][0], p[1] - line[i][1]));
  const total = lengths.reduce((x, y) => x + y, 0);
  /** Distance along the line from its start to where it leaves the shape (or enters it, if the start lies outside). */
  const leave = (shape: Shape, pts: Pt[], lens: number[]) => {
    const edges = edgesOf(shape);
    let gone = 0;
    let crossed = inside(shape, pts[0]) ? 0 : -1;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [p, q] = [pts[k], pts[k + 1]];
      for (const t of crossings(edges, p[0], p[1], q[0] - p[0], q[1] - p[1]).filter((t) => t < 1))
        if (++crossed === 1) return gone + t * lens[k];
      gone += lens[k];
    }
    return total / 2;
  };
  const there = leave(s.a, line, lengths);
  const back = leave(s.b, [...line].reverse(), [...lengths].reverse());
  const t = (there + total - back) / 2 / total;
  return Math.round(Math.min(1 - LIMIT, Math.max(LIMIT, t)) * 1000) / 1000;
}

/** Everything the roads need from the map, once. */
function mapOf(topo: MapTopology) {
  const provinces = shapesOf(topo, topo.objects.provinces, (p) => p.pid!);
  const countries = shapesOf(topo, topo.objects.countries, (p) => `country:${p.iso}`);
  const byId = new Map(provinces.map((p) => [p.id, p]));
  const edges = new Map<string, Edge[]>();
  const edgesFor = (s: Shape) => {
    if (!edges.has(s.id)) edges.set(s.id, edgesOf(s));
    return edges.get(s.id)!;
  };
  /** The setting of a link between provinces a and b. */
  const setting = (a: string, b: string, sea: boolean): Setting => {
    const [sa, sb] = [byId.get(a)!, byId.get(b)!];
    const span = sea ? 0.15 : 0;
    const box0: Box = [Math.min(sa.box[0], sb.box[0]), Math.min(sa.box[1], sb.box[1]), Math.max(sa.box[2], sb.box[2]), Math.max(sa.box[3], sb.box[3])];
    const [w, h] = [box0[2] - box0[0], box0[3] - box0[1]];
    const box: Box = [box0[0] - w * span, box0[1] - h * span, box0[2] + w * span, box0[3] + h * span];
    const others = [...provinces, ...countries].filter((o) => o !== sa && o !== sb && overlaps(o.box, box));
    const [ea, eb] = [edgesFor(sa), edgesFor(sb)];
    const [ka, kb] = [new Set(ea.map(edgeKey)), new Set(eb.map(edgeKey))];
    const lat = project.invert!([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2])![1];
    return {
      a: sa,
      b: sb,
      sea,
      box,
      others,
      foreign: [...ea.filter((e) => !kb.has(edgeKey(e))), ...eb.filter((e) => !ka.has(edgeKey(e)))],
      coasts: others.flatMap(edgesFor).filter((e) => !ka.has(edgeKey(e)) && !kb.has(edgeKey(e))),
      km: KM_PER_UNIT * Math.cos((lat * Math.PI) / 180),
    };
  };
  return { setting };
}

/** Whether a link is a road between two lands: not a sea crossing, nor a city's way to a land round it. */
const isRoad = (c: ConnectionDef, cities: Set<string>) => c.kind !== 'strait' && !cities.has(c.a) && !cities.has(c.b);

/**
 * For every link, keyed `a|b` as it is written (src/sim/scenario/europe/land.ts): where its road bends between
 * the anchors (none where it runs straight), and for a road between two lands, how far from a's anchor towards
 * b's (along the road) it crosses into b. `anchors` are every province's, [longitude, latitude]; `cities` the
 * provinces that are cities.
 */
export function roadRoutes(topo: MapTopology, links: ConnectionDef[], anchors: Record<string, [number, number]>, cities: Set<string>): Record<string, RoadRoute> {
  const { setting } = mapOf(topo);
  const out: Record<string, RoadRoute> = {};
  for (const c of links) {
    const s = setting(c.a, c.b, c.kind === 'strait');
    const [A, B] = [at(anchors[c.a]), at(anchors[c.b])];
    let line: Pt[] = [A, B];
    const straight = courseOf(s, line);
    const clear = keeps(s, straight) ? clearanceOf(s, line) : -Infinity;
    if (clear < KEEP_KM) {
      const route = rounded(bent(s, A, B));
      if (!keeps(s, straight) || clearanceOf(s, route) >= clear + BEND_GAIN_KM) line = route;
    }
    const road: RoadRoute = {};
    if (line.length > 2) road.via = line.slice(1, -1).map((p) => project.invert!(p)!.map((v) => Math.round(v * 10 ** DECIMALS) / 10 ** DECIMALS) as [number, number]);
    if (isRoad(c, cities)) road.border = borderOf(s, line);
    out[`${c.a}|${c.b}`] = road;
  }
  return out;
}

/** The whole line of a link's road, anchor to anchor, in the projection's units. */
const lineOf = (anchors: Record<string, [number, number]>, c: ConnectionDef, road: RoadRoute | undefined): Pt[] => [
  at(anchors[c.a]),
  ...(road?.via ?? []).map(at),
  at(anchors[c.b]),
];

/**
 * What keeps each road from keeping to its two provinces, in km (none, for nearly all): through a third province,
 * over the sea on a road over land, and back over the border it has crossed beyond its meanders. With the
 * crossing each road between two lands should have, from its line as the map draws it.
 */
export function roadFaults(
  topo: MapTopology,
  links: ConnectionDef[],
  anchors: Record<string, [number, number]>,
  cities: Set<string>,
  roads: Record<string, RoadRoute>,
): { link: string; third: number; sea: number; back: number; border?: number }[] {
  const { setting } = mapOf(topo);
  return links.map((c) => {
    const s = setting(c.a, c.b, c.kind === 'strait');
    const line = lineOf(anchors, c, roads[`${c.a}|${c.b}`]);
    const course = courseOf(s, line);
    const round1 = (km: number) => Math.round(km * 10) / 10;
    return {
      link: `${c.a}|${c.b}`,
      third: round1(course.third),
      sea: s.sea ? 0 : round1(course.sea),
      back: round1(Math.max(0, course.back - MEANDER_KM)),
      ...(isRoad(c, cities) ? { border: borderOf(s, line) } : {}),
    };
  });
}
