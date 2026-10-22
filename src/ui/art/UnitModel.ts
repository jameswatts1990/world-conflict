// Low-poly 3D models of the armies for the strategy map: every unit type in each
// of its equipment generations, in its nation's uniforms, paint and colours,
// turned to face one of sixteen headings so a marching army faces its road.
// Built with the renderer of the city models (iso3d.ts), so cities and armies
// share one light and one camera. Soldiers wear the headgear of the 2D art
// (context.ts): Brodie, Adrian, Pickelhaube, Stahlhelm, Alpini hat and so on.
//
// A model's local axes: u forward, v across, z up, origin on the ground under
// its middle. Sizes are toy-like: a soldier stands about as tall as a lorry is long.
import { makeKit, type Headgear, type Kit } from './context';
import { Scene, mixColor, shadeColor, type V2, type V3 } from './iso3d';
import { BLADE, BRASS, FLAME, FLAME_CORE, HORSE_COATS, LEATHER, NATION_PALETTES, PENNANTS, SKIN, STEEL, TRACK, TRACK_LIGHT, TYRE, WOOD, type NationPalette } from './palettes';
import { resolveArtGen, type ArtGen, type ArtNation, type ArtUnitType } from './types';

/** Directions a model can face: sixteenths of a turn. */
export const UNIT_HEADINGS = 16;
const STEP = (Math.PI * 2) / UNIT_HEADINGS;

/** A unit type, or the troopship an army crosses the sea in. */
export type UnitModelKind = ArtUnitType | 'transport';

export interface UnitModelProps {
  type: UnitModelKind;
  gen: ArtGen;
  nation: ArtNation;
  /** 0..15: heading 0 faces the screen's lower right, and each step turns a sixteenth clockwise on screen. */
  heading: number;
}

export interface UnitModel {
  /** Standalone SVG document. */
  svg: string;
  /** Size of the drawing in model units. */
  width: number;
  height: number;
  /** Where the model's ground origin sits in the drawing. */
  cx: number;
  cy: number;
}

/** Heading whose model faces along a direction on screen (x right, y down). */
export function headingFor(dx: number, dy: number): number {
  // Undo the projection, screen (x - y, (x + y) / 2), to get the direction on the ground.
  const gx = dy + dx / 2;
  const gy = dy - dx / 2;
  if (gx === 0 && gy === 0) return 0;
  const h = Math.round(Math.atan2(gy, gx) / STEP);
  return ((h % UNIT_HEADINGS) + UNIT_HEADINGS) % UNIT_HEADINGS;
}

/** Direction on screen (x right, y down, not normalised) that a heading faces. */
export function headingVector(heading: number): V2 {
  const a = heading * STEP;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return [c - s, (c + s) / 2];
}

// ------------------------------------------------------------------ rig

const SHADOW = '#1d2117';
const CANVAS = '#8f8a62';
const GLASS = '#9cb7c0';
const DARK = '#2b2b2e';
const POLE = '#3b2f25';

/**
 * Modelling helper: a frame placed on the ground at some point, turned to some
 * heading and scaled. Every part is given in the frame's u, v, z and drawn
 * into the scene turned with it.
 */
class Rig {
  private readonly c: number;
  private readonly s: number;

  constructor(
    readonly scene: Scene,
    private readonly ox: number,
    private readonly oy: number,
    private readonly oz: number,
    private readonly angle: number,
    private readonly k = 1,
  ) {
    this.c = Math.cos(angle);
    this.s = Math.sin(angle);
  }

  /** A frame moved to (u, v, z) of this one, turned by `turn` radians and scaled by `scale`. */
  at(u: number, v: number, z = 0, turn = 0, scale = 1): Rig {
    const [x, y] = this.xy(u, v);
    return new Rig(this.scene, x, y, this.oz + z * this.k, this.angle + turn, this.k * scale);
  }

  private xy(u: number, v: number): V2 {
    return [this.ox + (u * this.c - v * this.s) * this.k, this.oy + (u * this.s + v * this.c) * this.k];
  }

  private p = ([u, v, z]: V3): V3 => [...this.xy(u, v), this.oz + z * this.k];

  private zz(z: number): number {
    return this.oz + z * this.k;
  }

  /** Vertical extrusion of a convex footprint. */
  prism(foot: V2[], z0: number, z1: number, color: string, top: string | null = color): void {
    this.scene.prism(foot.map(([u, v]) => this.xy(u, v)), this.zz(z0), this.zz(z1), color, top);
  }

  box(u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, color: string, top: string | null = color): void {
    this.prism([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], z0, z1, color, top);
  }

  /** A box whose top rectangle differs from its bottom one: sloped armour, tapering bodies. */
  hull(lo: [number, number, number, number], hi: [number, number, number, number], z0: number, z1: number, color: string, top = color): void {
    const ring = (r: number[], z: number): V3[] => [[r[0], r[1], z], [r[2], r[1], z], [r[2], r[3], z], [r[0], r[3], z]];
    const a = ring(lo, z0).map(this.p);
    const b = ring(hi, z1).map(this.p);
    const faces = [{ pts: a, color }, { pts: b, color: top }];
    for (let i = 0; i < 4; i++) faces.push({ pts: [a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]], color });
    this.scene.solid(faces);
  }

  /** A convex side profile (u, z) extruded across from v0 to v1: track frames, gun trails. */
  extrude(profile: V2[], v0: number, v1: number, color: string, side = color): void {
    const a = profile.map(([u, z]) => this.p([u, v0, z]));
    const b = profile.map(([u, z]) => this.p([u, v1, z]));
    const faces = [{ pts: a, color: side }, { pts: b, color: side }];
    for (let i = 0; i < a.length; i++) faces.push({ pts: [a[i], a[(i + 1) % a.length], b[(i + 1) % a.length], b[i]], color });
    this.scene.solid(faces);
  }

  /** A cylinder from a to b, at any angle: wheels, barrels, bedrolls. */
  cyl(a: V3, b: V3, r: number, sides: number, color: string, cap = color): void {
    const A = this.p(a);
    const B = this.p(b);
    const ax = unit([B[0] - A[0], B[1] - A[1], B[2] - A[2]]);
    const e1 = unit(cross(ax, Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
    const e2 = cross(ax, e1);
    const R = r * this.k;
    const ring = (P: V3): V3[] =>
      Array.from({ length: sides }, (_, i) => {
        const t = ((i + 0.5) / sides) * Math.PI * 2;
        const [cs, sn] = [Math.cos(t) * R, Math.sin(t) * R];
        return [P[0] + e1[0] * cs + e2[0] * sn, P[1] + e1[1] * cs + e2[1] * sn, P[2] + e1[2] * cs + e2[2] * sn];
      });
    const ra = ring(A);
    const rb = ring(B);
    const faces = [{ pts: ra, color: cap }, { pts: rb, color: cap }];
    for (let i = 0; i < sides; i++) faces.push({ pts: [ra[i], ra[(i + 1) % sides], rb[(i + 1) % sides], rb[i]], color });
    this.scene.solid(faces);
  }

  /** Upright cylinder or frustum (r1 = 0 for a cone). */
  vcyl(u: number, v: number, z0: number, z1: number, r0: number, r1: number, sides: number, color: string, top: string | null = color): void {
    const [x, y] = this.xy(u, v);
    this.scene.frustum(x, y, this.zz(z0), this.zz(z1), r0 * this.k, r1 * this.k, sides, color, top, this.angle);
  }

  dome(u: number, v: number, z0: number, r: number, h: number, color: string): void {
    const [x, y] = this.xy(u, v);
    this.scene.dome(x, y, this.zz(z0), r * this.k, h * this.k, color, 8);
  }

  /** Pitched roof with its ridge along u (lorry tilts). */
  roof(u0: number, v0: number, u1: number, v1: number, z: number, h: number, color: string): void {
    const vm = (v0 + v1) / 2;
    const P = (u: number, v: number, zz: number) => this.p([u, v, zz]);
    this.scene.solid([
      { pts: [P(u0, v0, z), P(u1, v0, z), P(u1, vm, z + h), P(u0, vm, z + h)], color },
      { pts: [P(u0, v1, z), P(u1, v1, z), P(u1, vm, z + h), P(u0, vm, z + h)], color },
      { pts: [P(u0, v0, z), P(u0, v1, z), P(u0, vm, z + h)], color },
      { pts: [P(u1, v0, z), P(u1, v1, z), P(u1, vm, z + h)], color },
      { pts: [P(u0, v0, z), P(u1, v0, z), P(u1, v1, z), P(u0, v1, z)], color },
    ]);
  }

  line(pts: V3[], color: string, width: number): void {
    this.scene.line(pts.map(this.p), color, width * this.k);
  }

  /** A flat panel: flags, windscreens, markings. Unlit unless `lit`. */
  panel(pts: V3[], color: string, lit = false): void {
    this.scene.panel(pts.map(this.p), color, { unlit: !lit });
  }

  puff(u: number, v: number, z: number, r: number, color: string, opacity: number): void {
    this.scene.puff(this.p([u, v, z]), r * this.k, color, opacity);
  }

  /** Flat shape on the ground (in this frame). */
  decal(foot: V2[], color: string, opacity?: number): void {
    this.scene.decal(foot.map(([u, v]) => this.xy(u, v)), color, 0, opacity);
  }

  /** Soft shadow on the ground, an ellipse cast away from the light (the screen's right). */
  shadow(ru: number, rv: number, du = 0, dv = 0): void {
    const pts: V2[] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const [x, y] = this.xy(du + Math.cos(a) * ru, dv + Math.sin(a) * rv);
      pts.push([x + 0.16 * this.k, y - 0.16 * this.k]);
    }
    this.scene.decal(pts, SHADOW, 0, 0.3);
  }
}

function unit(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

// ------------------------------------------------------------------ colours

interface Gear {
  nation: ArtNation;
  gen: ArtGen;
  pal: NationPalette;
  /** How the soldiers are dressed (the 2D art's rules). */
  kit: Kit;
  /** Vehicle and gun paint. */
  paint: string;
  paintDark: string;
  /** Packs and webbing. */
  webbing: string;
}

function gearOf(nation: ArtNation, gen: ArtGen): Gear {
  const pal = NATION_PALETTES[nation][gen];
  return {
    nation,
    gen,
    pal,
    kit: makeKit(nation, gen),
    paint: pal.vehicle,
    paintDark: pal.vehicleDark,
    webbing: gen === 'ww1' ? LEATHER : mixColor(pal.uniformDark, '#5e5a44', 0.5),
  };
}

const kitWith = (g: Gear, headgear: Headgear): Kit => ({ ...makeKit(g.nation, g.gen, headgear), jackboots: g.kit.jackboots });

/** Flags as cells of a 0..1 grid (x from the pole outwards, y from the top), in the colours of flags.tsx. */
type FlagCell = [number, number, number, number, string];

function stripes(dir: 'v' | 'h', colors: string[], weights = colors.map(() => 1)): FlagCell[] {
  const total = weights.reduce((a, b) => a + b, 0);
  let at = 0;
  return colors.map((c, i) => {
    const a = at / total;
    at += weights[i];
    const b = at / total;
    return dir === 'v' ? [a, b, 0, 1, c] : [0, 1, a, b, c];
  });
}

/** The Union Flag's crosses, without the saltires (too fine at this size). */
function unionCells(): FlagCell[] {
  const xs = [0, 0.36, 0.43, 0.57, 0.64, 1];
  const ys = [0, 0.34, 0.42, 0.58, 0.66, 1];
  const out: FlagCell[] = [];
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++) {
      const c = i === 2 || j === 2 ? '#c8102e' : i === 1 || i === 3 || j === 1 || j === 3 ? '#f4f4f4' : '#1f3a8a';
      out.push([xs[i], xs[i + 1], ys[j], ys[j + 1], c]);
    }
  return out;
}

const FLAG_CELLS: Record<ArtNation, FlagCell[]> = {
  uk: unionCells(),
  fr: stripes('v', ['#1f4fa0', '#f4f4f4', '#e0383e']),
  de: stripes('h', ['#121212', '#d40000', '#ffcc00']),
  it: stripes('v', ['#0c8a46', '#f4f4f4', '#cd2b37']),
  es: stripes('h', ['#b3171d', '#f6c100', '#b3171d'], [1, 2, 1]),
  pl: stripes('h', ['#f4f4f4', '#dc143c']),
  neutral: stripes('h', ['#e2dbc6', '#b9ad8e']),
};

/** A national flag flying back from a pole top at (u, v, top), with a little wave. */
function flag(r: Rig, nation: ArtNation, u: number, v: number, top: number, w: number, h: number): void {
  const wave = (x: number) => Math.sin(x * Math.PI * 1.7) * 0.07 * w;
  for (const [x0, x1, y0, y1, color] of FLAG_CELLS[nation]) {
    const p = (x: number, y: number): V3 => [u - x * w, v + wave(x), top - y * h - x * 0.08 * h];
    r.panel([p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)], color);
  }
}

/** Radio aerial with a small national flag: how vehicles show whose they are. */
function aerial(r: Rig, g: Gear, u: number, v: number, z: number, h = 0.95): void {
  r.line([[u, v, z], [u, v, z + h]], DARK, 0.04);
  flag(r, g.nation, u - 0.02, v, z + h, 0.52, 0.34);
}

// ------------------------------------------------------------------ figures

interface Figure {
  kit?: Kit;
  /** What the hands hold. */
  arm?: 'rifle' | 'aim' | 'flamer' | 'flag' | 'sabre' | 'lance' | 'staff' | 'none';
  /** What is carried on the back. */
  back?: 'pack' | 'rucksack' | 'tanks' | 'none';
  pose?: 'stand' | 'kneel' | 'ride';
  /** Half the distance between the feet, forward and back. */
  stride?: number;
  /** Leaning into a run. */
  lean?: number;
}

/** Headgear on top of the head; z 0 is the crown of the head. */
function headgear(r: Rig, kit: Kit): void {
  const c = kit.hat;
  const visor = () => r.box(0.13, -0.1, 0.25, 0.1, 0, 0.03, '#1d1f24');
  switch (kit.headgear) {
    case 'brodie':
      r.vcyl(0, 0, 0, 0.03, 0.3, 0.3, 10, c);
      r.dome(0, 0, 0.03, 0.16, 0.13, c);
      break;
    case 'adrian':
      r.vcyl(0, 0, 0, 0.03, 0.21, 0.21, 10, c);
      r.dome(0, 0, 0.03, 0.16, 0.15, c);
      r.line([[-0.13, 0, 0.16], [0.13, 0, 0.16]], shadeColor(c, 0.75), 0.06);
      break;
    case 'pickelhaube':
      r.dome(0, 0, 0, 0.16, 0.19, c);
      visor();
      r.vcyl(0, 0, 0.18, 0.4, 0.045, 0, 6, BRASS);
      break;
    case 'stahlhelm16':
    case 'stahlhelm35':
      r.vcyl(0, 0, 0, 0.08, 0.22, 0.18, 10, c);
      r.dome(0, 0, 0.08, 0.18, 0.14, c);
      break;
    case 'kepi':
      r.vcyl(0, 0, 0, 0.21, 0.14, 0.16, 8, c);
      visor();
      break;
    case 'maciejowka':
    case 'czapka':
      r.vcyl(0, 0, 0, 0.1, 0.14, 0.14, 8, c);
      r.at(0, 0, 0, Math.PI / 4).box(-0.16, -0.16, 0.16, 0.16, 0.1, 0.17, c);
      visor();
      break;
    case 'alpini':
      r.vcyl(0, 0, 0, 0.03, 0.26, 0.26, 10, c);
      r.vcyl(0, 0, 0.03, 0.19, 0.15, 0.12, 8, c);
      r.line([[-0.03, -0.13, 0.08], [-0.3, -0.18, 0.4]], '#1d1f24', 0.05);
      break;
    case 'beret':
      r.vcyl(0.03, 0, 0, 0.07, 0.19, 0.17, 10, c);
      break;
    case 'bergmutze':
      r.vcyl(0, 0, 0, 0.14, 0.14, 0.15, 8, c);
      r.box(0.13, -0.1, 0.25, 0.1, 0, 0.03, c);
      break;
    case 'fez':
      r.vcyl(0, 0, 0, 0.2, 0.14, 0.11, 8, c);
      break;
    case 'cuirassier':
      r.dome(0, 0, 0, 0.17, 0.2, c);
      r.line([[0.08, 0, 0.21], [-0.12, 0, 0.24], [-0.34, 0, -0.08]], '#1d1f24', 0.06);
      break;
    default:
      // The round steel helmets of the 1930s (M33, M26, wz. 31, Trubia).
      r.vcyl(0, 0, 0, 0.07, 0.2, 0.18, 10, c);
      r.dome(0, 0, 0.07, 0.18, 0.14, c);
  }
}

/** One soldier, standing on the frame's origin and facing its u axis. */
function soldier(r: Rig, g: Gear, f: Figure = {}): void {
  const kit = f.kit ?? g.kit;
  const pose = f.pose ?? 'stand';
  const lean = f.lean ?? 0;
  const coat = kit.uniform;
  const legs = kit.uniformDark;
  const boots = kit.boots;
  let hip = 0.78;
  if (pose === 'ride') {
    // Seated in the saddle: legs down the horse's flanks.
    hip = 0;
    for (const s of [-1, 1]) {
      r.box(-0.1, s * 0.21, 0.14, s * 0.31, -0.4, 0.05, legs);
      r.box(-0.1, s * 0.21, 0.18, s * 0.32, -0.6, -0.4, boots);
    }
  } else if (pose === 'kneel') {
    // Right knee down, left foot planted in front.
    hip = 0.46;
    r.box(-0.48, 0.04, -0.06, 0.21, 0, 0.15, legs);
    r.box(-0.12, 0.04, 0.06, 0.21, 0.15, hip, legs);
    r.box(0.16, -0.21, 0.42, -0.04, 0, 0.13, boots);
    r.box(0.18, -0.2, 0.34, -0.05, 0.13, 0.32, legs);
    r.box(-0.06, -0.2, 0.34, -0.05, 0.32, hip, legs);
  } else {
    const st = f.stride ?? 0.13;
    for (const [d, v0, v1] of [[st, 0.04, 0.21], [-st, -0.21, -0.04]]) {
      const bootTop = kit.jackboots ? 0.42 : 0.15;
      r.box(d - 0.1, v0, d + 0.15, v1, 0, 0.14, boots);
      r.box(d - 0.09, v0 + 0.01, d + 0.09, v1 - 0.01, 0.14, bootTop, kit.jackboots ? boots : legs);
      r.box(d - 0.09, v0 + 0.01, d + 0.09, v1 - 0.01, bootTop, hip, legs);
    }
  }
  const t0 = hip;
  const t1 = hip + 0.64;
  // Belt, then the tunic, broader at the shoulders and leaning with the stride.
  r.box(-0.15, -0.23, 0.15, 0.23, t0, t0 + 0.09, LEATHER);
  r.hull([-0.15, -0.23, 0.15, 0.23], [-0.16 + lean, -0.27, 0.14 + lean, 0.27], t0 + 0.09, t1, coat);
  const arm = f.arm ?? 'rifle';
  const forward = arm === 'aim' || arm === 'flamer';
  if (forward) {
    for (const s of [-1, 1]) r.box(lean - 0.04, s * 0.22, lean + 0.36, s * 0.33, t1 - 0.25, t1 - 0.1, coat);
  } else {
    for (const s of [-1, 1]) r.hull([-0.06, s * 0.27, 0.08, s * 0.37], [-0.07 + lean, s * 0.27, 0.09 + lean, s * 0.37], t0 + 0.12, t1 - 0.02, coat);
  }
  // Head and headgear.
  r.vcyl(lean, 0, t1, t1 + 0.2, 0.125, 0.12, 6, SKIN);
  headgear(r.at(lean, 0, t1 + 0.2), kit);
  // On the back.
  const back = f.back ?? 'pack';
  const behind = -0.165 + Math.min(0, lean);
  if (back === 'pack') r.box(behind - 0.15, -0.18, behind, 0.18, t0 + 0.18, t1 - 0.06, g.webbing);
  if (back === 'rucksack') {
    r.box(behind - 0.24, -0.21, behind, 0.21, t0 + 0.04, t1 + 0.04, g.webbing);
    r.cyl([behind - 0.12, -0.25, t1 + 0.12], [behind - 0.12, 0.25, t1 + 0.12], 0.08, 6, shadeColor(g.webbing, 0.8));
  }
  if (back === 'tanks') for (const v of [-0.1, 0.1]) r.vcyl(behind - 0.1, v, t0 + 0.1, t1 + 0.04, 0.09, 0.09, 8, STEEL);
  // In the hands.
  const z = t0 + 0.12;
  switch (arm) {
    case 'rifle': {
      // At the slope over the right shoulder, bayonet fixed.
      r.line([[0.17, -0.33, z], [-0.13 + lean, -0.33, t1 + 0.45]], WOOD, 0.075);
      r.line([[-0.13 + lean, -0.33, t1 + 0.45], [-0.19 + lean, -0.33, t1 + 0.72]], BLADE, 0.04);
      break;
    }
    case 'aim':
      r.line([[lean - 0.12, -0.14, t1 - 0.14], [lean + 0.66, -0.08, t1 - 0.2]], WOOD, 0.075);
      r.line([[lean + 0.66, -0.08, t1 - 0.2], [lean + 0.86, -0.07, t1 - 0.22]], BLADE, 0.04);
      break;
    case 'flamer':
      r.line([[lean - 0.05, -0.12, t1 - 0.2], [lean + 0.6, -0.06, t1 - 0.3]], STEEL, 0.07);
      r.puff(lean + 0.82, -0.04, t1 - 0.34, 0.15, FLAME, 0.95);
      r.puff(lean + 1.1, 0.0, t1 - 0.3, 0.21, FLAME, 0.8);
      r.puff(lean + 0.8, -0.04, t1 - 0.34, 0.07, FLAME_CORE, 1);
      break;
    case 'flag':
      r.line([[0.17, 0.34, t0 - 0.2], [0.17, 0.34, t1 + 1.15]], POLE, 0.055);
      flag(r, g.nation, 0.15, 0.34, t1 + 1.13, 0.86, 0.56);
      break;
    case 'staff':
      r.line([[0.3, -0.34, 0], [0.22, -0.34, t1 + 0.35]], WOOD, 0.05);
      break;
    case 'sabre':
      r.line([[0.16, -0.36, z], [0.46, -0.4, t1 + 0.1]], BLADE, 0.05);
      break;
    case 'lance': {
      const [a, b] = PENNANTS[g.nation];
      const top: V3 = [0.5, -0.36, t1 + 1.25];
      r.line([[0.18, -0.36, -0.45], top], WOOD, 0.05);
      r.panel([top, [top[0] - 0.34, top[1], top[2] - 0.04], [top[0] - 0.34, top[1], top[2] - 0.13], [top[0], top[1], top[2] - 0.12]], a);
      r.panel([[top[0], top[1], top[2] - 0.12], [top[0] - 0.34, top[1], top[2] - 0.13], [top[0] - 0.3, top[1], top[2] - 0.22], [top[0], top[1], top[2] - 0.24]], b);
      break;
    }
    case 'none':
      break;
  }
}

/** Three soldiers in a wedge, the first one leading. */
const WEDGE: V2[] = [[0.5, 0], [-0.32, 0.64], [-0.32, -0.64]];

function squad(r: Rig, g: Gear, figures: Figure[], spots: V2[] = WEDGE): void {
  r.shadow(1.3, 1.15, 0.05);
  figures.forEach((f, i) => soldier(r.at(spots[i][0], spots[i][1]), g, { stride: i % 2 ? -0.13 : 0.13, ...f }));
}

/** A horse (or a mule, scaled down) facing u, with an optional pack saddle. */
function horse(r: Rig, coat: string, mane: string, packs?: string): void {
  const hoof = '#2a221c';
  const legs: [number, number, number][] = [[0.42, 0.12, 0.1], [0.42, -0.12, -0.08], [-0.4, 0.12, -0.08], [-0.4, -0.12, 0.1]];
  for (const [u, v, d] of legs) {
    r.box(u + d - 0.06, v - 0.055, u + d + 0.07, v + 0.055, 0, 0.11, hoof);
    r.box(u + d - 0.05, v - 0.045, u + d + 0.05, v + 0.045, 0.11, 0.7, coat);
  }
  r.hull([-0.6, -0.19, 0.56, 0.19], [-0.56, -0.2, 0.52, 0.2], 0.68, 1.14, coat);
  r.hull([0.3, -0.12, 0.56, 0.12], [0.5, -0.09, 0.72, 0.09], 1.14, 1.55, coat);
  r.hull([0.62, -0.09, 1.04, 0.09], [0.56, -0.1, 0.84, 0.1], 1.3, 1.62, coat);
  r.line([[0.34, 0, 1.18], [0.56, 0, 1.6]], mane, 0.09);
  r.line([[-0.58, 0, 1.08], [-0.76, 0, 0.6]], mane, 0.11);
  if (packs) {
    for (const s of [-1, 1]) r.box(-0.32, s * 0.2, 0.22, s * 0.34, 0.74, 1.12, packs);
    r.box(-0.28, -0.2, 0.18, 0.2, 1.14, 1.3, shadeColor(packs, 0.85));
  } else {
    r.box(-0.22, -0.205, 0.16, 0.205, 1.14, 1.19, LEATHER);
  }
}

/** A mounted soldier. */
function rider(r: Rig, g: Gear, f: Figure): void {
  const { coat, mane } = HORSE_COATS[g.nation];
  r.shadow(1.0, 0.45);
  horse(r, coat, mane);
  soldier(r.at(-0.04, 0, 1.19), g, { ...f, pose: 'ride', back: 'none' });
}

// ------------------------------------------------------------------ vehicles and guns

/** A wheel on the side of a vehicle: its outer face at v0, inner at v1. */
function wheel(r: Rig, u: number, v0: number, v1: number, rad: number, tyre = TYRE, hub = '#6a6a66'): void {
  r.cyl([u, v0, rad], [u, v1, rad], rad, 10, tyre, hub);
}

/** Tracked running gear: two tracks of length L, overall width W and height h, with road wheels. */
function tracks(r: Rig, L: number, W: number, h: number, wheels = 5, tw = 0.32): void {
  const profile: V2[] = [[-L / 2 + 0.22, 0], [L / 2 - 0.22, 0], [L / 2, h * 0.7], [L / 2 - 0.1, h], [-L / 2 + 0.1, h], [-L / 2, h * 0.7]];
  for (const s of [-1, 1]) {
    r.extrude(profile, s * (W / 2 - tw), s * (W / 2), TRACK);
    for (let i = 0; i < wheels; i++) {
      const u = -L / 2 + 0.38 + (i * (L - 0.76)) / Math.max(1, wheels - 1);
      r.cyl([u, s * (W / 2), h * 0.4], [u, s * (W / 2 + 0.03), h * 0.4], h * 0.27, 8, TRACK_LIGHT);
    }
  }
}

/** Camouflage blotches on both flat sides of a vehicle (at ±v), between u0..u1 and z0..z1. */
function camo(r: Rig, g: Gear, v: number, u0: number, u1: number, z0: number, z1: number): void {
  const colors = g.pal.camo;
  if (!colors) return;
  const w = u1 - u0;
  const h = z1 - z0;
  const blots: [number, number, number, number, number][] = [
    [0.08, 0.36, 0.2, 0.75, 1],
    [0.45, 0.72, 0.1, 0.6, 2],
    [0.74, 0.95, 0.45, 0.95, 1],
  ];
  for (const s of [-1, 1])
    for (const [a, b, c, d, i] of blots) {
      const p = (x: number, y: number, skew: number): V3 => [u0 + x * w + skew * w, s * (v + 0.006), z0 + y * h];
      r.panel([p(a, c, 0.03), p(b, c, 0), p(b, d, -0.03), p(a, d, 0.02)], colors[i % colors.length], true);
    }
}

function lorry(r: Rig, g: Gear, long: boolean): void {
  r.shadow(1.55, 0.7, -0.05);
  const rear = long ? [-0.5, -0.92] : [-0.62];
  for (const s of [-1, 1]) {
    for (const u of [0.78, ...rear]) wheel(r, u, s * 0.62, s * 0.49, 0.24);
  }
  r.box(-1.25, -0.36, 1.05, 0.36, 0.2, 0.34, DARK);
  r.box(0.36, -0.44, 0.86, 0.44, 0.34, 1.02, g.paint);
  r.panel([[0.861, -0.36, 0.7], [0.861, 0.36, 0.7], [0.861, 0.36, 0.95], [0.861, -0.36, 0.95]], GLASS);
  r.hull([0.86, -0.32, 1.34, 0.32], [0.86, -0.28, 1.28, 0.28], 0.34, 0.78, g.paint);
  r.box(-1.28, -0.48, 0.34, 0.48, 0.34, 0.6, g.paintDark);
  r.box(-1.26, -0.46, 0.32, 0.46, 0.6, 1.0, CANVAS, null);
  r.roof(-1.28, -0.48, 0.34, 0.48, 1.0, 0.24, shadeColor(CANVAS, 0.95));
  aerial(r, g, 0.45, -0.3, 1.02, 0.7);
}

/** Field gun: wheels on an axle, a shield, the barrel and its trail (split from 1940). */
function fieldGun(r: Rig, g: Gear): void {
  const modern = g.gen === 'ww2';
  const wr = modern ? 0.32 : 0.42;
  const rim = modern ? TYRE : '#4d3a28';
  for (const s of [-1, 1]) wheel(r, 0, s * 0.47, s * 0.38, wr, rim, modern ? '#5d5f5a' : BRASS);
  r.cyl([0, -0.38, wr], [0, 0.38, wr], 0.045, 6, STEEL);
  r.box(-0.48, -0.1, 0.2, 0.1, wr - 0.04, wr + 0.14, g.paintDark);
  r.box(0.2, -0.35, 0.27, 0.35, wr - 0.2, wr + 0.5, g.paint);
  const muzzle = modern ? 1.55 : 1.25;
  r.cyl([0.27, 0, wr + 0.06], [muzzle, 0, wr + 0.13], modern ? 0.055 : 0.07, 8, g.paintDark);
  if (modern) r.cyl([muzzle, 0, wr + 0.13], [muzzle + 0.16, 0, wr + 0.14], 0.09, 6, g.paintDark);
  const trail: V2[] = [[-0.48, wr - 0.04], [-0.48, wr + 0.12], [-1.6, 0.14], [-1.6, 0]];
  if (modern) {
    for (const s of [-1, 1]) r.at(-0.05, s * 0.06, 0, s * 0.32).extrude(trail, -0.07, 0.07, g.paintDark);
  } else {
    r.extrude(trail, -0.09, 0.09, g.paintDark);
  }
}

function heavyGun(r: Rig, g: Gear): void {
  const modern = g.gen === 'ww2';
  if (g.gen === 'ww1') r.decal([[-2.2, -0.9], [1.0, -0.9], [1.0, 0.9], [-2.2, 0.9]], '#7d6646', 0.85);
  for (const s of [-1, 1]) wheel(r, -0.1, s * 0.64, s * 0.5, 0.6, modern ? TYRE : '#4d3a28', modern ? '#5d5f5a' : BRASS);
  r.cyl([-0.1, -0.5, 0.6], [-0.1, 0.5, 0.6], 0.07, 6, STEEL);
  r.box(-0.75, -0.36, 0.42, 0.36, 0.42, 0.8, g.paintDark);
  r.box(-0.5, -0.24, 0.2, 0.24, 0.8, 1.02, g.paint);
  // The barrel, high-angle for the siege howitzers, long and flatter for the 1940 gun.
  if (modern) r.cyl([-0.55, 0, 1.12], [2.15, 0, 1.75], 0.1, 8, g.paint);
  else r.cyl([-0.45, 0, 1.15], [1.05, 0, 2.15], g.gen === 'ww1' ? 0.17 : 0.14, 8, g.paint);
  r.extrude([[-0.75, 0.42], [-0.75, 0.8], [-2.1, 0.16], [-2.1, 0]], -0.24, 0.24, g.paintDark);
  // Shells ready by the breech.
  for (const [u, v] of [[0.35, -1.0], [0.55, -1.0], [0.45, -1.18]] as V2[]) {
    r.vcyl(u, v, 0, 0.36, 0.085, 0.085, 8, BRASS);
    r.vcyl(u, v, 0.36, 0.5, 0.085, 0, 8, '#6d6f69');
  }
}

function antiTankGun(r: Rig, g: Gear): void {
  for (const s of [-1, 1]) wheel(r, 0, s * 0.4, s * 0.31, 0.27);
  r.cyl([0, -0.31, 0.27], [0, 0.31, 0.27], 0.04, 6, STEEL);
  r.box(-0.36, -0.08, 0.12, 0.08, 0.27, 0.42, g.paintDark);
  r.hull([0.12, -0.3, 0.17, 0.3], [0.05, -0.26, 0.1, 0.26], 0.12, 0.66, g.paint);
  r.cyl([0.17, 0, 0.36], [1.5, 0, 0.39], 0.04, 6, g.paintDark);
  if (g.gen === 'ww2') r.cyl([1.5, 0, 0.39], [1.62, 0, 0.39], 0.07, 6, g.paintDark);
  for (const s of [-1, 1]) r.at(-0.05, s * 0.05, 0, s * 0.42).extrude([[-0.3, 0.26], [-0.3, 0.38], [-1.3, 0.1], [-1.3, 0]], -0.05, 0.05, g.paintDark);
}

// ------------------------------------------------------------------ the roster

type Builder = (r: Rig, g: Gear) => void;

const MODELS: Record<UnitModelKind, Builder> = {
  infantry: (r, g) => squad(r, g, [{ arm: 'flag' }, {}, {}]),

  stormtroopers: (r, g) => {
    // Running in, bayonets levelled; a flamethrower in the Great War and in 1940. The Arditi wear the fez.
    const kit = g.nation === 'it' && g.gen === 'ww1' ? kitWith(g, 'fez') : g.kit;
    const run: Figure = { kit, arm: 'aim', lean: 0.1, stride: 0.2, back: 'none' };
    const flamer: Figure = g.gen === 'interwar' ? run : { ...run, arm: 'flamer', back: 'tanks' };
    squad(r, g, [run, flamer, run], [[0.55, -0.05], [-0.35, 0.68], [-0.25, -0.62]]);
  },

  mountain: (r, g) => {
    const head: Headgear | null = g.nation === 'it' ? 'alpini' : g.nation === 'fr' ? 'beret' : g.nation === 'de' && g.gen !== 'ww1' ? 'bergmutze' : null;
    const kit = head ? kitWith(g, head) : g.kit;
    r.shadow(1.35, 1.1);
    const mule = r.at(-0.15, 0.55, 0, 0, 0.82);
    horse(mule, '#6e5a48', '#2e251d', g.webbing);
    soldier(r.at(0.75, -0.3), g, { kit, back: 'rucksack', arm: 'staff', stride: 0.15 });
    soldier(r.at(-0.45, -0.55), g, { kit, back: 'rucksack', stride: -0.13 });
  },

  motorised: (r, g) => {
    lorry(r.at(0.05, 0.4), g, g.gen === 'ww2');
    soldier(r.at(0.25, -0.75), g, { stride: 0.13 });
  },

  cavalry: (r, g) => {
    let kit: Kit = { ...g.kit, jackboots: true };
    if (g.gen === 'ww1' && g.nation === 'fr') kit = kitWith(g, 'cuirassier');
    if (g.gen === 'ww1' && g.nation === 'de') kit = kitWith(g, 'czapka');
    kit = { ...kit, jackboots: true };
    const arm: Figure['arm'] = g.gen === 'ww1' || g.nation === 'pl' ? 'lance' : g.gen === 'interwar' ? 'sabre' : 'none';
    rider(r.at(0.5, 0.45), g, { kit, arm });
    rider(r.at(-0.55, -0.45), g, { kit, arm });
  },

  armouredCar: (r, g) => {
    if (g.gen === 'ww2') {
      r.shadow(1.5, 0.75);
      for (const s of [-1, 1]) for (const u of [-0.78, 0, 0.78]) wheel(r, u, s * 0.66, s * 0.53, 0.27);
      r.hull([-1.25, -0.53, 1.25, 0.53], [-1.05, -0.45, 0.95, 0.45], 0.32, 0.82, g.paint);
      camo(r, g, 0.53, -1.1, 1.1, 0.36, 0.78);
      r.hull([-0.45, -0.38, 0.35, 0.38], [-0.38, -0.3, 0.22, 0.3], 0.82, 1.1, g.paint);
      r.cyl([0.3, 0, 0.98], [1.15, 0, 0.98], 0.04, 6, DARK);
      aerial(r, g, -0.75, 0.3, 0.82);
    } else {
      r.shadow(1.3, 0.7);
      for (const s of [-1, 1]) for (const u of [-0.62, 0.62]) wheel(r, u, s * 0.6, s * 0.46, 0.28);
      r.hull([-1.0, -0.46, 0.75, 0.46], [-0.95, -0.42, 0.7, 0.42], 0.3, 0.9, g.paint);
      r.hull([0.75, -0.36, 1.2, 0.36], [0.7, -0.3, 1.1, 0.3], 0.3, 0.72, g.paint);
      camo(r, g, 0.46, -0.95, 0.7, 0.34, 0.86);
      r.vcyl(-0.2, 0, 0.9, 1.2, 0.32, 0.3, 8, g.paint);
      r.cyl([0.08, 0, 1.06], [0.62, 0, 1.06], 0.035, 6, DARK);
      aerial(r, g, -0.75, -0.3, 0.9);
    }
  },

  artillery: (r, g) => {
    r.shadow(1.5, 0.8, -0.3);
    fieldGun(r, g);
    soldier(r.at(-0.75, 0.82), g, { arm: 'none', back: 'none', stride: 0.06 });
    soldier(r.at(-0.15, -0.82), g, { arm: 'none', back: 'none', pose: 'kneel' });
  },

  heavyArtillery: (r, g) => {
    r.shadow(1.9, 1.0, -0.5);
    heavyGun(r, g);
    soldier(r.at(-1.05, 1.0), g, { arm: 'none', back: 'none', stride: 0.06 });
    soldier(r.at(0.0, -1.45), g, { arm: 'none', back: 'none', stride: -0.1 });
  },

  antiTank: (r, g) => {
    r.shadow(1.35, 0.8, -0.2);
    antiTankGun(r, g);
    soldier(r.at(-0.55, 0.78), g, { arm: 'none', back: 'none', pose: 'kneel' });
    soldier(r.at(-0.95, -0.6), g, { arm: 'none', back: 'none', pose: 'kneel' });
  },

  lightTank: (r, g) => {
    if (g.gen === 'ww1') {
      // Renault FT (and the Whippet's little cousins): the first turret.
      r.shadow(1.25, 0.6, -0.1);
      const frame: V2[] = [[-0.82, 0.04], [0.5, 0], [0.98, 0.42], [0.88, 0.62], [-0.78, 0.62], [-0.98, 0.3]];
      for (const s of [-1, 1]) r.extrude(frame, s * 0.3, s * 0.5, g.paint, TRACK);
      r.hull([-0.78, -0.3, 0.8, 0.3], [-0.72, -0.3, 0.42, 0.3], 0.15, 0.86, g.paint);
      camo(r, g, 0.3, -0.7, 0.4, 0.62, 0.85);
      r.box(-1.25, -0.24, -0.78, 0.24, 0.18, 0.3, g.paintDark);
      r.vcyl(0, 0, 0.86, 1.22, 0.3, 0.27, 8, g.paint);
      r.vcyl(0, 0, 1.22, 1.3, 0.12, 0.1, 6, g.paintDark);
      r.cyl([0.26, 0, 1.03], [0.62, 0, 1.03], 0.045, 6, DARK);
      aerial(r, g, -0.15, 0.2, 1.3, 0.6);
      return;
    }
    const modern = g.gen === 'ww2';
    r.shadow(1.35, 0.85);
    tracks(r, 2.3, 1.45, 0.46, 4);
    r.box(-1.05, -0.4, 1.0, 0.4, 0.1, 0.46, g.paintDark);
    r.hull([-1.12, -0.74, 1.0, 0.74], [-1.05, -0.68, 0.7, 0.68], 0.46, 0.76, g.paint);
    camo(r, g, 0.74, -1.0, 0.95, 0.48, 0.74);
    r.hull([-0.45, -0.38, 0.3, 0.38], [-0.4, -0.32, 0.18, 0.32], 0.76, 1.06, g.paint);
    r.cyl([0.28, 0, 0.92], [modern ? 1.05 : 0.75, 0, 0.92], modern ? 0.045 : 0.035, 6, DARK);
    aerial(r, g, -0.75, 0.45, 0.76);
  },

  tank: (r, g) => {
    if (g.gen === 'ww1') {
      if (g.nation === 'de') {
        // A7V: an armoured box on a tractor chassis, the gun in its nose.
        r.shadow(1.6, 0.95);
        tracks(r, 2.6, 1.5, 0.32, 5, 0.28);
        r.hull([-1.4, -0.8, 1.4, 0.8], [-1.48, -0.95, 1.48, 0.95], 0.22, 0.74, g.paint);
        r.hull([-1.48, -0.95, 1.48, 0.95], [-1.3, -0.8, 1.3, 0.8], 0.74, 1.12, g.paint);
        camo(r, g, 0.95, -1.4, 1.4, 0.3, 0.72);
        r.box(-0.2, -0.42, 0.45, 0.42, 1.12, 1.42, g.paint);
        r.cyl([1.4, 0, 0.62], [1.95, 0, 0.62], 0.07, 8, DARK);
        aerial(r, g, -0.9, 0.4, 1.12);
        return;
      }
      // Mark IV and its kind: a rhomboid landship with guns in side sponsons.
      r.shadow(1.75, 1.05);
      const frame: V2[] = [[-1.15, 0], [0.95, 0], [1.62, 0.86], [1.48, 1.12], [-1.25, 1.12], [-1.52, 0.36]];
      for (const s of [-1, 1]) r.extrude(frame, s * 0.5, s * 0.82, g.paint, mixColor(g.paint, TRACK, 0.25));
      r.box(-1.0, -0.5, 1.0, 0.5, 0.15, 0.95, g.paintDark);
      r.box(0.35, -0.32, 0.88, 0.32, 0.95, 1.2, g.paint);
      r.box(-1.0, -0.62, -0.75, 0.62, 1.12, 1.24, WOOD);
      for (const s of [-1, 1]) {
        r.box(-0.35, s * 0.82, 0.38, s * 1.04, 0.3, 0.8, g.paint);
        r.cyl([0.38, s * 0.93, 0.6], [0.95, s * 0.93, 0.6], 0.055, 6, DARK);
      }
      aerial(r, g, 0.5, 0.2, 1.2, 0.6);
      return;
    }
    const modern = g.gen === 'ww2';
    if (modern) {
      // Sloped armour, a roomy turret and a long gun.
      r.shadow(1.75, 1.05);
      tracks(r, 3.0, 1.95, 0.55, 5);
      r.box(-1.35, -0.62, 1.32, 0.62, 0.12, 0.55, g.paintDark);
      r.hull([-1.48, -1.0, 1.32, 1.0], [-1.42, -0.92, 0.92, 0.92], 0.55, 0.86, g.paint);
      camo(r, g, 1.0, -1.4, 1.2, 0.58, 0.84);
      r.hull([-0.62, -0.56, 0.45, 0.56], [-0.52, -0.45, 0.28, 0.45], 0.86, 1.28, g.paint);
      r.box(0.4, -0.2, 0.55, 0.2, 0.92, 1.18, g.paintDark);
      r.cyl([0.55, 0, 1.05], [2.05, 0, 1.05], 0.06, 8, g.paintDark);
      r.vcyl(-0.28, 0.24, 1.28, 1.4, 0.14, 0.13, 8, g.paintDark);
      aerial(r, g, -0.5, -0.38, 1.28);
    } else {
      // A tall interwar medium: riveted box hull, turret amidships.
      r.shadow(1.7, 0.95);
      tracks(r, 2.9, 1.7, 0.6, 5);
      r.box(-1.35, -0.55, 1.3, 0.55, 0.12, 0.6, g.paintDark);
      r.hull([-1.42, -0.86, 1.22, 0.86], [-1.32, -0.8, 0.92, 0.8], 0.6, 1.06, g.paint);
      camo(r, g, 0.86, -1.35, 1.15, 0.64, 1.02);
      r.hull([-0.55, -0.45, 0.4, 0.45], [-0.5, -0.4, 0.3, 0.4], 1.06, 1.42, g.paint);
      r.cyl([0.4, 0, 1.24], [1.2, 0, 1.24], 0.05, 6, DARK);
      aerial(r, g, -0.4, -0.3, 1.42);
    }
  },

  heavyTank: (r, g) => {
    if (g.gen === 'ww2') {
      r.shadow(1.85, 1.15);
      tracks(r, 3.2, 2.15, 0.62, 6, 0.36);
      r.box(-1.45, -0.7, 1.4, 0.7, 0.12, 0.62, g.paintDark);
      r.hull([-1.55, -1.1, 1.45, 1.1], [-1.5, -1.05, 1.15, 1.05], 0.62, 0.98, g.paint);
      camo(r, g, 1.1, -1.5, 1.4, 0.65, 0.95);
      r.hull([-0.78, -0.72, 0.6, 0.72], [-0.72, -0.66, 0.48, 0.66], 0.98, 1.48, g.paint);
      r.box(0.55, -0.24, 0.72, 0.24, 1.04, 1.38, g.paintDark);
      r.cyl([0.72, 0, 1.2], [2.35, 0, 1.2], 0.075, 8, g.paintDark);
      r.cyl([2.35, 0, 1.2], [2.55, 0, 1.2], 0.11, 6, g.paintDark);
      aerial(r, g, -0.55, -0.5, 1.48);
      return;
    }
    // Interwar breakthrough tank: long hull, a main turret forward and a second aft.
    r.shadow(2.1, 1.0);
    tracks(r, 3.7, 1.8, 0.7, 6);
    r.box(-1.75, -0.55, 1.7, 0.55, 0.12, 0.7, g.paintDark);
    r.hull([-1.85, -0.9, 1.65, 0.9], [-1.8, -0.84, 1.3, 0.84], 0.7, 1.12, g.paint);
    camo(r, g, 0.9, -1.8, 1.6, 0.74, 1.08);
    r.hull([0.15, -0.46, 1.0, 0.46], [0.22, -0.4, 0.88, 0.4], 1.12, 1.5, g.paint);
    r.cyl([0.95, 0, 1.3], [1.85, 0, 1.3], 0.06, 6, DARK);
    r.vcyl(-1.05, 0, 1.12, 1.42, 0.32, 0.3, 8, g.paint);
    r.cyl([-1.33, 0, 1.28], [-1.75, 0, 1.28], 0.035, 6, DARK);
    aerial(r, g, -0.35, 0.5, 1.12);
  },

  tankDestroyer: (r, g) => {
    // A low casemate with a long gun and no turret.
    r.shadow(1.75, 1.0);
    tracks(r, 2.9, 1.85, 0.5, 5);
    r.box(-1.3, -0.6, 1.3, 0.6, 0.1, 0.5, g.paintDark);
    r.hull([-1.4, -0.94, 1.32, 0.94], [-1.12, -0.72, 0.62, 0.72], 0.5, 1.02, g.paint);
    camo(r, g, 0.9, -1.2, 1.1, 0.55, 0.85);
    r.box(0.55, -0.22, 0.75, 0.22, 0.62, 0.92, g.paintDark);
    r.cyl([0.75, 0, 0.78], [2.3, 0, 0.8], 0.065, 8, g.paintDark);
    r.cyl([2.3, 0, 0.8], [2.48, 0, 0.8], 0.1, 6, g.paintDark);
    aerial(r, g, -0.8, 0.45, 1.02);
  },

  transport: (r, g) => {
    // A troopship with its wake, the soldiers lining the deck.
    r.decal([[-1.7, -0.42], [-3.4, -1.0], [-3.4, 1.0], [-1.7, 0.42]], '#f2f4f2', 0.42);
    r.decal([[1.95, 0], [1.3, -0.75], [0.6, -0.62], [0.6, 0.62], [1.3, 0.75]], '#f2f4f2', 0.35);
    r.prism([[-1.75, -0.56], [1.2, -0.56], [1.95, 0], [1.2, 0.56], [-1.75, 0.56]], 0, 0.5, '#3e434b', '#9b8462');
    r.box(-0.65, -0.36, 0.45, 0.36, 0.5, 0.96, '#e2dccb');
    r.box(0.15, -0.3, 0.45, 0.3, 0.96, 1.2, '#e9e4d6');
    r.vcyl(-0.25, 0, 0.96, 1.72, 0.17, 0.16, 8, '#2f2f31');
    r.vcyl(-0.25, 0, 1.4, 1.52, 0.175, 0.175, 8, '#b84a35');
    r.line([[0.85, 0, 0.5], [0.85, 0, 1.85]], DARK, 0.05);
    for (const u of [0.62, 0.92, 1.18, -0.9, -1.2])
      for (const v of [-0.34, 0.34]) {
        r.box(u - 0.07, v - 0.07, u + 0.07, v + 0.07, 0.5, 0.68, g.kit.uniform);
        r.vcyl(u, v, 0.68, 0.76, 0.08, 0.07, 6, g.kit.hat);
      }
    r.line([[-1.62, 0, 0.5], [-1.62, 0, 1.4]], POLE, 0.045);
    flag(r, g.nation, -1.64, 0, 1.38, 0.6, 0.4);
  },
};

// ------------------------------------------------------------------ assembly

export function buildUnitModel(props: UnitModelProps): UnitModel {
  const scene = new Scene({ exact: true, edge: 0.05 });
  const heading = ((Math.round(props.heading) % UNIT_HEADINGS) + UNIT_HEADINGS) % UNIT_HEADINGS;
  const gen = props.type === 'transport' ? props.gen : resolveArtGen(props.type, props.gen);
  MODELS[props.type](new Rig(scene, 0, 0, 0, heading * STEP), gearOf(props.nation, gen));
  const { markup, bounds } = scene.render();
  const [x0, y0, x1, y1] = bounds;
  const w = x1 - x0;
  const h = y1 - y0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}">${markup}</svg>`;
  return { svg, width: w, height: h, cx: -x0, cy: -y0 };
}
