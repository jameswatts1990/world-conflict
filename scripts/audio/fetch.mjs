// Downloads the raw recordings used by `npm run audio:build` into data-src/audio/ (git-ignored).
// Every source, its licence and how it is cut is listed in scripts/audio/sources.mjs; the
// processed files in src/audio/files/ are committed, so the game needs no network access.
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCES, rawName } from './sources.mjs';

const outDir = join(process.cwd(), 'data-src', 'audio');
await mkdir(outDir, { recursive: true });

const urls = [...new Set(SOURCES.map((s) => s.url))];
for (const url of urls) {
  const target = join(outDir, rawName(url));
  if (existsSync(target) && !process.argv.includes('--force')) {
    console.log(`skip ${rawName(url)} (exists; pass --force to re-download)`);
    continue;
  }
  console.log(`fetch ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': 'WorldConflictAudio/0.1 (https://github.com/jameswatts1990/world-conflict)' } });
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
}
console.log('Audio sources ready in data-src/audio/');
