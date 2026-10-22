// Timed construction, recruitment and research. Runs every tick.
import { BUILDINGS } from '../config/buildings';
import { MORALE } from '../config/rules';
import { TECH_BY_ID } from '../config/research';
import { ARMY_RULES, UNITS } from '../config/units';
import { pushEvent } from '../events';
import { spend } from '../ledger';
import { canAfford, isArmyInTransit, recruitXp, researchSlots, researchSpeed, scaledTicks, unitMoraleCap } from '../queries';
import { createArmy, createUnit } from '../state';
import { NEUTRAL, type GameState, type NationId, type ProvinceId, type UnitType } from '../types';
import type { World } from '../world';

export function constructionSystem(state: GameState, world: World): void {
  for (const id of world.provinceIds) {
    const p = state.provinces[id];
    const job = p.construction;
    if (!job || p.owner === NEUTRAL) continue;
    job.remaining -= 1;
    if (job.remaining > 0) continue;
    p.buildings[job.building] = job.targetLevel;
    p.construction = null;
    const lvl = BUILDINGS[job.building].maxLevel > 1 ? ` (level ${job.targetLevel})` : '';
    pushEvent(state, 'construction', `${BUILDINGS[job.building].name}${lvl} completed in ${world.provinces[id].city.name}.`, {
      nations: [p.owner],
      province: id,
      severity: 'good',
    });
  }
}

export function recruitmentSystem(state: GameState, world: World): void {
  for (const id of world.provinceIds) {
    const p = state.provinces[id];
    const job = p.recruitQueue[0];
    if (!job || p.owner === NEUTRAL) continue;
    job.remaining -= 1;
    if (job.remaining > 0) continue;
    p.recruitQueue.shift();
    spawnUnit(state, p.owner, id, job.unitType);
    pushEvent(state, 'recruitment', `${UNITS[job.unitType].name} ready in ${world.provinces[id].city.name}.`, {
      nations: [p.owner],
      province: id,
      severity: 'good',
    });
  }
}

/** New units join the largest idle army of the owner in the province, or form a new army. */
export function spawnUnit(state: GameState, owner: NationId, province: ProvinceId, type: UnitType): void {
  const unit = createUnit(state, owner, type, {
    xp: recruitXp(state, owner, province, type),
    morale: unitMoraleCap(state, owner) * MORALE.recruitShare,
  });
  const idle = Object.values(state.armies)
    .filter(
      (a) =>
        a.owner === owner &&
        a.province === province &&
        !isArmyInTransit(a) &&
        a.move === null &&
        a.units.length < ARMY_RULES.maxUnitsPerArmy,
    )
    .sort((a, b) => b.units.length - a.units.length || (a.id < b.id ? -1 : 1));
  if (idle.length > 0) idle[0].units.push(unit);
  else createArmy(state, owner, province, [unit]);
}

/** Starts queued projects, in order, while research slots are free and the next one is affordable. */
export function startQueuedResearch(state: GameState, nation: NationId): void {
  const n = state.nations[nation];
  const r = n.research;
  const slots = researchSlots(state, nation);
  let i = 0;
  while (r.active.length < slots && i < r.queue.length) {
    const tech = r.queue[i];
    const cfg = TECH_BY_ID[tech];
    if (!cfg || r.completed.includes(tech) || r.active.some((j) => j.tech === tech)) {
      r.queue.splice(i, 1);
      continue;
    }
    if (cfg.requires.some((t) => !r.completed.includes(t))) {
      i++; // waits for a prerequisite that is still in progress or queued earlier
      continue;
    }
    if (!canAfford(n.resources, cfg.cost)) break; // keep the player's order: wait for funds
    spend(state, nation, cfg.cost);
    const ticks = scaledTicks(state, cfg.seconds);
    r.active.push({ tech, remaining: ticks, total: ticks });
    r.queue.splice(i, 1);
  }
}

export function researchSystem(state: GameState, world: World): void {
  for (const id of world.nationIds) {
    const n = state.nations[id];
    if (n.eliminated) continue;
    const r = n.research;
    if (r.active.length > 0) {
      const speed = researchSpeed(state, id);
      for (const job of r.active) job.remaining -= speed;
      for (const job of r.active.filter((j) => j.remaining <= 1e-9)) {
        r.completed.push(job.tech);
        pushEvent(state, 'research', `Research complete: ${TECH_BY_ID[job.tech].name}.`, { nations: [id], severity: 'good' });
      }
      r.active = r.active.filter((j) => j.remaining > 1e-9);
    }
    if (r.queue.length > 0) startQueuedResearch(state, id);
  }
}
