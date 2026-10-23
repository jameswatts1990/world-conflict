// Two runs side by side (A = baseline, B = the change), with a test for each number. A report
// checks dozens of numbers at once, so it marks a change as likely real only when its q-value
// (Benjamini–Hochberg) is under 0.05; a p-value under 0.05 alone is marked "possible".
import { describeOverrides } from './overrides';
import { goalValue, num, pct, table } from './report';
import { meanDiffP, qValues, rateDiffP, share, type Mean, type Rate } from './stats';
import type { Summary } from './summary';

interface Test {
  group: string;
  label: string;
  a: string;
  b: string;
  change: string;
  p: number;
}

function rateTest(group: string, label: string, a: Rate, b: Rate): Test {
  const d = (share(b) - share(a)) * 100;
  return { group, label, a: pct(a), b: pct(b), change: `${d >= 0 ? '+' : ''}${d.toFixed(0)} pts`, p: rateDiffP(a, b) };
}

function meanTest(group: string, label: string, a: Mean, b: Mean, digits = 1): Test {
  const d = b.mean - a.mean;
  return { group, label, a: num(a.mean, digits), b: num(b.mean, digits), change: `${d >= 0 ? '+' : ''}${num(d, digits)}`, p: meanDiffP(a, b) };
}

export function compareTests(a: Summary, b: Summary): Test[] {
  const tests: Test[] = [];
  tests.push(rateTest('Campaigns', 'Decided on objectives', a.endedByObjectives, b.endedByObjectives));
  tests.push(meanTest('Campaigns', 'Length (mean minutes)', a.length, b.length, 0));
  tests.push(rateTest('Campaigns', 'Playable seats knocked out early', a.earlyKnockouts, b.earlyKnockouts));
  const leader40 = (s: Summary) => s.drama.leaderWins.find((l) => l.minute === 40)!.rate;
  tests.push(rateTest('Campaigns', 'VP leader at 40 min wins', leader40(a), leader40(b)));
  tests.push(meanTest('Campaigns', 'VP lead changes', a.drama.leadChanges, b.drama.leadChanges));
  for (const k of ['wars', 'peace', 'captures', 'battles', 'withdrawals'] as const) {
    tests.push(meanTest('Campaigns', `${k[0].toUpperCase()}${k.slice(1)} per campaign`, a.pace.perGame[k], b.pace.perGame[k]));
  }
  for (const nb of b.nations) {
    const na = a.nations.find((n) => n.id === nb.id);
    if (!na) continue;
    const group = nb.playable ? 'Playable nations' : 'Minor powers';
    if (nb.playable) tests.push(rateTest(group, `${nb.name}: wins`, na.wins, nb.wins));
    tests.push(rateTest(group, `${nb.name}: lasts the campaign`, na.survived, nb.survived));
    if (nb.playable) tests.push(meanTest(group, `${nb.name}: place`, na.rank, nb.rank, 2));
  }
  if (a.minors && b.minors) {
    for (const at of b.minors.aliveAt) {
      const before = a.minors.aliveAt.find((x) => x.minute === at.minute);
      if (before) tests.push(rateTest('Minor powers', `Standing at ${at.minute} min`, before.rate, at.rate));
    }
  }
  for (const db of b.personality.doctrine) {
    const da = a.personality.doctrine.find((d) => d.label === db.label);
    if (da) tests.push(rateTest('AI doctrines', `${db.label}: wins`, da.wins, db.wins));
  }
  for (const ub of b.units) {
    const ua = a.units.find((u) => u.id === ub.id);
    if (ua) tests.push(meanTest('Units raised per campaign', ub.name, ua.raised, ub.raised));
  }
  return tests;
}

function side(s: Summary): string {
  return `${s.meta.label} (\`${s.meta.commit}\`, overrides: ${describeOverrides(s.meta.overrides)})`;
}

export function renderComparison(a: Summary, b: Summary): string {
  const tests = compareTests(a, b);
  const q = qValues(tests.map((t) => t.p));
  const mark = (i: number) => (q[i] < 0.05 ? 'likely real' : tests[i].p < 0.05 ? 'possible' : '');
  const out: string[] = ['# Balance comparison', ''];
  out.push(`- **A:** ${a.games} campaigns of ${side(a)}`);
  out.push(`- **B:** ${b.games} campaigns of ${side(b)}`, '');
  out.push(`Goal penalty: **${num(a.fun.total, 2)} → ${num(b.fun.total, 2)}** (lower is better).`, '');

  const notable = tests.map((t, i) => ({ t, i })).filter(({ t, i }) => q[i] < 0.05 || t.p < 0.05);
  out.push('## Changes that stand out', '');
  if (notable.length === 0) out.push('None: nothing moved by more than these runs can tell from chance.', '');
  else {
    out.push(
      table(
        ['', 'A', 'B', 'Change', 'p', 'q', ''],
        notable.sort((x, y) => x.t.p - y.t.p).map(({ t, i }) => [`${t.group}: ${t.label}`, t.a, t.b, t.change, num(t.p, 3), num(q[i], 3), mark(i)]),
      ),
      '',
    );
  }
  out.push('_p: the chance of a difference this big if nothing changed. q: the same, corrected for testing many numbers at once; under 0.05 means likely real._', '');

  out.push('## Goals', '');
  out.push(
    table(
      ['Goal', 'Target', 'A', 'B', 'Penalty A → B'],
      b.fun.terms.map((tb) => {
        const ta = a.fun.terms.find((t) => t.id === tb.id);
        return [tb.label, tb.goal, goalValue(tb.unit, ta?.value), goalValue(tb.unit, tb.value), `${num((ta?.penalty ?? 0) * tb.weight, 2)} → ${num(tb.penalty * tb.weight, 2)}`];
      }),
    ),
    '',
  );

  const newIn = (x: Summary, y: Summary) => y.nations.filter((n) => !x.nations.some((m) => m.id === n.id)).map((n) => n.name);
  const added = newIn(a, b);
  const removed = newIn(b, a);
  if (added.length || removed.length) out.push(`Nations only in B: ${added.join(', ') || 'none'}. Only in A: ${removed.join(', ') || 'none'}.`, '');

  for (const group of [...new Set(tests.map((t) => t.group))]) {
    out.push(`## ${group}`, '');
    out.push(
      table(
        ['', 'A', 'B', 'Change', 'p', ''],
        tests.map((t, i) => ({ t, i })).filter(({ t }) => t.group === group).map(({ t, i }) => [t.label, t.a, t.b, t.change, num(t.p, 3), mark(i)]),
      ),
      '',
    );
  }
  if (a.flags.length || b.flags.length) {
    out.push('## Red flags', '');
    const ids = (s: Summary) => new Set(s.flags.map((f) => f.id));
    const inA = ids(a);
    const inB = ids(b);
    for (const f of b.flags) out.push(`- ${inA.has(f.id) ? '' : '**New:** '}${f.text}`);
    for (const f of a.flags) if (!inB.has(f.id)) out.push(`- **Gone:** ${f.text}`);
    out.push('');
  }
  return out.join('\n');
}
