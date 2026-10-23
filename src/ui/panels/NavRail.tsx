// Left command rail: the game's main windows, one icon each. In the compact
// layouts it becomes a tab bar along the bottom (slimmer on a phone on its side)
// with the less frequent windows behind a "More" menu.
import { useState } from 'react';
import { researchSlots } from '../../sim';
import type { GameController } from '../game/GameController';
import { Icon, type IconName } from '../icons';
import { useEscape } from './Common';

export type PanelId = 'research' | 'diplomacy' | 'save' | 'load' | 'help' | 'menu';

function RailButton({
  icon,
  label,
  hotkey,
  active,
  badge,
  badgeTone,
  progress,
  testId,
  onClick,
}: {
  icon: IconName;
  label: string;
  hotkey?: string;
  active?: boolean;
  badge?: string | number | null;
  badgeTone?: 'red' | 'gold';
  /** 0–1: a thin bar under the label (research under way). */
  progress?: number | null;
  testId?: string;
  onClick: () => void;
}) {
  return (
    <button className={`rail-btn${active ? ' active' : ''}`} onClick={onClick} title={hotkey ? `${label} (${hotkey})` : label} data-testid={testId}>
      <Icon name={icon} size={24} />
      <span className="rail-label">{label}</span>
      {badge ? <span className={`rail-badge ${badgeTone ?? 'gold'}`}>{badge}</span> : null}
      {progress != null && (
        <span className="rail-progress" aria-hidden>
          <span style={{ width: `${progress * 100}%` }} />
        </span>
      )}
    </button>
  );
}

/** The windows behind "More" in the compact layouts. */
function MoreMenu({ onOpen, onClose }: { onOpen: (p: PanelId) => void; onClose: () => void }) {
  useEscape(onClose);
  const item = (id: PanelId, icon: IconName, label: string) => (
    <button
      role="menuitem"
      onClick={() => {
        onClose();
        onOpen(id);
      }}
      data-testid={`open-${id}`}
    >
      <Icon name={icon} size={18} /> {label}
    </button>
  );
  return (
    <>
      <div className="more-backdrop" onClick={onClose} />
      <div className="more-menu" role="menu" aria-label="More">
        {item('save', 'save', 'Save game')}
        {item('load', 'load', 'Load game')}
        {item('help', 'help', 'Help & briefing')}
        {item('menu', 'exit', 'Main menu')}
      </div>
    </>
  );
}

export function NavRail({
  ctrl,
  active,
  feedOpen,
  unreadReports,
  compact,
  onToggleFeed,
  onOpen,
}: {
  ctrl: GameController;
  active: PanelId | null;
  feedOpen: boolean;
  /** Field reports that came in since they were last open (compact layouts keep them closed). */
  unreadReports: number;
  compact: boolean;
  onToggleFeed: () => void;
  onOpen: (p: PanelId) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { state, human } = ctrl;
  const nation = state.nations[human];
  const wars = Object.values(nation.relations).filter((r) => r.status === 'war').length;
  const offers = state.peaceOffers.filter((o) => o.to === human).length;
  // Compact layouts have no research readout in the top bar: the tab shows the nearest finish.
  const job = nation.research.active.reduce<(typeof nation.research.active)[number] | null>((b, j) => (!b || j.remaining < b.remaining ? j : b), null);
  return (
    <nav className="nav-rail" aria-label="Command menu">
      <RailButton
        icon="research"
        label="Research"
        hotkey="R"
        active={active === 'research'}
        badge={nation.research.active.length < researchSlots(state, human) ? '!' : null}
        progress={compact && job ? 1 - job.remaining / job.total : null}
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
      <RailButton
        icon="news"
        label="Reports"
        hotkey="L"
        active={feedOpen}
        badge={unreadReports > 99 ? '99+' : unreadReports || null}
        testId="toggle-reports"
        onClick={onToggleFeed}
      />
      {compact ? (
        <>
          <div className="rail-fill" />
          <RailButton
            icon="more"
            label="More"
            active={moreOpen || active === 'save' || active === 'load' || active === 'help'}
            testId="open-more"
            onClick={() => setMoreOpen((o) => !o)}
          />
          {moreOpen && <MoreMenu onOpen={onOpen} onClose={() => setMoreOpen(false)} />}
        </>
      ) : (
        <>
          <div className="rail-sep" />
          <RailButton icon="save" label="Save" active={active === 'save'} testId="open-save" onClick={() => onOpen('save')} />
          <RailButton icon="load" label="Load" active={active === 'load'} testId="open-load" onClick={() => onOpen('load')} />
          <RailButton icon="help" label="Help" hotkey="H" active={active === 'help'} onClick={() => onOpen('help')} />
          <div className="rail-fill" />
          <RailButton icon="exit" label="Menu" onClick={() => onOpen('menu')} />
        </>
      )}
    </nav>
  );
}
