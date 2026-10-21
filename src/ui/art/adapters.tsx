// Bridges simulation ids to the artwork components, so panels and the map
// never import the art modules directly.
import { memo } from 'react';
import type { BuildingType, CityTier, NationId, OwnerId, TechBranch, Terrain, UnitGen, UnitType } from '../../sim';
import { BranchIcon as BranchArt } from './BranchIcons';
import { BuildingGlyph, BuildingTile } from './BuildingIcons';
import { CitySkyline } from './CitySkyline';
import { NationInsignia } from './Insignia';
import { ART_NATIONS, UnitArt, type ArtNation } from './UnitArt';

function artNation(owner: OwnerId): ArtNation {
  return (ART_NATIONS as readonly string[]).includes(owner) ? (owner as ArtNation) : 'neutral';
}

/** Small unit picture for tree nodes. */
export function TechUnitIcon({ type, gen, nation, title }: { type: UnitType; gen: UnitGen; nation: NationId; title?: string }) {
  return <UnitArt type={type} gen={gen} nation={artNation(nation)} variant="icon" width={34} title={title} />;
}

/** Large side-view illustration for unit cards. */
export function UnitPicture({ type, gen, nation, width = 96 }: { type: UnitType; gen: UnitGen; nation: OwnerId; width?: number }) {
  return (
    <span className="unit-picture">
      <UnitArt type={type} gen={gen} nation={artNation(nation)} width={width} />
    </span>
  );
}

/** Compact silhouette for unit rows. */
export const UnitIconArt = memo(function UnitIconArt({ type, gen, nation, width = 32 }: { type: UnitType; gen: UnitGen; nation: OwnerId; width?: number }) {
  return <UnitArt type={type} gen={gen} nation={artNation(nation)} variant="icon" width={width} />;
});

/**
 * Map-counter silhouette drawn inside the map's SVG. Memoised: counters move
 * every frame, but their drawing only changes with type, generation or owner.
 */
export const CounterArt = memo(function CounterArt({ type, gen, nation, x, y, width }: { type: UnitType; gen: UnitGen; nation: OwnerId; x: number; y: number; width: number }) {
  const h = width * 0.6;
  return (
    <g transform={`translate(${x},${y})`}>
      <rect width={width} height={h} rx={1.5} className="counter-art-bg" />
      <UnitArt type={type} gen={gen} nation={artNation(nation)} variant="icon" width={width} />
    </g>
  );
});

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

export function NationEmblem({ nation, size = 16 }: { nation: OwnerId; size?: number }) {
  return <NationInsignia nation={artNation(nation)} size={size} />;
}
