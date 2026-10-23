# CLAUDE.md

Guidance for Claude Code working in this repository.

## Workflow

- **Always open a pull request** for finished work: push the branch and open a PR without waiting to be asked.
- Keep docs in step with behaviour changes: `docs/GAME_DESIGN.md` is the living design document (rules, numbers,
  AI behaviour), `docs/BACKLOG.md` the roadmap, and this file the working notes for Claude.
- Before pushing, run `npm run typecheck` and `npm test` (about 20 s). CI also runs the build and the browser
  playthroughs (`npm run e2e`, `npm run e2e:mobile`).

## Layout

- `src/sim`: deterministic simulation, no DOM. Plain-JSON `GameState`; all randomness through the seeded RNG.
  - `systems/`: per-tick rules (movement, combat, capture in `territory.ts`, supply, production …).
  - `ai/`: computer opponents. They act only through the same validated commands as a human.
  - `config/`: tuning numbers (`ai.ts`, `rules.ts`, `units.ts`, `buildings.ts`).
- `src/ui`: rendering and input.
- `tests/`: Vitest suite; `tests/helpers.ts` has `quietGame` (no AI), `aiGame`, `place`, `run`, `setWar`.

## Debugging AI behaviour

- `npm run sim:campaign -- <seed> <minutes>` runs a headless all-AI game; its `neutral:N` column shows how many
  neutral provinces are left.
- The AI plays under the fog of war: it may read other nations' armies only through the context (`ctx.seen`,
  `ctx.hostile`, `ctx.unseen`, `ctx.enemyArmour` in `ai/context.ts`) or with `isArmyVisible`, never straight from
  `state.armies` or `hostileArmiesIn` on a province it cannot see. Military power totals (`nationPower`), ownership
  and city tiers are public. `tests/ai.test.ts` checks that hidden armies stay hidden.
- The AI thinks every 8 s (`AI.thinkIntervalSeconds`), but captures take 20 s or more. Any step in
  `ai/military.ts` or `ai/recruitment.ts` that picks "free" or "rear" armies must skip armies holding a province
  they are capturing. `ctx.threat` and `ctx.frontier` cover only owned provinces, so an army abroad reads as
  zero-threat and non-frontier.
