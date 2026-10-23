# Balance lab

Three tools play the game against itself in the background and report what they find:

| Command | What it answers | Time (4 cores) |
| --- | --- | --- |
| `npm run balance` | How campaigns play: who wins and who is knocked out, pace, drama, which AI personalities do well, what the AI does with every unit, building and technology | 200 campaigns in about 9 minutes |
| `npm run balance:units` | What each unit type is worth for its price, by technology level, ground and role, and which armies beat which | under a minute |
| `npm run balance:techs` | What each technology is worth to the nation that has it, by experiment: the same campaigns with and without it | about 2 hours for all of them (one technology: a few minutes); on demand in CI |
| `npm run balance:tune` | Trains the AI: searches its settings for the ones that best meet the design goals | about 1.5 hours (`--quick`: 5 minutes) |

Everything reads nations, power tiers, unit types, buildings and research from the scenario and config, so a new
country or unit shows up in every report, and is checked by the red flags, without touching the tools.

Campaigns are all-AI, so they measure the game as the AI plays it. They are quick and plentiful, but they share the
AI's blind spots (it plans no sea landings, for instance). Human playtests, and later recorded multiplayer games,
remain the ground truth; see [Limits](#limits-and-next-steps).

## When you add a country, a unit, a building or a technology

1. **Units:** `npm run balance:units -- --vs main` fights every unit type in the working tree against main's. A new
   unit appears as "new"; look at its value (about 1.0 means priced like line infantry), its matchups, and the red
   flags (worth under 0.75× or over 1.35× its price, or beating or losing to every other army of the same cost).
2. **Campaigns:** `npm run balance -- --vs main` plays 200 campaigns of each on the same seeds. Read *Changes that
   stand out* and the red flags. Check that the new nation survives and wins about as often as others of its tier.
   Check also that the AI actually uses the new content: a unit nobody raises needs a share in `AI.doctrineMix`
   (`src/sim/config/ai.ts`), and a building nobody builds needs a rule in `handleConstruction`
   (`src/sim/ai/economy.ts`).
3. **Technologies:** `npm run balance:techs -- --techs <id> --games 100` measures a new or changed technology: how
   many places it is worth to the nation handed it. Run every technology from time to time (the Tech lab workflow, on
   demand), since a change elsewhere can make one dominant or worthless.
4. **Try a fix** without editing anything: `npm run balance -- --vs defaults --set UNITS.tank.cost.money=280`. Once it
   works, put the value in config and rerun step 2.
5. **If the AI handles the new content badly,** tune it: `npm run balance:tune` (overnight), or a few knobs at a time
   with `--knob`.
6. **Label the pull request `balance`** and CI runs the comparison against the base branch, with the reports on the
   run's summary page.

## Campaigns: `npm run balance`

```bash
npm run balance                                           # 200 campaigns of the working tree
npm run balance -- --games 400 --set AI.warStrengthRatio=1.3   # with an override
npm run balance -- --vs main                              # against another commit, on the same seeds
npm run balance -- --set AI.unitsFlat.minor=4 --vs defaults   # the same code with and without the override
npm run balance -- report balance-runs/<run>              # re-read a saved run (with today's goals)
npm run balance -- compare balance-runs/<a> balance-runs/<b>
```

Options: `--games N` (200) or `--seeds 1-300`, `--minutes M` to stop campaigns early (0, the default, plays them to
the end; stopped runs skip the length and content checks), `--workers W` (every core), `--out DIR`
(`balance-runs/<date-time>-…`, ignored by git) and `--quiet`. Each run saves `report.md`, `summary.json`,
`meta.json` and `games.jsonl` (one record per campaign: final standings, each nation's AI personality, units raised
and lost by type, buildings, research, a per-minute series of VP, provinces, power and technologies, and every war,
peace and capture), so new questions can be asked of old runs.

A campaign takes about 11 seconds of one core. Rates from 200 campaigns are good to about ±5 points (the report
shows each nation's margin), enough to see a nation that is knocked out three games in four, not one that wins 12%
instead of 10%. Rank and survival move more visibly than wins.

The report, top to bottom:

- **Red flags:** what misses a goal (below): weak or dominant nations, early knockouts, campaign length, doctrines
  that decide too much, minor powers, and content the AI never uses.
- **Goal penalty:** how far the run misses each design goal, weighted; 0 meets them all. The tuner minimises it.
- **Nations:** wins (± margin), how often each lasts the campaign or is out within the first hour, place among the
  playable nations, minute knocked out, provinces held. Minor powers and tiers follow.
- **Pace and drama:** outcomes, length, the first war and the first knockout, wars, treaties, captures, battles and
  withdrawals per campaign, lead changes, whether the leader at 20, 40 and 60 minutes goes on to win, minor powers
  still standing, and whether an early land grab decides the game.
- **AI personalities:** every computer opponent draws a doctrine, aggression and economy bias from the seed, so every
  run also tests which personalities do well. Doctrine is also compared within each nation, so geography cannot pass
  for doctrine.
- **Units, buildings, research:** for each unit type, the share of campaigns in which some nation had researched it,
  could raise it (and held the buildings it needs) and did; the same for buildings; the technologies winners research
  more than others, and those almost nobody researches. That last table is correlation (winners may research a
  technology because they are winning); the tech lab measures what a technology is actually worth.

### Overrides: `--set PATH=VALUE`

Any export of `src/sim/config` can be overridden for a run: `AI.warChance=0.03`, `AI_LEVELS.normal.attackRatio=1.3`
(settings that differ by difficulty are in `AI_LEVELS`; balance runs play Normal), `UNITS.tank.cost.money=280`,
`POWERS.minor.output.money=80`, `VICTORY.holdSeconds=120`, `AI.personality.doctrines=["infantry","armour"]`. VALUE is
JSON (or a bare word for a string). Overrides are set before the rest of the simulation loads, so values used to build
the starting setup apply too. A path that does not exist, or a value of the wrong type, stops the run, so a typo cannot
quietly test nothing. All the numbers the AI weighs live in `src/sim/config/ai.ts` for this reason.

### Comparing: `--vs`

`--vs <ref>` checks the ref (a branch, tag or commit; fetch it first) out into a temporary git worktree and plays the
same seeds there, with the working tree's tools. `--vs defaults` compares the working tree with and without the
`--set` overrides. The comparison lists the changes that stand out first: each number gets a test (p), and because a
report tests dozens of numbers at once, a change counts as **likely real** only when its q-value
(Benjamini–Hochberg) is under 0.05; a p-value under 0.05 alone is **possible**. It ends with the goals side by side
and the red flags that are new or gone.

## The unit lab: `npm run balance:units`

```bash
npm run balance:units                                  # every unit at every technology level
npm run balance:units -- --units tank,antiTank --levels ww2
npm run balance:units -- --set UNITS.tank.cost.money=260 --vs defaults
npm run balance:units -- --output fuel=60              # price fuel as if a great power made 60 a minute
npm run balance:units -- --vs main
```

It stages battles to the death between two great powers with their specialities removed, the same research and
Regular troops, in a province the defender holds:

- **Technology levels** come from the research tree: one per equipment generation (1914, 1928, 1940), with all
  research up to the column before the next generation's first equipment.
- **Grounds:** every terrain in the theatre, and open ground behind level-2 forts (where siege guns and assault troops
  earn their price).
- **Armies of equal cost** (`--budget`, 12 line infantry's worth): an army built around a unit spends half its budget
  on it and the rest on line infantry, as armies are really raised (support units need a screen).
- **Prices** are in line infantry: each resource costs what it is worth in minutes of an average great power's base
  output (scenario data), so fuel, which great powers make little of, is dear. Upkeep counts for 30 minutes
  (`--upkeep`). `--output fuel=60` prices resources by another economy instead.

Each army's **value** is how much line infantry it can face evenly, per unit of its own cost, against line
infantry's own figure: 1.0 is priced like line infantry, 1.3 gives 30% more for the money. It is found by fighting
growing infantry armies until the outcome changes sign. **Field** is its average edge over every other army of the
same cost (−1 to +1), and the **matchups** show which armies beat which. Specialists earn their price on their own
ground and against their targets (anti-tank guns against armour), not against infantry on open ground. Values move
by about 0.05 between runs at 8 battles a point (`--seeds`).

The lab measures fighting only: not speed, sight, capture time or supply. A fast or scouting unit can be worth its
price with a low value here.

## Training the AI: `npm run balance:tune`

```bash
npm run balance:tune                       # the "ai" space: war and peace appetite, attack caution
npm run balance:tune -- --quick            # a few minutes, to see it work
npm run balance:tune -- --space military --generations 8 --games 48
npm run balance:tune -- --knob AI_LEVELS.normal.attackRatio=0.9..1.6 --knob AI.warChance=0.005..0.06
npm run balance:tune -- --set UNITS.tank.cost.money=260   # tune the AI around a rules change
```

The tuner is an evolution strategy. Each generation plays a population of settings around its current guess on the
same fresh campaigns (mirrored pairs, so each step is tried both ways). It then moves the guess towards the settings
with the lowest goal penalty, and widens or narrows its steps to match how spread out the good ones are. The spaces
are in `scripts/balance/space.ts`:

- `ai`: the AI's appetite for war and peace and the strength it wants before attacking.
- `diplomacy`: war and peace only.
- `military`: attack sizing, garrisons and army size.

`--knob PATH=MIN..MAX` searches any number in config. Defaults are 8 settings, 6 generations and 32 campaigns
each, about 1,900 campaigns with the check.

At the end it plays its proposal against today's settings on 200 campaigns it has never seen (`--validate`), and
resamples them to put a 95% interval on the change in goal penalty. It only calls the proposal better if the whole
interval is below zero. `tune.md` has:

- the verdict;
- each setting, today's value and the proposed one;
- the `--set` flags to try it;
- the full comparison.

`best.json` holds the overrides and `history.jsonl` every setting tried. Nothing in the code changes: copy the values
you like into `src/sim/config/ai.ts`, run `npm run balance -- --vs main`, and play it.

The tuner optimises the goals as written, so read the comparison for side effects, and do not use the AI to hide a
rules problem: a unit that is too strong should be fixed in its stats or price, not by making the AI avoid it.

## The tech lab: `npm run balance:techs`

```bash
npm run balance:techs                                       # every technology, 60 campaigns each
npm run balance:techs -- --techs staffCollege,infiltrationTactics --games 200
npm run balance:techs -- --set TECH_BY_ID.staffCollege.seconds=600   # after a change
npm run balance:techs -- --at 40                            # handed over at minute 40 instead of 20
```

An experiment, not an observation. Each seed's campaign is played to the handover minute (`--at`, 20) and kept. From
there it plays on to the end as it was (the control), and once more for each technology, with that technology handed
to a test seat: a playable nation, a different one each seed, as if its research had just finished. Prerequisites are
not handed over, so this is the technology's own effect. The difference in the test seat's result, on the same seed,
is what the technology was worth to it:

- **Places:** places gained among the playable nations by the end, with a 95% margin and a q-value (corrected for
  testing every technology at once; under 0.05 is likely real).
- **Wins, survival and provinces:** the same comparison for each.
- **Had it:** how often the seat already had the technology at the handover; such campaigns are not counted, so a
  technology everyone has by then is measured on few.

Red flags: a technology worth half a place or more (and likely real), one that costs the nation that gets it, and one
too small to notice (under 0.15 places even at the top of its margin). The thresholds are `GOALS.techValue` in
`scripts/balance/goals.ts`.

Every technology costs one campaign per seed: all of them at 60 seeds is about 3,000 campaigns, two hours on 4 cores.
Margins at 60 seeds are about ±0.5 places, enough to find a technology that decides games, not to rank close ones; give
the ones you care about `--games 200`. `--shard 2/4` plays a quarter of the technologies and `merge <dir>… --out DIR`
joins the parts, which is how the Tech lab workflow splits the work over four runners. A technology handed over at
minute 20 that a nation would normally reach at minute 90 is worth a lot more than it costs; compare a technology
with others of its column, or move `--at`.

## Goals and red flags

`scripts/balance/goals.ts` holds the design judgements the reports check against. Change them as the design changes;
`npm run balance -- report <run>` re-reads old runs with the new goals.

| Goal | Target | Why |
| --- | --- | --- |
| Median campaign length | 100–140 minutes | Campaigns aim at 2–3 hours with a 150-minute limit |
| Playable seats knocked out within 60 minutes | ≤ 5% | In multiplayer, that player watches the rest of the game |
| Campaigns lasted by the weakest playable nation | ≥ 50% | Every nation should be worth picking |
| The strongest nation's wins over its fair share | ≤ 2× | No nation should be the obvious pick |
| VP leader at 40 minutes who goes on to win | ≤ 40% | The game should not be decided early |
| Campaigns decided on objectives | 40–85% | Most campaigns should be won, not timed out |
| First war | minute 6–15 | Things happen soon, but not at once |
| Best AI doctrine's win rate over the worst's | ≤ 1.3× | Every strategy should be viable |
| Minor powers standing at 30 minutes | ≥ 30% | Minor powers should cost an investment to take |

The red flags use looser bounds (a nation lasting under 40% of campaigns, winning over 2.5 times its fair share, more
than 10% of seats out early, a length outside 90–150 minutes, a doctrine spread over 1.5, under 10% of minor powers
standing at 30 minutes). They also flag content the AI never uses even though it could in at least a quarter of
campaigns. In the unit lab, they flag values outside 0.75–1.35 and armies that beat, or lose to, every other. The
tech lab's are above.

## Continuous integration

- **Every push** (`ci.yml`) runs the tools on a few short campaigns and battles, so they keep up with the simulation.
- **The Balance workflow** (`balance.yml`) plays 400 campaigns and the unit lab every night on the default branch,
  and posts the reports on the run's summary page with the raw runs as an artifact.
- **On demand** from the Actions tab, with the number of campaigns, a ref to compare with and overrides.
- **On pull requests labelled `balance`**, it plays 200 campaigns of each against the base branch.
- **The Tech lab workflow** (`tech-lab.yml`) runs only on demand (Actions → Tech lab → Run workflow), with the number of
  campaigns, the technologies, the handover minute and overrides. It splits the technologies over four runners and
  posts the joined report on the run's summary page; all of them at 60 campaigns take about 40 minutes.

Runners are free for a public repository.

## How it works

`scripts/balance/`:

| File | Role |
| --- | --- |
| `cli.ts`, `units.ts`, `tune.ts` | The three commands |
| `run.ts` | Plays batches of campaigns, saves and loads runs |
| `pool.ts`, `worker.ts` | Parallel workers: each task runs in a fresh vite-node process with its own copy of the simulation and its own overrides |
| `sim.ts` | Loads a copy of the simulation (the working tree's or a worktree's) and applies overrides before the rest of it loads |
| `record.ts` | Plays and records one campaign, sampling it once a game-minute without changing it |
| `summary.ts`, `report.ts`, `compare.ts`, `stats.ts` | Numbers, the markdown reports, comparisons and their statistics |
| `goals.ts` | Goals, the goal penalty and the red flags |
| `lab.ts` | The unit lab's battles and its value search |
| `space.ts` | The tuner's search spaces |
| `techs.ts`, `techlab.ts`, `techreport.ts` | The tech lab: its command, its paired campaigns, and its numbers and report |
| `git.ts` | Worktrees for `--vs` |

The tools never import the simulation statically: they load whichever copy a run asks for, which is how they can
play an older commit. A run is reproducible from its commit, overrides and seeds.

## Limits and next steps

- **All-AI campaigns measure the game as the AI plays it.** A nation can look weak because the AI plays it badly.
  Recording human games (seed, version and every command, the AI's included) would let the same reports run on real
  games, and the gap between the two would show where the AI falls short.
- **The AI draws its decisions from the same random stream as combat,** and personalities are drawn only for
  computer seats. Separate streams, with personalities fixed per seat, would make comparisons less noisy, and let a
  seat pass between a human and the AI without changing the others: the basis for multiplayer drop-in, drop-out and
  caretaker AI.
- **One AI configuration plays every seat.** Per-nation profiles (difficulty levels, a cautious caretaker for an
  absent player, minor powers) could be tuned separately and ranked by tournaments.
- **Unit performance in campaigns** is seen only through units raised and lost; a read-only combat hook could record
  damage by unit type and ground.
