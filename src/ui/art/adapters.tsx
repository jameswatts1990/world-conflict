// Bridges simulation ids to the artwork components, so panels and the map
// never import the art modules directly.
import { UNITS } from '../../sim/config/units';
import type { BuildingType, CityTier, NationId, OwnerId, TechBranch, Terrain, UnitGen, UnitType } from '../../sim';
import { UnitGlyph } from '../icons';
import { BranchIcon as BranchArt } from './BranchIcons';
import { BuildingGlyph, BuildingTile } from './BuildingIcons';
import { CitySkyline } from './CitySkyline';

function natoFor(type: UnitType): UnitType {
  const cls = UNITS[type].class;
  return cls === 'armour' ? 'tank' : cls === 'support' ? 'artillery' : 'infantry';
}

/** Small unit picture for tree nodes. */
export function TechUnitIcon({ type, title }: { type: UnitType; gen: UnitGen; nation: NationId; title?: string }) {
  return (
    <span title={title}>
      <UnitGlyph type={natoFor(type)} size={24} />
    </span>
  );
}

/** Large side-view illustration for unit cards. */
export function UnitPicture({ type, width = 96 }: { type: UnitType; gen: UnitGen; nation: OwnerId; width?: number }) {
  return (
    <span className="unit-picture placeholder" style={{ width, height: (width * 60) / 96 }}>
      <UnitGlyph type={natoFor(type)} size={width / 3} />
    </span>
  );
}

/** Compact silhouette for army counters and unit rows. */
export function UnitIconArt({ type, width = 32 }: { type: UnitType; gen: UnitGen; nation: OwnerId; width?: number }) {
  return <UnitGlyph type={natoFor(type)} size={width * 0.7} />;
}

/** Map-counter silhouette drawn inside an SVG (returns SVG content, not HTML). */
export function CounterArt({ type, x, y, width }: { type: UnitType; gen: UnitGen; nation: OwnerId; x: number; y: number; width: number }) {
  const h = width * 0.6;
  const main = natoFor(type);
  return (
    <g transform={`translate(${x},${y})`}>
      <rect width={width} height={h} fill="#fff" opacity={0.92} />
      {main === 'infantry' && <path d={`M0 0 L${width} ${h} M${width} 0 L0 ${h}`} stroke="#222" strokeWidth={1.2} />}
      {main === 'artillery' && <circle cx={width / 2} cy={h / 2} r={h / 4.5} fill="#222" />}
      {main === 'tank' && <rect x={width * 0.2} y={h * 0.27} width={width * 0.6} height={h * 0.46} rx={h * 0.23} fill="none" stroke="#222" strokeWidth={1.2} />}
    </g>
  );
}

export function BranchIcon({ branch, size = 18 }: { branch: TechBranch; size?: number }) {
  return <BranchArt branch={branch} size={size} />;
}

export function BuildingTileArt({ kind, level, maxLevel, size = 44 }: { kind: BuildingType; level: number; maxLevel: number; size?: number }) {
  return <BuildingTile kind={kind} level={level} maxLevel={maxLevel} size={size} />;
}

export function BuildingGlyphArt({ kind, size = 16, title }: { kind: BuildingType; size?: number; title?: string }) {
  return <BuildingGlyph kind={kind} size={size} title={title} />;
}

export interface CitySceneProps {
  seed: string;
  tier: CityTier;
  capital: boolean;
  buildings: Partial<Record<BuildingType, number>>;
  construction: BuildingType | null;
  terrain: Terrain;
  coastal: boolean;
  nationColor?: string;
  battle: boolean;
  width?: number;
}

export function CityScene(props: CitySceneProps) {
  return <CitySkyline {...props} width={props.width ?? 340} />;
}

export function NationEmblem({ color, size = 16 }: { nation: OwnerId; color: string; size?: number }) {
  return <span className="swatch" style={{ background: color, width: size, height: size }} />;
}
