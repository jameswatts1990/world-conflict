import { eventsFor, type GameEvent } from '../../sim';
import type { GameController } from '../game/GameController';
import { formatClock } from '../format';
import { Icon, type IconName } from '../icons';

const KIND_ICON: Record<string, IconName> = {
  war: 'swords',
  battle: 'swords',
  'battle-end': 'swords',
  'army-destroyed': 'swords',
  peace: 'flag',
  research: 'research',
  construction: 'factory',
  recruitment: 'shield',
  capture: 'target',
  supply: 'supply',
  attrition: 'supply',
  shortage: 'warning',
  eliminated: 'warning',
  'victory-warning': 'star',
  'victory-averted': 'star',
  outcome: 'star',
  move: 'move',
  withdraw: 'move',
  rout: 'warning',
  surrender: 'flag',
  disband: 'exit',
  demolish: 'factory',
  'city-growth': 'city',
  'peace-offer': 'flag',
  'peace-rejected': 'flag',
  'peace-expired': 'flag',
};

export function eventIcon(e: GameEvent): IconName {
  return KIND_ICON[e.kind] ?? 'news';
}

export function EventLog({ ctrl, open, onToggle, onFocus }: { ctrl: GameController; open: boolean; onToggle: () => void; onFocus: (pid: string) => void }) {
  const events = eventsFor(ctrl.state, ctrl.human).slice(-80).reverse();
  return (
    <aside className={`event-log${open ? '' : ' collapsed'}`} data-testid="event-log">
      <header onClick={onToggle} title="Toggle field reports (L)">
        <Icon name="news" size={16} />
        <span className="el-title">Field reports</span>
        <span className="el-count">{events.length}</span>
        <span className="el-chev">{open ? '▾' : '▴'}</span>
      </header>
      {open && (
        <ol>
          {events.map((e) => (
            <li key={e.id} className={`ev sev-${e.severity}${e.province ? ' clickable' : ''}`} onClick={() => e.province && onFocus(e.province)}>
              <span className="ev-icon">
                <Icon name={eventIcon(e)} size={13} />
              </span>
              <time>{formatClock(e.tick, ctrl.state)}</time>
              <span className="ev-text">{e.text}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
