// Contact sheet for the 3D unit models that stand in for armies on the strategy map.
//
//   npx vite-node scripts/art/unit-models-sheet.tsx /tmp/unit-art/units.html [scale]
//   node scripts/art/screenshot-city.mjs /tmp/unit-art/units.html /tmp/unit-art/units.png
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { UNIT_HEADINGS, buildUnitModel, type UnitModelProps } from '../../src/ui/art/UnitModel';
import { ART_NATIONS, ART_UNIT_TYPES, UNIT_GENS } from '../../src/ui/art/UnitArt';
import { infantrySprite } from '../../src/ui/art/InfantryAsset';

const out = resolve(process.argv[2] ?? '/tmp/unit-art/units.html');
const SCALE = Number(process.argv[3] ?? 7);

function card(caption: string, props: UnitModelProps, scale = SCALE): string {
  if (props.type === 'infantry' && props.gen === 'ww1') {
    const m = infantrySprite(props.heading);
    const heading = ((Math.round(props.heading) % UNIT_HEADINGS) + UNIT_HEADINGS) % UNIT_HEADINGS;
    const png = readFileSync(new URL(`../../src/assets/units/wwi-infantry/heading-${String(heading).padStart(2, '0')}.png`, import.meta.url));
    return `<figure><img src="data:image/png;base64,${png.toString('base64')}" width="${(m.width * scale).toFixed(0)}" height="${(m.height * scale).toFixed(0)}"><figcaption>${caption} <small>baked WWI model</small></figcaption></figure>`;
  }
  const t0 = performance.now();
  const m = buildUnitModel(props);
  const ms = (performance.now() - t0).toFixed(1);
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(m.svg)}`;
  return `<figure><img src="${src}" width="${(m.width * scale).toFixed(0)}" height="${(m.height * scale).toFixed(0)}"><figcaption>${caption} <small>${ms} ms · ${(m.svg.length / 1024).toFixed(0)} KB</small></figcaption></figure>`;
}

const sections: string[] = [];
const section = (id: string, title: string, cards: string[]) =>
  sections.push(`<section id="${id}"><h2>${title}</h2><div class="grid">${cards.join('')}</div></section>`);

// Facing the viewer's lower left, as armies stand beside a city.
const REST = 4;

section('roster', 'Every type in every generation (German, facing lower left)', ART_UNIT_TYPES.flatMap((type) =>
  UNIT_GENS[type].map((gen) => card(`${type} · ${gen}`, { type, gen, nation: 'de', heading: REST })),
));
section('nations', 'Infantry of every nation in 1914, and 1940', ART_NATIONS.flatMap((nation) =>
  (['ww1', 'ww2'] as const).map((gen) => card(`${nation} · ${gen}`, { type: 'infantry', gen, nation, heading: REST })),
));
section('nation-art', 'Nations: cavalry, mountain troops and assault troops in 1914; tanks in 1940', ART_NATIONS.flatMap((nation) => [
  card(`${nation} cavalry`, { type: 'cavalry', gen: 'ww1', nation, heading: REST }),
  card(`${nation} mountain`, { type: 'mountain', gen: 'interwar', nation, heading: REST }),
  card(`${nation} assault`, { type: 'stormtroopers', gen: 'ww1', nation, heading: REST }),
  card(`${nation} tank`, { type: 'tank', gen: 'ww2', nation, heading: REST }),
]));
section('headings', 'All sixteen headings (French 1940 tank, British lorry, troopship)', [
  ...Array.from({ length: UNIT_HEADINGS }, (_, h) => card(`tank h${h}`, { type: 'tank', gen: 'ww2', nation: 'fr', heading: h }, SCALE * 0.6)),
  ...Array.from({ length: UNIT_HEADINGS }, (_, h) => card(`lorry h${h}`, { type: 'motorised', gen: 'ww2', nation: 'uk', heading: h }, SCALE * 0.6)),
  ...Array.from({ length: UNIT_HEADINGS }, (_, h) => card(`ship h${h}`, { type: 'transport', gen: 'ww2', nation: 'it', heading: h }, SCALE * 0.6)),
]);
section('map-size', 'At map size (about 9 px per unit)', [
  card('infantry', { type: 'infantry', gen: 'ww1', nation: 'fr', heading: REST }, 9),
  card('artillery', { type: 'artillery', gen: 'ww1', nation: 'uk', heading: 0 }, 9),
  card('tank', { type: 'tank', gen: 'ww1', nation: 'uk', heading: REST }, 9),
  card('cavalry', { type: 'cavalry', gen: 'ww1', nation: 'pl', heading: 0 }, 9),
  card('motorised', { type: 'motorised', gen: 'interwar', nation: 'it', heading: REST }, 9),
]);

const html = `<!doctype html><meta charset="utf-8"><title>Unit models</title>
<style>
body { background: #6d7a55; color: #f2eee2; font: 13px/1.4 system-ui, sans-serif; margin: 16px; }
h2 { font-size: 14px; margin: 18px 0 8px; color: #ffe2a0; }
.grid { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
figure { margin: 0; padding: 6px; background: #8a9468; border-radius: 6px; }
figcaption { font-size: 11px; } small { color: #e2dcc8; }
img { display: block; }
</style>
${sections.join('\n')}`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out}`);
