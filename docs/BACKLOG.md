# Milestone backlog

## M1 — First playable (this milestone) ✅

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

## M1.1 — Playtest polish (next)

- [ ] Run the scripted browser playthrough (`npm run e2e`) end to end and add it to CI
- [ ] Human playtests at Standard speed; tune the VP threshold, combat damage and AI aggression
- [ ] Disband units; AI army-size discipline when bankrupt
- [ ] Better peace: orderly withdrawal marches instead of instant relocation
- [ ] Notifications for key events (war declared on you, capital threatened, research done)
- [ ] Army groups / multi-select by box-drag; hotkeys to cycle armies
- [ ] Responsive layout and touch controls
- [ ] Code-split the bundle; lazy-load the world context layer

## M2 — Fog of war and diplomacy

- [ ] Fog of war and reconnaissance
- [ ] Alliances, right of passage, non-aggression pacts, coalition victory
- [ ] Peace terms: province transfers and reparations
- [ ] Neutral states that can be courted or guaranteed, and that react to invasions

## M3 — Air and naval warfare

- [ ] Ports and naval units: transports replace abstract sea crossings; blockades; naval combat
- [ ] Air units: fighters, bombers, air superiority, strategic bombing of industry
- [ ] Coastal provinces and sea zones as map entities

## M4 — Later eras

- [ ] Cold War: jets, missiles, nuclear deterrence (abstracted)
- [ ] Modern: precision weapons, drones, cyber
- [ ] Plausible future: autonomy, directed energy, space assets
- [ ] Era-specific unit models and research trees per era

## M5 — Global map and server

- [ ] Expand beyond Europe: more theatres, then the whole world
- [ ] Authoritative multiplayer server running `src/sim` unchanged; client sends commands only
- [ ] Persistent offline progression for the **Slow** (~1 week) campaign speed
- [ ] Accounts, matchmaking, reconnects; save migration between schema versions

## M6 — Espionage and intelligence

- [ ] Spies, sabotage, intelligence reports, counter-intelligence
