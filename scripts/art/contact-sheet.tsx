// Renders every unit type x generation x nation in both art variants to a
// static HTML contact sheet, on a dark and a parchment background.
//
//   npx vite-node scripts/art/contact-sheet.tsx <out.html> [--types infantry,tank] [--nations uk,de]
//     [--bg dark|light|both] [--size 128] [--icon-size 120] [--icons-only]
//
// View it in a browser, or screenshot it with scripts/art/screenshot.mjs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { NationInsignia } from '../../src/ui/art/Insignia';
import { embedUnitAssetImages } from './embed-unit-assets';
import {
  ART_GENS,
  ART_NATIONS,
  ART_UNIT_TYPES,
  UnitArt,
  resolveArtGen,
  type ArtNation,
  type ArtUnitType,
} from '../../src/ui/art/UnitArt';

const BACKGROUNDS = {
  dark: { bg: '#2a2f36', fg: '#d8dde3', sub: '#8d96a1', cell: '#313741' },
  light: { bg: '#e8dcc0', fg: '#3a3226', sub: '#7d705a', cell: '#e1d3b3' },
} as const;
type BgKey = keyof typeof BACKGROUNDS;

function parseArgs(argv: string[]) {
  const args = argv.slice(2).filter((a) => !a.endsWith('contact-sheet.tsx'));
  let out = '';
  let types: ArtUnitType[] = [...ART_UNIT_TYPES];
  let nations: ArtNation[] = [...ART_NATIONS];
  let bgs: BgKey[] = ['dark', 'light'];
  let size = 128;
  let iconSize = 0;
  let iconsOnly = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--types') types = args[++i].split(',') as ArtUnitType[];
    else if (a === '--nations') nations = args[++i].split(',') as ArtNation[];
    else if (a === '--bg') {
      const v = args[++i];
      bgs = v === 'both' ? ['dark', 'light'] : [v as BgKey];
    } else if (a === '--size') size = Number(args[++i]);
    else if (a === '--icon-size') iconSize = Number(args[++i]);
    else if (a === '--icons-only') iconsOnly = true;
    else if (!a.startsWith('--')) out = a;
  }
  if (!out) {
    console.error('usage: vite-node scripts/art/contact-sheet.tsx <out.html> [--types a,b] [--nations a,b] [--bg dark|light|both] [--size px]');
    process.exit(1);
  }
  return { out, types, nations, bgs, size, iconSize, iconsOnly };
}

interface SheetProps {
  types: ArtUnitType[];
  nations: ArtNation[];
  bgs: BgKey[];
  size: number;
  /** Extra enlarged icon per cell (0 = none), for inspecting icon detail. */
  iconSize: number;
  iconsOnly: boolean;
}

function Sheet({ types, nations, bgs, size, iconSize, iconsOnly }: SheetProps) {
  return (
    <>
      {bgs.map((bgKey) => {
        const c = BACKGROUNDS[bgKey];
        return (
          <div key={bgKey} className="bg" style={{ background: c.bg, color: c.fg }}>
            <h1>
              Unit art contact sheet <small style={{ color: c.sub }}>({bgKey} background {c.bg})</small>
            </h1>
            <div className="insignia">
              {ART_NATIONS.map((n) => (
                <span key={n}>
                  <NationInsignia nation={n} size={24} />
                  <NationInsignia nation={n} size={14} />
                  {n}
                </span>
              ))}
            </div>
            {types.map((type) => (
              <section key={type} data-shot={`${bgKey}-${type}`} style={{ background: c.bg }}>
                <h2>{type}</h2>
                <table>
                  <thead>
                    <tr>
                      <th />
                      {nations.map((n) => (
                        <th key={n} style={{ color: c.sub }}>
                          {n}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ART_GENS.map((gen) => {
                      const drawn = resolveArtGen(type, gen);
                      return (
                        <tr key={gen}>
                          <th style={{ color: c.sub }}>
                            {gen}
                            {drawn !== gen && <div className="fallback">→ {drawn}</div>}
                          </th>
                          {nations.map((nation) => (
                            <td key={nation} style={{ background: c.cell }}>
                              {!iconsOnly && <UnitArt type={type} gen={gen} nation={nation} width={size} title={`${nation} ${type} ${gen}`} />}
                              {iconSize > 0 && <UnitArt type={type} gen={gen} nation={nation} variant="icon" width={iconSize} />}
                              <div className="icons">
                                <UnitArt type={type} gen={gen} nation={nation} variant="icon" width={40} />
                                <UnitArt type={type} gen={gen} nation={nation} variant="icon" width={26} />
                                <span style={{ color: c.sub }}>
                                  {nation} {gen}
                                </span>
                              </div>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        );
      })}
    </>
  );
}

const opts = parseArgs(process.argv);
const { out, types, bgs } = opts;
// Standalone sheets must also work over file://, without a Vite asset server.
const body = embedUnitAssetImages(renderToStaticMarkup(<Sheet {...opts} />));
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Unit art contact sheet</title>
<style>
  body { margin: 0; font: 12px/1.3 system-ui, sans-serif; }
  .bg { padding: 12px 16px 24px; }
  h1 { font-size: 16px; margin: 4px 0 8px; }
  h2 { font-size: 14px; margin: 0 0 4px; padding-top: 8px; text-transform: none; }
  section { padding: 2px 4px 8px; }
  .insignia { display: flex; gap: 14px; align-items: center; margin-bottom: 8px; }
  .insignia span { display: inline-flex; gap: 4px; align-items: center; }
  table { border-collapse: separate; border-spacing: 4px; }
  th { font-weight: 600; font-size: 11px; text-align: left; vertical-align: middle; }
  td { padding: 4px; border-radius: 6px; vertical-align: top; }
  td > svg { display: block; }
  .icons { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
  .icons span { font-size: 10px; margin-left: auto; }
  .fallback { font-weight: 400; font-size: 10px; }
</style>
</head>
<body>${body}</body>
</html>
`;
const target = resolve(out);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, html);
console.log(`wrote ${target} (${(html.length / 1024).toFixed(0)} KB, ${types.length} types, ${bgs.join('+')})`);
