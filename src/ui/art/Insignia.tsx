// National insignia: roundels, the Balkenkreuz, the Polish checkerboard and a
// plain shield for neutrals. The blocs mark their vehicles with a roundel
// (Western), a straight cross (Central) or a star (Eastern) in each nation's
// own colour. `InsigniaMark` draws in place inside another SVG;
// `NationInsignia` wraps it as a standalone icon.
import { OUTLINE, STYLE_ACCENT, shade } from './palettes';
import type { ArtNation } from './types';

export type { ArtNation } from './types';

const ROUNDELS: Partial<Record<ArtNation, [string, string, string]>> = {
  uk: ['#1f3f8f', '#ffffff', '#c8102e'],
  fr: ['#c8102e', '#ffffff', '#1f4fa8'],
  it: ['#c8102e', '#ffffff', '#1f7a3a'],
  es: ['#c8102e', '#f1bf00', '#c8102e'],
};

export interface InsigniaMarkProps {
  nation: ArtNation;
  /** Main colour for the bloc styles; defaults to the bloc's own. */
  accent?: string;
  cx: number;
  cy: number;
  /** Half the emblem's size: roundel radius, half the cross or square width. */
  r: number;
  /** Outline width; defaults to a hair line proportional to the size. */
  ow?: number;
}

/** Five-pointed star, point up. */
function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

export function InsigniaMark({ nation, accent, cx, cy, r, ow }: InsigniaMarkProps) {
  const sw = ow ?? Math.max(0.35, r * 0.12);
  const a = accent ?? STYLE_ACCENT[nation];
  const roundel = nation === 'western' ? ([a, '#ffffff', shade(a, -0.35)] as const) : ROUNDELS[nation];
  if (roundel) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill={roundel[0]} stroke={OUTLINE} strokeWidth={sw} />
        <circle cx={cx} cy={cy} r={r * 0.66} fill={roundel[1]} />
        <circle cx={cx} cy={cy} r={r * 0.33} fill={roundel[2]} />
      </g>
    );
  }
  if (nation === 'eastern') {
    return <path d={starPath(cx, cy + r * 0.08, r * 1.08)} fill={a} stroke={OUTLINE} strokeWidth={sw} strokeLinejoin="round" />;
  }
  if (nation === 'de' || nation === 'central') {
    // Straight-armed cross inside a white border, hair-lined: black for Germany, the nation's colour for the Central bloc.
    const len = r;
    const t = r * 0.21;
    const cross = (arm: number, half: number) =>
      `M${cx - half} ${cy - arm}H${cx + half}V${cy - half}H${cx + arm}V${cy + half}H${cx + half}V${cy + arm}H${cx - half}V${cy + half}H${cx - arm}V${cy - half}H${cx - half}Z`;
    return (
      <g>
        <path d={cross(len, t + r * 0.17)} fill="#ffffff" stroke={OUTLINE} strokeWidth={sw} strokeLinejoin="miter" />
        <path d={cross(len - r * 0.17, t)} fill={nation === 'de' ? '#15161a' : a} />
      </g>
    );
  }
  if (nation === 'pl') {
    // Szachownica: 2 x 2 quarters, red top-left.
    const s = r;
    const red = '#d4213d';
    return (
      <g>
        <rect x={cx - s} y={cy - s} width={s * 2} height={s * 2} fill="#ffffff" />
        <rect x={cx - s} y={cy - s} width={s} height={s} fill={red} />
        <rect x={cx} y={cy} width={s} height={s} fill={red} />
        <rect x={cx - s} y={cy - s} width={s * 2} height={s * 2} fill="none" stroke={OUTLINE} strokeWidth={sw} />
      </g>
    );
  }
  // Neutral: a small plain grey heater shield.
  const w = r * 0.9;
  const d = `M${cx - w} ${cy - r}H${cx + w}V${cy - r * 0.1}Q${cx + w} ${cy + r * 0.62} ${cx} ${cy + r}Q${cx - w} ${cy + r * 0.62} ${cx - w} ${cy - r * 0.1}Z`;
  return (
    <g>
      <path d={d} fill="#8d9196" stroke={OUTLINE} strokeWidth={sw} strokeLinejoin="round" />
      <path
        d={`M${cx - w * 0.62} ${cy - r * 0.72}H${cx + w * 0.62}V${cy - r * 0.15}Q${cx + w * 0.6} ${cy + r * 0.4} ${cx} ${cy + r * 0.68}`}
        fill="none"
        stroke="#b9bdc2"
        strokeWidth={sw * 1.1}
        strokeLinecap="round"
      />
    </g>
  );
}

export interface NationInsigniaProps {
  nation: ArtNation;
  accent?: string;
  size?: number;
  className?: string;
  title?: string;
}

export function NationInsignia({ nation, accent, size = 16, className, title }: NationInsigniaProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      role="img"
      aria-label={title ?? `${nation} insignia`}
    >
      {title && <title>{title}</title>}
      <InsigniaMark nation={nation} accent={accent} cx={8} cy={8} r={7} ow={0.8} />
    </svg>
  );
}
