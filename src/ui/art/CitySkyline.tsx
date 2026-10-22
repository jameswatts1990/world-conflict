// Procedural side-view city skyline for the province view. Pure inline SVG, deterministic per seed:
// the same province always draws the same town, and each building owns a fixed spot so adding one
// never reshuffles the others. The generic housing mass grows in count and height with the city tier.
import { createElement, useId, useMemo } from 'react';
import type { JSX, ReactNode, SVGProps } from 'react';

export type ArtBuilding = 'industry' | 'market' | 'powerPlant' | 'refinery' | 'housing' | 'university' | 'barracks'
  | 'academy' | 'armsWorks' | 'motorPool' | 'tankWorks' | 'hospital' | 'propaganda' | 'garrisonHq'
  | 'fortifications' | 'supplyDepot' | 'railway' | 'coastalBattery';
export type ArtTerrain = 'plains' | 'forest' | 'hills' | 'mountains' | 'urban' | 'marsh';

export interface CitySkylineProps {
  /** Province id, e.g. 'uk-north'; drives deterministic variety. */
  seed: string;
  /** Town, City, Large City, Metropolis, World City. */
  tier: 1 | 2 | 3 | 4 | 5;
  /** National capital: adds a landmark (dome, cathedral or parliament tower). */
  capital?: boolean;
  /** Building -> level (0 or absent = not built). */
  buildings: Partial<Record<ArtBuilding, number>>;
  /** Building under construction: scaffolding and a crane at its spot. */
  construction?: ArtBuilding | null;
  terrain: ArtTerrain;
  /** Draws a strip of sea and a quay on one side. */
  coastal?: boolean;
  /** Owner's colour (hex) for flags, posters and roof accents; neutral if absent. */
  nationColor?: string;
  /** Smoke columns and fires over the city. */
  battle?: boolean;
  /** Rendered width in px (default 320); the viewBox is always 0 0 320 120. */
  width?: number;
}

// ------------------------------------------------------------------ constants

const VW = 320;
const VH = 120;
/** Terrain is authored against a horizon at 94 and shifted down by this much. */
const TERRAIN_DY = 3;
const HORIZON = 94 + TERRAIN_DY;
const BASE_BACK = 101;
const BASE_GENERIC = 102;
const BASE_FRONT = 104.5;
const RAIL_Y = 111.5;
/** Nearer rows are drawn larger: a little perspective that also keeps small buildings readable. */
const SCALE_BACK = 1.1;
const SCALE_FRONT = 1.25;
const SCALE_FG = 1.2;

const K = {
  ink: '#29232a',
  ink2: '#362e35',
  ink3: '#4a4046',
  steel: '#5a5056',
  rim: '#c99063',
  stone: '#857266',
  stoneDark: '#5b4d4b',
  white: '#ae9f90',
  whiteShade: '#8c7f74',
  verdigris: '#5b7569',
  win: '#f5c86e',
  win2: '#e59d55',
  glow: '#ff9a48',
  fire: '#ff7a2c',
  fireCore: '#ffd56e',
  smoke: '#8f8488',
  steam: '#cdbfb5',
  ground: '#1f1a1e',
  road: '#29232a',
  house: '#43383f',
  houseRoof: '#4f4047',
  houseBack: '#56474e',
  houseBackRoof: '#5f4f56',
  haze: '#6d5862',
  brick: '#694740',
  brick2: '#5c3f39',
  brickBand: '#80625a',
  landmark: '#2c262d',
  tree: '#2f2d2a',
  wood: '#7c6046',
  woodDark: '#4a392c',
  rust: '#6d3d31',
  olive: '#4e4c33',
  red: '#b8352b',
  rail: '#86766c',
  concrete: '#3a3337',
  crane: '#bb9150',
  scaffold: '#a8885e',
  neutralFlag: '#cfc0a0',
};

// ------------------------------------------------------------------ seeded randomness

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An independent random stream per (seed, key), so one feature never disturbs another. */
const rngOf = (seed: string, key: string): (() => number) => mulberry32(hash32(`${seed}#${key}`));

function shuffle<T>(arr: T[], r: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ------------------------------------------------------------------ small helpers

const n = (v: number): number => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const smooth = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return b;
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const G = (...kids: ReactNode[]): ReactNode => createElement('g', null, ...kids);
const GA = (attrs: SVGProps<SVGGElement>, ...kids: ReactNode[]): ReactNode => createElement('g', attrs, ...kids);

function rect(x: number, y: number, w: number, h: number, fill: string, extra?: SVGProps<SVGRectElement>): ReactNode {
  return <rect x={n(x)} y={n(y)} width={n(Math.max(0, w))} height={n(Math.max(0, h))} fill={fill} {...extra} />;
}

function path(d: string, fill: string, extra?: SVGProps<SVGPathElement>): ReactNode {
  return <path d={d} fill={fill} {...extra} />;
}

function stroke(d: string, color: string, w: number, extra?: SVGProps<SVGPathElement>): ReactNode {
  return <path d={d} fill="none" stroke={color} strokeWidth={w} {...extra} />;
}

function circ(cx: number, cy: number, r: number, fill: string, extra?: SVGProps<SVGCircleElement>): ReactNode {
  return <circle cx={n(cx)} cy={n(cy)} r={n(r)} fill={fill} {...extra} />;
}

/** Collects window panes for one structure and emits them as a couple of compact paths. */
class Glass {
  private lit: string[] = [];
  private warm: string[] = [];
  private dark: string[] = [];
  private r: () => number;
  private p: number;
  private darkFill: string | null;

  constructor(r: () => number, p: number, darkFill: string | null = null) {
    this.r = r;
    this.p = p;
    this.darkFill = darkFill;
  }

  pane(x: number, y: number, w: number, h: number, p = this.p): void {
    const v = this.r();
    const d = `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`;
    if (v < p * 0.72) this.lit.push(d);
    else if (v < p) this.warm.push(d);
    else if (this.darkFill) this.dark.push(d);
  }

  grid(x: number, y: number, cols: number, rows: number, dx: number, dy: number, w = 1.2, h = 1.6, p = this.p): void {
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) this.pane(x + i * dx, y + j * dy, w, h, p);
  }

  /** As many panes as fit in a box, centred, with a margin. */
  box(x: number, y: number, w: number, h: number, dx: number, dy: number, pw = 1.2, ph = 1.6, p = this.p, m = 0.9): void {
    const cols = Math.floor((w - 2 * m - pw) / dx) + 1;
    const rows = Math.floor((h - 2 * m - ph) / dy) + 1;
    if (cols < 1 || rows < 1) return;
    const sx = x + (w - ((cols - 1) * dx + pw)) / 2;
    this.grid(sx, y + m, cols, rows, dx, dy, pw, ph, p);
  }

  flush(): ReactNode {
    const out = G(
      this.dark.length ? path(this.dark.join(''), this.darkFill ?? K.ink) : null,
      this.warm.length ? path(this.warm.join(''), K.win2, { opacity: 0.8 }) : null,
      this.lit.length ? path(this.lit.join(''), K.win) : null,
    );
    this.lit = [];
    this.warm = [];
    this.dark = [];
    return out;
  }
}

/** A drifting puff column (chimney smoke, steam). */
function plume(x: number, y: number, wind: number, size: number, color: string, opacity: number, steps = 7): ReactNode {
  const r = mulberry32(Math.round(x * 97 + y * 13));
  const kids: ReactNode[] = [];
  const count = steps * 2;
  for (let i = 0; i < count; i++) {
    const s = i / 2;
    const t = i / (count - 1);
    const px = x + wind * (s * 1.9 + s * s * 0.75) * size + (r() - 0.5) * 1.6 * size;
    const py = y - s * 3.1 * size - t * t * 2 * size + (r() - 0.5) * size;
    const rad = (1 + s * 0.95) * size * (0.85 + r() * 0.3);
    kids.push(circ(px, py, rad, color, { opacity: n(opacity * 0.62 * (1 - t * 0.9)) }));
  }
  return createElement('g', null, ...kids);
}

/** A searchlight beam fading with distance; `fade` is a horizontal gradient id. */
function beam(x: number, y: number, angleDeg: number, len: number, spreadDeg: number, fade: string): ReactNode {
  const hw = len * Math.tan(((spreadDeg / 2) * Math.PI) / 180);
  return GA({ transform: `translate(${n(x)} ${n(y)}) rotate(${n(angleDeg)})` },
    path(`M0 -0.4L${n(len)} ${n(-hw)}V${n(hw)}L0 0.4z`, `url(#${fade})`));
}

function flagOn(x: number, poleBase: number, poleH: number, color: string, wind: number, s = 1): ReactNode {
  const top = poleBase - poleH;
  const dir = wind >= 0 ? 1 : -1;
  const fw = 6 * s * dir;
  const fh = 3.6 * s;
  const d = `M${n(x)} ${n(top)}q${n(fw * 0.5)} ${n(-1.1 * s)} ${n(fw)} ${n(0.5 * s)}v${n(fh)}`
    + `q${n(-fw * 0.5)} ${n(-1.1 * s)} ${n(-fw)} ${n(-0.5 * s)}z`;
  return G(stroke(`M${n(x)} ${n(poleBase)}V${n(top - 0.6)}`, K.steel, 0.55), path(d, color));
}

function gable(x0: number, x1: number, eave: number, ridge: number, fill: string, hip = 0): ReactNode {
  const w = x1 - x0;
  return path(`M${n(x0)} ${n(eave)}L${n(x0 + w * hip + (hip ? 0 : w / 2))} ${n(ridge)}`
    + `${hip ? `H${n(x1 - w * hip)}` : ''}L${n(x1)} ${n(eave)}z`, fill);
}

function rimLine(x0: number, x1: number, y: number, opacity = 0.45): ReactNode {
  return rect(x0, y, x1 - x0, 0.45, K.rim, { opacity });
}

// ------------------------------------------------------------------ special buildings

interface Draw {
  cx: number;
  b: number;
  lv: number;
  r: () => number;
  g: Glass;
  flag: string;
  accent: string;
  wind: number;
  glow: string;
  fade: string;
}

type Painter = (d: Draw) => ReactNode;

function chimney(x: number, b: number, h: number, w: number, fill: string): ReactNode {
  return G(
    path(`M${n(x - w / 2)} ${n(b)}L${n(x - w * 0.36)} ${n(b - h)}h${n(w * 0.72)}L${n(x + w / 2)} ${n(b)}z`, fill),
    rect(x - w * 0.4, b - h + 1.3, w * 0.8, 0.7, K.rim, { opacity: 0.5 }),
  );
}

const paintIndustry: Painter = ({ cx, b, lv, r, g, wind }) => {
  const k: ReactNode[] = [];
  const x0 = cx - 20;
  const x1 = cx + 20;
  const top = b - 12;
  const stacks = [
    { x: x0 + 7, h: 40 + r() * 4 },
    { x: x0 + 31, h: 33 + r() * 4 },
    { x: x0 + 19, h: 45 + r() * 3 },
  ].slice(0, Math.min(3, lv));
  for (const s of stacks) k.push(chimney(s.x, b - 6, s.h - 6, 4.4, K.ink2));
  for (const s of stacks) k.push(plume(s.x, b - s.h - 2.5, wind, 1, K.smoke, 0.55));
  if (lv >= 3) {
    k.push(rect(x1 - 1, b - 8, 11, 8, K.ink2), gable(x1 - 1.4, x1 + 10.4, b - 8, b - 11, K.ink2));
    g.grid(x1 + 1.6, b - 6.2, 3, 1, 3, 0, 1.4, 2.4);
    k.push(g.flush());
  }
  const teeth = 5;
  const tw = (x1 - x0) / teeth;
  let p = `M${x0} ${b}V${top}`;
  let rp = '';
  for (let i = 0; i < teeth; i++) {
    p += `L${n(x0 + i * tw)} ${top - 6}L${n(x0 + (i + 1) * tw)} ${top}`;
    rp += `M${n(x0 + i * tw)} ${top - 6}L${n(x0 + (i + 1) * tw)} ${top}`;
  }
  k.push(path(`${p}V${b}z`, K.ink));
  k.push(stroke(rp, K.rim, 0.5, { opacity: 0.5 }));
  for (let i = 0; i < teeth; i++) g.pane(x0 + i * tw + 0.4, top - 5.3, 1.1, 4.9, 0.8);
  g.grid(x0 + 2.4, b - 9.6, 9, 1, 4, 0, 1.7, 4.4, 0.6);
  k.push(g.flush());
  return G(...k);
};

const paintMarket: Painter = ({ cx, b, lv, g, flag, wind }) => {
  const k: ReactNode[] = [];
  const x0 = cx - 12;
  const x1 = cx + 12;
  if (lv >= 2) {
    for (const wx of [x0 - 8, x1]) {
      k.push(rect(wx, b - 12, 8, 12, K.stoneDark), rect(wx - 0.3, b - 12.8, 8.6, 0.9, K.stone));
      g.grid(wx + 1.5, b - 10, 2, 2, 3.6, 4.6, 1.3, 2.6, 0.6);
    }
    if (lv >= 3) k.push(flagOn(x0 - 4, b - 12.8, 8, flag, wind, 0.75), flagOn(x1 + 4, b - 12.8, 8, flag, wind, 0.75));
    k.push(g.flush());
  }
  k.push(rect(x0 - 2.2, b - 1.4, x1 - x0 + 4.4, 1.4, K.stoneDark));
  k.push(rect(x0 - 1.1, b - 2.7, x1 - x0 + 2.2, 1.4, K.stone));
  k.push(rect(x0, b - 14, x1 - x0, 11.4, K.ink));
  for (let i = 0; i < 5; i++) g.pane(x0 + 2.55 + i * 4.6, b - 10.8, 1.9, 8, 0.85);
  k.push(g.flush());
  for (let i = 0; i < 6; i++) k.push(rect(x0 + 0.3 + i * 4.6, b - 14, 1.7, 11.4, K.stone));
  k.push(rect(x0 - 1, b - 16.6, x1 - x0 + 2, 2.6, K.stone));
  k.push(path(`M${x0 - 1.8} ${b - 16.6}L${cx} ${b - 22.4}L${x1 + 1.8} ${b - 16.6}z`, K.stone));
  k.push(path(`M${x0 + 2.4} ${b - 17.3}L${cx} ${b - 21}L${x1 - 2.4} ${b - 17.3}z`, K.stoneDark));
  k.push(stroke(`M${x0 - 1.8} ${b - 16.6}L${cx} ${b - 22.4}L${x1 + 1.8} ${b - 16.6}`, K.rim, 0.5, { opacity: 0.6 }));
  if (lv >= 3) k.push(rect(cx - 1, b - 25, 2, 2.8, K.stoneDark), circ(cx, b - 25.6, 1, K.stoneDark));
  return G(...k);
};

const paintPowerPlant: Painter = ({ cx, b, lv, g, wind }) => {
  const k: ReactNode[] = [];
  if (lv >= 2) {
    const tx = cx - 25;
    k.push(path(`M${tx - 7} ${b}C${tx - 4} ${b - 10} ${tx - 5} ${b - 19} ${tx - 5.2} ${b - 25}H${tx + 5.2}`
      + `C${tx + 5} ${b - 19} ${tx + 4} ${b - 10} ${tx + 7} ${b}z`, K.ink2));
    k.push(rimLine(tx - 5.2, tx + 5.2, b - 25, 0.5));
    k.push(plume(tx, b - 28, wind, 1.5, K.steam, 0.35, 6));
  }
  const stacks = lv >= 3 ? [cx - 10, cx - 3, cx + 4] : [cx - 9, cx - 2];
  for (const sx of stacks) k.push(chimney(sx, b - 20, 32, 4.4, K.ink2));
  for (const sx of stacks) k.push(plume(sx, b - 54, wind, 1.1, K.smoke, 0.45));
  k.push(rect(cx - 15, b - 26, 22, 26, K.ink));
  k.push(rect(cx - 12, b - 29, 16, 3.2, K.ink2), rimLine(cx - 12, cx + 4, b - 29));
  k.push(rimLine(cx - 15, cx + 7, b - 26));
  g.grid(cx - 13.2, b - 23, 4, 1, 5, 0, 2.2, 14, 0.9);
  k.push(path(`M${cx + 7} ${b}V${b - 15}L${cx + 13} ${b - 17.5}L${cx + 19} ${b - 15}V${b}z`, K.ink2));
  g.grid(cx + 8.6, b - 12.5, 3, 1, 3.6, 0, 1.6, 6, 0.75);
  k.push(g.flush());
  // pylons and lines
  const pylon = (px: number, s: number): ReactNode => {
    const h = 26 * s;
    const top = b - h;
    const d = `M${n(px - 3.2 * s)} ${b}L${n(px - 0.8 * s)} ${n(top)}L${n(px + 0.8 * s)} ${n(top)}L${n(px + 3.2 * s)} ${b}`
      + `M${n(px - 4.8 * s)} ${n(top + 4 * s)}H${n(px + 4.8 * s)}M${n(px - 5.8 * s)} ${n(top + 9 * s)}H${n(px + 5.8 * s)}`
      + `M${n(px - 2.9 * s)} ${n(b - 3 * s)}L${n(px + 1.6 * s)} ${n(top + 12 * s)}M${n(px + 2.9 * s)} ${n(b - 3 * s)}L${n(px - 1.6 * s)} ${n(top + 12 * s)}`
      + `M${n(px - 1.6 * s)} ${n(top + 12 * s)}L${n(px + 1.1 * s)} ${n(top + 4 * s)}M${n(px + 1.6 * s)} ${n(top + 12 * s)}L${n(px - 1.1 * s)} ${n(top + 4 * s)}`;
    return stroke(d, K.ink, 0.75);
  };
  const p1 = cx + 26;
  k.push(pylon(p1, 1));
  let wires = `M${cx + 19} ${b - 13}Q${n((cx + 19 + p1 - 4.8) / 2)} ${b - 15} ${n(p1 - 4.8)} ${b - 22}`;
  if (lv >= 2) {
    const p2 = p1 + 17;
    k.push(pylon(p2, 0.78));
    for (const [a, c] of [[4.8, 3.74], [5.8, 4.52]] as const) {
      const y1 = a === 4.8 ? b - 22 : b - 17;
      const y2 = a === 4.8 ? b - 26 * 0.78 + 4 * 0.78 : b - 26 * 0.78 + 9 * 0.78;
      wires += `M${n(p1 + a)} ${n(y1)}Q${n((p1 + p2) / 2)} ${n(Math.max(y1, y2) + 3)} ${n(p2 + c)} ${n(y2)}`;
    }
  } else {
    wires += `M${n(p1 + 4.8)} ${b - 22}Q${n(p1 + 10)} ${b - 19} ${n(p1 + 14)} ${b - 17}`;
  }
  k.push(stroke(wires, K.ink3, 0.35));
  return G(...k);
};

const paintRefinery: Painter = ({ cx, b, lv, g, glow, wind }) => {
  const k: ReactNode[] = [];
  const cols = [
    { x: cx - 11, w: 3.6, h: 31 },
    { x: cx - 4.5, w: 4.6, h: 24 },
    { x: cx - 17.5, w: 3, h: 35 },
  ].slice(0, lv >= 3 ? 3 : 2);
  // pipes behind everything
  k.push(stroke(`M${cx - 20} ${b - 6}H${cx + 22}M${cx - 14} ${b - 11}H${cx + 10}M${cx + 2} ${b - 11}V${b}`, K.steel, 0.8));
  for (const c of cols) {
    const plat = Array.from({ length: Math.floor((c.h - 4) / 6) }, (_, i) => `M${n(c.x - c.w / 2 - 1.3)} ${n(b - 5 - i * 6)}h${n(c.w + 2.6)}`).join('');
    k.push(rect(c.x - c.w / 2, b - c.h, c.w, c.h, K.ink), circ(c.x, b - c.h, c.w / 2, K.ink));
    k.push(stroke(plat, K.ink3, 0.55), stroke(`M${n(c.x + c.w / 2 + 0.7)} ${b}V${n(b - c.h + 2)}`, K.ink3, 0.35));
    k.push(rect(c.x + c.w / 2 - 0.6, b - c.h + 1, 0.5, c.h - 1, K.rim, { opacity: 0.35 }));
    g.pane(c.x - 0.4, b - c.h + 5, 0.8, 0.8, 0.9);
  }
  // flare stack
  const fx = cx + 1;
  const lean = wind * 1.4;
  k.push(circ(fx + lean * 0.6, b - 33, 7, `url(#${glow})`, { opacity: 0.85 }));
  k.push(rect(fx - 0.6, b - 29, 1.2, 29, K.ink2));
  k.push(path(`M${fx - 1.4} ${b - 29}C${fx - 1.8} ${b - 31.5} ${n(fx + lean - 0.6)} ${b - 33} ${n(fx + lean)} ${b - 36}`
    + `C${n(fx + lean + 0.4)} ${b - 33} ${fx + 2} ${b - 31.5} ${fx + 1.4} ${b - 29}z`, K.fire));
  k.push(path(`M${fx - 0.6} ${b - 29}C${fx - 0.8} ${b - 30.6} ${n(fx + lean * 0.5)} ${b - 31.5} ${n(fx + lean * 0.5)} ${b - 33}`
    + `C${n(fx + lean * 0.5 + 0.4)} ${b - 31.5} ${fx + 0.8} ${b - 30.6} ${fx + 0.6} ${b - 29}z`, K.fireCore));
  // storage tanks
  const tanks = [
    { x: cx + 8, w: 11, h: 7 },
    { x: cx + 18.5, w: 8.5, h: 5.6 },
    { x: cx - 21, w: 8, h: 5 },
  ].slice(0, lv >= 2 ? 3 : 2);
  for (const t of tanks) {
    const x0 = t.x - t.w / 2;
    k.push(path(`M${n(x0)} ${b}V${n(b - t.h)}Q${n(t.x)} ${n(b - t.h - 2.4)} ${n(x0 + t.w)} ${n(b - t.h)}V${b}z`, K.steel));
    k.push(rect(x0, b - t.h * 0.55, t.w, 0.7, K.ink3));
    k.push(stroke(`M${n(x0)} ${n(b - t.h)}Q${n(t.x)} ${n(b - t.h - 2.4)} ${n(x0 + t.w)} ${n(b - t.h)}`, K.rim, 0.5, { opacity: 0.55 }));
  }
  k.push(g.flush());
  return G(...k);
};

const paintHousing: Painter = ({ cx, b, lv, r, g }) => {
  const k: ReactNode[] = [];
  const blocks = [
    { x: cx - 15, w: 13, h: 22 },
    { x: cx + 0, w: 12, h: 17 },
    { x: cx + 14, w: 11, h: 25 },
    { x: cx - 26, w: 10, h: 14 },
    { x: cx + 26, w: 9, h: 15 },
  ].map((bl) => ({ ...bl, h: bl.h + (r() - 0.5) * 3 }));
  const count = clamp(lv + 1, 2, blocks.length);
  blocks.slice(0, count).forEach((bl, i) => {
    const top = b - bl.h;
    const floors = Math.floor((bl.h - 4) / 3.2);
    let bands = '';
    for (let f = 1; f <= floors; f++) bands += `M${n(bl.x)} ${n(b - 1.2 - f * 3.2)}h${n(bl.w)}v0.55h${n(-bl.w)}z`;
    k.push(rect(bl.x, top, bl.w, bl.h, i % 2 ? K.brick2 : K.brick), path(bands, K.brickBand, { opacity: 0.75 }));
    k.push(rect(bl.x - 0.4, top - 0.9, bl.w + 0.8, 1, '#7d665c'), rimLine(bl.x - 0.4, bl.x + bl.w + 0.4, top - 0.9, 0.7));
    k.push(rect(bl.x + bl.w * 0.3, top - 2.2, 2.2, 1.3, K.brick2));
    for (let f = 1; f <= floors; f++) {
      const y = b - 3.3 - f * 3.2;
      const cols = Math.floor((bl.w - 1.6) / 2.4);
      const sx = bl.x + (bl.w - (cols - 1) * 2.4 - 1.2) / 2;
      g.grid(sx, y, cols, 1, 2.4, 0, 1.2, 1.7, 0.66);
    }
    k.push(rect(bl.x + bl.w / 2 - 0.9, b - 2.4, 1.8, 2.4, K.win2, { opacity: 0.6 }));
    k.push(g.flush());
  });
  return G(...k);
};

const paintUniversity: Painter = ({ cx, b, lv, r, g, accent }) => {
  const k: ReactNode[] = [];
  const domed = r() < 0.5;
  if (lv >= 2) {
    for (const [x0, x1] of [[cx - 26, cx - 16], [cx + 16, cx + 26]]) {
      k.push(rect(x0, b - 10, x1 - x0, 10, K.ink2), gable(x0 - 0.4, x1 + 0.4, b - 10, b - 12.6, K.ink2, 0.2));
      g.grid(x0 + 1.6, b - 8, 3, 1, 2.6, 0, 1.2, 3);
    }
    k.push(g.flush());
  }
  for (const [x0, x1] of [[cx - 17, cx - 4], [cx + 4, cx + 17]]) {
    k.push(rect(x0, b - 14, x1 - x0, 14, K.ink), gable(x0 - 0.5, x1 + 0.5, b - 14, b - 17.5, accent, 0.18));
    k.push(path(`M${n((x0 + x1) / 2 - 2)} ${b - 14}l2 -4.6l2 4.6z`, K.ink));
    g.grid(x0 + 1.5, b - 11.6, 4, 2, 2.8, 5, 1.2, 3);
  }
  if (lv >= 3) {
    const ox = cx + 12;
    k.push(rect(ox - 2.6, b - 19.6, 5.2, 2.2, K.ink), path(`M${ox - 3} ${b - 19.4}A3 3 0 0 1 ${ox + 3} ${b - 19.4}z`, K.verdigris));
  }
  if (domed) {
    k.push(rect(cx - 4.6, b - 27, 9.2, 8, K.ink2));
    k.push(path(`M${cx - 5.2} ${b - 27}C${cx - 5.2} ${b - 34} ${cx + 5.2} ${b - 34} ${cx + 5.2} ${b - 27}z`, K.verdigris));
    k.push(stroke(`M${cx - 5.2} ${b - 27}C${cx - 5.2} ${b - 34} ${cx + 5.2} ${b - 34} ${cx + 5.2} ${b - 27}`, K.rim, 0.5, { opacity: 0.6 }));
    k.push(rect(cx - 0.8, b - 34.6, 1.6, 2.4, K.ink2), stroke(`M${cx} ${b - 34.6}v-2.6`, K.ink2, 0.5));
    g.grid(cx - 3.4, b - 25.4, 4, 1, 2.1, 0, 0.9, 3.4, 0.8);
    k.push(rect(cx - 6.4, b - 19, 12.8, 19, K.ink));
    k.push(path(`M${cx - 7} ${b - 19}L${cx} ${b - 23}L${cx + 7} ${b - 19}z`, K.ink2));
    k.push(circ(cx, b - 15.2, 2, '#e9d6a6'), stroke(`M${cx} ${b - 15.2}v-1.5M${cx} ${b - 15.2}h1.1`, K.ink, 0.45));
    g.grid(cx - 4.4, b - 11, 3, 2, 3.4, 4.4, 1.4, 2.6, 0.7);
  } else {
    k.push(rect(cx - 4, b - 31, 8, 31, K.ink));
    k.push(path(`M${cx - 3.2} ${b - 31}L${cx} ${b - 38}L${cx + 3.2} ${b - 31}z`, accent));
    for (const px of [cx - 4, cx + 4]) k.push(path(`M${n(px - 0.8)} ${b - 31}l0.8 -3.6l0.8 3.6z`, K.ink));
    k.push(rimLine(cx - 4, cx + 4, b - 31));
    k.push(circ(cx, b - 25, 2.5, '#e9d6a6'), stroke(`M${cx} ${b - 25}v-1.9M${cx} ${b - 25}h1.3`, K.ink, 0.5));
    g.grid(cx - 1.9, b - 19, 2, 3, 2.6, 4.6, 1.2, 2.8, 0.75);
  }
  k.push(g.flush());
  return G(...k);
};

const paintBarracks: Painter = ({ cx, b, lv, g, flag, accent, wind }) => {
  const k: ReactNode[] = [];
  if (lv >= 2) {
    k.push(rect(cx - 21, b - 14.5, 24, 14.5, K.ink2), gable(cx - 21.6, cx + 3.6, b - 14.5, b - 16.6, K.ink2, 0.12));
    g.grid(cx - 19.4, b - 13.2, 7, 1, 3.1, 0, 1.2, 1.6, 0.6);
    k.push(g.flush());
  }
  if (lv >= 3) {
    k.push(rect(cx - 26.5, b - 7, 1.6, 7, K.ink), rect(cx - 21.5, b - 7, 1.6, 7, K.ink));
    k.push(stroke(`M${cx - 26.5} ${b - 7}Q${cx - 23.2} ${b - 9.5} ${cx - 19.9} ${b - 7}`, K.ink, 1));
  }
  k.push(rect(cx - 18, b - 9, 26, 9, K.ink));
  k.push(gable(cx - 19, cx + 9, b - 9, b - 11.8, accent, 0.12));
  k.push(rimLine(cx - 16, cx + 6, b - 11.8));
  g.grid(cx - 16.4, b - 7.2, 8, 1, 3.1, 0, 1.2, 1.9, 0.65);
  k.push(rect(cx - 6, b - 3.6, 2, 3.6, '#171316'));
  // parade ground with a drilled squad
  k.push(rect(cx + 9, b - 0.7, 15, 0.9, '#4b413d'));
  let squad = '';
  for (let i = 0; i < 6; i++) squad += `M${n(cx + 11 + i * 1.7)} ${b - 0.4}v-2.4h0.8v2.4z`;
  squad += `M${cx + 22.2} ${b - 0.4}v-2.6h0.8v2.6z`;
  k.push(path(squad, K.ink));
  for (let i = 0; i < 6; i++) k.push(circ(cx + 11.4 + i * 1.7, b - 3.3, 0.5, K.ink));
  k.push(circ(cx + 22.6, b - 3.5, 0.5, K.ink));
  k.push(flagOn(cx + 25.5, b, 22, flag, wind, 1));
  k.push(g.flush());
  return G(...k);
};

const paintAcademy: Painter = ({ cx, b, lv, g, flag, accent, wind }) => {
  const k: ReactNode[] = [];
  const merlons = (x0: number, x1: number, y: number, fill: string): ReactNode => {
    let d = '';
    for (let x = x0; x <= x1 - 1.3; x += 2.4) d += `M${n(x)} ${n(y)}h1.3v-1.5h-1.3z`;
    return path(d, fill);
  };
  if (lv >= 2) {
    k.push(rect(cx - 23, b - 10, 46, 10, K.ink2), merlons(cx - 23, cx + 23, b - 10, K.ink2));
    for (const tx of [cx - 23, cx + 19]) k.push(rect(tx, b - 15, 4, 15, K.ink2), merlons(tx, tx + 4, b - 15, K.ink2));
    g.grid(cx - 21, b - 7, 2, 1, 3, 0, 0.9, 2);
    g.grid(cx + 16, b - 7, 2, 1, 3, 0, 0.9, 2);
    k.push(g.flush());
  }
  k.push(rect(cx - 8, b - 19, 16, 19, K.ink), merlons(cx - 8, cx + 8, b - 19, K.ink), rimLine(cx - 8, cx + 8, b - 19));
  for (const tx of [cx - 14, cx + 8]) {
    k.push(rect(tx, b - 25, 6, 25, K.ink));
    k.push(path(`M${tx - 0.8} ${b - 25}L${tx + 3} ${b - 32.5}L${tx + 6.8} ${b - 25}z`, accent));
    k.push(stroke(`M${tx - 0.8} ${b - 25}L${tx + 3} ${b - 32.5}`, K.rim, 0.45, { opacity: 0.6 }));
    g.grid(tx + 2.5, b - 21.5, 1, 3, 0, 5, 1, 2.4, 0.7);
  }
  if (lv >= 3) {
    k.push(rect(cx - 3, b - 30, 6, 11, K.ink), merlons(cx - 3, cx + 3.2, b - 30, K.ink));
    g.pane(cx - 0.5, b - 27, 1, 2.6, 0.9);
    k.push(flagOn(cx, b - 31.5, 7, flag, wind, 1));
  } else {
    k.push(flagOn(cx, b - 20.5, 8, flag, wind, 1));
  }
  g.grid(cx - 5.5, b - 16, 4, 2, 3.5, 5, 0.9, 2.4, 0.6);
  k.push(path(`M${cx - 2.4} ${b}V${b - 4.6}A2.4 2.4 0 0 1 ${cx + 2.4} ${b - 4.6}V${b}z`, K.win2, { opacity: 0.75 }));
  k.push(g.flush());
  return G(...k);
};

const paintArmsWorks: Painter = ({ cx, b, lv, g, glow, wind }) => {
  const k: ReactNode[] = [];
  if (lv >= 2) {
    k.push(chimney(cx - 15, b - 10, 26, 4, K.ink2));
    k.push(plume(cx - 15, b - 38, wind, 1, '#9a7f72', 0.55));
  }
  k.push(path(`M${cx - 20} ${b}V${b - 14}L${cx - 7} ${b - 20}L${cx + 6} ${b - 14}V${b}z`, K.ink));
  k.push(rect(cx - 11, b - 22.3, 8, 2.8, K.ink), gable(cx - 11.8, cx - 2.2, b - 22.3, b - 24, K.ink));
  k.push(stroke(`M${cx - 20} ${b - 14}L${cx - 11} ${b - 18.2}M${cx - 3} ${b - 18.2}L${cx + 6} ${b - 14}`, K.rim, 0.45, { opacity: 0.5 }));
  g.grid(cx - 10.6, b - 21.6, 4, 1, 2, 0, 1.2, 1.2, 0.9);
  g.grid(cx - 18, b - 11.6, 7, 1, 3.4, 0, 1.6, 3, 0.55);
  k.push(g.flush());
  k.push(circ(cx - 7.5, b - 3, 9, `url(#${glow})`, { opacity: 0.75 }));
  k.push(rect(cx - 10, b - 6.5, 5, 6.5, K.glow), rect(cx - 9.2, b - 4, 3.4, 4, K.fireCore, { opacity: 0.7 }));
  // gantry crane
  const g0 = cx + 8;
  const g1 = cx + 23;
  k.push(stroke(`M${g0 - 1.8} ${b}L${g0} ${b - 20}L${g0 + 1.8} ${b}M${g1 - 1.8} ${b}L${g1} ${b - 20}L${g1 + 1.8} ${b}`
    + `M${g0 - 1} ${b - 9}h2M${g1 - 1} ${b - 9}h2`, K.ink, 0.8));
  k.push(rect(g0 - 2.4, b - 21.6, g1 - g0 + 4.8, 1.8, K.ink), rimLine(g0 - 2.4, g1 + 2.4, b - 21.6, 0.5));
  const tx = cx + 16.5;
  k.push(rect(tx - 1.4, b - 20, 2.8, 1.4, K.ink3), stroke(`M${tx} ${b - 18.6}V${b - 11.4}`, K.ink3, 0.35));
  k.push(path(`M${tx - 5.5} ${b - 11.5}h11l0 1.1h-11z`, K.steel));
  // stacked gun barrels
  let barrels = '';
  const rows = lv >= 2 ? 3 : 2;
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < 3 - row; i++) {
      const y = b - 0.75 - row * 1.35;
      const x = g0 + 0.5 + row * 0.9 + i * 0.01;
      barrels += `M${n(x)} ${n(y - 0.62)}L${n(x + 11)} ${n(y - 0.4)}L${n(x + 11)} ${n(y + 0.4)}L${n(x)} ${n(y + 0.62)}z`;
      barrels += `M${n(x - 1.4)} ${n(y - 0.66)}h1.4v1.32h-1.4z`;
      if (i === 0) break;
    }
  }
  k.push(path(barrels, K.steel), stroke(barrels, K.ink, 0.15));
  if (lv >= 3) {
    const fx = cx + 30;
    k.push(stroke(`M${fx - 5} ${b - 0.4}L${fx} ${b - 2.4}`, K.ink, 0.9), stroke(`M${fx} ${b - 2.6}L${fx + 6.5} ${b - 5.4}`, K.ink, 1));
    k.push(rect(fx - 1.2, b - 4.4, 2.6, 2.6, K.ink), circ(fx, b - 1.7, 1.7, 'none', { stroke: K.ink, strokeWidth: 0.6 }));
  }
  return G(...k);
};

function lorry(x: number, b: number, dir: number): ReactNode {
  const t = `translate(${n(x)} 0) scale(${dir} 1)`;
  const kids: ReactNode[] = [
    path(`M0 ${b - 2.4}V${b - 6}Q0 ${b - 7.3} 1.3 ${b - 7.3}H7.6Q8.6 ${b - 7.3} 8.6 ${b - 6}V${b - 2.4}z`, '#5b5839'),
    path(`M0.4 ${b - 6.4}Q0.6 ${b - 7.1} 1.4 ${b - 7.1}H7.4`, 'none', { stroke: K.rim, strokeWidth: 0.4, opacity: 0.6 }),
    rect(-0.4, b - 2.9, 14.2, 1.1, K.ink),
    path(`M9 ${b - 2}V${b - 5.8}H11.4L12.4 ${b - 4.2}H14V${b - 2}z`, K.ink),
    rect(9.6, b - 5.2, 1.6, 1.2, K.win2, { opacity: 0.6 }),
    circ(2.2, b - 1.25, 1.25, '#141113'), circ(5, b - 1.25, 1.25, '#141113'), circ(12, b - 1.25, 1.25, '#141113'),
    circ(2.2, b - 1.25, 0.4, K.ink3), circ(5, b - 1.25, 0.4, K.ink3), circ(12, b - 1.25, 0.4, K.ink3),
  ];
  return GA({ transform: t }, ...kids);
}

const paintMotorPool: Painter = ({ cx, b, lv, r, accent }) => {
  const k: ReactNode[] = [];
  const bays = clamp(2 + lv, 3, 5);
  const bw = 5.6;
  const x0 = cx - 14 - (bays - 3) * 2.8;
  const w = bays * bw + 1.6;
  const open = Math.floor(r() * 3);
  k.push(rect(x0, b - 10.5, w, 10.5, K.ink), rect(x0 - 0.4, b - 11.3, w + 0.8, 1, K.ink2), rimLine(x0 - 0.4, x0 + w + 0.4, b - 11.3, 0.6));
  k.push(rect(x0 + 2, b - 10, w - 4, 1.5, accent));
  for (let i = 0; i < bays; i++) {
    const dx = x0 + 1 + i * bw;
    if (i === open) {
      k.push(rect(dx, b - 7.4, 4.6, 7.4, K.win2, { opacity: 0.6 }), rect(dx, b - 7.4, 4.6, 2.2, '#5d5057'));
      k.push(path(`M${n(dx + 0.7)} ${b}V${b - 3.8}l0.6 -1.2H${n(dx + 3.9)}V${b}z`, K.ink));
    } else {
      let ribs = '';
      for (let y = b - 6.8; y < b - 0.2; y += 0.95) ribs += `M${n(dx)} ${n(y)}h4.6`;
      k.push(rect(dx, b - 7.4, 4.6, 7.4, '#5d5057'), stroke(ribs, K.ink, 0.3, { opacity: 0.75 }));
    }
  }
  k.push(lorry(x0 + w + 1.6, b, 1));
  if (lv >= 2) k.push(lorry(x0 + w + 17, b, 1));
  if (lv >= 3) {
    const px = x0 - 3;
    k.push(rect(px, b - 4.6, 1.8, 4.6, K.red, { opacity: 0.8 }), circ(px + 0.9, b - 5.2, 1, K.win, { opacity: 0.85 }));
  }
  return G(...k);
};

function tank(x: number, b: number, dir: number, s = 1): ReactNode {
  const t = `translate(${n(x)} ${n(b)}) scale(${n(dir * s)} ${n(s)})`;
  return GA({ transform: t },
    rect(0, -3.2, 13, 3.2, '#191518', { rx: 1.6 }),
    path('M1.6 -1.6h0.01M4.2 -1.6h0.01M6.8 -1.6h0.01M9.4 -1.6h0.01M11.6 -1.6h0.01', 'none', { stroke: K.ink3, strokeWidth: 1.5, strokeLinecap: 'round' }),
    path('M0.5 -3L1.8 -5.4H11.2L12.6 -3z', '#403e2e'),
    rect(4.2, -7.6, 5.2, 2.4, '#403e2e', { rx: 0.9 }),
    rect(9.2, -6.9, 6.4, 0.8, '#403e2e'),
    rect(1.8, -5.6, 9.4, 0.4, K.rim, { opacity: 0.4 }),
  );
}

const paintTankWorks: Painter = ({ cx, b, lv, g }) => {
  const k: ReactNode[] = [];
  if (lv >= 2) {
    k.push(path(`M${cx - 30} ${b}V${b - 9}Q${cx - 21} ${b - 22} ${cx - 12} ${b - 9}V${b}z`, K.ink2));
  }
  const x0 = cx - 18;
  const x1 = cx + 12;
  const vault = `M${x0} ${b}V${b - 11}Q${(x0 + x1) / 2} ${b - 26} ${x1} ${b - 11}V${b}z`;
  k.push(path(vault, K.ink));
  k.push(stroke(`M${x0} ${b - 11}Q${(x0 + x1) / 2} ${b - 26} ${x1} ${b - 11}`, K.rim, 0.5, { opacity: 0.55 }));
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7;
    const px = x0 + 3 + (x1 - x0 - 6) * t;
    const py = b - 13.2 - Math.sin(t * Math.PI) * 4.8;
    g.pane(px - 0.6, py, 1.2, 1.4, 0.75);
  }
  k.push(g.flush());
  k.push(rect(x0 + 5, b - 10.5, x1 - x0 - 10, 10.5, K.win2, { opacity: 0.55 }));
  k.push(path(`M${x0 + 7} ${b}l1 -2.4h3l1 -1.6h5l1 1.6h2l1 2.4z`, K.ink, { opacity: 0.85 }));
  k.push(stroke(`M${x0 + 5} ${b}V${b - 10.5}H${x1 - 5}V${b}`, K.ink3, 0.6));
  k.push(tank(x1 + 2.5, b, 1));
  if (lv >= 3) k.push(tank(x0 - 1, b, -1, 0.9));
  return G(...k);
};

const paintHospital: Painter = ({ cx, b, lv, g }) => {
  const k: ReactNode[] = [];
  if (lv >= 2) {
    k.push(rect(cx + 13, b - 10, 9, 10, K.whiteShade), gable(cx + 12.6, cx + 22.4, b - 10, b - 12, '#6e5651', 0.15));
    g.grid(cx + 14.6, b - 8.2, 3, 2, 2.4, 3.6, 1.2, 1.8, 0.55);
    k.push(g.flush());
  }
  k.push(rect(cx - 14, b - 13, 28, 13, K.white));
  k.push(gable(cx - 14.6, cx + 14.6, b - 13, b - 15, '#6e5651', 0.08));
  k.push(rect(cx - 4.5, b - 17, 9, 17, K.white));
  k.push(path(`M${cx - 5.2} ${b - 17}L${cx} ${b - 20.4}L${cx + 5.2} ${b - 17}z`, K.whiteShade));
  k.push(stroke(`M${cx - 5.2} ${b - 17}L${cx} ${b - 20.4}L${cx + 5.2} ${b - 17}`, K.rim, 0.5, { opacity: 0.6 }));
  k.push(rect(cx + 4.5, b - 13, 0.5, 13, K.whiteShade), rect(cx - 5, b - 13, 0.5, 13, K.whiteShade));
  g.grid(cx - 12.6, b - 11, 3, 3, 2.6, 3.5, 1.2, 1.8, 0.5);
  g.grid(cx + 6.2, b - 11, 3, 3, 2.6, 3.5, 1.2, 1.8, 0.5);
  k.push(g.flush());
  k.push(rect(cx - 3.2, b - 14.4, 6.4, 6.4, '#eadfcc'));
  k.push(rect(cx - 0.8, b - 13.6, 1.6, 4.8, K.red), rect(cx - 2.4, b - 12, 4.8, 1.6, K.red));
  k.push(rect(cx - 1.3, b - 4.6, 2.6, 4.6, K.win2, { opacity: 0.85 }));
  if (lv >= 3) {
    const ax = cx - 27;
    k.push(path(`M${ax} ${b - 1.6}V${b - 6}H${ax + 6.6}L${ax + 8.6} ${b - 3.8}H${ax + 9.6}V${b - 1.6}z`, K.white));
    k.push(rect(ax + 2.3, b - 5.3, 0.7, 2.6, K.red), rect(ax + 1.35, b - 4.35, 2.6, 0.7, K.red));
    k.push(circ(ax + 2, b - 1.2, 1.1, '#141113'), circ(ax + 7.6, b - 1.2, 1.1, '#141113'));
  }
  return G(...k);
};

const paintPropaganda: Painter = ({ cx, b, lv, g, flag, glow }) => {
  const k: ReactNode[] = [];
  const mx = cx + 3;
  const H = lv >= 3 ? 62 : 56;
  const top = b - H;
  k.push(stroke(`M${mx} ${n(b - H * 0.72)}L${mx - 14} ${b}M${mx} ${n(b - H * 0.72)}L${mx + 14} ${b}`
    + `M${mx} ${n(b - H * 0.4)}L${mx - 9} ${b}M${mx} ${n(b - H * 0.4)}L${mx + 9} ${b}`, K.ink3, 0.3, { opacity: 0.8 }));
  let lattice = `M${mx - 2.4} ${b}L${mx - 0.4} ${top}M${mx + 2.4} ${b}L${mx + 0.4} ${top}`;
  let side = -1;
  for (let y = b; y > top + 1; y -= 2.6) {
    const t = (b - y) / H;
    const hw = 2.4 - 2 * t;
    const ny = y - 2.6;
    const nhw = 2.4 - 2 * ((b - ny) / H);
    lattice += `M${n(mx + side * hw)} ${n(y)}L${n(mx - side * nhw)} ${n(ny)}`;
    side = -side;
  }
  k.push(stroke(lattice, K.ink, 0.6));
  k.push(circ(mx, top - 0.8, 4, `url(#${glow})`, { opacity: 0.9 }), circ(mx, top - 0.8, 0.9, '#ff6a4d'));
  const arcs = 1 + Math.min(3, lv);
  for (let i = 1; i <= arcs; i++) {
    const rad = 2.6 + i * 3.1;
    const pt = (deg: number): string => `${n(mx + rad * Math.cos((deg * Math.PI) / 180))} ${n(top - 0.8 + rad * Math.sin((deg * Math.PI) / 180))}`;
    const d = `M${pt(-38)}A${n(rad)} ${n(rad)} 0 0 1 ${pt(38)}M${pt(142)}A${n(rad)} ${n(rad)} 0 0 1 ${pt(218)}`;
    k.push(stroke(d, K.win, 0.7, { opacity: n(0.9 - i * 0.17), strokeLinecap: 'round' }));
  }
  // poster wall
  k.push(rect(cx - 17, b - 7.5, 13, 7.5, K.ink2), rimLine(cx - 17, cx - 4, b - 7.5));
  const posterFills = [flag, '#d8c6a0', flag];
  posterFills.forEach((pf, i) => {
    const px = cx - 16 + i * 4;
    k.push(rect(px, b - 6.6, 3, 4.8, pf));
    if (i === 1) k.push(path(`M${n(px + 1.5)} ${b - 5.9}l1 1.6h-2z`, flag), rect(px + 0.6, b - 3.4, 1.8, 0.6, flag));
    else k.push(circ(px + 1.5, b - 4.8, 0.8, '#d8c6a0'), rect(px + 0.5, b - 3.1, 2, 0.5, '#d8c6a0'));
  });
  k.push(rect(mx + 4.5, b - 7, 8, 7, K.ink), gable(mx + 4, mx + 13, b - 7, b - 9, K.ink2));
  g.pane(mx + 6.5, b - 5, 1.6, 2, 0.95);
  g.pane(mx + 9.5, b - 5, 1.6, 2, 0.6);
  if (lv >= 2) {
    const lx = cx - 20.5;
    k.push(stroke(`M${lx} ${b}V${b - 13}`, K.ink, 0.6));
    k.push(path(`M${lx} ${b - 12.6}l2.6 -1.4v3.4z M${lx} ${b - 12.4}l-2.6 -1.4v3.4z`, K.ink));
  }
  k.push(g.flush());
  return G(...k);
};

const paintGarrisonHq: Painter = ({ cx, b, lv, g, flag, accent, wind, fade }) => {
  const k: ReactNode[] = [];
  const tx = cx + 12;
  if (lv >= 2) k.push(beam(tx + 1, b - 21.5, -64, 64, 7, fade));
  if (lv >= 3) {
    k.push(rect(cx - 24, b - 12, 10, 12, K.ink2), rimLine(cx - 24, cx - 14, b - 12));
    g.grid(cx - 22.6, b - 10.4, 3, 2, 3, 4, 1.2, 1.8, 0.5);
    k.push(g.flush());
  }
  k.push(rect(cx - 15, b - 17, 20, 17, K.ink));
  k.push(rect(cx - 15.6, b - 17.8, 21.2, 1, K.ink3), rimLine(cx - 15.6, cx + 5.6, b - 17.8, 0.55));
  k.push(rect(cx - 8, b - 20, 6, 2.4, K.ink), path(`M${cx - 8.4} ${b - 20}L${cx - 5} ${b - 22}L${cx - 1.6} ${b - 20}z`, accent));
  g.grid(cx - 13.6, b - 15, 6, 3, 3.2, 4, 1.3, 2, 0.55);
  k.push(rect(cx - 6.2, b - 3.8, 2.4, 3.8, K.win2, { opacity: 0.7 }));
  k.push(flagOn(cx - 5, b - 22, 8, flag, wind, 0.95));
  // watchtower
  k.push(stroke(`M${tx - 3.4} ${b}L${tx - 1.9} ${b - 19}M${tx + 3.4} ${b}L${tx + 1.9} ${b - 19}`
    + `M${tx - 3} ${b - 4.5}L${tx + 2.4} ${b - 12}M${tx + 3} ${b - 4.5}L${tx - 2.4} ${b - 12}`
    + `M${tx - 2.4} ${b - 12}L${tx + 2.1} ${b - 18}M${tx + 2.4} ${b - 12}L${tx - 2.1} ${b - 18}`, K.ink, 0.7));
  k.push(rect(tx - 3, b - 22.8, 6, 4, K.ink), rect(tx - 3.6, b - 19.2, 7.2, 0.6, K.ink));
  k.push(path(`M${tx - 3.8} ${b - 22.6}L${tx} ${b - 25.6}L${tx + 3.8} ${b - 22.6}z`, accent));
  g.pane(tx - 2.2, b - 21.8, 4.4, 1.3, 1);
  k.push(g.flush());
  return G(...k);
};

const paintSupplyDepot: Painter = ({ cx, b, lv, g }) => {
  const k: ReactNode[] = [];
  const shed = (x0: number, x1: number, top: number, peak: number, fill: string): ReactNode => G(
    path(`M${x0} ${b}V${top}L${(x0 + x1) / 2} ${peak}L${x1} ${top}V${b}z`, fill),
    stroke(`M${x0} ${top}L${(x0 + x1) / 2} ${peak}L${x1} ${top}`, K.rim, 0.45, { opacity: 0.45 }),
  );
  if (lv >= 2) k.push(shed(cx - 13, cx + 3, b - 12, b - 16.5, K.ink2));
  k.push(shed(cx - 20, cx - 5, b - 9, b - 13, K.ink));
  k.push(shed(cx - 5.5, cx + 6.5, b - 7.5, b - 11, K.ink));
  k.push(rect(cx - 15, b - 6.5, 5, 6.5, '#5d5057'), rect(cx - 12.6, b - 6.5, 0.5, 6.5, K.win, { opacity: 0.85 }));
  k.push(rect(cx - 2, b - 5.5, 5, 5.5, '#5d5057'));
  // crates
  const s = 3;
  const crate = (x: number, y: number): string => `M${n(x)} ${n(y)}h${s}v${s}h${-s}z`;
  const brace = (x: number, y: number): string => `M${n(x)} ${n(y)}l${s} ${s}`;
  const stacks: [number, number][] = [[0, 0], [3.1, 0], [6.2, 0], [1.55, 1], [4.65, 1], [3.1, 2], [9.3, 0], [9.3, 1]];
  const shown = stacks.slice(0, lv >= 3 ? 8 : lv >= 2 ? 6 : 5);
  let cd = '';
  let bd = '';
  for (const [ox, row] of shown) {
    const x = cx + 8 + ox;
    const y = b - s - row * s;
    cd += crate(x, y);
    bd += brace(x, y);
  }
  k.push(path(cd, K.wood), stroke(cd + bd, K.woodDark, 0.35));
  // fuel drums
  const drums = lv >= 2 ? 6 : 4;
  for (let i = 0; i < drums; i++) {
    const row = i >= 4 ? 1 : 0;
    const x = cx + 21 + (row ? 1 + (i - 4) * 2.2 : i * 2.2);
    const y = b - 3.2 - row * 3.2;
    k.push(rect(x, y, 2, 3.2, i % 3 === 1 ? K.olive : K.rust), rect(x, y + 1, 2, 0.35, K.ink), rect(x, y, 2, 0.35, K.rim, { opacity: 0.5 }));
  }
  if (lv >= 3) k.push(path(`M${cx - 26} ${b}Q${cx - 26} ${b - 5} ${cx - 22.5} ${b - 5}Q${cx - 20} ${b - 5} ${cx - 19.6} ${b}z`, K.olive));
  k.push(g.flush());
  return G(...k);
};

const PAINTERS: Partial<Record<ArtBuilding, Painter>> = {
  industry: paintIndustry,
  market: paintMarket,
  powerPlant: paintPowerPlant,
  refinery: paintRefinery,
  housing: paintHousing,
  university: paintUniversity,
  barracks: paintBarracks,
  academy: paintAcademy,
  armsWorks: paintArmsWorks,
  motorPool: paintMotorPool,
  tankWorks: paintTankWorks,
  hospital: paintHospital,
  propaganda: paintPropaganda,
  garrisonHq: paintGarrisonHq,
  supplyDepot: paintSupplyDepot,
};

/** Rough footprint (width, height) used for scaffolding. */
const FOOT: Record<ArtBuilding, [number, number]> = {
  industry: [40, 18], market: [28, 20], powerPlant: [34, 28], refinery: [36, 24], housing: [40, 22],
  university: [34, 24], barracks: [28, 11], academy: [30, 24], armsWorks: [30, 20], motorPool: [30, 10],
  tankWorks: [32, 18], hospital: [30, 16], propaganda: [24, 18], garrisonHq: [24, 18], supplyDepot: [30, 12],
  railway: [24, 11], fortifications: [26, 9], coastalBattery: [16, 9],
};

/** Horizontal extent (left, right of the slot centre, unscaled) at the highest level, to keep art on land. */
const EXTENT: Partial<Record<ArtBuilding, [number, number]>> = {
  industry: [21, 31], market: [21, 21], powerPlant: [32, 44], refinery: [25, 24], housing: [27, 31],
  university: [27, 27], barracks: [27, 29], academy: [23, 23], armsWorks: [20, 37], motorPool: [20, 42],
  tankWorks: [31, 30], hospital: [27, 23], propaganda: [21, 18], garrisonHq: [24, 16], supplyDepot: [26, 30],
};

const BACK_ROW: ArtBuilding[] = ['industry', 'powerPlant', 'refinery', 'housing', 'university', 'academy', 'propaganda', 'armsWorks'];
const FRONT_ROW: ArtBuilding[] = ['market', 'barracks', 'motorPool', 'tankWorks', 'hospital', 'garrisonHq', 'supplyDepot'];

// ------------------------------------------------------------------ construction

function scaffold(cx: number, b: number, w: number, h: number): ReactNode {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const top = b - h;
  const bays = Math.max(2, Math.round(w / 5));
  const bw = w / bays;
  let poles = '';
  for (let i = 0; i <= bays; i++) poles += `M${n(x0 + i * bw)} ${b}V${n(top - 1.6)}`;
  let planks = '';
  for (let y = b - 3.2; y > top - 0.5; y -= 3.4) planks += `M${n(x0 - 0.6)} ${n(y)}H${n(x1 + 0.6)}`;
  let braces = '';
  for (let i = 0; i < bays; i += 2) braces += `M${n(x0 + i * bw)} ${b}L${n(x0 + (i + 1) * bw)} ${n(Math.max(top, b - bw * 2.2))}`;
  return G(
    rect(x0, top, w, h, K.scaffold, { opacity: 0.12 }),
    stroke(poles, K.scaffold, 0.45),
    stroke(planks, K.scaffold, 0.6),
    stroke(braces, K.scaffold, 0.3, { opacity: 0.8 }),
  );
}

function crane(x: number, b: number, h: number, jib: number, dir: number): ReactNode {
  const top = b - h;
  let lattice = `M${x - 1} ${b}V${top}M${x + 1} ${b}V${top}`;
  for (let y = b, s = -1; y > top + 1; y -= 2.2, s = -s) lattice += `M${x + s} ${n(y)}L${x - s} ${n(y - 2.2)}`;
  const jx = x + dir * jib;
  const cx = x - dir * jib * 0.3;
  const jibD = `M${n(cx)} ${n(top)}H${n(jx)}M${n(cx)} ${n(top - 1.4)}H${n(jx - dir * 2)}`
    + `M${x} ${n(top - 5)}L${n(jx)} ${n(top)}M${x} ${n(top - 5)}L${n(cx)} ${n(top - 1)}M${x} ${n(top)}V${n(top - 5)}`;
  const hx = x + dir * jib * 0.72;
  const hookY = b - h * 0.42;
  return G(
    stroke(lattice, K.crane, 0.45),
    stroke(jibD, K.crane, 0.55),
    rect(Math.min(cx, cx - dir * 3) , top - 0.6, 3, 2.8, K.ink3),
    rect(x - 1.6, top + 1, 3.2, 2.2, K.crane),
    stroke(`M${n(hx)} ${n(top)}V${n(hookY)}`, K.ink3, 0.3),
    rect(hx - 2.6, hookY, 5.2, 1, K.steel),
    circ(x, top - 5.4, 0.7, '#ff5d45'),
  );
}

// ------------------------------------------------------------------ foreground structures

function paintRailway(lv: number, x0: number, x1: number, sx: number, dir: number, accent: string, seed: string, partial: boolean): ReactNode {
  const k: ReactNode[] = [];
  const st: ReactNode[] = [];
  const g = new Glass(rngOf(seed, 'railway:win'), partial ? 0 : 0.65);
  const track = (y: number, a: number, b: number): ReactNode => {
    let sleepers = '';
    for (let x = a + 0.6; x < b - 1; x += 2.4) sleepers += `M${n(x)} ${n(y + 0.3)}h1.3v0.9h-1.3z`;
    return G(rect(a, y + 0.2, b - a, 1.6, '#2e272a'), path(sleepers, '#4a3e40'), stroke(`M${n(a)} ${y}H${n(b)}`, K.rail, 0.65),
      stroke(`M${n(a)} ${n(y - 0.3)}H${n(b)}`, K.rim, 0.25, { opacity: 0.5 }));
  };
  const ta = partial ? Math.max(x0, sx - 34) : x0;
  const tb = partial ? Math.min(x1, sx + 34) : x1;
  if (lv >= 3 && !partial) {
    st.push(path(`M${sx - 22} ${RAIL_Y}V${RAIL_Y - 9}Q${sx} ${RAIL_Y - 24} ${sx + 22} ${RAIL_Y - 9}V${RAIL_Y}z`, K.ink2));
    let ribs = '';
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const px = sx - 22 + 44 * t;
      ribs += `M${n(px)} ${RAIL_Y - 9}V${n(RAIL_Y - 9 - Math.sin(t * Math.PI) * 6.6)}`;
    }
    st.push(stroke(ribs, K.win2, 0.4, { opacity: 0.5 }));
    st.push(stroke(`M${sx - 22} ${RAIL_Y - 9}Q${sx} ${RAIL_Y - 24} ${sx + 22} ${RAIL_Y - 9}`, K.rim, 0.5, { opacity: 0.55 }));
  }
  // station building, canopy and platform
  st.push(rect(sx - 9, RAIL_Y - 11, 18, 10, K.ink2));
  st.push(gable(sx - 10, sx + 10, RAIL_Y - 11, RAIL_Y - 14, accent, 0.15));
  st.push(path(`M${sx - 3} ${RAIL_Y - 13}L${sx} ${RAIL_Y - 17}L${sx + 3} ${RAIL_Y - 13}z`, K.ink2));
  if (!partial) st.push(circ(sx, RAIL_Y - 14.4, 1.1, '#e9d6a6'));
  g.grid(sx - 7.4, RAIL_Y - 9.2, 6, 1, 2.6, 0, 1.2, 2.6, 0.75);
  st.push(g.flush());
  st.push(rect(sx - 17, RAIL_Y - 1.8, 34, 1.6, '#4c423e'));
  st.push(rect(sx - 16, RAIL_Y - 6.8, 32, 0.9, K.ink), rimLine(sx - 16, sx + 16, RAIL_Y - 6.8, 0.6));
  let posts = '';
  for (let x = sx - 15; x <= sx + 15; x += 6) posts += `M${x} ${RAIL_Y - 1.7}V${RAIL_Y - 6}`;
  st.push(stroke(posts, K.ink, 0.5));
  const S = SCALE_FG;
  k.push(GA({ transform: `translate(${n(sx)} ${RAIL_Y}) scale(${S}) translate(${n(-sx)} ${-RAIL_Y})` }, ...st));
  k.push(track(RAIL_Y, ta, tb));
  if (lv >= 2 && !partial) {
    k.push(track(RAIL_Y + 4.4, x0, x1));
    const sigX = sx + dir * 34;
    k.push(stroke(`M${sigX} ${RAIL_Y}V${RAIL_Y - 11}`, K.ink, 0.6), rect(sigX, RAIL_Y - 10.6, 3.2, 1, K.red), circ(sigX - 0.7, RAIL_Y - 8.8, 0.55, '#9fdc8a'));
  }
  if (partial) return G(...k);
  // the train
  const carriages = clamp(lv + 1, 2, 4);
  const tg = new Glass(rngOf(seed, 'train:win'), 0.75);
  const kids: ReactNode[] = [];
  const y = RAIL_Y;
  kids.push(plume(-3.8, y - 9, -1, 0.85, K.steam, 0.6, 6));
  kids.push(path(`M0 ${y - 1.4}L1.4 ${y - 3}V${y - 5.4}H9V${y - 1.4}z`, K.ink));
  kids.push(rect(2.9, y - 7.6, 1.5, 2.4, K.ink), path(`M5.6 ${y - 5.3}a1.2 1.2 0 0 1 2.4 0z`, K.ink));
  kids.push(rect(1.4, y - 5.6, 7.6, 0.4, K.rim, { opacity: 0.45 }));
  kids.push(rect(9, y - 7.6, 3.8, 6.2, K.ink), rect(8.6, y - 8.1, 4.6, 0.7, K.ink));
  tg.pane(10, y - 6.8, 1.8, 1.6, 1);
  kids.push(rect(13.1, y - 5, 4, 3.6, K.ink));
  for (const wx of [2.6, 5.3, 8]) kids.push(circ(wx, y - 1.15, 1.15, '#151214'), circ(wx, y - 1.15, 0.35, K.ink3));
  for (const wx of [14.2, 16.2]) kids.push(circ(wx, y - 0.75, 0.75, '#151214'));
  for (let c = 0; c < carriages; c++) {
    const cx0 = 17.8 + c * 11;
    const goods = lv >= 3 && c === carriages - 1;
    if (goods) {
      kids.push(rect(cx0, y - 5.2, 10, 3.8, K.woodDark), stroke(`M${cx0 + 2.5} ${y - 5.2}v3.8M${cx0 + 5} ${y - 5.2}v3.8M${cx0 + 7.5} ${y - 5.2}v3.8`, K.ink, 0.3));
    } else {
      kids.push(path(`M${cx0} ${y - 1.4}V${y - 5.2}Q${cx0 + 5} ${y - 6.6} ${cx0 + 10} ${y - 5.2}V${y - 1.4}z`, K.ink2));
      kids.push(stroke(`M${cx0 + 0.4} ${y - 5.4}Q${cx0 + 5} ${y - 6.6} ${cx0 + 9.6} ${y - 5.4}`, K.rim, 0.35, { opacity: 0.5 }));
      tg.grid(cx0 + 1, y - 4.6, 5, 1, 1.75, 0, 1.1, 1.5, 0.7);
    }
    kids.push(circ(cx0 + 2, y - 0.7, 0.7, '#151214'), circ(cx0 + 8, y - 0.7, 0.7, '#151214'));
  }
  kids.push(tg.flush());
  const len = (17.8 + carriages * 11) * S;
  // place the train so its carriages sit at the platform, heading in `dir`
  const front = clamp(dir > 0 ? sx + len * 0.55 : sx - len * 0.55, x0 + len, x1 - len);
  k.push(GA({ transform: `translate(${n(front)} ${RAIL_Y}) scale(${n(-dir * S)} ${S}) translate(0 ${-RAIL_Y})` }, ...kids));
  return G(...k);
}

function paintForts(lv: number, x0: number, x1: number, seed: string): ReactNode {
  const k: ReactNode[] = [];
  const r = rngOf(seed, 'forts');
  const bunkerXs = [0, 1, 2, 3].map((i) => x0 + (x1 - x0) * ((i + 0.25 + r() * 0.5) / 4));
  const order = shuffle([0, 1, 2, 3], r);
  const segs: [number, number][] = [];
  for (let x = x0 - 2; x < x1;) {
    const len = 36 + r() * 44;
    segs.push([x, Math.min(x1 + 2, x + len)]);
    x += len + 3 + r() * 3;
  }
  const top = lv >= 3 ? 109.6 : 112.2;
  const concrete = K.concrete;
  if (lv >= 2) {
    let wall = '';
    let rim = '';
    let joints = '';
    let slits = '';
    let blocks = '';
    for (const [a, b] of segs) {
      wall += `M${n(a)} ${VH}L${n(a + 1.4)} ${top}H${n(b - 1.4)}L${n(b)} ${VH}z`;
      rim += `M${n(a + 1.4)} ${top}H${n(b - 1.4)}`;
      for (let x = a + 6; x < b - 3; x += 7) joints += `M${n(x)} ${top + 1.2}V${VH}`;
      if (lv >= 3) {
        for (let x = a + 3; x < b - 4; x += 5) blocks += `M${n(x)} ${top}v-1.4h2.6v1.4z`;
        for (let x = a + 5; x < b - 5; x += 10) slits += `M${n(x)} ${top + 2.6}h2.4v0.9h-2.4z`;
      }
    }
    k.push(path(wall, concrete), stroke(joints, '#29242a', 0.35));
    if (blocks) k.push(path(blocks, concrete), stroke(blocks, K.rim, 0.3, { opacity: 0.35 }));
    k.push(stroke(rim, K.rim, 0.55, { opacity: 0.6 }));
    if (slits) k.push(path(slits, '#0f0c0e'));
  }
  // bunkers
  const count = clamp(lv, 1, 3);
  for (let i = 0; i < count; i++) {
    const bx = bunkerXs[order[i]];
    const by = lv >= 2 ? top + 3 : 115.2;
    const w = lv >= 3 ? 9.5 : lv >= 2 ? 8 : 7;
    const h = lv >= 3 ? 7.4 : 6.2;
    const dome = `M${n(bx - w)} ${n(by)}Q${n(bx - w * 0.95)} ${n(by - h)} ${n(bx)} ${n(by - h)}Q${n(bx + w * 0.95)} ${n(by - h)} ${n(bx + w)} ${n(by)}z`;
    k.push(path(dome, '#433b3f'));
    k.push(stroke(`M${n(bx - w * 0.8)} ${n(by - h * 0.62)}Q${n(bx - w * 0.5)} ${n(by - h)} ${n(bx)} ${n(by - h)}Q${n(bx + w * 0.5)} ${n(by - h)} ${n(bx + w * 0.8)} ${n(by - h * 0.62)}`, K.rim, 0.6, { opacity: 0.6 }));
    k.push(rect(bx - w * 0.5, by - h * 0.56, w, 1.2, '#0f0c0e'));
    k.push(rect(bx - w * 0.38, by - h * 0.54, w * 0.2, 0.7, K.glow, { opacity: 0.6 }));
    if (lv >= 3) k.push(rect(bx + w * 0.1, by - h * 0.53, w * 0.75, 0.7, K.ink));
  }
  // sandbag parapet in front
  const sy = lv >= 2 ? 116 : 114.6;
  let bags = '';
  let bagRim = '';
  for (const row of [0, 1]) {
    const y = sy + row * 1.5;
    let x = x0 - (row ? 1.6 : 0);
    bags += `M${n(x)} ${VH}V${n(y)}`;
    while (x < x1) {
      const bw = 2.6 + r() * 1.3;
      const bh = 0.75 + r() * 0.45;
      bags += `a${n(bw / 2)} ${n(bh)} 0 0 1 ${n(bw)} 0`;
      if (!row && r() < 0.7) bagRim += `M${n(x + bw * 0.15)} ${n(y - bh * 0.55)}q${n(bw * 0.35)} ${n(-bh * 0.6)} ${n(bw * 0.7)} 0`;
      x += bw;
    }
    bags += `V${VH}z`;
  }
  k.push(path(bags, '#463a34'), stroke(bagRim, K.rim, 0.35, { opacity: 0.45 }));
  k.push(path(`M${n(x0)} ${n(sy + 2.6)}H${n(x1)}V${VH}H${n(x0)}z`, '#241e21'));
  // dragon's teeth
  if (lv >= 3) {
    let teeth = '';
    let lit = '';
    for (let x = x0 + 2; x < x1 - 3; x += 4.6) {
      teeth += `M${n(x)} ${VH}l1.6 -3.6l1.6 3.6z`;
      lit += `M${n(x)} ${VH}l1.6 -3.6`;
    }
    k.push(path(teeth, '#4a4145'), stroke(lit, K.rim, 0.35, { opacity: 0.45 }));
  }
  // barbed wire on pickets
  const wy = lv >= 3 ? 115.4 : 117.6;
  let pickets = '';
  let strands = '';
  for (let x = x0 + 3; x < x1; x += 10) {
    pickets += `M${n(x)} ${n(wy + 2.6)}L${n(x + 0.3)} ${n(wy - 2.6)}`;
    if (x + 10 < x1) {
      strands += `M${n(x)} ${n(wy - 1.6)}Q${n(x + 5)} ${n(wy - 0.6)} ${n(x + 10)} ${n(wy - 1.6)}`;
      strands += `M${n(x)} ${n(wy + 0.6)}Q${n(x + 5)} ${n(wy + 1.5)} ${n(x + 10)} ${n(wy + 0.6)}`;
    }
  }
  k.push(stroke(pickets, '#161214', 0.8));
  k.push(stroke(strands, '#a08e82', 0.3, { opacity: 0.7 }));
  k.push(stroke(strands, '#a08e82', 0.7, { opacity: 0.5, strokeDasharray: '0.25 1.5' }));
  return G(...k);
}

function paintBattery(lv: number, qx: number, dir: number, fade: string): ReactNode {
  const k: ReactNode[] = [];
  const b = BASE_FRONT;
  const bx = qx - dir * 9;
  const gun = (x: number, y: number, len: number, s: number): ReactNode => {
    const ex = x + dir * len;
    return path(`M${n(x)} ${n(y - 0.9 * s)}L${n(ex)} ${n(y - 1.9 * s)}L${n(ex)} ${n(y - 1.1 * s)}L${n(x)} ${n(y + 0.7 * s)}z`, K.ink);
  };
  // rangefinder tower
  const rx = bx - dir * 7;
  k.push(rect(rx - 2, b - 15, 4, 15, K.ink2), rect(rx - 2.8, b - 17, 5.6, 2.4, K.ink2));
  k.push(rect(rx - 2.2, b - 16.2, 4.4, 0.7, K.win2, { opacity: 0.8 }));
  if (lv >= 3) k.push(beam(rx, b - 16.4, dir < 0 ? 194 : -14, 80, 6, fade));
  // casemate with the main gun
  k.push(gun(bx + dir * 4, b - 4.6, 15, 1));
  k.push(path(`M${n(bx - 8)} ${b}L${n(bx - 6)} ${b - 6}H${n(bx + 6)}L${n(bx + 8)} ${b}z`, '#4a4145'));
  k.push(rect(bx - 6, b - 6, 12, 0.6, K.rim, { opacity: 0.45 }));
  k.push(rect(bx + dir * 3 - 2, b - 5, 4, 1.4, '#120e10'));
  if (lv >= 2) {
    const tx = bx - dir * 13;
    k.push(gun(tx + dir * 2, b - 4, 11, 0.8));
    k.push(path(`M${n(tx - 5)} ${b}Q${n(tx - 4.6)} ${b - 6} ${n(tx)} ${b - 6}Q${n(tx + 4.6)} ${b - 6} ${n(tx + 5)} ${b}z`, '#4a4145'));
    k.push(stroke(`M${n(tx - 3.8)} ${b - 4.4}Q${n(tx - 2.4)} ${b - 6} ${n(tx)} ${b - 6}Q${n(tx + 2.4)} ${b - 6} ${n(tx + 3.8)} ${b - 4.4}`, K.rim, 0.5, { opacity: 0.55 }));
  }
  const S = SCALE_FG;
  return GA({ transform: `translate(${n(qx)} ${b}) scale(${S}) translate(${n(-qx)} ${-b})` }, ...k);
}

function paintShip(x: number, y: number, dir: number, funnel: string, g: Glass): ReactNode {
  const kids: ReactNode[] = [
    path(`M0 ${y}L1 ${y - 4}H30L32.5 ${y - 5.2}L30.5 ${y}z`, K.ink),
    rect(0, y - 1, 31, 1, '#3b2a2a'),
    rect(8, y - 7.4, 14, 3.4, K.ink2),
    rect(11, y - 9.2, 8, 1.8, K.ink2),
    rect(14, y - 13.6, 3.2, 4.4, funnel),
    rect(14, y - 14.4, 3.2, 0.9, K.ink),
    stroke(`M4 ${y - 4}V${y - 16}M26 ${y - 4}V${y - 14.5}M4 ${y - 16}L26 ${y - 14.5}M2 ${y - 4}L4 ${y - 13}`, K.ink, 0.4),
  ];
  g.grid(9.2, y - 6.6, 5, 1, 2.5, 0, 1.1, 1.3, 0.7);
  g.grid(3, y - 3, 8, 1, 3.4, 0, 0.7, 0.7, 0.6);
  kids.push(g.flush());
  kids.push(plume(15.6, y - 16, 1, 0.8, K.smoke, 0.4, 5));
  return GA({ transform: `translate(${n(x)} 0) scale(${dir} 1)` }, ...kids);
}

// ------------------------------------------------------------------ terrain

const TERRAIN_FAR = '#6c5862';
const TERRAIN_MID = '#54474f';

function ridge(fn: (x: number) => number, step = 4): string {
  let d = `M0 ${VH}`;
  for (let x = 0; x <= VW; x += step) d += `L${x} ${n(fn(x))}`;
  return `${d}L${VW} ${VH}z`;
}

function terrainArt(seed: string, terrain: ArtTerrain, land: (x: number) => number): ReactNode {
  const r = rngOf(seed, `terrain:${terrain}`);
  const p1 = r() * 6.28;
  const p2 = r() * 6.28;
  const p3 = r() * 6.28;
  const k: ReactNode[] = [];
  const H0 = HORIZON - TERRAIN_DY;
  const settle = (y: number, x: number): number => H0 - (H0 - y) * land(x);
  if (terrain === 'mountains') {
    const peaks: [number, number][] = [];
    let x = -12;
    let up = true;
    while (x < VW + 20) {
      peaks.push([x, up ? 30 + r() * 26 : 58 + r() * 16]);
      x += 9 + r() * 16;
      up = !up;
    }
    const far = peaks.map(([px, py]) => [px, H0 - (H0 - py) * (0.55 + 0.45 * land(px))] as [number, number]);
    k.push(path(`M-12 ${VH}${far.map(([px, py]) => `L${n(px)} ${n(py)}`).join('')}L${VW + 20} ${VH}z`, TERRAIN_FAR));
    let snow = '';
    for (let i = 1; i < far.length - 1; i++) {
      const [px, py] = far[i];
      const [lx, ly] = far[i - 1];
      const [qx, qy] = far[i + 1];
      if (py > ly || py > qy || py > 52) continue;
      const f = 6 / Math.max(6, ly - py);
      const g2 = 6 / Math.max(6, qy - py);
      const ax = px + (lx - px) * f;
      const ay = py + (ly - py) * f;
      const bx = px + (qx - px) * g2;
      const by = py + (qy - py) * g2;
      snow += `M${n(px)} ${n(py)}L${n(ax)} ${n(ay)}L${n((ax + px) / 2)} ${n(ay - 1.5)}L${n(px)} ${n(ay + 0.5)}L${n((bx + px) / 2)} ${n(by - 2)}L${n(bx)} ${n(by)}z`;
    }
    k.push(path(snow, '#d5bba6', { opacity: 0.8 }));
    k.push(path(ridge((xx) => settle(78 - 6 * Math.sin(xx * 0.03 + p1) - 4 * Math.sin(xx * 0.071 + p2) - 2 * Math.sin(xx * 0.17 + p3), xx)), TERRAIN_MID));
  } else if (terrain === 'hills') {
    k.push(path(ridge((xx) => settle(74 - 7 * Math.sin(xx * 0.021 + p1) - 4 * Math.sin(xx * 0.047 + p2), xx)), TERRAIN_FAR));
    k.push(path(ridge((xx) => settle(85 - 5 * Math.sin(xx * 0.035 + p2) - 3 * Math.sin(xx * 0.09 + p3), xx)), TERRAIN_MID));
  } else if (terrain === 'forest') {
    k.push(path(ridge((xx) => settle(83 - 4 * Math.sin(xx * 0.02 + p1) - 2 * Math.sin(xx * 0.05 + p2), xx)), TERRAIN_FAR));
    let trees = '';
    for (let x = -2; x < VW + 4; x += 2.4 + r() * 2.2) {
      const m = land(x);
      if (m < 0.3) continue;
      const base = 94;
      const h = (5 + r() * 7) * m;
      const w = 2.2 + r() * 1.8;
      if (r() < 0.62) trees += `M${n(x - w)} ${base}L${n(x)} ${n(base - h - 2)}L${n(x + w)} ${base}z`;
      else trees += `M${n(x - w)} ${base}V${n(base - h * 0.6)}a${n(w)} ${n(w * 1.1)} 0 0 1 ${n(2 * w)} 0V${base}z`;
    }
    k.push(path(trees, '#46463f'));
    k.push(path(ridge((xx) => settle(92 - 1.5 * Math.sin(xx * 0.06 + p3), xx)), '#3d3c37'));
  } else if (terrain === 'plains') {
    k.push(path(ridge((xx) => settle(88 - 2.2 * Math.sin(xx * 0.017 + p1) - 1.2 * Math.sin(xx * 0.05 + p2), xx)), TERRAIN_FAR));
    let clumps = '';
    for (let i = 0; i < 9; i++) {
      const x = r() * VW;
      if (land(x) < 0.8) continue;
      const y = 88 - 2.2 * Math.sin(x * 0.017 + p1) - 1.2 * Math.sin(x * 0.05 + p2);
      if (r() < 0.5) clumps += `M${n(x - 1)} ${n(y + 0.5)}a1 3.6 0 0 1 2 0z`;
      else clumps += `M${n(x - 3)} ${n(y + 0.5)}a1.6 1.6 0 0 1 3 -1a1.8 1.8 0 0 1 3 1z`;
    }
    k.push(path(clumps, TERRAIN_MID));
    const wx = 30 + r() * 260;
    if (land(wx) > 0.9) {
      const wy = 88 - 2.2 * Math.sin(wx * 0.017 + p1) - 1.2 * Math.sin(wx * 0.05 + p2);
      k.push(path(`M${n(wx - 1.4)} ${n(wy + 0.5)}L${n(wx - 0.8)} ${n(wy - 5)}H${n(wx + 0.8)}L${n(wx + 1.4)} ${n(wy + 0.5)}z`, TERRAIN_MID));
      k.push(stroke(`M${n(wx - 3.4)} ${n(wy - 8.4)}L${n(wx + 3.4)} ${n(wy - 1.6)}M${n(wx - 3.4)} ${n(wy - 1.6)}L${n(wx + 3.4)} ${n(wy - 8.4)}`, TERRAIN_MID, 0.6));
    }
    k.push(path(ridge((xx) => settle(93 - 0.8 * Math.sin(xx * 0.04 + p3), xx)), '#4a3e44'));
  } else if (terrain === 'urban') {
    k.push(path(ridge((xx) => settle(90 - 1.5 * Math.sin(xx * 0.02 + p1), xx)), TERRAIN_FAR));
    let sub = '';
    for (let x = -2; x < VW; x += 3 + r() * 5) {
      const m = land(x);
      if (m < 0.5) continue;
      const w = 2.5 + r() * 4;
      const h = (2 + r() * 7) * m;
      sub += `M${n(x)} 91V${n(91 - h)}h${n(w)}V91z`;
      if (r() < 0.12) sub += `M${n(x + w / 2 - 0.5)} ${n(91 - h)}v-${n(5 + r() * 6)}h1V91z`;
    }
    k.push(path(sub, TERRAIN_FAR));
    k.push(path(ridge((xx) => settle(93, xx)), '#4f4249'));
  } else {
    // marsh: flat, pools that catch the sky, reeds, low mist
    k.push(path(ridge((xx) => settle(90 - 1 * Math.sin(xx * 0.03 + p1), xx)), TERRAIN_FAR));
    let lowTrees = '';
    for (let i = 0; i < 6; i++) {
      const x = r() * VW;
      if (land(x) < 0.8) continue;
      lowTrees += `M${n(x - 3)} 90.5a2 1.6 0 0 1 3 -1a2.2 1.8 0 0 1 3.4 1z`;
    }
    k.push(path(lowTrees, TERRAIN_MID));
    k.push(path(ridge(() => 93), '#4a3f45'));
    let pools = '';
    for (let i = 0; i < 9; i++) {
      const x = r() * VW;
      if (land(x) < 0.8) continue;
      const w = 10 + r() * 26;
      const y = 93.6 + r() * 3.6;
      pools += `M${n(x)} ${n(y)}h${n(w)}q-1.2 0.9 -${n(w * 0.12)} 0.9h-${n(w * 0.76)}q-${n(w * 0.12)} 0 -${n(w * 0.12)} -0.9z`;
    }
    k.push(path(pools, '#b98e6c', { opacity: 0.55 }));
  }
  return G(...k);
}

/** Foreground pools catching the sunset, for marsh provinces. */
function marshPools(seed: string, x0: number, x1: number): ReactNode {
  const r = rngOf(seed, 'pools');
  let pools = '';
  let shine = '';
  for (let i = 0; i < 9; i++) {
    const w = 14 + r() * 34;
    const x = x0 + r() * Math.max(1, x1 - x0 - w);
    const y = 108 + r() * 9;
    const h = 1.6 + r() * 1.6;
    pools += `M${n(x)} ${n(y)}q${n(w / 2)} ${n(-h * 0.4)} ${n(w)} 0q${n(-w * 0.1)} ${n(h)} ${n(-w * 0.45)} ${n(h)}q${n(-w * 0.45)} 0 ${n(-w * 0.55)} ${n(-h)}z`;
    shine += `M${n(x + w * 0.2)} ${n(y + 0.3)}h${n(w * (0.2 + r() * 0.3))}v0.35h${n(-w * 0.2)}z`;
  }
  return G(path(pools, '#7d6058', { opacity: 0.8 }), path(shine, '#e8b27c', { opacity: 0.55 }));
}

function marshReeds(seed: string, x0: number, x1: number): ReactNode {
  const r = rngOf(seed, 'reeds');
  let reeds = '';
  let heads = '';
  for (let i = 0; i < 14; i++) {
    const side = i % 2 === 0 ? x0 + r() * 34 : x1 - r() * 34;
    const base = 112 + r() * 8;
    for (let j = 0; j < 5; j++) {
      const x = side + (r() - 0.5) * 6;
      const h = 6 + r() * 9;
      const lean = (r() - 0.5) * 3;
      reeds += `M${n(x)} ${n(base)}q${n(lean * 0.3)} ${n(-h * 0.5)} ${n(lean)} ${n(-h)}`;
      if (r() < 0.3) heads += `M${n(x + lean - 0.45)} ${n(base - h + 0.3)}h0.9v2.6h-0.9z`;
    }
  }
  return G(stroke(reeds, '#1b1719', 0.55), path(heads, '#1b1719'));
}

// ------------------------------------------------------------------ generic city mass

interface Lot { x: number; w: number; rh: number; rs: number; rr: number; rk: number }

interface TierSpec { reach: number; hMin: number; hMax: number; back: boolean; haze: number; towers: boolean }

const TIERS: Record<1 | 2 | 3 | 4 | 5, TierSpec> = {
  1: { reach: 0.32, hMin: 9.5, hMax: 14.5, back: false, haze: 0, towers: false },
  2: { reach: 0.44, hMin: 9, hMax: 20, back: true, haze: 0, towers: false },
  3: { reach: 0.64, hMin: 8.5, hMax: 27, back: true, haze: 0.55, towers: false },
  4: { reach: 0.86, hMin: 9, hMax: 36, back: true, haze: 0.8, towers: true },
  5: { reach: 1.08, hMin: 10, hMax: 45, back: true, haze: 1, towers: true },
};

function makeLots(seed: string, key: string, x0: number, x1: number, minW: number, maxW: number): Lot[] {
  const r = rngOf(seed, key);
  const lots: Lot[] = [];
  let x = x0 - r() * 6;
  while (x < x1) {
    const w = minW + r() * (maxW - minW);
    lots.push({ x, w, rh: r(), rs: r(), rr: r(), rk: r() });
    x += w + (r() < 0.22 ? 0.6 + r() * 1.4 : 0);
  }
  return lots;
}

function lotHeight(lot: Lot, center: number, half: number, T: TierSpec): number | null {
  const dN = Math.abs(lot.x + lot.w / 2 - center) / half;
  const reach = T.reach * (0.86 + 0.28 * lot.rk);
  if (dN > reach) return null;
  const f = 1 - dN / reach;
  let h = T.hMin + (T.hMax - T.hMin) * Math.pow(f, 0.85) * (0.38 + 0.62 * lot.rh);
  if (T.towers && lot.rh > 0.86 && f > 0.3) h *= 1.25;
  return h;
}

function drawLot(lot: Lot, h: number, base: number, fill: string, roof: string, g: Glass, p: number, houseMax = 12.5): ReactNode {
  const { x, w } = lot;
  if (h < houseMax) {
    const roofH = Math.min(5, 1.9 + w * 0.26);
    const bodyH = Math.max(3.4, h - roofH);
    const top = base - bodyH;
    const kids: ReactNode[] = [rect(x, top, w, bodyH, fill)];
    if (lot.rr < 0.55) kids.push(path(`M${n(x - 0.4)} ${n(top)}L${n(x + w / 2)} ${n(top - roofH)}L${n(x + w + 0.4)} ${n(top)}z`, roof));
    else kids.push(path(`M${n(x - 0.4)} ${n(top)}L${n(x + w * 0.24)} ${n(top - roofH)}H${n(x + w * 0.76)}L${n(x + w + 0.4)} ${n(top)}z`, roof));
    if (lot.rs > 0.45) kids.push(rect(x + w * 0.68, top - roofH * 0.9, 1.1, roofH * 0.7, roof));
    const cols = w > 8.4 ? 2 : 1;
    const rows = bodyH > 7.4 ? 2 : 1;
    const span = (cols - 1) * 2.8 + 1.3;
    g.grid(x + (w - span) / 2, top + 1.4, cols, rows, 2.8, 3.2, 1.3, 1.7, p);
    return G(...kids);
  }
  if (h < 27) {
    const mansard = lot.rr < 0.38;
    const kids: ReactNode[] = [rect(x, base - h, w, h, fill)];
    if (mansard) {
      kids.push(path(`M${n(x - 0.3)} ${n(base - h + 2.8)}L${n(x + 0.9)} ${n(base - h)}H${n(x + w - 0.9)}L${n(x + w + 0.3)} ${n(base - h + 2.8)}z`, roof));
    } else {
      kids.push(rect(x - 0.35, base - h, w + 0.7, 0.8, roof));
      if (lot.rs > 0.6) kids.push(rect(x + w * 0.2, base - h - 1.6, 1.2, 1.6, fill));
    }
    g.box(x, base - h + (mansard ? 2.8 : 1), w, h - (mansard ? 2.8 : 1) - 2, 2.4, 3.1, 1.2, 1.6, p, 0.8);
    return G(...kids);
  }
  if (lot.rs < 0.3) {
    // grand block with a dome or a clock tower: keeps big cities European rather than Manhattan
    const bh = h * 0.68;
    const kids: ReactNode[] = [rect(x, base - bh, w, bh, fill), rect(x - 0.35, base - bh, w + 0.7, 0.8, roof)];
    if (lot.rr < 0.5) {
      const rw = Math.min(w * 0.42, 4.5);
      kids.push(rect(x + w / 2 - rw * 0.75, base - bh - 2.4, rw * 1.5, 2.4, fill));
      kids.push(path(`M${n(x + w / 2 - rw)} ${n(base - bh - 2.4)}a${n(rw)} ${n(rw * 1.1)} 0 0 1 ${n(2 * rw)} 0z`, roof));
      kids.push(rect(x + w / 2 - 0.25, base - bh - 2.4 - rw * 1.1 - 2, 0.5, 2, fill));
    } else {
      const tw = Math.min(3.6, w * 0.4);
      const th = h - bh;
      kids.push(rect(x + w / 2 - tw / 2, base - h, tw, th, fill));
      kids.push(path(`M${n(x + w / 2 - tw / 2 - 0.3)} ${n(base - h)}L${n(x + w / 2)} ${n(base - h - 4.5)}L${n(x + w / 2 + tw / 2 + 0.3)} ${n(base - h)}z`, roof));
      g.pane(x + w / 2 - 0.5, base - h + 1.5, 1, 1.6, 0.8);
    }
    g.box(x, base - bh + 1, w, bh - 3, 2.4, 3.1, 1.2, 1.6, p, 0.8);
    return G(...kids);
  }
  // tower: art-deco setbacks
  const h1 = h * 0.66;
  const h2 = h * 0.86;
  const kids: ReactNode[] = [
    rect(x, base - h1, w, h1, fill),
    rect(x + w * 0.13, base - h2, w * 0.74, h2 - h1 + 0.2, fill),
    rect(x + w * 0.3, base - h, w * 0.4, h - h2 + 0.2, fill),
  ];
  if (lot.rr > 0.62) kids.push(rect(x + w / 2 - 0.25, base - h - 6, 0.5, 6, fill));
  else if (lot.rr < 0.3) kids.push(path(`M${n(x + w * 0.3)} ${n(base - h)}L${n(x + w / 2)} ${n(base - h - 4)}L${n(x + w * 0.7)} ${n(base - h)}z`, roof));
  g.box(x, base - h1 + 0.6, w, h1 - 2.6, 2.2, 2.9, 1, 1.5, p, 0.8);
  g.box(x + w * 0.13, base - h2 + 0.6, w * 0.74, h2 - h1 - 0.6, 2.2, 2.9, 1, 1.5, p, 0.8);
  return G(...kids);
}

function church(x: number, base: number, tier: number, fill: string, roof: string, g: Glass): ReactNode {
  const tH = [0, 19, 20, 20, 21, 21][tier];
  const sH = [0, 12, 12, 12, 12, 12][tier];
  g.pane(x - 0.5, base - tH + 3, 1, 2.2, 0.9);
  g.grid(x + 3.6, base - 6, 3, 1, 2.6, 0, 1, 2.6, 0.7);
  return G(
    rect(x + 1.5, base - 8, 10, 8, fill),
    path(`M${n(x + 1.2)} ${n(base - 8)}L${n(x + 6.5)} ${n(base - 12)}L${n(x + 11.8)} ${n(base - 8)}z`, roof),
    rect(x - 2.2, base - tH, 4.4, tH, fill),
    path(`M${n(x - 2.6)} ${n(base - tH)}L${n(x)} ${n(base - tH - sH)}L${n(x + 2.6)} ${n(base - tH)}z`, roof),
    stroke(`M${n(x)} ${n(base - tH - sH)}v-2.2M${n(x - 0.8)} ${n(base - tH - sH - 1.4)}h1.6`, roof, 0.4),
    stroke(`M${n(x)} ${n(base - tH - sH)}L${n(x + 2.6)} ${n(base - tH)}`, K.rim, 0.4, { opacity: 0.5 }),
  );
}

function townHall(x: number, base: number, fill: string, roof: string, g: Glass): ReactNode {
  g.grid(x - 6, base - 9, 5, 2, 2.8, 3.6, 1.2, 1.8, 0.6);
  return G(
    rect(x - 7, base - 11, 14, 11, fill),
    rect(x - 7.3, base - 11.6, 14.6, 0.7, roof),
    rect(x - 2, base - 26, 4, 15, fill),
    rect(x - 2.6, base - 26.6, 5.2, 0.7, roof),
    path(`M${n(x - 2)} ${n(base - 26.6)}L${n(x)} ${n(base - 31)}L${n(x + 2)} ${n(base - 26.6)}z`, roof),
    circ(x, base - 22, 1.3, '#e3cf9f', { opacity: 0.9 }),
  );
}

function tree(x: number, base: number, kind: number, s: number): string {
  if (kind < 0.4) return `M${n(x - 1.3 * s)} ${n(base)}a${n(1.3 * s)} ${n(4.6 * s)} 0 0 1 ${n(2.6 * s)} 0z`;
  return `M${n(x - 0.3)} ${n(base)}v-${n(1.6 * s)}a${n(2.6 * s)} ${n(2.3 * s)} 0 1 1 0.6 0v${n(1.6 * s)}z`;
}

// ------------------------------------------------------------------ landmarks for capitals

type LandmarkKind = 'parliament' | 'dome' | 'cathedral';

function landmarkFor(seed: string): LandmarkKind {
  const prefix = seed.split('-')[0];
  const byNation: Record<string, LandmarkKind> = { uk: 'parliament', fr: 'dome', it: 'dome', de: 'cathedral', es: 'cathedral', pl: 'cathedral' };
  if (byNation[prefix]) return byNation[prefix];
  const kinds: LandmarkKind[] = ['parliament', 'dome', 'cathedral'];
  return kinds[hash32(seed) % 3];
}

function paintLandmark(kind: LandmarkKind, x: number, b: number, flag: string, wind: number, g: Glass): ReactNode {
  const k: ReactNode[] = [];
  const fill = K.landmark;
  if (kind === 'parliament') {
    let pin = '';
    for (let px = x - 24; px <= x + 8; px += 3.2) pin += `M${n(px - 0.6)} ${b - 14}l0.6 -2.6l0.6 2.6z`;
    k.push(rect(x - 24, b - 14, 32, 14, fill), path(pin, fill), rimLine(x - 24, x + 8, b - 14));
    g.grid(x - 22.6, b - 12, 10, 2, 3.1, 4.6, 1.2, 2.6, 0.6);
    k.push(rect(x - 28, b - 32, 7, 32, fill));
    for (const px of [x - 28, x - 21]) k.push(path(`M${px - 0.7} ${b - 32}l0.7 -3l0.7 3z`, fill));
    k.push(flagOn(x - 24.5, b - 32, 9, flag, wind, 1));
    g.grid(x - 26.6, b - 28, 2, 4, 2.6, 6, 1.2, 3, 0.6);
    k.push(rect(x + 8, b - 46, 7, 46, fill), rect(x + 7.4, b - 48, 8.2, 2.4, fill));
    k.push(path(`M${x + 7.6} ${b - 48}L${x + 11.5} ${b - 59}L${x + 15.4} ${b - 48}z`, fill));
    for (const px of [x + 7.6, x + 15.4]) k.push(path(`M${px - 0.6} ${b - 48}l0.6 -3l0.6 3z`, fill));
    k.push(stroke(`M${x + 11.5} ${b - 59}v-2.4`, fill, 0.5), stroke(`M${x + 7.6} ${b - 48}L${x + 11.5} ${b - 59}`, K.rim, 0.45, { opacity: 0.6 }));
    k.push(circ(x + 11.5, b - 42, 2.7, '#f0dca8'), stroke(`M${x + 11.5} ${b - 42}v-2M${x + 11.5} ${b - 42}h1.4`, K.ink, 0.5));
    g.grid(x + 9.6, b - 36, 2, 5, 2.6, 6, 1.2, 3, 0.55);
  } else if (kind === 'dome') {
    for (const tx of [x - 16, x + 12]) {
      k.push(rect(tx, b - 27, 4.4, 27, fill), path(`M${tx - 0.3} ${b - 27}C${tx} ${b - 31} ${tx + 4.4} ${b - 31} ${tx + 4.7} ${b - 27}z`, fill));
      k.push(stroke(`M${tx + 2.2} ${b - 30}v-2.4`, fill, 0.5));
    }
    k.push(rect(x - 16, b - 17, 32, 17, fill), rimLine(x - 16, x + 16, b - 17));
    k.push(path(`M${x - 6} ${b - 17}L${x} ${b - 21}L${x + 6} ${b - 17}z`, fill));
    let colsD = '';
    for (let cx = x - 14; cx <= x + 13; cx += 2.6) colsD += `M${n(cx)} ${b - 2}h1v-11h-1z`;
    k.push(path(colsD, K.stoneDark, { opacity: 0.8 }));
    g.grid(x - 13.4, b - 11, 11, 1, 2.6, 0, 1.4, 6, 0.65);
    k.push(rect(x - 7.5, b - 28, 15, 11, fill));
    let drum = '';
    for (let cx = x - 6.6; cx <= x + 6; cx += 2.2) drum += `M${n(cx)} ${b - 18}h0.7v-8.6h-0.7z`;
    k.push(path(drum, K.stoneDark));
    g.grid(x - 5.6, b - 25, 6, 1, 2.2, 0, 1, 4, 0.75);
    k.push(path(`M${x - 8.6} ${b - 28}C${x - 8.6} ${b - 41} ${x + 8.6} ${b - 41} ${x + 8.6} ${b - 28}z`, K.verdigris));
    k.push(stroke(`M${x - 4.6} ${b - 28}C${x - 4.6} ${b - 35} ${x - 1.5} ${b - 37.5} ${x} ${b - 37.6}M${x + 4.6} ${b - 28}C${x + 4.6} ${b - 35} ${x + 1.5} ${b - 37.5} ${x} ${b - 37.6}`, '#3f544b', 0.4));
    k.push(stroke(`M${x - 8.6} ${b - 28}C${x - 8.6} ${b - 41} ${x + 8.6} ${b - 41} ${x + 8.6} ${b - 28}`, K.rim, 0.5, { opacity: 0.6 }));
    k.push(rect(x - 1.4, b - 41.4, 2.8, 3.6, fill), path(`M${x - 1.8} ${b - 41.4}L${x} ${b - 44}L${x + 1.8} ${b - 41.4}z`, fill));
    k.push(stroke(`M${x} ${b - 44}v-3M${x - 1} ${b - 46}h2`, fill, 0.5));
  } else {
    k.push(rect(x - 16, b - 17, 32, 17, fill), path(`M${x - 16} ${b - 17}L${x} ${b - 25}L${x + 16} ${b - 17}z`, fill));
    for (const tx of [x - 12, x + 5]) {
      k.push(rect(tx, b - 40, 7, 40, fill));
      let crockets = '';
      for (let i = 0; i < 5; i++) crockets += `M${n(tx - 0.2 + i * 0.5)} ${n(b - 41.5 - i * 2.6)}h0.9M${n(tx + 6.3 - i * 0.5)} ${n(b - 41.5 - i * 2.6)}h0.9`;
      k.push(path(`M${tx - 0.4} ${b - 40}L${tx + 3.5} ${b - 55}L${tx + 7.4} ${b - 40}z`, fill), stroke(crockets, fill, 0.6));
      k.push(stroke(`M${tx + 3.5} ${b - 55}v-2.4`, fill, 0.5), stroke(`M${tx - 0.4} ${b - 40}L${tx + 3.5} ${b - 55}`, K.rim, 0.45, { opacity: 0.55 }));
      g.grid(tx + 2.4, b - 36, 2, 4, 1.4, 6.5, 0.8, 4, 0.5);
    }
    k.push(rect(x - 5, b - 27, 10, 27, fill), path(`M${x - 5} ${b - 27}L${x} ${b - 33}L${x + 5} ${b - 27}z`, fill));
    k.push(circ(x, b - 20, 3, K.win2, { opacity: 0.85 }), stroke(`M${x - 3} ${b - 20}h6M${x} ${b - 23}v6M${x - 2.1} ${b - 22.1}l4.2 4.2M${x + 2.1} ${b - 22.1}l-4.2 4.2`, fill, 0.45));
    k.push(path(`M${x - 2.4} ${b}V${b - 7}L${x} ${b - 10}L${x + 2.4} ${b - 7}V${b}z`, K.win2, { opacity: 0.7 }));
    g.grid(x - 14, b - 13, 3, 1, 2.4, 0, 1, 5, 0.6);
    g.grid(x + 9, b - 13, 3, 1, 2.4, 0, 1, 5, 0.6);
  }
  k.push(g.flush());
  return G(...k);
}

// ------------------------------------------------------------------ battle

function battleArt(seed: string, x0: number, x1: number, wind: number, fireGlow: string, soft: string): ReactNode {
  const r = rngOf(seed, 'battle');
  const k: ReactNode[] = [];
  const smoke: ReactNode[] = [];
  const cols = 4;
  const glows: ReactNode[] = [];
  for (let i = 0; i < cols; i++) {
    const x = x0 + (x1 - x0) * ((i + 0.2 + r() * 0.6) / cols);
    const base = 100 + r() * 4;
    glows.push(rect(x - 18, base - 12, 36, 20, `url(#${fireGlow})`, { opacity: 0.95 }));
    const steps = 30;
    const top = 6 + r() * 16;
    for (let j = 0; j < steps; j++) {
      const t = j / (steps - 1);
      const px = x + wind * (t * t * 40 + t * 5) + (r() - 0.5) * (2 + t * 9);
      const py = base - 4 - t * (base - 4 - top) + (r() - 0.5) * 2.4;
      const rad = 2 + t * 8.5 + r() * 2.4;
      smoke.push(circ(px, py, rad, mix('#221d1f', '#5e5355', t * 0.85 + r() * 0.15), { opacity: n(0.6 - t * 0.38) }));
    }
    const fh = 5 + r() * 4;
    k.push(path(`M${n(x - 4.5)} ${n(base)}L${n(x - 3.4)} ${n(base - fh * 0.55)}L${n(x - 1.8)} ${n(base - fh * 0.35)}L${n(x - 0.4)} ${n(base - fh)}`
      + `L${n(x + 1.2)} ${n(base - fh * 0.45)}L${n(x + 2.6)} ${n(base - fh * 0.75)}L${n(x + 4.4)} ${n(base)}z`, K.fire, { opacity: 0.95 }));
    k.push(path(`M${n(x - 2.4)} ${n(base)}L${n(x - 1.2)} ${n(base - fh * 0.4)}L${n(x)} ${n(base - fh * 0.62)}L${n(x + 1.2)} ${n(base - fh * 0.3)}L${n(x + 2.4)} ${n(base)}z`, K.fireCore));
    let embers = '';
    for (let e = 0; e < 5; e++) embers += `M${n(x + (r() - 0.5) * 12 + wind * 3)} ${n(base - 6 - r() * 16)}h0.6v0.6h-0.6z`;
    k.push(path(embers, K.fireCore, { opacity: 0.8 }));
  }
  return G(G(...glows), GA({ filter: `url(#${soft})` }, ...smoke), ...k);
}

// ------------------------------------------------------------------ component

const TIER_NAMES = ['', 'Town', 'City', 'Large City', 'Metropolis', 'World City'];

const ALL_BUILDINGS: ArtBuilding[] = [...BACK_ROW, ...FRONT_ROW, 'fortifications', 'railway', 'coastalBattery'];

export function CitySkyline(props: CitySkylineProps): JSX.Element {
  const { seed, capital = false, buildings, construction = null, terrain, coastal = false, nationColor, battle = false, width = 320 } = props;
  const tier = clamp(Math.round(props.tier) || 1, 1, 5) as CitySkylineProps['tier'];
  const uid = `wc${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  // A big city is ~1200 SVG elements, so only rebuild the art when something visible changes (the
  // `buildings` object is often recreated on every game tick with the same contents).
  const signature = [seed, tier, capital, ALL_BUILDINGS.map((b) => buildings[b] ?? 0).join(','), construction, terrain, coastal, nationColor, battle].join('|');
  const art = useMemo(
    () => skylineArt({ seed, tier, capital, buildings, construction, terrain, coastal, nationColor, battle }, uid),
    [signature, uid], // eslint-disable-line react-hooks/exhaustive-deps -- the signature covers every input
  );
  const label = `${capital ? 'Capital, ' : ''}${TIER_NAMES[tier]} skyline`;
  return (
    <svg width={width} height={n((width * VH) / VW)} viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={label} style={{ display: 'block' }}>
      {art}
    </svg>
  );
}

function skylineArt(props: Omit<CitySkylineProps, 'width'>, uid: string): ReactNode {
  const {
    seed, tier, capital = false, buildings, construction = null, terrain,
    coastal = false, nationColor, battle = false,
  } = props;
  const id = (s: string): string => `${uid}-${s}`;

  // ---- layout, all drawn from fixed random streams
  const rl = rngOf(seed, 'layout');
  const seaLeft = rl() < 0.5;
  const seaW = 62 + rl() * 14;
  const sunX = 60 + rl() * 200;
  const wind = (rl() < 0.5 ? -1 : 1) * (0.55 + rl() * 0.45);
  const centerT = 0.4 + rl() * 0.2;
  const stationT = rl();
  const trainDir = rl() < 0.5 ? -1 : 1;
  const sunY = HORIZON - 10;

  const landX0 = coastal && seaLeft ? seaW : 0;
  const landX1 = coastal && !seaLeft ? VW - seaW : VW;
  const seaEdge = seaLeft ? landX0 : landX1;
  const center = landX0 + (landX1 - landX0) * centerT;
  const half = Math.max(center - landX0, landX1 - center);
  const land = (x: number): number => {
    if (!coastal) return 1;
    return seaLeft ? smooth(seaEdge - 6, seaEdge + 26, x) : 1 - smooth(seaEdge - 26, seaEdge + 6, x);
  };

  const base = TIERS[tier];
  const T: TierSpec = terrain === 'urban'
    ? { ...base, reach: base.reach * 1.12, hMax: base.hMax * 1.1, haze: Math.max(base.haze, 0.4), back: true }
    : base;

  const flag = nationColor ? mix(nationColor, '#e9dab9', 0.12) : K.neutralFlag;
  const accent = nationColor ? mix(nationColor, K.ink, 0.52) : K.ink2;
  const lv = (b: ArtBuilding): number => Math.max(0, Math.floor(buildings[b] ?? 0));

  // building slots: interleaved back and front rows, shuffled per seed, independent of what is built
  const rs = rngOf(seed, 'slots');
  const backOrder = shuffle([...BACK_ROW], rs);
  const frontOrder = shuffle([...FRONT_ROW], rs);
  const sx0 = landX0 + 18;
  const sx1 = landX1 - 18;
  const step = (sx1 - sx0) / 15;
  const slot = new Map<ArtBuilding, number>();
  const keepOnLand = (b: ArtBuilding, x: number, s: number): number => {
    const [l, r] = EXTENT[b] ?? [20, 20];
    return clamp(x, landX0 + 1 + l * s, landX1 - 1 - r * s);
  };
  backOrder.forEach((b, i) => slot.set(b, keepOnLand(b, sx0 + (2 * i + 0.5) * step + (rs() - 0.5) * 6, SCALE_BACK)));
  frontOrder.forEach((b, i) => slot.set(b, keepOnLand(b, sx0 + (2 * i + 1.5) * step + (rs() - 0.5) * 6, SCALE_FRONT)));

  const reachPx = T.reach * half;
  const cityL = Math.max(landX0 + 2, center - reachPx);
  const cityR = Math.min(landX1 - 2, center + reachPx);
  const stationX = clamp(center + (stationT - 0.5) * reachPx * 1.2, landX0 + 30, landX1 - 30);
  const quayX = seaEdge;
  const seaDir = seaLeft ? -1 : 1;

  const glowId = id('glow');
  const fireId = id('fire');
  const fadeId = id('fade');
  const softId = id('soft');
  const consClip = id('cc');

  const scaled = (x: number, y: number, s: number, key: string, ...kids: ReactNode[]): ReactNode =>
    createElement('g', { key, transform: `translate(${n(x)} ${n(y)}) scale(${s}) translate(${n(-x)} ${n(-y)})` }, ...kids);

  // ---- special building groups
  const special = (row: ArtBuilding[], s: number): ReactNode[] => {
    const items = row
      .map((b) => ({ b, x: slot.get(b) ?? center, l: lv(b) }))
      .filter((it) => it.l > 0 || construction === it.b)
      .sort((a, c) => a.x - c.x);
    return items.map(({ b, x, l }) => {
      const painter = PAINTERS[b];
      if (!painter) return null;
      const y = BACK_ROW.includes(b) ? BASE_BACK : BASE_FRONT;
      const unbuilt = l === 0;
      const g = new Glass(rngOf(seed, `${b}:win`), unbuilt ? 0 : 0.58,
        b === 'hospital' ? '#4d4952' : b === 'housing' ? '#3e2f2d' : null);
      const d: Draw = {
        cx: x, b: y, lv: Math.min(3, Math.max(1, l)), r: rngOf(seed, `${b}:shape`), g, flag, accent, wind, glow: glowId, fade: fadeId,
      };
      const art = painter(d);
      if (construction !== b) return scaled(x, y, s, b, art);
      const [fw, fh] = FOOT[b];
      const cdir = x > center ? -1 : 1;
      return scaled(x, y, s, b,
        unbuilt ? GA({ clipPath: `url(#${consClip}-${b})`, opacity: 0.92 }, art) : art,
        unbuilt ? <clipPath id={`${consClip}-${b}`}><rect x={n(x - 40)} y={n(y - fh * 0.5)} width={80} height={30} /></clipPath> : null,
        scaffold(x, y, fw * 0.82, unbuilt ? fh * 0.66 : fh * 0.92),
        crane(x - cdir * (fw * 0.5 - 2), y, fh + 24, Math.max(18, fw * 0.8), cdir),
      );
    });
  };

  // ---- capital landmark and the square cleared in front of it
  const landmarkX = center + 4;
  const landmarkS = [1, 1, 1.05, 1.15, 1.3, 1.4][tier];
  const plaza = capital ? 24 * landmarkS : 0;

  // ---- generic city mass
  const backLots = makeLots(seed, 'lots-back', landX0 - 4, landX1 + 4, 6, 12);
  const frontLots = makeLots(seed, 'lots-front', landX0 - 4, landX1 + 4, 5.5, 11);
  const gBack = new Glass(rngOf(seed, 'lots-back:win'), 0.3);
  const gFront = new Glass(rngOf(seed, 'lots-front:win'), 0.38);
  const nearLandmark = (lot: Lot): boolean => plaza > 0 && Math.abs(lot.x + lot.w / 2 - landmarkX) < plaza;
  const backArt: ReactNode[] = [];
  if (T.back) {
    for (const lot of backLots) {
      const h = lotHeight(lot, center, half, { ...T, reach: T.reach * 0.92 });
      if (h === null) continue;
      const hh = nearLandmark(lot) ? Math.min(h * 1.22 + 3, 16) : h * 1.22 + 3;
      backArt.push(drawLot(lot, hh, BASE_GENERIC - 1, K.houseBack, K.houseBackRoof, gBack, 0.3));
    }
  }
  const frontArt: ReactNode[] = [];
  const treePaths: string[] = [];
  const rt = rngOf(seed, 'trees');
  for (const lot of frontLots) {
    const h = lotHeight(lot, center, half, T);
    const tv = rt();
    const tk = rt();
    if (h === null) {
      const dN = Math.abs(lot.x + lot.w / 2 - center) / half;
      if (tier <= 3 && dN < T.reach + 0.22 && tv < 0.7) treePaths.push(tree(lot.x + lot.w / 2, BASE_GENERIC + 0.5, tk, 1 + tv * 0.5));
      continue;
    }
    frontArt.push(drawLot(lot, nearLandmark(lot) ? Math.min(h, 11) : h, BASE_GENERIC, K.house, K.houseRoof, gFront, 0.38, tier <= 2 ? 15.5 : 12.5));
  }
  const rc = rngOf(seed, 'church');
  const churchOff = (rc() - 0.5) * 16;
  const churchX = capital ? landmarkX + (churchOff < 0 ? -1 : 1) * (plaza + 6) : center + churchOff;
  const hallX = center + (rc() < 0.5 ? -1 : 1) * reachPx * (0.35 + rc() * 0.2);
  const gCivic = new Glass(rngOf(seed, 'civic:win'), 0.5);

  // ---- haze skyline for big cities
  const hazeBase = BASE_BACK - 1;
  let hazePath = '';
  if (T.haze > 0) {
    const rh = rngOf(seed, 'haze');
    for (let x = landX0 - 4; x < landX1 + 4;) {
      const w = 4 + rh() * 9;
      const style = rh();
      const hr = rh();
      const dN = Math.abs(x + w / 2 - center) / (half * T.reach * 1.1);
      const f = Math.max(0, 1 - dN);
      if (f > 0.02) {
        const h = (5 + 22 * hr * f + 10 * f) * T.haze;
        const top = hazeBase - h;
        if (style < 0.16 && h > 10) hazePath += `M${n(x)} ${hazeBase}V${n(top + 3)}a${n(w / 2)} ${n(w * 0.55)} 0 0 1 ${n(w)} 0V${hazeBase}z`;
        else if (style < 0.28 && h > 10) hazePath += `M${n(x)} ${hazeBase}V${n(top + 4)}h${n(w * 0.3)}l${n(w * 0.2)} -${n(8 + hr * 4)}l${n(w * 0.2)} ${n(8 + hr * 4)}H${n(x + w)}V${hazeBase}z`;
        else if (style < 0.45 && h > 16) hazePath += `M${n(x)} ${hazeBase}V${n(top + h * 0.3)}H${n(x + w * 0.2)}V${n(top)}H${n(x + w * 0.8)}V${n(top + h * 0.3)}H${n(x + w)}V${hazeBase}z`;
        else hazePath += `M${n(x)} ${hazeBase}V${n(top)}H${n(x + w)}V${hazeBase}z`;
        if (style > 0.94) hazePath += `M${n(x + w / 2 - 0.3)} ${n(top)}v-5h0.6v5z`;
      }
      x += w + (rh() < 0.3 ? rh() * 3 : 0);
    }
  }

  // ---- sky details
  const rk = rngOf(seed, 'sky');
  let stars = '';
  for (let i = 0; i < 16; i++) stars += `M${n(rk() * VW)} ${n(rk() * 30)}h0.6v0.6h-0.6z`;
  const clouds: ReactNode[] = [];
  for (let i = 0; i < 3; i++) {
    const cx = rk() * VW;
    const cy = 22 + rk() * 34;
    const rx = 18 + rk() * 30;
    clouds.push(<ellipse key={`c${i}`} cx={n(cx)} cy={n(cy)} rx={n(rx)} ry={n(1.4 + rk() * 1.4)} fill="#e0a27a" opacity={0.2} />);
    clouds.push(<ellipse key={`d${i}`} cx={n(cx + 4)} cy={n(cy - 1.2)} rx={n(rx * 0.8)} ry={1.2} fill="#3c3445" opacity={0.35} />);
  }

  // ---- street lamps
  let lampPosts = '';
  let lampLights = '';
  for (let x = cityL + 3; x < cityR - 2; x += 8.5) {
    lampPosts += `M${n(x)} ${BASE_FRONT + 2.4}V${BASE_FRONT - 0.6}`;
    lampLights += `M${n(x - 0.5)} ${BASE_FRONT - 1.4}h1v0.9h-1z`;
  }

  // ---- construction of foreground structures
  const consFg = (b: ArtBuilding, x: number, y: number): ReactNode => {
    const [fw, fh] = FOOT[b];
    const cdir = x > center ? -1 : 1;
    return scaled(x, y, SCALE_FG, `fg-${b}`, scaffold(x, y, fw * 0.8, fh * 0.8), crane(x - cdir * (fw * 0.5 - 2), y, fh + 22, Math.max(16, fw * 0.8), cdir));
  };

  const railLv = lv('railway');
  const fortLv = lv('fortifications');
  const batteryLv = coastal ? lv('coastalBattery') : 0;
  const fgX0 = coastal && seaLeft ? landX0 : 0;
  const fgX1 = coastal && !seaLeft ? landX1 : VW;
  const fortX = clamp(center + (stationT < 0.5 ? 1 : -1) * reachPx * 0.6, landX0 + 20, landX1 - 20);

  const shipGlass = new Glass(rngOf(seed, 'ship:win'), 0.6);
  const rShip = rngOf(seed, 'ship');
  const shipLen = 32.5;
  const shipX = seaLeft ? seaEdge - 5 - rShip() * 6 : seaEdge + 5 + rShip() * 6;
  const lighthouse = rShip() < 0.7;
  const lhX = seaLeft ? 8 + rShip() * 6 : VW - 8 - rShip() * 6;
  const lighthouseOk = Math.abs(lhX - shipX) > shipLen + 6;
  const quayLeft = seaLeft ? quayX - 2 : quayX;

  // patchwork fields and hedgerows give an otherwise empty foreground some texture
  const rf = rngOf(seed, 'fg');
  let fields = '';
  let hedges = '';
  for (const [y0, s] of [[109.4, 0.8], [115.4, 1.15]] as const) {
    let x = fgX0 - rf() * 24;
    while (x < fgX1) {
      const w = 22 + rf() * 42;
      const tone = rf();
      const hedge = rf();
      if (tone < 0.45) fields += `M${n(x)} ${y0}h${n(w)}v0.5h${n(-w)}z`;
      if (hedge < 0.5) {
        const hw = w * (0.45 + hedge * 0.8);
        const bw = 2.6 * s;
        hedges += `M${n(x)} ${n(y0 + 0.8)}`;
        for (let hx = 0; hx < hw - bw; hx += bw) hedges += `a${n(bw / 2)} ${n((1.1 + ((hx * 7) % 3) * 0.35) * s)} 0 0 1 ${n(bw)} 0`;
        hedges += `V${n(y0 + 1.4)}H${n(x)}z`;
        if (hedge < 0.22) hedges += `M${n(x + hw - 2)} ${n(y0 + 0.8)}v-${n(2 * s)}a${n(3 * s)} ${n(2.8 * s)} 0 1 1 ${n(0.9 * s)} 0v${n(2 * s)}z`;
      }
      x += w;
    }
  }

  return (
    <>
      <defs>
        <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2={HORIZON + 4} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1d232d" />
          <stop offset="0.28" stopColor="#2e2d3b" />
          <stop offset="0.52" stopColor="#56414c" />
          <stop offset="0.72" stopColor="#925f58" />
          <stop offset="0.87" stopColor="#c68a5d" />
          <stop offset="1" stopColor="#d9a76c" />
        </linearGradient>
        <radialGradient id={id('sun')} cx={n(sunX)} cy={sunY} r="80" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd99a" stopOpacity="0.55" />
          <stop offset="0.35" stopColor="#f0a868" stopOpacity="0.18" />
          <stop offset="1" stopColor="#f0a868" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={glowId}>
          <stop offset="0" stopColor="#ffb760" stopOpacity="0.7" />
          <stop offset="1" stopColor="#ff8a3a" stopOpacity="0" />
        </radialGradient>
        {battle && (
          <filter id={softId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.1" />
          </filter>
        )}
        <linearGradient id={fadeId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f8e6b8" stopOpacity="0.32" />
          <stop offset="1" stopColor="#f8e6b8" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={fireId}>
          <stop offset="0" stopColor="#ffb257" stopOpacity="0.75" />
          <stop offset="0.5" stopColor="#ff6f2a" stopOpacity="0.25" />
          <stop offset="1" stopColor="#ff6f2a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('city')} cx={n(center)} cy={BASE_BACK} r={n(Math.max(40, reachPx))} gradientUnits="userSpaceOnUse"
          gradientTransform={`translate(0 ${BASE_BACK}) scale(1 0.45) translate(0 ${-BASE_BACK})`}>
          <stop offset="0" stopColor="#ffb86a" stopOpacity={n(0.08 * tier)} />
          <stop offset="1" stopColor="#ffb86a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('ground')} x1="0" y1={BASE_BACK} x2="0" y2={VH} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2a2327" />
          <stop offset="0.35" stopColor="#221c20" />
          <stop offset="1" stopColor="#161216" />
        </linearGradient>
        <linearGradient id={id('sea')} x1="0" y1={HORIZON} x2="0" y2={VH} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a47a64" />
          <stop offset="0.22" stopColor="#5f4d57" />
          <stop offset="1" stopColor="#272a33" />
        </linearGradient>
        {terrain === 'marsh' && (
          <linearGradient id={id('mist')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e2c3a8" stopOpacity="0" />
            <stop offset="0.6" stopColor="#e2c3a8" stopOpacity="0.22" />
            <stop offset="1" stopColor="#e2c3a8" stopOpacity="0.05" />
          </linearGradient>
        )}
        <linearGradient id={id('war')} x1="0" y1="0" x2="0" y2={HORIZON + 4} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3a0f08" stopOpacity="0.15" />
          <stop offset="1" stopColor="#c2401c" stopOpacity="0.38" />
        </linearGradient>
      </defs>

      {/* sky */}
      <rect width={VW} height={VH} fill={`url(#${id('sky')})`} />
      {!battle && <path d={stars} fill="#f3e6c8" opacity={0.45} />}
      {clouds}
      <rect width={VW} height={VH} fill={`url(#${id('sun')})`} />
      <circle cx={n(sunX)} cy={sunY} r={6.5} fill="#f7dca4" opacity={0.92} />
      {battle && <rect width={VW} height={VH} fill={`url(#${id('war')})`} />}

      {/* background terrain */}
      <g transform={`translate(0 ${TERRAIN_DY})`}>{terrainArt(seed, terrain, land)}</g>

      {/* sea and its glints */}
      {coastal && (
        <g>
          <rect x={seaLeft ? 0 : n(seaEdge)} y={HORIZON} width={n(seaLeft ? seaEdge : VW - seaEdge)} height={VH - HORIZON} fill={`url(#${id('sea')})`} />
          <path d={(() => {
            const rg = rngOf(seed, 'glints');
            let d = '';
            for (let i = 0; i < 22; i++) {
              const x = seaLeft ? rg() * (seaEdge - 6) : seaEdge + 6 + rg() * (VW - seaEdge - 6);
              const y = HORIZON + 1 + Math.pow(rg(), 1.6) * 21;
              d += `M${n(x)} ${n(y)}h${n(1.5 + rg() * 4)}v0.4h-${n(1.5 + rg() * 2)}z`;
            }
            return d;
          })()} fill="#f2c27f" opacity={0.4} />
        </g>
      )}

      <rect width={VW} height={VH} fill={`url(#${id('city')})`} />
      {hazePath && <path d={hazePath} fill={K.haze} opacity={0.75} />}
      {terrain === 'marsh' && <rect y={HORIZON - 10} width={VW} height={14} fill={`url(#${id('mist')})`} />}

      {/* ground */}
      <rect x={n(landX0)} y={BASE_BACK - 0.5} width={n(landX1 - landX0)} height={VH - BASE_BACK + 0.5} fill={`url(#${id('ground')})`} />
      {terrain === 'marsh' ? marshPools(seed, fgX0, fgX1) : (
        <>
          <path d={fields} fill={K.rim} opacity={0.12} />
          <path d={hedges} fill="#181418" />
        </>
      )}
      <rect x={n(landX0)} y={VH - 7} width={n(landX1 - landX0)} height={7} fill="#120f12" opacity={0.35} />

      {/* generic city */}
      {createElement('g', null, ...backArt)}
      {gBack.flush()}
      {treePaths.length > 0 && <path d={treePaths.join('')} fill={K.tree} />}
      {createElement('g', null, ...frontArt)}
      {gFront.flush()}
      {church(churchX, BASE_GENERIC, tier, K.house, K.houseRoof, gCivic)}
      {tier >= 3 && townHall(hallX, BASE_GENERIC, K.house, K.houseRoof, gCivic)}
      {gCivic.flush()}

      {/* special buildings, back row, then the capital's landmark, then the front row */}
      {special(BACK_ROW, SCALE_BACK)}
      {capital && scaled(landmarkX, BASE_GENERIC, landmarkS, 'landmark',
        paintLandmark(landmarkFor(seed), landmarkX, BASE_GENERIC, flag, wind, new Glass(rngOf(seed, 'landmark:win'), 0.6)))}
      <rect x={n(landX0)} y={BASE_FRONT - 1.4} width={n(landX1 - landX0)} height={1.4} fill={K.ground} opacity={0.55} />
      {special(FRONT_ROW, SCALE_FRONT)}

      {/* street and lamps */}
      <rect x={n(landX0)} y={BASE_FRONT} width={n(landX1 - landX0)} height={2.4} fill={K.road} />
      <rect x={n(landX0)} y={BASE_FRONT} width={n(landX1 - landX0)} height={0.4} fill={K.rim} opacity={0.18} />
      <path d={lampPosts} stroke={K.ink} strokeWidth={0.4} />
      <path d={lampLights} fill={K.win} opacity={0.95} />

      {/* harbour */}
      {coastal && (
        <g>
          {lighthouse && lighthouseOk && (
            <g>
              <path d={`M${n(lhX - 2.2)} ${HORIZON + 6}L${n(lhX - 1.3)} ${HORIZON - 8}H${n(lhX + 1.3)}L${n(lhX + 2.2)} ${HORIZON + 6}z`} fill="#8d7f75" />
              <rect x={n(lhX - 1.6)} y={HORIZON - 10.4} width={3.2} height={2.4} fill={K.ink} />
              <circle cx={n(lhX)} cy={HORIZON - 9.2} r={1} fill="#ffe2a2" />
              <circle cx={n(lhX)} cy={HORIZON - 9.2} r={5} fill={`url(#${glowId})`} />
              <rect x={n(lhX - 5)} y={HORIZON + 6} width={10} height={2} fill={K.ink2} />
            </g>
          )}
          {paintShip(shipX, BASE_FRONT + 1.5, seaLeft ? -1 : 1, accent === K.ink2 ? K.ink3 : mix(flag, K.ink, 0.25), shipGlass)}
          <rect x={n(quayLeft)} y={BASE_BACK - 0.5} width={2} height={VH - BASE_BACK + 0.5} fill="#3e3438" />
          <rect x={n(quayLeft)} y={BASE_BACK - 0.5} width={2} height={0.6} fill={K.rim} opacity={0.5} />
          <path d={(() => {
            let d = '';
            for (let y = BASE_BACK + 2; y < VH; y += 3) d += `M${n(quayLeft)} ${y}h2`;
            return d;
          })()} stroke={K.ink} strokeWidth={0.3} />
          {batteryLv > 0 && paintBattery(Math.min(3, batteryLv), quayX, seaDir, fadeId)}
          {construction === 'coastalBattery' && consFg('coastalBattery', quayX - seaDir * 10, BASE_FRONT)}
        </g>
      )}

      {/* foreground: railway then fortifications */}
      {(railLv > 0 || construction === 'railway')
        && paintRailway(Math.min(3, Math.max(1, railLv)), fgX0, fgX1, stationX, trainDir, accent, seed, railLv === 0)}
      {construction === 'railway' && consFg('railway', stationX, RAIL_Y - 1)}
      {terrain === 'marsh' && marshReeds(seed, fgX0, fgX1)}
      {fortLv > 0 && paintForts(Math.min(3, fortLv), fgX0, fgX1, seed)}
      {construction === 'fortifications' && (
        <g>
          {fortLv === 0 && <path d={`M${n(fortX - 15)} ${VH}L${n(fortX - 13.6)} 115H${n(fortX + 13.6)}L${n(fortX + 15)} ${VH}z`} fill={K.concrete} />}
          {consFg('fortifications', fortX, 117)}
        </g>
      )}

      {battle && battleArt(seed, cityL, cityR, wind, fireId, softId)}
    </>
  );
}
