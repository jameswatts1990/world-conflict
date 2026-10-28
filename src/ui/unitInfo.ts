// What a unit type is good and bad at, spelt out for the unit details card. Everything is
// read from the unit's configuration and its owner's effects, so the text cannot drift from
// the rules.
import { ARMY_RULES, UNITS } from '../sim/config/units';
import { MOVEMENT, SIGHT } from '../sim/config/rules';
import { specialityEffects, unitDetect, unitSight, unitStats, type GameState, type NationId, type Terrain, type UnitType, type World } from '../sim';
import { TERRAIN_LABEL } from './labels';

export interface UnitTraits {
  strengths: string[];
  weaknesses: string[];
  /** Bonuses the owner's nation gives this type (its national speciality). */
  bonuses: string[];
}

const pct = (mult: number) => `${mult >= 1 ? '+' : '−'}${Math.round(Math.abs(mult - 1) * 100)}%`;
const TERRAINS: Terrain[] = ['plains', 'forest', 'hills', 'mountains', 'urban', 'marsh'];
const STAT_LABEL = { attack: 'attack', defence: 'defence', speed: 'speed', resilience: 'morale resilience', shock: 'morale shock' } as const;

export function unitTraits(state: GameState, world: World, nation: NationId, type: UnitType): UnitTraits {
  const cfg = UNITS[type];
  const s = unitStats(state, nation, type);
  const line = unitStats(state, nation, 'infantry');
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  // Terrain: where it fights better or worse than usual.
  for (const t of TERRAINS) {
    const m = cfg.terrain[t];
    if (!m) continue;
    const parts: [string, number][] = [];
    if (m.attack !== undefined && m.attack !== 1) parts.push(['attack', m.attack]);
    if (m.defence !== undefined && m.defence !== 1) parts.push(['defence', m.defence]);
    const good = parts.filter(([, v]) => v > 1);
    const bad = parts.filter(([, v]) => v < 1);
    const name = TERRAIN_LABEL[t].toLowerCase();
    if (good.length) strengths.push(`In ${name}: ${good.map(([k, v]) => `${pct(v)} ${k}`).join(', ')}`);
    if (bad.length) weaknesses.push(`In ${name}: ${bad.map(([k, v]) => `${pct(v)} ${k}`).join(', ')}`);
  }

  // Armour and what it can hurt.
  if (s.hardness >= 0.5) strengths.push(`Armoured: rifle and machine-gun fire hurts it ${Math.round((1 - s.hardness) * 100)}% as much as unarmoured troops`);
  else if (s.hardness > 0.2) strengths.push('Partly armoured: shrugs off some small-arms fire');
  else if (s.hardness === 0) weaknesses.push('Unarmoured: anti-tank guns are wasted on it, but every rifle hurts');
  const atkHard = Math.max(s.attack.hard, s.defence.hard);
  const atkSoft = Math.max(s.attack.soft, s.defence.soft);
  if (atkHard >= atkSoft * 0.9) strengths.push('Strong against tanks and armoured cars');
  else if (atkHard < atkSoft * 0.3) weaknesses.push('Little punch against armour');
  if (s.defence.soft >= s.attack.soft * 1.3) strengths.push('A stubborn defender: better holding ground than taking it');
  else if (s.attack.soft >= s.defence.soft * 1.3) weaknesses.push('Better in attack than in defence');

  // Special roles.
  if (cfg.fortIgnore) strengths.push(`Ignores ${Math.round(cfg.fortIgnore * 100)}% of the defender's fortifications`);
  if (cfg.recon) {
    strengths.push(
      `Reconnaissance: its army deals +10% damage, captures ${Math.round((ARMY_RULES.reconCapture - 1) * 100)}% faster and withdraws at half the cost`,
    );
  }
  const sight = unitSight(type);
  if (sight > SIGHT.unit) {
    const steps = (n: number) => (n === 1 ? 'a step' : `${n} steps`);
    strengths.push(`Sees further: ${steps(sight)} out over open land (most troops see only where they stand), and picks up unknown armies ${steps(unitDetect(type))} out`);
  }
  if (cfg.targetWeight < 1) strengths.push('Fights from the second line: rarely hit while other troops screen it');
  if (cfg.resilience > 1) strengths.push(`Steady: loses morale ${Math.round((1 - 1 / cfg.resilience) * 100)}% more slowly`);
  else if (cfg.resilience < 1) weaknesses.push(`Brittle: loses morale ${Math.round((1 / cfg.resilience - 1) * 100)}% faster`);
  if (cfg.shock > 1.05) strengths.push(`Shock: its fire breaks the enemy's morale ${Math.round((cfg.shock - 1) * 100)}% faster`);
  if (cfg.targetWeight >= 1 && cfg.class === 'support') weaknesses.push('Helpless when caught without troops to screen it');

  // Movement and supply.
  const speed = s.speedKmPerTick / line.speedKmPerTick;
  if (speed >= 1.3) strengths.push(`Fast: marches ${Math.round((speed - 1) * 100)}% faster than line infantry`);
  else if (speed <= 0.9) weaknesses.push(`Slow: marches ${Math.round((1 - speed) * 100)}% slower than line infantry`);
  const pass = cfg.movement?.connection?.mountain;
  if (pass !== undefined && pass < MOVEMENT.connection.mountain) strengths.push('Crosses mountain passes almost as fast as roads');
  else if (pass !== undefined && pass > MOVEMENT.connection.mountain) weaknesses.push('Slow over mountain passes');
  const bogs = TERRAINS.filter((t) => (cfg.movement?.terrain?.[t] ?? MOVEMENT.terrain[t]) > MOVEMENT.terrain[t] + 0.05);
  if (bogs.length) weaknesses.push(`Bogs down off-road: ${bogs.map((t) => TERRAIN_LABEL[t].toLowerCase()).join(', ')}`);
  const fuel = cfg.upkeepPerMinute.fuel ?? 0;
  if (fuel > 0) weaknesses.push(`Burns ${fuel} fuel a minute, and moves and fights at half strength without it`);
  if (s.maxHp <= 80) weaknesses.push('Fragile: few hit points');
  else if (s.maxHp >= 130) strengths.push('Tough: many hit points');

  // The nation's own speciality.
  const bonuses: string[] = [];
  for (const e of specialityEffects(world.scenario.id, nation)) {
    if (e.kind === 'unitStat' && (e.units === 'all' || e.units.includes(type))) bonuses.push(`${pct(e.mult)} ${STAT_LABEL[e.stat]}`);
    if (e.kind === 'recruitCost' && (!e.units || e.units === 'all' || e.units.includes(type))) bonuses.push(`${pct(e.mult)} ${e.resource} to raise`);
    if (e.kind === 'startXp' && (e.units === 'all' || e.units.includes(type))) bonuses.push('Raised as Regulars');
  }
  if (bonuses.length) {
    const speciality = world.nations[nation]?.speciality?.name;
    if (speciality) bonuses.unshift(speciality);
  }
  return { strengths, weaknesses, bonuses };
}
