import { useState } from 'react';
import { DIPLOMACY, VICTORY } from '../../sim/config/rules';
import { checkDeclareWar, checkOfferPeace, computeScores, heldVp, nationEra, nationName, nationPower, sentence, vpToWin, type NationId } from '../../sim';
import { OwnerFlag, Flag } from '../flags';
import type { GameController } from '../game/GameController';
import { formatDuration, proseDuration } from '../format';
import { Icon } from '../icons';
import { ConfirmDialog, Modal } from './Common';

export function DiplomacyPanel({ ctrl, onClose, onFocus }: { ctrl: GameController; onClose: () => void; onFocus: (pid: string) => void }) {
  const { state, world, human } = ctrl;
  const [confirmWar, setConfirmWar] = useState<NationId | null>(null);
  const scores = computeScores(state, world);
  const need = vpToWin(world);
  const leader = state.victory.leader;
  const maxPower = Math.max(1, ...scores.map((s) => nationPower(state, s.nation)));
  const wars = world.nationIds.filter((id) => state.nations[human].relations[id]?.status === 'war');
  return (
    <Modal title="Diplomacy & Objectives" icon="diplomacy" subtitle="Relations, military power and the race for victory points" onClose={onClose} size="wide">
      <p className="intro">
        All powers start at peace. Declaring war opens each side&apos;s territory to the other&apos;s armies. Peace can be offered after{' '}
        {proseDuration(DIPLOMACY.minWarSecondsBeforePeace)} of war and an offer stands for {proseDuration(DIPLOMACY.peaceOfferExpirySeconds)}; after a refusal,
        wait {proseDuration(DIPLOMACY.peaceRetrySeconds)} before asking again. The AI accepts when it is losing or war-weary. Peace freezes the current borders,
        sends trespassing armies home and starts a truce of {proseDuration(DIPLOMACY.truceSeconds)}. Neutral states may be invaded at any time.
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
            const peace = checkOfferPeace(state, world, human, s.nation);
            const truce = rel && state.tick < rel.truceUntil && rel.status === 'peace';
            const power = nationPower(state, s.nation);
            const incoming = state.peaceOffers.find((o) => o.from === s.nation && o.to === human);
            const outgoing = state.peaceOffers.some((o) => o.from === human && o.to === s.nation);
            return (
              <tr key={s.nation} className={`${me ? 'me' : ''}${n.eliminated ? ' eliminated' : ''}`} data-nation={s.nation}>
                <td>
                  <span className="dip-nation">
                    <Flag id={s.nation} size={20} />
                    <span>
                      <strong>{def.name}</strong>
                      {me && <span className="you-tag">You</span>}
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
                  <span className="power-bar" title={`Military power ${Math.round(power)}`}>
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
                      title={war.ok ? `Declare war on ${nationName(world, s.nation)}` : war.reason}
                      onClick={() => setConfirmWar(s.nation)}
                      data-declare-war={s.nation}
                    >
                      Declare war
                    </button>
                  )}
                  {!me && !n.eliminated && rel.status === 'war' && incoming && (
                    <span className="offer-actions">
                      <button className="primary" onClick={() => ctrl.submit({ type: 'respondPeace', nation: human, from: s.nation, accept: true })}>
                        Accept peace
                      </button>
                      <button onClick={() => ctrl.submit({ type: 'respondPeace', nation: human, from: s.nation, accept: false })}>Reject</button>
                    </span>
                  )}
                  {!me && !n.eliminated && rel.status === 'war' && !incoming && (
                    <button
                      className="primary"
                      disabled={!peace.ok}
                      title={peace.ok ? 'Offer peace on current borders' : peace.reason}
                      onClick={() => ctrl.submit({ type: 'offerPeace', nation: human, target: s.nation })}
                      data-offer-peace={s.nation}
                    >
                      {outgoing ? 'Offer sent' : 'Offer peace'}
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
        <Icon name="star" size={15} /> Strategic objectives — hold {need} of {world.totalVp} VP for {VICTORY.holdSeconds} seconds to win
      </h4>
      {leader && (
        <div className="warn">
          <Icon name="warning" size={15} />
          <span>
            {sentence(nationName(world, leader))} holds {heldVp(state, world, leader)} VP — victory in{' '}
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
              <button className={`objective-chip${owner === human ? ' mine' : ''}`} onClick={() => onFocus(id)} title={`${world.provinces[id].name}: show on map`}>
                <span className="obj-vp">{world.provinces[id].objectiveVp}</span>
                <span className="obj-name">{world.provinces[id].city.name}</span>
                <OwnerFlag world={world} owner={owner} province={id} size={12} />
              </button>
            </li>
          );
        })}
      </ul>

      {confirmWar && (
        <ConfirmDialog
          title={`War with ${nationName(world, confirmWar)}?`}
          icon="swords"
          confirmLabel="Declare war"
          danger
          onCancel={() => setConfirmWar(null)}
          onConfirm={() => {
            ctrl.submit({ type: 'declareWar', nation: human, target: confirmWar });
            setConfirmWar(null);
          }}
        >
          <p>
            Your armies may then enter {world.nations[confirmWar].adjective} territory, and theirs may enter yours. Peace cannot be offered for the first{' '}
            {proseDuration(DIPLOMACY.minWarSecondsBeforePeace)}.
          </p>
          {wars.length > 0 && (
            <p className="warn-text">
              You are already at war with {wars.map((id) => nationName(world, id)).join(' and ')}.
            </p>
          )}
        </ConfirmDialog>
      )}
    </Modal>
  );
}
