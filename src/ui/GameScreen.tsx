import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { BUILDINGS, BUILDING_ORDER, CITY, slotsUsed } from '../sim/config/buildings';
import { DIPLOMACY } from '../sim/config/rules';
import { concernsPlayer } from '../audio/cues';
import { CLIENT_SPEEDS, TICKS_PER_MINUTE } from '../sim/config/timing';
import {
  armiesIn,
  armyMorale,
  armyName,
  atWar,
  buildingSlots,
  checkDeclareWar,
  eventsFor,
  isArmyVisible,
  nationName,
  provinceName,
  scaledTicks,
  sentence,
  type ArmyId,
  type EventSeverity,
  type GameEvent,
  type GameState,
  type MoveMode,
  type NationId,
  type OwnerId,
  type ProvinceId,
  unitGen,
} from '../sim';
import { BuildingGlyphArt, UnitIconArt, plinthColor } from './art/adapters';
import { lighten } from './color';
import type { GameController } from './game/GameController';
import { OwnerFlag, Flag } from './flags';
import { countOf, formatDuration } from './format';
import { Icon, type IconName } from './icons';
import { ORDER, TERRAIN_LABEL, composition, ownerLabel, ownerShortName } from './labels';
import { useLayout, useTouch } from './layout';
import { mapGeometry } from './map/geo';
import { MapView, routePreview, type MapMode } from './map/MapView';
import { ArmyPanel } from './panels/ArmyPanel';
import { ConfirmDialog } from './panels/Common';
import { HelpDialog, LoadDialog, OutcomeDialog, SaveDialog } from './panels/Dialogs';
import { DeclareWarDialog, DiplomacyPanel } from './panels/DiplomacyPanel';
import { EventLog, eventIcon } from './panels/EventLog';
import { Legend } from './panels/Legend';
import { NavRail, type PanelId } from './panels/NavRail';
import { ProvincePanel } from './panels/ProvincePanel';
import { ResearchPanel } from './panels/ResearchPanel';
import { SoundDialog } from './panels/SoundDialog';
import { TopBar } from './panels/TopBar';
import { Tutorial } from './panels/Tutorial';

/** Width the floating selection dock covers on the right of the map (dock + margins). */
const DOCK_INSET = 396;
/** Width of the landscape layout's side sheet, min(340px, 46vw) in styles.css, with its margin. */
const sideSheetInset = () => Math.min(340, window.innerWidth * 0.46) + 8;

/** Resting heights of the portrait layout's bottom sheet. */
type SheetSnap = 'peek' | 'half' | 'full';
/** Peek shows the selection's title, status and close button. */
const SHEET_PEEK = 132;
function sheetHeights(mapHeight: number): Record<SheetSnap, number> {
  return { peek: SHEET_PEEK, half: Math.max(SHEET_PEEK, Math.round(mapHeight * 0.5)), full: Math.max(SHEET_PEEK, mapHeight - 6) };
}
/** How long an alert stays up while the game runs; alerts wait while it is paused. */
const ALERT_MS = 8000;
const ALERT_STEP_MS = 250;
const MAX_ALERTS = 4;
/** Map modes in toolbar order; V cycles through them. */
const MAP_MODES: [MapMode, string, IconName][] = [
  ['political', 'Political', 'flag'],
  ['terrain', 'Terrain', 'mountains'],
  ['supply', 'Supply', 'supply'],
  ['morale', 'Morale', 'morale'],
  ['development', 'Cities', 'city'],
];

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
      // War on us is bad news; our own declaration, and other powers' wars that concern us, are worth knowing.
      return e.subject === human ? 'bad' : e.actor === human ? 'combat' : concernsPlayer(state, world, human, e) ? 'info' : null;
    case 'peace':
      return e.subject === human || e.actor === human ? 'good' : concernsPlayer(state, world, human, e) ? 'info' : null;
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
    case 'rout':
      // An enemy pulled out of a battle with us.
      return e.subject !== human && e.nations.includes(human) ? 'good' : null;
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
  const layout = useLayout();
  const touch = useTouch();
  const compact = layout !== 'desktop';

  // The desktop opens on the capital's city; a phone keeps the map clear until something is tapped.
  // The desktop opens on your capital's city, once the opening briefing (if any) is out of the way.
  const [selectedProvince, setSelectedProvince] = useState<ProvinceId | null>(compact || showTutorial ? null : world.nations[human].capital);
  const capitalShown = useRef(!showTutorial);
  const [selectedArmies, setSelectedArmies] = useState<ArmyId[]>([]);
  // The march order being given, while a destination is picked.
  const [moveMode, setMoveMode] = useState<MoveMode | null>(null);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [tutorial, setTutorial] = useState(showTutorial);
  const [focus, setFocus] = useState<{ province: ProvinceId; seq: number } | null>(null);
  const [hover, setHover] = useState<{ pid: ProvinceId; army?: ArmyId } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [outcomeSeen, setOutcomeSeen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  /** An order into a nation we are at peace with, waiting on the player's answer to declaring war. */
  const [warOrder, setWarOrder] = useState<{ target: NationId; to: ProvinceId; mode: MoveMode; armies: ArmyId[] } | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>('political');
  const [legendOpen, setLegendOpen] = useState(false);
  // Small screens start with the reports closed: they open from the command bar.
  const [feedOpen, setFeedOpen] = useState(!compact);
  // The last event seen in the reports; opening or closing them marks everything read.
  const [reportsSeen, setReportsSeen] = useState(state.nextEventId - 1);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  // Portrait layout: how far the selection's bottom sheet is pulled up.
  const [sheet, setSheet] = useState<SheetSnap>('peek');
  const [mapHeight, setMapHeight] = useState(() => window.innerHeight);
  // Touch move mode: the destination tapped once, previewed until confirmed.
  const [moveTarget, setMoveTarget] = useState<ProvinceId | null>(null);
  const lastEventId = useRef(state.nextEventId - 1);
  const dockRef = useRef<HTMLElement>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mapWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMapHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Drop selections of armies that no longer exist, or that have gone into the fog of war.
  const seen = ctrl.sight();
  const liveArmies = selectedArmies.filter((id) => state.armies[id] && isArmyVisible(state.armies[id], human, seen));
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
      setMoveMode(null);
    },
    [ctrl],
  );

  /** The next (or previous) of your armies, in the order they were raised: selected, and brought into view. */
  const cycleArmy = useCallback(
    (dir: 1 | -1) => {
      const own = Object.values(ctrl.state.armies)
        .filter((a) => a.owner === ctrl.human)
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      if (!own.length) return;
      const i = own.findIndex((a) => a.id === selectedArmies[0]);
      const next = own[i < 0 ? (dir > 0 ? 0 : own.length - 1) : (i + dir + own.length) % own.length];
      selectArmy(next.id, false);
      setFocus((f) => ({ province: next.move?.leg ? next.move.leg.from : next.province, seq: (f?.seq ?? 0) + 1 }));
    },
    [ctrl, selectedArmies, selectArmy],
  );

  const issueMoves = useCallback(
    (armies: ArmyId[], pid: ProvinceId, mode: MoveMode) => {
      let lastError: string | null = null;
      for (const id of armies) {
        if (ctrl.state.armies[id]?.owner !== ctrl.human) continue;
        const r = ctrl.submit({ type: 'move', nation: ctrl.human, armyId: id, to: pid, mode });
        if (!r.ok) lastError = r.reason;
      }
      if (lastError) setToast(lastError);
    },
    [ctrl],
  );

  const orderMove = useCallback(
    (pid: ProvinceId) => {
      const own = selectedArmies.filter((id) => ctrl.state.armies[id]?.owner === ctrl.human);
      const owner = ctrl.state.provinces[pid].owner;
      // A right-click without a chosen order attacks into foreign land and moves within our own.
      const mode = moveMode ?? (owner === ctrl.human ? 'move' : 'attack');
      setMoveMode(null);
      // Marching on a nation we are at peace with asks to declare war first; the order follows the declaration.
      if (own.length && owner !== ctrl.human && owner !== 'neutral' && !atWar(ctrl.state, ctrl.human, owner)) {
        const check = checkDeclareWar(ctrl.state, ctrl.human, owner);
        if (check.ok) setWarOrder({ target: owner, to: pid, mode, armies: own });
        else setToast(`At peace with ${nationName(world, owner)}. ${check.reason}`);
        return;
      }
      issueMoves(own, pid, mode);
    },
    [ctrl, world, selectedArmies, moveMode, issueMoves],
  );

  const selectProvince = useCallback((pid: ProvinceId | null) => {
    setSelectedProvince(pid);
    setSelectedArmies([]);
    setMoveMode(null);
    // Tapping the province already selected raises a peeking sheet too.
    if (pid) setSheet((s) => (s === 'peek' ? 'half' : s));
  }, []);

  // Moving: in portrait the sheet drops to peek so the map is free to pick a destination.
  useEffect(() => {
    if (moveMode && layout === 'portrait') setSheet('peek');
    if (!moveMode) setMoveTarget(null);
  }, [moveMode, layout]);

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
        if (moveMode) setMoveMode(null);
        else if (legendOpen) setLegendOpen(false);
        else {
          setSelectedArmies([]);
          setSelectedProvince(null);
        }
      } else if (key === 'r') setPanel((p) => (p === 'research' ? null : 'research'));
      else if (key === 'd') setPanel((p) => (p === 'diplomacy' ? null : 'diplomacy'));
      else if (key === 'h' || e.key === '?') setPanel('help');
      else if ((key === 'm' || key === 'a' || key === 'p') && selectedArmies.length) {
        const order: MoveMode = key === 'm' ? 'move' : key === 'a' ? 'attack' : 'patrol';
        setMoveMode((m) => (m === order ? null : order));
      } else if (key === 'g' && selectedArmies.length) {
        // Hold position, or release it if every selected army already holds.
        const own = selectedArmies.map((id) => ctrl.state.armies[id]).filter((a) => a?.owner === ctrl.human);
        const hold = !own.every((a) => a.holding);
        for (const a of own) ctrl.submit({ type: 'hold', nation: ctrl.human, armyId: a.id, hold });
        setMoveMode(null);
      }
      else if (key === 's' && selectedArmies.length) {
        for (const id of selectedArmies) {
          const move = ctrl.state.armies[id]?.move;
          if (move && !move.halting) ctrl.submit({ type: 'stop', nation: ctrl.human, armyId: id });
        }
      } else if (key === 'c' || e.key === 'Home') focusOn(world.nations[human].capital);
      else if (e.key === '.' || e.key === ',') cycleArmy(e.key === '.' ? 1 : -1);
      else if (key === 'l') setFeedOpen((o) => !o);
      else if (key === 'k') setLegendOpen((o) => !o);
      else if (key === 'v') setMapMode((m) => MAP_MODES[(MAP_MODES.findIndex(([id]) => id === m) + 1) % MAP_MODES.length][0]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctrl, moveMode, legendOpen, selectedArmies, focusOn, cycleArmy, world, human]);

  useEffect(() => setReportsSeen(ctrl.state.nextEventId - 1), [ctrl, feedOpen]);
  const unreadReports = compact && !feedOpen ? eventsFor(state, human).filter((e) => e.id > reportsSeen).length : 0;

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

  // A new selection raises the portrait sheet to half, where an army's orders are in reach;
  // a taller sheet keeps its height.
  const selectionKey = `${selectedArmies[0] ?? ''}|${selectedProvince ?? ''}`;
  const lastSelection = useRef(selectionKey);
  useEffect(() => {
    if (selectionKey === lastSelection.current) return;
    lastSelection.current = selectionKey;
    if (dockOpen) setSheet((s) => (s === 'peek' ? 'half' : s));
  }, [selectionKey, dockOpen]);

  const heights = sheetHeights(mapHeight);
  const portraitSheet = layout === 'portrait' && dockOpen;
  const insetRight = layout === 'desktop' ? DOCK_INSET : layout === 'landscape' && dockOpen ? sideSheetInset() : 0;
  const insetBottom = portraitSheet ? heights[sheet] : 0;
  const clearSelection = () => {
    setSelectedArmies([]);
    setSelectedProvince(null);
    setMoveMode(null);
  };
  const mover = armySelected && state.armies[selectedArmies[0]].owner === human ? state.armies[selectedArmies[0]] : null;
  const pendingRoute = moveMode && moveTarget && mover ? routePreview(state, world, human, mover, moveTarget) : null;

  return (
    <div className={`game-screen layout-${layout}${compact ? ' compact' : ''}${touch ? ' touch' : ''}`}>
      <TopBar ctrl={ctrl} onOpen={(p) => setPanel(p)} />
      <div className="game-body">
        <NavRail
          ctrl={ctrl}
          active={panel}
          feedOpen={feedOpen}
          unreadReports={unreadReports}
          compact={compact}
          onToggleFeed={() => setFeedOpen((o) => !o)}
          onOpen={(p) => (p === 'menu' ? exitToMenu() : setPanel(p))}
        />
        <div
          className={`map-wrap${dockOpen ? ' dock-open' : ''}`}
          ref={mapWrapRef}
          style={{ '--inset-bottom': `${insetBottom}px` } as React.CSSProperties}
        >
          <MapView
            ctrl={ctrl}
            geo={geo}
            selectedProvince={selectedProvince}
            selectedArmies={selectedArmies}
            moveMode={moveMode !== null}
            focus={focus}
            mapMode={mapMode}
            insetRight={insetRight}
            insetBottom={insetBottom}
            followSelection={compact}
            compact={compact}
            touch={touch}
            moveTarget={moveTarget}
            onPickTarget={setMoveTarget}
            onSelectProvince={selectProvince}
            onSelectArmy={selectArmy}
            onBoxSelect={(ids) => {
              const first = ctrl.state.armies[ids[0]];
              setSelectedArmies(ids);
              setSelectedProvince(first.move?.leg ? first.move.leg.from : first.province);
              setMoveMode(null);
            }}
            onOrderMove={orderMove}
            onHover={(pid, army) => setHover(pid ? { pid, army } : null)}
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

          {/* It follows the pointer over its parent, the map's frame. */}
          {!touch && <HoverCard ctrl={ctrl} pid={hover?.pid ?? null} armyId={hover?.army} />}

          {/* Banners and alerts: placed apart on the desktop, one column on small screens. */}
          <div className="map-notices">
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
                <button className="banner paused-banner" onClick={() => ctrl.togglePause()} data-testid="paused-banner">
                  <Icon name="pause" size={16} /> Paused <span className="muted">— {touch ? 'tap to resume' : 'press Space to resume'}</span>
                </button>
              )}
              {ctrl.loop.speed > 2 && !ctrl.loop.paused && <div className="banner dev-banner">Development speed {ctrl.loop.speed}x</div>}
              {moveMode && !touch && (
                <div className="banner hint-banner">
                  <Icon name="target" size={16} /> {ORDER[moveMode].hint}: choose a destination — click a province or an enemy army <span className="muted">(Esc to cancel)</span>
                </div>
              )}
              {moveMode && touch && (
                <div className="banner hint-banner move-confirm" data-testid="move-confirm">
                  <span className="mc-text">
                    <Icon name="target" size={16} />
                    {!moveTarget ? (
                      <span>Tap a destination</span>
                    ) : pendingRoute?.blocked ? (
                      <span>
                        {world.provinces[moveTarget].city.name} <span className="muted">· {pendingRoute.blocked}</span>
                      </span>
                    ) : (
                      <span>
                        {ORDER[moveMode].hint} {world.provinces[moveTarget].city.name}
                        {pendingRoute && <span className="muted"> · {formatDuration(pendingRoute.ticks, state)}</span>}
                      </span>
                    )}
                  </span>
                  <span className="mc-actions">
                    {moveTarget && !pendingRoute?.blocked && (
                      <button className="primary" onClick={() => orderMove(moveTarget)} data-testid="confirm-move">
                        Confirm
                      </button>
                    )}
                    {moveTarget && pendingRoute?.warOn && (
                      <button className="danger" onClick={() => orderMove(moveTarget)} data-testid="confirm-move">
                        Declare war…
                      </button>
                    )}
                    <button onClick={() => setMoveMode(null)}>Cancel</button>
                  </span>
                </div>
              )}
            </div>

            {/* The results dialog is the last word: alerts wait behind it until it closes. */}
            {!(outcome && !outcomeSeen) && (
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
            )}
          </div>

          <EventLog
            ctrl={ctrl}
            open={feedOpen}
            compact={compact}
            onToggle={() => setFeedOpen((o) => !o)}
            onFocus={(pid) => {
              focusOn(pid);
              // Small screens: the report gives way to the province it points at.
              if (compact) setFeedOpen(false);
            }}
          />
          {toast && (
            <div className="toast" role="alert">
              <Icon name="warning" size={16} /> {toast}
            </div>
          )}

          {dockOpen && (
            <aside
              className={`selection-dock${portraitSheet ? ' sheet' : ''}`}
              ref={dockRef}
              data-sheet={portraitSheet ? sheet : undefined}
              style={portraitSheet ? { height: heights[sheet] } : undefined}
            >
              {portraitSheet && <SheetHandle dock={dockRef} snap={sheet} heights={heights} onSnap={setSheet} onDismiss={clearSelection} />}
              {armySelected && (
                <ArmyPanel
                  key={selectedArmies[0]}
                  ctrl={ctrl}
                  armyIds={selectedArmies}
                  moveMode={moveMode}
                  onMoveMode={setMoveMode}
                  onSelectArmies={setSelectedArmies}
                  // Closing the army goes back to the map, not to the city it stands in.
                  onClose={clearSelection}
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
      {panel === 'sound' && <SoundDialog touch={touch} onClose={() => setPanel(null)} />}
      {panel === 'load' && <LoadDialog world={world} scenarioId={world.scenario.id} onLoad={onLoad} onClose={() => setPanel(null)} />}
      {panel === 'help' && (
        <HelpDialog
          touch={touch}
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
          input={{ touch, compact }}
          onClose={() => {
            setTutorial(false);
            if (!capitalShown.current && !compact) setSelectedProvince((p) => p ?? world.nations[human].capital);
            capitalShown.current = true;
          }}
        />
      )}
      {outcome && !outcomeSeen && <OutcomeDialog ctrl={ctrl} onMenu={onExit} onClose={() => setOutcomeSeen(true)} />}
      {warOrder && (
        <DeclareWarDialog
          ctrl={ctrl}
          target={warOrder.target}
          order={`${warOrder.armies.length === 1 ? 'Your army then marches' : 'Your armies then march'} on ${world.provinces[warOrder.to].city.name}.`}
          onCancel={() => setWarOrder(null)}
          onConfirm={() => {
            const r = ctrl.submit({ type: 'declareWar', nation: human, target: warOrder.target });
            if (r.ok) issueMoves(warOrder.armies, warOrder.to, warOrder.mode);
            else setToast(r.reason);
            setWarOrder(null);
          }}
        />
      )}
      {confirmExit && (
        <ConfirmDialog title="Leave the campaign?" icon="exit" confirmLabel="Main menu" onCancel={() => setConfirmExit(false)} onConfirm={onExit}>
          <p>The campaign is autosaved: resume it any time with Load game on the main menu.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/**
 * Grip of the portrait layout's bottom sheet. Drag it to resize the sheet (it settles on
 * the nearest of peek, half and full) or down past peek to close it; tap it to toggle
 * between half and full.
 */
function SheetHandle({
  dock,
  snap,
  heights,
  onSnap,
  onDismiss,
}: {
  dock: RefObject<HTMLElement | null>;
  snap: SheetSnap;
  heights: Record<SheetSnap, number>;
  onSnap: (s: SheetSnap) => void;
  onDismiss: () => void;
}) {
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const toggle = () => onSnap(snap === 'half' ? 'full' : 'half');
  const end = (e: React.PointerEvent, cancelled: boolean) => {
    const d = drag.current;
    const el = dock.current;
    drag.current = null;
    if (!d || !el) return;
    el.classList.remove('dragging');
    if (cancelled || !d.moved) {
      el.style.height = `${heights[snap]}px`;
      if (!cancelled) toggle();
      return;
    }
    const h = d.h - (e.clientY - d.y);
    if (h < heights.peek * 0.7) {
      onDismiss();
      return;
    }
    const best = (['peek', 'half', 'full'] as SheetSnap[]).reduce((a, b) => (Math.abs(heights[b] - h) < Math.abs(heights[a] - h) ? b : a));
    // The rendered height only changes with the snap: set it here in case the snap does not.
    el.style.height = `${heights[best]}px`;
    onSnap(best);
  };
  return (
    <div
      className="sheet-handle"
      role="button"
      tabIndex={0}
      aria-label={snap === 'full' ? 'Shrink the panel' : 'Expand the panel'}
      data-testid="sheet-handle"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }}
      onPointerDown={(e) => {
        const el = dock.current;
        if (!el) return;
        drag.current = { y: e.clientY, h: el.offsetHeight, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
        el.classList.add('dragging');
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        const el = dock.current;
        if (!d || !el) return;
        const dy = e.clientY - d.y;
        if (Math.abs(dy) > 6) d.moved = true;
        if (d.moved) el.style.height = `${Math.max(48, Math.min(heights.full, d.h - dy))}px`;
      }}
      onPointerUp={(e) => end(e, false)}
      onPointerCancel={(e) => end(e, true)}
    >
      <span className="sheet-grip" />
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
    // Under the fog of war only the map is known: who holds it and how big its city is.
    const seen = ctrl.sight();
    const known = seen.has(pid);
    // Units standing here by owner, yours first.
    const units = new Map<OwnerId, number>();
    for (const a of armiesIn(state, pid)
      .filter((a) => isArmyVisible(a, human, seen))
      .sort((x, y) => Number(y.owner === human) - Number(x.owner === human))) {
      units.set(a.owner, (units.get(a.owner) ?? 0) + a.units.length);
    }
    const adjective = (o: OwnerId) => (o === 'neutral' ? (def.neutral?.adjective ?? 'neutral') : world.nations[o].adjective);
    const army = armyId ? state.armies[armyId] : undefined;
    const c = army ? composition(army) : null;
    // What the city's model shows, spelt out: its buildings, free slots and work in progress.
    const built = known ? BUILDING_ORDER.filter((b) => (ps.buildings[b] ?? 0) > 0) : [];
    const job = known ? (ps.construction?.building ?? null) : null;
    const free = known ? buildingSlots(state, pid) - slotsUsed(ps.buildings, job) : 0;
    const battle = known && !!state.battles[pid];
    const capture = known ? ps.capture : null;
    body = (
      <>
        {army && c && (
          <div className="hc-army">
            <div className="hc-head">
              <OwnerFlag world={world} owner={army.owner} province={army.province} size={14} />
              <span className="hc-owner">
                {armyName(world, army)}
                {army.owner !== 'neutral' ? ` · ${world.nations[army.owner].adjective}` : ''}
              </span>
            </div>
            <div className="hc-units">
              {c.types.slice(0, 4).map(([t, n]) => (
                <span key={t}>
                  <span className="unit-plate">
                    <UnitIconArt world={world} type={t} gen={unitGen(state, army.owner, t)} nation={army.owner} width={20} />
                  </span>{' '}
                  {n}
                </span>
              ))}
              <span className="hc-str">
                {Math.round(c.strength * 100)}% strength · morale {Math.round(armyMorale(army) * 100)}
              </span>
            </div>
            {army.move?.leg && <div className="hc-row">Marching to {provinceName(world, army.move.leg.to)}</div>}
            {!army.supplied && <div className="hc-row bad">Out of supply</div>}
          </div>
        )}
        <div className="hc-head">
          <OwnerFlag world={world} owner={owner} province={pid} size={14} />
          <span className="hc-owner">{owner === 'neutral' && ownerShortName(world, owner, pid) === def.name ? 'Neutral state' : ownerLabel(world, owner, pid)}</span>
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
        {(built.length > 0 || free > 0 || job) && (
          <div className="hc-row hc-buildings">
            {built.map((b) => (
              <span key={b} style={{ color: lighten(plinthColor(BUILDINGS[b].category), 0.35) }}>
                <BuildingGlyphArt kind={b} size={14} />
              </span>
            ))}
            {free > 0 && <span className="hc-free">{countOf(free, 'free slot')}</span>}
            {job && <span className="warn-text">Building {BUILDINGS[job].name}</span>}
          </div>
        )}
        {owner !== 'neutral' && known && (
          <div className="hc-row">
            <span className={ps.morale >= 60 ? 'ok' : ps.morale < 35 ? 'bad' : 'warn-text'}>
              <Icon name="morale" size={13} /> Morale {Math.round(ps.morale)}
            </span>
          </div>
        )}
        {(units.size > 0 || battle || capture) && (
          <div className="hc-row">
            {[...units].map(([o, n]) =>
              o === human ? (
                <span key={o} className="ok">
                  {n} of your units
                </span>
              ) : (
                <span key={o} className={o !== 'neutral' && atWar(state, human, o) ? 'bad' : ''}>
                  {countOf(n, `${adjective(o)} unit`)}
                </span>
              ),
            )}
            {battle && (
              <span className="bad">
                <Icon name="swords" size={13} /> Battle
              </span>
            )}
            {capture && <span className="warn-text">Being captured</span>}
          </div>
        )}
        {!known && (
          <div className="hc-row hc-fog">
            <Icon name="fog" size={13} /> Fog of war: no reports from here
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
