// A run's summary as a markdown report: red flags first, then the goal penalty, nations,
// pace, AI personalities and how the AI uses each unit, building and technology.
import { GOALS, type GoalUnit } from './goals';
import { describeOverrides } from './overrides';
import { share, wilsonHalfWidth, type Mean, type Rate } from './stats';
import type { Summary } from './summary';

export const pct = (r: Rate) => (r.n > 0 ? `${Math.round((r.k / r.n) * 100)}%` : '–');
export const num = (x: number | null | undefined, digits = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '–' : x.toFixed(digits));
const avg = (m: Mean, digits = 1) => num(m.mean, digits);
const pm = (r: Rate) => (r.n > 0 ? `±${Math.round(wilsonHalfWidth(r) * 100)}` : '');

export function table(headers: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]) => `| ${cells.map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

export function runLine(s: Summary): string {
  const m = s.meta;
  const cpu = Number.isFinite(s.cpuSecondsPerGame) ? ` · ${s.cpuSecondsPerGame.toFixed(1)} s of CPU per campaign` : '';
  return `${s.games} campaigns (seeds ${m.seeds}) of ${m.label}, commit \`${m.commit}\` · overrides: ${describeOverrides(m.overrides)}${cpu}`;
}

export function flagList(s: Summary): string {
  if (s.flags.length === 0) return 'None.';
  const label = { balance: 'Balance', content: 'Content', run: 'Run' } as const;
  return s.flags.map((f) => `- **${label[f.kind]}:** ${f.text}`).join('\n');
}

/** A goal's measured value, in the goal's own unit. */
export function goalValue(unit: GoalUnit, v: number | undefined): string {
  if (v === undefined) return '–';
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 'n/a' : '∞';
  return unit === 'percent' ? `${Math.round(v * 100)}%` : unit === 'minutes' ? v.toFixed(0) : `${v.toFixed(2)}×`;
}

export function funTable(s: Summary): string {
  return table(
    ['Goal', 'Now', 'Target', 'Penalty × weight'],
    s.fun.terms.map((t) => [t.label, goalValue(t.unit, t.value), t.goal, num(t.penalty * t.weight, 2)]),
  );
}

export function renderReport(s: Summary): string {
  const out: string[] = [];
  const playable = s.nations.filter((n) => n.playable);
  const minors = s.nations.filter((n) => !n.playable);
  out.push(`# Balance report`, '', runLine(s), '');
  out.push('## Red flags', '', flagList(s), '');
  out.push(`## Goal penalty: ${num(s.fun.total, 2)}`, '');
  out.push('_0 meets every goal. `npm run balance:tune` searches for AI settings that lower it; the goals are in `scripts/balance/goals.ts`._', '');
  out.push(funTable(s), '');

  out.push('## Nations', '');
  out.push(
    table(
      ['Nation', 'Tier', 'Wins', 'Lasts the campaign', `Out by ${GOALS.earlyMinutes} min`, `Place (of ${playable.length})`, 'Out at (median min)', 'Provinces, end / peak'],
      playable.map((n) => [n.name, n.tier, `${pct(n.wins)} ${pm(n.wins)}`, pct(n.survived), pct(n.knockedOutEarly), avg(n.rank), num(n.outAt, 0), `${avg(n.provinces)} / ${avg(n.peakProvinces)}`]),
    ),
    '',
  );
  if (minors.length > 0) {
    out.push(
      table(
        ['Minor power', 'Lasts the campaign', 'Out at (median min)', `Place (of ${s.nations.length})`],
        minors.map((n) => [n.name, pct(n.survived), num(n.outAt, 0), avg(n.rank)]),
      ),
      '',
    );
  }
  out.push(
    table(
      ['Tier', 'Seats', 'Wins', 'Lasts the campaign', `Out by ${GOALS.earlyMinutes} min`, 'Out at (median min)'],
      s.tiers.map((t) => [t.tier, t.seats, pct(t.wins), pct(t.survived), pct(t.knockedOutEarly), num(t.outAt, 0)]),
    ),
    '',
  );

  const p = s.pace;
  const g = p.perGame;
  const outcomeText = Object.entries(s.outcomes)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${Math.round((v / s.games) * 100)}%`)
    .join(', ');
  out.push('## Pace and drama', '');
  out.push(`- Outcomes: ${outcomeText}.`);
  out.push(`- Length: median ${num(s.length.median, 0)} min (10th–90th percentile ${num(s.length.p10, 0)}–${num(s.length.p90, 0)}); ${pct(s.reachedLimit)} run to the limit.`);
  out.push(`- First war at minute ${num(p.firstWar, 0)} (median). A playable nation is knocked out in ${pct(p.anyKnockout)} of campaigns, the first at minute ${num(p.firstKnockout, 0)} (median).`);
  out.push(
    `- Per campaign: ${avg(g.wars)} wars, ${avg(g.peace)} peace treaties, ${avg(g.captures, 0)} provinces changing hands, ${avg(g.battles, 0)} battles, ${avg(g.withdrawals)} withdrawals under fire, ${avg(g.cityGrowth)} cities grown; largest army ${avg(g.largestArmy, 0)} units.`,
  );
  out.push(
    `- VP lead changes: ${num(s.drama.leadChanges.median, 0)} (median). The clear VP leader at ${s.drama.leaderWins.map((l) => l.minute).join(' / ')} minutes goes on to win ${s.drama.leaderWins.map((l) => pct(l.rate)).join(' / ')} of the time.`,
  );
  if (s.minors && s.minors.aliveAt.length > 0) {
    out.push(`- Minor powers still standing at ${s.minors.aliveAt.map((a) => a.minute).join(' / ')} minutes: ${s.minors.aliveAt.map((a) => pct(a.rate)).join(' / ')}.`);
  }
  out.push('');
  out.push(
    table(
      ['Great power: provinces gained in the first 20 min', 'Seats', 'Wins', 'Lasts the campaign'],
      s.earlyGrab.map((b) => [b.label, b.seats, pct(b.wins), pct(b.survived)]),
    ),
    '',
  );

  out.push('## AI personalities', '');
  out.push('_Each computer opponent draws a doctrine, aggression and economy bias from the seed, so every run also tests which personalities do well. Place is among the playable nations (lower is better)._', '');
  out.push(
    table(
      ['Doctrine', 'Seats', 'Wins', 'Place', "Place vs the nation's average"],
      s.personality.doctrine.map((d) => [d.label, d.seats, pct(d.wins), avg(d.rank, 2), `${d.adjusted >= 0 ? '+' : ''}${num(d.adjusted, 2)}`]),
    ),
    '',
  );
  for (const [name, bands] of [
    ['Aggression', s.personality.aggression],
    ['Economy bias', s.personality.economyBias],
  ] as const) {
    out.push(table([name, 'Seats', 'Wins', 'Place'], bands.map((b) => [b.label, b.seats, pct(b.wins), avg(b.rank, 2)])), '');
  }

  out.push('## Units', '');
  out.push(
    "_How the AI uses each unit type: the share of campaigns in which some nation had researched it, could raise it (it also held the buildings it needs) and did; then how many were raised and lost per campaign, all nations together._",
    '',
  );
  out.push(
    table(
      ['Unit', 'Researched in', 'Could be raised in', 'Raised in', 'Raised', 'Lost'],
      s.units.map((u) => [u.name, pct(u.unlockedIn), pct(u.raisableIn), pct(u.raisedIn), avg(u.raised), avg(u.lost)]),
    ),
    '',
  );
  out.push('## Buildings', '');
  out.push(
    table(
      ['Building', 'Unlocked in', 'Held in', 'Levels held (peak, all nations)'],
      s.buildings.map((b) => [b.name, pct(b.unlockedIn), pct(b.heldIn), avg(b.levels)]),
    ),
    '',
  );

  out.push('## Research', '');
  out.push(`Playable nations complete ${avg(s.research.at60)} technologies by minute 60 and ${avg(s.research.atEnd)} by the end (mean).`, '');
  const favoured = [...s.techs].filter((t) => t.winners.n > 0).sort((a, b) => share(b.winners) - share(b.seats) - (share(a.winners) - share(a.seats)));
  out.push(
    table(
      ['Researched more by winners', 'Column', 'Winners', 'All playable nations'],
      favoured.slice(0, 8).map((t) => [t.name, t.col, pct(t.winners), pct(t.seats)]),
    ),
    '',
  );
  const rare = s.techs.filter((t) => share(t.seats) < 0.05);
  out.push(`Researched by under 5% of playable nations: ${rare.length > 0 ? rare.map((t) => `${t.name} (column ${t.col})`).join(', ') : 'none'}.`, '');
  return out.join('\n');
}
