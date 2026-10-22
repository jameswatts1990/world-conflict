# World Conflict

Browser-based real-time grand strategy (WWI → WWII) on the European theatre. Design: `docs/GAME_DESIGN.md` (living
document, keep it current); roadmap: `docs/BACKLOG.md`. British English throughout (behaviour, armour, defence).

## Commands

- `npm run typecheck`, `npm test` (Vitest, ~20 s), `npm run build`, then `npm run e2e` (browser playthrough of the
  production build). CI runs all four on every push.
- `npx vite-node scripts/dev/ai-report.ts <seeds> <minutes> [--human fr] [--difficulty easy]`: AI behaviour report.
- `npx vite-node scripts/dev/batch.ts <seeds> <minutes>`: headless campaign summaries (captures, wars, outcomes).
- `npx vite-node scripts/dev/ai-moves.ts <seeds> <minutes>`: every AI move order with its reason; armies sent back
  and forth.

## Simulation rules

- `src/sim` has no DOM or React and must stay deterministic: randomness only through the seeded RNG
  (`random(state)`), never `Math.random` or the clock. Same seed and orders must give the same state hash; saves,
  replays and the determinism tests depend on it.
- Everything a player or AI does goes through the validated commands in `src/sim/commands.ts`.
- New state fields are optional with a sensible default when absent, so older saves still load; otherwise add a
  migration in `src/sim/save.ts`.

## How the computer opponents should behave

The AI should be **fun to play against**: strategic, readable, varied, and beatable, but never a walkover.

- **Plays by the rules.** The same commands, resources and information as the player. Difficulty changes how well
  it plays, never what it is given.
- **Strategic.** Every move has a reason a player could guess: mass before striking, prefer valuable or encircled
  targets, defend what matters, finish what it starts (a capture in progress is held until the province falls),
  make peace when losing and press a war it is winning.
- **Readable, not jittery.** No marching back and forth, no orders abandoned before they can pay off, no armies
  idling far from any front while a war is on. Plans should be visible on the map (a build-up, then an attack) so
  the player can react.
- **Makes human mistakes, not broken ones.** Misjudging strength, overreaching, reacting late, picking a weaker
  target or holding on too long are fine and should be punishable. Oscillating, starving armies, wasted marches
  and stuck stacks are bugs.
- **Spontaneous.** Each campaign should play differently. Personalities (aggression, economy bias, doctrine) come
  from the seed and the menu draws a fresh seed for every game; openings and wars should vary from seed to seed
  while staying sensible for the geography. Add variety through the seeded RNG, never at the cost of determinism.
- **Fair pressure.** It punishes weakness and passivity, and gangs up on a power about to win, but it should not
  dogpile a player who is still finding their feet. Grace periods give the opening to building up: no wars before
  6 minutes (12 on Easy) and no invasions of neutral states before 10.

### Difficulty

`AI_LEVELS` in `src/sim/config/ai.ts`; the game's level is `state.settings.difficulty` (absent = normal).

- **Normal** is the reference AI. Tune it deliberately and measure the change.
- **Easy** plays worse with the same resources: slower decisions, smaller armies, more caution before attacking,
  one offensive at a time, thinner garrisons, later retreats, looser target choice, later and rarer wars, no
  ganging up, quicker peace.
- Changing one level must not change the other. When tuning Easy, check that Normal campaigns keep the same state
  hashes (`npm run sim:campaign -- <seed> <minutes>` prints one).

### Reviewing AI changes

Headless numbers find broken behaviour and show trends; they cannot say whether the AI is fun. Run the report before
and after a change, at both difficulties, all-AI and with an idle human:

```bash
npx vite-node scripts/dev/ai-report.ts 10 90
npx vite-node scripts/dev/ai-report.ts 10 90 --human fr --difficulty easy
```

- **Pathologies** should stay near zero: back-and-forth reversals about 1–2% of orders, abandoned captures 0%,
  pile-on attacks under 5%, armies idle in the interior a few per cent (Easy higher by design).
- **Variety**: how often each power's opening repeats across seeds, and who fights the first war.
- **Challenge**: when war comes to an idle player and when they fall (currently about 7 and 25 minutes at Normal,
  13–19 and 35–45 at Easy). An idle player should lose, just not at once.

To diagnose, `setAiOrderTrace` (from `src/sim`) sees every AI move order with the decision step that issued it; tag
any new move order in `src/sim/ai/military.ts` with a reason. Report balance shifts (game length, how fast players
are overrun, how quickly neutrals fall) to the user rather than retuning silently, and recommend human playtests for
anything about feel.
