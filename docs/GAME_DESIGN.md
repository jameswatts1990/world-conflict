# Game Design Document (living)

_Status: Milestone 2 (Depth) in progress. All numbers live in `src/sim/config/` and `src/sim/scenario/`; this
document explains intent. Update it whenever those files change meaningfully._

## 1. Vision

Continuous real-time grand strategy in the style of Conflict of Nations, combined with technological progression
through eras. Recognisable Earth with **modern national borders** is the stage for an **alternate history**: every
power starts with **Great War (WWI) technology** and broadly balanced capabilities, then researches its way
through the Interwar period to **WWII**. Later milestones continue to the Cold War, Modern and plausible Future eras.

Each great power should feel like itself: its own named equipment, formations numbered in its own language, its
own uniforms and insignia, and one small national speciality. To scale to every country, nations belong to an
equipment **bloc** that supplies all of that by default (§6.3); a nation overrides only what makes it distinct.

Two campaign speeds (targets, tuned by playtesting):

| Speed | Target length | Status |
| --- | --- | --- |
| Standard | ~2–3 hours | Playable (time limit 150 min) |
| Slow | ~1 week | Defined (`durationScale` 67) but needs the server-backed version |

## 2. Scope

Local single-player campaign, Standard speed, WWI→WWII. Out of scope for now (see BACKLOG): deeper diplomacy,
espionage, naval and air warfare, later eras, multiplayer.

## 3. The theatre

- **Seven playable nations:** United Kingdom, France, Germany, Italy, Spain, Poland and Hungary. The human picks
  one; the AI plays the rest. Hungary's other modern neighbours lie outside the theatre, so its only road out runs
  through Austria.
- **Seven minor powers:** Belgium & Luxembourg, the Netherlands, Denmark, Switzerland, Austria, Czechia and
  Portugal, one province each and always computer-controlled. They are nations like the others: they recruit,
  research, declare war and make peace, and invading one means declaring war on it. The AI keeps a minor power to a
  garrison of about five units (its starting four plus one, more as its economy grows), not a field army. Their
  capitals keep their old city sizes and border forts (Switzerland 2, Belgium and Czechia 1). The engine still
  supports neutral states (garrisoned, never attack, open to invasion without war); this scenario has none.
- **56 playable provinces**, merged from Natural Earth admin-1 regions. Each has a principal city (movement
  anchor) with a population and starting city tier, two to five secondary towns (drawn at close zoom), a terrain
  type, base output, a coastline flag and optionally an oil field or objective value.
- **119 explicit movement connections**: 100 land, 12 mountain passes and 7 sea crossings. Connections are
  authored data, separate from the map shapes.
- The rest of the world is drawn hatched grey as context.

### Balance assumptions

Every nation has a **power tier** (`src/sim/config/powers.ts`) that sets its start, so nations of one tier start
broadly balanced:

| Tier | Playable | Output per minute (money / materials / manpower) | Starting army | Objective VP | Provinces |
| --- | --- | --- | --- | --- | --- |
| Great | Yes | 260 / 140 / 70 | 13 units | Capital 3, heartland 2 | 6–9 |
| Major | Yes | 150 / 80 / 40 | 8 units | Capital 2, heartland 1 | 3–5 |
| Minor | No (computer-controlled) | 70 / 35 / 20 | 4 units | Capital 1 | 1–2 |

Europe has seven great powers and seven minor powers. Each great power has one oil province, the same city ladder (one
Metropolis, one Large City) and the same 13-unit army: capital 3 INF + 1 ART, heartland 2 INF + 1 ART, plus 5 INF
and 1 cavalry in the field. The smaller tiers keep the same share of income on starting upkeep. Starting buildings
and armies are generated from the tier and the province rows (`src/sim/scenario/build.ts`); field units go where
the rows place them, or onto border provinces first. Geography stays asymmetric, and each great power has one
modest speciality (§6.4).

## 4. Time model

- The simulation advances in **fixed ticks of one game-second**. At Standard and 1x, one game-second is one real
  second. Speed presets multiply every duration by `durationScale`.
- The client runs a fixed-timestep accumulator (`GameLoop`). Rendering frame rate only changes *when* ticks
  run, never *what* they compute.
- Client speeds: 1x and 2x are normal; DEV 5x/20x/60x/200x are development aids, shown in orange with a banner.
- **Pause** is a client concern. The game also pauses when the tab is hidden.

## 5. Economy and cities

Four resources, each with a per-minute rate shown in the top bar: money, industrial materials, fuel, manpower.

- Province output = base × buildings × city tier bonus × **morale factor** × research. The morale factor is
  `0.35 + 0.65 × morale / 70`, capped at 1.2: a contented home province (70) produces at 100%.
- Occupied (non-core) provinces have no flat penalty any more: they start with low morale (§7) and integrate
  over time. Occupied populations still provide only 40% of their manpower.
- **Shortages:** stockpiles cannot go negative. While money is short, armies fight at 80% and morale falls. While
  fuel is short, fuel-burning units move and fight at 50%.

### 5.1 City tiers and growth

| Tier | Name | Building slots |
| --- | --- | --- |
| 1 | Town | 3 |
| 2 | City | 4 |
| 3 | Large City | 5 |
| 4 | Metropolis | 7 |
| 5 | World City | 8 |

Capitals start as Metropolises, industrial heartlands as Large Cities, other major cities as Cities, the rest as
Towns. Cities accumulate **growth points**: +0.4 per minute per Housing level, +0.25 with morale ≥ 60 (−0.25 below
35), boosted by Urban Planning, and −2 per minute while a battle rages. Reaching the threshold (25, 40, 60, 90)
raises the tier: more slots, +10% money and manpower per tier above the start, more population and a bigger
skyline. Capture costs 10 growth points. Each tier above Town also makes capture 8% slower (urban warfare).

### 5.2 Buildings

Economy, military and civic buildings use a **slot**; infrastructure does not. Some levels need a bigger city. A city
builds one project at a time. Demolishing frees a slot (no refund); a building cannot be demolished while another one
that needs it stands or is being built. Construction and recruitment can be cancelled: the full price comes back until
work has started, half of it after. The refund is what was paid, even if research has since made the job cheaper.

| Building | Category | Levels | Effect |
| --- | --- | --- | --- |
| Industrial Works | Economy | 3 (L2 City, L3 Large City) | +30% money, +60% materials per level |
| Commercial Exchange | Economy | 2 (City, Large City) | +35% money per level |
| Power Station | Economy | 1 (City; needs Industrial Works; research) | +20% money and materials here, +10% materials in adjacent owned provinces |
| Fuel Refinery | Economy | 2 | +12 fuel/min per level on oil fields; +6 elsewhere with Synthetic Fuel |
| Housing Estates | Economy | 3 | +12% manpower, +3 morale and +0.4 growth/min per level |
| University | Economy | 1 (Large City) | Research +10% nationally each, up to three |
| Barracks | Military | 1 | Recruits infantry, mountain troops, cavalry; +25% manpower |
| Military Academy | Military | 1 (City; needs Barracks) | Recruits start as Regulars; required for assault infantry |
| Arms Works | Military | 1 | Recruits field artillery, siege guns, anti-tank guns; +10% materials |
| Motor Works | Military | 1 (research) | Recruits armoured cars; motorised infantry with Barracks |
| Tank Works | Military | 1 (research; needs Arms Works) | Recruits light, battle and heavy tanks and tank destroyers |
| Military Hospital | Civic | 1 (research) | Armies here heal 2.5× and regain morale 2×; +3 morale |
| Propaganda Bureau | Civic | 1 (City; research) | +10 morale here, +2 in all core provinces (up to three) |
| Occupation HQ | Civic | 1 (occupied only; research) | +20 morale in an occupied province; capture 50% slower |
| Fortifications | Infrastructure | 3 | Defenders take 12% less damage per level; capture +10 s per level; lose a level when captured |
| Supply Depot | Infrastructure | 1 | Supply hub |
| Railway Junction | Infrastructure | 1 (research) | Legs to or from it 20% faster (35% between two); front-line supply reaches one province further |
| Coastal Batteries | Infrastructure | 2 (sea landings only; research) | Defenders deal +30% damage per level to armies that landed by sea, and shake their morale |

## 6. Military

### 6.1 Units

Thirteen types in four classes. Most have three equipment generations (1914, interwar, 1940); research
upgrades every existing unit of the type in place.

| Class | Unit | Role and mechanics |
| --- | --- | --- |
| Infantry | Line Infantry | Cheap, sturdy defenders, best in rough or urban terrain |
| Infantry | Assault Infantry | Ignore 35% of a fort bonus; high morale shock and resilience; need an Academy |
| Infantry | Mountain Troops | +70% attack and +60% defence in mountains; cross passes almost as fast as roads |
| Infantry | Motorised Infantry | Fast, bog down off-road, burn fuel; half-tracked (partly armoured) in 1940 |
| Mobile | Cavalry | Fast; reconnaissance; fragile against machine guns and armour |
| Mobile | Armoured Cars | Fast, partly armoured reconnaissance; poor off-road; burn fuel |
| Support | Field Artillery | Heavy soft firepower and morale shock from the second line |
| Support | Heavy Siege Artillery | Halve the defender's fort bonus; very slow; helpless when caught |
| Support | Anti-Tank Guns | Devastating hard attack, especially defending in forests and towns |
| Armour | Light Tanks | Cheap, fast armour; outgunned by real armour |
| Armour | Battle Tanks | Armoured breakthrough and shock on open ground; weak in forests, mountains, cities, marsh |
| Armour | Heavy Tanks | Thick armour, big guns, unshakeable crews; slow and thirsty |
| Armour | Tank Destroyers | Turretless armoured guns; superb against tanks, especially defending |

Infantry, field artillery and cavalry are available from the start; everything else is researched.

### 6.2 Combat

- Combat happens when hostile armies are stationary in the same province. Rounds run every 10 s. **The province
  owner's armies use defence values and everyone else uses attack values.**
- **Targeting:** each unit fires at a random enemy unit, weighted: support units are hit about a third as often
  while their army has front-line units to screen them.
- **Hardness:** damage blends soft and hard values by the target's armour hardness (infantry 0, armoured cars
  0.55, tanks 0.8–0.95).
- Damage = value × terrain × (0.4 + 0.6 × strength) × (0.5 + 0.5 × morale) × veterancy × random ±20% × army
  modifiers (supply, treasury, combined arms, recon +10%, sea landing −25%), reduced by the defender's
  fortifications (less the attacker's fort-busting share). Damage is divided by the target's max HP.
- **Sea landings:** an army that arrived by sea crossing fights at −25% until the province is won (Amphibious
  Doctrine cuts this by 70%; Britain's speciality removes it).
- Destroyed units are removed. A battle ends when no hostile pair remains standing in the province.

### 6.3 Veterancy and names

Units gain experience each round fought (+0.08) and for winning a battle (+0.4): **Green** (< 1), **Regular**,
**Veteran** (3), **Elite** (6), dealing 90%–120% damage and resisting morale loss better. Starting armies are
Regulars; recruits are Green unless raised in a city with a Military Academy.

Every unit is a numbered formation and every army a numbered army, named in its nation's style ("12e Division
d'Infanterie", "1. Panzer-Regiment", "1ª Armata"). Every nation fields named equipment per generation
(Mark IV, Renault FT, A7V, Fiat 3000, Trubia A4, 7TP …). A few unbuilt projects fill gaps and are labelled so.

**Blocs** (`src/sim/blocs.ts`) are equipment families that follow who armed whom between 1914 and 1942:
**Western** (French and British exports: Renault FT, Vickers 6-ton, the 75), **Central** (Škoda guns and German
armour) and **Eastern** (Russian and Soviet designs: T-26, BT-7, T-34). Each supplies a complete identity and a
unit look (uniform colours, headgear, insignia). A nation names its bloc and overrides any part: the original six
override nearly everything, Hungary only its hussars and five armour designs. Within a bloc, nations are told
apart by counter colour and by the bloc insignia drawn in each nation's colour. Blocs are equipment, not
alliances. See [ADDING_A_COUNTRY.md](ADDING_A_COUNTRY.md).

### 6.4 National specialities

| Nation | Speciality | Effect |
| --- | --- | --- |
| United Kingdom | Combined Operations | No penalty for attacking straight off a sea crossing |
| France | Ligne Maginot | Fortifications 30% more effective and 20% cheaper |
| Germany | Bewegungskrieg | Armour and motorised units 10% faster, 15% more morale shock |
| Italy | Alpini | Mountain troops +20% attack and defence, 20% less money to raise |
| Spain | La Legión | Assault infantry +20% resilience, +10% attack, always raised as Regulars |
| Poland | Ułani | Cavalry +25% attack, +10% speed, +15% resilience |
| Hungary | Huszárok | Cavalry and armoured cars +15% attack, 10% faster; cavalry always raised as Regulars |

Specialities are optional: a nation without one shows its bloc instead.

### 6.5 Armies and movement

- An army is a stack of units. Leg time is set by the **slowest unit for that leg**: each type has its own speed and
  its own factors for passes, straits and terrain (mountain troops climb, lorries bog down). Owned railway
  junctions speed legs up. The minimum leg is 15 s.
- Orders use Dijkstra over legal provinces: own territory, nations at war, and any neutral states.
- Armies on a multi-leg order **hold** to fight and to capture each hostile province, then continue. An explicit
  new order leaves immediately, even from a battle (a withdrawal under fire, see §7). Split, merge and
  **disband** (half the manpower returns; not in battle) are available while stationary.

### 6.6 Capture and supply

- An enemy army alone in a province captures it in 20 s, + 10 s per fort level, + 8% per city tier above Town,
  × 1.5 for capitals, × 1.5 with an Occupation HQ; reconnaissance units make it 30% faster.
- A province is **in supply** if connected through its owner's territory to a hub (capital or Supply Depot).
  An army is supplied there or within one connection of it (Supply Corps research +1; railway junctions +1).
- Unsupplied armies fight at 75% and do not recover; after 120 s they lose strength and morale.

## 7. Morale

Morale works on three levels.

**Unit morale (0–1).** Every hit costs morale as well as strength: hp damage × the shooter's **shock**
(tanks 1.4, heavy tanks 1.6, siege guns 1.4, assault troops 1.4, artillery 1.25, infantry 1.0) × 1.3, divided
by the target's **resilience** (type, veterancy, nation) and by 1.3 for defenders on their own ground. Each round
also drains a little morale, more when outnumbered, and every destroyed unit shakes the rest of its army. Low
morale blunts firepower (down to half at zero), but **armies never break: they fight to the death** unless their
owner orders them out. **A withdrawal under fire** costs every unit 15 strength points (7.5 with recon screening
it) and 10% morale; units too weak to get away are left behind and count as destroyed, so an army already cut to
pieces may not escape at all. Encirclement still matters: with no friendly province next door there is nowhere to
withdraw to. Neutral garrisons never withdraw, and are 40% more resilient. Out of combat, morale
recovers 5% per 10 s (×1.5 in supplied home territory, ×2 at a hospital, ×0.5 while marching), up to a **cap**
set by national morale.

**Province morale (0–100)** drifts towards a target by 1 point every 10 s. Core provinces start from 70;
occupied ones from 25 (+12 with a garrison, + up to 15 for integration over 30 minutes, +20 with an Occupation
HQ). Modifiers: housing, hospital and propaganda; research; −4 per war and up to −15 war weariness; −10 with an
enemy army next door; −20 during a battle; −10 cut off from supply; −8 while the treasury is empty; −20 when the
capital is occupied. Shocks: declaring war −3 (the victim's people rally +2); a captured province starts at 25
(45 if liberated); its neighbours lose 8; losing the capital costs every core province 15.

**National morale** is the population-weighted average of core province morale. It caps unit morale
(`0.45 + 0.0085 × national morale`, between 0.5 and 1) and the AI sues for peace when it falls low.

## 8. Research

59 technologies in **six branches** (Infantry & Doctrine, Artillery, Armour & Mobility, Industry, Logistics &
Engineering, Society & Morale) across **eight columns in four eras** (Great War, Twenties, Thirties, Second World
War). Technologies unlock units and buildings, upgrade equipment generations, and grant modifiers.

- One research slot; State Research Institutes adds a second. Universities (+10% each, up to three) and
  Operational Research (+20%) speed research up.
- Cost is paid when a project starts; cancelling refunds half. A queue (up to 8) starts projects in order as
  slots, prerequisites and funds allow. Clicking a locked technology in the tree queues its whole path.
- **Era:** Interwar after 3 technologies from the Twenties onwards; WWII after 3 from column 5 (1935) onwards.
- The tree is deliberately longer than a campaign: in AI campaigns nations finish 30–50 of the 59 technologies
  (fewer when beaten early).
- A queued project that cannot be paid for yet waits, and the queue behind it waits too; the top bar and the research
  window say what it is still short of.

## 9. War and peace

- All powers start at **peace**. Declaring war is instant. After peace there is a 5-minute truce.
- Peace can be offered after 3 minutes of war, and offers expire after 90 s. After an offer is rejected or ignored, the
  side that made it waits 4 minutes before proposing again (this also keeps the AI from flooding the player with
  offers). Peace is status quo: borders freeze and trespassing armies withdraw.
- The AI accepts peace when weaker (power below 85% of the enemy's), demoralised (national morale below 40), war-weary
  (25 min) or after losing its capital. It offers peace when beaten (power below 60% of the enemy's with its own core
  occupied) or demoralised (morale below 32), and now and then once war-weary.

## 10. Victory

- **Objectives:** 42 VP in total (great-power capitals 3, industrial heartlands 2, minor-power capitals 1). Holding **40% (17
  VP)** continuously for **90 s** wins.
- **Time limit:** at 150 min the highest score wins. Score = 10 × VP + 3 × provinces + 2 × technologies.
- **Elimination:** a nation with no provinces is out. The last power standing wins.

## 11. Computer opponents

The AI uses only the public command API, is deterministic through the seeded RNG, thinks every 8 s, and has a
personality drawn from the seed: aggression, economy bias and a **doctrine** (armour, infantry or artillery).

- **Diplomacy:** after a 6-minute grace period it starts wars of opportunity against weaker or distracted
  neighbours, preferring ones whose objectives border its land, and avoids a second front. **Any power within 3
  VP of an objective victory becomes everyone's target.** It accepts peace when it is actually losing (ground,
  capital or morale), closes the worse of two fronts first, and keeps fighting a war it is winning.
- **Research:** by doctrine and need (slots and new equipment first; anti-tank when facing armour; morale when
  sagging).
- **Cities:** slot-aware plans: industry and exchanges by output, housing to grow, up to three universities,
  recruitment buildings, refineries, propaganda when morale is low, occupation HQs in restive conquests,
  forts where threatened, railways and hospitals on active fronts. It keeps the last free slot for valuable builds.
- **Recruitment:** an upkeep budget and an army cap that grow with territory and income. The mix follows
  doctrine and answers the enemy: more anti-tank guns and tank destroyers against armour, mountain troops on
  alpine fronts, siege guns against forts. Bankrupt AIs disband their weakest rear units (only at home, never
  occupiers abroad).
- **Military:** armies fight to the death, withdrawing only when the battle is hopeless (under a fifth of the
  enemy's power there) and the army's morale is spent (below 30%); starving or worn-out armies go home to
  recover; armies occupying a hostile province stay until it falls; up to two offensives mass at a staging province and strike together, frontier armies leaving a rear
  guard sized to the threat that remains; targets whose defenders would be encircled are preferred; threatened
  provinces are covered by the nearest free armies; the rest moves up to the front. An enemy stack only counts
  fully against one province, so a single army cannot tie down a whole frontier.

## 12. Architecture

- `src/sim` has no React or DOM dependency. All state is plain JSON (`GameState`), so it can move to an
  authoritative server unchanged.
- **Explicit commands** (`move`, `stop`, `split`, `merge`, `disband`, `recruit`, `cancelRecruit`, `build`,
  `cancelBuild`, `demolish`, `research`, `queueResearch`, `unqueueResearch`, `cancelResearch`, `declareWar`,
  `offerPeace`, `respondPeace`) are validated, applied at tick boundaries and logged. `replay()` reproduces a game from
  its initial state and command log.
- **Seeded RNG** (mulberry32) state is stored inside the game state.
- **Effects** (`Effect` in `types.ts`) are declarative and shared by technologies and national specialities.
- **Geography is separate from rules.** Shapes are in `src/assets/map`, used only for rendering. Adjacency and
  travel are in `scenario/europe/connections.ts`. Distances are rounded to whole kilometres, so timing never
  depends on floating-point trigonometry.
- **Saves** are versioned (`schemaVersion`, now 3) and tied to a scenario id. Older saves are upgraded step by step on
  load (`save.ts`); saves from before cities, morale and the research tree, from a newer version, another scenario or
  another program are refused with a message.
- **Messages** are written by the simulation (`text.ts`): names that read with "the" in running text (the United
  Kingdom, the Netherlands, the Midlands) carry the article in scenario data. Rule numbers quoted in descriptions and
  messages come from config, so the text cannot drift from the balance.
- **Tests** cover the rules system by system, determinism and replay, save/load, event wording, and an invariant check
  that plays campaigns with random (often invalid) player orders.

## 13. Presentation

The look follows modern browser grand-strategy games: a dark, glassy command-centre HUD around a bright relief map.

- **Map.** Shaded-relief terrain is baked once per session from each province's terrain type (an SVG turbulence and
  lighting filter rendered to a bitmap, `src/ui/map/terrain.ts`), so mountains, hills, forests and marshes read at a
  glance. The relief is kept low in contrast so it never competes with borders, counters and labels. Ownership is a
  translucent nation tint over the terrain, with a glowing inner border in each nation's colour. The sea has a depth
  gradient, baked coastal shallows and a 5° graticule; land outside the theatre is dark grey. Provinces and the world
  around them come from one topology, so their coasts and borders are the same lines.
  Five map views, cycled with V: **Political** (strong tint), **Terrain** (light tint), **Supply** (your provinces
  green when connected to a supply hub, red when cut off), **Morale** (civilian morale, red to green) and **Cities**
  (city tier).
- **Labels.** Nation names are painted across their territory when zoomed out, as a translucent, widely spaced
  background layer: one per block of land (a conquest across the sea gets its own), placed near the middle but clear of
  cities and counters where possible. Province names take over when zoomed in. Cities have dark name plates with an
  owner-colour stripe (capitals always, cities and towns as you zoom), gold badges for objective VP and
  capture-progress rings. City markers grow with tier; secondary towns appear at close zoom. Neutral states (none in
  the current scenario) are hatched with lines that keep the same spacing at every zoom.
- **City models.** From one zoom step in, each city is drawn as part of the map rather than on a token. On the
  ground, a lace of white streets, densest in the old town and fraying into the countryside, with main roads running
  on towards the neighbouring cities (the railway, once built, passes the old town with its station). On it, the old
  town's houses round the landmark, in the region's style (slate in Britain, zinc in France, red tile in Germany,
  terracotta in the south), growing denser and taller with the tier, and the owner's flag on the square; the great
  powers' capitals have their landmark (Big Ben, the Eiffel Tower, the Reichstag, St Peter's, the Royal Palace, the
  Royal Castle, and a domed parliament for Budapest). Around the old town, each building has its own recognisable model (smoking factory chimneys, a barracks
  with troops drilling under the flag, a castle-like academy, a tank rolling out of the tank works, a hospital with a
  red cross on the roof, a radio mast, crates at the depot) on a pad in its category's colour (the same colours as the
  city view's slot tiles): industry to the right, the military to the left, civic buildings at the front. Every
  building has a fixed home, so building something never moves the rest. Fortifications are walls round the old
  town, towered at higher levels; free building slots are staked-out plots, construction shows scaffolding and a
  crane, battles smoke and fire. A seaside city keeps its buildings on land and its streets stop at the coast, and
  its port (a quay with a steamer alongside, gun pits for coastal batteries) sits on the nearest stretch of its real
  coast. Models are drawn in code (`src/ui/art/CityModel.ts`, `cityGround.ts`, `iso3d.ts`) and cached as two images
  per city look (the streets, clipped to the land, and the buildings), so panning stays cheap; the name plate hangs in
  front of the built-up area. The cursor tooltip lists the same buildings and free slots.
- **Armies.** Zoomed out, counters in the owner's colour show the army's main unit in its national art, the number of
  formations, and strength and morale bars; Your armies have a white rim, armies of
  nations at war with you a red rim, armies out of supply a red "!" badge, and the selection a running dashed outline.
  Armies standing in one province fill rows of two above its city, yours first, so a crowded province grows a short
  pyramid rather than a tower. Overlapping counters are drawn other nations' first, then yours (marching above
  standing), then the selection, so a click lands on what you most likely meant. Marching routes are animated dashed
  lines with arrowheads. Battles show a pulsing explosion. With your army selected, pointing at a province or an enemy
  army previews the route, highlights the provinces on it and shows the arrival time (or why there is no route: "At
  peace with France"); right-clicking an enemy army attacks it.
- **3D armies.** Wherever the cities are 3D models, so are the armies: each is a low-poly model of its main unit, in
  its generation's equipment and its nation's uniform, headgear, paint (and camouflage) and flag: a squad advancing
  under its colours, assault troops with a flamethrower, mountain troops with a pack mule, a lorry and its riflemen,
  horsemen with lances or sabres, field, heavy and anti-tank guns with their crews, armoured cars, and tanks from the
  Mark IV, A7V and Renault FT to the sloped tanks of 1940. Each stands on a ring in the owner's colour (white-rimmed
  for yours, red for enemies at war with you, a running dashed ring for the selection) under a badge with its flag,
  number of formations, strength and morale. Armies in a province take spots around its city's built-up area, yours
  first: beside it, then its corners, then wider rings, each clear of the others and of the name plate, and an army
  keeps its spot when others arrive. They face the viewer, or the fighting when there is a battle. Marching armies
  walk from the edge of one city to the edge of the next (abreast when several share a road), facing the way they go,
  foot and horse bobbing; armies crossing the sea sail in a troopship with its wake. Arriving, leaving or making
  room, an army walks to its new spot rather than jumping, and a model behind a city stands on its streets but under
  its buildings. The models come from the cities' renderer (`src/ui/art/UnitModel.ts`), turned to one of 16 headings
  and cached as one image per look.
- **Camera.** The campaign opens framed on the player's own territory, above the field reports; the fit button shows
  the whole theatre. Zoom stops at 7× the fitted view, where the baked relief is still sharp. A phone opens closer in,
  centred on the capital, and its names and 3D cities wait for a closer zoom than the desktop's, so they stand apart.
- **HUD.** The top bar holds the nation's flag and era, resources with per-minute rates (shortages pulse red; pointing
  at one shows stockpile, production, army upkeep and net), national morale, research progress with slots in use and
  the queue, objective VP towards victory, the clock and the speed controls (DEV speeds grouped under an orange tag). A
  left command rail opens Research, Diplomacy, field reports, save/load and help, with badges for an idle research
  slot, wars and peace offers. The selected army and province open as floating cards on the right; the overview map
  and zoom buttons sit below them. Field reports (the event log) sit bottom left; alerts pop up top left for wars,
  peace, research, eliminations, shortages, objective captures, provinces you win or lose, enemy attacks on your
  territory, armies you lose, enemy withdrawals, and rejected peace offers. A war declared on you is red, your own
  declaration orange, and other powers' wars and treaties neutral. Alerts only count down while the game runs. A cursor
  tooltip summarises the province (city size, morale, units present by nation) and the army under the mouse.
- **City view** (click a province): a procedural skyline that grows with the city and shows every building,
  construction and battle; any battle there (sides, units, morale and share of firepower) and capture progress; morale
  and growth meters with factor breakdowns; a building-slot grid with a cancellable construction job; a build picker
  by category, where a building that cannot go here says why (no free slot, needs a bigger city, another building or
  an oil field); unit cards with each nation's art and named designs (locked cards name the building they need);
  armies present and routes.
- **Army panel:** army and formation names, named equipment, veterancy chevrons, strength and morale per formation,
  and orders (move, stop, split, merge, disband). Merging keeps the senior (lowest-numbered) army's name.
- **Windows.** Research is a classic tree: era columns, branch rows, prerequisite lines, path highlighting, slots and
  queue. Diplomacy shows flags, relation pills, national specialities and morale, military power bars, objective chips
  and answers to incoming peace offers. Declaring war and leaving the campaign ask for confirmation, and Escape closes
  the innermost window first. The opening tutorial is a Chief of Staff briefing. The results screen ranks the powers
  with their provinces captured, enemy units destroyed, units lost and retreats ordered; after closing it, a banner
  brings it back. The main menu shows the theatre map with the chosen nation lit up and its speciality.
- **Assets.** Everything is drawn in code: flags, unit art (13 types × 3 generations × 6 nations and 3 blocs plus
  neutrals, with national uniforms, headgear, camouflage and insignia), city skylines, 3D city and army models, building, branch and HUD icons
  are inline SVG; the Barlow and Barlow Condensed typefaces are bundled with the build. Nothing is fetched at run time.

## 14. Open questions for playtesting

- Is 17 VP / 90 s reachable for a human in 2–3 hours? AI-vs-AI campaigns currently end on the time limit.
- Battles last about 1–2 minutes and end in routs: is that the right pace, and is encirclement readable enough?
- Is city growth worth its slots, and is the research tree's length right for a 2.5-hour game?
- Do national specialities feel distinct without breaking the starting balance?
