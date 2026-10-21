// Simplified national flags (3:2) for the six powers and the neutral states.
// Drawn inline so the UI needs no image assets.
import { useId, type ReactElement } from 'react';
import type { OwnerId, ProvinceId, World } from '../sim';

const W = 30;
const H = 20;

const h3 = (a: string, b: string, c: string) => (
  <>
    <rect width={W} height={H / 3} fill={a} />
    <rect y={H / 3} width={W} height={H / 3} fill={b} />
    <rect y={(2 * H) / 3} width={W} height={H / 3} fill={c} />
  </>
);
const v3 = (a: string, b: string, c: string) => (
  <>
    <rect width={W / 3} height={H} fill={a} />
    <rect x={W / 3} width={W / 3} height={H} fill={b} />
    <rect x={(2 * W) / 3} width={W / 3} height={H} fill={c} />
  </>
);

const FLAGS: Record<string, ReactElement> = {
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
  fr: v3('#1f4fa0', '#f4f4f4', '#e0383e'),
  de: h3('#121212', '#d40000', '#ffcc00'),
  it: v3('#0c8a46', '#f4f4f4', '#cd2b37'),
  es: (
    <>
      <rect width={W} height={H} fill="#b3171d" />
      <rect y={5} width={W} height={10} fill="#f6c100" />
    </>
  ),
  pl: (
    <>
      <rect width={W} height={H / 2} fill="#f4f4f4" />
      <rect y={H / 2} width={W} height={H / 2} fill="#dc143c" />
    </>
  ),
  'nt-benelux': v3('#151515', '#fdda24', '#ef3340'),
  'nt-netherlands': h3('#ae1c28', '#f4f4f4', '#21468b'),
  'nt-austria': h3('#c8102e', '#f4f4f4', '#c8102e'),
  'nt-denmark': (
    <>
      <rect width={W} height={H} fill="#c8102e" />
      <rect x={9} width={3.4} height={H} fill="#fff" />
      <rect y={8.3} width={W} height={3.4} fill="#fff" />
    </>
  ),
  'nt-switzerland': (
    <>
      <rect width={W} height={H} fill="#d52b1e" />
      <rect x={13.2} y={4.5} width={3.6} height={11} fill="#fff" />
      <rect x={9.5} y={8.2} width={11} height={3.6} fill="#fff" />
    </>
  ),
  'nt-czechia': (
    <>
      <rect width={W} height={H / 2} fill="#f4f4f4" />
      <rect y={H / 2} width={W} height={H / 2} fill="#d7141a" />
      <path d={`M0 0L15 10L0 ${H}Z`} fill="#11457e" />
    </>
  ),
  'nt-portugal': (
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

/** Flag for whoever owns a province (neutral states use their own flag). */
export function OwnerFlag({ world, owner, province, size }: { world: World; owner: OwnerId; province?: ProvinceId; size?: number }) {
  const title = owner === 'neutral' ? (province ? world.provinces[province].neutralState : 'Neutral') : world.nations[owner]?.name;
  return <Flag id={flagKey(owner, province)} size={size} title={title} />;
}
