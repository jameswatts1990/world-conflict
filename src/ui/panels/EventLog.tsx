import { useState } from 'react';
import { eventsFor } from '../../sim';
import type { GameController } from '../game/GameController';
import { formatClock } from '../format';

export function EventLog({ ctrl, onFocus }: { ctrl: GameController; onFocus: (pid: string) => void }) {
  const [open, setOpen] = useState(true);
  const events = eventsFor(ctrl.state, ctrl.human).slice(-80).reverse();
  return (
    <aside className={`event-log${open ? '' : ' collapsed'}`} data-testid="event-log">
      <header onClick={() => setOpen(!open)} title="Toggle event log (L)">
        <span>Event log</span>
        <span>{open ? '▾' : '▸'}</span>
      </header>
      {open && (
        <ol>
          {events.map((e) => (
            <li key={e.id} className={`ev ${e.severity}${e.province ? ' clickable' : ''}`} onClick={() => e.province && onFocus(e.province)}>
              <time>{formatClock(e.tick, ctrl.state)}</time> {e.text}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
