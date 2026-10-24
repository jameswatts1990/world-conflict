// Where each road between two lands crosses the border between them, as a share of the way from
// one land's anchor to the other's along the straight line the map draws. Gameplay reads it (from
// src/sim/scenario/europe/roads.ts, which road-borders.ts writes) to know which land a spot on a
// road lies in, so the simulation never consults the shapes.
import { geoMercator } from 'd3-geo';
import type { MultiLineString, Position } from 'geojson';
import { mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { landId } from '../../src/sim/scenario/build';
import { LAND, LINKS } from '../../src/sim/scenario/europe/land';

type Pt = [number, number];
type Segment = [number, number, number, number];
type Props = { pid: string };

/** Never closer than this to either anchor: every land keeps a stretch of every road out of it. */
const LIMIT = 0.05;

function segmentsOf(lines: MultiLineString, project: (p: Position) => Pt): Segment[] {
  const out: Segment[] = [];
  for (const line of lines.coordinates) {
    const pts = line.map(project);
    for (let i = 0; i + 1 < pts.length; i++) out.push([...pts[i], ...pts[i + 1]]);
  }
  return out;
}

/** Distances along the ray from (x, y) by (dx, dy) at which it crosses the segments, nearest first. */
function crossings(segments: Segment[], x: number, y: number, dx: number, dy: number): number[] {
  const out: number[] = [];
  for (const [x1, y1, x2, y2] of segments) {
    const [ex, ey] = [x2 - x1, y2 - y1];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((x1 - x) * ey - (y1 - y) * ex) / den;
    const u = ((x1 - x) * dy - (y1 - y) * dx) / den;
    if (t > 0 && u >= 0 && u < 1) out.push(t);
  }
  return out.sort((a, b) => a - b);
}

/** Is a point inside the outline? Even-odd count of the crossings to its right. */
function inside(segments: Segment[], x: number, y: number): boolean {
  let n = 0;
  for (const [x1, y1, x2, y2] of segments) if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) n++;
  return n % 2 === 1;
}

/**
 * For each road between two lands, keyed `a|b` as the link is written (src/sim/scenario/europe/land.ts):
 * how far from a's anchor towards b's the road passes from one into the other. That is halfway between
 * where it leaves the first land and where it enters the second (the same point when it runs straight
 * across their border; a road can cut across a corner of a third land, or the city two lands meet at).
 * Sea crossings and the ways between a city and its lands are not roads between two lands.
 */
export function roadBorders(topo: Topology<{ provinces: GeometryCollection<Props> }>): Record<string, number> {
  const geoms = topo.objects.provinces;
  const project = geoMercator();
  const at = (p: Position) => project(p as Pt) as Pt;
  const pid = (g: { properties?: unknown }) => (g.properties as Props).pid;
  const anchors = new Map<string, Pt>();
  for (const [row, { lands }] of Object.entries(LAND)) for (const l of lands) anchors.set(landId(row, l.key), at(l.anchor));
  const outlines = new Map<string, Segment[]>();
  const outline = (id: string) => {
    if (!outlines.has(id)) {
      const ours = (g: { properties?: unknown }) => pid(g) === id;
      outlines.set(id, segmentsOf(mesh(topo, geoms, (g, h) => (g === h ? ours(g) : ours(g) !== ours(h))), at));
    }
    return outlines.get(id)!;
  };
  /** How far from a's anchor towards b's the road leaves a (an anchor just offshore enters it first). */
  const exit = (a: string, b: string): number => {
    const [[ax, ay], [bx, by]] = [anchors.get(a)!, anchors.get(b)!];
    const hits = crossings(outline(a), ax, ay, bx - ax, by - ay).filter((t) => t < 1);
    return (inside(outline(a), ax, ay) ? hits[0] : hits[1]) ?? 0.5;
  };
  const out: Record<string, number> = {};
  for (const c of LINKS) {
    if (c.kind === 'strait' || !anchors.has(c.a) || !anchors.has(c.b)) continue;
    const t = (exit(c.a, c.b) + 1 - exit(c.b, c.a)) / 2;
    out[`${c.a}|${c.b}`] = Math.round(Math.min(1 - LIMIT, Math.max(LIMIT, t)) * 1000) / 1000;
  }
  return out;
}
