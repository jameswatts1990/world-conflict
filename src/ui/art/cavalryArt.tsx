// Cavalry: a galloping horse with its rider. The horse is drawn in a local
// frame (ground y = 0, facing right, withers about 25 units high).
import type { ReactElement } from 'react';
import { withHeadgear, type Ctx, type Kit } from './context';
import { Soldier } from './figures';
import { InsigniaMark } from './Insignia';
import { CornerBadge, GROUND } from './infantryArt';
import { HORSE_COATS, LEATHER, OUTLINE, PENNANTS, STEEL_LIGHT, shade } from './palettes';
import { GroundShadow, Line, Segs, Shape, ellipse, r2, type P, type Seg } from './primitives';

const HOOF = '#2a2420';

const BODY =
  'M6 -25.5C9 -27.5 14 -32 19.2 -35.4L19.9 -37.8L21.0 -35.6C23.5 -33.8 26.6 -31 28.2 -28.6' +
  'C28.6 -27.4 27.6 -26.4 26.4 -26.6L22.6 -27.4C20.8 -27.6 19.6 -27.4 18.8 -26.2' +
  'C16.8 -23.4 14.8 -21.6 13.6 -19.6C12.6 -16.6 10.2 -14.2 6.4 -13.8C0 -13.0 -6 -13.4 -10 -14.4' +
  'C-14 -15 -17.6 -16.6 -19.6 -19.8C-20.8 -22.4 -19.6 -25.4 -16.4 -26C-12 -26.6 -6 -24.6 -2 -24.6C1.6 -24.6 4 -25.2 6 -25.5Z';

const TAIL =
  'M-17.6 -25.2C-23.6 -26.4 -28.8 -22.6 -32 -16.6C-29 -19.4 -26.4 -20.4 -24.4 -20.2' +
  'C-27.2 -17.8 -28.6 -14.8 -29.2 -12.4C-25.6 -16.6 -22 -19.8 -19.0 -21.8Z';

const MANE =
  'M6.2 -25.8C9.4 -28 14 -32.4 19.2 -35.6L17.4 -36.6C15.4 -36 13.2 -36 11.4 -36.6C12.8 -35.2 13.4 -34.2 13.2 -33.4' +
  'C11.2 -33.4 9.0 -33.4 7.0 -34.2C8.6 -32.6 9.2 -31.4 9.0 -30.4C7.2 -30.2 5.2 -29.8 3.4 -30.2C4.8 -29 5.6 -27.6 5.4 -26.6Z';

const BACK_LIGHT =
  'M-19.6 -26.4C-12 -27.6 -4 -25.4 6 -26.6C10 -28.6 14 -32.4 19.6 -36.6L20.4 -33.6C15.4 -30 11.6 -26.6 6.4 -23.8C-2 -22.6 -12 -23.8 -20.4 -22.6Z';

function horseLeg(pts: P[], coat: string, upper: number): Seg[] {
  return [
    { a: pts[0], b: pts[1], w: upper, fill: coat },
    { a: pts[1], b: pts[2], w: 3.0, fill: coat },
    { a: pts[2], b: pts[3], w: 1.9, fill: coat },
    { a: pts[3], b: pts[4], w: 2.4, fill: HOOF },
  ];
}

export interface HorseProps {
  x: number;
  y: number;
  s?: number;
  ow: number;
  coat: string;
  mane: string;
  cloth: string;
  nation: Ctx['nation'];
  accent?: string;
  /** Icon rendering: no bridle or muscle lines. */
  bold?: boolean;
}

export function Horse({ x, y, s = 1, ow, coat, mane, cloth, nation, accent, bold }: HorseProps) {
  const lw = ow / s;
  const far = shade(coat, -0.28);
  const farLegs = [
    ...horseLeg([[8, -16.4], [10.4, -12.6], [14.6, -9.8], [11.8, -6.4], [13.0, -4.9]], far, 4.0),
    ...horseLeg([[-12, -19], [-8.6, -13], [-12.4, -7.6], [-9.2, -2.2], [-7.4, -0.9]], far, 4.6),
  ];
  const nearLegs = [
    ...horseLeg([[9.5, -17], [12.4, -13.4], [18.6, -11.2], [23.8, -10.6], [25.6, -9.4]], coat, 4.2),
    ...horseLeg([[-13.5, -19.5], [-11.6, -14.2], [-18.6, -9.6], [-24.6, -5.6], [-26.4, -4.6]], coat, 5.0),
  ];
  return (
    <g transform={`translate(${r2(x)} ${r2(y)}) scale(${s})`}>
      <Segs segs={farLegs} ow={lw} />
      <path d={TAIL} fill={mane} stroke={OUTLINE} strokeWidth={lw} strokeLinejoin="round" />
      <Segs segs={nearLegs} ow={lw} />
      <Shape d={BODY} fill={coat} ow={lw} hi={BACK_LIGHT} lo={ellipse(-2, -12.2, 24, 4.2)} hiOpacity={0.16}>
        {!bold && <path d="M11 -18.6C13 -21 15.6 -24 18.6 -26.4" fill="none" stroke={shade(coat, -0.3)} strokeWidth={0.7} />}
        {!bold && <path d="M-15 -17.6C-12.6 -19.6 -12.4 -22.6 -14.6 -24.6" fill="none" stroke={shade(coat, -0.3)} strokeWidth={0.7} />}
      </Shape>
      <path d={MANE} fill={mane} stroke={OUTLINE} strokeWidth={lw * 0.8} strokeLinejoin="round" />
      {/* Head details: eye, nostril, bridle. */}
      <circle cx={22.8} cy={-31.6} r={bold ? 0.9 : 0.6} fill={OUTLINE} />
      {!bold && (
        <g>
          <path d="M26.4 -28.4Q27.2 -28.8 27.4 -28.0" fill="none" stroke={OUTLINE} strokeWidth={0.5} />
          <path d="M20.6 -34.8L23.2 -27.4M25.0 -31.0L26.0 -26.8M21.0 -34.6L23.6 -33.6" fill="none" stroke={LEATHER} strokeWidth={0.75} strokeLinecap="round" />
          <circle cx={24.2} cy={-27.4} r={0.55} fill={STEEL_LIGHT} stroke={OUTLINE} strokeWidth={0.3} />
        </g>
      )}
      {/* Saddle cloth with national badge, girth and saddle. */}
      <Shape d="M-8.6 -25.2L4.8 -25.6L5.4 -18.4Q5.2 -16.6 3.4 -16.6L-7.0 -16.8Q-8.8 -16.8 -8.8 -18.6Z" fill={cloth} ow={lw * 0.85} hi="M-9 -26L6 -26V-23.6H-9Z" />
      {!bold && <path d="M-8.2 -18.0L4.8 -17.8" stroke="#e6dcc0" strokeWidth={0.5} opacity={0.6} />}
      <InsigniaMark nation={nation} accent={accent} cx={-4.6} cy={-21.0} r={bold ? 3 : 2.3} ow={bold ? 0.8 : 0.4} />
      <Line pts={[[3.2, -16.8], [3.6, -13.8]]} w={1.2} stroke={LEATHER} opacity={1} />
      <path d="M-6.8 -24.4Q-7.4 -27.4 -5 -27.2Q-1 -25.8 2.6 -26.8Q4.8 -27.6 5.0 -25.0Z" fill={LEATHER} stroke={OUTLINE} strokeWidth={lw * 0.8} strokeLinejoin="round" />
    </g>
  );
}

export function drawCavalry(ctx: Ctx): ReactElement {
  const { ow, nation, pattern, gen } = ctx;
  let kit: Kit = { ...ctx.kit, jackboots: true };
  let cuirass = false;
  if (gen === 'ww1') {
    if (pattern === 'fr') {
      kit = { ...withHeadgear(ctx, 'cuirassier'), jackboots: true };
      cuirass = true;
    } else if (pattern === 'de') {
      kit = { ...withHeadgear(ctx, 'czapka'), jackboots: true };
    }
  }
  const coat = HORSE_COATS[nation];
  const hx = 43;
  const hy = GROUND;
  const s = 1.02;
  const rx = hx - 1.2 * s;
  const ry = hy - 14.2 * s;
  const pose = gen === 'ww1' ? 'rideLance' : gen === 'interwar' ? 'rideSabre' : 'rideReins';
  // Reins run from the rider's hand to the bit.
  const hand: P = [rx + 8.0 * s, ry - 16.2 * s];
  const bit: P = [hx + 24.2 * s, hy - 27.4 * s];
  return (
    <g>
      <GroundShadow cx={44} cy={GROUND} rx={34} ry={4} />
      <CornerBadge ctx={ctx} />
      <Horse x={hx} y={hy} s={s} ow={ow} coat={coat.coat} mane={coat.mane} cloth={shade(ctx.kit.uniform, -0.42)} nation={nation} accent={ctx.accent} />
      <Soldier
        kit={kit}
        pose={pose}
        x={rx}
        y={ry}
        s={s}
        ow={ow}
        cuirass={cuirass}
        arm={gen === 'ww1' ? 'lance' : undefined}
        hand={gen === 'interwar' ? 'sabre' : undefined}
        back={gen === 'ww2' ? 'slungRifle' : undefined}
        pennant={PENNANTS[nation]}
      />
      <path d={`M${r2(hand[0])} ${r2(hand[1])}Q${r2((hand[0] + bit[0]) / 2)} ${r2(hand[1] + 3.2)} ${r2(bit[0])} ${r2(bit[1])}`} fill="none" stroke={LEATHER} strokeWidth={0.7} />
    </g>
  );
}
