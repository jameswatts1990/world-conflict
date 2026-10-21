import { useState } from 'react';
import { SPEED_PRESETS } from '../sim/config/timing';
import { vpToWin, type GameState, type NationId, type World } from '../sim';
import { NationEmblem } from './art/adapters';
import { LoadDialog } from './panels/Dialogs';

const BLURB: Record<string, string> = {
  uk: 'An island fortress. Safe behind the Channel, but every offensive starts with a slow sea crossing.',
  fr: 'The continental hinge. Many provinces and many neighbours — Germany, Italy, Spain and Britain.',
  de: 'Central and exposed. Borders five neutral states and two great powers.',
  it: 'Alpine walls to the north, a long peninsula behind. Mountains favour the defender.',
  es: 'A Pyrenean bastion with France as the only great-power neighbour. Portugal is within reach.',
  pl: 'Open plains between Germany and the edge of the theatre. Czechia lies to the south.',
};

export function MainMenu({
  world,
  onStart,
  onLoad,
}: {
  world: World;
  onStart: (nation: NationId, seed: number) => void;
  onLoad: (state: GameState) => void;
}) {
  const [nation, setNation] = useState<NationId>('fr');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [loading, setLoading] = useState(false);

  return (
    <div className="menu-screen">
      <div className="menu-card">
        <h1>World Conflict</h1>
        <p className="tagline">Real-time grand strategy from the Great War to the Second World War.</p>

        <h2>Choose your nation</h2>
        <div className="nation-grid">
          {world.scenario.nations.map((n) => (
            <button
              key={n.id}
              className={`nation-card${nation === n.id ? ' selected' : ''}`}
              style={{ borderColor: n.color }}
              onClick={() => setNation(n.id)}
              data-nation-card={n.id}
            >
              <NationEmblem nation={n.id} size={22} />
              <strong>{n.name}</strong>
              <span className="muted">{BLURB[n.id]}</span>
              <span className="speciality" title={n.speciality.description}>
                <em>{n.speciality.name}</em> — {n.speciality.description}
              </span>
            </button>
          ))}
        </div>

        <div className="menu-options">
          <label>
            Campaign speed
            <select defaultValue="standard">
              {Object.entries(SPEED_PRESETS).map(([id, p]) => (
                <option key={id} value={id} disabled={!p.available}>
                  {p.label}
                  {p.available ? '' : ' — needs the future server version'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Map seed
            <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
          </label>
        </div>
        <p className="muted">
          Win by holding {vpToWin(world)} of {world.totalVp} objective VP for 90 seconds, or lead on score when the 2½-hour limit ends. Five
          computer opponents control the other powers.
        </p>
        <div className="btn-row">
          <button className="primary big" onClick={() => onStart(nation, seed)} data-testid="start-campaign">
            Start campaign
          </button>
          <button className="big" onClick={() => setLoading(true)} data-testid="menu-load">
            Load game
          </button>
        </div>

        <footer className="credits">
          Map data: <a href="https://www.naturalearthdata.com/">Natural Earth</a> (public domain), simplified and grouped into game provinces.
          The European theatre is playable; the rest of the world is shown for context only. Naval, air, espionage and deeper diplomacy are
          planned for later milestones.
        </footer>
      </div>
      {loading && <LoadDialog world={world} scenarioId={world.scenario.id} onLoad={onLoad} onClose={() => setLoading(false)} />}
    </div>
  );
}
