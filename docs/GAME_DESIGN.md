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

- **Nine playable nations:** the great powers United Kingdom, France, Germany, Italy, Spain, Poland and Hungary,
  and the major powers Romania and Serbia. The human picks one; the AI plays the rest. The theatre's south-eastern
  edge follows Romania's and Serbia's borders.
- **Ten minor powers:** Belgium & Luxembourg, the Netherlands, Denmark, Switzerland, Austria, Czechia, Portugal and
  Slovenia, one province each, and Slovakia and Croatia, two each; always computer-controlled. They are there to
  be conquered, at a price. They recruit, research, defend themselves and make peace, but **never start a war and
  never win** (§10); invading one means declaring war on it. Every minor capital is fortified (level 2,
  Switzerland's mountain redoubt 3) and starts with six infantry divisions, which the AI tops up to about seven or
  eight as a garrison, not a field army. Taking one costs a real army: an eight-unit probe fails, and about twelve
  to fourteen units with artillery take it in three to five minutes while losing 40–60% of their strength
  (Switzerland needs about sixteen). The engine still supports neutral states (garrisoned, never attack, open to
  invasion without war); this scenario has none.
- **69 cities, each a province of its own, in 69 provinces of land round them** (138 provinces). The land is
  merged from Natural Earth admin-1 regions and keeps the region's name (Bavaria, the Midlands; round a capital
  it is named for the countryside: Brandenburg, the South East, La Mancha, Pest, Muntenia, Vojvodina). Each city
  is drawn tight round itself, an irregular ring of 17 to 30 km by size that keeps clear of every land border
  and follows the coast where it reaches the sea (`scripts/map/city-provinces.ts`). A city has a population,
  starting tier, terrain, base output, a coastline flag and optionally an oil field or objective value; its land
  has a terrain (never urban: round a capital it is the plain or hills it stands in), two to five secondary towns
  (dots at close zoom) and an anchor in its interior where its armies stand. The engine allows land with no city
  at all; this map has none yet.
- **Movement connections** are written between rows (a city with its land): 127 land, 21 mountain passes and 11
  sea crossings, each joining the two lands, plus every city's link to its own land, its only way in or out
  (228 in all). Connections are authored data, separate from the map shapes; a test checks that every shared
  border has a land or mountain link and every such link a shared border (`scripts/map/check-borders.ts` prints
  the same report). The North Sea (Manchester–Hamburg), Bay of Biscay (Cardiff–A Coruña) and western
  Mediterranean (Barcelona–Palermo) crossings give every great power except Poland at least two great or major
  powers as neighbours, so France is not the only target for Britain, Italy and Spain.
- The rest of the world is drawn hatched grey as context.

### Balance assumptions

Every nation has a **power tier** (`src/sim/config/powers.ts`) that sets its start, so nations of one tier start
broadly balanced:

| Tier | Playable | Output per minute (money / materials / manpower) | Starting army | Objective VP | Cities |
| --- | --- | --- | --- | --- | --- |
| Great | Yes | 260 / 140 / 70 | 13 units | Capital 3, heartland 2 | 6–9 |
| Major | Yes | 150 / 80 / 40 | 8 units | Capital 2, heartland 1 | 3–5 |
| Minor | No (computer-controlled; never wins) | 70 / 35 / 20 | 6 units behind level-2 forts | Capital 1 | 1–2 |

Europe has seven great powers, two major powers and ten minor powers. Each great power has one oil province, the same city ladder (one
Metropolis, one Large City) and the same 13-unit army: capital 3 INF + 1 ART, heartland 2 INF + 1 ART (garrisons
in those cities), plus 5 INF and 1 cavalry in the field (on the land round its cities). Major powers keep the same share of income on starting upkeep; minor powers spend more
(about a quarter), since their garrison is what makes them worth an investment. Starting buildings
and armies are generated from the tier and the province rows (`src/sim/scenario/build.ts`); field units go where
the rows place them, or onto border provinces first. Geography stays asymmetric, and each playable nation has one
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

- All output comes from the cities. The land round them produces nothing yet: it is where armies march and fight,
  and whoever holds it can cut its city off from supply. (Upgrades for land without a city, such as field
  hospitals, barracks or farms, are on the roadmap.)
- City output = base × buildings × city tier bonus × **morale factor** × research. The morale factor is
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

Economy, military and civic buildings use a **slot** and stand only in cities; infrastructure needs no slot and
can also be built on the land between them (forts, a supply depot, a railway junction, coastal batteries where a
sea crossing lands). Some levels need a bigger city. A city or a province of land builds one project at a time. Demolishing frees a slot (no refund); a building cannot be demolished while another one
that needs it stands or is being built. Construction and recruitment can be cancelled: the full price comes back until
work has started, half of it after. The refund is what was paid, even if research has since made the job cheaper.

| Building | Category | Levels | Effect |
| --- | --- | --- | --- |
| Industrial Works | Economy | 3 (L2 City, L3 Large City) | +30% money, +60% materials per level |
| Commercial Exchange | Economy | 2 (City, Large City) | +35% money per level |
| Power Station | Economy | 1 (City; needs Industrial Works; research) | +20% money and materials here, +10% materials in your cities next door (those in the lands bordering its own) |
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
  modifiers (supply, treasury, combined arms, recon +10%, sea landing −25%, home soil), reduced by the defender's
  fortifications (less the attacker's fort-busting share). Damage is divided by the target's max HP.
- **Home soil:** an army fighting in one of its own nation's home provinces, defending it or liberating it, hits
  harder and holds its nerve better: by nothing at national morale 30 or below, rising to +20% at 90 or above
  (about +13% at the starting 70). The battle view shows each side's bonus.
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
override nearly everything, Hungary only its hussars and five armour designs, and Romania and Serbia nothing.
Within a bloc, nations are told apart by counter colour and by the bloc insignia drawn in each nation's colour.
Blocs are equipment, not alliances. See [ADDING_A_COUNTRY.md](ADDING_A_COUNTRY.md).

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
| Romania | Ploiești | Refineries produce 25% more fuel and cost 20% less to build |
| Serbia | Kolubara | Infantry +15% morale resilience and +10% defence |

Specialities are optional: a nation without one shows its bloc instead.

### 6.5 Armies and movement

- An army is a stack of units. Leg time is set by the **slowest unit for that leg**: each type has its own speed and
  its own factors for passes, straits and terrain (mountain troops climb, lorries bog down). Owned railway
  junctions speed legs up. A leg between two lands is as long as the road between their cities; the minimum leg
  is 15 s. Stepping out of a city into its land, or back, is a short 12 km march of at least 5 s, so a march from
  city to city takes about as long as it did before cities were provinces of their own.
- Orders use Dijkstra over legal provinces: own territory, nations at war, and any neutral states.
- March orders come in three kinds. **Move** marches straight to the destination, holding only to fight where an
  enemy army bars the way, and takes the destination itself (provinces passed through stay the enemy's, so the
  army may march itself out of supply). **Attack** also holds to capture each hostile province on the route, then
  continues (the computer's orders are all attacks). **Patrol** marches back and forth between the army's position
  and the destination until stopped, fighting and capturing like Attack. **Stop** halts the army at once: one on
  the road turns back to the province it set out from, taking as long as it has marched (stopping it again does not
  turn it round once more). **Hold position** halts it the same way and keeps it there, never withdrawing on its
  own, until it is given a new march order or released. Right-clicking attacks into foreign land and moves within your own. An explicit new order leaves
  immediately, even from a battle (a withdrawal under fire, see §7). Split, merge and **disband** (half the
  manpower returns; not in battle) are available while stationary. Split takes the ticked formations into a new
  army or, with none ticked, every other formation of each kind, so both halves keep the army's mix. With several
  armies selected, every order applies to all of them: Split halves each one, Merge joins those standing in the same
  province (each group into its senior army), and Disband stands down every one that is not marching or in battle;
  ticking formations needs a single army.
- Each army has a **Fall back when broken** option, off by default: when its strength-weighted morale drops below
  **25%** in battle it withdraws on its own to the best friendly neighbouring province, paying the usual price of a
  withdrawal under fire. With nowhere to go, or while holding position, it fights on. A split army keeps its
  parent's options; a merged one the senior army's.

### 6.6 Capture and supply

- An enemy army alone in a province captures it in 20 s (10 s for open land, which has no city to fight through),
  + 10 s per fort level, + 8% per city tier above Town, × 1.5 for capitals, × 1.5 with an Occupation HQ;
  reconnaissance units make it 30% faster. An attack on a city takes the land round it first; a city whose land is
  lost is cut off (unless it is a capital or has a depot).
- A province is **in supply** if connected through its owner's territory to a hub (capital or Supply Depot).
  An army is supplied there or within one connection of it (Supply Corps research +1; railway junctions +1).
- Unsupplied armies fight at 75% and do not recover; after 120 s they lose strength and morale.

### 6.7 Sight and the fog of war

- A nation sees every province it holds and every province where its armies stand (or march from), and the provinces
  one connection away from them. An army with a reconnaissance unit (cavalry, armoured cars) sees two connections away
  over open land. Mountains and narrow seas (crossings up to 350 km, such as the Channel) are seen across but not
  beyond, so scouts in Piedmont see Provence and the Rhône valley, not Bordeaux; wider seas (Sardinia to Barcelona,
  Rome to Split) hide the far shore altogether. Sight is reckoned over the land: a city looks out from the land round
  it, and whoever sees a land sees into the city in its middle. A marching army is seen at the nearer end of its road.
- **Allies** are powers at peace with each other and at war with a common enemy (there are no treaties yet). With
  **Liaison Officers** (Society & Morale, the Twenties, after Staff College) a nation also sees everything its allies see
  with their own eyes. The research only helps the nation that has it.
- Under the fog the player sees who holds each province and how big its city is, nothing else: no armies, battles,
  sieges, buildings, construction, morale or supply. The map dims it under a veil and drifting cloud. When the
  campaign ends the fog lifts.
- Sight is worked out from the state whenever it is asked for (`src/sim/visibility.ts`) and never stored.
- **Computer opponents play under the same fog** (§11): they know only what a human in their place could.

## 7. Morale

Morale works on three levels.

**Unit morale (0–1).** Every hit costs morale as well as strength: hp damage × the shooter's **shock**
(tanks 1.4, heavy tanks 1.6, siege guns 1.4, assault troops 1.4, artillery 1.25, infantry 1.0) × 1.3, divided
by the target's **resilience** (type, veterancy, nation) and by 1.3 for defenders on their own ground. Each round
also drains a little morale, more when outnumbered, and every destroyed unit shakes the rest of its army. Low
morale blunts firepower (down to half at zero), but **armies never break: they fight to the death** unless their
owner orders them out (or has set them to fall back when broken, see §6.5). **A withdrawal under fire** costs
every unit 15 strength points (7.5 with recon screening it) and 10% morale; units too weak to get away are left behind and count as destroyed, so an army already cut to
pieces may not escape at all. Encirclement still matters: with no friendly province next door there is nowhere to
withdraw to. Neutral garrisons never withdraw, and are 40% more resilient. Out of combat, morale
recovers 5% per 10 s (×1.5 in supplied home territory, ×2 at a hospital, ×0.5 while marching), up to a **cap**
set by national morale.

**Province morale (0–100)** drifts towards a target by 1 point every 10 s. "Next door" for civilians means the
province's own land and city, the lands bordering it and the cities in them. Core provinces start from 70;
occupied ones from 25 (+12 with a garrison, + up to 15 for integration over 30 minutes, +20 with an Occupation
HQ). Modifiers: housing, hospital and propaganda; research; −4 per war and up to −15 war weariness; −10 with an
enemy army next door; −20 during a battle; −10 cut off from supply; −8 while the treasury is empty; −20 when the
capital is occupied. Shocks: declaring war −3 (the victim's people rally +2); a captured province starts at 25
(45 if liberated); its neighbours lose 8; losing the capital costs every core province 15.

**National morale** is the population-weighted average of core city morale (land has no population of its own). It caps unit morale
(`0.45 + 0.0085 × national morale`, between 0.5 and 1), sets how much harder armies fight on home soil (from
nothing at 30 to +20% at 90), and the AI sues for peace when it falls low.

## 8. Research

60 technologies in **six branches** (Infantry & Doctrine, Artillery, Armour & Mobility, Industry, Logistics &
Engineering, Society & Morale) across **eight columns in four eras** (Great War, Twenties, Thirties, Second World
War). Technologies unlock units and buildings, upgrade equipment generations, and grant modifiers.

- One research slot; State Research Institutes adds a second. Universities (+10% each, up to three) and
  Operational Research (+20%) speed research up.
- Cost is paid when a project starts; cancelling refunds half. A queue (up to 8) starts projects in order as
  slots, prerequisites and funds allow. Clicking a locked technology in the tree queues its whole path.
- **Era:** Interwar after 3 technologies from the Twenties onwards; WWII after 3 from column 5 (1935) onwards.
- The tree is deliberately longer than a campaign: in AI campaigns nations finish 30–50 of the 60 technologies
  (fewer when beaten early).
- A queued project that cannot be paid for yet waits, and the queue behind it waits too; the top bar and the research
  window say what it is still short of.

## 9. War and peace

- All powers start at **peace**. Declaring war is instant, from Diplomacy or by ordering an army into the other
  nation's land (which asks first). After peace there is a 5-minute truce.
- Peace can be offered after 3 minutes of war, and offers expire after 90 s. After an offer is rejected or ignored, the
  side that made it waits 4 minutes before proposing again (this also keeps the AI from flooding the player with
  offers). Peace is status quo: borders freeze and trespassing armies withdraw.
- The AI accepts peace when weaker (power below 85% of the enemy's), demoralised (national morale below 40), war-weary
  (25 min) or after losing its capital. It offers peace when beaten (power below 60% of the enemy's with its own core
  occupied) or demoralised (morale below 32), and now and then once war-weary.

## 10. Victory

- **Objectives:** 51 VP in total (great-power capitals 3 and industrial heartlands 2, major-power capitals 2 and
  heartlands 1, minor-power capitals 1). Holding **40% (21 VP)** continuously for **90 s** wins.
- **Time limit:** at 150 min the highest score wins. Score = 10 × VP + 2 × cities + 1 × other provinces + 2 ×
  technologies (a city and its land together score what one province did before cities were split out).
- **Elimination:** a nation with no provinces is out. The last power standing wins.
- **Minor powers never win.** Only great and major powers count for an objective victory, the top score and the
  last power standing; a minor power can survive the campaign, but someone else wins it.

## 11. Computer opponents

The AI uses only the public command API, is deterministic through the seeded RNG, thinks every 8 s, and has a
personality drawn from the seed: aggression (0.35–0.95), economy bias (0.3–0.8), a **doctrine** (armour, infantry or
artillery), two **claims** and an **opening**, so that each campaign plays differently. Claims are cities whose land borders
its own that it covets (an island power has none): a claimed province is worth as much to it as lost core land, and a power
holding one is a likelier war target. The opening sets how it begins: *strike* starts wars of opportunity as soon as
the grace period allows, *expand* keeps the peace 1.5 times as long and takes neutral states first, *build* keeps the
peace twice as long and leaves neutrals alone 1.5 times as long. The bullets describe Normal difficulty.

- **Difficulty** (main menu): Easy opponents get the same resources but play worse. They think every 14 s, field
  three-quarters of the army, want a bigger edge before attacking and run one offensive at a time, garrison more
  thinly, hang on longer before falling back and choose targets less carefully. They start wars of opportunity half
  as often and not before 12 minutes, never join a war on a nation that is already fighting one, and accept peace
  once they are no longer stronger. They do not plan by interior lines (below). The levels live in `AI_LEVELS`
  (`src/sim/config/ai.ts`).
- **Diplomacy:** minor powers never start a war. The others leave minor powers (the former neutral states) alone for
  at least the first 10 minutes, so a player can take a neighbouring one first. After at least a 6-minute grace
  period they start wars of opportunity against weaker or distracted neighbours, preferring ones whose objectives
  border their land, and avoid a second front. **Any power within 3 VP of an objective victory becomes everyone's
  target.** An AI accepts peace when it is actually losing (ground, capital or morale) and closes the worse of two
  fronts first. Its wars have limited aims: once it holds two of the enemy's home cities (land taken on the way does
  not count) and the war is 10 minutes old, it accepts peace even while winning (against a power about to win, it
  fights on). Who is winning a war is weighed on the home cities each side holds, the land round them counting half.
- **Research:** by doctrine and need (slots and new equipment first; anti-tank when facing armour; morale when
  sagging).
- **Cities:** slot-aware plans: industry and exchanges by output, housing to grow, up to three universities,
  recruitment buildings, refineries, propaganda when morale is low, occupation HQs in restive conquests,
  forts where threatened, railways and hospitals on active fronts. It keeps the last free slot for valuable builds.
- **Recruitment:** an upkeep budget and an army cap that grow with the cities it holds and its income; it recruits
  in the cities whose land meets the enemy first. The mix follows
  doctrine and answers the enemy: more anti-tank guns and tank destroyers against armour, mountain troops on
  alpine fronts, siege guns against forts. Bankrupt AIs disband their weakest rear units (only at home, never
  occupiers abroad).
- **Military:** armies fight to the death, withdrawing only when the battle is hopeless (under a fifth of the
  enemy's power there) and the army's morale is spent (below 30%); armies taking a province hold it until it falls
  (unless they would starve first); starving or worn-out armies go home to recover; the capital keeps a garrison
  sized to the danger around it (enemies next door, half of those two provinces away, and a third of the armies of
  great and major powers still at peace, as far as it can see or estimate; reckoned over the land: the capital's own
  land and those next to it count in full, the lands beyond by half, each with its city), set aside before any
  offensive; up to two offensives mass at a staging province and strike together, frontier armies leaving a rear guard sized to the
  threat that remains; targets whose defenders would be encircled are preferred, and land is worth half of what
  the city in its middle is worth on top of its own value, since taking it is the way in; threatened provinces are covered by
  the nearest free armies; the rest moves up to the front. An enemy stack only counts fully against one province, so
  a single army cannot tie down a whole frontier.
- **Interior lines:** at war on several fronts, it picks a main enemy (a power about to win; otherwise the weakest
  against it, the one holding its home provinces or its claims, kept unless another looks clearly better). It
  attacks only the main enemy, holds the other fronts with the armies already there, sends its reserves to the
  main front, and offers the main enemy peace once it holds two of its home provinces, then turns to the next.
  Its distance estimates count its own railway junctions, so a front linked by rail counts as near. Settling the
  other fronts as well was tried and dropped: each truce ran out into a fresh war, and the central powers fared
  worse.
- **Knowledge (fog of war):** the AI knows what a human in its place could: the map (who holds what, city sizes), the
  military power figures the Diplomacy window shows everyone, and the armies, battles and forts within its own sight
  (§6.7), and its allies' with Liaison Officers. Out of sight it assumes the part of a power's army it cannot see is
  spread evenly over that power's unseen provinces, and counts that when sizing an attack whose reinforcements could
  come from the dark. It remembers each nation's share of armour as last seen (each think's sightings move the estimate
  30% of the way), so tanks that drop out of sight still call for anti-tank guns. Enemy armies marching from the fog
  are noticed once they cross the middle of their road. It values Liaison Officers once it has allies.
  All of this lives in the context the AI builds each think (`src/sim/ai/context.ts`).
- **Tuning:** every number the AI weighs lives in `src/sim/config/ai.ts`: war appetite and peace thresholds, what a
  target is worth, how much strength an attack needs, each doctrine's army mix and research priorities, and the
  personality ranges. The balance lab ([BALANCE.md](BALANCE.md)) measures how campaigns play with them, and its tuner
  searches them against the design goals.

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
  travel are in `scenario/europe/connections.ts`; where each land is anchored and which cities reach the sea are
  generated once from the shapes into `scenario/europe/land.ts` by `scripts/map/city-provinces.ts`, which also cuts
  the cities out of the uncut provinces in `scripts/map/base.topo.json` (written by `npm run map:build`). Distances
  are rounded to whole kilometres, so timing never depends on floating-point trigonometry.
- **Saves** are versioned (`schemaVersion`, now 6) and tied to a scenario id. Schema 6 split the cities out: an older
  save gains the land round each city, held by whoever held the old province, and its marches stop where they are.
  Older saves are upgraded step by step on load (`save.ts`); saves from before cities, morale and the research tree,
  from a newer version, another scenario or another program are refused with a message.
- **Messages** are written by the simulation (`text.ts`): names that read with "the" in running text (the United
  Kingdom, the Netherlands, the Midlands) carry the article in scenario data. Rule numbers quoted in descriptions and
  messages come from config, so the text cannot drift from the balance.
- **Tests** cover the rules system by system, determinism and replay, save/load, event wording, and an invariant check
  that plays campaigns with random (often invalid) player orders.
- **Balance lab** (`scripts/balance/`, [BALANCE.md](BALANCE.md)): all-AI campaigns in parallel worker processes, staged
  unit battles and an AI tuner. The tools load the simulation themselves, setting config overrides first, so a run can
  try any config value (`--set`) or play another commit from a git worktree (`--vs`).

## 13. Presentation

The look follows modern browser grand-strategy games: a dark, glassy command-centre HUD around a bright relief map.

- **Map.** Shaded-relief terrain is baked once per session from each province's terrain type (an SVG turbulence and
  lighting filter rendered to a bitmap, `src/ui/map/terrain.ts`), so mountains, hills, forests and marshes read at a
  glance. The relief is kept low in contrast so it never competes with borders, counters and labels. The sea has a depth
  gradient, baked coastal shallows and a 5° graticule; land outside the theatre is dark grey. Provinces and the world
  around them come from one topology, so their coasts and borders are the same lines.
- **Colour on the map** is kept for what the player needs to tell apart, so the land still looks like land. Each power
  washes its territory lightly in its colour (the relief reads through) and runs a band of it along the inside of its
  border; borders between powers are a light line on a dark casing, those between provinces a faint light line. The
  player's own land is lit up: a brighter, richer wash of its colour inside a glowing white outline. The **front**,
  where the player's land meets a power at war with them, is red, as are the rims of enemy armies; other powers' fronts
  with each other are a faint dotted line. A province changing hands flashes in its new owner's colour. Unseen land lies
  under the fog of war (§6.7). Five map views, cycled with V: **Political** (the scheme above), **Terrain** (the same
  borders over almost bare land), **Supply** (your provinces green when connected to a supply hub, red when cut off),
  **Morale** (civilian morale, red to green; unknown under the fog) and **Cities** (city tier).
- **Labels.** Nation names are painted across their territory when zoomed out, as a translucent, widely spaced
  background layer: one per block of land (a conquest across the sea gets its own), placed near the middle but clear of
  cities and counters where possible. Closer in, the provinces without a city carry their names under their anchor.
  Cities have dark name plates with an owner-colour stripe (capitals always, cities and towns as you zoom), gold
  badges for objective VP and capture-progress rings; each city's own border is a dashed light ring. Secondary towns
  are unnamed dots. Name plates are drawn above the armies: armies round a city stand clear of its plate, and an
  army's badge that would cover another city's plate steps up or down off it. City markers grow with tier; secondary towns appear at close zoom. Neutral states (none in
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
  peace with France: declare war to enter"); right-clicking an enemy army attacks it. An order into the land of a
  nation you are at peace with asks first whether to declare war on it (the same dialog as in Diplomacy): confirming
  declares war and gives the order, cancelling gives neither; during a truce the order is refused with the time left.
  On touch screens the move banner offers **Declare war…** in place of Confirm. The army panel's **Move**, **Attack** and **Patrol**
  buttons (M, A, P) pick the kind of order for the next click, **Hold** (G) holds or releases, and its **Fall back
  when broken** box sets that option for every selected army.
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
  the whole theatre. Selecting something never moves the map (only "show on the map" from an alert or a report
  does). Panning only moves the picture: the map is redrawn for the new view when the drag ends, and for a new
  scale at most every 120 ms while a pinch or wheel zoom lasts; marching armies wait while the map is being moved
  (`scripts/dev/pan-perf.mjs` measures it on an emulated phone). Zoom goes to 20× the fitted view. Counters, 3D cities, armies and labels stop growing at about 4×,
  so zooming further spreads a crowded front out instead of magnifying it. Past the zoom where the session's relief
  texture turns soft, sharper tiles of the same relief (the same noise with finer octaves added, lighting steepened to
  match their resolution) are baked for the view once it settles, one at a time, and kept for panning back. A phone
  opens closer in, centred on the capital, and its names and 3D cities wait for a closer zoom than the desktop's, so
  they stand apart.
- **HUD.** The top bar holds the nation's flag and era, resources with per-minute rates (shortages pulse red; pointing
  at one shows stockpile, production, army upkeep and net), national morale, research progress with slots in use and
  the queue, objective VP towards victory, the clock and the speed controls (DEV speeds grouped under an orange tag). A
  left command rail opens Research, Diplomacy, field reports, save/load, help and sound, with badges for an idle
  research slot, wars and peace offers. The selected army and province open as floating cards in a full-height dock on
  the right; the zoom buttons sit beside it (in the corner when nothing is selected), with a button that opens the
  overview map, hidden by default (the browser remembers the choice). Closing the army card returns to the map. Field reports
  (the event log) sit bottom left; alerts pop up top left (below any banner) for wars, peace, research, eliminations,
  shortages, objective captures, provinces you win or lose, enemy attacks on your territory, armies you lose, enemy
  withdrawals, and rejected peace offers. A war declared on you is red, your own declaration orange, and other powers'
  wars and treaties neutral; those alert (and sound) only when one side borders you or both are great powers, the rest
  staying in the field reports. Alerts only count down while the game runs. Keyboard and mouse extras: Shift-drag
  selects your armies in a box, , and . cycle through them, the arrow keys pan and C jumps to the capital. A cursor
  tooltip summarises the province (city size, morale, units present by nation) and the army under the mouse.
- **City view** (click a city's shape, marker or model; on a phone, a tap opens it as a page of its own between the
  top bar and the tab bar, without the skyline so its choices come first): a procedural skyline that grows with the
  city and shows every building, construction and battle (larger screens); a link to the land round it; any battle
  there (sides, units, morale and share of firepower) and capture progress; morale and growth meters with factor
  breakdowns; a building-slot grid with a cancellable construction job; a build picker by category, where a building
  that cannot go here says why (no free slot, needs a bigger city, another building or an oil field); armies present
  and routes. **Recruit** offers only what has been researched: unit cards with each nation's art and named designs
  (cards name a building they still need), and above them a training strip of fixed height (each job, its progress
  and a cancel button), so recruiting again and again never moves the buttons. Tapping a unit's picture or name opens
  its details: role and description, numbers, strengths and weaknesses read from its rules (terrain, armour, punch
  against armour, forts, reconnaissance, second line, nerve, shock, speed, passes, off-road, fuel) and its nation's
  bonus. A province without a city shows its morale, its infrastructure picker and a link to its city.
- **Army panel:** army and formation names, named equipment, veterancy chevrons, strength and morale per formation,
  and orders (move, stop, split, merge, disband). Merging keeps the senior (lowest-numbered) army's name.
- **Windows.** Research is a classic tree: era columns, branch rows, prerequisite lines, path highlighting, slots and
  queue; buttons jump to each era, era titles and branch names stay pinned while it scrolls, dragging pans it, and
  prerequisites from another branch are drawn faintly until researched or traced. Diplomacy shows flags, relation
  pills, national specialities and morale, military power bars, objective chips and answers to incoming peace offers.
  Sound holds mute, overall / music / effects volumes and the piece playing now. Declaring war and leaving the campaign
  ask for confirmation, and Escape closes the innermost window first. The opening tutorial is a Chief of Staff
  briefing. The results screen charts the race over the campaign (score, objective VP or provinces, sampled every
  2 minutes: your line and the winner's in colour, the other powers in grey) and ranks the powers with their
  provinces captured, enemy units destroyed, units lost and retreats ordered; after closing it, a banner brings it
  back. The main menu shows the theatre map with the chosen nation lit up and its speciality, and sets the
  campaign speed, the opponents' difficulty and the seed.
- **Assets.** Everything is drawn in code: flags, unit art (13 types × 3 generations × 6 nations and 3 blocs plus
  neutrals, with national uniforms, headgear, camouflage and insignia), city skylines, 3D city and army models, building, branch and HUD icons
  are inline SVG; the Barlow and Barlow Condensed typefaces are bundled with the build. Nothing is fetched from other
  sites at run time; the sound files load from the game's own files when first needed.
- **Sound.** Recorded effects and period music, all CC0 or public domain (sources in `docs/ATTRIBUTION.md`). Bugle
  calls mark a campaign's start, a war, a capture, victory and defeat; field reports come in as Morse, finished
  research as a typewriter and bell, buildings as an anvil, recruits as marching boots, a battle as a cannon shot and a
  rout as a whistle. Distant bombardment plays under the map while your armies fight, louder with more battles and
  silent when paused. Buttons click like mechanical switches, tabs turn a page and windows unfold a map. An update plays
  at most two sounds and one musical call, with the music dipping under it. Music: Holst conducting *Mars* in the
  menu, then a campaign playlist of 1917–1923 recordings that favours your nation's piece, with silences between.
  N mutes; the Sound window sets the overall, music and effects volumes.

## 14. Open questions for playtesting

- Is 21 VP / 90 s reachable for a human in 2–3 hours? Over 80 AI-vs-AI campaigns about a third end on objectives
  (after 73 to 150 minutes) and the rest on score at the time limit, since winning AIs settle for limited gains; the
  AI conquers nearly every minor power along the way, most between minutes 25 and 50.
- Battles last about 1–2 minutes and end in routs: is that the right pace, and is encirclement readable enough?
- Is city growth worth its slots, and is the research tree's length right for a 2.5-hour game?
- Do national specialities feel distinct without breaking the starting balance?
- Is one province of sight around your land and armies the right amount of fog? Mountains and seas over 350 km now
  stop it: is that tight enough, or should provinces see only across land borders and leave scouting to armies?
- Is Easy gentle enough for a first campaign, and Normal a fair fight for an experienced player?
- Positions differ in AI-only campaigns (see the balance report): Poland, with one great-power neighbour and two
  minor powers to absorb, wins a quarter of them and is never conquered, while Serbia and Romania rarely win. Which
  of these differences are acceptable strengths and weaknesses of a position?
