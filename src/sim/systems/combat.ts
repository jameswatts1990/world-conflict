// Battle resolution. Hostile armies stationed in the same province fight in
// rounds. The province owner's armies use defence values; everyone else uses
// attack values. Fire wears down both strength and morale: an army whose
// morale breaks routs to a friendly neighbour, or surrenders if it has
// nowhere to go. Runs every INTERVALS.combatRound ticks.
import { BUILDING_EFFECTS } from '../config/buildings';
import { ECONOMY, MORALE, SUPPLY } from '../config/rules';
import { ARMY_RULES, UNITS, VETERANCY, usesFuel } from '../config/units';
import { pushEvent } from '../events';
import { armyName } from '../names';
import {
  areHostile,
  armyMorale,
  armyPower,
  fortificationReduction,
  homeSoilMult,
  hostileArmiesIn,
  isArmyInTransit,
  scaledTicks,
  techEffects,
  unitStats,
  veterancyRank,
} from '../queries';
import { random } from '../rng';
import { ownerName, sentence } from '../text';
import { NEUTRAL, type Army, type BattleState, type GameState, type NationId, type OwnerId, type ProvinceId, type Unit } from '../types';
import { connectionBetween, type World } from '../world';
import { legTicks } from './movement';
import { shockNation } from './civic';

interface Target {
  army: Army;
  unit: Unit;
  weight: number;
}

function hasHostilePair(state: GameState, armies: Army[]): boolean {
  for (let i = 0; i < armies.length; i++) {
    for (let j = i + 1; j < armies.length; j++) {
      if (areHostile(state, armies[i].owner, armies[j].owner)) return true;
    }
  }
  return false;
}

/** Fraction of damage lost by an army attacking straight off a sea crossing. */
export function amphibiousPenalty(state: GameState, owner: OwnerId): number {
  let mult = 1;
  for (const e of techEffects(state, owner)) if (e.kind === 'amphibious') mult *= e.mult;
  return ARMY_RULES.amphibiousPenalty * mult;
}

/** Army-wide multiplier from supply, treasury, doctrine, reconnaissance and sea landings. */
export function armyCombatMultiplier(state: GameState, army: Army, province?: ProvinceId): number {
  let m = 1;
  if (!army.supplied) m *= SUPPLY.unsuppliedCombatMult;
  if (army.owner !== NEUTRAL && state.nations[army.owner].shortages.money) m *= ECONOMY.unpaidCombatMult;
  const classes = new Set(army.units.map((u) => UNITS[u.type].class));
  if (classes.has('infantry') && classes.has('support') && classes.has('armour')) {
    for (const e of techEffects(state, army.owner)) if (e.kind === 'combinedArms') m *= e.mult;
  }
  if (army.units.some((u) => UNITS[u.type].recon)) m *= ARMY_RULES.reconDamage;
  if (province && army.arrivedVia === 'strait' && state.provinces[province].owner !== army.owner) {
    m *= 1 - amphibiousPenalty(state, army.owner);
  }
  return m;
}

/** Share of a fortification bonus this army's siege guns and assault troops ignore. */
export function fortIgnore(army: Army): number {
  let best = 0;
  for (const u of army.units) best = Math.max(best, UNITS[u.type].fortIgnore ?? 0);
  return best;
}

export function combatSystem(state: GameState, world: World): void {
  const byProvince = new Map<ProvinceId, Army[]>();
  for (const id of Object.keys(state.armies).sort()) {
    const a = state.armies[id];
    if (isArmyInTransit(a)) continue;
    const list = byProvince.get(a.province) ?? [];
    list.push(a);
    byProvince.set(a.province, list);
  }

  for (const pid of world.provinceIds) {
    const armies = byProvince.get(pid) ?? [];
    const fighting = armies.length >= 2 && hasHostilePair(state, armies);
    if (!fighting) {
      if (state.battles[pid]) endBattle(state, world, pid, armies);
      continue;
    }
    if (!state.battles[pid]) startBattle(state, world, pid, armies);
    else joinBattle(state, state.battles[pid], armies);
    resolveRound(state, world, pid, armies);
    const survivors = armies.filter((a) => state.armies[a.id] && !isArmyInTransit(a));
    if (!(survivors.length >= 2 && hasHostilePair(state, survivors))) endBattle(state, world, pid, survivors);
  }
}

function involvedNations(owners: OwnerId[]): NationId[] {
  return owners.filter((o): o is NationId => o !== NEUTRAL);
}

/** Sides actually fighting: owners hostile to someone else present (not bystanders at peace with all). */
function combatants(state: GameState, armies: Army[]): OwnerId[] {
  const owners = [...new Set(armies.map((a) => a.owner))];
  return owners.filter((o) => owners.some((p) => areHostile(state, o, p)));
}

function startBattle(state: GameState, world: World, pid: ProvinceId, armies: Army[]): void {
  const owners = combatants(state, armies);
  state.battles[pid] = { province: pid, startedAt: state.tick, owners };
  // Attackers first, the defending province owner last: "Germany vs France".
  const defender = state.provinces[pid].owner;
  const names = [...owners.filter((o) => o !== defender), ...owners.filter((o) => o === defender)].map((o) => ownerName(world, o, pid));
  pushEvent(state, 'battle', `Battle of ${world.provinces[pid].city.name}: ${names.join(' vs ')}.`, {
    nations: involvedNations(owners),
    province: pid,
    severity: 'combat',
  });
}

/** Late arrivals who join the fighting become participants, so they also hear how it ends. */
function joinBattle(state: GameState, battle: BattleState, armies: Army[]): void {
  for (const o of combatants(state, armies)) if (!battle.owners.includes(o)) battle.owners.push(o);
}

function endBattle(state: GameState, world: World, pid: ProvinceId, survivors: Army[]): void {
  const battle = state.battles[pid];
  delete state.battles[pid];
  if (!battle) return;
  const winners = [...new Set(survivors.map((a) => a.owner))].filter((o) => battle.owners.includes(o));
  const city = world.provinces[pid].city.name;
  // A side is beaten if it is gone and still at war with the victors. If peace sent it home
  // (or nobody is gone), the fighting simply stopped and nobody earns a victory.
  const beaten = battle.owners.some((o) => !winners.includes(o) && winners.some((w) => areHostile(state, o, w)));
  if (beaten) {
    for (const a of survivors) {
      if (!winners.includes(a.owner)) continue;
      const gain = VETERANCY.perVictory * xpGainMult(state, a.owner);
      for (const u of a.units) u.xp = Math.min(VETERANCY.maxXp, u.xp + gain);
    }
  }
  const text =
    winners.length === 0
      ? `The Battle of ${city} ended with no army left on the field.`
      : beaten
        ? `${sentence(winners.map((w) => ownerName(world, w, pid)).join(' & '))} won the Battle of ${city}.`
        : `The Battle of ${city} ended.`;
  pushEvent(state, 'battle-end', text, { nations: involvedNations(battle.owners), province: pid, severity: 'combat' });
}

function xpGainMult(state: GameState, owner: OwnerId): number {
  let m = 1;
  for (const e of techEffects(state, owner)) if (e.kind === 'xpGain') m *= e.mult;
  return m;
}

function pickTarget(state: GameState, targets: Target[], total: number): Target {
  let r = random(state) * total;
  for (const t of targets) {
    r -= t.weight;
    if (r < 0) return t;
  }
  return targets[targets.length - 1];
}

function resolveRound(state: GameState, world: World, pid: ProvinceId, armies: Army[]): void {
  const province = state.provinces[pid];
  const terrain = world.provinces[pid].terrain;
  const fortLevel = province.buildings.fortifications ?? 0;
  const battery = province.buildings.coastalBattery ?? 0;
  const hpDamage = new Map<string, number>();
  const moraleDamage = new Map<string, number>();
  const power = new Map<string, number>();
  for (const a of armies) power.set(a.id, armyPower(state, a));

  for (const army of armies) {
    const targets: Target[] = [];
    let total = 0;
    for (const other of armies) {
      if (!areHostile(state, army.owner, other.owner)) continue;
      // Support units fight from behind the line while someone screens them.
      const screened = other.units.some((u) => UNITS[u.type].class !== 'support');
      for (const unit of other.units) {
        const weight = screened ? UNITS[unit.type].targetWeight : 1;
        targets.push({ army: other, unit, weight });
        total += weight;
      }
    }
    if (targets.length === 0) continue;
    const role = province.owner === army.owner ? 'defence' : 'attack';
    const armyMult = armyCombatMultiplier(state, army, pid) * homeSoilMult(state, world, army.owner, pid);
    const fuelShort = army.owner !== NEUTRAL && state.nations[army.owner].shortages.fuel;
    const ignore = fortIgnore(army);

    for (const unit of army.units) {
      const stats = unitStats(state, army.owner, unit.type);
      const target = pickTarget(state, targets, total);
      const tStats = unitStats(state, target.army.owner, target.unit.type);
      const values = role === 'defence' ? stats.defence : stats.attack;
      const base = values.soft * (1 - tStats.hardness) + values.hard * tStats.hardness;
      const terrainMod = UNITS[unit.type].terrain[terrain]?.[role] ?? 1;
      const fuelMod = fuelShort && usesFuel(unit.type) ? ECONOMY.noFuelVehicleMult : 1;
      const strengthMod = ARMY_RULES.strengthFloor + (1 - ARMY_RULES.strengthFloor) * unit.strength;
      const moraleMod = MORALE.firepowerFloor + (1 - MORALE.firepowerFloor) * unit.morale;
      const vet = VETERANCY.damage[veterancyRank(unit.xp)];
      const variance = 1 + (random(state) * 2 - 1) * ARMY_RULES.damageVariance;
      let dmg = base * terrainMod * fuelMod * strengthMod * moraleMod * vet * variance * armyMult * ARMY_RULES.damageScale;
      if (target.army.owner === province.owner && fortLevel > 0) {
        dmg *= 1 - fortificationReduction(state, province.owner, fortLevel) * (1 - ignore);
      }
      let shock = stats.shock * MORALE.hitFactor;
      if (battery > 0 && army.owner === province.owner && target.army.arrivedVia === 'strait') {
        dmg *= 1 + battery * BUILDING_EFFECTS.coastalBatteryDamagePerLevel;
        shock *= 1.5;
      }
      const hp = dmg / tStats.maxHp;
      hpDamage.set(target.unit.id, (hpDamage.get(target.unit.id) ?? 0) + hp);
      moraleDamage.set(target.unit.id, (moraleDamage.get(target.unit.id) ?? 0) + hp * shock);
    }
  }

  for (const army of armies) {
    const hostile = armies.filter((o) => areHostile(state, army.owner, o.owner));
    const hostileOwners = [...new Set(hostile.map((o) => o.owner))];
    const enemyPower = hostile.reduce((s, o) => s + (power.get(o.id) ?? 0), 0);
    const ratio = Math.max(0.5, Math.min(3, enemyPower / Math.max(1, power.get(army.id) ?? 1)));
    const drain = MORALE.roundDrain * ratio;
    const before = army.units.length;
    const gain = VETERANCY.perRound * xpGainMult(state, army.owner);
    const dugIn = (army.owner === province.owner ? MORALE.defenderResilience : 1) * homeSoilMult(state, world, army.owner, pid);
    for (const u of army.units) {
      const res = unitStats(state, army.owner, u.type).resilience * VETERANCY.resilience[veterancyRank(u.xp)] * dugIn;
      u.strength -= hpDamage.get(u.id) ?? 0;
      u.morale = Math.max(0, u.morale - ((moraleDamage.get(u.id) ?? 0) + drain) / res);
      u.xp = Math.min(VETERANCY.maxXp, u.xp + gain);
    }
    army.units = army.units.filter((u) => u.strength > 0.001);
    const lost = before - army.units.length;
    if (lost > 0) {
      for (const u of army.units) u.morale = Math.max(0, u.morale - MORALE.lossShock * lost);
      if (army.owner !== NEUTRAL) state.nations[army.owner].stats.unitsLost += lost;
      if (hostileOwners.length === 1 && hostileOwners[0] !== NEUTRAL) {
        state.nations[hostileOwners[0]].stats.unitsDestroyed += lost;
      }
    }
    if (army.units.length === 0) {
      delete state.armies[army.id];
      pushEvent(state, 'army-destroyed', `${sentence(ownerName(world, army.owner, pid))} lost the ${armyName(world, army, pid)} at ${world.provinces[pid].city.name}.`, {
        nations: involvedNations([army.owner, ...hostileOwners]),
        province: pid,
        subject: army.owner,
        severity: 'combat',
      });
    }
  }

  // Broken armies flee or surrender once all fire has landed.
  for (const army of armies) {
    if (!state.armies[army.id] || armyMorale(army) >= MORALE.routThreshold) continue;
    if (hostileArmiesIn(state, pid, army.owner).length === 0) continue;
    routArmy(state, world, army, pid);
  }
}

/** Where a broken army can flee: an adjacent province of its own with no enemy army in it. */
export function retreatTarget(state: GameState, world: World, army: Army, from: ProvinceId): ProvinceId | null {
  if (army.owner === NEUTRAL) return null;
  let best: { id: ProvinceId; score: number } | null = null;
  for (const n of world.neighbors[from]) {
    const p = state.provinces[n.id];
    if (p.owner !== army.owner || hostileArmiesIn(state, n.id, army.owner).length > 0) continue;
    let friends = 0;
    for (const a of Object.values(state.armies)) {
      if (a.owner === army.owner && a.province === n.id && a.id !== army.id) friends += armyPower(state, a);
    }
    const score = (p.supplied ? 50 : 0) + Math.min(50, friends / 10) - n.distanceKm / 20;
    if (!best || score > best.score || (score === best.score && n.id < best.id)) best = { id: n.id, score };
  }
  return best?.id ?? null;
}

/** A broken army flees to a friendly neighbour, losing stragglers; with nowhere to go it surrenders. */
export function routArmy(state: GameState, world: World, army: Army, pid: ProvinceId): void {
  const target = retreatTarget(state, world, army, pid);
  if (!target) {
    surrenderArmy(state, world, army, pid);
    return;
  }
  const recon = army.units.some((u) => UNITS[u.type].recon);
  const loss = MORALE.routLosses * (recon ? 0.5 : 1);
  for (const u of army.units) u.strength = Math.max(0.02, u.strength * (1 - loss));
  const duration = legTicks(state, world, army, pid, target);
  army.move = { path: [target], leg: { from: pid, to: target, elapsed: 0, duration } };
  army.routedUntil = state.tick + scaledTicks(state, MORALE.routedSeconds);
  army.arrivedVia = null;
  const conn = connectionBetween(world, pid, target);
  pushEvent(
    state,
    'rout',
    `The ${armyName(world, army, pid)} broke at ${world.provinces[pid].city.name} and fell back to ${world.provinces[target].city.name}${conn?.kind === 'strait' ? ' by sea' : ''}.`,
    {
      nations: involvedNations([army.owner, ...hostileArmiesIn(state, pid, army.owner).map((a) => a.owner)]),
      province: pid,
      subject: army.owner,
      severity: 'combat',
    },
  );
}

export function surrenderArmy(state: GameState, world: World, army: Army, pid: ProvinceId): void {
  const captors = hostileArmiesIn(state, pid, army.owner);
  const n = army.units.length;
  delete state.armies[army.id];
  const captorPower = new Map<OwnerId, number>();
  for (const a of captors) captorPower.set(a.owner, (captorPower.get(a.owner) ?? 0) + armyPower(state, a));
  let captor: OwnerId | null = null;
  for (const [o, p] of captorPower) if (captor === null || p > captorPower.get(captor)!) captor = o;
  if (army.owner !== NEUTRAL) {
    state.nations[army.owner].stats.unitsLost += n;
    state.nations[army.owner].stats.armiesSurrendered += 1;
    shockNation(state, world, army.owner, MORALE.surrenderShock);
  }
  if (captor && captor !== NEUTRAL) state.nations[captor].stats.unitsDestroyed += n;
  const who = army.owner === NEUTRAL ? armyName(world, army, pid) : `${world.nations[army.owner].adjective} ${armyName(world, army, pid)}`;
  pushEvent(
    state,
    'surrender',
    `Encircled at ${world.provinces[pid].city.name}, the ${who} surrendered${captor ? ` to ${ownerName(world, captor, pid)}` : ''} — ${n} unit${n === 1 ? '' : 's'} lost.`,
    { nations: involvedNations([army.owner, ...captors.map((a) => a.owner)]), province: pid, subject: army.owner, severity: 'combat' },
  );
}
