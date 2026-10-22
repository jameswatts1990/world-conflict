// Soldier figures: a posable outlined figure with national headgear, plus the
// small arms and kit they carry. Figures are drawn in a local frame with the
// feet on y = 0, facing right, about 28 units tall, then placed by transform.
import type { ReactNode } from 'react';
import type { Headgear, Kit } from './context';
import {
  BLADE,
  BRASS,
  BRASS_DARK,
  FLAME,
  FLAME_CORE,
  LEATHER,
  LEATHER_LIGHT,
  OUTLINE,
  SKIN,
  SKIN_DARK,
  STEEL,
  STEEL_LIGHT,
  WOOD,
  WOOD_DARK,
  shade,
} from './palettes';
import { Limb, Pennant, Segs, Shape, add, dirOf, ellipse, lerp, pathOf, polyOf, r2, rect, rrect, type P, type Seg } from './primitives';

const TORSO_W = 6.4;
const LEG_W = 3.3;
const SHIN_W = 2.9;
const ARM_W = 2.5;
const HEAD_R = 2.8;

export type PoseName =
  | 'stand'
  | 'kneelAim'
  | 'prone'
  | 'sitGun'
  | 'crouchRun'
  | 'throw'
  | 'stab'
  | 'hike'
  | 'seated'
  | 'crewStand'
  | 'crewKneel'
  | 'rideLance'
  | 'rideSabre'
  | 'rideReins';

interface PoseDef {
  head: P;
  tilt: number;
  neck: P;
  hip: P;
  /** hip, knee, ankle; omitted when the legs are hidden (seated in a vehicle). */
  legB?: P[];
  toeB?: P;
  legF?: P[];
  toeF?: P;
  /** shoulder, elbow, hand */
  armB: P[];
  armF: P[];
  /** Long-arm line from butt to muzzle. */
  grip?: [P, P];
}

const POSES: Record<PoseName, PoseDef> = {
  stand: {
    head: [1.5, -25.0],
    tilt: 0,
    neck: [0.9, -19.4],
    hip: [0, -13.4],
    legB: [[-0.4, -13], [-1.4, -7], [-2.6, -1.3]],
    toeB: [-0.3, -1.0],
    legF: [[0.4, -13], [1.8, -7], [2.4, -1.3]],
    toeF: [4.8, -1.0],
    armB: [[0.4, -19.4], [-0.6, -15.8], [2.2, -14.4]],
    armF: [[1.3, -19.4], [4.0, -15.8], [8.2, -16.6]],
    grip: [[-0.8, -13.4], [17.4, -19.6]],
  },
  kneelAim: {
    head: [3.1, -20.6],
    tilt: 8,
    neck: [1.5, -15.6],
    hip: [0, -9],
    legB: [[-0.4, -8.8], [0.6, -1.6], [-4.4, -2.6]],
    toeB: [-3.4, -0.6],
    legF: [[0.4, -8.8], [5.4, -9.2], [5.6, -1.3]],
    toeF: [8.0, -1.0],
    armB: [[1.2, -15.4], [0.9, -12.4], [3.6, -16.4]],
    armF: [[1.9, -15.4], [6.0, -12.8], [9.4, -16.8]],
    grip: [[0.2, -16.3], [18.8, -17.4]],
  },
  prone: {
    head: [1.4, -6.8],
    tilt: -6,
    neck: [-2.6, -4.6],
    hip: [-9, -3.4],
    legB: [[-9.4, -3.0], [-14.4, -2.2], [-19.6, -2.2]],
    toeB: [-20.2, -0.2],
    legF: [[-8.6, -3.2], [-13.6, -3.6], [-18.2, -3.4]],
    toeF: [-18.8, -1.0],
    armB: [[-2.2, -5.2], [0.4, -1.6], [3.6, -5.6]],
    armF: [[-1.8, -5.0], [4.4, -1.6], [7.2, -5.6]],
    grip: [[0.2, -6.8], [34, -7.2]],
  },
  sitGun: {
    head: [4.0, -14.8],
    tilt: 6,
    neck: [2.4, -10.2],
    hip: [0, -4.0],
    legB: [[-0.3, -3.8], [4.2, -7.0], [6.8, -1.3]],
    toeB: [9.0, -1.0],
    legF: [[0.3, -3.8], [5.4, -6.4], [8.4, -1.3]],
    toeF: [10.6, -1.0],
    armB: [[2.2, -9.6], [4.4, -6.6], [7.6, -8.6]],
    armF: [[2.8, -9.6], [5.4, -7.0], [8.4, -9.0]],
  },
  crouchRun: {
    head: [6.6, -20.2],
    tilt: 14,
    neck: [4.2, -16.6],
    hip: [0, -11],
    legF: [[0.4, -11], [5.0, -7.4], [4.6, -1.3]],
    toeF: [7.0, -1.0],
    legB: [[-0.4, -11], [-3.0, -6.2], [-7.2, -2.8]],
    toeB: [-5.2, -0.6],
    armB: [[3.4, -16.2], [2.6, -12.0], [5.0, -12.4]],
    armF: [[4.4, -16.4], [7.4, -12.4], [10.0, -13.9]],
    grip: [[1.6, -11.4], [17.4, -16.0]],
  },
  throw: {
    head: [0.2, -24.2],
    tilt: -4,
    neck: [-0.6, -18.8],
    hip: [0, -12.6],
    legF: [[0.5, -12.6], [4.6, -8.0], [6.8, -1.3]],
    toeF: [9.2, -1.0],
    legB: [[-0.5, -12.6], [-3.2, -7.0], [-6.8, -2.4]],
    toeB: [-4.8, -0.6],
    armB: [[-0.2, -18.6], [3.4, -17.6], [6.8, -19.4]],
    armF: [[-0.8, -18.8], [-4.6, -20.4], [-5.6, -25.2]],
  },
  stab: {
    head: [4.4, -22.4],
    tilt: 6,
    neck: [2.6, -17.6],
    hip: [0, -11.6],
    legF: [[0.4, -11.6], [4.8, -7.6], [5.2, -1.3]],
    toeF: [7.6, -1.0],
    legB: [[-0.4, -11.6], [-3.4, -6.6], [-7.0, -2.6]],
    toeB: [-5.0, -0.6],
    armB: [[2.2, -17.2], [4.2, -13.4], [7.4, -14.0]],
    armF: [[3.0, -17.4], [6.0, -20.4], [7.2, -25.0]],
  },
  hike: {
    head: [3.3, -24.9],
    tilt: 6,
    neck: [1.8, -19.6],
    hip: [0, -13.4],
    legF: [[0.4, -13.2], [3.8, -8.4], [5.4, -2.6]],
    toeF: [7.6, -2.6],
    legB: [[-0.4, -13.2], [-1.8, -7.0], [-4.0, -0.9]],
    toeB: [-1.8, -0.6],
    armB: [[1.5, -19.2], [0.2, -15.0], [1.0, -12.0]],
    armF: [[2.1, -19.2], [4.4, -15.0], [7.3, -16.8]],
    grip: [[9.6, -2.0], [6.2, -24.0]],
  },
  seated: {
    head: [1.6, -17.0],
    tilt: 0,
    neck: [0.7, -11.6],
    hip: [0, -5.4],
    armB: [[0.4, -11.4], [2.0, -7.4], [5.0, -7.4]],
    armF: [[1.2, -11.4], [3.8, -8.6], [5.5, -12.2]],
    grip: [[4.6, -1.0], [6.6, -25.0]],
  },
  crewStand: {
    head: [2.0, -24.8],
    tilt: 4,
    neck: [1.0, -19.4],
    hip: [0, -13.4],
    legB: [[-0.4, -13], [-1.4, -7], [-2.6, -1.3]],
    toeB: [-0.3, -1.0],
    legF: [[0.4, -13], [1.8, -7], [2.4, -1.3]],
    toeF: [4.8, -1.0],
    armB: [[0.6, -19.2], [1.4, -15.0], [4.4, -15.4]],
    armF: [[1.4, -19.2], [3.6, -14.8], [8.6, -15.6]],
    grip: [[3.2, -15.5], [11.2, -15.5]],
  },
  rideLance: {
    head: [3.2, -24.6],
    tilt: 4,
    neck: [1.8, -19.2],
    hip: [0, -13.4],
    legF: [[0.3, -13.2], [5.2, -9.4], [3.6, -3.2]],
    toeF: [5.8, -3.0],
    armB: [[1.6, -18.8], [4.6, -15.6], [8.0, -16.2]],
    armF: [[2.2, -18.8], [0.4, -15.6], [4.2, -15.4]],
    grip: [[-12, -16.4], [46, -11.6]],
  },
  rideSabre: {
    head: [3.4, -24.4],
    tilt: 2,
    neck: [1.9, -19.2],
    hip: [0, -13.4],
    legF: [[0.3, -13.2], [5.2, -9.4], [3.6, -3.2]],
    toeF: [5.8, -3.0],
    armB: [[1.6, -18.8], [4.6, -15.6], [8.0, -16.2]],
    armF: [[2.2, -18.8], [5.8, -18.4], [9.2, -19.8]],
  },
  rideReins: {
    head: [3.2, -24.6],
    tilt: 4,
    neck: [1.8, -19.2],
    hip: [0, -13.4],
    legF: [[0.3, -13.2], [5.2, -9.4], [3.6, -3.2]],
    toeF: [5.8, -3.0],
    armB: [[1.6, -18.8], [4.6, -15.6], [8.0, -16.2]],
    armF: [[2.2, -18.8], [4.4, -15.0], [8.4, -15.6]],
  },
  crewKneel: {
    head: [3.4, -20.2],
    tilt: 4,
    neck: [1.8, -15.4],
    hip: [0, -9],
    legB: [[-0.4, -8.8], [0.6, -1.6], [-4.4, -2.6]],
    toeB: [-3.4, -0.6],
    legF: [[0.4, -8.8], [5.4, -9.2], [5.6, -1.3]],
    toeF: [8.0, -1.0],
    armB: [[1.4, -15.2], [2.8, -11.4], [5.8, -11.2]],
    armF: [[2.2, -15.2], [5.4, -13.2], [8.6, -14.6]],
  },
};

// ---------------------------------------------------------------------------
// Headgear

interface HatPart {
  d: string;
  fill: string;
  stroke?: boolean;
}

/** Headgear outline paths around a head of radius 2.8 centred on the origin, facing right. */
function headgearParts(kind: Headgear, hat: string): HatPart[] {
  const dark = shade(hat, -0.3);
  const peak = '#2a2622';
  switch (kind) {
    case 'brodie':
      return [
        { d: 'M-2.9 -1.0C-2.9 -4.9 2.9 -4.9 2.9 -1.0Z', fill: hat },
        { d: 'M-5.9 -0.5Q0 -2.4 6.1 -1.0Q0 -0.3 -5.9 -0.5Z', fill: shade(hat, -0.12) },
      ];
    case 'adrian':
      return [
        { d: 'M-2.5 -3.0C-1.4 -6.2 1.5 -6.2 2.6 -2.9L1.9 -2.7C1.1 -4.7 -1.0 -4.7 -1.8 -2.8Z', fill: shade(hat, -0.1) },
        { d: 'M-3.0 -0.8C-3.1 -4.6 3.1 -4.6 3.0 -0.8Z', fill: hat },
        { d: 'M-5.0 0.5Q-3.4 -1.3 0 -1.0Q3.6 -1.3 5.5 0.2Q3.4 -0.3 0 -0.2Q-3.2 -0.3 -5.0 0.5Z', fill: shade(hat, -0.1) },
        { d: ellipse(2.1, -2.0, 0.55, 0.65), fill: shade(hat, 0.35), stroke: false },
      ];
    case 'pickelhaube':
      return [
        { d: 'M-0.5 -4.3L0 -7.6L0.5 -4.3Z', fill: BRASS },
        { d: 'M-1.1 -3.7L1.1 -3.7L0.7 -4.6L-0.7 -4.6Z', fill: BRASS },
        { d: 'M-2.8 -0.8C-3.0 -5.0 2.9 -5.0 2.8 -0.8Z', fill: hat },
        { d: 'M2.0 -1.0L5.1 -0.1L2.4 0.1Z', fill: hat },
        { d: 'M-2.4 -1.0L-4.3 0.7L-2.2 0.3Z', fill: hat },
        { d: ellipse(1.8, -2.3, 0.8, 1.0), fill: BRASS },
      ];
    case 'stahlhelm16':
      return [
        { d: 'M3.9 -1.2L2.7 -1.8C2.9 -5.5 -3.2 -5.5 -3.1 -1.8L-3.4 1.2L-4.7 2.5L-1.9 2.2L-0.4 -0.9Z', fill: hat },
        { d: ellipse(-1.0, -2.2, 0.55, 0.55), fill: shade(hat, -0.2) },
      ];
    case 'stahlhelm35':
      return [{ d: 'M3.5 -1.2L2.6 -1.8C2.9 -5.3 -3.1 -5.3 -3.0 -1.7L-3.2 0.9L-4.0 1.6L-1.7 1.4L-0.3 -0.9Z', fill: hat }];
    case 'm26':
      return [
        { d: 'M3.7 -1.1L2.6 -1.7C2.9 -5.5 -3.1 -5.5 -3.0 -1.6L-3.2 1.0L-4.1 1.9L-1.8 1.6L-0.3 -0.9Z', fill: hat },
        { d: ellipse(1.2, -3.3, 0.5, 0.5), fill: shade(hat, 0.2), stroke: false },
      ];
    case 'm33':
      return [
        { d: 'M-3.1 -0.4C-3.2 -4.9 3.2 -4.9 3.1 -0.6Z', fill: hat },
        { d: 'M-4.0 0.6Q0 -1.5 4.2 -0.5Q0 -0.3 -4.0 0.6Z', fill: shade(hat, -0.1) },
      ];
    case 'wz31':
      return [
        { d: 'M-3.2 -0.6C-3.3 -5.1 3.3 -5.1 3.2 -0.8Z', fill: hat },
        { d: 'M-4.6 1.1Q0 -1.7 4.4 0.0Q0 -0.4 -4.6 1.1Z', fill: shade(hat, -0.1) },
      ];
    case 'plain':
      return [
        { d: 'M-3.1 -0.5C-3.2 -4.9 3.2 -4.9 3.1 -0.5Z', fill: hat },
        { d: 'M-3.7 0.1Q0 -1.2 3.8 -0.4Q0 -0.4 -3.7 0.1Z', fill: shade(hat, -0.12) },
      ];
    case 'trubia':
      return [
        { d: 'M-3.2 -0.4C-3.3 -5.0 3.3 -5.0 3.2 -0.4Z', fill: hat },
        { d: 'M-1.8 -3.7C-0.8 -5.3 1.0 -5.3 2.0 -3.6L1.4 -3.4C0.7 -4.4 -0.6 -4.4 -1.2 -3.4Z', fill: shade(hat, -0.15) },
        { d: 'M-4.3 0.7Q0 -1.3 4.5 0.3Q0 -0.2 -4.3 0.7Z', fill: shade(hat, -0.12) },
      ];
    case 'kepi':
      return [
        { d: 'M-2.8 -0.9L-2.4 -5.2L2.6 -4.7L2.9 -0.9Z', fill: hat },
        { d: 'M-2.8 -0.9L-2.7 -2.0L2.85 -2.0L2.9 -0.9Z', fill: '#8a2a22' },
        { d: 'M-2.4 -5.2L2.6 -4.7L2.6 -4.1L-2.45 -4.6Z', fill: dark, stroke: false },
        { d: 'M2.3 -1.0L5.4 -0.1L2.6 0.1Z', fill: peak },
      ];
    case 'maciejowka':
      return [
        { d: 'M-2.9 -0.9C-3.4 -3.0 -2.8 -4.5 -1.6 -4.9L2.8 -4.3C3.2 -3.0 3.0 -1.8 2.9 -0.9Z', fill: hat },
        { d: 'M-2.9 -0.9L-2.95 -2.0L2.95 -2.0L2.9 -0.9Z', fill: dark },
        { d: 'M2.3 -1.0L5.3 -0.2L2.6 0.1Z', fill: peak },
        { d: ellipse(1.9, -3.0, 0.5, 0.55), fill: '#e8e4d8', stroke: false },
      ];
    case 'alpini':
      return [
        { d: 'M-1.4 -2.9C-2.6 -5.0 -4.4 -6.6 -6.6 -7.6C-4.6 -6.0 -3.4 -4.6 -2.4 -2.5Z', fill: '#141414' },
        { d: 'M-2.6 -1.4C-2.6 -5.6 2.4 -5.8 2.8 -1.6Z', fill: hat },
        { d: 'M-2.6 -1.5L2.75 -1.7L2.7 -2.5L-2.6 -2.3Z', fill: '#2a2a26', stroke: false },
        { d: 'M-5.0 -2.8Q-3.0 -1.2 0 -1.4Q3.6 -1.6 5.6 -0.2Q3.2 -0.5 0 -0.6Q-3.6 -0.4 -5.0 -2.8Z', fill: shade(hat, -0.1) },
        { d: ellipse(-1.8, -2.4, 0.75, 0.75), fill: '#3f7a4a' },
      ];
    case 'beret':
      return [
        { d: 'M-6.2 0.4C-6.7 -2.8 -3.6 -4.8 0.4 -4.8C3.7 -4.8 4.5 -3.1 3.6 -1.8C2.0 -1.0 -1.0 -1.4 -3.0 -1.0C-4.2 -0.8 -5.4 0.4 -6.2 0.4Z', fill: hat },
        { d: ellipse(2.1, -2.7, 0.55, 0.55), fill: '#d7b44a' },
      ];
    case 'bergmutze':
      return [
        { d: 'M-3.0 -0.8L-2.9 -4.3Q0 -5.3 2.8 -4.2L3.0 -0.9Z', fill: hat },
        { d: 'M-3.0 -0.8L-3.0 -2.0L2.95 -2.1L3.0 -0.9Z', fill: shade(hat, -0.12), stroke: false },
        { d: 'M2.3 -1.2L5.1 -0.4L2.7 -0.2Z', fill: shade(hat, -0.15) },
      ];
    case 'fez':
      return [
        { d: 'M-2.7 -1.4L-2.0 -5.9L2.0 -5.3L2.9 -1.6Z', fill: hat },
        { d: 'M-1.5 -5.7Q-3.9 -5.7 -4.6 -2.6', fill: 'none' },
        { d: ellipse(-4.6, -2.2, 0.6, 0.9), fill: hat },
      ];
    case 'cuirassier':
      return [
        { d: 'M-1.0 -5.5C-4.0 -5.8 -6.6 -4.0 -7.6 1.8C-6.2 -1.6 -4.6 -3.0 -2.4 -3.6Z', fill: '#1a1714' },
        { d: 'M-2.9 -0.8C-3.0 -4.8 2.9 -4.8 2.8 -0.8Z', fill: hat },
        { d: 'M-2.2 -3.5C-1.4 -6.6 1.8 -6.6 2.6 -3.3L2.0 -3.2C1.2 -5.0 -1.0 -5.0 -1.5 -3.2Z', fill: BRASS },
        { d: 'M2.1 -1.0L4.9 -0.1L2.4 0.1Z', fill: '#26262b' },
      ];
    case 'czapka':
      return [
        { d: 'M-1.4 -3.8L-1.0 -5.3L-3.9 -7.6L3.4 -8.4L1.2 -5.3L1.6 -3.8Z', fill: hat },
        { d: 'M-3.9 -7.6L3.4 -8.4L3.6 -7.6L-3.7 -6.8Z', fill: shade(hat, -0.2) },
        { d: 'M-2.8 -0.9L-2.7 -4.0L2.8 -3.8L2.9 -0.9Z', fill: hat },
        { d: 'M2.3 -1.0L5.2 -0.1L2.6 0.1Z', fill: peak },
        { d: ellipse(1.9, -2.4, 0.55, 0.7), fill: BRASS },
      ];
  }
}

export function Hat({ kind, hat, ow, edelweiss }: { kind: Headgear; hat: string; ow: number; edelweiss?: boolean }) {
  const parts = headgearParts(kind, hat);
  return (
    <g strokeLinejoin="round">
      {parts.map((p, i) =>
        p.fill === 'none' ? (
          <path key={i} d={p.d} fill="none" stroke={OUTLINE} strokeWidth={0.7} strokeLinecap="round" />
        ) : (
          <path key={i} d={p.d} fill={p.fill} stroke={p.stroke === false ? 'none' : OUTLINE} strokeWidth={ow * 0.85} />
        ),
      )}
      {kind === 'brodie' && <path d="M1.2 -1.0L1.9 2.4" stroke={LEATHER} strokeWidth={0.45} />}
      {edelweiss && (
        <g>
          <circle cx={-1.2} cy={-2.9} r={0.85} fill="#f4f1e6" stroke={OUTLINE} strokeWidth={0.3} />
          <circle cx={-1.2} cy={-2.9} r={0.32} fill="#e0c24a" />
        </g>
      )}
    </g>
  );
}

function Head({ at, tilt, kit, ow, edelweiss, bold }: { at: P; tilt: number; kit: Kit; ow: number; edelweiss?: boolean; bold?: boolean }) {
  return (
    <g transform={`translate(${r2(at[0])} ${r2(at[1])}) rotate(${tilt})`}>
      <circle cx={0} cy={0} r={HEAD_R} fill={SKIN} stroke={OUTLINE} strokeWidth={ow} />
      {!bold && (
        <g>
          <path d="M-2.2 1.3Q0 3.2 2.4 1.5Q1.6 2.8 0 2.8Q-1.6 2.6 -2.2 1.3Z" fill={SKIN_DARK} opacity={0.6} />
          <path d="M2.6 -0.6L3.6 0.6L2.7 0.9Z" fill={SKIN} stroke={OUTLINE} strokeWidth={ow * 0.6} strokeLinejoin="round" />
          <circle cx={-0.5} cy={0.4} r={0.75} fill={SKIN_DARK} />
          <circle cx={1.6} cy={-0.2} r={0.38} fill={OUTLINE} />
        </g>
      )}
      <Hat kind={kit.headgear} hat={kit.hat} ow={ow} edelweiss={edelweiss && !bold} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Small arms (drawn along a butt -> muzzle line)

export type LongArm = 'rifle' | 'bayonet' | 'carbine' | 'smg' | 'flamer' | 'alpenstock' | 'iceaxe' | 'shell' | 'atRifle' | 'lance';

function Lance({ from, to, ow, pennant }: { from: P; to: P; ow: number; pennant?: [string, string] }) {
  const { d } = dirOf(from, to);
  const at = add(to, d, -4.2);
  return (
    <g>
      <Segs
        ow={ow * 0.6}
        segs={[
          { a: from, b: to, w: 0.95, fill: '#9c7a4e' },
          { a: add(to, d, -2.2), b: add(to, d, 0.6), w: 1.0, fill: STEEL_LIGHT },
        ]}
      />
      {pennant && <Pennant at={[at[0], at[1] + 0.2]} len={7.4} h={3.4} colors={pennant} ow={ow * 0.55} />}
    </g>
  );
}

export function Rifle({ from, to, ow, bayonet }: { from: P; to: P; ow: number; bayonet?: boolean }) {
  const segs: Seg[] = [
    { a: lerp(from, to, 0.28), b: to, w: 0.75, fill: STEEL },
    { a: lerp(from, to, 0.02), b: lerp(from, to, 0.3), w: 1.9, fill: WOOD },
    { a: lerp(from, to, 0.3), b: lerp(from, to, 0.82), w: 1.15, fill: WOOD },
  ];
  if (bayonet) segs.unshift({ a: lerp(from, to, 0.97), b: lerp(from, to, 1.3), w: 0.55, fill: BLADE });
  return <Segs segs={segs} ow={ow * 0.7} />;
}

function Smg({ from, to, ow }: { from: P; to: P; ow: number }) {
  const { n } = dirOf(from, to);
  const magBase = lerp(from, to, 0.52);
  return (
    <g>
      <Segs
        ow={ow * 0.7}
        segs={[
          { a: lerp(from, to, 0.62), b: to, w: 0.75, fill: STEEL },
          { a: magBase, b: add(magBase, n, -3.2), w: 1.0, fill: STEEL, cap: 'butt' },
          { a: lerp(from, to, 0.28), b: lerp(from, to, 0.72), w: 1.5, fill: shade(STEEL, -0.2) },
          { a: from, b: lerp(from, to, 0.3), w: 0.6, fill: STEEL },
        ]}
      />
    </g>
  );
}

function FlameWand({ from, to, ow }: { from: P; to: P; ow: number }) {
  const { d, n } = dirOf(from, to);
  const tip = add(to, d, 0.4);
  const flame = [
    `M${r2(tip[0])} ${r2(tip[1])}`,
    `Q${r2(tip[0] + d[0] * 3 + n[0] * 2.4)} ${r2(tip[1] + d[1] * 3 + n[1] * 2.4)} ${r2(tip[0] + d[0] * 7.5 + n[0] * 0.6)} ${r2(tip[1] + d[1] * 7.5 + n[1] * 0.6)}`,
    `Q${r2(tip[0] + d[0] * 5 - n[0] * 0.4)} ${r2(tip[1] + d[1] * 5 - n[1] * 0.4)} ${r2(tip[0] + d[0] * 6 - n[0] * 1.8)} ${r2(tip[1] + d[1] * 6 - n[1] * 1.8)}`,
    `Q${r2(tip[0] + d[0] * 2.4 - n[0] * 1.6)} ${r2(tip[1] + d[1] * 2.4 - n[1] * 1.6)} ${r2(tip[0])} ${r2(tip[1])}Z`,
  ].join('');
  const core = [
    `M${r2(tip[0])} ${r2(tip[1])}`,
    `Q${r2(tip[0] + d[0] * 2.4 + n[0] * 1.1)} ${r2(tip[1] + d[1] * 2.4 + n[1] * 1.1)} ${r2(tip[0] + d[0] * 4.6 + n[0] * 0.3)} ${r2(tip[1] + d[1] * 4.6 + n[1] * 0.3)}`,
    `Q${r2(tip[0] + d[0] * 2.6 - n[0] * 0.9)} ${r2(tip[1] + d[1] * 2.6 - n[1] * 0.9)} ${r2(tip[0])} ${r2(tip[1])}Z`,
  ].join('');
  return (
    <g>
      <Segs ow={ow * 0.7} segs={[{ a: from, b: to, w: 1.1, fill: STEEL }, { a: lerp(from, to, 0.05), b: lerp(from, to, 0.28), w: 1.5, fill: WOOD_DARK }]} />
      <path d={flame} fill={FLAME} stroke="#a3480f" strokeWidth={0.5} strokeLinejoin="round" />
      <path d={core} fill={FLAME_CORE} />
    </g>
  );
}

function Shell({ from, to, ow }: { from: P; to: P; ow: number }) {
  const { n } = dirOf(from, to);
  const mid = lerp(from, to, 0.55);
  const tip = to;
  const nose = polyOf([add(mid, n, 1.25), add(lerp(mid, tip, 0.6), n, 1.05), tip, add(lerp(mid, tip, 0.6), n, -1.05), add(mid, n, -1.25)]);
  return (
    <g>
      <Shape d={polyOf([add(from, n, 1.25), add(mid, n, 1.25), add(mid, n, -1.25), add(from, n, -1.25)])} fill={BRASS} ow={ow * 0.7} hi={polyOf([add(from, n, 1.25), add(mid, n, 1.25), add(mid, n, 0.3), add(from, n, 0.3)])} />
      <Shape d={nose} fill="#6b6f62" ow={ow * 0.7} />
    </g>
  );
}

function Alpenstock({ from, to, ow, axe }: { from: P; to: P; ow: number; axe?: boolean }) {
  const { d, n } = dirOf(from, to);
  return (
    <g>
      <Segs ow={ow * 0.6} segs={[{ a: from, b: to, w: 0.9, fill: WOOD }, { a: from, b: lerp(from, to, 0.06), w: 0.9, fill: STEEL_LIGHT }]} />
      {axe && <Limb pts={[add(add(to, d, -0.2), n, -2.4), add(add(to, d, 0.4), n, 2.2)]} w={0.9} fill={STEEL_LIGHT} ow={ow * 0.6} />}
    </g>
  );
}

function AtRifle({ from, to, ow }: { from: P; to: P; ow: number }) {
  const bip = lerp(from, to, 0.62);
  return (
    <g>
      <Segs
        ow={ow * 0.6}
        segs={[
          { a: bip, b: [bip[0] - 1.6, 0], w: 0.55, fill: STEEL },
          { a: bip, b: [bip[0] + 1.6, 0], w: 0.55, fill: STEEL },
        ]}
      />
      <Segs
        ow={ow * 0.7}
        segs={[
          { a: lerp(from, to, 0.3), b: to, w: 0.85, fill: STEEL },
          { a: lerp(from, to, 0.96), b: lerp(from, to, 1.02), w: 1.6, fill: STEEL, cap: 'butt' },
          { a: from, b: lerp(from, to, 0.18), w: 1.8, fill: WOOD },
          { a: lerp(from, to, 0.16), b: lerp(from, to, 0.36), w: 1.4, fill: shade(STEEL, -0.15) },
        ]}
      />
    </g>
  );
}

function LongArmItem({ kind, grip, ow, pennant }: { kind: LongArm; grip: [P, P]; ow: number; pennant?: [string, string] }) {
  const [a, b] = grip;
  switch (kind) {
    case 'rifle':
      return <Rifle from={a} to={b} ow={ow} />;
    case 'bayonet':
      return <Rifle from={a} to={b} ow={ow} bayonet />;
    case 'carbine':
      return <Rifle from={a} to={lerp(a, b, 0.82)} ow={ow} />;
    case 'smg':
      return <Smg from={lerp(a, b, 0.1)} to={lerp(a, b, 0.66)} ow={ow} />;
    case 'flamer':
      return <FlameWand from={lerp(a, b, 0.08)} to={lerp(a, b, 0.78)} ow={ow} />;
    case 'alpenstock':
      return <Alpenstock from={a} to={b} ow={ow} />;
    case 'iceaxe':
      return <Alpenstock from={a} to={lerp(a, b, 0.7)} ow={ow} axe />;
    case 'shell':
      return <Shell from={a} to={b} ow={ow} />;
    case 'atRifle':
      return <AtRifle from={a} to={b} ow={ow} />;
    case 'lance':
      return <Lance from={a} to={b} ow={ow} pennant={pennant} />;
  }
}

// ---------------------------------------------------------------------------
// Items held in one hand

export type HandItem = 'stickGrenade' | 'eggGrenade' | 'dagger' | 'sabre';

function HandHeld({ kind, at, ow }: { kind: HandItem; at: P; ow: number }) {
  const [x, y] = at;
  switch (kind) {
    case 'stickGrenade':
      return (
        <g>
          <Limb pts={[[x + 0.6, y + 1.6], [x - 1.2, y - 3.4]]} w={0.9} fill={WOOD} ow={ow * 0.6} />
          <Shape d={rrect(x - 2.4, y - 6.4, 2.6, 3.2, 0.5)} fill="#55594e" ow={ow * 0.7} />
        </g>
      );
    case 'eggGrenade':
      return (
        <g>
          <path d={ellipse(x - 0.2, y - 1.4, 1.25, 1.55)} fill="#4d5a38" stroke={OUTLINE} strokeWidth={ow * 0.7} />
          <path d={`M${x - 1.2} ${y - 1.4}H${x + 0.9}M${x - 0.2} ${y - 2.8}V${y}`} stroke={OUTLINE} strokeWidth={0.3} opacity={0.6} />
          <path d={`M${x - 0.3} ${y - 3.0}h0.9`} stroke={STEEL_LIGHT} strokeWidth={0.6} />
        </g>
      );
    case 'dagger':
      return (
        <g>
          <path
            d={`M${x - 0.5} ${y - 1.0}L${x + 0.2} ${y - 6.2}L${x + 0.8} ${y - 0.9}Z`}
            fill={BLADE}
            stroke={OUTLINE}
            strokeWidth={ow * 0.55}
            strokeLinejoin="round"
          />
          <path d={`M${x - 1.2} ${y - 0.9}L${x + 1.4} ${y - 0.7}`} stroke={OUTLINE} strokeWidth={0.8} strokeLinecap="round" />
        </g>
      );
    case 'sabre':
      return (
        <g>
          <path
            d={`M${x - 0.3} ${y - 0.6}Q${x + 6} ${y - 6.5} ${x + 13} ${y - 8.8}Q${x + 6.4} ${y - 5.6} ${x + 0.5} ${y + 0.4}Z`}
            fill={BLADE}
            stroke={OUTLINE}
            strokeWidth={ow * 0.55}
            strokeLinejoin="round"
          />
          <path d={`M${x - 0.9} ${y + 0.2}Q${x - 0.6} ${y - 1.6} ${x + 0.9} ${y - 1.4}`} fill="none" stroke={BRASS} strokeWidth={0.6} />
        </g>
      );
  }
}

// ---------------------------------------------------------------------------
// Packs and kit on the back

export type BackKit = 'rucksack' | 'flametanks' | 'slungRifle' | 'pack';

function BackItem({ kind, pose, ow }: { kind: BackKit; pose: PoseDef; ow: number }) {
  const { d, n } = dirOf(pose.hip, pose.neck);
  const angle = (Math.atan2(d[1], d[0]) * 180) / Math.PI + 90;
  if (kind === 'slungRifle') {
    const butt = add(add(pose.hip, n, 4.6), d, -1.2);
    const muzzle = add(add(pose.neck, n, 3.4), d, 8.6);
    return <Rifle from={butt} to={muzzle} ow={ow} />;
  }
  const c = add(lerp(pose.hip, pose.neck, kind === 'pack' ? 0.62 : 0.6), n, kind === 'pack' ? 3.6 : 4.4);
  const tr = `translate(${r2(c[0])} ${r2(c[1])}) rotate(${r2(angle)})`;
  if (kind === 'flametanks') {
    return (
      <g transform={tr}>
        <Shape d={rrect(-1.2, -5.6, 3.6, 10.4, 1.8)} fill="#4a4f45" ow={ow * 0.85} hi={rrect(-1.2, -5.6, 1.3, 10.4, 0.6)} />
        <Shape d={rrect(-3.0, -5.0, 3.6, 10.4, 1.8)} fill="#5b6154" ow={ow * 0.85} hi={rrect(-3.0, -5.0, 1.3, 10.4, 0.6)} />
        <path d="M-1 5.6Q2 9.5 6 8" fill="none" stroke={OUTLINE} strokeWidth={1.3} />
        <path d="M-1 5.6Q2 9.5 6 8" fill="none" stroke="#3a3a36" strokeWidth={0.7} />
      </g>
    );
  }
  const big = kind === 'rucksack';
  const w = big ? 5.2 : 3.4;
  const h = big ? 9.2 : 6.2;
  const fill = big ? '#6f6648' : shade('#6f6648', -0.1);
  return (
    <g transform={tr}>
      <Shape d={rrect(-w / 2, -h / 2, w, h, 1.4)} fill={fill} ow={ow * 0.85} lo={rrect(-w / 2, h * 0.1, w, h, 1)} hi={rrect(-w / 2, -h / 2, w * 0.35, h, 1)} />
      <path d={`M${-w / 2 + 0.4} ${-h * 0.05}H${w / 2 - 0.4}`} stroke={OUTLINE} strokeWidth={0.4} opacity={0.6} />
      {big && <Shape d={rrect(-w / 2 - 0.3, -h / 2 - 1.9, w + 0.6, 2.2, 1.1)} fill="#8a8473" ow={ow * 0.75} />}
    </g>
  );
}

// ---------------------------------------------------------------------------
// The soldier

export interface SoldierProps {
  kit: Kit;
  pose: PoseName;
  x: number;
  y: number;
  s?: number;
  ow: number;
  arm?: LongArm;
  hand?: HandItem;
  back?: BackKit;
  edelweiss?: boolean;
  /** Steel breastplate (French cuirassiers). */
  cuirass?: boolean;
  /** Pennant colours for a lance. */
  pennant?: [string, string];
  /** Icon rendering: thicker limbs, no small facial or webbing details. */
  bold?: boolean;
}

function legSegs(leg: P[], toe: P, fill: string, boots: string, jackboots: boolean, k: number): Seg[] {
  const [hip, knee, ankle] = leg;
  const segs: Seg[] = [
    { a: hip, b: knee, w: LEG_W * k, fill },
    { a: knee, b: ankle, w: SHIN_W * k, fill },
  ];
  if (jackboots) segs.push({ a: lerp(knee, ankle, 0.3), b: ankle, w: (SHIN_W + 0.15) * k, fill: boots, cap: 'butt' });
  segs.push({ a: ankle, b: toe, w: 2.2 * k, fill: boots });
  return segs;
}

function armSegs(arm: P[], fill: string, k: number): Seg[] {
  return [
    { a: arm[0], b: arm[1], w: ARM_W * k, fill },
    { a: arm[1], b: arm[2], w: (ARM_W - 0.2) * k, fill },
  ];
}

function HandDot({ at, ow }: { at: P; ow: number }) {
  return <circle cx={r2(at[0])} cy={r2(at[1])} r={1.05} fill={SKIN} stroke={OUTLINE} strokeWidth={ow * 0.7} />;
}

function Torso({ pose, kit, ow, cuirass, bold }: { pose: PoseDef; kit: Kit; ow: number; cuirass?: boolean; bold?: boolean }) {
  const { hip, neck } = pose;
  const { d, n } = dirOf(hip, neck);
  const back = 1.75;
  const beltC = add(hip, d, 1.5);
  const strapA = add(neck, n, -1.2);
  const strapB = add(beltC, n, 2.4);
  return (
    <g>
      <Limb pts={[hip, neck]} w={TORSO_W} fill={kit.uniform} ow={ow} />
      <path d={pathOf([add(add(hip, n, back), d, -0.6), add(add(neck, n, back), d, 0.4)])} stroke={kit.uniformDark} strokeWidth={2.4} strokeLinecap="round" opacity={0.75} />
      <path d={pathOf([add(hip, n, -1.6), add(neck, n, -1.6)])} stroke="#ffffff" strokeWidth={1.1} strokeLinecap="round" opacity={0.16} />
      {cuirass && (
        <path
          d={pathOf([add(add(neck, n, -3.1), d, 1.2), add(add(lerp(hip, neck, 0.25), n, -3.0), d, 0), add(add(lerp(hip, neck, 0.2), n, 2.0), d, 0), add(add(neck, n, 2.4), d, 1.2)]) + 'Z'}
          fill="#b5bbc2"
          stroke={OUTLINE}
          strokeWidth={ow * 0.7}
          strokeLinejoin="round"
        />
      )}
      {!cuirass && !bold && <path d={pathOf([strapA, strapB])} stroke={LEATHER} strokeWidth={0.7} />}
      <path d={pathOf([add(beltC, n, TORSO_W / 2), add(beltC, n, -TORSO_W / 2)])} stroke={LEATHER} strokeWidth={1.35} />
      {!bold && <path d={pathOf([add(add(beltC, n, -2.0), d, 0.9), add(add(beltC, n, -2.0), d, -0.5)])} stroke={LEATHER_LIGHT} strokeWidth={1.6} />}
      {kit.flash && <path d={pathOf([add(add(neck, n, -2.0), d, 0.8), add(add(neck, n, -0.2), d, 0.4)])} stroke={kit.flash} strokeWidth={1} />}
    </g>
  );
}

export function Soldier({ kit, pose: poseName, x, y, s = 1, ow, arm, hand, back, edelweiss, cuirass, pennant, bold }: SoldierProps) {
  const pose = POSES[poseName];
  const lw = ow / s;
  const k = bold ? 1.14 : 1;
  const parts: ReactNode[] = [];
  if (back === 'slungRifle') parts.push(<BackItem key="sling" kind={back} pose={pose} ow={lw} />);
  // Far-side limbs, in the shadow tone.
  const far: Seg[] = [];
  if (pose.legB && pose.toeB) far.push(...legSegs(pose.legB, pose.toeB, kit.uniformDark, shade(kit.boots, -0.2), kit.jackboots, k));
  far.push(...armSegs(pose.armB, kit.uniformDark, k));
  parts.push(<Segs key="far" segs={far} ow={lw} />);
  parts.push(<HandDot key="hb" at={pose.armB[2]} ow={lw} />);
  if (back && back !== 'slungRifle') parts.push(<BackItem key="pack" kind={back} pose={pose} ow={lw} />);
  parts.push(<Torso key="torso" pose={pose} kit={kit} ow={lw} cuirass={cuirass} bold={bold} />);
  if (pose.legF && pose.toeF) parts.push(<Segs key="legF" segs={legSegs(pose.legF, pose.toeF, kit.uniform, kit.boots, kit.jackboots, k)} ow={lw} />);
  if (arm && pose.grip) parts.push(<LongArmItem key="arm" kind={arm} grip={pose.grip} ow={lw} pennant={pennant} />);
  parts.push(<Head key="head" at={pose.head} tilt={pose.tilt} kit={kit} ow={lw} edelweiss={edelweiss} bold={bold} />);
  parts.push(<Segs key="armF" segs={armSegs(pose.armF, kit.uniform, k)} ow={lw} />);
  parts.push(<HandDot key="hf" at={pose.armF[2]} ow={lw} />);
  if (hand) parts.push(<HandHeld key="hand" kind={hand} at={pose.armF[2]} ow={lw} />);
  return <g transform={`translate(${r2(x)} ${r2(y)}) scale(${s})`}>{parts}</g>;
}

// ---------------------------------------------------------------------------
// Crew-served machine guns (drawn in a local frame: ground y = 0, facing right)

export type HmgStyle = 'vickers' | 'mg08' | 'fiat' | 'maxim';
export type LmgStyle = 'lewis' | 'bren' | 'topmag' | 'bottommag' | 'sidemag' | 'mg34';

export function HeavyMG({ x, y, s = 1, ow, style }: { x: number; y: number; s?: number; ow: number; style: HmgStyle }) {
  const lw = ow / s;
  const gun = '#3d4146';
  const legs: Seg[] =
    style === 'mg08'
      ? [
          { a: [-6, -0.8], b: [13, -0.8], w: 1.1, fill: STEEL },
          { a: [-1, -0.8], b: [3.6, -7.6], w: 1.0, fill: STEEL },
          { a: [10, -0.8], b: [5.2, -7.6], w: 1.0, fill: STEEL },
        ]
      : [
          { a: [4.4, -7.4], b: [7.6, -0.4], w: 0.9, fill: shade(STEEL, -0.3) },
          { a: [4.4, -7.4], b: [12.6, -0.4], w: 1.0, fill: STEEL },
          { a: [4.4, -7.4], b: [-5.4, -0.4], w: 1.0, fill: STEEL },
        ];
  return (
    <g transform={`translate(${r2(x)} ${r2(y)}) scale(${s})`}>
      <Segs segs={legs} ow={lw} />
      <Shape d={rrect(5.2, -3.0, 4.4, 3.0, 0.4)} fill="#5c6247" ow={lw * 0.8} hi={rect(5.2, -3.0, 4.4, 0.9)} />
      <Shape d={rrect(3.4, -8.4, 2.4, 1.8, 0.4)} fill={STEEL} ow={lw * 0.8} />
      {/* Barrel tip and the water-cooling jacket around it. */}
      <Limb pts={[[15.8, -9.2], [18.0, -9.2]]} w={1.0} fill={gun} ow={lw * 0.8} cap="butt" />
      {style === 'vickers' && <path d="M17.6 -10.2L19.2 -10.6V-7.8L17.6 -8.2Z" fill={gun} stroke={OUTLINE} strokeWidth={lw * 0.6} />}
      <Shape d={rrect(6.4, -10.7, 9.6, 3.0, 1.2)} fill={style === 'vickers' ? '#6b6d58' : '#5d636a'} ow={lw} hi={rect(6.4, -10.7, 9.6, 1.0)}>
        {style === 'vickers' && <path d="M8 -11V-7.5M9.6 -11V-7.5M11.2 -11V-7.5M12.8 -11V-7.5M14.4 -11V-7.5" stroke={OUTLINE} strokeWidth={0.35} opacity={0.6} />}
        {style === 'fiat' && <path d="M8.4 -10.7V-7.7M14 -10.7V-7.7" stroke={OUTLINE} strokeWidth={0.5} opacity={0.6} />}
      </Shape>
      <Shape d={rrect(0.4, -11.0, 6.4, 3.6, 0.5)} fill={gun} ow={lw} hi={rect(0.4, -11.0, 6.4, 1.1)} />
      <path d="M0.6 -10.4L-0.8 -10.6V-8.0L0.6 -8.2" fill="none" stroke={OUTLINE} strokeWidth={0.9} strokeLinejoin="round" />
      {/* Ammunition belt hanging from the feed. */}
      <path d="M3.6 -7.4Q3.0 -4.8 5.2 -3.0" fill="none" stroke={BRASS_DARK} strokeWidth={1.4} />
      <path d="M3.6 -7.4Q3.0 -4.8 5.2 -3.0" fill="none" stroke={BRASS} strokeWidth={1.0} strokeDasharray="0.5 0.45" />
    </g>
  );
}

export function LightMG({ x, y, s = 1, ow, style }: { x: number; y: number; s?: number; ow: number; style: LmgStyle }) {
  const lw = ow / s;
  const gun = '#3d4146';
  const stock = style === 'mg34' ? '#2c2a28' : WOOD;
  const parts: ReactNode[] = [];
  // Bipod legs.
  parts.push(
    <Segs
      key="bipod"
      ow={lw * 0.7}
      segs={[
        { a: [14.2, -6.8], b: [12.8, -0.2], w: 0.6, fill: STEEL },
        { a: [14.2, -6.8], b: [15.8, -0.2], w: 0.6, fill: STEEL },
      ]}
    />,
  );
  // Barrel / shroud.
  if (style === 'lewis') {
    parts.push(<Limb key="sh" pts={[[9.4, -6.9], [17.0, -6.9]]} w={2.6} fill="#4a4e45" ow={lw * 0.8} cap="butt" />);
    parts.push(<Limb key="mz" pts={[[17.0, -6.9], [18.4, -6.9]]} w={1.6} fill={gun} ow={lw * 0.7} cap="butt" />);
  } else if (style === 'mg34') {
    parts.push(<Limb key="sh" pts={[[10.0, -6.9], [16.6, -6.9]]} w={1.7} fill={gun} ow={lw * 0.8} cap="butt" />);
    parts.push(<path key="holes" d="M11 -6.9h0.01M12.4 -6.9h0.01M13.8 -6.9h0.01M15.2 -6.9h0.01" stroke="#9aa0a6" strokeWidth={0.7} strokeLinecap="round" />);
    parts.push(<Limb key="mz" pts={[[16.6, -6.9], [18.4, -6.9]]} w={0.9} fill={gun} ow={lw * 0.7} cap="butt" />);
  } else {
    parts.push(<Limb key="br" pts={[[10.0, -6.9], [18.2, -6.9]]} w={0.95} fill={gun} ow={lw * 0.7} cap="butt" />);
    if (style === 'bren') parts.push(<path key="fh" d="M17.6 -7.6L19.0 -8.0V-5.8L17.6 -6.2Z" fill={gun} stroke={OUTLINE} strokeWidth={lw * 0.5} />);
  }
  // Stock and receiver.
  parts.push(<Shape key="stock" d="M0 -8.2L5.4 -7.6L5.4 -6.0L0 -5.2Z" fill={stock} ow={lw * 0.85} hi="M0 -8.2L5.4 -7.6L5.4 -7.1L0 -7.4Z" />);
  parts.push(<Limb key="pg" pts={[[6.2, -6.0], [5.6, -4.2]]} w={1.0} fill={stock} ow={lw * 0.7} />);
  parts.push(<Shape key="rcv" d={rrect(5.0, -8.2, 5.4, 2.6, 0.4)} fill={gun} ow={lw * 0.9} hi={rect(5.0, -8.2, 5.4, 0.8)} />);
  // Magazines.
  if (style === 'lewis') parts.push(<Shape key="pan" d={ellipse(7.4, -9.0, 3.8, 0.9)} fill="#33362f" ow={lw * 0.8} />);
  if (style === 'bren') parts.push(<Shape key="mag" d="M6.6 -8.0Q6.8 -11.4 9.6 -12.6L10.6 -11.6Q8.6 -10.6 8.4 -8.0Z" fill={gun} ow={lw * 0.8} />);
  if (style === 'topmag') parts.push(<Shape key="mag" d="M6.8 -8.0L7.8 -11.6L9.4 -11.4L8.6 -8.0Z" fill={gun} ow={lw * 0.8} />);
  if (style === 'bottommag') parts.push(<Shape key="mag" d="M7.0 -5.8L7.0 -3.0L8.8 -3.0L8.8 -5.8Z" fill={gun} ow={lw * 0.8} />);
  if (style === 'sidemag') parts.push(<Shape key="mag" d={rrect(6.4, -7.6, 4.4, 1.6, 0.3)} fill="#2c2f33" ow={lw * 0.7} />);
  if (style === 'mg34') parts.push(<Shape key="drum" d={rrect(6.4, -6.2, 3.0, 2.4, 0.8)} fill="#33362f" ow={lw * 0.7} />);
  return <g transform={`translate(${r2(x)} ${r2(y)}) scale(${s})`}>{parts}</g>;
}
