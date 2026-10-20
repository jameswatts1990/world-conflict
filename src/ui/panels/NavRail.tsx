// Left command rail: the game's main windows, one icon each.
import type { GameController } from '../game/GameController';
import { Icon, type IconName } from '../icons';

export type PanelId = 'research' | 'diplomacy' | 'save' | 'load' | 'help' | 'menu';

function RailButton({
  icon,
  label,
  hotkey,
  active,
  badge,
  badgeTone,
  testId,
  onClick,
}: {
  icon: IconName;
  label: string;
  hotkey?: string;
  active?: boolean;
  badge?: string | number | null;
  badgeTone?: 'red' | 'gold';
  testId?: string;
  onClick: () => void;
}) {
  return (
    <button className={`rail-btn${active ? ' active' : ''}`} onClick={onClick} title={hotkey ? `${label} (${hotkey})` : label} data-testid={testId}>
      <Icon name={icon} size={24} />
      <span className="rail-label">{label}</span>
      {badge ? <span className={`rail-badge ${badgeTone ?? 'gold'}`}>{badge}</span> : null}
    </button>
  );
}

export function NavRail({
  ctrl,
  active,
  feedOpen,
  onToggleFeed,
  onOpen,
}: {
  ctrl: GameController;
  active: PanelId | null;
  feedOpen: boolean;
  onToggleFeed: () => void;
  onOpen: (p: PanelId) => void;
}) {
  const { state, human } = ctrl;
  const nation = state.nations[human];
  const wars = Object.values(nation.relations).filter((r) => r.status === 'war').length;
  const offers = state.peaceOffers.filter((o) => o.to === human).length;
  return (
    <nav className="nav-rail" aria-label="Command menu">
      <RailButton
        icon="research"
        label="Research"
        hotkey="R"
        active={active === 'research'}
        badge={nation.research.active ? null : '!'}
        testId="open-research"
        onClick={() => onOpen('research')}
      />
      <RailButton
        icon="diplomacy"
        label="Diplomacy"
        hotkey="D"
        active={active === 'diplomacy'}
        badge={offers || wars || null}
        badgeTone={offers ? 'gold' : 'red'}
        testId="open-diplomacy"
        onClick={() => onOpen('diplomacy')}
      />
      <RailButton icon="news" label="Reports" hotkey="L" active={feedOpen} onClick={onToggleFeed} />
      <div className="rail-sep" />
      <RailButton icon="save" label="Save" active={active === 'save'} testId="open-save" onClick={() => onOpen('save')} />
      <RailButton icon="load" label="Load" active={active === 'load'} testId="open-load" onClick={() => onOpen('load')} />
      <RailButton icon="help" label="Help" hotkey="H" active={active === 'help'} onClick={() => onOpen('help')} />
      <div className="rail-fill" />
      <RailButton icon="exit" label="Menu" onClick={() => onOpen('menu')} />
    </nav>
  );
}
