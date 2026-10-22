// Runs an all-AI campaign without rendering, for balance tuning and smoke testing.
//   npm run sim:campaign -- [seed] [maxMinutes]
import {
  EUROPE_SCENARIO,
  Simulation,
  buildWorld,
  computeScores,
  createInitialState,
  hashState,
  heldVp,
  nationEra,
  nationPower,
  vpToWin,
} from '../src/sim';

const seed = Number(process.argv[2] ?? 1);
const maxMinutes = Number(process.argv[3] ?? 150);
const world = buildWorld(EUROPE_SCENARIO);
const sim = new Simulation(world, createInitialState(world, { seed, humanNation: null }));
const started = performance.now();

function report(): void {
  const s = sim.state;
  const minute = Math.floor(s.tick / 60);
  const parts = world.nationIds.map((id) => {
    const n = s.nations[id];
    if (n.eliminated) return `${id}:dead`;
    const provinces = world.provinceIds.filter((p) => s.provinces[p].owner === id).length;
    const units = Object.values(s.armies).filter((a) => a.owner === id).reduce((c, a) => c + a.units.length, 0);
    const wars = world.nationIds.filter((o) => n.relations[o]?.status === 'war').join('+') || '-';
    return `${id}:${provinces}p ${units}u ${heldVp(s, world, id)}vp $${Math.round(n.resources.money)} pw${Math.round(nationPower(s, id))} m${Math.round(n.morale)} t${n.research.completed.length} ${nationEra(s, id)} war[${wars}]`;
  });
  const neutral = world.provinceIds.filter((p) => s.provinces[p].owner === 'neutral').length;
  console.log(`t=${String(minute).padStart(3)}m neutral:${neutral} | ${parts.join(' | ')}`);
}

for (let m = 0; m < maxMinutes && !sim.state.outcome; m++) {
  sim.run(60);
  if (m % 10 === 9) report();
}
report();
const o = sim.state.outcome;
console.log(o ? `OUTCOME: ${o.winner} by ${o.reason} at ${Math.round(o.tick / 60)} min (need ${vpToWin(world)} VP)` : 'No outcome yet');
console.log(computeScores(sim.state, world));
const wars = sim.state.events.filter((e) => e.kind === 'war' || e.kind === 'peace').map((e) => `${Math.round(e.tick / 60)}m ${e.text}`);
console.log(wars.join('\n'));
console.log(`hash ${hashState(sim.state)}  (${((performance.now() - started) / 1000).toFixed(1)}s wall)`);
