// The streets of a city on the strategy map, drawn flat in the map's own plane
// (top down, unlike the isometric buildings that stand on them): a lace of lanes,
// densest in the old town and fraying into the countryside, main roads that run on
// out of town towards the neighbouring cities, and the railway. Coordinates are
// the city model's screen units: x to the right, y down, with the city's map
// anchor at the origin.

export type P = [number, number];

const TAU = Math.PI * 2;

/** The built-up area: an irregular ellipse, wider than it is deep. */
export class Envelope {
  constructor(
    readonly cx: number,
    readonly cy: number,
    /** Half-width. */
    readonly a: number,
    /** Depth over width. */
    readonly aspect: number,
    /** Wobble of the outline: [amplitude, phase] of its 2nd, 3rd and 5th harmonics. */
    private readonly wobble: [number, number][],
  ) {}

  private scale(t: number): number {
    const [h2, h3, h5] = this.wobble;
    return 1 + h2[0] * Math.sin(2 * t + h2[1]) + h3[0] * Math.sin(3 * t + h3[1]) + h5[0] * Math.sin(5 * t + h5[1]);
  }

  /** How far out a point lies: below 1 inside, 1 on the outline. */
  rho(x: number, y: number): number {
    const dx = (x - this.cx) / this.a;
    const dy = (y - this.cy) / (this.a * this.aspect);
    return Math.hypot(dx, dy) / this.scale(Math.atan2(dy, dx));
  }

  /** Point at parameter angle t on the outline scaled by s. */
  at(t: number, s = 1): P {
    const k = s * this.scale(t);
    return [this.cx + Math.cos(t) * this.a * k, this.cy + Math.sin(t) * this.a * this.aspect * k];
  }

  /** Distance from the middle to the outline in screen direction `angle`. */
  edge(angle: number): number {
    const dx = Math.cos(angle) / this.a;
    const dy = Math.sin(angle) / (this.a * this.aspect);
    return this.scale(Math.atan2(dy, dx)) / Math.hypot(dx, dy);
  }
}

/** A railway through town: the point of the line nearest the middle and its direction. */
export interface RailLine {
  x: number;
  y: number;
  angle: number;
}

export interface StreetPlan {
  lanes: P[][];
  arterials: P[][];
  rail: P[] | null;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Lanes: a jittered grid, gently warped so that it bends like an old street plan,
 * thinning out from the middle; isolated stubs are dropped.
 */
function lanes(env: Envelope, tier: number, rand: () => number): P[][] {
  const s = 2.3;
  const turn = rand() * (Math.PI / 2);
  const [ca, sa] = [Math.cos(turn), Math.sin(turn)];
  const ph = [rand(), rand(), rand(), rand()].map((v) => v * TAU);
  const warp = (x: number, y: number): P => [
    x + 0.65 * Math.sin(y * 0.2 + ph[0]) + 0.35 * Math.sin((x + y) * 0.13 + ph[1]),
    y + 0.65 * Math.sin(x * 0.18 + ph[2]) + 0.35 * Math.sin((x - y) * 0.15 + ph[3]),
  ];
  const n = Math.ceil((env.a * 1.15) / s);
  const key = (i: number, j: number) => (i + 64) * 256 + (j + 64);
  const nodes = new Map<number, P>();
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++) {
      const gx = (i + (rand() - 0.5) * 0.5) * s;
      const gy = (j + (rand() - 0.5) * 0.5) * s;
      // Small blocks in the old town, bigger ones further out.
      const [x, y] = warp(gx * ca - gy * sa, gx * sa + gy * ca);
      const grow = 0.85 + 0.3 * env.rho(env.cx + x, env.cy + y);
      nodes.set(key(i, j), [env.cx + x * grow, env.cy + y * grow]);
    }
  // Full density in the old town, thinning out to the odd lane past the edge; small towns are sparser.
  const full = 0.3 + tier * 0.06;
  const keep = (rho: number) => 0.95 * (1 - smoothstep(full, 1.12, rho)) + (rho < 1.2 ? 0.06 : 0);
  const edges: [number, number][] = [];
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++) {
      const a = key(i, j);
      const pa = nodes.get(a)!;
      for (const [di, dj, odds] of [[1, 0, 1], [0, 1, 1], [1, 1, 0.04], [1, -1, 0.03]]) {
        const b = key(i + di, j + dj);
        const pb = nodes.get(b);
        if (!pb) continue;
        const rho = env.rho((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2);
        if (rand() < keep(rho) * odds) edges.push([a, b]);
      }
    }
  const degree = new Map<number, number>();
  for (const [a, b] of edges) {
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  }
  return edges.filter(([a, b]) => degree.get(a)! > 1 || degree.get(b)! > 1).map(([a, b]) => [nodes.get(a)!, nodes.get(b)!]);
}

/** A main road from the old town's edge out along `angle`, well past the edge of town, meandering a little. */
function arterial(env: Envelope, angle: number, start: number, rand: () => number): P[] {
  const length = env.edge(angle) * 1.8 + 6;
  const amp = 0.5 + rand() * 0.8;
  const wave = 5 + rand() * 5;
  const ph = rand() * TAU;
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const pts: P[] = [];
  for (let t = env.edge(angle) * start; t <= length; t += 1.1) {
    const off = amp * Math.sin(t / wave + ph) * Math.min(1, t / 5);
    pts.push([env.cx + c * t - s * off, env.cy + s * t + c * off]);
  }
  return pts;
}

/** Side lanes branching off a main road on the outskirts: ribbon development. */
function ribbons(env: Envelope, road: P[], rand: () => number): P[][] {
  const out: P[][] = [];
  for (let i = 2; i < road.length - 1; i += 2) {
    const [x, y] = road[i];
    const rho = env.rho(x, y);
    if (rho < 0.7 || rho > 1.55 || rand() > 0.62 * (1.55 - rho) / 0.85) continue;
    const [nx, ny] = road[i + 1];
    const along = Math.atan2(ny - y, nx - x);
    const side = rand() < 0.5 ? -1 : 1;
    const a = along + side * (Math.PI / 2 + (rand() - 0.5) * 0.6);
    const len = 1.2 + rand() * 2.4 * (1.6 - rho);
    const bend = (rand() - 0.5) * 0.5;
    out.push([
      [x, y],
      [x + Math.cos(a) * len * 0.55, y + Math.sin(a) * len * 0.55],
      [x + Math.cos(a + bend) * len, y + Math.sin(a + bend) * len],
    ]);
  }
  return out;
}

function railway(env: Envelope, rail: RailLine): P[] {
  const [c, s] = [Math.cos(rail.angle), Math.sin(rail.angle)];
  const half = Math.max(env.edge(rail.angle), env.edge(rail.angle + Math.PI)) * 2 + 6;
  const pts: P[] = [];
  for (let t = -half; t <= half; t += 2) pts.push([rail.x + c * t, rail.y + s * t]);
  return pts;
}

/**
 * Streets for a town: `oldTown` is how far the old town reaches, in outlines; the
 * main roads start there, as the lanes of the old town lead to them.
 */
export function streetPlan(env: Envelope, tier: number, oldTown: number, exits: number[], rail: RailLine | null, rand: () => number): StreetPlan {
  const arterials = exits.map((a) => arterial(env, a, oldTown, rand));
  return {
    lanes: [...lanes(env, tier, rand), ...arterials.flatMap((r) => ribbons(env, r, rand))],
    arterials,
    rail: rail ? railway(env, rail) : null,
  };
}

// ------------------------------------------------------------------ drawing

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();

/** How far out (in outlines) the streets fade, and their opacity there: full in town, gone well out in the country. */
const FADE: [number, number][] = [[0, 1], [0.6, 1], [1, 0.72], [1.35, 0.36], [1.95, 0]];

const STREET = '#fbf8ef';
const RAIL = '#3d3834';
const SLEEPER = '#ebe4d2';

export interface GroundLayer {
  markup: string;
  bounds: [number, number, number, number];
}

export function drawStreets(env: Envelope, plan: StreetPlan, tier: number): GroundLayer {
  const bounds: GroundLayer['bounds'] = [Infinity, Infinity, -Infinity, -Infinity];
  const parts: string[] = [];
  // The streets thin out into the countryside without seams: each colour is painted with an
  // elliptical gradient that fades it out (cheaper to draw than a mask over the whole layer).
  const reach = FADE[FADE.length - 1][0];
  const squash = `translate(${f1(env.cx)} ${f1(env.cy)}) scale(1 ${env.aspect}) translate(${f1(-env.cx)} ${f1(-env.cy)})`;
  const fades = new Map<string, string>();
  const fade = (color: string) => {
    if (!fades.has(color)) {
      const stops = FADE.map(([at, o]) => `<stop offset="${(at / reach).toFixed(3)}" stop-color="${color}" stop-opacity="${o}"/>`).join('');
      fades.set(color, `<radialGradient id="f${fades.size}" gradientUnits="userSpaceOnUse" cx="${f1(env.cx)}" cy="${f1(env.cy)}" r="${f1(env.a * reach)}" gradientTransform="${squash}">${stops}</radialGradient>`);
    }
    return `url(#f${[...fades.keys()].indexOf(color)})`;
  };
  const stroke = (polys: P[][], color: string, width: number, opacity: number, extra = '') => {
    if (!polys.length) return;
    for (const poly of polys)
      for (const [x, y] of poly) {
        bounds[0] = Math.min(bounds[0], x - width);
        bounds[1] = Math.min(bounds[1], y - width);
        bounds[2] = Math.max(bounds[2], x + width);
        bounds[3] = Math.max(bounds[3], y + width);
      }
    const d = polys.map((poly) => `M${poly.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}`).join('');
    parts.push(`<path d="${d}" stroke="${fade(color)}" stroke-opacity="${opacity}" stroke-width="${width}"${extra}/>`);
  };
  stroke(plan.lanes, STREET, 0.32, 0.84);
  stroke(plan.arterials, STREET, tier >= 4 ? 0.6 : 0.52, 0.88);
  if (plan.rail) {
    stroke([plan.rail], RAIL, 0.6, 0.9);
    stroke([plan.rail], SLEEPER, 0.24, 0.9, ' stroke-dasharray="0.9 0.9" stroke-linecap="butt"');
  }
  return {
    markup: `<defs>${[...fades.values()].join('')}</defs><g fill="none" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</g>`,
    bounds,
  };
}
