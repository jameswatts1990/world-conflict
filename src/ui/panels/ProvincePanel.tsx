import { BUILDINGS, BUILDING_ORDER } from '../../sim/config/buildings';
import { ECONOMY } from '../../sim/config/rules';
import { UNITS } from '../../sim/config/units';
import {
  RESOURCE_KEYS,
  UNIT_TYPES,
  armiesIn,
  armyPower,
  checkBuild,
  checkRecruit,
  constructionTicks,
  provinceOutput,
  recruitCost,
  recruitTicks,
  type ArmyId,
  type ConnectionKind,
  type OwnerId,
  type ProvinceId,
} from '../../sim';
import { ownerColor, strengthColor } from '../color';
import { OwnerFlag } from '../flags';
import type { GameController } from '../game/GameController';
import { fmtRate, formatDuration } from '../format';
import { BuildingIcon, Icon, RESOURCE_LABEL, ResourceIcon, UnitGlyph, type IconName } from '../icons';
import { TERRAIN_LABEL, TERRAIN_NOTE, armyName, composition, ownerLabel, ownerShortName, unitCount } from '../labels';
import { Cost, Progress, Section } from './Common';

const SIZE_LABEL = { capital: 'Capital', major: 'City', town: 'Town' } as const;

const ROUTE_KIND: Record<ConnectionKind, { label: string; icon: IconName }> = {
  land: { label: 'Land route', icon: 'road' },
  mountain: { label: 'Mountain pass', icon: 'mountains' },
  strait: { label: 'Sea crossing', icon: 'anchor' },
};

/** Who is fighting in a province, with each side's share of the firepower. */
function BattleBox({ ctrl, pid }: { ctrl: GameController; pid: ProvinceId }) {
  const { state, world } = ctrl;
  const battle = state.battles[pid];
  const armies = armiesIn(state, pid);
  const defender = state.provinces[pid].owner;
  const owners = [...new Set(armies.map((a) => a.owner))].sort((a, b) => Number(a === defender) - Number(b === defender));
  const sides = owners.map((owner: OwnerId) => {
    const mine = armies.filter((a) => a.owner === owner);
    return { owner, c: composition(mine), power: mine.reduce((s, a) => s + armyPower(state, a), 0) };
  });
  const total = sides.reduce((s, x) => s + x.power, 0) || 1;
  return (
    <div className="battle-box" data-testid="battle-box">
      <div className="battle-head">
        <Icon name="swords" size={15} />
        <span>Battle of {world.provinces[pid].city.name}</span>
        <span className="muted">{formatDuration(state.tick - battle.startedAt, state)}</span>
      </div>
      <div className="balance" title="Share of the firepower in this battle">
        {sides.map((s) => (
          <span key={s.owner} style={{ width: `${(s.power / total) * 100}%`, background: ownerColor(world, s.owner) }} />
        ))}
      </div>
      {sides.map((s) => (
        <div key={s.owner} className="battle-side">
          <OwnerFlag world={world} owner={s.owner} province={pid} size={13} />
          <span className="bs-name" title={ownerShortName(world, s.owner, pid)}>
            {ownerShortName(world, s.owner, pid)}
            <span className="bs-role muted"> · {s.owner === defender ? 'defending' : 'attacking'}</span>
          </span>
          <span className="bs-units">
            {unitCount(s.c)} units · {Math.round((s.power / total) * 100)}%
          </span>
          <span className="ar-str" title={`${Math.round(s.c.strength * 100)}% average strength`}>
            <span style={{ width: `${s.c.strength * 100}%`, background: strengthColor(s.c.strength) }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function ProvincePanel({
  ctrl,
  pid,
  selectedArmies,
  onSelectArmy,
  onClose,
}: {
  ctrl: GameController;
  pid: ProvinceId;
  selectedArmies: ArmyId[];
  onSelectArmy: (id: ArmyId, additive: boolean) => void;
  onClose: () => void;
}) {
  const { state, world, human } = ctrl;
  const def = world.provinces[pid];
  const ps = state.provinces[pid];
  const owner = ps.owner;
  const mine = owner === human;
  const color = ownerColor(world, owner);
  const out = provinceOutput(state, world, pid);
  const res = state.nations[human].resources;
  const armies = armiesIn(state, pid);
  const occupied = owner !== 'neutral' && def.core !== owner;
  const share = `${Math.round(ECONOMY.nonCoreOutput * 100)}%`;
  const job = ps.construction;

  return (
    <section className="panel province-panel" data-testid="province-panel" data-province={pid}>
      <header className={`panel-hero terrain-${def.terrain}`} style={{ '--owner': color } as React.CSSProperties}>
        <div className="hero-top">
          <OwnerFlag world={world} owner={owner} province={pid} size={16} />
          <span className="hero-owner">{ownerLabel(world, owner, pid)}</span>
          <button className="icon-btn close-btn" onClick={onClose} aria-label="Close province panel">
            <Icon name="close" size={16} />
          </button>
        </div>
        <h3>{def.name}</h3>
        <div className="chips">
          <span className="chip">
            <Icon name={def.terrain} size={13} /> {TERRAIN_LABEL[def.terrain]}
          </span>
          <span className="chip">
            <Icon name="city" size={13} /> {def.city.name} · {SIZE_LABEL[def.city.size]}
          </span>
          {def.objectiveVp ? <strong className="chip gold vp-badge">★ {def.objectiveVp} VP objective</strong> : null}
          {owner !== 'neutral' && (
            <span className={`chip ${ps.supplied ? 'ok' : 'bad'}`} title={ps.supplied ? 'Connected to a supply hub' : 'Cut off from supply hubs'}>
              <Icon name="supply" size={13} /> {ps.supplied ? 'Supplied' : 'Cut off'}
            </span>
          )}
          {def.oil && (
            <span className="chip" title="Oil field: refineries here produce extra fuel">
              <Icon name="oil" size={13} /> Oil field
            </span>
          )}
        </div>
        <div className="hero-note">{TERRAIN_NOTE[def.terrain]}</div>
        {occupied && (
          <div className="hero-note warn-note">
            {def.core ? `Occupied ${world.nations[def.core].adjective} core territory` : `Occupied ${def.neutral?.name ?? 'territory'}`}: produces {share}
          </div>
        )}
      </header>

      <div className="panel-body">
        {state.battles[pid] && <BattleBox ctrl={ctrl} pid={pid} />}

        {ps.capture && (
          <div className="capture-box">
            <span>
              <Icon name="target" size={14} /> {world.nations[ps.capture.by].name} capturing
              <span className="muted"> · {formatDuration(ps.capture.required - ps.capture.progress, state)} left</span>
            </span>
            <Progress value={ps.capture.progress / ps.capture.required} color={world.nations[ps.capture.by].color} />
          </div>
        )}

        {owner !== 'neutral' && (
          <Section title="Output per minute" icon="factory">
            <div className="output-grid">
              {RESOURCE_KEYS.map((k) => (
                <span key={k} className="output-tile" title={RESOURCE_LABEL[k]}>
                  <ResourceIcon kind={k} size={16} />
                  <span>{fmtRate(out[k])}</span>
                </span>
              ))}
            </div>
          </Section>
        )}

        {mine && (
          <Section title="Mobilise" icon="shield">
            <div className="recruit-row">
              {UNIT_TYPES.map((t) => {
                const check = checkRecruit(state, world, human, pid, t);
                const req = UNITS[t].requires;
                const hasBuilding = !!ps.buildings[req];
                const time = formatDuration(recruitTicks(state, human, t), state);
                return (
                  <button
                    key={t}
                    className={`unit-card${hasBuilding ? '' : ' locked'}`}
                    disabled={!check.ok}
                    onClick={() => ctrl.submit({ type: 'recruit', nation: human, province: pid, unitType: t })}
                    title={check.ok ? `${UNITS[t].description} Ready in ${time}.` : check.reason}
                    data-recruit={t}
                  >
                    <span className="unit-art">
                      <UnitGlyph type={t} size={46} />
                      {!hasBuilding && (
                        <span className="unit-lock">
                          <Icon name="lock" size={13} />
                        </span>
                      )}
                    </span>
                    <span className="unit-card-name">{UNITS[t].name}</span>
                    {hasBuilding ? <Cost cost={recruitCost(state, human, t)} have={res} /> : <span className="unit-req">Needs {BUILDINGS[req].name}</span>}
                    <span className="unit-card-time">
                      <Icon name="clock" size={11} /> {time}
                    </span>
                  </button>
                );
              })}
            </div>
            {ps.recruitQueue.length > 0 && (
              <ul className="queue">
                {ps.recruitQueue.map((j, i) => {
                  const started = j.remaining < j.total;
                  return (
                    <li key={i}>
                      <UnitGlyph type={j.unitType} size={20} />
                      <span>{UNITS[j.unitType].name}</span>
                      {i === 0 ? <Progress value={1 - j.remaining / j.total} label={formatDuration(j.remaining, state)} /> : <span className="muted">Queued</span>}
                      <button
                        className="icon-btn"
                        title={started ? `Cancel (${Math.round(ECONOMY.startedJobRefund * 100)}% refund)` : 'Cancel (full refund)'}
                        aria-label={`Cancel ${UNITS[j.unitType].name}`}
                        onClick={() => ctrl.submit({ type: 'cancelRecruit', nation: human, province: pid, index: i })}
                      >
                        <Icon name="close" size={13} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        )}

        <Section title="Buildings" icon="city">
          {job && (
            <div className="job">
              <span className="bld-icon active">
                <BuildingIcon kind={job.building} size={18} />
              </span>
              <div>
                <div className="job-name">
                  Building {BUILDINGS[job.building].name}
                  {BUILDINGS[job.building].maxLevel > 1 ? ` L${job.targetLevel}` : ''}
                </div>
                <Progress value={1 - job.remaining / job.total} label={formatDuration(job.remaining, state)} tone="gold" />
              </div>
              {mine && (
                <button
                  className="icon-btn"
                  title={job.remaining < job.total ? `Cancel construction (${Math.round(ECONOMY.startedJobRefund * 100)}% refund)` : 'Cancel construction (full refund)'}
                  aria-label="Cancel construction"
                  onClick={() => ctrl.submit({ type: 'cancelBuild', nation: human, province: pid })}
                  data-testid="cancel-build"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>
          )}
          <ul className="building-list">
            {BUILDING_ORDER.map((b) => {
              const cfg = BUILDINGS[b];
              const level = ps.buildings[b] ?? 0;
              if (!mine && level === 0) return null;
              const check = mine ? checkBuild(state, world, human, pid, b) : null;
              const nextLevel = level + 1;
              const maxed = level >= cfg.maxLevel;
              return (
                <li key={b} className={`bld${level > 0 ? ' built' : ''}`}>
                  <span className="bld-icon">
                    <BuildingIcon kind={b} size={18} />
                  </span>
                  <span className="bld-info" title={cfg.description}>
                    <span className="bld-name">{cfg.name}</span>
                    <span className="bld-level">
                      {cfg.maxLevel > 1 ? (
                        Array.from({ length: cfg.maxLevel }, (_, i) => <span key={i} className={`pip${i < level ? ' on' : ''}`} />)
                      ) : level ? (
                        <span className="built-tag">Built</span>
                      ) : (
                        <span className="muted">Not built</span>
                      )}
                    </span>
                  </span>
                  {mine && !maxed ? (
                    <span className="b-action">
                      <Cost cost={cfg.cost(nextLevel)} have={res} />
                      <button
                        className="build-btn"
                        disabled={!check?.ok}
                        title={check?.ok ? `${cfg.description} Takes ${formatDuration(constructionTicks(state, human, b, nextLevel), state)}.` : check?.reason}
                        onClick={() => ctrl.submit({ type: 'build', nation: human, province: pid, building: b })}
                        data-build={b}
                      >
                        {level ? 'Upgrade' : 'Build'}
                      </button>
                    </span>
                  ) : maxed ? (
                    <span className="bld-done" title="Fully built">
                      <Icon name="check" size={16} />
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {!mine && !job && !BUILDING_ORDER.some((b) => ps.buildings[b]) && <div className="muted empty">No buildings</div>}
        </Section>

        <Section title="Forces present" icon="swords" extra={armies.length ? armies.length : undefined}>
          {armies.length === 0 && <div className="muted empty">No armies in this province</div>}
          <ul className="army-list">
            {armies.map((a) => {
              const c = composition(a);
              return (
                <li key={a.id}>
                  <button
                    className={`army-row${selectedArmies.includes(a.id) ? ' selected' : ''}${a.owner === human ? ' own' : ''}`}
                    onClick={(e) => onSelectArmy(a.id, e.shiftKey)}
                    data-army-row={a.id}
                  >
                    <OwnerFlag world={world} owner={a.owner} province={a.province} size={13} />
                    <span className="ar-name">{armyName(world, a)}</span>
                    <span className="ar-comp">
                      {UNIT_TYPES.filter((t) => c[t] > 0).map((t) => (
                        <span key={t}>
                          <UnitGlyph type={t} size={16} />
                          {c[t]}
                        </span>
                      ))}
                    </span>
                    <span className="ar-str" title={`${Math.round(c.strength * 100)}% strength`}>
                      <span style={{ width: `${c.strength * 100}%`, background: strengthColor(c.strength) }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Routes" icon="road">
          <ul className="conn-list">
            {world.neighbors[pid].map((n) => {
              const kind = ROUTE_KIND[n.kind];
              return (
                <li key={n.id} title={`${kind.label}${n.label ? `: ${n.label}` : ''}`}>
                  <Icon name={kind.icon} size={13} />
                  <span className="conn-name">{world.provinces[n.id].name}</span>
                  <span className="muted">
                    {n.label ?? kind.label.toLowerCase()} · {n.distanceKm} km
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </section>
  );
}
