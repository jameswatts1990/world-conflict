// Full-size foot units: infantry, stormtroopers and mountain troops.
import type { ReactElement } from 'react';
import { dimKit, withHeadgear, type Ctx } from './context';
import { HeavyMG, LightMG, Soldier, type HandItem, type HmgStyle, type LmgStyle } from './figures';
import { InsigniaMark } from './Insignia';
import { OUTLINE, ROCK, ROCK_DARK, SNOW } from './palettes';
import { GroundShadow, Shape, r2 } from './primitives';

export const GROUND = 53;

/** Small national badge in the card's top-left corner for units without a hull to paint it on. */
export function CornerBadge({ ctx }: { ctx: Ctx }) {
  return <InsigniaMark nation={ctx.nation} accent={ctx.accent} cx={7} cy={7} r={4.2} ow={0.7} />;
}

function hmgStyle(ctx: Ctx): HmgStyle {
  switch (ctx.pattern) {
    case 'de':
      return 'mg08';
    case 'it':
      return 'fiat';
    case 'uk':
      return 'vickers';
    default:
      return 'maxim';
  }
}

function lmgStyle(ctx: Ctx): LmgStyle {
  const late = ctx.gen === 'ww2';
  switch (ctx.pattern) {
    case 'uk':
      return late ? 'bren' : 'lewis';
    case 'fr':
      return 'topmag';
    case 'de':
      return late ? 'mg34' : 'bottommag';
    case 'it':
      return 'sidemag';
    default:
      return 'bottommag';
  }
}

function grenade(ctx: Ctx): HandItem {
  return ctx.pattern === 'de' ? 'stickGrenade' : 'eggGrenade';
}

/** Figure scale for foot units: big enough to read on a 96 px card. */
const S = 1.14;

export function drawInfantry(ctx: Ctx): ReactElement {
  const { kit, ow } = ctx;
  const back = dimKit(kit, 0.1);
  const ww1 = ctx.gen === 'ww1';
  return (
    <g>
      <GroundShadow cx={48} cy={GROUND} rx={45} ry={4.4} />
      <CornerBadge ctx={ctx} />
      <Soldier kit={back} pose="stand" x={11} y={GROUND - 2.4} s={S * 0.96} ow={ow} arm={ww1 ? 'bayonet' : 'rifle'} back="pack" />
      <Soldier kit={kit} pose="kneelAim" x={33} y={GROUND} s={S} ow={ow} arm="rifle" back="pack" />
      {ww1 ? (
        <g>
          <Soldier kit={kit} pose="sitGun" x={57} y={GROUND + 0.6} s={S} ow={ow} />
          <HeavyMG x={57 + 8.2 * S} y={GROUND + 0.6} s={S} ow={ow} style={hmgStyle(ctx)} />
        </g>
      ) : (
        <g>
          <LightMG x={71.6} y={GROUND + 0.8} s={S} ow={ow} style={lmgStyle(ctx)} />
          <Soldier kit={kit} pose="prone" x={70} y={GROUND + 0.8} s={S} ow={ow} />
        </g>
      )}
    </g>
  );
}

export function drawStormtroopers(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  const arditi = ctx.pattern === 'it';
  const kit = arditi ? { ...(ctx.gen === 'ww1' ? withHeadgear(ctx, 'fez') : ctx.kit), flash: '#151515' } : ctx.kit;
  const back = dimKit(kit, 0.1);
  const ww2 = ctx.gen === 'ww2';
  return (
    <g>
      <GroundShadow cx={48} cy={GROUND} rx={45} ry={4.4} />
      <CornerBadge ctx={ctx} />
      {ww2 ? (
        <Soldier kit={back} pose="crouchRun" x={15} y={GROUND - 2.4} s={S * 0.96} ow={ow} arm="flamer" back="flametanks" />
      ) : (
        <Soldier kit={back} pose="crouchRun" x={15} y={GROUND - 2.4} s={S * 0.96} ow={ow} arm={ctx.gen === 'ww1' ? 'bayonet' : 'carbine'} back="pack" />
      )}
      <Soldier kit={kit} pose="throw" x={46} y={GROUND} s={S} ow={ow} hand={grenade(ctx)} back={ww2 ? 'pack' : 'slungRifle'} />
      {arditi ? (
        <Soldier kit={kit} pose="stab" x={70} y={GROUND + 0.6} s={S} ow={ow} hand="dagger" />
      ) : (
        <Soldier kit={kit} pose="crouchRun" x={68} y={GROUND + 0.6} s={S} ow={ow} arm={ww2 ? 'smg' : 'carbine'} />
      )}
    </g>
  );
}

/** Ground height on the mountain slope at x. */
function slopeY(x: number): number {
  return 57 - 0.25 * (x - 4);
}

const RIDGE_BUMPS = [0.6, -0.8, 0.3, -1.6, 0.4, 0.9, -0.6, 0.2, -1.8, 0.5, -0.4, 0.8, -1.2, 0.2, -0.9, 0.6, -0.3];

function RockySlope({ ow }: { ow: number }) {
  // Jagged ridge just below the walking line, then a craggy face down to the card bottom.
  const top: [number, number][] = [];
  for (let i = 0; i < RIDGE_BUMPS.length; i++) {
    const x = 1 + i * 6;
    top.push([x, slopeY(x) + 0.9 + RIDGE_BUMPS[i]]);
  }
  const ridge = top.map((p) => `${r2(p[0])} ${r2(p[1])}`).join('L');
  const d = `M${ridge}L95.4 ${r2(slopeY(95.4) + 3)}L92.6 44L94.4 50.6L90.8 55.6L91.6 60L8 60L1 59Z`;
  const face = `M${ridge}L96 ${r2(slopeY(96) + 3.2)}L1 ${r2(slopeY(1) + 3.2)}Z`;
  const strata = [
    'M14 60L20 54.6L28 55.8L34 52.4',
    'M40 60L46 50.8L54 51.6',
    'M58 60L62 52L60 47.2L68 45.6',
    'M72 60L78 50L76 44.2L84 42.4',
    'M86 52L90 46L88 40.6',
    'M6 57.6L12 56.8',
  ].join('');
  const caps: string[] = [3, 8, 11, 15].map((i) => {
    const [x, y] = top[i];
    return `M${r2(x - 5.4)} ${r2(y + 1.6)}Q${r2(x - 2.6)} ${r2(y - 1.2)} ${r2(x)} ${r2(y - 0.3)}Q${r2(x + 2.8)} ${r2(y - 0.6)} ${r2(x + 4.6)} ${r2(y + 1.2)}Q${r2(x + 2.2)} ${r2(y + 0.9)} ${r2(x + 0.8)} ${r2(y + 2.2)}Q${r2(x - 1.6)} ${r2(y + 0.8)} ${r2(x - 5.4)} ${r2(y + 1.6)}Z`;
  });
  return (
    <g>
      <Shape d={d} fill={ROCK} ow={ow} hi={face} hiOpacity={0.16} lo="M0 60L96 44V60Z" loOpacity={0.2}>
        <path d={strata} stroke={ROCK_DARK} strokeWidth={0.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Shape>
      {caps.map((c, i) => (
        <path key={i} d={c} fill={SNOW} stroke={OUTLINE} strokeWidth={0.5} strokeLinejoin="round" />
      ))}
    </g>
  );
}

export function drawMountain(ctx: Ctx): ReactElement {
  const { ow } = ctx;
  let kit = ctx.kit;
  let edelweiss = false;
  if (ctx.pattern === 'it') kit = withHeadgear(ctx, 'alpini');
  else if (ctx.pattern === 'fr') kit = withHeadgear(ctx, 'beret');
  else if (ctx.pattern === 'de' && ctx.gen !== 'ww1') {
    kit = withHeadgear(ctx, 'bergmutze');
    edelweiss = true;
  }
  const back = dimKit(kit, 0.1);
  return (
    <g>
      <CornerBadge ctx={ctx} />
      <RockySlope ow={ow} />
      <Soldier kit={back} pose="hike" x={22} y={slopeY(22)} s={S * 0.95} ow={ow} arm="alpenstock" back="rucksack" edelweiss={edelweiss} />
      <Soldier kit={kit} pose="hike" x={48} y={slopeY(48)} s={S} ow={ow} arm="iceaxe" back="rucksack" edelweiss={edelweiss} />
      <Soldier kit={kit} pose="hike" x={73} y={slopeY(73)} s={S} ow={ow} arm="alpenstock" back="rucksack" edelweiss={edelweiss} />
    </g>
  );
}
