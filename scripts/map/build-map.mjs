// Builds the simplified, locally bundled map assets from Natural Earth sources.
//
//   npm run map:fetch   # once: downloads raw Natural Earth GeoJSON into data-src/
//   npm run map:build   # writes src/assets/map/{theatre,world}.topo.json
//
// Output is TopoJSON (shared arcs keep province borders consistent and small).
// Only geometry and ids are emitted; all gameplay data lives in src/sim/.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import mapshaper from 'mapshaper';
import { PROVINCE_SOURCES } from './province-sources.mjs';

const root = process.cwd();
const srcDir = join(root, 'data-src');
const outDir = join(root, 'src', 'assets', 'map');

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

async function buildTheatre() {
  const admin1 = JSON.parse(await readFile(join(srcDir, 'ne_10m_admin_1_states_provinces.geojson'), 'utf8'));
  const used = new Map();
  const features = [];
  for (const f of admin1.features) {
    const pid = matchRule(f.properties);
    if (!pid) continue;
    used.set(pid, (used.get(pid) ?? 0) + 1);
    features.push({ type: 'Feature', properties: { pid }, geometry: f.geometry });
  }
  const expected = new Set(PROVINCE_SOURCES.map((r) => r.id));
  for (const id of expected) {
    if (!used.has(id)) throw new Error(`Province source rule matched nothing: ${id}`);
  }
  console.log(`theatre: ${features.length} admin-1 units -> ${expected.size} provinces`);

  const input = { 'admin1.json': { type: 'FeatureCollection', features } };
  const cmd = [
    '-i admin1.json',
    '-dissolve pid',
    // Drop tiny islets that only add noise at strategy-map scale.
    '-filter-islands min-area=120km2 remove-empty',
    '-simplify 7% weighted keep-shapes',
    '-clean',
    '-rename-layers provinces',
    '-o theatre.topo.json format=topojson quantization=20000',
  ].join(' ');
  const out = await mapshaper.applyCommands(cmd, input);
  return out['theatre.topo.json'];
}

async function buildWorld() {
  const admin0 = JSON.parse(await readFile(join(srcDir, 'ne_50m_admin_0_countries.geojson'), 'utf8'));
  const features = admin0.features
    .filter((f) => f.properties.ADM0_A3 !== 'ATA')
    .map((f) => ({
      type: 'Feature',
      properties: { iso: f.properties.ADM0_A3, name: f.properties.NAME },
      geometry: f.geometry,
    }));
  const input = { 'admin0.json': { type: 'FeatureCollection', features } };
  const cmd = [
    '-i admin0.json',
    '-filter-islands min-area=400km2 remove-empty',
    '-simplify 12% weighted keep-shapes',
    '-clean',
    '-rename-layers countries',
    '-o world.topo.json format=topojson quantization=20000',
  ].join(' ');
  const out = await mapshaper.applyCommands(cmd, input);
  return out['world.topo.json'];
}

await mkdir(outDir, { recursive: true });
const theatre = await buildTheatre();
const world = await buildWorld();
await writeFile(join(outDir, 'theatre.topo.json'), theatre);
await writeFile(join(outDir, 'world.topo.json'), world);
console.log(`wrote theatre.topo.json (${(theatre.length / 1024).toFixed(0)} KB)`);
console.log(`wrote world.topo.json (${(world.length / 1024).toFixed(0)} KB)`);
