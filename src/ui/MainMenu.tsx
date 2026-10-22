import { memo, useEffect, useMemo, useState } from 'react';
import { VICTORY } from '../sim/config/rules';
import { SPEED_PRESETS } from '../sim/config/timing';
import { vpToWin, type GameSettings, type GameState, type NationId, type ProvinceId, type World } from '../sim';
import { lighten, ownerColor } from './color';
import { Flag } from './flags';
import { hoursText, proseDuration } from './format';
import { Icon } from './icons';
import { mapGeometry, type MapGeometry } from './map/geo';
import { TERRAIN_BASE, seaGlowTexture, terrainTexture, type TerrainTexture } from './map/terrain';
import { LoadDialog } from './panels/Dialogs';

const BLURB: Record<string, string> = {
  uk: 'An island fortress. Safe behind the Channel, but every offensive starts with a slow sea crossing.',
  fr: 'The continental hinge. Many provinces and many neighbours: Germany, Italy, Spain and Britain.',
  de: 'Central and exposed. Borders six neutral states and two great powers.',
  it: 'Alpine walls to the north, a long peninsula behind. Mountains favour the defender.',
  es: 'A Pyrenean bastion with France as the only great-power neighbour. Portugal is within reach.',
  pl: 'Open plains between Germany and the edge of the theatre. Czechia lies to the south.',
};

/** Each nation's strategic character, shown on its card. */
const TRAIT: Record<string, string> = {
  uk: 'Defensive',
  fr: 'Many fronts',
  de: 'Encircled',
  it: 'Mountain wall',
  es: 'Secure flank',
  pl: 'Open plains',
};

/** Starting map of the theatre, used as the menu backdrop; the chosen nation is lit up. */
const MenuBackdrop = memo(function MenuBackdrop({ world, geo, selected }: { world: World; geo: MapGeometry; selected: NationId }) {
  const [texture, setTexture] = useState<TerrainTexture | null>(null);
  const [glow, setGlow] = useState<TerrainTexture | null>(null);
  useEffect(() => {
    let live = true;
    terrainTexture(geo, world).then((t) => live && setTexture(t));
    seaGlowTexture(geo).then((t) => live && setGlow(t));
    return () => {
      live = false;
    };
  }, [geo, world]);
  const startOwner = (pid: ProvinceId) => world.provinces[pid].core ?? 'neutral';
  const outline = useMemo(() => geo.ownerOutline(selected, startOwner), [geo, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const [[x0, y0], [x1, y1]] = geo.theatreBounds;
  const pad = 30;
  const color = world.nations[selected].color;
  return (
    <svg className="menu-map" viewBox={`${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="menu-ocean" gradientUnits="userSpaceOnUse" cx={(x0 + x1) / 2} cy={(y0 + y1) / 2} r={x1 - x0}>
          <stop offset="0" stopColor="#24506e" />
          <stop offset="1" stopColor="#0a1a29" />
        </radialGradient>
        <clipPath id="menu-sel">
          {world.provinceIds
            .filter((pid) => startOwner(pid) === selected)
            .map((pid) => (
              <path key={pid} d={geo.provincePaths[pid]} />
            ))}
        </clipPath>
      </defs>
      <rect x={x0 - 2000} y={y0 - 2000} width={x1 - x0 + 4000} height={y1 - y0 + 4000} fill="url(#menu-ocean)" />
      <path d={geo.graticule} className="graticule" />
      {glow && <image href={glow.href} x={glow.x} y={glow.y} width={glow.width} height={glow.height} preserveAspectRatio="none" className="terrain-img" />}
      {geo.countries.map((c) => (
        <path key={c.iso + c.name} d={c.d} className="menu-country" />
      ))}
      {world.provinceIds.map((pid) => (
        <path key={pid} d={geo.provincePaths[pid]} fill={TERRAIN_BASE[world.provinces[pid].terrain]} />
      ))}
      {texture && (
        <image href={texture.href} x={texture.x} y={texture.y} width={texture.width} height={texture.height} preserveAspectRatio="none" className="terrain-img" />
      )}
      {world.provinceIds.map((pid) => {
        const owner = startOwner(pid);
        const mine = owner === selected;
        return (
          <path
            key={pid}
            d={geo.provincePaths[pid]}
            fill={ownerColor(world, owner)}
            fillOpacity={mine ? 0.7 : owner === 'neutral' ? 0.18 : 0.26}
            className={`menu-prov${mine ? ' mine' : ''}`}
          />
        );
      })}
      <path d={geo.provinceBorders} className="province-border" />
      <g clipPath="url(#menu-sel)">
        <path d={outline} className="nation-band wide" stroke={color} />
        <path d={outline} className="nation-band" stroke={lighten(color, 0.4)} />
      </g>
      <path d={geo.coastline} className="coastline" />
      <path d={geo.nationBorders(startOwner)} className="nation-border-casing" />
      <path d={geo.nationBorders(startOwner)} className="nation-border" />
      {/* The chosen nation's land glows, as your own does in the campaign. */}
      <path d={outline} className="home-glow wide" />
      <path d={outline} className="home-glow" />
      <path d={outline} className="home-line" />
    </svg>
  );
});

export function MainMenu({
  world,
  onStart,
  onLoad,
}: {
  world: World;
  onStart: (nation: NationId, seed: number, speed: GameSettings['speed']) => void;
  onLoad: (state: GameState) => void;
}) {
  const geo = useMemo(() => mapGeometry(world), [world]);
  const [nation, setNation] = useState<NationId>('fr');
  const [speed, setSpeed] = useState<GameSettings['speed']>('standard');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [loading, setLoading] = useState(false);
  const def = world.nations[nation];
  const core = world.provinceIds.filter((pid) => world.provinces[pid].core === nation);
  const coreVp = core.reduce((s, pid) => s + (world.provinces[pid].objectiveVp ?? 0), 0);

  return (
    <div className="menu-screen" style={{ '--nation': def.color } as React.CSSProperties}>
      <MenuBackdrop world={world} geo={geo} selected={nation} />
      <div className="menu-shade" />

      <div className="menu-column">
        <header className="brand">
          <div className="brand-mark" aria-hidden>
            <Icon name="star" size={26} />
          </div>
          <div>
            <h1>
              World <span>Conflict</span>
            </h1>
            <div className="brand-sub">1914 — 1945 · Real-time grand strategy</div>
          </div>
        </header>

        <h2 className="menu-h2">Choose your nation</h2>
        <div className="nation-grid">
          {world.scenario.nations.map((n) => (
            <button
              key={n.id}
              className={`nation-card${nation === n.id ? ' selected' : ''}`}
              style={{ '--nation': n.color } as React.CSSProperties}
              onClick={() => setNation(n.id)}
              data-nation-card={n.id}
            >
              <Flag id={n.id} size={22} />
              <span className="nc-text">
                <strong>{n.name}</strong>
                <span className="nc-tag">{TRAIT[n.id]}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="menu-brief">
          <div className="mb-head">
            <Flag id={nation} size={34} />
            <div>
              <div className="mb-name">{def.name}</div>
              <div className="mb-cap">
                <Icon name="star" size={12} /> Capital: {world.provinces[def.capital].city.name}
              </div>
            </div>
          </div>
          <p>{BLURB[nation]}</p>
          <p className="speciality" title="National speciality">
            <Icon name="bolt" size={13} /> <em>{def.speciality.name}</em> — {def.speciality.description}
          </p>
          <div className="mb-stats">
            <span>
              <b>{core.length}</b> provinces
            </span>
            <span>
              <b>{coreVp}</b> objective VP
            </span>
            <span>
              <b>{world.neighbors[def.capital].length}</b> routes from the capital
            </span>
          </div>
        </div>

        <div className="menu-options">
          <label>
            Campaign speed
            <select value={speed} onChange={(e) => setSpeed(e.target.value as GameSettings['speed'])}>
              {Object.entries(SPEED_PRESETS).map(([id, p]) => (
                <option key={id} value={id} disabled={!p.available}>
                  {p.label}
                  {p.available ? '' : ' — needs the future server version'}
                </option>
              ))}
            </select>
          </label>
          <label title="Sets the computer opponents' personalities and the luck of battle. The same seed and orders replay the same campaign.">
            Campaign seed
            <span className="seed-field">
              <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
              <button type="button" className="icon-btn" onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))} title="New random seed" aria-label="New random seed">
                <Icon name="dice" size={16} />
              </button>
            </span>
          </label>
        </div>
        <p className="menu-victory">
          <Icon name="target" size={14} /> Win by holding {vpToWin(world)} of {world.totalVp} objective VP for {proseDuration(VICTORY.holdSeconds)}, or lead on score when
          the {hoursText(SPEED_PRESETS[speed].timeLimitMinutes)} limit ends. Five computer opponents control the other powers.
        </p>
        <div className="btn-row menu-actions">
          <button className="primary big" onClick={() => onStart(nation, seed, speed)} data-testid="start-campaign">
            <Icon name="play" size={16} /> Start campaign
          </button>
          <button className="big" onClick={() => setLoading(true)} data-testid="menu-load">
            <Icon name="load" size={16} /> Load game
          </button>
        </div>

        <footer className="credits">
          Map data: <a href="https://www.naturalearthdata.com/">Natural Earth</a> (public domain), simplified and grouped into game provinces. The
          European theatre is playable; the rest of the world is shown for context only. Naval, air, espionage and deeper diplomacy are planned
          for later milestones.
        </footer>
      </div>

      <div className="menu-nation-label" aria-hidden>
        {def.name}
      </div>
      {loading && <LoadDialog world={world} scenarioId={world.scenario.id} onLoad={onLoad} onClose={() => setLoading(false)} />}
    </div>
  );
}
