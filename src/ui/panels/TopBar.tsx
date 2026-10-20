import { CLIENT_SPEEDS } from '../../sim/config/timing';
import { RESOURCE_KEYS, heldVp, nationEra, vpToWin } from '../../sim';
import type { GameController } from '../game/GameController';
import { fmt, fmtRate, formatClock } from '../format';
import { RESOURCE_LABEL, ResourceIcon } from '../icons';

export type PanelId = 'research' | 'diplomacy' | 'save' | 'load' | 'help' | 'menu';

export function TopBar({ ctrl, onOpen }: { ctrl: GameController; onOpen: (p: PanelId) => void }) {
  const { state, world, human } = ctrl;
  const nation = state.nations[human];
  const def = world.nations[human];
  const rates = nation.lastRates;
  const remaining = state.settings.timeLimitTicks - state.tick;
  const vp = heldVp(state, world, human);
  const need = vpToWin(world);
  const active = nation.research.active;

  return (
    <header className="topbar">
      <div className="tb-nation" style={{ borderColor: def.color }}>
        <span className="swatch big" style={{ background: def.color }} />
        <div>
          <div className="tb-nation-name">{def.name}</div>
          <div className="tb-era">{nationEra(state, human)} era</div>
        </div>
      </div>

      <div className="tb-resources">
        {RESOURCE_KEYS.map((k) => {
          const short = (k === 'money' && nation.shortages.money) || (k === 'fuel' && nation.shortages.fuel);
          return (
            <div key={k} className={`tb-res${short ? ' short' : ''}`} title={`${RESOURCE_LABEL[k]}: ${Math.floor(nation.resources[k])} (${fmtRate(rates[k])} per minute)`} data-resource={k}>
              <ResourceIcon kind={k} size={18} />
              <span className="tb-res-val">{fmt(nation.resources[k])}</span>
              <span className={`tb-res-rate${rates[k] < 0 ? ' neg' : ''}`}>{fmtRate(rates[k])}/m</span>
            </div>
          );
        })}
      </div>

      <div className="tb-status">
        <div className="tb-clock" title="Game time / time remaining (campaign time limit)">
          <span>{formatClock(state.tick, state)}</span>
          <span className="tb-sub">−{formatClock(Math.max(0, remaining), state)} left</span>
        </div>
        <div className="tb-vp" title={`Objective victory: hold ${need} VP for 90 s`}>
          <span>★ {vp}/{need} VP</span>
          <span className="tb-sub">{active ? 'Researching…' : 'No research'}</span>
        </div>
      </div>

      <div className="tb-speed" role="group" aria-label="Simulation speed">
        <button
          className={`speed-btn pause${ctrl.loop.paused ? ' active' : ''}`}
          onClick={() => ctrl.togglePause()}
          title="Pause / resume (Space)"
          data-testid="pause"
        >
          {ctrl.loop.paused ? '▶ Resume' : '❚❚ Pause'}
        </button>
        {CLIENT_SPEEDS.map((s, i) => (
          <button
            key={s.multiplier}
            className={`speed-btn${s.dev ? ' dev' : ''}${ctrl.loop.speed === s.multiplier ? ' active' : ''}`}
            onClick={() => ctrl.setSpeed(s.multiplier)}
            title={s.dev ? `Development speed ${s.multiplier}x — for testing only (key ${i + 1})` : `Speed ${s.multiplier}x (key ${i + 1})`}
            data-speed={s.multiplier}
          >
            {s.label}
          </button>
        ))}
      </div>

      <nav className="tb-actions">
        <button onClick={() => onOpen('research')} title="Research (R)" data-testid="open-research">
          Research
        </button>
        <button onClick={() => onOpen('diplomacy')} title="Diplomacy & objectives (D)" data-testid="open-diplomacy">
          Diplomacy
        </button>
        <button onClick={() => onOpen('save')} data-testid="open-save">
          Save
        </button>
        <button onClick={() => onOpen('load')} data-testid="open-load">
          Load
        </button>
        <button onClick={() => onOpen('help')} title="Tutorial & controls (H)">
          ?
        </button>
        <button onClick={() => onOpen('menu')} title="Main menu">
          Menu
        </button>
      </nav>
    </header>
  );
}
