# Roadmap

_Living document. Ticked items are in the build; the rest is ordered by priority within each milestone._

## M1 — First playable ✅

- [x] Zoomable, pannable Earth map from bundled Natural Earth data; ownership colours; outside areas marked
- [x] Six playable nations, seven neutral states, 50 provinces, explicit land, mountain and strait connections
- [x] Money, materials, fuel, manpower; city buildings; occupied-territory penalty; shortages
- [x] Infantry, artillery, tanks with WWI and 1940 models; timed recruitment, movement, construction, research
- [x] Combat with terrain, fortifications, supply and doctrine modifiers; capture
- [x] Supply hubs and front-line supply; attrition and recovery
- [x] 13-tech research tree, WWI → Interwar → WWII
- [x] War, peace, truce; AI peace logic
- [x] Objective victory, time limit with score, elimination
- [x] AI opponents (economy, research, recruitment, defence, attack, diplomacy)
- [x] Save/load (slots, autosave, export/import), pause, labelled DEV speeds, tutorial, event log
- [x] Tests: resources, movement, combat, research, victory, save/load, replay, frame-rate independence

## M2 — Depth ✅ (first pass; balance continues in M3)

First-playthrough feedback: the core loop works, but it is shallow. Morale is missing, cities do not feel like
cities, building choices are thin, the research tree is short and does not look like a tree, units feel like
rock-paper-scissors without names or art, and the AI could be smarter.

### Recommended order, and why

1. **Units first.** Buildings unlock recruitment and research unlocks units, so the roster has to exist before
   either can be designed. Morale also needs unit traits (shock, resilience).
2. **Morale second.** It changes how battles end (rout, retreat, surrender), and everything the AI does in combat
   depends on that.
3. **Cities and buildings third.** They become recruitment requirements and the main economic choices.
4. **Research tree fourth.** It connects units and buildings into a long-term plan.
5. **AI last.** It has to use every new system. It is kept working (if naive) at each step so the game stays
   playable throughout.

### 2.1 Unit roster and identity

- [x] 13 unit types in four classes: infantry (line, assault, mountain, motorised), mobile (cavalry, armoured
      cars), support (field artillery, heavy siege artillery, anti-tank guns) and armour (light, medium/battle,
      heavy tanks, tank destroyers)
- [x] Three equipment generations per type (1914, interwar, 1940); research upgrades units in place
- [x] Mechanics beyond attack and defence numbers: armour **hardness**, support units fighting from the second
      line, **recon** (army bonus, faster capture), **fortification-busting**, **mountaineers** (fast over passes),
      **shock** (morale damage), fuel-hungry motorised units
- [x] National designs: every nation fields its own named equipment (Mark IV, Renault FT, A7V, Fiat 3000,
      Trubia, 7TP …) and formations (Poilus, Alpini, Stoßtruppen, Ułani …)
- [x] Numbered formations and armies in each nation's language ("12e Division d'Infanterie", "3. Armee")
- [x] Veterancy: Green → Regular → Veteran → Elite from combat experience
- [x] National specialities: one small, flavourful edge per nation
- [x] Artwork: drawn silhouettes per unit type and generation, national palettes and insignia

### 2.2 Morale

- [x] **Unit morale**: damage wears morale down, blunting firepower. Armies **fight to the death** unless
      ordered out; a **withdrawal under fire** costs every unit a set share of strength
- [x] Morale recovers out of combat, faster in supplied home territory and near hospitals
- [x] **Province morale** (0–100): drives output. It is lowered by nearby enemies, battles, shortages and a lost
      capital, and raised by garrisons, propaganda and time. It replaces the flat 50% occupied-output penalty
      with integration over time
- [x] **National morale**: the home-front average; caps unit morale and decides when the AI sues for peace
- [x] Morale map mode

### 2.3 Cities and buildings

- [x] City tiers (Town → City → Large City → Metropolis → World City) with population and growth
- [x] Building **slots** per tier, so every build is a choice. Infrastructure (forts, depots, railways, coastal
      batteries) does not use slots
- [x] 18 buildings across economy, military, civic and infrastructure: markets, power stations, housing,
      universities, military academies, motor works, hospitals, propaganda bureaus, occupation HQs, railway
      junctions, coastal batteries, plus the existing ones
- [x] City view: skyline illustration that grows with the city's buildings, slot grid and a build picker
- [x] Secondary towns drawn on the map when zoomed in
- [x] Development map mode

### 2.4 Research tree

- [x] About 50 technologies in six branches (Infantry, Artillery, Armour, Industry, Logistics, Society) across
      four eras (Great War, 1920s, 1930s, Second World War)
- [x] Technologies unlock units, buildings and equipment generations, not just percentages
- [x] Research slots (gained through research), research speed from universities, and a research queue
- [x] Classic tree view: era columns, branch rows, prerequisite lines, path highlighting
- [x] The tree is longer than a campaign, so each nation has to choose a direction

### 2.5 AI

- [x] Front-aware force allocation: garrisons sized to threat, a reserve, and strike groups
- [x] Army-size discipline: upkeep budgets and disbanding obsolete units when bankrupt
- [x] Composition that answers the enemy and terrain (anti-tank against armour, mountain troops on alpine
      fronts, siege guns against forts)
- [x] Morale-aware combat: attack where it can break the enemy, withdraw only from hopeless battles, exploit encirclement
- [x] Slot-aware city planning (growth, universities, propaganda when morale sags, occupation HQs)
- [x] Research strategies by personality (doctrine) and need
- [x] Diplomacy: opportunistic wars, avoiding two fronts, and ganging up on a power close to victory

### 2.6 Balance and presentation

- [x] Headless campaign sweeps across seeds (`scripts/dev/batch.ts`; see also the balance lab, M3)
- [x] Campaigns that sometimes end by objectives: all 8 AI-vs-AI test campaigns now end on objectives (68–137 min)
- [x] Minor powers cost an investment and never win: fortified capitals (level 2, Switzerland 3) and six starting
      divisions topped up to seven or eight. An eight-unit probe fails; twelve to fourteen units with artillery take
      a capital and lose 40–60% of their strength. Minor powers never start wars (they used to start two to four a
      game, mostly on each other) and only great and major powers count for victory
- [ ] Minor powers still fall to the AI between minutes 10 and 40 in most campaigns (by minute 20: 43 of 80, down
      from 65; with the 10-minute grace on wars against them, most between minutes 25 and 50): make the AI weigh the
      cost of a fortress against other targets; `AI.minorTargetWeight` now sets the AI's appetite for them, ready for the tuner
- [x] New tests for every system; save schema 3 (schema 2 saves with the Depth state are upgraded on load)
- [x] Design document, tutorial and controls updated

## M3 — Playtest polish

- [x] Graphics and UX overhaul (relief map, command rail, floating cards, alerts, minimap, route preview) merged with
      the Depth UI: city view, unit art, morale, research tree and the extra map views in the new style
- [x] Run the scripted browser playthrough (`npm run e2e`) end to end and add it to CI
- [ ] Human playtests at Standard speed; tune the VP threshold, combat damage, morale and AI aggression
- [x] AI: armies hold a province they are capturing instead of being pulled back to the frontier and sent in
      again (a third of all AI move orders were straight reversals; `scripts/dev/ai-moves.ts` traces them)
- [x] AI: neutral states (now minor powers) are left alone for the first 10 minutes, so a player can take a
      neighbouring one first; otherwise Britain took Belgium before France in almost every game
- [x] AI difficulty: Easy and Normal on the main menu (Easy plays worse rather than getting less)
- [x] AI behaviour report (`scripts/dev/ai-report.ts`): wasted effort, variety across seeds, and how long an idle
      player lasts
- [x] AI variety: each AI draws two claims (provinces across its land borders) and an opening (strike, expand or
      build) from the seed. Openings overlap 10–11% between two Normal campaigns once timing counts (16–20% before);
      what remains alike is geography (Spain → Lisbon, Poland → Prague, Germany–Poland)
- [x] AI balance (`scripts/dev/balance.ts`): capitals keep a garrison sized to the danger up to two provinces away,
      and winning AIs settle once they hold two enemy home provinces. Over 80 campaigns France's capital fell in 49
      instead of 66 and Germany's in 26 instead of 44 (at about minute 56 instead of 22); France is eliminated in 28
      instead of 49, Germany in 15 instead of 25
- [x] Home soil: armies fight harder in their own nation's home provinces, by up to +20% with national morale
      (nothing at 30, the full bonus at 90); the battle view and the morale tooltip show it
- [x] Sea crossings: North Sea (Manchester–Hamburg), Bay of Biscay (Cardiff–A Coruña) and western Mediterranean
      (Barcelona–Palermo), so every power but Poland has at least two neighbouring powers. Over 80 full campaigns
      France is eliminated in 18 instead of 33 and holds twice the land after two hours; any pair of the three
      routes made a new bully (Spain or Italy), all three spread the wins
- [x] AI interior lines: on several fronts it concentrates offensives and reserves on one main enemy, holds the
      other fronts, offers the main enemy peace once its gains are in hand, and counts railways in its distances.
      Over 80 full campaigns France wins 6 instead of 1 and Germany 5 instead of 2. Also settling the other fronts
      made things worse (each truce ran out into a fresh war) and was dropped
- [x] Balance: the measures above were taken on the six-power map, where France was then eliminated in about a
      quarter of campaigns and the central powers won 5–6 of 80 against 15–22 for the others. On the map with
      minor powers (80 full campaigns), they cut eliminations: France 31 instead of 61, Serbia 46 instead of 67,
      Germany 24 instead of 35, Britain 11 instead of 25
- [ ] Balance on the map with minor powers: Poland, with one great-power neighbour and two minor powers to absorb,
      wins 20 of 80 (counting wins on score) and is never eliminated; it leads with any one of capital garrisons,
      war aims, home soil or interior lines switched off (18–32 wins). Serbia and Romania win 0–2. Look at routes
      that give Poland a second great-power neighbour and at how the others gang up on a leader
- [ ] Game length: with limited war aims, about a third of all-AI campaigns end on objectives within 150 minutes
      (59 of 80 before), the rest on score at the time limit
- [ ] AI: don't pile into a province already falling uncontested (3–5% of orders)
- [x] Balance lab ([BALANCE.md](BALANCE.md)): `npm run balance` plays hundreds of all-AI campaigns in parallel and
      reports on nations, pace, AI personalities and how the AI uses every unit, building and technology, with red
      flags; `--vs <ref>` compares two commits on the same seeds and `--set PATH=VALUE` tries any config value.
      `npm run balance:units` prices every unit in staged battles; `npm run balance:tune` searches the AI's settings
      for the design goals. Every number the AI weighs now lives in `config/ai.ts`. CI runs it nightly and on pull
      requests labelled `balance`
- [ ] Balance lab, next: a random stream for AI decisions apart from combat, and personalities fixed per seat (quieter
      comparisons; seats that pass between a human and the AI); AI profiles beyond Easy and Normal (a caretaker
      for absent players, minor powers) ranked by tournament; recorded human games (seed, version, every command including the AI's)
      run through the same reports; a read-only combat hook for damage by unit type
- [x] Hungary no longer walks into neutral Austria at minute 8: with Austria a minor power, it survived all 8 AI test
      campaigns, and wins spread over six great powers (Hungary 1 of 8, down from 3)
- [ ] France is the weakest great power in AI campaigns (mean rank 6.3 of 7, conquered in 6 of 8 runs); Germany
      comes next (4.5, conquered in 2). Over 200 campaigns in the balance lab, with the AI work above: France, which borders four
      great powers, lasts 59% of them (out within the first hour in 11%); Serbia lasts 45% and never wins, Romania
      wins 1%; 3% of playable seats are out within the hour
- [ ] AI: garrison restive conquests, plan sea landings (Britain), use railways for strategic redeployment
- [ ] Line infantry is the best buy at every technology level: in the unit lab an army of it beats every other army of
      the same cost, and battle tanks give about 0.56× their price (fuel is scarce). AIs with the infantry doctrine win
      19% of campaigns, armour and artillery 7% each (200 campaigns). Armour-doctrine great powers field 13% vehicles
      against a 47% target (and 18% cavalry against 4%), though two in three build a Tank Works. Make armour pay its way
      (price, fuel, or the AI's Tank Works and refinery plans)
- [ ] Explain battles: a battle report (losses, morale, why it was won) and a rout/encirclement preview
- [ ] Better peace: orderly withdrawal marches instead of instant relocation
- [x] Notifications for key events (war declared on you, attacks on your territory, provinces won or lost, research
      done, rejected peace offers)
- [x] Multi-select by box-drag (Shift-drag); hotkeys to cycle armies (, and .)
- [ ] Army groups: saved selections on the number keys
- [x] Responsive layout and touch controls: phone layouts upright (tab bar, bottom sheet) and on the side (slim tab bar,
      side sheet), tap-to-preview move orders, touch briefing and controls, a touch browser playthrough in CI
- [x] Phones, second pass: the map opens close in on the capital with less clutter and no overview map, a minified
      top bar that fits down to 320 px, field reports counted on their tab, and a briefing that stays on screen
- [ ] Phones: try on real devices (iOS Safari, Android Chrome); a research tree sized for a phone
- [x] Phones, third pass (playtest feedback): a tapped city opens as a full-screen page without the skyline;
      selecting never moves the map; the recruit tab offers only researched units, keeps its training queue in a
      strip of fixed height so repeated recruiting never moves the buttons, and a tapped unit shows its role,
      numbers, strengths, weaknesses and national bonus; panning no longer redraws the map's layers on every frame
      (on an emulated phone at a quarter of the CPU, script time while dragging fell from 8.3 s to 1.8 s)
- [ ] Panning, next: the browser still repaints the whole map on every frame of a drag; measure on real phones
      (`scripts/dev/pan-perf.mjs` emulates one) before moving the picture as a composited layer
- [x] Cities are provinces of their own, drawn tight round each city inside the land round it, which keeps the
      region's name (138 provinces in all). Cities hold the output, buildings, recruitment and objectives; the land
      is where armies march and fronts run, takes infrastructure, and cuts its city off when lost. Map labels show
      city names and the names of provinces without a city; secondary towns are unnamed dots
- [x] The land round each city divided into two to seven provinces all round it, as in Conflict of Nations (181 lands,
      250 provinces): no land wraps round a city, every city stands where two or more lands meet, the borders between
      lands follow the departments, counties and provinces inside each region, and every province border is a light
      line over the land
- [ ] Rebalance after dividing the land. Over 200 all-AI campaigns against main (same seeds), wins hardly move, but
      conquest is slower: minor powers stand longer (77% at 30 minutes instead of 71%), fewer campaigns end on
      objectives (14% instead of 21%), and France, Germany and Romania last the campaign more often (81%, 79%, 75%
      instead of 69%, 68%, 58%), while Hungary (65% instead of 79%) and Serbia (29% instead of 42%) fall more often.
      An idle France on Easy now survives 90 minutes in 8 of 10 campaigns (3 on main): it has 40 provinces to take
      instead of 18. Look at how the AI defends a frontier of several lands (small regions spread its armies thin),
      and at the pace of taking land (whether a nation with no city left should fight on)
- [ ] Upgrades for land without a city: field hospitals, barracks or depots in the field, farms (manpower and money),
      entrenchments; and provinces with no city at all where the map needs them
- [ ] Rebalance after the city split. Over 200 all-AI campaigns against main (same seeds): the overall goal
      penalty is unchanged (4.31), but fewer campaigns end on objectives (19% instead of 32%), Poland wins 33%
      instead of 26% (not yet significant, p 0.10), Hungary lasts 71% of campaigns instead of 83%, and minor
      powers stand longer (33% at 60 minutes instead of 21%). Look at how fast cities fall once their land is lost,
      whether the AI defends cities as well as it holds the land, and the simulation's cost (38 s of CPU per
      campaign instead of 26)
- [x] Split the bundle into cacheable chunks (libraries, map data, simulation, art, interface)
- [x] Keep the `window.__game` debug handle out of the published build (dev server and `npm run build:e2e` only)
- [ ] Lazy-load the world context layer and the rarely opened windows (research tree, city skylines)
- [x] Sound: event cues, distant battle ambience, interface sounds, public-domain period music; N mutes
- [x] Sound window: mute, overall / music / effects volumes, the piece playing now and a skip (rail on the desktop, More on phones)
- [x] 3D city models on the map: each city shows its buildings (on category-coloured plinths), free slots as empty
      plots, construction, battles, regional architecture and the capitals' landmarks; the tooltip lists them too
- [x] 3D armies on the map: zoomed in, each army is a 3D model of its main unit for its nation and generation,
      standing in spots around its city, marching edge to edge along its road facing its heading (troopships at sea)
- [x] Map underlay and provinces built as one topology from the same Natural Earth data, so coasts line up; softer,
      lower-contrast relief
- [x] Cities drawn as part of the map instead of on a round token: a web of streets that fades into the countryside,
      main roads running on towards the neighbouring cities, the old town round the landmark and each building on its
      pad around it; seaside cities keep to the land (streets stop at the coast) and get a port on the real coast
- [x] A map that reads at a glance: lighter national washes over natural relief, each power's colour along the inside of
      its border under a cased border line, your own land lit up inside a glowing white outline, the front with an enemy
      in red; zoom to 20× the whole-theatre view (overlays stop growing, so fronts spread out) with close-up relief
      tiles baked on demand

### Polish pass (done)

- [x] Attack by right-clicking an enemy army (or clicking it in move mode); route preview and tooltip on army counters
- [x] Confirm before declaring war or leaving the campaign; Escape closes the innermost window first
- [x] Cancel construction; full refund for jobs that have not started, refunds at the price paid
- [x] Peace offers: 4-minute retry delay after a refusal or expiry (ends AI offer spam); countdown on the offer card;
      answer offers from the Diplomacy window
- [x] Resource breakdown (production, upkeep, net) on the top bar; live rates from the first second
- [x] Battle box in the province card (with each side's morale); results screen with provinces captured, units
      destroyed, units lost and retreats ordered
- [x] Alerts that wait while paused; Ctrl/Alt shortcuts left to the browser; working campaign-speed select
- [x] Event wording ("the United Kingdom", "occupied the Netherlands"), config-driven rule text, distinct tech art,
      map key for army rims, country names as a background layer placed clear of cities, constant-size neutral hatching
- [x] Removed dead code and config (unused exports, icons, styles, AI keys, unit and building codes)
- [x] Randomised invariant test; the browser playthrough no longer hangs after finishing

### Polish pass 2 (done)

Found by playing full campaigns in the browser and reading the code end to end.

- [x] Clicks reached the wrong army where counters overlapped (a passing foreign army over your own): counters are now
      drawn other nations' first, then yours, then the selection. Armies in one province sit in rows of two instead of
      towers that buried neighbouring cities
- [x] The browser playthrough raced the British AI to Belgium and failed at random; it now plays Spain into Portugal,
      which no other power can reach
- [x] The campaign opens on your own territory (Iberia used to sit under the field reports); zoom stops before the
      relief texture blurs
- [x] Research waiting for funds said "No research"; the top bar and research window now name the queued project and
      what it lacks. Tree nodes ellipsize long names; node times follow research speed; clearer infantry branch icon
- [x] Build rows say why they are unavailable; one project per city is explained once; a building cannot be demolished
      while something that needs it is under construction
- [x] Other powers' wars and treaties alert in a neutral tone; hover card lists units by nation ("2 Danish units");
      "Denmark · Denmark" headers, "1 formations", the morale target line through its label fixed; merging keeps the
      senior army's name
- [x] Events name the army that halted, withdrew or starved; recruits are reported by national design ("Poilus ready
      in Paris"); neutral garrisons are "overwhelmed", not "encircled"
- [x] Corrected equipment details (Panhard 178, 105 mm mle 1935 B, Polish 20TP) and tech and speciality descriptions
      that overstated their effects; removed dead code and styles

### Playtest fixes: army orders

- [x] Stop did nothing on a one-province march (it only cut the path after the current leg): Stop and Hold now halt at
      once, an army on the road turning back to the province it set out from. The Stop button applies to every selected
      army
- [x] Split was greyed out until formations were ticked, with nothing to say so: with none ticked it splits the army in
      two, each half with a share of every kind of unit
- [x] Closing the army card returned to the city it stood in instead of the map
- [x] The overview map is hidden until its button (under the zoom buttons) opens it
- [x] With several armies selected, Split, Merge and Disband acted on the first army only (Merge on every army in its
      province): they now act on the selection, Merge joining the selected armies that stand together

## M4 — Fog of war and diplomacy

- [x] Fog of war: provinces and armies see one province around them, reconnaissance units two over open land
      (mountains and narrow seas are seen across but not beyond, seas over 350 km not at all); unseen land is veiled and
      hides armies, battles, sieges, buildings and morale; the fog lifts when the campaign ends
- [x] Shared sight between co-belligerents (powers fighting a common enemy) with the Liaison Officers research; the
      game calls them co-belligerents, not allies, since nobody agrees to it
- [x] Computer opponents play under the same fog: they know the map, the public military power figures and what they
      (and co-belligerents, with Liaison Officers) can see, guess at the rest from public totals, and remember enemy
      armour
- [ ] Alliances as treaties that both sides agree to (today there are only co-belligerents), right of passage,
      non-aggression pacts, coalition victory
- [ ] Peace terms: province transfers and reparations
- [ ] Minor powers that can be courted or guaranteed, and that react to invasions of their neighbours

## M5 — Air and naval warfare

- [ ] Ports and naval units: transports replace abstract sea crossings; blockades; naval combat
- [ ] Air units: fighters, bombers, air superiority, strategic bombing of industry
- [ ] Coastal provinces and sea zones as map entities

## M6 — Later eras

- [ ] Cold War: jets, missiles, nuclear deterrence (abstracted)
- [ ] Modern: precision weapons, drones, cyber
- [ ] Plausible future: autonomy, directed energy, space assets
- [ ] Era-specific unit models and research trees per era

## M7 — Global map and server

- [x] Equipment blocs (Western, Central, Eastern): a new nation inherits named designs, formation names and unit
      art from its bloc and overrides only what it wants (see docs/ADDING_A_COUNTRY.md)
- [x] Hungary, the first nation added through blocs; older saves take in newly added nations
- [x] Power tiers (great, major, minor; minor powers computer-only) that scale output, treasury, starting army,
      objective VP, capital size and province count
- [x] Starting setups generated from each nation's tier and its province rows
- [x] The seven neutral states are now computer-controlled minor powers (garrisoned by the AI at about five units)
- [ ] Seed land connections from the map build; propose province rows from Natural Earth populated places
- [ ] Group minor powers in Diplomacy and on the results screen once there are many
- [x] Results screen: the race over the campaign (score, objective VP, provinces), from a score history the simulation now keeps
- [x] Hungary's missing neighbours: Romania and Serbia (major powers), Slovakia, Slovenia and Croatia (minor powers)
- [x] A test that every shared border has a movement link (`scripts/map/check-borders.ts` prints the report)
- [ ] Eastern-bloc nations east of Poland and Romania
- [ ] A nation picker that scales past a dozen nations (pick on the map)
- [ ] Expand beyond Europe: more theatres, then the whole world
- [ ] Authoritative multiplayer server running `src/sim` unchanged; client sends commands only
- [ ] Persistent offline progression for the **Slow** (~1 week) campaign speed
- [ ] Accounts, matchmaking, reconnects; save migration between schema versions

## M8 — Espionage and intelligence

- [ ] Spies, sabotage, intelligence reports, counter-intelligence

## Parking lot (ideas not yet scheduled)

- Partisans and revolts in occupied provinces with very low morale
- Generals and field marshals with traits, assigned to armies
- Historical events and national decisions (e.g. "Maginot Line", "Rearmament")
- Weather and seasons (mud, winter attrition); rivers as defensive lines
- War damage to city buildings from prolonged battles and future strategic bombing
