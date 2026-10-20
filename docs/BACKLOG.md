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

## M2 — Depth (in progress)

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

- [ ] 13 unit types in four classes: infantry (line, assault, mountain, motorised), mobile (cavalry, armoured
      cars), support (field artillery, heavy siege artillery, anti-tank guns) and armour (light, medium/battle,
      heavy tanks, tank destroyers)
- [ ] Three equipment generations per type (1914, interwar, 1940); research upgrades units in place
- [ ] Mechanics beyond attack and defence numbers: armour **hardness**, support units fighting from the second
      line, **recon** (army bonus, faster capture), **fortification-busting**, **mountaineers** (fast over passes),
      **shock** (morale damage), fuel-hungry motorised units
- [ ] National designs: every nation fields its own named equipment (Mark IV, Renault FT, A7V, Fiat 3000,
      Trubia, 7TP …) and formations (Poilus, Alpini, Stoßtruppen, Ułani …)
- [ ] Numbered formations and armies in each nation's language ("12e Division d'Infanterie", "3. Armee")
- [ ] Veterancy: Green → Regular → Veteran → Elite from combat experience
- [ ] National specialities: one small, flavourful edge per nation
- [ ] Artwork: drawn silhouettes per unit type and generation, national palettes and insignia

### 2.2 Morale

- [ ] **Unit morale**: damage breaks morale before it destroys units. Broken armies **rout** to a friendly
      neighbour, and armies with nowhere to go **surrender**, so encirclement matters
- [ ] Morale recovers out of combat, faster in supplied home territory and near hospitals
- [ ] **Province morale** (0–100): drives output. It is lowered by nearby enemies, battles, shortages and a lost
      capital, and raised by garrisons, propaganda and time. It replaces the flat 50% occupied-output penalty
      with integration over time
- [ ] **National morale**: the home-front average; caps unit morale and decides when the AI sues for peace
- [ ] Morale map mode

### 2.3 Cities and buildings

- [ ] City tiers (Town → City → Large City → Metropolis → World City) with population and growth
- [ ] Building **slots** per tier, so every build is a choice. Infrastructure (forts, depots, railways, coastal
      batteries) does not use slots
- [ ] 18 buildings across economy, military, civic and infrastructure: markets, power stations, housing,
      universities, military academies, motor works, hospitals, propaganda bureaus, occupation HQs, railway
      junctions, coastal batteries, plus the existing ones
- [ ] City view: skyline illustration that grows with the city's buildings, slot grid and a build picker
- [ ] Secondary towns drawn on the map when zoomed in
- [ ] Development map mode

### 2.4 Research tree

- [ ] About 50 technologies in six branches (Infantry, Artillery, Armour, Industry, Logistics, Society) across
      four eras (Great War, 1920s, 1930s, Second World War)
- [ ] Technologies unlock units, buildings and equipment generations, not just percentages
- [ ] Research slots (gained through research), research speed from universities, and a research queue
- [ ] Classic tree view: era columns, branch rows, prerequisite lines, path highlighting
- [ ] The tree is longer than a campaign, so each nation has to choose a direction

### 2.5 AI

- [ ] Front-aware force allocation: garrisons sized to threat, a reserve, and strike groups
- [ ] Army-size discipline: upkeep budgets and disbanding obsolete units when bankrupt
- [ ] Composition that answers the enemy and terrain (anti-tank against armour, mountain troops on alpine
      fronts, siege guns against forts)
- [ ] Morale-aware combat: attack where it can break the enemy, pull back before routing, exploit encirclement
- [ ] Slot-aware city planning (growth, universities, propaganda when morale sags, occupation HQs)
- [ ] Research strategies by personality, using the queue
- [ ] Diplomacy: opportunistic wars, avoiding two fronts, and ganging up on a power close to victory

### 2.6 Balance and presentation

- [ ] Headless campaign sweeps across seeds; outcomes by objectives as well as by time limit
- [ ] New tests for every system; save schema v2
- [ ] Design document, tutorial and controls updated

## M3 — Playtest polish

- [ ] Run the scripted browser playthrough (`npm run e2e`) end to end and add it to CI
- [ ] Human playtests at Standard speed; tune the VP threshold, combat damage and AI aggression
- [ ] Better peace: orderly withdrawal marches instead of instant relocation
- [ ] Notifications for key events (war declared on you, capital threatened, research done)
- [ ] Army groups / multi-select by box-drag; hotkeys to cycle armies
- [ ] Responsive layout and touch controls
- [ ] Code-split the bundle; lazy-load the world context layer

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
