import { ERA_RULES, TECHS, TECH_BY_ID } from '../../sim/config/research';
import { checkResearch, nationEra } from '../../sim';
import type { GameController } from '../game/GameController';
import { formatDuration } from '../format';
import { Cost, Modal, Progress } from './Common';

const TIER_NAMES = { 1: 'Great War refinements', 2: 'Interwar developments', 3: 'WWII upgrades' } as const;

export function ResearchPanel({ ctrl, onClose }: { ctrl: GameController; onClose: () => void }) {
  const { state, human } = ctrl;
  const research = state.nations[human].research;
  const res = state.nations[human].resources;
  return (
    <Modal title={`Research — ${nationEra(state, human)} era`} onClose={onClose} wide>
      <p className="muted">
        One project at a time; cost is paid up front. Era: Interwar after {ERA_RULES.interwarTier2Count} tier-2 techs, WWII once
        infantry, artillery and tanks are all upgraded. Upgrades apply to existing units immediately.
      </p>
      <div className="tech-columns">
        {([1, 2, 3] as const).map((tier) => (
          <div key={tier} className="tech-column">
            <h4>
              Tier {tier}: {TIER_NAMES[tier]}
            </h4>
            {TECHS.filter((t) => t.tier === tier).map((t) => {
              const done = research.completed.includes(t.id);
              const active = research.active?.tech === t.id ? research.active : null;
              const check = checkResearch(state, human, t.id);
              const locked = t.requires.some((r) => !research.completed.includes(r));
              return (
                <div key={t.id} className={`tech${done ? ' done' : ''}${active ? ' active' : ''}${locked ? ' locked' : ''}`} data-tech={t.id}>
                  <div className="tech-name">
                    {done ? '✓ ' : ''}
                    {t.name}
                  </div>
                  <div className="tech-desc">{t.description}</div>
                  {t.requires.length > 0 && (
                    <div className="tech-req">Requires: {t.requires.map((r) => TECH_BY_ID[r].name).join(', ')}</div>
                  )}
                  {active ? (
                    <Progress value={1 - active.remaining / active.total} label={formatDuration(active.remaining, state)} />
                  ) : !done ? (
                    <div className="tech-foot">
                      <Cost cost={t.cost} have={res} />
                      <span className="muted">{formatDuration(t.seconds * state.settings.durationScale, state)}</span>
                      <button disabled={!check.ok} title={check.ok ? 'Start research' : check.reason} onClick={() => ctrl.submit({ type: 'research', nation: human, tech: t.id })}>
                        Research
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Modal>
  );
}
