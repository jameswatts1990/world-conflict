// Development aid: runs several all-AI campaigns and summarises how they play.
//   npx vite-node scripts/dev/batch.ts [seeds=6] [minutes=150]
import { EUROPE_SCENARIO, Simulation, buildWorld, createInitialState, nationEra, vpToWin } from '../../src/sim';

const seeds = Number(process.argv[2] ?? 6);
const minutes = Number(process.argv[3] ?? 150);
const world = buildWorld(EUROPE_SCENARIO);
const kinds = ['rout', 'capture', 'war', 'peace', 'city-growth', 'disband'];
const totals: Record<string, number> = {};
const t0 = performance.now();
for (let seed = 1; seed <= seeds; seed++) {
  const sim = new Simulation(world, createInitialState(world, { seed, humanNation: null }));
  const counts: Record<string, number> = Object.fromEntries(kinds.map((k) => [k, 0]));
  let lastEvent = 0;
  let maxUnits = 0;
  let maxArmy = 0;
  let warMinutes = 0;
  const techAt: Record<string, number> = {};
  for (let m = 0; m < minutes && !sim.state.outcome; m++) {
    sim.run(60);
    for (const e of sim.state.events) {
      if (e.id <= lastEvent) continue;
      if (e.kind in counts) counts[e.kind]++;
    }
    lastEvent = sim.state.nextEventId - 1;
    for (const id of world.nationIds) {
      const units = Object.values(sim.state.armies).filter((a) => a.owner === id).reduce((s, a) => s + a.units.length, 0);
      maxUnits = Math.max(maxUnits, units);
    }
    for (const a of Object.values(sim.state.armies)) maxArmy = Math.max(maxArmy, a.units.length);
    for (const a of world.nationIds) for (const b of world.nationIds) if (a < b && sim.state.nations[a].relations[b]?.status === 'war') warMinutes++;
    for (const id of world.nationIds) if (!techAt[id] && sim.state.nations[id].research.completed.length >= 30) techAt[id] = m + 1;
  }
  const s = sim.state;
  const o = s.outcome;
  const nations = world.nationIds
    .map((id) => {
      const n = s.nations[id];
      if (n.eliminated) return `${id}:dead`;
      const p = world.provinceIds.filter((x) => s.provinces[x].owner === id).length;
      const u = Object.values(s.armies).filter((a) => a.owner === id).reduce((x, a) => x + a.units.length, 0);
      return `${id}:${p}p/${u}u/m${Math.round(n.morale)}/t${n.research.completed.length}/${nationEra(s, id)[0]}`;
    })
    .join(' ');
  const neutral = world.provinceIds.filter((p) => s.provinces[p].owner === 'neutral').length;
  for (const k of kinds) totals[k] = (totals[k] ?? 0) + counts[k];
  console.log(
    `seed ${seed}: ${o ? `${o.winner} by ${o.reason} @${Math.round(o.tick / 60)}m` : 'no outcome'} | maxUnits ${maxUnits} maxArmy ${maxArmy} neutral ${neutral} | ${kinds.map((k) => `${k} ${counts[k]}`).join(', ')}`,
  );
  console.log(`   ${nations}`);
  console.log(`   war-minutes ${warMinutes} (pairs at war × minutes) · 30 techs at ${world.nationIds.map((id) => `${id}:${techAt[id] ?? '-'}`).join(' ')}`);
}
console.log(`avg per game: ${kinds.map((k) => `${k} ${(totals[k] / seeds).toFixed(1)}`).join(', ')} (need ${vpToWin(world)} VP) — ${((performance.now() - t0) / 1000).toFixed(0)}s`);
