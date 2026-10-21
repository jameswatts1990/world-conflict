// The city view: skyline, morale, growth, building slots and the build
// picker; unit cards for recruitment; armies present and routes.
import { useState } from 'react';
import { BUILDINGS, BUILDING_ORDER, CITY, slotsUsed } from '../../sim/config/buildings';
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
  type Army,
  type ArmyId,
  type BuildingCategory,
  type BuildingType,
  type GameState,
  type ProvinceId,
  type Resources,
  type Terrain,
  type UnitClass,
  type UnitType,
} from '../../sim';
import { BuildingTileArt, CityScene, UnitIconArt, UnitPicture } from '../art/adapters';
import { ownerColor, strengthColor } from '../color';
import { OwnerFlag } from '../flags';
import type { GameController } from '../game/GameController';
import { fmtPopulation, fmtRate, formatDuration } from '../format';
import { BuildingIcon, Icon, RESOURCE_LABEL, ResourceIcon, type IconName } from '../icons';
import { Cost, MoraleMeter, Progress, Section } from './Common';

export const TERRAIN_LABEL: Record<Terrain, string> = {
  plains: 'Plains',
  forest: 'Forest',
  hills: 'Hills',
  mountains: 'Mountains',
  urban: 'Urban',
  marsh: 'Marsh',
};

const TERRAIN_NOTE: Record<Terrain, string> = {
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
const CLASS_ICON: Record<UnitClass, IconName> = { infantry: 'shield', mobile: 'move', support: 'target', armour: 'bolt' };

/** Unit counts by type (most numerous first) and average strength, for compact army summaries. */
export function composition(army: Army): { types: [UnitType, number][]; strength: number } {
  const counts = new Map<UnitType, number>();
  let strength = 0;
  for (const u of army.units) {
    counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
    strength += u.strength;
  }
  return {
    types: [...counts].sort((a, b) => b[1] - a[1]),
    strength: army.units.length ? strength / army.units.length : 0,
  };
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
  const ownerName = owner === 'neutral' ? `${def.neutralState} · neutral` : world.nations[owner].name;
  const color = ownerColor(world, owner);
  const armies = armiesIn(state, pid);
  const capital = owner !== 'neutral' && world.nations[owner]?.capital === pid;
  const nationalCapital = def.city.size === 'capital' && def.core !== null;
  const occupied = def.core && def.core !== owner;
  const activeTab: Tab = !mine && tab === 'recruit' ? 'city' : tab;

  return (
    <section className="panel province-panel" data-testid="province-panel" data-province={pid}>
      <header className={`panel-hero terrain-${def.terrain}`} style={{ '--owner': color } as React.CSSProperties}>
        <div className="hero-top">
          <OwnerFlag world={world} owner={owner} province={pid} size={16} />
          <span className="hero-owner">
            {def.name} · {ownerName}
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
          <span className="chip" title={TERRAIN_NOTE[def.terrain]}>
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
            <span className="chip" title="Oil field: refineries produce extra fuel">
              <Icon name="oil" size={13} /> Oil field
            </span>
          )}
          {world.seaLandings.has(pid) && (
            <span className="chip" title="A sea crossing lands here">
              <Icon name="anchor" size={13} /> Landing
            </span>
          )}
        </div>
        {occupied && <div className="hero-note">Occupied {world.nations[def.core!].adjective} core territory — output follows morale, few volunteers</div>}
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
        {ps.capture && (
          <div className="capture-box">
            <span>
              <Icon name="target" size={14} /> {world.nations[ps.capture.by].name} capturing…
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
        <p className="terrain-note">
          <Icon name={def.terrain} size={14} /> {TERRAIN_NOTE[def.terrain]}
        </p>
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
      <p className="terrain-note">
        <Icon name={def.terrain} size={14} /> {TERRAIN_NOTE[def.terrain]}
      </p>

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
                  title={i === 0 ? 'Cancel (50% refund)' : 'Cancel (full refund)'}
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
  return (
    <div className={`recruit-card${check.ok ? '' : ' disabled'}`} data-unit-card={type}>
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
          <Cost cost={recruitCost(state, human, type)} have={res} />
          <button
            className="build-btn"
            disabled={!check.ok}
            onClick={() => ctrl.submit({ type: 'recruit', nation: human, province: pid, unitType: type })}
            title={check.ok ? `${cfg.description} Trains in ${formatDuration(recruitTicks(state, human, type), state)}.` : check.reason}
            data-recruit={type}
          >
            {check.ok ? 'Recruit' : <Icon name="lock" size={13} />}
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
                  title={`${a.units.length} formations · strength ${Math.round(c.strength * 100)}% · morale ${Math.round(morale * 100)}%`}
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
    </>
  );
}
