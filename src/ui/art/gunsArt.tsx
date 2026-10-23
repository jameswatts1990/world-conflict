// Towed guns: field artillery, heavy artillery and anti-tank guns, each with
// a small crew for scale. Drawn directly in the 96 x 60 card frame.
import type { ReactElement } from 'react';
import { dimKit, type Ctx } from './context';
import { Soldier } from './figures';
import { CornerBadge, GROUND } from './infantryArt';
import { BRASS, OUTLINE, STEEL, WOOD, WOOD_DARK, shade } from './palettes';
import {
  Barrel,
  DiscWheel,
  GroundShadow,
  Line,
  Rivets,
  RubberWheel,
  Shape,
  SpokedWheel,
  ellipse,
  polar,
  rect,
  rrect,
  type P,
} from './primitives';

function paint(ctx: Ctx) {
  return { fill: ctx.pal.vehicle, camo: ctx.camo };
}

/** A trail leg from the axle back to its spade on the ground. */
function Trail({ ctx, from, to, w0, w1, far }: { ctx: Ctx; from: P; to: P; w0: number; w1: number; far?: boolean }) {
  const { fill, camo } = paint(ctx);
  const d = `M${from[0] + 1} ${from[1] - w0 / 2}L${to[0]} ${to[1] - w1 / 2}L${to[0] - 1.4} ${to[1] + w1 / 2}L${from[0] + 1} ${from[1] + w0 / 2}Z`;
  const spade = `M${to[0] - 2.6} ${to[1] - w1 / 2 - 0.4}L${to[0] + 0.4} ${to[1] - w1 / 2}L${to[0] + 0.8} ${GROUND + 1.2}L${to[0] - 2.2} ${GROUND + 1.4}Z`;
  return (
    <g>
      <Shape d={spade} fill={shade(STEEL, far ? -0.3 : 0)} ow={ctx.ow * 0.9} />
      <Shape
        d={d}
        fill={far ? shade(fill, -0.3) : fill}
        camo={far ? undefined : camo}
        ow={ctx.ow}
        hi={`M${from[0] + 1} ${from[1] - w0 / 2}L${to[0]} ${to[1] - w1 / 2}L${to[0]} ${to[1] - w1 / 2 + 0.9}L${from[0] + 1} ${from[1] - w0 / 2 + 1.2}Z`}
        lo={`M${from[0] + 1} ${from[1] + w0 / 2}L${to[0] - 1.4} ${to[1] + w1 / 2}L${to[0]} ${to[1] + w1 / 2 - 1}L${from[0] + 1} ${from[1] + w0 / 2 - 1.4}Z`}
      />
    </g>
  );
}

function Shield({ ctx, d, hi }: { ctx: Ctx; d: string; hi?: string }) {
  const { fill, camo } = paint(ctx);
  return <Shape d={d} fill={fill} camo={camo} ow={ctx.ow} hi={hi} lo="M40 46H60V60H40Z" />;
}

// ---------------------------------------------------------------------------
// Field artillery

function fieldGunWW1(ctx: Ctx): ReactElement {
  const { fill, camo } = paint(ctx);
  const { ow } = ctx;
  const kit = ctx.kit;
  return (
    <g>
      <GroundShadow cx={46} cy={GROUND} rx={42} ry={4} />
      <CornerBadge ctx={ctx} />
      <Trail ctx={ctx} from={[46, 43.6]} to={[11, 51.2]} w0={4.6} w1={2.6} />
      <Barrel from={[37, 43.8]} to={[64, 41.0]} w={3.4} fill={shade(fill, -0.12)} ow={ow} />
      <Barrel from={[33, 41.0]} to={[86, 35.6]} w={2.6} wEnd={1.9} fill={STEEL} ow={ow} muzzleRing />
      <Shape d={rrect(31.6, 38.8, 5.2, 4.4, 0.8)} fill={shade(STEEL, -0.15)} ow={ow} />
      <Line pts={[[32.6, 43.2], [30.8, 45.6]]} w={0.9} opacity={0.9} />
      <Shield ctx={ctx} d="M44.6 44.6L44.2 30.4L48.4 28.4L52.4 29.8L52.8 44.6Z" hi="M44.2 30.4L48.4 28.4L52.4 29.8V31.8L48.4 30.4L44.2 32.2Z" />
      <Shape d="M44.8 44.6H52.8L52.4 49.4H45.4Z" fill={shade(fill, -0.15)} camo={camo} ow={ow} />
      <Rivets a={[45.4, 32]} b={[45.4, 43]} n={5} />
      <SpokedWheel cx={48.6} cy={44.6} r={8.6} ow={ow} />
      <Soldier kit={dimKit(kit, 0.1)} pose="crewStand" x={9} y={GROUND - 1.6} s={0.94} ow={ow} arm="shell" />
      <Soldier kit={kit} pose="crewKneel" x={23} y={GROUND} s={0.96} ow={ow} />
    </g>
  );
}

function fieldGunInterwar(ctx: Ctx): ReactElement {
  const { fill } = paint(ctx);
  const { ow } = ctx;
  const kit = ctx.kit;
  return (
    <g>
      <GroundShadow cx={46} cy={GROUND} rx={42} ry={4} />
      <CornerBadge ctx={ctx} />
      <Trail ctx={ctx} from={[48, 44.4]} to={[9, 51.4]} w0={4.8} w1={2.8} />
      <Barrel from={[36, 39.6]} to={[66, 34.8]} w={2.6} fill={shade(fill, -0.05)} ow={ow} />
      <Barrel from={[33, 43.4]} to={[90, 34.4]} w={2.9} wEnd={2.1} fill={STEEL} ow={ow} muzzleRing />
      <Barrel from={[38, 45.2]} to={[60, 41.8]} w={3.6} fill={shade(fill, -0.12)} ow={ow} />
      <Shape d={rrect(30.8, 40.6, 5.6, 5.0, 0.9)} fill={shade(STEEL, -0.15)} ow={ow} />
      <Shield
        ctx={ctx}
        d="M45 46L44.8 31.6L47.4 29.4L47 25.8L51.2 24.8L52.4 28.4L53 31L53.2 46Z"
        hi="M47 25.8L51.2 24.8L52.4 28.4L48 29.4Z"
      />
      <Line pts={[[44.9, 31.6], [52.9, 31]]} w={0.6} />
      <Rivets a={[45.8, 33]} b={[45.8, 44.4]} n={5} />
      <DiscWheel cx={49} cy={45} r={8.1} hub={shade(fill, -0.05)} ow={ow} />
      <Soldier kit={dimKit(kit, 0.1)} pose="crewStand" x={8} y={GROUND - 1.6} s={0.94} ow={ow} arm="shell" />
      <Soldier kit={kit} pose="crewKneel" x={22.6} y={GROUND} s={0.96} ow={ow} />
    </g>
  );
}

function fieldGunWW2(ctx: Ctx): ReactElement {
  const { fill } = paint(ctx);
  const { ow } = ctx;
  const kit = ctx.kit;
  const breech: P = [38.6, 43.4];
  const muzzle = polar(breech, 27, 40);
  const cradle0: P = [41.6, 45.8];
  return (
    <g>
      <GroundShadow cx={46} cy={GROUND} rx={42} ry={4} />
      <CornerBadge ctx={ctx} />
      <Trail ctx={ctx} from={[50, 45]} to={[14, 49.6]} w0={3.8} w1={2.4} far />
      <Trail ctx={ctx} from={[50, 46]} to={[19, 52.2]} w0={4.4} w1={2.6} />
      <Barrel from={cradle0} to={polar(cradle0, 27, 22)} w={4.2} fill={shade(fill, -0.1)} ow={ow} />
      <Barrel from={breech} to={muzzle} w={3.4} wEnd={2.8} fill={shade(fill, 0.04)} ow={ow} brake />
      <Shape d={rrect(35.4, 41.0, 6.0, 5.2, 1)} fill={shade(fill, -0.25)} ow={ow} />
      <Shield ctx={ctx} d="M45.6 47L45 32.6L51.6 30.4L55.4 32.6L55.8 47Z" hi="M45 32.6L51.6 30.4L55.4 32.6L55.4 34.6L51.6 32.6L45 34.8Z" />
      <Line pts={[[45.2, 38.6], [55.6, 38.2]]} w={0.6} />
      <RubberWheel cx={50.6} cy={45.6} r={7.6} hub={fill} ow={ow} />
      <Soldier kit={dimKit(kit, 0.1)} pose="crewStand" x={9} y={GROUND - 1.6} s={0.94} ow={ow} arm="shell" />
      <Soldier kit={kit} pose="crewKneel" x={25} y={GROUND} s={0.96} ow={ow} />
    </g>
  );
}

export function drawArtillery(ctx: Ctx): ReactElement {
  if (ctx.gen === 'ww1') return fieldGunWW1(ctx);
  if (ctx.gen === 'interwar') return fieldGunInterwar(ctx);
  return fieldGunWW2(ctx);
}

// ---------------------------------------------------------------------------
// Heavy artillery

/** Iron wheel with the bolted "feet" siege guns used on soft ground. */
function SiegeWheel({ cx, cy, r, ow }: { cx: number; cy: number; r: number; ow: number }) {
  const feet: string[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const w = 1.3;
    const p0: P = [cx + cos * (r - 0.4) - sin * w, cy + sin * (r - 0.4) + cos * w];
    const p1: P = [cx + cos * (r + 1.6) - sin * w, cy + sin * (r + 1.6) + cos * w];
    const p2: P = [cx + cos * (r + 1.6) + sin * w, cy + sin * (r + 1.6) - cos * w];
    const p3: P = [cx + cos * (r - 0.4) + sin * w, cy + sin * (r - 0.4) - cos * w];
    feet.push(`M${p0[0]} ${p0[1]}L${p1[0]} ${p1[1]}L${p2[0]} ${p2[1]}L${p3[0]} ${p3[1]}Z`);
  }
  return (
    <g>
      <path d={feet.join('')} fill="#3b3833" stroke={OUTLINE} strokeWidth={ow * 0.7} strokeLinejoin="round" />
      <SpokedWheel cx={cx} cy={cy} r={r} ow={ow} spokes={14} wood={shade(WOOD, -0.1)} />
    </g>
  );
}

function heavyWW1(ctx: Ctx): ReactElement {
  const { fill, camo } = paint(ctx);
  const { ow } = ctx;
  const breech: P = [41, 37];
  const muzzle = polar(breech, 56, 30);
  return (
    <g>
      <GroundShadow cx={48} cy={GROUND} rx={45} ry={4.2} />
      <CornerBadge ctx={ctx} />
      {/* Timber firing platform. */}
      <Shape d="M14 51.4H86L88 54.6H12Z" fill={WOOD} ow={ow} hi="M14 51.4H86L86.6 52.4H13.4Z">
        <path d="M30 51.4V54.6M48 51.4V54.6M66 51.4V54.6" stroke={WOOD_DARK} strokeWidth={0.7} />
      </Shape>
      <Trail ctx={ctx} from={[44, 44]} to={[17, 49.4]} w0={7} w1={4} />
      <Barrel from={polar(breech, 56, 2)} to={polar(breech, 56, 17)} w={12.6} fill={shade(fill, -0.12)} ow={ow} />
      <Barrel from={breech} to={muzzle} w={9.4} wEnd={8.4} fill={STEEL} ow={ow} />
      {[0.42, 0.62, 0.8].map((t) => (
        <Barrel key={t} from={polar(breech, 56, 30 * t)} to={polar(breech, 56, 30 * t + 1.3)} w={10.4 - t * 1.2} fill={shade(STEEL, -0.1)} ow={ow * 0.8} />
      ))}
      <Barrel from={polar(breech, 56, 27.4)} to={muzzle} w={10.4} wEnd={10.8} fill={shade(STEEL, 0.08)} ow={ow} />
      <Shape d={ellipse(breech[0], breech[1], 5.4, 5.4)} fill={shade(STEEL, -0.2)} ow={ow} />
      {/* Carriage cheek. */}
      <Shape d="M26 47.6L28.4 34.6L41 29.4L52 33.4L54 47.6Z" fill={fill} camo={camo} ow={ow} hi="M28.4 34.6L41 29.4L52 33.4L51.6 35.4L41 31.6L28.4 36.6Z" lo="M24 44H56V50H24Z">
        <Rivets a={[29, 45.4]} b={[52, 45.4]} n={9} />
        <Rivets a={[30, 37]} b={[40, 32.6]} n={5} />
      </Shape>
      <Shape d={ellipse(42, 36.6, 2.6, 2.6)} fill={shade(fill, -0.2)} ow={ow} />
      <SiegeWheel cx={53} cy={39.4} r={11.4} ow={ow} />
      {/* A shell as tall as a man's chest, for scale. */}
      <Shape d="M7.4 52.6V42.4Q7.4 37 10.2 34.6Q13 37 13 42.4V52.6Z" fill="#6a6e5e" ow={ow} hi="M7.4 52.6V42.4Q7.4 37 10.2 34.6V52.6Z">
        <path d="M7.4 47H13M7.4 48.4H13" stroke={BRASS} strokeWidth={0.9} />
      </Shape>
      <Soldier kit={ctx.kit} pose="crewStand" x={16} y={GROUND - 0.6} s={0.86} ow={ow} arm="shell" />
    </g>
  );
}

function heavyInterwar(ctx: Ctx): ReactElement {
  const { fill, camo } = paint(ctx);
  const { ow } = ctx;
  const breech: P = [33, 39.6];
  const muzzle = polar(breech, 33, 54);
  const cradle: P = [36, 42.6];
  return (
    <g>
      <GroundShadow cx={48} cy={GROUND} rx={45} ry={4.2} />
      <CornerBadge ctx={ctx} />
      <Trail ctx={ctx} from={[50, 44]} to={[8, 50.2]} w0={6.4} w1={3.6} />
      <Barrel from={cradle} to={polar(cradle, 33, 30)} w={6.2} fill={shade(fill, -0.1)} ow={ow} />
      <Barrel from={polar(breech, 33, 4)} to={polar(breech, 33, 26)} w={3.0} fill={shade(fill, 0.05)} ow={ow} />
      <Barrel from={breech} to={muzzle} w={5.4} wEnd={4.4} fill={STEEL} ow={ow} muzzleRing />
      <Shape d={rrect(28.6, 36.2, 7.4, 7.0, 1.2)} fill={shade(STEEL, -0.2)} ow={ow} />
      <Shape d="M40 47.4L41 36.4L52 33.2L60 36.6L60.6 47.4Z" fill={fill} camo={camo} ow={ow} hi="M41 36.4L52 33.2L60 36.6L59.8 38.4L52 35.4L41 38.4Z" lo="M38 44H62V50H38Z">
        <Rivets a={[42, 45.8]} b={[59, 45.8]} n={7} />
      </Shape>
      <DiscWheel cx={50.6} cy={42.4} r={10.6} hub={shade(fill, -0.05)} ow={ow} />
      <Soldier kit={ctx.kit} pose="crewKneel" x={17} y={GROUND} s={0.88} ow={ow} />
      <Soldier kit={dimKit(ctx.kit, 0.1)} pose="crewStand" x={7} y={GROUND - 1.2} s={0.86} ow={ow} arm="shell" />
    </g>
  );
}

function heavyWW2(ctx: Ctx): ReactElement {
  const { fill, camo } = paint(ctx);
  const { ow } = ctx;
  const breech: P = [21, 36.4];
  const muzzle = polar(breech, 15, 74);
  return (
    <g>
      <GroundShadow cx={48} cy={GROUND} rx={46} ry={4.2} />
      <CornerBadge ctx={ctx} />
      {/* Rear limber wheels (far, then near). */}
      <RubberWheel cx={21.6} cy={47.8} r={5.4} hub={shade(fill, -0.3)} ow={ow} />
      {/* Long box carriage. */}
      <Shape d="M14 44.6L18 39.8L70 37.6L77 41.6L76 46.6L16 47.6Z" fill={fill} camo={camo} ow={ow} hi="M18 39.8L70 37.6L77 41.6L76 42.8L70 39.6L18 41.6Z" lo="M10 45H80V50H10Z">
        <Rivets a={[20, 45.6]} b={[72, 44.6]} n={12} />
      </Shape>
      <Barrel from={polar(breech, 15, 6)} to={polar(breech, 15, 38)} w={6.0} fill={shade(fill, -0.12)} ow={ow} />
      <Barrel from={polar([breech[0], breech[1] - 4.2], 15, 10)} to={polar([breech[0], breech[1] - 4.2], 15, 30)} w={2.2} fill={shade(fill, 0.05)} ow={ow} />
      <Barrel from={breech} to={muzzle} w={4.2} wEnd={3.0} fill={shade(fill, 0.02)} ow={ow} brake />
      <Shape d={rrect(16.6, 33.0, 7.0, 6.4, 1.2)} fill={shade(fill, -0.3)} ow={ow} />
      {/* Main bogie: twin road wheels. */}
      <RubberWheel cx={66} cy={45.4} r={7.6} hub={shade(fill, -0.3)} ow={ow} />
      <RubberWheel cx={58} cy={45.4} r={7.6} hub={fill} ow={ow} />
      <Shape d="M53 40.8H71L69 43.4H55Z" fill={shade(fill, -0.1)} camo={camo} ow={ow} />
      <RubberWheel cx={25.8} cy={47.8} r={5.4} hub={fill} ow={ow} />
      <Soldier kit={ctx.kit} pose="crewStand" x={8} y={GROUND - 0.4} s={0.86} ow={ow} arm="shell" />
    </g>
  );
}

export function drawHeavyArtillery(ctx: Ctx): ReactElement {
  if (ctx.gen === 'ww1') return heavyWW1(ctx);
  if (ctx.gen === 'interwar') return heavyInterwar(ctx);
  return heavyWW2(ctx);
}

// ---------------------------------------------------------------------------
// Anti-tank

function atInterwar(ctx: Ctx): ReactElement {
  const { fill } = paint(ctx);
  const { ow } = ctx;
  return (
    <g>
      <GroundShadow cx={50} cy={GROUND} rx={40} ry={3.8} />
      <CornerBadge ctx={ctx} />
      <Trail ctx={ctx} from={[52, 47.4]} to={[22, 50.8]} w0={2.8} w1={1.8} far />
      <Trail ctx={ctx} from={[52, 48]} to={[26, 52.4]} w0={3.2} w1={2.0} />
      <Barrel from={[42, 44.2]} to={[86, 42.4]} w={1.6} wEnd={1.3} fill={STEEL} ow={ow} />
      <Barrel from={[44, 45.4]} to={[60, 44.6]} w={2.6} fill={shade(fill, -0.1)} ow={ow} />
      <Shape d={rrect(40.4, 42.4, 4.0, 3.6, 0.6)} fill={shade(fill, -0.25)} ow={ow} />
      <Shield ctx={ctx} d="M49 49.4L48.6 38.4L53.4 36.8L56.2 38.6L56.4 49.4Z" hi="M48.6 38.4L53.4 36.8L56.2 38.6V40.2L53.4 38.6L48.6 40.2Z" />
      <DiscWheel cx={53} cy={47.4} r={5.6} hub={fill} ow={ow} />
      <Soldier kit={ctx.kit} pose="crewKneel" x={34} y={GROUND} s={1.04} ow={ow} />
    </g>
  );
}

function atRiflePL(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  return (
    <g>
      <GroundShadow cx={48} cy={GROUND} rx={42} ry={3.6} />
      <CornerBadge ctx={ctx} />
      <Soldier kit={dimKit(ctx.kit, 0.12)} pose="kneelAim" x={18} y={GROUND - 3} s={0.92} ow={ow} arm="carbine" />
      <Shape d={rrect(5, 46.4, 7.4, 5.6, 0.8)} fill="#5c6247" ow={ow} hi={rect(5, 46.4, 7.4, 1.6)} />
      <Soldier kit={ctx.kit} pose="prone" x={37} y={GROUND} s={1.24} ow={ow} arm="atRifle" />
    </g>
  );
}

function atWW2(ctx: Ctx): ReactElement {
  const { fill, camo } = paint(ctx);
  const { ow } = ctx;
  return (
    <g>
      <GroundShadow cx={48} cy={GROUND} rx={44} ry={3.8} />
      <CornerBadge ctx={ctx} />
      <Trail ctx={ctx} from={[52, 46]} to={[14, 50.2]} w0={3.6} w1={2.2} far />
      <Trail ctx={ctx} from={[52, 47]} to={[19, 52.4]} w0={4} w1={2.4} />
      <Barrel from={[40, 42.2]} to={[64, 41.4]} w={3.4} fill={shade(fill, -0.1)} ow={ow} />
      <Barrel from={[36, 40.6]} to={[93, 38.8]} w={2.5} wEnd={1.9} fill={shade(fill, 0.04)} ow={ow} brake />
      <Shape d={rrect(33.6, 38.4, 5.6, 4.6, 0.8)} fill={shade(fill, -0.3)} ow={ow} />
      <Shield ctx={ctx} d="M47 48.2L46.6 34.6L53.6 32.6L57.4 35.2L57.6 48.2Z" hi="M46.6 34.6L53.6 32.6L57.4 35.2V37L53.6 34.6L46.6 36.4Z" />
      <Shape d="M46.8 48.2H57.6L57 51.6H47.4Z" fill={shade(fill, -0.15)} camo={camo} ow={ow} />
      <RubberWheel cx={52.6} cy={46.4} r={6.6} hub={fill} ow={ow} />
      <Soldier kit={ctx.kit} pose="crewKneel" x={27} y={GROUND} s={1.04} ow={ow} />
    </g>
  );
}

export function drawAntiTank(ctx: Ctx): ReactElement {
  if (ctx.gen === 'ww2') return atWW2(ctx);
  if (ctx.pattern === 'pl') return atRiflePL(ctx);
  return atInterwar(ctx);
}
