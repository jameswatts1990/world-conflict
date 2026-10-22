// Bridges simulation ids to the artwork components, so panels and the map
// never import the art modules directly.
import { memo } from 'react';
import type { BuildingCategory, BuildingType, CityTier, NationId, OwnerId, TechBranch, Terrain, UnitGen, UnitType } from '../../sim';
import { BranchIcon as BranchArt } from './BranchIcons';
import { BuildingGlyph, BuildingTile } from './BuildingIcons';
import { PLINTH_COLORS, buildCityModel, buildPortModel, type ModelLayer, type PortModelProps } from './CityModel';
import { CitySkyline } from './CitySkyline';
import { ART_NATIONS, UnitArt, type ArtNation } from './UnitArt';
import { buildUnitModel, type UnitModelKind } from './UnitModel';

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

/** Colour of the plinth a building stands on in the city models, by category. */
export function plinthColor(category: BuildingCategory): string {
  return PLINTH_COLORS[category];
}

/** One drawing of a city's model as an image for the map. */
export interface SpriteImage {
  href: string;
  /** Size in model units, and where the city's anchor (a port's spot on the coast) sits in it. */
  width: number;
  height: number;
  cx: number;
  cy: number;
}

export interface CitySprite {
  /** The streets, flat on the map: drawn under everything else and clipped to the land. */
  ground: SpriteImage;
  /** Everything standing on them. */
  structures: SpriteImage;
  /** The built-up area from the anchor, in model units: its middle across the screen, half its width, and how far it reaches up and down. */
  mid: number;
  rx: number;
  back: number;
  front: number;
}

/** What a city's model shows (the map's input to `citySprite`). */
export interface CitySpriteProps {
  seed: string;
  tier: CityTier;
  capital: boolean;
  buildings: Partial<Record<BuildingType, number>>;
  construction: BuildingType | null;
  freeSlots: number;
  terrain: Terrain;
  /** Directions of the roads out of town and how far the land reaches (see CityModelProps). */
  exits?: number[];
  reach?: number[];
  nationColor?: string;
  battle: boolean;
}

/** An SVG document as an image URL: a blob in the browser, a data URL elsewhere (tests, scripts). */
function svgHref(svg: string): string {
  return typeof Blob !== 'undefined' && typeof URL.createObjectURL === 'function'
    ? URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function imageOf(layer: ModelLayer): SpriteImage {
  return { href: svgHref(layer.svg), width: layer.width, height: layer.height, cx: layer.cx, cy: layer.cy };
}

/** Lets an image's blob go. */
function release(image: { href: string }): void {
  if (image.href.startsWith('blob:')) URL.revokeObjectURL(image.href);
}

/** Least-recently-used cache of sprites by look; dropped sprites release their blobs. */
function cached<T>(cache: Map<string, T>, limit: number, key: string, make: () => T, drop: (old: T) => void): T {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const sprite = make();
  cache.set(key, sprite);
  if (cache.size > limit) {
    const [oldKey, old] = cache.entries().next().value!;
    cache.delete(oldKey);
    drop(old);
  }
  return sprite;
}

const sprites = new Map<string, CitySprite>();
const ports = new Map<string, SpriteImage>();
/** Enough for every city in a few states each; older looks are dropped first. */
const SPRITE_CACHE = 240;

/**
 * The city's 3D model as images for the map, built once per look: the map draws
 * two images per city instead of hundreds of shapes, so panning stays cheap.
 */
export function citySprite(props: CitySpriteProps): CitySprite {
  const built = Object.entries(props.buildings)
    .filter(([, lv]) => (lv ?? 0) > 0)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const key = JSON.stringify([props.seed, props.tier, props.capital, built, props.construction, props.freeSlots, props.terrain, props.exits, props.reach, props.nationColor, props.battle]);
  return cached(
    sprites,
    SPRITE_CACHE,
    key,
    () => {
      const model = buildCityModel({ ...props, freeSlots: Math.max(0, props.freeSlots) });
      return { ground: imageOf(model.ground), structures: imageOf(model.structures), mid: model.mid, rx: model.rx, back: model.back, front: model.front };
    },
    (old) => {
      release(old.ground);
      release(old.structures);
    },
  );
}

export type PortSpriteProps = PortModelProps;

/** A coastal city's port as an image for the map, anchored on its spot on the coast. */
export function portSprite(props: PortSpriteProps): SpriteImage {
  const key = JSON.stringify([props.seed, props.facing, props.batteries, props.building, props.nationColor]);
  return cached(ports, SPRITE_CACHE, key, () => imageOf(buildPortModel(props)), release);
}

export interface UnitSprite {
  /** Image URL of the army's 3D model. */
  href: string;
  /** Size in model units, and where the model stands within the image. */
  width: number;
  height: number;
  cx: number;
  cy: number;
}

const unitSprites = new Map<string, UnitSprite>();
/** Every army's look in a handful of headings. */
const UNIT_SPRITE_CACHE = 480;

/** An army's 3D model (its main unit type, or the troopship at sea) facing one of 16 headings. */
export function unitSprite(type: UnitType | 'transport', gen: UnitGen, nation: OwnerId, heading: number): UnitSprite {
  const art = artNation(nation);
  return cached(
    unitSprites,
    UNIT_SPRITE_CACHE,
    `${type}|${gen}|${art}|${heading}`,
    () => {
      const model = buildUnitModel({ type: type as UnitModelKind, gen, nation: art, heading });
      return { href: svgHref(model.svg), width: model.width, height: model.height, cx: model.cx, cy: model.cy };
    },
    release,
  );
}
