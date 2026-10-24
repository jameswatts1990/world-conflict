import { useState } from 'react';
import { POWERS } from '../../sim/config/powers';
import { DIPLOMACY, VICTORY } from '../../sim/config/rules';
import {
  BLOCS,
  areAllies,
  checkDeclareWar,
  checkOfferPeace,
  commonEnemies,
  computeScores,
  hasNeutrals,
  heldVp,
  nationEra,
  nationName,
  nationPower,
  ownersBorder,
  sentence,
  sharesAlliedSight,
  vpToWin,
  type NationId,
} from '../../sim';
import { OwnerFlag, Flag } from '../flags';
import type { GameController } from '../game/GameController';
import { formatDuration, listText, proseDuration } from '../format';
import { Icon } from '../icons';
import { ConfirmDialog, Modal } from './Common';

export function DiplomacyPanel({ ctrl, onClose, onFocus }: { ctrl: GameController; onClose: () => void; onFocus: (pid: string) => void }) {
  const { state, world, human } = ctrl;
  const [confirmWar, setConfirmWar] = useState<NationId | null>(null);
  const [allMinors, setAllMinors] = useState(false);
  const scores = computeScores(state, world);
  // Minor powers are many: those at war with you, bordering you or sending an offer are listed, the rest on request.
  const listed = (n: NationId) =>
    allMinors ||
    world.nations[n].power !== 'minor' ||
    n === human ||
    state.nations[human].relations[n]?.status === 'war' ||
    state.peaceOffers.some((o) => o.from === n && o.to === human) ||
    ownersBorder(state, world, n, human);
  const folded = scores.filter((s) => !listed(s.nation)).length;
  const need = vpToWin(world);
  const leader = state.victory.leader;
  const maxPower = Math.max(1, ...scores.map((s) => nationPower(state, s.nation)));
  const liaison = sharesAlliedSight(state, human);
  return (
    <Modal title="Diplomacy & Objectives" icon="diplomacy" subtitle="Relations, military power and the race for victory points" onClose={onClose} size="wide">
      <details className="intro-details">
        <summary>How diplomacy works</summary>
        <p className="intro">
          All powers start at peace. Declaring war opens each side&apos;s territory to the other&apos;s armies. Peace can be offered after{' '}
          {proseDuration(DIPLOMACY.minWarSecondsBeforePeace)} of war and an offer stands for {proseDuration(DIPLOMACY.peaceOfferExpirySeconds)}; after a refusal,
          wait {proseDuration(DIPLOMACY.peaceRetrySeconds)} before asking again. The AI accepts when it is losing or war-weary. Peace freezes the current borders,
          sends trespassing armies home and starts a truce of {proseDuration(DIPLOMACY.truceSeconds)}.{' '}
          {hasNeutrals(world) ? 'Neutral states may be invaded at any time.' : 'Minor powers are computer-controlled nations that never win: invading one means declaring war on it, and their fortified capitals take a real army to crack.'}{' '}
          Powers at peace with each other and at war with a common enemy are co-belligerents. That is not an alliance: there are no treaties, nobody
          agrees to it, and all it changes is that a power with Liaison Officers sees through the fog of war whatever its co-belligerents see.
        </p>
      </details>
      {/* A table on the desktop; one card per nation on small screens (the cells are named for that). */}
      <table className="dip-table dip-relations">
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
          {scores.filter((s) => listed(s.nation)).map((s) => {
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
                <td className="dc-nation">
                  <span className="dip-nation">
                    <Flag id={s.nation} size={20} />
                    <span>
                      <strong>{def.name}</strong>
                      {me && <span className="you-tag">You</span>}
                      <span className="dip-sub" title={def.speciality?.description ?? `${BLOCS[def.bloc].name}: ${BLOCS[def.bloc].description}`}>
                        {def.speciality?.name ?? POWERS[def.power].name} · morale {Math.round(n.morale)}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="dc-era">{n.eliminated ? '—' : <span className="era-pill">{nationEra(state, s.nation)}</span>}</td>
                <td className="dc-rel">
                  {me ? (
                    <span className="muted">—</span>
                  ) : n.eliminated ? (
                    <span className="rel-pill gone">Eliminated</span>
                  ) : rel.status === 'war' ? (
                    <span className="rel-pill war">
                      <Icon name="swords" size={12} /> War
                    </span>
                  ) : areAllies(state, human, s.nation) ? (
                    <>
                      <span
                        className="rel-pill ally"
                        title={`Also at war with ${listText(commonEnemies(state, human, s.nation).map((e) => nationName(world, e)))}. Not an alliance: no treaty binds you.`}
                        data-ally={s.nation}
                      >
                        <Icon name="flag" size={12} /> Co-belligerent
                      </span>
                      <span className={`ally-intel${liaison ? ' on' : ''}`}>
                        <Icon name="eye" size={11} /> {liaison ? 'You share its sight' : 'Liaison Officers share its sight'}
                      </span>
                    </>
                  ) : (
                    <span className="rel-pill peace">
                      <Icon name="flag" size={12} /> Peace
                    </span>
                  )}
                  {!me && truce ? <span className="muted truce"> truce {formatDuration(rel.truceUntil - state.tick, state)}</span> : null}
                </td>
                <td className="dc-power">
                  <span className="power-bar" title={`Military power ${Math.round(power)}`}>
                    <span style={{ width: `${(power / maxPower) * 100}%`, background: def.color }} />
                  </span>
                  <span className="power-val">{Math.round(power)}</span>
                </td>
                <td className="num dc-prov" data-label="Prov.">
                  {s.provinces}
                </td>
                <td className="num dc-vp" data-label="VP">
                  {s.vp}
                </td>
                <td className="num score dc-score" data-label="Score">
                  {Math.round(s.score)}
                </td>
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
          {(folded > 0 || allMinors) && (
            <tr className="dip-more">
              <td colSpan={8}>
                <button onClick={() => setAllMinors((a) => !a)} data-testid="toggle-minors">
                  {allMinors ? 'Show only the minor powers that concern you' : `Show ${folded} more minor power${folded === 1 ? '' : 's'}, at peace and not on your borders`}
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="intro small">
        Score = {VICTORY.score.perVp} × VP + {VICTORY.score.perCity} × cities + {VICTORY.score.perLand} × the land round each city (shared
        between its provinces) + {VICTORY.score.perTech} × technologies. The highest score wins when the campaign time limit is reached.
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
                <span className="obj-name">{world.provinces[id].name}</span>
                <OwnerFlag world={world} owner={owner} province={id} size={12} />
              </button>
            </li>
          );
        })}
      </ul>

      {confirmWar && (
        <DeclareWarDialog
          ctrl={ctrl}
          target={confirmWar}
          onCancel={() => setConfirmWar(null)}
          onConfirm={() => {
            ctrl.submit({ type: 'declareWar', nation: human, target: confirmWar });
            setConfirmWar(null);
          }}
        />
      )}
    </Modal>
  );
}

/** Asks before declaring war on `target`, from the diplomacy table or from an attack order into its territory. */
export function DeclareWarDialog({
  ctrl,
  target,
  order,
  onConfirm,
  onCancel,
}: {
  ctrl: GameController;
  target: NationId;
  /** What happens once war is declared, when an order is waiting on it ("Your army then marches on Lisbon."). */
  order?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { state, world, human } = ctrl;
  const wars = world.nationIds.filter((id) => state.nations[human].relations[id]?.status === 'war');
  return (
    <ConfirmDialog title={`War with ${nationName(world, target)}?`} icon="swords" confirmLabel="Declare war" danger onCancel={onCancel} onConfirm={onConfirm}>
      <p>
        Declaring war lets your armies enter {world.nations[target].adjective} territory, and theirs enter yours. Peace cannot be offered for the first{' '}
        {proseDuration(DIPLOMACY.minWarSecondsBeforePeace)}.
      </p>
      {order && <p>{order}</p>}
      {wars.length > 0 && <p className="warn-text">You are already at war with {wars.map((id) => nationName(world, id)).join(' and ')}.</p>}
    </ConfirmDialog>
  );
}
