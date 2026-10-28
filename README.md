# World Conflict

A browser-based, real-time global strategy game. Seven great powers, six major powers and nineteen minor powers on
recognisable Earth geography start with Great War technology and research their way towards the Second World War.
The current build is a local single-player campaign on the **European theatre** at **Standard** speed (target ~2–3
hours).

What is in it (Milestone 2, Depth):

- **13 unit types** in four classes with 1914, interwar and 1940 equipment, with **named designs** and art
  (Poilus, Alpini, Ułani; Mark IV, Renault FT, A7V, 7TP …), numbered formations, veterancy, and one **national
  speciality**. Each nation belongs to an equipment **bloc** (Western, Central or Eastern) that supplies its
  designs, formation names and unit art; the original six override nearly all of it with their own, Hungary a
  few signature designs.
- **Hungary**, the first nation added through the bloc system: six provinces in the Danube basin, Central-pattern
  equipment, its own hussars and Toldi, Turán and Zrínyi armour.
- **Romania and Serbia**, the first major powers (playable, five and three provinces, Western-pattern equipment),
  with Slovakia, Slovenia and Croatia as minor powers: Hungary now has a neighbour on every side.
- **Bulgaria and Greece**, playable major powers with five regions each and the Na nozh! and Evzone specialities,
  plus Bosnia & Herzegovina, Montenegro, Albania and North Macedonia as minor powers. Kosovo belongs to southern Serbia.
- **Ireland**, a two-province minor power (Dublin and Cork): Britain's one land border, in Ulster, with the Irish
  Sea crossing from Dublin to Wales.
- **Ukraine and Belarus**, playable major powers with five and four regions, Eastern-pattern equipment,
  Cossack cavalry and the Brest Fortress speciality. Crimea and Sevastopol belong to Ukraine; Moldova and the three
  Baltic states are minor powers. Russia, including Kaliningrad, remains outside the theatre.
- **Power tiers** for adding countries: great, major and minor powers (minor ones always computer-controlled)
  get output, starting armies, objectives and size from their tier, so a new country is province rows,
  connections and one line.
- **Nineteen minor powers** (Belgium & Luxembourg, the Netherlands, Denmark, Switzerland, Austria, Czechia, Portugal,
  Slovakia, Slovenia, Croatia, Bosnia & Herzegovina, Montenegro, Albania, North Macedonia, Ireland, Moldova,
  Lithuania, Latvia and Estonia): one- or two-region nations run by the computer. They recruit, research, defend
  themselves and make peace, but never start a war and never win. Each holds a fortified capital with a garrison of
  six to eight divisions: an eight-unit probe fails, and taking one takes twelve to fourteen units with artillery
  and costs them 40–60% of their strength.
- **Morale** for units (low morale blunts firepower; armies fight to the death unless ordered out, and a
  withdrawal under fire costs strength), provinces (drives output; conquests integrate over time) and nations (a
  confident nation fights harder on its home soil).
- **Cities** that grow through five tiers with building slots and 18 buildings. Zoomed in, each city on the map is a
  web of streets with a small 3D model of everything it holds standing on it (barracks, factories, a tank works, empty
  plots for free slots), and seaside cities have a port on the coast; the city view adds a skyline.
- **3D armies**: supplied SINNON models cover all thirteen unit types, rendered into sixteen map directions and
  portraits. Models are shared across eras for now; flags and ownership rings identify nations. See
  [Adding unit art](docs/ADDING_UNIT_ART.md) for the import pipeline and future era variants.
  Zoomed in, every army is a small 3D model of its main unit (a squad under its flag, horsemen, guns,
  lorries, tanks) under its nation's flag. Armies gather around their city, march along the roads
  facing the way they go, and cross the sea in troopships.
- A **60-technology research tree** across four eras with slots, a queue and a classic tree view.
- **Fog of war**: you see your own land, wherever your armies stand, and one province around them (cavalry and
  armoured cars see two). Beyond that the map lies under haze and drifting cloud, and its armies, battles, sieges,
  buildings and morale are hidden. Powers fighting a common enemy are **co-belligerents** (not allies: there are no
  treaties): research **Liaison Officers** and you also see everything they see. The computer opponents play under the
  same fog.
- A **map that reads at a glance**: natural relief under light national colours, every province (cities too) with
  jagged, natural borders, roads that run from each province's centre to its neighbours' and never through a third,
  your own land lit up inside a glowing white outline, each power's colour along the inside of its border, and the
  **front** (your border with a power at war with you) in red. Zoom in up to 20× the overview of Europe: cities and armies grow as you zoom in,
  but more slowly than the map, so a crowded front spreads out, and close-up terrain is baked on demand so the relief stays sharp.
- **Computer opponents** at **Easy** or **Normal** difficulty that plan offensives, answer the enemy's composition,
  manage morale, fight wars on several fronts one enemy at a time and gang up on a power close to victory, each with
  its own claims and opening so that every campaign plays differently.
- **Sound and period music**: bugle calls, field reports and distant artillery as the war unfolds, and public-domain
  recordings from 1917–1923 (Holst conducting *Mars*, a march or dance for each nation).

- Design: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) (living document)
- Roadmap: [docs/BACKLOG.md](docs/BACKLOG.md)
- Adding a country: [docs/ADDING_A_COUNTRY.md](docs/ADDING_A_COUNTRY.md) (blocs, the checklist, what to streamline next)
- Balance lab: [docs/BALANCE.md](docs/BALANCE.md) (headless campaigns, the unit lab, training the AI; what to run when content is added)
- Map data and licence: [docs/ATTRIBUTION.md](docs/ATTRIBUTION.md)

## Run it

Requires Node.js 24 (the LTS release; CI runs on it).

```bash
npm install
npm run dev          # http://localhost:5173 — development server
# or the production build:
npm run build && npm run preview   # http://localhost:4173
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm test` | Simulation test suite (Vitest, ~15 s), including randomised invariant checks |
| `npm run typecheck` | TypeScript project check |
| `npm run sim:campaign -- <seed> <minutes>` | Headless all-AI campaign for balance tuning |
| `npm run balance` | Hundreds of all-AI campaigns in parallel, reported: who wins and who is knocked out, pace, AI personalities, how the AI uses every unit and building, red flags. `--vs main` compares with another commit on the same seeds, `--set PATH=VALUE` tries a config change ([docs/BALANCE.md](docs/BALANCE.md)) |
| `npm run balance:units` | The unit lab: staged battles between armies of equal cost, showing what each unit type is worth for its price by technology level, ground and role |
| `npm run balance:techs` | The tech lab: what each technology is worth to the nation that has it, measured on the same campaigns with and without it (also on demand in CI: Actions → Tech lab) |
| `npm run balance:tune` | Trains the AI: searches its settings (`src/sim/config/ai.ts`) for those that best meet the design goals, then checks the proposal on fresh campaigns |
| `npx vite-node scripts/dev/batch.ts <seeds> <minutes>` | Several headless campaigns, summarised (withdrawals, captures, wars, research pace) |
| `npx vite-node scripts/dev/balance.ts <seeds> <minutes> [--difficulty easy]` | How each power fares across many all-AI campaigns, run in parallel: wins, eliminations, land held, capitals lost, wars by and on it, who takes its land |
| `npx vite-node scripts/dev/ai-report.ts <seeds> <minutes> [--human fr] [--difficulty easy]` | AI behaviour report: wasted effort (back-and-forth marches, abandoned captures, idle armies), variety across seeds, and how long an idle human lasts |
| `npx vite-node scripts/dev/ai-moves.ts <seeds> <minutes>` | Traces every AI army order with its reason and shows the armies sent back and forth |
| `node scripts/dev/screens.mjs <outDir> <nation> <steps…>` | Screenshots of the running game for visual review (add `--phone` or `--phone-landscape` for a touch screen) |
| `npx vite-node scripts/art/contact-sheet.tsx <out.html>` | Contact sheet of all unit art (`scripts/art/city-sheet.tsx` for skylines, `scripts/art/city-models-sheet.tsx` for the map's 3D cities, `scripts/art/unit-models-sheet.tsx` for its 3D armies) |
| `npm run map:fetch && npm run map:build` | Re-download Natural Earth data and rebuild the bundled map |
| `npm run audio:fetch && npm run audio:build` | Re-download the recordings in `scripts/audio/sources.mjs` and rebuild the bundled sound (needs FFmpeg) |
| `npm run build:e2e` | The production build plus the `window.__game` handle the browser checks drive the game through (in `dist-e2e/`; the dev server has it too, the published build does not) |
| `npm run e2e` | Scripted browser playthrough against the test build (`npm run build:e2e` first; about a minute at DEV speed: start → build → recruit → research → move → capture → save/load → campaign end) |
| `npm run e2e:mobile` | The same for the phone layouts, by touch (`npm run build:e2e` first; about 20 seconds): upright, then turned on its side |

The CI workflow (`.github/workflows/ci.yml`) runs the typecheck, the test suite, a short check of the balance tools, the
build and both browser playthroughs on every push and pull request. The Balance workflow (`.github/workflows/balance.yml`)
plays 400 campaigns and the unit lab every night, on demand, and on pull requests labelled `balance` (against their base
branch), and posts the reports on the run's summary page.

## Deploy to GitHub Pages

The build uses relative asset paths and makes no runtime fetches, so `dist/` works from any static path,
including `https://<user>.github.io/<repo>/`. The workflow in `.github/workflows/deploy-pages.yml` builds and
deploys on every push to the repository's default branch (or run it manually from the Actions tab).

One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.

## Controls

| Input | Action |
| --- | --- |
| Left-click province | Open its city: skyline, morale, growth, building slots, recruitment, forces present, routes |
| Left-click army (its model or counter) | Select army (Shift-click adds more of your armies) |
| **Shift**-drag | Select every army of yours inside the box |
| **,** / **.** | Previous / next of your armies |
| Right-click province or enemy army | March the selected armies there (or press **M** / the **Move** button, then left-click) |
| **S** | Stop the selected armies after their current leg |
| Drag / mouse wheel | Pan / zoom |
| Arrow keys | Pan the map (with **Shift**, further) |
| **C** / **Home** | Jump to your capital |
| **Space** | Pause / resume |
| **1–6** | Speed 1x, 2x, then **DEV** 5x / 20x / 60x / 200x (orange; development and testing only) |
| **R** / **D** / **L** | Research tree / Diplomacy & objectives / toggle field reports |
| **V** | Cycle map view: political, terrain, supply, morale, city size |
| **K** | Show or hide the map key |
| **N** | Mute or unmute sound and music (remembered); **Sound** on the left rail sets the volumes |
| **H** or **?** | Controls and briefing |
| **Esc** | Close the open dialog, cancel move mode, then clear the selection |

The campaign opens on your own territory; the **fit** button under the zoom controls shows the whole theatre. The left
command rail opens Research, Diplomacy, field reports, save/load and help. The top-left switch (or **V**) changes the
map view (Political, Terrain, Supply, Morale, Cities); the overview map and zoom buttons sit at the bottom right. With
one of your armies selected, pointing at a province or an enemy army previews the route and arrival time (or why there
is none, such as a nation you are at peace with). Point at a resource in the top bar for its income and upkeep.
Zoom in one step and every city turns into a web of streets on the map: the old town round its landmark in the middle,
a 3D model of each building around it on a pad in its category's colour (economy, military, civic, infrastructure),
empty plots for free building slots and flags in the owner's colour. Main roads run out towards the neighbouring
cities, and a seaside city's streets stop at the coast, where it has its port; pointing at a province lists the same
buildings. At the same zoom the army counters become 3D models standing around their cities on a ring in the owner's
colour (white-rimmed for yours, red for enemies at war with you), each under a badge with its flag, number of
formations, strength and morale. Click a field report or an alert to jump to its
province. Peace offers (with time left to answer) and key events pop up at the top left: wars, research, objectives,
provinces you win or lose, attacks on your territory, enemy withdrawals. Alerts wait while the game is paused.
Declaring war and leaving the campaign ask for confirmation.

Land outside your sight lies under the fog of war: a darker veil with drifting cloud, a faint line where your sight
ends, and no armies, battles, sieges or buildings in it (a city there shows only its old town). Pointing at a fogged
province says so, and its city panel explains how to see it; the morale view shows its morale as unknown. Who holds
it and how big its city is are always known. Diplomacy marks your co-belligerents (powers at peace with you and at war
with a common enemy) and whether you share their sight. When the campaign ends the fog lifts.

### On a phone or tablet

Narrow screens get a compact layout: resources and the clock in a two-row top bar, Research, Diplomacy, Reports and
More (save, load, help, main menu) in a tab bar at the bottom, and the selected city or army in a sheet that slides up
from the bottom; drag its handle to see more, or down to close it. Turned on its side, the phone keeps a one-row top bar,
a slim tab bar along the bottom and the selection in a panel on the right. The map opens close in on your capital with
nothing selected and no overview map, and names and 3D cities wait for a closer zoom than on the desktop, so they do not
crowd the screen. Field reports open from their tab, which counts the reports that came in since you last looked. The
briefing drops the Chief of Staff's portrait to give its text the width.

| Touch | Action |
| --- | --- |
| Tap province / army | Open its city / select the army |
| **Move**, then tap a province or an enemy army | Preview the route and arrival time; tap it again (or **Confirm**) to march |
| Drag / pinch | Pan / zoom the map (the **fit** button shows the whole theatre) |
| Tap a resource | Its income, upkeep and net change |
| Tap a technology in Research | Its details; research it, or queue the path to it, from there (a tap alone spends nothing) |
| Pause button or the **Paused** banner | Pause / resume; **1x** and **2x** set the speed (DEV speeds are keyboard only) |

## How to win

Hold **29 of the 72 objective victory points** (★ great-power capitals 3 VP and industrial heartlands 2 VP,
major-power capitals 2 VP and heartlands 1 VP, minor-power capitals 1 VP) continuously for **90 seconds**, or have
the **highest score** when the **2 h 30 min** time limit ends. Only great and major powers can win: minor powers
are there to be conquered. You lose if your nation is eliminated or another power wins.

## Saving

Save and load from the left command rail (three slots plus an autosave every 2 minutes, when the tab is hidden and
when you return to the main menu).
Saves live in the browser's `localStorage` and can be exported or imported as JSON files.
**The campaign is paused while closed**: hiding the tab pauses the game and loading resumes exactly where the save
was made. Offline progression belongs to the later server-backed version. A save made before a country was added
still loads: the newcomer joins at its starting position, under computer control and at peace. Saves made before
the neutral states became minor powers cannot be loaded.

## Project layout

```
src/sim/            Framework-free simulation (could run on a server unchanged)
  config/           Balance and timing values: units, buildings, research, rules, AI, power tiers, timing
  blocs.ts          Equipment blocs: the named designs and formation names nations inherit
  scenario/build.ts Turns province rows into scenario data: output, objectives, starting buildings and armies
  scenario/europe/  Nations (tier, bloc, overrides, speciality), province rows, connections
  systems/          Economy, production, movement, combat (morale, rout), supply, civic (morale, growth),
                    territory, diplomacy, victory
  ai/               Computer opponents: context, diplomacy, economy, recruitment, military
  engine.ts         Fixed 1-second tick, command log, replay
  loop.ts           Real-time fixed-timestep driver (no DOM)
src/ui/             React interface: map (SVG + d3-geo/d3-zoom, baked relief texture), HUD panels, dialogs
  art/              Hand-drawn SVG unit art, insignia, procedural city skylines, 3D city and army models (a
                    small isometric renderer in iso3d.ts, streets in cityGround.ts), building and branch icons
src/audio/          Sound: Web Audio engine, event-to-cue mapping, page-wide interface sounds; files/ holds the
                    processed recordings (built from scripts/audio/sources.mjs)
src/assets/map/     Bundled, simplified Natural Earth TopoJSON: provinces and world in one topology (shapes only)
scripts/            Map and audio pipelines, headless campaigns, browser playthrough, screenshot and art sheets
tests/              Simulation tests
```

## How the map is drawn

- **Shapes.** Natural Earth admin-1 units, grouped into regions by `scripts/map/province-sources.mjs` and simplified
  by `npm run map:build` into one topology with the world round them (`src/assets/map/map.topo.json`). The theatre,
  and every unit within 4° of it, keeps about 3 km of detail wherever the theatre reaches; detail falls off beyond,
  where the map is only ever seen zoomed far out.
- **Cities, lands and roads.** `scripts/map/city-provinces.ts` cuts each city out of its region and divides the rest
  into the lands round it; `scripts/map/road-routes.ts` lays out the roads between their centres (CLAUDE.md, *Map
  rules*).
- **One scale.** The projection is Lambert's conformal conic over Europe (standard parallels 35°N and 65°N, middle
  meridian 10°E, as the EU's own conformal map of Europe), at a fixed scale (`KM_PER_UNIT` in `src/ui/map/geo.ts`: a
  map unit is 3.75 km at 48°N, 3.64 km at 36°N and 3.47 km at 71°N, so the North Cape is drawn 8% larger than the
  middle of Europe, where Mercator drew it twice as large). Meridians lean towards the pole, so north is straight up only along 10°E. The frame
  is the theatre with a margin of sea round it, so a wider theatre makes a larger drawing, never a smaller one.
- **The world round it.** The countries outside the theatre are drawn as a cap of the globe within 36° of the middle
  of Europe (10°E 52°N: Greenland's coast, the Sahara, Arabia, the Urals), fading into the sea towards its rim; a
  conic cannot draw the whole world. The theatre must stay inside the cap (Iceland's west is 22° out).
- **Camera.** The zoom range, the opening view and the zooms where names, towns and 3D cities appear are measured
  against a fixed reference view (1000 × 820 map units, the frame the first theatre filled) fitted to the screen,
  never against the whole theatre; only the fit button and the overview map show all of it. Counters, cities,
  labels and roads look the same at the same real-world scale however large the theatre grows.

## Known limitations

- The scripted browser playthrough (`npm run e2e`) checks the gameplay loop through the real UI, not visual
  appearance; screenshots in `e2e-output/` are checked by eye.
- Balance has only been measured with headless AI-vs-AI campaigns ([docs/BALANCE.md](docs/BALANCE.md)); human
  playtesting is still needed. Over 200 full campaigns with five-region major Ukraine on the current economy,
  none end on objectives; all reach the 150-minute score limit. Against main on the same seeds, Germany's wins
  rise from 4% to 19%, Hungary's from 27.5% to 29%, and Poland's fall from 29.5% to 16.5%. Ukraine wins 0.5%,
  Romania 1.5%, and Belarus and Serbia never win. Ukraine, Romania, Belarus and Serbia survive 69.5%, 39.5%,
  49.5% and 30%. The East still misses balance goals. Balance changes are a separate follow-up using general mechanics.
- There are no alliances yet: powers fighting a common enemy are only co-belligerents, and all that does is share
  sight through Liaison Officers.
- When peace is signed, armies on the other side's territory are moved instantly to the nearest friendly province.
- Only the Standard speed is playable. Slow (~1 week) is defined in config and greyed out in the menu.
- The phone layouts are checked in Chromium's touch emulation (`npm run e2e:mobile`), not yet on real iOS and Android
  devices. Production JavaScript is split into six chunks totalling ~1,380 KB (438 KB gzipped, as reported by Vite).
- Saves from before cities, morale and the research tree (schema 1, and schema 2 from earlier builds) cannot be
  loaded.
- The theatre includes the western Balkans, Bulgaria and Greece, including Crete and the larger Aegean islands.
  The eastern theatre reaches Estonia, Belarus and Ukraine, including Crimea. Russia, Kaliningrad and Turkey
  remain context only. Kosovo is part of Serbia's southern region.
- Saves from before the Balkans expansion cannot be loaded. Every save contains the renamed lands
  `hr-zagreb-sw` → `hr-zagreb-se` and `rs-south-s` → `rs-south-sw`, so all such saves are refused. There is no
  migration for these renames; start a new campaign.
- Saves from before the East expansion load with its six newcomers at peace. Armies on removed roads return to
  their current province, and marches using removed links stop. Adding the East raises the objective requirement
  from 25 of 62 VP to 29 of 72 VP in those saved campaigns. The earlier Balkans restriction still applies.
