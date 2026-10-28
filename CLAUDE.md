# World Conflict

Browser-based real-time grand strategy (WWI → WWII) on the European theatre. Design: `docs/GAME_DESIGN.md` (living
document, keep it current); roadmap: `docs/BACKLOG.md`. British English throughout (behaviour, armour, defence). Powers fighting a common enemy are
co-belligerents, never "allies", in anything the player reads: there are no treaties yet, so nobody agrees to it
(`areAllies` in `src/sim/visibility.ts` is that informal relation).

## Workflow

- **Always open a pull request** for finished work: push the branch and open a PR without waiting to be asked.
- Keep docs in step with behaviour changes: `docs/GAME_DESIGN.md` is the living design document (rules, numbers,
  AI behaviour), `docs/BACKLOG.md` the roadmap, and this file the working notes for Claude.
- Before pushing, run `npm run typecheck` and `npm test` (about 20 s). CI also runs the build and the browser
  playthroughs (`npm run e2e`, `npm run e2e:mobile`) against `npm run build:e2e`: the playthroughs read the game
  through `window.__game`, which only the dev server and that test build expose, never the published build.

## Layout

- `src/sim`: deterministic simulation, no DOM. Plain-JSON `GameState`; all randomness through the seeded RNG.
  - `systems/`: per-tick rules (movement, combat, capture in `territory.ts`, supply, production …).
  - `ai/`: computer opponents. They act only through the same validated commands as a human.
  - `config/`: tuning numbers (`ai.ts`, `rules.ts`, `units.ts`, `buildings.ts`).
- `src/ui`: rendering and input.
  - Imported unit art uses baked PNGs in `src/assets/units`, selected by `art/UnitAssets.ts`. Models are shared
    across eras and nations for now; national flags/badges remain. Per-era overrides are supported by the mapping.
    Recipes and rebuild commands are in `docs/ADDING_UNIT_ART.md`; original GLBs stay in `scripts/art/sources`.
    `spriteHref` passes these PNGs through directly; do not queue them for SVG rasterisation.
- `tests/`: Vitest suite; `tests/helpers.ts` has `quietGame` (no AI), `aiGame`, `place`, `run`, `setWar`.

## Balance lab (docs/BALANCE.md)

- `npm run balance` plays all-AI campaigns in parallel and reports on balance, pace and content use; `--vs main`
  compares with another commit on the same seeds and `--set PATH=VALUE` tries a config value. `npm run balance:units`
  prices units in staged battles; `npm run balance:techs` measures what each technology is worth (same campaigns with
  and without it; slow, so on request); `npm run balance:tune` searches AI settings for the design goals in
  `scripts/balance/goals.ts`. Runs land in `balance-runs/` (ignored by git).
- After changing rules, AI or content, run `npm run balance -- --vs main` (and `npm run balance:units -- --vs main`
  for unit changes) and put what moved in the pull request. It plays 100 campaigns of each, for big changes (new
  countries, rules, AI); `--quick` plays 25, for small ones, and catches only breakage (see "Reviewing AI changes").
  Better still, compare with a shared baseline of the main commit you started from (`npm run balance -- compare
  <baseline> <run>`, same seeds; docs/BALANCE.md, "One baseline per main commit") rather than playing main again.
- Balance runs save each campaign as it finishes and replace workers that die (Node has crashed natively on long
  runs on Windows). If a run stops, run the same command with the same `--out`: only the missing campaigns are played,
  and the result is the same as an uninterrupted run.
- Every number the AI weighs belongs in `src/sim/config/ai.ts`, not inline in `ai/*.ts`, so `--set` and the tuner can
  reach it. A new unit type needs a share in `AI.doctrineMix`, a new building a rule in `handleConstruction`; the
  reports flag content the AI never uses.
- The tools in `scripts/balance/` must not import `src/sim` statically (type imports are fine): they load whichever
  copy of the simulation a run asks for, which is how `--vs` plays other commits.

## Commands

- `npm run typecheck`, `npm test` (Vitest, ~20 s), `npm run build`, then `npm run build:e2e`, `npm run e2e` and
  `npm run e2e:mobile` (browser playthroughs of the test build). CI runs them all on every push.
- `npx vite-node scripts/dev/ai-report.ts <seeds> <minutes> [--human fr] [--difficulty easy]`: AI behaviour report.
- `npx vite-node scripts/dev/balance.ts <seeds> <minutes>`: how each power fares across many campaigns (parallel).
- `npx vite-node scripts/dev/batch.ts <seeds> <minutes>`: headless campaign summaries (captures, wars, outcomes).
- `npx vite-node scripts/dev/ai-moves.ts <seeds> <minutes>`: every AI move order with its reason; armies sent back
  and forth.
- `node scripts/dev/pan-perf.mjs [dist-e2e] [cpu slowdown] [paused] [zoom] [desktop]` (after `npm run build:e2e`):
  frames shown and dropped, raster and main-thread time while dragging (or zooming) the map on an emulated phone
  (or desktop); compare with a build of main before and after map changes. Run the variants one at a time: they
  share the CPU.

## Map rendering

The map is drawn in SVG; what makes it slow is the browser rasterising it (drawing it into tiles), not script.
- During a drag, pinch or wheel zoom, `MapView` only moves and scales `.map-layer`, a composited layer the GPU moves
  without drawing it again (`place`); the SVG is drawn with a margin round the screen (`overscanFor`) and drawn again
  only when the zoom changes, the margin runs out or the gesture pauses. Keep it that way: anything that changes the
  map's drawing on every frame of a gesture undoes it (the army layers already wait while `panning` is set).
- The drawing is two SVGs on two layers: `svg.map` (terrain, provinces, borders, fog, cities) and `svg.map-top`
  (armies, routes, battles, cities' names), so what moves or animates every frame is drawn again without what lies
  under it. Anything new that changes from frame to frame goes in the top one.
- Chrome lays out all SVG text again when the `<svg>` element's own transform changes, when a transform goes from
  `none` to something, and when it hit-tests the SVG while it is scaled. Hence the transform on the wrapper, never
  `none`, and the shield that takes the pointer while the drawing is scaled or dragged (every mouse move of a drag
  would otherwise hit-test the whole drawing: about a second of main-thread time per 6 drags at a quarter CPU).
  A close-up terrain tile blocks the main thread for several frames while it bakes (the browser draws the SVG
  inside `toBlob`), so tiles wait for a gesture to end (`TerrainDetail` takes `panning`).
- City, port and army models are SVG documents shown as `<image>`s, which Chrome replays shape by shape on every
  raster and lays out again on every zoom; the map draws them as bitmaps baked for the zoom (`spriteHref` in
  `art/adapters.tsx`, through `spriteSrc`). A new sprite on the map goes through `spriteSrc` too.
- What the map draws and how big depends on the zoom ratio (`ZOOM` in `MapView.tsx`): `symbolScale` shrinks markers and
  counters zoomed out (chips below `ZOOM.chips`, capitals only below `ZOOM.detail`), and `cityModelScale` and
  `unitModelScale` grow the models with `closeUpGrowth` past `ZOOM.closeUp`. Models must never grow faster than the
  map (pixels per model unit over the zoom never rising): a city's coast reach is baked for the first model zoom
  (`REACH_SCALE`) and its buildings would reach the sea. Keep text (plates, badges) a constant size on screen.
- Nothing switches at once as the zoom changes. Crossing a `STAGES` threshold (a change of look: chips, capitals'
  names, models, nation names), what changes fades: the old look, drawn for the new zoom (`withinStage`), fades out
  in a layer of its own over the new one fading in (`MapFade`, `fadeLayer`, `.map-fade`); only whole layers fade, so
  the compositor does it without drawing the map again. A new zoom-dependent layer goes into `marks` and `fades`.
  Layers move between the drawing and a fade, so keep slow work out of their own state (`nationLabels` is kept by
  `MapView`). After a gesture, marks drawn at a size on screen ease back from the size the gesture showed them at
  (`keepSize` on a wrapper `<g>` without a `transform` attribute, which the CSS animation would replace;
  `.keep-size`, on screen only); never during a gesture (`stopSettling` at its start).
- Measure with `scripts/dev/pan-perf.mjs`, and for the cost of one full raster by layer, Chrome's paint profiler
  (`LayerTree.makeSnapshot` and `profileSnapshot` over CDP).

## Simulation rules

- `src/sim` has no DOM or React and must stay deterministic: randomness only through the seeded RNG
  (`random(state)`), never `Math.random` or the clock. Same seed and orders must give the same state hash; saves,
  replays and the determinism tests depend on it.
- Everything a player or AI does goes through the validated commands in `src/sim/commands.ts`.
- New state fields are optional with a sensible default when absent, so older saves still load; otherwise add a
  migration in `src/sim/save.ts`. Clear an optional field with `delete` rather than writing `null` over an absent
  one: a field that appears changes the state hash even when play is identical.
- Every city is a province of its own (the row's id, e.g. `fr-paris`) among two to seven provinces of land round it
  (`<row>-<compass point>`, e.g. `be-brussels-w`, named in the row's `lands`): one row in
  `scenario/europe/provinces.ts` makes them all, a region. Connections are written between rows; the generator turns
  them into links between provinces (`land.ts`), and a city's only neighbours are the lands that touch it (two or
  more). `def.city` is absent on land, so use `world.cityIds`, `landsOf`/`cityOf`, `world.regionOf`,
  `world.nearbyCities` and `world.vicinity` rather than assuming a city (`def.lands` lists a city's lands,
  `def.around` a land's city). Cities hold most output, slots, recruitment and objectives; land earns a small base
  output and holds one building (a land building or one piece of infrastructure: `landSite`, `landBuildings`), and
  where the land round a city counts as one (score, war aims, capture shock) it is shared between its lands
  (`landShare`). The division, shapes, anchors and links come from
  `npx vite-node scripts/map/city-provinces.ts` (also run by `npm run map:build`; `--hints` lists what each land
  holds). A changed division changes land keys: rename the lands in `provinces.ts` to match, and look at the result
  (`scripts/map/check-borders.ts` reports borders between regions).
- An army's `province` is where it stands; on a leg, where it last stood (the leg's `from`, or its `to` when it is
  walking back from a road or has turned round). An army with `road` set stands on a road between two lands
  (`isOpenRoad`: not a sea crossing or a city's gate) and counts as in its land for every rule. Its `at` stays short
  of `roadBorder(world, land, toward)`, where the road crosses into the next land (generated into
  `scenario/europe/roads.ts` by `scripts/map/road-routes.ts`, also run by `npm run map:build`); `spotOnRoad` turns a
  fraction of the way along a road into the land and spot. A fraction of the way along a road (`at`, `border`, a
  leg's progress) is measured along the road as the map draws it (see Map rules), though march times go by the
  straight distance between the anchors. An army walking within its land (to or from a spot on its
  road, `walksWithin`) has not left it: battles, captures and `hostileArmiesIn`/`armiesIn` go by `isArmyAway`, while
  merging, splitting and the like go by `isArmyInTransit` (any leg). Plan marches with `planMarch` (it starts from a province,
  a road or mid-leg); `findPath` is province to province. Armies at war that come level on an open road stop there
  to fight (`intercept` in `systems/movement.ts`, gated on the enemy's sight; not on a leg marked `withdrawing`), and
  keep their march: an army can stand on a road (`road` set, `leg` null) with a path still to go, whose first entry
  is either end of that road (`startLeg` carries on from the spot). The AI reads where its own armies are going (a province,
  or the land a road halt lies in) through `armyLocation` in `ai/context.ts`.

## Map rules

These hold for every area of the map, today's and any added later; the generators keep them and
`tests/scenario.test.ts` fails a map that breaks them.

- **Every province looks like one, city or land.** Its borders are jagged like the natural ones (Natural Earth's,
  kept as legs of about 10 km turning about 45 degrees), never a smooth ring or a long straight line. The borders
  `scripts/map/city-provinces.ts` draws itself (each city's outline, and the cuts between lands where they run
  through the admin units) are broken up to match (`roughen`), after the division is decided and without moving any
  border's ends, so lands, links and anchors stay as the division made them. The scenario test fails a border within
  a region that runs smoother than any natural one (turning under 10 degrees a leg for over 45 km). A city's border
  is drawn like the borders between its lands (`landBorders` in `ui/map/geo.ts`), not fainter.
- **Paths converge on each province's centre.** Every road between two provinces runs from one's anchor (its centre:
  its armies stand there and every road out of it starts there) to the other's, over those two provinces alone: it
  crosses their shared border once and never runs through a third province (the city between two lands, a land next
  door) or over the sea. A sea crossing runs over each province's own land to its coast. Where the straight line
  between the anchors would break this, or pass within 3 km of anything else, the road bends round it:
  `scripts/map/road-routes.ts` (run by `npm run map:build`) writes the bends (`via`) and where each road crosses its
  border into `scenario/europe/roads.ts`, and the map draws, walks and measures the bent road (`roadLine` in
  `ui/map/geo.ts`). The scenario test lists the few roads the shapes leave no clean way (an exclave, an estuary) and
  fails on any other that strays: after changing the map, rerun `npm run map:build` (or `city-provinces.ts` then
  `road-routes.ts`) and fix whatever the test reports.

## How the computer opponents should behave

The AI should be **fun to play against**: strategic, readable, varied, and beatable, but never a walkover.

- **Plays by the rules.** The same commands, resources and information as the player. Difficulty changes how well
  it plays, never what it is given.
- **Strategic.** Every move has a reason a player could guess: mass before striking, prefer valuable or encircled
  targets, defend what matters (the capital keeps a garrison against danger up to two lands away), finish what
  it starts (a capture in progress is held until the province falls), make peace when losing, and fight wars for
  limited aims: once it has taken enough, it settles rather than fighting on to annihilation. On several fronts it
  fights by interior lines: one main enemy at a time, the other fronts held, reserves sent by rail to the main one.
- **Readable, not jittery.** No marching back and forth, no orders abandoned before they can pay off, no armies
  idling far from any front while a war is on. Plans should be visible on the map (a build-up, then an attack) so
  the player can react.
- **Makes human mistakes, not broken ones.** Misjudging strength, overreaching, reacting late, picking a weaker
  target or holding on too long are fine and should be punishable. Oscillating, starving armies, wasted marches
  and stuck stacks are bugs.
- **Spontaneous.** Each campaign should play differently, while each AI stays consistent within a campaign. The
  menu draws a fresh seed for every game, and the seed gives each AI a personality: aggression, economy bias,
  doctrine, two claims (provinces it covets across its land borders) and an opening (strike, expand or build) that
  sets when it fights and when it takes neutrals. Vary behaviour through traits like these, drawn once from the
  seeded RNG, rather than noise in every decision (noise reads as dithering), and keep it sensible for the
  geography: Spain taking Portugal first is fine.
- **Fair pressure.** It punishes weakness and passivity, and gangs up on a power about to win, but it should not
  dogpile a player who is still finding their feet. Grace periods give the opening to building up: no wars before
  6 minutes (12 on Easy) and no wars on minor powers (the former neutral states) before 10, longer for AIs that
  open by expanding or building. Minor powers defend themselves and make peace but never start a war or win.
- **Balanced between the powers.** Positions may differ (an island is safe, a central power has many neighbours),
  but across many campaigns every power should have a real chance. Check `scripts/dev/balance.ts` before and after
  any change that could shift who wins. Fix imbalances with general mechanics (how the AI defends, when it makes
  peace, home soil, routes that give every region more than one neighbour) rather than per-nation tweaks: the map is
  meant to grow to the whole world. A new route or rule can make a new bully: measure every variant.

### Difficulty

`AI_LEVELS` in `src/sim/config/ai.ts`; the game's level is `state.settings.difficulty` (absent = normal).

- **Normal** is the reference AI. Tune it deliberately and measure the change.
- **Easy** plays worse with the same resources: slower decisions, smaller armies, more caution before attacking,
  one offensive at a time, thinner garrisons, later retreats, looser target choice, later and rarer wars, no
  ganging up, quicker peace, no interior lines.
- Changing one level must not change the other. When tuning Easy, check that Normal campaigns keep the same state
  hashes (`npm run sim:campaign -- <seed> <minutes>` prints one).

### Reviewing AI changes

Headless numbers find broken behaviour and show trends; they cannot say whether the AI is fun. Run the report before
and after a change, at both difficulties, all-AI and with an idle human:

```bash
npx vite-node scripts/dev/ai-report.ts 10 90
npx vite-node scripts/dev/ai-report.ts 10 90 --human fr --difficulty easy
```

The pathology and variety figures below are these two commands' results (ten seeds of 90 minutes; Easy with an idle
France) on the simulation with the East (October 2026); the winner figures come from 200 campaigns of the same
build, and the Challenge figures from the same ten seeds with an idle France at both levels. With the Nordic powers
added, Normal all-AI stays within these ranges (reversals 1.4%, pile-on 0.2%, idle in the interior 9.4% against
8.7% on main); the idle-France and Easy reports were not re-run on that build.

- **Pathologies** should stay near zero: back-and-forth reversals under 1–2% of orders, abandoned captures about 0%,
  pile-on attacks under 1% (about 0.2% at Normal and 0% at Easy, counting deliberate support to weak captures), orders
  into a co-belligerent's uncontested capture (arriving stronger restarts it) about 0.2% at Normal and 0% at Easy. Armies
  idle in the interior (no foreign border next to their province or to any land of its city's region) run at about
  8% at Normal, mostly capital garrisons in capitals with no foreign border during a war and armies at home in
  peacetime (Easy about 11%, mostly in peacetime: its wars come later).
- **Variety**: how much two campaigns' openings (captures and wars in the first 25 minutes) overlap, ignoring and
  counting timing (about 13% and 6% at Normal, 11% and 4% at Easy), and who fights the first war.
- **Winners**: who wins and how early. Forty seeds swing by several wins per power through luck alone; compare on the
  same seeds. 25 campaigns (`npm run balance -- --quick`) give a nation's win rate ±13 points and survival ±18: they
  catch breakage (a nation that never survives, wars that stop), and a win rate must move from 10% to about 36% to
  show. 100 (the default, for new countries, rules and AI) give ±6 and ±10, and show 10% becoming about 20% or
  survival moving from 50% to about 64%. 200 give ±4 and ±7. None tell 12% from 10%. Call a shift only from 100 or
  more. `scripts/dev/balance.ts 80 120` runs them in parallel and shows, per power: wins, eliminations, land held over time, capitals lost, wars declared by and on it, enemies at
  once, and who takes its land. Run 150 minutes to see whole campaigns ("on time" counts wins on score at the
  limit). With the five-cities rule (15 playable nations, 96 VP, 39 to win) the figures have not been re-measured at 100 campaigns; see the pull request for a rough run. Before it (main with the Nordic powers), over 200 full campaigns with the East and the Nordic powers (36 nations, 84 VP, 34 to win),
  none end on objectives; all reach the 150-minute score limit. Win rates: Hungary 29.5%, Poland 17%, Germany 15%,
  Italy 13%, Spain 8.5%, France 6.5%, Greece 3%, Bulgaria and Ukraine 2%, Britain and Romania 1.5%, Sweden 0.5%,
  and Belarus, Finland, Iceland, Norway and Serbia 0%. Against main without the Nordic powers on the same seeds,
  Hungary rises from 26%, Germany falls from 18.5% and Poland from 19%. Campaign survival: Serbia 29.5%, Romania
  45%, Bulgaria 56%, Belarus 56%, Norway 71.5%, Ukraine 73.5%, Sweden 76.5%, Finland 85.5%, Greece 87.5%, Iceland
  94.5%. Balance is a separate follow-up using general mechanics.
- **Challenge**: when war comes to an idle player and when they fall. With an idle France over 10 seeds of 90 minutes,
  Normal brings war at 7–29 minutes and a fall in 9 of 10, at 33–72 minutes; Easy brings war at 19–70 minutes and
  a fall in 1 of 10, at 85 minutes. An earlier run of 50 seeds of 90 minutes had France fall in 19 of 50 on Easy,
  against a target of about 2 in 10
  (see [BACKLOG](docs/BACKLOG.md)). An idle player should lose, just not at once.

Report balance shifts (game length, how fast players are overrun, how quickly minor powers fall) to the user rather
than retuning silently, and recommend human playtests for anything about feel.

## Debugging AI behaviour

- `npm run sim:campaign -- <seed> <minutes>` runs a headless all-AI game, printing each nation's provinces,
  units, VP and wars every 10 minutes (`neutral:N` is always 0 in Europe: its former neutral states are minor powers).
- The AI plays under the fog of war: it may read other nations' armies only through the context (`ctx.seen`,
  `ctx.hostile`, `ctx.unseen`, `ctx.radar`/`hiddenPower`, `ctx.enemyArmour` in `ai/context.ts`) or with
  `isArmyVisible` and `radarBlips`, never straight from `state.armies` or `hostileArmiesIn` on a province it cannot
  see. Military power totals (`nationPower`), ownership and city tiers are public. `tests/ai.test.ts` checks that
  hidden armies stay hidden.
- Sight is short (`src/sim/visibility.ts`): a nation sees whole only its own territory and the province each of its
  armies stands in (`armySightedAt`: on a leg, the nearer end). Round each army are two circles in km on the map
  (`sightKm`/`blipKm` in `config/units.ts`, defaults `SIGHT.unitKm` 100 and `SIGHT.unitBlipKm` 225; reconnaissance
  170/350), centred on its spot (`armySpot`: anchor or point on its road); held land has a blip circle of
  `SIGHT.landBlipKm` round each held anchor. Enemy armies inside a sight circle are seen wherever they stand (and
  provinces whose anchor is inside are seen whole); inside a blip circle they show as radar blips: province and size
  bucket only (`radarBlips`). A blip must never reveal owner, unit types or strength. Both are derived, never stored.
  `visibleProvinces`/`detectedProvinces` return a `Watch` (a set of provinces plus the circles); pass it to
  `isArmyVisible`, which uses the circles for armies on roads. Distances use `world.spots` (anchors as whole metres
  on the globe) and compare squared whole numbers (`withinKm`), so boundaries never depend on float trig.
- `setAiOrderTrace` (from `src/sim`) sees every AI move order with the decision step that issued it; tag any new move
  order in `src/sim/ai/military.ts` with a reason.
- The AI thinks every 8 s (14 on Easy: `thinkIntervalSeconds` in `AI_LEVELS`), but captures take 20 s or more. Any
  step in `ai/military.ts` or `ai/recruitment.ts` that picks "free" or "rear" armies must skip armies holding a
  province they are capturing (step 2 of `handleMilitary` commits them). `ctx.threat` and `ctx.frontier` cover only owned provinces, so an army abroad reads as
  zero-threat and non-frontier.
