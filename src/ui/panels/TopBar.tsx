import { TECH_BY_ID } from '../../sim/config/research';
import { VICTORY } from '../../sim/config/rules';
import { SHORTAGE_TEXT } from '../../sim/systems/economy';
import { CLIENT_SPEEDS } from '../../sim/config/timing';
import { RESOURCE_KEYS, heldVp, homeSoilMult, nationEconomy, nationEra, nationName, nextQueuedResearch, researchSlots, sentence, vpToWin, type ResourceKey } from '../../sim';
import type { GameController } from '../game/GameController';
import { Flag } from '../flags';
import { costParts, fmt, fmtRate, formatClock, formatDuration, proseDuration, shortfallText } from '../format';
import { Icon, RESOURCE_LABEL, ResourceIcon } from '../icons';
import { moraleClass } from './Common';
import type { PanelId } from './NavRail';

/** What each resource is for, shown in its breakdown. */
const RESOURCE_HINT: Record<ResourceKey, string> = {
  money: 'Pays every soldier (most of foot and horse upkeep), and part of every unit, building and research.',
  materials: 'Steel, guns and shells: most of the price of artillery, armour and buildings, and the upkeep of guns and tanks.',
  fuel: 'From oil fields, oil wells and refineries. Tanks and motor vehicles need it to be built and to keep moving.',
  manpower: 'Grows with population; farms, Barracks and housing add more. Every new unit needs it, and every unit a few replacements.',
  fusion: 'Scientific breakthroughs, from Laboratories, Universities and Field Stations only. With money, it pays for all research.',
};

export function TopBar({ ctrl, onOpen }: { ctrl: GameController; onOpen: (p: PanelId) => void }) {
  const { state, world, human } = ctrl;
  const nation = state.nations[human];
  const def = world.nations[human];
  const eco = nationEconomy(state, world, human);
  const units = Object.values(state.armies).reduce((n, a) => (a.owner === human ? n + a.units.length : n), 0);
  const remaining = state.settings.timeLimitTicks - state.tick;
  const vp = heldVp(state, world, human);
  const need = vpToWin(world);
  const jobs = nation.research.active;
  const slots = researchSlots(state, human);
  const queued = nation.research.queue.length;
  // Show the project closest to completion, or the queued one waiting for funds.
  const active = jobs.reduce<(typeof jobs)[number] | null>((best, j) => (!best || j.remaining < best.remaining ? j : best), null);
  const over = !!state.outcome;
  const waiting = active || over ? null : nextQueuedResearch(state, human);
  const idle = jobs.length < slots;
  const leader = state.victory.leader;
  const homeSoil = Math.round((homeSoilMult(state, world, human, def.capital) - 1) * 100);

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
          const short = k !== 'fusion' && nation.shortages[k] === true;
          return (
            <div key={k} className={`tb-res${short ? ' short' : ''}`} data-resource={k} tabIndex={0} aria-label={RESOURCE_LABEL[k]}>
              <span className="tb-res-icon">
                <ResourceIcon kind={k} size={20} />
              </span>
              <span className="tb-res-text">
                <span className="tb-res-val">{fmt(nation.resources[k])}</span>
                <span className={`tb-res-rate${eco.net[k] < 0 ? ' neg' : ''}`}>{fmtRate(eco.net[k])}/m</span>
              </span>
              <div className="tb-pop" role="tooltip">
                <div className="tb-pop-title">
                  <ResourceIcon kind={k} size={16} /> {RESOURCE_LABEL[k]}
                </div>
                <dl>
                  <dt>Stockpile</dt>
                  <dd>{Math.floor(nation.resources[k]).toLocaleString('en-GB')}</dd>
                  <dt>Production</dt>
                  <dd className="ok">{fmtRate(eco.income[k])} / min</dd>
                  {k !== 'fusion' && (
                    <>
                      <dt>Army upkeep{units > 0 ? ` (${units} units)` : ''}</dt>
                      <dd className={eco.upkeep[k] > 0 ? 'bad' : 'muted'}>{fmtRate(-eco.upkeep[k])} / min</dd>
                    </>
                  )}
                  <dt className="total">Net</dt>
                  <dd className={`total${eco.net[k] < 0 ? ' bad' : ''}`}>{fmtRate(eco.net[k])} / min</dd>
                </dl>
                {short && <div className="tb-pop-warn">{SHORTAGE_TEXT[k]}</div>}
                <p>{RESOURCE_HINT[k]}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={`tb-morale ${moraleClass(nation.morale)}`}
        title={`National morale: the home-front average. It caps how high your units' morale can climb, makes them fight harder on home soil (+${homeSoil}% now, more the higher it is) and decides how long the nation will fight.`}
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
        ) : waiting ? (
          <span className="tb-research-text" title={costParts(waiting.shortfall).length ? `Needs another ${shortfallText(waiting.shortfall)}` : undefined}>
            <span className="tb-research-name">{TECH_BY_ID[waiting.tech].name}</span>
            <span className="tb-sub warn-text">{costParts(waiting.shortfall).length ? 'Queued · waiting for funds' : 'Queued · starting'}</span>
          </span>
        ) : (
          <span className="tb-research-text">
            <span className="tb-research-name">No research</span>
            <span className="tb-sub">{over ? 'Campaign over' : 'Choose a project'}</span>
          </span>
        )}
      </button>

      <div className="tb-spacer" />

      <div
        className={`tb-vp${leader && !over ? (leader === human ? ' winning' : ' alert') : ''}`}
        title={`Objective victory: hold ${need} of ${world.totalVp} VP for ${proseDuration(VICTORY.holdSeconds)}`}
      >
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
        <span className="tb-sub">
          {over
            ? `${state.outcome!.winner ? sentence(nationName(world, state.outcome!.winner)) : 'Nobody'} won`
            : leader
              ? leader === human
                ? 'Hold on for victory!'
                : `${sentence(nationName(world, leader))} nearing victory!`
              : 'Objectives held'}
        </span>
      </div>

      <div className="tb-clock" title="Game time, and time left before the campaign ends on score">
        <Icon name="clock" size={18} />
        <div>
          <div className="tb-clock-val">{formatClock(state.tick, state)}</div>
          <div className="tb-sub">{over ? 'Campaign over' : `${formatClock(Math.max(0, remaining), state)} left`}</div>
        </div>
      </div>

      <div className="tb-speed" role="group" aria-label="Simulation speed">
        <button
          className={`speed-btn pause${ctrl.loop.paused ? ' active' : ''}`}
          onClick={() => ctrl.togglePause()}
          disabled={over}
          title="Pause / resume (Space)"
          data-testid="pause"
        >
          <Icon name={ctrl.loop.paused ? 'play' : 'pause'} size={14} />
          <span className="pause-label">{ctrl.loop.paused ? 'Resume' : 'Pause'}</span>
        </button>
        {CLIENT_SPEEDS.map((s, i) => (
          <span key={s.multiplier} className={`speed-slot${s.dev ? ' dev' : ''}`}>
            {s.dev && !CLIENT_SPEEDS[i - 1]?.dev && (
              <span className="dev-tag" title="Development speeds, for testing only">
                Dev
              </span>
            )}
            <button
              className={`speed-btn${s.dev ? ' dev' : ''}${ctrl.loop.speed === s.multiplier ? ' active' : ''}`}
              onClick={() => ctrl.setSpeed(s.multiplier)}
              disabled={over}
              title={s.dev ? `Development speed ${s.multiplier}x, for testing only (key ${i + 1})` : `Speed ${s.multiplier}x (key ${i + 1})`}
              data-speed={s.multiplier}
            >
              {s.multiplier}x
            </button>
          </span>
        ))}
      </div>
    </header>
  );
}
