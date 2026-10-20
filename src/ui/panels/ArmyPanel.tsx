import { useState } from 'react';
import { SUPPLY } from '../../sim/config/rules';
import { UNITS } from '../../sim/config/units';
import { armiesIn, armySpeedKmPerTick, findPath, hostileArmiesIn, scaledTicks, unitStats, type ArmyId } from '../../sim';
import { NEUTRAL_COLOR } from '../../sim/scenario/europe/nations';
import type { GameController } from '../game/GameController';
import { formatDuration } from '../format';
import { UnitGlyph } from '../icons';
import { Progress } from './Common';

export function ArmyPanel({
  ctrl,
  armyIds,
  moveMode,
  onMoveMode,
  onSelectArmies,
}: {
  ctrl: GameController;
  armyIds: ArmyId[];
  moveMode: boolean;
  onMoveMode: (on: boolean) => void;
  onSelectArmies: (ids: ArmyId[]) => void;
}) {
  const { state, world, human } = ctrl;
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const army = state.armies[armyIds[0]];
  if (!army) return null;
  const own = army.owner === human;
  const color = army.owner === 'neutral' ? NEUTRAL_COLOR : world.nations[army.owner].color;
  const title = army.owner === 'neutral' ? `${world.provinces[army.province].neutralState} garrison` : `${world.nations[army.owner].adjective} army`;
  const leg = army.move?.leg;
  const dest = army.move ? army.move.path[army.move.path.length - 1] : null;
  const hostiles = hostileArmiesIn(state, army.province, army.owner);
  const p = state.provinces[army.province];

  let status: string;
  if (leg) status = `Marching to ${world.provinces[leg.to].name}`;
  else if (hostiles.length > 0) status = `In battle at ${world.provinces[army.province].name}`;
  else if (p.capture && p.capture.by === army.owner) status = `Capturing ${world.provinces[army.province].name}`;
  else status = `Stationed in ${world.provinces[army.province].name}`;

  let eta: number | null = null;
  if (army.move && dest) {
    const from = leg ? leg.to : army.province;
    const rest = from === dest ? 0 : (findPath(state, world, army, from, dest)?.ticks ?? 0);
    eta = (leg ? leg.duration - leg.elapsed : 0) + rest;
  }

  const sameProvinceOwn = armiesIn(state, army.province).filter((a) => a.owner === human);
  const grace = scaledTicks(state, SUPPLY.attritionGraceSeconds);

  const split = () => {
    const ids = army.units.filter((u) => checked.has(u.id)).map((u) => u.id);
    const before = new Set(Object.keys(state.armies));
    const r = ctrl.submit({ type: 'split', nation: human, armyId: army.id, unitIds: ids });
    if (r.ok) {
      setChecked(new Set());
      const created = Object.keys(state.armies).find((id) => !before.has(id));
      if (created) onSelectArmies([created]);
    }
  };

  return (
    <section className="panel army-panel" data-testid="army-panel" data-army={army.id}>
      <header className="panel-header" style={{ borderLeftColor: color }}>
        <h3>
          {title} <span className="muted">#{army.id.slice(1)}</span>
        </h3>
        <div className="panel-sub">{status}</div>
      </header>

      {army.move && dest && (
        <div className="section">
          {leg && <Progress value={leg.elapsed / leg.duration} label={`→ ${world.provinces[leg.to].city.name}`} />}
          <div className="muted">
            Destination {world.provinces[dest].name}
            {eta !== null ? ` · ETA ${formatDuration(eta, state)}` : ''}
            {!leg ? ' · holding to fight/capture' : ''}
          </div>
        </div>
      )}

      {!army.supplied && (
        <div className="warn">
          Out of supply: −25% combat, no recovery.
          {army.unsuppliedTicks >= grace ? ' Suffering attrition!' : ` Attrition begins in ${formatDuration(grace - army.unsuppliedTicks, state)}.`}
        </div>
      )}

      <div className="section">
        <h4>Units ({army.units.length})</h4>
        <ul className="unit-list">
          {army.units.map((u) => {
            const s = unitStats(state, army.owner, u.type);
            return (
              <li key={u.id}>
                {own && (
                  <input
                    type="checkbox"
                    checked={checked.has(u.id)}
                    onChange={(e) => {
                      const next = new Set(checked);
                      if (e.target.checked) next.add(u.id);
                      else next.delete(u.id);
                      setChecked(next);
                    }}
                    aria-label={`select ${s.name}`}
                  />
                )}
                <UnitGlyph type={u.type} />
                <span className="unit-name" title={UNITS[u.type].description}>
                  {s.name}
                </span>
                <span className="unit-stats" title="Attack (soft/hard) · Defence (soft/hard)">
                  A {s.attack.soft.toFixed(0)}/{s.attack.hard.toFixed(0)} · D {s.defence.soft.toFixed(0)}/{s.defence.hard.toFixed(0)}
                </span>
                <Progress value={u.strength} label={`${Math.round(u.strength * 100)}%`} />
              </li>
            );
          })}
        </ul>
        <div className="muted">Speed {(armySpeedKmPerTick(state, army) * 60).toFixed(0)} km/min (slowest unit)</div>
      </div>

      {own && (
        <div className="section orders">
          <h4>Orders</h4>
          <div className="btn-row">
            <button className={moveMode ? 'active' : ''} onClick={() => onMoveMode(!moveMode)} title="Then click a destination (or right-click a province any time) — M" data-testid="move-mode">
              {moveMode ? 'Click destination…' : 'Move'}
            </button>
            <button disabled={!army.move} onClick={() => ctrl.submit({ type: 'stop', nation: human, armyId: army.id })} title="Stop after the current leg (S)">
              Stop
            </button>
            <button disabled={checked.size === 0 || checked.size === army.units.length || !!leg} onClick={split} title="Split ticked units into a new army">
              Split
            </button>
            <button
              disabled={sameProvinceOwn.length < 2 || !!leg}
              onClick={() => {
                const ids = [army.id, ...sameProvinceOwn.filter((a) => a.id !== army.id).map((a) => a.id)];
                if (ctrl.submit({ type: 'merge', nation: human, armyIds: ids }).ok) onSelectArmies([army.id]);
              }}
              title="Merge all your armies in this province into this one"
            >
              Merge here
            </button>
          </div>
          {armyIds.length > 1 && <div className="muted">{armyIds.length} armies selected — move orders apply to all.</div>}
        </div>
      )}
    </section>
  );
}
