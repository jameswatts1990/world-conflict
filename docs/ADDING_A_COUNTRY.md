# Adding a country

How to add a nation, using **Hungary** as the worked example (it was added this way). Adding a country is
mostly data: one row per province, the borders between them, and one line for the nation. Two things supply
everything else:

- its **power tier** (great, major or minor) sets its output, treasury, starting buildings and army, objective
  values and size;
- its **bloc** sets its equipment, formation names and the look of its units.

## Power tiers

A tier (`src/sim/config/powers.ts`) is the template every nation of that size shares. Province rows only say
which province is the capital, the industrial heartland and so on. The generator (`src/sim/scenario/build.ts`)
does the rest: it scales output to the tier's totals, assigns objective VP and the capital's size, and places
the starting buildings and army.

| Tier | Playable | Output per minute (money / materials / manpower) | Starting army | Objective VP | Capital | Provinces |
| --- | --- | --- | --- | --- | --- | --- |
| `great` | Yes | 260 / 140 / 70 | 13: capital 3 INF + 1 ART, heartland 2 INF + 1 ART, field 5 INF + 1 CAV | Capital 3, heartland 2 | Metropolis | 6–9 |
| `major` | Yes | 150 / 80 / 40 | 8: capital 2 INF + 1 ART, heartland 2 INF, field 2 INF + 1 CAV | Capital 2, heartland 1 | Large City | 3–5 |
| `minor` | No: always computer-controlled, never wins | 70 / 35 / 20 | 6: capital 5 INF, field 1 INF | Capital 1 | City, fortifications 2 | 1–2 |

Major powers spend the same share of income on army upkeep at the start as a great power (about a sixth); minor
powers spend about a quarter. Europe has seven great powers, two major powers (Romania and Serbia) and ten minor
powers. Minor powers are real nations: they have an economy, research, recruit, defend themselves and make peace,
and the AI plays them. They never start a war and never win (only great and major powers count for victory), and
players can't pick them on the nation picker. They are there to be conquered at a price: the AI keeps a garrison of
seven or eight behind the capital's forts (`unitsFlat` in `config/ai.ts`), so an eight-unit probe fails and taking
one costs twelve to fourteen units with artillery about half their strength. A row's own `buildings` replace the
tier's: Switzerland's says `fortifications: 3`.

**Field units** go where the province rows put them (`garrison`). If a nation's rows place none, they are dealt
out one at a time over its border provinces first, then its other provinces, then its capital. The original six
place theirs by hand; Hungary leaves its own to the generator, which happens to pick the same provinces.

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
its hussars) and one formation name, and takes the rest from `central`. A new country can override nothing, as
Romania and Serbia do.

Two nations in one bloc still look different on the map: army counters keep the owner's colour, the 3D army
models fly the nation's flag, and the bloc insignia on their units is drawn in the nation's own colour.

Blocs are about equipment, not alliances: two `central` nations can fight each other. Adding a bloc means one
entry in `BLOCS` and `BLOC_IDS` and one look in the art tables. TypeScript flags every table that is missing it.

## Checklist

Required steps are marked ★. Everything else has a fallback.

### 1. Map shapes ★ — `scripts/map/province-sources.mjs`

Group the country's Natural Earth admin-1 units into provinces, as many as its tier allows. Inspect what the
source data offers first:

```bash
npm run map:fetch    # once; downloads ~40 MB into data-src/ (not committed)
node -e 'const j=JSON.parse(require("fs").readFileSync("data-src/ne_10m_admin_1_states_provinces.geojson","utf8"));
  for (const f of j.features) if (f.properties.adm0_a3==="HUN") console.log(f.properties.name, "|", f.properties.region)'
```

Hungary's units carry a `region` (its seven statistical regions), so each rule is one line. Where the units have
no useful region (Romania's counties, Serbia's districts), list them by `names`. A one-province minor power takes
its whole country:

```js
{ id: 'hu-west', country: 'HUN', regions: ['Western Transdanubia', 'Central Transdanubia'] },
{ id: 'ro-moldavia', country: 'ROU', names: ['Bacau', 'Botosani', 'Iasi', 'Neamt', 'Suceava', 'Vaslui'] },
{ id: 'si-ljubljana', country: 'SVN', whole: true },   // a one-province minor power
```

Then `npm run map:build`. It fails if a rule matches nothing, and it tags every province with its country so the
UI knows which countries the theatre covers. No list needs updating by hand. Its second step
(`scripts/map/city-provinces.ts`, which runs on the committed `scripts/map/base.topo.json` without the raw data)
cuts each row's city out of its region, divides the rest into the lands round it and writes
`src/sim/scenario/europe/land.ts` (with the links between all provinces); it needs the rows (step 2) and their
connections (step 3), so run it again once they are in. With `--hints` it prints what each land holds (its admin
units, towns and neighbours), to name it.

**Province size.** Aim for principal cities at least about 100 km apart. Hungary first had seven provinces, but
Budapest, Székesfehérvár and Győr sit 60–110 km apart, so their army counters piled onto each other at the
opening zoom. Merging two regions fixed it. The tiers' province ranges keep small countries small.

### 2. Province rows ★ — `src/sim/scenario/europe/provinces.ts`

One row per region: name, terrain, role, principal city with coordinates, population, two to five towns, a name
for each land round the city, and optionally `oil`. Each row becomes a city, drawn tight round it and keyed by the
row's id, and two or more lands all round it, keyed by compass point from the city (`<id>-<point>`, such as
`be-brussels-w`) as the generator divides the region (step 1): name each in `lands: { w: { name, article } }`, for
the country it covers (its `--hints` list the admin units and towns in it). A row whose division changes gets new
keys, and the scenario refuses a row whose names do not match its lands. `landTerrain` sets the lands' terrain
where the row's would not do (never urban: round a capital it is the plain or hills it stands in). The role is
`capital`, `industrial`, `city` or `town`; every nation needs exactly one
`capital`, and great and major powers one `industrial` heartland. Roles only set relative weights: output is
scaled to the tier's totals, and objective VP and the capital's size come from the tier, so rows don't set them.

Optional fields: `recruiting: true` for a great power's second recruiting city, `garrison` to place field units
by hand, `buildings` for extras such as fortifications. Neutral states (`core: null`, none in Europe now) use `garrison`, `buildings` and `vp`
directly.

### 3. Connections ★ — `src/sim/scenario/europe/connections.ts`

Internal links, plus links to whatever the country borders in the theatre: `land`, `mountain` (with a pass
name), or `strait` for sea crossings. They are written between rows; the generator turns them into links between
provinces (every two lands of the rows that share a border; for a strait, the two lands with the nearest coasts),
and links the lands within a row and every city to the lands that touch it automatically. An island of a row that
is a land of its own needs its crossing named in `CROSSINGS`. Every pair of regions that share a border needs a
land or mountain connection, and every land or mountain connection a shared border; the generator refuses a map
without, and a scenario test checks every link. While you work, list what is missing:

```bash
npx vite-node scripts/map/check-borders.ts ro rs   # only pairs involving these countries
```

Give a border its real character: Romania's Banat meets southern Serbia along the Danube gorge at the Iron Gates,
so that link is a `mountain` pass, not open `land`.

### 4. The nation ★ — `src/sim/scenario/europe/nations.ts`

```ts
{
  id: 'hu', name: 'Hungary', adjective: 'Hungarian', color: '#b0476d', capital: 'hu-budapest', power: 'great', bloc: 'central',
  trait: 'Danube crossroads',                                    // optional; the menu shows the bloc name without it
  blurb: 'The heart of the Danube basin. Six neighbours and none of them a great power: room to grow, and a front on every side.', // optional
},
```

A minor power needs only the first line. Pick a colour that stands apart from the neighbours'.

That is the whole of the required work: the starting setup is generated (`setup.ts` holds no per-country data).

### 5. Optional flavour

| What | Where | Fallback |
| --- | --- | --- |
| Flag | `STRIPED` in `src/ui/flags.tsx` for striped flags (one line: `hu: { dir: 'h', colors: [red, white, green] }`), `FLAGS` for others | Plain neutral flag; the 3D army models fly one in the nation's colour |
| Own designs or formation names | `IDENTITIES` in `scenario/europe/identity.ts` (partial) | The bloc's |
| National speciality | `SPECIALITIES` in the same file | None; Diplomacy shows the tier |
| Field unit placement | `garrison` on the rows | Border provinces first |
| Capital landmark | `NATIONAL_LANDMARKS` in `src/ui/art/CityModel.ts`, `landmarkFor` in `CitySkyline.tsx` | A cathedral on the map; the skyline picks one from the province id |
| A look of its own | `NATIONAL_STYLES` and the tables in `src/ui/art/` | The bloc's look |

### 6. Check it

```bash
npm run typecheck && npm test   # scenario tests check shapes, towns, connectivity, the tier template and names
npm run build:e2e && npm run e2e && npm run e2e:mobile
node scripts/dev/screens.mjs e2e-output/screens hu map zoom:1   # look at the new country
npx vite-node scripts/art/contact-sheet.tsx out.html --nations central   # the bloc's art, if you added a bloc
npm run balance -- --vs main   # 200 campaigns each, before and after: how the newcomer and its neighbours fare
```

The balance run ([BALANCE.md](BALANCE.md)) is the check the tests cannot make: whether the newcomer survives and wins
about as often as the other nations of its tier, and what it does to its neighbours. It needs no changes for a new
country: nations, tiers and content all come from the scenario.

The scenario tests cover any number of nations. They check that every province has a shape, that every town lies
inside its own province (coastal and riverside towns sometimes need nudging a few kilometres inland onto the
simplified shapes), that every shared border has a link, that the movement graph is connected and every city stands
among two or more lands, that every nation
matches its tier (output, starting army, objective VP, capital size, province count), and that every unit has a
name.

**Saves made before the country existed still load.** `joinNewcomers` (in `src/sim/save.ts`) adds it as it
would start a new campaign: AI-controlled, at peace, at 1914 technology. Only a save from a redrawn map is
refused (provinces that no longer exist, or a new country carved out of land the save already holds).

## At scale: what to streamline next

Blocs removed the per-country art and names; power tiers removed the per-country balance numbers and starting
setup. What remains per country is its province rows, its connections and one nation line. The next bottlenecks:

1. **Seeded connections.** `build-map.mjs` could emit the land borders it already knows, leaving only mountain
   passes and straits to curate by hand.
2. **Province rows from data.** Natural Earth's populated places could propose cities, towns and populations to
   review instead of typing them.
3. **The map frame.** The projection fits the theatre's bounds. Adding Scandinavia or Russia changes the map's
   scale, and counter sizes and zoom thresholds would need retuning. A true world map needs a different camera.
4. **The nation picker and Diplomacy.** A two-column card list and one diplomacy row per nation suit a dozen
   or two; beyond that, picking on the map and grouping minor powers work better.
5. **Speed.** Each AI looks over every province and army every 8 seconds, so simulation cost grows with nations
   times map size. Fine at normal speed for a few dozen nations; fast-forward and headless balance runs will
   need attention before a whole-world map.
