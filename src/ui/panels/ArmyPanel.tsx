import { useState } from 'react';
import { MORALE, SUPPLY } from '../../sim/config/rules';
import { UNITS } from '../../sim/config/units';
import {
  armyMorale,
  armyName,
  armySpeedKmPerTick,
  currentModel,
  formationName,
  hostileArmiesIn,
  marchTicksLeft,
  provinceName,
  rankName,
  scaledTicks,
  standTogether,
  unitGen,
  unitStats,
  veterancyRank,
  type ArmyId,
  type MoveMode,
} from '../../sim';
import { UnitIconArt } from '../art/adapters';
import { ownerColor, strengthColor } from '../color';
import { OwnerFlag } from '../flags';
import type { GameController } from '../game/GameController';
import { countOf, formatDuration } from '../format';
import { Icon, type IconName } from '../icons';
import { ORDER, composition, ownerShortName } from '../labels';
import { MoraleMeter, Progress, Section, moraleClass } from './Common';

/** Rank chevrons: none for Green, one to three for Regular to Elite. */
export function RankChevrons({ xp }: { xp: number }) {
  const rank = veterancyRank(xp);
  return (
    <span className={`vet-rank vet-${rank}`} title={`${rankName(xp)} (${xp.toFixed(1)} XP)`}>
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
  onClose,
}: {
  ctrl: GameController;
  armyIds: ArmyId[];
  /** The march order whose destination is being picked, if any. */
  moveMode: MoveMode | null;
  onMoveMode: (mode: MoveMode | null) => void;
  onSelectArmies: (ids: ArmyId[]) => void;
  onClose: () => void;
}) {
  const { state, world, human } = ctrl;
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmDisband, setConfirmDisband] = useState(false);
  const army = state.armies[armyIds[0]];
  if (!army) return null;
  const own = army.owner === human;
  const color = ownerColor(world, army.owner);
  const title = armyName(world, army);
  const leg = army.move?.leg;
  const dest = army.move ? army.move.path[army.move.path.length - 1] : null;
  const hostiles = hostileArmiesIn(state, army.province, army.owner);
  const p = state.provinces[army.province];
  const c = composition(army);
  const morale = armyMorale(army);

  let status: string;
  let statusIcon: IconName;
  // On a road it stands out of town, still in the province whose part of the road it is.
  const here = army.road && !leg ? `${provinceName(world, army.province)}, on the road to ${world.provinces[army.road.toward].city.name}` : provinceName(world, army.province);
  if (army.holding && !leg) {
    status = hostiles.length > 0 ? `Holding ${here} under attack` : `Holding position in ${here}`;
    statusIcon = 'lock';
  } else if (army.move?.patrol) {
    const [a, b] = army.move.patrol;
    status = `Patrolling between ${provinceName(world, a)} and ${provinceName(world, b)}`;
    statusIcon = 'patrol';
  } else if (leg) {
    status = `${army.move?.mode === 'attack' ? 'Advancing' : 'Marching'} to ${provinceName(world, leg.to)}`;
    statusIcon = army.move?.mode === 'attack' ? 'swords' : 'move';
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

  const eta = army.move && dest ? marchTicksLeft(state, world, army) : null;
  const halt = army.move?.halt;
  const destName = halt
    ? `${world.provinces[halt.province].city.name}–${world.provinces[halt.toward].city.name} road`
    : dest
      ? world.provinces[dest].name
      : '';

  const selectedOwn = armyIds.map((id) => state.armies[id]).filter((a) => a && a.owner === human);
  const setRetreat = (on: boolean) => {
    for (const a of selectedOwn) ctrl.submit({ type: 'setAutoRetreat', nation: human, armyId: a.id, autoRetreat: on });
  };
  const holdAll = (hold: boolean) => {
    for (const a of selectedOwn) ctrl.submit({ type: 'hold', nation: human, armyId: a.id, hold });
  };

  // Armies of yours standing with this one: in its city, or at its spot on a road.
  const sameProvinceOwn = Object.values(state.armies).filter((a) => a.owner === human && standTogether(a, army));
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
      <header className="panel-hero army-hero" style={{ '--owner': color } as React.CSSProperties}>
        <div className="hero-top">
          <OwnerFlag world={world} owner={army.owner} province={army.province} size={16} />
          <span className="hero-owner">
            {ownerShortName(world, army.owner, army.province)} · {countOf(army.units.length, 'formation')}
          </span>
          <button className="icon-btn close-btn" onClick={onClose} aria-label="Close army panel">
            <Icon name="close" size={16} />
          </button>
        </div>
        <h3>{title}</h3>
        <div className={`army-status${hostiles.length && !leg ? ' battle' : ''}`}>
          <Icon name={statusIcon} size={14} /> {status}
        </div>
        <div className="army-summary">
          {c.types.slice(0, 4).map(([t, n]) => (
            <span key={t} className="as-unit" title={currentModel(state, world, army.owner, t).name}>
              <span className="unit-plate">
                <UnitIconArt world={world} type={t} gen={unitGen(state, army.owner, t)} nation={army.owner} width={30} />
              </span>
              <span>{n}</span>
            </span>
          ))}
          {c.types.length > 4 && <span className="as-more muted">+{c.types.length - 4}</span>}
          <span className="as-str" title="Average strength">
            <span className="as-str-val" style={{ color: strengthColor(c.strength) }}>
              {Math.round(c.strength * 100)}%
            </span>
            <span className="tb-sub">strength</span>
          </span>
          <span className={`as-str as-morale ${moraleClass(morale * 100)}`} title="Low morale blunts firepower; armies never break and fight on until ordered out">
            <span className="as-str-val">{Math.round(morale * 100)}</span>
            <span className="tb-sub">morale</span>
          </span>
        </div>
      </header>

      <div className="panel-body">
        <div className="army-meters">
          <div className="meter-row">
            <span className="meter-label">Strength</span>
            <Progress value={c.strength} label={`${Math.round(c.strength * 100)}%`} color={strengthColor(c.strength)} />
          </div>
          <div className="meter-row">
            <span className="meter-label" title="Low morale blunts firepower; armies never break and fight on until ordered out">
              Morale
            </span>
            <MoraleMeter value={morale * 100} />
          </div>
        </div>

        {army.move && dest && (
          <div className="march-box">
            {leg && <Progress value={leg.elapsed / leg.duration} label={`→ ${world.provinces[leg.to].city.name}`} tone="blue" />}
            <div className="march-meta">
              <span>
                <Icon name="target" size={13} /> {destName}
              </span>
              {eta !== null && (
                <span>
                  <Icon name="clock" size={13} /> ETA {formatDuration(eta, state)}
                </span>
              )}
            </div>
            {!leg && <div className="muted">{army.move.mode === 'move' ? 'Halted to fight' : 'Halted to fight or capture'}, then marching on</div>}
          </div>
        )}

        {own && hostiles.length > 0 && !leg && (
          <div className="warn">
            <Icon name="warning" size={15} />
            <span>
              In battle: it fights to the death unless you order it out. Retreating under fire costs every unit{' '}
              {Math.round(MORALE.retreatLoss * 100)} strength points{army.units.some((u) => UNITS[u.type].recon) ? ' (halved: recon screens the withdrawal)' : ''}, and
              units too weak to get away are lost.
            </span>
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
        {army.arrivedVia === 'strait' && p.owner !== army.owner && (
          <div className="warn">
            <Icon name="anchor" size={15} />
            <span>Landed from the sea: fighting at a disadvantage until the beachhead is won.</span>
          </div>
        )}

        {own && (
          <div className="orders">
            {(['move', 'attack', 'patrol'] as const).map((mode) => (
              <button
                key={mode}
                className={`order-btn${moveMode === mode ? ' active' : ''}`}
                onClick={() => onMoveMode(moveMode === mode ? null : mode)}
                title={`${ORDER[mode].title}. Then click a destination — ${ORDER[mode].key}`}
                data-testid={mode === 'move' ? 'move-mode' : `${mode}-mode`}
              >
                <Icon name={mode === 'move' ? 'move' : mode === 'attack' ? 'swords' : 'patrol'} size={18} />
                <span>{moveMode === mode ? 'Pick target' : ORDER[mode].label}</span>
              </button>
            ))}
            <button
              className={`order-btn${army.holding ? ' active' : ''}`}
              onClick={() => holdAll(!army.holding)}
              title={army.holding ? 'Release the hold (G)' : 'Hold position: halt after the current leg and stay, never withdrawing on its own, until given a new order (G)'}
              data-testid="hold"
            >
              <Icon name="lock" size={18} />
              <span>{army.holding ? 'Holding' : 'Hold'}</span>
            </button>
            <button className="order-btn" disabled={!army.move} onClick={() => ctrl.submit({ type: 'stop', nation: human, armyId: army.id })} title="Stop after the current leg (S)">
              <Icon name="stop" size={18} />
              <span>Stop</span>
            </button>
            <button className="order-btn" disabled={checked.size === 0 || checked.size === army.units.length || !!leg} onClick={split} title="Split ticked formations into a new army">
              <Icon name="split" size={18} />
              <span>Split</span>
            </button>
            <button
              className="order-btn"
              disabled={sameProvinceOwn.length < 2 || !!leg}
              onClick={() => {
                // The senior (lowest-numbered) army absorbs the others and keeps its name.
                const ids = [...sameProvinceOwn].sort((a, b) => a.serial - b.serial).map((a) => a.id);
                if (ctrl.submit({ type: 'merge', nation: human, armyIds: ids }).ok) onSelectArmies([ids[0]]);
              }}
              title={army.road ? 'Merge all your armies at this spot on the road into the senior one' : 'Merge all your armies in this city into the senior one'}
            >
              <Icon name="merge" size={18} />
              <span>Merge here</span>
            </button>
            <button
              className={`order-btn danger${confirmDisband ? ' active' : ''}`}
              disabled={!!leg}
              onClick={disband}
              title={checked.size > 0 ? 'Disband the ticked formations (half their manpower returns)' : 'Disband the whole army (half its manpower returns)'}
              data-testid="disband"
            >
              <Icon name="exit" size={18} />
              <span>{confirmDisband ? 'Confirm' : checked.size > 0 ? `Disband ${checked.size}` : 'Disband'}</span>
            </button>
          </div>
        )}
        {own && (
          <label
            className="army-option"
            title={`When its morale falls below ${Math.round(MORALE.autoRetreatAt * 100)}% in battle, the army withdraws to a friendly neighbouring province on its own, paying the usual price of a withdrawal. Otherwise it fights on until destroyed or ordered out.`}
          >
            <input type="checkbox" checked={army.autoRetreat} onChange={(e) => setRetreat(e.target.checked)} data-testid="auto-retreat" />
            <span>Fall back when broken</span>
            <span className="muted">{!army.autoRetreat ? 'fights to the end' : army.holding ? 'not while holding' : `withdraws below ${Math.round(MORALE.autoRetreatAt * 100)}% morale`}</span>
          </label>
        )}
        {own && armyIds.length > 1 && <div className="muted multi-note">{armyIds.length} armies selected — orders and options apply to all.</div>}

        <Section
          title={`Formations (${army.units.length})`}
          icon="shield"
          extra={
            <span className="muted" title="On open ground; the slowest unit sets the pace">
              {(armySpeedKmPerTick(state, army) * 60 * state.settings.durationScale).toFixed(0)} km/min
            </span>
          }
        >
          <ul className="unit-list formation-list">
            {army.units.map((u) => {
              const s = unitStats(state, army.owner, u.type);
              const model = currentModel(state, world, army.owner, u.type);
              const name = formationName(world, army.owner, u);
              return (
                <li key={u.id} className={checked.has(u.id) ? 'checked' : ''}>
                  {own ? (
                    <input
                      type="checkbox"
                      checked={checked.has(u.id)}
                      onChange={(e) => {
                        const next = new Set(checked);
                        if (e.target.checked) next.add(u.id);
                        else next.delete(u.id);
                        setChecked(next);
                      }}
                      aria-label={`select ${name}`}
                    />
                  ) : (
                    <span />
                  )}
                  <span className="unit-icon unit-plate">
                    <UnitIconArt world={world} type={u.type} gen={unitGen(state, army.owner, u.type)} nation={army.owner} width={32} />
                  </span>
                  <span className="unit-text">
                    <span className="unit-name" title={`${UNITS[u.type].name}: ${UNITS[u.type].description}`}>
                      {name} <RankChevrons xp={u.xp} />
                    </span>
                    <span className="unit-model">
                      {model.name} · {model.detail}
                    </span>
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
                  <div className={`mini-morale ${moraleClass(u.morale * 100)}`} title={`Morale ${Math.round(u.morale * 100)}%`}>
                    <div style={{ width: `${u.morale * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </section>
  );
}
