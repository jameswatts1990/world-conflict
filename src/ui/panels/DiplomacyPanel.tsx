import { VICTORY } from '../../sim/config/rules';
import { checkDeclareWar, checkOfferPeace, computeScores, heldVp, nationEra, nationPower, vpToWin } from '../../sim';
import { OwnerFlag, Flag } from '../flags';
import type { GameController } from '../game/GameController';
import { formatDuration } from '../format';
import { Icon } from '../icons';
import { Modal } from './Common';

export function DiplomacyPanel({ ctrl, onClose, onFocus }: { ctrl: GameController; onClose: () => void; onFocus: (pid: string) => void }) {
  const { state, world, human } = ctrl;
  const scores = computeScores(state, world);
  const need = vpToWin(world);
  const leader = state.victory.leader;
  const maxPower = Math.max(1, ...scores.map((s) => nationPower(state, s.nation)));
  return (
    <Modal title="Diplomacy & Objectives" icon="diplomacy" subtitle="Relations, military power and the race for victory points" onClose={onClose} wide>
      <p className="intro">
        All powers start at peace. Declaring war lets your armies enter that nation&apos;s territory. Peace can be offered after {Math.round(180 / 60)}{' '}
        minutes of war; the AI accepts when losing or war-weary. Peace freezes the current borders and withdraws trespassing armies. Neutral
        states may be invaded at any time.
      </p>
      <table className="dip-table">
        <thead>
          <tr>
            <th>Nation</th>
            <th>Era</th>
            <th>Relation</th>
            <th title="Total military power">Military power</th>
            <th className="num">Prov.</th>
            <th className="num">VP</th>
            <th className="num">Score</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {scores.map((s) => {
            const def = world.nations[s.nation];
            const n = state.nations[s.nation];
            const me = s.nation === human;
            const rel = state.nations[human].relations[s.nation];
            const war = checkDeclareWar(state, human, s.nation);
            const peace = checkOfferPeace(state, human, s.nation);
            const truce = rel && state.tick < rel.truceUntil && rel.status === 'peace';
            const power = nationPower(state, s.nation);
            return (
              <tr key={s.nation} className={`${me ? 'me' : ''}${n.eliminated ? ' eliminated' : ''}`} data-nation={s.nation}>
                <td>
                  <span className="dip-nation">
                    <Flag id={s.nation} size={20} />
                    <span>
                      <strong>{def.name}</strong>
                      {me && <span className="you-tag">You</span>}
                      <span className="dip-sub" title={def.speciality.description}>
                        {def.speciality.name} · morale {Math.round(n.morale)}
                      </span>
                    </span>
                  </span>
                </td>
                <td>{n.eliminated ? '—' : <span className="era-pill">{nationEra(state, s.nation)}</span>}</td>
                <td>
                  {me ? (
                    <span className="muted">—</span>
                  ) : n.eliminated ? (
                    <span className="rel-pill gone">Eliminated</span>
                  ) : rel.status === 'war' ? (
                    <span className="rel-pill war">
                      <Icon name="swords" size={12} /> War
                    </span>
                  ) : (
                    <span className="rel-pill peace">
                      <Icon name="flag" size={12} /> Peace
                    </span>
                  )}
                  {!me && truce ? <span className="muted truce"> truce {formatDuration(rel.truceUntil - state.tick, state)}</span> : null}
                </td>
                <td>
                  <span className="power-bar" title={`${Math.round(power)}`}>
                    <span style={{ width: `${(power / maxPower) * 100}%`, background: def.color }} />
                  </span>
                  <span className="power-val">{Math.round(power)}</span>
                </td>
                <td className="num">{s.provinces}</td>
                <td className="num">{s.vp}</td>
                <td className="num score">{s.score}</td>
                <td className="actions">
                  {!me && !n.eliminated && rel.status === 'peace' && (
                    <button
                      className="danger"
                      disabled={!war.ok}
                      title={war.ok ? 'Declare war' : war.ok === false ? war.reason : ''}
                      onClick={() => ctrl.submit({ type: 'declareWar', nation: human, target: s.nation })}
                      data-declare-war={s.nation}
                    >
                      Declare war
                    </button>
                  )}
                  {!me && !n.eliminated && rel.status === 'war' && (
                    <button
                      className="primary"
                      disabled={!peace.ok}
                      title={peace.ok ? 'Offer peace (status quo)' : peace.reason}
                      onClick={() => ctrl.submit({ type: 'offerPeace', nation: human, target: s.nation })}
                    >
                      Offer peace
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="intro small">
        Score = {VICTORY.score.perVp} × VP + {VICTORY.score.perProvince} × provinces + {VICTORY.score.perTech} × technologies. The highest score wins when
        the campaign time limit is reached.
      </p>

      <h4>
        <Icon name="star" size={15} /> Strategic objectives — hold {need} of {world.totalVp} VP for {VICTORY.holdSeconds}s to win
      </h4>
      {leader && (
        <div className="warn">
          <Icon name="warning" size={15} />
          <span>
            {world.nations[leader].name} holds {heldVp(state, world, leader)} VP — victory in{' '}
            {formatDuration(Math.max(0, VICTORY.holdSeconds * state.settings.durationScale - (state.tick - (state.victory.holdSince ?? state.tick))), state)} unless
            an objective is retaken.
          </span>
        </div>
      )}
      <ul className="objective-list">
        {world.objectiveIds.map((id) => {
          const owner = state.provinces[id].owner;
          return (
            <li key={id}>
              <button className={`objective-chip${owner === human ? ' mine' : ''}`} onClick={() => onFocus(id)} title="Show on map">
                <span className="obj-vp">{world.provinces[id].objectiveVp}</span>
                <span className="obj-name">{world.provinces[id].city.name}</span>
                <OwnerFlag world={world} owner={owner} province={id} size={12} />
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
