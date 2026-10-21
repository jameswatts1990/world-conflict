// The city view: skyline, morale, growth, building slots and the build
// picker; unit cards for recruitment; armies present and connections.
import { useState } from 'react';
import { BUILDINGS, BUILDING_ORDER, CITY } from '../../sim/config/buildings';
import { BUILDING_UNLOCKED_BY, TECH_BY_ID, UNIT_UNLOCKED_BY } from '../../sim/config/research';
import { UNITS, UNITS_BY_CLASS } from '../../sim/config/units';
import {
  RESOURCE_KEYS,
  armiesIn,
  armyMorale,
  armyName,
  buildingSlots,
  checkBuild,
  checkBuildRules,
  checkRecruit,
  cityGrowthPerMinute,
  cityPopulation,
  constructionCost,
  constructionTicks,
  currentModel,
  isUnitUnlocked,
  provinceMoraleTarget,
  provinceOutput,
  recruitCost,
  recruitTicks,
  unitGen,
  unitStats,
  type ArmyId,
  type BuildingCategory,
  type BuildingType,
  type ProvinceId,
  type Resources,
  type UnitClass,
  type UnitType,
} from '../../sim';
import { slotsUsed } from '../../sim/config/buildings';
import { NEUTRAL_COLOR } from '../../sim/scenario/europe/nations';
import { BuildingGlyphArt, BuildingTileArt, CityScene, UnitPicture } from '../art/adapters';
import type { GameController } from '../game/GameController';
import { fmtPopulation, fmtRate, formatDuration } from '../format';
import { RESOURCE_LABEL, ResourceIcon } from '../icons';
import { Cost, MoraleMeter, Progress } from './Common';

const TERRAIN_NOTE: Record<string, string> = {
  plains: 'Open ground: tanks and cavalry excel.',
  forest: 'Forest: defenders and anti-tank guns +, armour −.',
  hills: 'Hills: infantry defends well, artillery +.',
  mountains: 'Mountains: strong defence, slow; mountain troops shine, tanks crippled.',
  urban: 'Urban: infantry and assault troops strong, tanks −.',
  marsh: 'Marsh: slow going, vehicles bog down.',
};

const CATEGORY_LABEL: Record<BuildingCategory, string> = {
  economy: 'Economy',
  military: 'Military',
  civic: 'Civic',
  infrastructure: 'Infrastructure (no slot)',
};

const CLASS_LABEL: Record<UnitClass, string> = { infantry: 'Infantry', mobile: 'Mobile', support: 'Support', armour: 'Armour' };

type Tab = 'city' | 'recruit' | 'armies';

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
  const [tab, setTab] = useState<Tab>('city');
  const def = world.provinces[pid];
  const ps = state.provinces[pid];
  const owner = ps.owner;
  const mine = owner === human;
  const ownerName = owner === 'neutral' ? `${def.neutralState} (neutral)` : world.nations[owner].name;
  const color = owner === 'neutral' ? NEUTRAL_COLOR : world.nations[owner].color;
  const armies = armiesIn(state, pid);
  const capital = owner !== 'neutral' && world.nations[owner]?.capital === pid;
  const nationalCapital = def.city.size === 'capital' && def.core !== null;
  const activeTab: Tab = !mine && tab === 'recruit' ? 'city' : tab;

  return (
    <section className="panel province-panel" data-testid="province-panel" data-province={pid}>
      <header className="panel-header" style={{ borderLeftColor: color }}>
        <h3>
          {nationalCapital ? '★ ' : ''}
          {def.city.name}
          <span className="tier-badge">{CITY.tierNames[ps.tier]}</span>
        </h3>
        <div className="panel-sub">
          {def.name} · {ownerName}
          {def.core && def.core !== owner ? ` · occupied ${world.nations[def.core].adjective} core` : ''}
        </div>
      </header>

      <div className="city-scene-wrap">
        <CityScene
          seed={pid}
          tier={ps.tier}
          capital={capital || nationalCapital}
          buildings={ps.buildings}
          construction={ps.construction?.building ?? null}
          terrain={def.terrain}
          coastal={def.coastal}
          nationColor={owner === 'neutral' ? undefined : color}
          battle={!!state.battles[pid]}
          width={354}
        />
        <div className="city-scene-caption">
          <span title="Urban population">👥 {fmtPopulation(cityPopulation(state, world, pid))}</span>
          {def.objectiveVp ? <span className="vp-badge">★ {def.objectiveVp} VP</span> : null}
          {def.oil ? <span title="Oil field: refineries produce extra fuel">🛢 oil</span> : null}
          {world.seaLandings.has(pid) ? <span title="A sea crossing lands here">⚓ landing</span> : null}
        </div>
      </div>

      {ps.capture && (
        <div className="capture-box">
          <span>{world.nations[ps.capture.by].name} capturing…</span>
          <Progress value={ps.capture.progress / ps.capture.required} />
        </div>
      )}

      <nav className="tabs" role="tablist">
        <button className={activeTab === 'city' ? 'active' : ''} onClick={() => setTab('city')} data-tab="city">
          City
        </button>
        {mine && (
          <button className={activeTab === 'recruit' ? 'active' : ''} onClick={() => setTab('recruit')} data-tab="recruit">
            Recruit{ps.recruitQueue.length ? ` (${ps.recruitQueue.length})` : ''}
          </button>
        )}
        <button className={activeTab === 'armies' ? 'active' : ''} onClick={() => setTab('armies')} data-tab="armies">
          Armies{armies.length ? ` (${armies.length})` : ''}
        </button>
      </nav>

      {activeTab === 'city' && <CityTab ctrl={ctrl} pid={pid} />}
      {activeTab === 'recruit' && <RecruitTab ctrl={ctrl} pid={pid} />}
      {activeTab === 'armies' && <ArmiesTab ctrl={ctrl} pid={pid} selectedArmies={selectedArmies} onSelectArmy={onSelectArmy} />}
    </section>
  );
}

function CityTab({ ctrl, pid }: { ctrl: GameController; pid: ProvinceId }) {
  const { state, world, human } = ctrl;
  const def = world.provinces[pid];
  const ps = state.provinces[pid];
  const owner = ps.owner;
  const mine = owner === human;
  const out = provinceOutput(state, world, pid);
  const res = state.nations[human].resources;

  if (owner === 'neutral') {
    return (
      <div className="section">
        <div className="kv">
          <span>Terrain</span>
          <span>
            {def.terrain} — <em>{TERRAIN_NOTE[def.terrain]}</em>
          </span>
        </div>
        <p className="muted">A neutral state. Invading it means fighting its garrison; capturing it brings its city, buildings and any objective.</p>
        <BuildingSummary buildings={ps.buildings} />
      </div>
    );
  }

  const morale = provinceMoraleTarget(state, world, pid);
  const growth = cityGrowthPerMinute(state, pid, !!state.battles[pid]);
  const next = CITY.growthToNext[ps.tier];
  const slots = buildingSlots(state, pid);
  const used = slotsUsed(ps.buildings, ps.construction?.building ?? null);
  const cityBuildings = BUILDING_ORDER.filter((b) => BUILDINGS[b].category !== 'infrastructure' && (ps.buildings[b] ?? 0) > 0);
  const building = ps.construction && !(ps.buildings[ps.construction.building] ?? 0) && BUILDINGS[ps.construction.building].category !== 'infrastructure' ? ps.construction.building : null;

  return (
    <>
      <div className="section">
        <div className="meter-row">
          <span className="meter-label">Morale</span>
          <MoraleMeter value={ps.morale} target={morale.target} factors={morale.factors} />
        </div>
        <div className="meter-row">
          <span className="meter-label">Growth</span>
          {ps.tier < 5 ? (
            <Progress
              value={ps.growth / next}
              label={`${Math.floor(ps.growth)}/${next} → ${CITY.tierNames[ps.tier + 1]} · ${growth >= 0 ? '+' : ''}${growth.toFixed(1)}/min`}
            />
          ) : (
            <span className="muted">A world city — the largest there is.</span>
          )}
        </div>
        <div className="output-row" title={def.core !== owner ? 'Occupied: output follows morale; few recruits volunteer.' : 'Output per minute'}>
          {RESOURCE_KEYS.map((k) => (
            <span key={k} title={RESOURCE_LABEL[k]}>
              <ResourceIcon kind={k} size={14} /> {fmtRate(out[k])}
            </span>
          ))}
        </div>
        <div className="kv compact">
          <span>Terrain</span>
          <span title={TERRAIN_NOTE[def.terrain]}>
            {def.terrain} — <em>{TERRAIN_NOTE[def.terrain]}</em>
          </span>
          <span>Supply</span>
          <span className={ps.supplied ? 'ok' : 'bad'}>{ps.supplied ? 'Connected to a supply hub' : 'Cut off from supply hubs'}</span>
        </div>
      </div>

      <div className="section">
        <h4>
          Buildings · {used}/{slots} slots
        </h4>
        <div className="slot-grid">
          {cityBuildings.map((b) => (
            <span key={b} className="slot filled" title={`${BUILDINGS[b].name}${BUILDINGS[b].maxLevel > 1 ? ` (level ${ps.buildings[b]})` : ''}\n${BUILDINGS[b].description}`}>
              <BuildingTileArt kind={b} level={ps.buildings[b] ?? 0} maxLevel={BUILDINGS[b].maxLevel} size={44} />
            </span>
          ))}
          {building && (
            <span className="slot building" title={`Building ${BUILDINGS[building].name}`}>
              <BuildingTileArt kind={building} level={1} maxLevel={BUILDINGS[building].maxLevel} size={44} />
              <span className="slot-progress" style={{ height: `${(1 - ps.construction!.remaining / ps.construction!.total) * 100}%` }} />
            </span>
          )}
          {Array.from({ length: Math.max(0, slots - used) }, (_, i) => (
            <span key={`e${i}`} className="slot empty" title="Free building slot">
              +
            </span>
          ))}
        </div>
        <InfrastructureRow buildings={ps.buildings} />
        {ps.construction && (
          <div className="job">
            <BuildingGlyphArt kind={ps.construction.building} />
            <span>
              Building {BUILDINGS[ps.construction.building].name}
              {BUILDINGS[ps.construction.building].maxLevel > 1 ? ` L${ps.construction.targetLevel}` : ''}
            </span>
            <Progress value={1 - ps.construction.remaining / ps.construction.total} label={formatDuration(ps.construction.remaining, state)} />
          </div>
        )}
      </div>

      {mine && (
        <div className="section build-picker">
          <h4>Build</h4>
          {(['economy', 'military', 'civic', 'infrastructure'] as BuildingCategory[]).map((cat) => {
            const rows = BUILDING_ORDER.filter((b) => BUILDINGS[b].category === cat).filter((b) => {
              const cfg = BUILDINGS[b];
              if (cfg.occupiedOnly && def.core === human) return false;
              if (cfg.coastalOnly && !world.seaLandings.has(pid)) return false;
              return true;
            });
            if (rows.length === 0) return null;
            return (
              <div key={cat} className="picker-group">
                <div className={`picker-cat cat-${cat}`}>{CATEGORY_LABEL[cat]}</div>
                <ul className="building-list">
                  {rows.map((b) => (
                    <BuildRow key={b} ctrl={ctrl} pid={pid} building={b} res={res} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      {!mine && <BuildingSummary buildings={ps.buildings} />}
    </>
  );
}

function BuildRow({ ctrl, pid, building, res }: { ctrl: GameController; pid: ProvinceId; building: BuildingType; res: Resources }) {
  const { state, world, human } = ctrl;
  const ps = state.provinces[pid];
  const cfg = BUILDINGS[building];
  const level = ps.buildings[building] ?? 0;
  const maxed = level >= cfg.maxLevel;
  const rules = checkBuildRules(state, world, human, pid, building);
  const check = checkBuild(state, world, human, pid, building);
  const lockedBy = BUILDING_UNLOCKED_BY[building];
  const locked = !!lockedBy && !state.nations[human].research.completed.includes(lockedBy);
  const nextLevel = level + 1;
  return (
    <li className={`${level > 0 ? 'built' : ''}${locked ? ' locked' : ''}`}>
      <span className="b-name" title={cfg.description}>
        <BuildingGlyphArt kind={building} /> {cfg.name}
        {cfg.maxLevel > 1 ? (
          <span className="lvl">
            {' '}
            {level}/{cfg.maxLevel}
          </span>
        ) : level ? (
          <span className="lvl"> ✓</span>
        ) : null}
      </span>
      {locked ? (
        <span className="b-action muted small">Research {TECH_BY_ID[lockedBy!].name}</span>
      ) : maxed ? (
        level > 0 && cfg.category !== 'infrastructure' ? (
          <DemolishButton ctrl={ctrl} pid={pid} building={building} />
        ) : null
      ) : (
        <span className="b-action">
          {rules.ok && <Cost cost={constructionCost(state, human, building, nextLevel)} have={res} />}
          <button
            disabled={!check.ok}
            title={check.ok ? `${cfg.description} Takes ${formatDuration(constructionTicks(state, human, building, nextLevel), state)}.` : check.reason}
            onClick={() => ctrl.submit({ type: 'build', nation: human, province: pid, building })}
            data-build={building}
          >
            {level ? 'Upgrade' : 'Build'}
          </button>
          {level > 0 && cfg.category !== 'infrastructure' && <DemolishButton ctrl={ctrl} pid={pid} building={building} />}
        </span>
      )}
    </li>
  );
}

function DemolishButton({ ctrl, pid, building }: { ctrl: GameController; pid: ProvinceId; building: BuildingType }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      className={`icon-btn demolish${armed ? ' armed' : ''}`}
      title={armed ? 'Click again to demolish (frees the slot, no refund)' : 'Demolish to free the slot'}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          setTimeout(() => setArmed(false), 2500);
          return;
        }
        ctrl.submit({ type: 'demolish', nation: ctrl.human, province: pid, building });
        setArmed(false);
      }}
      data-demolish={building}
    >
      {armed ? 'Sure?' : '✕'}
    </button>
  );
}

function InfrastructureRow({ buildings }: { buildings: Partial<Record<BuildingType, number>> }) {
  const infra = BUILDING_ORDER.filter((b) => BUILDINGS[b].category === 'infrastructure' && (buildings[b] ?? 0) > 0);
  if (infra.length === 0) return null;
  return (
    <div className="infra-row">
      {infra.map((b) => (
        <span key={b} className="infra-item" title={BUILDINGS[b].description}>
          <BuildingGlyphArt kind={b} /> {BUILDINGS[b].name}
          {BUILDINGS[b].maxLevel > 1 ? ` ${buildings[b]}` : ''}
        </span>
      ))}
    </div>
  );
}

function BuildingSummary({ buildings }: { buildings: Partial<Record<BuildingType, number>> }) {
  const built = BUILDING_ORDER.filter((b) => (buildings[b] ?? 0) > 0);
  return (
    <div className="section">
      <h4>Buildings</h4>
      {built.length === 0 ? (
        <div className="muted">None</div>
      ) : (
        <div className="slot-grid">
          {built.map((b) => (
            <span key={b} className="slot filled" title={BUILDINGS[b].name}>
              <BuildingTileArt kind={b} level={buildings[b] ?? 0} maxLevel={BUILDINGS[b].maxLevel} size={40} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RecruitTab({ ctrl, pid }: { ctrl: GameController; pid: ProvinceId }) {
  const { state, human } = ctrl;
  const ps = state.provinces[pid];
  const locked: UnitType[] = [];
  return (
    <>
      {ps.recruitQueue.length > 0 && (
        <div className="section">
          <h4>In training</h4>
          <ul className="queue">
            {ps.recruitQueue.map((j, i) => (
              <li key={i}>
                <span className="q-name">{currentModelName(ctrl, j.unitType)}</span>
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
        </div>
      )}
      {(Object.keys(UNITS_BY_CLASS) as UnitClass[]).map((cls) => {
        const types = UNITS_BY_CLASS[cls].filter((t) => {
          if (isUnitUnlocked(state, human, t)) return true;
          locked.push(t);
          return false;
        });
        if (types.length === 0) return null;
        return (
          <div key={cls} className="section">
            <h4>{CLASS_LABEL[cls]}</h4>
            <div className="unit-cards">
              {types.map((t) => (
                <UnitCard key={t} ctrl={ctrl} pid={pid} type={t} />
              ))}
            </div>
          </div>
        );
      })}
      {locked.length > 0 && (
        <div className="section">
          <h4>Not yet researched</h4>
          <ul className="locked-units">
            {locked.map((t) => (
              <li key={t}>
                <strong>{UNITS[t].name}</strong> <span className="muted">— {TECH_BY_ID[UNIT_UNLOCKED_BY[t]!].name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function currentModelName(ctrl: GameController, type: UnitType): string {
  return currentModel(ctrl.state, ctrl.world, ctrl.human, type).name;
}

function UnitCard({ ctrl, pid, type }: { ctrl: GameController; pid: ProvinceId; type: UnitType }) {
  const { state, world, human } = ctrl;
  const cfg = UNITS[type];
  const check = checkRecruit(state, world, human, pid, type);
  const gen = unitGen(state, human, type);
  const model = currentModel(state, world, human, type);
  const s = unitStats(state, human, type);
  const res = state.nations[human].resources;
  return (
    <div className={`unit-card${check.ok ? '' : ' disabled'}`} data-unit-card={type}>
      <UnitPicture type={type} gen={gen} nation={human} width={104} />
      <div className="uc-body">
        <div className="uc-name" title={model.detail}>
          {model.name}
        </div>
        <div className="uc-type muted">
          {cfg.name} · {model.year} · {cfg.role}
        </div>
        <div className="uc-stats" title="Attack soft/hard · Defence soft/hard · Hit points · Speed">
          ⚔ {s.attack.soft.toFixed(0)}/{s.attack.hard.toFixed(0)} 🛡 {s.defence.soft.toFixed(0)}/{s.defence.hard.toFixed(0)} ♥ {s.maxHp}
          {s.hardness >= 0.5 ? ' · armoured' : ''}
        </div>
        <div className="uc-foot">
          <Cost cost={recruitCost(state, human, type)} have={res} />
          <button
            className="primary"
            disabled={!check.ok}
            onClick={() => ctrl.submit({ type: 'recruit', nation: human, province: pid, unitType: type })}
            title={check.ok ? `${cfg.description} Trains in ${formatDuration(recruitTicks(state, human, type), state)}.` : check.reason}
            data-recruit={type}
          >
            Recruit
          </button>
        </div>
      </div>
    </div>
  );
}

function ArmiesTab({
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
  const { state, world } = ctrl;
  const armies = armiesIn(state, pid);
  return (
    <>
      <div className="section">
        <h4>Armies here</h4>
        {armies.length === 0 && <div className="muted">None</div>}
        <ul className="army-list">
          {armies.map((a) => {
            const name = a.owner === 'neutral' ? armyName(world, a, pid) : `${armyName(world, a)} (${world.nations[a.owner].adjective})`;
            return (
              <li key={a.id}>
                <button
                  className={`army-row${selectedArmies.includes(a.id) ? ' selected' : ''}`}
                  onClick={(e) => onSelectArmy(a.id, e.shiftKey)}
                  data-army-row={a.id}
                >
                  <span className="swatch" style={{ background: a.owner === 'neutral' ? NEUTRAL_COLOR : world.nations[a.owner].color }} />
                  <span className="ar-name">{name}</span>
                  <span className="muted">
                    {a.units.length} units · morale {Math.round(armyMorale(a) * 100)}%
                  </span>
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
              {world.provinces[n.id].name}{' '}
              <span className="muted">
                · {n.kind === 'strait' ? `sea crossing${n.label ? ` (${n.label})` : ''}` : n.kind === 'mountain' ? `mountain pass${n.label ? ` (${n.label})` : ''}` : 'land'} ·{' '}
                {n.distanceKm} km
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
