// Cuts every city out of the province around it, so each city is a province of its own.
//
//   npm run map:build   # runs build-map.mjs, then this script
//   npx vite-node scripts/map/city-provinces.ts   # this step alone (no raw data needed)
//
// A city's border is drawn tight round it: an irregular ring (wider for bigger cities, shaped by
// the city's own seed) that keeps clear of every land border of its province and follows the
// coast where it reaches the sea. What is left of the province becomes a province without a city,
// keyed `<row id>-land`. It reads the uncut provinces from scripts/map/base.topo.json, so running it
// twice changes nothing.
//
// It also writes src/sim/scenario/europe/land.ts: where each province without a city is anchored
// (its armies stand and its roads meet there) and which cities reach the sea. Gameplay reads those,
// never the shapes.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import mapshaper from 'mapshaper';
import { feature, mesh, neighbors } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { ROWS } from '../../src/sim/scenario/europe/provinces';
import { LAND_SUFFIX } from '../../src/sim/scenario/build';

const root = process.cwd();
/** The provinces before any city is cut out (build-map.mjs writes it; committed so this step runs without the raw data). */
const baseFile = join(root, 'scripts', 'map', 'base.topo.json');
const mapFile = join(root, 'src', 'assets', 'map', 'map.topo.json');
const landFile = join(root, 'src', 'sim', 'scenario', 'europe', 'land.ts');

/** A city's radius before its outline is shaped, in km, by size. */
const RADIUS_KM = { capital: 30, major: 23, town: 17 } as const;
/** How close a city's border may come to a land border of its province, in km. */
const MARGIN_KM = 5;
/** Points round each city's outline. */
const SPOKES = 72;
/** Same grid as build-map.mjs, so shared coasts and borders stay the same arcs. */
const QUANTIZATION = 100000;

type Pt = [number, number];
type Props = { pid: string; iso: string };

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

const round3 = (n: number) => Math.round(n * 1000) / 1000;

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

async function main() {
  // 1. The whole provinces, as build-map.mjs drew them.
  const base = JSON.parse(readFileSync(baseFile, 'utf8')) as Topology<{ provinces: GeometryCollection<Props>; countries: GeometryCollection }>;
  const provinces = feature(base, base.objects.provinces) as FeatureCollection<Polygon | MultiPolygon, Props>;
  const countries = feature(base, base.objects.countries) as FeatureCollection<Polygon | MultiPolygon>;
  const everything = { type: 'GeometryCollection', geometries: [...base.objects.provinces.geometries, ...base.objects.countries.geometries] } as GeometryCollection;
  const byId = new Map(provinces.features.map((f) => [f.properties.pid, f]));
  const land: Record<string, { anchor: Pt; coast: boolean }> = {};

  /** A city's outline at `scale` times its usual size: an irregular ring, pulled in short of any land border. */
  const outline = (row: (typeof ROWS)[number], scale: number): Feature<Polygon, Props> => {
    const province = byId.get(row.id);
    if (!province) throw new Error(`No shape for ${row.id}`);
    const flat = local(row.city.coord);
    // Land borders: arcs this province shares with another shape. The rest of its outline is coast.
    const borders = mesh(base, everything, (a, b) => a !== b && ((a.properties as Props | undefined)?.pid === row.id || (b.properties as Props | undefined)?.pid === row.id));
    const coast = mesh(base, everything, (a, b) => a === b && (a.properties as Props | undefined)?.pid === row.id);
    const borderSegs = segmentsOf(borders.coordinates, flat.to);
    const coastSegs = segmentsOf(coast.coordinates, flat.to);
    // A few gentle lobes from the city's seed.
    const rand = rngOf(row.id);
    const lobes = [2, 3, 5].map((k, i) => ({ k, a: [0.12, 0.08, 0.05][i] * (0.6 + rand() * 0.8), phase: rand() * Math.PI * 2 }));
    const r0 = RADIUS_KM[row.city.size] * scale;
    let seaward = false;
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
      if (firstHit(coastSegs, dx, dy) < r) seaward = true;
      ring.push(flat.from([dx * r, dy * r]));
    }
    ring.push(ring[0]);
    land[row.id] = { anchor: [0, 0], coast: seaward };
    return { type: 'Feature', properties: { pid: row.id, iso: province.properties.iso }, geometry: { type: 'Polygon', coordinates: [ring] } };
  };

  /** A city clipped to its own province (so it follows the coast), keeping the piece the city stands in. */
  const clip = async (city: Feature<Polygon, Props>): Promise<Feature<Polygon, Props>> => {
    const out = await mapshaper.applyCommands('-i city.json -clip province.json -o city.json format=geojson', {
      'city.json': { type: 'FeatureCollection', features: [city] },
      'province.json': { type: 'FeatureCollection', features: [byId.get(city.properties.pid)!] },
    });
    const f = (JSON.parse(out['city.json']) as FeatureCollection<Polygon | MultiPolygon>).features[0];
    const row = ROWS.find((r) => r.id === city.properties.pid)!;
    const flat = local(row.city.coord);
    const piece = ringsOf(f.geometry).find((poly) => inPolygon(poly.map((r) => r.map(flat.to)), [0, 0]));
    if (!piece) throw new Error(`${row.id}: the city lies outside its own province`);
    return { type: 'Feature', properties: city.properties, geometry: { type: 'Polygon', coordinates: piece.map(withoutSpikes) } };
  };

  // 2. Cut the cities out of the provinces: what is left is each province without its city. Where a city
  //    still touches another province (clipping can leave a hair along a coast that meets a border), draw
  //    that city a little smaller and cut again.
  const scale = new Map(ROWS.map((r) => [r.id, 1]));
  const clipped = new Map<string, Feature<Polygon, Props>>();
  let out: Topology<{ provinces: GeometryCollection<Props>; countries: GeometryCollection }> | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    for (const row of ROWS) if (!clipped.has(row.id)) clipped.set(row.id, await clip(outline(row, scale.get(row.id)!)));
    const cut = await mapshaper.applyCommands(
      [
        '-i provinces.json cities.json countries.json combine-files',
        '-erase cities target=provinces',
        '-each "pid = pid + \'' + LAND_SUFFIX + '\'" target=provinces',
        '-merge-layers target=provinces,cities name=provinces force',
        '-filter-fields target=provinces pid,iso',
        `-o target=provinces,countries map.topo.json format=topojson quantization=${QUANTIZATION}`,
      ].join(' '),
      {
        'provinces.json': { type: 'FeatureCollection', features: provinces.features },
        'cities.json': { type: 'FeatureCollection', features: [...clipped.values()] },
        'countries.json': countries,
      },
    );
    out = JSON.parse(cut['map.topo.json']) as Topology<{ provinces: GeometryCollection<Props>; countries: GeometryCollection }>;
    for (const o of Object.values(out.objects)) o.geometries = o.geometries.filter((g) => g.type);
    const geoms = out.objects.provinces.geometries;
    const ids = geoms.map((g) => (g.properties as Props).pid);
    const touching = new Set<string>();
    neighbors(geoms as never).forEach((list, i) => {
      for (const j of list) {
        const [a, b] = [ids[i], ids[j]];
        if (!a.endsWith(LAND_SUFFIX) && b !== a + LAND_SUFFIX) touching.add(a);
      }
    });
    if (!touching.size) break;
    if (attempt === 7) throw new Error(`Cities still touching another province: ${[...touching].join(', ')}`);
    for (const id of touching) {
      scale.set(id, scale.get(id)! * 0.85);
      clipped.delete(id);
    }
  }
  if (!out) throw new Error('No map');

  // 3. Each province without a city is anchored at the point of its largest part farthest from its
  //    outline and from the city cut out of it.
  const regions = feature(out, out.objects.provinces) as FeatureCollection<Polygon | MultiPolygon, Props>;
  for (const row of ROWS) {
    const f = regions.features.find((x) => x.properties.pid === row.id + LAND_SUFFIX);
    if (!f) throw new Error(`${row.id}: nothing left round the city`);
    const flat = local(row.city.coord);
    const parts = ringsOf(f.geometry).map((poly) => poly.map((r) => r.map(flat.to)));
    const area = (rings: Pt[][]) => Math.abs(rings[0].reduce((s, [x, y], i, a) => s + x * a[(i + 1) % a.length][1] - a[(i + 1) % a.length][0] * y, 0)) / 2;
    const largest = parts.reduce((a, b) => (area(b) > area(a) ? b : a));
    const [lon, lat] = flat.from(poleOf(largest));
    land[row.id].anchor = [round3(lon), round3(lat)];
  }

  writeFileSync(mapFile, JSON.stringify(out));
  const lines = ROWS.map((r) => `  '${r.id}': { anchor: [${land[r.id].anchor.join(', ')}], coast: ${land[r.id].coast} },`);
  writeFileSync(
    landFile,
    [
      '// Generated by scripts/map/city-provinces.ts from the map shapes: do not edit by hand.',
      '// For each row: where the province round the city is anchored (its armies stand and its roads',
      '// meet there), and whether the city itself reaches the sea.',
      'export const LAND: Record<string, { anchor: [number, number]; coast: boolean }> = {',
      ...lines,
      '};',
      '',
    ].join('\n'),
  );
  console.log(`cut ${ROWS.length} cities from their provinces; wrote map.topo.json (${(JSON.stringify(out).length / 1024).toFixed(0)} KB) and land.ts`);
}

await main();
