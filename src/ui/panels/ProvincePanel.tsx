import { BUILDINGS, BUILDING_ORDER } from '../../sim/config/buildings';
import { UNITS } from '../../sim/config/units';
import {
  RESOURCE_KEYS,
  UNIT_TYPES,
  armiesIn,
  checkBuild,
  checkRecruit,
  constructionTicks,
  provinceOutput,
  recruitCost,
  recruitTicks,
  type Army,
  type ArmyId,
  type ProvinceId,
  type Terrain,
} from '../../sim';
import { ownerColor, strengthColor } from '../color';
import { OwnerFlag } from '../flags';
import type { GameController } from '../game/GameController';
import { fmtRate, formatDuration } from '../format';
import { BuildingIcon, Icon, RESOURCE_LABEL, ResourceIcon, UnitGlyph } from '../icons';
import { Cost, Progress, Section } from './Common';

export const TERRAIN_LABEL: Record<Terrain, string> = {
  plains: 'Plains',
  forest: 'Forest',
  hills: 'Hills',
  mountains: 'Mountains',
  urban: 'Urban',
  marsh: 'Marsh',
};

const TERRAIN_NOTE: Record<Terrain, string> = {
  plains: 'Open ground: tanks excel.',
  forest: 'Forest: defenders +, tanks −.',
  hills: 'Hills: infantry defends well, artillery +.',
  mountains: 'Mountains: strong defence, slow, tanks crippled.',
  urban: 'Urban: infantry defends very well, tanks −.',
  marsh: 'Marsh: slow going, tanks crippled.',
};

const SIZE_LABEL = { capital: 'Capital', major: 'City', town: 'Town' } as const;

/** Unit counts by type, for compact army summaries. */
export function composition(army: Army): { infantry: number; artillery: number; tank: number; strength: number } {
  const c = { infantry: 0, artillery: 0, tank: 0, strength: 0 };
  for (const u of army.units) {
    c[u.type]++;
    c.strength += u.strength;
  }
  c.strength = army.units.length ? c.strength / army.units.length : 0;
  return c;
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
  const ownerName = owner === 'neutral' ? `${def.neutralState} · neutral` : world.nations[owner].name;
  const color = ownerColor(world, owner);
  const out = provinceOutput(state, world, pid);
  const res = state.nations[human].resources;
  const armies = armiesIn(state, pid);
  const occupied = def.core && def.core !== owner;

  return (
    <section className="panel province-panel" data-testid="province-panel" data-province={pid}>
      <header className={`panel-hero terrain-${def.terrain}`} style={{ '--owner': color } as React.CSSProperties}>
        <div className="hero-top">
          <OwnerFlag world={world} owner={owner} province={pid} size={16} />
          <span className="hero-owner">{ownerName}</span>
          <button className="icon-btn close-btn" onClick={onClose} aria-label="Close province panel">
            <Icon name="close" size={16} />
          </button>
        </div>
        <h3>{def.name}</h3>
        <div className="chips">
          <span className="chip" title={TERRAIN_NOTE[def.terrain]}>
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
            <span className="chip" title="Oil field: refineries produce extra fuel">
              <Icon name="oil" size={13} /> Oil field
            </span>
          )}
        </div>
        {occupied && <div className="hero-note">Occupied {world.nations[def.core!].adjective} core territory — output reduced</div>}
      </header>

      <div className="panel-body">
        <p className="terrain-note">
          <Icon name={def.terrain} size={14} /> {TERRAIN_NOTE[def.terrain]}
        </p>

        {ps.capture && (
          <div className="capture-box">
            <span>
              <Icon name="target" size={14} /> {world.nations[ps.capture.by].name} capturing…
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
                  <span className={out[k] < 0 ? 'bad' : ''}>{fmtRate(out[k])}</span>
                </span>
              ))}
            </div>
          </Section>
        )}

        <Section title="Buildings" icon="city">
          {ps.construction && (
            <div className="job">
              <span className="bld-icon active">
                <BuildingIcon kind={ps.construction.building} size={18} />
              </span>
              <div>
                <div className="job-name">
                  Building {BUILDINGS[ps.construction.building].name}
                  {BUILDINGS[ps.construction.building].maxLevel > 1 ? ` L${ps.construction.targetLevel}` : ''}
                </div>
                <Progress value={1 - ps.construction.remaining / ps.construction.total} label={formatDuration(ps.construction.remaining, state)} tone="gold" />
              </div>
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
        </Section>

        {mine && (
          <Section title="Mobilise" icon="shield">
            <div className="recruit-row">
              {UNIT_TYPES.map((t) => {
                const check = checkRecruit(state, world, human, pid, t);
                return (
                  <button
                    key={t}
                    className="unit-card"
                    disabled={!check.ok}
                    onClick={() => ctrl.submit({ type: 'recruit', nation: human, province: pid, unitType: t })}
                    title={check.ok ? `${UNITS[t].description} Takes ${formatDuration(recruitTicks(state, human, t), state)}.` : check.reason}
                    data-recruit={t}
                  >
                    <span className="unit-art">
                      <UnitGlyph type={t} size={46} />
                      {!check.ok && (
                        <span className="unit-lock">
                          <Icon name="lock" size={13} />
                        </span>
                      )}
                    </span>
                    <span className="unit-card-name">{UNITS[t].name}</span>
                    <Cost cost={recruitCost(state, human, t)} have={res} />
                    <span className="unit-card-time">
                      <Icon name="clock" size={11} /> {formatDuration(recruitTicks(state, human, t), state)}
                    </span>
                  </button>
                );
              })}
            </div>
            {ps.recruitQueue.length > 0 && (
              <ul className="queue">
                {ps.recruitQueue.map((j, i) => (
                  <li key={i}>
                    <UnitGlyph type={j.unitType} size={20} />
                    <span>{UNITS[j.unitType].name}</span>
                    {i === 0 ? <Progress value={1 - j.remaining / j.total} label={formatDuration(j.remaining, state)} /> : <span className="muted">Queued</span>}
                    <button
                      className="icon-btn"
                      title={i === 0 ? 'Cancel (50% refund)' : 'Cancel (full refund)'}
                      onClick={() => ctrl.submit({ type: 'cancelRecruit', nation: human, province: pid, index: i })}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section title="Forces present" icon="swords" extra={armies.length ? armies.length : undefined}>
          {armies.length === 0 && <div className="muted empty">No armies in this province</div>}
          <ul className="army-list">
            {armies.map((a) => {
              const name = a.owner === 'neutral' ? `${def.neutralState ?? 'Neutral'} garrison` : `${world.nations[a.owner].adjective} army`;
              const c = composition(a);
              return (
                <li key={a.id}>
                  <button
                    className={`army-row${selectedArmies.includes(a.id) ? ' selected' : ''}${a.owner === human ? ' own' : ''}`}
                    onClick={(e) => onSelectArmy(a.id, e.shiftKey)}
                    data-army-row={a.id}
                  >
                    <OwnerFlag world={world} owner={a.owner} province={a.province} size={13} />
                    <span className="ar-name">{name}</span>
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
            {world.neighbors[pid].map((n) => (
              <li key={n.id}>
                <Icon name={n.kind === 'strait' ? 'anchor' : n.kind === 'mountain' ? 'mountains' : 'road'} size={13} />
                <span className="conn-name">{world.provinces[n.id].name}</span>
                <span className="muted">
                  {n.kind === 'strait' ? `sea crossing${n.label ? ` · ${n.label}` : ''}` : n.kind === 'mountain' ? `mountain pass${n.label ? ` · ${n.label}` : ''}` : 'land'} ·{' '}
                  {n.distanceKm} km
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </section>
  );
}
