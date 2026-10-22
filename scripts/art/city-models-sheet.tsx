// Contact sheet for the 3D city models drawn on the strategy map.
//
//   npx vite-node scripts/art/city-models-sheet.tsx /tmp/city-art/models.html
//   node scripts/art/screenshot-city.mjs /tmp/city-art/models.html /tmp/city-art/models.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildCityModel, type CityModelProps } from '../../src/ui/art/CityModel';
import type { ArtBuilding } from '../../src/ui/art/types';

const out = resolve(process.argv[2] ?? '/tmp/city-art/models.html');
const SCALE = Number(process.argv[3] ?? 3);

const NATIONS: Record<string, string> = {
  uk: '#c4553f', fr: '#3f6fc4', de: '#5f6b75', it: '#3b9a58', es: '#d39b1c', pl: '#8d5bb4',
};
const SLOT_BUILDINGS: ArtBuilding[] = [
  'industry', 'market', 'powerPlant', 'refinery', 'housing', 'university', 'barracks', 'academy', 'armsWorks',
  'motorPool', 'tankWorks', 'hospital', 'propaganda', 'garrisonHq',
];
const INFRA: ArtBuilding[] = ['fortifications', 'supplyDepot', 'railway', 'coastalBattery'];

function card(caption: string, props: CityModelProps, scale = SCALE): string {
  const t0 = performance.now();
  const m = buildCityModel(props);
  const ms = (performance.now() - t0).toFixed(1);
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(m.svg)}`;
  return `<figure><img src="${src}" width="${(m.width * scale).toFixed(0)}" height="${(m.height * scale).toFixed(0)}"><figcaption>${caption} <small>${ms} ms · ${(m.svg.length / 1024).toFixed(0)} KB</small></figcaption></figure>`;
}

const sections: string[] = [];
const section = (title: string, cards: string[]) => sections.push(`<section><h2>${title}</h2><div class="grid">${cards.join('')}</div></section>`);

section('Growth: an empty city at each tier (free slots shown as plots)', [1, 2, 3, 4, 5].map((t) =>
  card(`Tier ${t}`, { seed: 'de-saxony', tier: t as 1, buildings: {}, freeSlots: [0, 3, 4, 5, 7, 8][t], terrain: 'hills', nationColor: NATIONS.de }),
));
section('Every building on its own (tier 3, French)', [...SLOT_BUILDINGS, ...INFRA].map((b) =>
  card(b, { seed: 'fr-rhone', tier: 3, buildings: { [b]: b === 'fortifications' ? 3 : 1 }, terrain: 'plains', coastal: b === 'coastalBattery', nationColor: NATIONS.fr }),
));
section('Capitals', ['uk-london', 'fr-paris', 'de-berlin', 'it-rome', 'es-madrid', 'pl-warsaw', 'at-vienna'].map((seed) =>
  card(seed, {
    seed, tier: 4, capital: true, terrain: 'urban', coastal: seed === 'uk-london',
    buildings: { industry: 2, market: 1, barracks: 1, university: 1, railway: 1, supplyDepot: 1 },
    freeSlots: 2, nationColor: seed.startsWith('nt') ? undefined : NATIONS[seed.slice(0, 2)],
  }),
));
section('Busy cities', [
  card('Metropolis at war, building a tank works', {
    seed: 'de-ruhr', tier: 4, terrain: 'urban', nationColor: NATIONS.de, battle: true, construction: 'tankWorks',
    buildings: { industry: 3, powerPlant: 1, armsWorks: 1, barracks: 1, academy: 1, housing: 2, fortifications: 2, railway: 1 },
  }),
  card('World city, everything', {
    seed: 'uk-london', tier: 5, capital: true, terrain: 'urban', coastal: true, nationColor: NATIONS.uk,
    buildings: { industry: 3, market: 2, powerPlant: 1, university: 1, barracks: 1, armsWorks: 1, tankWorks: 1, hospital: 1, fortifications: 3, railway: 1, coastalBattery: 2, supplyDepot: 1 },
  }),
  card('Town, upgrading industry', {
    seed: 'it-islands', tier: 1, terrain: 'hills', coastal: true, nationColor: NATIONS.it, construction: 'industry',
    buildings: { industry: 1, barracks: 1 }, freeSlots: 1,
  }),
  card('Alpine town in the woods', { seed: 'ch-bern', tier: 2, terrain: 'forest', buildings: { barracks: 1, fortifications: 1 }, freeSlots: 3 }),
  card('Occupied, with HQ and propaganda', {
    seed: 'pl-warsaw', tier: 3, capital: true, terrain: 'urban', nationColor: NATIONS.de,
    buildings: { garrisonHq: 1, propaganda: 1, hospital: 1, motorPool: 1, refinery: 2 },
  }),
]);
section('At map size (1.35 px per unit)', [
  card('Tier 2', { seed: 'fr-nord', tier: 2, buildings: { industry: 1, barracks: 1 }, freeSlots: 2, terrain: 'plains', nationColor: NATIONS.fr }, 1.35),
  card('Tier 4', { seed: 'de-ruhr', tier: 4, buildings: { industry: 3, powerPlant: 1, armsWorks: 1, barracks: 1, railway: 1 }, freeSlots: 2, terrain: 'urban', nationColor: NATIONS.de }, 1.35),
  card('Paris', { seed: 'fr-paris', tier: 5, capital: true, buildings: { industry: 1, market: 1, barracks: 1, supplyDepot: 1 }, freeSlots: 4, terrain: 'urban', nationColor: NATIONS.fr }, 1.35),
  card('London', { seed: 'uk-london', tier: 5, capital: true, coastal: true, buildings: { industry: 1, market: 1, barracks: 1 }, freeSlots: 4, terrain: 'urban', nationColor: NATIONS.uk }, 1.35),
]);

const html = `<!doctype html><meta charset="utf-8"><title>City models</title>
<style>
body { background: #2b3a33; color: #e8e2d2; font: 13px/1.4 system-ui, sans-serif; margin: 16px; }
h2 { font-size: 14px; margin: 18px 0 8px; color: #f2c66d; }
.grid { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
figure { margin: 0; padding: 6px; background: #52604f; border-radius: 6px; }
figcaption { font-size: 11px; color: #e8e2d2; } small { color: #b9b2a0; }
img { display: block; }
</style>
${sections.join('\n')}`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out}`);
