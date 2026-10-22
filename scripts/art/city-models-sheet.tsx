// Contact sheet for the 3D city models drawn on the strategy map: each city's
// streets and buildings over a patch of map, coastal ones with their port.
//
//   npx vite-node scripts/art/city-models-sheet.tsx /tmp/city-art/models.html
//   node scripts/art/screenshot-city.mjs /tmp/city-art/models.html /tmp/city-art/models.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { REACH_DIRECTIONS, buildCityModel, buildPortModel, type CityModelProps, type ModelLayer } from '../../src/ui/art/CityModel';
import type { ArtBuilding } from '../../src/ui/art/types';

const out = resolve(process.argv[2] ?? '/tmp/city-art/models.html');
const SCALE = Number(process.argv[3] ?? 3);

const NATIONS: Record<string, string> = {
  uk: '#c4553f', fr: '#3f6fc4', de: '#5f6b75', it: '#3b9a58', es: '#d39b1c', pl: '#8d5bb4',
};
/** Roughly the map under each nation's tint, and under the neutral hatching. */
const GROUND: Record<string, string> = {
  uk: '#a77a6a', fr: '#7c8fae', de: '#8f9188', it: '#86a77f', es: '#c0a35f', pl: '#9a87ad', nt: '#c9bc98',
};
const SEA = '#2d5f80';
const SLOT_BUILDINGS: ArtBuilding[] = [
  'industry', 'market', 'powerPlant', 'refinery', 'housing', 'university', 'barracks', 'academy', 'armsWorks',
  'motorPool', 'tankWorks', 'hospital', 'propaganda', 'garrisonHq',
];
const INFRA: ArtBuilding[] = ['fortifications', 'supplyDepot', 'railway'];

/** A straight coast `y` model units below the city's anchor, the sea beyond it. */
function coastBelow(y: number): number[] {
  return Array.from({ length: REACH_DIRECTIONS }, (_, i) => {
    const s = Math.sin((i / REACH_DIRECTIONS) * Math.PI * 2);
    return s > 0.05 ? Math.min(99, y / s) : 99;
  });
}

function card(caption: string, props: CityModelProps, opts: { scale?: number; coast?: number; batteries?: number } = {}): string {
  const scale = opts.scale ?? SCALE;
  const t0 = performance.now();
  const m = buildCityModel(opts.coast === undefined ? props : { ...props, reach: coastBelow(opts.coast) });
  const ms = (performance.now() - t0).toFixed(1);
  // A stage round the built-up area, with room for the streets to fade out.
  const w = Math.round((2 * m.rx + 30) * scale);
  const h = Math.round((m.back + m.front + 26) * scale);
  const ax = w / 2 - m.mid * scale;
  const ay = (m.back + 13) * scale;
  const img = (l: ModelLayer, x: number, y: number, style = '') =>
    `<img style="left:${(x - l.cx * scale).toFixed(1)}px;top:${(y - l.cy * scale).toFixed(1)}px;width:${(l.width * scale).toFixed(1)}px;height:${(l.height * scale).toFixed(1)}px;${style}" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(l.svg)}">`;
  let layers = img(m.ground, ax, ay);
  if (opts.coast !== undefined) {
    // The map clips the streets to the land; here the coast is the line y = coast.
    const shore = ay + opts.coast * scale;
    const clip = `clip-path:inset(0 0 ${((m.ground.height - m.ground.cy - opts.coast) * scale).toFixed(1)}px 0)`;
    const port = buildPortModel({ seed: props.seed, facing: Math.PI / 2, batteries: opts.batteries ?? 0, nationColor: props.nationColor });
    layers = `<div class="sea" style="top:${shore.toFixed(1)}px"></div>${img(m.ground, ax, ay, clip)}${img(port, ax, shore)}`;
  }
  const kb = (m.ground.svg.length + m.structures.svg.length) / 1024;
  const bg = GROUND[props.seed.slice(0, 2)] ?? GROUND.nt;
  return `<figure><div class="stage" style="width:${w}px;height:${h}px;background:${bg}">${layers}${img(m.structures, ax, ay)}</div><figcaption>${caption} <small>${ms} ms · ${kb.toFixed(0)} KB</small></figcaption></figure>`;
}

const sections: string[] = [];
const section = (title: string, cards: string[]) => sections.push(`<section><h2>${title}</h2><div class="grid">${cards.join('')}</div></section>`);

section('Growth: an empty city at each tier (free slots shown as plots)', [1, 2, 3, 4, 5].map((t) =>
  card(`Tier ${t}`, { seed: 'de-saxony', tier: t as 1, buildings: {}, freeSlots: [0, 3, 4, 5, 7, 8][t], terrain: 'hills', nationColor: NATIONS.de }),
));
section('Every building on its own (tier 3, French)', [...SLOT_BUILDINGS, ...INFRA].map((b) =>
  card(b, { seed: 'fr-rhone', tier: 3, buildings: { [b]: b === 'fortifications' ? 3 : 1 }, terrain: 'plains', nationColor: NATIONS.fr }),
));
section('Capitals', ['uk-london', 'fr-paris', 'de-berlin', 'it-rome', 'es-madrid', 'pl-warsaw', 'nt-austria'].map((seed) =>
  card(seed, {
    seed, tier: 4, capital: true, terrain: 'urban',
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
    seed: 'uk-london', tier: 5, capital: true, terrain: 'urban', nationColor: NATIONS.uk,
    buildings: { industry: 3, market: 2, powerPlant: 1, university: 1, barracks: 1, armsWorks: 1, tankWorks: 1, hospital: 1, fortifications: 3, railway: 1, supplyDepot: 1 },
  }),
  card('Neutral town in the woods', { seed: 'nt-switzerland', tier: 2, terrain: 'forest', buildings: { barracks: 1, fortifications: 1 }, freeSlots: 3 }),
  card('Occupied, with HQ and propaganda', {
    seed: 'pl-warsaw', tier: 3, capital: true, terrain: 'urban', nationColor: NATIONS.de,
    buildings: { garrisonHq: 1, propaganda: 1, hospital: 1, motorPool: 1, refinery: 2 },
  }),
]);
section('By the sea: everything on land, the port on the coast', [
  card('Town on the shore, upgrading industry', {
    seed: 'it-islands', tier: 1, terrain: 'hills', nationColor: NATIONS.it, construction: 'industry', buildings: { industry: 1, barracks: 1 }, freeSlots: 1,
  }, { coast: 1 }),
  card('Port city with two batteries', {
    seed: 'fr-midi', tier: 3, terrain: 'hills', nationColor: NATIONS.fr, buildings: { industry: 1, barracks: 1, coastalBattery: 2, railway: 1 }, freeSlots: 2,
  }, { coast: 4, batteries: 2 }),
]);
section('At map size (1.35 px per unit)', [
  card('Tier 2', { seed: 'fr-nord', tier: 2, buildings: { industry: 1, barracks: 1 }, freeSlots: 2, terrain: 'plains', nationColor: NATIONS.fr }, { scale: 1.35 }),
  card('Tier 4', { seed: 'de-ruhr', tier: 4, buildings: { industry: 3, powerPlant: 1, armsWorks: 1, barracks: 1, railway: 1 }, freeSlots: 2, terrain: 'urban', nationColor: NATIONS.de }, { scale: 1.35 }),
  card('Paris', { seed: 'fr-paris', tier: 5, capital: true, buildings: { industry: 1, market: 1, barracks: 1, supplyDepot: 1 }, freeSlots: 4, terrain: 'urban', nationColor: NATIONS.fr }, { scale: 1.35 }),
  card('London', { seed: 'uk-london', tier: 5, capital: true, buildings: { industry: 1, market: 1, barracks: 1 }, freeSlots: 4, terrain: 'urban', nationColor: NATIONS.uk }, { scale: 1.35 }),
]);

const html = `<!doctype html><meta charset="utf-8"><title>City models</title>
<style>
body { background: #1d2622; color: #e8e2d2; font: 13px/1.4 system-ui, sans-serif; margin: 16px; }
h2 { font-size: 14px; margin: 18px 0 8px; color: #f2c66d; }
.grid { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
figure { margin: 0; }
figcaption { font-size: 11px; color: #e8e2d2; margin-top: 4px; } small { color: #b9b2a0; }
.stage { position: relative; overflow: hidden; border-radius: 6px; }
.stage img { position: absolute; display: block; }
.sea { position: absolute; left: 0; right: 0; bottom: 0; background: ${SEA}; }
</style>
${sections.join('\n')}`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out}`);
