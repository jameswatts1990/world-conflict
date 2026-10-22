# Adding a country

How to add a playable nation, using **Hungary** as the worked example (it was added this way). Most of the work
is data. Equipment, formation names and unit art come from the nation's **bloc**, so a new country needs no art
and no unit names.

## Blocs: shared armies

A bloc is an equipment family: who armed whom between 1914 and 1942. Each bloc (`src/sim/blocs.ts`) supplies a
complete identity: a named design for every unit type and generation, and formation and army name templates.
The UI gives each bloc a look of its own: uniform and vehicle colours, headgear, horse and pennant, and an insignia.

| Bloc | Pattern | Designs (examples) | Look |
| --- | --- | --- | --- |
| `western` | French and British equipment as exported across Europe | Renault FT, Vickers 6-ton, Canon de 75, R35 | Khaki, Adrian helmets, roundel |
| `central` | Central Powers equipment and its heirs | A7V, Škoda guns, Panzer 38(t), Panzer IV | Pike grey, then field grey; cross |
| `eastern` | Russian and Soviet equipment | Mark V, T-26, BT-7, T-34, KV-1 | Russian khaki, budenovka, star |

A nation names its bloc and overrides only what it wants to make its own. The original six override almost
everything (their identities are unchanged). Hungary overrides six designs (Toldi, Turán, Zrínyi, Csaba, Tas and
its hussars) and one formation name, and takes the rest from `central`. A new country can override nothing.

Two nations in one bloc still look different on the map: counters are rimmed in the owner's colour, and the bloc
insignia on their units is drawn in the nation's own colour.

Blocs are about equipment, not alliances: two `central` nations can fight each other. Adding a bloc means one
entry in `BLOCS` and `BLOC_IDS` and one look in the art tables. TypeScript flags every table that is missing it.

## Checklist

Required steps are marked ★. Everything else has a fallback.

### 1. Map shapes ★ — `scripts/map/province-sources.mjs`

Group the country's Natural Earth admin-1 units into provinces. Inspect what the source data offers first:

```bash
npm run map:fetch    # once; downloads ~40 MB into data-src/ (not committed)
node -e 'const j=require("./data-src/ne_10m_admin_1_states_provinces.geojson");
  for (const f of j.features) if (f.properties.adm0_a3==="HUN") console.log(f.properties.name, "|", f.properties.region)'
```

Hungary's units carry a `region` (its seven statistical regions), so each rule is one line:

```js
{ id: 'hu-west', country: 'HUN', regions: ['Western Transdanubia', 'Central Transdanubia'] },
```

Then `npm run map:build`. It fails if a rule matches nothing, and it tags every province with its country so the
UI knows which countries the theatre covers. No list needs updating by hand.

**Province size.** Aim for principal cities at least about 100 km apart. Hungary first had seven provinces, but
Budapest, Székesfehérvár and Győr sit 60–110 km apart, so their army counters piled onto each other at the
opening zoom. Merging two regions fixed it. Small countries need fewer provinces (see *At scale* below).

### 2. Province data ★ — `src/sim/scenario/europe/provinces.ts`

One row per province: name, terrain, tier (`capital`, `industrial`, `major`, `town`), principal city with
coordinates, population, two to five towns, and optionally `oil` or `vp`. Output is normalised per nation, so
tiers only set relative weights. To keep the balance template every nation needs exactly one `capital` (3 VP),
one `industrial` heartland (2 VP) and one `oil` province.

### 3. Connections ★ — `src/sim/scenario/europe/connections.ts`

Internal links, plus links to whatever the country borders in the theatre: `land`, `mountain` (with a pass
name), or `strait` for sea crossings. Hungary's only theatre neighbour is Austria. Its other neighbours
(Slovakia, Romania, Serbia, Croatia, Slovenia) are not in the game yet, so Budapest's only road out runs
through Vienna.

### 4. The nation ★ — `src/sim/scenario/europe/nations.ts`

```ts
{
  id: 'hu', name: 'Hungary', adjective: 'Hungarian', color: '#b0476d', capital: 'hu-budapest', bloc: 'central',
  trait: 'One gateway',                                          // optional; the menu shows the bloc name without it
  blurb: 'Landlocked behind Austria. The only road out runs through Vienna, and it is the only road in.', // optional
},
```

Pick a colour that stands apart from the neighbours'.

### 5. Starting setup ★ — `src/sim/scenario/europe/setup.ts`

Add the capital, heartland and second recruiting city to the three building lists, and place the standard
13-unit army (capital 3 INF + 1 ART, heartland 2 INF + 1 ART, then 5 INF and 1 cavalry on the frontier).

### 6. Optional flavour

| What | Where | Fallback |
| --- | --- | --- |
| Flag | `src/ui/flags.tsx` (often one line: `hu: h3(red, white, green)`) | Plain neutral flag |
| Own designs or formation names | `IDENTITIES` in `scenario/europe/identity.ts` (partial) | The bloc's |
| National speciality | `SPECIALITIES` in the same file | None; Diplomacy shows the bloc |
| Capital landmark | `NATIONAL_LANDMARKS` in `src/ui/art/CityModel.ts`, `landmarkFor` in `CitySkyline.tsx` | A cathedral on the map; the skyline picks one from the province id |
| A look of its own | `NATIONAL_STYLES` and the tables in `src/ui/art/` | The bloc's look |

### 7. Check it

```bash
npm run typecheck && npm test   # scenario tests check shapes, towns, connectivity, balance and names
npm run build && npm run e2e && npm run e2e:mobile
node scripts/dev/screens.mjs e2e-output/screens hu map zoom:1   # look at the new country
npx vite-node scripts/art/contact-sheet.tsx out.html --nations central   # the bloc's art, if you added a bloc
```

The scenario tests cover any number of nations. They check that every province has a shape, that no town falls
outside the theatre, that the movement graph is connected, that output and the starting army match the template,
and that every unit has a name.

**Saves made before the country existed still load.** `joinNewcomers` (in `src/sim/save.ts`) adds it as it
would start a new campaign: AI-controlled, at peace, at 1914 technology. Only a save holding provinces that no
longer exist (for example after redrawing an existing country) is refused.

## At scale: what to streamline next

Blocs remove the biggest per-country cost: before them, each country needed about 40 named designs, 14
formation templates and new art. What remains is about 50 lines of data per country (Hungary's: mostly
province rows and connections). To add every country,
these are the next bottlenecks, roughly in order:

1. **Power tiers.** Every nation now gets the same output, army and VP. For about 190 countries, add a tier
   (great, major, minor) that scales output targets, the starting template and province count. A minor country
   would have one or two provinces and no speciality. This is also the real fix for province size.
2. **Generated starting setup.** Starting buildings and armies follow the template, so they could be derived from
   the province tiers and the frontier instead of listed by hand.
3. **Seeded connections.** `build-map.mjs` could emit the land borders it already knows, leaving only mountain
   passes and straits to curate by hand.
4. **Province rows from data.** Natural Earth's populated places could propose cities, towns and populations to
   review instead of typing them.
5. **The map frame.** The projection fits the theatre's bounds. Adding Scandinavia or Russia changes the map's
   scale, and counter sizes and zoom thresholds would need retuning. A true world map needs a different camera.
6. **The nation picker.** A two-column card list suits a dozen nations; beyond that, picking on the map works
   better.
