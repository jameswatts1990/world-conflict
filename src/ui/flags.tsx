// Simplified national flags (3:2) for the nations, and the plain neutral flag.
// Drawn inline so the UI needs no image assets. A nation without one here
// shows the plain neutral flag (and flies one in its own colour on the map).
import { useId, type ReactElement } from 'react';
import type { OwnerId, ProvinceId, World } from '../sim';

const W = 30;
const H = 20;

/** A flag of equal stripes, kept as data so the map's 3D army models can fly it too. */
export interface FlagStripes {
  dir: 'h' | 'v';
  colors: string[];
}

/** Striped flags: most countries need only a line here. */
const STRIPED: Record<string, FlagStripes> = {
  fr: { dir: 'v', colors: ['#1f4fa0', '#f4f4f4', '#e0383e'] },
  de: { dir: 'h', colors: ['#121212', '#d40000', '#ffcc00'] },
  it: { dir: 'v', colors: ['#0c8a46', '#f4f4f4', '#cd2b37'] },
  pl: { dir: 'h', colors: ['#f4f4f4', '#dc143c'] },
  hu: { dir: 'h', colors: ['#cd2a3e', '#f4f4f4', '#436f4d'] },
  be: { dir: 'v', colors: ['#151515', '#fdda24', '#ef3340'] },
  nl: { dir: 'h', colors: ['#ae1c28', '#f4f4f4', '#21468b'] },
  at: { dir: 'h', colors: ['#c8102e', '#f4f4f4', '#c8102e'] },
};

function stripes({ dir, colors }: FlagStripes): ReactElement {
  const n = colors.length;
  return (
    <>
      {colors.map((c, i) =>
        dir === 'h' ? <rect key={i} y={(i * H) / n} width={W} height={H / n} fill={c} /> : <rect key={i} x={(i * W) / n} width={W / n} height={H} fill={c} />,
      )}
    </>
  );
}

/** The flag's stripes, if it is a striped flag. */
export function flagStripes(id: string): FlagStripes | null {
  return STRIPED[id] ?? null;
}

const FLAGS: Record<string, ReactElement> = {
  ...Object.fromEntries(Object.entries(STRIPED).map(([id, s]) => [id, stripes(s)])),
  uk: (
    <>
      <rect width={W} height={H} fill="#1f3a8a" />
      <path d={`M0 0L${W} ${H}M${W} 0L0 ${H}`} stroke="#fff" strokeWidth={4} />
      <path d={`M0 0L${W} ${H}M${W} 0L0 ${H}`} stroke="#c8102e" strokeWidth={1.4} />
      <rect x={12} width={6} height={H} fill="#fff" />
      <rect y={7} width={W} height={6} fill="#fff" />
      <rect x={13.4} width={3.2} height={H} fill="#c8102e" />
      <rect y={8.4} width={W} height={3.2} fill="#c8102e" />
    </>
  ),
  es: (
    <>
      <rect width={W} height={H} fill="#b3171d" />
      <rect y={5} width={W} height={10} fill="#f6c100" />
    </>
  ),
  dk: (
    <>
      <rect width={W} height={H} fill="#c8102e" />
      <rect x={9} width={3.4} height={H} fill="#fff" />
      <rect y={8.3} width={W} height={3.4} fill="#fff" />
    </>
  ),
  ch: (
    <>
      <rect width={W} height={H} fill="#d52b1e" />
      <rect x={13.2} y={4.5} width={3.6} height={11} fill="#fff" />
      <rect x={9.5} y={8.2} width={11} height={3.6} fill="#fff" />
    </>
  ),
  cz: (
    <>
      <rect width={W} height={H / 2} fill="#f4f4f4" />
      <rect y={H / 2} width={W} height={H / 2} fill="#d7141a" />
      <path d={`M0 0L15 10L0 ${H}Z`} fill="#11457e" />
    </>
  ),
  pt: (
    <>
      <rect width={W} height={H} fill="#e41e20" />
      <rect width={12} height={H} fill="#046a38" />
      <circle cx={12} cy={10} r={3.6} fill="none" stroke="#ffd700" strokeWidth={1.4} />
    </>
  ),
  neutral: (
    <>
      <rect width={W} height={H} fill="#d8d1bd" />
      <path d={`M0 ${H}L${W} 0`} stroke="#b9ad8e" strokeWidth={3} />
    </>
  ),
};

/** Flag key for an owner; neutral provinces carry their own state's flag. */
export function flagKey(owner: OwnerId, province?: ProvinceId): string {
  if (owner !== 'neutral') return owner;
  return province && FLAGS[province] ? province : 'neutral';
}

export function Flag({ id, size = 20, title, className }: { id: string; size?: number; title?: string; className?: string }) {
  const clip = useId();
  return (
    <svg
      className={`flag${className ? ` ${className}` : ''}`}
      width={size * 1.5}
      height={size}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={title ?? id}
    >
      {title && <title>{title}</title>}
      <clipPath id={clip}>
        <rect width={W} height={H} rx={2} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        {FLAGS[id] ?? FLAGS.neutral}
        <rect width={W} height={H / 2} fill="#fff" opacity={0.1} />
      </g>
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} rx={2} fill="none" stroke="rgba(0,0,0,0.45)" />
    </svg>
  );
}

/** A flag drawn inside another SVG drawing (the map's army badges): `height` tall, top left at (x, y). */
export function FlagMark({ id, x = 0, y = 0, height }: { id: string; x?: number; y?: number; height: number }) {
  return (
    <svg x={x} y={y} width={height * 1.5} height={height} viewBox={`0 0 ${W} ${H}`}>
      {FLAGS[id] ?? FLAGS.neutral}
      <rect x={0.75} y={0.75} width={W - 1.5} height={H - 1.5} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={1.5} />
    </svg>
  );
}

/** Flag for whoever owns a province (neutral states use their own flag). */
export function OwnerFlag({ world, owner, province, size }: { world: World; owner: OwnerId; province?: ProvinceId; size?: number }) {
  const title = owner === 'neutral' ? (province ? world.provinces[province].neutral?.name : 'Neutral') : world.nations[owner]?.name;
  return <Flag id={flagKey(owner, province)} size={size} title={title} />;
}
