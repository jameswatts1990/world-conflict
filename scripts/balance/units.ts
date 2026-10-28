// npm run balance:units: the unit lab. Staged battles between armies of equal cost show what
// each unit type is worth for its price at each technology level, by ground and role, and which
// armies beat which (see lab.ts for the method).
//
//   npm run balance:units                              every unit, every technology level
//   npm run balance:units -- --units tank,antiTank --levels ww2
//   npm run balance:units -- --set UNITS.tank.cost.money=260
//   npm run balance:units -- --output fuel=60          price fuel as if a playable nation made 60 a minute
//   npm run balance:units -- --vs main                 the working tree's units against main's
//
// Options: --budget 12 (army size in line infantry), --seeds 8 (battles per data point),
// --upkeep 30 (minutes of upkeep in a unit's price), --workers, --out DIR, --quiet.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { ResourceKey, UnitType } from '../../src/sim/types';
import { workingTree } from './git';
import { GOALS } from './goals';
import { FORTIFIED, labGrounds, REFERENCE, techLevels, type LabCell, type LabResult, type LabSettings, type Role } from './lab';
import { describeOverrides, parseOverride, type Override } from './overrides';
import { defaultWorkers, progress, runTasks, type WorkerTask } from './pool';
import { num, table } from './report';
import { baselineCheckout, newRunDir, positiveInt } from './run';
import { balanceWorld, loadSim } from './sim';

export interface UnitRow {
  unit: string;
  name: string;
  short: string;
  /** Price in line infantry. */
  price: number;
  army: string;
  /** Value index (geometric means): attacking, defending, and both on every ground. */
  attack: number;
  defence: number;
  overall: number;
  byGround: Record<string, number>;
  /** Mean edge over every other army of the same cost (-1..1; positive beats them). */
  field: number;
}

export interface LevelReport {
  level: string;
  year: string;
  grounds: string[];
  /** Short names of every unit type at this level (matchup columns). */
  shorts: Record<string, string>;
  units: UnitRow[];
  /** matchups[a][b]: how far a's army beats b's of the same cost, attacking and defending (-1..1). */
  matchups: Record<string, Record<string, number>>;
}

export interface LabReport {
  label: string;
  commit: string;
  overrides: Override[];
  settings: LabSettings;
  levels: LevelReport[];
  flags: { id: string; text: string }[];
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    units: { type: 'string' },
    levels: { type: 'string' },
    budget: { type: 'string' },
    seeds: { type: 'string' },
    upkeep: { type: 'string' },
    output: { type: 'string' },
    workers: { type: 'string' },
    set: { type: 'string', multiple: true },
    vs: { type: 'string' },
    out: { type: 'string' },
    quiet: { type: 'boolean' },
  },
});

/** "fuel=60,materials=200" */
function parseOutput(text: string | undefined): LabSettings['output'] {
  if (!text) return undefined;
  const output: Partial<Record<ResourceKey, number>> = {};
  for (const part of text.split(',')) {
    const [key, value] = part.split('=').map((x) => x.trim());
    if (!['money', 'materials', 'fuel', 'manpower'].includes(key) || !(Number(value) > 0)) throw new Error(`--output "${text}" should look like fuel=60,materials=200`);
    output[key as ResourceKey] = Number(value);
  }
  return output;
}

const settings: LabSettings = {
  budget: Math.max(2, positiveInt(values.budget, 12, 'budget')),
  seeds: Math.max(1, positiveInt(values.seeds, 8, 'seeds')),
  upkeepMinutes: positiveInt(values.upkeep, 30, 'upkeep'),
  output: parseOutput(values.output),
};
const workers = Math.max(1, positiveInt(values.workers, defaultWorkers(), 'workers'));
const overrides = (values.set ?? []).map(parseOverride);
const onlyUnits = values.units?.split(',').map((u) => u.trim()) ?? null;
const onlyLevels = values.levels?.split(',').map((l) => l.trim()) ?? null;

const geo = (xs: number[]) => (xs.length === 0 ? NaN : Math.exp(xs.reduce((s, x) => s + Math.log(Math.max(1e-6, x)), 0) / xs.length));

async function runLab(simRoot: string, overrides: Override[], label: string, commit: string): Promise<LabReport> {
  // Plan from this copy of the simulation (its units, levels and terrains), unmodified: the
  // overrides apply in the workers, which fight the battles.
  const sim = await loadSim(simRoot, []);
  const grounds = labGrounds(balanceWorld(sim));
  const roles: Role[] = ['attack', 'defence'];
  const levels = techLevels(sim).filter((l) => !onlyLevels || onlyLevels.includes(l.id));
  for (const u of onlyUnits ?? []) if (!sim.api.UNIT_TYPES.includes(u as UnitType)) throw new Error(`Unknown unit type ${u}`);
  const cells: LabCell[] = [];
  for (const level of levels) {
    const tested = level.units.filter((u) => u === REFERENCE || !onlyUnits || onlyUnits.includes(u));
    for (const unit of tested) for (const ground of grounds) for (const role of roles) cells.push({ kind: 'index', level: level.id, unit, ground, role });
    for (const unit of tested) {
      for (const versus of level.units) {
        if (versus === unit) continue;
        for (const ground of grounds) {
          cells.push({ kind: 'matchup', level: level.id, unit, versus, ground });
          if (!tested.includes(versus)) cells.push({ kind: 'matchup', level: level.id, unit: versus, versus: unit, ground });
        }
      }
    }
  }
  const size = Math.ceil(cells.length / (workers * 2));
  const tasks: WorkerTask[] = [];
  for (let i = 0; i < cells.length; i += size) tasks.push({ kind: 'lab', simRoot, overrides, cells: cells.slice(i, i + size), settings });
  const results: LabResult[] = [];
  const tick = progress(`data points (${label})`, cells.length);
  await runTasks(tasks, workers, (msg) => {
    if (msg.type === 'lab') {
      results.push(msg.result);
      tick();
    }
  });

  const reports = levels.map((level): LevelReport => {
    const index = results.filter((r) => r.cell.kind === 'index' && r.cell.level === level.id);
    const key = (r: LabResult) => (r.cell.kind === 'index' ? `${r.cell.ground}:${r.cell.role}` : '');
    // Line infantry's own figure sets 1.0 for each ground and role.
    const ref = new Map(index.filter((r) => r.cell.unit === REFERENCE).map((r) => [key(r), r.value / r.armyCost]));
    const ratio = (r: LabResult) => r.value / r.armyCost / ref.get(key(r))!;
    const matchup = new Map<string, number>();
    for (const r of results) if (r.cell.kind === 'matchup' && r.cell.level === level.id) matchup.set(`${r.cell.unit}>${r.cell.versus}>${r.cell.ground}`, r.value);
    const has = (a: string, b: string) => grounds.every((g) => matchup.has(`${a}>${b}>${g}`) && matchup.has(`${b}>${a}>${g}`));
    const edge = (a: string, b: string) => grounds.reduce((s, g) => s + (matchup.get(`${a}>${b}>${g}`)! - matchup.get(`${b}>${a}>${g}`)!) / 2, 0) / grounds.length;
    const tested = [...new Set(index.map((r) => r.cell.unit))];
    const units = tested.map((unit): UnitRow => {
      const mine = index.filter((r) => r.cell.unit === unit);
      const byRole = (role: Role) => geo(mine.filter((r) => r.cell.kind === 'index' && r.cell.role === role).map(ratio));
      const byGround: Record<string, number> = {};
      for (const g of grounds) byGround[g] = geo(mine.filter((r) => r.cell.kind === 'index' && r.cell.ground === g).map(ratio));
      const others = level.units.filter((u) => u !== unit && has(unit, u));
      const cfg = sim.config.UNITS[unit];
      return {
        unit,
        name: cfg.name,
        short: cfg.short,
        price: mine[0].price,
        army: mine[0].army,
        attack: byRole('attack'),
        defence: byRole('defence'),
        overall: geo(mine.map(ratio)),
        byGround,
        field: others.length > 0 ? others.reduce((s, o) => s + edge(unit, o), 0) / others.length : NaN,
      };
    });
    const matchups: LevelReport['matchups'] = {};
    for (const a of tested) {
      matchups[a] = {};
      for (const b of level.units) if (a !== b && has(a, b)) matchups[a][b] = edge(a, b);
    }
    const shorts = Object.fromEntries(level.units.map((u) => [u, sim.config.UNITS[u].short]));
    return { level: level.id, year: sim.config.GEN_YEAR[level.id as keyof typeof sim.config.GEN_YEAR] ?? level.id, grounds, shorts, units, matchups };
  });

  // Flags, one line per unit type across the technology levels.
  const [lo, hi] = GOALS.unitIndex;
  const flags: LabReport['flags'] = [];
  const names = [...new Set(reports.flatMap((l) => l.units.map((u) => u.unit)))];
  for (const unit of names) {
    const rows = reports.map((l) => ({ year: l.year, row: l.units.find((u) => u.unit === unit), edges: Object.values(l.matchups[unit] ?? {}) })).filter((x) => x.row);
    const name = rows[0].row!.name;
    const list = (xs: typeof rows) => xs.map((x) => `${num(x.row!.overall, 2)}× in ${x.year}`).join(', ');
    if (unit !== REFERENCE) {
      const cheap = rows.filter((x) => x.row!.overall > hi);
      const dear = rows.filter((x) => x.row!.overall < lo);
      if (cheap.length > 0) flags.push({ id: `cheap:${unit}`, text: `${name} armies are worth more than their price against line infantry (goal ≤ ${hi}×): ${list(cheap)}.` });
      if (dear.length > 0) flags.push({ id: `dear:${unit}`, text: `${name} armies are worth less than their price against line infantry (goal ≥ ${lo}×): ${list(dear)}.` });
    }
    const beatsAll = rows.filter((x) => x.edges.length >= 3 && x.edges.every((e) => e > 0)).map((x) => x.year);
    const losesAll = rows.filter((x) => x.edges.length >= 3 && x.edges.every((e) => e < 0)).map((x) => x.year);
    if (beatsAll.length > 0) flags.push({ id: `beats:${unit}`, text: `${name} beats every other army of the same cost in ${beatsAll.join(', ')}: nothing counters it.` });
    if (losesAll.length > 0) flags.push({ id: `loses:${unit}`, text: `${name} loses to every other army of the same cost in ${losesAll.join(', ')}.` });
  }
  return { label, commit, overrides, settings, levels: reports, flags };
}

const signed = (x: number | undefined, digits = 2) => (x !== undefined && Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${x.toFixed(digits)}` : '–');
const groundName = (g: string) => (g === FORTIFIED ? 'behind forts' : g);

function settingsLine(r: LabReport): string {
  const s = r.settings;
  const output = s.output ? ` · priced by an output of ${Object.entries(s.output).map(([k, v]) => `${v} ${k}`).join(', ')} a minute` : '';
  return `${r.label}, commit \`${r.commit}\` · overrides: ${describeOverrides(r.overrides)} · armies of ${s.budget} line infantry's worth · ${s.seeds} battles per data point · prices include ${s.upkeepMinutes} minutes of upkeep${output}`;
}

function renderLab(r: LabReport): string {
  const out: string[] = ['# Unit lab', '', settingsLine(r), ''];
  out.push(
    "_An army built around a unit spends half its budget on that unit and the rest on line infantry. **Value** is how much line infantry it can face evenly per unit of its own cost, against line infantry's own figure (1.00): above 1 it gives more than it costs. **Field** is its average edge over every other army of the same cost (−1 to +1). Prices are in line infantry, each resource priced by how scarce it is in a great power's output, so fuel is dear. Specialists show their worth in the matchups and on their ground (anti-tank guns against armour, siege guns behind forts)._",
    '',
  );
  out.push('## Red flags', '', r.flags.length > 0 ? r.flags.map((f) => `- ${f.text}`).join('\n') : 'None.', '');
  for (const level of r.levels) {
    out.push(`## ${level.year} (${level.level} equipment)`, '');
    out.push(
      table(
        ['Unit', 'Price', 'Army', 'Value attacking', 'defending', 'overall', 'Field'],
        [...level.units].sort((a, b) => b.overall - a.overall).map((u) => [u.name, num(u.price, 2), u.army, num(u.attack, 2), num(u.defence, 2), `**${num(u.overall, 2)}**`, signed(u.field)]),
      ),
      '',
    );
    out.push(table(['Value by ground', ...level.grounds.map(groundName)], level.units.map((u) => [u.name, ...level.grounds.map((g) => num(u.byGround[g], 2))])), '');
    const cols = [...new Set(Object.values(level.matchups).flatMap((m) => Object.keys(m)))];
    if (cols.length > 0) {
      const short = (id: string) => level.shorts[id] ?? id;
      out.push('_Matchups: how far the row army beats the column army of the same cost, on every ground, attacking and defending (+1: always wins with nothing lost)._', '');
      out.push(table(['', ...cols.map(short)], Object.entries(level.matchups).map(([a, row]) => [short(a), ...cols.map((b) => (a === b ? '·' : signed(row[b])))])), '');
    }
  }
  return out.join('\n');
}

function renderLabComparison(a: LabReport, b: LabReport): string {
  const out: string[] = ['# Unit lab comparison', ''];
  out.push(`- **A:** ${settingsLine(a)}`, `- **B:** ${settingsLine(b)}`, '');
  out.push('_Both sides fight the same battles with the same dice, so differences come from the change; with the default battles per data point, moves under about 0.05 are noise._', '');
  for (const lb of b.levels) {
    const la = a.levels.find((l) => l.level === lb.level);
    out.push(`## ${lb.year}`, '');
    out.push(
      table(
        ['Unit', 'Price A → B', 'Value A', 'Value B', 'Change', 'Field A → B'],
        lb.units.map((ub) => {
          const ua = la?.units.find((u) => u.unit === ub.unit);
          return [ub.name, `${num(ua?.price, 2)} → ${num(ub.price, 2)}`, num(ua?.overall, 2), num(ub.overall, 2), ua ? signed(ub.overall - ua.overall) : 'new', `${signed(ua?.field)} → ${signed(ub.field)}`];
        }),
      ),
      '',
    );
  }
  const inA = new Set(a.flags.map((f) => f.id));
  const inB = new Set(b.flags.map((f) => f.id));
  const lines = [...b.flags.map((f) => `- ${inA.has(f.id) ? '' : '**New:** '}${f.text}`), ...a.flags.filter((f) => !inB.has(f.id)).map((f) => `- **Gone:** ${f.text}`)];
  out.push('## Red flags', '', lines.length > 0 ? lines.join('\n') : 'None.', '');
  return out.join('\n');
}

const out = values.out ?? newRunDir(values.vs ? `units-vs-${values.vs.replace(/[^\w.-]+/g, '_')}` : 'units');
const head = workingTree();
console.error(`Unit lab on ${workers} workers…`);
const save = (dir: string, report: LabReport) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'units.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(dir, 'units.md'), renderLab(report));
};
if (!values.vs) {
  const report = await runLab(head.simRoot, overrides, head.label, head.commit);
  save(out, report);
  if (!values.quiet) console.log(renderLab(report));
  console.error(`Saved to ${out}/ (units.md, units.json).`);
} else {
  const { checkout: base, label } = baselineCheckout(values.vs, 'balance-runs');
  try {
    const a = await runLab(base.simRoot, [], label, base.commit);
    const b = await runLab(head.simRoot, overrides, head.label, head.commit);
    save(join(out, 'a'), a);
    save(join(out, 'b'), b);
    const text = renderLabComparison(a, b);
    writeFileSync(join(out, 'compare.md'), text);
    if (!values.quiet) console.log(text);
    console.error(`Saved to ${out}/ (compare.md, and each side in a/ and b/).`);
  } finally {
    base.dispose();
  }
}
