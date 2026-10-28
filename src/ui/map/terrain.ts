// Shaded-relief terrain texture for the playable provinces, baked once per
// session. An SVG with turbulence and lighting filters is rasterised by the
// browser into a bitmap; the map draws that bitmap under the ownership tint, so
// panning and zooming never re-run the filters.
import type { ProvinceId, Terrain, World } from '../../sim';
import type { MapGeometry } from './geo';

export interface TerrainTexture {
  href: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Muted base colours: the nation tint on top supplies most of the hue. */
export const TERRAIN_BASE: Record<Terrain, string> = {
  plains: '#cfcb9c',
  forest: '#9aa874',
  hills: '#c4b48a',
  mountains: '#b7ab95',
  urban: '#c9c1b0',
  marsh: '#a9b593',
};

/** Relief amplitude per terrain, 0..1. Blurred across borders so ranges blend. */
const RELIEF: Record<Terrain, number> = {
  plains: 0.1,
  forest: 0.24,
  hills: 0.45,
  mountains: 0.9,
  urban: 0.08,
  marsh: 0.04,
};

/** Detail channels: red = forest canopy, green = marsh reeds, blue = urban speckle. */
const DETAIL: Record<Terrain, string> = {
  plains: '#000',
  forest: '#f00',
  hills: '#000',
  mountains: '#000',
  urban: '#00f',
  marsh: '#0f0',
};

/**
 * Relief strength. Kept gentle so the shading reads as texture and never hides
 * borders, counters or labels: the height of the bumps, and how much shadow and
 * highlight one unit of slope adds. Light on flat ground is sin(40°) ≈ FLAT,
 * which gets neither.
 */
const RELIEF_HEIGHT = 6;
const SHADE = 0.75;
const LIT = 0.45;
const FLAT = 0.643;

const n = (v: number) => Math.round(v * 1000) / 1000;

/** Texture resolution in pixels per map unit. */
const PX_PER_UNIT = 3;

/** Sea-glow resolution: the glow is blurred, so one pixel per map unit is plenty. */
const GLOW_PX_PER_UNIT = 1;
/** How far beyond the theatre the coastal glow extends, in map units. */
const GLOW_REACH = 420;

/** Fog clouds are soft: a little over one pixel per map unit keeps them smooth when zoomed in. */
const FOG_PX_PER_UNIT = 1.25;

let cached: Promise<TerrainTexture | null> | null = null;
let cachedGlow: Promise<TerrainTexture | null> | null = null;
let cachedFog: Promise<TerrainTexture | null> | null = null;

/** The baked texture, shared by every map instance in this session. */
export function terrainTexture(geo: MapGeometry, world: World): Promise<TerrainTexture | null> {
  if (!cached) {
    cached = bake(geo, world).catch((e: unknown) => {
      console.warn('Terrain texture unavailable; using flat colours.', e);
      return null;
    });
  }
  return cached;
}

/**
 * Soft shallow-water glow along every coast near the theatre, fading out with
 * distance. Baked because stroking wide glows on the world coastline every
 * frame made panning slow.
 */
export function seaGlowTexture(geo: MapGeometry): Promise<TerrainTexture | null> {
  if (!cachedGlow) {
    cachedGlow = bakeSeaGlow(geo).catch((e: unknown) => {
      console.warn('Coastal glow unavailable.', e);
      return null;
    });
  }
  return cachedGlow;
}

/**
 * Drifting cloud for the fog of war: wisps of pale vapour over the whole theatre, drawn
 * only where the player cannot see (MapView clips it to the fog).
 */
export function fogTexture(geo: MapGeometry): Promise<TerrainTexture | null> {
  if (!cachedFog) {
    cachedFog = bakeFog(geo).catch((e: unknown) => {
      console.warn('Fog clouds unavailable; the fog is a plain veil.', e);
      return null;
    });
  }
  return cachedFog;
}

function bakeFog(geo: MapGeometry): Promise<TerrainTexture> {
  const [[bx0, by0], [bx1, by1]] = geo.theatreBounds;
  const x = Math.floor(bx0 - 10);
  const y = Math.floor(by0 - 10);
  const w = Math.ceil(bx1 + 10) - x;
  const h = Math.ceil(by1 + 10) - y;
  const region = `filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}" color-interpolation-filters="sRGB"`;
  // Large soft banks (low frequency) broken up by finer streaks; alpha follows the noise.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * FOG_PX_PER_UNIT)}" height="${Math.round(h * FOG_PX_PER_UNIT)}" viewBox="${x} ${y} ${w} ${h}">
<defs>
<filter id="cloud" ${region}>
  <feTurbulence type="fractalNoise" baseFrequency="0.009 0.014" numOctaves="5" seed="23" result="banks"/>
  <feColorMatrix in="banks" type="matrix" values="0 0 0 0 0.86  0 0 0 0 0.9  0 0 0 0 0.94  3.4 0 0 0 -1.32"/>
</filter>
</defs>
<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" filter="url(#cloud)"/>
</svg>`;
  return rasterise(svg, w * FOG_PX_PER_UNIT, h * FOG_PX_PER_UNIT).then((href) => ({ href, x, y, width: w, height: h }));
}

function bakeSeaGlow(geo: MapGeometry): Promise<TerrainTexture> {
  const [[bx0, by0], [bx1, by1]] = geo.theatreBounds;
  const x = Math.floor(bx0 - GLOW_REACH);
  const y = Math.floor(by0 - GLOW_REACH);
  const w = Math.ceil(bx1 + GLOW_REACH) - x;
  const h = Math.ceil(by1 + GLOW_REACH) - y;
  const near = geo.countries.filter((c) => c.bounds[1][0] > x && c.bounds[0][0] < x + w && c.bounds[1][1] > y && c.bounds[0][1] < y + h);
  const land = near.map((c) => `<path d="${c.d}"/>`).join('') + Object.values(geo.provincePaths).map((d) => `<path d="${d}"/>`).join('');
  const cx = (bx0 + bx1) / 2;
  const cy = (by0 + by1) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * GLOW_PX_PER_UNIT)}" height="${Math.round(h * GLOW_PX_PER_UNIT)}" viewBox="${x} ${y} ${w} ${h}">
<defs>
<radialGradient id="fade" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${Math.max(w, h) / 2}">
  <stop offset="0.55" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
</radialGradient>
<mask id="m" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#fade)"/></mask>
<filter id="wide" filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><feGaussianBlur stdDeviation="9"/></filter>
<filter id="near" filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><feGaussianBlur stdDeviation="2.2"/></filter>
</defs>
<g mask="url(#m)">
  <g filter="url(#wide)" fill="#6fb9dd" fill-opacity="0.5">${land}</g>
  <g filter="url(#near)" fill="#a6dcf2" fill-opacity="0.55">${land}</g>
</g>
</svg>`;
  return rasterise(svg, w * GLOW_PX_PER_UNIT, h * GLOW_PX_PER_UNIT).then((href) => ({ href, x, y, width: w, height: h }));
}

/**
 * Renders an SVG document to a bitmap once and returns an object URL for it; `crop` keeps
 * only part of it (in pixels), for tiles rendered with a margin.
 */
async function rasterise(svg: string, width: number, height: number, crop?: { x: number; y: number; size: number }): Promise<string> {
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = svgUrl;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(crop?.size ?? width);
    canvas.height = Math.round(crop?.size ?? height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    if (crop) ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, crop.size, crop.size);
    else ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
    if (!blob) throw new Error('Could not encode the texture');
    return URL.createObjectURL(blob);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/**
 * The relief as an SVG document for the map rectangle (x, y, w, h), at `px` pixels per map
 * unit. Close-up tiles (`fine`) add a finer octave of detail noise, and steepen the lighting to
 * match their resolution so the hills keep their shape; only the provinces they touch go in.
 */
function terrainSvg(geo: MapGeometry, world: World, x: number, y: number, w: number, h: number, px = PX_PER_UNIT, fine = false): string {
  const ids: ProvinceId[] = world.provinceIds.filter((id) => {
    const [[x0, y0], [x1, y1]] = geo.shapeBounds[id];
    return x1 >= x && x0 <= x + w && y1 >= y && y0 <= y + h;
  });
  const defs = ids.map((id, i) => `<path id="p${i}" d="${geo.provincePaths[id]}"/>`).join('');
  const uses = (attr: (id: ProvinceId) => string) => ids.map((id, i) => `<use href="#p${i}" ${attr(id)}/>`).join('');
  const terrain = (id: ProvinceId) => world.provinces[id].terrain;
  const region = `filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}" color-interpolation-filters="sRGB"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * px)}" height="${Math.round(h * px)}" viewBox="${x} ${y} ${w} ${h}">
<defs>${defs}
<clipPath id="land">${uses(() => '')}</clipPath>
<filter id="relief" ${region}>
  <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="amp"/>
  <feTurbulence type="turbulence" baseFrequency="0.035" numOctaves="6" seed="11" result="noise"/>
  <feComponentTransfer in="noise" result="ridges"><feFuncA type="table" tableValues="1 0.35 0"/></feComponentTransfer>
  <feComposite in="ridges" in2="amp" operator="in" result="height"/>
  <feDiffuseLighting in="height" surfaceScale="${n((RELIEF_HEIGHT * px) / PX_PER_UNIT)}" diffuseConstant="1" lighting-color="#fff" result="light">
    <feDistantLight azimuth="225" elevation="40"/>
  </feDiffuseLighting>
  <feColorMatrix in="light" type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.2  0 0 0 0 0.22  ${-SHADE} 0 0 0 ${n(SHADE * FLAT)}" result="shade"/>
  <feColorMatrix in="light" type="matrix" values="0 0 0 0 1  0 0 0 0 0.99  0 0 0 0 0.95  ${LIT} 0 0 0 ${n(-LIT * FLAT)}" result="lit"/>
  <feMerge><feMergeNode in="shade"/><feMergeNode in="lit"/></feMerge>
</filter>
<filter id="detail" ${region}>
  <feTurbulence type="fractalNoise" baseFrequency="0.24" numOctaves="${fine ? 4 : 3}" seed="5" result="fine"/>
  <feColorMatrix in="fine" type="matrix" values="0 0 0 0 0.24  0 0 0 0 0.33  0 0 0 0 0.17  1.9 0 0 0 -0.92" result="canopy"/>
  <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="forestW"/>
  <feComposite in="canopy" in2="forestW" operator="in" result="forest"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.05 0.22" numOctaves="2" seed="9" result="streak"/>
  <feColorMatrix in="streak" type="matrix" values="0 0 0 0 0.34  0 0 0 0 0.46  0 0 0 0 0.48  1.8 0 0 0 -0.88" result="reeds"/>
  <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 1 0 0 0" result="marshW"/>
  <feComposite in="reeds" in2="marshW" operator="in" result="marsh"/>
  <feColorMatrix in="fine" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.48  0 0 0 0 0.45  0 0 2.4 0 -1.38" result="speck"/>
  <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0" result="urbanW"/>
  <feComposite in="speck" in2="urbanW" operator="in" result="urban"/>
  <feMerge><feMergeNode in="forest"/><feMergeNode in="marsh"/><feMergeNode in="urban"/></feMerge>
</filter>
</defs>
<g>${uses((id) => `fill="${TERRAIN_BASE[terrain(id)]}"`)}</g>
<g clip-path="url(#land)"><g filter="url(#detail)">${uses((id) => `fill="${DETAIL[terrain(id)]}"`)}</g></g>
<g clip-path="url(#land)"><g filter="url(#relief)">${uses((id) => `fill="#fff" fill-opacity="${RELIEF[terrain(id)]}"`)}</g></g>
</svg>`;
}

// ---------------------------------------------------------------------------
// Close-up tiles
// ---------------------------------------------------------------------------

/** Width and height of a close-up tile, in pixels. */
const TILE_PX = 512;
/** Close-up resolutions, pixels per map unit: a tile covers TILE_PX / level map units. */
export const DETAIL_LEVELS = [8, 16, 32];
/** Map units rendered round each tile and cropped away, so the relief's blur and lighting meet seamlessly. */
const TILE_MARGIN = 8;
/** Baked tiles kept for panning back; older ones are dropped. */
const MAX_TILES = 120;

export interface TerrainTile {
  key: string;
  level: number;
  x: number;
  y: number;
  size: number;
}

/** How far a texture may be stretched before a sharper one is baked. */
const MAX_STRETCH = 2;

/**
 * The close-up resolution for a zoom (screen pixels per map unit, device pixels included),
 * or 0 while the session texture is still sharp enough.
 */
export function detailLevel(pxPerUnit: number): number {
  if (pxPerUnit <= PX_PER_UNIT * MAX_STRETCH) return 0;
  return DETAIL_LEVELS.find((l) => l * MAX_STRETCH >= pxPerUnit) ?? DETAIL_LEVELS[DETAIL_LEVELS.length - 1];
}

/** The tiles of a level covering a view (map units) over the theatre, nearest the middle first. */
export function tilesFor(geo: MapGeometry, [vx, vy, vw, vh]: [number, number, number, number], level: number): TerrainTile[] {
  const size = TILE_PX / level;
  const [[bx0, by0], [bx1, by1]] = geo.theatreBounds;
  const [x0, y0] = [Math.max(vx, bx0), Math.max(vy, by0)];
  const [x1, y1] = [Math.min(vx + vw, bx1), Math.min(vy + vh, by1)];
  const out: TerrainTile[] = [];
  for (let i = Math.floor(x0 / size); i * size < x1; i++) {
    for (let j = Math.floor(y0 / size); j * size < y1; j++) out.push({ key: `${level}:${i}:${j}`, level, x: i * size, y: j * size, size });
  }
  const [cx, cy] = [vx + vw / 2, vy + vh / 2];
  return out.sort((a, b) => Math.hypot(a.x + size / 2 - cx, a.y + size / 2 - cy) - Math.hypot(b.x + size / 2 - cx, b.y + size / 2 - cy));
}

const tiles = new Map<string, TerrainTexture>();
const pending = new Map<string, Promise<TerrainTexture | null>>();
let wanted = new Set<string>();
// Tiles bake one at a time: each is a few hundred milliseconds of filter work, and each waits for an idle slot so
// a run of them never takes consecutive frames.
let bakeQueue: Promise<unknown> = Promise.resolve();

/** Whether a gesture is under way: no tile starts baking until it ends (the map view sets it). */
let held = false;
export function holdBaking(on: boolean): void {
  held = on;
}

/** Resolves when the browser is idle (or after a short wait where it has no idle callbacks), and no gesture is under way. */
async function idleSlot(): Promise<void> {
  do {
    await new Promise<void>((resolve) => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 400 });
      else setTimeout(resolve, 50);
    });
  } while (held);
}

/** A tile that has been baked, if it has. */
export function bakedTile(key: string): TerrainTexture | undefined {
  return tiles.get(key);
}

/**
 * Asks for the tiles a view needs. Ones already baked resolve at once; the rest join the
 * queue, and any still waiting from an earlier view that no longer needs them are dropped.
 */
export function requestTiles(geo: MapGeometry, world: World, list: TerrainTile[]): Promise<TerrainTexture | null>[] {
  wanted = new Set(list.map((t) => t.key));
  return list.map((t) => {
    const done = tiles.get(t.key);
    if (done) {
      // Most recently used last.
      tiles.delete(t.key);
      tiles.set(t.key, done);
      return Promise.resolve(done);
    }
    let job = pending.get(t.key);
    if (!job) {
      job = bakeQueue = bakeQueue.then(async () => {
        if (!wanted.has(t.key)) return null;
        await idleSlot();
        if (!wanted.has(t.key)) return null;
        const tex = await bakeTile(geo, world, t);
        tiles.set(t.key, tex);
        for (const [key, old] of tiles) {
          if (tiles.size <= MAX_TILES) break;
          if (wanted.has(key)) continue;
          tiles.delete(key);
          URL.revokeObjectURL(old.href);
        }
        return tex;
      }).catch((e: unknown) => {
        console.warn('Close-up terrain tile unavailable.', e);
        return null;
      }).finally(() => pending.delete(t.key));
      pending.set(t.key, job as Promise<TerrainTexture | null>);
    }
    return job as Promise<TerrainTexture | null>;
  });
}

async function bakeTile(geo: MapGeometry, world: World, t: TerrainTile): Promise<TerrainTexture> {
  const m = TILE_MARGIN;
  const full = t.size + 2 * m;
  const svg = terrainSvg(geo, world, t.x - m, t.y - m, full, full, t.level, true);
  const href = await rasterise(svg, full * t.level, full * t.level, { x: m * t.level, y: m * t.level, size: TILE_PX });
  return { href, x: t.x, y: t.y, width: t.size, height: t.size };
}

async function bake(geo: MapGeometry, world: World): Promise<TerrainTexture> {
  const [[bx0, by0], [bx1, by1]] = geo.theatreBounds;
  const pad = 4;
  const x = Math.floor(bx0 - pad);
  const y = Math.floor(by0 - pad);
  const w = Math.ceil(bx1 + pad) - x;
  const h = Math.ceil(by1 + pad) - y;
  const href = await rasterise(terrainSvg(geo, world, x, y, w, h), w * PX_PER_UNIT, h * PX_PER_UNIT);
  return { href, x, y, width: w, height: h };
}
