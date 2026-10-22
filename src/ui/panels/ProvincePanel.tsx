// The city view: skyline, morale, growth, building slots and the build
// picker; unit cards for recruitment; armies present and routes.
import { useState } from 'react';
import { BUILDINGS, BUILDING_ORDER, CITY, slotsUsed } from '../../sim/config/buildings';
import { BUILDING_UNLOCKED_BY, TECH_BY_ID, UNIT_UNLOCKED_BY } from '../../sim/config/research';
import { ECONOMY } from '../../sim/config/rules';
import { UNITS, UNITS_BY_CLASS } from '../../sim/config/units';
import {
  RESOURCE_KEYS,
  armiesIn,
  armyMorale,
  armyName,
  armyPower,
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
  nationName,
  provinceMoraleTarget,
  provinceOutput,
  recruitCost,
  recruitTicks,
  sentence,
  unitGen,
  unitStats,
  type Army,
  type ArmyId,
  type BuildingCategory,
  type BuildingType,
  type ConnectionKind,
  type GameState,
  type OwnerId,
  type ProvinceId,
  type Resources,
  type UnitClass,
  type UnitType,
} from '../../sim';
import { BuildingTileArt, CityScene, UnitIconArt, UnitPicture } from '../art/adapters';
import { ownerColor, strengthColor } from '../color';
import { OwnerFlag } from '../flags';
import type { GameController } from '../game/GameController';
import { countOf, fmtPopulation, fmtRate, formatDuration } from '../format';
import { BuildingIcon, Icon, RESOURCE_LABEL, ResourceIcon, type IconName } from '../icons';
import { TERRAIN_LABEL, TERRAIN_NOTE, composition, ownerLabel, ownerShortName } from '../labels';
import { Cost, MoraleMeter, Progress, Section } from './Common';

const CATEGORY_LABEL: Record<BuildingCategory, string> = {
  economy: 'Economy',
  military: 'Military',
  civic: 'Civic',
  infrastructure: 'Infrastructure (no slot)',
};

const CLASS_LABEL: Record<UnitClass, string> = { infantry: 'Infantry', mobile: 'Mobile', support: 'Support', armour: 'Armour' };
const CLASS_ICON: Record<UnitClass, IconName> = { infantry: 'shield', mobile: 'move', support: 'target', armour: 'bolt' };

const ROUTE_KIND: Record<ConnectionKind, { label: string; icon: IconName }> = {
  land: { label: 'Land route', icon: 'road' },
  mountain: { label: 'Mountain pass', icon: 'mountains' },
  strait: { label: 'Sea crossing', icon: 'anchor' },
};

const refundTitle = (what: string, started: boolean) =>
  started ? `Cancel ${what} (${Math.round(ECONOMY.startedJobRefund * 100)}% refund)` : `Cancel ${what} (full refund)`;

/** Who is fighting in a province, with each side's share of the firepower. */
function BattleBox({ ctrl, pid }: { ctrl: GameController; pid: ProvinceId }) {
  const { state, world } = ctrl;
  const battle = state.battles[pid];
  const armies = armiesIn(state, pid);
  const defender = state.provinces[pid].owner;
  const owners = [...new Set(armies.map((a) => a.owner))].sort((a, b) => Number(a === defender) - Number(b === defender));
  const sides = owners.map((owner: OwnerId) => {
    const theirs = armies.filter((a) => a.owner === owner);
    const morale = theirs.reduce((s, a) => s + armyMorale(a) * a.units.length, 0) / Math.max(1, theirs.reduce((s, a) => s + a.units.length, 0));
    return { owner, c: composition(theirs), morale, power: theirs.reduce((s, a) => s + armyPower(state, a), 0) };
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
          <span className="bs-units" title={`Average morale ${Math.round(s.morale * 100)}%; low morale blunts firepower`}>
            {countOf(s.c.count, 'unit')} · {Math.round((s.power / total) * 100)}% · morale {Math.round(s.morale * 100)}
          </span>
          <span className="ar-bars">
            <span className="ar-str" title={`${Math.round(s.c.strength * 100)}% average strength`}>
              <span style={{ width: `${s.c.strength * 100}%`, background: strengthColor(s.c.strength) }} />
            </span>
            <span className={`ar-str mini-morale ${s.morale >= 0.6 ? 'high' : s.morale >= 0.35 ? 'mid' : 'low'}`}>
              <span style={{ width: `${s.morale * 100}%` }} />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

type Tab = 'city' | 'recruit' | 'armies';

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
  const [tab, setTab] = useState<Tab>('city');
  const def = world.provinces[pid];
  const ps = state.provinces[pid];
  const owner = ps.owner;
  const mine = owner === human;
  const color = ownerColor(world, owner);
  const armies = armiesIn(state, pid);
  const capital = owner !== 'neutral' && world.nations[owner]?.capital === pid;
  const nationalCapital = def.city.size === 'capital' && def.core !== null;
  const occupied = owner !== 'neutral' && def.core !== owner;
  const activeTab: Tab = !mine && tab === 'recruit' ? 'city' : tab;

  return (
    <section className="panel province-panel" data-testid="province-panel" data-province={pid}>
      <header className={`panel-hero terrain-${def.terrain}`} style={{ '--owner': color } as React.CSSProperties}>
        <div className="hero-top">
          <OwnerFlag world={world} owner={owner} province={pid} size={16} />
          <span className="hero-owner">
            {ownerShortName(world, owner, pid) === def.name ? ownerLabel(world, owner, pid) : `${def.name} · ${ownerLabel(world, owner, pid)}`}
          </span>
          <button className="icon-btn close-btn" onClick={onClose} aria-label="Close province panel">
            <Icon name="close" size={16} />
          </button>
        </div>
        <h3>
          {nationalCapital && <Icon name="star" size={18} className="capital-star" />}
          {def.city.name}
          <span className="tier-badge">{CITY.tierNames[ps.tier]}</span>
        </h3>
        <div className="chips">
          <span className="chip">
            <Icon name={def.terrain} size={13} /> {TERRAIN_LABEL[def.terrain]}
          </span>
          <span className="chip" title="Urban population">
            <Icon name="city" size={13} /> {fmtPopulation(cityPopulation(state, world, pid))}
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
          {world.seaLandings.has(pid) && (
            <span className="chip" title="A sea crossing lands here">
              <Icon name="anchor" size={13} /> Landing
            </span>
          )}
        </div>
        <div className="hero-note">{TERRAIN_NOTE[def.terrain]}</div>
        {occupied && (
          <div className="hero-note warn-note">
            {def.core ? `Occupied ${world.nations[def.core].adjective} core territory` : `Occupied ${def.neutral?.name ?? 'territory'}`}: output follows
            morale, few volunteers
          </div>
        )}
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
      </div>

      <nav className="tabs" role="tablist">
        <button className={activeTab === 'city' ? 'active' : ''} onClick={() => setTab('city')} data-tab="city">
          <Icon name="city" size={14} /> City
        </button>
        {mine && (
          <button className={activeTab === 'recruit' ? 'active' : ''} onClick={() => setTab('recruit')} data-tab="recruit">
            <Icon name="shield" size={14} /> Recruit{ps.recruitQueue.length ? ` (${ps.recruitQueue.length})` : ''}
          </button>
        )}
        <button className={activeTab === 'armies' ? 'active' : ''} onClick={() => setTab('armies')} data-tab="armies">
          <Icon name="swords" size={14} /> Armies{armies.length ? ` (${armies.length})` : ''}
        </button>
      </nav>

      <div className="panel-body">
        {state.battles[pid] && <BattleBox ctrl={ctrl} pid={pid} />}
        {ps.capture && (
          <div className="capture-box">
            <span>
              <Icon name="target" size={14} /> {sentence(nationName(world, ps.capture.by))} capturing
              <span className="muted"> · {formatDuration(ps.capture.required - ps.capture.progress, state)} left</span>
            </span>
            <Progress value={ps.capture.progress / ps.capture.required} color={world.nations[ps.capture.by].color} />
          </div>
        )}
        {activeTab === 'city' && <CityTab ctrl={ctrl} pid={pid} />}
        {activeTab === 'recruit' && <RecruitTab ctrl={ctrl} pid={pid} />}
        {activeTab === 'armies' && <ArmiesTab ctrl={ctrl} pid={pid} selectedArmies={selectedArmies} onSelectArmy={onSelectArmy} />}
      </div>
    </section>
  );
}

function CityTab({ ctrl, pid }: { ctrl: GameController; pid: ProvinceId }) {
  const { state, world, human } = ctrl;
  const def = world.provinces[pid];
  const ps = state.provinces[pid];
  const owner = ps.owner;
  const mine = owner === human;
  const res = state.nations[human].resources;

  if (owner === 'neutral') {
    return (
      <>
        <p className="muted small">A neutral state. Invading it means fighting its garrison; capturing it brings its city, buildings and any objective.</p>
        <BuildingSummary buildings={ps.buildings} />
      </>
    );
  }

  const out = provinceOutput(state, world, pid);
  const morale = provinceMoraleTarget(state, world, pid);
  const growth = cityGrowthPerMinute(state, pid, !!state.battles[pid]);
  const next = CITY.growthToNext[ps.tier];
  const slots = buildingSlots(state, pid);
  const used = slotsUsed(ps.buildings, ps.construction?.building ?? null);
  const cityBuildings = BUILDING_ORDER.filter((b) => BUILDINGS[b].category !== 'infrastructure' && (ps.buildings[b] ?? 0) > 0);
  const building =
    ps.construction && !(ps.buildings[ps.construction.building] ?? 0) && BUILDINGS[ps.construction.building].category !== 'infrastructure'
      ? ps.construction.building
      : null;

  return (
    <>
      <Section title="Morale & growth" icon="morale">
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
              tone="blue"
            />
          ) : (
            <span className="muted small">A world city — the largest there is.</span>
          )}
        </div>
      </Section>

      <Section title="Output per minute" icon="factory">
        <div className="output-grid" title={def.core !== owner ? 'Occupied: output follows morale; few recruits volunteer.' : undefined}>
          {RESOURCE_KEYS.map((k) => (
            <span key={k} className="output-tile" title={RESOURCE_LABEL[k]}>
              <ResourceIcon kind={k} size={16} />
              <span className={out[k] < 0 ? 'bad' : ''}>{fmtRate(out[k])}</span>
            </span>
          ))}
        </div>
      </Section>

      <Section title="Buildings" icon="city" extra={`${used}/${slots} slots`}>
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
            {mine && (
              <button
                className="icon-btn"
                title={refundTitle('construction', ps.construction.remaining < ps.construction.total)}
                aria-label="Cancel construction"
                onClick={() => ctrl.submit({ type: 'cancelBuild', nation: human, province: pid })}
                data-testid="cancel-build"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        )}
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
              <Icon name="plus" size={18} />
            </span>
          ))}
        </div>
        <InfrastructureRow buildings={ps.buildings} />
      </Section>

      {mine && (
        <Section title="Build" icon="plus">
          {ps.construction && <p className="muted small build-note">One project at a time: new orders open when the current work is done.</p>}
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
        </Section>
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
  const demolishable = level > 0 && cfg.category !== 'infrastructure';
  // Why it cannot be ordered here (the city's one-job-at-a-time rule is explained once, above the list).
  const fullCity = cfg.category !== 'infrastructure' && level === 0 && slotsUsed(ps.buildings, ps.construction?.building ?? null) >= buildingSlots(state, pid);
  const why = locked || maxed || rules.ok ? null : fullCity ? 'No free slot' : rules.reason.replace(/\.$/, '');
  return (
    <li className={`bld${level > 0 ? ' built' : ''}${locked ? ' locked' : ''}`}>
      <span className="bld-icon">
        <BuildingIcon kind={building} size={18} />
      </span>
      <span className="bld-info" title={cfg.description}>
        <span className="bld-name">{cfg.name}</span>
        <span className="bld-level">
          {locked ? (
            <span className="muted">
              <Icon name="lock" size={11} /> {TECH_BY_ID[lockedBy!].name}
            </span>
          ) : cfg.maxLevel > 1 ? (
            Array.from({ length: cfg.maxLevel }, (_, i) => <span key={i} className={`pip${i < level ? ' on' : ''}`} />)
          ) : level ? (
            <span className="built-tag">Built</span>
          ) : (
            <span className="muted">Not built</span>
          )}
        </span>
        {why && <span className="bld-why">{why}</span>}
      </span>
      {locked ? null : maxed ? (
        <span className="b-action">
          <span className="bld-done" title="Fully built">
            <Icon name="check" size={16} />
          </span>
          {demolishable && <DemolishButton ctrl={ctrl} pid={pid} building={building} />}
        </span>
      ) : (
        <span className="b-action">
          {rules.ok && <Cost cost={constructionCost(state, human, building, nextLevel)} have={res} />}
          <span className="b-buttons">
            {demolishable && <DemolishButton ctrl={ctrl} pid={pid} building={building} />}
            <button
              className="build-btn"
              disabled={!check.ok}
              title={check.ok ? `${cfg.description} Takes ${formatDuration(constructionTicks(state, human, building, nextLevel), state)}.` : check.reason}
              onClick={() => ctrl.submit({ type: 'build', nation: human, province: pid, building })}
              data-build={building}
            >
              {level ? 'Upgrade' : 'Build'}
            </button>
          </span>
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
      {armed ? 'Sure?' : <Icon name="close" size={13} />}
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
          <BuildingIcon kind={b} size={14} /> {BUILDINGS[b].name}
          {BUILDINGS[b].maxLevel > 1 ? ` ${buildings[b]}` : ''}
        </span>
      ))}
    </div>
  );
}

function BuildingSummary({ buildings }: { buildings: Partial<Record<BuildingType, number>> }) {
  const built = BUILDING_ORDER.filter((b) => (buildings[b] ?? 0) > 0);
  return (
    <Section title="Buildings" icon="city">
      {built.length === 0 ? (
        <div className="muted empty">None</div>
      ) : (
        <div className="slot-grid">
          {built.map((b) => (
            <span key={b} className="slot filled" title={BUILDINGS[b].name}>
              <BuildingTileArt kind={b} level={buildings[b] ?? 0} maxLevel={BUILDINGS[b].maxLevel} size={40} />
            </span>
          ))}
        </div>
      )}
    </Section>
  );
}

function RecruitTab({ ctrl, pid }: { ctrl: GameController; pid: ProvinceId }) {
  const { state, world, human } = ctrl;
  const ps = state.provinces[pid];
  const locked: UnitType[] = [];
  return (
    <>
      {ps.recruitQueue.length > 0 && (
        <Section title="In training" icon="clock" extra={ps.recruitQueue.length}>
          <ul className="queue">
            {ps.recruitQueue.map((j, i) => (
              <li key={i}>
                <span className="unit-plate">
                  <UnitIconArt type={j.unitType} gen={unitGen(state, human, j.unitType)} nation={human} width={18} />
                </span>
                <span className="q-name" title={currentModel(state, world, human, j.unitType).name}>
                  {currentModel(state, world, human, j.unitType).name}
                </span>
                {i === 0 ? <Progress value={1 - j.remaining / j.total} label={formatDuration(j.remaining, state)} /> : <span className="muted">Queued</span>}
                <button
                  className="icon-btn"
                  title={refundTitle('training', j.remaining < j.total)}
                  aria-label={`Cancel ${currentModel(state, world, human, j.unitType).name}`}
                  onClick={() => ctrl.submit({ type: 'cancelRecruit', nation: human, province: pid, index: i })}
                >
                  <Icon name="close" size={13} />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {(Object.keys(UNITS_BY_CLASS) as UnitClass[]).map((cls) => {
        const types = UNITS_BY_CLASS[cls].filter((t) => {
          if (isUnitUnlocked(state, human, t)) return true;
          locked.push(t);
          return false;
        });
        if (types.length === 0) return null;
        return (
          <Section key={cls} title={CLASS_LABEL[cls]} icon={CLASS_ICON[cls]}>
            <div className="recruit-cards">
              {types.map((t) => (
                <RecruitCard key={t} ctrl={ctrl} pid={pid} type={t} />
              ))}
            </div>
          </Section>
        );
      })}
      {locked.length > 0 && (
        <Section title="Not yet researched" icon="lock">
          <ul className="locked-units">
            {locked.map((t) => (
              <li key={t}>
                <strong>{UNITS[t].name}</strong> <span className="muted">— {TECH_BY_ID[UNIT_UNLOCKED_BY[t]!].name}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function RecruitCard({ ctrl, pid, type }: { ctrl: GameController; pid: ProvinceId; type: UnitType }) {
  const { state, world, human } = ctrl;
  const cfg = UNITS[type];
  const check = checkRecruit(state, world, human, pid, type);
  const gen = unitGen(state, human, type);
  const model = currentModel(state, world, human, type);
  const s = unitStats(state, human, type);
  const res = state.nations[human].resources;
  // A missing building is a lock; a short treasury is only a wait.
  const missing = cfg.requires.filter((b) => !state.provinces[pid].buildings[b]);
  const time = formatDuration(recruitTicks(state, human, type), state);
  return (
    <div className={`recruit-card${check.ok ? '' : ' disabled'}${missing.length ? ' locked' : ''}`} data-unit-card={type}>
      <UnitPicture type={type} gen={gen} nation={human} width={104} />
      <div className="uc-body">
        <div className="uc-name" title={model.detail}>
          {model.name}
        </div>
        <div className="uc-type">
          {cfg.name} · {model.year} · {cfg.role}
        </div>
        <div className="uc-stats" title="Attack soft/hard · Defence soft/hard · Hit points">
          <span>
            ATK <b>{s.attack.soft.toFixed(0)}</b>/{s.attack.hard.toFixed(0)}
          </span>
          <span>
            DEF <b>{s.defence.soft.toFixed(0)}</b>/{s.defence.hard.toFixed(0)}
          </span>
          <span>
            HP <b>{s.maxHp}</b>
          </span>
          {s.hardness >= 0.5 && <span className="model-tag">Armoured</span>}
        </div>
        <div className="uc-foot">
          {missing.length ? (
            <span className="unit-req">
              <Icon name="lock" size={12} /> Needs {missing.map((b) => BUILDINGS[b].name).join(' and ')}
            </span>
          ) : (
            <Cost cost={recruitCost(state, human, type)} have={res} />
          )}
          <button
            className="build-btn"
            disabled={!check.ok}
            onClick={() => ctrl.submit({ type: 'recruit', nation: human, province: pid, unitType: type })}
            title={check.ok ? `${cfg.description} Ready in ${time}.` : check.reason}
            data-recruit={type}
          >
            {missing.length ? <Icon name="lock" size={13} /> : 'Recruit'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Up to four unit-type icons with counts. */
export function CompositionIcons({ state, army, size = 22 }: { state: GameState; army: Army; size?: number }) {
  const c = composition(army);
  return (
    <span className="ar-comp">
      {c.types.slice(0, 4).map(([t, n]) => (
        <span key={t} title={UNITS[t].name}>
          <span className="unit-plate">
            <UnitIconArt type={t} gen={unitGen(state, army.owner, t)} nation={army.owner} width={size} />
          </span>
          {n}
        </span>
      ))}
    </span>
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
  const { state, world, human } = ctrl;
  const armies = armiesIn(state, pid);
  return (
    <>
      <Section title="Forces present" icon="swords" extra={armies.length ? armies.length : undefined}>
        {armies.length === 0 && <div className="muted empty">No armies in this province</div>}
        <ul className="army-list">
          {armies.map((a) => {
            const name = a.owner === 'neutral' ? armyName(world, a, pid) : armyName(world, a);
            const c = composition(a);
            const morale = armyMorale(a);
            return (
              <li key={a.id}>
                <button
                  className={`army-row${selectedArmies.includes(a.id) ? ' selected' : ''}${a.owner === human ? ' own' : ''}`}
                  onClick={(e) => onSelectArmy(a.id, e.shiftKey)}
                  data-army-row={a.id}
                  title={`${countOf(a.units.length, 'formation')} · strength ${Math.round(c.strength * 100)}% · morale ${Math.round(morale * 100)}%`}
                >
                  <OwnerFlag world={world} owner={a.owner} province={a.province} size={13} />
                  <span className="ar-name">{name}</span>
                  <CompositionIcons state={state} army={a} size={20} />
                  <span className="ar-bars">
                    <span className="ar-str">
                      <span style={{ width: `${c.strength * 100}%`, background: strengthColor(c.strength) }} />
                    </span>
                    <span className={`ar-str mini-morale ${morale >= 0.6 ? 'high' : morale >= 0.35 ? 'mid' : 'low'}`}>
                      <span style={{ width: `${morale * 100}%` }} />
                    </span>
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
    </>
  );
}
