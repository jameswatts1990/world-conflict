// Downloads the raw Natural Earth source files used by `npm run map:build`.
// Natural Earth data is in the public domain (https://www.naturalearthdata.com/about/terms-of-use/).
// The raw files are large and are not committed; the simplified game assets in
// src/assets/map/ are committed so the game never needs network access at runtime.
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2';
const FILES = [
  ['geojson/ne_10m_admin_1_states_provinces.geojson', 'ne_10m_admin_1_states_provinces.geojson'],
  ['geojson/ne_50m_admin_0_countries.geojson', 'ne_50m_admin_0_countries.geojson'],
  ['LICENSE.md', 'NATURAL_EARTH_LICENSE.md'],
];

const outDir = join(process.cwd(), 'data-src');
await mkdir(outDir, { recursive: true });

for (const [remote, local] of FILES) {
  const target = join(outDir, local);
  if (existsSync(target) && !process.argv.includes('--force')) {
    console.log(`skip ${local} (exists; pass --force to re-download)`);
    continue;
  }
  const url = `${BASE}/${remote}`;
  console.log(`fetch ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
}
console.log('Natural Earth sources ready in data-src/');
