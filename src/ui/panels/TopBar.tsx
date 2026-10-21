import { TECH_BY_ID } from '../../sim/config/research';
import { CLIENT_SPEEDS } from '../../sim/config/timing';
import { RESOURCE_KEYS, heldVp, nationEra, researchSlots, vpToWin } from '../../sim';
import type { GameController } from '../game/GameController';
import { Flag } from '../flags';
import { fmt, fmtRate, formatClock, formatDuration } from '../format';
import { Icon, RESOURCE_LABEL, ResourceIcon } from '../icons';
import { moraleClass } from './Common';
import type { PanelId } from './NavRail';

export function TopBar({ ctrl, onOpen }: { ctrl: GameController; onOpen: (p: PanelId) => void }) {
  const { state, world, human } = ctrl;
  const nation = state.nations[human];
  const def = world.nations[human];
  const rates = nation.lastRates;
  const remaining = state.settings.timeLimitTicks - state.tick;
  const vp = heldVp(state, world, human);
  const need = vpToWin(world);
  const jobs = nation.research.active;
  const slots = researchSlots(state, human);
  const queued = nation.research.queue.length;
  // Show the project closest to completion.
  const active = jobs.reduce<(typeof jobs)[number] | null>((best, j) => (!best || j.remaining < best.remaining ? j : best), null);
  const idle = jobs.length < slots;
  const leader = state.victory.leader;

  return (
    <header className="topbar" style={{ '--nation': def.color } as React.CSSProperties}>
      <div className="tb-nation">
        <Flag id={human} size={26} />
        <div>
          <div className="tb-nation-name">{def.name}</div>
          <div className="tb-era">{nationEra(state, human)} era</div>
        </div>
      </div>

      <div className="tb-resources">
        {RESOURCE_KEYS.map((k) => {
          const short = (k === 'money' && nation.shortages.money) || (k === 'fuel' && nation.shortages.fuel);
          return (
            <div
              key={k}
              className={`tb-res${short ? ' short' : ''}`}
              title={`${RESOURCE_LABEL[k]}: ${Math.floor(nation.resources[k])} (${fmtRate(rates[k])} per minute)`}
              data-resource={k}
            >
              <span className="tb-res-icon">
                <ResourceIcon kind={k} size={20} />
              </span>
              <span className="tb-res-text">
                <span className="tb-res-val">{fmt(nation.resources[k])}</span>
                <span className={`tb-res-rate${rates[k] < 0 ? ' neg' : ''}`}>{fmtRate(rates[k])}/m</span>
              </span>
            </div>
          );
        })}
      </div>

      <div
        className={`tb-morale ${moraleClass(nation.morale)}`}
        title="National morale: the home-front average. It caps how high your units' morale can climb and decides how long the nation will fight."
        data-testid="national-morale"
      >
        <span className="tb-morale-val">{Math.round(nation.morale)}</span>
        <span className="tb-sub">morale</span>
      </div>

      <button
        className={`tb-research${idle ? ' idle' : ''}`}
        onClick={() => onOpen('research')}
        title={`Research tree (R) — ${jobs.map((j) => TECH_BY_ID[j.tech].name).join(', ') || 'nothing running'}`}
      >
        <Icon name="research" size={18} />
        {active ? (
          <span className="tb-research-text">
            <span className="tb-research-name">{TECH_BY_ID[active.tech].name}</span>
            <span className="tb-research-bar">
              <span style={{ width: `${(1 - active.remaining / active.total) * 100}%` }} />
            </span>
            <span className="tb-sub">
              {formatDuration(active.remaining, state)} left · {jobs.length}/{slots} slots{queued ? ` · +${queued} queued` : ''}
            </span>
          </span>
        ) : (
          <span className="tb-research-text">
            <span className="tb-research-name">No research</span>
            <span className="tb-sub">Choose a project</span>
          </span>
        )}
      </button>

      <div className="tb-spacer" />

      <div className={`tb-vp${leader ? ' alert' : ''}`} title={`Objective victory: hold ${need} VP for 90 s`}>
        <div className="tb-vp-head">
          <Icon name="star" size={15} />
          <span className="tb-vp-val">
            {vp}
            <span className="muted">/{need} VP</span>
          </span>
        </div>
        <span className="tb-vp-bar">
          <span style={{ width: `${Math.min(1, vp / need) * 100}%` }} />
        </span>
        <span className="tb-sub">{leader ? `${world.nations[leader].name} nearing victory!` : 'Objectives held'}</span>
      </div>

      <div className="tb-clock" title="Game time / time remaining (campaign time limit)">
        <Icon name="clock" size={18} />
        <div>
          <div className="tb-clock-val">{formatClock(state.tick, state)}</div>
          <div className="tb-sub">−{formatClock(Math.max(0, remaining), state)} left</div>
        </div>
      </div>

      <div className="tb-speed" role="group" aria-label="Simulation speed">
        <button
          className={`speed-btn pause${ctrl.loop.paused ? ' active' : ''}`}
          onClick={() => ctrl.togglePause()}
          title="Pause / resume (Space)"
          data-testid="pause"
        >
          <Icon name={ctrl.loop.paused ? 'play' : 'pause'} size={14} />
          {ctrl.loop.paused ? 'Resume' : 'Pause'}
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
    </header>
  );
}
