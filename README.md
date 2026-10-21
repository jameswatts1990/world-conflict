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
- **Cities** that grow through five tiers with building slots, 18 buildings and a skyline that shows them.
- A **58-technology research tree** across four eras with slots, a queue and a classic tree view.
- **Computer opponents** that plan offensives, answer the enemy's composition, manage morale and gang up on a
  power close to victory.

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
| `npm test` | Simulation test suite (Vitest, ~20 s) |
| `npm run typecheck` | TypeScript project check |
| `npm run sim:campaign -- <seed> <minutes>` | Headless all-AI campaign for balance tuning |
| `npx vite-node scripts/dev/batch.ts <seeds> <minutes>` | Several headless campaigns, summarised (routs, surrenders, captures, wars, research pace) |
| `node scripts/dev/screens.mjs <outDir> <nation> <steps…>` | Screenshots of the running game for visual review |
| `npx vite-node scripts/art/contact-sheet.tsx <out.html>` | Contact sheet of all unit art (`scripts/art/city-sheet.tsx` for cities) |
| `npm run map:fetch && npm run map:build` | Re-download Natural Earth data and rebuild the bundled map |
| `npm run e2e` | Scripted browser playthrough against the production build (`npm run build` first; ~10 min, plays a whole campaign at DEV speed) |

## Deploy to GitHub Pages

The build uses relative asset paths and makes no runtime fetches, so `dist/` works from any static path,
including `https://<user>.github.io/<repo>/`. The workflow in `.github/workflows/deploy-pages.yml` builds and
deploys on every push to the repository's default branch (or run it manually from the Actions tab).

One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.

## Controls

| Input | Action |
| --- | --- |
| Left-click province | Open its city: skyline, morale, growth, building slots, recruitment, armies present |
| Left-click army counter | Select army (Shift-click adds more of your armies) |
| Right-click province | Move the selected army there (or press **M** / the **Move** button, then left-click) |
| **S** | Stop the selected army after its current leg |
| Drag / mouse wheel | Pan / zoom |
| **Space** | Pause / resume |
| **1–6** | Speed 1x, 2x, then **DEV** 5x / 20x / 60x / 200x (orange; development and testing only) |
| **R** / **D** / **L** | Research tree / Diplomacy & objectives / toggle event log |
| **V** | Cycle map view: political, morale, city size, supply |
| **H** or **?** | Controls and tutorial |
| **Esc** | Cancel move mode, close a dialog, clear selection |

Click an event in the log to jump to its province. Peace offers from the AI pop up at the top right.

## How to win

Hold **15 of the 37 objective victory points** (★ capitals 3 VP, industrial heartlands 2 VP, neutral capitals
1 VP) continuously for **90 seconds**, or have the **highest score** when the **2 h 30 min** time limit ends.
You lose if your nation is eliminated or another power wins.

## Saving

Save and load from the top bar (three slots plus an autosave every 2 minutes and whenever the tab is hidden).
Saves live in the browser's `localStorage` and can be exported or imported as JSON files.
**The local prototype is paused while closed**: hiding the tab pauses the game and loading resumes exactly where the
save was made. Offline progression belongs to the later server-backed version.

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
src/ui/             React interface: map (SVG + d3-geo/d3-zoom), panels, dialogs
  art/              Hand-drawn SVG unit art, insignia, procedural city skylines, building and branch icons
src/assets/map/     Bundled, simplified Natural Earth TopoJSON (shapes only)
scripts/            Map pipeline, headless campaigns, browser playthrough, screenshot and art sheets
tests/              Simulation tests
```

## Known limitations

- Balance is tuned with headless AI-vs-AI campaigns and needs human playtesting. In those runs every campaign ends
  on the time limit: nobody reaches the 15 VP objective threshold, partly because the AI gangs up on a leader.
- The browser playthrough (`npm run e2e`) passes end to end but is not yet in CI.
- No fog of war: every army is visible.
- When peace is signed, armies on the other side's territory are moved instantly to the nearest friendly province.
- Only the Standard speed is playable. Slow (~1 week) is defined in config and greyed out in the menu.
- Single desktop layout; not tuned for touch or small screens. The main bundle is ~800 KB (257 KB gzipped).
- Saves from the first prototype (schema 1) are not loadable.
