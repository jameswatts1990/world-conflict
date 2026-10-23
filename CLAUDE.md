# CLAUDE.md

Guidance for Claude Code working in this repository.

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
- `tests/`: Vitest suite; `tests/helpers.ts` has `quietGame` (no AI), `aiGame`, `place`, `run`, `setWar`.

## Balance lab (docs/BALANCE.md)

- `npm run balance` plays all-AI campaigns in parallel and reports on balance, pace and content use; `--vs main`
  compares with another commit on the same seeds and `--set PATH=VALUE` tries a config value. `npm run balance:units`
  prices units in staged battles; `npm run balance:tune` searches AI settings for the design goals in
  `scripts/balance/goals.ts`. Runs land in `balance-runs/` (ignored by git).
- After changing rules, AI or content, run `npm run balance -- --vs main` (and `npm run balance:units -- --vs main`
  for unit changes) and put what moved in the pull request.
- Every number the AI weighs belongs in `src/sim/config/ai.ts`, not inline in `ai/*.ts`, so `--set` and the tuner can
  reach it. A new unit type needs a share in `AI.doctrineMix`, a new building a rule in `handleConstruction`; the
  reports flag content the AI never uses.
- The tools in `scripts/balance/` must not import `src/sim` statically (type imports are fine): they load whichever
  copy of the simulation a run asks for, which is how `--vs` plays other commits.

## Debugging AI behaviour

- `npm run sim:campaign -- <seed> <minutes>` runs a headless all-AI game, printing each nation's provinces,
  units, VP and wars every 10 minutes (`neutral:N` is always 0 in Europe: its former neutral states are minor powers).
- The AI plays under the fog of war: it may read other nations' armies only through the context (`ctx.seen`,
  `ctx.hostile`, `ctx.unseen`, `ctx.enemyArmour` in `ai/context.ts`) or with `isArmyVisible`, never straight from
  `state.armies` or `hostileArmiesIn` on a province it cannot see. Military power totals (`nationPower`), ownership
  and city tiers are public. `tests/ai.test.ts` checks that hidden armies stay hidden.
- The AI thinks every 8 s (`AI.thinkIntervalSeconds`), but captures take 20 s or more. Any step in
  `ai/military.ts` or `ai/recruitment.ts` that picks "free" or "rear" armies must skip armies holding a province
  they are capturing. `ctx.threat` and `ctx.frontier` cover only owned provinces, so an army abroad reads as
  zero-threat and non-frontier.
