import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CLIENT_SPEEDS } from '../sim/config/timing';
import { CITY } from '../sim/config/buildings';
import type { ArmyId, GameState, ProvinceId } from '../sim';
import type { GameController } from './game/GameController';
import { buildMapGeometry } from './map/geo';
import { MapView, rampColor, type MapMode } from './map/MapView';
import { ArmyPanel } from './panels/ArmyPanel';
import { HelpDialog, LoadDialog, OutcomeDialog, SaveDialog } from './panels/Dialogs';
import { DiplomacyPanel } from './panels/DiplomacyPanel';
import { EventLog } from './panels/EventLog';
import { ProvincePanel } from './panels/ProvincePanel';
import { ResearchPanel } from './panels/ResearchPanel';
import { TopBar, type PanelId } from './panels/TopBar';
import { Tutorial } from './panels/Tutorial';

const MAP_MODES: { id: MapMode; label: string; title: string }[] = [
  { id: 'political', label: 'Political', title: 'Who owns what' },
  { id: 'morale', label: 'Morale', title: 'Civilian morale per province' },
  { id: 'development', label: 'Cities', title: 'City size (tier) per province' },
  { id: 'supply', label: 'Supply', title: 'Provinces connected to a supply hub' },
];

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
  const geo = useMemo(() => buildMapGeometry(world), [world]);

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

  // Drop selections of armies that no longer exist.
  const liveArmies = selectedArmies.filter((id) => state.armies[id]);
  if (liveArmies.length !== selectedArmies.length) setSelectedArmies(liveArmies);

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
      } else if (e.key === 'l' || e.key === 'L') document.querySelector<HTMLElement>('.event-log header')?.click();
      else if (e.key === 'v' || e.key === 'V') setMapMode((m) => MAP_MODES[(MAP_MODES.findIndex((x) => x.id === m) + 1) % MAP_MODES.length].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctrl, moveMode, panel, selectedArmies]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const offers = state.peaceOffers.filter((o) => o.to === human);
  const hoverDef = hover ? world.provinces[hover] : null;
  const hoverOwner = hover ? state.provinces[hover].owner : null;

  return (
    <div className="game-screen">
      <TopBar ctrl={ctrl} onOpen={(p) => (p === 'menu' ? onExit() : setPanel(p))} />
      <div className="game-body">
        <div className="map-wrap">
          <MapView
            ctrl={ctrl}
            geo={geo}
            mode={mapMode}
            selectedProvince={selectedProvince}
            selectedArmies={selectedArmies}
            moveMode={moveMode}
            focus={focus}
            onSelectProvince={selectProvince}
            onSelectArmy={selectArmy}
            onOrderMove={orderMove}
            onHover={setHover}
          />
          {ctrl.loop.paused && !state.outcome && <div className="paused-banner">PAUSED — press Space or ▶ Resume</div>}
          {ctrl.loop.speed > 2 && !ctrl.loop.paused && <div className="dev-banner">DEVELOPMENT SPEED {ctrl.loop.speed}x</div>}
          {moveMode && <div className="hint-banner">Choose a destination: click a province (Esc to cancel)</div>}
          {hoverDef && hover && (
            <div className="hover-info">
              <strong>{hoverDef.city.name}</strong> · {hoverDef.name} · {hoverOwner === 'neutral' ? `${hoverDef.neutralState} (neutral)` : world.nations[hoverOwner!].name} ·{' '}
              {CITY.tierNames[state.provinces[hover].tier]} · {hoverDef.terrain}
              {hoverOwner !== 'neutral' ? ` · morale ${Math.round(state.provinces[hover].morale)}` : ''}
              {hoverDef.objectiveVp ? ` · ★${hoverDef.objectiveVp} VP` : ''}
            </div>
          )}
          <EventLog ctrl={ctrl} onFocus={focusOn} />
          <div className="legend">
            <div className="map-modes" role="group" aria-label="Map mode (V)">
              {MAP_MODES.map((m) => (
                <button key={m.id} className={mapMode === m.id ? 'active' : ''} onClick={() => setMapMode(m.id)} title={`${m.title} (V cycles)`} data-map-mode={m.id}>
                  {m.label}
                </button>
              ))}
            </div>
            {mapMode === 'political' && (
              <>
                <div>
                  <span className="lg lg-neutral" /> Neutral state <span className="lg lg-outside" /> Outside prototype
                </div>
                <div>
                  <span className="lg-sym">★</span> Capital · <span className="lg-sym ring">2</span> Objective VP · dots grow with city size
                </div>
                <div>
                  <span className="lg-line land" /> land <span className="lg-line mountain" /> pass <span className="lg-line strait" /> sea
                </div>
              </>
            )}
            {mapMode === 'morale' && (
              <div className="lg-ramp">
                <span>20</span>
                <span className="ramp" style={{ background: `linear-gradient(90deg, ${rampColor(0)}, ${rampColor(0.5)}, ${rampColor(1)})` }} />
                <span>85+</span> civilian morale (drives output)
              </div>
            )}
            {mapMode === 'development' && (
              <div className="lg-tiers">
                {[1, 2, 3, 4, 5].map((t) => (
                  <span key={t}>
                    <span className={`lg lg-tier-${t}`} /> {CITY.tierNames[t]}
                  </span>
                ))}
              </div>
            )}
            {mapMode === 'supply' && (
              <div>
                <span className="lg lg-supplied" /> connected to a supply hub <span className="lg lg-cut" /> cut off
              </div>
            )}
          </div>
          {offers.length > 0 && (
            <div className="offer-stack">
              {offers.map((o) => (
                <div key={o.from} className="offer-card">
                  <strong>{world.nations[o.from].name}</strong> offers peace (status quo borders).
                  <div className="btn-row">
                    <button className="primary" onClick={() => ctrl.submit({ type: 'respondPeace', nation: human, from: o.from, accept: true })}>
                      Accept
                    </button>
                    <button onClick={() => ctrl.submit({ type: 'respondPeace', nation: human, from: o.from, accept: false })}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {toast && <div className="toast">{toast}</div>}
        </div>
        <aside className="side">
          {selectedArmies.length > 0 && state.armies[selectedArmies[0]] && (
            <ArmyPanel
              key={selectedArmies[0]}
              ctrl={ctrl}
              armyIds={selectedArmies}
              moveMode={moveMode}
              onMoveMode={setMoveMode}
              onSelectArmies={setSelectedArmies}
            />
          )}
          {selectedProvince ? (
            <ProvincePanel ctrl={ctrl} pid={selectedProvince} selectedArmies={selectedArmies} onSelectArmy={selectArmy} />
          ) : (
            <section className="panel">
              <p className="muted">Select a province or army on the map. Right-click to move a selected army.</p>
            </section>
          )}
        </aside>
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
      {panel === 'load' && (
        <LoadDialog world={world} scenarioId={world.scenario.id} onLoad={onLoad} onClose={() => setPanel(null)} />
      )}
      {panel === 'help' && <HelpDialog ctrl={ctrl} onClose={() => setPanel(null)} />}
      {tutorial && <Tutorial world={world} nationName={world.nations[human].name} onClose={() => setTutorial(false)} />}
      {state.outcome && !outcomeSeen && <OutcomeDialog ctrl={ctrl} onMenu={onExit} onClose={() => setOutcomeSeen(true)} />}
    </div>
  );
}
