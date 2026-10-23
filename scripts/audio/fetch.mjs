// Downloads the raw recordings used by `npm run audio:build` into data-src/audio/ (git-ignored).
// Every source, its licence and how it is cut is listed in scripts/audio/sources.mjs; the
// processed files in src/audio/files/ are committed, so the game needs no network access.
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCES, rawName } from './sources.mjs';

const outDir = join(process.cwd(), 'data-src', 'audio');
await mkdir(outDir, { recursive: true });

/** The Internet Archive fails now and then (500s, dropped connections): retry with backoff. */
async function download(url, attempts = 5) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'WorldConflictAudio/0.1 (https://github.com/jameswatts1990/world-conflict)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (i === attempts) throw new Error(`Failed to download ${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (i - 1)));
    }
  }
}

const urls = [...new Set(SOURCES.flatMap((s) => [s.url, ...(s.layers ?? []).map((l) => l.url)]))];
for (const url of urls) {
  const target = join(outDir, rawName(url));
  if (existsSync(target) && !process.argv.includes('--force')) {
    console.log(`skip ${rawName(url)} (exists; pass --force to re-download)`);
    continue;
  }
  console.log(`fetch ${url}`);
  await writeFile(target, await download(url));
}
console.log('Audio sources ready in data-src/audio/');
