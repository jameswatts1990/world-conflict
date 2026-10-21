import { VICTORY } from '../../sim/config/rules';
import { checkDeclareWar, checkOfferPeace, computeScores, heldVp, nationEra, nationPower, vpToWin } from '../../sim';
import { NEUTRAL_COLOR } from '../../sim/scenario/europe/nations';
import type { GameController } from '../game/GameController';
import { formatDuration } from '../format';
import { NationEmblem } from '../art/adapters';
import { Modal, NationSwatch } from './Common';

export function DiplomacyPanel({ ctrl, onClose, onFocus }: { ctrl: GameController; onClose: () => void; onFocus: (pid: string) => void }) {
  const { state, world, human } = ctrl;
  const scores = computeScores(state, world);
  const need = vpToWin(world);
  const leader = state.victory.leader;
  return (
    <Modal title="Diplomacy & Objectives" onClose={onClose} wide>
      <p className="muted">
        All powers start at peace. Declaring war lets your armies enter that nation&apos;s territory. Peace can be offered after{' '}
        {Math.round(180 / 60)} minutes of war; the AI accepts when losing or war-weary. Peace freezes the current borders and
        withdraws trespassing armies. Neutral states may be invaded at any time.
      </p>
      <table className="dip-table">
        <thead>
          <tr>
            <th>Nation</th>
            <th>Era</th>
            <th>Relation</th>
            <th title="Total military power">Power</th>
            <th>Prov.</th>
            <th>VP</th>
            <th>Score</th>
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
            return (
              <tr key={s.nation} className={`${me ? 'me' : ''}${n.eliminated ? ' eliminated' : ''}`} data-nation={s.nation}>
                <td>
                  <NationSwatch color={def.color} /> <NationEmblem nation={s.nation} size={14} /> {def.name} {me ? '(you)' : ''}
                  <div className="muted small" title={def.speciality.description}>
                    {def.speciality.name} · morale {Math.round(n.morale)}
                  </div>
                </td>
                <td>{n.eliminated ? '—' : nationEra(state, s.nation)}</td>
                <td>
                  {me ? '—' : n.eliminated ? 'Eliminated' : rel.status === 'war' ? <strong className="bad">WAR</strong> : 'Peace'}
                  {!me && truce ? <span className="muted"> (truce {formatDuration(rel.truceUntil - state.tick, state)})</span> : null}
                </td>
                <td>{Math.round(nationPower(state, s.nation))}</td>
                <td>{s.provinces}</td>
                <td>{s.vp}</td>
                <td>{s.score}</td>
                <td>
                  {!me && !n.eliminated && rel.status === 'peace' && (
                    <button className="danger" disabled={!war.ok} title={war.ok ? 'Declare war' : war.ok === false ? war.reason : ''} onClick={() => ctrl.submit({ type: 'declareWar', nation: human, target: s.nation })} data-declare-war={s.nation}>
                      Declare war
                    </button>
                  )}
                  {!me && !n.eliminated && rel.status === 'war' && (
                    <button disabled={!peace.ok} title={peace.ok ? 'Offer peace (status quo)' : peace.reason} onClick={() => ctrl.submit({ type: 'offerPeace', nation: human, target: s.nation })}>
                      Offer peace
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">
        Score = {VICTORY.score.perVp} × VP + {VICTORY.score.perProvince} × provinces + {VICTORY.score.perTech} × technologies. The highest
        score wins when the campaign time limit is reached.
      </p>

      <h4>
        Strategic objectives — hold {need} of {world.totalVp} VP for {VICTORY.holdSeconds}s to win
      </h4>
      {leader && (
        <div className="warn">
          {world.nations[leader].name} holds {heldVp(state, world, leader)} VP — victory in{' '}
          {formatDuration(Math.max(0, VICTORY.holdSeconds * state.settings.durationScale - (state.tick - (state.victory.holdSince ?? state.tick))), state)} unless an objective is retaken.
        </div>
      )}
      <ul className="objective-list">
        {world.objectiveIds.map((id) => {
          const owner = state.provinces[id].owner;
          const color = owner === 'neutral' ? NEUTRAL_COLOR : world.nations[owner].color;
          return (
            <li key={id}>
              <button className="link" onClick={() => onFocus(id)}>
                <NationSwatch color={color} /> ★{world.provinces[id].objectiveVp} {world.provinces[id].city.name}
                <span className="muted"> · {owner === 'neutral' ? 'neutral' : world.nations[owner].name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
