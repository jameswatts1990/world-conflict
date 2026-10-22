// Bridges simulation ids to the artwork components, so panels and the map
// never import the art modules directly.
import { memo } from 'react';
import type { BuildingCategory, BuildingType, CityTier, NationId, OwnerId, TechBranch, Terrain, UnitGen, UnitType, World } from '../../sim';
import { BranchIcon as BranchArt } from './BranchIcons';
import { BuildingGlyph, BuildingTile } from './BuildingIcons';
import { PLINTH_COLORS, buildCityModel } from './CityModel';
import { CitySkyline } from './CitySkyline';
import { NATIONAL_STYLES, UnitArt, type ArtNation } from './UnitArt';

/**
 * How an owner's units are drawn: in its own look if it has one, otherwise in
 * its bloc's, with the insignia in the nation's own colour.
 */
function artOf(world: World, owner: OwnerId): { nation: ArtNation; accent?: string } {
  if ((NATIONAL_STYLES as readonly string[]).includes(owner)) return { nation: owner as ArtNation };
  const def = world.nations[owner];
  return def ? { nation: def.bloc, accent: def.color } : { nation: 'neutral' };
}

/** Small unit picture for tree nodes. */
export function TechUnitIcon({ world, type, gen, nation, title }: { world: World; type: UnitType; gen: UnitGen; nation: NationId; title?: string }) {
  return <UnitArt type={type} gen={gen} {...artOf(world, nation)} variant="icon" width={34} title={title} />;
}

/** Large side-view illustration for unit cards. */
export function UnitPicture({ world, type, gen, nation, width = 96 }: { world: World; type: UnitType; gen: UnitGen; nation: OwnerId; width?: number }) {
  return (
    <span className="unit-picture">
      <UnitArt type={type} gen={gen} {...artOf(world, nation)} width={width} />
    </span>
  );
}

/** Compact silhouette for unit rows. */
export const UnitIconArt = memo(function UnitIconArt({ world, type, gen, nation, width = 32 }: { world: World; type: UnitType; gen: UnitGen; nation: OwnerId; width?: number }) {
  return <UnitArt type={type} gen={gen} {...artOf(world, nation)} variant="icon" width={width} />;
});

/**
 * Map-counter silhouette drawn inside the map's SVG. Memoised: counters move
 * every frame, but their drawing only changes with type, generation or owner.
 */
export const CounterArt = memo(function CounterArt({ world, type, gen, nation, x, y, width }: { world: World; type: UnitType; gen: UnitGen; nation: OwnerId; x: number; y: number; width: number }) {
  const h = width * 0.6;
  return (
    <g transform={`translate(${x},${y})`}>
      <rect width={width} height={h} rx={1.5} className="counter-art-bg" />
      <UnitArt type={type} gen={gen} {...artOf(world, nation)} variant="icon" width={width} />
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

/** Colour of the plinth a building stands on in the city models, by category. */
export function plinthColor(category: BuildingCategory): string {
  return PLINTH_COLORS[category];
}

export interface CitySprite {
  /** Image URL of the city's 3D model. */
  href: string;
  /** Size in model units, and the city's centre within the image. */
  width: number;
  height: number;
  cx: number;
  cy: number;
  /** Half-width of the token's ground ellipse, in model units. */
  rx: number;
}

const sprites = new Map<string, CitySprite>();
/** Enough for every city in a few states each; older looks are dropped first. */
const SPRITE_CACHE = 240;

/**
 * The city's 3D model as an image for the map, built once per look: the map
 * draws one image per city instead of hundreds of shapes, so panning stays cheap.
 */
export function citySprite(props: Omit<CitySceneProps, 'width'> & { freeSlots: number }): CitySprite {
  const built = Object.entries(props.buildings)
    .filter(([, lv]) => (lv ?? 0) > 0)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const key = JSON.stringify([props.seed, props.tier, props.capital, built, props.construction, props.freeSlots, props.terrain, props.coastal, props.nationColor, props.battle]);
  const hit = sprites.get(key);
  if (hit) {
    sprites.delete(key);
    sprites.set(key, hit);
    return hit;
  }
  const model = buildCityModel({ ...props, freeSlots: Math.max(0, props.freeSlots) });
  const href =
    typeof Blob !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(new Blob([model.svg], { type: 'image/svg+xml' }))
      : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(model.svg)}`;
  const sprite = { href, width: model.width, height: model.height, cx: model.cx, cy: model.cy, rx: model.rx };
  sprites.set(key, sprite);
  if (sprites.size > SPRITE_CACHE) {
    const [oldKey, old] = sprites.entries().next().value!;
    sprites.delete(oldKey);
    if (old.href.startsWith('blob:')) URL.revokeObjectURL(old.href);
  }
  return sprite;
}
