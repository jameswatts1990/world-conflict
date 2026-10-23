// Compares the movement connections with the borders the map shapes actually share.
//
//   npx vite-node scripts/map/check-borders.ts [prefix…]
//
// Lists provinces that share a border but have no connection (each needs a land or mountain link, or a
// deliberate decision not to have one), and land or mountain links between provinces that share no border
// (fine across a narrow gap, worth a second look otherwise). Sea crossings are not checked. With prefixes
// (e.g. `ro rs`), only pairs involving those countries' provinces are listed.
import { readFileSync } from 'node:fs';
import { neighbors } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { CONNECTIONS } from '../../src/sim/scenario/europe/connections';

const topo = JSON.parse(readFileSync('src/assets/map/map.topo.json', 'utf8')) as Topology<{ provinces: GeometryCollection<{ pid: string }> }>;
const geoms = topo.objects.provinces.geometries;
const ids = geoms.map((g) => (g.properties as { pid: string }).pid);
const prefixes = process.argv.slice(2).filter((a) => !a.endsWith('.ts'));
const wanted = (a: string, b: string) => !prefixes.length || prefixes.some((p) => a.startsWith(`${p}-`) || b.startsWith(`${p}-`));
const key = (a: string, b: string) => [a, b].sort().join(' — ');

const borders = new Set<string>();
neighbors(geoms).forEach((list, i) => list.forEach((j) => borders.add(key(ids[i], ids[j]))));
const links = new Map(CONNECTIONS.map((c) => [key(c.a, c.b), c]));

const missing = [...borders].filter((k) => !links.has(k) && wanted(...(k.split(' — ') as [string, string])));
const detached = [...links.values()].filter((c) => c.kind !== 'strait' && !borders.has(key(c.a, c.b)) && wanted(c.a, c.b));

console.log(`Shared borders without a connection (${missing.length}):`);
for (const k of missing.sort()) console.log(`  ${k}`);
console.log(`Land or mountain links between provinces that share no border (${detached.length}):`);
for (const c of detached) console.log(`  ${key(c.a, c.b)} (${c.kind}${c.label ? `: ${c.label}` : ''})`);
