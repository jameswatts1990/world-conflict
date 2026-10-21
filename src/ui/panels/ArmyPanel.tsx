import { useState } from 'react';
import { MORALE, SUPPLY } from '../../sim/config/rules';
import { UNITS } from '../../sim/config/units';
import {
  armiesIn,
  armyMorale,
  armyName,
  armySpeedKmPerTick,
  currentModel,
  findPath,
  formationName,
  hostileArmiesIn,
  isRouted,
  rankName,
  scaledTicks,
  unitGen,
  unitStats,
  veterancyRank,
  type ArmyId,
} from '../../sim';
import { NEUTRAL_COLOR } from '../../sim/scenario/europe/nations';
import { UnitIconArt } from '../art/adapters';
import type { GameController } from '../game/GameController';
import { formatDuration } from '../format';
import { MoraleMeter, Progress } from './Common';

/** Rank chevrons: none for Green, one to three for Regular to Elite. */
export function RankChevrons({ xp }: { xp: number }) {
  const rank = veterancyRank(xp);
  return (
    <span className={`rank rank-${rank}`} title={`${rankName(xp)} (${xp.toFixed(1)} XP)`}>
      {rank === 0 ? '·' : '❯'.repeat(rank)}
    </span>
  );
}

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
  const [confirmDisband, setConfirmDisband] = useState(false);
  const army = state.armies[armyIds[0]];
  if (!army) return null;
  const own = army.owner === human;
  const color = army.owner === 'neutral' ? NEUTRAL_COLOR : world.nations[army.owner].color;
  const name = armyName(world, army);
  const title = army.owner === 'neutral' ? name : `${name}`;
  const leg = army.move?.leg;
  const dest = army.move ? army.move.path[army.move.path.length - 1] : null;
  const hostiles = hostileArmiesIn(state, army.province, army.owner);
  const p = state.provinces[army.province];
  const routed = isRouted(state, army);

  let status: string;
  if (routed) status = `Routed — falling back to ${world.provinces[leg?.to ?? army.province].name}`;
  else if (leg) status = `Marching to ${world.provinces[leg.to].name}`;
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
  const strength = army.units.reduce((s, u) => s + u.strength, 0) / Math.max(1, army.units.length);
  const morale = armyMorale(army);

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

  const disband = () => {
    if (!confirmDisband) {
      setConfirmDisband(true);
      setTimeout(() => setConfirmDisband(false), 2500);
      return;
    }
    const ids = checked.size > 0 ? army.units.filter((u) => checked.has(u.id)).map((u) => u.id) : undefined;
    ctrl.submit({ type: 'disband', nation: human, armyId: army.id, unitIds: ids });
    setChecked(new Set());
    setConfirmDisband(false);
  };

  return (
    <section className="panel army-panel" data-testid="army-panel" data-army={army.id}>
      <header className="panel-header" style={{ borderLeftColor: color }}>
        <h3>{title}</h3>
        <div className="panel-sub">
          {army.owner !== 'neutral' ? `${world.nations[army.owner].adjective} · ` : ''}
          {status}
        </div>
      </header>

      <div className="section army-meters">
        <div className="meter-row">
          <span className="meter-label">Strength</span>
          <Progress value={strength} label={`${Math.round(strength * 100)}%`} />
        </div>
        <div className="meter-row">
          <span className="meter-label" title={`Below ${Math.round(MORALE.routThreshold * 100)}% the army breaks and routs`}>
            Morale
          </span>
          <MoraleMeter value={morale * 100} />
        </div>
      </div>

      {army.move && dest && !routed && (
        <div className="section">
          {leg && <Progress value={leg.elapsed / leg.duration} label={`→ ${world.provinces[leg.to].city.name}`} />}
          <div className="muted">
            Destination {world.provinces[dest].name}
            {eta !== null ? ` · ETA ${formatDuration(eta, state)}` : ''}
            {!leg ? ' · holding to fight/capture' : ''}
          </div>
        </div>
      )}

      {routed && (
        <div className="warn">
          Routed: the army broke and is falling back. It can take orders again in {formatDuration(army.routedUntil - state.tick, state)}.
        </div>
      )}
      {!army.supplied && (
        <div className="warn">
          Out of supply: −25% combat, no recovery.
          {army.unsuppliedTicks >= grace ? ' Suffering attrition!' : ` Attrition begins in ${formatDuration(grace - army.unsuppliedTicks, state)}.`}
        </div>
      )}
      {army.arrivedVia === 'strait' && p.owner !== army.owner && (
        <div className="warn">Landed from the sea: fighting at a disadvantage until the beachhead is won.</div>
      )}

      <div className="section">
        <h4>Formations ({army.units.length})</h4>
        <ul className="unit-list">
          {army.units.map((u) => {
            const s = unitStats(state, army.owner, u.type);
            const model = currentModel(state, world, army.owner, u.type);
            return (
              <li key={u.id} className={checked.has(u.id) ? 'checked' : ''}>
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
                    aria-label={`select ${formationName(world, army.owner, u)}`}
                  />
                )}
                <span className="unit-icon">
                  <UnitIconArt type={u.type} gen={unitGen(state, army.owner, u.type)} nation={army.owner} width={36} />
                </span>
                <span className="unit-text">
                  <span className="unit-name" title={`${UNITS[u.type].name}: ${UNITS[u.type].description}`}>
                    {formationName(world, army.owner, u)} <RankChevrons xp={u.xp} />
                  </span>
                  <span className="unit-model muted" title={`Attack ${s.attack.soft.toFixed(0)}/${s.attack.hard.toFixed(0)} · Defence ${s.defence.soft.toFixed(0)}/${s.defence.hard.toFixed(0)}`}>
                    {model.name} · {model.detail}
                  </span>
                </span>
                <span className="unit-bars">
                  <Progress value={u.strength} label={`${Math.round(u.strength * 100)}%`} />
                  <div className={`mini-morale ${u.morale >= 0.6 ? 'high' : u.morale >= 0.35 ? 'mid' : 'low'}`} title={`Morale ${Math.round(u.morale * 100)}%`}>
                    <div style={{ width: `${u.morale * 100}%` }} />
                  </div>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="muted">Speed {(armySpeedKmPerTick(state, army) * 60 * state.settings.durationScale).toFixed(0)} km/min on open ground (slowest unit)</div>
      </div>

      {own && (
        <div className="section orders">
          <h4>Orders</h4>
          <div className="btn-row">
            <button className={moveMode ? 'active' : ''} disabled={routed} onClick={() => onMoveMode(!moveMode)} title="Then click a destination (or right-click a province any time) — M" data-testid="move-mode">
              {moveMode ? 'Click destination…' : 'Move'}
            </button>
            <button disabled={!army.move || routed} onClick={() => ctrl.submit({ type: 'stop', nation: human, armyId: army.id })} title="Stop after the current leg (S)">
              Stop
            </button>
            <button disabled={checked.size === 0 || checked.size === army.units.length || !!leg} onClick={split} title="Split ticked formations into a new army">
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
            <button
              className={`danger${confirmDisband ? ' active' : ''}`}
              disabled={!!leg}
              onClick={disband}
              title={checked.size > 0 ? 'Disband the ticked formations (half their manpower returns)' : 'Disband the whole army (half its manpower returns)'}
            >
              {confirmDisband ? 'Confirm' : checked.size > 0 ? `Disband ${checked.size}` : 'Disband'}
            </button>
          </div>
          {armyIds.length > 1 && <div className="muted">{armyIds.length} armies selected — move orders apply to all.</div>}
        </div>
      )}
    </section>
  );
}
