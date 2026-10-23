// Small statistics for the balance reports: rates with confidence intervals, means with spread,
// and tests for whether two runs really differ.

/** k successes out of n. */
export interface Rate {
  k: number;
  n: number;
}

export interface Mean {
  n: number;
  mean: number;
  sd: number;
}

export function rate(k: number, n: number): Rate {
  return { k, n };
}

export function share(r: Rate): number {
  return r.n > 0 ? r.k / r.n : NaN;
}

export function meanOf(xs: readonly number[]): Mean {
  const n = xs.length;
  if (n === 0) return { n: 0, mean: NaN, sd: NaN };
  const mean = xs.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd };
}

export function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function median(xs: readonly number[]): number {
  return quantile(xs, 0.5);
}

/** Half-width of the 95% Wilson interval around a rate. */
export function wilsonHalfWidth(r: Rate): number {
  if (r.n === 0) return NaN;
  const z = 1.96;
  const p = r.k / r.n;
  const den = 1 + (z * z) / r.n;
  return (z * Math.sqrt((p * (1 - p)) / r.n + (z * z) / (4 * r.n * r.n))) / den;
}

/** Standard normal cumulative distribution (Abramowitz and Stegun 7.1.26, error below 1e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

function twoSided(z: number): number {
  return Number.isFinite(z) ? 2 * (1 - normalCdf(Math.abs(z))) : 1;
}

/** p-value for "the two rates differ" (two-proportion z-test). */
export function rateDiffP(a: Rate, b: Rate): number {
  if (a.n === 0 || b.n === 0) return 1;
  const pooled = (a.k + b.k) / (a.n + b.n);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.n + 1 / b.n));
  return se === 0 ? 1 : twoSided((b.k / b.n - a.k / a.n) / se);
}

/** p-value for "the two means differ" (Welch's test, normal approximation: runs have hundreds of games). */
export function meanDiffP(a: Mean, b: Mean): number {
  if (a.n < 2 || b.n < 2) return 1;
  const se = Math.sqrt((a.sd * a.sd) / a.n + (b.sd * b.sd) / b.n);
  return se === 0 ? (a.mean === b.mean ? 1 : 0) : twoSided((b.mean - a.mean) / se);
}

/**
 * Benjamini–Hochberg q-values: a report tests dozens of numbers at once, so some p-values fall
 * under 0.05 by chance. A q-value under 0.05 keeps the expected share of false alarms below 5%.
 */
export function qValues(ps: readonly number[]): number[] {
  const order = ps.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p);
  const q = new Array<number>(ps.length);
  let running = 1;
  for (let rank = order.length; rank >= 1; rank--) {
    const { p, i } = order[rank - 1];
    running = Math.min(running, (p * order.length) / rank);
    q[i] = running;
  }
  return q;
}
