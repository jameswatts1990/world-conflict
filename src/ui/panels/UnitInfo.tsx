// A unit type's details: what it is for, its numbers, and what it is good and bad at. Opened by
// tapping a unit on the recruit tab (with a Recruit button) or a formation in an army.
import { createPortal } from 'react-dom';
import { BUILDINGS } from '../../sim/config/buildings';
import { UNITS } from '../../sim/config/units';
import { checkRecruit, currentModel, recruitCost, recruitTicks, unitGen, unitStats, type OwnerId, type ProvinceId, type UnitClass, type UnitType } from '../../sim';
import { UnitPicture } from '../art/adapters';
import type { GameController } from '../game/GameController';
import { formatDuration } from '../format';
import { Icon, RESOURCE_LABEL } from '../icons';
import { unitTraits } from '../unitInfo';
import { Cost, Modal } from './Common';

export const CLASS_LABEL: Record<UnitClass, string> = { infantry: 'Infantry', mobile: 'Mobile', support: 'Support', armour: 'Armour' };

/**
 * `nation` is whose equipment and bonuses are shown (yours, or the army's owner). With `pid` (one of your
 * cities), the card offers to recruit the unit there.
 */
export function UnitInfo({ ctrl, type, nation, pid, onClose }: { ctrl: GameController; type: UnitType; nation: OwnerId; pid?: ProvinceId; onClose: () => void }) {
  const { state, world, human } = ctrl;
  const cfg = UNITS[type];
  const gen = unitGen(state, nation, type);
  const model = currentModel(state, world, nation, type);
  const s = unitStats(state, nation, type);
  const traits = nation === 'neutral' ? { strengths: [], weaknesses: [], bonuses: [] } : unitTraits(state, world, nation, type);
  const check = pid ? checkRecruit(state, world, human, pid, type) : null;
  const upkeep = Object.entries(cfg.upkeepPerMinute).filter(([, v]) => v);
  // Opened from inside a panel (the dock, a phone's sheet or page): drawn over the whole screen.
  return createPortal(
    <Modal title={model.name} icon="shield" subtitle={`${cfg.name} · ${model.year} · ${CLASS_LABEL[cfg.class]}`} onClose={onClose} size="narrow">
      <div className="unit-info" data-testid="unit-info" data-unit={type}>
        <div className="ui-hero">
          <UnitPicture world={world} type={type} gen={gen} nation={nation} width={150} />
          <div>
            <div className="ui-role">{cfg.role}</div>
            <p className="ui-desc">{cfg.description}</p>
            {model.detail && <p className="muted small">{model.detail}</p>}
          </div>
        </div>
        <div className="ui-stats">
          <span title="Damage when attacking, against unarmoured / armoured targets">
            Attack <b>{s.attack.soft.toFixed(1)}</b> / {s.attack.hard.toFixed(1)}
          </span>
          <span title="Damage when defending its own province, against unarmoured / armoured targets">
            Defence <b>{s.defence.soft.toFixed(1)}</b> / {s.defence.hard.toFixed(1)}
          </span>
          <span>
            Hit points <b>{s.maxHp}</b>
          </span>
          <span>
            Armour <b>{Math.round(s.hardness * 100)}%</b>
          </span>
          <span>
            Speed <b>{(s.speedKmPerTick * 60).toFixed(0)}</b> km/min
          </span>
          {nation === human && (
            <span>
              Trains in <b>{formatDuration(recruitTicks(state, human, type), state)}</b>
            </span>
          )}
        </div>
        <div className="ui-lists">
          {traits.strengths.length > 0 && (
            <div className="ui-list good">
              <h5>
                <Icon name="check" size={14} /> Strengths
              </h5>
              <ul>
                {traits.strengths.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {traits.weaknesses.length > 0 && (
            <div className="ui-list bad">
              <h5>
                <Icon name="warning" size={14} /> Weaknesses
              </h5>
              <ul>
                {traits.weaknesses.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {traits.bonuses.length > 0 && (
            <div className="ui-list bonus">
              <h5>
                <Icon name="star" size={14} /> National bonus: {traits.bonuses[0]}
              </h5>
              <ul>
                {traits.bonuses.slice(1).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {nation === human && (
          <div className="ui-foot">
            <span>
              Cost <Cost cost={recruitCost(state, human, type)} have={state.nations[human].resources} />
            </span>
            {upkeep.length > 0 && (
              <span className="muted small">
                Upkeep {upkeep.map(([k, v]) => `${v} ${RESOURCE_LABEL[k as keyof typeof RESOURCE_LABEL].toLowerCase()}`).join(', ')} a minute
              </span>
            )}
            {cfg.requires.length > 0 && <span className="muted small">Raised where there is a {cfg.requires.map((b) => BUILDINGS[b].name).join(' and a ')}</span>}
          </div>
        )}
        <div className="btn-row">
          <button onClick={onClose}>Close</button>
          {pid && check && (
            <button
              className="primary"
              disabled={!check.ok}
              title={check.ok ? undefined : check.reason}
              onClick={() => ctrl.submit({ type: 'recruit', nation: human, province: pid, unitType: type })}
            >
              Recruit
            </button>
          )}
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
