# Game Design Document (living)

_Status: Milestone 1, first playable. All numbers live in `src/sim/config/` and `src/sim/scenario/`; this
document explains intent. Update it whenever those files change meaningfully._

## 1. Vision

Continuous real-time grand strategy in the style of Conflict of Nations, combined with technological progression
through eras. Recognisable Earth with **modern national borders** is the stage for an **alternate history**: every
power starts with **Great War (WWI) technology** and broadly balanced capabilities, then researches its way
through the Interwar period to **WWII**. Later milestones continue to the Cold War, Modern and plausible Future eras.

Two campaign speeds (targets, tuned by playtesting):

| Speed | Target length | Status |
| --- | --- | --- |
| Standard | ~2–3 hours | Playable (time limit 150 min) |
| Slow | ~1 week | Defined (`durationScale` 67) but needs the server-backed version |

## 2. Milestone 1 scope

Local single-player campaign, Standard speed, WWI→WWII. Out of scope for now (see BACKLOG): deeper diplomacy,
espionage, naval and air warfare, later eras, multiplayer.

## 3. The theatre

- **Six playable nations:** United Kingdom, France, Germany, Italy, Spain and Poland. The human picks one; the AI
  plays the rest.
- **Seven neutral minor states:** Belgium & Luxembourg, Netherlands, Denmark, Switzerland, Austria, Czechia and
  Portugal. They are garrisoned, never attack, and can be invaded by anyone at any time.
- **50 playable provinces**, merged from Natural Earth admin-1 regions. Each has a principal city (movement
  anchor), a terrain type, base output and optionally an oil field or objective value.
- **109 explicit movement connections**: 90 land, 12 mountain passes (Alps, Pyrenees, Jura, Sudetes, Ore
  Mountains) and 7 sea crossings (Dover, Channel, North Sea ×2, North Channel, Messina, Bonifacio).
  Connections are authored data, separate from the map shapes.
- The rest of the world is drawn hatched grey as context and labelled "outside the prototype theatre". This
  includes overseas parts of theatre countries such as the Canaries and Azores.

### Balance assumptions

Each nation's core provinces are normalised to the same base output (260 money, 140 materials and 70 manpower per
minute), one oil province, 5 objective VP and the same 13-unit starting army: capital 3 INF + 1 ART, heartland
2 INF + 1 ART, plus 6 INF on the borders. Geography stays asymmetric: Britain is shielded by sea crossings,
Germany borders the most states, Italy sits behind the Alps.

## 4. Time model

- The simulation advances in **fixed ticks of one game-second**. At Standard and 1x, one game-second is one real
  second.
- Speed presets multiply every duration by `durationScale`: movement, construction, research, combat rounds and
  production per tick.
- The client runs a fixed-timestep accumulator (`GameLoop`). Rendering frame rate only changes *when* ticks
  run, never *what* they compute. Each frame is capped at 240 ticks, and real time per frame at 250 ms.
- Client speeds: 1x and 2x are normal; DEV 5x/20x/60x/200x are development aids, shown in orange with a banner.
- **Pause** is a client concern. The game also pauses when the tab is hidden: the local prototype never runs
  while closed.

## 5. Economy

Four resources, each with a per-minute rate shown in the top bar:

| Resource | Main sources | Main uses |
| --- | --- | --- |
| Money | All provinces, capitals most | Everything; unit upkeep |
| Industrial materials | Industrial provinces | Buildings, artillery, tanks, research |
| Fuel | Oil fields, refineries | Tanks (cost and upkeep), some research |
| Manpower | Population; barracks +25% | Recruiting |

- Provinces that are not the owner's core produce **50%**.
- **Shortages:** stockpiles cannot go negative. While money is short, armies fight at 80%. While fuel is short,
  tanks move and fight at 50%.

### City buildings (one construction per province at a time; cost paid up front)

| Building | Levels | Effect |
| --- | --- | --- |
| Industrial Works | 3 | +30% money, +60% materials per level |
| Barracks | 1 | Enables infantry; +25% manpower |
| Arms Works | 1 | Enables artillery; +10% materials |
| Tank Works | 1 | Enables tanks (requires Arms Works) |
| Fuel Refinery | 2 | +12 fuel/min per level on oil fields; +6 elsewhere with Synthetic Fuel |
| Fortifications | 3 | Defenders take 12% less damage per level; capture +10 s per level; lose a level when captured |
| Supply Depot | 1 | Supply hub |

## 6. Military

### Units (era models; research upgrades existing units in place)

| Unit | Role | Strengths | Weaknesses |
| --- | --- | --- | --- |
| Infantry | Line holder | Cheap; strong defence, more so in forest, hills, mountains, urban | Weak attack, little anti-armour |
| Artillery | Breakthrough | Highest soft attack; +15% attacking in hills | Fragile when attacked; slowest |
| Tanks | Mobile shock | Armoured: only "hard" values hurt them; +15% on plains | Fuel cost and upkeep; −40–60% in mountains, marsh, forest, urban |

Each unit has attack and defence values against soft and hard targets. **The province owner's armies use defence
values and everyone else uses attack values.** WWI models (1914–17) become 1940 models through Tier 3 research.

### Armies and movement

- An army is a stack of units and moves at the speed of its slowest unit.
- Leg time = distance between city anchors × 1.15 ÷ speed × connection factor (mountain 1.6, strait 2.2) ×
  destination terrain factor. The minimum leg is 15 s.
- Orders use Dijkstra over legal provinces: own territory, nations at war, and neutral states. Territory of
  nations at peace is closed.
- Armies on a multi-leg order **hold** to fight and to capture each hostile province, then continue. An explicit
  new order leaves immediately, which is how you retreat from a battle. A stop order finishes the current leg.
  An order back to where the army came from turns it round mid-leg.
- Split and merge are available while stationary.

### Combat

- Combat happens when hostile armies are stationary in the same province. Rounds run every 10 s.
- Each unit fires at a random enemy unit. Damage = value (soft or hard) × terrain × (0.4 + 0.6 × strength) ×
  random ±20% × army modifiers (supply, treasury, combined arms), reduced by the defender's fortifications.
  Damage is divided by the target's max HP.
- Destroyed units are removed. A battle ends when no hostile pair remains.
- Defenders win equal infantry fights about 90% of the time (tested). Breaking a defence needs artillery or local
  superiority.

### Capture

An enemy (or invading) army alone in a province captures it in 20 s, plus 10 s per fortification level, ×1.5 for
capitals. Capture cancels the province's construction and recruitment. Armies of nations at peace with the new
owner withdraw to their nearest own province.

### Supply

- A province is **in supply** if connected through its owner's territory to a hub: the capital or any Supply
  Depot, including captured depots.
- An army is supplied in such a province or **one connection** away from one (front-line supply).
- Unsupplied armies fight at 75%. After 120 s they lose 1.5% strength every 10 s.
- Supplied armies resting in their own territory recover 1.2% strength every 10 s.

## 7. Research (one project at a time)

| Tier | Techs | Highlights |
| --- | --- | --- |
| 1 — Great War refinements | Industrial Mobilisation, Light Machine Guns, Indirect Fire Doctrine, Motor Transport | Production, infantry, artillery, speed |
| 2 — Interwar | Synthetic Fuel, Assembly Line, Field Radio, Motorised Infantry, Fortification Engineering | Fuel anywhere, faster and cheaper recruiting, +attack, mobility, stronger forts |
| 3 — WWII upgrades | Modern Infantry Kit, Motorised Howitzers, Medium Tanks, Combined Arms Doctrine | 1940 unit models; +20% attack for mixed armies |

**Era** is shown per nation: Interwar after 3 Tier-2 techs, WWII once infantry, artillery and tanks are all
upgraded. The whole tree takes at least about 52 minutes of research time. In AI campaigns nations reach
Interwar around 60 min and WWII around 90 min.

## 8. War and peace

- All powers start at **peace**. Declaring war is instant. After peace there is a 5-minute truce.
- Peace can be offered after 3 minutes of war, and offers expire after 90 s. Peace is status quo: borders freeze
  and trespassing armies withdraw.
- The AI accepts peace when weaker (power below 85% of the enemy's), war-weary (25 min) or after losing its
  capital. It offers peace when its power falls below 60% of the enemy's.

## 9. Victory

- **Objectives:** 37 VP in total (capitals 3, industrial heartlands 2, neutral capitals 1). Holding **40% (15
  VP)** continuously for **90 s** wins. Everyone is warned when the countdown starts or is averted.
- **Time limit:** at 150 min the highest score wins. Score = 10 × VP + 3 × provinces + 2 × technologies.
- **Elimination:** a nation with no provinces is out. The last power standing wins. If the human is eliminated,
  the campaign ends as a loss.

## 10. Computer opponents

The AI uses only the public command API, is deterministic through the seeded RNG, and thinks every 8 s. Each AI
has a personality (aggression, economy bias) drawn from the seed.

- **Diplomacy:** after a 6-minute grace period, it may declare war on a neighbour when stronger. It is limited
  to 1–2 wars and avoids piling onto a nation already fighting two. It answers and makes peace offers as above.
- **Economy:** saves for research first, then builds by score (industry, recruitment buildings, refineries on
  oil, depots for cut-off land, forts on threatened borders). It keeps a cash reserve.
- **Recruitment:** keeps upkeep within an income budget, which is larger at war. The unit mix is about 55%
  infantry, 27% artillery and 18% tanks (when fuel allows), recruited close to the front.
- **Military:** merges idle stacks, retreats from hopeless battles, falls back when out of supply, holds
  threatened provinces, strikes adjacent targets it can beat, and otherwise masses at a staging province for
  the most valuable weak target.

## 11. Architecture

- `src/sim` has no React or DOM dependency. All state is plain JSON (`GameState`), so it can move to an
  authoritative server unchanged.
- **Explicit commands** (`move`, `stop`, `split`, `merge`, `recruit`, `cancelRecruit`, `build`, `research`,
  `declareWar`, `offerPeace`, `respondPeace`) are validated, applied at tick boundaries and logged. `replay()`
  reproduces a game from its initial state and command log.
- **Seeded RNG** (mulberry32) state is stored inside the game state.
- **Geography is separate from rules.** Shapes are in `src/assets/map`, used only for rendering. Adjacency and
  travel are in `scenario/europe/connections.ts`. Distances are rounded to whole kilometres, so timing never
  depends on floating-point trigonometry.
- **Saves** are versioned (`schemaVersion`) and tied to a scenario id. Load rejects incompatible files.

## 12. Presentation

The look follows modern browser grand-strategy games: a dark, glassy command-centre HUD around a bright relief map.

- **Map.** Shaded-relief terrain is baked once per session from each province's terrain type (an SVG turbulence and
  lighting filter rendered to a bitmap, `src/ui/map/terrain.ts`), so mountains, hills, forests and marshes read at a
  glance. Ownership is a translucent nation tint over the terrain, with a glowing inner border in each nation's colour.
  The sea has a depth gradient, baked coastal shallows and a 5° graticule; land outside the theatre is dark grey.
  Three map views: **Political** (strong tint), **Terrain** (light tint) and **Supply** (your provinces green when
  connected to a supply hub, red when cut off).
- **Labels.** Nation names are painted across their territory when zoomed out; province names take over when zoomed
  in. Cities have dark name plates with an owner-colour stripe (capitals always, cities and towns as you zoom), gold
  badges for objective VP and capture-progress rings.
- **Armies.** Counters in the owner's colour carry a silhouette of the main unit type (infantry, artillery, tank), the
  unit count and a strength bar. Your armies have a white rim, armies of nations at war with you a red rim, armies out
  of supply a red "!" badge, and the selection a running dashed outline. Marching routes are animated dashed lines with
  arrowheads. Battles show a pulsing explosion. With your army selected, pointing at a province previews the route,
  highlights the provinces on it and shows the arrival time (or "No route").
- **HUD.** The top bar holds the nation's flag and era, resources with per-minute rates (shortages pulse red), current
  research with progress, objective VP towards victory, the clock and the speed controls. A left command rail opens
  Research, Diplomacy, field reports, save/load and help, with badges for idle research, wars and peace offers. The
  selected army and province open as floating cards on the right; the overview map and zoom buttons sit below them.
  Field reports (the event log) sit bottom left; alerts for wars, peace, research, eliminations, shortages and
  objective captures pop up top left. A cursor tooltip summarises the province under the mouse.
- **Windows.** Research shows the era track and tier columns of tech cards; Diplomacy shows flags, relation pills,
  military power bars and objective chips. The opening tutorial is a Chief of Staff briefing. The main menu shows the
  theatre map with the chosen nation lit up.
- **Assets.** Everything is drawn in code: flags, unit silhouettes and icons are inline SVG; the Barlow and Barlow
  Condensed typefaces are bundled with the build. Nothing is fetched at run time.

## 13. Open questions for playtesting

- Is 15 VP / 90 s reachable for a human in 2–3 hours without making the AI too fragile?
- Do WWI defensive values make early wars feel static, and is that the right flavour?
- Should captured depots act as hubs immediately, or only after a delay?
- Large late-game AI armies: add disbanding, manpower caps, or stronger upkeep?
