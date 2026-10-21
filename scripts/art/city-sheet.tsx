// Contact sheet for the city art: skylines in every state plus all icons.
//
//   npx vite-node scripts/art/city-sheet.tsx /tmp/city-art/city-sheet.html
//   node scripts/art/screenshot.mjs /tmp/city-art/city-sheet.html /tmp/city-art/city-sheet.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CitySkyline } from '../../src/ui/art/CitySkyline';
import type { ArtBuilding, ArtTerrain, CitySkylineProps } from '../../src/ui/art/CitySkyline';
import { BUILDING_CATEGORY, BuildingGlyph, BuildingTile } from '../../src/ui/art/BuildingIcons';
import { BranchIcon } from '../../src/ui/art/BranchIcons';
import type { ResearchBranch } from '../../src/ui/art/BranchIcons';

const out = resolve(process.argv[2] ?? '/tmp/city-art/city-sheet.html');

const ALL: ArtBuilding[] = [
  'industry', 'market', 'powerPlant', 'refinery', 'housing', 'university', 'barracks', 'academy', 'armsWorks',
  'motorPool', 'tankWorks', 'hospital', 'propaganda', 'garrisonHq', 'fortifications', 'supplyDepot', 'railway',
  'coastalBattery',
];
const MAX_LEVEL: Record<ArtBuilding, number> = {
  industry: 3, market: 3, powerPlant: 2, refinery: 2, housing: 3, university: 2, barracks: 3, academy: 2,
  armsWorks: 3, motorPool: 2, tankWorks: 2, hospital: 2, propaganda: 2, garrisonHq: 2, fortifications: 3,
  supplyDepot: 2, railway: 3, coastalBattery: 2,
};
const TERRAINS: ArtTerrain[] = ['plains', 'forest', 'hills', 'mountains', 'urban', 'marsh'];
const BRANCHES: ResearchBranch[] = ['infantry', 'artillery', 'armour', 'industry', 'logistics', 'society'];
const NATIONS: Record<string, string> = {
  uk: '#c4553f', fr: '#3f6fc4', de: '#5f6b75', it: '#3b9a58', es: '#d39b1c', pl: '#8d5bb4',
};

const everything = (lv: number): Partial<Record<ArtBuilding, number>> => Object.fromEntries(ALL.map((b) => [b, lv]));

function Card({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="card">
      {children}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function Sky(props: CitySkylineProps & { caption: string }) {
  const { caption, ...rest } = props;
  return <Card caption={caption}><CitySkyline {...rest} /></Card>;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id}>
      <h2>{title}</h2>
      <div className="grid">{children}</div>
    </section>
  );
}

const growth: { tier: 1 | 2 | 3 | 4 | 5; b: Partial<Record<ArtBuilding, number>>; note: string }[] = [
  { tier: 1, b: {}, note: 'Town, nothing built' },
  { tier: 2, b: { industry: 1, market: 1, barracks: 1 }, note: 'City: industry, market, barracks' },
  {
    tier: 3,
    b: { industry: 2, market: 1, barracks: 1, housing: 2, railway: 1, university: 1, hospital: 1, supplyDepot: 1 },
    note: 'Large City: + housing 2, railway, university, hospital, depot',
  },
  {
    tier: 4,
    b: {
      industry: 3, market: 2, barracks: 2, housing: 3, railway: 2, university: 2, hospital: 1, supplyDepot: 1,
      powerPlant: 1, refinery: 1, armsWorks: 1, motorPool: 1, propaganda: 1, academy: 1, fortifications: 1,
    },
    note: 'Metropolis: + power, refinery, arms, motor pool, radio, academy, forts',
  },
  { tier: 5, b: everything(3), note: 'World City: everything at level 3' },
];

function Sheet() {
  return (
    <main>
      <h1>World Conflict: city skyline contact sheet</h1>

      <Section id="growth" title="Growth: uk-north, tier 1 to 5">
        {growth.map((g) => (
          <Sky key={g.tier} caption={`T${g.tier} ${g.note}`} seed="uk-north" tier={g.tier} buildings={g.b}
            terrain="hills" nationColor={NATIONS.uk} />
        ))}
        <Sky caption="T5 everything, coastal" seed="uk-north" tier={5} buildings={everything(3)} terrain="hills" coastal nationColor={NATIONS.uk} />
      </Section>

      <Section id="growth2" title="Growth: de-ruhr (plains), tier 1 to 5, no buildings">
        {([1, 2, 3, 4, 5] as const).map((t) => (
          <Sky key={t} caption={`T${t}, empty`} seed="de-ruhr" tier={t} buildings={{}} terrain="plains" nationColor={NATIONS.de} />
        ))}
        <Sky caption="T2 at 260 px" seed="de-ruhr" tier={2} buildings={{ industry: 1, barracks: 1 }} terrain="plains" nationColor={NATIONS.de} width={260} />
      </Section>

      <Section id="terrain" title="Terrain (tier 3, a few buildings)">
        {TERRAINS.map((t, i) => (
          <Sky key={t} caption={t} seed={`fr-${t}`} tier={3} terrain={t}
            buildings={{ industry: 1, market: 1, housing: 1, barracks: i % 2 ? 1 : 0 }} nationColor={NATIONS.fr} coastal={t === 'marsh'} />
        ))}
      </Section>

      <Section id="buildings" title="Every building alone in a tier-3 city: level 1 (left) and level 3 (right)">
        {ALL.flatMap((b) => [1, 3].map((lv) => (
          <Sky key={`${b}${lv}`} caption={`${b} L${lv}`} seed="it-north" tier={3} terrain="plains" buildings={{ [b]: lv }}
            nationColor={NATIONS.it} coastal={b === 'coastalBattery'} />
        )))}
      </Section>

      <Section id="capitals" title="Capitals">
        <Sky caption="uk-london T5 capital (parliament)" seed="uk-london" tier={5} capital terrain="urban" coastal
          buildings={{ industry: 2, market: 3, university: 2, hospital: 1, railway: 2, propaganda: 1 }} nationColor={NATIONS.uk} />
        <Sky caption="fr-paris T5 capital (dome)" seed="fr-paris" tier={5} capital terrain="plains"
          buildings={{ market: 3, university: 2, housing: 2, railway: 3, academy: 2 }} nationColor={NATIONS.fr} />
        <Sky caption="de-berlin T4 capital (cathedral)" seed="de-berlin" tier={4} capital terrain="plains"
          buildings={{ industry: 2, garrisonHq: 1, barracks: 2, railway: 2, motorPool: 2 }} nationColor={NATIONS.de} />
        <Sky caption="pl-warsaw T3 capital" seed="pl-warsaw" tier={3} capital terrain="marsh"
          buildings={{ barracks: 1, fortifications: 2 }} nationColor={NATIONS.pl} />
        <Sky caption="it-rome T4 capital" seed="it-rome" tier={4} capital terrain="hills"
          buildings={{ market: 2, university: 1, propaganda: 2 }} nationColor={NATIONS.it} />
        <Sky caption="es-madrid T4 capital, neutral colour" seed="es-madrid" tier={4} capital terrain="mountains"
          buildings={{ industry: 1, hospital: 2 }} />
      </Section>

      <Section id="states" title="Construction and battle">
        <Sky caption="building industry (new)" seed="uk-mid" tier={3} terrain="hills" construction="industry"
          buildings={{ market: 1, barracks: 1 }} nationColor={NATIONS.uk} />
        <Sky caption="upgrading housing (L1 to L2)" seed="uk-mid" tier={3} terrain="hills" construction="housing"
          buildings={{ market: 1, barracks: 1, housing: 1 }} nationColor={NATIONS.uk} />
        <Sky caption="building fortifications" seed="fr-east" tier={2} terrain="forest" construction="fortifications"
          buildings={{ barracks: 1 }} nationColor={NATIONS.fr} />
        <Sky caption="building railway" seed="es-north" tier={2} terrain="mountains" construction="railway"
          buildings={{ market: 1 }} nationColor={NATIONS.es} />
        <Sky caption="building coastal battery" seed="it-south" tier={2} terrain="hills" coastal construction="coastalBattery"
          buildings={{ market: 1 }} nationColor={NATIONS.it} />
        <Sky caption="battle, fortified T3" seed="pl-east" tier={3} terrain="plains" battle
          buildings={{ fortifications: 3, barracks: 2, garrisonHq: 1, supplyDepot: 1 }} nationColor={NATIONS.pl} />
        <Sky caption="battle, T5 everything" seed="de-ruhr" tier={5} terrain="urban" battle buildings={everything(2)} nationColor={NATIONS.de} />
        <Sky caption="battle, T1 town" seed="fr-south" tier={1} terrain="hills" battle buildings={{ barracks: 1 }} nationColor={NATIONS.fr} />
      </Section>

      <section id="icons">
        <h2>Building glyphs, tiles and branch icons</h2>
        {[16, 32].map((s) => (
          <div key={s} className="iconrow">
            <span className="lbl">glyph {s}px</span>
            {ALL.map((b) => <span key={b} className="ic" title={b}><BuildingGlyph kind={b} size={s} /></span>)}
          </div>
        ))}
        {[16, 32, 44].map((s) => (
          <div key={s} className="iconrow">
            <span className="lbl">tile {s}px</span>
            {ALL.map((b, i) => (
              <span key={b} className="tile" title={`${b} ${BUILDING_CATEGORY[b]}`}>
                <BuildingTile kind={b} level={i % 4 === 3 ? 0 : 1 + (i % MAX_LEVEL[b])} maxLevel={MAX_LEVEL[b]} size={s} />
              </span>
            ))}
          </div>
        ))}
        {[16, 32].map((s) => (
          <div key={s} className="iconrow">
            <span className="lbl">branch {s}px</span>
            {BRANCHES.map((b) => <span key={b} className="ic" title={b}><BranchIcon branch={b} size={s} /></span>)}
          </div>
        ))}
        <div className="iconrow names">
          <span className="lbl">order</span>
          {ALL.map((b) => <span key={b} className="nm">{b}</span>)}
        </div>
      </section>
    </main>
  );
}

const css = `
  body { margin: 0; background: #171b20; color: #e6e2d8; font: 12px/1.4 system-ui, sans-serif; }
  main { padding: 16px; width: 1040px; }
  h1 { font-size: 16px; color: #d6b25e; margin: 0 0 12px; }
  h2 { font-size: 13px; color: #d6b25e; margin: 18px 0 8px; font-weight: 600; }
  section { background: #20262d; border: 1px solid #36404b; border-radius: 6px; padding: 8px 12px 12px; margin-bottom: 12px; }
  .grid { display: flex; flex-wrap: wrap; gap: 10px; }
  .card { margin: 0; background: #20262d; }
  .card svg { border-radius: 4px; border: 1px solid #36404b; }
  figcaption { color: #9aa3ad; font-size: 11px; margin-top: 3px; max-width: 320px; }
  .iconrow { display: flex; align-items: center; gap: 8px; margin: 8px 0; color: #e6e2d8; }
  .lbl { width: 80px; color: #9aa3ad; font-size: 11px; flex: none; }
  .ic { display: inline-flex; width: 40px; justify-content: center; }
  .tile { display: inline-flex; width: 48px; justify-content: center; }
  .names .nm { width: 48px; font-size: 8px; color: #9aa3ad; overflow: hidden; text-align: center; }
`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>City art sheet</title><style>${css}</style></head>`
  + `<body>${renderToStaticMarkup(<Sheet />)}</body></html>`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
