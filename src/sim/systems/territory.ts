// Province capture, ownership transfer and army withdrawal.
import { CITY } from '../config/buildings';
import { MORALE } from '../config/rules';
import { ARMY_RULES, UNITS } from '../config/units';
import { pushEvent } from '../events';
import { armyName } from '../names';
import { areHostile, armyPower, captureTicks, hostileArmiesIn, isArmyInTransit } from '../queries';
import { nationName, provinceName, sentence } from '../text';
import { NEUTRAL, type Army, type GameState, type NationId, type ProvinceId } from '../types';
import type { World } from '../world';
import { shockNation } from './civic';

/** Capture progresses while an enemy army holds a province uncontested. Runs every tick. */
export function captureSystem(state: GameState, world: World): void {
  const stationed = new Map<ProvinceId, Army[]>();
  for (const id of Object.keys(state.armies).sort()) {
    const a = state.armies[id];
    if (isArmyInTransit(a)) continue;
    const list = stationed.get(a.province) ?? [];
    list.push(a);
    stationed.set(a.province, list);
  }

  for (const pid of world.provinceIds) {
    const p = state.provinces[pid];
    const armies = stationed.get(pid) ?? [];
    const attackers = armies.filter((a) => a.owner !== NEUTRAL && a.owner !== p.owner && areHostile(state, a.owner, p.owner));
    if (attackers.length === 0) {
      p.capture = null;
      continue;
    }
    // The strongest present enemy nation leads the capture.
    const power = new Map<NationId, number>();
    for (const a of attackers) power.set(a.owner, (power.get(a.owner) ?? 0) + armyPower(state, a));
    let capturer: NationId = attackers[0].owner;
    for (const [n, pw] of power) if (pw > (power.get(capturer) ?? 0)) capturer = n;

    if (hostileArmiesIn(state, pid, capturer).length > 0) continue; // contested: battle first

    if (!p.capture || p.capture.by !== capturer) {
      p.capture = { by: capturer, progress: 0, required: captureTicks(state, world, pid) };
    }
    // Reconnaissance units find the way in faster.
    const recon = attackers.some((a) => a.owner === capturer && a.units.some((u) => UNITS[u.type].recon));
    p.capture.progress += recon ? 1 / ARMY_RULES.reconCapture : 1;
    if (p.capture.progress >= p.capture.required) transferProvince(state, world, pid, capturer);
  }
}

export function transferProvince(state: GameState, world: World, pid: ProvinceId, newOwner: NationId): void {
  const p = state.provinces[pid];
  const oldOwner = p.owner;
  const def = world.provinces[pid];
  p.owner = newOwner;
  p.ownerSince = state.tick;
  p.capture = null;
  p.construction = null;
  p.recruitQueue = [];
  // Fighting damages fortifications; an occupation HQ only serves its builder.
  if (p.buildings.fortifications) {
    p.buildings.fortifications -= 1;
    if (p.buildings.fortifications <= 0) delete p.buildings.fortifications;
  }
  delete p.buildings.garrisonHq;
  state.nations[newOwner].stats.provincesCaptured += 1;

  // Civilians greet liberators and resent occupiers; the loser's nearby land is shaken (by a share of the
  // shock for each of the lands round a city, so the loss of all of them shakes it as the old land did).
  p.morale = def.core === newOwner ? MORALE.capturedLiberated : MORALE.capturedOccupied;
  p.growth = Math.max(0, p.growth - CITY.captureGrowthLoss);
  if (oldOwner !== NEUTRAL) {
    const share = def.around ? 1 / (world.provinces[def.around].lands?.length ?? 1) : 1;
    for (const id of world.vicinity[pid]) {
      const np = state.provinces[id];
      if (np.owner === oldOwner) np.morale = Math.max(0, np.morale + MORALE.captureNeighbourShock * share);
    }
    if (world.nations[oldOwner].capital === pid) shockNation(state, world, oldOwner, MORALE.capitalLostShock, true);
  }

  const important = !!def.objectiveVp;
  const who = sentence(nationName(world, newOwner));
  const where = provinceName(world, pid);
  const objective = important ? ` (objective, ${def.objectiveVp} VP)` : '';
  // A one-province country's province carries the country's name: say it once.
  const loser = oldOwner === NEUTRAL ? '' : nationName(world, oldOwner);
  const text =
    oldOwner === NEUTRAL
      ? `${who} occupied ${where}${objective}.`
      : def.core === newOwner
        ? where === nationName(world, newOwner)
          ? `${who} drove ${loser} out${objective}.`
          : `${who} liberated ${where} from ${loser}${objective}.`
        : where === loser
          ? `${who} captured ${where}${objective}.`
          : `${who} captured ${where} from ${loser}${objective}.`;
  pushEvent(state, 'capture', text, {
    nations: important ? [] : [newOwner, ...(oldOwner === NEUTRAL ? [] : [oldOwner])],
    province: pid,
    subject: oldOwner,
    severity: 'combat',
  });

  // Armies of nations at peace with the new owner cannot stay.
  for (const id of Object.keys(state.armies).sort()) {
    const a = state.armies[id];
    if (a.province !== pid || isArmyInTransit(a) || a.owner === newOwner) continue;
    if (!areHostile(state, a.owner, newOwner)) withdrawArmy(state, world, a);
  }
}

/** Moves an army to the nearest province its owner controls, or disbands it if there is none. */
export function withdrawArmy(state: GameState, world: World, army: Army): void {
  const start = army.province;
  const seen = new Set<ProvinceId>([start]);
  const queue: ProvinceId[] = [start];
  let target: ProvinceId | null = null;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (state.provinces[cur].owner === army.owner) {
      target = cur;
      break;
    }
    for (const n of world.neighbors[cur]) {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        queue.push(n.id);
      }
    }
  }
  const nations = army.owner === NEUTRAL ? [] : [army.owner];
  if (!target) {
    delete state.armies[army.id];
    pushEvent(state, 'withdraw', `The ${armyName(world, army, start)} in ${provinceName(world, start)} had nowhere to withdraw to and disbanded.`, {
      nations,
      province: start,
      severity: 'bad',
    });
    return;
  }
  army.province = target;
  army.move = null;
  pushEvent(state, 'withdraw', `The ${armyName(world, army)} withdrew from ${provinceName(world, start)} to ${provinceName(world, target)}.`, {
    nations,
    province: target,
  });
}
