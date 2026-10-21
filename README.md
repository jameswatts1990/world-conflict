# World Conflict — first playable

A browser-based, real-time global strategy game. Six modern nations on recognisable Earth geography start with
Great War technology and research their way towards the Second World War. This milestone is a local
single-player campaign on the **European theatre** at **Standard** speed (target ~2–3 hours).

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
| `npm run map:fetch && npm run map:build` | Re-download Natural Earth data and rebuild the bundled map |
| `npm run e2e` | Scripted browser playthrough against the production build (start → build → recruit → research → move → capture → save/load → campaign end); run `npm run build` first |

The CI workflow (`.github/workflows/ci.yml`) runs the typecheck, the test suite, the build and the browser playthrough on
every push and pull request.

## Deploy to GitHub Pages

The build uses relative asset paths and makes no runtime fetches, so `dist/` works from any static path,
including `https://<user>.github.io/<repo>/`. The workflow in `.github/workflows/deploy-pages.yml` builds and
deploys on every push to the repository's default branch (or run it manually from the Actions tab).

One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.

## Controls

| Input | Action |
| --- | --- |
| Left-click province | Select it: output, buildings, recruitment, forces present, routes |
| Left-click army counter | Select army (Shift-click adds more of your armies) |
| Right-click province or enemy army | March the selected armies there (or press **M** / the **Move** button, then left-click) |
| **S** | Stop the selected armies after their current leg |
| Drag / mouse wheel | Pan / zoom |
| **Space** | Pause / resume |
| **1–6** | Speed 1x, 2x, then **DEV** 5x / 20x / 60x / 200x (orange; development and testing only) |
| **R** / **D** / **L** | Research / Diplomacy & objectives / toggle field reports |
| **K** | Show or hide the map key |
| **H** or **?** | Controls and briefing |
| **Esc** | Close the open dialog, cancel move mode, then clear the selection |

The left command rail opens Research, Diplomacy, field reports, save/load and help. The top-left switch changes the map
view (Political, Terrain, Supply); the overview map and zoom buttons sit at the bottom right. With one of your armies
selected, pointing at a province or an enemy army previews the route and arrival time. Point at a resource in the top
bar for its income and upkeep. Click a field report or an alert to jump to its province. Peace offers (with time left to
answer) and key events pop up at the top left: wars, research, objectives, provinces you win or lose, attacks on your
territory. Alerts wait while the game is paused. Declaring war and leaving the campaign ask for confirmation.

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
  scenario/europe/  Nations, province gameplay data, movement connections, starting setup
  systems/          Economy, production, movement, combat, supply, territory, diplomacy, victory
  ai/               Computer opponents (issue the same commands as the player)
  engine.ts         Fixed 1-second tick, command log, replay
  loop.ts           Real-time fixed-timestep driver (no DOM)
src/ui/             React interface: map (SVG + d3-geo/d3-zoom, baked relief texture), HUD panels, dialogs
src/assets/map/     Bundled, simplified Natural Earth TopoJSON (shapes only)
scripts/            Map pipeline, headless campaign, browser playthrough
tests/              Simulation tests
```

## Known limitations

- The scripted browser playthrough (`npm run e2e`) checks the gameplay loop through the real UI, not visual
  appearance; screenshots in `e2e-output/` are checked by eye.
- Balance has only been tuned with headless AI-vs-AI campaigns; human playtesting is still needed. In those runs,
  campaigns end either by objectives (about 100–130 min) or on the time limit.
- AI armies can grow large (100+ units in one stack) late in a campaign. No unit disbanding yet; a bankrupt AI keeps
  its army but fights at reduced effectiveness.
- No fog of war: every army is visible.
- When peace is signed, armies on the other side's territory are moved instantly to the nearest friendly province.
- Only the Standard speed is playable. Slow (~1 week) is defined in config and greyed out in the menu.
- Single desktop layout; not tuned for touch or small screens.
