// Battle resolution. Hostile armies stationed in the same province fight in
// rounds. The province owner's armies use defence values; everyone else uses
// attack values. Fire wears down both strength and morale; low morale blunts an
// army's firepower but never breaks it. Armies fight to the death unless their
// owner orders them out, and a withdrawal under fire costs every unit a set
// share of its strength. Runs every INTERVALS.combatRound ticks.
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
  isArmyAway,
  techEffects,
  unitStats,
  veterancyRank,
} from '../queries';
import { random } from '../rng';
import { ownerName, provinceName, sentence } from '../text';
import { NEUTRAL, type Army, type BattleState, type GameState, type NationId, type OwnerId, type ProvinceId, type Unit } from '../types';
import { connectionBetween, type World } from '../world';
import { startLeg } from './movement';

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
    if (isArmyAway(world, a)) continue;
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
    const survivors = armies.filter((a) => state.armies[a.id] && !isArmyAway(world, a));
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
  pushEvent(state, 'battle', `Battle of ${provinceName(world, pid)}: ${names.join(' vs ')}.`, {
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
  const city = provinceName(world, pid);
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
      pushEvent(state, 'army-destroyed', `${sentence(ownerName(world, army.owner, pid))} lost the ${armyName(world, army, pid)} at ${provinceName(world, pid)}.`, {
        nations: involvedNations([army.owner, ...hostileOwners]),
        province: pid,
        subject: army.owner,
        severity: 'combat',
      });
    }
  }

  // Armies set to fall back withdraw on their own once their morale is spent, at the
  // usual price; with nowhere to go, or holding position, they fight on.
  for (const army of armies) {
    if (!state.armies[army.id] || !army.autoRetreat || army.holding || army.move?.leg) continue;
    if (armyMorale(army) >= MORALE.autoRetreatAt || hostileArmiesIn(state, world, pid, army.owner).length === 0) continue;
    const to = retreatTarget(state, world, army, pid);
    if (!to) continue;
    army.move = { path: [to], leg: null, mode: 'move' };
    // From a spot on a road it first walks back through its land, still fighting, and pays as it leaves.
    if (startLeg(state, world, army) && isArmyAway(world, army)) withdrawArmy(state, world, army, pid);
  }
}

/** Where an army can withdraw to: an adjacent province of its own with no enemy army in it. */
export function retreatTarget(state: GameState, world: World, army: Army, from: ProvinceId): ProvinceId | null {
  if (army.owner === NEUTRAL) return null;
  let best: { id: ProvinceId; score: number } | null = null;
  for (const n of world.neighbors[from]) {
    const p = state.provinces[n.id];
    if (p.owner !== army.owner || hostileArmiesIn(state, world, n.id, army.owner).length > 0) continue;
    let friends = 0;
    for (const a of Object.values(state.armies)) {
      if (a.owner === army.owner && a.province === n.id && a.id !== army.id) friends += armyPower(state, a);
    }
    const score = (p.supplied ? 50 : 0) + Math.min(50, friends / 10) - n.distanceKm / 20;
    if (!best || score > best.score || (score === best.score && n.id < best.id)) best = { id: n.id, score };
  }
  return best?.id ?? null;
}

/**
 * An army ordered out of a battle pulls back under fire: every unit loses a set
 * share of its strength (halved with recon screening the withdrawal), and units
 * too weak to get away are left behind. Call once the army has started its leg.
 */
export function withdrawArmy(state: GameState, world: World, army: Army, pid: ProvinceId): void {
  const enemies = hostileArmiesIn(state, world, pid, army.owner);
  if (enemies.length === 0) return;
  const recon = army.units.some((u) => UNITS[u.type].recon);
  const loss = MORALE.retreatLoss * (recon ? 0.5 : 1);
  const before = army.units.length;
  for (const u of army.units) {
    u.strength -= loss;
    u.morale = Math.max(0, u.morale - MORALE.retreatMoraleShock);
  }
  army.units = army.units.filter((u) => u.strength > 0.001);
  const lost = before - army.units.length;
  const enemyOwners = [...new Set(enemies.map((a) => a.owner))];
  if (army.owner !== NEUTRAL) {
    state.nations[army.owner].stats.unitsLost += lost;
    state.nations[army.owner].stats.retreats += 1;
  }
  if (lost > 0 && enemyOwners.length === 1 && enemyOwners[0] !== NEUTRAL) state.nations[enemyOwners[0]].stats.unitsDestroyed += lost;
  const city = provinceName(world, pid);
  const name = armyName(world, army, pid);
  // Walking back within its own province, an army is not withdrawing anywhere.
  const dest = army.move?.leg && army.move.leg.to !== pid ? army.move.leg.to : undefined;
  const conn = dest ? connectionBetween(world, pid, dest) : null;
  const to = dest ? ` to ${provinceName(world, dest)}${conn?.kind === 'strait' ? ' by sea' : ''}` : '';
  const left = lost > 0 ? `, leaving ${lost} unit${lost === 1 ? '' : 's'} behind` : '';
  const opts = { nations: involvedNations([army.owner, ...enemyOwners]), province: pid, subject: army.owner, severity: 'combat' as const };
  if (army.units.length === 0) {
    delete state.armies[army.id];
    pushEvent(state, 'army-destroyed', `The ${name} was cut down trying to withdraw from ${city}.`, opts);
    return;
  }
  pushEvent(state, 'rout', `The ${name} withdrew from the Battle of ${city}${to} under fire${left}.`, opts);
}
