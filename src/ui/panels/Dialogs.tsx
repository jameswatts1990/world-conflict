import { useState } from 'react';
import { deserializeGame, type GameState, type World } from '../../sim';
import { downloadSave, listSlots, loadFromSlot, saveToSlot, slotLabel, SLOTS, type SlotId } from '../game/storage';
import type { GameController } from '../game/GameController';
import { Flag } from '../flags';
import { formatClock } from '../format';
import { Icon } from '../icons';
import { Modal } from './Common';
import { CONTROLS, Tutorial } from './Tutorial';

export function SaveDialog({ ctrl, onClose }: { ctrl: GameController; onClose: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [, force] = useState(0);
  const slots = listSlots(ctrl.state.scenarioId);
  const label = `${ctrl.world.nations[ctrl.human].name} — ${formatClock(ctrl.state.tick, ctrl.state)}`;
  return (
    <Modal title="Save game" icon="save" subtitle="Stored in this browser; the campaign is paused while closed" onClose={onClose}>
      <ul className="slot-list">
        {slots
          .filter((s) => s.slot !== 'autosave')
          .map((s) => (
            <li key={s.slot} className={s.file ? 'filled' : 'empty'}>
              <span className="slot-icon">{s.file ? <Flag id={s.file.state.settings.humanNation ?? 'neutral'} size={18} /> : <Icon name="save" size={18} />}</span>
              <div className="slot-info">
                <strong>{slotLabel(s.slot)}</strong>
                <div className="muted">{s.file ? `${s.file.label} · saved ${new Date(s.file.savedAt).toLocaleString()}` : 'Empty slot'}</div>
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
                {s.file ? 'Overwrite' : 'Save here'}
              </button>
            </li>
          ))}
      </ul>
      <div className="btn-row">
        <button onClick={() => downloadSave(ctrl.state, label)}>
          <Icon name="load" size={15} /> Export save file…
        </button>
      </div>
      {message && (
        <div className="notice" data-testid="save-message">
          <Icon name="check" size={15} /> {message}
        </div>
      )}
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
    <Modal title="Load game" icon="load" subtitle="Resume a campaign exactly where it was saved" onClose={onClose}>
      <ul className="slot-list">
        {SLOTS.map((slot) => {
          const info = slots.find((s) => s.slot === slot)!;
          const st = info.file?.state;
          const human = st?.settings.humanNation;
          return (
            <li key={slot} className={info.file ? 'filled' : 'empty'}>
              <span className="slot-icon">{human ? <Flag id={human} size={18} /> : <Icon name="save" size={18} />}</span>
              <div className="slot-info">
                <strong>{slotLabel(slot)}</strong>
                <div className="muted">
                  {info.file && st && human
                    ? `${world.nations[human].name} · game time ${formatClock(st.tick, st)} · saved ${new Date(info.file.savedAt).toLocaleString()}`
                    : (info.error ?? 'Empty slot')}
                </div>
              </div>
              <button className="primary" disabled={!info.file} onClick={() => load(slot)} data-load-slot={slot}>
                Load
              </button>
            </li>
          );
        })}
      </ul>
      <label className="file-import">
        <Icon name="load" size={15} /> Import save file…
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
      {error && (
        <div className="warn">
          <Icon name="warning" size={15} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  );
}

export function HelpDialog({ ctrl, onClose }: { ctrl: GameController; onClose: () => void }) {
  const [tour, setTour] = useState(false);
  if (tour) return <Tutorial world={ctrl.world} nationName={ctrl.world.nations[ctrl.human].name} onClose={onClose} />;
  return (
    <Modal title="Controls" icon="help" subtitle="Mouse and keyboard reference" onClose={onClose}>
      <table className="controls-table">
        <tbody>
          {CONTROLS.map(([k, v]) => (
            <tr key={k}>
              <th>
                {k.split(' / ').map((part, i) => (
                  <span key={part}>
                    {i > 0 && <span className="muted"> / </span>}
                    <kbd>{part}</kbd>
                  </span>
                ))}
              </th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="btn-row">
        <button className="primary" onClick={() => setTour(true)}>
          Replay briefing
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
    <Modal title="Campaign over" icon={won ? 'star' : 'warning'} subtitle={`Ended at ${formatClock(o.tick, state)} game time`} onClose={onClose}>
      <div className={`outcome ${won ? 'won' : 'lost'}`} data-testid="outcome" data-result={won ? 'win' : 'loss'}>
        <div className="outcome-banner">
          {o.winner ? <Flag id={o.winner} size={40} /> : <Icon name="flag" size={40} />}
          <div>
            <div className="outcome-title">{won ? 'Victory!' : 'Defeat'}</div>
            <div>
              <strong>{o.winner ? world.nations[o.winner].name : 'Nobody'}</strong> wins — {reason}.
            </div>
          </div>
        </div>
        <table className="dip-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Nation</th>
              <th className="num">VP</th>
              <th className="num">Provinces</th>
              <th className="num">Techs</th>
              <th className="num">Score</th>
            </tr>
          </thead>
          <tbody>
            {o.scores.map((s, i) => (
              <tr key={s.nation} className={s.nation === human ? 'me' : ''}>
                <td className="rank">{i + 1}</td>
                <td>
                  <span className="dip-nation">
                    <Flag id={s.nation} size={16} /> {world.nations[s.nation].name}
                  </span>
                </td>
                <td className="num">{s.vp}</td>
                <td className="num">{s.provinces}</td>
                <td className="num">{s.techs}</td>
                <td className="num score">{s.score}</td>
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
