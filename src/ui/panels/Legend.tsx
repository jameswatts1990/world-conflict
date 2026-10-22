// Map key popover: explains the symbols used on the strategy map.
import { CITY } from '../../sim/config/buildings';
import type { BuildingCategory, NationId, OwnerId, UnitType, World } from '../../sim';
import { CounterArt, citySprite, plinthColor } from '../art/adapters';
import { Flag } from '../flags';
import { Icon } from '../icons';
import { TIER_COLORS, moraleRamp, type MapMode } from '../map/MapView';

const STAR = 'M0,-6 L1.8,-1.9 L6,-1.9 L2.6,0.8 L3.8,5 L0,2.5 L-3.8,5 L-2.6,0.8 L-6,-1.9 L-1.8,-1.9 Z';

function Sample({ children, w = 34, h = 20 }: { children: React.ReactNode; w?: number; h?: number }) {
  return (
    <svg className="lg-sample" width={w} height={h} viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`} aria-hidden>
      {children}
    </svg>
  );
}

/** A small town as the zoomed-in map draws it. */
function CitySample({ color }: { color: string }) {
  const sp = citySprite({
    seed: 'fr-nord',
    tier: 1,
    capital: false,
    buildings: { industry: 1, barracks: 1 },
    construction: null,
    freeSlots: 1,
    terrain: 'plains',
    coastal: false,
    nationColor: color,
    battle: false,
  });
  const k = 44 / sp.width;
  return <image href={sp.href} x={-sp.cx * k} y={-sp.cy * k + 2} width={sp.width * k} height={sp.height * k} />;
}

const CATEGORIES: BuildingCategory[] = ['economy', 'military', 'civic', 'infrastructure'];

/** A miniature army counter, as drawn on the map. */
function ArmySample({ world, color, rim, owner, type, count }: { world: World; color: string; rim: string; owner: OwnerId; type: UnitType; count: number }) {
  return (
    <g transform="scale(0.8)">
      <rect x={-21} y={-11} width={42} height={20} rx={4} fill={color} stroke={rim} strokeWidth={1.4} />
      <CounterArt world={world} type={type} gen="ww1" nation={owner} x={-19.5} y={-8.6} width={23} />
      <text x={12.2} y={4.7} className="army-count">
        {count}
      </text>
    </g>
  );
}

export function Legend({ world, human, mode, onClose }: { world: World; human: NationId; mode: MapMode; onClose: () => void }) {
  return (
    <div className="legend-pop" role="dialog" aria-label="Map key">
      <header>
        <Icon name="legend" size={15} />
        <span>Map key</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close map key">
          <Icon name="close" size={14} />
        </button>
      </header>
      {mode === 'supply' ? (
        <div className="lg-grid">
          <span className="lg-swatch" style={{ background: '#3fae5a' }} /> Your province, connected to a supply hub
          <span className="lg-swatch" style={{ background: '#e0473a' }} /> Your province, cut off from supply
        </div>
      ) : mode === 'morale' ? (
        <div className="lg-ramp">
          <span>Morale 20</span>
          <span className="ramp" style={{ background: `linear-gradient(90deg, ${moraleRamp(20)}, ${moraleRamp(52)}, ${moraleRamp(85)})` }} />
          <span>85+</span>
        </div>
      ) : mode === 'development' ? (
        <div className="lg-tiers">
          {[1, 2, 3, 4, 5].map((t) => (
            <span key={t}>
              <span className="lg-swatch" style={{ background: TIER_COLORS[t] }} /> {CITY.tierNames[t]}
            </span>
          ))}
        </div>
      ) : (
        <div className="lg-nations">
          {world.scenario.nations.map((n) => (
            <span key={n.id} className={n.id === human ? 'me' : ''}>
              <Flag id={n.id} size={11} /> {n.name}
            </span>
          ))}
        </div>
      )}
      <div className="lg-grid">
        <span className="lg-swatch neutral" /> Neutral state (may be invaded)
        <span className="lg-swatch outside" /> Outside this campaign's theatre
        <Sample>
          <g className="city-icon capital">
            <circle r={6.6} />
            <path d={STAR} transform="scale(0.72)" />
          </g>
        </Sample>
        Capital city
        <Sample>
          <g className="vp-badge-map">
            <circle r={6} />
            <text y={3.2}>2</text>
          </g>
        </Sample>
        Objective worth victory points
        <Sample w={46} h={30}>
          <CitySample color={world.nations[human].color} />
        </Sample>
        Zoomed in, each city is a model of everything built there; its rim shows the owner
        <Sample w={46}>
          {CATEGORIES.map((c, i) => (
            <rect key={c} x={-21 + i * 11} y={-5} width={9} height={9} rx={1.5} fill={plinthColor(c)} stroke="rgba(0,0,0,0.5)" />
          ))}
        </Sample>
        Building plinths: economy, military, civic, infrastructure
        <Sample>
          <path d="M-13,0 L0,-6.5 L13,0 L0,6.5 Z" className="lg-plot" />
        </Sample>
        Empty plot: a free building slot (a crane means building work)
        <Sample w={46}>
          <ArmySample world={world} color={world.nations[human].color} rim="#fff" owner={human} type="tank" count={4} />
        </Sample>
        Your army: main unit and number of formations
        <Sample w={46}>
          <ArmySample world={world} color={world.scenario.nations.find((n) => n.id !== human)!.color} rim="#ff5a45" owner={world.scenario.nations.find((n) => n.id !== human)!.id} type="infantry" count={6} />
        </Sample>
        Army of a nation at war with you
        <Sample w={46}>
          <rect x={-18} y={-5} width={36} height={4} rx={1.5} fill="#66cc6c" />
          <rect x={-18} y={0} width={26} height={3.6} rx={1.5} className="army-morale mid" />
        </Sample>
        Strength (top) and morale (bottom)
        <Sample>
          <path d="M-3,8 L-3,-8 L7,-5 L-3,-2" className="routed-flag" />
        </Sample>
        Routed army falling back
        <Sample>
          <g className="army-badge warn">
            <circle r={6} />
            <text y={3.2}>!</text>
          </g>
        </Sample>
        Army out of supply
        <Sample>
          <g className="battle-fx static">
            <path d="M0,-9L2,-3L8,-5L4,0L8,5L2,3L0,9L-2,3L-8,5L-4,0L-8,-5L-2,-3Z" className="battle-burst" />
          </g>
        </Sample>
        Battle in progress
        <Sample>
          <line x1={-15} y1={0} x2={15} y2={0} className="lg-line pass" />
        </Sample>
        Mountain pass
        <Sample>
          <line x1={-15} y1={0} x2={15} y2={0} className="lg-line strait" />
        </Sample>
        Sea crossing
        <Sample>
          <line x1={-15} y1={0} x2={11} y2={0} className="lg-line route" />
          <path d="M8,-4 L15,0 L8,4 Z" fill="#fff" />
        </Sample>
        March route
      </div>
    </div>
  );
}
