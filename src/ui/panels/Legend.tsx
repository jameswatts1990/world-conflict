// Map key popover: explains the symbols used on the strategy map.
import type { NationId, World } from '../../sim';
import { Flag } from '../flags';
import { Icon, UnitShape } from '../icons';
import type { MapMode } from '../map/MapView';

const STAR = 'M0,-6 L1.8,-1.9 L6,-1.9 L2.6,0.8 L3.8,5 L0,2.5 L-3.8,5 L-2.6,0.8 L-6,-1.9 L-1.8,-1.9 Z';

function Sample({ children, w = 34 }: { children: React.ReactNode; w?: number }) {
  return (
    <svg className="lg-sample" width={w} height={20} viewBox={`${-w / 2} -10 ${w} 20`} aria-hidden>
      {children}
    </svg>
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
        <span className="lg-swatch outside" /> Outside the prototype theatre
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
        <Sample w={46}>
          <g transform="scale(0.9)">
            <rect x={-21} y={-10} width={42} height={18} rx={4} fill="#3f6fc4" stroke="#fff" strokeWidth={1.2} />
            <rect x={-19} y={-8} width={21} height={14} rx={2.5} fill="rgba(0,0,0,0.28)" />
            <g transform="translate(-18.1,-6.6) scale(0.8)">
              <UnitShape type="tank" />
            </g>
            <text x={11.6} y={4} className="army-count">
              4
            </text>
          </g>
        </Sample>
        Army: main unit type and unit count
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
