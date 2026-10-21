// Low-level drawing helpers shared by every unit illustration: outlined limbs
// and rods, shaded and camouflaged shapes, wheels, track runs, barrels and the
// soft ground shadow. Everything is plain SVG in the caller's coordinates.
import { useId, type ReactNode } from 'react';
import {
  OUTLINE,
  STEEL,
  TRACK,
  TRACK_LIGHT,
  TYRE,
  WOOD,
  WOOD_DARK,
  shade,
} from './palettes';

export type P = [number, number];

/** A document-unique, url()-safe id (React's useId may contain colons or guillemets). */
export function useSvgId(prefix: string): string {
  return `ua-${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export function pathOf(pts: P[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${r2(p[0])} ${r2(p[1])}`).join('');
}

export function polyOf(pts: P[]): string {
  return pathOf(pts) + 'Z';
}

export function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function lerp(a: P, b: P, t: number): P {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Unit vector from a to b and its left-hand normal. */
export function dirOf(a: P, b: P): { d: P; n: P; len: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return { d: [dx / len, dy / len], n: [dy / len, -dx / len], len };
}

export function add(a: P, b: P, k = 1): P {
  return [a[0] + b[0] * k, a[1] + b[1] * k];
}

/** Point at distance `dist` from `from`, heading at `deg` degrees (0 = right, positive = up). */
export function polar(from: P, deg: number, dist: number): P {
  const rad = (deg * Math.PI) / 180;
  return [from[0] + Math.cos(rad) * dist, from[1] - Math.sin(rad) * dist];
}

// ---------------------------------------------------------------------------
// Outlined strokes

interface LimbProps {
  pts: P[];
  w: number;
  fill: string;
  ow?: number;
  cap?: 'round' | 'butt' | 'square';
}

/** A polyline drawn as a thick coloured stroke with a dark outline. */
export function Limb({ pts, w, fill, ow = 1.1, cap = 'round' }: LimbProps) {
  const d = pathOf(pts);
  return (
    <g fill="none" strokeLinecap={cap} strokeLinejoin="round">
      <path d={d} stroke={OUTLINE} strokeWidth={w + ow * 2} />
      <path d={d} stroke={fill} strokeWidth={w} />
    </g>
  );
}

export interface Seg {
  a: P;
  b: P;
  w: number;
  fill: string;
  cap?: 'round' | 'butt' | 'square';
}

/** Several segments sharing one outline pass, so joints between them stay clean. */
export function Segs({ segs, ow = 1.1 }: { segs: Seg[]; ow?: number }) {
  return (
    <g fill="none" strokeLinejoin="round">
      {segs.map((s, i) => (
        <path key={`o${i}`} d={pathOf([s.a, s.b])} stroke={OUTLINE} strokeWidth={s.w + ow * 2} strokeLinecap={s.cap ?? 'round'} />
      ))}
      {segs.map((s, i) => (
        <path key={`f${i}`} d={pathOf([s.a, s.b])} stroke={s.fill} strokeWidth={s.w} strokeLinecap={s.cap ?? 'round'} />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Camouflage

export interface CamoSpec {
  colors: string[];
  /** Approximate patch spacing in drawing units. */
  cell: number;
  /** Draw thin dark borders between colour fields (German 1918 style). */
  lines?: boolean;
  seed?: number;
  /** Area to cover when a shape's extent cannot be worked out (the view box). */
  frame?: Box;
}

export type Box = [number, number, number, number];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blob(cx: number, cy: number, rad: number, rand: () => number): string {
  const n = 7;
  const pts: P[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rand() * 0.5;
    const rr = rad * (0.55 + rand() * 0.6);
    pts.push([cx + Math.cos(ang) * rr * 1.35, cy + Math.sin(ang) * rr * 0.8]);
  }
  // Smooth closed curve through the midpoints.
  const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = `M${r2(mid(pts[n - 1], pts[0])[0])} ${r2(mid(pts[n - 1], pts[0])[1])}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % n]);
    d += `Q${r2(p[0])} ${r2(p[1])} ${r2(m[0])} ${r2(m[1])}`;
  }
  return d + 'Z';
}

/**
 * Bounding box of a path built by these helpers (M L H V Q C S T A Z, plus
 * relative h v l m). Returns null for anything it does not understand.
 */
export function pathBBox(d: string): Box | null {
  const re = /([A-Za-z])([^A-Za-z]*)/g;
  let x = 0;
  let y = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const hit = (px: number, py: number) => {
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const cmd = m[1];
    const n = (m[2].match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    switch (cmd) {
      case 'M':
      case 'L':
      case 'T':
      case 'Q':
      case 'C':
      case 'S':
        for (let i = 0; i + 1 < n.length; i += 2) hit(n[i], n[i + 1]);
        if (n.length >= 2) [x, y] = [n[n.length - 2], n[n.length - 1]];
        break;
      case 'm':
      case 'l':
        for (let i = 0; i + 1 < n.length; i += 2) {
          x += n[i];
          y += n[i + 1];
          hit(x, y);
        }
        break;
      case 'H':
        for (const v of n) hit((x = v), y);
        break;
      case 'V':
        for (const v of n) hit(x, (y = v));
        break;
      case 'h':
        for (const v of n) hit((x += v), y);
        break;
      case 'v':
        for (const v of n) hit(x, (y += v));
        break;
      case 'A':
        for (let i = 0; i + 6 < n.length; i += 7) {
          x = n[i + 5];
          y = n[i + 6];
          hit(x - n[i], y - n[i + 1]);
          hit(x + n[i], y + n[i + 1]);
        }
        break;
      case 'Z':
      case 'z':
        break;
      default:
        return null;
    }
  }
  return x0 <= x1 ? [x0, y0, x1 - x0, y1 - y0] : null;
}

function cellHash(i: number, j: number, seed: number): number {
  return (Math.imul(i + 1013, 73856093) ^ Math.imul(j + 7919, 19349663) ^ Math.imul(seed, 83492791)) >>> 0;
}

/**
 * Irregular patches on a fixed grid, emitted only where they can touch `box`.
 * Every shape sharing a spec samples the same field, so the pattern runs on
 * across hull, turret and plates. Meant to be clipped to the shape.
 */
export function CamoField({ spec, box }: { spec: CamoSpec; box: Box }) {
  const [bx, by, bw, bh] = box;
  const cell = spec.cell;
  const rowH = cell * 0.75;
  const extra = spec.colors.slice(1);
  const seed = spec.seed ?? 7;
  const patches: { d: string; fill: string }[] = [];
  const j0 = Math.floor((by - cell) / rowH);
  const j1 = Math.ceil((by + bh + cell) / rowH);
  for (let j = j0; j <= j1; j++) {
    const off = (j & 1) * 0.5 * cell;
    const i0 = Math.floor((bx - cell - off) / cell);
    const i1 = Math.ceil((bx + bw + cell - off) / cell);
    for (let i = i0; i <= i1; i++) {
      const rand = rng(cellHash(i, j, seed));
      const pick = Math.floor(rand() * (extra.length + 1));
      if (pick >= extra.length) continue;
      const jx = (rand() - 0.5) * cell * 0.6;
      const jy = (rand() - 0.5) * cell * 0.4;
      patches.push({ d: blob(i * cell + off + jx, j * rowH + jy, cell * 0.42, rand), fill: extra[pick] });
    }
  }
  return (
    <g>
      {patches.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={p.fill}
          stroke={spec.lines ? OUTLINE : 'none'}
          strokeWidth={spec.lines ? cell * 0.045 : 0}
        />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Shaded shapes

export interface ShapeProps {
  d: string;
  fill: string;
  /** Highlight region (clipped to the shape), painted as a light overlay. */
  hi?: string;
  /** Shadow region (clipped to the shape), painted as a dark overlay. */
  lo?: string;
  camo?: CamoSpec;
  /** Region the camo field must cover; defaults to the shape's own extent. */
  camoBox?: Box;
  ow?: number;
  /** Extra details clipped to the shape (panel lines, plates). */
  children?: ReactNode;
  hiOpacity?: number;
  loOpacity?: number;
}

/** A filled outline with optional clipped camouflage, highlight and shadow. */
export function Shape({ d, fill, hi, lo, camo, camoBox, ow = 1.1, children, hiOpacity = 0.2, loOpacity = 0.24 }: ShapeProps) {
  const id = useSvgId('clip');
  const clipped = Boolean(hi || lo || camo || children);
  return (
    <g>
      {clipped && (
        <defs>
          <clipPath id={id}>
            <path d={d} />
          </clipPath>
        </defs>
      )}
      <path d={d} fill={camo ? camo.colors[0] : fill} />
      {clipped && (
        <g clipPath={`url(#${id})`}>
          {camo && <CamoField spec={camo} box={camoBox ?? pathBBox(d) ?? camo.frame ?? [0, 0, 96, 60]} />}
          {children}
          {hi && <path d={hi} fill="#ffffff" opacity={hiOpacity} />}
          {lo && <path d={lo} fill="#000000" opacity={loOpacity} />}
        </g>
      )}
      <path d={d} fill="none" stroke={OUTLINE} strokeWidth={ow} strokeLinejoin="round" />
    </g>
  );
}

/** Children clipped to a path (e.g. a figure seen through a window). */
export function ClipTo({ d, children }: { d: string; children: ReactNode }) {
  const id = useSvgId('win');
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <path d={d} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>{children}</g>
    </g>
  );
}

/** Axis-aligned rectangle path helper. */
export function rect(x: number, y: number, w: number, h: number): string {
  return `M${r2(x)} ${r2(y)}h${r2(w)}v${r2(h)}h${r2(-w)}Z`;
}

/** Rounded rectangle path helper. */
export function rrect(x: number, y: number, w: number, h: number, rad: number): string {
  const r = Math.min(rad, w / 2, h / 2);
  return `M${r2(x + r)} ${r2(y)}H${r2(x + w - r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x + w)} ${r2(y + r)}V${r2(y + h - r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x + w - r)} ${r2(y + h)}H${r2(x + r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x)} ${r2(y + h - r)}V${r2(y + r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x + r)} ${r2(y)}Z`;
}

/** Ellipse as a path, for use with Shape. */
export function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${r2(cx - rx)} ${r2(cy)}A${r2(rx)} ${r2(ry)} 0 1 0 ${r2(cx + rx)} ${r2(cy)}A${r2(rx)} ${r2(ry)} 0 1 0 ${r2(cx - rx)} ${r2(cy)}Z`;
}

// ---------------------------------------------------------------------------
// Ground shadow

export function GroundShadow({ cx, cy, rx, ry, opacity = 0.42 }: { cx: number; cy: number; rx: number; ry: number; opacity?: number }) {
  const id = useSvgId('shadow');
  return (
    <g>
      <defs>
        <radialGradient id={id}>
          <stop offset="0%" stopColor="#000000" stopOpacity={opacity} />
          <stop offset="60%" stopColor="#000000" stopOpacity={opacity * 0.6} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0} />
        </radialGradient>
      </defs>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id})`} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Wheels

/** Wooden artillery wheel with iron tyre and spokes. */
export function SpokedWheel({
  cx,
  cy,
  r,
  spokes = 12,
  ow = 1.1,
  wood = WOOD,
  hub = STEEL,
}: {
  cx: number;
  cy: number;
  r: number;
  spokes?: number;
  ow?: number;
  wood?: string;
  hub?: string;
}) {
  const inner = r * 0.78;
  const spokeLines: string[] = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + 0.13;
    spokeLines.push(
      `M${r2(cx + Math.cos(a) * r * 0.2)} ${r2(cy + Math.sin(a) * r * 0.2)}L${r2(cx + Math.cos(a) * inner)} ${r2(cy + Math.sin(a) * inner)}`,
    );
  }
  const sw = Math.max(0.55, r * 0.075);
  return (
    <g>
      <circle cx={cx} cy={cy} r={r - ow * 0.2} fill="#2f2c28" stroke={OUTLINE} strokeWidth={ow} />
      <circle cx={cx} cy={cy} r={r * 0.86} fill={wood} stroke={OUTLINE} strokeWidth={ow * 0.6} />
      <circle cx={cx} cy={cy} r={inner} fill="#000000" fillOpacity={0.28} stroke={OUTLINE} strokeWidth={ow * 0.6} />
      <path d={spokeLines.join('')} stroke={OUTLINE} strokeWidth={sw + ow * 0.9} strokeLinecap="round" />
      <path d={spokeLines.join('')} stroke={wood} strokeWidth={sw} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r * 0.24} fill={WOOD_DARK} stroke={OUTLINE} strokeWidth={ow * 0.7} />
      <circle cx={cx} cy={cy} r={r * 0.12} fill={hub} stroke={OUTLINE} strokeWidth={ow * 0.5} />
      <path
        d={`M${r2(cx - r * 0.62)} ${r2(cy - r * 0.62)}A${r2(r * 0.93)} ${r2(r * 0.93)} 0 0 1 ${r2(cx + r * 0.62)} ${r2(cy - r * 0.62)}`}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.18}
        strokeWidth={r * 0.1}
      />
    </g>
  );
}

/** Rubber-tyred wheel with a painted steel hub. */
export function RubberWheel({
  cx,
  cy,
  r,
  hub,
  ow = 1.1,
  hubRatio = 0.58,
  nuts = true,
}: {
  cx: number;
  cy: number;
  r: number;
  hub: string;
  ow?: number;
  hubRatio?: number;
  nuts?: boolean;
}) {
  const hr = r * hubRatio;
  const nutPts: P[] = [];
  if (nuts) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      nutPts.push([cx + Math.cos(a) * hr * 0.6, cy + Math.sin(a) * hr * 0.6]);
    }
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={r - ow * 0.2} fill={TYRE} stroke={OUTLINE} strokeWidth={ow} />
      <path
        d={`M${r2(cx - r * 0.66)} ${r2(cy - r * 0.6)}A${r2(r * 0.88)} ${r2(r * 0.88)} 0 0 1 ${r2(cx + r * 0.66)} ${r2(cy - r * 0.6)}`}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.14}
        strokeWidth={r * 0.13}
      />
      <circle cx={cx} cy={cy} r={hr} fill={hub} stroke={OUTLINE} strokeWidth={ow * 0.75} />
      <circle cx={cx - hr * 0.12} cy={cy - hr * 0.12} r={hr * 0.7} fill="#ffffff" fillOpacity={0.12} />
      <circle cx={cx} cy={cy} r={hr * 0.36} fill={shade(hub, -0.3)} stroke={OUTLINE} strokeWidth={ow * 0.5} />
      {nutPts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={Math.max(0.25, hr * 0.09)} fill={OUTLINE} />
      ))}
    </g>
  );
}

/** Steel disc wheel with a solid rubber band (1920s lorries, carriages). */
export function DiscWheel({ cx, cy, r, hub, ow = 1.1 }: { cx: number; cy: number; r: number; hub: string; ow?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r - ow * 0.2} fill={TYRE} stroke={OUTLINE} strokeWidth={ow} />
      <circle cx={cx} cy={cy} r={r * 0.8} fill={hub} stroke={OUTLINE} strokeWidth={ow * 0.7} />
      <circle cx={cx} cy={cy} r={r * 0.62} fill="none" stroke={shade(hub, -0.3)} strokeWidth={r * 0.06} />
      <circle cx={cx} cy={cy} r={r * 0.26} fill={shade(hub, -0.25)} stroke={OUTLINE} strokeWidth={ow * 0.6} />
      <circle cx={cx} cy={cy} r={r * 0.1} fill={OUTLINE} />
      <path
        d={`M${r2(cx - r * 0.5)} ${r2(cy - r * 0.5)}A${r2(r * 0.7)} ${r2(r * 0.7)} 0 0 1 ${r2(cx + r * 0.5)} ${r2(cy - r * 0.5)}`}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.22}
        strokeWidth={r * 0.1}
      />
    </g>
  );
}

/** Military artillery-pattern spoked wheel with rubber tyre (armoured cars, 1920s). */
export function ArtilleryWheel({ cx, cy, r, hub, ow = 1.1, spokes = 10 }: { cx: number; cy: number; r: number; hub: string; ow?: number; spokes?: number }) {
  const lines: string[] = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    lines.push(
      `M${r2(cx + Math.cos(a) * r * 0.2)} ${r2(cy + Math.sin(a) * r * 0.2)}L${r2(cx + Math.cos(a) * r * 0.66)} ${r2(cy + Math.sin(a) * r * 0.66)}`,
    );
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={r - ow * 0.2} fill={TYRE} stroke={OUTLINE} strokeWidth={ow} />
      <circle cx={cx} cy={cy} r={r * 0.7} fill={shade(hub, -0.45)} stroke={OUTLINE} strokeWidth={ow * 0.6} />
      <path d={lines.join('')} stroke={hub} strokeWidth={Math.max(0.5, r * 0.1)} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r * 0.26} fill={hub} stroke={OUTLINE} strokeWidth={ow * 0.6} />
      <circle cx={cx} cy={cy} r={r * 0.1} fill={OUTLINE} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Tracks

export type TrackStyle = 'ww1' | 'bogie' | 'road' | 'overlap';

export interface TrackRunProps {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  style: TrackStyle;
  /** Number of road wheels along the bottom run. */
  wheels: number;
  hull: string;
  ow?: number;
  /** Draw return rollers along the top run. */
  rollers?: number;
}

/** A side-on track run: belt, links, road wheels, sprocket and idler. */
export function TrackRun({ x0, x1, top, bottom, style, wheels, hull, ow = 1.1, rollers = 0 }: TrackRunProps) {
  const h = bottom - top;
  const rad = h / 2;
  const belt = rrect(x0, top, x1 - x0, h, rad);
  const th = Math.max(1.1, h * 0.17);
  const inner = rrect(x0 + th, top + th, x1 - x0 - th * 2, h - th * 2, rad - th);
  const linkLine = rrect(x0 + th * 0.5, top + th * 0.5, x1 - x0 - th, h - th, rad - th * 0.5);
  const wr = style === 'bogie' ? Math.min(h * 0.24, 2.6) : style === 'overlap' ? h * 0.35 : h * 0.3;
  const wy = bottom - th - wr * 0.98;
  const span0 = x0 + rad + (style === 'bogie' ? wr * 0.6 : wr * 0.3);
  const span1 = x1 - rad - (style === 'bogie' ? wr * 0.6 : wr * 0.3);
  const ws: P[] = [];
  for (let i = 0; i < wheels; i++) {
    ws.push([wheels === 1 ? (span0 + span1) / 2 : span0 + ((span1 - span0) * i) / (wheels - 1), wy]);
  }
  const hubFill = shade(hull, -0.05);
  const rollerPts: P[] = [];
  for (let i = 0; i < rollers; i++) {
    rollerPts.push([x0 + rad + ((x1 - x0 - rad * 2) * (i + 0.5)) / rollers, top + th + h * 0.08]);
  }
  return (
    <g>
      <path d={belt} fill={TRACK} stroke={OUTLINE} strokeWidth={ow} />
      <path d={linkLine} fill="none" stroke={TRACK_LIGHT} strokeWidth={th * 0.55} strokeDasharray={`${r2(th * 0.55)} ${r2(th * 0.55)}`} />
      <path d={inner} fill={shade(hull, -0.5)} stroke={OUTLINE} strokeWidth={ow * 0.6} />
      {rollerPts.map((p, i) => (
        <circle key={`r${i}`} cx={p[0]} cy={p[1]} r={Math.max(0.8, h * 0.08)} fill={hubFill} stroke={OUTLINE} strokeWidth={ow * 0.6} />
      ))}
      {style === 'bogie' && (
        <g>
          {ws.map((p, i) =>
            i % 2 === 0 && ws[i + 1] ? (
              <path
                key={`b${i}`}
                d={rrect(p[0] - wr * 0.4, p[1] - wr * 1.25, ws[i + 1][0] - p[0] + wr * 0.8, wr * 1.1, wr * 0.4)}
                fill={shade(hull, -0.15)}
                stroke={OUTLINE}
                strokeWidth={ow * 0.6}
              />
            ) : null,
          )}
        </g>
      )}
      {/* Idler (rear) and sprocket (front). */}
      <circle cx={x0 + rad} cy={top + rad} r={rad - th * 1.15} fill={hubFill} stroke={OUTLINE} strokeWidth={ow * 0.7} />
      <circle cx={x1 - rad} cy={top + rad} r={rad - th * 1.15} fill={hubFill} stroke={OUTLINE} strokeWidth={ow * 0.7} />
      <circle cx={x1 - rad} cy={top + rad} r={(rad - th) * 0.4} fill={shade(hull, -0.35)} stroke={OUTLINE} strokeWidth={ow * 0.5} />
      <circle cx={x0 + rad} cy={top + rad} r={(rad - th) * 0.35} fill={shade(hull, -0.35)} stroke={OUTLINE} strokeWidth={ow * 0.5} />
      {style === 'overlap' &&
        ws.slice(1).map((p, i) => (
          <g key={`f${i}`}>
            <circle cx={(p[0] + ws[i][0]) / 2} cy={p[1] - wr * 0.1} r={wr} fill={shade(hull, -0.4)} stroke={OUTLINE} strokeWidth={ow * 0.7} />
            <circle cx={(p[0] + ws[i][0]) / 2} cy={p[1] - wr * 0.1} r={wr * 0.3} fill={shade(hull, -0.55)} />
          </g>
        ))}
      {ws.map((p, i) => (
        <g key={`w${i}`}>
          <circle cx={p[0]} cy={p[1]} r={wr} fill={style === 'road' || style === 'overlap' ? TYRE : hubFill} stroke={OUTLINE} strokeWidth={ow * 0.7} />
          {(style === 'road' || style === 'overlap') && (
            <circle cx={p[0]} cy={p[1]} r={wr * 0.72} fill={hubFill} stroke={OUTLINE} strokeWidth={ow * 0.5} />
          )}
          <circle cx={p[0]} cy={p[1]} r={wr * 0.28} fill={shade(hull, -0.35)} />
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Guns and small parts

export interface BarrelProps {
  from: P;
  to: P;
  w: number;
  fill: string;
  ow?: number;
  /** Width at the muzzle end; defaults to `w` (no taper). */
  wEnd?: number;
  brake?: boolean;
  /** Muzzle swelling ring (older guns). */
  muzzleRing?: boolean;
}

/** A gun barrel from breech to muzzle, optionally tapered, with muzzle brake. */
export function Barrel({ from, to, w, fill, ow = 1.1, wEnd, brake, muzzleRing }: BarrelProps) {
  const { d, n, len } = dirOf(from, to);
  const we = wEnd ?? w;
  const half = w / 2;
  const halfE = we / 2;
  const body: P[] = [add(from, n, half), add(to, n, halfE), add(to, n, -halfE), add(from, n, -half)];
  const parts: ReactNode[] = [];
  parts.push(
    <Shape
      key="b"
      d={polyOf(body)}
      fill={fill}
      ow={ow}
      hi={polyOf([add(from, n, half), add(to, n, halfE), add(to, n, halfE * 0.15), add(from, n, half * 0.15)])}
      hiOpacity={0.22}
    />,
  );
  if (brake) {
    const bl = Math.max(w * 1.6, len * 0.07);
    const bw = we * 1.75;
    const s = add(to, d, -bl * 0.85);
    const e = add(to, d, bl * 0.15);
    parts.push(
      <Shape
        key="mb"
        d={polyOf([add(s, n, bw / 2), add(e, n, bw / 2), add(e, n, -bw / 2), add(s, n, -bw / 2)])}
        fill={shade(fill, -0.1)}
        ow={ow}
      >
        <path d={pathOf([add(lerp(s, e, 0.5), n, bw), add(lerp(s, e, 0.5), n, -bw)])} stroke={OUTLINE} strokeWidth={ow * 0.8} />
      </Shape>,
    );
  }
  if (muzzleRing) {
    const s = add(to, d, -we * 1.2);
    const rw = we * 1.35;
    parts.push(
      <Shape key="mr" d={polyOf([add(s, n, rw / 2), add(to, n, rw / 2), add(to, n, -rw / 2), add(s, n, -rw / 2)])} fill={fill} ow={ow * 0.8} />,
    );
  }
  return <g>{parts}</g>;
}

/** A row of rivet dots between two points. */
export function Rivets({ a, b, n, r = 0.32, fill = OUTLINE, opacity = 0.55 }: { a: P; b: P; n: number; r?: number; fill?: string; opacity?: number }) {
  const pts: P[] = [];
  for (let i = 0; i < n; i++) pts.push(lerp(a, b, n === 1 ? 0.5 : i / (n - 1)));
  return (
    <g fill={fill} opacity={opacity}>
      {pts.map((p, i) => (
        <circle key={i} cx={r2(p[0])} cy={r2(p[1])} r={r} />
      ))}
    </g>
  );
}

/** Plain dark detail line (panel seams, hatches), no outline. */
export function Line({ pts, w = 0.6, stroke = OUTLINE, opacity = 0.7 }: { pts: P[]; w?: number; stroke?: string; opacity?: number }) {
  return <path d={pathOf(pts)} fill="none" stroke={stroke} strokeWidth={w} strokeOpacity={opacity} strokeLinecap="round" strokeLinejoin="round" />;
}

/** Two-tone swallow-tail pennant hanging from a staff tip, flying to the left (wind of motion). */
export function Pennant({ at, len, h, colors, ow = 0.7, droop = 0.6 }: { at: P; len: number; h: number; colors: [string, string]; ow?: number; droop?: number }) {
  const [x, y] = at;
  const tipY = y + h * droop;
  const top = `M${r2(x)} ${r2(y)}Q${r2(x - len * 0.5)} ${r2(y - h * 0.25)} ${r2(x - len)} ${r2(tipY - h * 0.35)}L${r2(x - len * 0.72)} ${r2(y + h * 0.5 + h * droop * 0.4)}L${r2(x)} ${r2(y + h * 0.5)}Z`;
  const bot = `M${r2(x)} ${r2(y + h * 0.5)}L${r2(x - len * 0.72)} ${r2(y + h * 0.5 + h * droop * 0.4)}L${r2(x - len)} ${r2(tipY + h * 0.75)}Q${r2(x - len * 0.5)} ${r2(y + h * 1.1)} ${r2(x)} ${r2(y + h)}Z`;
  return (
    <g strokeLinejoin="round">
      <path d={top} fill={colors[0]} stroke={OUTLINE} strokeWidth={ow} />
      <path d={bot} fill={colors[1]} stroke={OUTLINE} strokeWidth={ow} />
    </g>
  );
}
