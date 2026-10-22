# World Conflict

A browser-based, real-time global strategy game. Six modern nations on recognisable Earth geography start with
Great War technology and research their way towards the Second World War. The current build is a local
single-player campaign on the **European theatre** at **Standard** speed (target ~2–3 hours).

What is in it (Milestone 2, Depth):

- **13 unit types** in four classes with 1914, interwar and 1940 equipment, each nation fielding its **own named
  designs** and art (Poilus, Alpini, Ułani; Mark IV, Renault FT, A7V, 7TP …), numbered formations in its own
  language, veterancy, and one **national speciality**.
- **Morale** for units (broken armies rout; encircled ones surrender), provinces (drives output; conquests
  integrate over time) and nations.
- **Cities** that grow through five tiers with building slots and 18 buildings. Zoomed in, each city on the map is a
  web of streets with a small 3D model of everything it holds standing on it (barracks, factories, a tank works, empty
  plots for free slots), and seaside cities have a port on the coast; the city view adds a skyline.
- **3D armies**: zoomed in, every army is a small 3D model of its main unit (a squad under its flag, horsemen, guns,
  lorries, tanks) in its nation's uniforms, paint and flag. Armies gather around their city, march along the roads
  facing the way they go, and cross the sea in troopships.
- A **59-technology research tree** across four eras with slots, a queue and a classic tree view.
- **Computer opponents** that plan offensives, answer the enemy's composition, manage morale and gang up on a
  power close to victory.
- **Sound and period music**: bugle calls, field reports and distant artillery as the war unfolds, and public-domain
  recordings from 1917–1923 (Holst conducting *Mars*, a march or dance for each nation).

- Design: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) (living document)
- Roadmap: [docs/BACKLOG.md](docs/BACKLOG.md)
- Map data and licence: [docs/ATTRIBUTION.md](docs/ATTRIBUTION.md)

## Run it

Requires Node.js 20+ (developed on Node 22).

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
| `npx vite-node scripts/dev/batch.ts <seeds> <minutes>` | Several headless campaigns, summarised (routs, surrenders, captures, wars, research pace) |
| `node scripts/dev/screens.mjs <outDir> <nation> <steps…>` | Screenshots of the running game for visual review (add `--phone` or `--phone-landscape` for a touch screen) |
| `npx vite-node scripts/art/contact-sheet.tsx <out.html>` | Contact sheet of all unit art (`scripts/art/city-sheet.tsx` for skylines, `scripts/art/city-models-sheet.tsx` for the map's 3D cities, `scripts/art/unit-models-sheet.tsx` for its 3D armies) |
| `npm run map:fetch && npm run map:build` | Re-download Natural Earth data and rebuild the bundled map |
| `npm run audio:fetch && npm run audio:build` | Re-download the recordings in `scripts/audio/sources.mjs` and rebuild the bundled sound (needs FFmpeg) |
| `npm run e2e` | Scripted browser playthrough against the production build (`npm run build` first; about a minute at DEV speed: start → build → recruit → research → move → capture → save/load → campaign end) |
| `npm run e2e:mobile` | The same for the phone layouts, by touch (`npm run build` first; about 20 seconds): upright, then turned on its side |

The CI workflow (`.github/workflows/ci.yml`) runs the typecheck, the test suite, the build and both browser playthroughs on
every push and pull request.

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
| Right-click province or enemy army | March the selected armies there (or press **M** / the **Move** button, then left-click) |
| **S** | Stop the selected armies after their current leg |
| Drag / mouse wheel | Pan / zoom |
| **Space** | Pause / resume |
| **1–6** | Speed 1x, 2x, then **DEV** 5x / 20x / 60x / 200x (orange; development and testing only) |
| **R** / **D** / **L** | Research tree / Diplomacy & objectives / toggle field reports |
| **V** | Cycle map view: political, terrain, supply, morale, city size |
| **K** | Show or hide the map key |
| **N** | Mute or unmute sound and music (remembered) |
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
provinces you win or lose, attacks on your territory, routs and surrenders. Alerts wait while the game is paused.
Declaring war and leaving the campaign ask for confirmation.

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

Hold **15 of the 37 objective victory points** (★ capitals 3 VP, industrial heartlands 2 VP, neutral capitals
1 VP) continuously for **90 seconds**, or have the **highest score** when the **2 h 30 min** time limit ends.
You lose if your nation is eliminated or another power wins.

## Saving

Save and load from the left command rail (three slots plus an autosave every 2 minutes, when the tab is hidden and
when you return to the main menu).
Saves live in the browser's `localStorage` and can be exported or imported as JSON files.
**The campaign is paused while closed**: hiding the tab pauses the game and loading resumes exactly where the save
was made. Offline progression belongs to the later server-backed version.

## Project layout

```
src/sim/            Framework-free simulation (could run on a server unchanged)
  config/           Balance and timing values: units, buildings, research, rules, AI, timing
  scenario/europe/  Nations and their identity, province gameplay data, connections, starting setup
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

## Known limitations

- The scripted browser playthrough (`npm run e2e`) checks the gameplay loop through the real UI, not visual
  appearance; screenshots in `e2e-output/` are checked by eye.
- Balance has only been tuned with headless AI-vs-AI campaigns; human playtesting is still needed. In those runs,
  every campaign ends on the time limit: nobody reaches the 15 VP objective threshold, partly because the AI gangs up
  on a leader.
- No fog of war: every army is visible.
- When peace is signed, armies on the other side's territory are moved instantly to the nearest friendly province.
- Only the Standard speed is playable. Slow (~1 week) is defined in config and greyed out in the menu.
- The phone layouts are checked in Chromium's touch emulation (`npm run e2e:mobile`), not yet on real iOS and Android
  devices. The main bundle is ~975 KB (320 KB gzipped).
- Saves from before cities, morale and the research tree (schema 1, and schema 2 from earlier builds) cannot be
  loaded.
