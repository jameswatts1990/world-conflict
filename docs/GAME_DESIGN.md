# Game Design Document (living)

_Status: Milestone 2 (Depth) in progress. All numbers live in `src/sim/config/` and `src/sim/scenario/`; this
document explains intent. Update it whenever those files change meaningfully._

## 1. Vision

Continuous real-time grand strategy in the style of Conflict of Nations, combined with technological progression
through eras. Recognisable Earth with **modern national borders** is the stage for an **alternate history**: every
power starts with **Great War (WWI) technology** and broadly balanced capabilities, then researches its way
through the Interwar period to **WWII**. Later milestones continue to the Cold War, Modern and plausible Future eras.

Each nation should feel like itself: its own named equipment, formations numbered in its own language, its own
uniforms and insignia, and one small national speciality.

Two campaign speeds (targets, tuned by playtesting):

| Speed | Target length | Status |
| --- | --- | --- |
| Standard | ~2–3 hours | Playable (time limit 150 min) |
| Slow | ~1 week | Defined (`durationScale` 67) but needs the server-backed version |

## 2. Scope

Local single-player campaign, Standard speed, WWI→WWII. Out of scope for now (see BACKLOG): deeper diplomacy,
espionage, naval and air warfare, later eras, multiplayer.

## 3. The theatre

- **Six playable nations:** United Kingdom, France, Germany, Italy, Spain and Poland. The human picks one; the AI
  plays the rest.
- **Seven neutral minor states:** Belgium & Luxembourg, Netherlands, Denmark, Switzerland, Austria, Czechia and
  Portugal. They are garrisoned, never attack, and can be invaded by anyone at any time.
- **50 playable provinces**, merged from Natural Earth admin-1 regions. Each has a principal city (movement
  anchor) with a population and starting city tier, two to five secondary towns (drawn at close zoom), a terrain
  type, base output, a coastline flag and optionally an oil field or objective value.
- **109 explicit movement connections**: 90 land, 12 mountain passes and 7 sea crossings. Connections are
  authored data, separate from the map shapes.
- The rest of the world is drawn hatched grey as context.

### Balance assumptions

Each nation's core provinces are normalised to the same base output (260 money, 140 materials and 70 manpower per
minute), one oil province, 5 objective VP, the same city ladder (one Metropolis, one Large City) and the same
13-unit starting army: capital 3 INF + 1 ART, heartland 2 INF + 1 ART, plus 5 INF and 1 cavalry on the borders.
Geography stays asymmetric, and each nation has one modest speciality (§6.4).

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

Economy, military and civic buildings use a **slot**; infrastructure does not. Some levels need a bigger city.
Demolishing frees a slot (no refund).

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
d'Infanterie", "1. Panzer-Regiment", "1ª Armata"). Every nation fields its own named equipment per generation
(Mark IV, Renault FT, A7V, Fiat 3000, Trubia A4, 7TP …). A few unbuilt projects fill gaps and are labelled so.

### 6.4 National specialities

| Nation | Speciality | Effect |
| --- | --- | --- |
| United Kingdom | Combined Operations | No penalty for attacking straight off a sea crossing |
| France | Ligne Maginot | Fortifications 30% more effective and 20% cheaper |
| Germany | Bewegungskrieg | Armour and motorised units 10% faster, 15% more morale shock |
| Italy | Alpini | Mountain troops +20% attack and defence, 20% cheaper |
| Spain | La Legión | Assault infantry +20% resilience, +10% attack, always raised as Regulars |
| Poland | Ułani | Cavalry +25% attack, +10% speed, +15% resilience |

### 6.5 Armies and movement

- An army is a stack of units. Leg time is set by the **slowest unit for that leg**: each type has its own speed and
  its own factors for passes, straits and terrain (mountain troops climb, lorries bog down). Owned railway
  junctions speed legs up. The minimum leg is 15 s.
- Orders use Dijkstra over legal provinces: own territory, nations at war, and neutral states.
- Armies on a multi-leg order **hold** to fight and to capture each hostile province, then continue. An explicit
  new order leaves immediately (retreat). Split, merge and **disband** (half the manpower returns) are available
  while stationary.

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
also drains a little morale, more when outnumbered, and every destroyed unit shakes the rest of its army. When an
army's strength-weighted morale falls below **25%** it **routs**: it flees to an adjacent friendly province with
no enemy in it (supplied and well-garrisoned ones preferred), losing 8% strength (4% with recon), and cannot take
orders for 30 s. **An army with nowhere to run surrenders** — encirclement is the way to destroy armies.
Neutral garrisons cannot retreat and surrender when broken, but are 40% more resilient. Out of combat, morale
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

58 technologies in **six branches** (Infantry & Doctrine, Artillery, Armour & Mobility, Industry, Logistics &
Engineering, Society & Morale) across **eight columns in four eras** (Great War, Twenties, Thirties, Second World
War). Technologies unlock units and buildings, upgrade equipment generations, and grant modifiers.

- One research slot; State Research Institutes adds a second. Universities (+10% each, up to three) and
  Operational Research (+20%) speed research up.
- Cost is paid when a project starts; cancelling refunds half. A queue (up to 8) starts projects in order as
  slots, prerequisites and funds allow. Clicking a locked technology in the tree queues its whole path.
- **Era:** Interwar after 3 technologies from the Twenties onwards; WWII after 3 from column 5 (1935) onwards.
- The tree is deliberately longer than a campaign: in AI campaigns nations finish 35–50 of the 58 technologies.

## 9. War and peace

- All powers start at **peace**. Declaring war is instant. After peace there is a 5-minute truce.
- Peace can be offered after 3 minutes of war; offers expire after 90 s. Peace is status quo.

## 10. Victory

- **Objectives:** 37 VP in total (capitals 3, industrial heartlands 2, neutral capitals 1). Holding **40% (15
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
  alpine fronts, siege guns against forts. Bankrupt AIs disband their weakest rear units.
- **Military:** armies about to break fall back before they rout; starving or worn-out armies go home to
  recover; up to two offensives mass at a staging province and strike together, frontier armies leaving a rear
  guard sized to the threat that remains; targets whose defenders would be encircled are preferred; threatened
  provinces are covered by the nearest free armies; the rest moves up to the front. An enemy stack only counts
  fully against one province, so a single army cannot tie down a whole frontier.

## 12. Architecture

- `src/sim` has no React or DOM dependency. All state is plain JSON (`GameState`), so it can move to an
  authoritative server unchanged.
- **Explicit commands** (`move`, `stop`, `split`, `merge`, `disband`, `recruit`, `cancelRecruit`, `build`,
  `demolish`, `research`, `queueResearch`, `unqueueResearch`, `cancelResearch`, `declareWar`, `offerPeace`,
  `respondPeace`) are validated, applied at tick boundaries and logged. `replay()` reproduces a game.
- **Seeded RNG** (mulberry32) state is stored inside the game state.
- **Effects** (`Effect` in `types.ts`) are declarative and shared by technologies and national specialities.
- **Geography is separate from rules.** Shapes are only for rendering; adjacency and travel are scenario data.
- **Saves** are versioned (`schemaVersion` 2) and tied to a scenario id. Load rejects incompatible files.

## 13. Presentation

A map-centred layout with a dark UI frame and a parchment-toned map.

- **Map:** ownership colours, or morale, city-size and supply views (V). City markers grow with tier; secondary
  towns appear at close zoom. Army counters show the army's main unit in its national art with strength and
  morale bars, a white flag when routed, and dashed routes for marching armies.
- **City view** (click a province): a procedural skyline that grows with the city and shows every building,
  construction and battle; morale and growth meters with factor breakdowns; a building-slot grid; a build picker
  by category; unit cards with each nation's art and named designs; armies present and connections.
- **Army panel:** army and formation names, named equipment, veterancy chevrons, strength and morale per
  formation, orders including disband.
- **Research tree:** era columns, branch rows, prerequisite lines, path highlighting, slots and queue.
- Unit art: drawn side-views for all 13 types × 3 generations × 6 nations (plus neutrals), with national
  uniforms, headgear, camouflage and insignia; compact icons for counters.

## 14. Open questions for playtesting

- Is 15 VP / 90 s reachable for a human in 2–3 hours? AI-vs-AI campaigns currently end on the time limit.
- Battles last about 1–2 minutes and end in routs: is that the right pace, and is encirclement readable enough?
- Is city growth worth its slots, and is the research tree's length right for a 2.5-hour game?
- Do national specialities feel distinct without breaking the starting balance?
