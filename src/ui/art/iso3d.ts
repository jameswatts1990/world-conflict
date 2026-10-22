// A tiny low-poly 3D renderer that draws to SVG markup. Models are built from
// convex solids (prisms, frusta, roofs), lit with one distant light, culled and
// depth-sorted, then projected with a fixed 2:1 isometric camera. No WebGL, no
// dependencies: the output is a vector image that stays crisp at any zoom.
//
// World axes: x to the screen's lower right, y to the lower left, z up.

export type V2 = [number, number];
export type V3 = [number, number, number];

/** Height of one world unit on screen, relative to the ground's 2:1 diamond. */
const LIFT = 0.86;
/** Toward the viewer: a parallel projection collapses points along this line. */
const VIEW: V3 = [LIFT, LIFT, 1];
/** Light from the upper left of the screen, high in the sky. */
const LIGHT: V3 = normalise([-0.42, 0.62, 1.1]);
const AMBIENT = 0.56;
const DIFFUSE = 0.5;

interface Face {
  pts: V3[];
  color: string;
  /** Flat colour, no light (decals, posters, glowing windows). */
  unlit?: boolean;
  /** Drawn from both sides (flags, signs). */
  twoSided?: boolean;
  opacity?: number;
}

interface Line {
  pts: V3[];
  color: string;
  width: number;
}

interface Puff {
  at: V3;
  r: number;
  color: string;
  opacity: number;
}

interface Solid {
  faces: Face[];
  lines: Line[];
  puffs: Puff[];
  /** 0 ground, 1 sorted solids, 2 smoke and effects above everything. */
  layer: 0 | 1 | 2;
  min: V3;
  max: V3;
  seq: number;
}

function normalise(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Newell's method: robust normal of a planar polygon. */
function normalOf(pts: V3[]): V3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return normalise([x, y, z]);
}

function centroid(pts: V3[]): V3 {
  const c: V3 = [0, 0, 0];
  for (const p of pts) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  return [c[0] / pts.length, c[1] / pts.length, c[2] / pts.length];
}

export function project(p: V3): V2 {
  return [p[0] - p[1], (p[0] + p[1]) / 2 - p[2] * LIFT];
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(c: number[]): string {
  return `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Light a colour: below 1 darkens towards a cool shadow, above 1 lightens. */
export function shadeColor(hex: string, m: number): string {
  const [r, g, b] = parseHex(hex);
  if (m >= 1) {
    const t = Math.min(1, m - 1);
    return toHex([r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t]);
  }
  const cool = (1 - m) * 0.1;
  return toHex([r * m, g * m, b * (m + cool)]);
}

/** Mix two colours (t = 0 gives a). */
export function mixColor(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return toHex(ca.map((v, i) => v + (cb[i] - v) * t));
}

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();

function pathOf(pts: V2[]): string {
  return `M${pts.map((p) => `${f1(p[0])} ${f1(p[1])}`).join('L')}Z`;
}

export interface Rendered {
  /** SVG elements (no outer <svg>), in projected units. */
  markup: string;
  /** Projected bounds: [x0, y0, x1, y1]. */
  bounds: [number, number, number, number];
}

/**
 * A scene under construction. Every primitive adds one convex solid; solids are
 * ordered back to front at render time, faces within a convex solid never overlap.
 */
export class Scene {
  private solids: Solid[] = [];

  /**
   * `exact` also orders solids by the planes of their faces, not just by their boxes:
   * slower, but needed for models turned off the grid (units facing their march),
   * whose boxes overlap far more often than those of axis-aligned buildings.
   * `edge` is the width of the darker outline round every face (finer for small models).
   */
  constructor(private readonly opts: { exact?: boolean; edge?: number } = {}) {}

  private add(layer: Solid['layer'], faces: Face[], lines: Line[] = [], puffs: Puff[] = []): void {
    const min: V3 = [Infinity, Infinity, Infinity];
    const max: V3 = [-Infinity, -Infinity, -Infinity];
    const grow = (p: V3, pad = 0) => {
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], p[i] - pad);
        max[i] = Math.max(max[i], p[i] + pad);
      }
    };
    faces.forEach((f) => f.pts.forEach((p) => grow(p)));
    lines.forEach((l) => l.pts.forEach((p) => grow(p)));
    puffs.forEach((p) => grow(p.at, p.r));
    if (min[0] === Infinity) return;
    this.solids.push({ faces, lines, puffs, layer, min, max, seq: this.solids.length });
  }

  /** A closed convex solid from its faces (any winding: normals face away from the middle). */
  solid(faces: Face[]): void {
    const mid = centroid(faces.flatMap((f) => f.pts));
    const oriented = faces.map((f) => {
      const n = normalOf(f.pts);
      const c = centroid(f.pts);
      const out = dot(n, [c[0] - mid[0], c[1] - mid[1], c[2] - mid[2]]) >= 0;
      return out ? f : { ...f, pts: [...f.pts].reverse() };
    });
    this.add(1, oriented);
  }

  /** Vertical extrusion of a convex footprint. `top` null leaves it open (e.g. under a roof). */
  prism(foot: V2[], z0: number, z1: number, color: string, top: string | null = color): void {
    const faces: Face[] = [];
    for (let i = 0; i < foot.length; i++) {
      const [ax, ay] = foot[i];
      const [bx, by] = foot[(i + 1) % foot.length];
      faces.push({ pts: [[ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1]], color });
    }
    if (top) faces.push({ pts: foot.map(([x, y]) => [x, y, z1] as V3), color: top });
    faces.push({ pts: foot.map(([x, y]) => [x, y, z0] as V3), color });
    this.solid(faces);
  }

  box(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, color: string, top: string | null = color): void {
    this.prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1, color, top);
  }

  /** Regular polygon prism or frustum; r1 = 0 gives a cone or a spire. */
  frustum(cx: number, cy: number, z0: number, z1: number, r0: number, r1: number, sides: number, color: string, top: string | null = color, turn = 0): void {
    const ring = (r: number, z: number): V3[] =>
      Array.from({ length: sides }, (_, i) => {
        const a = turn + (i / sides) * Math.PI * 2;
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
      });
    const lo = ring(r0, z0);
    const faces: Face[] = [{ pts: lo, color }];
    if (r1 <= 0.001) {
      const apex: V3 = [cx, cy, z1];
      for (let i = 0; i < sides; i++) faces.push({ pts: [lo[i], lo[(i + 1) % sides], apex], color });
    } else {
      const hi = ring(r1, z1);
      for (let i = 0; i < sides; i++) faces.push({ pts: [lo[i], lo[(i + 1) % sides], hi[(i + 1) % sides], hi[i]], color });
      if (top) faces.push({ pts: hi, color: top });
    }
    this.solid(faces);
  }

  /** Dome of stacked frusta, sitting on z0. */
  dome(cx: number, cy: number, z0: number, r: number, h: number, color: string, sides = 10): void {
    const steps = [
      [0, 1],
      [0.45, 0.88],
      [0.78, 0.6],
      [1, 0],
    ];
    for (let i = 0; i < steps.length - 1; i++) {
      const [ha, ra] = steps[i];
      const [hb, rb] = steps[i + 1];
      this.frustum(cx, cy, z0 + ha * h, z0 + hb * h, ra * r, rb * r, sides, color);
    }
  }

  /** Pitched roof over a rectangle with its ridge along x or y; `ends` colours the gable walls. */
  gable(x0: number, y0: number, x1: number, y1: number, z: number, h: number, color: string, along: 'x' | 'y', ends: string): void {
    if (along === 'x') {
      const ym = (y0 + y1) / 2;
      this.solid([
        { pts: [[x0, y0, z], [x1, y0, z], [x1, ym, z + h], [x0, ym, z + h]], color },
        { pts: [[x0, y1, z], [x1, y1, z], [x1, ym, z + h], [x0, ym, z + h]], color },
        { pts: [[x0, y0, z], [x0, y1, z], [x0, ym, z + h]], color: ends },
        { pts: [[x1, y0, z], [x1, y1, z], [x1, ym, z + h]], color: ends },
        { pts: [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], color },
      ]);
    } else {
      const xm = (x0 + x1) / 2;
      this.solid([
        { pts: [[x0, y0, z], [x0, y1, z], [xm, y1, z + h], [xm, y0, z + h]], color },
        { pts: [[x1, y0, z], [x1, y1, z], [xm, y1, z + h], [xm, y0, z + h]], color },
        { pts: [[x0, y0, z], [x1, y0, z], [xm, y0, z + h]], color: ends },
        { pts: [[x0, y1, z], [x1, y1, z], [xm, y1, z + h]], color: ends },
        { pts: [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], color },
      ]);
    }
  }

  /** Hipped roof: slopes on all four sides up to a short ridge (a pyramid when square). */
  hip(x0: number, y0: number, x1: number, y1: number, z: number, h: number, color: string): void {
    const w = x1 - x0;
    const d = y1 - y0;
    const inset = Math.min(w, d) / 2;
    const r0: V3 = w >= d ? [x0 + inset, (y0 + y1) / 2, z + h] : [(x0 + x1) / 2, y0 + inset, z + h];
    const r1: V3 = w >= d ? [x1 - inset, (y0 + y1) / 2, z + h] : [(x0 + x1) / 2, y1 - inset, z + h];
    const a: V3 = [x0, y0, z];
    const b: V3 = [x1, y0, z];
    const c: V3 = [x1, y1, z];
    const e: V3 = [x0, y1, z];
    const same = Math.abs(w - d) < 1e-6;
    if (w >= d) {
      this.solid([
        { pts: same ? [a, b, r0] : [a, b, r1, r0], color },
        { pts: [b, c, r1], color },
        { pts: same ? [c, e, r0] : [c, e, r0, r1], color },
        { pts: [e, a, r0], color },
        { pts: [a, b, c, e], color },
      ]);
    } else {
      this.solid([
        { pts: [a, b, r0], color },
        { pts: [b, c, r1, r0], color },
        { pts: [c, e, r1], color },
        { pts: [e, a, r0, r1], color },
        { pts: [a, b, c, e], color },
      ]);
    }
  }

  /** A flat polygon on the ground (roads, yards, water), drawn before every solid. */
  decal(foot: V2[], color: string, z = 0, opacity?: number): void {
    this.add(0, [{ pts: foot.map(([x, y]) => [x, y, z] as V3), color, unlit: true, opacity }]);
  }

  /** A thin painted line on the ground (rails, lane markings). */
  groundLine(pts: V2[], color: string, width: number, z = 0): void {
    this.add(0, [], [{ pts: pts.map(([x, y]) => [x, y, z] as V3), color, width }]);
  }

  /** A single panel in space: flags, posters, signs. Lit unless `unlit`. */
  panel(pts: V3[], color: string, opts: { unlit?: boolean; twoSided?: boolean } = {}): void {
    this.add(1, [{ pts, color, unlit: opts.unlit, twoSided: opts.twoSided ?? true }]);
  }

  /** Masts, poles, cables and jibs, sorted like solids. */
  line(pts: V3[], color: string, width: number): void {
    this.add(1, [], [{ pts, color, width }]);
  }

  /** Smoke, steam and fire, drawn over everything. */
  puff(at: V3, r: number, color: string, opacity: number): void {
    this.add(2, [], [], [{ at, r, color, opacity }]);
  }

  render(): Rendered {
    const out: string[] = [];
    let [bx0, by0, bx1, by1] = [Infinity, Infinity, -Infinity, -Infinity];
    const grow = (p: V2, pad = 0) => {
      bx0 = Math.min(bx0, p[0] - pad);
      by0 = Math.min(by0, p[1] - pad);
      bx1 = Math.max(bx1, p[0] + pad);
      by1 = Math.max(by1, p[1] + pad);
    };
    const draw = (s: Solid) => {
      for (const f of s.faces) {
        const n = normalOf(f.pts);
        if (!f.twoSided && f.pts.length > 2 && dot(n, VIEW) <= 1e-6) continue;
        const lit = f.unlit ? 1 : AMBIENT + DIFFUSE * Math.abs(f.twoSided ? dot(n, LIGHT) : Math.max(0, dot(n, LIGHT)));
        const fill = f.unlit ? f.color : shadeColor(f.color, lit);
        const pts = f.pts.map(project);
        pts.forEach((p) => grow(p, 0.4));
        const edge = f.unlit ? fill : shadeColor(fill, 0.8);
        const op = f.opacity !== undefined ? ` fill-opacity="${f.opacity}" stroke-opacity="${f.opacity}"` : '';
        out.push(`<path d="${pathOf(pts)}" fill="${fill}" stroke="${edge}"${op}/>`);
      }
      for (const l of s.lines) {
        const pts = l.pts.map(project);
        pts.forEach((p) => grow(p, l.width));
        out.push(`<path d="M${pts.map((p) => `${f1(p[0])} ${f1(p[1])}`).join('L')}" fill="none" stroke="${l.color}" stroke-width="${l.width}" stroke-linecap="round"/>`);
      }
      for (const p of s.puffs) {
        const [x, y] = project(p.at);
        grow([x, y], p.r);
        out.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(p.r)}" fill="${p.color}" fill-opacity="${p.opacity}" stroke="none"/>`);
      }
    };
    this.solids.filter((s) => s.layer === 0).forEach(draw);
    sortSolids(this.solids.filter((s) => s.layer === 1), !!this.opts.exact).forEach(draw);
    this.solids.filter((s) => s.layer === 2).forEach(draw);
    return {
      markup: `<g stroke-width="${this.opts.edge ?? 0.3}" stroke-linejoin="round">${out.join('')}</g>`,
      bounds: [bx0, by0, bx1, by1],
    };
  }
}

/** Distance towards the viewer of a solid's middle, for ties and cycles. */
function depth(s: Solid): number {
  return dot([(s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2, (s.min[2] + s.max[2]) / 2], VIEW);
}

/** True when a separating plane puts `a` on the far side from the viewer. */
function behind(a: Solid, b: Solid): boolean {
  const e = 1e-6;
  return a.max[0] <= b.min[0] + e || a.max[1] <= b.min[1] + e || a.max[2] <= b.min[2] + e;
}

/**
 * Which of two solids is behind, from a separating plane through one of their faces:
 * -1 when `a` is drawn first, 1 when `b` is, 0 when no face plane separates them.
 * A closed solid separates whatever lies wholly outside one of its faces; a single
 * panel separates whatever lies wholly on either side of it.
 */
function planeOrder(a: Solid, b: Solid): number {
  const side = (holder: Solid, other: Solid): number => {
    const pts = [...other.faces.flatMap((f) => f.pts), ...other.lines.flatMap((l) => l.pts)];
    const open = holder.faces.length === 1;
    for (const f of holder.faces) {
      if (f.pts.length < 3) continue;
      const n = normalOf(f.pts);
      const d = dot(n, f.pts[0]);
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of pts) {
        const s = dot(n, p) - d;
        lo = Math.min(lo, s);
        hi = Math.max(hi, s);
      }
      // The other solid lies on the side `sign` of this face: in front of it when that side faces the viewer.
      const sign = lo >= -1e-6 ? 1 : open && hi <= 1e-6 ? -1 : 0;
      if (sign) return sign * dot(n, VIEW) > 0 ? -1 : 1;
    }
    return 0;
  };
  const ab = side(a, b);
  if (ab) return ab;
  return -side(b, a);
}

function screenBox(s: Solid): [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const x of [s.min[0], s.max[0]])
    for (const y of [s.min[1], s.max[1]])
      for (const z of [s.min[2], s.max[2]]) {
        const [px, py] = project([x, y, z]);
        x0 = Math.min(x0, px);
        y0 = Math.min(y0, py);
        x1 = Math.max(x1, px);
        y1 = Math.max(y1, py);
      }
  return [x0, y0, x1, y1];
}

/**
 * Painter's order for convex solids: wherever two screen footprints overlap,
 * a separating axis decides which is behind; overlapping boxes fall back to the
 * depth of their middles. Ties keep insertion order, so output is deterministic.
 */
function sortSolids(solids: Solid[], exact: boolean): Solid[] {
  const n = solids.length;
  const boxes = solids.map(screenBox);
  const deps = solids.map(depth);
  const after: number[][] = solids.map(() => []);
  const indeg = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a[2] <= b[0] + 0.01 || b[2] <= a[0] + 0.01 || a[3] <= b[1] + 0.01 || b[3] <= a[1] + 0.01) continue;
      const ij = behind(solids[i], solids[j]);
      const ji = behind(solids[j], solids[i]);
      let first: number;
      if (ij && !ji) first = i;
      else if (ji && !ij) first = j;
      else {
        const p = exact ? planeOrder(solids[i], solids[j]) : 0;
        first = p < 0 ? i : p > 0 ? j : deps[i] <= deps[j] ? i : j;
      }
      const second = first === i ? j : i;
      after[first].push(second);
      indeg[second]++;
    }
  }
  // Kahn's algorithm, always emitting the farthest ready solid (a binary heap keeps it n log n).
  const less = (i: number, j: number) => deps[i] < deps[j] - 1e-9 || (Math.abs(deps[i] - deps[j]) <= 1e-9 && i < j);
  const heap: number[] = [];
  const push = (i: number) => {
    heap.push(i);
    for (let c = heap.length - 1; c > 0; ) {
      const p = (c - 1) >> 1;
      if (!less(heap[c], heap[p])) break;
      [heap[c], heap[p]] = [heap[p], heap[c]];
      c = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let p = 0; ; ) {
        const l = 2 * p + 1;
        const r = l + 1;
        let m = p;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === p) break;
        [heap[m], heap[p]] = [heap[p], heap[m]];
        p = m;
      }
    }
    return top;
  };
  for (let i = 0; i < n; i++) if (indeg[i] === 0) push(i);
  const order: Solid[] = [];
  const done = new Array<boolean>(n).fill(false);
  while (order.length < n) {
    let pick = -1;
    while (heap.length && pick < 0) {
      const i = pop();
      if (!done[i]) pick = i;
    }
    if (pick < 0) {
      // A cycle (only possible between intersecting boxes): break it at the farthest solid.
      for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || less(i, pick))) pick = i;
    }
    done[pick] = true;
    order.push(solids[pick]);
    for (const m of after[pick]) if (--indeg[m] === 0 && !done[m]) push(m);
  }
  return order;
}
