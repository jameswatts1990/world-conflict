import { ERA_RULES, TECHS, TECH_BY_ID, type TechConfig } from '../../sim/config/research';
import { checkResearch, nationEra, type BuildingType, type Era, type UnitType } from '../../sim';
import type { GameController } from '../game/GameController';
import { formatDuration } from '../format';
import { BuildingIcon, Icon, UnitGlyph, type IconName } from '../icons';
import { Cost, Modal, Progress } from './Common';

const TIER_NAMES = { 1: 'Great War refinements', 2: 'Interwar developments', 3: 'WWII upgrades' } as const;
const ERAS: { id: Era; label: string; years: string }[] = [
  { id: 'WWI', label: 'Great War', years: '1914–1918' },
  { id: 'Interwar', label: 'Interwar', years: '1919–1938' },
  { id: 'WWII', label: 'Second World War', years: '1939–1945' },
];

type Art = { unit: UnitType } | { icon: IconName } | { building: BuildingType };

/** Card artwork per technology; anything unlisted falls back to what its first effect does. */
const TECH_ART: Record<string, Art> = {
  industrialMobilisation: { icon: 'factory' },
  motorTransport: { icon: 'truck' },
  syntheticFuel: { icon: 'oil' },
  assemblyLine: { icon: 'gear' },
  fieldRadio: { icon: 'radio' },
  fortificationEngineering: { building: 'fortifications' },
  combinedArms: { icon: 'swords' },
};

function TechArt({ tech }: { tech: TechConfig }) {
  const e = tech.effects[0];
  const art: Art = TECH_ART[tech.id] ?? ((e.kind === 'unitStat' || e.kind === 'unitModel') && e.unit !== 'all' ? { unit: e.unit } : { icon: 'research' });
  if ('unit' in art) return <UnitGlyph type={art.unit} size={34} />;
  if ('building' in art) return <BuildingIcon kind={art.building} size={26} />;
  return <Icon name={art.icon} size={26} />;
}

export function ResearchPanel({ ctrl, onClose }: { ctrl: GameController; onClose: () => void }) {
  const { state, human } = ctrl;
  const research = state.nations[human].research;
  const res = state.nations[human].resources;
  const era = nationEra(state, human);
  const eraIndex = ERAS.findIndex((e) => e.id === era);
  const active = research.active;
  return (
    <Modal
      title="Research"
      icon="research"
      subtitle={`${research.completed.length} of ${TECHS.length} technologies · one project at a time, paid up front`}
      onClose={onClose}
      size="wide"
    >
      <div className="era-track">
        {ERAS.map((e, i) => (
          <div key={e.id} className={`era-step${i < eraIndex ? ' past' : ''}${i === eraIndex ? ' current' : ''}`}>
            <span className="era-dot">{i < eraIndex ? <Icon name="check" size={14} /> : i + 1}</span>
            <span className="era-text">
              <span className="era-name">{e.label}</span>
              <span className="era-years">{e.years}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="intro">
        Interwar era after {ERA_RULES.interwarTier2Count} tier-2 technologies; WWII once infantry, artillery and tanks are all upgraded. Upgrades
        apply to existing units immediately.
      </p>
      {active && (
        <div className="current-project">
          <span className="cp-label">Current project</span>
          <span className="cp-name">{TECH_BY_ID[active.tech].name}</span>
          <Progress value={1 - active.remaining / active.total} label={`${formatDuration(active.remaining, state)} remaining`} tone="blue" />
        </div>
      )}
      <div className="tech-columns">
        {([1, 2, 3] as const).map((tier) => (
          <div key={tier} className="tech-column">
            <h4 className="tier-head">
              <span className="tier-num">{['I', 'II', 'III'][tier - 1]}</span>
              {TIER_NAMES[tier]}
            </h4>
            {TECHS.filter((t) => t.tier === tier).map((t) => {
              const done = research.completed.includes(t.id);
              const running = active?.tech === t.id ? active : null;
              const check = checkResearch(state, human, t.id);
              const locked = t.requires.some((r) => !research.completed.includes(r));
              return (
                <div key={t.id} className={`tech${done ? ' done' : ''}${running ? ' active' : ''}${locked ? ' locked' : ''}`} data-tech={t.id}>
                  <div className="tech-top">
                    <span className="tech-art">
                      <TechArt tech={t} />
                    </span>
                    <div className="tech-titles">
                      <div className="tech-name">{t.name}</div>
                      <div className="tech-desc">{t.description}</div>
                    </div>
                    {done && (
                      <span className="tech-state ok" title="Researched">
                        <Icon name="check" size={16} />
                      </span>
                    )}
                    {locked && !done && (
                      <span className="tech-state" title="Prerequisites missing">
                        <Icon name="lock" size={15} />
                      </span>
                    )}
                  </div>
                  {t.requires.length > 0 && (
                    <div className="tech-req">
                      Requires:{' '}
                      {t.requires.map((r, i) => (
                        <span key={r} className={research.completed.includes(r) ? 'ok' : ''}>
                          {i ? ', ' : ''}
                          {TECH_BY_ID[r].name}
                        </span>
                      ))}
                    </div>
                  )}
                  {running ? (
                    <Progress value={1 - running.remaining / running.total} label={formatDuration(running.remaining, state)} tone="blue" />
                  ) : !done ? (
                    <div className="tech-foot">
                      <Cost cost={t.cost} have={res} />
                      <span className="tech-time">
                        <Icon name="clock" size={12} /> {formatDuration(t.seconds * state.settings.durationScale, state)}
                      </span>
                      <button className="primary" disabled={!check.ok} title={check.ok ? 'Start research' : check.reason} onClick={() => ctrl.submit({ type: 'research', nation: human, tech: t.id })}>
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
