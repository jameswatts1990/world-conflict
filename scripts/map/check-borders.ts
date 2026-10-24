// Compares the connections between rows with the borders their regions actually share.
//
//   npx vite-node scripts/map/check-borders.ts [prefix…]
//
// A region is a city with the lands round it. Lists regions that share a border but have no connection
// (each needs a land or mountain connection in connections.ts, or a deliberate decision not to have one),
// and land or mountain connections between regions that share no border (fine across a narrow gap, worth
// a second look otherwise). Sea crossings are not checked. With prefixes (e.g. `ro rs`), only pairs
// involving those countries' regions are listed. scripts/map/city-provinces.ts refuses to write a map
// with either kind of mismatch.
import { readFileSync } from 'node:fs';
import { neighbors } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { CONNECTIONS } from '../../src/sim/scenario/europe/connections';
import { ROWS } from '../../src/sim/scenario/europe/provinces';

const topo = JSON.parse(readFileSync('src/assets/map/map.topo.json', 'utf8')) as Topology<{ provinces: GeometryCollection<{ pid: string }> }>;
const geoms = topo.objects.provinces.geometries;
const ids = geoms.map((g) => (g.properties as { pid: string }).pid);
const rows = new Set(ROWS.map((r) => r.id));
/** The row a province belongs to: a city is its row; a land is `<row>-<key>`. */
const rowOf = (pid: string) => (rows.has(pid) ? pid : pid.slice(0, pid.lastIndexOf('-')));
const prefixes = process.argv.slice(2).filter((a) => !a.endsWith('.ts'));
const wanted = (a: string, b: string) => !prefixes.length || prefixes.some((p) => a.startsWith(`${p}-`) || b.startsWith(`${p}-`));
const key = (a: string, b: string) => [a, b].sort().join(' — ');

const borders = new Set<string>();
neighbors(geoms).forEach((list, i) =>
  list.forEach((j) => {
    const [a, b] = [rowOf(ids[i]), rowOf(ids[j])];
    if (a !== b) borders.add(key(a, b));
  }),
);
const links = new Map(CONNECTIONS.map((c) => [key(c.a, c.b), c]));

const missing = [...borders].filter((k) => (!links.has(k) || links.get(k)!.kind === 'strait') && wanted(...(k.split(' — ') as [string, string])));
const detached = [...links.values()].filter((c) => c.kind !== 'strait' && !borders.has(key(c.a, c.b)) && wanted(c.a, c.b));

console.log(`Shared borders without a land or mountain connection (${missing.length}):`);
for (const k of missing.sort()) console.log(`  ${k}`);
console.log(`Land or mountain connections between regions that share no border (${detached.length}):`);
for (const c of detached) console.log(`  ${key(c.a, c.b)} (${c.kind}${c.label ? `: ${c.label}` : ''})`);
