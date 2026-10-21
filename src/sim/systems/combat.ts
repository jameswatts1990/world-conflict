// Battle resolution. Hostile armies stationed in the same province fight in
// rounds. The province owner's armies use defence values; everyone else uses
// attack values. Runs every INTERVALS.combatRound ticks.
import { ECONOMY, SUPPLY } from '../config/rules';
import { ARMY_RULES, UNITS } from '../config/units';
import { pushEvent } from '../events';
import { areHostile, fortificationReduction, isArmyInTransit, techEffects, unitStats } from '../queries';
import { random, randomInt } from '../rng';
import { ownerName, sentence } from '../text';
import { NEUTRAL, type Army, type BattleState, type GameState, type NationId, type OwnerId, type ProvinceId, type Unit } from '../types';
import type { World } from '../world';

interface Target {
  army: Army;
  unit: Unit;
}

function hasHostilePair(state: GameState, armies: Army[]): boolean {
  for (let i = 0; i < armies.length; i++) {
    for (let j = i + 1; j < armies.length; j++) {
      if (areHostile(state, armies[i].owner, armies[j].owner)) return true;
    }
  }
  return false;
}

/** Army-wide multiplier from supply, treasury and doctrine. */
export function armyCombatMultiplier(state: GameState, army: Army): number {
  let m = 1;
  if (!army.supplied) m *= SUPPLY.unsuppliedCombatMult;
  if (army.owner !== NEUTRAL && state.nations[army.owner].shortages.money) m *= ECONOMY.unpaidCombatMult;
  const types = new Set(army.units.map((u) => u.type));
  if (types.has('infantry') && types.has('artillery') && types.has('tank')) {
    for (const e of techEffects(state, army.owner)) if (e.kind === 'combinedArms') m *= e.mult;
  }
  return m;
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
    else joinBattle(state.battles[pid], armies);
    resolveRound(state, world, pid, armies);
    const survivors = armies.filter((a) => state.armies[a.id]);
    if (!(survivors.length >= 2 && hasHostilePair(state, survivors))) endBattle(state, world, pid, survivors);
  }
}

function involvedNations(owners: OwnerId[]): NationId[] {
  return owners.filter((o): o is NationId => o !== NEUTRAL);
}

function startBattle(state: GameState, world: World, pid: ProvinceId, armies: Army[]): void {
  const owners = [...new Set(armies.map((a) => a.owner))];
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

/** Late arrivals become participants, so they also hear how the battle ends. */
function joinBattle(battle: BattleState, armies: Army[]): void {
  for (const a of armies) if (!battle.owners.includes(a.owner)) battle.owners.push(a.owner);
}

function endBattle(state: GameState, world: World, pid: ProvinceId, survivors: Army[]): void {
  const battle = state.battles[pid];
  delete state.battles[pid];
  if (!battle) return;
  const winners = [...new Set(survivors.map((a) => a.owner))];
  const city = world.provinces[pid].city.name;
  // Nobody beaten means the fighting simply stopped (the sides made peace).
  const beaten = battle.owners.some((o) => !winners.includes(o));
  const text =
    winners.length === 0
      ? `The Battle of ${city} ended with no survivors.`
      : beaten
        ? `${sentence(winners.map((w) => ownerName(world, w, pid)).join(' & '))} won the Battle of ${city}.`
        : `The Battle of ${city} ended.`;
  pushEvent(state, 'battle-end', text, { nations: involvedNations(battle.owners), province: pid, severity: 'combat' });
}

function resolveRound(state: GameState, world: World, pid: ProvinceId, armies: Army[]): void {
  const province = state.provinces[pid];
  const terrain = world.provinces[pid].terrain;
  const fortLevel = province.buildings.fortifications ?? 0;
  const damage = new Map<string, number>();

  for (const army of armies) {
    const targets: Target[] = [];
    for (const other of armies) {
      if (!areHostile(state, army.owner, other.owner)) continue;
      for (const unit of other.units) targets.push({ army: other, unit });
    }
    if (targets.length === 0) continue;
    const role = province.owner === army.owner ? 'defence' : 'attack';
    const armyMult = armyCombatMultiplier(state, army);
    const fuelShort = army.owner !== NEUTRAL && state.nations[army.owner].shortages.fuel;

    for (const unit of army.units) {
      const stats = unitStats(state, army.owner, unit.type);
      const target = targets[randomInt(state, targets.length)];
      const tStats = unitStats(state, target.army.owner, target.unit.type);
      const values = role === 'defence' ? stats.defence : stats.attack;
      const base = tStats.armoured ? values.hard : values.soft;
      const terrainMod = UNITS[unit.type].terrain[terrain]?.[role] ?? 1;
      const fuelMod = unit.type === 'tank' && fuelShort ? ECONOMY.noFuelTankMult : 1;
      const strengthMod = ARMY_RULES.strengthFloor + (1 - ARMY_RULES.strengthFloor) * unit.strength;
      const variance = 1 + (random(state) * 2 - 1) * ARMY_RULES.damageVariance;
      let dmg = base * terrainMod * fuelMod * strengthMod * variance * armyMult * ARMY_RULES.damageScale;
      if (target.army.owner === province.owner && fortLevel > 0) {
        dmg *= 1 - fortificationReduction(state, province.owner, fortLevel);
      }
      damage.set(target.unit.id, (damage.get(target.unit.id) ?? 0) + dmg / tStats.maxHp);
    }
  }

  for (const army of armies) {
    const hostileOwners = [...new Set(armies.filter((o) => areHostile(state, army.owner, o.owner)).map((o) => o.owner))];
    const before = army.units.length;
    for (const u of army.units) u.strength -= damage.get(u.id) ?? 0;
    army.units = army.units.filter((u) => u.strength > 0.001);
    const lost = before - army.units.length;
    if (lost > 0) {
      if (army.owner !== NEUTRAL) state.nations[army.owner].stats.unitsLost += lost;
      if (hostileOwners.length === 1 && hostileOwners[0] !== NEUTRAL) {
        state.nations[hostileOwners[0]].stats.unitsDestroyed += lost;
      }
    }
    if (army.units.length === 0) {
      delete state.armies[army.id];
      pushEvent(state, 'army-destroyed', `${sentence(ownerName(world, army.owner, pid))} lost an army at ${world.provinces[pid].city.name}.`, {
        nations: involvedNations([army.owner, ...hostileOwners]),
        province: pid,
        severity: 'combat',
      });
    }
  }
}
