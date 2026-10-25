// Bridges simulation ids to the artwork components, so panels and the map
// never import the art modules directly.
import { memo } from 'react';
import type { BuildingCategory, BuildingType, CityTier, NationId, OwnerId, TechBranch, Terrain, UnitGen, UnitType, World } from '../../sim';
import { BranchIcon as BranchArt } from './BranchIcons';
import { BuildingGlyph, BuildingTile } from './BuildingIcons';
import { PLINTH_COLORS, buildCityModel, buildPortModel, type ModelLayer, type PortModelProps } from './CityModel';
import { flagStripes } from '../flags';
import { CitySkyline } from './CitySkyline';
import { NATIONAL_STYLES, UnitArt, type ArtNation } from './UnitArt';
import { buildUnitModel, type UnitModelKind } from './UnitModel';
import { bakedUnitSprite } from './UnitAssets';

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

/** Large illustration for unit cards. */
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

/** Lets an image's blob go, and its bitmaps. */
function release(image: { href: string }): void {
  if (image.href.startsWith('blob:')) URL.revokeObjectURL(image.href);
  for (const url of bitmaps.get(image.href)?.values() ?? []) URL.revokeObjectURL(url);
  bitmaps.delete(image.href);
  wanted.delete(image.href);
}

// ---------------------------------------------------------------------------
// Bitmaps of the sprites
// ---------------------------------------------------------------------------

/**
 * The browser draws an SVG image by replaying every shape in it each time it paints the stretch of map it lies
 * on (a city's model has hundreds), and lays it out again whenever its size changes, as it does on every zoom.
 * So the map draws its sprites as bitmaps, baked from the SVG in idle moments at a power of two of device
 * pixels per model unit: the smallest at or above what the zoom needs, so a bitmap is never stretched (but
 * for the largest sprites at the closest zooms; see `spriteHref`).
 */
const bitmaps = new Map<string, Map<number, string>>();
/** The level each sprite was last asked for at: a bake queued for another one is skipped. */
const wanted = new Map<string, number>();
const bakeQueue: { href: string; width: number; height: number; level: number }[] = [];
const queued = new Set<string>();
const bakeListeners = new Set<() => void>();
/** Largest bitmap side (pixels): past it the sprite stays an SVG image. */
const MAX_BITMAP = 2048;
let baking = false;
let announce = 0;

/** Hears when new bitmaps are ready (at most a few times a second). */
export function onBitmapsBaked(listener: () => void): () => void {
  bakeListeners.add(listener);
  return () => bakeListeners.delete(listener);
}

/**
 * What to draw a sprite with at `pxPerUnit` device pixels per model unit: a bitmap sharp enough if one is
 * baked, otherwise its SVG. With `want`, a missing bitmap is queued for baking.
 */
export function spriteHref(image: { href: string; width: number; height: number }, pxPerUnit: number, want: boolean): string {
  // Imported model images are already bitmaps. Re-baking them wastes idle time
  // and memory, and cannot add detail at a higher zoom.
  if (/\.(png|webp)(?:$|[?#])/.test(image.href) || /^data:image\/(png|webp);/.test(image.href)) return image.href;
  const sharp = 2 ** Math.max(0, Math.ceil(Math.log2(pxPerUnit)));
  // A sprite too big for a sharp bitmap at this zoom (a big city's streets, close up) takes the largest that fits,
  // stretched less than twice (it is flat ground): an SVG would be replayed shape by shape on every raster.
  const fits = 2 ** Math.floor(Math.log2(MAX_BITMAP / Math.max(image.width, image.height)));
  const level = sharp > fits && pxPerUnit < fits * 2 ? fits : sharp;
  const have = bitmaps.get(image.href);
  for (let l = level; l <= level * 4; l *= 2) {
    const url = have?.get(l);
    if (url) return url;
  }
  const key = `${image.href}@${level}`;
  if (want) wanted.set(image.href, level);
  if (want && !queued.has(key) && Math.max(image.width, image.height) * level <= MAX_BITMAP && typeof document !== 'undefined') {
    queued.add(key);
    bakeQueue.push({ href: image.href, width: image.width, height: image.height, level });
    if (!baking) scheduleBake();
  }
  return image.href;
}

/** One bake per idle moment long enough for it, so a drag or a zoom under way keeps its frames. */
function scheduleBake(): void {
  baking = true;
  if (typeof requestIdleCallback !== 'function') setTimeout(() => void bakeNext(), 30);
  else requestIdleCallback((idle) => (idle.timeRemaining() >= 8 || idle.didTimeout ? void bakeNext() : scheduleBake()), { timeout: 1000 });
}

async function bakeNext(): Promise<void> {
  let job = bakeQueue.shift();
  // Wanted at another zoom since (the map was zoomed on): not worth baking.
  while (job && wanted.get(job.href) !== job.level) {
    queued.delete(`${job.href}@${job.level}`);
    job = bakeQueue.shift();
  }
  if (!job) {
    baking = false;
    return;
  }
  try {
    const url = await bake(job.href, Math.ceil(job.width * job.level), Math.ceil(job.height * job.level));
    // The sprite may have been dropped from its cache meanwhile.
    if (url && isLive(job.href)) {
      const levels = bitmaps.get(job.href) ?? new Map<number, string>();
      levels.set(job.level, url);
      bitmaps.set(job.href, levels);
      if (!announce) announce = window.setTimeout(tell, 120);
    } else if (url) URL.revokeObjectURL(url);
  } catch {
    // An SVG that will not draw stays an SVG image.
  }
  queued.delete(`${job.href}@${job.level}`);
  if (bakeQueue.length) scheduleBake();
  else {
    baking = false;
    tell();
  }
}

function tell(): void {
  window.clearTimeout(announce);
  announce = 0;
  for (const l of bakeListeners) l();
}

async function bake(href: string, width: number, height: number): Promise<string | null> {
  const img = new Image();
  img.src = href;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob && URL.createObjectURL(blob);
}

/** Whether a sprite's SVG is still in one of the caches. */
function isLive(href: string): boolean {
  for (const s of sprites.values()) if (s.ground.href === href || s.structures.href === href) return true;
  for (const p of ports.values()) if (p.href === href) return true;
  for (const u of unitSprites.values()) if (u.href === href) return true;
  return false;
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

/**
 * An army's 3D model (its main unit type, or the troopship at sea) facing one of 16 headings.
 * A nation drawn in its bloc's look flies its own flag (or one in its colour) and is cached as itself.
 * Imported units share baked sprites; their national flag is on the map's army badge.
 */
export function unitSprite(world: World, type: UnitType | 'transport', gen: UnitGen, nation: OwnerId, heading: number): UnitSprite {
  const baked = bakedUnitSprite(type, gen, heading);
  if (baked) return baked;
  const art = artOf(world, nation);
  const look = art.accent ? nation : art.nation;
  return cached(
    unitSprites,
    UNIT_SPRITE_CACHE,
    `${type}|${gen}|${look}|${heading}`,
    () => {
      const flag = art.accent ? (flagStripes(nation) ?? undefined) : undefined;
      const model = buildUnitModel({ type: type as UnitModelKind, gen, ...art, flag, heading });
      return { href: svgHref(model.svg), width: model.width, height: model.height, cx: model.cx, cy: model.cy };
    },
    release,
  );
}
