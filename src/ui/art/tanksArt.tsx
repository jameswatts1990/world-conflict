// Tracked armour: light tanks, tanks, heavy tanks and tank destroyers, drawn
// side-on facing right in the 96 x 60 card frame (ground at y = 53).
import type { ReactElement, ReactNode } from 'react';
import type { Ctx } from './context';
import { InsigniaMark } from './Insignia';
import { GROUND } from './infantryArt';
import { OUTLINE, STEEL, TRACK, TRACK_LIGHT, WOOD, shade } from './palettes';
import {
  Barrel,
  GroundShadow,
  Line,
  Rivets,
  Shape,
  TrackRun,
  ellipse,
  rect,
  rrect,
  type P,
} from './primitives';

/** A painted armour plate: vehicle colour or camouflage, with light/shadow overlays. */
export function Plate({ ctx, d, hi, lo, children, tone = 0 }: { ctx: Ctx; d: string; hi?: string; lo?: string; children?: ReactNode; tone?: number }) {
  const fill = tone ? shade(ctx.pal.vehicle, tone) : ctx.pal.vehicle;
  return (
    <Shape d={d} fill={fill} camo={tone ? undefined : ctx.camo} ow={ctx.ow} hi={hi} lo={lo}>
      {children}
    </Shape>
  );
}

export function Badge({ ctx, cx, cy, r = 3.4 }: { ctx: Ctx; cx: number; cy: number; r?: number }) {
  return <InsigniaMark nation={ctx.nation} cx={cx} cy={cy} r={r} ow={0.55} />;
}

/** Machine-gun barrel poking from a mount, with an optional cooling jacket. */
export function MgBarrel({ from, len, ow, jacket }: { from: P; len: number; ow: number; jacket?: boolean }) {
  const to: P = [from[0] + len, from[1]];
  return (
    <g>
      {jacket && <Barrel from={from} to={[from[0] + len * 0.6, from[1]]} w={1.8} fill="#4f544a" ow={ow * 0.8} />}
      <Barrel from={from} to={to} w={0.9} fill={STEEL} ow={ow * 0.8} />
    </g>
  );
}

function Hatch({ x, y, w, ow }: { x: number; y: number; w: number; ow: number }) {
  return <path d={`M${x} ${y}Q${x + w / 2} ${y - w * 0.32} ${x + w} ${y}Z`} fill={shade(STEEL, 0.1)} stroke={OUTLINE} strokeWidth={ow * 0.8} strokeLinejoin="round" />;
}

/** Draw at a smaller size about the ground centre, keeping outline widths constant. */
function scaled(ctx: Ctx, k: number, draw: (c: Ctx) => ReactElement): ReactElement {
  return <g transform={`translate(48 ${GROUND}) scale(${k}) translate(-48 ${-GROUND})`}>{draw({ ...ctx, ow: ctx.ow / k })}</g>;
}

function Shadow({ cx = 48, rx = 44 }: { cx?: number; rx?: number }) {
  return <GroundShadow cx={cx} cy={GROUND} rx={rx} ry={4.4} />;
}

// ---------------------------------------------------------------------------
// Light tanks

function renaultFT(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const belt = 'M30 52.8L73 52.8A9 9 0 0 0 75.4 35.2L30.6 39.6A6.6 6.6 0 0 0 30 52.8Z';
  const frame = 'M31 50.2L72.4 50.2A6.4 6.4 0 0 0 74.6 37.8L31.6 42Q27 43.2 27.4 46.6Q27.8 50 31 50.2Z';
  return (
    <g>
      <Shadow cx={50} rx={40} />
      {/* Tail skid. */}
      <Plate ctx={ctx} d="M34 41.6L12 49.6L11 52.4L14.6 52.6L35 46.2Z" tone={-0.12} />
      <Plate ctx={ctx} d="M33.6 42.6L32 30.4L40.6 27L62.4 27L77 36.4L73.6 42Z" hi="M40.6 27L62.4 27L64 28.2L40 28.6Z" lo="M30 39H80V44H30Z">
        <Rivets a={[36, 40.6]} b={[71, 40.6]} n={11} />
        <Line pts={[[62.4, 27], [62, 41.8]]} w={0.6} />
      </Plate>
      <path d={belt} fill={TRACK} stroke={OUTLINE} strokeWidth={ow} />
      <path d={belt} fill="none" stroke={TRACK_LIGHT} strokeWidth={0.9} strokeDasharray="1 1.1" transform="translate(0 0)" opacity={0.8} />
      {[34.6, 41.4, 48.2, 55, 61.8, 68.6].map((x) => (
        <circle key={x} cx={x} cy={50.4} r={1.9} fill={shade(ctx.pal.vehicle, -0.3)} stroke={OUTLINE} strokeWidth={ow * 0.6} />
      ))}
      <Plate ctx={ctx} d={frame} hi="M31.6 42L74.6 37.8L74.6 39.6L31.6 43.8Z" lo="M26 47.4H80V52H26Z">
        <Rivets a={[33, 44.6]} b={[70, 41.6]} n={10} />
      </Plate>
      <circle cx={74.2} cy={44} r={5.2} fill={shade(ctx.pal.vehicle, -0.2)} stroke={OUTLINE} strokeWidth={ow * 0.8} />
      <circle cx={74.2} cy={44} r={1.6} fill={shade(ctx.pal.vehicle, -0.45)} stroke={OUTLINE} strokeWidth={ow * 0.5} />
      {/* Turret: octagonal riveted "omnibus" turret with mushroom vent. */}
      <Barrel from={[58, 21.6]} to={[69.4, 21.6]} w={2.2} fill={STEEL} ow={ow} muzzleRing />
      <path d={ellipse(51.8, 15.2, 2.6, 1.3)} fill={shade(ctx.pal.vehicle, -0.1)} stroke={OUTLINE} strokeWidth={ow * 0.8} />
      <Plate ctx={ctx} d="M44.4 27.2L45.2 18.2L47.2 16.2L56.6 16.2L58.6 18.2L59.4 27.2Z" hi="M45.2 18.2L47.2 16.2L56.6 16.2L58.6 18.2Z" lo="M44 24.4H60V28H44Z">
        <Line pts={[[47.2, 16.2], [47.4, 27.2]]} w={0.5} />
        <Line pts={[[56.6, 16.2], [56.8, 27.2]]} w={0.5} />
        <Rivets a={[46, 25.6]} b={[58, 25.6]} n={6} />
      </Plate>
      <Badge ctx={ctx} cx={51.8} cy={21.8} r={3} />
    </g>
  );
}

function lightInterwar(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  return (
    <g>
      <Shadow />
      <TrackRun x0={12} x1={84} top={40.4} bottom={53} style="bogie" wheels={8} hull={v} ow={ow} rollers={3} />
      <Plate ctx={ctx} d="M13 42.4L13.6 34.6L20 32.6L60 32.6L68 33.4L85 39.4L84.6 42.4Z" hi="M20 32.6L60 32.6L68 33.4L85 39.4L84 40.6L68 35L20 34.4Z" lo="M10 40.4H90V43H10Z">
        <Rivets a={[16, 40.8]} b={[82, 40.8]} n={16} />
        <Line pts={[[60, 32.6], [62, 42.4]]} w={0.6} />
      </Plate>
      <Plate ctx={ctx} d="M60 33.4L62.4 29.6L68.6 29.6L71.4 35L68 33.4Z" tone={0.08} />
      <MgBarrel from={[52, 28.6]} len={12} ow={ow} jacket />
      <Plate ctx={ctx} d="M33.4 32.8L34.4 25.8L36.4 24.2L50 24.2L52.6 26.4L53.6 32.8Z" hi="M34.4 25.8L36.4 24.2L50 24.2L52.6 26.4Z" lo="M32 30.6H55V33H32Z">
        <Rivets a={[35, 31.4]} b={[52, 31.4]} n={6} />
      </Plate>
      <Hatch x={38.4} y={24.2} w={6.4} ow={ow} />
      <Badge ctx={ctx} cx={40} cy={37.6} r={3} />
    </g>
  );
}

function lightWW2(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  return (
    <g>
      <Shadow cx={47} rx={38} />
      <TrackRun x0={13} x1={80} top={39.4} bottom={53} style="road" wheels={4} hull={v} ow={ow} rollers={2} />
      <Plate ctx={ctx} d="M12.6 42L14 34.6L62 34L70 34.6L82 39.4L81.4 42Z" hi="M14 34.6L62 34L70 34.6L82 39.4L81.2 40.6L70 36.2L14 36.4Z" lo="M10 39.6H86V42.4H10Z">
        <Rivets a={[16, 40.6]} b={[78, 40.6]} n={14} />
        <Line pts={[[62, 34], [63, 42]]} w={0.6} />
      </Plate>
      <Plate ctx={ctx} d="M22 34.6L24 29.6L58 29.6L66 34.4Z" hi="M24 29.6L58 29.6L59.6 30.8L23.6 30.8Z" tone={0.05}>
        <Rivets a={[25, 33.2]} b={[60, 33.2]} n={9} />
      </Plate>
      <Shape d={rrect(59.6, 31, 3, 1.2, 0.4)} fill={OUTLINE} ow={0.3} />
      <Barrel from={[48, 25.2]} to={[70, 25.2]} w={1.5} fill={STEEL} ow={ow} muzzleRing />
      <Barrel from={[48, 27.4]} to={[55, 27.4]} w={0.9} fill={STEEL} ow={ow * 0.8} />
      <Plate ctx={ctx} d="M29 29.8L30.4 23.6L33 21.8L45.6 21.8L48.6 23.8L49.6 29.8Z" hi="M30.4 23.6L33 21.8L45.6 21.8L48.6 23.8L48.4 25L45.6 23.2L33 23.2L30.2 24.8Z" lo="M27 27.8H52V30H27Z">
        <Rivets a={[31, 28.4]} b={[48, 28.4]} n={6} />
      </Plate>
      <Hatch x={33.4} y={21.8} w={6} ow={ow} />
      <Badge ctx={ctx} cx={39.4} cy={25.8} r={2.5} />
    </g>
  );
}

export function drawLightTank(ctx: Ctx): ReactElement {
  if (ctx.gen === 'ww1') return renaultFT(ctx);
  if (ctx.gen === 'interwar') return scaled(ctx, 0.86, lightInterwar);
  return scaled(ctx, 0.9, lightWW2);
}

// ---------------------------------------------------------------------------
// WW1 heavy "tanks"

function markIV(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const outer = 'M24 53L72 53Q86.6 49 91.6 35.4Q92.2 29.6 86 29.2L20 29.2Q11.6 29.6 10.4 36.4Q13 47.4 24 53Z';
  const inner = 'M25 50.2L71 50.2Q83 47 88.2 35.4Q88.6 32.2 85 32L21 32Q14.4 32.4 13.6 36.8Q16.2 45.6 25 50.2Z';
  return (
    <g>
      <Shadow cx={50} />
      {/* Unditching beam riding on top. */}
      <Shape d={rrect(26, 25.6, 40, 3.4, 0.8)} fill={WOOD} ow={ow} hi={rect(26, 25.6, 40, 1.1)} />
      <Plate ctx={ctx} d="M70 29.6L72 24.4L84 24.4L86 29.6Z" hi="M72 24.4L84 24.4L84.6 25.8L71.6 25.8Z">
        <Line pts={[[75, 26.4], [81, 26.4]]} w={0.8} />
      </Plate>
      <path d={outer} fill={TRACK} stroke={OUTLINE} strokeWidth={ow} />
      <path d={outer} fill="none" stroke={TRACK_LIGHT} strokeWidth={1.1} strokeDasharray="1.3 1.3" transform="translate(0.1 0)" opacity={0.7} />
      <Plate ctx={ctx} d={inner} hi="M21 32L85 32L87.6 34.4L20 34.6Z" lo="M10 46H92V52H10Z">
        <Rivets a={[18, 35.4]} b={[84, 35.4]} n={22} />
        <Rivets a={[24, 47.6]} b={[72, 47.6]} n={16} />
        <Line pts={[[48, 32], [48, 50]]} w={0.6} />
      </Plate>
      {/* Side sponson with its 6-pounder. */}
      <Barrel from={[58, 39.8]} to={[69.4, 39.8]} w={2.2} fill={STEEL} ow={ow} muzzleRing />
      <Plate ctx={ctx} d="M38 35L58 35L61.4 39.4L59 45.6L40 45.6L37 40Z" hi="M38 35L58 35L61.4 39.4L60 39.6L57.4 36.4L38.4 36.4Z" lo="M36 43.6H62V46H36Z" tone={0.04}>
        <Rivets a={[40, 37]} b={[56, 37]} n={7} />
      </Plate>
      <Badge ctx={ctx} cx={26} cy={41} r={3.4} />
    </g>
  );
}

function a7v(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  return (
    <g>
      <Shadow />
      <TrackRun x0={20} x1={78} top={44.6} bottom={53} style="bogie" wheels={8} hull={v} ow={ow} />
      <Barrel from={[84, 36.8]} to={[94.4, 36.8]} w={2.6} fill={STEEL} ow={ow} muzzleRing />
      <Plate ctx={ctx} d="M12.6 47.4L10.4 38.6L14.6 30.6L22 27.4L78 27.4L84.6 30.6L88.6 38.6L85.4 47.4Z" hi="M22 27.4L78 27.4L84.6 30.6L14.6 30.6Z" lo="M8 43.6H90V48H8Z">
        <Line pts={[[14.6, 30.6], [84.6, 30.6]]} w={0.6} />
        <Line pts={[[10.6, 38.6], [88.4, 38.6]]} w={0.6} />
        <Rivets a={[16, 32.6]} b={[83, 32.6]} n={20} />
        <Rivets a={[14, 45.4]} b={[85, 45.4]} n={20} />
      </Plate>
      {/* Machine-gun ports along the side. */}
      {[24, 36, 62].map((x) => (
        <g key={x}>
          <circle cx={x} cy={35} r={1.5} fill={shade(v, -0.4)} stroke={OUTLINE} strokeWidth={ow * 0.7} />
          <circle cx={x} cy={35} r={0.5} fill={OUTLINE} />
        </g>
      ))}
      <Plate ctx={ctx} d="M42 27.6L43 21.4L58 21.4L59 27.6Z" hi="M43 21.4H58L58.3 22.6H42.8Z" tone={0.04}>
        <path d="M45 24H56" stroke={OUTLINE} strokeWidth={0.8} />
      </Plate>
      <Badge ctx={ctx} cx={49} cy={38} r={4.6} />
    </g>
  );
}

function schneider(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  return (
    <g>
      <Shadow />
      <TrackRun x0={22} x1={74} top={43.4} bottom={53} style="bogie" wheels={8} hull={v} ow={ow} />
      {/* Twin tail skids at the rear. */}
      <Plate ctx={ctx} d="M18 44L8 47.6L7.6 50.4L10 50.6L19 47.4Z" tone={-0.15} />
      <Plate
        ctx={ctx}
        d="M17.4 47.6L15.6 32L22 27.6L60 27.6L68 31.6L93.4 48.6L84 49.2L70 46.6L22 47.8Z"
        hi="M22 27.6L60 27.6L68 31.6L93.4 48.6L91 48.8L67 33.2L21 29.6Z"
        lo="M10 44H96V50H10Z"
      >
        <Line pts={[[60, 27.6], [66, 46.6]]} w={0.6} />
        <Rivets a={[20, 30.6]} b={[58, 30.6]} n={12} />
        <Rivets a={[20, 45]} b={[64, 45]} n={14} />
      </Plate>
      {/* Front gun sponson on the side. */}
      <Plate ctx={ctx} d="M46.6 33.6L55.4 32.6Q59.6 37.4 55.4 43.2L46.6 42.6Z" hi="M46.6 33.6L55.4 32.6Q57 34.4 57.6 36L46.6 35.6Z" tone={0.06} />
      <Barrel from={[57.4, 37.8]} to={[66.4, 37.8]} w={2.8} fill={STEEL} ow={ow} muzzleRing />
      <Plate ctx={ctx} d="M30 27.8L32 22.4H42L44 27.8Z" hi="M32 22.4H42L42.4 23.6H31.6Z" tone={0.04} />
      <Badge ctx={ctx} cx={30} cy={37} r={3.6} />
    </g>
  );
}

function tankInterwar(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  return (
    <g>
      <Shadow />
      <TrackRun x0={10} x1={86} top={38.4} bottom={53} style="bogie" wheels={10} hull={v} ow={ow} />
      {/* Armoured skirt over the upper suspension. */}
      <Plate ctx={ctx} d="M16 40.2H80L82 44.6H14Z" tone={-0.1}>
        <Rivets a={[18, 42.4]} b={[78, 42.4]} n={14} />
      </Plate>
      <Plate ctx={ctx} d="M11 40.4L13 30.4L24 26.4L72 26.4L86 32L88.6 40.4Z" hi="M24 26.4L72 26.4L86 32L85 33.2L72 28.2L23.6 28.2L13 31.6Z" lo="M8 38H92V41H8Z">
        <Line pts={[[72, 26.4], [73, 40.4]]} w={0.6} />
        <Rivets a={[15, 38.8]} b={[86, 38.8]} n={18} />
      </Plate>
      <Plate ctx={ctx} d="M72 26.6L74 22.4L80.6 22.4L84 29.2Z" hi="M74 22.4L80.6 22.4L81.2 23.6L73.6 23.6Z" tone={0.06} />
      <Barrel from={[60, 20.4]} to={[76, 20.4]} w={1.9} fill={STEEL} ow={ow} />
      <Plate ctx={ctx} d="M34 26.6L36 18.6L39 16.4L57 16.4L61.4 19L62.4 26.6Z" hi="M36 18.6L39 16.4L57 16.4L61.4 19L61 20.2L57 17.8L39 17.8L35.8 20Z" lo="M32 24.4H64V27H32Z">
        <Rivets a={[36.4, 25]} b={[60.4, 25]} n={9} />
      </Plate>
      <Hatch x={42} y={16.4} w={8} ow={ow} />
      <Badge ctx={ctx} cx={30} cy={33.4} r={3.4} />
    </g>
  );
}

function tankWW2(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  return (
    <g>
      <Shadow />
      <TrackRun x0={9} x1={84} top={38.6} bottom={53} style="road" wheels={6} hull={v} ow={ow} rollers={4} />
      <Plate ctx={ctx} d="M8.4 41.4L10 32.4L68 31.8L76 32.4L88 37.6L87 41.4Z" hi="M10 32.4L68 31.8L76 32.4L88 37.6L87.4 39L76 34.2L10 34.4Z" lo="M6 39H92V42H6Z">
        <Line pts={[[68, 31.8], [69, 41.2]]} w={0.6} />
      </Plate>
      {/* Stowage box and fender line. */}
      <Plate ctx={ctx} d={rect(14, 33.6, 9, 4.4)} tone={-0.08} />
      <Plate ctx={ctx} d="M17 32.2L19 28L66 28L74 32Z" hi="M19 28L66 28L67.6 29.4L18.6 29.4Z" tone={0.05} />
      <Shape d={rrect(66.4, 29.6, 3.4, 1.3, 0.4)} fill={OUTLINE} ow={0.3} />
      <Barrel from={[60, 22.6]} to={[93.6, 22.6]} w={2.3} wEnd={1.9} fill={shade(v, 0.02)} ow={ow} brake />
      <Plate ctx={ctx} d="M30.6 28.2L32.6 20L36.4 17.6L56 17.6L61 20.4L62.6 28.2Z" hi="M32.6 20L36.4 17.6L56 17.6L61 20.4L60.6 21.6L56 19.2L36.4 19.2L32.4 21.4Z" lo="M28 25.8H64V28.4H28Z" />
      <Plate ctx={ctx} d={rrect(58.4, 19.6, 5.2, 6.2, 1)} tone={-0.12} />
      <Plate ctx={ctx} d="M35 17.8L35.6 14.2H42.6L43.2 17.8Z" hi="M35.6 14.2H42.6L42.8 15.2H35.4Z" tone={-0.04} />
      <Badge ctx={ctx} cx={46} cy={23.2} r={3} />
    </g>
  );
}

export function drawTank(ctx: Ctx): ReactElement {
  if (ctx.gen === 'ww1') {
    if (ctx.nation === 'de') return a7v(ctx);
    if (ctx.nation === 'fr') return schneider(ctx);
    return markIV(ctx);
  }
  if (ctx.gen === 'interwar') return tankInterwar(ctx);
  return tankWW2(ctx);
}

// ---------------------------------------------------------------------------
// Heavy tanks

function heavyInterwar(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  return (
    <g>
      <Shadow rx={46} />
      <TrackRun x0={4} x1={92} top={35.6} bottom={53} style="bogie" wheels={14} hull={v} ow={ow} rollers={5} />
      <Plate ctx={ctx} d="M8 38.4H88L90 43.6H6Z" tone={-0.1}>
        <Rivets a={[10, 41]} b={[86, 41]} n={20} />
      </Plate>
      <Plate ctx={ctx} d="M5 38.4L8 28.4L16 25.6L80 25.6L90 30L92.6 38.4Z" hi="M16 25.6L80 25.6L90 30L89 31.2L80 27.4L16 27.4L8.4 29.8Z" lo="M2 36H96V39H2Z">
        <Rivets a={[10, 36.8]} b={[90, 36.8]} n={24} />
        <Line pts={[[30, 25.6], [30, 38.4]]} w={0.6} />
        <Line pts={[[70, 25.6], [70, 38.4]]} w={0.6} />
      </Plate>
      {/* Rear machine-gun turret. */}
      <MgBarrel from={[26, 21.8]} len={7} ow={ow} jacket />
      <Plate ctx={ctx} d="M13 25.8L14 20L16 18.8L24.4 18.8L26.4 20.4L27.4 25.8Z" hi="M14 20L16 18.8L24.4 18.8L26.4 20.4Z" tone={0.03} />
      {/* Front machine-gun turret. */}
      <MgBarrel from={[80, 21.6]} len={8} ow={ow} jacket />
      <Plate ctx={ctx} d="M70 25.8L71 20.4L72.6 19.2L79.2 19.2L81 20.8L82 25.8Z" hi="M71 20.4L72.6 19.2L79.2 19.2L81 20.8Z" tone={0.03} />
      {/* Main turret with observation cupola. */}
      <Barrel from={[62, 18.6]} to={[78, 18.6]} w={2.2} fill={STEEL} ow={ow} />
      <Plate ctx={ctx} d="M40 25.8L41.4 16.6L44 14.4L60 14.4L63.4 17L64.6 25.8Z" hi="M41.4 16.6L44 14.4L60 14.4L63.4 17L63 18.2L60 15.8L44 15.8L41.2 18Z" lo="M38 23.6H66V26H38Z">
        <Rivets a={[42, 24.4]} b={[63, 24.4]} n={8} />
      </Plate>
      <Plate ctx={ctx} d="M46 14.6L46.8 10.6H54.6L55.4 14.6Z" hi="M46.8 10.6H54.6L54.8 11.6H46.6Z" tone={-0.06}>
        <path d="M47.6 12.4H54" stroke={OUTLINE} strokeWidth={0.6} />
      </Plate>
      <Badge ctx={ctx} cx={50} cy={31.6} r={3.6} />
    </g>
  );
}

function heavyWW2(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  return (
    <g>
      <Shadow rx={46} />
      <TrackRun x0={3} x1={88} top={35.2} bottom={53} style="overlap" wheels={7} hull={v} ow={ow} />
      <Plate ctx={ctx} d="M2.4 38.4L4 26.6L72 26.2L76 26.6L91 31L90.4 38.4Z" hi="M4 26.6L72 26.2L76 26.6L91 31L90.4 32.6L75.6 28.4L4 28.6Z" lo="M0 35.6H94V38.6H0Z">
        <Line pts={[[76, 26.6], [76.6, 38.4]]} w={0.6} />
        <Line pts={[[3.6, 34.4], [90.6, 34.4]]} w={0.6} />
        <Rivets a={[6, 36.8]} b={[88, 36.8]} n={8} r={0.5} />
      </Plate>
      <Plate ctx={ctx} d={rrect(6, 28.6, 12, 4.4, 0.8)} tone={-0.1} />
      <Shape d={rrect(77, 28.4, 4.6, 1.6, 0.5)} fill={OUTLINE} ow={0.3} />
      <Barrel from={[62, 20.4]} to={[93.4, 20.4]} w={3.6} wEnd={2.8} fill={shade(v, 0.02)} ow={ow} brake />
      <Plate ctx={ctx} d="M20 26.4L21 15.8L24.4 13L57.6 13L62 15.4L63.6 26.4Z" hi="M21 15.8L24.4 13L57.6 13L62 15.4L61.8 17L57.6 14.8L24.4 14.8L20.8 17.6Z" lo="M18 23.6H66V26.6H18Z">
        <Line pts={[[21.2, 20.4], [63, 20.4]]} w={0.5} opacity={0.4} />
      </Plate>
      <Plate ctx={ctx} d={rrect(16.4, 16.4, 4.6, 8.4, 1.2)} tone={-0.12} />
      <Plate ctx={ctx} d={rrect(58.4, 15.2, 8.6, 10.6, 1.8)} tone={-0.12} />
      <Plate ctx={ctx} d="M25.4 13.2L26.2 9.4H35.4L36.2 13.2Z" hi="M26.2 9.4H35.4L35.6 10.4H26Z" tone={-0.04} />
      <Badge ctx={ctx} cx={42} cy={19.2} r={3.4} />
    </g>
  );
}

export function drawHeavyTank(ctx: Ctx): ReactElement {
  return ctx.gen === 'ww2' ? heavyWW2(ctx) : heavyInterwar(ctx);
}

// ---------------------------------------------------------------------------
// Tank destroyer

export function drawTankDestroyer(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  return (
    <g>
      <Shadow />
      <TrackRun x0={8} x1={82} top={40.6} bottom={53} style="road" wheels={6} hull={v} ow={ow} rollers={3} />
      <Plate ctx={ctx} d="M7.4 43L9 35.4L80 35L90 39.6L88.6 43Z" hi="M9 35.4L80 35L90 39.6L89.4 40.8L80 36.8L9 37Z" lo="M5 41H93V43.6H5Z" />
      <Barrel from={[64, 30]} to={[93.6, 30]} w={2.4} wEnd={1.9} fill={shade(v, 0.02)} ow={ow} brake />
      <Plate ctx={ctx} d="M20 35.2L22.6 27.4L58 27.4L71.4 35.2Z" hi="M22.6 27.4L58 27.4L61.6 29.6L22 29.6Z" lo="M18 33.6H74V35.6H18Z" />
      <Shape d={ellipse(66.4, 30.4, 3.4, 3.4)} fill={shade(v, -0.12)} ow={ow} />
      <Plate ctx={ctx} d="M30 27.6L30.6 24.4H37L37.6 27.6Z" tone={-0.06} />
      <Shape d="M44 27.4L44.6 25.2H47L47.4 27.4Z" fill={STEEL} ow={ow * 0.7} />
      <Badge ctx={ctx} cx={40} cy={31.4} r={2.6} />
    </g>
  );
}
