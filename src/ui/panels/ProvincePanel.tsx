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
  type ArmyId,
  type ProvinceId,
} from '../../sim';
import { NEUTRAL_COLOR } from '../../sim/scenario/europe/nations';
import type { GameController } from '../game/GameController';
import { fmtRate, formatDuration } from '../format';
import { BuildingIcon, RESOURCE_LABEL, ResourceIcon, UnitGlyph } from '../icons';
import { Cost, Progress } from './Common';

const TERRAIN_NOTE: Record<string, string> = {
  plains: 'Open ground: tanks excel.',
  forest: 'Forest: defenders +, tanks −.',
  hills: 'Hills: infantry defends well, artillery +.',
  mountains: 'Mountains: strong defence, slow, tanks crippled.',
  urban: 'Urban: infantry defends very well, tanks −.',
  marsh: 'Marsh: slow going, tanks crippled.',
};

export function ProvincePanel({
  ctrl,
  pid,
  selectedArmies,
  onSelectArmy,
}: {
  ctrl: GameController;
  pid: ProvinceId;
  selectedArmies: ArmyId[];
  onSelectArmy: (id: ArmyId, additive: boolean) => void;
}) {
  const { state, world, human } = ctrl;
  const def = world.provinces[pid];
  const ps = state.provinces[pid];
  const owner = ps.owner;
  const mine = owner === human;
  const ownerName = owner === 'neutral' ? `${def.neutralState} (neutral)` : world.nations[owner].name;
  const color = owner === 'neutral' ? NEUTRAL_COLOR : world.nations[owner].color;
  const out = provinceOutput(state, world, pid);
  const res = state.nations[human].resources;
  const armies = armiesIn(state, pid);

  return (
    <section className="panel province-panel" data-testid="province-panel" data-province={pid}>
      <header className="panel-header" style={{ borderLeftColor: color }}>
        <h3>{def.name}</h3>
        <div className="panel-sub">
          {ownerName}
          {def.core && def.core !== owner ? ` · occupied ${world.nations[def.core].adjective} core` : ''}
        </div>
      </header>

      <div className="kv">
        <span>City</span>
        <span>
          {def.city.name} ({def.city.size})
          {def.objectiveVp ? <strong className="vp-badge">★ {def.objectiveVp} VP objective</strong> : null}
        </span>
        <span>Terrain</span>
        <span title={TERRAIN_NOTE[def.terrain]}>
          {def.terrain} — <em>{TERRAIN_NOTE[def.terrain]}</em>
        </span>
        {owner !== 'neutral' && (
          <>
            <span>Supply</span>
            <span className={ps.supplied ? 'ok' : 'bad'}>{ps.supplied ? 'Connected to a supply hub' : 'Cut off from supply hubs'}</span>
          </>
        )}
        {def.oil && (
          <>
            <span>Oil</span>
            <span>Oil field (refineries produce extra fuel)</span>
          </>
        )}
      </div>

      {ps.capture && (
        <div className="capture-box">
          <span>{world.nations[ps.capture.by].name} capturing…</span>
          <Progress value={ps.capture.progress / ps.capture.required} />
        </div>
      )}

      {owner !== 'neutral' && (
        <div className="section">
          <h4>Output per minute{def.core !== owner ? ' (occupied: reduced)' : ''}</h4>
          <div className="output-row">
            {RESOURCE_KEYS.map((k) => (
              <span key={k} title={RESOURCE_LABEL[k]}>
                <ResourceIcon kind={k} size={14} /> {fmtRate(out[k])}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <h4>Buildings</h4>
        {ps.construction && (
          <div className="job">
            <BuildingIcon kind={ps.construction.building} />
            <span>
              Building {BUILDINGS[ps.construction.building].name}
              {BUILDINGS[ps.construction.building].maxLevel > 1 ? ` L${ps.construction.targetLevel}` : ''}
            </span>
            <Progress value={1 - ps.construction.remaining / ps.construction.total} label={formatDuration(ps.construction.remaining, state)} />
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
              <li key={b} className={level > 0 ? 'built' : ''}>
                <span className="b-name" title={cfg.description}>
                  <BuildingIcon kind={b} /> {cfg.name}
                  {cfg.maxLevel > 1 ? <span className="lvl"> {level}/{cfg.maxLevel}</span> : level ? <span className="lvl"> ✓</span> : null}
                </span>
                {mine && !maxed && (
                  <span className="b-action">
                    <Cost cost={cfg.cost(nextLevel)} have={res} />
                    <button
                      disabled={!check?.ok}
                      title={check?.ok ? `${cfg.description} Takes ${formatDuration(constructionTicks(state, human, b, nextLevel), state)}.` : check?.reason}
                      onClick={() => ctrl.submit({ type: 'build', nation: human, province: pid, building: b })}
                      data-build={b}
                    >
                      {level ? 'Upgrade' : 'Build'}
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {mine && (
        <div className="section">
          <h4>Recruit</h4>
          <div className="recruit-row">
            {UNIT_TYPES.map((t) => {
              const check = checkRecruit(state, world, human, pid, t);
              return (
                <button
                  key={t}
                  className="recruit-btn"
                  disabled={!check.ok}
                  onClick={() => ctrl.submit({ type: 'recruit', nation: human, province: pid, unitType: t })}
                  title={check.ok ? `${UNITS[t].description} Takes ${formatDuration(recruitTicks(state, human, t), state)}.` : check.reason}
                  data-recruit={t}
                >
                  <UnitGlyph type={t} />
                  <span>{UNITS[t].name}</span>
                  <Cost cost={recruitCost(state, human, t)} have={res} />
                </button>
              );
            })}
          </div>
          {ps.recruitQueue.length > 0 && (
            <ul className="queue">
              {ps.recruitQueue.map((j, i) => (
                <li key={i}>
                  <UnitGlyph type={j.unitType} size={14} />
                  <span>{UNITS[j.unitType].name}</span>
                  {i === 0 ? <Progress value={1 - j.remaining / j.total} label={formatDuration(j.remaining, state)} /> : <span className="muted">queued</span>}
                  <button
                    className="icon-btn"
                    title={i === 0 ? 'Cancel (50% refund)' : 'Cancel (full refund)'}
                    onClick={() => ctrl.submit({ type: 'cancelRecruit', nation: human, province: pid, index: i })}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="section">
        <h4>Armies here</h4>
        {armies.length === 0 && <div className="muted">None</div>}
        <ul className="army-list">
          {armies.map((a) => {
            const name = a.owner === 'neutral' ? 'Neutral garrison' : `${world.nations[a.owner].adjective} army`;
            return (
              <li key={a.id}>
                <button
                  className={`army-row${selectedArmies.includes(a.id) ? ' selected' : ''}`}
                  onClick={(e) => onSelectArmy(a.id, e.shiftKey)}
                  data-army-row={a.id}
                >
                  <span className="swatch" style={{ background: a.owner === 'neutral' ? NEUTRAL_COLOR : world.nations[a.owner].color }} />
                  {name} · {a.units.length} units
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="section">
        <h4>Connections</h4>
        <ul className="conn-list">
          {world.neighbors[pid].map((n) => (
            <li key={n.id}>
              {world.provinces[n.id].name} <span className="muted">· {n.kind === 'strait' ? `sea crossing${n.label ? ` (${n.label})` : ''}` : n.kind === 'mountain' ? `mountain pass${n.label ? ` (${n.label})` : ''}` : 'land'} · {n.distanceKm} km</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
