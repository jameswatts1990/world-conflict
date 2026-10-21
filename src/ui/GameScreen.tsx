import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CLIENT_SPEEDS } from '../sim/config/timing';
import { CITY } from '../sim/config/buildings';
import { armiesIn, eventsFor, type ArmyId, type GameEvent, type GameState, type ProvinceId } from '../sim';
import type { GameController } from './game/GameController';
import { OwnerFlag, Flag } from './flags';
import { Icon, type IconName } from './icons';
import { mapGeometry } from './map/geo';
import { MapView, type MapMode } from './map/MapView';
import { ArmyPanel } from './panels/ArmyPanel';
import { HelpDialog, LoadDialog, OutcomeDialog, SaveDialog } from './panels/Dialogs';
import { DiplomacyPanel } from './panels/DiplomacyPanel';
import { EventLog, eventIcon } from './panels/EventLog';
import { Legend } from './panels/Legend';
import { NavRail, type PanelId } from './panels/NavRail';
import { ProvincePanel, TERRAIN_LABEL } from './panels/ProvincePanel';
import { ResearchPanel } from './panels/ResearchPanel';
import { TopBar } from './panels/TopBar';
import { Tutorial } from './panels/Tutorial';

/** Width the floating selection dock covers on the right of the map (dock + margins). */
const DOCK_INSET = 396;
/** Event kinds that also pop up as alerts, not just in the feed. */
const ALERT_KINDS = new Set(['war', 'peace', 'research', 'eliminated', 'victory-warning', 'victory-averted', 'shortage', 'surrender']);
/** Map modes in toolbar order; V cycles through them. */
const MAP_MODES: [MapMode, string, IconName][] = [
  ['political', 'Political', 'flag'],
  ['terrain', 'Terrain', 'mountains'],
  ['supply', 'Supply', 'supply'],
  ['morale', 'Morale', 'morale'],
  ['development', 'Cities', 'city'],
];
const ALERT_MS = 7000;

interface Alert {
  event: GameEvent;
  at: number;
}

export function GameScreen({
  ctrl,
  showTutorial,
  onExit,
  onLoad,
}: {
  ctrl: GameController;
  showTutorial: boolean;
  onExit: () => void;
  onLoad: (state: GameState) => void;
}) {
  useSyncExternalStore(ctrl.subscribe, ctrl.getVersion);
  const { state, world, human } = ctrl;
  const geo = useMemo(() => mapGeometry(world), [world]);

  const [selectedProvince, setSelectedProvince] = useState<ProvinceId | null>(world.nations[human].capital);
  const [selectedArmies, setSelectedArmies] = useState<ArmyId[]>([]);
  const [moveMode, setMoveMode] = useState(false);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [tutorial, setTutorial] = useState(showTutorial);
  const [focus, setFocus] = useState<{ province: ProvinceId; seq: number } | null>(null);
  const [hover, setHover] = useState<ProvinceId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [outcomeSeen, setOutcomeSeen] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>('political');
  const [legendOpen, setLegendOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const lastEventId = useRef(state.nextEventId - 1);

  // Drop selections of armies that no longer exist.
  const liveArmies = selectedArmies.filter((id) => state.armies[id]);
  if (liveArmies.length !== selectedArmies.length) setSelectedArmies(liveArmies);

  // Raise alerts for important new events.
  useEffect(() => {
    const fresh = eventsFor(state, human).filter((e) => e.id > lastEventId.current);
    if (!fresh.length) return;
    lastEventId.current = fresh[fresh.length - 1].id;
    const important = fresh.filter((e) => ALERT_KINDS.has(e.kind) || (e.kind === 'capture' && e.text.includes('objective')));
    if (important.length) setAlerts((cur) => [...cur, ...important.map((event) => ({ event, at: Date.now() }))].slice(-4));
  }, [ctrl.version, state, human]);

  useEffect(() => {
    if (!alerts.length) return;
    const t = setTimeout(
      () =>
        setAlerts((cur) => {
          const live = cur.filter((a) => Date.now() - a.at < ALERT_MS);
          return live.length === cur.length ? cur : live;
        }),
      500,
    );
    return () => clearTimeout(t);
  }, [alerts, ctrl.version]);

  const focusOn = useCallback((pid: ProvinceId) => {
    setSelectedProvince(pid);
    setFocus((f) => ({ province: pid, seq: (f?.seq ?? 0) + 1 }));
  }, []);

  const selectArmy = useCallback(
    (id: ArmyId, additive: boolean) => {
      const army = ctrl.state.armies[id];
      if (!army) return;
      setSelectedArmies((cur) => {
        if (additive && army.owner === ctrl.human && cur.every((c) => ctrl.state.armies[c]?.owner === ctrl.human)) {
          return cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id];
        }
        return [id];
      });
      setSelectedProvince(army.move?.leg ? army.move.leg.from : army.province);
      setMoveMode(false);
    },
    [ctrl],
  );

  const orderMove = useCallback(
    (pid: ProvinceId) => {
      const own = selectedArmies.filter((id) => ctrl.state.armies[id]?.owner === ctrl.human);
      let lastError: string | null = null;
      for (const id of own) {
        const r = ctrl.submit({ type: 'move', nation: ctrl.human, armyId: id, to: pid });
        if (!r.ok) lastError = r.reason;
      }
      if (lastError) setToast(lastError);
      setMoveMode(false);
    },
    [ctrl, selectedArmies],
  );

  const selectProvince = useCallback((pid: ProvinceId | null) => {
    setSelectedProvince(pid);
    setSelectedArmies([]);
    setMoveMode(false);
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.key === ' ') {
        e.preventDefault();
        ctrl.togglePause();
      } else if (e.key >= '1' && e.key <= String(CLIENT_SPEEDS.length)) {
        ctrl.setSpeed(CLIENT_SPEEDS[Number(e.key) - 1].multiplier);
      } else if (e.key === 'Escape') {
        if (moveMode) setMoveMode(false);
        else if (panel) setPanel(null);
        else {
          setSelectedArmies([]);
          setSelectedProvince(null);
        }
      } else if (e.key === 'r' || e.key === 'R') setPanel((p) => (p === 'research' ? null : 'research'));
      else if (e.key === 'd' || e.key === 'D') setPanel((p) => (p === 'diplomacy' ? null : 'diplomacy'));
      else if (e.key === 'h' || e.key === 'H' || e.key === '?') setPanel('help');
      else if ((e.key === 'm' || e.key === 'M') && selectedArmies.length) setMoveMode((m) => !m);
      else if ((e.key === 's' || e.key === 'S') && selectedArmies.length) {
        for (const id of selectedArmies) if (ctrl.state.armies[id]?.move) ctrl.submit({ type: 'stop', nation: ctrl.human, armyId: id });
      } else if (e.key === 'l' || e.key === 'L') setFeedOpen((o) => !o);
      else if (e.key === 'k' || e.key === 'K') setLegendOpen((o) => !o);
      else if (e.key === 'v' || e.key === 'V') setMapMode((m) => MAP_MODES[(MAP_MODES.findIndex(([id]) => id === m) + 1) % MAP_MODES.length][0]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctrl, moveMode, panel, selectedArmies]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const offers = state.outcome ? [] : state.peaceOffers.filter((o) => o.to === human);
  const armySelected = selectedArmies.length > 0 && !!state.armies[selectedArmies[0]];
  const dockOpen = armySelected || !!selectedProvince;

  return (
    <div className="game-screen">
      <TopBar ctrl={ctrl} onOpen={(p) => setPanel(p)} />
      <div className="game-body">
        <NavRail
          ctrl={ctrl}
          active={panel}
          feedOpen={feedOpen}
          onToggleFeed={() => setFeedOpen((o) => !o)}
          onOpen={(p) => (p === 'menu' ? onExit() : setPanel(p))}
        />
        <div className="map-wrap">
          <MapView
            ctrl={ctrl}
            geo={geo}
            selectedProvince={selectedProvince}
            selectedArmies={selectedArmies}
            moveMode={moveMode}
            focus={focus}
            mapMode={mapMode}
            insetRight={DOCK_INSET}
            onSelectProvince={selectProvince}
            onSelectArmy={selectArmy}
            onOrderMove={orderMove}
            onHover={setHover}
          />

          <div className="map-toolbar">
            <div className="segmented" role="group" aria-label="Map mode">
              {MAP_MODES.map(([m, label, icon]) => (
                <button key={m} className={mapMode === m ? 'active' : ''} onClick={() => setMapMode(m)} data-map-mode={m} title={`${label} map (V cycles)`}>
                  <Icon name={icon} size={15} />
                  <span className="seg-label">{label}</span>
                </button>
              ))}
            </div>
            <button className={`chip-btn${legendOpen ? ' active' : ''}`} onClick={() => setLegendOpen((o) => !o)} title="Map key (K)">
              <Icon name="legend" size={15} />
              <span className="seg-label">Key</span>
            </button>
          </div>
          {legendOpen && <Legend world={world} human={human} mode={mapMode} onClose={() => setLegendOpen(false)} />}

          <div className="banner-stack">
            {ctrl.loop.paused && !state.outcome && (
              <div className="banner paused-banner">
                <Icon name="pause" size={16} /> Paused <span className="muted">— press Space to resume</span>
              </div>
            )}
            {ctrl.loop.speed > 2 && !ctrl.loop.paused && <div className="banner dev-banner">Development speed {ctrl.loop.speed}x</div>}
            {moveMode && (
              <div className="banner hint-banner">
                <Icon name="target" size={16} /> Choose a destination — click a province <span className="muted">(Esc to cancel)</span>
              </div>
            )}
          </div>

          <HoverCard ctrl={ctrl} pid={hover} />

          <div className="alert-stack">
            {offers.map((o) => (
              <div key={`offer-${o.from}`} className="alert-card offer">
                <Flag id={o.from} size={22} />
                <div className="alert-body">
                  <div className="alert-title">Peace proposal</div>
                  <div>
                    <strong>{world.nations[o.from].name}</strong> offers peace on status quo borders.
                  </div>
                  <div className="btn-row">
                    <button className="primary" onClick={() => ctrl.submit({ type: 'respondPeace', nation: human, from: o.from, accept: true })}>
                      Accept
                    </button>
                    <button onClick={() => ctrl.submit({ type: 'respondPeace', nation: human, from: o.from, accept: false })}>Reject</button>
                  </div>
                </div>
              </div>
            ))}
            {alerts.map(({ event: e }) => (
              <div
                key={e.id}
                className={`alert-card sev-${e.severity}${e.province ? ' clickable' : ''}`}
                onClick={() => e.province && focusOn(e.province)}
              >
                <span className="alert-icon">
                  <Icon name={eventIcon(e)} size={18} />
                </span>
                <div className="alert-body">{e.text}</div>
                <button
                  className="icon-btn"
                  aria-label="Dismiss"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setAlerts((cur) => cur.filter((a) => a.event.id !== e.id));
                  }}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>

          <EventLog ctrl={ctrl} open={feedOpen} onToggle={() => setFeedOpen((o) => !o)} onFocus={focusOn} />
          {toast && (
            <div className="toast">
              <Icon name="warning" size={16} /> {toast}
            </div>
          )}

          {dockOpen && (
            <aside className="selection-dock">
              {armySelected && (
                <ArmyPanel
                  key={selectedArmies[0]}
                  ctrl={ctrl}
                  armyIds={selectedArmies}
                  moveMode={moveMode}
                  onMoveMode={setMoveMode}
                  onSelectArmies={setSelectedArmies}
                  onClose={() => {
                    setSelectedArmies([]);
                    setMoveMode(false);
                  }}
                />
              )}
              {selectedProvince && (
                <ProvincePanel
                  ctrl={ctrl}
                  pid={selectedProvince}
                  selectedArmies={selectedArmies}
                  onSelectArmy={selectArmy}
                  onClose={() => setSelectedProvince(null)}
                />
              )}
            </aside>
          )}
        </div>
      </div>

      {panel === 'research' && <ResearchPanel ctrl={ctrl} onClose={() => setPanel(null)} />}
      {panel === 'diplomacy' && (
        <DiplomacyPanel
          ctrl={ctrl}
          onClose={() => setPanel(null)}
          onFocus={(pid) => {
            setPanel(null);
            focusOn(pid);
          }}
        />
      )}
      {panel === 'save' && <SaveDialog ctrl={ctrl} onClose={() => setPanel(null)} />}
      {panel === 'load' && <LoadDialog world={world} scenarioId={world.scenario.id} onLoad={onLoad} onClose={() => setPanel(null)} />}
      {panel === 'help' && <HelpDialog ctrl={ctrl} onClose={() => setPanel(null)} />}
      {tutorial && <Tutorial world={world} nationName={world.nations[human].name} onClose={() => setTutorial(false)} />}
      {state.outcome && !outcomeSeen && <OutcomeDialog ctrl={ctrl} onMenu={onExit} onClose={() => setOutcomeSeen(true)} />}
    </div>
  );
}

/** Province summary that follows the cursor over the map. */
function HoverCard({ ctrl, pid }: { ctrl: GameController; pid: ProvinceId | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const onMove = (e: MouseEvent) => {
      const card = ref.current;
      if (!card) return;
      const r = host.getBoundingClientRect();
      let x = e.clientX - r.left + 18;
      let y = e.clientY - r.top + 20;
      if (x + card.offsetWidth > r.width - 8) x = e.clientX - r.left - card.offsetWidth - 14;
      if (y + card.offsetHeight > r.height - 8) y = e.clientY - r.top - card.offsetHeight - 14;
      card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };
    host.addEventListener('mousemove', onMove);
    return () => host.removeEventListener('mousemove', onMove);
  }, []);

  const { world, state, human } = ctrl;
  let body = null;
  if (pid) {
    const def = world.provinces[pid];
    const ps = state.provinces[pid];
    const owner = ps.owner;
    const armies = armiesIn(state, pid);
    const ownUnits = armies.filter((a) => a.owner === human).reduce((n, a) => n + a.units.length, 0);
    const otherUnits = armies.filter((a) => a.owner !== human).reduce((n, a) => n + a.units.length, 0);
    body = (
      <>
        <div className="hc-head">
          <OwnerFlag world={world} owner={owner} province={pid} size={14} />
          <span className="hc-owner">{owner === 'neutral' ? `${def.neutralState} · neutral` : world.nations[owner].name}</span>
        </div>
        <div className="hc-name">{def.name}</div>
        <div className="hc-row">
          <span>
            <Icon name={def.terrain} size={13} /> {TERRAIN_LABEL[def.terrain]}
          </span>
          <span>
            <Icon name="city" size={13} /> {def.city.name} · {CITY.tierNames[ps.tier]}
          </span>
          {def.objectiveVp ? <span className="hc-vp">★ {def.objectiveVp} VP</span> : null}
        </div>
        {owner !== 'neutral' && (
          <div className="hc-row">
            <span className={ps.morale >= 60 ? 'ok' : ps.morale < 35 ? 'bad' : 'warn-text'}>
              <Icon name="morale" size={13} /> Morale {Math.round(ps.morale)}
            </span>
          </div>
        )}
        {(ownUnits > 0 || otherUnits > 0 || state.battles[pid] || ps.capture) && (
          <div className="hc-row">
            {ownUnits > 0 && <span className="ok">{ownUnits} own units</span>}
            {otherUnits > 0 && <span className={owner === human ? 'bad' : ''}>{otherUnits} foreign units</span>}
            {state.battles[pid] && (
              <span className="bad">
                <Icon name="swords" size={13} /> Battle
              </span>
            )}
            {ps.capture && <span className="warn-text">Being captured</span>}
          </div>
        )}
      </>
    );
  }
  return (
    <div ref={ref} className={`hover-card${pid ? '' : ' hidden'}`} aria-hidden>
      {body}
    </div>
  );
}
