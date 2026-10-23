// Builds the simplified, locally bundled map asset from Natural Earth sources.
//
//   npm run map:fetch   # once: downloads raw Natural Earth GeoJSON into data-src/
//   npm run map:build   # writes scripts/map/base.topo.json, then city-provinces.ts cuts each
//                       # city out of its province into src/assets/map/map.topo.json
//
// Output is one TopoJSON file with two objects: `provinces` (the playable theatre,
// each tagged with its country's code) and `countries` (world context). Both come from the same 10m admin-1 source and
// are simplified together, so every coast and border they share is the same arc:
// the world underlay can never show slivers beside, or gaps under, the provinces.
// Only geometry and ids are emitted; all gameplay data lives in src/sim/.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import mapshaper from 'mapshaper';
import { PROVINCE_SOURCES } from './province-sources.mjs';

const root = process.cwd();
const srcDir = join(root, 'data-src');
const outDir = join(root, 'src', 'assets', 'map');

/** Centre of the theatre (lon, lat): detail falls off with distance from it. */
const CENTRE = [8, 48];

/**
 * Simplification interval in metres for a unit whose middle is `deg` degrees
 * from the theatre. The theatre and its neighbours keep full detail; distant
 * continents, only ever seen zoomed out, keep far less.
 */
function intervalFor(deg) {
  if (deg < 20) return 3000;
  if (deg < 30) return 3000 + (deg - 20) * 600;
  if (deg < 50) return 9000 + (deg - 30) * 1550;
  return 80000;
}

/**
 * Smallest island kept, in km², for a unit `deg` degrees from the theatre (the
 * final pass drops islets under 120 km² everywhere). Distant archipelagos only
 * ever appear zoomed far out, where a small island is a speck.
 */
function minIslandFor(deg) {
  if (deg < 20) return 0;
  if (deg < 35) return 300;
  if (deg < 50) return 1500;
  return 5000;
}

/** Rough area of a lon/lat ring in km² (planar, scaled by latitude: fine for islands). */
function ringArea(ring) {
  let a = 0;
  let lat = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    a += x0 * y1 - x1 * y0;
    lat += y0;
  }
  return (Math.abs(a) / 2) * 111.32 * 111.32 * Math.cos(((lat / ring.length) * Math.PI) / 180);
}

/** The geometry without its islands smaller than `min` km², or null if nothing is left. */
function withoutIslets(geometry, min) {
  if (!min) return geometry;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const kept = polys.filter((p) => ringArea(p[0]) >= min);
  if (!kept.length) return null;
  return kept.length === 1 ? { type: 'Polygon', coordinates: kept[0] } : { type: 'MultiPolygon', coordinates: kept };
}

function matchRule(props) {
  for (const rule of PROVINCE_SOURCES) {
    if (props.adm0_a3 !== rule.country) continue;
    const name = props.name;
    const region = props.region;
    if (rule.whole) {
      if (rule.exclude && (rule.exclude.includes(name) || rule.exclude.includes(region))) continue;
      return rule.id;
    }
    if (rule.regions && rule.regions.includes(region)) return rule.id;
    if (rule.names && rule.names.includes(name)) return rule.id;
  }
  return null;
}

/**
 * Middle of a unit's largest polygon. Not the whole bounding box: units that
 * cross the date line (Alaska, Chukotka) would otherwise centre on Greenwich.
 */
function middle(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const largest = polys.reduce((a, b) => (ringArea(b[0]) > ringArea(a[0]) ? b : a));
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of largest[0]) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

function degreesFromCentre([lon, lat]) {
  const dx = (lon - CENTRE[0]) * Math.cos((lat * Math.PI) / 180);
  const dy = lat - CENTRE[1];
  return Math.sqrt(dx * dx + dy * dy);
}

async function buildMap() {
  const admin1 = JSON.parse(await readFile(join(srcDir, 'ne_10m_admin_1_states_provinces.geojson'), 'utf8'));
  const used = new Map();
  const features = [];
  for (const f of admin1.features) {
    const p = f.properties;
    if (p.adm0_a3 === 'ATA') continue;
    const pid = matchRule(p);
    if (pid) used.set(pid, (used.get(pid) ?? 0) + 1);
    if (pid) {
      features.push({ type: 'Feature', properties: { key: pid, kind: 'provinces', pid, iso: p.adm0_a3, ivl: intervalFor(0) }, geometry: f.geometry });
      continue;
    }
    // Units of theatre countries that no province claims (overseas territories,
    // the Azores …) stay with their country in the world layer.
    const deg = degreesFromCentre(middle(f.geometry));
    const geometry = withoutIslets(f.geometry, minIslandFor(deg));
    if (!geometry) continue;
    features.push({ type: 'Feature', properties: { key: p.adm0_a3, kind: 'countries', iso: p.adm0_a3, name: p.admin, ivl: intervalFor(deg) }, geometry });
  }
  const expected = new Set(PROVINCE_SOURCES.map((r) => r.id));
  for (const id of expected) {
    if (!used.has(id)) throw new Error(`Province source rule matched nothing: ${id}`);
  }
  console.log(`theatre: ${[...used.values()].reduce((a, b) => a + b, 0)} admin-1 units -> ${expected.size} provinces`);

  const input = { 'admin1.json': { type: 'FeatureCollection', features } };
  const cmd = [
    '-i admin1.json',
    // Per unit, before dissolving: Russia keeps detail in the west and sheds it in Siberia.
    '-simplify variable interval=ivl weighted keep-shapes',
    '-dissolve key copy-fields=kind,pid,iso,name',
    // Drop tiny islets that only add noise at strategy-map scale.
    '-filter-islands min-area=120km2 remove-empty',
    '-clean',
    '-split kind',
    '-filter-fields target=provinces pid,iso',
    '-filter-fields target=countries iso,name',
    // One file, one quantisation grid: shared arcs stay identical in both objects.
    '-o target=* map.topo.json format=topojson quantization=100000',
  ].join(' ');
  const out = await mapshaper.applyCommands(cmd, input);
  // Specks such as the Vatican collapse to nothing on the quantisation grid: drop them.
  const topo = JSON.parse(out['map.topo.json']);
  for (const o of Object.values(topo.objects)) o.geometries = o.geometries.filter((g) => g.type);
  return JSON.stringify(topo);
}

await mkdir(outDir, { recursive: true });
const map = await buildMap();
// The provinces whole: scripts/map/city-provinces.ts cuts the cities out of them for the game.
await writeFile(join(root, 'scripts', 'map', 'base.topo.json'), map);
// Older builds wrote the theatre and the world as two files on different grids.
await rm(join(outDir, 'theatre.topo.json'), { force: true });
await rm(join(outDir, 'world.topo.json'), { force: true });
console.log(`wrote scripts/map/base.topo.json (${(map.length / 1024).toFixed(0)} KB)`);
