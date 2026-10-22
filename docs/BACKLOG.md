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

- [x] **Unit morale**: damage breaks morale before it destroys units. Broken armies **rout** to a friendly
      neighbour, and armies with nowhere to go **surrender**, so encirclement matters
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
- [x] Morale-aware combat: attack where it can break the enemy, pull back before routing, exploit encirclement
- [x] Slot-aware city planning (growth, universities, propaganda when morale sags, occupation HQs)
- [x] Research strategies by personality (doctrine) and need
- [x] Diplomacy: opportunistic wars, avoiding two fronts, and ganging up on a power close to victory

### 2.6 Balance and presentation

- [x] Headless campaign sweeps across seeds (`scripts/dev/batch.ts`)
- [ ] Campaigns that sometimes end by objectives: AI-vs-AI games all reach the time limit today
- [x] New tests for every system; save schema 3 (schema 2 saves with the Depth state are upgraded on load)
- [x] Design document, tutorial and controls updated

## M3 — Playtest polish

- [x] Graphics and UX overhaul (relief map, command rail, floating cards, alerts, minimap, route preview) merged with
      the Depth UI: city view, unit art, morale, research tree and the extra map views in the new style
- [x] Run the scripted browser playthrough (`npm run e2e`) end to end and add it to CI
- [ ] Human playtests at Standard speed; tune the VP threshold, combat damage, morale and AI aggression
- [ ] AI: garrison restive conquests, plan sea landings (Britain), use railways for strategic redeployment
- [ ] Explain battles: a battle report (losses, morale, why it was won) and a rout/encirclement preview
- [ ] Better peace: orderly withdrawal marches instead of instant relocation
- [x] Notifications for key events (war declared on you, attacks on your territory, provinces won or lost, research
      done, rejected peace offers)
- [ ] Army groups / multi-select by box-drag; hotkeys to cycle armies
- [x] Responsive layout and touch controls: phone layouts upright (tab bar, bottom sheet) and on the side (slim rail,
      side sheet), tap-to-preview move orders, touch briefing and controls, a touch browser playthrough in CI
- [x] Research on phones: one branch at a time as a list, era by era; on any touch screen a tap shows a technology's
      details (what it brings, needs and leads to) and the order is given from there
- [ ] Phones: try on real devices (iOS Safari, Android Chrome)
- [ ] Code-split the bundle; lazy-load the world context layer
- [x] 3D city models on the map: each city shows its buildings (on category-coloured plinths), free slots as empty
      plots, construction, battles, regional architecture and the capitals' landmarks; the tooltip lists them too
- [x] Map underlay and provinces built as one topology from the same Natural Earth data, so coasts line up; softer,
      lower-contrast relief

### Polish pass (done)

- [x] Attack by right-clicking an enemy army (or clicking it in move mode); route preview and tooltip on army counters
- [x] Confirm before declaring war or leaving the campaign; Escape closes the innermost window first
- [x] Cancel construction; full refund for jobs that have not started, refunds at the price paid
- [x] Peace offers: 4-minute retry delay after a refusal or expiry (ends AI offer spam); countdown on the offer card;
      answer offers from the Diplomacy window
- [x] Resource breakdown (production, upkeep, net) on the top bar; live rates from the first second
- [x] Battle box in the province card (with each side's morale); results screen with provinces captured, units
      destroyed, units lost and armies surrendered
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

## M4 — Fog of war and diplomacy

- [ ] Fog of war and reconnaissance (recon units gain a sight bonus)
- [ ] Alliances, right of passage, non-aggression pacts, coalition victory
- [ ] Peace terms: province transfers and reparations
- [ ] Neutral states that can be courted or guaranteed, and that react to invasions

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
