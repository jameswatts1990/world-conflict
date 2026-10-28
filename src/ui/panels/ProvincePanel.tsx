// The city view: skyline, morale, growth, building slots and the build
// picker; unit cards for recruitment; armies present and routes.
import { useState } from 'react';
import { BUILDINGS, BUILDING_ORDER, CITY, landBuildings, landSite, slotsUsed } from '../../sim/config/buildings';
import { BUILDING_UNLOCKED_BY, TECH_BY_ID } from '../../sim/config/research';
import { ECONOMY, SIGHT } from '../../sim/config/rules';
import { ARMY_RULES, UNITS, UNITS_BY_CLASS } from '../../sim/config/units';
import {
  RESOURCE_KEYS,
  alliesOf,
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
  homeSoilMult,
  constructionTicks,
  currentModel,
  isArmyVisible,
  isUnitUnlocked,
  nationName,
  provinceMoraleTarget,
  provinceName,
  nationEconomy,
  provinceOutput,
  recruitCost,
  recruitTicks,
  sentence,
  sharesAlliedSight,
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
  type World,
} from '../../sim';
import { BuildingTileArt, CityScene, cityConstruction, UnitIconArt, UnitPicture } from '../art/adapters';
import { ownerColor, strengthColor } from '../color';
import { OwnerFlag } from '../flags';
import type { GameController } from '../game/GameController';
import { countOf, fmtPopulation, fmtRate, formatDuration, listText } from '../format';
import { BuildingIcon, Icon, RESOURCE_LABEL, ResourceIcon, type IconName } from '../icons';
import { TERRAIN_LABEL, TERRAIN_NOTE, composition, ownerLabel, ownerShortName, roadEndName } from '../labels';
import { Cost, MoraleMeter, Progress, Section, Upkeep } from './Common';
import { CLASS_LABEL, UnitInfo } from './UnitInfo';

const CATEGORY_LABEL: Record<BuildingCategory, string> = {
  economy: 'Economy',
  military: 'Military',
  civic: 'Civic',
  infrastructure: 'Infrastructure (no slot)',
};

/** On land every building, infrastructure included, takes its one place. */
const LAND_CATEGORY_LABEL: Record<BuildingCategory, string> = {
  economy: 'Economy',
  military: 'Military',
  civic: 'Support',
  infrastructure: 'Infrastructure',
};

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
  const armies = armiesIn(state, world, pid);
  const defender = state.provinces[pid].owner;
  const owners = [...new Set(armies.map((a) => a.owner))].sort((a, b) => Number(a === defender) - Number(b === defender));
  const sides = owners.map((owner: OwnerId) => {
    const theirs = armies.filter((a) => a.owner === owner);
    const morale = theirs.reduce((s, a) => s + armyMorale(a) * a.units.length, 0) / Math.max(1, theirs.reduce((s, a) => s + a.units.length, 0));
    const homeSoil = Math.round((homeSoilMult(state, world, owner, pid) - 1) * 100);
    return { owner, c: composition(theirs), morale, homeSoil, power: theirs.reduce((s, a) => s + armyPower(state, a), 0) };
  });
  const total = sides.reduce((s, x) => s + x.power, 0) || 1;
  return (
    <div className="battle-box" data-testid="battle-box">
      <div className="battle-head">
        <Icon name="swords" size={15} />
        <span>Battle of {provinceName(world, pid)}</span>
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
          {s.homeSoil > 0 && (
            <span className="bs-note" title="Fighting on its own home soil: it hits harder and holds firmer, the more so the higher its national morale">
              On home soil: +{s.homeSoil}% firepower and nerve
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

type Tab = 'city' | 'recruit' | 'armies';

/**
 * A province's card: a city (its skyline on larger screens, buildings, recruitment and armies) or the land
 * round a city (its morale, infrastructure and armies). On a phone a city opens as a full-screen page
 * (`page`), with no skyline so its choices come first.
 */
export function ProvincePanel({
  ctrl,
  pid,
  selectedArmies,
  onSelectArmy,
  onSelectProvince,
  onClose,
  compact = false,
  page = false,
}: {
  ctrl: GameController;
  pid: ProvinceId;
  selectedArmies: ArmyId[];
  onSelectArmy: (id: ArmyId, additive: boolean) => void;
  /** Moves the card to another province: from a city to the land round it, or back. */
  onSelectProvince: (pid: ProvinceId) => void;
  onClose: () => void;
  /** Phone layouts: no skyline. */
  compact?: boolean;
  /** Shown as a full-screen page (a city on a phone): the close button reads as "back to the map". */
  page?: boolean;
}) {
  const { state, world, human } = ctrl;
  const [tab, setTab] = useState<Tab>('city');
  const def = world.provinces[pid];
  const ps = state.provinces[pid];
  const owner = ps.owner;
  const mine = owner === human;
  const color = ownerColor(world, owner);
  const city = def.city;
  // Under the fog of war only the map is known: who holds it, its city and its ground.
  const seen = ctrl.sight();
  const known = seen.has(pid);
  const armies = armiesIn(state, world, pid).filter((a) => isArmyVisible(a, human, seen));
  const capital = owner !== 'neutral' && world.nations[owner]?.capital === pid;
  const nationalCapital = city?.size === 'capital' && def.core !== null;
  const occupied = owner !== 'neutral' && def.core !== owner;
  const activeTab: Tab = (!mine || !city) && tab === 'recruit' ? 'city' : tab;
  // The rest of this place: the lands round a city, or the city a land lies round.
  const partners = def.lands ?? (def.around ? [def.around] : []);

  return (
    <section className={`panel province-panel${page ? ' page' : ''}${city ? '' : ' land'}`} data-testid="province-panel" data-province={pid}>
      <header className={`panel-hero terrain-${def.terrain}`} style={{ '--owner': color } as React.CSSProperties}>
        <div className="hero-top">
          {page ? (
            <button className="back-btn" onClick={onClose} aria-label="Back to the map" data-testid="close-page">
              <Icon name="back" size={18} /> Map
            </button>
          ) : null}
          <OwnerFlag world={world} owner={owner} province={pid} size={16} />
          <span className="hero-owner">{ownerLabel(world, owner, pid)}</span>
          {def.region && def.region !== ownerLabel(world, owner, pid) && <span className="hero-region">· {def.region}</span>}
          {!page && (
            <button className="icon-btn close-btn" onClick={onClose} aria-label="Close province panel">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        <h3>
          {nationalCapital && <Icon name="star" size={18} className="capital-star" />}
          {def.name}
          <span className="tier-badge">{city ? CITY.tierNames[ps.tier] : 'Province'}</span>
        </h3>
        <div className="chips">
          <span className="chip">
            <Icon name={def.terrain} size={13} /> {TERRAIN_LABEL[def.terrain]}
          </span>
          {city && (
            <span className="chip" title="Urban population">
              <Icon name="city" size={13} /> {fmtPopulation(cityPopulation(state, world, pid))}
            </span>
          )}
          {def.objectiveVp ? <strong className="chip gold vp-badge">★ {def.objectiveVp} VP objective</strong> : null}
          {owner !== 'neutral' && known && (
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
          {partners.map((partner) => (
            <button
              key={partner}
              className="chip chip-link"
              onClick={() => onSelectProvince(partner)}
              title={city ? `Land round ${def.name}` : `${def.name} lies round this city`}
              data-testid="partner-province"
              data-partner={partner}
            >
              <Icon name={city ? 'flag' : 'city'} size={13} /> {city ? '' : 'City: '}
              {world.provinces[partner].name}
              <span className="chip-owner" style={{ background: ownerColor(world, state.provinces[partner].owner) }} />
            </button>
          ))}
        </div>
        <div className="hero-note">{TERRAIN_NOTE[def.terrain]}</div>
        {occupied && (
          <div className="hero-note warn-note">
            {def.core ? `Occupied ${world.nations[def.core].adjective} core territory` : `Occupied ${def.neutral?.name ?? 'territory'}`}
            {city ? ': output follows morale, few volunteers' : ''}
          </div>
        )}
      </header>

      {city && !compact && (
        <div className="city-scene-wrap">
          <CityScene
            seed={pid}
            tier={ps.tier}
            capital={capital || nationalCapital}
            buildings={known ? ps.buildings : {}}
            construction={known ? cityConstruction(ps.construction?.building) : null}
            terrain={def.terrain}
            coastal={def.coastal}
            nationColor={owner === 'neutral' ? undefined : color}
            battle={known && !!state.battles[pid]}
            width={354}
          />
        </div>
      )}

      <nav className="tabs" role="tablist">
        <button className={activeTab === 'city' ? 'active' : ''} onClick={() => setTab('city')} data-tab="city">
          <Icon name={city ? 'city' : 'flag'} size={14} /> {city ? 'City' : 'Province'}
        </button>
        {mine && city && (
          <button className={activeTab === 'recruit' ? 'active' : ''} onClick={() => setTab('recruit')} data-tab="recruit">
            <Icon name="shield" size={14} /> Recruit{ps.recruitQueue.length ? ` (${ps.recruitQueue.length})` : ''}
          </button>
        )}
        <button className={activeTab === 'armies' ? 'active' : ''} onClick={() => setTab('armies')} data-tab="armies">
          <Icon name="swords" size={14} /> Armies{armies.length ? ` (${armies.length})` : ''}
        </button>
      </nav>

      <div className="panel-body">
        {known && state.battles[pid] && <BattleBox ctrl={ctrl} pid={pid} />}
        {known && ps.capture && (
          <div className="capture-box">
            <span>
              <Icon name="target" size={14} /> {sentence(nationName(world, ps.capture.by))} capturing
              <span className="muted"> · {formatDuration(ps.capture.required - ps.capture.progress, state)} left</span>
            </span>
            <Progress value={ps.capture.progress / ps.capture.required} color={world.nations[ps.capture.by].color} />
          </div>
        )}
        {activeTab === 'city' && (!known ? <FogNote ctrl={ctrl} pid={pid} /> : city ? <CityTab ctrl={ctrl} pid={pid} /> : <LandTab ctrl={ctrl} pid={pid} />)}
        {activeTab === 'recruit' && <RecruitTab ctrl={ctrl} pid={pid} />}
        {activeTab === 'armies' && <ArmiesTab ctrl={ctrl} pid={pid} selectedArmies={selectedArmies} onSelectArmy={onSelectArmy} />}
      </div>
    </section>
  );
}

/**
 * A province without a city: no people to speak of and no recruiting, but armies march and fight over it, it earns
 * a little money and manpower, and it holds one building: an economy or military one, or infrastructure.
 */
function LandTab({ ctrl, pid }: { ctrl: GameController; pid: ProvinceId }) {
  const { state, world, human } = ctrl;
  const def = world.provinces[pid];
  const ps = state.provinces[pid];
  const mine = ps.owner === human;
  const res = state.nations[human].resources;
  const morale = provinceMoraleTarget(state, world, pid);
  const out = provinceOutput(state, world, pid);
  const standing = landBuildings(ps.buildings);
  const choices = BUILDING_ORDER.filter((b) => landSite(b) && (!BUILDINGS[b].coastalOnly || world.seaLandings.has(pid)));
  return (
    <>
      <p className="muted small land-note">
        {def.around
          ? `Land round ${world.provinces[def.around].name}: armies march and fight across it, and whoever holds all the land round the city can cut it off. `
          : 'Open country: armies march and fight across it. '}
        It earns a little money and manpower and holds one building; a new one replaces the old when it is finished, and
        land that is captured loses its building.
      </p>
      {ps.owner !== 'neutral' && (
        <Section title="Morale" icon="morale">
          <div className="meter-row">
            <span className="meter-label">Morale</span>
            <MoraleMeter value={ps.morale} target={morale.target} factors={morale.factors} />
          </div>
        </Section>
      )}
      {ps.owner !== 'neutral' && (
        <Section title="Output per minute" icon="factory">
          <div className="output-grid" title={def.core !== ps.owner ? 'Occupied: output follows morale; few recruits volunteer.' : undefined}>
            {RESOURCE_KEYS.filter((k) => out[k] > 0).map((k) => (
              <span key={k} className="output-tile" title={RESOURCE_LABEL[k]}>
                <ResourceIcon kind={k} size={16} />
                <span>{fmtRate(out[k])}</span>
              </span>
            ))}
          </div>
        </Section>
      )}
      {ps.construction && (
        <Section title="Under construction" icon="clock">
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
        </Section>
      )}
      {mine ? (
        <Section title="Building" icon="plus" extra={standing.length ? listText(standing.map((b) => BUILDINGS[b].name)) : 'None yet'}>
          {ps.construction && <p className="muted small build-note">One project at a time: new orders open when the current work is done.</p>}
          {(['economy', 'military', 'civic', 'infrastructure'] as BuildingCategory[]).map((cat) => {
            const rows = choices.filter((b) => BUILDINGS[b].category === cat);
            if (rows.length === 0) return null;
            return (
              <div key={cat} className="picker-group">
                <div className={`picker-cat cat-${cat}`}>{LAND_CATEGORY_LABEL[cat]}</div>
                <ul className="building-list">
                  {rows.map((b) => (
                    <BuildRow key={b} ctrl={ctrl} pid={pid} building={b} res={res} />
                  ))}
                </ul>
              </div>
            );
          })}
        </Section>
      ) : (
        <BuildingSummary buildings={ps.buildings} />
      )}
    </>
  );
}

/** A province under the fog of war shows this instead of its city: what is hidden, and how to see it. */
/** A radar blip's size in words. */
const BLIP_TEXT = { small: 'small', medium: 'medium-sized', large: 'large' } as const;

function FogNote({ ctrl, pid }: { ctrl: GameController; pid: ProvinceId }) {
  const { state, world, human } = ctrl;
  const allies = alliesOf(state, world, human).map((a) => world.nations[a].name);
  const blip = ctrl.radar().at.get(pid);
  const sightKm = UNITS.cavalry.sightKm ?? SIGHT.unitKm;
  const blipKm = UNITS.cavalry.blipKm ?? SIGHT.unitBlipKm;
  return (
    <div className="fog-note" data-testid="fog-note">
      <div className="fog-title">
        <Icon name="fog" size={15} /> Under the fog of war
      </div>
      {blip && (
        <p className="small" data-testid="fog-blip">
          Radar contact: an unknown army here, {BLIP_TEXT[blip.size]}. Whose it is and what it fields are hidden.
        </p>
      )}
      <p className="muted small">
        No reports come from here: its armies, battles, buildings and morale are hidden. You see your own territory and the province
        each of your armies stands in. Round each army you see enemy armies within {SIGHT.unitKm} km ({sightKm} km with cavalry or
        armoured cars), and further out, up to {SIGHT.unitBlipKm} km ({blipKm} km), you pick up unknown armies on the radar, as
        blips of a rough size. Your land picks up blips up to {SIGHT.landBlipKm} km from the middle of each province you hold.
      </p>
      <p className="muted small">
        {sharesAlliedSight(state, human)
          ? allies.length
            ? `Your liaison officers share what ${listText(allies)} can see, and none of them can see here either.`
            : 'Your liaison officers will share what other powers see once you fight a common enemy.'
          : 'Research Liaison Officers to see what your co-belligerents (powers fighting a common enemy) see.'}
      </p>
    </div>
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
  const slots = buildingSlots(state, world, pid);
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
              if (cfg.landOnly) return false;
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
  const city = !!world.provinces[pid].city;
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
  const fullCity = city && cfg.category !== 'infrastructure' && level === 0 && slotsUsed(ps.buildings, ps.construction?.building ?? null) >= buildingSlots(state, world, pid);
  const why = locked || maxed || rules.ok ? null : fullCity ? 'No free slot' : rules.reason.replace(/\.$/, '');
  // Land holds one building: a new one replaces whatever stands there.
  const replaces = city ? [] : landBuildings(ps.buildings).filter((b) => b !== building);
  const replaced = listText(replaces.map((b) => BUILDINGS[b].name));
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
        {!why && !locked && !maxed && replaces.length > 0 && <span className="bld-why">Replaces {replaced}</span>}
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
              title={check.ok ? `${cfg.description} Takes ${formatDuration(constructionTicks(state, human, building, nextLevel), state)}.${replaces.length ? ` Replaces the ${replaced} here when finished.` : ''}` : check.reason}
              onClick={() => ctrl.submit({ type: 'build', nation: human, province: pid, building })}
              data-build={building}
            >
              {level ? 'Upgrade' : replaces.length ? 'Replace' : 'Build'}
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

/**
 * Raising units in a city. Only what has been researched is offered. The training queue sits in a strip of
 * fixed height above the cards, so ordering several in a row never moves the buttons under your finger.
 */
function RecruitTab({ ctrl, pid }: { ctrl: GameController; pid: ProvinceId }) {
  const { state, world, human } = ctrl;
  const ps = state.provinces[pid];
  const [info, setInfo] = useState<UnitType | null>(null);
  const queued = (t: UnitType) => ps.recruitQueue.filter((j) => j.unitType === t).length;
  return (
    <>
      <div className="training-strip" data-testid="training-strip" aria-label="In training">
        <span className="ts-title">
          <Icon name="clock" size={13} /> Training {ps.recruitQueue.length}/{ARMY_RULES.maxRecruitQueue}
        </span>
        {ps.recruitQueue.length === 0 ? (
          <span className="ts-empty muted">Nothing in training</span>
        ) : (
          <ul className="ts-list">
            {ps.recruitQueue.map((j, i) => {
              const model = currentModel(state, world, human, j.unitType);
              return (
                <li key={i} className={i === 0 ? 'active' : ''} title={`${model.name}: ${i === 0 ? `ready in ${formatDuration(j.remaining, state)}` : 'queued'}`}>
                  <span className="unit-plate">
                    <UnitIconArt world={world} type={j.unitType} gen={unitGen(state, human, j.unitType)} nation={human} width={18} />
                  </span>
                  {i === 0 && <span className="ts-progress" style={{ width: `${(1 - j.remaining / j.total) * 100}%` }} />}
                  <button
                    className="ts-cancel"
                    title={refundTitle('training', j.remaining < j.total)}
                    aria-label={`Cancel ${model.name}`}
                    onClick={() => ctrl.submit({ type: 'cancelRecruit', nation: human, province: pid, index: i })}
                  >
                    <Icon name="close" size={10} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {(Object.keys(UNITS_BY_CLASS) as UnitClass[]).map((cls) => {
        // Units not yet researched are left out altogether: the research tree says what is coming.
        const types = UNITS_BY_CLASS[cls].filter((t) => isUnitUnlocked(state, human, t));
        if (types.length === 0) return null;
        return (
          <Section key={cls} title={CLASS_LABEL[cls]} icon={CLASS_ICON[cls]}>
            <div className="recruit-cards">
              {types.map((t) => (
                <RecruitCard key={t} ctrl={ctrl} pid={pid} type={t} queued={queued(t)} onInfo={() => setInfo(t)} />
              ))}
            </div>
          </Section>
        );
      })}
      {info && <UnitInfo ctrl={ctrl} type={info} nation={human} pid={pid} onClose={() => setInfo(null)} />}
    </>
  );
}

function RecruitCard({ ctrl, pid, type, queued, onInfo }: { ctrl: GameController; pid: ProvinceId; type: UnitType; queued: number; onInfo: () => void }) {
  const { state, world, human } = ctrl;
  const cfg = UNITS[type];
  const check = checkRecruit(state, world, human, pid, type);
  const gen = unitGen(state, human, type);
  const model = currentModel(state, world, human, type);
  const s = unitStats(state, human, type);
  const res = state.nations[human].resources;
  const net = nationEconomy(state, world, human).net;
  // A missing building is a lock; a short treasury is only a wait.
  const missing = cfg.requires.filter((b) => !state.provinces[pid].buildings[b]);
  const time = formatDuration(recruitTicks(state, human, type), state);
  return (
    <div className={`recruit-card${check.ok ? '' : ' disabled'}${missing.length ? ' locked' : ''}`} data-unit-card={type}>
      <button className="uc-info" onClick={onInfo} title={`What the ${cfg.name.toLowerCase()} do, and what they are good and bad at`} data-unit-info={type}>
        <UnitPicture world={world} type={type} gen={gen} nation={human} width={104} />
        <span className="uc-info-tag">
          <Icon name="info" size={12} /> Details
        </span>
      </button>
      {queued > 0 && (
        <span className="uc-queued" title={`${queued} in training here`}>
          +{queued}
        </span>
      )}
      <div className="uc-body">
        <button className="uc-name" onClick={onInfo} title={model.detail}>
          {model.name}
        </button>
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
            <span className="uc-price">
              <Cost cost={recruitCost(state, human, type)} have={res} />
              <Upkeep upkeep={cfg.upkeepPerMinute} net={net} />
            </span>
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
export function CompositionIcons({ world, state, army, size = 22 }: { world: World; state: GameState; army: Army; size?: number }) {
  const c = composition(army);
  return (
    <span className="ar-comp">
      {c.types.slice(0, 4).map(([t, n]) => (
        <span key={t} title={UNITS[t].name}>
          <span className="unit-plate">
            <UnitIconArt world={world} type={t} gen={unitGen(state, army.owner, t)} nation={army.owner} width={size} />
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
  const seen = ctrl.sight();
  const armies = armiesIn(state, world, pid).filter((a) => isArmyVisible(a, human, seen));
  return (
    <>
      {!seen.has(pid) && <p className="muted small fog-text">Under the fog of war: armies here cannot be seen.</p>}
      <Section title="Forces present" icon="swords" extra={armies.length ? armies.length : undefined}>
        {armies.length === 0 && <div className="muted empty">{seen.has(pid) ? 'No armies in this province' : 'None in sight'}</div>}
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
                  <span className="ar-name">
                    {name}
                    {a.road && <span className="muted small"> · road to {roadEndName(world, a.road.toward)}</span>}
                  </span>
                  <CompositionIcons world={world} state={state} army={a} size={20} />
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
