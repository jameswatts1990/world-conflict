// Wheeled and half-tracked vehicles: motorised infantry (lorry, half-track)
// and armoured cars. Card frame 96 x 60, ground at y = 53.
import type { ReactElement } from 'react';
import { dimKit, type Ctx } from './context';
import { Soldier } from './figures';
import { GROUND } from './infantryArt';
import { BRASS, OUTLINE, STEEL, TYRE, shade } from './palettes';
import { ArtilleryWheel, Barrel, ClipTo, DiscWheel, GroundShadow, Line, Rivets, RubberWheel, Shape, TrackRun, ellipse, rect, rrect } from './primitives';
import { Badge, MgBarrel, Plate } from './tanksArt';

const CAB_WINDOW = 'M61.2 29.4H69.6L71.8 35.6H61.2Z';

function Mudguard({ cx, r, y, ctx }: { cx: number; r: number; y: number; ctx: Ctx }) {
  const d = `M${cx - r - 1.6} ${y}Q${cx - r - 1.2} ${y - r - 1.6} ${cx} ${y - r - 1.8}Q${cx + r + 1.2} ${y - r - 1.6} ${cx + r + 1.6} ${y}L${cx + r} ${y}Q${cx + r} ${y - r} ${cx} ${y - r}Q${cx - r} ${y - r} ${cx - r} ${y}Z`;
  return <Plate ctx={ctx} d={d} tone={-0.12} />;
}

function Headlamp({ x, y, ow }: { x: number; y: number; ow: number }) {
  return <path d={ellipse(x, y, 1.3, 1.5)} fill={BRASS} stroke={OUTLINE} strokeWidth={ow * 0.7} />;
}

// ---------------------------------------------------------------------------
// Motorised infantry

function lorry(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  const kit = ctx.kit;
  const back = dimKit(kit, 0.12);
  return (
    <g>
      <GroundShadow cx={50} cy={GROUND} rx={43} ry={4} />
      {/* Chassis rail. */}
      <Shape d={rect(12, 42.6, 76, 2.4)} fill={shade(v, -0.45)} ow={ow} />
      {/* Riflemen seated in the back: only heads, shoulders and rifles show above the sides. */}
      <Soldier kit={back} pose="seated" x={20} y={43} s={1.0} ow={ow} arm="rifle" />
      <Soldier kit={back} pose="seated" x={37} y={43} s={1.0} ow={ow} arm="rifle" />
      <Soldier kit={kit} pose="seated" x={28} y={44.4} s={1.04} ow={ow} arm="rifle" />
      <Soldier kit={kit} pose="seated" x={46} y={44.4} s={1.04} ow={ow} arm="rifle" />
      {/* Cargo bed with plank sides. */}
      <Plate ctx={ctx} d="M12 43.2V33.6H58V43.2Z" hi={rect(12, 33.6, 46, 1.4)} lo={rect(12, 41, 46, 3)}>
        <Line pts={[[12, 36.8], [58, 36.8]]} w={0.5} opacity={0.5} />
        <Line pts={[[12, 40], [58, 40]]} w={0.5} opacity={0.5} />
        <Line pts={[[24, 33.6], [24, 43.2]]} w={0.7} />
        <Line pts={[[36, 33.6], [36, 43.2]]} w={0.7} />
        <Line pts={[[48, 33.6], [48, 43.2]]} w={0.7} />
      </Plate>
      {/* Cab, with the driver seen through the side window. */}
      <Plate ctx={ctx} d="M59 43.2V30.6Q59 27.4 62 27.4H70.6L73.4 36V43.2Z" hi="M59 30.6Q59 27.4 62 27.4H70.6L71 28.8H60.4Z" lo={rect(58, 40.6, 16, 3)}>
        <path d={CAB_WINDOW} fill="#1b1d1f" />
        <Line pts={[[66, 36.6], [66, 43]]} w={0.6} />
      </Plate>
      <ClipTo d={CAB_WINDOW}>
        <Soldier kit={kit} pose="seated" x={63} y={50.6} s={0.98} ow={ow} />
      </ClipTo>
      <path d={CAB_WINDOW} fill="none" stroke={OUTLINE} strokeWidth={ow * 0.8} strokeLinejoin="round" />
      {/* Bonnet and radiator. */}
      <Plate ctx={ctx} d="M73 43.2V35.4H86.6Q88.6 35.4 88.6 37.4V43.2Z" hi={rect(73, 35.4, 15.6, 1.3)} lo={rect(73, 41, 16, 3)}>
        <path d="M76 37.6V41.6M77.6 37.6V41.6M79.2 37.6V41.6M80.8 37.6V41.6" stroke={OUTLINE} strokeWidth={0.5} opacity={0.6} />
      </Plate>
      <Shape d={rrect(87.4, 35, 2.2, 8.2, 0.6)} fill={shade(v, -0.3)} ow={ow * 0.8} />
      <Headlamp x={88.2} y={34} ow={ow} />
      <Badge ctx={ctx} cx={30} cy={38.4} r={3} />
      {/* Wheels: single front, twin rear axles. */}
      <Mudguard cx={77} r={5.8} y={43.4} ctx={ctx} />
      <DiscWheel cx={22} cy={47.2} r={5.8} hub={shade(v, -0.1)} ow={ow} />
      <DiscWheel cx={35} cy={47.2} r={5.8} hub={shade(v, -0.1)} ow={ow} />
      <DiscWheel cx={77} cy={47.2} r={5.8} hub={shade(v, -0.1)} ow={ow} />
    </g>
  );
}

function halfTrack(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  const kit = ctx.kit;
  return (
    <g>
      <GroundShadow cx={50} cy={GROUND} rx={44} ry={4} />
      <TrackRun x0={10} x1={56} top={40.8} bottom={53} style="overlap" wheels={4} hull={v} ow={ow} />
      {/* Troops in the open compartment: heads above the armour. */}
      <Soldier kit={dimKit(kit, 0.12)} pose="seated" x={18} y={45.4} s={1.0} ow={ow} arm="rifle" />
      <Soldier kit={kit} pose="seated" x={30} y={46} s={1.0} ow={ow} />
      <Soldier kit={dimKit(kit, 0.12)} pose="seated" x={42} y={45.4} s={1.0} ow={ow} arm="rifle" />
      {/* Pintle machine gun with shield at the front of the compartment. */}
      <MgBarrel from={[56, 27.6]} len={11} ow={ow} />
      <Plate ctx={ctx} d="M54.6 33L55.4 25.8L59.4 25L60.4 33Z" tone={0.05} />
      <Plate
        ctx={ctx}
        d="M10.4 44.4L8.6 33.4L56 32.6L62.4 31.4L66 31.4L70.4 34.6L86.6 37.6L91 41.6L90 44.4Z"
        hi="M8.6 33.4L56 32.6L62.4 31.4L66 31.4L70.4 34.6L86.6 37.6L91 41.6L89 41.8L86 39.2L70 36.2L65.4 33.2L8.8 35Z"
        lo={rect(6, 41.8, 88, 3)}
      >
        <Line pts={[[9.6, 38.2], [70, 37.2]]} w={0.6} />
        <Line pts={[[62.4, 31.4], [63, 44.4]]} w={0.6} />
        <Rivets a={[12, 42.8]} b={[60, 42.8]} n={12} />
      </Plate>
      <Shape d={rrect(64.4, 32.6, 3.2, 1.2, 0.4)} fill={OUTLINE} ow={0.3} />
      <Badge ctx={ctx} cx={34} cy={40.2} r={2.9} />
      <Mudguard cx={77} r={5.6} y={44.2} ctx={ctx} />
      <RubberWheel cx={77} cy={47.6} r={5.4} hub={v} ow={ow} />
      <Headlamp x={86} y={36.2} ow={ow} />
    </g>
  );
}

export function drawMotorised(ctx: Ctx): ReactElement {
  return ctx.gen === 'ww2' ? halfTrack(ctx) : lorry(ctx);
}

// ---------------------------------------------------------------------------
// Armoured cars

function armouredCar1920s(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  return (
    <g>
      <GroundShadow cx={50} cy={GROUND} rx={40} ry={4} />
      {/* Running board and fenders. */}
      <Shape d="M18 43.4H82L83 45H17Z" fill={shade(v, -0.35)} ow={ow * 0.8} />
      <Plate ctx={ctx} d="M16 44V32.6Q16 29.8 19 29.8H60L62 44Z" hi="M19 29.8H60L60.2 31.4H17.4Q16.4 31.4 16.6 30.8Z" lo={rect(15, 41.4, 48, 3)}>
        <Rivets a={[18.6, 32.4]} b={[59, 32.4]} n={12} />
        <Rivets a={[18.6, 42.4]} b={[60, 42.4]} n={12} />
        <Line pts={[[40, 29.8], [40.6, 44]]} w={0.6} />
      </Plate>
      {/* Long armoured bonnet with louvred radiator doors. */}
      <Plate ctx={ctx} d="M60 44L59.6 34L84 34.6Q87.6 35 87.6 38.4V44Z" hi="M59.6 34L84 34.6L84.4 36H59.6Z" lo={rect(58, 41.6, 32, 3)}>
        <path d="M84.6 36.4V43M86 36.8V43" stroke={OUTLINE} strokeWidth={0.5} opacity={0.6} />
        <Rivets a={[62, 36.6]} b={[82, 36.8]} n={7} />
      </Plate>
      <Headlamp x={88.4} y={33.6} ow={ow} />
      {/* Round turret with water-cooled machine gun. */}
      <MgBarrel from={[46, 25.6]} len={14} ow={ow} jacket />
      <Plate ctx={ctx} d="M24.4 30L25.4 23.4Q26 21.4 28.6 21.2H44Q46.6 21.4 47.2 23.4L48.2 30Z" hi="M25.4 23.4Q26 21.4 28.6 21.2H44Q46.6 21.4 47.2 23.4L47.2 24.6H25.2Z" lo={rect(24, 27.6, 25, 3)}>
        <Rivets a={[26.4, 28.6]} b={[46.4, 28.6]} n={8} />
        <Line pts={[[30.6, 21.2], [30.2, 30]]} w={0.5} />
        <Line pts={[[42, 21.2], [42.4, 30]]} w={0.5} />
      </Plate>
      <Badge ctx={ctx} cx={36.2} cy={25.8} r={2.7} />
      {/* Spare wheel strapped to the side. */}
      <circle cx={51} cy={37.4} r={4.0} fill={TYRE} stroke={OUTLINE} strokeWidth={ow} />
      <circle cx={51} cy={37.4} r={2.0} fill={shade(v, -0.2)} stroke={OUTLINE} strokeWidth={ow * 0.6} />
      <Mudguard cx={28} r={6.4} y={44.2} ctx={ctx} />
      <Mudguard cx={74} r={6.4} y={44.2} ctx={ctx} />
      <ArtilleryWheel cx={28} cy={46.6} r={6.4} hub={shade(v, 0.1)} ow={ow} />
      <ArtilleryWheel cx={74} cy={46.6} r={6.4} hub={shade(v, 0.1)} ow={ow} />
    </g>
  );
}

function armouredCarWW2(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  return (
    <g>
      <GroundShadow cx={50} cy={GROUND} rx={44} ry={4} />
      {/* Far-side wheels peek below the hull. */}
      <Plate
        ctx={ctx}
        d="M6.6 41.6L13.6 32.4L78 32.4L90.6 40.4L87 45.8L10.6 45.8Z"
        hi="M13.6 32.4L78 32.4L90.6 40.4L88.6 41.2L77.4 34.4L13.8 34.6L8.6 41.4Z"
        lo={rect(4, 42.6, 90, 4)}
      >
        <Line pts={[[10, 40], [88, 40]]} w={0.6} />
        <Line pts={[[78, 32.4], [76.4, 45.8]]} w={0.6} />
        <Line pts={[[13.6, 32.4], [15, 45.8]]} w={0.6} />
      </Plate>
      {/* Stowage boxes between the wheel pairs. */}
      <Plate ctx={ctx} d={rect(40.4, 39.2, 12.4, 5)} tone={-0.1} />
      <Shape d={rrect(78.6, 34.6, 3.4, 1.2, 0.4)} fill={OUTLINE} ow={0.3} />
      {/* Turret with light cannon and coaxial MG. */}
      <Barrel from={[58, 26.6]} to={[83, 26.6]} w={1.5} fill={STEEL} ow={ow} />
      <Barrel from={[58, 28.8]} to={[64, 28.8]} w={0.9} fill={STEEL} ow={ow * 0.8} />
      <Plate ctx={ctx} d="M31.6 32.6L34.6 25.2L56.4 25.2L61.4 32.6Z" hi="M34.6 25.2L56.4 25.2L57.4 26.6L34 26.8Z" lo={rect(30, 30.6, 33, 2.4)} />
      <Plate ctx={ctx} d="M38 25.4L38.6 22.6H45.6L46.2 25.4Z" tone={-0.06} />
      <Badge ctx={ctx} cx={28} cy={37.6} r={2.9} />
      {[16, 29, 60, 73].map((x) => (
        <RubberWheel key={x} cx={x} cy={47.6} r={5.4} hub={shade(v, -0.05)} ow={ow} />
      ))}
    </g>
  );
}

export function drawArmouredCar(ctx: Ctx): ReactElement {
  return ctx.gen === 'ww2' ? armouredCarWW2(ctx) : armouredCar1920s(ctx);
}
