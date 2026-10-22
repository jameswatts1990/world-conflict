// Map-counter icons: one bold, simplified silhouette per unit in a 40 x 24
// frame (ground at y = 22.6), readable at 26-40 px. Nation colours, headgear
// and hull insignia carry over from the full card art.
import type { ReactElement } from 'react';
import { withHeadgear, type Ctx, type Kit } from './context';
import { Horse } from './cavalryArt';
import { Soldier } from './figures';
import { HORSE_COATS, OUTLINE, PENNANTS, ROCK, SNOW, STEEL, TRACK, TRACK_LIGHT, WOOD, shade } from './palettes';
import {
  ArtilleryWheel,
  Barrel,
  DiscWheel,
  GroundShadow,
  RubberWheel,
  Shape,
  SpokedWheel,
  TrackRun,
  polar,
  rect,
  rrect,
  type P,
} from './primitives';
import { Badge, MgBarrel, Plate } from './tanksArt';
import type { ArtUnitType } from './types';

const G = 22.6;

function Shadow({ cx = 20, rx = 17 }: { cx?: number; rx?: number }) {
  return <GroundShadow cx={cx} cy={G} rx={rx} ry={1.7} opacity={0.5} />;
}

function Wheels({ ctx, xs, y, r }: { ctx: Ctx; xs: number[]; y: number; r: number }) {
  return (
    <g>
      {xs.map((x) => (
        <RubberWheel key={x} cx={x} cy={y} r={r} hub={shade(ctx.pal.vehicle, -0.05)} ow={ctx.ow * 0.9} nuts={false} />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Foot and horse

function mountainKit(ctx: Ctx): { kit: Kit; edelweiss: boolean } {
  if (ctx.pattern === 'it') return { kit: withHeadgear(ctx, 'alpini'), edelweiss: false };
  if (ctx.pattern === 'fr') return { kit: withHeadgear(ctx, 'beret'), edelweiss: false };
  if (ctx.pattern === 'de' && ctx.gen !== 'ww1') return { kit: withHeadgear(ctx, 'bergmutze'), edelweiss: true };
  return { kit: ctx.kit, edelweiss: false };
}

/** Outline width for figures in icons: lighter than hulls, since limbs overlap. */
const FIG_OW = 0.95;

function iconInfantry(ctx: Ctx): ReactElement {
  return (
    <g>
      <Shadow rx={14} />
      <Soldier kit={ctx.kit} pose="kneelAim" x={12} y={G} s={0.86} ow={FIG_OW} arm={ctx.gen === 'ww1' ? 'bayonet' : 'rifle'} back="pack" bold />
    </g>
  );
}

function iconStormtroopers(ctx: Ctx): ReactElement {
  if (ctx.pattern === 'it') {
    const kit = { ...(ctx.gen === 'ww1' ? withHeadgear(ctx, 'fez') : ctx.kit), flash: '#151515' };
    return (
      <g>
        <Shadow rx={12} />
        <Soldier kit={kit} pose="stab" x={16} y={G} s={0.76} ow={FIG_OW} hand="dagger" bold />
      </g>
    );
  }
  if (ctx.gen === 'ww2') {
    return (
      <g>
        <Shadow rx={14} />
        <Soldier kit={ctx.kit} pose="crouchRun" x={11} y={G} s={0.84} ow={FIG_OW} arm="flamer" back="flametanks" bold />
      </g>
    );
  }
  return (
    <g>
      <Shadow rx={12} />
      <Soldier kit={ctx.kit} pose="throw" x={19} y={G} s={0.72} ow={FIG_OW} hand={ctx.pattern === 'de' ? 'stickGrenade' : 'eggGrenade'} back="slungRifle" bold />
    </g>
  );
}

function iconMountain(ctx: Ctx): ReactElement {
  const { kit, edelweiss } = mountainKit(ctx);
  const y = (x: number) => 23.4 - 0.16 * (x - 2);
  return (
    <g>
      <Shape d={`M1 ${y(1) + 0.4}L10 ${y(10) - 0.6}L16 ${y(16)}L24 ${y(24) - 0.8}L30 ${y(30) - 0.2}L39 ${y(39) - 0.6}L39 24.6L1 24.6Z`} fill={ROCK} ow={ctx.ow} lo="M0 23H40V25H0Z" />
      <path d={`M24.6 ${y(24) - 0.6}Q28 ${y(28) - 1.6} 31 ${y(30) - 0.1}Q28 ${y(28) + 0.2} 24.6 ${y(24) - 0.6}Z`} fill={SNOW} stroke={OUTLINE} strokeWidth={0.4} />
      <Soldier kit={kit} pose="hike" x={16} y={y(16)} s={0.68} ow={FIG_OW} arm="alpenstock" back="rucksack" edelweiss={edelweiss} bold />
    </g>
  );
}

function iconCavalry(ctx: Ctx): ReactElement {
  const { nation, pattern, gen } = ctx;
  let kit: Kit = { ...ctx.kit, jackboots: true };
  let cuirass = false;
  if (gen === 'ww1' && pattern === 'fr') {
    kit = { ...withHeadgear(ctx, 'cuirassier'), jackboots: true };
    cuirass = true;
  } else if (gen === 'ww1' && pattern === 'de') kit = { ...withHeadgear(ctx, 'czapka'), jackboots: true };
  const s = 0.43;
  const hx = 18.4;
  const coat = HORSE_COATS[nation];
  const pose = gen === 'ww1' ? 'rideLance' : gen === 'interwar' ? 'rideSabre' : 'rideReins';
  return (
    <g>
      <Shadow rx={13} />
      <Horse x={hx} y={G} s={s} ow={FIG_OW * 0.9} coat={coat.coat} mane={coat.mane} cloth={shade(ctx.kit.uniform, -0.42)} nation={nation} accent={ctx.accent} bold />
      <Soldier
        kit={kit}
        pose={pose}
        x={hx - 1.2 * s}
        y={G - 14.2 * s}
        s={s}
        ow={FIG_OW * 0.9}
        bold
        cuirass={cuirass}
        arm={gen === 'ww1' ? 'lance' : undefined}
        hand={gen === 'interwar' ? 'sabre' : undefined}
        back={gen === 'ww2' ? 'slungRifle' : undefined}
        pennant={PENNANTS[nation]}
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Wheeled vehicles

function seatedHeads(ctx: Ctx, xs: number[], y: number): ReactElement {
  return (
    <g>
      {xs.map((x) => (
        <Soldier key={x} kit={ctx.kit} pose="seated" x={x} y={y} s={0.6} ow={FIG_OW * 0.9} bold />
      ))}
    </g>
  );
}

function iconMotorised(ctx: Ctx): ReactElement {
  const v = ctx.pal.vehicle;
  if (ctx.gen === 'ww2') {
    return (
      <g>
        <Shadow />
        <TrackRun x0={3} x1={22} top={16.8} bottom={22.6} style="road" wheels={3} hull={v} ow={ctx.ow * 0.9} />
        {seatedHeads(ctx, [7, 13.4], 16.6)}
        <Plate ctx={ctx} d="M3.4 18.4L2.6 12.4L22 12L25 10.8L28 10.8L30 13L35.6 14.6L37.6 17.2L37 18.4Z" hi="M2.6 12.4L22 12L25 10.8L28 10.8L30 13L35.6 14.6L37.6 17.2L36.6 17.4L35 15.6L29.4 14.2L27.6 12.2L3 13.6Z" />
        <Badge ctx={ctx} cx={12.6} cy={15.4} r={2} />
        <RubberWheel cx={31} cy={19.4} r={3.2} hub={v} ow={ctx.ow * 0.9} nuts={false} />
      </g>
    );
  }
  return (
    <g>
      <Shadow />
      {seatedHeads(ctx, [6.6, 12.6, 18.6], 17.8)}
      <Shape d={rect(3, 17.2, 33, 1.6)} fill={shade(v, -0.45)} ow={ctx.ow * 0.8} />
      <Plate ctx={ctx} d="M3.4 18.2V12.8H23.4V18.2Z" hi={rect(3.4, 12.8, 20, 1)} />
      <Plate ctx={ctx} d="M23.4 18.2V10.4H28.4L30 14.4V18.2Z" hi="M23.4 10.4H28.4L28.6 11.2H23.4Z" />
      <path d="M24.6 11.4H27.8L28.8 14H24.6Z" fill="#1b1d1f" />
      <Plate ctx={ctx} d="M30 18.2V14H35.2Q36.6 14 36.6 15.4V18.2Z" />
      <Badge ctx={ctx} cx={13.4} cy={15.4} r={2} />
      <DiscWheel cx={9.4} cy={19.6} r={3} hub={shade(v, -0.1)} ow={ctx.ow * 0.9} />
      <DiscWheel cx={31.4} cy={19.6} r={3} hub={shade(v, -0.1)} ow={ctx.ow * 0.9} />
    </g>
  );
}

function iconArmouredCar(ctx: Ctx): ReactElement {
  const v = ctx.pal.vehicle;
  if (ctx.gen === 'ww2') {
    return (
      <g>
        <Shadow />
        <Barrel from={[22, 10.6]} to={[35.4, 10.6]} w={1.1} fill={STEEL} ow={ctx.ow} />
        <Plate ctx={ctx} d="M11.4 13.4L13 9.2H23.4L25.6 13.4Z" hi="M13 9.2H23.4L23.8 10.2H12.6Z" />
        <Plate ctx={ctx} d="M2.2 16.8L5.6 12.8H31.6L37.6 16.4L36 19.2H3.8Z" hi="M5.6 12.8H31.6L37.6 16.4L36.4 16.8L31.2 14H5.8L3.4 16.6Z" />
        <Badge ctx={ctx} cx={13.4} cy={16} r={2} />
        <Wheels ctx={ctx} xs={[7.8, 14.4, 25.2, 31.6]} y={19.8} r={2.8} />
      </g>
    );
  }
  return (
    <g>
      <Shadow />
      <MgBarrel from={[19, 9.6]} len={8} ow={ctx.ow} />
      <Plate ctx={ctx} d="M8.6 12.4L9.2 8.8Q9.6 7.6 11 7.6H18.4Q19.8 7.6 20.2 8.8L20.8 12.4Z" hi="M9.2 8.8Q9.6 7.6 11 7.6H18.4Q19.8 7.6 20.2 8.8Z" />
      <Plate ctx={ctx} d="M5 18.6V13.6Q5 12.2 6.6 12.2H24V18.6Z" hi="M6.6 12.2H24V13.2H5.2Z" />
      <Plate ctx={ctx} d="M24 18.6V14.2H34Q36 14.4 36 16V18.6Z" hi="M24 14.2H34L34.4 15H24Z" />
      <Badge ctx={ctx} cx={14.6} cy={10.2} r={1.8} />
      <ArtilleryWheel cx={11} cy={19} r={3.6} hub={shade(v, 0.1)} ow={ctx.ow * 0.9} spokes={8} />
      <ArtilleryWheel cx={29.6} cy={19} r={3.6} hub={shade(v, 0.1)} ow={ctx.ow * 0.9} spokes={8} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Guns

function IconTrail({ ctx, from, to, w }: { ctx: Ctx; from: P; to: P; w: number }) {
  return <Plate ctx={ctx} d={`M${from[0]} ${from[1] - w / 2}L${to[0]} ${to[1] - w * 0.3}L${to[0] - 0.6} ${to[1] + w * 0.4}L${from[0]} ${from[1] + w / 2}Z`} />;
}

function iconArtillery(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  if (ctx.gen === 'ww2') {
    const breech: P = [14, 16.4];
    return (
      <g>
        <Shadow />
        <IconTrail ctx={ctx} from={[22, 18]} to={[4, 21.4]} w={2.6} />
        <Barrel from={breech} to={polar(breech, 27, 23)} w={2.2} wEnd={1.8} fill={shade(v, 0.04)} ow={ow} brake />
        <Plate ctx={ctx} d="M19 19L18.6 11.2L23.2 10L25 11.4L25.2 19Z" hi="M18.6 11.2L23.2 10L25 11.4L24.8 12.4L23.2 11.2L18.6 12.4Z" />
        <RubberWheel cx={22} cy={18.4} r={4.2} hub={v} ow={ow * 0.9} nuts={false} />
      </g>
    );
  }
  const interwar = ctx.gen === 'interwar';
  return (
    <g>
      <Shadow />
      <IconTrail ctx={ctx} from={[20, 17.6]} to={[3.6, 21.6]} w={2.8} />
      <Barrel from={[13, 16.6]} to={interwar ? [38.4, 12.2] : [37.6, 13.8]} w={1.7} wEnd={1.3} fill={STEEL} ow={ow} />
      <Plate
        ctx={ctx}
        d={interwar ? 'M18.6 18.4L18.4 10.6L20 9.4L19.8 7.4L22.6 6.8L23.6 9L24.2 10.6L24.4 18.4Z' : 'M18.6 18.4L18.4 9.6L21.4 8.4L24.2 9.4L24.4 18.4Z'}
        hi={interwar ? 'M19.8 7.4L22.6 6.8L23.6 9L20 9.4Z' : 'M18.4 9.6L21.4 8.4L24.2 9.4L24.2 10.6L21.4 9.6L18.4 10.8Z'}
      />
      {interwar ? (
        <DiscWheel cx={21.4} cy={18} r={4.6} hub={shade(v, -0.05)} ow={ow * 0.9} />
      ) : (
        <SpokedWheel cx={21.4} cy={17.8} r={4.8} ow={ow * 0.9} spokes={8} />
      )}
    </g>
  );
}

function iconHeavyArtillery(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  if (ctx.gen === 'ww1') {
    const breech: P = [16.4, 13.4];
    return (
      <g>
        <Shadow />
        <Shape d="M3 21.2H37L37.8 23.4H2.2Z" fill={WOOD} ow={ow * 0.8} />
        <IconTrail ctx={ctx} from={[18, 17]} to={[5, 20.6]} w={3.6} />
        <Barrel from={breech} to={polar(breech, 56, 13)} w={6.2} wEnd={5.6} fill={STEEL} ow={ow} muzzleRing />
        <Plate ctx={ctx} d="M11.6 19.8L12.4 12.2L18.6 10.2L24 12.4L24.6 19.8Z" />
        <SpokedWheel cx={19.4} cy={15.4} r={5.6} ow={ow * 0.9} spokes={10} />
        <circle cx={19.4} cy={15.4} r={6.4} fill="none" stroke="#3b3833" strokeWidth={1.4} strokeDasharray="1.1 1" />
      </g>
    );
  }
  if (ctx.gen === 'interwar') {
    const breech: P = [12, 15.2];
    return (
      <g>
        <Shadow />
        <IconTrail ctx={ctx} from={[22, 17.4]} to={[2.6, 21.4]} w={3.4} />
        <Barrel from={breech} to={polar(breech, 33, 26)} w={3.2} wEnd={2.6} fill={STEEL} ow={ow} muzzleRing />
        <Plate ctx={ctx} d="M17 19L17.6 12.6L22.6 11L26.2 12.6L26.4 19Z" />
        <DiscWheel cx={21.6} cy={17.2} r={5.4} hub={shade(v, -0.05)} ow={ow * 0.9} />
      </g>
    );
  }
  const breech: P = [7, 13.4];
  return (
    <g>
      <Shadow />
      <Plate ctx={ctx} d="M3 17.6L5 14.8L30 14L33.6 16L33 18.8L4.2 19.2Z" />
      <Barrel from={breech} to={polar(breech, 15, 33)} w={2.4} wEnd={1.8} fill={shade(v, 0.03)} ow={ow} brake />
      <Shape d={rrect(4.6, 11.6, 4.4, 4, 0.8)} fill={shade(v, -0.3)} ow={ow * 0.9} />
      <RubberWheel cx={8.4} cy={19.8} r={2.8} hub={v} ow={ow * 0.9} nuts={false} />
      <RubberWheel cx={26.6} cy={18.6} r={4} hub={v} ow={ow * 0.9} nuts={false} />
      <RubberWheel cx={21} cy={18.6} r={4} hub={v} ow={ow * 0.9} nuts={false} />
    </g>
  );
}

function iconAntiTank(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  if (ctx.gen !== 'ww2' && ctx.pattern === 'pl') {
    return (
      <g>
        <Shadow />
        <Soldier kit={ctx.kit} pose="prone" x={14} y={G} s={0.8} ow={FIG_OW} arm="atRifle" bold />
      </g>
    );
  }
  const ww2 = ctx.gen === 'ww2';
  return (
    <g>
      <Shadow />
      <IconTrail ctx={ctx} from={[21, 19.4]} to={[4, 21.8]} w={2.2} />
      <Barrel from={[12, 16]} to={[38.6, 15.2]} w={ww2 ? 1.6 : 1.3} wEnd={ww2 ? 1.3 : 1.1} fill={ww2 ? shade(v, 0.04) : STEEL} ow={ow} brake={ww2} />
      <Plate
        ctx={ctx}
        d={ww2 ? 'M17.4 20.4L17 11.6L21.6 10.4L24.4 12L24.6 20.4Z' : 'M17.6 20.2L17.4 12.4L21 11.2L23.6 12.6L23.8 20.2Z'}
        hi={ww2 ? 'M17 11.6L21.6 10.4L24.4 12L24.4 13L21.6 11.6L17 12.8Z' : 'M17.4 12.4L21 11.2L23.6 12.6L23.6 13.6L21 12.4L17.4 13.6Z'}
      />
      {ww2 ? <RubberWheel cx={21} cy={19.6} r={3.4} hub={v} ow={ow * 0.9} nuts={false} /> : <DiscWheel cx={20.6} cy={19.4} r={3.3} hub={v} ow={ow * 0.9} />}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Tracked armour

function iconLightTank(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  if (ctx.gen === 'ww1') {
    const belt = 'M10.4 22.4L29.6 22.4A4.4 4.4 0 0 0 30.6 13.6L10.6 15.8A3.3 3.3 0 0 0 10.4 22.4Z';
    return (
      <g>
        <Shadow cx={19} rx={16} />
        <Plate ctx={ctx} d="M12 16.4L3 20.8L2.6 22.4L4.6 22.4L13 19.4Z" tone={-0.12} />
        <Plate ctx={ctx} d="M11 17L10.4 11.2L14 9.6L24.2 9.6L31 13.8L29.6 16.6Z" hi="M14 9.6L24.2 9.6L25 10.4L13.6 10.6Z" />
        <path d={belt} fill={TRACK} stroke={OUTLINE} strokeWidth={ow} />
        <path d="M11 20.6L29.4 20.6A2.6 2.6 0 0 0 30.4 15.4L11.4 17.4Q9.2 18 9.4 19.2Q9.6 20.6 11 20.6Z" fill={v} stroke={OUTLINE} strokeWidth={ow * 0.6} />
        <Barrel from={[23.8, 6.8]} to={[29.4, 6.8]} w={1.3} fill={STEEL} ow={ow} />
        <Plate ctx={ctx} d="M16.4 9.8L16.8 5.4L18 4.4L23 4.4L24.2 5.4L24.6 9.8Z" hi="M16.8 5.4L18 4.4L23 4.4L24.2 5.4Z" />
        <Badge ctx={ctx} cx={20.4} cy={7.4} r={1.7} />
      </g>
    );
  }
  if (ctx.gen === 'interwar') {
    return (
      <g>
        <Shadow />
        <TrackRun x0={7} x1={33} top={17} bottom={22.6} style="bogie" wheels={4} hull={v} ow={ow * 0.9} />
        <MgBarrel from={[23, 11.2]} len={7} ow={ow} />
        <Plate ctx={ctx} d="M7.4 18L7.8 14.4L10.6 13.2L25 13.2L33.4 16.2L33 18Z" hi="M10.6 13.2L25 13.2L33.4 16.2L32.6 16.8L25 14.2L10.4 14.2Z" />
        <Plate ctx={ctx} d="M14 13.4L14.4 10L15.6 9.2L22.4 9.2L23.4 10.2L23.8 13.4Z" hi="M14.4 10L15.6 9.2L22.4 9.2L23.4 10.2Z" />
        <Badge ctx={ctx} cx={13.4} cy={15.8} r={1.7} />
      </g>
    );
  }
  return (
    <g>
      <Shadow />
      <TrackRun x0={6} x1={33} top={16.4} bottom={22.6} style="road" wheels={4} hull={v} ow={ow * 0.9} />
      <Barrel from={[25, 10.2]} to={[36.4, 10.2]} w={1.1} fill={STEEL} ow={ow} />
      <Plate ctx={ctx} d="M5.6 17.6L6.2 13.4L27.6 13L35 15.6L34.4 17.6Z" hi="M6.2 13.4L27.6 13L35 15.6L34 16L27.4 14L6.2 14.4Z" />
      <Plate ctx={ctx} d="M13.4 13.2L14.2 9.4L16 8.4L23.6 8.4L25.6 9.8L26.2 13.2Z" hi="M14.2 9.4L16 8.4L23.6 8.4L25.6 9.8Z" />
      <Badge ctx={ctx} cx={19.6} cy={10.9} r={1.6} />
    </g>
  );
}

function iconTank(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  if (ctx.gen === 'ww1') {
    if (ctx.pattern === 'de') {
      return (
        <g>
          <Shadow />
          <TrackRun x0={8} x1={32} top={18.8} bottom={22.6} style="bogie" wheels={4} hull={v} ow={ow * 0.8} />
          <Barrel from={[34, 14]} to={[39.4, 14]} w={1.5} fill={STEEL} ow={ow} />
          <Plate ctx={ctx} d="M5 20.2L3.8 15L5.8 11L9.2 9.4L30.8 9.4L34.2 11L36.2 15L34.8 20.2Z" hi="M9.2 9.4L30.8 9.4L34.2 11L5.8 11Z" />
          <Plate ctx={ctx} d="M16.4 9.6L17 6.4H23.4L24 9.6Z" tone={0.05} />
          <Badge ctx={ctx} cx={20} cy={14.8} r={2.6} />
        </g>
      );
    }
    if (ctx.pattern === 'fr') {
      return (
        <g>
          <Shadow />
          <TrackRun x0={8} x1={28} top={18} bottom={22.6} style="bogie" wheels={4} hull={v} ow={ow * 0.8} />
          <Plate ctx={ctx} d="M6.6 18.6L1.6 20.4L1.4 21.8L3 21.8L7.2 20.6Z" tone={-0.15} />
          <Plate ctx={ctx} d="M6.4 20L5.4 12L8.4 9.6L24 9.6L27.4 11.8L38.6 20L34.4 20.4L28 19.2L8.4 20.2Z" hi="M8.4 9.6L24 9.6L27.4 11.8L38.6 20L37.2 20.2L27 12.8L8 10.8Z" />
          <Plate ctx={ctx} d="M11.6 9.8L12.4 6.8H17.4L18.2 9.8Z" tone={0.05} />
          <Badge ctx={ctx} cx={13} cy={14.6} r={2.2} />
        </g>
      );
    }
    const outer = 'M9 22.6L29 22.6Q35.4 21 37.8 13.8Q38 10.4 35 10.2L7.4 10.2Q3.2 10.6 2.4 13.8Q3.8 19.8 9 22.6Z';
    return (
      <g>
        <Shadow />
        <path d={outer} fill={TRACK} stroke={OUTLINE} strokeWidth={ow} />
        <path d={outer} fill="none" stroke={TRACK_LIGHT} strokeWidth={0.7} strokeDasharray="0.9 0.9" />
        <Plate ctx={ctx} d="M9.8 20.6L28.6 20.6Q33.6 19 35.6 13.8Q35.6 12.2 34 12.2L7.8 12.2Q5 12.4 4.6 14Q5.8 18.4 9.8 20.6Z" hi="M7.8 12.2L34 12.2L35.4 13.4L5 13.8Z" />
        <Barrel from={[23.4, 15.4]} to={[29.4, 15.4]} w={1.4} fill={STEEL} ow={ow} />
        <Plate ctx={ctx} d="M14.6 13.4L23.4 13.4L25 15.4L23.8 18.4L15.4 18.4L14 15.8Z" tone={0.05} />
        <Badge ctx={ctx} cx={9.6} cy={15.8} r={2} />
      </g>
    );
  }
  if (ctx.gen === 'interwar') {
    return (
      <g>
        <Shadow />
        <TrackRun x0={4} x1={36} top={15.4} bottom={22.6} style="bogie" wheels={6} hull={v} ow={ow * 0.9} />
        <Barrel from={[25, 7.6]} to={[32.6, 7.6]} w={1.2} fill={STEEL} ow={ow} />
        <Plate ctx={ctx} d="M4.4 16.6L5.4 11.4L10 9.6L29 9.6L35.2 12.2L36.2 16.6Z" hi="M10 9.6L29 9.6L35.2 12.2L34.6 12.8L29 10.6L9.8 10.6L5.6 12.2Z" />
        <Plate ctx={ctx} d="M13.4 9.8L14 6L15.4 4.8L23 4.8L25 6.2L25.6 9.8Z" hi="M14 6L15.4 4.8L23 4.8L25 6.2Z" />
        <Badge ctx={ctx} cx={11.4} cy={13.2} r={1.9} />
      </g>
    );
  }
  return (
    <g>
      <Shadow />
      <TrackRun x0={4} x1={34} top={15.4} bottom={22.6} style="road" wheels={5} hull={v} ow={ow * 0.9} />
      <Barrel from={[25, 8.4]} to={[39.6, 8.4]} w={1.4} wEnd={1.2} fill={shade(v, 0.03)} ow={ow} brake />
      <Plate ctx={ctx} d="M3.6 16.8L4.4 12.6L28 12.2L36.2 14.8L35.6 16.8Z" hi="M4.4 12.6L28 12.2L36.2 14.8L35.2 15.2L27.8 13.2L4.4 13.6Z" />
      <Plate ctx={ctx} d="M11.6 12.4L12.6 8.2L14.6 7L23.6 7L26.2 8.6L27 12.4Z" hi="M12.6 8.2L14.6 7L23.6 7L26.2 8.6Z" />
      <Badge ctx={ctx} cx={18.6} cy={9.8} r={1.8} />
    </g>
  );
}

function iconHeavyTank(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  if (ctx.gen === 'ww2') {
    return (
      <g>
        <Shadow />
        <TrackRun x0={1.6} x1={36} top={14.2} bottom={22.6} style="overlap" wheels={5} hull={v} ow={ow * 0.9} />
        <Barrel from={[25, 6.4]} to={[39.8, 6.4]} w={2} wEnd={1.7} fill={shade(v, 0.03)} ow={ow} brake />
        <Plate ctx={ctx} d="M1.4 15.6L2.4 9.8L30 9.4L37.8 12L37.4 15.6Z" hi="M2.4 9.8L30 9.4L37.8 12L36.8 12.6L29.8 10.6L2.6 11Z" />
        <Plate ctx={ctx} d="M8.6 9.6L9.4 4.8L11.6 3.4L23.6 3.4L26 4.8L26.8 9.6Z" hi="M9.4 4.8L11.6 3.4L23.6 3.4L26 4.8Z" />
        <Shape d={rrect(24.4, 4.4, 3.4, 4.2, 0.8)} fill={shade(v, -0.12)} ow={ow * 0.8} />
        <Badge ctx={ctx} cx={16.8} cy={6.6} r={1.9} />
      </g>
    );
  }
  return (
    <g>
      <Shadow />
      <TrackRun x0={1.4} x1={38.6} top={14} bottom={22.6} style="bogie" wheels={8} hull={v} ow={ow * 0.9} />
      <MgBarrel from={[9.6, 6.8]} len={3.6} ow={ow} />
      <MgBarrel from={[32.6, 6.8]} len={4.6} ow={ow} />
      <Barrel from={[25.6, 5.4]} to={[32, 5.4]} w={1.3} fill={STEEL} ow={ow} />
      <Plate ctx={ctx} d="M1.8 15.2L3.2 9.8L6.6 8.4L33.4 8.4L37.8 10.6L38.6 15.2Z" hi="M6.6 8.4L33.4 8.4L37.8 10.6L37 11L33.2 9.4L6.4 9.4L3.4 10.6Z" />
      <Plate ctx={ctx} d="M5 8.6L5.6 6L10 6L10.6 8.6Z" tone={0.03} />
      <Plate ctx={ctx} d="M28.4 8.6L29 6L33 6L33.6 8.6Z" tone={0.03} />
      <Plate ctx={ctx} d="M15.4 8.6L16 4.4L17.4 3.2L24.4 3.2L25.8 4.4L26.4 8.6Z" hi="M16 4.4L17.4 3.2L24.4 3.2L25.8 4.4Z" />
      <Badge ctx={ctx} cx={20.4} cy={12} r={1.9} />
    </g>
  );
}

function iconTankDestroyer(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const v = ctx.pal.vehicle;
  return (
    <g>
      <Shadow />
      <TrackRun x0={4} x1={34} top={16.4} bottom={22.6} style="road" wheels={5} hull={v} ow={ow * 0.9} />
      <Barrel from={[26, 12.2]} to={[39.8, 12.2]} w={1.4} wEnd={1.2} fill={shade(v, 0.03)} ow={ow} brake />
      <Plate ctx={ctx} d="M3.6 17.8L4.4 14.4L32 14.2L37.2 16.4L36.6 17.8Z" hi="M4.4 14.4L32 14.2L37.2 16.4L36.4 16.8L31.8 15.2L4.4 15.4Z" />
      <Plate ctx={ctx} d="M8.6 14.4L9.8 10.4L24 10.4L30 14.4Z" hi="M9.8 10.4L24 10.4L25.2 11.2L9.6 11.2Z" />
      <circle cx={27.4} cy={12.4} r={1.9} fill={shade(v, -0.12)} stroke={OUTLINE} strokeWidth={ow * 0.8} />
      <Badge ctx={ctx} cx={15.6} cy={12.4} r={1.5} />
    </g>
  );
}

export const ICONS: Record<ArtUnitType, (ctx: Ctx) => ReactElement> = {
  infantry: iconInfantry,
  stormtroopers: iconStormtroopers,
  mountain: iconMountain,
  motorised: iconMotorised,
  cavalry: iconCavalry,
  armouredCar: iconArmouredCar,
  artillery: iconArtillery,
  heavyArtillery: iconHeavyArtillery,
  antiTank: iconAntiTank,
  lightTank: iconLightTank,
  tank: iconTank,
  heavyTank: iconHeavyTank,
  tankDestroyer: iconTankDestroyer,
};
