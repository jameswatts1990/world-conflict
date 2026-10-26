// Map geometry for rendering only. Shapes come from bundled Natural Earth
// TopoJSON; gameplay adjacency lives in the simulation's scenario data. The
// provinces and the world around them share one topology, so their coasts and
// borders are the same lines.
import { geoArea, geoCircle, geoClipCircle, geoConicConformal, geoDistance, geoGraticule, geoMercator, geoPath, geoRotation, type GeoStream } from 'd3-geo';
import type { Feature, FeatureCollection, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson';
import { feature, merge, mesh } from 'topojson-client';
import type { GeometryCollection, MultiPolygon as TopoMultiPolygon, Polygon as TopoPolygon, Topology } from 'topojson-specification';
import mapJson from '../../assets/map/map.topo.json';
import type { OwnerId, ProvinceId, RoadSpot, World } from '../../sim';

/**
 * The projection: Lambert's conformal conic with standard parallels at 35°N and 65°N and Europe's middle meridian,
 * 10°E (the European Union's own conformal map of Europe, ETRS89-LCC). It keeps shapes, like Mercator, and keeps
 * the scale close from the Mediterranean to the North Cape: a map unit is 3.64 km at 36°N, 3.75 km at 48°N and
 * 3.47 km at 71°N, so the North Cape is drawn 8% larger than the middle of Europe where Mercator drew it twice as
 * large (2.06×). Meridians lean towards the pole, so north is up only along 10°E.
 */
const PARALLELS: [number, number] = [35, 65];
const MERIDIAN = 10;
/**
 * The map's scale, in km per map unit at 48°N: the scale the first theatre was drawn at (on Mercator), so counters,
 * cities and zoom levels keep their feel. It never changes, so adding land to the theatre makes the drawing
 * larger, never smaller: counters, cities, labels, roads and textures, sized in map units or in screen pixels at a
 * zoom, look the same at the same real-world scale however large the theatre grows.
 */
const KM_PER_UNIT = 3.7497577699717315;
/**
 * The world round the theatre is drawn as far as this many degrees from the middle of Europe (CAP_CENTRE), a cap
 * of the globe reaching Greenland's coast, the Sahara, Arabia and the Urals; it fades into the sea towards its rim
 * (`horizon`). A conic cannot draw the whole world: the far side of the pole tears open and the south runs off to
 * infinity. 36° keeps the cap short of the pole's far side; the theatre must stay inside it (Iceland's west, the
 * farthest yet, is 22° out).
 */
const CAP_CENTRE: [number, number] = [MERIDIAN, 52];
const CAP_DEGREES = 36;
/** The conic, at the map's scale, with no translation. */
function conic() {
  const p = geoConicConformal().parallels(PARALLELS).rotate([-MERIDIAN, 0]).scale(1).translate([0, 0]);
  // Units per km at 48°N at scale 1, from two points 0.02° apart on the middle meridian.
  const [a, b] = [p([MERIDIAN, 47.99])!, p([MERIDIAN, 48.01])!];
  const perKm = Math.hypot(a[0] - b[0], a[1] - b[1]) / ((0.02 * Math.PI) / 180) / 6371;
  return p.scale(1 / (KM_PER_UNIT * perKm)).preclip(capClip());
}

/** Clips to the cap: the projection's own frame turned so the cap's middle is at the origin, clipped there, turned back. */
function capClip() {
  const clip = geoClipCircle((CAP_DEGREES * Math.PI) / 180);
  // The projection hands its preclip points in radians, already turned so 10°E is the middle meridian.
  const turn = geoRotation([0, -CAP_CENTRE[1]]);
  const [deg, rad] = [180 / Math.PI, Math.PI / 180];
  const via = (f: (p: [number, number]) => [number, number]) => (x: number, y: number) => f([x * deg, y * deg]).map((v) => v * rad) as [number, number];
  const [there, back] = [via((p) => turn(p)), via((p) => turn.invert(p))];
  return (sink: GeoStream): GeoStream => {
    const out = clip({ ...relay(sink), point: (x: number, y: number) => sink.point(...back(x, y)) });
    return { ...relay(out), point: (x: number, y: number) => out.point(...there(x, y)) };
  };
}

/** A stream that passes everything but points straight on. */
const relay = (s: GeoStream): GeoStream => ({
  point: (x, y) => s.point(x, y),
  lineStart: () => s.lineStart(),
  lineEnd: () => s.lineEnd(),
  polygonStart: () => s.polygonStart(),
  polygonEnd: () => s.polygonEnd(),
  sphere: () => s.sphere?.(),
});
/**
 * The reference view, in map units: the window a screen's zooms are measured against (MapView sets the zoom range,
 * the opening view and the zooms where detail appears from how this window fits the screen). It is the frame the
 * first theatre filled, and stays the measure as the theatre grows; the frame itself (`MapGeometry.size`) grows
 * with the theatre.
 */
export const VIEW_WIDTH = 1000;
export const VIEW_HEIGHT = 820;
/** Sea round the theatre in its frame, in map units. */
const FRAME_MARGIN = 30;

const topo = mapJson as unknown as Topology<{
  provinces: GeometryCollection<{ pid: string; iso: string }>;
  countries: GeometryCollection<{ iso: string; name: string }>;
}>;

/** Countries that are (partly) represented by playable provinces. */
export const THEATRE_ISO = new Set(topo.objects.provinces.geometries.map((g) => (g.properties as { iso: string }).iso));

export interface CountryShape {
  iso: string;
  name: string;
  d: string;
  bounds: [[number, number], [number, number]];
}

export interface MapGeometry {
  provincePaths: Record<ProvinceId, string>;
  labelPoints: Record<ProvinceId, [number, number]>;
  anchors: Record<ProvinceId, [number, number]>;
  countries: CountryShape[];
  /** Projected area of each province, in map units² (for label weighting). */
  provinceArea: Record<ProvinceId, number>;
  provinceBounds: Record<ProvinceId, [[number, number], [number, number]]>;
  /** Bounds of each province's whole shape, islands included (provinceBounds keeps to its largest part). */
  shapeBounds: Record<ProvinceId, [[number, number], [number, number]]>;
  /** Bounding box of the playable theatre, in map units. */
  theatreBounds: [[number, number], [number, number]];
  /** The frame, from (0, 0): the theatre in the middle with a margin of sea, and never smaller than the reference view. */
  size: [number, number];
  coastline: string;
  /** All the theatre's land as one shape, without the borders inside it (cheap to clip with). */
  land: string;
  graticule: string;
  /** Borders within a region: round its city, and between the lands round it, running out from it. */
  landBorders: string;
  /** Borders between the regions (a city with the lands round it), within a country or across one. */
  provinceBorders: string;
  /** Bounds of the world drawn round the theatre: a cap of the globe round the middle of Europe. */
  worldBounds: [[number, number], [number, number]];
  /**
   * A circle just inside the cap's rim, round its middle (map units): the world fades into the sea towards it.
   * `outer` reaches just past the farthest point of the rim (the conic not being quite even in scale).
   */
  horizon: { x: number; y: number; r: number; outer: number };
  /** The point on the ground ([longitude, latitude]) under a point of the map (map units). */
  invert: (p: [number, number]) => [number, number];
  nationBorders: (ownerOf: (pid: ProvinceId) => OwnerId) => string;
  /** Full outline (land borders and coast) of everything one owner holds. */
  ownerOutline: (owner: OwnerId, ownerOf: (pid: ProvinceId) => OwnerId) => string;
  /**
   * The province borders that pass a test, as one path: `b` is the province on the other
   * side, or null for the coast and the edge of the theatre.
   */
  arcs: (test: (a: ProvinceId, b: ProvinceId | null) => boolean) => string;
  /** The provinces that pass a test as one shape, without the borders between them. */
  union: (test: (pid: ProvinceId) => boolean) => string;
  /** Screen directions (radians) from each city towards the cities next door over land: the roads out of town (none for land). */
  roads: Record<ProvinceId, number[]>;
  /** Every road between two provinces as the map draws it, keyed `a>b` both ways: from a's anchor through its bends to b's. */
  roadLines: Record<string, RoadLine>;
  /**
   * How far the theatre's land reaches from each city, in map units, in REACH_DIRECTIONS
   * directions clockwise from east (at most REACH_CAP); null where it reaches that far all round.
   */
  reach: Record<ProvinceId, number[] | null>;
  /** For a city on the sea: the point of its coast nearest the middle, and the direction out to sea. */
  ports: Record<ProvinceId, { x: number; y: number; facing: number } | null>;
  /** The side of each province where its first army stands: -1 left, 1 right, whichever has more room from the places nearby. */
  campSide: Record<ProvinceId, -1 | 1>;
}

/**
 * A road as the map draws it, from one province's anchor to the other's, bending where the scenario says it
 * must to keep to the two provinces: its points (map units), how far along it each lies (0..1, measured as the
 * road generator measures it, which is what a fraction of the way along a road means everywhere: a spot on it,
 * an army on its leg, where it crosses its border; see roadThrough), and its length as drawn.
 */
export interface RoadLine {
  pts: [number, number][];
  at: number[];
  length: number;
}

function lineThrough(pts: [number, number][]): RoadLine {
  const steps = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const length = steps.reduce((s, x) => s + x, 0);
  let gone = 0;
  return { pts, at: [0, ...steps.map((s) => (gone += s) / (length || 1))], length };
}

/**
 * The grid the road generator measures on (`scripts/map/roads.ts`): a road runs straight between its knots (its
 * anchors and bends) on this Mercator, and a fraction of the way along it, as the scenario stores it (where it
 * crosses its border) and as the simulation uses it (a spot on a road, a leg's progress), is measured along those
 * straight lines here. The drawing is a different projection, so its roads follow the same lines.
 */
const ROAD_GRID = geoMercator();
/** How finely (km) a road's line is followed when it is drawn: straight between these points, it strays a few metres at most. */
const ROAD_STEP_KM = 2;

/**
 * A road through its knots ([longitude, latitude]) as the map draws it: the generator's straight lines between
 * them, followed every ROAD_STEP_KM or so and drawn on `projection`, each point carrying its fraction of the way
 * as the generator measures it. So a fraction means the same spot on the ground in the drawing as in the
 * simulation: a road crosses its border on the map where the scenario says, and pointing at the map either side
 * of the border picks the land on that side.
 */
function roadThrough(knots: [number, number][], projection: (p: [number, number]) => [number, number] | null): RoadLine {
  const grid = knots.map((p) => ROAD_GRID(p) as Pt);
  const lengths = grid.slice(1).map((q, i) => Math.hypot(q[0] - grid[i][0], q[1] - grid[i][1]));
  const total = lengths.reduce((s, x) => s + x, 0) || 1;
  const pts: Pt[] = [];
  const at: number[] = [];
  let gone = 0;
  for (let i = 0; i + 1 < knots.length; i++) {
    const n = Math.max(1, Math.ceil((geoDistance(knots[i], knots[i + 1]) * 6371) / ROAD_STEP_KM));
    pts.push(projection(knots[i]) as Pt);
    at.push(gone / total);
    for (let j = 1; j < n; j++) {
      const [p, q] = [grid[i], grid[i + 1]];
      pts.push(projection(ROAD_GRID.invert!([p[0] + ((q[0] - p[0]) * j) / n, p[1] + ((q[1] - p[1]) * j) / n])!) as Pt);
      at.push((gone + (lengths[i] * j) / n) / total);
    }
    gone += lengths[i];
  }
  pts.push(projection(knots[knots.length - 1]) as Pt);
  at.push(1);
  return { pts, at, length: pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0) };
}

/** The road from one province's anchor to a neighbour's (straight, should they not be neighbours). */
export function roadLine(geo: MapGeometry, from: ProvinceId, to: ProvinceId): RoadLine {
  return geo.roadLines[`${from}>${to}`] ?? lineThrough([geo.anchors[from], geo.anchors[to]]);
}

/** The point `t` (0..1) of the way along a road, and which way the road runs there (a unit vector). */
export function alongRoad(line: RoadLine, t: number): { x: number; y: number; dx: number; dy: number } {
  const { pts, at } = line;
  let i = 1;
  while (i < pts.length - 1 && at[i] < t) i++;
  const [p, q] = [pts[i - 1], pts[i]];
  const f = Math.max(0, Math.min(1, (t - at[i - 1]) / (at[i] - at[i - 1] || 1)));
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  return { x: p[0] + (q[0] - p[0]) * f, y: p[1] + (q[1] - p[1]) * f, dx: (q[0] - p[0]) / len, dy: (q[1] - p[1]) / len };
}

/** The points of a road from `t0` of the way along it to `t1` (backwards where `t1` is the lesser), both ends included. */
export function roadPart(line: RoadLine, t0: number, t1: number): [number, number][] {
  const [lo, hi] = [Math.min(t0, t1), Math.max(t0, t1)];
  const [start, end] = [alongRoad(line, lo), alongRoad(line, hi)];
  const pts: [number, number][] = [[start.x, start.y], ...line.pts.filter((_, i) => line.at[i] > lo && line.at[i] < hi), [end.x, end.y]];
  return t1 < t0 ? pts.reverse() : pts;
}

/** The point of a road nearest `p`: how far along the road it lies (0..1), and how far it is from `p` (map units). */
export function nearestOnRoad(line: RoadLine, [x, y]: [number, number]): { t: number; d: number } {
  let best = { t: 0, d: Infinity };
  for (let i = 1; i < line.pts.length; i++) {
    const [p, q] = [line.pts[i - 1], line.pts[i]];
    const [ex, ey] = [q[0] - p[0], q[1] - p[1]];
    const f = Math.max(0, Math.min(1, ((x - p[0]) * ex + (y - p[1]) * ey) / (ex * ex + ey * ey || 1)));
    const d = Math.hypot(p[0] + ex * f - x, p[1] + ey * f - y);
    if (d < best.d) best = { t: line.at[i - 1] + (line.at[i] - line.at[i - 1]) * f, d };
  }
  return best;
}

/** A spot on a road, in map units. */
export function roadPoint(geo: MapGeometry, province: ProvinceId, road: RoadSpot): [number, number] {
  const { x, y } = alongRoad(roadLine(geo, province, road.toward), road.at);
  return [x, y];
}

/** How far `reach` looks from a city, in map units, and in how many directions. */
export const REACH_CAP = 40;
const REACH_DIRECTIONS = 16;

type Pt = [number, number];
type Segment = [number, number, number, number];

function segmentsOf(lines: MultiLineString, project: (p: Position) => Pt): Segment[] {
  const out: Segment[] = [];
  for (const line of lines.coordinates) {
    const pts = line.map(project);
    for (let i = 0; i + 1 < pts.length; i++) out.push([...pts[i], ...pts[i + 1]]);
  }
  return out;
}

/** Distances along the ray from (x, y) in direction (dx, dy) at which it crosses the segments, nearest first. */
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

/** Is a point inside the outline? Even-odd count of crossings to its right, with segments indexed by the rows they span. */
function insideTest(segments: Segment[]): (x: number, y: number) => boolean {
  const rows = new Map<number, Segment[]>();
  for (const seg of segments)
    for (let r = Math.floor(Math.min(seg[1], seg[3])); r <= Math.floor(Math.max(seg[1], seg[3])); r++) {
      if (!rows.has(r)) rows.set(r, []);
      rows.get(r)!.push(seg);
    }
  return (x, y) => {
    let inside = false;
    for (const [x1, y1, x2, y2] of rows.get(Math.floor(y)) ?? [])
      if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside;
    return inside;
  };
}

/** Segments within `d` of a point. */
const near = (segments: Segment[], x: number, y: number, d: number) =>
  segments.filter(([x1, y1, x2, y2]) => Math.min(x1, x2) < x + d && Math.max(x1, x2) > x - d && Math.min(y1, y2) < y + d && Math.max(y1, y2) > y - d);

/**
 * What the cities' models need of the map around them: which way the roads leave
 * town, where the land ends, and where the port goes.
 */
function cityGeometry(
  world: World,
  anchors: Record<ProvinceId, Pt>,
  outline: Segment[],
  coasts: Record<ProvinceId, Segment[]>,
): Pick<MapGeometry, 'roads' | 'reach' | 'ports'> {
  const land = insideTest(outline);
  const roads: MapGeometry['roads'] = {};
  const reach: MapGeometry['reach'] = {};
  const ports: MapGeometry['ports'] = {};
  for (const id of world.provinceIds) {
    const [ax, ay] = anchors[id];
    roads[id] = [];
    reach[id] = null;
    ports[id] = null;
    // Only cities have models: their roads lead to the cities whose lands border their own, over land.
    const def = world.provinces[id];
    if (!def.city || !def.lands) continue;
    const next = new Set<ProvinceId>();
    for (const land of def.lands)
      for (const n of world.neighbors[land]) {
        const city = world.provinces[n.id].around;
        if (n.kind !== 'strait' && city && city !== id) next.add(city);
      }
    roads[id] = world.cityIds.filter((c) => next.has(c)).map((c) => anchors[c]).map(([x, y]) => Math.round(Math.atan2(y - ay, x - ax) * 1000) / 1000);

    // Where the land ends along each ray: the first crossing of the theatre's outline (the second if the
    // simplified coast leaves the city just offshore).
    const local = near(outline, ax, ay, REACH_CAP);
    const ashore = land(ax, ay);
    const rays = Array.from({ length: REACH_DIRECTIONS }, (_, i) => {
      const a = (i / REACH_DIRECTIONS) * Math.PI * 2;
      const hits = crossings(local, ax, ay, Math.cos(a), Math.sin(a));
      const end = ashore ? hits[0] : hits[0] !== undefined && hits[0] < 1.5 ? hits[1] : 0;
      return Math.min(REACH_CAP, end ?? REACH_CAP);
    });
    reach[id] = rays.every((r) => r >= REACH_CAP) ? null : rays.map((r) => Math.round(r * 10) / 10);

    // The port: the nearest point of the city's own sea coast, facing the open water round it
    // (land outside the theatre counts as water here; no port lies that close to it).
    if (!def.coastal || !coasts[id].length) continue;
    let best = Infinity;
    let [px, py] = [ax, ay];
    for (const [x1, y1, x2, y2] of coasts[id]) {
      const [ex, ey] = [x2 - x1, y2 - y1];
      const t = Math.max(0, Math.min(1, ((ax - x1) * ex + (ay - y1) * ey) / (ex * ex + ey * ey || 1)));
      const [qx, qy] = [x1 + ex * t, y1 + ey * t];
      const d = Math.hypot(qx - ax, qy - ay);
      if (d < best) [best, px, py] = [d, qx, qy];
    }
    let [sx, sy] = [0, 0];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (!land(px + Math.cos(a) * 2.5, py + Math.sin(a) * 2.5)) [sx, sy] = [sx + Math.cos(a), sy + Math.sin(a)];
    }
    const facing = Math.round((sx || sy ? Math.atan2(sy, sx) : Math.atan2(py - ay, px - ax)) * 1000) / 1000;
    ports[id] = { x: px, y: py, facing };
  }
  return { roads, reach, ports };
}

function largestPolygon(f: Feature<Polygon | MultiPolygon>): Feature<Polygon> {
  if (f.geometry.type === 'Polygon') return f as Feature<Polygon>;
  let best: Feature<Polygon> | null = null;
  let bestArea = -1;
  for (const coords of f.geometry.coordinates) {
    const poly: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: coords } };
    const a = geoArea(poly);
    if (a > bestArea) {
      bestArea = a;
      best = poly;
    }
  }
  return best!;
}

function pidOf(g: { properties?: unknown }): string {
  return (g.properties as { pid: string }).pid;
}

const cache = new WeakMap<World, MapGeometry>();

/** Projected geometry for a world, built once and shared by the menu and the game. */
export function mapGeometry(world: World): MapGeometry {
  let geo = cache.get(world);
  if (!geo) {
    geo = buildMapGeometry(world);
    cache.set(world, geo);
  }
  return geo;
}

export function buildMapGeometry(world: World): MapGeometry {
  const provinces = feature(topo, topo.objects.provinces) as FeatureCollection<Polygon | MultiPolygon, { pid: string; iso: string }>;
  const countries = feature(topo, topo.objects.countries) as FeatureCollection<Polygon | MultiPolygon, { iso: string; name: string }>;

  // A fixed scale, and the theatre in the middle of its frame.
  const projection = conic();
  const [[tx0, ty0], [tx1, ty1]] = geoPath(projection).bounds(provinces);
  const size: [number, number] = [Math.max(VIEW_WIDTH, tx1 - tx0 + 2 * FRAME_MARGIN), Math.max(VIEW_HEIGHT, ty1 - ty0 + 2 * FRAME_MARGIN)];
  projection.translate([(size[0] - tx0 - tx1) / 2, (size[1] - ty0 - ty1) / 2]);
  const path = geoPath(projection);

  const provincePaths: Record<ProvinceId, string> = {};
  const labelPoints: Record<ProvinceId, [number, number]> = {};
  const provinceArea: Record<ProvinceId, number> = {};
  const provinceBounds: Record<ProvinceId, [[number, number], [number, number]]> = {};
  const shapeBounds: Record<ProvinceId, [[number, number], [number, number]]> = {};
  provinces.features.forEach((f) => {
    provincePaths[f.properties.pid] = path(f) ?? '';
    labelPoints[f.properties.pid] = path.centroid(largestPolygon(f));
    provinceArea[f.properties.pid] = path.area(f);
    provinceBounds[f.properties.pid] = path.bounds(largestPolygon(f)) as [[number, number], [number, number]];
    shapeBounds[f.properties.pid] = path.bounds(f) as [[number, number], [number, number]];
  });

  const anchors: Record<ProvinceId, [number, number]> = {};
  for (const id of world.provinceIds) {
    const def = world.provinces[id];
    anchors[id] = projection(def.anchor) as [number, number];
    // Land is labelled at its anchor, the point farthest from its edges and from the city cut out of it.
    if (!def.city) labelPoints[id] = anchors[id];
  }

  // Every road both ways, from one anchor through its bends to the other: a fraction of the way along it is the same
  // spot from either end, and the same spot on the ground as the simulation's (see roadThrough).
  const roadLines: Record<string, RoadLine> = {};
  for (const c of world.scenario.connections) {
    const there = roadThrough([world.provinces[c.a].anchor, ...(c.via ?? []), world.provinces[c.b].anchor], projection);
    roadLines[`${c.a}>${c.b}`] = there;
    roadLines[`${c.b}>${c.a}`] = { pts: [...there.pts].reverse(), at: there.at.map((t) => 1 - t).reverse(), length: there.length };
  }

  const countryShapes: CountryShape[] = countries.features.map((f) => ({
    iso: f.properties.iso,
    name: f.properties.name,
    d: path(f) ?? '',
    bounds: path.bounds(f) as [[number, number], [number, number]],
  }));

  const geoms = topo.objects.provinces;
  const outline = mesh(topo, geoms, (a, b) => a === b);
  const coastline = path(outline) ?? '';
  const land = path(merge(topo, geoms.geometries as (TopoPolygon | TopoMultiPolygon)[])) ?? '';
  const region = (g: { properties?: unknown }) => world.regionOf[pidOf(g)] ?? pidOf(g);
  const landBorders = path(mesh(topo, geoms, (a, b) => a !== b && region(a) === region(b))) ?? '';
  const provinceBorders = path(mesh(topo, geoms, (a, b) => a !== b && region(a) !== region(b))) ?? '';
  // The cap reaches no further than 16°N and 88°N.
  const graticule =
    path(
      geoGraticule()
        .extent([
          [-180, 15],
          [180, 89],
        ])
        .step([5, 5])(),
    ) ?? '';
  const theatreBounds = path.bounds(provinces) as [[number, number], [number, number]];

  // The theatre's outline and sea coasts, projected, for the cities' roads, reach and ports.
  const project = (p: Position) => projection(p as [number, number]) as Pt;
  // The sea coast: arcs that only one shape, province or country, uses.
  const everything = { type: 'GeometryCollection', geometries: [...geoms.geometries, ...topo.objects.countries.geometries] } as GeometryCollection;
  const coasts: Record<ProvinceId, Segment[]> = {};
  for (const id of world.provinceIds) {
    // Only a city's own coast matters here (its port).
    coasts[id] = world.provinces[id].city && world.provinces[id].coastal
      ? segmentsOf(mesh(topo, everything, (a, b) => a === b && (a.properties as { pid?: string } | undefined)?.pid === id), project)
      : [];
  }
  const cities = cityGeometry(world, anchors, segmentsOf(outline, project), coasts);

  // Armies stand beside their city (or the anchor of their land), on the side away from the places crowding it:
  // a city's garrison keeps clear of the armies at its lands' anchors, and both of the cities next door.
  const campSide: Record<ProvinceId, -1 | 1> = {};
  for (const id of world.provinceIds) {
    const [ax, ay] = anchors[id];
    let lean = 0;
    for (const other of world.provinceIds) {
      if (other === id) continue;
      const [dx, dy] = [anchors[other][0] - ax, anchors[other][1] - ay];
      // Places off to the side count, those well above or below hardly.
      if (Math.abs(dy) < Math.abs(dx) * 1.5) lean += Math.sign(dx) / (dx * dx + dy * dy || 1);
    }
    campSide[id] = lean > 0 ? -1 : 1;
  }

  // The world drawn is the cap (the projection clips the sphere to it).
  const worldBounds = path.bounds({ type: 'Sphere' }) as [[number, number], [number, number]];
  // Where the world fades out: a circle round the cap's middle, just inside its rim (whose distance varies a
  // little, the conic not being quite even in scale).
  const [hx, hy] = projection(CAP_CENTRE) as Pt;
  const rim = geoCircle().center(CAP_CENTRE).radius(CAP_DEGREES).precision(1)().coordinates[0].map((p) => projection(p as [number, number]) as Pt);
  const fromMiddle = rim.map(([x, y]) => Math.hypot(x - hx, y - hy));
  const horizon = { x: hx, y: hy, r: Math.min(...fromMiddle) - 15, outer: Math.max(...fromMiddle) + 15 };

  return {
    provincePaths,
    labelPoints,
    anchors,
    countries: countryShapes,
    provinceArea,
    provinceBounds,
    shapeBounds,
    theatreBounds,
    size,
    coastline,
    land,
    graticule,
    landBorders,
    provinceBorders,
    worldBounds,
    horizon,
    invert: (p) => projection.invert!(p) as [number, number],
    ...cities,
    roadLines,
    campSide,
    nationBorders: (ownerOf) =>
      path(
        mesh(topo, geoms, (a, b) => a !== b && ownerOf(pidOf(a)) !== ownerOf(pidOf(b))),
      ) ?? '',
    ownerOutline: (owner, ownerOf) =>
      path(
        mesh(topo, geoms, (a, b) => {
          const inA = ownerOf(pidOf(a)) === owner;
          return a === b ? inA : inA !== (ownerOf(pidOf(b)) === owner);
        }),
      ) ?? '',
    arcs: (test) => path(mesh(topo, geoms, (a, b) => test(pidOf(a), a === b ? null : pidOf(b)))) ?? '',
    union: (test) => {
      const parts = geoms.geometries.filter((g) => test(pidOf(g))) as (TopoPolygon | TopoMultiPolygon)[];
      return parts.length ? (path(merge(topo, parts)) ?? '') : '';
    },
  };
}
