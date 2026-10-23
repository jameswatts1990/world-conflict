// The tech lab's numbers and report: what each technology was worth, from the paired campaigns
// that techs.ts plays (see techlab.ts for the method), and joining runs split over CI runners.
import { GOALS } from './goals';
import { describeOverrides, type Override } from './overrides';
import { num, table } from './report';
import { meanOf, meanZeroP, qValues, type Mean } from './stats';
import type { SeatResult, TechSeedResult, TechSettings } from './techlab';

export interface TechInfo {
  id: string;
  name: string;
  branch: string;
  col: number;
  cost: string;
}

export interface TechRun {
  label: string;
  commit: string;
  overrides: Override[];
  settings: TechSettings;
  seeds: string;
  techs: TechInfo[];
  results: TechSeedResult[];
}

export interface TechRow extends TechInfo {
  /** Seeds where the test seat could be handed it (it did not have it yet). */
  pairs: number;
  /** Share of seeds where the test seat already had it at the handover. */
  alreadyHad: number;
  /** Places gained among the playable nations (control place minus place with it): positive helps. */
  places: Mean;
  p: number;
  q: number;
  wins: number;
  survival: number;
  provinces: number;
}

const delta = (results: { control: SeatResult; with: SeatResult }[], f: (r: SeatResult) => number) =>
  results.length > 0 ? results.reduce((s, r) => s + f(r.with) - f(r.control), 0) / results.length : NaN;

export function techRows(run: TechRun): TechRow[] {
  const rows = run.techs.map((t) => {
    const tested = run.results.filter((r) => t.id in r.granted);
    const pairs = tested.filter((r) => r.granted[t.id] !== null).map((r) => ({ control: r.control, with: r.granted[t.id]! }));
    const places = meanOf(pairs.map((r) => r.control.place - r.with.place));
    return {
      ...t,
      pairs: pairs.length,
      alreadyHad: tested.length > 0 ? (tested.length - pairs.length) / tested.length : NaN,
      places,
      p: meanZeroP(places),
      q: 1,
      wins: delta(pairs, (r) => (r.won ? 1 : 0)),
      survival: delta(pairs, (r) => (r.survived ? 1 : 0)),
      provinces: delta(pairs, (r) => r.provinces),
    };
  });
  const q = qValues(rows.map((r) => r.p));
  rows.forEach((r, i) => (r.q = q[i]));
  return rows.sort((a, b) => (b.places.mean || 0) - (a.places.mean || 0));
}

export function techFlags(rows: TechRow[]): string[] {
  const { strong, weak } = GOALS.techValue;
  const flags: string[] = [];
  for (const r of rows) {
    if (r.pairs < 10) continue;
    const se = r.places.sd / Math.sqrt(r.places.n);
    const v = `${signed(r.places.mean)} places (±${num(1.96 * se, 2)})`;
    if (r.q < 0.05 && r.places.mean >= strong) flags.push(`${r.name} (column ${r.col}) is worth ${v} to the nation that gets it: one of the strongest; is it meant to be?`);
    else if (r.q < 0.05 && r.places.mean < 0) flags.push(`${r.name} (column ${r.col}) costs the nation that gets it ${v}: a technology should not hurt.`);
    else if (r.places.mean + 1.96 * se < weak) flags.push(`${r.name} (column ${r.col}) is worth at most ${num(r.places.mean + 1.96 * se, 2)} places (${v}): too small to notice.`);
  }
  return flags;
}

const signed = (x: number, digits = 2) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${x.toFixed(digits)}` : '–');
const pts = (x: number) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${Math.round(x * 100)} pts` : '–');

export function renderTechs(run: TechRun): string {
  const rows = techRows(run);
  const flags = techFlags(rows);
  const s = run.settings;
  const out: string[] = ['# Tech lab', ''];
  out.push(
    `${run.label}, commit \`${run.commit}\` · overrides: ${describeOverrides(run.overrides)} · seeds ${run.seeds} · handed over at minute ${s.at}${s.minutes > 0 ? ` · campaigns stopped at ${s.minutes} minutes` : ''}`,
    '',
  );
  out.push(
    "_Each campaign is played to the handover minute; from there it plays on twice, as it was and with the technology handed to one playable nation (a different one each seed). **Places** is how many places among the playable nations that nation gained by the end because of it (±: 95% margin); q corrects for testing every technology at once (under 0.05: likely real). Wins, survival and provinces are the same comparison. **Had it** is how often the nation already had it at the handover: a technology nearly everyone has by then is measured on few campaigns._",
    '',
  );
  out.push('## Red flags', '', flags.length > 0 ? flags.map((f) => `- ${f}`).join('\n') : 'None.', '');
  out.push('## Technologies, most valuable first', '');
  out.push(
    table(
      ['Technology', 'Branch', 'Column', 'Cost', 'Campaigns', 'Places', 'q', 'Wins', 'Survival', 'Provinces', 'Had it'],
      rows.map((r) => {
        const se = r.places.n > 1 ? r.places.sd / Math.sqrt(r.places.n) : NaN;
        return [r.name, r.branch, r.col, r.cost, r.pairs, `${signed(r.places.mean)} ±${num(1.96 * se, 2)}`, num(r.q, 3), pts(r.wins), pts(r.survival), signed(r.provinces, 1), `${Math.round(r.alreadyHad * 100)}%`];
      }),
    ),
    '',
  );
  const branches = [...new Set(rows.map((r) => r.branch))].sort();
  out.push(
    table(
      ['Branch', 'Technologies', 'Mean places gained'],
      branches.map((b) => {
        const mine = rows.filter((r) => r.branch === b && r.pairs > 0);
        return [b, mine.length, signed(mine.reduce((sum, r) => sum + r.places.mean, 0) / Math.max(1, mine.length))];
      }),
    ),
    '',
  );
  return out.join('\n');
}

/** One run from shards that played the same seeds with different technologies. */
export function mergeRuns(runs: TechRun[]): TechRun {
  const bySeed = new Map<number, TechSeedResult>();
  for (const run of runs) {
    for (const r of run.results) {
      const have = bySeed.get(r.seed);
      if (have) {
        Object.assign(have.granted, r.granted);
        have.played += r.played - 1;
      } else bySeed.set(r.seed, structuredClone(r));
    }
  }
  const techs = new Map(runs.flatMap((r) => r.techs).map((t) => [t.id, t]));
  return { ...runs[0], techs: [...techs.values()], results: [...bySeed.values()].sort((a, b) => a.seed - b.seed) };
}

