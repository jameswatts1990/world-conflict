// What the balance reports check, and what the tuner aims for. These are design judgements,
// not facts: change them as the design changes (docs/BALANCE.md explains each one).
//
// Red flags point at something to look at. The goal penalty adds up how far a run misses each
// goal (0 when every goal is met); the tuner (tune.ts) searches for AI settings that lower it.
import { share } from './stats';
import type { Summary } from './summary';

export const GOALS = {
  /** A playable nation knocked out within this many minutes counts as an early knockout: in multiplayer, its player watches the rest of the game. */
  earlyMinutes: 60,
  /** Runs smaller than this only warn that their numbers are rough. */
  minGames: 50,
  /** The unit lab (units.ts) flags a unit type whose army's value index, against line infantry, falls outside this range. */
  unitIndex: [0.75, 1.35] as [number, number],
  /**
   * The tech lab (techs.ts) measures a technology's worth in places gained (among the playable nations) by the
   * nation handed it. It flags one worth at least `strong` places (and likely real), and one that, even at the top of
   * its margin of error, is worth under `weak`: too small for a player to notice. Margins are about ±0.55 places at
   * 60 campaigns and ±0.3 at 200, so the second flag needs about 200.
   */
  techValue: { strong: 0.5, weak: 0.35 },
  flags: {
    /** Every playable nation should last the whole campaign at least this often... */
    minSurvival: 0.4,
    /** ...and win no more than this many times its fair share (one over the number of playable nations). */
    maxWinShare: 2.5,
    /** Share of playable seats knocked out early. */
    maxEarlyKnockouts: 0.1,
    /** Window for the median campaign length, in minutes. */
    length: [90, 150] as [number, number],
    /** The best AI doctrine's win rate over the worst's (strategies should all be viable). */
    maxDoctrineSpread: 1.5,
    /** Content unlocked in at least this share of campaigns should be used by the AI at least once. */
    unusedContentShare: 0.25,
    /** Share of minor powers still standing at 30 minutes. */
    minMinorsAt30: 0.1,
  },
};

type Core = Omit<Summary, 'fun' | 'flags'>;

export type GoalUnit = 'percent' | 'minutes' | 'ratio';

export interface FunTerm {
  id: string;
  label: string;
  goal: string;
  unit: GoalUnit;
  /** How much a miss counts towards the total. */
  weight: number;
  value(s: Core): number;
  /** 0 when the goal is met, about 1 for a clear miss; capped at 3 so one bad number cannot drown the rest. */
  penalty(v: number): number;
}

const above = (v: number, max: number, scale: number) => Math.max(0, v - max) / scale;
const below = (v: number, min: number, scale: number) => Math.max(0, min - v) / scale;
const outside = (v: number, lo: number, hi: number, scale: number) => (v < lo ? lo - v : v > hi ? v - hi : 0) / scale;

const playable = (s: Core) => s.nations.filter((n) => n.playable);

/** Win rates of the AI doctrines, best over worst (NaN until there are enough wins to judge). */
function doctrineSpread(s: Core): number {
  const judged = s.personality.doctrine.filter((d) => d.seats >= 30);
  if (judged.length < 2 || judged.reduce((sum, d) => sum + d.wins.k, 0) < 30) return NaN;
  const rates = judged.map((d) => share(d.wins));
  const worst = Math.min(...rates);
  return worst > 0 ? Math.max(...rates) / worst : Infinity;
}

export const FUN: FunTerm[] = [
  {
    id: 'length',
    unit: 'minutes',
    label: 'Median campaign length (minutes)',
    goal: '100–140',
    weight: 1,
    value: (s) => s.length.median,
    penalty: (v) => outside(v, 100, 140, 20),
  },
  {
    id: 'earlyKnockouts',
    unit: 'percent',
    label: `Playable seats knocked out in the first ${GOALS.earlyMinutes} minutes`,
    goal: '≤ 5%',
    weight: 2,
    value: (s) => share(s.earlyKnockouts),
    penalty: (v) => above(v, 0.05, 0.1),
  },
  {
    id: 'weakestNation',
    unit: 'percent',
    label: 'Campaigns survived by the weakest playable nation',
    goal: '≥ 50%',
    weight: 1.5,
    value: (s) => Math.min(...playable(s).map((n) => share(n.survived))),
    penalty: (v) => below(v, 0.5, 0.25),
  },
  {
    id: 'strongestNation',
    unit: 'ratio',
    label: "Strongest playable nation's wins, over its fair share",
    goal: '≤ 2×',
    weight: 1,
    value: (s) => Math.max(...playable(s).map((n) => share(n.wins) * playable(s).length)),
    penalty: (v) => above(v, 2, 1),
  },
  {
    id: 'snowball',
    unit: 'percent',
    label: 'VP leader at 40 minutes who goes on to win',
    goal: '≤ 40%',
    weight: 1,
    value: (s) => share(s.drama.leaderWins.find((l) => l.minute === 40)!.rate),
    penalty: (v) => above(v, 0.4, 0.2),
  },
  {
    id: 'decisive',
    unit: 'percent',
    label: 'Campaigns decided on objectives',
    goal: '40–85%',
    weight: 0.5,
    value: (s) => share(s.endedByObjectives),
    penalty: (v) => outside(v, 0.4, 0.85, 0.2),
  },
  {
    id: 'firstWar',
    unit: 'minutes',
    label: 'First war (median minute)',
    goal: '6–15',
    weight: 0.5,
    value: (s) => s.pace.firstWar ?? Infinity,
    penalty: (v) => outside(v, 6, 15, 5),
  },
  {
    id: 'doctrines',
    unit: 'ratio',
    label: 'Best AI doctrine win rate over the worst',
    goal: '≤ 1.3×',
    weight: 1,
    value: doctrineSpread,
    penalty: (v) => above(v, 1.3, 0.5),
  },
  {
    id: 'minors',
    unit: 'percent',
    label: 'Minor powers still standing at 30 minutes',
    goal: '≥ 30%',
    weight: 0.5,
    value: (s) => {
      const at30 = s.minors?.aliveAt.find((a) => a.minute === 30);
      return at30 ? share(at30.rate) : NaN;
    },
    penalty: (v) => below(v, 0.3, 0.3),
  },
];

export interface FunReport {
  /** Weighted sum of the penalties: 0 meets every goal. */
  total: number;
  terms: { id: string; label: string; goal: string; unit: GoalUnit; weight: number; value: number; penalty: number }[];
}

export interface Flag {
  /** Stable across runs ("survival:fr"), so comparisons can tell a flag that stayed from a new one. */
  id: string;
  kind: 'balance' | 'content' | 'run';
  text: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** "decisive=1.5": a goal's weight for one tuning run (0 leaves the goal out). */
export function parseWeight(text: string): { id: string; weight: number } {
  const m = /^\s*(\w+)\s*=\s*([\d.]+)\s*$/.exec(text);
  if (!m || !Number.isFinite(Number(m[2]))) throw new Error(`--weight "${text}" should look like decisive=1.5`);
  if (!FUN.some((t) => t.id === m[1])) throw new Error(`--weight: no goal "${m[1]}" (goals: ${FUN.map((t) => t.id).join(', ')})`);
  return { id: m[1], weight: Number(m[2]) };
}

/** The goal penalty with some goals weighted differently. */
export function reweigh(fun: FunReport, weights: Record<string, number>): number {
  return fun.terms.reduce((sum, t) => sum + (weights[t.id] ?? t.weight) * t.penalty, 0);
}

export function evaluate(s: Core): { fun: FunReport; flags: Flag[] } {
  const terms = FUN.map((t) => {
    const value = t.value(s);
    const penalty = Number.isNaN(value) ? 0 : Math.min(3, t.penalty(value));
    return { id: t.id, label: t.label, goal: t.goal, unit: t.unit, weight: t.weight, value, penalty };
  });
  const fun = { total: terms.reduce((sum, t) => sum + t.weight * t.penalty, 0), terms };

  const f = GOALS.flags;
  const flags: Flag[] = [];
  // Campaigns stopped early cannot say how long campaigns last or what the AI gets round to using.
  const capped = s.meta.maxMinutes > 0;
  if (s.games < GOALS.minGames) flags.push({ id: 'run:small', kind: 'run', text: `Only ${s.games} campaigns: rates below are rough (run ${GOALS.minGames} or more to judge).` });
  if (capped) flags.push({ id: 'run:capped', kind: 'run', text: `Campaigns were stopped at ${s.meta.maxMinutes} minutes: the length and content checks are skipped.` });
  const fair = 1 / Math.max(1, playable(s).length);
  for (const n of playable(s)) {
    const lasted = share(n.survived);
    if (lasted < f.minSurvival) {
      const out = n.outAt === null ? '' : `; when it falls, it is out by minute ${Math.round(n.outAt)} (median)`;
      flags.push({ id: `survival:${n.id}`, kind: 'balance', text: `${n.name} lasts the campaign in only ${pct(lasted)} of games (goal ≥ ${pct(f.minSurvival)})${out}.` });
    }
    const wins = share(n.wins);
    if (wins > fair * f.maxWinShare) {
      flags.push({ id: `wins:${n.id}`, kind: 'balance', text: `${n.name} wins ${pct(wins)} of campaigns, ${(wins / fair).toFixed(1)}× its fair share (goal ≤ ${f.maxWinShare}×).` });
    }
    if (n.wins.k === 0 && s.games >= GOALS.minGames) flags.push({ id: `neverWon:${n.id}`, kind: 'balance', text: `${n.name} never won a campaign.` });
  }
  if (share(s.earlyKnockouts) > f.maxEarlyKnockouts) {
    flags.push({ id: 'earlyKnockouts', kind: 'balance', text: `${pct(share(s.earlyKnockouts))} of playable seats are knocked out within ${GOALS.earlyMinutes} minutes (goal ≤ ${pct(f.maxEarlyKnockouts)}).` });
  }
  const [lo, hi] = f.length;
  if (!capped && (s.length.median < lo || s.length.median > hi)) {
    flags.push({ id: 'length', kind: 'balance', text: `Campaigns last ${Math.round(s.length.median)} minutes (median; goal ${lo}–${hi}).` });
  }
  const spread = doctrineSpread(s);
  if (spread > f.maxDoctrineSpread) {
    const byWins = [...s.personality.doctrine].sort((a, b) => share(b.wins) - share(a.wins));
    const best = byWins[0];
    const worst = byWins[byWins.length - 1];
    flags.push({
      id: 'doctrines',
      kind: 'balance',
      text: `AI doctrine decides too much: ${best.label} wins ${pct(share(best.wins))} of its seats, ${worst.label} ${pct(share(worst.wins))} (goal: best ≤ ${f.maxDoctrineSpread}× worst).`,
    });
  }
  const at30 = s.minors?.aliveAt.find((a) => a.minute === 30);
  if (at30 && share(at30.rate) < f.minMinorsAt30) {
    flags.push({ id: 'minors', kind: 'balance', text: `Only ${pct(share(at30.rate))} of minor powers are still standing at 30 minutes (goal ≥ ${pct(f.minMinorsAt30)}).` });
  }
  for (const u of capped ? [] : s.units) {
    if (share(u.raisableIn) >= f.unusedContentShare && u.raisedIn.k === 0) {
      flags.push({
        id: `unit:${u.id}`,
        kind: 'content',
        text: `${u.name} could be raised in ${pct(share(u.raisableIn))} of campaigns, but no AI ever raised one: does it have a share in AI.doctrineMix (src/sim/config/ai.ts)?`,
      });
    }
  }
  for (const b of capped ? [] : s.buildings) {
    if (share(b.unlockedIn) >= f.unusedContentShare && b.heldIn.k === 0) {
      flags.push({
        id: `building:${b.id}`,
        kind: 'content',
        text: `${b.name} is unlocked in ${pct(share(b.unlockedIn))} of campaigns, but no AI ever built one: does handleConstruction (src/sim/ai/economy.ts) plan it, and can the AI meet its requirements?`,
      });
    }
  }
  return { fun, flags };
}
