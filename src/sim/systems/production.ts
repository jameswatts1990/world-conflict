// Timed construction, recruitment and research. Runs every tick.
import { BUILDINGS } from '../config/buildings';
import { TECH_BY_ID } from '../config/research';
import { ARMY_RULES, UNITS } from '../config/units';
import { pushEvent } from '../events';
import { isArmyInTransit } from '../queries';
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
  const unit = createUnit(state, type);
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

export function researchSystem(state: GameState, world: World): void {
  for (const id of world.nationIds) {
    const n = state.nations[id];
    const active = n.research.active;
    if (!active || n.eliminated) continue;
    active.remaining -= 1;
    if (active.remaining > 0) continue;
    n.research.completed.push(active.tech);
    n.research.active = null;
    pushEvent(state, 'research', `Research complete: ${TECH_BY_ID[active.tech].name}.`, {
      nations: [id],
      severity: 'good',
    });
  }
}
