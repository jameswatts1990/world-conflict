import { useState } from 'react';
import { SUPPLY } from '../../sim/config/rules';
import { UNITS } from '../../sim/config/units';
import { UNIT_TYPES, armiesIn, armySpeedKmPerTick, findPath, hostileArmiesIn, provinceName, scaledTicks, unitStats, type ArmyId } from '../../sim';
import { ownerColor, strengthColor } from '../color';
import { OwnerFlag } from '../flags';
import type { GameController } from '../game/GameController';
import { formatDuration } from '../format';
import { Icon, UnitGlyph, type IconName } from '../icons';
import { armyName, composition, ownerShortName } from '../labels';
import { Progress, Section } from './Common';

export function ArmyPanel({
  ctrl,
  armyIds,
  moveMode,
  onMoveMode,
  onSelectArmies,
  onClose,
}: {
  ctrl: GameController;
  armyIds: ArmyId[];
  moveMode: boolean;
  onMoveMode: (on: boolean) => void;
  onSelectArmies: (ids: ArmyId[]) => void;
  onClose: () => void;
}) {
  const { state, world, human } = ctrl;
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const army = state.armies[armyIds[0]];
  if (!army) return null;
  const own = army.owner === human;
  const color = ownerColor(world, army.owner);
  const leg = army.move?.leg;
  const dest = army.move ? army.move.path[army.move.path.length - 1] : null;
  const hostiles = hostileArmiesIn(state, army.province, army.owner);
  const p = state.provinces[army.province];
  const c = composition(army);

  let status: string;
  let statusIcon: IconName;
  const here = provinceName(world, army.province);
  if (leg) {
    status = `Marching to ${provinceName(world, leg.to)}`;
    statusIcon = 'move';
  } else if (hostiles.length > 0) {
    status = `In battle in ${here}`;
    statusIcon = 'swords';
  } else if (p.capture && p.capture.by === army.owner) {
    status = `Capturing ${here} · ${formatDuration(p.capture.required - p.capture.progress, state)} left`;
    statusIcon = 'target';
  } else {
    status = `Stationed in ${here}`;
    statusIcon = 'shield';
  }

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
      <header className="panel-hero army-hero" style={{ '--owner': color } as React.CSSProperties}>
        <div className="hero-top">
          <OwnerFlag world={world} owner={army.owner} province={army.province} size={16} />
          <span className="hero-owner">
            {ownerShortName(world, army.owner, army.province)} · Army #{army.id.slice(1)}
          </span>
          <button className="icon-btn close-btn" onClick={onClose} aria-label="Close army panel">
            <Icon name="close" size={16} />
          </button>
        </div>
        <h3>{armyName(world, army)}</h3>
        <div className={`army-status${hostiles.length && !leg ? ' battle' : ''}`}>
          <Icon name={statusIcon} size={14} /> {status}
        </div>
        <div className="army-summary">
          {UNIT_TYPES.map((t) => (
            <span key={t} className={`as-unit${c[t] ? '' : ' none'}`} title={UNITS[t].name}>
              <UnitGlyph type={t} size={26} />
              <span>{c[t]}</span>
            </span>
          ))}
          <span className="as-str" title="Average strength">
            <span className="as-str-val" style={{ color: strengthColor(c.strength) }}>
              {Math.round(c.strength * 100)}%
            </span>
            <span className="tb-sub">strength</span>
          </span>
        </div>
      </header>

      <div className="panel-body">
        {army.move && dest && (
          <div className="march-box">
            {leg && <Progress value={leg.elapsed / leg.duration} label={`→ ${world.provinces[leg.to].city.name}`} tone="blue" />}
            <div className="march-meta">
              <span>
                <Icon name="target" size={13} /> {world.provinces[dest].name}
              </span>
              {eta !== null && (
                <span>
                  <Icon name="clock" size={13} /> ETA {formatDuration(eta, state)}
                </span>
              )}
            </div>
            {!leg && <div className="muted">Halted to fight or capture, then marching on</div>}
          </div>
        )}

        {!army.supplied && (
          <div className="warn">
            <Icon name="warning" size={15} />
            <span>
              Out of supply: fights at {Math.round(SUPPLY.unsuppliedCombatMult * 100)}% and cannot recover.
              {army.unsuppliedTicks >= grace ? ' Suffering attrition!' : ` Attrition begins in ${formatDuration(grace - army.unsuppliedTicks, state)}.`}
            </span>
          </div>
        )}

        {own && (
          <div className="orders">
            <button className={`order-btn${moveMode ? ' active' : ''}`} onClick={() => onMoveMode(!moveMode)} title="Then click a destination (or right-click a province any time) — M" data-testid="move-mode">
              <Icon name="move" size={18} />
              <span>{moveMode ? 'Pick target' : 'Move'}</span>
            </button>
            <button className="order-btn" disabled={!army.move} onClick={() => ctrl.submit({ type: 'stop', nation: human, armyId: army.id })} title="Stop after the current leg (S)">
              <Icon name="stop" size={18} />
              <span>Stop</span>
            </button>
            <button className="order-btn" disabled={checked.size === 0 || checked.size === army.units.length || !!leg} onClick={split} title="Split ticked units into a new army">
              <Icon name="split" size={18} />
              <span>Split</span>
            </button>
            <button
              className="order-btn"
              disabled={sameProvinceOwn.length < 2 || !!leg}
              onClick={() => {
                const ids = [army.id, ...sameProvinceOwn.filter((a) => a.id !== army.id).map((a) => a.id)];
                if (ctrl.submit({ type: 'merge', nation: human, armyIds: ids }).ok) onSelectArmies([army.id]);
              }}
              title="Merge all your armies in this province into this one"
            >
              <Icon name="merge" size={18} />
              <span>Merge here</span>
            </button>
          </div>
        )}
        {own && armyIds.length > 1 && <div className="muted multi-note">{armyIds.length} armies selected — move orders apply to all.</div>}

        <Section title={`Units (${army.units.length})`} icon="shield" extra={<span className="muted">{(armySpeedKmPerTick(state, army) * 60).toFixed(0)} km/min</span>}>
          <ul className="unit-list">
            {army.units.map((u) => {
              const s = unitStats(state, army.owner, u.type);
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
                      aria-label={`select ${s.name}`}
                    />
                  )}
                  <span className="unit-icon">
                    <UnitGlyph type={u.type} size={28} />
                  </span>
                  <span className="unit-name" title={UNITS[u.type].description}>
                    {s.name}
                    {s.model === 'ww2' && <span className="model-tag">WWII</span>}
                  </span>
                  <span className="unit-stats" title="Attack (soft/hard) · Defence (soft/hard)">
                    <span>
                      ATK <b>{s.attack.soft.toFixed(0)}</b>/{s.attack.hard.toFixed(0)}
                    </span>
                    <span>
                      DEF <b>{s.defence.soft.toFixed(0)}</b>/{s.defence.hard.toFixed(0)}
                    </span>
                  </span>
                  <Progress value={u.strength} label={`${Math.round(u.strength * 100)}%`} color={strengthColor(u.strength)} />
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </section>
  );
}
