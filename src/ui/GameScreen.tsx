import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DIPLOMACY } from '../sim/config/rules';
import { CLIENT_SPEEDS, TICKS_PER_MINUTE } from '../sim/config/timing';
import {
  UNIT_TYPES,
  armiesIn,
  eventsFor,
  nationName,
  provinceName,
  scaledTicks,
  sentence,
  type ArmyId,
  type EventSeverity,
  type GameEvent,
  type GameState,
  type ProvinceId,
} from '../sim';
import type { GameController } from './game/GameController';
import { OwnerFlag, Flag } from './flags';
import { formatDuration } from './format';
import { Icon, UnitGlyph } from './icons';
import { TERRAIN_LABEL, armyName, composition, ownerLabel } from './labels';
import { mapGeometry } from './map/geo';
import { MapView, type MapMode } from './map/MapView';
import { ArmyPanel } from './panels/ArmyPanel';
import { ConfirmDialog } from './panels/Common';
import { HelpDialog, LoadDialog, OutcomeDialog, SaveDialog } from './panels/Dialogs';
import { DiplomacyPanel } from './panels/DiplomacyPanel';
import { EventLog, eventIcon } from './panels/EventLog';
import { Legend } from './panels/Legend';
import { NavRail, type PanelId } from './panels/NavRail';
import { ProvincePanel } from './panels/ProvincePanel';
import { ResearchPanel } from './panels/ResearchPanel';
import { TopBar } from './panels/TopBar';
import { Tutorial } from './panels/Tutorial';

/** Width the floating selection dock covers on the right of the map (dock + margins). */
const DOCK_INSET = 396;
/** How long an alert stays up while the game runs; alerts wait while it is paused. */
const ALERT_MS = 8000;
const ALERT_STEP_MS = 250;
const MAX_ALERTS = 4;

interface Alert {
  event: GameEvent;
  tone: EventSeverity;
  age: number;
}

/** Whether a new event deserves a pop-up for this player, and in which tone. */
function alertTone(ctrl: GameController, e: GameEvent): EventSeverity | null {
  const { state, world, human } = ctrl;
  switch (e.kind) {
    case 'war':
    case 'peace':
    case 'research':
    case 'shortage':
    case 'eliminated':
    case 'victory-warning':
    case 'victory-averted':
      return e.severity;
    case 'capture': {
      const pid = e.province!;
      if (state.provinces[pid].owner === human) return 'good';
      if (e.subject === human) return 'bad';
      return world.provinces[pid].objectiveVp ? e.severity : null;
    }
    case 'battle':
      // Our own attacks are no surprise; an enemy attacking our land is.
      return e.province && state.provinces[e.province].owner === human ? 'bad' : null;
    case 'army-destroyed':
    case 'peace-rejected':
      // Our army lost, or our offer turned down.
      return e.subject === human ? 'bad' : null;
    default:
      return null;
  }
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
  const [hover, setHover] = useState<{ pid: ProvinceId; army?: ArmyId } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [outcomeSeen, setOutcomeSeen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>('political');
  const [legendOpen, setLegendOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const lastEventId = useRef(state.nextEventId - 1);
  const dockRef = useRef<HTMLElement>(null);

  // Drop selections of armies that no longer exist.
  const liveArmies = selectedArmies.filter((id) => state.armies[id]);
  if (liveArmies.length !== selectedArmies.length) setSelectedArmies(liveArmies);

  // Raise alerts for important new events.
  useEffect(() => {
    const fresh = eventsFor(state, human).filter((e) => e.id > lastEventId.current);
    if (!fresh.length) return;
    lastEventId.current = fresh[fresh.length - 1].id;
    const raised: Alert[] = [];
    for (const event of fresh) {
      const tone = alertTone(ctrl, event);
      if (tone) raised.push({ event, tone, age: 0 });
    }
    if (raised.length) setAlerts((cur) => [...cur, ...raised].slice(-MAX_ALERTS));
  }, [ctrl, ctrl.version, state, human]);

  // Alerts age only while the campaign runs, so nothing is missed during a pause.
  const hasAlerts = alerts.length > 0;
  useEffect(() => {
    if (!hasAlerts) return;
    const timer = setInterval(() => {
      if (ctrl.loop.paused && !ctrl.state.outcome) return;
      setAlerts((cur) => cur.map((a) => ({ ...a, age: a.age + ALERT_STEP_MS })).filter((a) => a.age < ALERT_MS));
    }, ALERT_STEP_MS);
    return () => clearInterval(timer);
  }, [ctrl, hasAlerts]);

  // A new selection starts at the top of the dock, where its card is.
  useEffect(() => {
    dockRef.current?.scrollTo({ top: 0 });
  }, [selectedProvince, selectedArmies[0]]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const exitToMenu = useCallback(() => (ctrl.state.outcome ? onExit() : setConfirmExit(true)), [ctrl, onExit]);

  // Keyboard shortcuts. Open dialogs handle Escape themselves (see useEscape).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      // Leave browser shortcuts (Ctrl+1 switches tabs) alone.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (e.key === ' ') {
        e.preventDefault();
        ctrl.togglePause();
      } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= CLIENT_SPEEDS.length) {
        ctrl.setSpeed(CLIENT_SPEEDS[Number(e.key) - 1].multiplier);
      } else if (e.key === 'Escape') {
        if (moveMode) setMoveMode(false);
        else if (legendOpen) setLegendOpen(false);
        else {
          setSelectedArmies([]);
          setSelectedProvince(null);
        }
      } else if (key === 'r') setPanel((p) => (p === 'research' ? null : 'research'));
      else if (key === 'd') setPanel((p) => (p === 'diplomacy' ? null : 'diplomacy'));
      else if (key === 'h' || e.key === '?') setPanel('help');
      else if (key === 'm' && selectedArmies.length) setMoveMode((m) => !m);
      else if (key === 's' && selectedArmies.length) {
        for (const id of selectedArmies) if (ctrl.state.armies[id]?.move) ctrl.submit({ type: 'stop', nation: ctrl.human, armyId: id });
      } else if (key === 'l') setFeedOpen((o) => !o);
      else if (key === 'k') setLegendOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctrl, moveMode, legendOpen, selectedArmies]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const offers = state.outcome ? [] : state.peaceOffers.filter((o) => o.to === human);
  const offerTicks = scaledTicks(state, DIPLOMACY.peaceOfferExpirySeconds);
  const armySelected = selectedArmies.length > 0 && !!state.armies[selectedArmies[0]];
  const dockOpen = armySelected || !!selectedProvince;
  const outcome = state.outcome;

  return (
    <div className="game-screen">
      <TopBar ctrl={ctrl} onOpen={(p) => setPanel(p)} />
      <div className="game-body">
        <NavRail
          ctrl={ctrl}
          active={panel}
          feedOpen={feedOpen}
          onToggleFeed={() => setFeedOpen((o) => !o)}
          onOpen={(p) => (p === 'menu' ? exitToMenu() : setPanel(p))}
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
            onHover={(pid, army) => setHover(pid ? { pid, army } : null)}
          />

          <div className="map-toolbar">
            <div className="segmented" role="group" aria-label="Map mode">
              {(
                [
                  ['political', 'Political', 'flag'],
                  ['terrain', 'Terrain', 'mountains'],
                  ['supply', 'Supply', 'supply'],
                ] as const
              ).map(([m, label, icon]) => (
                <button key={m} className={mapMode === m ? 'active' : ''} onClick={() => setMapMode(m)} data-map-mode={m} title={`${label} map`}>
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
            {outcome && outcomeSeen && (
              <div className="banner outcome-banner-bar">
                <Icon name="star" size={16} /> Campaign over
                <span className="muted">— {outcome.winner ? `${nationName(world, outcome.winner)} wins` : 'no winner'}</span>
                <button className="primary" onClick={() => setOutcomeSeen(false)}>
                  Results
                </button>
              </div>
            )}
            {ctrl.loop.paused && !outcome && (
              <div className="banner paused-banner">
                <Icon name="pause" size={16} /> Paused <span className="muted">— press Space to resume</span>
              </div>
            )}
            {ctrl.loop.speed > 2 && !ctrl.loop.paused && <div className="banner dev-banner">Development speed {ctrl.loop.speed}x</div>}
            {moveMode && (
              <div className="banner hint-banner">
                <Icon name="target" size={16} /> Choose a destination — click a province or an enemy army <span className="muted">(Esc to cancel)</span>
              </div>
            )}
          </div>

          <HoverCard ctrl={ctrl} pid={hover?.pid ?? null} armyId={hover?.army} />

          <div className="alert-stack">
            {offers.map((o) => (
              <div key={`offer-${o.from}`} className="alert-card offer" data-testid="peace-offer">
                <Flag id={o.from} size={22} />
                <div className="alert-body">
                  <div className="alert-title">Peace proposal</div>
                  <div>
                    <strong>{sentence(nationName(world, o.from))}</strong> offers peace on current borders.
                  </div>
                  <div className="offer-timer" title="Time left to answer">
                    <span style={{ width: `${Math.max(0, (o.expiresAt - state.tick) / offerTicks) * 100}%` }} />
                  </div>
                  <div className="btn-row">
                    <button className="primary" onClick={() => ctrl.submit({ type: 'respondPeace', nation: human, from: o.from, accept: true })}>
                      Accept
                    </button>
                    <button onClick={() => ctrl.submit({ type: 'respondPeace', nation: human, from: o.from, accept: false })}>Reject</button>
                    <span className="muted offer-left">{formatDuration(o.expiresAt - state.tick, state)} to answer</span>
                  </div>
                </div>
              </div>
            ))}
            {alerts.map(({ event: e, tone }) => (
              <div
                key={e.id}
                className={`alert-card sev-${tone}${e.province ? ' clickable' : ''}`}
                onClick={() => e.province && focusOn(e.province)}
                title={e.province ? 'Show on the map' : undefined}
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
            <div className="toast" role="alert">
              <Icon name="warning" size={16} /> {toast}
            </div>
          )}

          {dockOpen && (
            <aside className="selection-dock" ref={dockRef}>
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
      {panel === 'help' && (
        <HelpDialog
          onClose={() => setPanel(null)}
          onReplayBriefing={() => {
            // The briefing says the game is paused: make it so.
            ctrl.setPaused(true);
            setPanel(null);
            setTutorial(true);
          }}
        />
      )}
      {tutorial && (
        <Tutorial
          world={world}
          nationName={nationName(world, human)}
          limitMinutes={state.settings.timeLimitTicks / TICKS_PER_MINUTE / state.settings.durationScale}
          onClose={() => setTutorial(false)}
        />
      )}
      {outcome && !outcomeSeen && <OutcomeDialog ctrl={ctrl} onMenu={onExit} onClose={() => setOutcomeSeen(true)} />}
      {confirmExit && (
        <ConfirmDialog title="Leave the campaign?" icon="exit" confirmLabel="Main menu" onCancel={() => setConfirmExit(false)} onConfirm={onExit}>
          <p>The campaign is autosaved: resume it any time with Load game on the main menu.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Summary of the province (and army) under the cursor, following the pointer. */
function HoverCard({ ctrl, pid, armyId }: { ctrl: GameController; pid: ProvinceId | null; armyId?: ArmyId }) {
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
    const army = armyId ? state.armies[armyId] : undefined;
    const c = army ? composition(army) : null;
    body = (
      <>
        {army && c && (
          <div className="hc-army">
            <div className="hc-head">
              <OwnerFlag world={world} owner={army.owner} province={army.province} size={14} />
              <span className="hc-owner">{armyName(world, army)}</span>
            </div>
            <div className="hc-units">
              {UNIT_TYPES.filter((t) => c[t] > 0).map((t) => (
                <span key={t}>
                  <UnitGlyph type={t} size={18} /> {c[t]}
                </span>
              ))}
              <span className="hc-str">{Math.round(c.strength * 100)}% strength</span>
            </div>
            {army.move?.leg && <div className="hc-row">Marching to {provinceName(world, army.move.leg.to)}</div>}
            {!army.supplied && <div className="hc-row bad">Out of supply</div>}
          </div>
        )}
        <div className="hc-head">
          <OwnerFlag world={world} owner={owner} province={pid} size={14} />
          <span className="hc-owner">{ownerLabel(world, owner, pid)}</span>
        </div>
        <div className="hc-name">{def.name}</div>
        <div className="hc-row">
          <span>
            <Icon name={def.terrain} size={13} /> {TERRAIN_LABEL[def.terrain]}
          </span>
          <span>
            <Icon name="city" size={13} /> {def.city.name}
          </span>
          {def.objectiveVp ? <span className="hc-vp">★ {def.objectiveVp} VP</span> : null}
        </div>
        {(ownUnits > 0 || otherUnits > 0 || state.battles[pid] || ps.capture) && (
          <div className="hc-row">
            {ownUnits > 0 && <span className="ok">{ownUnits} of your units</span>}
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
