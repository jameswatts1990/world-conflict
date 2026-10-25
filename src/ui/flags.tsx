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
  ro: { dir: 'v', colors: ['#002b7f', '#fcd116', '#ce1126'] },
  rs: { dir: 'h', colors: ['#c6363c', '#0c4076', '#f4f4f4'] },
  sk: { dir: 'h', colors: ['#f4f4f4', '#0b4ea2', '#ee1c25'] },
  si: { dir: 'h', colors: ['#f4f4f4', '#005da4', '#ed1c24'] },
  hr: { dir: 'h', colors: ['#d4172a', '#f4f4f4', '#171796'] },
  ie: { dir: 'v', colors: ['#169b62', '#f4f4f4', '#ff883e'] },
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

/** Croatia's red and white chequy shield. */
function chequy(x: number, y: number, size: number): ReactElement {
  const cells = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) cells.push(<rect key={`${r}-${c}`} x={x + c * size} y={y + r * size} width={size} height={size} fill={(r + c) % 2 ? '#f4f4f4' : '#d4172a'} />);
  }
  return (
    <>
      {cells}
      <rect x={x} y={y} width={3 * size} height={4 * size} fill="none" stroke="#171796" strokeWidth={0.5} />
    </>
  );
}

const FLAGS: Record<string, ReactElement> = {
  ...Object.fromEntries(Object.entries(STRIPED).map(([id, s]) => [id, stripes(s)])),
  // Stripes shared with another flag: their shields tell them apart (the 3D models fly the stripes alone).
  sk: (
    <>
      {stripes(STRIPED.sk)}
      <path d="M7 4.6H14V11.4Q14 15 10.5 16.4Q7 15 7 11.4Z" fill="#ee1c25" stroke="#f4f4f4" strokeWidth={0.9} />
      <path d="M10.5 6.4V14M8.6 8.4H12.4M8.1 10.6H12.9" stroke="#f4f4f4" strokeWidth={0.9} />
      <path d="M7.9 14Q9.2 12.6 10.5 14Q11.8 12.6 13.1 14L12.4 15.1Q10.5 16.6 8.6 15.1Z" fill="#0b4ea2" />
    </>
  ),
  si: (
    <>
      {stripes(STRIPED.si)}
      <path d="M5 3.2H10.4V7.6Q10.4 10.4 7.7 11.4Q5 10.4 5 7.6Z" fill="#005da4" stroke="#ed1c24" strokeWidth={0.7} />
      <path d="M5.7 8.4L6.9 6.6L7.7 7.6L8.6 5.6L9.7 8.4" fill="none" stroke="#f4f4f4" strokeWidth={0.7} />
    </>
  ),
  hr: (
    <>
      {stripes(STRIPED.hr)}
      {chequy(12.3, 4.4, 1.8)}
    </>
  ),
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
