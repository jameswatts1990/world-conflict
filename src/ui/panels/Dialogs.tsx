import { useState } from 'react';
import { deserializeGame, type GameState, type World } from '../../sim';
import { downloadSave, listSlots, loadFromSlot, saveToSlot, slotLabel, SLOTS, type SlotId } from '../game/storage';
import type { GameController } from '../game/GameController';
import { formatClock } from '../format';
import { Modal, NationSwatch } from './Common';
import { CONTROLS, Tutorial } from './Tutorial';

export function SaveDialog({ ctrl, onClose }: { ctrl: GameController; onClose: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [, force] = useState(0);
  const slots = listSlots(ctrl.state.scenarioId);
  const label = `${ctrl.world.nations[ctrl.human].name} — ${formatClock(ctrl.state.tick, ctrl.state)}`;
  return (
    <Modal title="Save game" onClose={onClose}>
      <p className="muted">Saves are stored in this browser. The campaign is paused while closed and resumes exactly from the save.</p>
      <ul className="slot-list">
        {slots
          .filter((s) => s.slot !== 'autosave')
          .map((s) => (
            <li key={s.slot}>
              <div>
                <strong>{slotLabel(s.slot)}</strong>
                <div className="muted">{s.file ? `${s.file.label} · saved ${new Date(s.file.savedAt).toLocaleString()}` : 'Empty'}</div>
              </div>
              <button
                className="primary"
                data-save-slot={s.slot}
                onClick={() => {
                  try {
                    saveToSlot(s.slot, ctrl.state, label);
                    setMessage(`Saved to ${slotLabel(s.slot)}.`);
                    force((x) => x + 1);
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              >
                Save here
              </button>
            </li>
          ))}
      </ul>
      <div className="btn-row">
        <button onClick={() => downloadSave(ctrl.state, label)}>Export save file…</button>
      </div>
      {message && <div className="notice" data-testid="save-message">{message}</div>}
    </Modal>
  );
}

export function LoadDialog({
  world,
  scenarioId,
  onLoad,
  onClose,
}: {
  world: World;
  scenarioId: string;
  onLoad: (state: GameState) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const slots = listSlots(scenarioId);
  const load = (slot: SlotId) => {
    try {
      onLoad(loadFromSlot(slot, scenarioId).state);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal title="Load game" onClose={onClose}>
      <ul className="slot-list">
        {SLOTS.map((slot) => {
          const info = slots.find((s) => s.slot === slot)!;
          const st = info.file?.state;
          const human = st?.settings.humanNation;
          return (
            <li key={slot}>
              <div>
                <strong>{slotLabel(slot)}</strong>
                <div className="muted">
                  {info.file && st && human ? (
                    <>
                      <NationSwatch color={world.nations[human].color} /> {world.nations[human].name} · game time {formatClock(st.tick, st)} · saved{' '}
                      {new Date(info.file.savedAt).toLocaleString()}
                    </>
                  ) : (
                    (info.error ?? 'Empty')
                  )}
                </div>
              </div>
              <button disabled={!info.file} onClick={() => load(slot)} data-load-slot={slot}>
                Load
              </button>
            </li>
          );
        })}
      </ul>
      <label className="file-import">
        Import save file…
        <input
          type="file"
          accept="application/json,.json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              onLoad(deserializeGame(await file.text(), scenarioId).state);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        />
      </label>
      {error && <div className="warn">{error}</div>}
    </Modal>
  );
}

export function HelpDialog({ ctrl, onClose }: { ctrl: GameController; onClose: () => void }) {
  const [tour, setTour] = useState(false);
  if (tour) return <Tutorial world={ctrl.world} nationName={ctrl.world.nations[ctrl.human].name} onClose={onClose} />;
  return (
    <Modal title="Controls" onClose={onClose}>
      <table className="controls-table">
        <tbody>
          {CONTROLS.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="btn-row">
        <button className="primary" onClick={() => setTour(true)}>
          Replay tutorial
        </button>
      </div>
    </Modal>
  );
}

export function OutcomeDialog({ ctrl, onMenu, onClose }: { ctrl: GameController; onMenu: () => void; onClose: () => void }) {
  const { state, world, human } = ctrl;
  const o = state.outcome!;
  const won = o.winner === human;
  const reason = {
    objectives: 'strategic objectives held',
    timeLimit: 'campaign time limit reached — highest score wins',
    lastStanding: 'last power standing',
    humanEliminated: 'your nation was eliminated',
  }[o.reason];
  return (
    <Modal title={won ? 'Victory!' : 'Defeat'} onClose={onClose}>
      <div className={`outcome ${won ? 'won' : 'lost'}`} data-testid="outcome" data-result={won ? 'win' : 'loss'}>
        <p>
          <strong>{o.winner ? world.nations[o.winner].name : 'Nobody'}</strong> wins — {reason} at {formatClock(o.tick, state)}.
        </p>
        <table className="dip-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Nation</th>
              <th>VP</th>
              <th>Provinces</th>
              <th>Techs</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {o.scores.map((s, i) => (
              <tr key={s.nation} className={s.nation === human ? 'me' : ''}>
                <td>{i + 1}</td>
                <td>
                  <NationSwatch color={world.nations[s.nation].color} /> {world.nations[s.nation].name}
                </td>
                <td>{s.vp}</td>
                <td>{s.provinces}</td>
                <td>{s.techs}</td>
                <td>{s.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="btn-row">
        <button onClick={onClose}>View map</button>
        <button className="primary" onClick={onMenu}>
          Main menu
        </button>
      </div>
    </Modal>
  );
}
